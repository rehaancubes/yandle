const express = require("express");
const net = require("net");
const { getOrgByDid } = require("./db");
const { startSonicStream } = require("./sonicClient");

process.setMaxListeners(0);

const HTTP_PORT = 3000;
const TCP_PORT = 5000;
const HOST = "0.0.0.0";

// Sample rate your PBX sends (slin=8000, slin16=16000)
const PBX_RATE = parseInt(process.env.PBX_SAMPLE_RATE || "8000", 10);
// Nova Sonic always outputs 24kHz
const SONIC_OUTPUT_RATE = 24000;
// Nova Sonic expects 16kHz input
const SONIC_INPUT_RATE = 16000;
// Codec your PBX sends: "slin" (default, Asterisk AudioSocket always sends slin),
// "alaw", or "ulaw" only if your AudioSocket is configured to send raw G.711 frames.
const PBX_CODEC = (process.env.PBX_CODEC || "slin").toLowerCase();

/* =====================================================
   G.711 CODEC (alaw / ulaw)
===================================================== */

/** μ-law byte → 16-bit signed linear PCM sample */
function ulawToLinear(u) {
  u = ~u & 0xFF;
  const sign = u >> 7;
  const exp  = (u >> 4) & 7;
  const mant = u & 15;
  const val  = (((mant << 3) | 0x84) << exp) - 132;
  return sign ? -val : val;
}

/** A-law byte → 16-bit signed linear PCM sample */
function alawToLinear(a) {
  a ^= 0x55;
  const sign = a >> 7;
  const exp  = (a >> 4) & 7;
  const mant = a & 15;
  const val  = exp === 0
    ? (mant << 1) | 1
    : ((mant | 16) << 1 | 1) << (exp - 1);
  return sign ? val : -val;
}

/** 16-bit signed linear PCM sample → μ-law byte */
function linearToUlaw(s) {
  const sign = s < 0 ? 0 : 0x80;
  if (s < 0) s = -s;
  if (s > 32635) s = 32635;
  s += 0x84;
  let exp = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exp > 0; exp--, mask >>= 1) {}
  return (~(sign | (exp << 4) | ((s >> (exp + 3)) & 0x0F))) & 0xFF;
}

/** 16-bit signed linear PCM sample → A-law byte */
function linearToAlaw(s) {
  const sign = s >= 0 ? 0x80 : 0;
  if (s < 0) s = -s;
  if (s > 32767) s = 32767;
  s >>= 4; // scale to 12-bit
  let exp = 0, mant;
  if (s >= 16) {
    exp = 1;
    let tmp = s >> 1;
    while (tmp > 16) { exp++; tmp >>= 1; }
  }
  mant = exp === 0 ? s : (s >> exp) & 0x0F;
  return (sign | (exp << 4) | mant) ^ 0x55;
}

/**
 * Decode a buffer of alaw/ulaw bytes to 16-bit PCM buffer.
 * Each input byte → one 16-bit LE sample.
 */
function g711Decode(inBuf, codec) {
  const out = Buffer.alloc(inBuf.length * 2);
  for (let i = 0; i < inBuf.length; i++) {
    const s = codec === "alaw" ? alawToLinear(inBuf[i]) : ulawToLinear(inBuf[i]);
    out.writeInt16LE(s, i * 2);
  }
  return out;
}

/**
 * Encode a 16-bit PCM buffer to alaw/ulaw bytes.
 * Each 16-bit LE sample → one output byte.
 */
function g711Encode(inBuf, codec) {
  const samples = Math.floor(inBuf.length / 2);
  const out = Buffer.alloc(samples);
  for (let i = 0; i < samples; i++) {
    const s = inBuf.readInt16LE(i * 2);
    out[i] = codec === "alaw" ? linearToAlaw(s) : linearToUlaw(s);
  }
  return out;
}

/* =====================================================
   AUDIOSOCKET HELPERS
===================================================== */

// AudioSocket frame kinds
const KIND_HANGUP = 0x00;
const KIND_UUID   = 0x01;
const KIND_AUDIO  = 0x10;

/**
 * Parse a continuous TCP stream into AudioSocket frames.
 * Calls onUuid(16-byte buffer) or onAudio(pcm buffer) or onHangup() for each complete frame.
 */
function makeFrameParser({ onUuid, onAudio, onHangup }) {
  let buf = Buffer.alloc(0);
  return function push(chunk) {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 3) {
      const kind = buf[0];
      const len  = buf.readUInt16BE(1);
      if (buf.length < 3 + len) break; // wait for full frame
      const payload = buf.slice(3, 3 + len);
      buf = buf.slice(3 + len);
      if      (kind === KIND_UUID   && onUuid)   onUuid(payload);
      else if (kind === KIND_AUDIO  && onAudio)  onAudio(payload);
      else if (kind === KIND_HANGUP && onHangup) onHangup();
    }
  };
}

/** Wrap raw PCM in an AudioSocket audio frame */
function audioFrame(pcm) {
  const hdr = Buffer.alloc(3);
  hdr[0] = KIND_AUDIO;
  hdr.writeUInt16BE(pcm.length, 1);
  return Buffer.concat([hdr, pcm]);
}

/**
 * Linear-interpolation resampler for 16-bit mono PCM.
 * Handles any ratio (upsample or downsample).
 * Uses readInt16LE/writeInt16LE to avoid TypedArray alignment issues.
 */
function resample(inputBuf, fromRate, toRate) {
  if (fromRate === toRate) return inputBuf;
  const inLen = Math.floor(inputBuf.length / 2);
  if (inLen === 0) return Buffer.alloc(0);
  const outLen = Math.round(inLen * toRate / fromRate);
  if (outLen === 0) return Buffer.alloc(0);
  const ratio = (inLen - 1) / Math.max(outLen - 1, 1);
  const out = Buffer.alloc(outLen * 2);
  for (let i = 0; i < outLen; i++) {
    const pos  = i * ratio;
    const lo   = Math.floor(pos);
    const hi   = Math.min(lo + 1, inLen - 1);
    const frac = pos - lo;
    const s0   = inputBuf.readInt16LE(lo * 2);
    const s1   = inputBuf.readInt16LE(hi * 2);
    out.writeInt16LE(Math.round(s0 + frac * (s1 - s0)), i * 2);
  }
  return out;
}

/* =====================================================
   RING-BACK TONE GENERATOR
   Indian ring-back: ~400 Hz, 1s on / 2s off
===================================================== */

function generateRingbackTone(rate, codec) {
  const FREQ = 400;
  const ON_SEC = 1;
  const OFF_SEC = 2;
  const CYCLE_SEC = ON_SEC + OFF_SEC;
  const totalSamples = rate * CYCLE_SEC;
  const onSamples = rate * ON_SEC;

  // Generate one full cycle (1s tone + 2s silence) as 16-bit PCM
  const pcmBuf = Buffer.alloc(totalSamples * 2);
  for (let i = 0; i < totalSamples; i++) {
    const sample = i < onSamples
      ? Math.round(4000 * Math.sin(2 * Math.PI * FREQ * i / rate))
      : 0;
    pcmBuf.writeInt16LE(sample, i * 2);
  }

  // Encode to target codec if needed
  if (codec === "alaw" || codec === "ulaw") {
    return g711Encode(pcmBuf, codec);
  }
  return pcmBuf;
}

// Pre-generate a full ring-back cycle at PBX rate
const RINGBACK_BUF = generateRingbackTone(PBX_RATE, PBX_CODEC);

/* =====================================================
   HTTP – CALL START
===================================================== */

const app = express();
const activeCalls = new Map();

app.get("/call-start", async (req, res) => {
  let { did, caller, uniqueid, direction } = req.query;
  did    = did?.trim();
  caller = caller?.trim();

  console.log(did, "=>", caller, "=>", uniqueid, "=>", direction);

  let org = null;
  try {
    org = await getOrgByDid(did);
  } catch (err) {
    console.log("DB error:", err.message);
  }

  if (!org) console.log("⚠ Unknown DID:", did);

  activeCalls.set(uniqueid, { did, caller, direction, org, startTime: new Date() });

  console.log(`📞 CALL EVENT | ${uniqueid}`);
  console.log(activeCalls.get(uniqueid));
  console.log("----------------------------------");

  res.sendStatus(200);
});

app.listen(HTTP_PORT, HOST, () =>
  console.log(`🚀 CTI HTTP listening on ${HOST}:${HTTP_PORT}`)
);

/* =====================================================
   TCP – AUDIOSOCKET
===================================================== */

let connectionCount = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tcpServer = net.createServer((socket) => {
  connectionCount++;
  const sessionIndex = connectionCount;
  console.log(`🔌 AudioSocket connected | SESSION=${sessionIndex}`);

  socket.setNoDelay(true);
  socket.setKeepAlive(true);

  let audioPackets = 0;
  let callInfo = null;
  let uuid = null;
  let agentReady = false;
  let ringbackTimer = null;

  // Start playing ring-back tone over AudioSocket
  function startRingback() {
    const FRAME_SAMPLES = Math.round(PBX_RATE * 0.02); // 20ms worth of samples
    const bytesPerSample = (PBX_CODEC === "alaw" || PBX_CODEC === "ulaw") ? 1 : 2;
    const FRAME_BYTES = FRAME_SAMPLES * bytesPerSample;
    let offset = 0;

    ringbackTimer = setInterval(() => {
      if (agentReady || !socket.writable) {
        clearInterval(ringbackTimer);
        ringbackTimer = null;
        return;
      }
      const chunk = Buffer.alloc(FRAME_BYTES);
      for (let i = 0; i < FRAME_BYTES; i++) {
        chunk[i] = RINGBACK_BUF[(offset + i) % RINGBACK_BUF.length];
      }
      offset = (offset + FRAME_BYTES) % RINGBACK_BUF.length;
      socket.write(audioFrame(chunk));
    }, 20);
  }

  function stopRingback() {
    agentReady = true;
    if (ringbackTimer) {
      clearInterval(ringbackTimer);
      ringbackTimer = null;
    }
  }

  // Real-time output pacing: queue of AudioSocket frames, sent one per 20ms
  const outQueue = [];
  let outTimer = null;
  function enqueueFrame(frame) {
    outQueue.push(frame);
    if (!outTimer) {
      outTimer = setInterval(() => {
        const f = outQueue.shift();
        if (f && socket.writable) socket.write(f);
        if (outQueue.length === 0 && outTimer) {
          clearInterval(outTimer);
          outTimer = null;
        }
      }, 20);
    }
  }

  const parser = makeFrameParser({

    onUuid: async (payload) => {
      const hex = payload.toString("hex");
      uuid = [
        hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
        hex.slice(16, 20), hex.slice(20)
      ].join("-");

      console.log(`🆔 SESSION ${sessionIndex} → UUID ${uuid}`);

      // Wait up to 2 s for HTTP metadata
      for (let i = 0; i < 20; i++) {
        callInfo = activeCalls.get(uuid);
        if (callInfo) break;
        await sleep(100);
      }

      if (!callInfo) {
        console.log(`⚠ Metadata not found for UUID ${uuid}`);
        callInfo = { did: "unknown", caller: "unknown", direction: "unknown", startTime: new Date() };
        activeCalls.set(uuid, callInfo);
      }

      console.log(`🎯 CALL STARTED | SESSION=${sessionIndex} | DID=${callInfo.did} | Caller=${callInfo.caller} | Direction=${callInfo.direction}`);

      // Play ring-back tone while AI agent initializes
      startRingback();
      console.log(`🔔 Ringback started | SESSION=${sessionIndex}`);

      try {
        callInfo.sonicSession = startSonicStream(uuid, callInfo, {

          onReady: () => {
            stopRingback();
            console.log(`✅ Agent ready, ringback stopped | SESSION=${sessionIndex}`);
          },

          // AI audio: 24kHz PCM → resample to PBX rate → encode if needed → 20ms AudioSocket frames
          onAudioOutput: (() => {
            let firstChunk = true;
            // 20ms frame size at PBX rate in bytes (slin = 2 bytes/sample)
            const FRAME_SAMPLES = Math.round(PBX_RATE * 0.02);
            const FRAME_BYTES = FRAME_SAMPLES * 2;
            return (buf) => {
              try {
                if (!socket.writable) return;
                if (firstChunk) {
                  console.log(`🔊 AI audio flowing | SESSION=${sessionIndex} | codec=${PBX_CODEC}`);
                  firstChunk = false;
                }
                let out = resample(buf, SONIC_OUTPUT_RATE, PBX_RATE);
                if (PBX_CODEC === "alaw" || PBX_CODEC === "ulaw") out = g711Encode(out, PBX_CODEC);
                // Enqueue 20ms frames for real-time pacing (no flood)
                const chunkBytes = PBX_CODEC === "slin" ? FRAME_BYTES : FRAME_SAMPLES;
                for (let i = 0; i < out.length; i += chunkBytes) {
                  const chunk = out.slice(i, i + chunkBytes);
                  if (chunk.length > 0) enqueueFrame(audioFrame(chunk));
                }
              } catch (err) {
                console.log("Audio output write error:", err.message);
              }
            };
          })(),

          onSessionClosed: () => {
            console.log(`🛑 Sonic sessionClosed | SESSION=${sessionIndex} | UUID=${uuid}`);
            try { if (socket.writable) socket.end(); } catch (_) {}
          },
        });
      } catch (err) {
        console.log(`❌ Sonic start failed | ${err.message}`);
      }
    },

    onAudio: (pcm) => {
      if (!callInfo?.sonicSession || !agentReady) return;
      audioPackets++;
      if (audioPackets % 50 === 0) {
        console.log(`🎧 Audio | SESSION=${sessionIndex} | UUID=${uuid} | packets=${audioPackets} | DID=${callInfo.did} | caller=${callInfo.caller}`);
      }
      try {
        // Decode if alaw/ulaw, then resample PBX rate → 16kHz for Nova Sonic
        const decoded = (PBX_CODEC === "alaw" || PBX_CODEC === "ulaw")
          ? g711Decode(pcm, PBX_CODEC)
          : pcm;
        const resampled = resample(decoded, PBX_RATE, SONIC_INPUT_RATE);
        callInfo.sonicSession.sendAudio(resampled);
      } catch (err) {
        console.log("Audio send error:", err.message);
      }
    },

    onHangup: () => {
      console.log(`📴 Hangup frame | SESSION=${sessionIndex}`);
      socket.end();
    },
  });

  socket.on("data", parser);

  socket.on("close", () => {
    console.log(`📴 CALL END | SESSION=${sessionIndex} | UUID=${uuid} | audioPackets=${audioPackets}`);
    stopRingback();
    if (outTimer) { clearInterval(outTimer); outTimer = null; }
    outQueue.length = 0;
    if (callInfo?.sonicSession) {
      try { callInfo.sonicSession.close(); } catch (_) {}
      delete callInfo.sonicSession;
    }
    if (uuid) activeCalls.delete(uuid);
  });

  socket.on("error", (err) => {
    console.error(`❌ Socket error | SESSION=${sessionIndex} | ${err.message}`);
  });
});

tcpServer.listen(TCP_PORT, HOST, () =>
  console.log(`🎧 AudioSocket TCP listening on ${HOST}:${TCP_PORT}`)
);
