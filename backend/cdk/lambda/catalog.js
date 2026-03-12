/**
 * Retail catalog CRUD.
 * GET  /catalog?handle=xxx                — list catalog items (public)
 * POST /catalog                           — add/update item (owner or manager)
 * DELETE /catalog?handle=xxx&itemId=xxx   — delete item (owner or manager)
 * PATCH /catalog                          — update stock/fields (owner or manager)
 */
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();
const lambdaClient = new AWS.Lambda();
const { assertAccess } = require("./auth-helper");

function normalizeHandle(raw) {
  let s = String(raw || "").toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
  if (s.startsWith("voxa-")) s = s.slice(5);
  return s;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function triggerSync(handle) {
  const arn = process.env.SYNC_KNOWLEDGE_FUNCTION_ARN;
  if (!arn) return;
  lambdaClient.invoke({ FunctionName: arn, InvocationType: "Event", Payload: JSON.stringify({ handle }) })
    .promise().catch((e) => console.error("[catalog] sync invoke", e));
}

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || event.httpMethod || "GET";
    const callerSub = event.requestContext?.authorizer?.jwt?.claims?.sub || "";
    const callerEmail = (event.requestContext?.authorizer?.jwt?.claims?.email || "").toLowerCase();

    const rawHandle =
      event.queryStringParameters?.handle ||
      (event.body ? (() => { try { return JSON.parse(event.body).handle; } catch { return ""; } })() : "");
    const handle = normalizeHandle(rawHandle);

    if (!handle) {
      return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle is required" }) };
    }

    // GET is public (so customers and the AI can read catalog)
    if (method === "GET") {
      const result = await ddb.query({
        TableName: process.env.CATALOG_TABLE,
        KeyConditionExpression: "handle = :h",
        ExpressionAttributeValues: { ":h": handle }
      }).promise();
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, items: result.Items || [] })
      };
    }

    // All write operations require owner or manager access
    try {
      await assertAccess(handle, callerSub, callerEmail);
    } catch (e) {
      if (e.message === "NOT_FOUND") return { statusCode: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Handle not found" }) };
      return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Forbidden" }) };
    }

    if (method === "POST") {
      const body = event.body ? JSON.parse(event.body) : {};
      const name = String(body.name || "").trim();
      if (!name) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "name is required" }) };
      }
      const itemId = body.itemId || generateId();
      const now = new Date().toISOString();
      const qty = body.qty != null ? Number(body.qty) : null;
      const item = {
        handle,
        itemId,
        name,
        qty,
        inStock: qty == null ? true : qty > 0,
        price: body.price != null ? body.price : null,
        description: body.description || null,
        category: body.category || null,
        imageUrl: body.imageUrl || null,
        customFields: body.customFields && typeof body.customFields === "object" ? body.customFields : {},
        createdAt: body.createdAt || now,
        updatedAt: now
      };
      await ddb.put({ TableName: process.env.CATALOG_TABLE, Item: item }).promise();
      triggerSync(handle);
      return { statusCode: 201, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true, item }) };
    }

    if (method === "PATCH") {
      const body = event.body ? JSON.parse(event.body) : {};
      const itemId = String(body.itemId || event.queryStringParameters?.itemId || "").trim();
      if (!itemId) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "itemId is required" }) };
      }
      // Build update expression dynamically
      const updates = {};
      if (body.name != null) updates.name = String(body.name).trim();
      if (body.qty != null) { updates.qty = Number(body.qty); updates.inStock = Number(body.qty) > 0; }
      if (body.price != null) updates.price = body.price;
      if (body.description != null) updates.description = body.description;
      if (body.category != null) updates.category = body.category;
      if (body.imageUrl != null) updates.imageUrl = body.imageUrl;
      if (body.customFields != null) updates.customFields = body.customFields;
      if (body.inStock != null) updates.inStock = Boolean(body.inStock);
      updates.updatedAt = new Date().toISOString();

      const exprParts = Object.keys(updates).map((k) => `#${k} = :${k}`);
      const ExpressionAttributeNames = Object.fromEntries(Object.keys(updates).map((k) => [`#${k}`, k]));
      const ExpressionAttributeValues = Object.fromEntries(Object.entries(updates).map(([k, v]) => [`:${k}`, v]));

      await ddb.update({
        TableName: process.env.CATALOG_TABLE,
        Key: { handle, itemId },
        UpdateExpression: `SET ${exprParts.join(", ")}`,
        ExpressionAttributeNames,
        ExpressionAttributeValues
      }).promise();
      triggerSync(handle);
      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true }) };
    }

    if (method === "DELETE") {
      const itemId = String(event.queryStringParameters?.itemId || "").trim();
      if (!itemId) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "itemId is required" }) };
      }
      await ddb.delete({ TableName: process.env.CATALOG_TABLE, Key: { handle, itemId } }).promise();
      triggerSync(handle);
      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (error) {
    console.error("[catalog]", error);
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Internal server error", details: error.message }) };
  }
};
