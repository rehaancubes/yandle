/**
 * GET  /members?handle=xxx           — list members (owner or manager)
 * POST /members                      — add member by email (owner only)
 * DELETE /members?handle=xxx&email=x — remove member (owner only)
 */
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

function normalizeHandle(raw) {
  let s = String(raw || "").toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
  if (s.startsWith("voxa-")) s = s.slice(5);
  return s;
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

    // Get handle to verify ownership
    const handleRes = await ddb.get({ TableName: process.env.HANDLES_TABLE, Key: { handle } }).promise();
    if (!handleRes.Item) {
      return { statusCode: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Handle not found" }) };
    }
    const handleOwnerSub = handleRes.Item.ownerId;
    const callerIsOwner = handleOwnerSub === callerSub;

    // Managers can read the member list but not modify it
    async function callerIsManager() {
      if (!callerEmail || !process.env.MEMBERS_TABLE) return false;
      const res = await ddb.get({ TableName: process.env.MEMBERS_TABLE, Key: { handle, email: callerEmail } }).promise();
      return !!res.Item;
    }

    if (method === "GET") {
      if (!callerIsOwner && !(await callerIsManager())) {
        return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Forbidden" }) };
      }
      const result = await ddb.query({
        TableName: process.env.MEMBERS_TABLE,
        KeyConditionExpression: "handle = :h",
        ExpressionAttributeValues: { ":h": handle }
      }).promise();
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, members: result.Items || [], isOwner: callerIsOwner })
      };
    }

    if (method === "POST") {
      if (!callerIsOwner) {
        return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Only the owner can add members" }) };
      }
      const body = event.body ? JSON.parse(event.body) : {};
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "email is required" }) };
      }

      // Enforce cross-business uniqueness: one email may only belong to one handle
      if (process.env.MEMBERS_TABLE && process.env.MEMBERS_EMAIL_INDEX) {
        const existing = await ddb.query({
          TableName: process.env.MEMBERS_TABLE,
          IndexName: process.env.MEMBERS_EMAIL_INDEX,
          KeyConditionExpression: "email = :e",
          ExpressionAttributeValues: { ":e": email },
          Limit: 1
        }).promise();
        if (existing.Items && existing.Items.length > 0) {
          const existingHandle = existing.Items[0].handle;
          if (existingHandle !== handle) {
            return {
              statusCode: 409,
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ error: `This email is already a member of @${existingHandle}. A member can only belong to one business.` })
            };
          }
          // Already a member of this handle — idempotent, fall through to upsert
        }
      }

      const item = {
        handle,
        email,
        role: "manager",
        addedAt: new Date().toISOString(),
        addedBy: callerSub
      };
      await ddb.put({ TableName: process.env.MEMBERS_TABLE, Item: item }).promise();
      return { statusCode: 201, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true, member: item }) };
    }

    if (method === "DELETE") {
      if (!callerIsOwner) {
        return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Only the owner can remove members" }) };
      }
      const email = String(event.queryStringParameters?.email || "").trim().toLowerCase();
      if (!email) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "email is required" }) };
      }
      await ddb.delete({ TableName: process.env.MEMBERS_TABLE, Key: { handle, email } }).promise();
      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (error) {
    console.error("[members]", error);
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Internal server error", details: error.message }) };
  }
};
