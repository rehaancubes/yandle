const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();
const { getCallerFromEvent } = require("./auth-helper");

function normalizeHandle(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

function parseBody(event) {
  const raw = event.body;
  if (raw == null || raw === "") return {};
  if (typeof raw === "object") return raw;
  const str = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
  try {
    return typeof str === "string" ? JSON.parse(str) : {};
  } catch (e) {
    throw new Error(`Invalid JSON body: ${e.message}`);
  }
}

exports.handler = async (event) => {
  try {
    if (!process.env.HANDLES_TABLE) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Server misconfigured", details: "HANDLES_TABLE is not set" })
      };
    }
    const body = parseBody(event);
    const handle = normalizeHandle(body.handle);

    if (!handle) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "handle is required" })
      };
    }

    const { sub: callerSub, email: callerEmailRaw } = getCallerFromEvent(event);
    const callerEmail = (callerEmailRaw || "").toLowerCase();
    if (!callerSub) {
      return {
        statusCode: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" })
      };
    }

    const existing = await ddb
      .get({
        TableName: process.env.HANDLES_TABLE,
        Key: { handle }
      })
      .promise();

    const now = new Date().toISOString();
    const ownerId = existing.Item?.ownerId || callerSub;
    const existingOwnerId = existing.Item?.ownerId;
    const existingOwnerEmail = (existing.Item?.ownerEmail || "").toString().trim().toLowerCase();
    const isOwnerBySub = existingOwnerId && existingOwnerId === callerSub;
    const isOwnerByEmail = callerEmail && existingOwnerEmail && existingOwnerEmail === callerEmail;
    if (existing.Item && existingOwnerId && !isOwnerBySub && !isOwnerByEmail) {
      return {
        statusCode: 403,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "You don't have access to this handle. Sign in with the account that owns it, or ask the owner to add you as a manager." })
      };
    }

    // Enforce one business per email: on CREATE, check if this email already owns another handle
    if (!existing.Item && callerEmail && process.env.HANDLES_TABLE && process.env.HANDLES_OWNER_EMAIL_INDEX) {
      const emailCheck = await ddb.query({
        TableName: process.env.HANDLES_TABLE,
        IndexName: process.env.HANDLES_OWNER_EMAIL_INDEX,
        KeyConditionExpression: "ownerEmail = :e",
        ExpressionAttributeValues: { ":e": callerEmail },
        Limit: 1
      }).promise();
      if (emailCheck.Items && emailCheck.Items.length > 0) {
        return {
          statusCode: 409,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: `This email (${callerEmail}) already owns @${emailCheck.Items[0].handle}. Only one business per email is allowed.` })
        };
      }
      // Also check if this email is already a member of another handle
      if (process.env.MEMBERS_TABLE && process.env.MEMBERS_EMAIL_INDEX) {
        const memberCheck = await ddb.query({
          TableName: process.env.MEMBERS_TABLE,
          IndexName: process.env.MEMBERS_EMAIL_INDEX,
          KeyConditionExpression: "email = :e",
          ExpressionAttributeValues: { ":e": callerEmail },
          Limit: 1
        }).promise();
        if (memberCheck.Items && memberCheck.Items.length > 0) {
          return {
            statusCode: 409,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ error: `This email is already a member of @${memberCheck.Items[0].handle}. Only one business per email is allowed.` })
          };
        }
      }
    }
    const item = {
      handle,
      displayName: body.displayName || handle,
      voiceEnabled: body.voiceEnabled !== false,
      textEnabled: body.textEnabled !== false,
      voiceId: typeof body.voiceId === "string" && body.voiceId.trim() ? body.voiceId.trim() : (existing.Item?.voiceId || "tiffany"),
      persona: body.persona || "YANDLE assistant",
      knowledgeSummary: body.knowledgeSummary || "",
      knowledgeBaseCustomText: body.knowledgeBaseCustomText != null ? String(body.knowledgeBaseCustomText) : (existing.Item?.knowledgeBaseCustomText ?? ""),
      // Optional business metadata for discovery + smart links
      businessName: body.businessName || existing.Item?.businessName,
      category: body.category || existing.Item?.category,
      address: body.address || existing.Item?.address,
      city: body.city || existing.Item?.city,
      // phoneNumber is READ-ONLY here — managed exclusively via /phone-numbers/assign and /phone-numbers/release
      phoneNumber: existing.Item?.phoneNumber || undefined,
      geoLat: typeof body.geoLat === "number" ? body.geoLat : existing.Item?.geoLat,
      geoLng: typeof body.geoLng === "number" ? body.geoLng : existing.Item?.geoLng,
      realtimeAvailability: body.realtimeAvailability || existing.Item?.realtimeAvailability || {},
      services: Array.isArray(body.services) ? body.services : existing.Item?.services,
      tags: Array.isArray(body.tags) ? body.tags : existing.Item?.tags,
      hasAiPhone: body.hasAiPhone ?? existing.Item?.hasAiPhone ?? false,
      hasWidget: body.hasWidget ?? existing.Item?.hasWidget ?? true,
      planTier: body.planTier || existing.Item?.planTier || "LISTING",
      captureEmail: body.captureEmail ?? existing.Item?.captureEmail ?? false,
      capturePhone: body.capturePhone ?? existing.Item?.capturePhone ?? true,
      websiteEnabled: body.websiteEnabled ?? existing.Item?.websiteEnabled ?? true,
      useCaseId: body.useCaseId || existing.Item?.useCaseId,
      knowledgeBaseId: typeof body.knowledgeBaseId === "string" ? body.knowledgeBaseId.trim() : (existing.Item?.knowledgeBaseId || ""),
      ownerId,
      ownerEmail: callerEmail || existing.Item?.ownerEmail || undefined,
      updatedAt: now,
      createdAt: existing.Item?.createdAt || body.createdAt || now
    };

    await ddb
      .put({
        TableName: process.env.HANDLES_TABLE,
        Item: item
      })
      .promise();

    // Initialize credits for new handles or backfill for existing handles missing a credits record
    if (process.env.CREDITS_TABLE) {
      try {
        await ddb.put({
          TableName: process.env.CREDITS_TABLE,
          Item: {
            handle,
            credits: 1000,
            totalCreditsUsed: 0,
            planType: "free",
            createdAt: now,
            updatedAt: now
          },
          ConditionExpression: "attribute_not_exists(handle)"
        }).promise();
      } catch (e) {
        if (e.code !== "ConditionalCheckFailedException") console.warn("[handle-upsert] credits init failed:", e.message);
      }
    }

    const syncArn = process.env.SYNC_KNOWLEDGE_FUNCTION_ARN;
    const createKbArn = process.env.CREATE_KNOWLEDGE_BASE_FUNCTION_ARN;
    if (!item.knowledgeBaseId && createKbArn) {
      lambda.invoke({ FunctionName: createKbArn, InvocationType: "Event", Payload: JSON.stringify({ handle }) }).promise().catch((e) => console.error("[handle-upsert] create-knowledge-base invoke error", e));
    } else if (syncArn) {
      lambda.invoke({ FunctionName: syncArn, InvocationType: "Event", Payload: JSON.stringify({ handle }) }).promise().catch((e) => console.error("[handle-upsert] sync-knowledge invoke error", e));
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, handle, profile: item })
    };
  } catch (error) {
    const details = error.message || String(error);
    const code = error.code || undefined;
    console.error("[handle-upsert] Error:", details, "code:", code, "stack:", error.stack);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        details,
        code
      })
    };
  }
};
