const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

const SUPER_ADMINS = ["rehaanr4@gmail.com", "rehaan@mobil80.com"];

function isSuperAdmin(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims || {};
  const email = (claims.email || claims["cognito:username"] || "").toLowerCase();
  return SUPER_ADMINS.includes(email);
}

function getEmail(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims || {};
  return (claims.email || claims["cognito:username"] || "").toLowerCase();
}

exports.handler = async (event) => {
  const headers = { "content-type": "application/json" };
  try {
    if (!isSuperAdmin(event)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const path = event.requestContext?.http?.path || "";
    const method = event.requestContext?.http?.method || "";
    const CAMPAIGNS_TABLE = process.env.SALES_CAMPAIGNS_TABLE;
    const LEADS_TABLE = process.env.SALES_LEADS_TABLE;
    const OUTBOUND_CONFIG_TABLE = process.env.BMS_OUTBOUND_CONFIG_TABLE;
    const OUTBOUND_CONFIG_KEY = "outbound";

    // GET /bms/salesbot/outbound-config — get outbound voice config (handle, system prompt, voice, KB)
    if (method === "GET" && path.endsWith("/outbound-config")) {
      if (!OUTBOUND_CONFIG_TABLE) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Config not configured" }) };
      }
      const result = await ddb.get({
        TableName: OUTBOUND_CONFIG_TABLE,
        Key: { configKey: OUTBOUND_CONFIG_KEY },
      }).promise();
      const item = result.Item || {};
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          handle: item.handle || "voxa-salesbot",
          systemPrompt: item.systemPrompt || "",
          voiceId: item.voiceId || "tiffany",
          knowledgeBaseId: item.knowledgeBaseId || "",
        }),
      };
    }

    // PATCH /bms/salesbot/outbound-config — update outbound voice config (upsert)
    if (method === "PATCH" && path.endsWith("/outbound-config")) {
      if (!OUTBOUND_CONFIG_TABLE) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Config not configured" }) };
      }
      const body = JSON.parse(event.body || "{}");
      const now = new Date().toISOString();
      const existing = await ddb.get({
        TableName: OUTBOUND_CONFIG_TABLE,
        Key: { configKey: OUTBOUND_CONFIG_KEY },
      }).promise();
      const current = existing.Item || {};
      const item = {
        configKey: OUTBOUND_CONFIG_KEY,
        handle: body.handle != null ? String(body.handle).trim() : (current.handle || "voxa-salesbot"),
        systemPrompt: body.systemPrompt != null ? String(body.systemPrompt) : (current.systemPrompt || ""),
        voiceId: body.voiceId != null ? String(body.voiceId).trim() : (current.voiceId || "tiffany"),
        knowledgeBaseId: body.knowledgeBaseId != null ? String(body.knowledgeBaseId).trim() : (current.knowledgeBaseId || ""),
        updatedAt: now,
      };
      await ddb.put({ TableName: OUTBOUND_CONFIG_TABLE, Item: item }).promise();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          handle: item.handle,
          systemPrompt: item.systemPrompt,
          voiceId: item.voiceId,
          knowledgeBaseId: item.knowledgeBaseId,
        }),
      };
    }

    // POST /bms/salesbot/campaigns — create campaign
    if (method === "POST" && (path.endsWith("/campaigns") || path.endsWith("/campaigns/"))) {
      const body = JSON.parse(event.body || "{}");
      const { name, businessType, location } = body;

      if (!name || !businessType || !location) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "name, businessType, and location are required" }),
        };
      }

      const campaignId = "camp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const now = new Date().toISOString();

      const item = {
        campaignId,
        name,
        businessType,
        location,
        status: "draft",
        totalLeads: 0,
        completedCalls: 0,
        hotLeads: 0,
        warmLeads: 0,
        coldLeads: 0,
        notInterested: 0,
        failedCalls: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: getEmail(event),
      };

      await ddb.put({ TableName: CAMPAIGNS_TABLE, Item: item }).promise();

      return { statusCode: 200, headers, body: JSON.stringify(item) };
    }

    // GET /bms/salesbot/campaigns — list all campaigns
    if (method === "GET" && (path.endsWith("/campaigns") || path.endsWith("/campaigns/"))) {
      const result = await ddb.scan({ TableName: CAMPAIGNS_TABLE }).promise();
      const campaigns = (result.Items || []).sort(
        (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")
      );
      return { statusCode: 200, headers, body: JSON.stringify({ campaigns }) };
    }

    // GET /bms/salesbot/campaigns/{campaignId} — get single campaign + leads
    if (method === "GET" && path.includes("/campaigns/")) {
      const campaignId = path.split("/campaigns/")[1]?.replace(/\/$/, "");
      if (!campaignId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "campaignId required" }) };
      }

      const [campaignResult, leadsResult] = await Promise.all([
        ddb.get({ TableName: CAMPAIGNS_TABLE, Key: { campaignId } }).promise(),
        ddb
          .query({
            TableName: LEADS_TABLE,
            KeyConditionExpression: "campaignId = :cid",
            ExpressionAttributeValues: { ":cid": campaignId },
          })
          .promise(),
      ]);

      if (!campaignResult.Item) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Campaign not found" }) };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          campaign: campaignResult.Item,
          leads: (leadsResult.Items || []).sort(
            (a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")
          ),
        }),
      };
    }

    // PATCH /bms/salesbot/campaigns/{campaignId} — update status
    if (method === "PATCH" && path.includes("/campaigns/")) {
      const campaignId = path.split("/campaigns/")[1]?.replace(/\/$/, "");
      if (!campaignId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "campaignId required" }) };
      }

      const body = JSON.parse(event.body || "{}");
      const { status } = body;
      const validStatuses = ["draft", "running", "paused", "completed", "stopped"];

      if (!status || !validStatuses.includes(status)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: `status must be one of: ${validStatuses.join(", ")}` }),
        };
      }

      const now = new Date().toISOString();
      await ddb
        .update({
          TableName: CAMPAIGNS_TABLE,
          Key: { campaignId },
          UpdateExpression: "SET #s = :status, updatedAt = :now",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":status": status, ":now": now },
        })
        .promise();

      const updated = await ddb
        .get({ TableName: CAMPAIGNS_TABLE, Key: { campaignId } })
        .promise();

      return { statusCode: 200, headers, body: JSON.stringify(updated.Item) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
  } catch (error) {
    console.error("[salesbot-campaigns] Error:", error.message, error.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
