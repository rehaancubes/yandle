const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

function parseBody(event) {
  const raw = event.body;
  if (raw == null || raw === "") return {};
  if (typeof raw === "object") return raw;
  const str = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
  return typeof str === "string" ? JSON.parse(str) : {};
}

function getCallerSub(event) {
  return event?.requestContext?.authorizer?.jwt?.claims?.sub;
}

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || event.httpMethod;
    const callerSub = getCallerSub(event);
    if (!callerSub) {
      return { statusCode: 401, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    const qs = event.queryStringParameters || {};

    if (method === "GET") {
      const handle = qs.handle;
      if (!handle) return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle is required" }) };

      const result = await ddb.get({
        TableName: process.env.BUSINESS_CONFIG_TABLE,
        Key: { handle, configType: "SUPPORT_CONFIG" }
      }).promise();

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: result.Item || { categories: [], slaResponseHours: 24, slaResolutionHours: 72 } })
      };
    }

    if (method === "POST") {
      const body = parseBody(event);
      const handle = body.handle;
      if (!handle) return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle is required" }) };

      const now = new Date().toISOString();
      const item = {
        handle,
        configType: "SUPPORT_CONFIG",
        categories: Array.isArray(body.categories) ? body.categories : [],
        slaResponseHours: Number(body.slaResponseHours) || 24,
        slaResolutionHours: Number(body.slaResolutionHours) || 72,
        updatedAt: now
      };

      await ddb.put({ TableName: process.env.BUSINESS_CONFIG_TABLE, Item: item }).promise();

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, config: item })
      };
    }

    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (err) {
    console.error("[support-config] Error:", err);
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: err.message }) };
  }
};
