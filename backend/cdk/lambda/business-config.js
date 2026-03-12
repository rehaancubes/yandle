const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

function triggerSync(handle) {
  const arn = process.env.SYNC_KNOWLEDGE_FUNCTION_ARN;
  if (!arn) return;
  lambda.invoke({ FunctionName: arn, InvocationType: "Event", Payload: JSON.stringify({ handle }) }).promise().catch((e) => console.error("[business-config] sync invoke", e));
}

const SLOT_CONFIG_TYPE = "SLOT_CONFIG";

function normalizeHandle(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

const { assertAccess } = require('./auth-helper');

function json(body, status = 200) {
  return {
    statusCode: status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

exports.handler = async (event) => {
  try {
    const sub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
    const email = (event?.requestContext?.authorizer?.jwt?.claims?.email || "").toLowerCase();
    if (!sub) {
      return err("Unauthorized", 401);
    }
    if (!process.env.BUSINESS_CONFIG_TABLE) {
      return err("Server misconfigured", 500);
    }

    const method = event.requestContext?.http?.method || event.httpMethod;
    const handle = normalizeHandle(
      event.queryStringParameters?.handle ||
      event.pathParameters?.handle ||
      (event.body ? JSON.parse(event.body || "{}").handle : null)
    );
    if (!handle) {
      return err("handle is required");
    }
    await assertAccess(handle, sub, email);

    if (method === "GET") {
      const result = await ddb.get({
        TableName: process.env.BUSINESS_CONFIG_TABLE,
        Key: { handle, configType: SLOT_CONFIG_TYPE }
      }).promise();
      const item = result.Item || {};

      // Per-business-type defaults when no config exists
      let defaultGranularity = 15;
      if (!item.slotGranularityMinutes && process.env.HANDLES_TABLE) {
        try {
          const profileRes = await ddb.get({ TableName: process.env.HANDLES_TABLE, Key: { handle } }).promise();
          const useCase = profileRes.Item?.useCaseId;
          if (useCase === 'gaming_cafe') defaultGranularity = 60;
          else if (useCase === 'retail_shop') defaultGranularity = 30;
        } catch (_) {}
      }

      return json({
        handle,
        slotGranularityMinutes: item.slotGranularityMinutes ?? defaultGranularity,
        bufferBetweenMinutes: item.bufferBetweenMinutes ?? 0
      });
    }

    if (method === "POST") {
      const body = event.body ? JSON.parse(event.body) : {};
      const slotGranularityMinutes = body.slotGranularityMinutes != null
        ? Math.max(1, Math.min(120, Number(body.slotGranularityMinutes)))
        : undefined;
      const bufferBetweenMinutes = body.bufferBetweenMinutes != null
        ? Math.max(0, Math.min(60, Number(body.bufferBetweenMinutes)))
        : undefined;
      const existing = await ddb.get({
        TableName: process.env.BUSINESS_CONFIG_TABLE,
        Key: { handle, configType: SLOT_CONFIG_TYPE }
      }).promise();
      const current = existing.Item || { handle, configType: SLOT_CONFIG_TYPE };
      const item = {
        ...current,
        slotGranularityMinutes: slotGranularityMinutes ?? current.slotGranularityMinutes ?? 15,
        bufferBetweenMinutes: bufferBetweenMinutes ?? current.bufferBetweenMinutes ?? 0,
        updatedAt: new Date().toISOString()
      };
      await ddb.put({
        TableName: process.env.BUSINESS_CONFIG_TABLE,
        Item: item
      }).promise();
      triggerSync(handle);
      return json({ ok: true, config: item });
    }

    return err("Method not allowed", 405);
  } catch (e) {
    if (e.message === "FORBIDDEN") {
      return err("You do not own this handle.", 403);
    }
    console.error("[business-config]", e);
    return err("Internal server error", 500);
  }
};
