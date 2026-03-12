const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

function triggerSync(handle) {
  const arn = process.env.SYNC_KNOWLEDGE_FUNCTION_ARN;
  if (!arn) return;
  lambda.invoke({ FunctionName: arn, InvocationType: "Event", Payload: JSON.stringify({ handle }) }).promise().catch((e) => console.error("[centers] sync invoke", e));
}

function normalizeHandle(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const { assertAccess } = require('./auth-helper');

exports.handler = async (event) => {
  try {
    const sub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
    const email = (event?.requestContext?.authorizer?.jwt?.claims?.email || "").toLowerCase();
    if (!sub) {
      return { statusCode: 401, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Unauthorized" }) };
    }
    if (!process.env.GAMING_CENTERS_TABLE) {
      return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Server misconfigured" }) };
    }

    const method = event.requestContext?.http?.method || event.httpMethod;

    if (method === "GET") {
      const handle = normalizeHandle(event.queryStringParameters?.handle || "");
      if (!handle) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle is required" }) };
      }
      await assertAccess(handle, sub, email);
      const result = await ddb.query({
        TableName: process.env.GAMING_CENTERS_TABLE,
        KeyConditionExpression: "handle = :h",
        ExpressionAttributeValues: { ":h": handle }
      }).promise();
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, centers: result.Items || [] })
      };
    }

    if (method === "POST") {
      const body = event.body ? JSON.parse(event.body) : {};
      const handle = normalizeHandle(body.handle);
      if (!handle) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle is required" }) };
      }
      await assertAccess(handle, sub, email);
      const centerId = body.centerId && String(body.centerId).trim() ? String(body.centerId).trim() : generateId();
      const name = String(body.name || "").trim() || "Center";
      const location = body.location != null ? String(body.location).trim() : "";
      const machines = Array.isArray(body.machines)
        ? body.machines.map((m) => ({
            name: String(m.name || "").trim() || "Machine",
            type: String(m.type || "").trim() || "PC",
            count: Math.max(0, Number(m.count) || 1),
            pricePerHour: m.pricePerHour != null ? Math.max(0, Number(m.pricePerHour)) : undefined
          }))
        : [];
      const item = {
        handle,
        centerId,
        name,
        location: location || undefined,
        machines,
        updatedAt: new Date().toISOString()
      };
      await ddb.put({ TableName: process.env.GAMING_CENTERS_TABLE, Item: item }).promise();
      triggerSync(handle);
      return {
        statusCode: 201,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, center: item })
      };
    }

    if (method === "DELETE") {
      const q = event.queryStringParameters || {};
      const body = event.body ? (typeof event.body === "string" ? JSON.parse(event.body || "{}") : event.body) : {};
      const handle = normalizeHandle(q.handle || body.handle);
      const centerId = q.centerId || event.pathParameters?.centerId || body.centerId;
      if (!handle || !centerId) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle and centerId are required" }) };
      }
      await assertAccess(handle, sub, email);
      await ddb.delete({
        TableName: process.env.GAMING_CENTERS_TABLE,
        Key: { handle, centerId: String(centerId) }
      }).promise();
      triggerSync(handle);
      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (e) {
    if (e.message === "FORBIDDEN") {
      return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "You do not own this handle." }) };
    }
    console.error("[centers]", e);
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
