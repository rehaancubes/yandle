/**
 * Accepts an image (base64), extracts text via AWS Textract, appends to the handle's
 * knowledgeBaseCustomText, and triggers sync-knowledge.
 */
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();
const textract = new AWS.Textract();
const lambda = new AWS.Lambda();

const HANDLES_TABLE = process.env.HANDLES_TABLE;
const SYNC_KNOWLEDGE_FUNCTION_ARN = process.env.SYNC_KNOWLEDGE_FUNCTION_ARN;

function normalizeHandle(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

function extractTextFromTextractResult(data) {
  if (!data || !data.Blocks) return "";
  const lines = (data.Blocks || [])
    .filter((b) => b.BlockType === "LINE")
    .map((b) => (b.Text || "").trim())
    .filter(Boolean);
  return lines.join("\n");
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
    if (!HANDLES_TABLE) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Server misconfigured" }),
      };
    }

    const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : event.body || {};
    const handle = normalizeHandle(body.handle);
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

    const imageBase64 = body.imageBase64 || body.image;
    if (!imageBase64) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "imageBase64 is required (base64-encoded image)" }),
      };
    }

    const buf = Buffer.from(imageBase64, "base64");
    if (buf.length > 5 * 1024 * 1024) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Image too large (max 5MB)" }),
      };
    }

    const textractResult = await textract.detectDocumentText({ Document: { Bytes: buf } }).promise();
    const extractedText = extractTextFromTextractResult(textractResult);
    if (!extractedText.trim()) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ok: true,
          extractedText: "",
          message: "No text detected in the image.",
        }),
      };
    }

    const existingCustom = item.knowledgeBaseCustomText || "";
    const separator = existingCustom ? "\n\n--- Extracted from image ---\n\n" : "";
    const newCustomText = existingCustom + separator + extractedText;

    await ddb
      .update({
        TableName: HANDLES_TABLE,
        Key: { handle },
        UpdateExpression: "SET knowledgeBaseCustomText = :t, updatedAt = :now",
        ExpressionAttributeValues: { ":t": newCustomText, ":now": new Date().toISOString() },
      })
      .promise();

    if (SYNC_KNOWLEDGE_FUNCTION_ARN) {
      await lambda
        .invoke({
          FunctionName: SYNC_KNOWLEDGE_FUNCTION_ARN,
          InvocationType: "Event",
          Payload: JSON.stringify({ handle }),
        })
        .promise()
        .catch((e) => console.error("[knowledge-ingest-image] sync invoke error", e));
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        extractedText,
        message: "Text extracted and added to knowledge base. Sync started.",
      }),
    };
  } catch (e) {
    console.error("[knowledge-ingest-image]", e);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: "Failed to process image",
        details: e.message,
      }),
    };
  }
};
