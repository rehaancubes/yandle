const AWS = require("aws-sdk");
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

exports.handler = async (event) => {
  try {
    const TABLE = process.env.CREDITS_TABLE;
    if (!TABLE) {
      return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "CREDITS_TABLE not set" }) };
    }

    const method = event.requestContext?.http?.method;
    const path = event.requestContext?.http?.path || "";

    // GET /credits?handle=xxx — return balance
    if (method === "GET") {
      const handle = event.queryStringParameters?.handle;
      if (!handle) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle is required" }) };
      }
      const result = await ddb.get({ TableName: TABLE, Key: { handle } }).promise();
      if (!result.Item) {
        return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, credits: 0, totalCreditsUsed: 0, planType: "none" }) };
      }
      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(result.Item) };
    }

    // POST /credits/deduct — atomic decrement (internal, no auth)
    if (method === "POST" && path.includes("/deduct")) {
      const body = parseBody(event);
      const { handle, amount, reason } = body;
      if (!handle || !amount || amount <= 0) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle and positive amount required" }) };
      }
      const now = new Date().toISOString();
      try {
        const result = await ddb.update({
          TableName: TABLE,
          Key: { handle },
          UpdateExpression: "SET credits = credits - :amt, totalCreditsUsed = totalCreditsUsed + :amt, updatedAt = :now",
          ConditionExpression: "attribute_exists(handle) AND credits >= :amt",
          ExpressionAttributeValues: { ":amt": amount, ":now": now },
          ReturnValues: "ALL_NEW"
        }).promise();
        return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true, remainingCredits: result.Attributes.credits }) };
      } catch (e) {
        if (e.code === "ConditionalCheckFailedException") {
          return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: "insufficient_credits" }) };
        }
        throw e;
      }
    }

    // POST /credits/initialize — create credits record
    if (method === "POST" && path.includes("/initialize")) {
      const body = parseBody(event);
      const handle = String(body.handle || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
      const initialCredits = body.initialCredits || 1000;
      const planType = body.planType || "free";
      const phoneNumber = body.phoneNumber || null;
      const now = new Date().toISOString();

      const item = {
        handle,
        credits: initialCredits,
        totalCreditsUsed: 0,
        planType,
        createdAt: now,
        updatedAt: now
      };
      if (phoneNumber) item.phoneNumber = phoneNumber;

      try {
        await ddb.put({
          TableName: TABLE,
          Item: item,
          ConditionExpression: "attribute_not_exists(handle)"
        }).promise();
      } catch (e) {
        if (e.code === "ConditionalCheckFailedException") {
          // Already exists — that's fine
          return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true, message: "already_exists" }) };
        }
        throw e;
      }

      return { statusCode: 201, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true, handle, credits: initialCredits }) };
    }

    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (error) {
    console.error("[credits] Error:", error.message, error.stack);
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Internal server error", details: error.message }) };
  }
};
