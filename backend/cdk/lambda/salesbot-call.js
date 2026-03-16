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
 * Originate an outbound call via the SIP trunk server.
 * POST http://<SIP_TRUNK_HOST>:3000/call-originate
 */
async function originateCall({ phoneNumber, campaignId, leadId, businessName, businessType, location }) {
  const sipUrl = process.env.SIP_TRUNK_URL;
  if (!sipUrl) throw new Error("SIP_TRUNK_URL not configured");

  const url = new URL("/call-originate", sipUrl);
  const body = JSON.stringify({
    phoneNumber,
    campaignId,
    leadId,
    businessName,
    businessType,
    location,
    callType: "sales",
  });

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
      const body = JSON.parse(event.body || "{}");
      const { phoneNumber } = body;

      if (!phoneNumber) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "phoneNumber is required" }),
        };
      }

      // Create a test campaign/lead for tracking
      const now = new Date().toISOString();
      const testCampaignId = "test_" + Date.now().toString(36);
      const testLeadId = "test_lead_" + Date.now().toString(36);

      // Store test lead
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
            classification: null,
            callSummary: null,
            callDurationSeconds: null,
            callUniqueId: null,
            createdAt: now,
            updatedAt: now,
          },
        })
        .promise();

      // Originate the call
      const result = await originateCall({
        phoneNumber,
        campaignId: testCampaignId,
        leadId: testLeadId,
        businessName: "Test Call",
        businessType: "test",
        location: "test",
      });

      // Store uniqueId if returned
      if (result.uniqueid) {
        await ddb
          .update({
            TableName: LEADS_TABLE,
            Key: { campaignId: testCampaignId, leadId: testLeadId },
            UpdateExpression: "SET callUniqueId = :uid, updatedAt = :now",
            ExpressionAttributeValues: { ":uid": result.uniqueid, ":now": now },
          })
          .promise();
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          campaignId: testCampaignId,
          leadId: testLeadId,
          uniqueid: result.uniqueid || null,
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

          // Originate call
          const result = await originateCall({
            phoneNumber: lead.phoneNumber,
            campaignId,
            leadId: lead.leadId,
            businessName: lead.businessName,
            businessType: campaign.businessType,
            location: campaign.location,
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
