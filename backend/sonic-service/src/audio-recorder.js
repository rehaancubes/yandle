/**
 * Audio recorder for VOXA voice sessions.
 * Buffers caller (16kHz, 16-bit mono PCM) and AI (24kHz, 16-bit mono PCM) audio,
 * mixes them into a single MP3 (44100Hz stereo, caller left, AI right),
 * then uploads to S3.
 *
 * Uses @breezystack/lamejs for MP3 encoding — pure JS, no ffmpeg dependency.
 *
 * Each chunk is timestamped relative to session start so that caller and AI
 * audio are placed at the correct timeline offset during mixing. This prevents
 * overlap/misalignment when there are pauses between chunks.
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import lamejs from "@breezystack/lamejs";

const RECORDINGS_BUCKET = process.env.RECORDINGS_BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";

const s3Client = RECORDINGS_BUCKET ? new S3Client({ region: REGION }) : null;

// Resample 16-bit PCM buffer from srcRate to dstRate using linear interpolation
function resample(buf, srcRate, dstRate) {
  if (srcRate === dstRate) return buf;
  const inputSamples = Math.floor(buf.length / 2); // 16-bit = 2 bytes per sample
  const outputSamples = Math.round((inputSamples * dstRate) / srcRate);
  const output = Buffer.alloc(outputSamples * 2);
  for (let i = 0; i < outputSamples; i++) {
    const srcIdx = (i * srcRate) / dstRate;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, inputSamples - 1);
    const frac = srcIdx - lo;
    const sampleLo = buf.readInt16LE(lo * 2);
    const sampleHi = buf.readInt16LE(hi * 2);
    const interpolated = Math.round(sampleLo + frac * (sampleHi - sampleLo));
    output.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
  }
  return output;
}

/**
 * Place timestamped chunks onto a timeline buffer at the correct sample offsets.
 * Each chunk has { buf, ts } where ts is milliseconds from session start.
 * Returns a single Buffer covering the full duration at the given sampleRate.
 */
function buildTimelineBuffer(chunks, sampleRate, totalDurationMs) {
  const totalSamples = Math.ceil((totalDurationMs / 1000) * sampleRate);
  const timeline = Buffer.alloc(totalSamples * 2); // 16-bit = 2 bytes per sample

  for (const { buf, ts } of chunks) {
    const offsetSamples = Math.round((ts / 1000) * sampleRate);
    const chunkSamples = Math.floor(buf.length / 2);
    for (let i = 0; i < chunkSamples; i++) {
      const destIdx = offsetSamples + i;
      if (destIdx >= 0 && destIdx < totalSamples) {
        const sample = buf.readInt16LE(i * 2);
        const existing = timeline.readInt16LE(destIdx * 2);
        // Mix: clamp the sum to avoid clipping
        const mixed = Math.max(-32768, Math.min(32767, existing + sample));
        timeline.writeInt16LE(mixed, destIdx * 2);
      }
    }
  }

  return timeline;
}

// Mix two mono Int16Arrays of equal length into a stereo interleaved Int16Array
function mixStereo(leftBuf, rightBuf, totalSamples) {
  const stereo = new Int16Array(totalSamples * 2);
  for (let i = 0; i < totalSamples; i++) {
    const l = i * 2 < leftBuf.length ? leftBuf.readInt16LE(i * 2) : 0;
    const r = i * 2 < rightBuf.length ? rightBuf.readInt16LE(i * 2) : 0;
    stereo[i * 2] = l;       // left channel = caller
    stereo[i * 2 + 1] = r;  // right channel = AI
  }
  return stereo;
}

export class SessionRecorder {
  constructor(sessionId, handle, dbPk) {
    this.sessionId = sessionId; // used for the S3 filename
    this.handle = handle;
    this.dbPk = dbPk || sessionId; // used as the DynamoDB pk (e.g. "SESSION#<uuid>")
    this.callerChunks = []; // { buf: Buffer, ts: number } — 16kHz PCM
    this.aiChunks = [];     // { buf: Buffer, ts: number } — 24kHz PCM
    this.active = !!RECORDINGS_BUCKET;
    this.startedAt = Date.now();
  }

  /** Returns the call duration in seconds based on wall-clock time. */
  getDurationSeconds() {
    return Math.max(0, Math.round((Date.now() - this.startedAt) / 1000));
  }

  addCallerAudio(buf) {
    if (!this.active) return;
    this.callerChunks.push({ buf: Buffer.from(buf), ts: Date.now() - this.startedAt });
  }

  addAiAudio(buf) {
    if (!this.active) return;
    this.aiChunks.push({ buf: Buffer.from(buf), ts: Date.now() - this.startedAt });
  }

  /** Encode and upload to S3. Always marks session ENDED. Returns the S3 key or null. */
  async finalize(conversationsTable, ddbDoc) {
    // Always mark session as ENDED, even if no audio was captured.
    if (conversationsTable && ddbDoc) {
      try {
        const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
        await ddbDoc.send(new UpdateCommand({
          TableName: conversationsTable,
          Key: { pk: this.dbPk, sk: "META" },
          UpdateExpression: "SET #st = :ended, updatedAt = :u",
          ExpressionAttributeNames: { "#st": "status" },
          ExpressionAttributeValues: { ":ended": "ENDED", ":u": new Date().toISOString() }
        }));
      } catch (e) {
        console.error("[audio-recorder] Failed to set ENDED status:", e.message);
      }
    }

    if (!this.active || (!this.callerChunks.length && !this.aiChunks.length)) return null;

    try {
      const TARGET_RATE = 44100;
      const CHANNELS = 2;
      const KBPS = 128;

      // Calculate total duration from wall-clock time
      const totalDurationMs = Date.now() - this.startedAt;

      // Build timeline-aligned buffers at native sample rates, then resample
      const callerTimeline = this.callerChunks.length
        ? buildTimelineBuffer(this.callerChunks, 16000, totalDurationMs)
        : Buffer.alloc(0);
      const aiTimeline = this.aiChunks.length
        ? buildTimelineBuffer(this.aiChunks, 24000, totalDurationMs)
        : Buffer.alloc(0);

      // Resample to target rate
      const callerResampled = callerTimeline.length ? resample(callerTimeline, 16000, TARGET_RATE) : Buffer.alloc(0);
      const aiResampled = aiTimeline.length ? resample(aiTimeline, 24000, TARGET_RATE) : Buffer.alloc(0);

      // Total samples at target rate
      const totalSamples = Math.max(
        callerResampled.length / 2,
        aiResampled.length / 2,
        1
      );

      const stereo = mixStereo(callerResampled, aiResampled, totalSamples);

      // Encode to MP3
      const mp3encoder = new lamejs.Mp3Encoder(CHANNELS, TARGET_RATE, KBPS);
      const CHUNK_SIZE = 1152; // lamejs standard
      const mp3Chunks = [];

      for (let i = 0; i < totalSamples; i += CHUNK_SIZE) {
        const end = Math.min(i + CHUNK_SIZE, totalSamples);
        const leftChunk = stereo.subarray(i * 2, end * 2).filter((_, idx) => idx % 2 === 0);
        const rightChunk = stereo.subarray(i * 2, end * 2).filter((_, idx) => idx % 2 === 1);
        const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        if (mp3buf.length > 0) mp3Chunks.push(Buffer.from(mp3buf));
      }
      const mp3end = mp3encoder.flush();
      if (mp3end.length > 0) mp3Chunks.push(Buffer.from(mp3end));

      const mp3Buffer = Buffer.concat(mp3Chunks);
      const key = `recordings/${this.handle}/${this.sessionId}.mp3`;

      await s3Client.send(new PutObjectCommand({
        Bucket: RECORDINGS_BUCKET,
        Key: key,
        Body: mp3Buffer,
        ContentType: "audio/mpeg"
      }));

      console.log(`[audio-recorder] Uploaded ${key} (${mp3Buffer.length} bytes)`);

      // Save recording key to the conversation META record (status already set to ENDED above)
      if (conversationsTable && ddbDoc) {
        try {
          const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
          await ddbDoc.send(new UpdateCommand({
            TableName: conversationsTable,
            Key: { pk: this.dbPk, sk: "META" },
            UpdateExpression: "SET recordingKey = :k, updatedAt = :u",
            ExpressionAttributeValues: { ":k": key, ":u": new Date().toISOString() }
          }));
        } catch (e) {
          console.error("[audio-recorder] Failed to save recordingKey to conversation:", e.message);
        }
      }

      return key;
    } catch (err) {
      console.error("[audio-recorder] Finalize failed:", err.message);
      return null;
    }
  }
}
