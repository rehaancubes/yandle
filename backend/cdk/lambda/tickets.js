const AWS = require("aws-sdk");
const crypto = require("crypto");
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

      // If phone is provided, look up tickets by phone
      if (qs.phone) {
        const result = await ddb.query({
          TableName: process.env.TICKETS_TABLE,
          IndexName: "PhoneIndex",
          KeyConditionExpression: "phone = :p",
          FilterExpression: "handle = :h",
          ExpressionAttributeValues: { ":p": qs.phone, ":h": handle },
          ScanIndexForward: false
        }).promise();
        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items: result.Items || [] })
        };
      }

      // Default: query by handle with optional status filter
      const params = {
        TableName: process.env.TICKETS_TABLE,
        KeyConditionExpression: "handle = :h",
        ExpressionAttributeValues: { ":h": handle },
        ScanIndexForward: false,
        Limit: Number(qs.limit) || 50
      };

      if (qs.status) {
        params.IndexName = "HandleStatusIndex";
        params.KeyConditionExpression = "handle = :h AND #st = :s";
        params.ExpressionAttributeNames = { "#st": "status" };
        params.ExpressionAttributeValues[":s"] = qs.status;
      }

      const result = await ddb.query(params).promise();
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: result.Items || [] })
      };
    }

    if (method === "POST") {
      const body = parseBody(event);
      const handle = body.handle;
      if (!handle) return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle is required" }) };

      const ticketId = `TKT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const now = new Date().toISOString();

      const item = {
        handle,
        ticketId,
        customerName: body.customerName || "",
        phone: body.phone || "",
        email: body.email || "",
        category: body.category || "General",
        description: body.description || "",
        status: body.status || "Open",
        priority: body.priority || "medium",
        source: body.source || "call",
        createdAt: now,
        updatedAt: now
      };

      await ddb.put({ TableName: process.env.TICKETS_TABLE, Item: item }).promise();

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, ticket: item })
      };
    }

    if (method === "PUT") {
      const body = parseBody(event);
      const { handle, ticketId } = body;
      if (!handle || !ticketId) return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle and ticketId are required" }) };

      const updates = [];
      const names = {};
      const values = { ":u": new Date().toISOString() };
      updates.push("updatedAt = :u");

      if (body.status) {
        updates.push("#st = :st");
        names["#st"] = "status";
        values[":st"] = body.status;
        if (body.status === "Resolved" || body.status === "Closed") {
          updates.push("resolvedAt = :ra");
          values[":ra"] = new Date().toISOString();
        }
      }
      if (body.priority) {
        updates.push("priority = :pr");
        values[":pr"] = body.priority;
      }
      if (body.category) {
        updates.push("category = :cat");
        values[":cat"] = body.category;
      }
      if (body.description) {
        updates.push("description = :desc");
        values[":desc"] = body.description;
      }

      await ddb.update({
        TableName: process.env.TICKETS_TABLE,
        Key: { handle, ticketId },
        UpdateExpression: "SET " + updates.join(", "),
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ExpressionAttributeValues: values
      }).promise();

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true })
      };
    }

    if (method === "DELETE") {
      const handle = qs.handle;
      const ticketId = qs.ticketId;
      if (!handle || !ticketId) return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle and ticketId are required" }) };

      await ddb.delete({ TableName: process.env.TICKETS_TABLE, Key: { handle, ticketId } }).promise();

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true })
      };
    }

    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (err) {
    console.error("[tickets] Error:", err);
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: err.message }) };
  }
};
