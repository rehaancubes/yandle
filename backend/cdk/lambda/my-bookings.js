/**
 * GET /my-bookings?limit=30&includeAll=true
 * Returns bookings for the authenticated user (by email from JWT).
 * Enriches each booking with handle profile (businessName, category, address).
 * Default: upcoming bookings only (startTime >= now), sorted soonest first.
 * ?includeAll=true returns past+future bookings, sorted newest first.
 */
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const callerEmail = (
      event.requestContext?.authorizer?.jwt?.claims?.email || ""
    ).toLowerCase();

    if (!callerEmail) {
      return {
        statusCode: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const qs = event.queryStringParameters || {};
    const limit = Math.min(Number(qs.limit || 30), 100);
    const includeAll = qs.includeAll === "true";

    const queryParams = {
      TableName: process.env.BOOKINGS_TABLE,
      IndexName: process.env.BOOKINGS_EMAIL_INDEX,
      ExpressionAttributeValues: { ":e": callerEmail },
      ScanIndexForward: true,
      Limit: limit,
    };

    if (includeAll) {
      queryParams.KeyConditionExpression = "email = :e";
      queryParams.ScanIndexForward = false; // newest first
    } else {
      const now = new Date().toISOString();
      queryParams.KeyConditionExpression =
        "email = :e AND startTime >= :now";
      queryParams.ExpressionAttributeValues[":now"] = now;
    }

    const result = await ddb.query(queryParams).promise();
    const items = result.Items || [];

    // Enrich each booking with the handle's profile
    const handleIds = [...new Set(items.map((b) => b.handle))];
    const profileMap = {};
    if (process.env.HANDLES_TABLE && handleIds.length > 0) {
      await Promise.all(
        handleIds.map(async (h) => {
          const r = await ddb
            .get({ TableName: process.env.HANDLES_TABLE, Key: { handle: h } })
            .promise();
          if (r.Item) {
            profileMap[h] = {
              displayName: r.Item.displayName || null,
              businessName: r.Item.businessName || null,
              category: r.Item.category || null,
              address: r.Item.address || null,
              phoneNumber: r.Item.phoneNumber || null,
            };
          }
        })
      );
    }

    const bookings = items.map((b) => ({
      ...b,
      business: profileMap[b.handle] || {},
    }));

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookings }),
    };
  } catch (error) {
    console.error("[my-bookings]", error);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
    };
  }
};
