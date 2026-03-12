const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

// Super-admin emails allowed to access BMS
const SUPER_ADMINS = ["rehaanr4@gmail.com"];

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

    // GET /bms/summary
    if (path.endsWith("/summary")) {
      const [phoneResult, paymentsResult] = await Promise.all([
        ddb.scan({
          TableName: PHONE_TABLE,
          FilterExpression: "#s = :assigned",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":assigned": "assigned" }
        }).promise(),
        PAYMENTS_TABLE
          ? ddb.scan({ TableName: PAYMENTS_TABLE }).promise()
          : Promise.resolve({ Items: [], Count: 0 })
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

    return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
  } catch (error) {
    console.error("[bms] Error:", error.message, error.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
