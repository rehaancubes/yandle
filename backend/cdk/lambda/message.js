const AWS = require("aws-sdk");
const crypto = require("crypto");

const ddb = new AWS.DynamoDB.DocumentClient();
const bedrock = new AWS.BedrockRuntime({
  region: process.env.BEDROCK_REGION || process.env.AWS_REGION
});

// ─── Business-type system prompts ────────────────────────────────────────────

const USE_CASE_STEPS = {
  gaming_cafe: `This is a GAMING CAFE. Before creating any booking you MUST collect all of the following in a natural conversation:
1. Customer full name
2. Customer phone number
3. Which gaming center (use the centers list from the knowledge base if available)
4. Machine / console type (e.g. PS5, Xbox, PC — use machine types from the knowledge base if available)
5. Preferred date and start time
6. Duration in hours

Once you have all 5 pieces of info, read them back clearly:
"I have you down as [name], phone [digits], at [center] on [date] at [time] for [duration] hours on [machine type]. Shall I confirm?"
Wait for their confirmation, then call create_booking.`,

  salon: `This is a SALON / HAIR STUDIO. Before creating any booking you MUST collect all of the following:
1. Customer full name
2. Customer phone number
3. Branch (if the salon has multiple branches — use the branches list from the knowledge base if available)
4. Service type (e.g. haircut, colour, beard trim, treatment, blow-dry — use the services list from the knowledge base if available)
5. Preferred date and time

Once you have everything, read it back:
"I have you down as [name], phone [digits], at [branch] for a [service] on [date] at [time]. Shall I confirm?"
Wait for their yes, then call create_booking with branchId and serviceId.`,

  clinic: `This is a MEDICAL CLINIC. Before creating any booking you MUST collect all of the following:
1. Patient full name
2. Patient phone number
3. Doctor / department preference (use the doctors list from the knowledge base if available)
4. Reason for visit / symptoms (brief)
5. Preferred date and time

Once you have everything, read it back:
"I have you down as [name], phone [digits], with [doctor/dept] on [date] at [time] regarding [reason]. Shall I confirm?"
Wait for their yes, then call create_booking.`,

};

// ─── Tool definition ──────────────────────────────────────────────────────────

const BOOKING_TOOL = {
  toolSpec: {
    name: "create_booking",
    description: "Create a confirmed reservation in the system after all required information has been collected and the customer has verbally confirmed.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          customerName: { type: "string", description: "Full name of the customer / patient" },
          phone: { type: "string", description: "Customer phone number" },
          startTime: { type: "string", description: "ISO 8601 datetime string for the booking start. IMPORTANT: Always use the CURRENT year from today's date provided in the system prompt." },
          durationMinutes: { type: "number", description: "Duration of the booking in minutes (default 60 if not applicable)" },
          notes: { type: "string", description: "Any additional details: service type, machine type, reason for visit, items, etc." },
          serviceId: { type: "string", description: "Service ID from knowledge base (optional)" },
          doctorId: { type: "string", description: "Doctor ID from knowledge base (optional)" },
          centerName: { type: "string", description: "Gaming center name (optional, for gaming_cafe)" },
          machineType: { type: "string", description: "Machine / console type (optional, for gaming_cafe)" },
          locationId: { type: "string", description: "Location / branch ID (optional)" }
        },
        required: ["customerName", "phone", "startTime"]
      }
    }
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractText(response) {
  try {
    const content = response?.output?.message?.content || response?.content || [];
    for (const block of content) {
      if (typeof block.text === "string" && block.text.trim()) return block.text.trim();
    }
  } catch (_) {}
  return "";
}

function extractToolUse(response) {
  try {
    const content = response?.output?.message?.content || response?.content || [];
    for (const block of content) {
      if (block.toolUse && block.toolUse.name) {
        return {
          name: block.toolUse.name,
          toolUseId: block.toolUse.toolUseId,
          input: block.toolUse.input || {}
        };
      }
    }
  } catch (_) {}
  return null;
}

function getAssistantContent(response) {
  try {
    return response?.output?.message?.content || response?.content || [];
  } catch (_) {
    return [];
  }
}

async function invokeNova({ systemPrompt, messages, useTools }) {
  const body = {
    schemaVersion: "messages-v1",
    system: [{ text: systemPrompt }],
    messages,
    inferenceConfig: {
      maxTokens: 400,
      temperature: 0.3,
      topP: 0.9
    }
  };

  if (useTools) {
    body.toolConfig = {
      tools: [BOOKING_TOOL],
      toolChoice: { auto: {} }
    };
  }

  const response = await bedrock
    .invokeModel({
      modelId: process.env.TEXT_MODEL_ID || "amazon.nova-lite-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(body)
    })
    .promise();

  return JSON.parse(Buffer.from(response.body).toString("utf-8"));
}

async function createBooking(handle, input, consumerEmail) {
  const bookingId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Parse startTime — if it's missing or invalid, default to 1 hour from now
  let startTime;
  try {
    startTime = input.startTime ? new Date(input.startTime).toISOString() : new Date(Date.now() + 3600000).toISOString();
  } catch (_) {
    startTime = new Date(Date.now() + 3600000).toISOString();
  }

  const durationMinutes = Number(input.durationMinutes) || 60;
  const endTime = new Date(new Date(startTime).getTime() + durationMinutes * 60000).toISOString();

  const item = {
    bookingId,
    handle,
    status: "BOOKED",
    name: input.customerName || "Unknown",
    customerName: input.customerName || "Unknown",
    phone: input.phone || "",
    startTime,
    endTime,
    durationMinutes,
    notes: input.notes || "",
    source: "chat",
    createdAt: now,
    updatedAt: now
  };

  // Add optional fields
  if (input.serviceId) item.serviceId = input.serviceId;
  if (input.doctorId) item.doctorId = input.doctorId;
  if (input.centerName) item.centerName = input.centerName;
  if (input.machineType) item.machineType = input.machineType;
  if (input.locationId) item.locationId = input.locationId;

  // Consumer email — required for BookingsEmailIndex so it appears in /my-bookings
  if (consumerEmail) {
    item.email = consumerEmail;
  }

  await ddb
    .put({
      TableName: process.env.BOOKINGS_TABLE,
      Item: item
    })
    .promise();

  return item;
}

function buildSystemPrompt(persona, handle, knowledgeSummary, displayName, useCase) {
  const today = new Date().toISOString().slice(0, 10);
  const useCaseGuidance = USE_CASE_STEPS[useCase] || `Collect the customer's full name and phone number before creating any booking. Read back the details and wait for confirmation, then call create_booking.`;

  const knowledgeBlock = knowledgeSummary && String(knowledgeSummary).trim()
    ? `\n--- Knowledge base for ${displayName || handle} ---\n${String(knowledgeSummary).trim()}\n---\n`
    : "";

  return [
    `You are the VOXA AI assistant for ${displayName || handle}.`,
    `Persona: ${persona || "VOXA assistant"}.`,
    `Today's date is ${today}.`,
    "",
    "General rules:",
    "- Be concise, warm, and action-oriented.",
    "- Answer only using the knowledge base below; do not invent services, prices, or staff.",
    "- Never ask whether the visitor already has an account — always help them directly.",
    "- Do NOT create a booking until you have confirmed all required details with the customer.",
    "",
    "Booking rules for this business:",
    useCaseGuidance,
    knowledgeBlock
  ].filter(Boolean).join("\n");
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { sessionId, message } = body;

    if (!sessionId || !message) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "sessionId and message are required" })
      };
    }

    const now = new Date().toISOString();
    const userMessageId = crypto.randomUUID();
    const agentMessageId = crypto.randomUUID();
    const sessionPk = `SESSION#${sessionId}`;

    // Load session meta
    const sessionMetaResult = await ddb
      .get({
        TableName: process.env.CONVERSATIONS_TABLE,
        Key: { pk: sessionPk, sk: "META" }
      })
      .promise();

    if (!sessionMetaResult.Item) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Session not found" })
      };
    }

    const handle = sessionMetaResult.Item.handle || "";
    const consumerEmail = sessionMetaResult.Item.consumerEmail || null;
    let persona = sessionMetaResult.Item.persona || "VOXA assistant";
    let knowledgeSummary = "";
    let displayName = handle;
    let useCase = "";

    // Load handle profile
    if (handle && process.env.HANDLES_TABLE) {
      try {
        const profileResult = await ddb
          .get({ TableName: process.env.HANDLES_TABLE, Key: { handle } })
          .promise();
        if (profileResult.Item) {
          if (profileResult.Item.persona) persona = profileResult.Item.persona;
          if (profileResult.Item.knowledgeSummary) knowledgeSummary = profileResult.Item.knowledgeSummary;
          if (profileResult.Item.displayName) displayName = profileResult.Item.displayName;
          if (profileResult.Item.useCase) useCase = profileResult.Item.useCase;
        }
      } catch (e) {
        console.warn("Could not load handle profile:", e.message);
      }
    }

    // Load conversation history (last 10 turns)
    const historyResult = await ddb
      .query({
        TableName: process.env.CONVERSATIONS_TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :msg)",
        ExpressionAttributeValues: { ":pk": sessionPk, ":msg": "MSG#" },
        ScanIndexForward: false,
        Limit: 10
      })
      .promise();

    const historyItems = (historyResult.Items || []).reverse();

    // Build messages array for Nova (proper alternating user/assistant format)
    const messages = [];
    for (const item of historyItems) {
      if (item.role === "user" || item.role === "assistant") {
        messages.push({
          role: item.role,
          content: [{ text: item.content }]
        });
      }
    }
    // Add current user message
    messages.push({ role: "user", content: [{ text: message }] });

    const systemPrompt = buildSystemPrompt(persona, handle, knowledgeSummary, displayName, useCase);

    let agentReply = "";
    let bookingCreated = null;

    try {
      // First call — with tools enabled
      const firstResp = await invokeNova({ systemPrompt, messages, useTools: true });
      const toolUse = extractToolUse(firstResp);

      if (toolUse && toolUse.name === "create_booking" && process.env.BOOKINGS_TABLE) {
        // Create the actual booking
        try {
          bookingCreated = await createBooking(handle, toolUse.input, consumerEmail);
        } catch (bookingErr) {
          console.error("Booking creation failed:", bookingErr.message);
        }

        // Build tool result message
        const assistantContent = getAssistantContent(firstResp);
        const toolResultContent = bookingCreated
          ? [{ json: { success: true, bookingId: bookingCreated.bookingId, startTime: bookingCreated.startTime, message: "Booking created successfully." } }]
          : [{ json: { success: false, message: "Booking could not be saved at this time, but verbally confirm to the customer anyway." } }];

        const messagesWithTool = [
          ...messages,
          { role: "assistant", content: assistantContent },
          {
            role: "user",
            content: [{
              toolResult: {
                toolUseId: toolUse.toolUseId,
                content: toolResultContent
              }
            }]
          }
        ];

        // Second call — get the confirmation message text
        const confirmResp = await invokeNova({ systemPrompt, messages: messagesWithTool, useTools: false });
        agentReply = extractText(confirmResp);
      } else {
        agentReply = extractText(firstResp);
      }
    } catch (modelError) {
      console.error("Bedrock invoke failed:", modelError.message);
      agentReply = "I'm having trouble connecting right now. Please try again in a moment.";
    }

    if (!agentReply) {
      agentReply = "I'm not sure how to help with that. Could you rephrase?";
    }

    // Persist user message
    await ddb
      .put({
        TableName: process.env.CONVERSATIONS_TABLE,
        Item: {
          pk: sessionPk,
          sk: `MSG#${now}#${userMessageId}`,
          handle,
          role: "user",
          content: message,
          createdAt: now
        }
      })
      .promise();

    // Persist assistant reply
    await ddb
      .put({
        TableName: process.env.CONVERSATIONS_TABLE,
        Item: {
          pk: sessionPk,
          sk: `MSG#${now}#${agentMessageId}`,
          handle,
          role: "assistant",
          content: agentReply,
          createdAt: now
        }
      })
      .promise();

    // Update session meta
    await ddb
      .update({
        TableName: process.env.CONVERSATIONS_TABLE,
        Key: { pk: sessionPk, sk: "META" },
        UpdateExpression: "SET updatedAt = :u, lastMessagePreview = :m",
        ExpressionAttributeValues: {
          ":u": now,
          ":m": String(message).slice(0, 200)
        }
      })
      .promise();

    // Deduct 1 credit for text message
    if (process.env.CREDITS_TABLE && handle) {
      try {
        await ddb.update({
          TableName: process.env.CREDITS_TABLE,
          Key: { handle },
          UpdateExpression: "SET credits = credits - :amt, totalCreditsUsed = totalCreditsUsed + :amt, updatedAt = :now",
          ConditionExpression: "attribute_exists(handle) AND credits >= :amt",
          ExpressionAttributeValues: { ":amt": 1, ":now": now }
        }).promise();
      } catch (e) {
        if (e.code !== "ConditionalCheckFailedException") console.warn("[message] credit deduction failed:", e.message);
      }
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        reply: agentReply,
        createdAt: now,
        ...(bookingCreated ? { bookingId: bookingCreated.bookingId } : {})
      })
    };
  } catch (error) {
    console.error("[message] Error:", error.message, error.stack);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Internal server error", details: error.message })
    };
  }
};
