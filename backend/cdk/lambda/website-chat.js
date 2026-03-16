const AWS = require("aws-sdk");
const bedrock = new AWS.BedrockRuntime({
  region: process.env.BEDROCK_REGION || process.env.AWS_REGION
});

function parseBody(event) {
  const raw = event.body;
  if (raw == null || raw === "") return {};
  if (typeof raw === "object") return raw;
  const str = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
  return typeof str === "string" ? JSON.parse(str) : {};
}

exports.handler = async (event) => {
  try {
    const callerSub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!callerSub) {
      return { statusCode: 401, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    const body = parseBody(event);
    const { handle, message, currentConfig } = body;

    if (!handle || !message) {
      return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "handle and message are required" }) };
    }

    const systemPrompt = `You are a helpful website design assistant for the YANDLE business platform. The user is editing their business website configuration.

Current website configuration:
${JSON.stringify(currentConfig || {}, null, 2)}

Help the user update their website. When suggesting changes, respond with a JSON object at the END of your message wrapped in <config_update> tags containing ONLY the fields to update. Available fields:
- heroTagline: string (short tagline)
- aboutText: string (about section text)
- colorTheme: "indigo" | "emerald" | "rose" | "amber" | "cyan" | "violet"
- contactEmail: string

Example response format:
"Here's a more professional tagline for your business..."
<config_update>{"heroTagline": "Your new tagline here"}</config_update>

If the user is just asking a question (not requesting changes), respond normally without config_update tags.`;

    const response = await bedrock.invokeModel({
      modelId: "amazon.titan-text-lite-v1",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        inputText: `System: ${systemPrompt}\n\nUser: ${message}`,
        textGenerationConfig: {
          maxTokenCount: 500,
          temperature: 0.7,
          topP: 0.9
        }
      })
    }).promise();

    const result = JSON.parse(Buffer.from(response.body).toString("utf-8"));
    const outputText = result.results?.[0]?.outputText || result.outputText || "";

    // Extract config update if present
    let suggestedChanges = null;
    const configMatch = outputText.match(/<config_update>([\s\S]*?)<\/config_update>/);
    if (configMatch) {
      try {
        suggestedChanges = JSON.parse(configMatch[1].trim());
      } catch {}
    }

    // Clean response text (remove config tags)
    const cleanText = outputText.replace(/<config_update>[\s\S]*?<\/config_update>/, "").trim();

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reply: cleanText,
        suggestedChanges
      })
    };
  } catch (err) {
    console.error("[website-chat] Error:", err);
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: err.message }) };
  }
};
