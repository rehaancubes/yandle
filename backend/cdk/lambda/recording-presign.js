/**
 * GET /recordings/presign?key=recordings/handle/session-id.mp3
 * Returns a short-lived S3 presigned URL for playback.
 * Requires JWT auth — only owner/manager of the handle can get a presigned URL.
 */
const AWS = require("aws-sdk");
const { assertAccess } = require("./auth-helper");

exports.handler = async (event) => {
  try {
    const s3 = new AWS.S3();
    const callerSub = event.requestContext?.authorizer?.jwt?.claims?.sub || "";
    const callerEmail = (event.requestContext?.authorizer?.jwt?.claims?.email || "").toLowerCase();
    const key = String(event.queryStringParameters?.key || "").trim();

    if (!key || !key.startsWith("recordings/")) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Invalid or missing key. Must start with recordings/" })
      };
    }

    // Extract handle from key: recordings/{handle}/{sessionId}.mp3
    const parts = key.split("/");
    const handle = parts[1] || "";
    if (!handle) {
      return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Could not extract handle from key" }) };
    }

    try {
      await assertAccess(handle, callerSub, callerEmail);
    } catch (e) {
      if (e.message === "NOT_FOUND") return { statusCode: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Handle not found" }) };
      return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const url = s3.getSignedUrl("getObject", {
      Bucket: process.env.RECORDINGS_BUCKET,
      Key: key,
      Expires: 3600 // 1 hour
    });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url })
    };
  } catch (error) {
    console.error("[recording-presign]", error);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", details: error.message })
    };
  }
};
