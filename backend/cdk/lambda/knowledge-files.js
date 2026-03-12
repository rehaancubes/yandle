/**
 * GET    /knowledge/files?handle=xxx           — list uploaded files for a handle
 * DELETE /knowledge/files?handle=xxx&key=xxx   — delete an uploaded file and trigger sync
 */
const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const lambda = new AWS.Lambda();
const { assertAccess } = require("./auth-helper");

const KB_CONTENT_BUCKET = process.env.KB_CONTENT_BUCKET;
const SYNC_KNOWLEDGE_FUNCTION_ARN = process.env.SYNC_KNOWLEDGE_FUNCTION_ARN;

function normalizeHandle(raw) {
  return String(raw || "").toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
}

function triggerSync(handle) {
  if (!SYNC_KNOWLEDGE_FUNCTION_ARN) return;
  lambda.invoke({
    FunctionName: SYNC_KNOWLEDGE_FUNCTION_ARN,
    InvocationType: "Event",
    Payload: JSON.stringify({ handle })
  }).promise().catch((e) => console.error("[knowledge-files] sync invoke", e));
}

exports.handler = async (event) => {
  const headers = { "content-type": "application/json" };
  try {
    const sub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
    const email = (event?.requestContext?.authorizer?.jwt?.claims?.email || "").toLowerCase();
    if (!sub) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
    }
    if (!KB_CONTENT_BUCKET) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Server misconfigured" }) };
    }

    const method = event.requestContext?.http?.method || event.httpMethod || "GET";
    const q = event.queryStringParameters || {};
    const handle = normalizeHandle(q.handle || "");
    if (!handle) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "handle is required" }) };
    }

    // Auth: owner or manager
    try {
      await assertAccess(handle, sub, email);
    } catch (e) {
      if (e.message === "NOT_FOUND") return { statusCode: 404, headers, body: JSON.stringify({ error: "Handle not found" }) };
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const prefix = `knowledge/${handle}/uploads/`;

    if (method === "GET") {
      const result = await s3.listObjectsV2({
        Bucket: KB_CONTENT_BUCKET,
        Prefix: prefix
      }).promise();
      const files = (result.Contents || []).map((obj) => ({
        key: obj.Key,
        name: obj.Key.replace(prefix, ""),
        size: obj.Size,
        lastModified: obj.LastModified
      }));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, handle, files }) };
    }

    if (method === "DELETE") {
      const key = q.key || "";
      if (!key) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "key is required" }) };
      }
      // Validate the key belongs to this handle
      if (!key.startsWith(prefix)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid key for this handle" }) };
      }
      await s3.deleteObject({ Bucket: KB_CONTENT_BUCKET, Key: key }).promise();
      triggerSync(handle);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (e) {
    console.error("[knowledge-files]", e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal server error", details: e.message }) };
  }
};
