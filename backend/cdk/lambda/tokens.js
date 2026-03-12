/**
 * Clinic queue / token management.
 * GET   /tokens?handle=xxx&date=YYYY-MM-DD&doctorId=xxx  — list today's tokens (public)
 * POST  /tokens                                           — create a token (any caller)
 * PATCH /tokens                                           — update token status (owner/manager)
 * DELETE /tokens?handle=xxx&tokenId=xxx                   — remove token (owner/manager)
 */
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();
const { assertAccess } = require("./auth-helper");

function normalizeHandle(raw) {
  let s = String(raw || "").toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
  if (s.startsWith("voxa-")) s = s.slice(5);
  return s;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

    if (method === "GET") {
      const doctorId = event.queryStringParameters?.doctorId || null;
      const date = event.queryStringParameters?.date || new Date().toISOString().slice(0, 10);

      const queryParams = {
        TableName: process.env.TOKENS_TABLE,
        KeyConditionExpression: "handle = :h",
        FilterExpression: "#d = :date",
        ExpressionAttributeNames: { "#d": "date" },
        ExpressionAttributeValues: { ":h": handle, ":date": date }
      };
      if (doctorId) {
        queryParams.FilterExpression += " AND doctorId = :did";
        queryParams.ExpressionAttributeValues[":did"] = doctorId;
      }

      const result = await ddb.query(queryParams).promise();
      const tokens = (result.Items || []).sort((a, b) => (a.tokenNumber || 0) - (b.tokenNumber || 0));

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, date, tokens })
      };
    }

    if (method === "POST") {
      const body = event.body ? JSON.parse(event.body) : {};
      const patientName = String(body.patientName || body.name || "").trim();
      const phone = String(body.phone || "").trim();
      const email = String(body.email || "").trim();
      const doctorId = String(body.doctorId || "").trim() || null;
      const source = body.source || "call"; // call | chat | manual

      const date = new Date().toISOString().slice(0, 10);

      // Count existing tokens for today (per doctor if specified)
      const allTodayRes = await ddb.query({
        TableName: process.env.TOKENS_TABLE,
        KeyConditionExpression: "handle = :h",
        FilterExpression: "#d = :date",
        ExpressionAttributeNames: { "#d": "date" },
        ExpressionAttributeValues: { ":h": handle, ":date": date }
      }).promise();

      const allToday = allTodayRes.Items || [];
      const relevantTokens = doctorId ? allToday.filter((t) => t.doctorId === doctorId) : allToday;
      const tokenNumber = relevantTokens.length + 1;

      // Estimate wait time from doctor's avg consult duration
      let estimatedWaitMinutes = null;
      if (doctorId && process.env.DOCTORS_TABLE) {
        const docRes = await ddb.get({ TableName: process.env.DOCTORS_TABLE, Key: { handle, doctorId } }).promise();
        if (docRes.Item?.avgConsultMinutes) {
          const pendingAhead = relevantTokens.filter((t) => t.status === "WAITING").length;
          estimatedWaitMinutes = pendingAhead * Number(docRes.Item.avgConsultMinutes);
        }
      }

      const tokenId = `${date}-${generateId()}`;
      const item = {
        handle,
        tokenId,
        tokenNumber,
        date,
        patientName: patientName || null,
        phone: phone || null,
        email: email || null,
        doctorId,
        status: "WAITING", // WAITING | CALLED | DONE | NO_SHOW
        source,
        estimatedWaitMinutes,
        createdAt: new Date().toISOString()
      };

      await ddb.put({ TableName: process.env.TOKENS_TABLE, Item: item }).promise();

      return {
        statusCode: 201,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, token: item })
      };
    }

    if (method === "PATCH") {
      // Update token status — manager or owner
      try {
        await assertAccess(handle, callerSub, callerEmail);
      } catch (e) {
        if (e.message === "NOT_FOUND") return { statusCode: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Handle not found" }) };
        return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Forbidden" }) };
      }

      const body = event.body ? JSON.parse(event.body) : {};
      const tokenId = String(body.tokenId || event.queryStringParameters?.tokenId || "").trim();
      const status = String(body.status || "").trim();

      if (!tokenId || !status) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "tokenId and status are required" }) };
      }

      const validStatuses = ["WAITING", "CALLED", "DONE", "NO_SHOW"];
      if (!validStatuses.includes(status)) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: `status must be one of: ${validStatuses.join(", ")}` }) };
      }

      await ddb.update({
        TableName: process.env.TOKENS_TABLE,
        Key: { handle, tokenId },
        UpdateExpression: "SET #s = :s, updatedAt = :u",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": status, ":u": new Date().toISOString() }
      }).promise();

      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true }) };
    }

    if (method === "DELETE") {
      try {
        await assertAccess(handle, callerSub, callerEmail);
      } catch {
        return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Forbidden" }) };
      }
      const tokenId = String(event.queryStringParameters?.tokenId || "").trim();
      if (!tokenId) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "tokenId is required" }) };
      }
      await ddb.delete({ TableName: process.env.TOKENS_TABLE, Key: { handle, tokenId } }).promise();
      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (error) {
    console.error("[tokens]", error);
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Internal server error", details: error.message }) };
  }
};
