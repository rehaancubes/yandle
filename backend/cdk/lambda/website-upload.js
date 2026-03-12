const AWS = require("aws-sdk");
const crypto = require("crypto");
const s3 = new AWS.S3();
const { assertAccess } = require("./auth-helper");

function parseBody(event) {
  const raw = event.body;
  if (raw == null || raw === "") return {};
  if (typeof raw === "object") return raw;
  const str = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
  try {
    return typeof str === "string" ? JSON.parse(str) : {};
  } catch (e) {
    throw new Error("Invalid JSON body: " + e.message);
  }
}

function getCallerInfo(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  return { sub: claims.sub, email: claims.email || claims["cognito:username"] };
}

exports.handler = async (event) => {
  try {
    const BUCKET = process.env.WEBSITE_ASSETS_BUCKET;
    if (!BUCKET) {
      return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "WEBSITE_ASSETS_BUCKET not set" }) };
    }

    const body = parseBody(event);
    const handle = String(body.handle || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
    const fileName = body.fileName || "image.jpg";
    const contentType = body.contentType || "image/jpeg";

    if (!handle) {
      return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle required" }) };
    }

    const { sub, email } = getCallerInfo(event);
    await assertAccess(handle, sub, email);

    const uuid = crypto.randomUUID();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `website/${handle}/${uuid}-${safeName}`;

    const uploadUrl = s3.getSignedUrl("putObject", {
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      Expires: 300 // 5 minutes
    });

    // Construct the public URL (S3 presigned GET for reading)
    const publicUrl = s3.getSignedUrl("getObject", {
      Bucket: BUCKET,
      Key: key,
      Expires: 604800 // 7 days
    });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, uploadUrl, key, publicUrl })
    };
  } catch (error) {
    if (error.message === "FORBIDDEN") {
      return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Access denied" }) };
    }
    if (error.message === "NOT_FOUND") {
      return { statusCode: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Handle not found" }) };
    }
    console.error("[website-upload] Error:", error.message, error.stack);
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Internal server error", details: error.message }) };
  }
};
