const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

function triggerSync(handle) {
  const arn = process.env.SYNC_KNOWLEDGE_FUNCTION_ARN;
  if (!arn) return;
  lambda.invoke({ FunctionName: arn, InvocationType: "Event", Payload: JSON.stringify({ handle }) }).promise().catch((e) => console.error("[services] sync invoke", e));
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
    if (!process.env.SERVICES_TABLE) {
      return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Server misconfigured" }) };
    }

    const method = event.requestContext?.http?.method || event.httpMethod;

    if (method === "GET") {
      const handle = normalizeHandle(event.queryStringParameters?.handle || "");
      const useCaseId = event.queryStringParameters?.useCaseId ? String(event.queryStringParameters.useCaseId).trim() : null;
      if (!handle) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle is required" }) };
      }
      await assertAccess(handle, sub, email);
      const result = await ddb.query({
        TableName: process.env.SERVICES_TABLE,
        KeyConditionExpression: "handle = :h",
        ExpressionAttributeValues: { ":h": handle }
      }).promise();
      let items = result.Items || [];
      if (useCaseId) {
        items = items.filter((i) => i.useCaseId === useCaseId);
      }
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, services: items })
      };
    }

    if (method === "POST") {
      const body = event.body ? JSON.parse(event.body) : {};
      const handle = normalizeHandle(body.handle);
      if (!handle) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle is required" }) };
      }
      await assertAccess(handle, sub, email);
      const serviceId = body.serviceId && String(body.serviceId).trim() ? String(body.serviceId).trim() : generateId();
      const name = String(body.name || "").trim();
      const durationMinutes = Math.max(1, Math.min(480, Number(body.durationMinutes) || 30));
      const priceCents = body.priceCents != null ? Math.max(0, Number(body.priceCents)) : undefined;
      const useCaseId = body.useCaseId ? String(body.useCaseId).trim() : undefined;
      const item = {
        handle,
        serviceId,
        name: name || "Service",
        durationMinutes,
        priceCents: priceCents != null ? priceCents : undefined,
        useCaseId: useCaseId || undefined,
        updatedAt: new Date().toISOString()
      };
      await ddb.put({ TableName: process.env.SERVICES_TABLE, Item: item }).promise();
      triggerSync(handle);
      return {
        statusCode: 201,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, service: item })
      };
    }

    if (method === "DELETE") {
      const q = event.queryStringParameters || {};
      const body = event.body ? (typeof event.body === "string" ? JSON.parse(event.body || "{}") : event.body) : {};
      const handle = normalizeHandle(q.handle || body.handle);
      const serviceId = q.serviceId || event.pathParameters?.serviceId || body.serviceId;
      if (!handle || !serviceId) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle and serviceId are required" }) };
      }
      await assertAccess(handle, sub, email);
      await ddb.delete({
        TableName: process.env.SERVICES_TABLE,
        Key: { handle, serviceId: String(serviceId) }
      }).promise();
      triggerSync(handle);
      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (e) {
    if (e.message === "FORBIDDEN") {
      return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "You do not own this handle." }) };
    }
    console.error("[services]", e);
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
