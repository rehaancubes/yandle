const AWS = require("aws-sdk");
const https = require("https");
const http = require("http");
const ddb = new AWS.DynamoDB.DocumentClient();

// Shared secret for internal webhook calls from Sonic service
const WEBHOOK_SECRET = process.env.SALESBOT_WEBHOOK_SECRET || "voxa-salesbot-internal-2024";

exports.handler = async (event) => {
  const headers = { "content-type": "application/json" };
  try {
    // Verify internal secret (no JWT — called by Sonic service)
    const incomingSecret = event.headers?.["x-salesbot-secret"] || event.headers?.["X-Salesbot-Secret"] || "";
    if (incomingSecret !== WEBHOOK_SECRET) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const body = JSON.parse(event.body || "{}");
    const { campaignId, leadId, summary, classification, transcript, durationSeconds, callUniqueId } = body;

    if (!campaignId || !leadId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "campaignId and leadId are required" }),
      };
    }

    const LEADS_TABLE = process.env.SALES_LEADS_TABLE;
    const CAMPAIGNS_TABLE = process.env.SALES_CAMPAIGNS_TABLE;
    const now = new Date().toISOString();

    // Update lead with call results
    await ddb
      .update({
        TableName: LEADS_TABLE,
        Key: { campaignId, leadId },
        UpdateExpression:
          "SET #s = :completed, classification = :cls, callSummary = :summary, " +
          "callDurationSeconds = :dur, transcript = :transcript, callEndedAt = :now, " +
          "callUniqueId = :uid, updatedAt = :now",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":completed": "completed",
          ":cls": classification || "cold",
          ":summary": summary || "No summary available",
          ":dur": durationSeconds || 0,
          ":transcript": transcript || null,
          ":now": now,
          ":uid": callUniqueId || null,
        },
      })
      .promise();

    // Update campaign counters atomically
    const classField =
      classification === "hot"
        ? "hotLeads"
        : classification === "warm"
        ? "warmLeads"
        : classification === "not_interested"
        ? "notInterested"
        : "coldLeads";

    await ddb
      .update({
        TableName: CAMPAIGNS_TABLE,
        Key: { campaignId },
        UpdateExpression: `SET completedCalls = completedCalls + :one, ${classField} = ${classField} + :one, updatedAt = :now`,
        ExpressionAttributeValues: { ":one": 1, ":now": now },
      })
      .promise();

    // Trigger next batch of calls if campaign is still running
    // Check campaign status first
    const campaignResult = await ddb
      .get({ TableName: CAMPAIGNS_TABLE, Key: { campaignId } })
      .promise();
    const campaign = campaignResult.Item;

    let nextBatchTriggered = false;
    if (campaign && campaign.status === "running" && !campaignId.startsWith("test_")) {
      // Call the salesbot-call Lambda to dispatch next batch
      // We do this by invoking the call-next endpoint internally
      const callNextUrl = process.env.CALL_NEXT_URL;
      if (callNextUrl) {
        try {
          await httpPost(callNextUrl, { campaignId });
          nextBatchTriggered = true;
        } catch (err) {
          console.error("[salesbot-webhook] Failed to trigger next batch:", err.message);
        }
      }
    }

    // Check if campaign is complete (all leads processed)
    if (campaign && campaign.status === "running") {
      const leadsResult = await ddb
        .query({
          TableName: LEADS_TABLE,
          KeyConditionExpression: "campaignId = :cid",
          ExpressionAttributeValues: { ":cid": campaignId },
        })
        .promise();
      const leads = leadsResult.Items || [];
      const allDone = leads.every((l) => ["completed", "failed", "skipped"].includes(l.status));

      if (allDone) {
        await ddb
          .update({
            TableName: CAMPAIGNS_TABLE,
            Key: { campaignId },
            UpdateExpression: "SET #s = :completed, updatedAt = :now",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":completed": "completed", ":now": now },
          })
          .promise();
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, nextBatchTriggered }),
    };
  } catch (error) {
    console.error("[salesbot-webhook] Error:", error.message, error.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const proto = parsed.protocol === "https:" ? https : http;
    const bodyStr = JSON.stringify(body);
    const req = proto.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}
