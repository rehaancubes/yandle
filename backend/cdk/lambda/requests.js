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

async function isAuthorized(handle, callerSub) {
  if (!callerSub) return false;
  // Check if owner
  const handleRes = await ddb.get({ TableName: process.env.HANDLES_TABLE, Key: { handle } }).promise();
  if (handleRes.Item?.ownerId === callerSub) return true;
  // Check if member
  const email = (await getEmailFromSub(callerSub)) || "";
  if (email) {
    const memberRes = await ddb.get({ TableName: process.env.MEMBERS_TABLE, Key: { handle, email } }).promise();
    if (memberRes.Item) return true;
  }
  return false;
}

async function getEmailFromSub(sub) {
  // We don't have a direct sub→email lookup, but members are keyed by email
  // For now, we rely on the handle ownership check or the caller passing handle
  return null;
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

      const params = {
        TableName: process.env.REQUESTS_TABLE,
        KeyConditionExpression: "handle = :h",
        ExpressionAttributeValues: { ":h": handle },
        ScanIndexForward: false,
        Limit: Number(qs.limit) || 50
      };

      // Use the HandleCreatedAtIndex GSI for sorted results
      params.IndexName = "HandleCreatedAtIndex";

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

      const requestId = crypto.randomUUID();
      const now = new Date().toISOString();

      const item = {
        handle,
        requestId,
        callerName: body.callerName || "",
        phone: body.phone || "",
        email: body.email || "",
        description: body.description || "",
        classification: body.classification || "unknown",
        source: body.source || "call",
        status: body.status || "new",
        createdAt: now,
        updatedAt: now
      };

      await ddb.put({ TableName: process.env.REQUESTS_TABLE, Item: item }).promise();

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, request: item })
      };
    }

    if (method === "PUT") {
      const body = parseBody(event);
      const { handle, requestId, status } = body;
      if (!handle || !requestId) return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle and requestId are required" }) };

      const updates = [];
      const names = {};
      const values = { ":u": new Date().toISOString() };
      updates.push("updatedAt = :u");

      if (status) {
        updates.push("#st = :st");
        names["#st"] = "status";
        values[":st"] = status;
      }
      if (body.classification) {
        updates.push("classification = :cl");
        values[":cl"] = body.classification;
      }

      await ddb.update({
        TableName: process.env.REQUESTS_TABLE,
        Key: { handle, requestId },
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
      const requestId = qs.requestId;
      if (!handle || !requestId) return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle and requestId are required" }) };

      await ddb.delete({ TableName: process.env.REQUESTS_TABLE, Key: { handle, requestId } }).promise();

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true })
      };
    }

    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (err) {
    console.error("[requests] Error:", err);
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: err.message }) };
  }
};
