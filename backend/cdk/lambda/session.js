const AWS = require("aws-sdk");
const crypto = require("crypto");

const ddb = new AWS.DynamoDB.DocumentClient();

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

/**
 * Decode a JWT payload without verifying the signature.
 * Safe here because we only use the email for storing with the booking — the
 * downstream booking Lambda trusts whatever is in session META.  Full sig
 * verification happens at the API Gateway Cognito authorizer level.
 */
function decodeJwtEmail(authHeader) {
  try {
    if (!authHeader) return null;
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.email || payload["cognito:username"] || null;
  } catch (_) {
    return null;
  }
}

exports.handler = async (event) => {
  try {
    if (!process.env.CONVERSATIONS_TABLE) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Server misconfigured", details: "CONVERSATIONS_TABLE is not set" })
      };
    }
    const body = parseBody(event);
    const owner = body.owner || "anonymous";
    const channel = body.channel || "text";
    const handle = String(body.handle || "").toLowerCase();
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    let persona = "YANDLE assistant";

    // Extract consumer email from Bearer JWT so the message Lambda can tag
    // bookings with the caller's email (required for BookingsEmailIndex / my-bookings).
    const authHeader =
      event.headers?.authorization ||
      event.headers?.Authorization ||
      null;
    const consumerEmail = decodeJwtEmail(authHeader);

    if (handle && process.env.HANDLES_TABLE) {
      const profile = await ddb
        .get({
          TableName: process.env.HANDLES_TABLE,
          Key: { handle }
        })
        .promise();
      if (profile.Item && profile.Item.persona) {
        persona = profile.Item.persona;
      }
    }

    const callerName = body.callerName || body.name || null;

    const sessionItem = {
      pk: `SESSION#${sessionId}`,
      sk: "META",
      owner,
      handle,
      persona,
      channel,
      createdAt: now,
      updatedAt: now,
      status: "ACTIVE"
    };

    // Only store consumerEmail when we have one (keeps item clean for anonymous sessions)
    if (consumerEmail) {
      sessionItem.consumerEmail = consumerEmail;
    }
    if (callerName) {
      sessionItem.callerName = callerName;
    }

    await ddb
      .put({
        TableName: process.env.CONVERSATIONS_TABLE,
        Item: sessionItem
      })
      .promise();

    return {
      statusCode: 201,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId,
        owner,
        handle,
        persona,
        channel,
        createdAt: now
      })
    };
  } catch (error) {
    const details = error.message || String(error);
    console.error("[session] Error:", details, "code:", error.code, "stack:", error.stack);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", details, code: error.code })
    };
  }
};
