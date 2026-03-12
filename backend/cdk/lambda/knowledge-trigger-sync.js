/**
 * POST /knowledge/sync — Trigger sync-knowledge for the current handle and return the result.
 * Call this after saving custom text (or any KB data) so the voice agent gets updated.
 */
const AWS = require("aws-sdk");
const lambda = new AWS.Lambda();
const ddb = new AWS.DynamoDB.DocumentClient();

const HANDLES_TABLE = process.env.HANDLES_TABLE;
const SYNC_KNOWLEDGE_FUNCTION_ARN = process.env.SYNC_KNOWLEDGE_FUNCTION_ARN;
const CREATE_KNOWLEDGE_BASE_FUNCTION_ARN = process.env.CREATE_KNOWLEDGE_BASE_FUNCTION_ARN;

function normalizeHandle(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

exports.handler = async (event) => {
  try {
    const sub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!sub) {
      return {
        statusCode: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }
    if (!SYNC_KNOWLEDGE_FUNCTION_ARN) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Sync not configured" }),
      };
    }
    const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : event.body || {};
    const handle = normalizeHandle(body.handle || event.queryStringParameters?.handle);
    if (!handle) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "handle is required" }),
      };
    }
    const getRes = await ddb.get({ TableName: HANDLES_TABLE, Key: { handle } }).promise();
    const item = getRes.Item;
    if (!item || item.ownerId !== sub) {
      return {
        statusCode: 403,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "You do not own this handle." }),
      };
    }
    const needsCreateOrRepair = !item.knowledgeBaseId || !item.dataSourceId;
    if (needsCreateOrRepair && CREATE_KNOWLEDGE_BASE_FUNCTION_ARN) {
      console.log("[knowledge-trigger-sync] KB or data source missing for handle:", handle, "invoking create-knowledge-base (create or repair)");
      try {
        const createResult = await lambda
          .invoke({
            FunctionName: CREATE_KNOWLEDGE_BASE_FUNCTION_ARN,
            InvocationType: "RequestResponse",
            Payload: JSON.stringify({ handle }),
          })
          .promise();
        const createPayload = createResult.Payload;
        let createBody = {};
        try {
          const parsed = typeof createPayload === "string" ? JSON.parse(createPayload) : createPayload;
          createBody = typeof parsed.body === "string" ? JSON.parse(parsed.body) : parsed.body || parsed;
        } catch {
          createBody = {};
        }
        if (createResult.FunctionError || createBody.error) {
          const errMsg = createBody.error || createBody.details || (typeof createPayload === "string" ? createPayload : "Unknown error");
          console.error("[knowledge-trigger-sync] create-knowledge-base failed:", errMsg);
          return {
            statusCode: 502,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ error: "Knowledge base creation failed", details: errMsg }),
          };
        }
        if (createBody.ok) {
          console.log("[knowledge-trigger-sync] KB created for handle:", handle, "sync triggered by create-knowledge-base");
          return {
            statusCode: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ok: true,
              message: "Knowledge base created and sync started. Voice agent may take 2–5 minutes to reflect changes.",
              handle,
            }),
          };
        }
      } catch (e) {
        console.error("[knowledge-trigger-sync] create-knowledge-base invoke error:", e);
        return {
          statusCode: 502,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "Failed to create knowledge base", details: e.message }),
        };
      }
    }

    console.log("[knowledge-trigger-sync] Invoking sync for handle:", handle, "handle has knowledgeBaseId:", !!item.knowledgeBaseId, "dataSourceId:", !!item.dataSourceId);
    const invokeResult = await lambda
      .invoke({
        FunctionName: SYNC_KNOWLEDGE_FUNCTION_ARN,
        InvocationType: "RequestResponse",
        Payload: JSON.stringify({ handle }),
      })
      .promise();

    const rawPayload = invokeResult.Payload;
    if (invokeResult.FunctionError) {
      console.error("[knowledge-trigger-sync] Sync Lambda error:", invokeResult.FunctionError, rawPayload);
      return {
        statusCode: 502,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: "Sync failed",
          details: typeof rawPayload === "string" ? rawPayload : "Unknown error",
        }),
      };
    }
    let result;
    try {
      result = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
    } catch {
      result = { ok: false, message: "Invalid sync response" };
    }
    const skipped = result.message && String(result.message).toLowerCase().includes("no knowledge base");
    const ok = result.ok && !skipped;
    if (skipped) {
      console.warn("[knowledge-trigger-sync] Sync skipped for handle:", handle, "message:", result.message);
    } else if (!result.ok) {
      console.warn("[knowledge-trigger-sync] Sync returned not ok for handle:", handle, "result:", JSON.stringify(result));
    }
    const statusCode = ok ? 200 : 400;
    return {
      statusCode,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok,
        message: result.message || (ok ? "Sync started." : "Sync skipped or failed."),
        ingestionJobId: result.ingestionJobId,
        handle: result.handle,
      }),
    };
  } catch (e) {
    console.error("[knowledge-trigger-sync]", e);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: "Failed to trigger sync",
        details: e.message,
      }),
    };
  }
};
