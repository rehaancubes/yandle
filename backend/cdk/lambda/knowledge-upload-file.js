/**
 * Uploads a file (image, video, audio) to the handle's KB S3 prefix and triggers sync.
 * Used with Nova Multimodal Embeddings so the KB can index and retrieve these files.
 */
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const lambda = new AWS.Lambda();

const HANDLES_TABLE = process.env.HANDLES_TABLE;
const KB_CONTENT_BUCKET = process.env.KB_CONTENT_BUCKET;
const SYNC_KNOWLEDGE_FUNCTION_ARN = process.env.SYNC_KNOWLEDGE_FUNCTION_ARN;
const KB_PREFIX = "knowledge";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "webp", "gif",
  "mp4", "mov", "webm", "mkv", "mpeg", "mpg", "wmv", "flv", "3gp",
  "mp3", "wav", "ogg"
]);

function normalizeHandle(raw) {
  return String(raw || "").toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
}

function sanitizeFileName(name) {
  if (!name || typeof name !== "string") return "upload";
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  return base || "upload";
}

function getExtension(fileName) {
  const m = fileName && fileName.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "";
}

const MIME_BY_EXT = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
  mpeg: "video/mpeg", mpg: "video/mpeg", wmv: "video/x-ms-wmv", flv: "video/x-flv", "3gp": "video/3gpp",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg"
};

exports.handler = async (event) => {
  try {
    const sub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!sub) {
      return {
        statusCode: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }
    if (!HANDLES_TABLE || !KB_CONTENT_BUCKET) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Server misconfigured" }),
      };
    }

    const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : event.body || {};
    const handle = normalizeHandle(body.handle);
    if (!handle) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "handle is required" }),
      };
    }

    const getRes = await ddb.get({ TableName: HANDLES_TABLE, Key: { handle } }).promise();
    const item = getRes.Item;
    if (!item || item.ownerId !== sub) {
      return {
        statusCode: 403,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "You do not own this handle." }),
      };
    }

    const fileBase64 = body.fileBase64 || body.file;
    const fileName = body.fileName || body.name || "upload";
    if (!fileBase64) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "fileBase64 and fileName are required" }),
      };
    }

    const buf = Buffer.from(fileBase64, "base64");
    if (buf.length > MAX_FILE_BYTES) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: `File must be under ${MAX_FILE_BYTES / 1024 / 1024}MB` }),
      };
    }

    const safeName = sanitizeFileName(fileName);
    const ext = getExtension(safeName);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: "File type not allowed. Use image (png, jpg, webp, gif), video (mp4, mov, webm, etc.), or audio (mp3, wav, ogg).",
        }),
      };
    }

    const key = `${KB_PREFIX}/${handle}/uploads/${Date.now()}-${safeName}`;
    const contentType = body.contentType || MIME_BY_EXT[ext] || "application/octet-stream";

    await s3.putObject({
      Bucket: KB_CONTENT_BUCKET,
      Key: key,
      Body: buf,
      ContentType: contentType,
    }).promise();

    if (SYNC_KNOWLEDGE_FUNCTION_ARN) {
      lambda.invoke({
        FunctionName: SYNC_KNOWLEDGE_FUNCTION_ARN,
        InvocationType: "Event",
        Payload: JSON.stringify({ handle }),
      }).promise().catch((e) => console.error("[knowledge-upload-file] sync invoke error", e));
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        key,
        fileName: safeName,
        message: "File uploaded. Knowledge base sync started; indexing may take a few minutes.",
      }),
    };
  } catch (e) {
    console.error("[knowledge-upload-file]", e);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: e.message || "Upload failed" }),
    };
  }
};
