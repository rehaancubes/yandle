const AWS = require("aws-sdk");
const https = require("https");
const http = require("http");
const ddb = new AWS.DynamoDB.DocumentClient();

const SUPER_ADMINS = ["rehaanr4@gmail.com", "rehaan@mobil80.com"];
const MAX_CONCURRENT_CALLS = 5;

function isSuperAdmin(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims || {};
  const email = (claims.email || claims["cognito:username"] || "").toLowerCase();
  return SUPER_ADMINS.includes(email);
}

/**
 * Fetch BMS outbound config (system prompt, voice, KB) for the SIP trunk.
 */
async function getOutboundConfig() {
  const table = process.env.BMS_OUTBOUND_CONFIG_TABLE;
  if (!table) return null;
  try {
    const result = await ddb.get({
      TableName: table,
      Key: { configKey: "outbound" },
    }).promise();
    const item = result.Item;
    if (!item) return null;
    return {
      handle: item.handle || "voxa-salesbot",
      systemPrompt: item.systemPrompt || "",
      voiceId: item.voiceId || "tiffany",
      knowledgeBaseId: item.knowledgeBaseId || "",
    };
  } catch {
    return null;
  }
}

/**
 * Originate an outbound call via the SIP trunk server.
 * POST http://<SIP_TRUNK_HOST>:3000/call-originate
 * Optionally includes outboundConfig (systemPrompt, voiceId, knowledgeBaseId) from BMS.
 */
async function originateCall({ phoneNumber, campaignId, leadId, businessName, businessType, location, outboundConfig }) {
  const sipUrl = process.env.SIP_TRUNK_URL;
  if (!sipUrl) throw new Error("SIP_TRUNK_URL not configured");

  const url = new URL("/call-originate", sipUrl);
  const payload = {
    phoneNumber,
    campaignId,
    leadId,
    businessName,
    businessType,
    location,
    callType: "sales",
  };
  if (outboundConfig && (outboundConfig.systemPrompt != null || outboundConfig.voiceId != null || outboundConfig.knowledgeBaseId != null)) {
    payload.systemPrompt = outboundConfig.systemPrompt || "";
    payload.voiceId = outboundConfig.voiceId || "tiffany";
    payload.knowledgeBaseId = outboundConfig.knowledgeBaseId || "";
  }
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const proto = url.protocol === "https:" ? https : http;
    const req = proto.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ ok: false, error: data });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = { "content-type": "application/json" };
  try {
    if (!isSuperAdmin(event)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const path = event.requestContext?.http?.path || "";
    const CAMPAIGNS_TABLE = process.env.SALES_CAMPAIGNS_TABLE;
    const LEADS_TABLE = process.env.SALES_LEADS_TABLE;

    // POST /bms/salesbot/test-call — single test call
    if (path.endsWith("/test-call")) {
      let body;
      try {
        body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : event.body || {};
      } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
      }
      const { phoneNumber } = body;

      if (!phoneNumber) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "phoneNumber is required" }),
        };
      }

      const sipUrl = (process.env.SIP_TRUNK_URL || "").trim();
      if (!sipUrl || sipUrl.includes("localhost") || sipUrl.startsWith("http://127.0.0.1")) {
        return {
          statusCode: 503,
          headers,
          body: JSON.stringify({
            error: "SIP trunk not configured",
            detail: "Set SIP_TRUNK_URL to your SIP trunk server URL (e.g. https://your-server.com). localhost is not reachable from the server.",
          }),
        };
      }

      if (!LEADS_TABLE) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: "Server misconfiguration: SALES_LEADS_TABLE not set" }),
        };
      }

      // Create a test campaign/lead for tracking
      const now = new Date().toISOString();
      const testCampaignId = "test_" + Date.now().toString(36);
      const testLeadId = "test_lead_" + Date.now().toString(36);

      try {
        // Store test lead (omit callUniqueId — it's a GSI key; null would cause "Type mismatch". Add it later via update.)
        await ddb
          .put({
            TableName: LEADS_TABLE,
            Item: {
              campaignId: testCampaignId,
              leadId: testLeadId,
              businessName: "Test Call",
              phoneNumber,
              address: "",
              googlePlaceId: "",
              status: "calling",
              createdAt: now,
              updatedAt: now,
            },
          })
          .promise();
      } catch (dbErr) {
        console.error("[salesbot-call] test-call DynamoDB put error:", dbErr.message);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: "Failed to create test lead", detail: dbErr.message }),
        };
      }

      const outboundConfig = await getOutboundConfig();
      let result;
      try {
        result = await originateCall({
          phoneNumber,
          campaignId: testCampaignId,
          leadId: testLeadId,
          businessName: "Test Call",
          businessType: "test",
          location: "test",
          outboundConfig,
        });
      } catch (originateErr) {
        console.error("[salesbot-call] test-call originate error:", originateErr.message);
        return {
          statusCode: 502,
          headers,
          body: JSON.stringify({
            error: "SIP trunk unreachable",
            detail: originateErr.code === "ECONNREFUSED" ? "Connection refused. Is the SIP trunk server running and SIP_TRUNK_URL correct?" : originateErr.message,
          }),
        };
      }

      // Store uniqueId if returned
      if (result && result.uniqueid) {
        try {
          await ddb
            .update({
              TableName: LEADS_TABLE,
              Key: { campaignId: testCampaignId, leadId: testLeadId },
              UpdateExpression: "SET callUniqueId = :uid, updatedAt = :now",
              ExpressionAttributeValues: { ":uid": result.uniqueid, ":now": now },
            })
            .promise();
        } catch (_) {}
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          campaignId: testCampaignId,
          leadId: testLeadId,
          uniqueid: (result && result.uniqueid) || null,
        }),
      };
    }

    // POST /bms/salesbot/call-next — dispatch next batch of calls for a campaign
    if (path.endsWith("/call-next")) {
      const body = JSON.parse(event.body || "{}");
      const { campaignId } = body;

      if (!campaignId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "campaignId is required" }),
        };
      }

      // Check campaign is still running
      const campaignResult = await ddb
        .get({ TableName: CAMPAIGNS_TABLE, Key: { campaignId } })
        .promise();
      const campaign = campaignResult.Item;

      if (!campaign || campaign.status !== "running") {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ dispatched: 0, reason: "Campaign not running" }),
        };
      }

      // Count currently calling leads
      const leadsResult = await ddb
        .query({
          TableName: LEADS_TABLE,
          KeyConditionExpression: "campaignId = :cid",
          ExpressionAttributeValues: { ":cid": campaignId },
        })
        .promise();

      const leads = leadsResult.Items || [];
      const currentlyCalling = leads.filter((l) => l.status === "calling").length;
      const pendingLeads = leads.filter((l) => l.status === "pending");
      const slotsAvailable = MAX_CONCURRENT_CALLS - currentlyCalling;

      if (slotsAvailable <= 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ dispatched: 0, reason: "Max concurrent calls reached", currentlyCalling }),
        };
      }

      if (pendingLeads.length === 0) {
        // No more leads — check if all are done
        if (currentlyCalling === 0) {
          await ddb
            .update({
              TableName: CAMPAIGNS_TABLE,
              Key: { campaignId },
              UpdateExpression: "SET #s = :completed, updatedAt = :now",
              ExpressionAttributeNames: { "#s": "status" },
              ExpressionAttributeValues: { ":completed": "completed", ":now": new Date().toISOString() },
            })
            .promise();
        }
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ dispatched: 0, reason: "No pending leads" }),
        };
      }

      // Dispatch up to slotsAvailable calls
      const toCall = pendingLeads.slice(0, slotsAvailable);
      const now = new Date().toISOString();
      const dispatched = [];
      const outboundConfig = await getOutboundConfig();

      for (const lead of toCall) {
        try {
          // Mark as calling
          await ddb
            .update({
              TableName: LEADS_TABLE,
              Key: { campaignId, leadId: lead.leadId },
              UpdateExpression: "SET #s = :calling, callStartedAt = :now, updatedAt = :now",
              ExpressionAttributeNames: { "#s": "status" },
              ExpressionAttributeValues: { ":calling": "calling", ":now": now },
            })
            .promise();

          // Originate call (include BMS outbound config if set)
          const result = await originateCall({
            phoneNumber: lead.phoneNumber,
            campaignId,
            leadId: lead.leadId,
            businessName: lead.businessName,
            businessType: campaign.businessType,
            location: campaign.location,
            outboundConfig,
          });

          if (result.uniqueid) {
            await ddb
              .update({
                TableName: LEADS_TABLE,
                Key: { campaignId, leadId: lead.leadId },
                UpdateExpression: "SET callUniqueId = :uid",
                ExpressionAttributeValues: { ":uid": result.uniqueid },
              })
              .promise();
          }

          dispatched.push({ leadId: lead.leadId, phone: lead.phoneNumber, uniqueid: result.uniqueid });
        } catch (err) {
          console.error(`[salesbot-call] Failed to call ${lead.phoneNumber}:`, err.message);
          await ddb
            .update({
              TableName: LEADS_TABLE,
              Key: { campaignId, leadId: lead.leadId },
              UpdateExpression: "SET #s = :failed, updatedAt = :now",
              ExpressionAttributeNames: { "#s": "status" },
              ExpressionAttributeValues: { ":failed": "failed", ":now": now },
            })
            .promise();
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ dispatched: dispatched.length, calls: dispatched }),
      };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
  } catch (error) {
    console.error("[salesbot-call] Error:", error.message, error.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
