/**
 * GET /my-bookings?limit=30&includeAll=true
 * Returns bookings for the authenticated user (by email from JWT).
 * Enriches each booking with handle profile (businessName, category, address).
 * Default: upcoming bookings only (startTime >= now), sorted soonest first.
 * ?includeAll=true returns past+future bookings, sorted newest first.
 */
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

function getLogicalStartTime(item) {
  if (item.slotStartTime) return item.slotStartTime;
  const st = item.startTime || "";
  return st.includes("#") ? st.split("#")[0] : st;
}

exports.handler = async (event) => {
  try {
    const callerEmail = (
      event.requestContext?.authorizer?.jwt?.claims?.email || ""
    ).toLowerCase();
    const callerPhone = (
      event.requestContext?.authorizer?.jwt?.claims?.phone_number || ""
    );

    if (!callerEmail && !callerPhone) {
      return {
        statusCode: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const qs = event.queryStringParameters || {};
    const limit = Math.min(Number(qs.limit || 30), 100);
    const includeAll = qs.includeAll === "true";

    // Query by email (if available)
    const queries = [];
    if (callerEmail) {
      const emailParams = {
        TableName: process.env.BOOKINGS_TABLE,
        IndexName: process.env.BOOKINGS_EMAIL_INDEX,
        ExpressionAttributeValues: { ":e": callerEmail },
        ScanIndexForward: true,
        Limit: limit,
      };
      if (includeAll) {
        emailParams.KeyConditionExpression = "email = :e";
        emailParams.ScanIndexForward = false;
      } else {
        const now = new Date().toISOString();
        emailParams.KeyConditionExpression = "email = :e AND startTime >= :now";
        emailParams.ExpressionAttributeValues[":now"] = now;
      }
      queries.push(ddb.query(emailParams).promise());
    }

    // Query by phone (if available and index exists)
    if (callerPhone && process.env.BOOKINGS_PHONE_INDEX) {
      const phoneParams = {
        TableName: process.env.BOOKINGS_TABLE,
        IndexName: process.env.BOOKINGS_PHONE_INDEX,
        ExpressionAttributeValues: { ":p": callerPhone },
        ScanIndexForward: true,
        Limit: limit,
      };
      if (includeAll) {
        phoneParams.KeyConditionExpression = "phone = :p";
        phoneParams.ScanIndexForward = false;
      } else {
        const now = new Date().toISOString();
        phoneParams.KeyConditionExpression = "phone = :p AND startTime >= :now";
        phoneParams.ExpressionAttributeValues[":now"] = now;
      }
      queries.push(ddb.query(phoneParams).promise());
    }

    const results = await Promise.all(queries);
    // Merge and deduplicate by handle+startTime
    const seen = new Set();
    let allItems = [];
    for (const r of results) {
      for (const item of r.Items || []) {
        const key = `${item.handle}|${item.startTime}`;
        if (!seen.has(key)) {
          seen.add(key);
          allItems.push(item);
        }
      }
    }
    allItems.sort((a, b) => {
      const sa = getLogicalStartTime(a);
      const sb = getLogicalStartTime(b);
      return includeAll ? sb.localeCompare(sa) : sa.localeCompare(sb);
    });
    allItems = allItems.slice(0, limit);

    const items = allItems;

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
      startTime: getLogicalStartTime(b),
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
