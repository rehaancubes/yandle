const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

function parseBody(event) {
  const raw = event.body;
  if (raw == null || raw === "") return {};
  if (typeof raw === "object") return raw;
  const str = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
  try {
    return typeof str === "string" ? JSON.parse(str) : {};
  } catch (e) {
    throw new Error("Invalid JSON body: " + e.message);
  }
}

exports.handler = async (event) => {
  try {
    const PHONE_TABLE = process.env.PHONE_NUMBERS_TABLE;
    const HANDLES_TABLE = process.env.HANDLES_TABLE;
    const CREDITS_TABLE = process.env.CREDITS_TABLE;
    if (!PHONE_TABLE) {
      return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "PHONE_NUMBERS_TABLE not set" }) };
    }

    const path = event.requestContext?.http?.path || "";

    // GET /public/resolve-did/{did} — resolve DID to handle (no auth)
    if (path.includes("/resolve-did/")) {
      const did = path.split("/resolve-did/")[1];
      if (!did) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "DID required" }) };
      }

      // Try multiple formats
      const cleaned = did.replace(/\D/g, "");
      const candidates = [cleaned, "+" + cleaned];
      if (cleaned.length === 10) { candidates.push("91" + cleaned, "+91" + cleaned); }
      if (cleaned.startsWith("91") && cleaned.length === 12) { candidates.push("+" + cleaned); }

      for (const phoneKey of [...new Set(candidates)]) {
        const result = await ddb.get({ TableName: PHONE_TABLE, Key: { phoneNumber: phoneKey } }).promise();
        if (result.Item && result.Item.handle && result.Item.status === "assigned") {
          return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: result.Item.handle }) };
        }
      }

      return { statusCode: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "DID not found" }) };
    }

    // GET /phone-numbers/available — list available DIDs
    if (path.includes("/available")) {
      const result = await ddb.scan({
        TableName: PHONE_TABLE,
        FilterExpression: "#s = :avail",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":avail": "available" }
      }).promise();

      const numbers = (result.Items || []).map(item => ({
        phoneNumber: item.phoneNumber,
        monthlyPrice: item.monthlyPrice || 500
      }));

      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ numbers }) };
    }

    // POST /phone-numbers/assign — assign a DID to a business handle
    if (path.includes("/assign")) {
      const body = parseBody(event);
      const { handle, phoneNumber } = body;
      if (!handle || !phoneNumber) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle and phoneNumber required" }) };
      }

      const now = new Date().toISOString();

      // Atomically assign the phone number (only if currently available)
      try {
        await ddb.update({
          TableName: PHONE_TABLE,
          Key: { phoneNumber },
          UpdateExpression: "SET handle = :h, #s = :assigned, assignedAt = :now",
          ConditionExpression: "#s = :avail",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":h": handle, ":assigned": "assigned", ":avail": "available", ":now": now }
        }).promise();
      } catch (e) {
        if (e.code === "ConditionalCheckFailedException") {
          return { statusCode: 409, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Phone number is no longer available" }) };
        }
        throw e;
      }

      // Update HandlesTable with phone number
      if (HANDLES_TABLE) {
        await ddb.update({
          TableName: HANDLES_TABLE,
          Key: { handle },
          UpdateExpression: "SET phoneNumber = :pn, hasAiPhone = :t, updatedAt = :now",
          ExpressionAttributeValues: { ":pn": phoneNumber, ":t": true, ":now": now }
        }).promise();
      }

      // Initialize credits (1000 free credits with phone plan)
      if (CREDITS_TABLE) {
        try {
          await ddb.put({
            TableName: CREDITS_TABLE,
            Item: {
              handle,
              credits: 1000,
              totalCreditsUsed: 0,
              planType: "phone_500",
              phoneNumber,
              monthlyRenewalDate: now,
              createdAt: now,
              updatedAt: now
            },
            ConditionExpression: "attribute_not_exists(handle)"
          }).promise();
        } catch (e) {
          if (e.code !== "ConditionalCheckFailedException") throw e;
          // Already exists — just update
          await ddb.update({
            TableName: CREDITS_TABLE,
            Key: { handle },
            UpdateExpression: "SET phoneNumber = :pn, planType = :pt, updatedAt = :now",
            ExpressionAttributeValues: { ":pn": phoneNumber, ":pt": "phone_500", ":now": now }
          }).promise();
        }
      }

      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true, phoneNumber, credits: 1000 }) };
    }

    // POST /phone-numbers/release — release a DID from a business handle
    if (path.includes("/release")) {
      const body = parseBody(event);
      const { handle, phoneNumber } = body;
      if (!handle || !phoneNumber) {
        return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle and phoneNumber required" }) };
      }

      const now = new Date().toISOString();

      await ddb.update({
        TableName: PHONE_TABLE,
        Key: { phoneNumber },
        UpdateExpression: "REMOVE handle, assignedAt SET #s = :avail",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":avail": "available" }
      }).promise();

      if (HANDLES_TABLE) {
        await ddb.update({
          TableName: HANDLES_TABLE,
          Key: { handle },
          UpdateExpression: "REMOVE phoneNumber SET hasAiPhone = :f, updatedAt = :now",
          ExpressionAttributeValues: { ":f": false, ":now": now }
        }).promise();
      }

      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (error) {
    console.error("[phone-numbers] Error:", error.message, error.stack);
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Internal server error", details: error.message }) };
  }
};
