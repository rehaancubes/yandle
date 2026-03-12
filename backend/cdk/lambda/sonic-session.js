const AWS = require("aws-sdk");
const crypto = require("crypto");

const ddb = new AWS.DynamoDB.DocumentClient();

function normalizeHandle(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

exports.handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const handle = normalizeHandle(body.handle);
    if (!handle) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "handle is required" })
      };
    }

    const profile = await ddb
      .get({
        TableName: process.env.HANDLES_TABLE,
        Key: { handle }
      })
      .promise();

    if (!profile.Item) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Handle not found" })
      };
    }

    const voiceEnabled = profile.Item.voiceEnabled !== false;
    if (!voiceEnabled) {
      return {
        statusCode: 403,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Voice is disabled for this handle" })
      };
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        handle,
        token,
        expiresAt,
        sonicServiceUrl: process.env.SONIC_SERVICE_URL,
        modelId: process.env.SONIC_MODEL_ID || "amazon.nova-2-sonic-v1:0"
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", details: error.message })
    };
  }
};
