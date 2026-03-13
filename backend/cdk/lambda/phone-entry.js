const AWS = require("aws-sdk");

const ddb = new AWS.DynamoDB.DocumentClient();

function normalizePhone(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  // Keep leading + and digits
  const cleaned = s.replace(/(?!^\+)[^\d]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  // Assume Indian numbers by default if no country code (can be adjusted later)
  if (cleaned.length === 10) return "+91" + cleaned;
  return cleaned;
}

function parseBody(event) {
  const raw = event.body;
  if (raw == null || raw === "") return {};
  if (typeof raw === "object") return raw;
  const str = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
  try {
    return typeof str === "string" ? JSON.parse(str) : {};
  } catch (e) {
    return {};
  }
}

exports.handler = async (event) => {
  try {
    if (!process.env.PHONE_NUMBERS_TABLE || !process.env.CALLERS_TABLE || !process.env.HANDLES_TABLE) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: "Server misconfigured",
          details: "PHONE_NUMBERS_TABLE, CALLERS_TABLE, and HANDLES_TABLE must be set"
        })
      };
    }

    const method = event.requestContext?.http?.method || event.httpMethod || "POST";
    if (method !== "POST") {
      return {
        statusCode: 405,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Method not allowed" })
      };
    }

    const body = parseBody(event);

    // Support common telephony webhooks (Twilio-style From/To) and a generic schema
    const rawTo =
      body.to ||
      body.To ||
      body.calledNumber ||
      body.called ||
      event.queryStringParameters?.to ||
      event.queryStringParameters?.phoneNumber;
    const rawFrom =
      body.from ||
      body.From ||
      body.callerNumber ||
      body.caller ||
      event.queryStringParameters?.from;

    const calledNumber = normalizePhone(rawTo);
    const callerNumber = normalizePhone(rawFrom);

    if (!calledNumber || !callerNumber) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: "Missing phone numbers",
          details: "Both 'to' (called) and 'from' (caller) numbers are required."
        })
      };
    }

    // Look up which handle owns this Voxa AI phone number
    const phoneResult = await ddb
      .get({
        TableName: process.env.PHONE_NUMBERS_TABLE,
        Key: { phoneNumber: calledNumber }
      })
      .promise();

    if (!phoneResult.Item || !phoneResult.Item.handle) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: "Phone number not configured",
          details: "No Yandle handle is mapped to this phone number."
        })
      };
    }

    const handle = String(phoneResult.Item.handle || "").toLowerCase();

    const handleProfile = await ddb
      .get({
        TableName: process.env.HANDLES_TABLE,
        Key: { handle }
      })
      .promise();

    const profile = handleProfile.Item || {};

    const now = new Date().toISOString();
    const phoneE164 = callerNumber;

    const existingCaller = await ddb
      .query({
        TableName: process.env.CALLERS_TABLE,
        KeyConditionExpression: "phoneE164 = :p",
        ExpressionAttributeValues: {
          ":p": phoneE164
        },
        ScanIndexForward: false,
        Limit: 1
      })
      .promise();

    const lastCallerRecord = existingCaller.Items && existingCaller.Items[0];
    const previousCount = Number(lastCallerRecord?.callCount || 0);
    const isReturning = Boolean(lastCallerRecord);

    const callerName =
      body.callerName ||
      body.name ||
      lastCallerRecord?.name ||
      null;

    const callerItem = {
      phoneE164,
      lastSeenAt: now,
      name: callerName,
      lastBusinessHandle: handle,
      lastIntent: body.intent || null,
      callCount: previousCount + 1
    };

    await ddb
      .put({
        TableName: process.env.CALLERS_TABLE,
        Item: callerItem
      })
      .promise();

    const greetingName = callerName || (profile.displayName || handle);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        handle,
        business: {
          handle,
          displayName: profile.displayName || handle,
          businessName: profile.businessName || profile.displayName || handle,
          category: profile.category || null,
          address: profile.address || null,
          city: profile.city || null,
          hasAiPhone: profile.hasAiPhone === true
        },
        caller: {
          phoneE164,
          name: callerName,
          isReturning,
          callCount: previousCount + 1
        },
        suggestedGreeting: isReturning
          ? `Hi ${greetingName}, welcome back.`
          : `Hi ${greetingName}, thanks for calling.`,
        notes: "Use this payload in your telephony integration to greet the caller and attach context before connecting audio to Nova Sonic."
      })
    };
  } catch (error) {
    const details = error.message || String(error);
    console.error("[phone-entry] Error:", details, "code:", error.code, "stack:", error.stack);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", details, code: error.code })
    };
  }
};

