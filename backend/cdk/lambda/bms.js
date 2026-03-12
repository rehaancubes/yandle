const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

// Super-admin emails allowed to access BMS
const SUPER_ADMINS = ["rehaanr4@gmail.com", "rehaan@mobil80.com"];

function isSuperAdmin(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims || {};
  const email = (claims.email || claims["cognito:username"] || "").toLowerCase();
  return SUPER_ADMINS.includes(email);
}

exports.handler = async (event) => {
  const headers = { "content-type": "application/json" };
  try {
    if (!isSuperAdmin(event)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const path = event.requestContext?.http?.path || "";
    const PHONE_TABLE = process.env.PHONE_NUMBERS_TABLE;
    const PAYMENTS_TABLE = process.env.PAYMENTS_TABLE;
    const HANDLES_TABLE = process.env.HANDLES_TABLE;
    const CREDITS_TABLE = process.env.CREDITS_TABLE;
    const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE;
    const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE;
    const MEMBERS_TABLE = process.env.MEMBERS_TABLE;
    const WEBSITE_CONFIG_TABLE = process.env.WEBSITE_CONFIG_TABLE;

    // GET /bms/summary
    if (path.endsWith("/summary")) {
      const [phoneResult, paymentsResult, handlesCount, bookingsCount, convsCount] = await Promise.all([
        ddb.scan({
          TableName: PHONE_TABLE,
          FilterExpression: "#s = :assigned",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":assigned": "assigned" }
        }).promise(),
        PAYMENTS_TABLE
          ? ddb.scan({ TableName: PAYMENTS_TABLE }).promise()
          : Promise.resolve({ Items: [], Count: 0 }),
        ddb.scan({ TableName: HANDLES_TABLE, Select: "COUNT" }).promise(),
        ddb.scan({ TableName: BOOKINGS_TABLE, Select: "COUNT" }).promise(),
        ddb.scan({ TableName: CONVERSATIONS_TABLE, Select: "COUNT" }).promise()
      ]);

      const assignedNumbers = phoneResult.Items || [];
      const payments = paymentsResult.Items || [];
      const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const uniqueHandles = new Set(assignedNumbers.map((n) => n.handle).filter(Boolean));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          totalNumbersSold: assignedNumbers.length,
          totalRevenue,
          totalPayments: payments.length,
          activeBusinesses: uniqueHandles.size,
          totalBusinesses: handlesCount.Count || 0,
          totalBookings: bookingsCount.Count || 0,
          totalConversations: convsCount.Count || 0,
          currency: "INR"
        })
      };
    }

    // GET /bms/numbers
    if (path.endsWith("/numbers")) {
      const result = await ddb.scan({
        TableName: PHONE_TABLE,
        FilterExpression: "#s = :assigned",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":assigned": "assigned" }
      }).promise();

      const numbers = (result.Items || []).map((item) => ({
        phoneNumber: item.phoneNumber,
        handle: item.handle,
        assignedAt: item.assignedAt,
        monthlyPrice: item.monthlyPrice || 500,
        status: item.status
      }));

      // Enrich with handle display names
      const handles = [...new Set(numbers.map((n) => n.handle).filter(Boolean))];
      const handleMap = {};
      for (const h of handles) {
        try {
          const res = await ddb.get({ TableName: HANDLES_TABLE, Key: { handle: h } }).promise();
          if (res.Item) handleMap[h] = res.Item.displayName || h;
        } catch (_) {
          handleMap[h] = h;
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          numbers: numbers.map((n) => ({
            ...n,
            businessName: handleMap[n.handle] || n.handle
          }))
        })
      };
    }

    // GET /bms/payments
    if (path.endsWith("/payments")) {
      if (!PAYMENTS_TABLE) {
        return { statusCode: 200, headers, body: JSON.stringify({ payments: [] }) };
      }
      const result = await ddb.scan({ TableName: PAYMENTS_TABLE }).promise();
      const payments = (result.Items || [])
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

      return { statusCode: 200, headers, body: JSON.stringify({ payments }) };
    }

    // GET /bms/businesses — all businesses with enriched data
    if (path.endsWith("/businesses")) {
      const handlesResult = await ddb.scan({ TableName: HANDLES_TABLE }).promise();
      const allHandles = handlesResult.Items || [];

      const enriched = await Promise.all(allHandles.map(async (h) => {
        const handle = h.handle;
        const [creditsResult, bookingsCount, convsCount, ownerResult, websiteResult] = await Promise.all([
          ddb.get({ TableName: CREDITS_TABLE, Key: { handle } }).promise()
            .then(r => r.Item || null).catch(() => null),
          ddb.query({
            TableName: BOOKINGS_TABLE,
            KeyConditionExpression: "handle = :h",
            ExpressionAttributeValues: { ":h": handle },
            Select: "COUNT"
          }).promise().then(r => r.Count || 0).catch(() => 0),
          ddb.query({
            TableName: CONVERSATIONS_TABLE,
            IndexName: "HandleCreatedAtIndex",
            KeyConditionExpression: "handle = :h",
            ExpressionAttributeValues: { ":h": handle },
            Select: "COUNT"
          }).promise().then(r => r.Count || 0).catch(() => 0),
          MEMBERS_TABLE ? ddb.query({
            TableName: MEMBERS_TABLE,
            KeyConditionExpression: "handle = :h",
            ExpressionAttributeValues: { ":h": handle }
          }).promise().then(r => {
            const members = r.Items || [];
            // Find owner or first member
            const owner = members.find(m => m.role === "owner") || members[0];
            return owner?.email || null;
          }).catch(() => null) : Promise.resolve(null),
          ddb.get({ TableName: WEBSITE_CONFIG_TABLE, Key: { handle } }).promise()
            .then(r => !!r.Item).catch(() => false)
        ]);

        return {
          handle,
          displayName: h.displayName || handle,
          useCaseId: h.useCaseId || "unknown",
          phoneNumber: h.phoneNumber || null,
          hasAiPhone: h.hasAiPhone || false,
          knowledgeBaseId: h.knowledgeBaseId || null,
          createdAt: h.createdAt,
          updatedAt: h.updatedAt,
          credits: creditsResult?.credits ?? 0,
          totalCreditsUsed: creditsResult?.totalCreditsUsed ?? 0,
          planType: creditsResult?.planType || "none",
          totalBookings: bookingsCount,
          totalConversations: convsCount,
          ownerEmail: ownerResult,
          hasWebsite: websiteResult,
          lastActive: h.updatedAt || h.createdAt
        };
      }));

      return {
        statusCode: 200, headers,
        body: JSON.stringify({ businesses: enriched })
      };
    }

    // GET /bms/credits — all credit records
    if (path.endsWith("/credits")) {
      const creditsResult = await ddb.scan({ TableName: CREDITS_TABLE }).promise();
      const allCredits = creditsResult.Items || [];

      const enriched = await Promise.all(allCredits.map(async (c) => {
        try {
          const handleRes = await ddb.get({ TableName: HANDLES_TABLE, Key: { handle: c.handle } }).promise();
          return {
            ...c,
            displayName: handleRes.Item?.displayName || c.handle,
            useCaseId: handleRes.Item?.useCaseId || "unknown"
          };
        } catch {
          return { ...c, displayName: c.handle, useCaseId: "unknown" };
        }
      }));

      return { statusCode: 200, headers, body: JSON.stringify({ credits: enriched }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
  } catch (error) {
    console.error("[bms] Error:", error.message, error.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
