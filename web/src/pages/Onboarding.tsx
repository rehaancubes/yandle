import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Plus, Trash2, Loader2, Check, Phone, CreditCard,
  Globe, MessageSquare, Link as LinkIcon, MapPin, Code, Mic, MicOff,
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { businessCases, type UseCase } from "@/lib/onboarding-data";
import { getCurrentUserSub, getOnboardingStorageKey } from "@/lib/auth";

const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const GOOGLE_PLACES_KEY = "REDACTED";

function uid() {
  return (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random());
}

// ─── Business step types ──────────────────────────────────────────────────────

type GamingLocation = { id: string; name: string; address: string; lat?: number; lng?: number; placeId?: string; machines: { id: string; type: string; qty: number; pricePerHour: number }[] };
type SalonBranch = { id: string; name: string; address: string; lat?: number; lng?: number; placeId?: string; capacity: number; services: { id: string; name: string; gender: "men" | "women" | "unisex"; price: number; durationMinutes: number; concurrent: number }[] };
type ClinicDoctor = { id: string; name: string; specialty: string; avgConsultMinutes: number };
type GeneralLocation = { id: string; name: string; address: string; lat?: number; lng?: number; placeId?: string };
type SupportCategory = { id: string; name: string };

type BusinessData = {
  locations: GamingLocation[];
  branches: SalonBranch[];
  doctors: ClinicDoctor[];
  generalLocations: GeneralLocation[];
  supportCategories: SupportCategory[];
  slaResponseHours: number;
  slaResolutionHours: number;
};

// ─── Reusable Google Places Address Input ─────────────────────────────────────

function PlacesAddressInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (addr: { address: string; lat?: number; lng?: number; placeId?: string }) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<{ description: string; place_id: string }[]>([]);
  const [placesReady, setPlacesReady] = useState(false);
  const autoSvc = useRef<any>(null);
  // Detached div for PlacesService only — never attach to React tree so Google cannot mutate React's DOM (avoids removeChild error)
  const placesServiceContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    placesServiceContainerRef.current = document.createElement("div");
    return () => { placesServiceContainerRef.current = null; };
  }, []);

  useEffect(() => { setQuery(value); }, [value]);

  // Wait for Google Maps Places API to be loaded
  useEffect(() => {
    const g = (window as any).google;
    if (g?.maps?.places) {
      setPlacesReady(true);
      return;
    }
    const check = setInterval(() => {
      if ((window as any).google?.maps?.places) {
        setPlacesReady(true);
        clearInterval(check);
      }
    }, 200);
    return () => clearInterval(check);
  }, []);

  // Debounced search (min 3 chars)
  useEffect(() => {
    if (!placesReady || !query || query.length < 3) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      const g = (window as any).google;
      if (!g?.maps?.places) return;
      if (!autoSvc.current) autoSvc.current = new g.maps.places.AutocompleteService();
      autoSvc.current.getPlacePredictions(
        { input: query, types: ["establishment", "geocode"] },
        (preds: any[] | null, status: string) => {
          if ((status === "OK" || status === g.maps.places.PlacesServiceStatus?.OK) && Array.isArray(preds)) {
            setResults(preds.map((p: any) => ({ description: p.description, place_id: p.place_id })));
          } else {
            setResults([]);
          }
        }
      );
    }, 350);
    return () => clearTimeout(t);
  }, [placesReady, query]);

  const select = (placeId: string, desc: string) => {
    const g = (window as any).google;
    if (!g?.maps?.places) return;
    const container = placesServiceContainerRef.current ?? document.createElement("div");
    const placesSvc = new g.maps.places.PlacesService(container);
    placesSvc.getDetails(
      { placeId, fields: ["geometry", "name", "formatted_address", "place_id"] },
      (place: any, status: string) => {
        const ok = status === "OK" || status === g.maps.places.PlacesServiceStatus?.OK;
        if (ok && place?.geometry?.location) {
          const lat = typeof place.geometry.location.lat === "function" ? place.geometry.location.lat() : place.geometry.location.lat;
          const lng = typeof place.geometry.location.lng === "function" ? place.geometry.location.lng() : place.geometry.location.lng;
          const addr = place.formatted_address || desc;
          setQuery(addr);
          setResults([]);
          onChange({ address: addr, lat, lng, placeId: place.place_id || placeId });
        }
      }
    );
  };

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          onChange({ address: v });
        }}
        placeholder={placesReady ? (placeholder || "Search address (e.g. street, city)...") : "Loading maps..."}
        className="bg-card/60 h-9 text-sm"
      />
      {results.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-lg max-h-40 overflow-y-auto">
          {results.map((r) => (
            <button key={r.place_id} type="button" onClick={() => select(r.place_id, r.description)} className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors border-b border-border/50 last:border-0">
              {r.description}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main onboarding component ────────────────────────────────────────────────

const Onboarding = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Steps: 0=Feature Showcase, 1=Phone Number, 2=Business Type, 3=Handle, 4=Type-specific
  const [step, setStep] = useState(0);
  const [selectedCase, setSelectedCase] = useState<UseCase | null>(null);

  // Shared
  const [yandleHandle, setYandleHandle] = useState("");
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Phone number step
  const [wantsPhone, setWantsPhone] = useState(false);
  const [availablePhones, setAvailablePhones] = useState<{ phoneNumber: string; monthlyPrice: number }[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [paymentDone, setPaymentDone] = useState(false);
  const [loadingPhones, setLoadingPhones] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Business-specific
  const [bizData, setBizData] = useState<BusinessData>({
    locations: [], branches: [], doctors: [],
    generalLocations: [], supportCategories: [],
    slaResponseHours: 24, slaResolutionHours: 72,
  });

  // Voice onboarding
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const voiceSocketRef = useRef<Socket | null>(null);
  const voiceMicRef = useRef<MediaStream | null>(null);
  const voiceCtxRef = useRef<AudioContext | null>(null);
  const voiceProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const voicePlayQueueRef = useRef<{ nextTime: number }>({ nextTime: 0 });
  const voicePlaybackRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Load available phone numbers
  useEffect(() => {
    if (!apiBase) return;
    setLoadingPhones(true);
    const token = localStorage.getItem("yandle_id_token") || "";
    fetch(`${apiBase}/phone-numbers/available`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setAvailablePhones(d.numbers || []))
      .catch(() => {})
      .finally(() => setLoadingPhones(false));
  }, []);

  // Load Google Places API
  useEffect(() => {
    if ((window as any).google?.maps?.places) return;
    if (document.querySelector(`script[src*="maps.googleapis.com"]`)) {
      const check = setInterval(() => {
        if ((window as any).google?.maps?.places) clearInterval(check);
      }, 200);
      return () => clearInterval(check);
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_PLACES_KEY}&libraries=places`;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  const dummyPayment = () => {
    setPaymentLoading(true);
    setTimeout(() => {
      setPaymentDone(true);
      setPaymentLoading(false);
      toast({ title: "Payment successful", description: "Phone number reserved. 1000 credits added." });
    }, 1500);
  };

  // ─── Steps ─────────────────────────────────────────────────────────────────

  const totalSteps = 5;
  function goNext() { setStep((s) => Math.min(s + 1, 4)); }
  // Never allow step past 4 (e.g. from old session or voice)
  useEffect(() => { if (step > 4) setStep(4); }, [step]);
  function goBack() {
    if (step === 0) { navigate("/"); return; }
    setStep((s) => s - 1);
  }

  // ─── Derive displayName from type-specific name ──────────────────────────

  function deriveName(): string {
    const typeName = formData.salon_name || formData.clinic_name || formData.brand_name || formData.business_name || "";
    if (typeName.trim()) return typeName.trim();
    return yandleHandle.trim().replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
  }

  // ─── Voice onboarding ──────────────────────────────────────────────────────

  const endVoiceOnboarding = useCallback(() => {
    const sock = voiceSocketRef.current;
    if (sock?.connected) {
      sock.emit("stopAudio");
      sock.removeAllListeners();
      sock.disconnect();
      voiceSocketRef.current = null;
    }
    voiceMicRef.current?.getTracks().forEach((t) => t.stop());
    voiceMicRef.current = null;
    try { voiceCtxRef.current?.close(); } catch {}
    voiceCtxRef.current = null;
    voiceProcessorRef.current = null;
    voicePlaybackRef.current.forEach((s) => { try { s.stop(); } catch {} });
    voicePlaybackRef.current.clear();
    voicePlayQueueRef.current = { nextTime: 0 };
    setIsVoiceActive(false);
    setVoiceConnecting(false);
  }, []);

  // Ref so handleFinish is always current inside the callback
  const handleFinishRef = useRef<() => Promise<void>>(null!);

  const handleOnboardingFieldUpdate = useCallback((data: { field: string; value: string }) => {
    const { field, value } = data;

    if (field === "businessType") {
      const match = businessCases.find((c) => c.id === value);
      if (match) {
        setSelectedCase(match);
        setFormData({});
        setStep(2); // show the type selection step — agent will confirm before advancing
      }
    } else if (field === "handle") {
      setYandleHandle(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
      setStep(3); // show handle step with value filled — agent will confirm before advancing
    } else if (field === "goToStep") {
      const s = parseInt(value, 10);
      if (!isNaN(s) && s >= 0 && s <= 4) setStep(s);

    // ── Name fields → navigate to step 4 ──
    } else if (["salon_name", "clinic_name", "brand_name", "business_name"].includes(field)) {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setStep(4);

    // ── Complex data: add branch / location / doctor / service → ensure step 4 ──
    } else if (field === "addBranch") {
      setStep(4);
      try {
        const d = JSON.parse(value);
        setBizData((b) => ({ ...b, branches: [...b.branches, { id: uid(), name: d.name || "", address: d.address || "", capacity: d.capacity || 1, services: [] }] }));
      } catch { setBizData((b) => ({ ...b, branches: [...b.branches, { id: uid(), name: value, address: "", capacity: 1, services: [] }] })); }
    } else if (field === "addService") {
      setStep(4);
      try {
        const d = JSON.parse(value);
        setBizData((b) => {
          const branches = [...b.branches];
          const target = d.branchIndex != null ? branches[d.branchIndex] : branches[branches.length - 1];
          if (target) target.services = [...target.services, { id: uid(), name: d.name || "", gender: d.gender || "unisex", price: d.price || 0, durationMinutes: d.duration || 30, concurrent: d.concurrent || 1 }];
          return { ...b, branches };
        });
      } catch {}
    } else if (field === "addDoctor") {
      setStep(4);
      try {
        const d = JSON.parse(value);
        setBizData((b) => ({ ...b, doctors: [...b.doctors, { id: uid(), name: d.name || value, specialty: d.specialty || "", avgConsultMinutes: d.avgConsultMinutes || 15 }] }));
      } catch { setBizData((b) => ({ ...b, doctors: [...b.doctors, { id: uid(), name: value, specialty: "", avgConsultMinutes: 15 }] })); }
    } else if (field === "addLocation") {
      setStep(4);
      try {
        const d = JSON.parse(value);
        setBizData((b) => ({ ...b, generalLocations: [...b.generalLocations, { id: uid(), name: d.name || value, address: d.address || "" }] }));
      } catch { setBizData((b) => ({ ...b, generalLocations: [...b.generalLocations, { id: uid(), name: value, address: "" }] })); }
    } else if (field === "addGamingLocation") {
      setStep(4);
      try {
        const d = JSON.parse(value);
        setBizData((b) => ({ ...b, locations: [...b.locations, { id: uid(), name: d.name || value, address: d.address || "", machines: (d.machines || []).map((m: any) => ({ id: uid(), type: m.type || "", qty: m.qty || 1, pricePerHour: m.pricePerHour || 0 })) }] }));
      } catch { setBizData((b) => ({ ...b, locations: [...b.locations, { id: uid(), name: value, address: "", machines: [] }] })); }
    } else if (field === "addSupportCategory") {
      setStep(4);
      setBizData((b) => ({ ...b, supportCategories: [...b.supportCategories, { id: uid(), name: value }] }));
    } else if (field === "setSla") {
      setStep(4);
      try {
        const d = JSON.parse(value);
        setBizData((b) => ({ ...b, slaResponseHours: d.response || b.slaResponseHours, slaResolutionHours: d.resolution || b.slaResolutionHours }));
      } catch {}

    // ── Finish: submit the onboarding ──
    } else if (field === "finish") {
      handleFinishRef.current?.();

    // ── Simple fields ──
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }

    toast({ title: "Voice input", description: `${field}` });
  }, [toast]);

  const toggleVoiceOnboarding = async () => {
    if (isVoiceActive) { endVoiceOnboarding(); return; }

    setVoiceConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceMicRef.current = stream;
    } catch {
      toast({ title: "Microphone error", description: "Allow mic access and try again.", variant: "destructive" });
      setVoiceConnecting(false);
      return;
    }

    if (!apiBase) { setVoiceConnecting(false); return; }

    let sonicUrl = "";
    try {
      const configResp = await fetch(`${apiBase}/sonic/config`);
      if (!configResp.ok) throw new Error("Could not fetch Sonic config");
      const configData = await configResp.json();
      sonicUrl = configData.sonicServiceUrl || "";
      if (!sonicUrl) throw new Error("Sonic URL unavailable");
    } catch (err) {
      toast({ title: "Connection error", description: (err as Error).message, variant: "destructive" });
      voiceMicRef.current?.getTracks().forEach((t) => t.stop());
      voiceMicRef.current = null;
      setVoiceConnecting(false);
      return;
    }

    const socket = io(sonicUrl, { path: "/socket.io/", transports: ["polling", "websocket"], reconnection: false });
    voiceSocketRef.current = socket;

    socket.on("connect_error", () => { endVoiceOnboarding(); });

    try {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Timeout")), 15000);
        socket.emit("initializeConnection", { region: "us-east-1", mode: "onboarding" }, (ack: { success?: boolean; error?: string }) => {
          clearTimeout(t);
          if (ack?.success) resolve();
          else reject(new Error(ack?.error || "Failed"));
        });
      });
    } catch {
      endVoiceOnboarding();
      return;
    }

    const systemPrompt = `You are a YANDLE onboarding assistant. You guide the user through setting up their business completely via voice. You handle EVERYTHING — the user just talks and you fill forms, navigate steps, add data, and submit. Be warm, concise (1-2 sentences per response), and ask one question at a time.

CRITICAL RULE — ALWAYS CONFIRM BEFORE ADVANCING:
- After filling in a field or completing a step, ALWAYS read back what you entered and ask "Does that look right?" or "Should I change anything?"
- ONLY move to the next step after the user confirms (says yes, correct, looks good, etc.)
- If the user wants to change something, update the field and confirm again before advancing.
- NEVER auto-advance to the next step without explicit user confirmation.

The UI has these steps that the user can see. You MUST guide them through each step in order:

STEP 0 — Welcome (currently visible). Greet them warmly. Briefly explain YANDLE gives them a business website, chat widget, and shareable link. Ask if they're ready to get started. When they say yes, move to step 1:
   → field="goToStep" value="1"

STEP 1 — Phone Number. The screen shows available phone numbers. Ask "Would you like to pick an AI phone number for your business? Customers will be able to call it." WAIT for the user to either pick a number on screen or say they want to skip. Do NOT advance until they explicitly say they've picked one or want to skip. Then ask "Ready to move on?" and only advance after confirmation:
   → field="goToStep" value="2"

STEP 2 — Business Type. Ask what type of business they have. Options: Gaming Cafe, Salon, Clinic, General Business, or Customer Support. Wait for their answer.
   → field="businessType" value="<id>" where id is one of: gaming_cafe, salon, clinic, general, customer_support
   After setting the type, confirm: "I've set your business type to [type]. Is that correct?"
   (This auto-shows step 2 briefly, then advances to step 3)

STEP 3 — Handle. Suggest a URL handle based on their business name/type (e.g. "glamour-studio"). Say: "Your unique link will be callcentral.io/[handle]. How does that sound? You can change it if you'd like."
   → field="handle" value="<slug>"
   WAIT for confirmation. If they want changes, update the handle and confirm again.
   Only after they confirm: field="goToStep" value="4"

STEP 4 — Business Details. First set the business name:
   → salon: field="salon_name" | clinic: field="clinic_name" | gaming_cafe: field="brand_name" | general or customer_support: field="business_name"
   Confirm the name before continuing to type-specific details.

   Then collect type-specific details:
   SALON → Ask about branches: field="addBranch" value='{"name":"...","address":"..."}'
     Then services at that branch: field="addService" value='{"name":"...","gender":"unisex","price":500,"duration":30}'
     After each service, ask "Want to add another service, or are we good?"
   CLINIC → Doctors: field="addDoctor" value='{"name":"...","specialty":"...","avgConsultMinutes":15}'
     After each doctor, ask "Want to add another doctor?"
   GAMING_CAFE → Locations: field="addGamingLocation" value='{"name":"...","address":"...","machines":[{"type":"High-end PC","qty":10,"pricePerHour":200}]}'
   GENERAL → Locations: field="addLocation" value='{"name":"...","address":"..."}'
   CUSTOMER_SUPPORT → Categories: field="addSupportCategory" value="Billing" (once per category)
     Then SLA: field="setSla" value='{"response":24,"resolution":72}'

FINISH — When they're done adding details, summarize everything: business type, name, handle, and all details added. Ask "Everything looks good. Should I complete the setup?" Only after they confirm:
   → field="finish" value="true"

RULES:
- ALWAYS use updateOnboardingField tool for every piece of info. Never just acknowledge without calling the tool.
- You can call the tool multiple times in sequence if the user gives several pieces of info at once.
- Values for addBranch, addService, addDoctor, addGamingLocation, addLocation, setSla must be valid JSON strings.
- addSupportCategory value is just the category name string.
- Keep it conversational. If the user says "I have a salon called Glamour", set businessType AND salon_name in two tool calls, then confirm both.
- Follow the step order. Don't skip steps unless the user explicitly asks to.
- NEVER advance to the next step without user saying yes/correct/confirmed.`;

    socket.emit("promptStart", { voiceId: "tiffany", outputSampleRate: 24000 });
    socket.emit("systemPrompt", { content: systemPrompt, voiceId: "tiffany" });
    socket.emit("audioStart");

    socket.once("audioReady", () => {
      socket.emit("textInput", { role: "user", content: "[The user just started voice onboarding. Greet them and ask what type of business they have.]" });
      setIsVoiceActive(true);
      setVoiceConnecting(false);

      const stream = voiceMicRef.current;
      if (!stream) return;
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({ sampleRate: 16000 });
      voiceCtxRef.current = ctx;
      if (ctx.state === "suspended") ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      voiceProcessorRef.current = processor;
      processor.onaudioprocess = (e) => {
        const sock = voiceSocketRef.current;
        if (!sock?.connected) return;
        const inp = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(inp.length);
        for (let i = 0; i < inp.length; i++) { const s = Math.max(-1, Math.min(1, inp[i])); pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
        sock.emit("audioInput", btoa(String.fromCharCode(...new Uint8Array(pcm.buffer))));
      };
      source.connect(processor);
      processor.connect(ctx.destination);
    });

    socket.on("audioOutput", (data: { content?: string }) => {
      const content = data?.content;
      if (!content) return;
      try {
        const ctx = voiceCtxRef.current;
        if (!ctx) return;
        if (ctx.state === "suspended") ctx.resume();
        const binary = atob(content);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const numSamples = bytes.length / 2;
        const buffer = ctx.createBuffer(1, numSamples, 24000);
        const channel = buffer.getChannelData(0);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < numSamples; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
        const ref = voicePlayQueueRef.current;
        const startTime = ref.nextTime < ctx.currentTime ? ctx.currentTime : ref.nextTime;
        ref.nextTime = startTime + buffer.duration;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        voicePlaybackRef.current.add(src);
        src.onended = () => voicePlaybackRef.current.delete(src);
        src.start(startTime);
      } catch {}
    });

    socket.on("interruption", () => {
      const ctx = voiceCtxRef.current;
      if (!ctx) return;
      voicePlaybackRef.current.forEach((s) => { try { s.stop(); } catch {} });
      voicePlaybackRef.current.clear();
      voicePlayQueueRef.current.nextTime = ctx.currentTime;
    });

    socket.on("onboardingFieldUpdate", handleOnboardingFieldUpdate);
    socket.on("sessionClosed", endVoiceOnboarding);
  };

  // Cleanup voice on unmount
  useEffect(() => () => { endVoiceOnboarding(); }, [endVoiceOnboarding]);

  // ─── Submit ────────────────────────────────────────────────────────────────

  const handleFinish = async () => {
    const normalizedHandle = yandleHandle.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!normalizedHandle) {
      toast({ title: "Handle required", description: "Please choose a YANDLE handle." });
      return;
    }

    setIsSaving(true);
    const sub = getCurrentUserSub();
    const storageKey = getOnboardingStorageKey(sub);
    const name = deriveName();

    localStorage.setItem(storageKey, JSON.stringify({
      ownerSub: sub,
      useCaseId: selectedCase?.id,
      formData: { ...formData, ...bizData },
      yandleHandle: normalizedHandle,
      displayName: name,
    }));

    if (!apiBase) {
      toast({ title: "Backend not configured", description: "Set VITE_API_BASE_URL in web/.env.local.", variant: "destructive" });
      setIsSaving(false);
      return;
    }

    const token = localStorage.getItem("yandle_id_token") || "";

    try {
      // 1. Create handle (no primary address — locations have their own addresses)
      const resp = await fetch(`${apiBase}/handle`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          handle: normalizedHandle,
          displayName: name,
          textEnabled: true,
          voiceEnabled: true,
          useCaseId: selectedCase?.id,
          persona: selectedCase ? `You are a helpful AI assistant for ${name}, a ${selectedCase.title.toLowerCase()}. Answer questions about services, bookings, and availability professionally.` : "YANDLE assistant",
          knowledgeSummary: JSON.stringify(formData).slice(0, 1500),
          captureEmail: false,
          capturePhone: true,
          businessName: name,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        let msg = errText;
        try { const j = JSON.parse(errText); msg = j.details || j.error || j.message || errText; } catch { /* ok */ }
        throw new Error(msg || `HTTP ${resp.status}`);
      }

      // 2. Assign phone number if selected
      if (selectedPhone && paymentDone) {
        try {
          await fetch(`${apiBase}/phone-numbers/assign`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body: JSON.stringify({ handle: normalizedHandle, phoneNumber: selectedPhone }),
          });
        } catch (e) {
          console.warn("[onboarding] phone assignment failed:", e);
        }
      }

      // 3. Business-specific: POST structured data
      if (selectedCase) {
        if (selectedCase.id === "gaming_cafe" && bizData.locations.length > 0) {
          await Promise.all(bizData.locations.map(async (loc) => {
            await fetch(`${apiBase}/centers`, {
              method: "POST",
              headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
              body: JSON.stringify({
                handle: normalizedHandle,
                name: loc.name,
                location: loc.address,
                address: loc.address,
                geoLat: loc.lat,
                geoLng: loc.lng,
                placeId: loc.placeId,
                machines: loc.machines.map((m) => ({ name: m.type, type: m.type, count: m.qty, pricePerHour: m.pricePerHour })),
              }),
            });
          }));
        } else if (selectedCase.id === "salon" && bizData.branches.length > 0) {
          for (const branch of bizData.branches) {
            const br = await fetch(`${apiBase}/branches`, {
              method: "POST",
              headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
              body: JSON.stringify({ handle: normalizedHandle, name: branch.name, location: branch.address, address: branch.address, geoLat: branch.lat, geoLng: branch.lng, placeId: branch.placeId, capacity: branch.capacity }),
            });
            if (br.ok) {
              const brData = await br.json();
              const branchId = brData?.branch?.branchId;
              if (branchId && branch.services.length > 0) {
                await Promise.all(branch.services.map((svc) =>
                  fetch(`${apiBase}/services`, {
                    method: "POST",
                    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                      handle: normalizedHandle, branchId, name: svc.name, gender: svc.gender,
                      priceCents: Math.round(svc.price * 100), durationMinutes: svc.durationMinutes,
                      concurrent: svc.concurrent, useCaseId: "salon",
                    }),
                  })
                ));
              }
            }
          }
        } else if (selectedCase.id === "clinic" && bizData.doctors.length > 0) {
          await Promise.all(bizData.doctors.map((doc) =>
            fetch(`${apiBase}/doctors`, {
              method: "POST",
              headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
              body: JSON.stringify({
                handle: normalizedHandle, name: doc.name, specialty: doc.specialty, avgConsultMinutes: doc.avgConsultMinutes,
              }),
            })
          ));
        } else if (selectedCase.id === "general" && bizData.generalLocations.length > 0) {
          await Promise.all(bizData.generalLocations.map(async (loc) => {
            await fetch(`${apiBase}/locations`, {
              method: "POST",
              headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
              body: JSON.stringify({
                handle: normalizedHandle, name: loc.name, address: loc.address, geoLat: loc.lat, geoLng: loc.lng, placeId: loc.placeId,
              }),
            });
          }));
        } else if (selectedCase.id === "customer_support") {
          // Save support config (categories + SLA)
          if (bizData.supportCategories.length > 0) {
            await fetch(`${apiBase}/config/slots`, {
              method: "POST",
              headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
              body: JSON.stringify({
                handle: normalizedHandle,
                supportCategories: bizData.supportCategories.map((c) => c.name),
                slaResponseHours: bizData.slaResponseHours,
                slaResolutionHours: bizData.slaResolutionHours,
              }),
            });
          }
          // Save locations
          if (bizData.generalLocations.length > 0) {
            await Promise.all(bizData.generalLocations.map(async (loc) => {
              await fetch(`${apiBase}/locations`, {
                method: "POST",
                headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  handle: normalizedHandle, name: loc.name, address: loc.address, geoLat: loc.lat, geoLng: loc.lng, placeId: loc.placeId,
                }),
              });
            }));
          }
        }
      }

      setIsSaving(false);
      navigate("/dashboard");
    } catch (err) {
      toast({ title: "Could not create profile", description: (err as Error).message, variant: "destructive" });
      setIsSaving(false);
    }
  };

  // Keep ref in sync so voice callback can call latest handleFinish
  handleFinishRef.current = handleFinish;

  // ─── Step content ──────────────────────────────────────────────────────────

  const renderStep = () => {
    // Step 0: Feature Showcase
    if (step === 0) {
      return (
        <div className="space-y-8 max-w-xl mx-auto">
          <div className="text-center space-y-3">
            <h1 className="font-display text-3xl sm:text-4xl font-bold">Welcome to YANDLE</h1>
            <p className="text-muted-foreground text-lg">Here's what your business gets</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: Globe, title: "Business Website", desc: "A professionally generated website for your business, fully customizable." },
              { icon: Code, title: "Chat Widget", desc: "An embeddable AI chat widget you can add to any existing website." },
              { icon: LinkIcon, title: "Shareable Link", desc: "A direct link for voice & chat conversations with your AI assistant." },
            ].map((item) => (
              <Card key={item.title} className="bg-card/50 border-primary/20 overflow-hidden">
                <CardContent className="p-5 text-center space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <item.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center">
            <p className="text-sm text-muted-foreground">Plus optional: AI phone number, credits system, and more</p>
          </div>
        </div>
      );
    }

    // Step 1: Phone Number (Optional)
    if (step === 1) {
      return (
        <div className="space-y-8 max-w-xl mx-auto">
          <div className="text-center space-y-3">
            <h1 className="font-display text-3xl sm:text-4xl font-bold">Get a phone number</h1>
            <p className="text-muted-foreground text-lg">Customers can call your AI directly on a real phone number</p>
          </div>

          <Card className="bg-card/50 border-border">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold">Phone Number Plan</p>
                  <p className="text-sm text-muted-foreground">Rs 500/month &middot; 1000 free credits included</p>
                </div>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3 text-xs text-muted-foreground space-y-1">
                <p><strong className="text-foreground">Voice:</strong> 10 credits per minute</p>
                <p><strong className="text-foreground">Text:</strong> 1 credit per message</p>
              </div>

              {/* Toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setWantsPhone(!wantsPhone); setSelectedPhone(null); setPaymentDone(false); }}
                  className={`relative w-12 h-6 rounded-full transition-colors ${wantsPhone ? "bg-primary" : "bg-secondary"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${wantsPhone ? "translate-x-6" : "translate-x-0.5"}`} />
                </button>
                <span className="text-sm">{wantsPhone ? "Yes, I want a phone number" : "Skip for now"}</span>
              </div>

              {/* Phone selection */}
              {wantsPhone && (
                <div className="space-y-3">
                  {loadingPhones ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading available numbers...</div>
                  ) : availablePhones.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No numbers available at the moment.</p>
                  ) : (
                    <>
                      <Label className="text-xs">Choose a number</Label>
                      <Select value={selectedPhone || ""} onValueChange={setSelectedPhone}>
                        <SelectTrigger className="bg-card/60"><SelectValue placeholder="Select a phone number" /></SelectTrigger>
                        <SelectContent>
                          {availablePhones.map((p) => (
                            <SelectItem key={p.phoneNumber} value={p.phoneNumber}>{p.phoneNumber}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}

                  {selectedPhone && !paymentDone && (
                    <Button onClick={dummyPayment} disabled={paymentLoading} className="w-full gap-2">
                      {paymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                      {paymentLoading ? "Processing..." : `Pay Rs 500 for ${selectedPhone}`}
                    </Button>
                  )}

                  {paymentDone && (
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm text-emerald-600 dark:text-emerald-400">Payment successful! {selectedPhone} reserved.</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    // Step 2: Business type
    if (step === 2) {
      return (
        <div className="space-y-8">
          <div className="text-center space-y-3">
            <h1 className="font-display text-3xl sm:text-4xl font-bold">What type of business?</h1>
            <p className="text-muted-foreground text-lg">Pick your category</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {businessCases.map((uc) => (
              <button
                key={uc.id}
                onClick={() => { setSelectedCase(uc); setFormData({}); goNext(); }}
                className={`group rounded-xl border-2 p-5 text-left transition-all duration-300 hover:border-primary/50 ${
                  selectedCase?.id === uc.id ? "border-primary bg-primary/5" : "border-border bg-card/50"
                }`}
              >
                <uc.icon className="h-6 w-6 text-primary mb-3" />
                <h3 className="font-display text-lg font-semibold mb-1">{uc.title}</h3>
                <p className="text-sm text-muted-foreground">{uc.desc}</p>
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Step 3: Handle only (no location, no displayName)
    if (step === 3) {
      return (
        <div className="space-y-8 max-w-md mx-auto">
          <div className="text-center space-y-3">
            <h1 className="font-display text-3xl sm:text-4xl font-bold">Choose your handle</h1>
            <p className="text-muted-foreground">This will be your unique link for customers to find you</p>
          </div>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>YANDLE handle</Label>
              <div className="flex rounded-lg border border-border bg-card/50 overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                <span className="px-3 text-sm text-muted-foreground bg-secondary/50 h-10 flex items-center whitespace-nowrap">callcentral.io/</span>
                <input
                  value={yandleHandle}
                  onChange={(e) => setYandleHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="yourname"
                  className="flex-1 h-10 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">Letters, numbers, and hyphens only. e.g. my-salon</p>
            </div>
          </div>
        </div>
      );
    }

    // Step 4: Type-specific setup (also show this if step > 4 so we never show a blank step 5)
    if (step >= 4) {
      const stepTitle = selectedCase?.id === "gaming_cafe" ? "Locations & Machines"
        : selectedCase?.id === "salon" ? "Branches & Services"
        : selectedCase?.id === "clinic" ? "Doctors"
        : selectedCase?.id === "general" ? "Business Details"
        : selectedCase?.id === "customer_support" ? "Support Setup"
        : "Setup";

      const stepDesc = selectedCase?.id === "gaming_cafe" ? "Add your gaming locations and the machines available at each."
        : selectedCase?.id === "salon" ? "Add branches and the services offered at each."
        : selectedCase?.id === "clinic" ? "Add your doctors and their consultation details."
        : selectedCase?.id === "general" ? "Add your business details and locations."
        : selectedCase?.id === "customer_support" ? "Configure support categories and SLA settings."
        : "";

      // If no business type selected (e.g. landed here via voice or refresh), show recovery
      if (!selectedCase) {
        return (
          <div className="space-y-8 max-w-2xl mx-auto">
            <div className="text-center space-y-3">
              <h1 className="font-display text-3xl sm:text-4xl font-bold">Setup</h1>
              <p className="text-muted-foreground">Choose your business type to continue.</p>
            </div>
            <Card className="bg-card/50 border-border max-w-md mx-auto">
              <CardContent className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground">No business type was selected. Go back and pick one to see your setup options.</p>
                <Button variant="outline" onClick={() => setStep(2)} className="w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back to business type
                </Button>
              </CardContent>
            </Card>
          </div>
        );
      }

      return (
        <div className="space-y-8 max-w-2xl mx-auto">
          <div className="text-center space-y-3">
            <h1 className="font-display text-3xl sm:text-4xl font-bold">{stepTitle}</h1>
            <p className="text-muted-foreground">{stepDesc}</p>
          </div>

          {/* Type-specific name field (replaces displayName from old Step 2) */}
          <div className="space-y-4 max-w-md mx-auto">
            {(selectedCase.fields ?? []).map((field) => (
              <div key={field.name} className="space-y-2">
                <Label>{field.label}</Label>
                {field.type === "textarea" ? (
                  <Textarea value={formData[field.name] || ""} onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })} placeholder={field.placeholder} className="bg-card/50" />
                ) : (
                  <Input value={formData[field.name] || ""} onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })} placeholder={field.placeholder} className="bg-card/50" />
                )}
              </div>
            ))}
          </div>

          {selectedCase?.id === "gaming_cafe" && (
            <GamingSetup locations={bizData.locations} onChange={(locs) => setBizData((b) => ({ ...b, locations: locs }))} />
          )}
          {selectedCase?.id === "salon" && (
            <SalonSetup branches={bizData.branches} onChange={(branches) => setBizData((b) => ({ ...b, branches }))} />
          )}
          {selectedCase?.id === "clinic" && (
            <ClinicSetup doctors={bizData.doctors} onChange={(doctors) => setBizData((b) => ({ ...b, doctors }))} />
          )}
          {selectedCase?.id === "general" && (
            <GeneralSetup locations={bizData.generalLocations} onChange={(locs) => setBizData((b) => ({ ...b, generalLocations: locs }))} />
          )}
          {selectedCase?.id === "customer_support" && (
            <CustomerSupportSetup
              categories={bizData.supportCategories}
              locations={bizData.generalLocations}
              slaResponseHours={bizData.slaResponseHours}
              slaResolutionHours={bizData.slaResolutionHours}
              onCategoriesChange={(cats) => setBizData((b) => ({ ...b, supportCategories: cats }))}
              onLocationsChange={(locs) => setBizData((b) => ({ ...b, generalLocations: locs }))}
              onSlaChange={(resp, res) => setBizData((b) => ({ ...b, slaResponseHours: resp, slaResolutionHours: res }))}
            />
          )}
        </div>
      );
    }

    return null;
  };

  const isLastStep = step >= 4;
  const canProceed = step === 3 ? yandleHandle.trim().length >= 2 : true;

  return (
    <div className="min-h-screen bg-background bg-grid relative">
      <div className="bg-radial-glow absolute inset-0 pointer-events-none" />

      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-secondary">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: "0%" }}
          animate={{ width: `${((step + 1) / (totalSteps + 1)) * 100}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <button onClick={goBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <span className="font-display text-lg font-bold text-gradient-primary">YANDLE</span>
        <span className="text-xs text-muted-foreground">Step {Math.min(step + 1, 5)}</span>
      </div>

      {/* Content */}
      <div className="relative z-10 px-6 py-12 pb-32">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }}>
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer actions */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/80 backdrop-blur-lg border-t border-border">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          {isLastStep ? (
            <Button size="lg" className="gap-2" disabled={isSaving || !canProceed} onClick={handleFinish}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {isSaving ? "Creating..." : "Launch Dashboard"}
            </Button>
          ) : (
            <Button size="lg" className="gap-2" onClick={goNext} disabled={!canProceed}>
              {step === 0 ? "Get Started" : "Continue"} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Floating voice onboarding mic */}
      {step >= 0 && (
        <button
          onClick={toggleVoiceOnboarding}
          disabled={voiceConnecting}
          className={`fixed bottom-24 right-6 z-[60] h-14 w-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
            isVoiceActive
              ? "bg-red-500 hover:bg-red-600 text-white scale-110"
              : voiceConnecting
                ? "bg-primary/80 text-primary-foreground cursor-wait"
                : "bg-primary hover:bg-primary/90 text-primary-foreground hover:scale-105"
          }`}
          title={isVoiceActive ? "Stop voice onboarding" : "Start voice onboarding"}
        >
          {voiceConnecting ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : isVoiceActive ? (
            <MicOff className="h-6 w-6" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
          {isVoiceActive && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-400 animate-ping" />
          )}
        </button>
      )}
    </div>
  );
};

// ─── Gaming Cafe Setup ────────────────────────────────────────────────────────

function GamingSetup({ locations, onChange }: { locations: GamingLocation[]; onChange: (l: GamingLocation[]) => void }) {
  const addLocation = () => onChange([...locations, { id: uid(), name: "", address: "", machines: [] }]);
  const removeLocation = (id: string) => onChange(locations.filter((l) => l.id !== id));
  const updateLocation = (id: string, patch: Partial<GamingLocation>) => onChange(locations.map((l) => l.id === id ? { ...l, ...patch } : l));
  const addMachine = (locId: string) => updateLocation(locId, { machines: [...(locations.find((l) => l.id === locId)?.machines || []), { id: uid(), type: "", qty: 1, pricePerHour: 0 }] });
  const removeMachine = (locId: string, mId: string) => updateLocation(locId, { machines: (locations.find((l) => l.id === locId)?.machines || []).filter((m) => m.id !== mId) });
  const updateMachine = (locId: string, mId: string, patch: object) => updateLocation(locId, {
    machines: (locations.find((l) => l.id === locId)?.machines || []).map((m) => m.id === mId ? { ...m, ...patch } : m),
  });

  return (
    <div className="space-y-4">
      {locations.map((loc) => (
        <Card key={loc.id} className="bg-card/50 border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Input value={loc.name} onChange={(e) => updateLocation(loc.id, { name: e.target.value })} placeholder="Location name (e.g. XP Arena Downtown)" className="flex-1 bg-card/60 h-9" />
              <button type="button" onClick={() => removeLocation(loc.id)} className="text-muted-foreground hover:text-destructive p-1 shrink-0"><Trash2 className="h-4 w-4" /></button>
            </div>
            <PlacesAddressInput
              value={loc.address}
              onChange={({ address, lat, lng, placeId }) => updateLocation(loc.id, { address, ...(lat != null ? { lat, lng } : {}), ...(placeId ? { placeId } : {}) })}
              placeholder="Search location address..."
            />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Machine types</p>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => addMachine(loc.id)}><Plus className="h-3 w-3 mr-1" /> Add</Button>
              </div>
              {loc.machines.map((m) => (
                <div key={m.id} className="grid grid-cols-[1fr_0.5fr_0.6fr_auto] gap-2 items-center">
                  <Input value={m.type} onChange={(e) => updateMachine(loc.id, m.id, { type: e.target.value })} placeholder="Type (e.g. High-end PC)" className="bg-card/60 h-8 text-xs" />
                  <Input type="number" min={1} value={m.qty || ""} onChange={(e) => updateMachine(loc.id, m.id, { qty: Number(e.target.value) || 1 })} placeholder="Qty" className="bg-card/60 h-8 text-xs" />
                  <Input type="number" min={0} step="0.01" value={m.pricePerHour || ""} onChange={(e) => updateMachine(loc.id, m.id, { pricePerHour: Number(e.target.value) || 0 })} placeholder="Rs/hr" className="bg-card/60 h-8 text-xs" />
                  <button type="button" onClick={() => removeMachine(loc.id, m.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
      <Button type="button" variant="outline" className="w-full gap-2" onClick={addLocation}>
        <Plus className="h-4 w-4" /> Add location
      </Button>
      {locations.length === 0 && <p className="text-xs text-muted-foreground text-center">You can also add locations later from the dashboard.</p>}
    </div>
  );
}

// ─── Salon Setup ──────────────────────────────────────────────────────────────

function SalonSetup({ branches, onChange }: { branches: SalonBranch[]; onChange: (b: SalonBranch[]) => void }) {
  const addBranch = () => onChange([...branches, { id: uid(), name: "", address: "", capacity: 1, services: [] }]);
  const removeBranch = (id: string) => onChange(branches.filter((b) => b.id !== id));
  const updateBranch = (id: string, patch: Partial<SalonBranch>) => onChange(branches.map((b) => b.id === id ? { ...b, ...patch } : b));
  const addService = (brId: string) => updateBranch(brId, { services: [...(branches.find((b) => b.id === brId)?.services || []), { id: uid(), name: "", gender: "unisex", price: 0, durationMinutes: 30, concurrent: 1 }] });
  const removeService = (brId: string, sId: string) => updateBranch(brId, { services: (branches.find((b) => b.id === brId)?.services || []).filter((s) => s.id !== sId) });
  const updateService = (brId: string, sId: string, patch: object) => updateBranch(brId, {
    services: (branches.find((b) => b.id === brId)?.services || []).map((s) => s.id === sId ? { ...s, ...patch } : s),
  });

  return (
    <div className="space-y-4">
      {branches.map((br) => (
        <Card key={br.id} className="bg-card/50 border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Input value={br.name} onChange={(e) => updateBranch(br.id, { name: e.target.value })} placeholder="Branch name (e.g. Main Branch)" className="flex-1 bg-card/60 h-9" />
              <button type="button" onClick={() => removeBranch(br.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <PlacesAddressInput
                value={br.address}
                onChange={({ address, lat, lng, placeId }) => updateBranch(br.id, { address, ...(lat != null ? { lat, lng } : {}), ...(placeId ? { placeId } : {}) })}
                placeholder="Search branch address..."
              />
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0">Seats</Label>
                <Input type="number" min={1} value={br.capacity || ""} onChange={(e) => updateBranch(br.id, { capacity: Number(e.target.value) || 1 })} className="bg-card/60 h-9 text-sm w-20" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Services at this branch</p>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => addService(br.id)}><Plus className="h-3 w-3 mr-1" /> Add</Button>
              </div>
              {br.services.map((svc) => (
                <div key={svc.id} className="rounded-lg border border-border/50 bg-card/40 p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={svc.name} onChange={(e) => updateService(br.id, svc.id, { name: e.target.value })} placeholder="Service name (e.g. Haircut)" className="flex-1 bg-card/60 h-8 text-xs" />
                    <Select value={svc.gender} onValueChange={(v) => updateService(br.id, svc.id, { gender: v })}>
                      <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="men">Men</SelectItem>
                        <SelectItem value="women">Women</SelectItem>
                        <SelectItem value="unisex">Unisex</SelectItem>
                      </SelectContent>
                    </Select>
                    <button type="button" onClick={() => removeService(br.id, svc.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3 w-3" /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><p className="text-[10px] text-muted-foreground mb-1">Price (Rs)</p><Input type="number" min={0} value={svc.price || ""} onChange={(e) => updateService(br.id, svc.id, { price: Number(e.target.value) || 0 })} className="bg-card/60 h-7 text-xs" /></div>
                    <div><p className="text-[10px] text-muted-foreground mb-1">Duration (min)</p><Input type="number" min={5} value={svc.durationMinutes || ""} onChange={(e) => updateService(br.id, svc.id, { durationMinutes: Number(e.target.value) || 30 })} className="bg-card/60 h-7 text-xs" /></div>
                    <div><p className="text-[10px] text-muted-foreground mb-1">Concurrent slots</p><Input type="number" min={1} value={svc.concurrent || ""} onChange={(e) => updateService(br.id, svc.id, { concurrent: Number(e.target.value) || 1 })} className="bg-card/60 h-7 text-xs" /></div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
      <Button type="button" variant="outline" className="w-full gap-2" onClick={addBranch}><Plus className="h-4 w-4" /> Add branch</Button>
      {branches.length === 0 && <p className="text-xs text-muted-foreground text-center">You can add branches later from the dashboard.</p>}
    </div>
  );
}

// ─── Clinic Setup ─────────────────────────────────────────────────────────────

function ClinicSetup({ doctors, onChange }: { doctors: ClinicDoctor[]; onChange: (d: ClinicDoctor[]) => void }) {
  const addDoctor = () => onChange([...doctors, { id: uid(), name: "", specialty: "", avgConsultMinutes: 15 }]);
  const removeDoctor = (id: string) => onChange(doctors.filter((d) => d.id !== id));
  const updateDoctor = (id: string, patch: Partial<ClinicDoctor>) => onChange(doctors.map((d) => d.id === id ? { ...d, ...patch } : d));

  return (
    <div className="space-y-4">
      {doctors.map((doc) => (
        <Card key={doc.id} className="bg-card/50 border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Input value={doc.name} onChange={(e) => updateDoctor(doc.id, { name: e.target.value })} placeholder="Doctor name (e.g. Dr. Priya Sharma)" className="flex-1 bg-card/60 h-9" />
              <button type="button" onClick={() => removeDoctor(doc.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Specialization</Label><Input value={doc.specialty} onChange={(e) => updateDoctor(doc.id, { specialty: e.target.value })} placeholder="e.g. General, Dental, ENT" className="bg-card/60 h-9 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Avg consult (minutes)</Label><Input type="number" min={5} value={doc.avgConsultMinutes || ""} onChange={(e) => updateDoctor(doc.id, { avgConsultMinutes: Number(e.target.value) || 15 })} className="bg-card/60 h-9 text-sm" /></div>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button type="button" variant="outline" className="w-full gap-2" onClick={addDoctor}><Plus className="h-4 w-4" /> Add doctor</Button>
      {doctors.length === 0 && <p className="text-xs text-muted-foreground text-center">You can add doctors later from the dashboard.</p>}
      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Token queue:</strong> Patients can get a token number and estimated wait time. Managers update the queue status (Waiting → Called → Done) from the dashboard.
      </div>
    </div>
  );
}

// ─── General Business Setup ──────────────────────────────────────────────────

function GeneralSetup({ locations, onChange }: { locations: GeneralLocation[]; onChange: (l: GeneralLocation[]) => void }) {
  const addLocation = () => onChange([...locations, { id: uid(), name: "", address: "" }]);
  const removeLocation = (id: string) => onChange(locations.filter((l) => l.id !== id));
  const updateLocation = (id: string, patch: Partial<GeneralLocation>) => onChange(locations.map((l) => l.id === id ? { ...l, ...patch } : l));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Locations</Label>
        <p className="text-xs text-muted-foreground">Add your business locations so customers can find you.</p>
      </div>
      {locations.map((loc) => (
        <Card key={loc.id} className="bg-card/50 border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Input value={loc.name} onChange={(e) => updateLocation(loc.id, { name: e.target.value })} placeholder="Location name (e.g. Head Office)" className="flex-1 bg-card/60 h-9" />
              <button type="button" onClick={() => removeLocation(loc.id)} className="text-muted-foreground hover:text-destructive p-1 shrink-0"><Trash2 className="h-4 w-4" /></button>
            </div>
            <PlacesAddressInput
              value={loc.address}
              onChange={({ address, lat, lng, placeId }) => updateLocation(loc.id, { address, ...(lat != null ? { lat, lng } : {}), ...(placeId ? { placeId } : {}) })}
              placeholder="Search location address..."
            />
          </CardContent>
        </Card>
      ))}
      <Button type="button" variant="outline" className="w-full gap-2" onClick={addLocation}>
        <Plus className="h-4 w-4" /> Add location
      </Button>
      {locations.length === 0 && <p className="text-xs text-muted-foreground text-center">You can add locations later from the dashboard.</p>}
    </div>
  );
}

// ─── Customer Support Setup ──────────────────────────────────────────────────

function CustomerSupportSetup({
  categories, locations, slaResponseHours, slaResolutionHours,
  onCategoriesChange, onLocationsChange, onSlaChange,
}: {
  categories: SupportCategory[];
  locations: GeneralLocation[];
  slaResponseHours: number;
  slaResolutionHours: number;
  onCategoriesChange: (c: SupportCategory[]) => void;
  onLocationsChange: (l: GeneralLocation[]) => void;
  onSlaChange: (resp: number, res: number) => void;
}) {
  const addCategory = () => onCategoriesChange([...categories, { id: uid(), name: "" }]);
  const removeCategory = (id: string) => onCategoriesChange(categories.filter((c) => c.id !== id));
  const updateCategory = (id: string, name: string) => onCategoriesChange(categories.map((c) => c.id === id ? { ...c, name } : c));
  const addLocation = () => onLocationsChange([...locations, { id: uid(), name: "", address: "" }]);
  const removeLocation = (id: string) => onLocationsChange(locations.filter((l) => l.id !== id));
  const updateLocation = (id: string, patch: Partial<GeneralLocation>) => onLocationsChange(locations.map((l) => l.id === id ? { ...l, ...patch } : l));

  return (
    <div className="space-y-6">
      {/* Support Categories */}
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-medium">Support Categories</Label>
          <p className="text-xs text-muted-foreground mt-1">Define the types of issues customers can report. The AI will categorize tickets into these.</p>
        </div>
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center gap-2">
            <Input value={cat.name} onChange={(e) => updateCategory(cat.id, e.target.value)} placeholder="e.g. Billing, Technical, Account" className="flex-1 bg-card/60 h-9" />
            <button type="button" onClick={() => removeCategory(cat.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addCategory}>
          <Plus className="h-3 w-3" /> Add category
        </Button>
      </div>

      {/* SLA Settings */}
      <Card className="bg-card/50 border-border">
        <CardContent className="p-4 space-y-3">
          <Label className="text-sm font-medium">SLA Settings</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Response time (hours)</Label>
              <Input type="number" min={1} value={slaResponseHours} onChange={(e) => onSlaChange(Number(e.target.value) || 24, slaResolutionHours)} className="bg-card/60 h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Resolution time (hours)</Label>
              <Input type="number" min={1} value={slaResolutionHours} onChange={(e) => onSlaChange(slaResponseHours, Number(e.target.value) || 72)} className="bg-card/60 h-9 text-sm" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Locations */}
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-medium">Locations</Label>
          <p className="text-xs text-muted-foreground mt-1">Add office locations (optional).</p>
        </div>
        {locations.map((loc) => (
          <Card key={loc.id} className="bg-card/50 border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Input value={loc.name} onChange={(e) => updateLocation(loc.id, { name: e.target.value })} placeholder="Location name" className="flex-1 bg-card/60 h-9" />
                <button type="button" onClick={() => removeLocation(loc.id)} className="text-muted-foreground hover:text-destructive p-1 shrink-0"><Trash2 className="h-4 w-4" /></button>
              </div>
              <PlacesAddressInput
                value={loc.address}
                onChange={({ address, lat, lng, placeId }) => updateLocation(loc.id, { address, ...(lat != null ? { lat, lng } : {}), ...(placeId ? { placeId } : {}) })}
                placeholder="Search address..."
              />
            </CardContent>
          </Card>
        ))}
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addLocation}>
          <Plus className="h-3 w-3" /> Add location
        </Button>
      </div>
    </div>
  );
}

export default Onboarding;
