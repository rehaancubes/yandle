const AWS = require("aws-sdk");
const { assertAccess, getCallerFromEvent } = require("./auth-helper");

const ddb = new AWS.DynamoDB.DocumentClient();

function normalizeHandle(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

exports.handler = async (event) => {
  try {
    const { sub, email } = getCallerFromEvent(event);
    if (!sub) {
      return {
        statusCode: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" })
      };
    }
    const handle = normalizeHandle(event.queryStringParameters?.handle || "");
    if (!handle) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "handle is required" })
      };
    }
    await assertAccess(handle, sub, email);

    const limit = Math.min(Number(event.queryStringParameters?.limit || 50), 200);
    const indexName = process.env.CUSTOMERS_LAST_SEEN_INDEX || "HandleLastSeenIndex";
    const result = await ddb.query({
      TableName: process.env.CUSTOMERS_TABLE,
      IndexName: indexName,
      KeyConditionExpression: "handle = :h",
      ExpressionAttributeValues: { ":h": handle },
      ScanIndexForward: false,
      Limit: limit
    }).promise();

    const customers = (result.Items || []).map((i) => ({
      customerId: i.customerId,
      name: i.name,
      phone: i.phone,
      email: i.email,
      firstSeenAt: i.firstSeenAt,
      lastBookingAt: i.lastBookingAt,
      lastSeenAt: i.lastSeenAt
    }));

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handle, customers })
    };
  } catch (e) {
    if (e.message === "FORBIDDEN") {
      return {
        statusCode: 403,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "You do not have access to this handle." })
      };
    }
    console.error("[customers-list]", e);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" })
    };
  }
};
