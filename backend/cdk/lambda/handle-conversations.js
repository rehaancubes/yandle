/**
 * GET /public/{handle}/conversations
 * Returns conversation sessions for a handle, including caller name,
 * transcript messages, and a presigned recording URL (if available).
 */
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

exports.handler = async (event) => {
  try {
    const handle = String(event.pathParameters?.handle || "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^-+|-+$/g, "");

    if (!handle) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "handle is required" })
      };
    }

    const limit = Math.min(Number(event.queryStringParameters?.limit || 30), 100);

    // Fetch conversation META records (one per session)
    const result = await ddb
      .query({
        TableName: process.env.CONVERSATIONS_TABLE,
        IndexName: "HandleCreatedAtIndex",
        KeyConditionExpression: "handle = :h",
        ExpressionAttributeValues: { ":h": handle },
        ScanIndexForward: false,
        Limit: limit * 5 // over-fetch since we filter to META only
      })
      .promise();

    const metaItems = (result.Items || []).filter((item) => item.sk === "META").slice(0, limit);

    // Enrich each session: add presigned recording URL and caller name
    const sessions = await Promise.all(
      metaItems.map(async (item) => {
        const enriched = { ...item };

        // Generate presigned URL for recording if key is stored
        if (item.recordingKey && process.env.RECORDINGS_BUCKET) {
          try {
            enriched.recordingUrl = s3.getSignedUrl("getObject", {
              Bucket: process.env.RECORDINGS_BUCKET,
              Key: item.recordingKey,
              Expires: 3600
            });
          } catch (e) {
            console.error("[handle-conversations] presign error", e.message);
          }
        }

        // Enrich caller name from CustomersTable if missing
        if (!enriched.callerName && process.env.CUSTOMERS_TABLE && item.handle) {
          const email = item.consumerEmail;
          if (email) {
            try {
              const custResult = await ddb.query({
                TableName: process.env.CUSTOMERS_TABLE,
                KeyConditionExpression: "handle = :h",
                FilterExpression: "email = :e",
                ExpressionAttributeValues: { ":h": item.handle, ":e": email },
                Limit: 1
              }).promise();
              if (custResult.Items && custResult.Items.length && custResult.Items[0].name) {
                enriched.callerName = custResult.Items[0].name;
              }
            } catch (e) {
              console.warn("[handle-conversations] customer lookup error", e.message);
            }
          }
        }

        return enriched;
      })
    );

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handle, sessions })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", details: error.message })
    };
  }
};
