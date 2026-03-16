/**
 * Voxa Sonic client for SIP trunk. Uses Socket.IO (Voxa Sonic service).
 * Dynamically fetches handle profile from the API to build the system prompt,
 * matching the same behavior as the web ShareableLink.
 */
const { io } = require("socket.io-client");
const http = require("http");
const https = require("https");

// wss via https base URL (Socket.IO uses wss when connecting to https)
const SONIC_URL = process.env.SONIC_URL || "https://sonic.callcentral.io";
const SONIC_REGION = process.env.SONIC_REGION || "us-east-1";
const API_BASE = (process.env.API_BASE_URL || "https://6kbd4veax6.execute-api.us-east-1.amazonaws.com").replace(/\/$/, "");
const DEFAULT_HANDLE = process.env.VOXA_DEFAULT_HANDLE || "m80esports";
const DEFAULT_VOICE_ID = process.env.VOXA_DEFAULT_VOICE_ID || "tiffany";

/**
 * Fetch handle profile from the public API (same endpoint as ShareableLink).
 */
function fetchProfile(handle) {
  const url = `${API_BASE}/public/${encodeURIComponent(handle)}`;
  const lib = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    lib.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Profile fetch ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try {
          const data = JSON.parse(body);
          resolve(data.profile || data);
        } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

/**
 * Build a system prompt from the profile, mirroring ShareableLink logic.
 */
function buildSystemPrompt(profile, callInfo = {}) {
  const parts = [];
  const useCaseId = profile.useCaseId;
  const captureEmail = profile.captureEmail !== false;
  const capturePhone = profile.capturePhone !== false;
  const callerPhone = callInfo?.caller || null;

  let contactRules;
  if (callerPhone) {
    // Caller phone is already known from caller ID — don't ask for it
    const rules = [
      `The caller's phone number is already known: ${callerPhone}. Do NOT ask for their phone number. You still need to collect their full name.`,
      `When creating a booking, use the phone number ${callerPhone} automatically.`,
    ];
    if (captureEmail) rules.push("If you need their email, collect and read it back for confirmation.");
    contactRules = rules.join(" ");
  } else {
    contactRules = [
      "For any booking you MUST collect the caller's full name and at least one of: phone number or email (this business may require both).",
      capturePhone && "If you collect phone, read it back digit by digit for confirmation.",
      captureEmail && "If you collect email, read it back for confirmation.",
    ].filter(Boolean).join(" ");
  }

  if (useCaseId === "salon") {
    parts.push(
      "Always respond in English. " +
      "This business is a SALON. You must ONLY handle salon appointments (branches, services, time). " +
      "Do NOT mention, offer, or ask about gaming cafe, clinic, or any other business type. Act as if this is exclusively a salon. " +
      "Booking: gather branch (if multiple), service, preferred date/time, then name and contact. Use getBookingsForTimeRange with branchId; use createBooking with branchId, serviceId (duration comes from service), startTime, name, and phone/email."
    );
  } else if (useCaseId === "clinic") {
    parts.push(
      "Always respond in English. " +
      "This business is a CLINIC. You must ONLY handle clinic appointments (doctors, locations, services, time). " +
      "Do NOT mention, offer, or ask about gaming cafe, salon, or any other business type. Act as if this is exclusively a clinic. " +
      "Booking: gather doctor or location, service, preferred date/time, then name and contact. Use getBookingsForTimeRange with doctorId and/or locationId; use createBooking with doctorId, locationId, serviceId (duration from service), startTime, name, and phone/email."
    );
  } else if (useCaseId === "gaming_cafe") {
    parts.push(
      "Always respond in English. " +
      "This business is a GAMING CAFE. You must ONLY handle gaming cafe bookings (centers, machine types, time). " +
      "Do NOT mention, offer, or ask about salon, clinic, or any other business type. Act as if this is exclusively a gaming cafe. " +
      "Use the knowledge base below for centers and machines. Booking: gather center name, machine type, date, start time, duration, then name and phone/email. Use getBookingsForTimeRange with centerName and machineType; use createBooking with centerName, machineType, startTime, durationMinutes, name, and phone/email."
    );
  } else {
    parts.push(
      "Always respond in English. " +
      "You are the voice agent for this business. Handle only the services and booking flow that match the knowledge base below. " +
      "Do not offer or ask about multiple business types (e.g. do not ask if the caller wants gaming cafe or salon). Stick to this business's offerings only."
    );
  }

  // Structured offerings
  if (useCaseId === "clinic" && (profile.doctors?.length || profile.locations?.length || profile.services?.length)) {
    const offeringParts = [];
    if (profile.doctors?.length) {
      offeringParts.push("Doctors: " + profile.doctors.map((d) => `${d.name || d.doctorId}${d.specialty ? ` (${d.specialty})` : ""}`).join(", "));
    }
    if (profile.locations?.length) {
      offeringParts.push("Locations: " + profile.locations.map((l) => `${l.name || l.locationId}${l.address ? ` - ${l.address}` : ""}`).join(". "));
    }
    if (profile.services?.length) {
      const svc = profile.services.filter((s) => s.useCaseId === "clinic" || !s.useCaseId);
      if (svc.length) {
        offeringParts.push("Services (use these exact names/IDs when booking): " + svc.map((s) => `${s.name || s.serviceId} - ${s.durationMinutes ?? 0} min${s.priceCents != null ? `, ₹${(s.priceCents / 100).toFixed(0)}` : ""} (serviceId: ${s.serviceId})`).join(". "));
      }
    }
    if (offeringParts.length) parts.push("Structured offerings for this clinic:\n" + offeringParts.join("\n"));
  }
  if (useCaseId === "salon" && (profile.branches?.length || profile.services?.length)) {
    const offeringParts = [];
    if (profile.branches?.length) {
      offeringParts.push("Branches: " + profile.branches.map((b) => `${b.name || b.branchId}${b.location ? ` (${b.location})` : ""}${b.capacity != null ? `, capacity ${b.capacity}` : ""} (branchId: ${b.branchId})`).join(". "));
    }
    if (profile.services?.length) {
      const svc = profile.services.filter((s) => s.useCaseId === "salon" || !s.useCaseId);
      if (svc.length) {
        offeringParts.push("Services (use these exact names/IDs when booking): " + svc.map((s) => `${s.name || s.serviceId} - ${s.durationMinutes ?? 0} min${s.priceCents != null ? `, ₹${(s.priceCents / 100).toFixed(0)}` : ""} (serviceId: ${s.serviceId})`).join(". "));
      }
    }
    if (offeringParts.length) parts.push("Structured offerings for this salon:\n" + offeringParts.join("\n"));
  }
  if (useCaseId === "gaming_cafe" && profile.centers?.length) {
    const centerInfo = profile.centers.map((c) => {
      let s = c.name || "Center";
      if (c.location) s += ` (${c.location})`;
      if (c.machines?.length) {
        s += " — Machines: " + c.machines.map((m) => `${m.name || m.type} x${m.count}${m.pricePerHour ? ` ₹${m.pricePerHour}/hr` : ""}`).join(", ");
      }
      return s;
    }).join(". ");
    parts.push("Gaming centers:\n" + centerInfo);
  }

  parts.push(
    `Time zone: All times are in Indian Standard Time (IST, Asia/Kolkata). Today's date is ${new Date().toISOString().slice(0, 10)}. Always use the current year (${new Date().getFullYear()}). When the caller says 'today at 7pm', 'tomorrow at 9am', 'next Monday at 2pm', etc., convert that to ISO 8601 in IST for createBooking startTime and for getBookingsForTimeRange fromTime/toTime. Use the current date in IST as reference for 'today' and 'tomorrow'. ` +
    "Booking behavior (all types): " +
    "- Never ask whether the caller already has an account or is an existing customer; always handle bookings for new visitors directly. " +
    contactRules + " " +
    "Clearly read back the summary (time in IST, service/location, name, contact) and ask the caller to confirm before you say the booking is confirmed. " +
    "Tool behavior when booking tools are available: " +
    "- Use getBookingsForTimeRange to check availability before confirming a booking. " +
    "- If the slot is AVAILABLE, use createBooking with the appropriate fields for this business type. Never say a booking is confirmed unless createBooking succeeded. " +
    "- Prefer using the tools for availability and saving instead of making assumptions."
  );

  if (profile.persona) parts.push(profile.persona);
  if (profile.knowledgeSummary) parts.push("Knowledge base for this business:\n" + profile.knowledgeSummary);
  if (profile.knowledgeBaseId) {
    parts.push("A Bedrock Knowledge Base is connected. When the caller asks about policies, FAQs, pricing details, or other business-specific information, use the queryKnowledgeBase tool with their question to retrieve accurate answers before responding. When the tool result contains pricing, always state those amounts clearly in your reply.");
  }
  parts.push("Be direct and concise. If the caller asks a specific question (e.g. price for X, location, hours), answer only that—give just the requested information without extra detail unless they ask for more. Never mention internal settings to the caller (e.g. slot granularity, buffer between appointments); those are for system use only.");
  if (profile.displayName) parts.push("You are representing " + profile.displayName + ". Be helpful and concise.");

  return parts.join("\n\n");
}

/**
 * Build a sales system prompt for outbound Voxa sales calls.
 */
function buildSalesSystemPrompt(callInfo = {}) {
  const businessName = callInfo.businessName || "this business";
  const businessType = callInfo.businessType || "business";
  const location = callInfo.location || "";

  return `You are a friendly sales representative calling on behalf of Voxa, an AI-powered voice agent platform for businesses.

You are calling ${businessName}, a ${businessType}${location ? ` in ${location}` : ""}.

## Your Goal
1. Introduce yourself: "Hi, my name is Priya and I'm calling from Voxa."
2. Brief pitch: "We've built an AI phone agent that can answer your business calls 24/7, book appointments for your customers, and answer FAQs — so you never miss a call again."
3. Gauge interest: Ask if they currently struggle with missed calls, managing bookings, or answering repetitive questions.
4. If interested: Offer to set up a free 10-minute demo. Ask for their email or a convenient time to schedule it.
5. If they want to know more: Explain that Voxa works by giving them a shareable link and optionally a dedicated phone number. Their customers can call or visit the link, and the AI handles everything — checking availability, booking appointments, answering questions from a knowledge base.
6. If not interested: Thank them politely, wish them a good day, and end the call gracefully.

## Rules
- Keep the call under 2 minutes. Be respectful of their time.
- Be conversational, warm, and natural — not robotic or scripted.
- If they say they're busy, apologize and offer to call back at a better time.
- One soft follow-up if they seem hesitant, then respect their decision. Never be pushy.
- Do NOT make up features. Voxa handles: voice calls, text chat, appointment booking, FAQ answering, knowledge base lookups.
- If they ask about pricing, say "We have flexible plans starting free for small businesses, and you can try it with no commitment."
- Always be honest. If you don't know something, say you'll have your team follow up.
- Speak naturally with occasional filler words. Sound like a real person, not a script.

## Important
- Do NOT use any tools. This is a sales conversation only.
- Do NOT try to book appointments or access any business systems.
- Your only goal is to pitch Voxa and gauge interest level.`;
}

/**
 * @param {string} uuid - Call/session UUID
 * @param {{ did?: string, caller?: string, org?: { handle: string }, callType?: string, campaignId?: string, leadId?: string, businessName?: string, businessType?: string, location?: string }} callInfo
 * @param {{ onAudioOutput?: (buf: Buffer) => void, onSessionClosed?: () => void, onReady?: () => void, onInterruption?: (data: any) => void }} options
 * @returns {{ sendAudio: (buf: Buffer) => void, close: () => void }}
 */
function startSonicStream(uuid, callInfo = {}, options = {}) {
  const isSalesCall = callInfo?.callType === "sales";
  const handle = isSalesCall ? "voxa-salesbot" : (callInfo?.org?.handle || DEFAULT_HANDLE);
  const onAudioOutput = options.onAudioOutput;
  const onSessionClosed = options.onSessionClosed;
  const onReady = options.onReady;

  const socket = io(SONIC_URL, {
    path: "/socket.io/",
    transports: ["polling", "websocket"],
    reconnection: false,
    timeout: 60000,
  });

  let audioReady = false;
  let closed = false;

  socket.on("connect", () => {
    console.log(`✅ Sonic connected | CALL=${uuid} | handle=${handle}`);
  });

  socket.on("connect_error", (err) => {
    console.log(`❌ Sonic connect error | CALL=${uuid} | ${err.message}`);
  });

  socket.on("error", (data) => {
    console.log(`❌ Sonic error | CALL=${uuid} |`, data?.message || data);
  });

  socket.on("audioReady", () => {
    audioReady = true;
    if (onReady) onReady();
  });

  socket.on("audioOutput", (data) => {
    if (closed || !onAudioOutput) return;
    const content = data?.content;
    if (typeof content !== "string") return;
    try {
      const buf = Buffer.from(content, "base64");
      if (buf.length) onAudioOutput(buf);
    } catch (_) {}
  });

  // Interruption (barge-in): Nova Sonic detected the caller speaking while AI was responding.
  // Same pattern as ShareableLink.tsx — immediately stop all queued AI audio.
  socket.on("interruption", (data) => {
    console.log(`⚡ Interruption (barge-in) | CALL=${uuid}`);
    if (options.onInterruption) options.onInterruption(data);
  });

  socket.on("sessionClosed", () => {
    closed = true;
    if (onSessionClosed) onSessionClosed();
  });

  socket.on("disconnect", () => {
    console.log(`🔌 Sonic disconnected | CALL=${uuid}`);
  });

  function init(knowledgeBaseId, extraConfig = {}) {
    return new Promise((resolve, reject) => {
      if (closed) { reject(new Error("Session closed")); return; }
      socket.emit(
        "initializeConnection",
        {
          region: SONIC_REGION,
          handle,
          knowledgeBaseId: knowledgeBaseId || undefined,
          ...extraConfig,
        },
        (ack) => {
          if (ack?.success) resolve();
          else reject(new Error(ack?.error || "initializeConnection failed"));
        }
      );
    });
  }

  async function runFlow() {
    try {
      let voiceId, systemPrompt, knowledgeBaseId;

      if (isSalesCall) {
        // Sales call — use sales system prompt, no profile fetch needed
        console.log(`📤 Sales call setup | CALL=${uuid} | Target=${callInfo.businessName || callInfo.caller}`);
        voiceId = "tiffany"; // Friendly female voice for sales
        knowledgeBaseId = "";
        systemPrompt = buildSalesSystemPrompt(callInfo);

        await init(knowledgeBaseId, {
          callType: "sales",
          campaignId: callInfo.campaignId || null,
          leadId: callInfo.leadId || null,
          businessName: callInfo.businessName || null,
          businessType: callInfo.businessType || null,
          location: callInfo.location || null,
        });
      } else {
        // Regular inbound call — fetch business profile
        let profile = {};
        try {
          profile = await fetchProfile(handle);
          console.log(`📋 Profile loaded | CALL=${uuid} | handle=${handle} | useCase=${profile.useCaseId || "unknown"} | voice=${profile.voiceId || "default"}`);
        } catch (err) {
          console.log(`⚠ Profile fetch failed for ${handle}, using defaults | ${err.message}`);
        }

        voiceId = profile.voiceId || callInfo?.org?.voiceId || DEFAULT_VOICE_ID;
        knowledgeBaseId = profile.knowledgeBaseId || callInfo?.org?.knowledgeBaseId || process.env.BEDROCK_KNOWLEDGE_BASE_ID || "";
        systemPrompt = buildSystemPrompt(profile, callInfo);

        await init(knowledgeBaseId);
      }

      socket.emit("promptStart", { voiceId, outputSampleRate: 24000 });
      socket.emit("systemPrompt", { content: systemPrompt, voiceId });
      socket.emit("audioStart");

      await new Promise((resolve) => {
        const onReady = () => { socket.off("audioReady", onReady); resolve(); };
        socket.on("audioReady", onReady);
        if (audioReady) resolve();
      });

      // Agent speaks first
      const firstPrompt = isSalesCall
        ? "[You are making an outbound sales call. The person has just picked up. Introduce yourself warmly as Priya from Voxa and begin your pitch.]"
        : "[The caller has just connected to the line. Greet them warmly and ask how you can help.]";

      socket.emit("textInput", { role: "user", content: firstPrompt });
      console.log(`🎙 Agent-speaks-first prompt sent | CALL=${uuid} | type=${isSalesCall ? "sales" : "inbound"}`);
    } catch (err) {
      console.log(`❌ Sonic setup error | CALL=${uuid} | ${err.message}`);
    }
  }

  runFlow();

  return {
    sendAudio(audio) {
      if (closed || !socket.connected || !audioReady) return;
      const buf = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
      socket.emit("audioInput", buf.toString("base64"));
    },
    close() {
      closed = true;
      try { socket.emit("stopAudio"); } catch (_) {}
      socket.disconnect();
    },
  };
}

module.exports = { startSonicStream };
