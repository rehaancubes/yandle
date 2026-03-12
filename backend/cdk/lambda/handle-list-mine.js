/**
 * GET /handles — list handles owned by the current user AND handles where they are a manager.
 */
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const sub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
    const callerEmail = (event?.requestContext?.authorizer?.jwt?.claims?.email || "").toLowerCase();

    if (!sub) {
      return {
        statusCode: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" })
      };
    }

    if (!process.env.HANDLES_TABLE || !process.env.HANDLES_OWNER_INDEX) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Server misconfigured" })
      };
    }

    // Single handle lookup (used by dashboard to load a specific handle)
    const requestedHandle = (event.queryStringParameters?.handle || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (requestedHandle) {
      const getRes = await ddb.get({
        TableName: process.env.HANDLES_TABLE,
        Key: { handle: requestedHandle }
      }).promise();
      const item = getRes.Item;
      if (!item) {
        return { statusCode: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Handle not found or access denied." }) };
      }

      // Allow if owner OR if manager
      const isOwner = item.ownerId === sub;
      let isManager = false;
      if (!isOwner && callerEmail && process.env.MEMBERS_TABLE) {
        const memberRes = await ddb.get({ TableName: process.env.MEMBERS_TABLE, Key: { handle: requestedHandle, email: callerEmail } }).promise();
        isManager = !!memberRes.Item;
      }

      if (!isOwner && !isManager) {
        return { statusCode: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Handle not found or access denied." }) };
      }
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: item, isOwner, isManager })
      };
    }

    // List all handles the user owns
    const ownerResult = await ddb
      .query({
        TableName: process.env.HANDLES_TABLE,
        IndexName: process.env.HANDLES_OWNER_INDEX,
        KeyConditionExpression: "ownerId = :oid",
        ExpressionAttributeValues: { ":oid": sub }
      })
      .promise();

    const ownedHandles = (ownerResult.Items || []).map((item) => ({
      handle: item.handle,
      displayName: item.displayName,
      useCase: item.useCase,
      useCaseId: item.useCaseId,
      phoneNumber: item.phoneNumber,
      updatedAt: item.updatedAt,
      role: "owner"
    }));

    // Also list handles where the user is a manager (by email)
    let memberHandles = [];
    if (callerEmail && process.env.MEMBERS_TABLE && process.env.MEMBERS_EMAIL_INDEX) {
      const memberResult = await ddb
        .query({
          TableName: process.env.MEMBERS_TABLE,
          IndexName: process.env.MEMBERS_EMAIL_INDEX,
          KeyConditionExpression: "email = :e",
          ExpressionAttributeValues: { ":e": callerEmail }
        })
        .promise();

      // Fetch full handle details for each member entry
      const memberItems = memberResult.Items || [];
      const memberHandleDetails = await Promise.all(
        memberItems
          .filter((m) => !ownedHandles.find((h) => h.handle === m.handle)) // exclude already-owned
          .map(async (m) => {
            try {
              const res = await ddb.get({ TableName: process.env.HANDLES_TABLE, Key: { handle: m.handle } }).promise();
              if (!res.Item) return null;
              return {
                handle: res.Item.handle,
                displayName: res.Item.displayName,
                useCase: res.Item.useCase,
                useCaseId: res.Item.useCaseId,
                phoneNumber: res.Item.phoneNumber,
                updatedAt: res.Item.updatedAt,
                role: "manager"
              };
            } catch {
              return null;
            }
          })
      );
      memberHandles = memberHandleDetails.filter(Boolean);
    }

    const handles = [...ownedHandles, ...memberHandles];

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handles })
    };
  } catch (error) {
    console.error("[handle-list-mine] Error:", error.message);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", details: error.message })
    };
  }
};
