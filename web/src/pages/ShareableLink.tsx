import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useParams, useSearchParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { Mic, MessageSquare, Send, Sparkles, Globe2, Clock3, Volume2, PhoneCall, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

type ChatMessage = {
  role: "visitor" | "assistant";
  text: string;
  time: string;
};

type PublicProfile = {
  handle: string;
  displayName?: string;
  businessName?: string;
  category?: string;
  address?: string;
  city?: string;
  phoneNumber?: string;
  hasAiPhone?: boolean;
  hasWidget?: boolean;
  planTier?: string | null;
  realtimeAvailability?: {
    hasWalkInSlots?: boolean;
    supportsUrgentCases?: boolean;
  };
  services?: Array<{
    id?: string;
    name?: string;
    type?: string;
    duration?: number;
    basePrice?: number;
  }>;
  voiceEnabled?: boolean;
  textEnabled?: boolean;
  voiceId?: string;
  persona?: string;
  knowledgeSummary?: string;
  /** Business type: salon, clinic, gaming_cafe, agency, etc. Drives voice prompt and booking flow. */
  useCaseId?: string;
  captureEmail?: boolean;
  capturePhone?: boolean;
  /** Structured data (from API); used for clinic/salon voice knowledge like gaming centers/machines. */
  doctors?: Array<{ doctorId: string; name?: string; specialty?: string }>;
  locations?: Array<{ locationId: string; name?: string; address?: string }>;
  services?: Array<{ serviceId: string; name?: string; durationMinutes?: number; priceCents?: number; useCaseId?: string }>;
  branches?: Array<{ branchId: string; name?: string; location?: string; capacity?: number; address?: string }>;
  /** Bedrock Knowledge Base ID for RAG (optional). When set, voice agent can query the KB. */
  knowledgeBaseId?: string;
};

type SonicConfig = {
  sonicServiceUrl?: string;
  sonicWebsocketUrl?: string;
  modelId?: string;
  region?: string;
};

const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

const starterMessages: ChatMessage[] = [
  { role: "assistant", text: "Hey, I am your VOXA assistant. Ask me anything about services, pricing, or availability.", time: "just now" },
];

const ShareableLink = () => {
  const { handle } = useParams();
  const [searchParams] = useSearchParams();
  const isEmbed = searchParams.get("embed") === "1";
  const safeHandle = (handle || "yourname").toLowerCase();
  const displayName = useMemo(
    () => safeHandle.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    [safeHandle],
  );
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [input, setInput] = useState("");
  const [isVoiceLive, setIsVoiceLive] = useState(false);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [sonicConfig, setSonicConfig] = useState<SonicConfig | null>(null);
  const [voiceSessionError, setVoiceSessionError] = useState("");
  const [voiceSessionInfo, setVoiceSessionInfo] = useState<{ token?: string; expiresAt?: string } | null>(null);
  const [voiceToolEvents, setVoiceToolEvents] = useState<
    { id: string; ts: number; type: "use" | "result"; toolName: string; status?: "ok" | "error"; message?: string }
  >([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playQueueRef = useRef<{ nextTime: number }>({ nextTime: 0 });
  const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPublicData() {
      if (!apiBase) {
        setProfileError("VITE_API_BASE_URL is missing. Set it in web/.env.local.");
        setIsLoadingProfile(false);
        return;
      }

      setIsLoadingProfile(true);
      setProfileError("");

      try {
        const [profileResp, sonicResp] = await Promise.all([
          fetch(`${apiBase}/public/${safeHandle}`, { cache: "no-store" }),
          fetch(`${apiBase}/sonic/config`),
        ]);

        if (!profileResp.ok) {
          const details = await profileResp.text();
          throw new Error(
            profileResp.status === 404
              ? "This VOXA link is not configured yet."
              : `Failed to load profile (${profileResp.status}). ${details}`
          );
        }

        const profilePayload = (await profileResp.json()) as { profile: PublicProfile };
        if (!cancelled) {
          setProfile(profilePayload.profile);
          setMessages([
            {
              role: "assistant",
              text: `Hey, I am ${profilePayload.profile.displayName || displayName}'s VOXA assistant. How can I help today?`,
              time: "just now",
            },
          ]);
        }

        if (sonicResp.ok) {
          const sonicPayload = (await sonicResp.json()) as SonicConfig;
          if (!cancelled) setSonicConfig(sonicPayload);
        }
      } catch (error) {
        if (!cancelled) {
          setProfileError((error as Error).message);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProfile(false);
        }
      }
    }

    loadPublicData();
    return () => {
      cancelled = true;
    };
  }, [displayName, safeHandle]);

  useEffect(() => {
    return () => {
      const sock = socketRef.current;
      if (sock?.connected) {
        sock.emit("stopAudio");
        sock.removeAllListeners();
        sock.disconnect();
        socketRef.current = null;
      }
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      try {
        audioContextRef.current?.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    };
  }, []);

  async function ensureSession() {
    if (sessionId) return sessionId;
    if (!apiBase) {
      throw new Error("Missing API base URL.");
    }

    const response = await fetch(`${apiBase}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        owner: "public-visitor",
        handle: safeHandle,
        channel: "text",
      }),
    });

    if (!response.ok) {
      throw new Error("Could not start session.");
    }

    const data = (await response.json()) as { sessionId: string };
    setSessionId(data.sessionId);
    return data.sessionId;
  }

  const onSend = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;

    setInput("");
    setIsSending(true);
    setMessages((prev) => [...prev, { role: "visitor", text, time: "now" }]);

    try {
      if (!apiBase) {
        throw new Error("VITE_API_BASE_URL is missing.");
      }

      const sid = await ensureSession();
      const response = await fetch(`${apiBase}/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          message: text,
        }),
      });

      if (!response.ok) {
        throw new Error("Message request failed.");
      }

      const payload = (await response.json()) as { reply: string };
      setMessages((prev) => [...prev, { role: "assistant", text: payload.reply, time: "now" }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Error: ${(error as Error).message}`,
          time: "now",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const endVoiceSession = useCallback(() => {
    window.speechSynthesis?.cancel();
    const sock = socketRef.current;
    if (sock?.connected) {
      sock.emit("stopAudio");
      sock.removeAllListeners();
      sock.disconnect();
      socketRef.current = null;
    }
    processorRef.current = null;
    sourceNodeRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    try {
      audioContextRef.current?.close();
    } catch {
      // ignore
    }
    audioContextRef.current = null;
    playQueueRef.current = { nextTime: 0 };
    setIsVoiceLive(false);
    setVoiceSessionInfo(null);
    setVoiceSessionError("");
  }, []);

  const toggleVoiceSession = async () => {
    if (isVoiceLive) {
      endVoiceSession();
      return;
    }

    setVoiceSessionError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access is not supported in this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
    } catch (err) {
      const msg = (err as Error).message || String(err);
      if (msg.includes("Permission denied") || (err as Error).name === "NotAllowedError") {
        setVoiceSessionError("Microphone access was denied. Allow the mic in your browser and try again.");
      } else if (msg.includes("NotFoundError") || msg.includes("not found")) {
        setVoiceSessionError("No microphone found. Connect a mic and try again.");
      } else {
        setVoiceSessionError(msg || "Could not access microphone.");
      }
      return;
    }

    if (!apiBase) {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      setVoiceSessionError("VITE_API_BASE_URL is missing.");
      return;
    }

    let sonicServiceUrl: string;
    let freshProfile: PublicProfile | null = profile;
    try {
      const [configResp, sessionResp, profileRefreshResp] = await Promise.all([
        fetch(`${apiBase}/sonic/config`),
        fetch(`${apiBase}/sonic/session`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ handle: safeHandle }),
        }),
        fetch(`${apiBase}/public/${safeHandle}`, { cache: "no-store" }),
      ]);
      if (!sessionResp.ok) throw new Error("Could not initialize voice session.");
      const sessionPayload = (await sessionResp.json()) as {
        token?: string;
        expiresAt?: string;
        sonicServiceUrl?: string;
      };
      sonicServiceUrl =
        sessionPayload.sonicServiceUrl ||
        (configResp.ok ? ((await configResp.json()) as SonicConfig).sonicServiceUrl : "") ||
        "";
      if (!sonicServiceUrl) {
        throw new Error("Sonic service URL not available. Is the Sonic ECS service deployed?");
      }
      if (profileRefreshResp.ok) {
        const { profile: p } = (await profileRefreshResp.json()) as { profile: PublicProfile };
        freshProfile = p;
        setProfile(p);
      }
      setVoiceSessionInfo({
        token: sessionPayload.token,
        expiresAt: sessionPayload.expiresAt,
      });
      setIsVoiceLive(true);
      await fetch(`${apiBase}/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle: safeHandle, channel: "voice", owner: "Voice caller" }),
      }).catch(() => {});
    } catch (error) {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      setVoiceSessionError((error as Error).message);
      return;
    }

    const region = sonicConfig?.region || "us-east-1";
    const socket = io(sonicServiceUrl, {
      path: "/socket.io/",
      transports: ["polling", "websocket"],
      reconnection: false,
    });
    socketRef.current = socket;

    socket.on("error", (data: { message?: string; details?: string }) => {
      setVoiceSessionError(data?.details || data?.message || "Sonic error");
    });
    socket.on("connect_error", (err) => {
      const msg =
        err?.message || "Could not connect to Sonic service.";
      setVoiceSessionError(
        msg.includes("websocket") || msg.includes("WebSocket")
          ? "Sonic connection failed. Ensure the Sonic ECS service is running the new Socket.IO + Nova Sonic image (rebuild and redeploy backend/sonic-service)."
          : msg
      );
      endVoiceSession();
    });

    const profileForVoice = freshProfile ?? profile;
    const systemPromptParts: string[] = [];
    const useCaseId = profileForVoice?.useCaseId;
    const captureEmail = profileForVoice?.captureEmail !== false;
    const capturePhone = profile?.capturePhone !== false;
    const contactRules = [
      "For any booking you MUST collect the caller's full name and at least one of: phone number or email (this business may require both).",
      capturePhone && "If you collect phone, read it back digit by digit for confirmation.",
      captureEmail && "If you collect email, read it back for confirmation.",
    ].filter(Boolean).join(" ");

    // Use-case-specific identity: this business is ONE type only. Never offer or ask about other types.
    if (useCaseId === "salon") {
      systemPromptParts.push(
        [
          "Always respond in English.",
          "This business is a SALON. You must ONLY handle salon appointments (branches, services, time).",
          "Do NOT mention, offer, or ask about gaming cafe, clinic, or any other business type. Act as if this is exclusively a salon.",
          "Booking: gather branch (if multiple), service, preferred date/time, then name and contact. Use getBookingsForTimeRange with branchId; use createBooking with branchId, serviceId (duration comes from service), startTime, name, and phone/email.",
        ].join(" ")
      );
    } else if (useCaseId === "clinic") {
      systemPromptParts.push(
        [
          "Always respond in English.",
          "This business is a CLINIC. You must ONLY handle clinic appointments (doctors, locations, services, time).",
          "Do NOT mention, offer, or ask about gaming cafe, salon, or any other business type. Act as if this is exclusively a clinic.",
          "Booking: gather doctor or location, service, preferred date/time, then name and contact. Use getBookingsForTimeRange with doctorId and/or locationId; use createBooking with doctorId, locationId, serviceId (duration from service), startTime, name, and phone/email.",
        ].join(" ")
      );
    } else if (useCaseId === "gaming_cafe") {
      systemPromptParts.push(
        [
          "Always respond in English.",
          "This business is a GAMING CAFE. You must ONLY handle gaming cafe bookings (centers, machine types, time).",
          "Do NOT mention, offer, or ask about salon, clinic, or any other business type. Act as if this is exclusively a gaming cafe.",
          "Use the knowledge base below for centers and machines. Booking: gather center name, machine type, date, start time, duration, then name and phone/email. Use getBookingsForTimeRange with centerName and machineType; use createBooking with centerName, machineType, startTime, durationMinutes, name, and phone/email.",
        ].join(" ")
      );
    } else {
      systemPromptParts.push(
        [
          "Always respond in English.",
          "You are the voice agent for this business. Handle only the services and booking flow that match the knowledge base below.",
          "Do not offer or ask about multiple business types (e.g. do not ask if the caller wants gaming cafe or salon). Stick to this business's offerings only.",
        ].join(" ")
      );
    }

    // Structured offerings (like gaming centers/machines) so the AI can list doctors, locations, services, branches
    if (useCaseId === "clinic" && (profileForVoice?.doctors?.length || profileForVoice?.locations?.length || profileForVoice?.services?.length)) {
      const parts: string[] = [];
      if (profileForVoice.doctors?.length) {
        parts.push(
          "Doctors: " +
            profileForVoice.doctors
              .map((d) => `${d.name || d.doctorId}${d.specialty ? ` (${d.specialty})` : ""}`)
              .join(", ")
        );
      }
      if (profileForVoice.locations?.length) {
        parts.push(
          "Locations: " +
            profileForVoice.locations
              .map((l) => `${l.name || l.locationId}${l.address ? ` - ${l.address}` : ""}`)
              .join(". ")
        );
      }
      if (profileForVoice.services?.length) {
        const clinicServices = profileForVoice.services.filter((s) => s.useCaseId === "clinic" || !s.useCaseId);
        if (clinicServices.length) {
          parts.push(
            "Services (use these exact names/IDs when booking): " +
              clinicServices
                .map(
                  (s) =>
                    `${s.name || s.serviceId} - ${s.durationMinutes ?? 0} min${s.priceCents != null ? `, ₹${(s.priceCents / 100).toFixed(0)}` : ""} (serviceId: ${s.serviceId})`
                )
                .join(". ")
          );
        }
      }
      if (parts.length) systemPromptParts.push("Structured offerings for this clinic:\n" + parts.join("\n"));
    }
    if (useCaseId === "salon" && (profileForVoice?.branches?.length || profileForVoice?.services?.length)) {
      const parts: string[] = [];
      if (profileForVoice.branches?.length) {
        parts.push(
          "Branches: " +
            profileForVoice.branches
              .map((b) => `${b.name || b.branchId}${b.location ? ` (${b.location})` : ""}${b.capacity != null ? `, capacity ${b.capacity}` : ""} (branchId: ${b.branchId})`)
              .join(". ")
        );
      }
      if (profileForVoice.services?.length) {
        const salonServices = profileForVoice.services.filter((s) => s.useCaseId === "salon" || !s.useCaseId);
        if (salonServices.length) {
          parts.push(
            "Services (use these exact names/IDs when booking): " +
              salonServices
                .map(
                  (s) =>
                    `${s.name || s.serviceId} - ${s.durationMinutes ?? 0} min${s.priceCents != null ? `, ₹${(s.priceCents / 100).toFixed(0)}` : ""} (serviceId: ${s.serviceId})`
                )
                .join(". ")
          );
        }
      }
      if (parts.length) systemPromptParts.push("Structured offerings for this salon:\n" + parts.join("\n"));
    }

    systemPromptParts.push(
      [
        "Time zone: All times are in Indian Standard Time (IST, Asia/Kolkata). When the caller says 'today at 7pm', 'tomorrow at 9am', 'next Monday at 2pm', etc., convert that to ISO 8601 in IST (e.g. 2025-03-10T19:00:00+05:30) for createBooking startTime and for getBookingsForTimeRange fromTime/toTime. Use the current date in IST as reference for 'today' and 'tomorrow'.",
        "",
        "Booking behavior (all types):",
        "- Never ask whether the caller already has an account or is an existing customer; always handle bookings for new visitors directly.",
        contactRules,
        "Clearly read back the summary (time in IST, service/location, name, contact) and ask the caller to confirm before you say the booking is confirmed.",
        "",
        "Tool behavior when booking tools are available:",
        "- Use getBookingsForTimeRange to check availability before confirming a booking.",
        "- If the slot is AVAILABLE, use createBooking with the appropriate fields for this business type. Never say a booking is confirmed unless createBooking succeeded.",
        "- Prefer using the tools for availability and saving instead of making assumptions.",
      ].join(" ")
    );

    if (profileForVoice?.persona) systemPromptParts.push(profileForVoice.persona);
    if (profileForVoice?.knowledgeSummary) systemPromptParts.push("Knowledge base for this business:\n" + profileForVoice.knowledgeSummary);
    if (profileForVoice?.knowledgeBaseId) {
      systemPromptParts.push(
        "A Bedrock Knowledge Base is connected. When the caller asks about policies, FAQs, pricing details, or other business-specific information, use the queryKnowledgeBase tool with their question to retrieve accurate answers before responding. When the tool result contains pricing (e.g. rupees per hour, rates), always state those amounts clearly in your reply."
      );
    }
    systemPromptParts.push(
      "Be direct and concise. If the caller asks a specific question (e.g. price for X, location, hours), answer only that—give just the requested information without extra detail unless they ask for more. Never mention internal settings to the caller (e.g. slot granularity, buffer between appointments); those are for system use only."
    );
    if (profileForVoice?.displayName) systemPromptParts.push("You are representing " + profileForVoice.displayName + ". Be helpful and concise.");
    const systemPrompt =
      systemPromptParts.length > 0
        ? systemPromptParts.join("\n\n")
        : "Always respond in English. You are a helpful voice assistant for " + (profileForVoice?.displayName || displayName) + ". Be concise and friendly.";

    try {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Connection timeout")), 15000);
        socket.emit(
          "initializeConnection",
          {
            region,
            handle: safeHandle,
            knowledgeBaseId: profileForVoice?.knowledgeBaseId || undefined,
            inferenceConfig: { maxTokens: 2048, temperature: 0.7, topP: 0.9 },
            turnDetectionConfig: { endpointingSensitivity: "MEDIUM" },
          },
          (ack: { success?: boolean; error?: string }) => {
            clearTimeout(t);
            if (ack?.success) resolve();
            else reject(new Error(ack?.error || "Connection failed"));
          }
        );
      });
    } catch (err) {
      setVoiceSessionError((err as Error).message);
      socket.disconnect();
      socketRef.current = null;
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      setIsVoiceLive(false);
      return;
    }

    const voiceId = profileForVoice?.voiceId || "tiffany";
    socket.emit("promptStart", { voiceId, outputSampleRate: 24000 });
    socket.emit("systemPrompt", { content: systemPrompt, voiceId });
    socket.emit("audioStart");

    socket.once("audioReady", () => {
      const stream = micStreamRef.current;
      if (!stream) return;
      const INPUT_SAMPLE_RATE = 16000;
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
        sampleRate: INPUT_SAMPLE_RATE,
      });
      audioContextRef.current = ctx;
      if (ctx.state === "suspended") ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      const bufferSize = 4096;
      const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        const sock = socketRef.current;
        if (!sock?.connected) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        const b64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
        sock.emit("audioInput", b64);
      };
      source.connect(processor);
      processor.connect(ctx.destination);
    });

    const OUTPUT_SAMPLE_RATE = 24000;
    socket.on("audioOutput", (data: { content?: string }) => {
      const content = data?.content;
      if (!content || typeof content !== "string") return;
      try {
        const ctx = audioContextRef.current;
        if (!ctx) return;
        if (ctx.state === "suspended") ctx.resume();
        const binary = atob(content);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const numSamples = bytes.length / 2;
        const buffer = ctx.createBuffer(1, numSamples, OUTPUT_SAMPLE_RATE);
        const channel = buffer.getChannelData(0);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < numSamples; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
        const ref = playQueueRef.current;
        const startTime = ref.nextTime < ctx.currentTime ? ctx.currentTime : ref.nextTime;
        ref.nextTime = startTime + buffer.duration;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        playbackSourcesRef.current.add(source);
        source.onended = () => playbackSourcesRef.current.delete(source);
        source.start(startTime);
      } catch {
        // ignore decode/play errors
      }
    });

    socket.on("interruption", () => {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      playbackSourcesRef.current.forEach((s) => {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      });
      playbackSourcesRef.current.clear();
      playQueueRef.current.nextTime = ctx.currentTime;
    });

    // Surface Nova Sonic tool use / results in the UI for debugging.
    socket.on("toolUse", (data: any) => {
      const toolName = data?.toolName || "unknown-tool";
      const id = data?.toolUseId || `${Date.now()}-use`;
      setVoiceToolEvents((prev) =>
        [
          {
            id,
            ts: Date.now(),
            type: "use",
            toolName,
          },
          ...prev,
        ].slice(0, 10)
      );
    });

    socket.on("toolResult", (data: any) => {
      const toolName = data?.toolName || "unknown-tool";
      const result = (data as any)?.result ?? data;
      const error = result?.error as string | undefined;
      const id = (data as any)?.toolUseId || `${Date.now()}-result`;
      setVoiceToolEvents((prev) =>
        [
          {
            id,
            ts: Date.now(),
            type: "result",
            toolName,
            status: error ? "error" : "ok",
            message: error,
          },
          ...prev,
        ].slice(0, 10)
      );
    });

    socket.on("sessionClosed", () => {
      endVoiceSession();
    });
  };

  const startBookingViaChat = () => {
    const targetName = profile?.businessName || profile?.displayName || displayName;
    const starter =
      "I want to book a slot or appointment. Please ask me for the details you need to confirm it.";
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text: `Starting a booking flow for ${targetName}. ${starter}`,
        time: "now",
      },
    ]);
  };

  if (isEmbed) {
    return (
      <div className="min-h-[540px] h-full w-full flex flex-col bg-background p-2 overflow-auto">
        <Card className="flex-1 flex flex-col min-h-0 overflow-hidden border border-border bg-card/70 backdrop-blur-sm">
          <CardHeader className="pb-2 py-3">
            <CardTitle className="font-display text-lg">Chat & Voice</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {isLoadingProfile && (
              <div className="mb-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">Loading...</div>
            )}
            {profileError && (
              <div className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">{profileError}</div>
            )}
            <Tabs defaultValue="chat" className="w-full flex-1 flex flex-col min-h-0">
              <TabsList className="grid w-full grid-cols-2 bg-secondary shrink-0">
                <TabsTrigger value="chat" className="gap-2" disabled={profile?.textEnabled === false}><MessageSquare className="h-4 w-4" /> Chat</TabsTrigger>
                <TabsTrigger value="voice" className="gap-2" disabled={profile?.voiceEnabled === false}><Mic className="h-4 w-4" /> Voice</TabsTrigger>
              </TabsList>
              <TabsContent value="chat" className="mt-2 space-y-2 flex-1 flex flex-col min-h-0">
                <div className="rounded-xl border border-border bg-secondary/30 p-2 flex-1 min-h-[240px] overflow-y-auto space-y-2">
                  {messages.map((message, idx) => (
                    <div key={`${message.role}-${idx}`} className={`rounded-lg px-2 py-1.5 max-w-[90%] text-sm ${message.role === "visitor" ? "ml-auto bg-primary/20 border border-primary/30" : "bg-background/70 border border-border"}`}>
                      <p className="text-[11px] text-muted-foreground mb-0.5">{message.role === "visitor" ? "You" : `VOXA`}</p>
                      <p>{message.text}</p>
                    </div>
                  ))}
                </div>
                <form onSubmit={onSend} className="flex gap-2 shrink-0">
                  <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message..." className="bg-secondary/40 text-sm" disabled={isSending || profile?.textEnabled === false} />
                  <Button type="submit" size="sm" className="gap-1" disabled={isSending || profile?.textEnabled === false}><Send className="h-3 w-3" /> Send</Button>
                </form>
              </TabsContent>
              <TabsContent value="voice" className="mt-2 space-y-3 flex-1 min-h-0 overflow-auto">
                <div className="rounded-xl border border-border bg-secondary/30 px-3 py-4 text-center space-y-3">
                  <Volume2 className="h-10 w-10 text-primary mx-auto" />
                  <p className="font-medium text-sm">Voice with {profile?.displayName || displayName}</p>
                  {voiceSessionError && <p className="text-xs text-destructive">{voiceSessionError}</p>}
                  {isVoiceLive && !voiceSessionError && <p className="text-xs text-primary">Microphone on — speak now</p>}
                  <Button onClick={toggleVoiceSession} disabled={profile?.voiceEnabled === false} size="sm" className={`w-full gap-2 ${isVoiceLive ? "bg-destructive hover:bg-destructive/90" : ""}`}>
                    <PhoneCall className="h-4 w-4" />
                    {isVoiceLive ? "End voice" : "Start voice"}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background bg-grid relative overflow-hidden">
      <div className="absolute inset-0 bg-radial-glow pointer-events-none" />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="grid gap-6 lg:grid-cols-[1.15fr_1fr]"
        >
          <section className="space-y-6">
            <Card className="bg-card/60 border-border overflow-hidden">
              <CardContent className="p-6 sm:p-8">
                <p className="text-xs tracking-[0.18em] uppercase text-primary font-semibold mb-3">VOXA Link</p>
                <h1 className="font-display text-4xl sm:text-5xl font-bold leading-tight mb-3">
                  {profile?.businessName ? (
                    <>
                      Visit{" "}
                      <span className="text-gradient-primary">
                        {profile.businessName}
                      </span>
                    </>
                  ) : (
                    <>
                      Talk to{" "}
                      <span className="text-gradient-primary">
                        {profile?.displayName || displayName}
                      </span>
                    </>
                  )}
                </h1>
                <p className="text-muted-foreground text-base sm:text-lg max-w-xl">
                  Instantly ask about services, prices, and real-time availability over text or voice.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    { icon: Sparkles, label: "Nova-powered", desc: "Understands intent + books for you" },
                    { icon: Globe2, label: "Smart link", desc: `voxa.ai/${profile?.handle || safeHandle}` },
                    {
                      icon: ShieldCheck,
                      label: "Availability-aware",
                      desc:
                        profile?.realtimeAvailability?.hasWalkInSlots || profile?.realtimeAvailability?.supportsUrgentCases
                          ? "Can handle urgent / walk-in cases"
                          : profile?.persona || "Consent-aware flows",
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg bg-secondary/40 border border-border p-3">
                      <item.icon className="h-4 w-4 text-primary mb-2" />
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  ))}
                </div>

                {(profile?.address || profile?.city || profile?.phoneNumber) && (
                  <div className="mt-6 grid gap-3 sm:grid-cols-3 text-xs text-muted-foreground">
                    {(profile.address || profile.city) && (
                      <div className="rounded-lg bg-secondary/30 border border-border px-3 py-2">
                        <p className="font-medium text-foreground text-sm mb-1">Location</p>
                        <p>{profile.address}</p>
                        {profile.city && <p>{profile.city}</p>}
                      </div>
                    )}
                    {profile?.phoneNumber && (
                      <div className="rounded-lg bg-secondary/30 border border-border px-3 py-2">
                        <p className="font-medium text-foreground text-sm mb-1">Call</p>
                        <p>{profile.phoneNumber}</p>
                        {profile.hasAiPhone && (
                          <p className="mt-1 text-[11px]">
                            This number is answered by an AI receptionist.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card/60 border-border">
              <CardHeader>
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-primary" />
                  What this AI can do
                </CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-3">
                {[
                  "Answer service and pricing questions",
                  "Collect lead details and intent",
                  "Qualify inquiries automatically",
                  "Route urgent requests to human follow-up",
                ].map((task) => (
                  <div key={task} className="rounded-lg bg-secondary/30 border border-border px-3 py-2 text-sm">
                    {task}
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="bg-card/70 border-border backdrop-blur-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="font-display text-xl">
                    Start Conversation
                  </CardTitle>
                  {profile?.phoneNumber && (
                    <div className="hidden sm:flex flex-col items-end text-xs">
                      <span className="text-muted-foreground mb-0.5">
                        Prefer phone?
                      </span>
                      <a
                        href={`tel:${profile.phoneNumber}`}
                        className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 border border-border text-foreground hover:border-primary transition-colors"
                      >
                        <PhoneCall className="h-3 w-3" />
                        <span>{profile.phoneNumber}</span>
                      </a>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingProfile && (
                  <div className="mb-4 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                    Loading profile...
                  </div>
                )}
                {profileError && (
                  <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
                    {profileError}
                  </div>
                )}
                <Tabs defaultValue="chat" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 bg-secondary">
                    <TabsTrigger value="chat" className="gap-2" disabled={profile?.textEnabled === false}>
                      <MessageSquare className="h-4 w-4" /> Text Chat
                    </TabsTrigger>
                    <TabsTrigger value="voice" className="gap-2" disabled={profile?.voiceEnabled === false}>
                      <Mic className="h-4 w-4" /> Voice Call
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="chat" className="mt-4 space-y-3">
                    <div className="rounded-xl border border-border bg-secondary/30 p-3 h-[360px] overflow-y-auto space-y-2">
                      {messages.map((message, idx) => (
                        <div
                          key={`${message.role}-${idx}`}
                          className={`rounded-lg px-3 py-2 max-w-[90%] ${
                            message.role === "visitor"
                              ? "ml-auto bg-primary/20 border border-primary/30"
                              : "bg-background/70 border border-border"
                          }`}
                        >
                          <p className="text-xs text-muted-foreground mb-1">
                            {message.role === "visitor" ? "You" : `VOXA • ${displayName}`}
                          </p>
                          <p className="text-sm">{message.text}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Use chat to{" "}
                        <button
                          type="button"
                          onClick={startBookingViaChat}
                          className="underline underline-offset-2 hover:text-primary"
                        >
                          book a slot or appointment
                        </button>
                        .
                      </span>
                    </div>

                    <form onSubmit={onSend} className="flex gap-2">
                      <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={`Message ${(profile?.displayName || displayName)}'s AI`}
                        className="bg-secondary/40"
                        disabled={isSending || profile?.textEnabled === false}
                      />
                      <Button type="submit" className="gap-2" disabled={isSending || profile?.textEnabled === false}>
                        <Send className="h-4 w-4" />
                        {isSending ? "Sending" : "Send"}
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="voice" className="mt-4 space-y-4">
                    <div className="rounded-xl border border-border bg-secondary/30 px-4 py-5 text-center space-y-4">
                      <div className="mx-auto h-20 w-20 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
                        <Volume2 className="h-8 w-8 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Voice Session with {profile?.displayName || displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {sonicConfig?.sonicServiceUrl
                            ? `Sonic ready in ${sonicConfig.region || "us-east-1"}`
                            : "Sonic config unavailable"}
                        </p>
                        {sonicConfig?.sonicWebsocketUrl && (
                          <p className="text-[11px] text-muted-foreground mt-1 truncate">
                            WS: {sonicConfig.sonicWebsocketUrl}
                          </p>
                        )}
                        {voiceSessionInfo?.expiresAt && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Session expires at {new Date(voiceSessionInfo.expiresAt).toLocaleTimeString()}
                          </p>
                        )}
                        {voiceSessionError && (
                          <p className="text-[11px] text-destructive mt-1">{voiceSessionError}</p>
                        )}
                        {isVoiceLive && !voiceSessionError && (
                          <>
                            <p className="text-xs text-primary font-medium mt-1">Microphone on — you can speak</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Connected to Nova Sonic. Agent replies will play here.
                            </p>
                          </>
                        )}

                        {voiceToolEvents.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                              Tool activity
                            </p>
                            <div className="space-y-0.5 max-h-20 overflow-y-auto pr-1">
                              {voiceToolEvents.slice(0, 5).map((evt) => (
                                <div
                                  key={evt.id}
                                  className="flex items-center justify-between text-[11px]"
                                >
                                  <span className="truncate">
                                    {evt.type === "use" ? "Calling" : "Result"}{" "}
                                    <span className="font-medium">{evt.toolName}</span>
                                  </span>
                                  {evt.type === "result" && (
                                    <span
                                      className={`ml-2 px-1.5 py-0.5 rounded-full ${
                                        evt.status === "error"
                                          ? "bg-destructive/10 text-destructive"
                                          : "bg-emerald-500/10 text-emerald-500"
                                      }`}
                                    >
                                      {evt.status === "error" ? "Error" : "OK"}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-end justify-center gap-1 h-12">
                        {[14, 28, 18, 34, 22, 30, 16, 26].map((h, i) => (
                          <motion.span
                            key={i}
                            className="w-1.5 rounded-full bg-primary/70"
                            animate={{ height: [h, h + 8, h] }}
                            transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.08 }}
                            style={{ height: `${h}px` }}
                          />
                        ))}
                      </div>

                      <Button
                        onClick={toggleVoiceSession}
                        disabled={profile?.voiceEnabled === false}
                        className={`w-full gap-2 ${isVoiceLive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}
                      >
                        <PhoneCall className="h-4 w-4" />
                        {isVoiceLive ? "End Voice Session" : "Start Voice Session"}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </section>
        </motion.div>
      </div>
    </div>
  );
};

export default ShareableLink;
