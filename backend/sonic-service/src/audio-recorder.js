/**
 * Audio recorder for VOXA voice sessions.
 * Buffers caller (16kHz, 16-bit mono PCM) and AI (24kHz, 16-bit mono PCM) audio,
 * mixes them into a single MP3 (44100Hz stereo, caller left, AI right),
 * then uploads to S3.
 *
 * Uses @breezystack/lamejs for MP3 encoding — pure JS, no ffmpeg dependency.
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

// Convert Buffer of 16-bit LE samples to Int16Array
function toInt16Array(buf) {
  const arr = new Int16Array(buf.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = buf.readInt16LE(i * 2);
  }
  return arr;
}

// Mix two mono Int16Arrays of equal length into a stereo interleaved Int16Array
function mixStereo(leftArr, rightArr, len) {
  const stereo = new Int16Array(len * 2);
  for (let i = 0; i < len; i++) {
    stereo[i * 2] = leftArr[i] || 0;       // left channel = caller
    stereo[i * 2 + 1] = rightArr[i] || 0;  // right channel = AI
  }
  return stereo;
}

export class SessionRecorder {
  constructor(sessionId, handle, dbPk) {
    this.sessionId = sessionId; // used for the S3 filename
    this.handle = handle;
    this.dbPk = dbPk || sessionId; // used as the DynamoDB pk (e.g. "SESSION#<uuid>")
    this.callerChunks = []; // 16kHz PCM buffers
    this.aiChunks = [];     // 24kHz PCM buffers
    this.active = !!RECORDINGS_BUCKET;
    this.startedAt = Date.now();
  }

  /** Returns the call duration in seconds based on wall-clock time. */
  getDurationSeconds() {
    return Math.max(0, Math.round((Date.now() - this.startedAt) / 1000));
  }

  addCallerAudio(buf) {
    if (!this.active) return;
    this.callerChunks.push(Buffer.from(buf));
  }

  addAiAudio(buf) {
    if (!this.active) return;
    this.aiChunks.push(Buffer.from(buf));
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

      // Concatenate raw PCM chunks
      const callerRaw = this.callerChunks.length ? Buffer.concat(this.callerChunks) : Buffer.alloc(0);
      const aiRaw = this.aiChunks.length ? Buffer.concat(this.aiChunks) : Buffer.alloc(0);

      // Resample to target rate
      const callerResampled = callerRaw.length ? resample(callerRaw, 16000, TARGET_RATE) : Buffer.alloc(0);
      const aiResampled = aiRaw.length ? resample(aiRaw, 24000, TARGET_RATE) : Buffer.alloc(0);

      // Normalize lengths (pad the shorter one with silence)
      const callerSamples = callerResampled.length / 2;
      const aiSamples = aiResampled.length / 2;
      const totalSamples = Math.max(callerSamples, aiSamples);

      const callerPadded = Buffer.alloc(totalSamples * 2);
      callerResampled.copy(callerPadded);
      const aiPadded = Buffer.alloc(totalSamples * 2);
      aiResampled.copy(aiPadded);

      const leftArr = toInt16Array(callerPadded);
      const rightArr = toInt16Array(aiPadded);
      const stereo = mixStereo(leftArr, rightArr, totalSamples);

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
