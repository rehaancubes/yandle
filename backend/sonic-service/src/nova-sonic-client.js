/**
 * Nova Sonic bidirectional stream client (JS port of AWS sample logic).
 * Uses InvokeModelWithBidirectionalStream with HTTP/2; no RxJS.
 */
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";
import { randomUUID } from "node:crypto";

const MODEL_ID = "amazon.nova-2-sonic-v1:0";

const DEFAULT_AUDIO_INPUT = {
  audioType: "SPEECH",
  encoding: "base64",
  mediaType: "audio/lpcm",
  sampleRateHertz: 16000,
  sampleSizeBits: 16,
  channelCount: 1,
};

const DEFAULT_INFERENCE = {
  maxTokens: 2048,
  topP: 0.9,
  temperature: 0.3, // Lower for stability (0 = greedy; 0.3 reduces "System instability detected" risk)
};

// Booking tool input schemas (used in toolConfiguration)
const CREATE_BOOKING_SCHEMA = {
  type: "object",
  properties: {
    handle: {
      type: "string",
      description:
        "The VOXA handle (shareable link identifier) for this booking.",
    },
    centerName: {
      type: "string",
      description:
        "Name of the gaming center or location (gaming cafe).",
    },
    machineType: {
      type: "string",
      description:
        "Type of machine or rig being booked (gaming cafe).",
    },
    startTime: {
      type: "string",
      description:
        "Start time in ISO 8601 format, in Indian Standard Time IST (e.g. 2025-03-10T19:00:00+05:30 for 7pm IST). Convert caller phrases like 'today at 7pm' or 'tomorrow at 9am' to IST.",
    },
    durationMinutes: {
      type: "integer",
      description: "Duration in minutes; optional if serviceId is provided (duration from service).",
    },
    name: {
      type: "string",
      description: "Full name of the person making the booking.",
    },
    phone: {
      type: "string",
      description:
        "Mobile phone number; at least one of phone or email is required (per business settings).",
    },
    email: {
      type: "string",
      description:
        "Email address; at least one of phone or email is required (per business settings).",
    },
    serviceId: {
      type: "string",
      description: "Service ID (salon/clinic); duration can be taken from service if not provided.",
    },
    branchId: {
      type: "string",
      description: "Branch ID for salon bookings.",
    },
    doctorId: {
      type: "string",
      description: "Doctor ID for clinic bookings.",
    },
    locationId: {
      type: "string",
      description: "Location ID for clinic bookings.",
    },
    notes: {
      type: "string",
      description:
        "Optional notes about the booking or special requests.",
    },
  },
  required: ["handle", "startTime", "name"],
};

const GET_BOOKINGS_FOR_TIME_RANGE_SCHEMA = {
  type: "object",
  properties: {
    handle: {
      type: "string",
      description:
        "The VOXA handle (shareable link identifier) used to scope bookings to this business.",
    },
    centerName: {
      type: "string",
      description:
        "Gaming center name (gaming cafe). Use with machineType.",
    },
    machineType: {
      type: "string",
      description:
        "Machine type to check (gaming cafe). Use with centerName.",
    },
    branchId: {
      type: "string",
      description: "Branch ID to check availability for (salon).",
    },
    doctorId: {
      type: "string",
      description: "Doctor ID to check availability for (clinic).",
    },
    locationId: {
      type: "string",
      description: "Location ID to check availability for (clinic).",
    },
    fromTime: {
      type: "string",
      description:
        "Start of the time window (inclusive) in ISO 8601 format, in IST (e.g. 2025-03-10T00:00:00+05:30).",
    },
    toTime: {
      type: "string",
      description:
        "End of the time window (exclusive) in ISO 8601 format, in IST.",
    },
  },
  required: ["handle", "fromTime", "toTime"],
};

// Retail catalog lookup tool
const LOOKUP_CATALOG_ITEMS_SCHEMA = {
  type: "object",
  properties: {
    handle: { type: "string", description: "The VOXA business handle." },
    query: { type: "string", description: "Product name or category to search for. Leave empty to list all." },
    inStockOnly: { type: "boolean", description: "If true, only return in-stock items." }
  },
  required: ["handle"]
};

// Clinic queue token creation tool
const CREATE_CLINIC_TOKEN_SCHEMA = {
  type: "object",
  properties: {
    handle: { type: "string", description: "The VOXA business handle." },
    patientName: { type: "string", description: "Patient's full name." },
    phone: { type: "string", description: "Patient phone number." },
    email: { type: "string", description: "Patient email address." },
    doctorId: { type: "string", description: "Doctor ID to queue for, if specified by the patient." }
  },
  required: ["handle"]
};

// Bedrock Knowledge Base tool (from AWS sample pattern)
const KNOWLEDGE_BASE_TOOL_SCHEMA = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "The user question or search query to look up in the business knowledge base (policies, FAQs, services, etc.).",
    },
    numberOfResults: {
      type: "integer",
      description: "Optional max number of results to return (default 5, max 25).",
    },
  },
  required: ["query"],
};

function createQueue() {
  let resolve = null;
  let closed = false;
  const queue = [];
  const wait = () =>
    new Promise((res) => {
      resolve = res;
    });
  const wake = () => {
    if (resolve) {
      const r = resolve;
      resolve = null;
      r();
    }
  };
  return {
    push(item) {
      if (closed) return;
      queue.push(item);
      wake();
    },
    shift: () => queue.shift(),
    get length() {
      return queue.length;
    },
    wait,
    close() {
      closed = true;
      wake();
    },
    get closed() {
      return closed;
    },
  };
}

export class StreamSession {
  constructor(sessionId, client) {
    this.sessionId = sessionId;
    this.client = client;
    this.isActive = true;
    this.audioBufferQueue = [];
    this.maxQueueSize = 200;
    this.isProcessingAudio = false;
  }

  onEvent(eventType, handler) {
    this.client.registerEventHandler(this.sessionId, eventType, handler);
    return this;
  }

  async setupSessionAndPromptStart(voiceId = "tiffany", outputSampleRate = 24000) {
    this.voiceId = voiceId;
    this.outputSampleRate = outputSampleRate;
    this.client.setupSessionStartEvent(this.sessionId);
    this.client.setupPromptStartEvent(this.sessionId, voiceId, outputSampleRate);
  }

  async setupSystemPrompt(systemPromptContent, voiceId) {
    if (voiceId) this.voiceId = voiceId;
    this.client.setupSystemPromptEvent(this.sessionId, systemPromptContent);
  }

  async setupStartAudio(audioConfig = DEFAULT_AUDIO_INPUT) {
    this.client.setupStartAudioEvent(this.sessionId, audioConfig);
  }

  async streamAudio(audioData) {
    if (this.audioBufferQueue.length >= this.maxQueueSize) {
      this.audioBufferQueue.shift();
    }
    this.audioBufferQueue.push(audioData);
    this.processAudioQueue();
  }

  async processAudioQueue() {
    if (this.isProcessingAudio || this.audioBufferQueue.length === 0 || !this.isActive) return;
    this.isProcessingAudio = true;
    try {
      let processed = 0;
      const maxChunks = 5;
      while (
        this.audioBufferQueue.length > 0 &&
        processed < maxChunks &&
        this.isActive
      ) {
        const chunk = this.audioBufferQueue.shift();
        if (chunk) {
          await this.client.streamAudioChunk(this.sessionId, chunk);
          processed++;
        }
      }
    } finally {
      this.isProcessingAudio = false;
      if (this.audioBufferQueue.length > 0 && this.isActive) {
        setImmediate(() => this.processAudioQueue());
      }
    }
  }

  async endAudioContent() {
    if (!this.isActive) return;
    await this.client.sendContentEnd(this.sessionId);
  }

  async endPrompt() {
    if (!this.isActive) return;
    await this.client.sendPromptEnd(this.sessionId);
  }

  async close() {
    if (!this.isActive) return;
    this.isActive = false;
    this.audioBufferQueue = [];
    await this.client.sendSessionEnd(this.sessionId);
  }
}

export class NovaSonicBidirectionalStreamClient {
  constructor(config = {}) {
    const region = config.region || process.env.AWS_REGION || "us-east-1";
    const nodeHttp2Handler = new NodeHttp2Handler({
      requestTimeout: 300000,
      sessionTimeout: 300000,
      disableConcurrentStreams: false,
      maxConcurrentStreams: 20,
    });
    this.bedrock = new BedrockRuntimeClient({
      region,
      requestHandler: nodeHttp2Handler,
    });
    this.inferenceConfig = config.inferenceConfig ?? DEFAULT_INFERENCE;
    this.turnDetectionConfig = config.turnDetectionConfig;
    this.sessions = new Map();
    this.lastActivity = new Map();
    this.eventHandlers = new Map(); // sessionId -> Map(eventType -> handler)
    this.toolHandlers = new Map(); // toolName -> async (input, context) => result
    this.pendingToolUseBySession = new Map(); // sessionId -> last toolUse event
  }

  registerToolHandler(toolName, handler) {
    if (!toolName || typeof handler !== "function") return;
    this.toolHandlers.set(toolName, handler);
  }

  registerEventHandler(sessionId, eventType, handler) {
    if (!this.eventHandlers.has(sessionId)) {
      this.eventHandlers.set(sessionId, new Map());
    }
    this.eventHandlers.get(sessionId).set(eventType, handler);
  }

  dispatch(sessionId, eventType, data) {
    this.lastActivity.set(sessionId, Date.now());
    const handlers = this.eventHandlers.get(sessionId);
    if (!handlers) return;
    const h = handlers.get(eventType);
    if (h) {
      try {
        h(data);
      } catch (e) {
        console.error("Handler error", eventType, sessionId, e);
      }
    }
  }

  isSessionActive(sessionId) {
    const s = this.sessions.get(sessionId);
    return s && s.isActive;
  }

  getActiveSessions() {
    return Array.from(this.sessions.keys());
  }

  getLastActivityTime(sessionId) {
    return this.lastActivity.get(sessionId) || 0;
  }

  createStreamSession(sessionId = randomUUID(), config = {}) {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }
    const inferenceConfig = config.inferenceConfig ?? this.inferenceConfig;
    const turnDetectionConfig =
      config.turnDetectionConfig ?? this.turnDetectionConfig;
    const session = {
      queue: createQueue(),
      inferenceConfig,
      turnDetectionConfig,
      promptName: randomUUID(),
      audioContentId: randomUUID(),
      isActive: true,
      // Optional contextual fields that callers can pass via config (for example: handle, knowledgeBaseId)
      context: {
        handle: config.handle,
        knowledgeBaseId: config.knowledgeBaseId,
      },
    };
    this.sessions.set(sessionId, session);
    return new StreamSession(sessionId, this);
  }

  addEventToSessionQueue(sessionId, event) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) return;
    this.lastActivity.set(sessionId, Date.now());
    session.queue.push(event);
  }

  setupSessionStartEvent(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    // Match official example: sessionStart with inferenceConfiguration only (no turnDetectionConfiguration)
    const event = {
      event: {
        sessionStart: {
          inferenceConfiguration: session.inferenceConfig,
        },
      },
    };
    this.addEventToSessionQueue(sessionId, event);
  }

  setupPromptStartEvent(sessionId, voiceId, outputSampleRate = 24000) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const tools = [
      {
        toolSpec: {
          name: "createBooking",
          description:
            "Create and persist a confirmed booking for a caller, including center, machine type, date/time, duration, name, and phone number.",
          inputSchema: {
            json: JSON.stringify(CREATE_BOOKING_SCHEMA),
          },
        },
      },
      {
        toolSpec: {
          name: "getBookingsForTimeRange",
          description:
            "Check existing bookings for a center and machine type within a specific time range to determine availability and potential conflicts.",
          inputSchema: {
            json: JSON.stringify(GET_BOOKINGS_FOR_TIME_RANGE_SCHEMA),
          },
        },
      },
    ];

    // Add catalog lookup tool for retail businesses
    tools.push({
      toolSpec: {
        name: "lookupCatalogItems",
        description: "Look up products in the business catalog. Use when customer asks about available products, stock, prices, or specific items.",
        inputSchema: { json: JSON.stringify(LOOKUP_CATALOG_ITEMS_SCHEMA) }
      }
    });

    // Add clinic token tool for clinic businesses
    tools.push({
      toolSpec: {
        name: "createClinicToken",
        description: "Issue a queue token to a patient for a clinic visit. Use when a patient calls to get a token/queue number for a doctor.",
        inputSchema: { json: JSON.stringify(CREATE_CLINIC_TOKEN_SCHEMA) }
      }
    });

    // Add Bedrock Knowledge Base tool when a knowledge base is configured (per session or env)
    if (session.context?.knowledgeBaseId) {
      tools.push({
        toolSpec: {
          name: "queryKnowledgeBase",
          description:
            "Search the business knowledge base for policies, FAQs, service details, pricing, or other information. Use this when the user asks about company-specific information that may be in the knowledge base.",
          inputSchema: {
            json: JSON.stringify(KNOWLEDGE_BASE_TOOL_SCHEMA),
          },
        },
      });
    }

    const event = {
      event: {
        promptStart: {
          promptName: session.promptName,
          textOutputConfiguration: { mediaType: "text/plain" },
          audioOutputConfiguration: {
            mediaType: "audio/lpcm",
            sampleRateHertz: outputSampleRate,
            sampleSizeBits: 16,
            channelCount: 1,
            encoding: "base64",
            audioType: "SPEECH",
            voiceId: voiceId || "tiffany",
          },
          toolUseOutputConfiguration: { mediaType: "application/json" },
          toolConfiguration: {
            tools,
          },
        },
      },
    };
    this.addEventToSessionQueue(sessionId, event);
  }

  setupSystemPromptEvent(sessionId, systemPromptContent) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const content = (systemPromptContent || "").trim();
    if (!content) throw new Error("System prompt content is required");
    const textPromptID = randomUUID();

    this.addEventToSessionQueue(sessionId, {
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: textPromptID,
          type: "TEXT",
          interactive: false,
          role: "SYSTEM",
          textInputConfiguration: { mediaType: "text/plain" },
        },
      },
    });
    this.addEventToSessionQueue(sessionId, {
      event: {
        textInput: {
          promptName: session.promptName,
          contentName: textPromptID,
          content,
        },
      },
    });
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentEnd: {
          promptName: session.promptName,
          contentName: textPromptID,
        },
      },
    });
  }

  setupStartAudioEvent(sessionId, audioConfig = DEFAULT_AUDIO_INPUT) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const event = {
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: session.audioContentId,
          type: "AUDIO",
          interactive: true,
          role: "USER",
          audioInputConfiguration: audioConfig,
        },
      },
    };
    this.addEventToSessionQueue(sessionId, event);
  }

  async streamAudioChunk(sessionId, audioData) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive || !session.audioContentId) {
      throw new Error(`Invalid session ${sessionId} for audio`);
    }
    const base64 = audioData.toString("base64");
    this.addEventToSessionQueue(sessionId, {
      event: {
        audioInput: {
          promptName: session.promptName,
          contentName: session.audioContentId,
          content: base64,
        },
      },
    });
  }

  sendContentEnd(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) return;
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentEnd: {
          promptName: session.promptName,
          contentName: session.audioContentId,
        },
      },
    });
  }

  sendPromptEnd(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) return;
    this.addEventToSessionQueue(sessionId, {
      event: { promptEnd: { promptName: session.promptName } },
    });
  }

  sendSessionEnd(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.addEventToSessionQueue(sessionId, { event: { sessionEnd: {} } });
    session.isActive = false;
  }

  createSessionAsyncIterable(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      return {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ value: undefined, done: true }),
        }),
      };
    }

    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        // Drain queue even after isActive=false so contentEnd, promptEnd, sessionEnd are sent (avoids "prompts were not closed" error)
        while (session.queue.length > 0 || (session.isActive && !session.queue.closed)) {
          if (session.queue.length > 0) {
            const event = session.queue.shift();
            yield {
              chunk: {
                bytes: new TextEncoder().encode(JSON.stringify(event)),
              },
            };
            continue;
          }
          if (!session.isActive || session.queue.closed) break;
          await session.queue.wait();
        }
      },
    };
  }

  async initiateBidirectionalStreaming(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    try {
      const body = this.createSessionAsyncIterable(sessionId);
      const response = await this.bedrock.send(
        new InvokeModelWithBidirectionalStreamCommand({
          modelId: MODEL_ID,
          body,
        })
      );
      await this.processResponseStream(sessionId, response);
    } catch (error) {
      console.error("Bidirectional stream error", sessionId, error);
      this.dispatch(sessionId, "error", {
        source: "bidirectionalStream",
        error: error?.message || String(error),
      });
      if (session.isActive) {
        session.isActive = false;
        session.queue.close();
      }
    } finally {
      this.dispatch(sessionId, "streamComplete", {});
      this.sessions.delete(sessionId);
      this.eventHandlers.delete(sessionId);
    }
  }

  async processResponseStream(sessionId, response) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      for await (const event of response.body) {
        if (!session.isActive) break;
        if (event.chunk?.bytes) {
          this.lastActivity.set(sessionId, Date.now());
          const text = new TextDecoder().decode(event.chunk.bytes);
          try {
            const json = JSON.parse(text);
            const ev = json.event || json;
            if (ev.contentStart)
              this.dispatch(sessionId, "contentStart", ev.contentStart);
            else if (ev.textOutput)
              this.dispatch(sessionId, "textOutput", ev.textOutput);
            else if (ev.audioOutput)
              this.dispatch(sessionId, "audioOutput", ev.audioOutput);
            else if (ev.toolUse) {
              // Model is requesting that we call a tool.
              this.pendingToolUseBySession.set(sessionId, ev.toolUse);
              this.dispatch(sessionId, "toolUse", ev.toolUse);
            } else if (ev.contentEnd) {
              this.dispatch(sessionId, "contentEnd", ev.contentEnd);
              // Barge-in: when user interrupts, contentEnd has stopReason "INTERRUPTED"
              if (ev.contentEnd.stopReason === "INTERRUPTED") {
                this.dispatch(sessionId, "interruption", ev.contentEnd);
              }
              // When tool content ends, execute the queued tool call and send toolResult back.
              // Await so tool result is queued before processing more response events (matches AWS sample).
              if (ev.contentEnd.type === "TOOL") {
                const toolUse = this.pendingToolUseBySession.get(sessionId);
                if (toolUse) {
                  this.pendingToolUseBySession.delete(sessionId);
                  await this.executeToolAndSendResult(sessionId, toolUse);
                }
              }
            } else if (ev.completionStart)
              this.dispatch(sessionId, "completionStart", ev.completionStart);
            else if (ev.completionEnd)
              this.dispatch(sessionId, "completionEnd", ev.completionEnd);
            else if (ev.usageEvent)
              this.dispatch(sessionId, "usageEvent", ev.usageEvent);
          } catch (e) {
            // ignore parse errors for non-JSON chunks
          }
        } else if (event.modelStreamErrorException) {
          this.dispatch(sessionId, "error", {
            type: "modelStreamErrorException",
            details: event.modelStreamErrorException?.message || JSON.stringify(event.modelStreamErrorException),
          });
        } else if (event.internalServerException) {
          this.dispatch(sessionId, "error", {
            type: "internalServerException",
            details: event.internalServerException?.message || JSON.stringify(event.internalServerException),
          });
        }
      }
    } catch (error) {
      console.error("Response stream error", sessionId, error);
      this.dispatch(sessionId, "error", {
        source: "responseStream",
        details: error?.message || String(error),
      });
    }
  }

  forceCloseSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      session.queue.close();
    }
    this.sessions.delete(sessionId);
    this.eventHandlers.delete(sessionId);
    this.pendingToolUseBySession.delete(sessionId);
  }

  async executeToolAndSendResult(sessionId, toolUse) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) return;

    const toolName = toolUse.toolName;
    const toolUseId = toolUse.toolUseId;
    const handler = this.toolHandlers.get(toolName);
    const contentName = randomUUID();

    const safeContext = {
      sessionId,
      promptName: session.promptName,
      handle: session.context?.handle,
      knowledgeBaseId: session.context?.knowledgeBaseId,
    };

    // Helper to push a full toolResult sequence (contentStart -> toolResult -> contentEnd).
    // Nova returns "Tool Response parsing error" if content is not valid JSON - always send stringified object.
    // Limit size to reduce "System instability detected"; 5.5k allows pricing + a few chunks.
    const sendToolResultSequence = (payload) => {
      const maxResultLen = 5500;
      let content;
      if (typeof payload === "string") {
        const result =
          payload.length <= maxResultLen
            ? payload
            : payload.slice(0, maxResultLen) + "\n\n[Result truncated.]";
        content = JSON.stringify({ result });
      } else {
        content = JSON.stringify(payload);
      }

      this.addEventToSessionQueue(sessionId, {
        event: {
          contentStart: {
            promptName: session.promptName,
            contentName,
            interactive: false,
            type: "TOOL",
            role: "TOOL",
            toolResultInputConfiguration: {
              toolUseId,
              type: "TEXT",
              textInputConfiguration: {
                mediaType: "text/plain",
              },
            },
          },
        },
      });

      this.addEventToSessionQueue(sessionId, {
        event: {
          toolResult: {
            promptName: session.promptName,
            contentName,
            content,
          },
        },
      });

      this.addEventToSessionQueue(sessionId, {
        event: {
          contentEnd: {
            promptName: session.promptName,
            contentName,
          },
        },
      });
    };

    try {
      let input = {};
      const rawContent = toolUse.content;
      if (typeof rawContent === "string") {
        try {
          input = JSON.parse(rawContent);
        } catch {
          input = { raw: rawContent };
        }
      } else if (rawContent && typeof rawContent === "object") {
        input = rawContent;
      }

      if (!handler) {
        sendToolResultSequence({
          error: `No handler registered for tool ${toolName}`,
          toolName,
        });
        return;
      }

      const result = await handler(input, safeContext);
      const finalResult = result ?? { ok: true };
      sendToolResultSequence(finalResult);
      // Let higher layers (server, UI) observe tool completion.
      this.dispatch(sessionId, "toolResult", {
        toolName,
        toolUseId,
        result: finalResult,
      });
    } catch (error) {
      console.error("executeToolAndSendResult error", {
        sessionId,
        toolName,
        error,
      });
      const errorPayload = {
        error: `Tool execution failed: ${error?.message || String(error)}`,
        toolName,
      };
      sendToolResultSequence(errorPayload);
      this.dispatch(sessionId, "toolResult", {
        toolName,
        toolUseId,
        result: errorPayload,
      });
    }
  }
}
