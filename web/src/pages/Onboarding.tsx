import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Plus, Trash2, Loader2, Check, Phone, CreditCard,
  Globe, MessageSquare, Link as LinkIcon, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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

type GamingLocation = { id: string; name: string; address: string; machines: { id: string; type: string; qty: number; pricePerHour: number }[] };
type SalonBranch = { id: string; name: string; address: string; capacity: number; services: { id: string; name: string; gender: "men" | "women" | "unisex"; price: number; durationMinutes: number; concurrent: number }[] };
type ClinicDoctor = { id: string; name: string; specialty: string; avgConsultMinutes: number };

type BusinessData = {
  locations: GamingLocation[];
  branches: SalonBranch[];
  doctors: ClinicDoctor[];
};

// ─── Main onboarding component ────────────────────────────────────────────────

const Onboarding = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Steps: 0=Phone Number, 1=Business Type, 2=Basic Info+Location, 3=Type-specific, 4=finish(auto)
  const [step, setStep] = useState(0);
  const [selectedCase, setSelectedCase] = useState<UseCase | null>(null);

  // Shared
  const [voxaHandle, setVoxaHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Phone number step
  const [wantsPhone, setWantsPhone] = useState(false);
  const [availablePhones, setAvailablePhones] = useState<{ phoneNumber: string; monthlyPrice: number }[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [paymentDone, setPaymentDone] = useState(false);
  const [loadingPhones, setLoadingPhones] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Location (Google Places)
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<{ description: string; place_id: string }[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<{ name: string; address: string; lat: number; lng: number } | null>(null);
  const autocompleteService = useRef<any>(null);
  const placesService = useRef<any>(null);
  const placesLoaded = useRef(false);

  // Business-specific
  const [bizData, setBizData] = useState<BusinessData>({ locations: [], branches: [], doctors: [] });

  // Load available phone numbers
  useEffect(() => {
    if (!apiBase) return;
    setLoadingPhones(true);
    const token = localStorage.getItem("voxa_id_token") || "";
    fetch(`${apiBase}/phone-numbers/available`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setAvailablePhones(d.numbers || []))
      .catch(() => {})
      .finally(() => setLoadingPhones(false));
  }, []);

  // Load Google Places API
  useEffect(() => {
    // Already loaded and ready
    if ((window as any).google?.maps?.places) {
      placesLoaded.current = true;
      return;
    }
    // Script tag exists but API not ready yet — poll until ready
    if (document.querySelector(`script[src*="maps.googleapis.com"]`)) {
      const check = setInterval(() => {
        if ((window as any).google?.maps?.places) {
          placesLoaded.current = true;
          clearInterval(check);
        }
      }, 200);
      return () => clearInterval(check);
    }
    // Load script fresh
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_PLACES_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => { placesLoaded.current = true; };
    document.head.appendChild(script);
  }, []);

  const searchPlaces = useCallback((query: string) => {
    if (!query || query.length < 3) { setPlaceResults([]); return; }
    if (!(window as any).google?.maps?.places) return;
    if (!autocompleteService.current) {
      autocompleteService.current = new (window as any).google.maps.places.AutocompleteService();
    }
    autocompleteService.current.getPlacePredictions(
      { input: query, types: ["establishment", "geocode"] },
      (predictions: any[], status: string) => {
        if (status === "OK" && predictions) {
          setPlaceResults(predictions.map((p: any) => ({ description: p.description, place_id: p.place_id })));
        }
      }
    );
  }, []);

  const selectPlace = useCallback((placeId: string, description: string) => {
    if (!(window as any).google?.maps?.places) return;
    if (!placesService.current) {
      const div = document.createElement("div");
      placesService.current = new (window as any).google.maps.places.PlacesService(div);
    }
    placesService.current.getDetails(
      { placeId, fields: ["geometry", "name", "formatted_address"] },
      (place: any, status: string) => {
        if (status === "OK" && place?.geometry?.location) {
          setSelectedPlace({
            name: place.name || description,
            address: place.formatted_address || description,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          });
          setPlaceQuery(place.formatted_address || description);
          setPlaceResults([]);
        }
      }
    );
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

  const totalSteps = 4;
  function goNext() { setStep((s) => s + 1); }
  function goBack() {
    if (step === 0) { navigate("/"); return; }
    setStep((s) => s - 1);
  }

  // ─── Submit ────────────────────────────────────────────────────────────────

  const handleFinish = async () => {
    const normalizedHandle = voxaHandle.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!normalizedHandle) {
      toast({ title: "Handle required", description: "Please choose a VOXA handle." });
      return;
    }

    setIsSaving(true);
    const sub = getCurrentUserSub();
    const storageKey = getOnboardingStorageKey(sub);
    const name = displayName.trim() || normalizedHandle.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    localStorage.setItem(storageKey, JSON.stringify({
      ownerSub: sub,
      useCaseId: selectedCase?.id,
      formData: { ...formData, ...bizData },
      voxaHandle: normalizedHandle,
      displayName: name,
    }));

    if (!apiBase) {
      toast({ title: "Backend not configured", description: "Set VITE_API_BASE_URL in web/.env.local.", variant: "destructive" });
      setIsSaving(false);
      return;
    }

    const token = localStorage.getItem("voxa_id_token") || "";

    try {
      // 1. Create handle
      const resp = await fetch(`${apiBase}/handle`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          handle: normalizedHandle,
          displayName: name,
          textEnabled: true,
          voiceEnabled: true,
          useCaseId: selectedCase?.id,
          persona: selectedCase ? `You are a helpful AI assistant for ${name}, a ${selectedCase.title.toLowerCase()}. Answer questions about services, bookings, and availability professionally.` : "VOXA assistant",
          knowledgeSummary: JSON.stringify(formData).slice(0, 1500),
          captureEmail: true,
          capturePhone: true,
          businessName: name,
          address: selectedPlace?.address || "",
          geoLat: selectedPlace?.lat,
          geoLng: selectedPlace?.lng,
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
                machines: loc.machines.map((m) => ({ name: m.type, type: m.type, count: m.qty, pricePerHour: m.pricePerHour })),
              }),
            });
          }));
        } else if (selectedCase.id === "salon" && bizData.branches.length > 0) {
          for (const branch of bizData.branches) {
            const br = await fetch(`${apiBase}/branches`, {
              method: "POST",
              headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
              body: JSON.stringify({ handle: normalizedHandle, name: branch.name, location: branch.address, capacity: branch.capacity }),
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
        }
      }

      setIsSaving(false);
      navigate("/dashboard");
    } catch (err) {
      toast({ title: "Could not create profile", description: (err as Error).message, variant: "destructive" });
      setIsSaving(false);
    }
  };

  // ─── Step content ──────────────────────────────────────────────────────────

  const renderStep = () => {
    // Step 0: Phone Number (Optional)
    if (step === 0) {
      return (
        <div className="space-y-8 max-w-xl mx-auto">
          <div className="text-center space-y-3">
            <h1 className="font-display text-3xl sm:text-4xl font-bold">Get a phone number</h1>
            <p className="text-muted-foreground text-lg">Customers can call your AI directly on a real phone number</p>
          </div>

          {/* What you get */}
          <Card className="bg-card/50 border-primary/20">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-sm">What every business gets</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Phone, label: "Phone Number", desc: "AI-powered phone line" },
                  { icon: Globe, label: "Website", desc: "Auto-generated business site" },
                  { icon: MessageSquare, label: "Chat Widget", desc: "Embeddable on any site" },
                  { icon: LinkIcon, label: "Shareable Link", desc: "Direct voice/chat link" },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-2.5 p-2 rounded-lg bg-primary/5">
                    <item.icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card className="bg-card/50 border-border">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold">Phone Number Plan</p>
                  <p className="text-sm text-muted-foreground">Rs 500/month per number &middot; 1000 free credits included</p>
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
                            <SelectItem key={p.phoneNumber} value={p.phoneNumber}>{p.phoneNumber} &middot; Rs {p.monthlyPrice}/mo</SelectItem>
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

    // Step 1: Business type
    if (step === 1) {
      return (
        <div className="space-y-8">
          <div className="text-center space-y-3">
            <h1 className="font-display text-3xl sm:text-4xl font-bold">What type of business?</h1>
            <p className="text-muted-foreground text-lg">Pick your category</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
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

    // Step 2: Basic info + Google Places location
    if (step === 2) {
      return (
        <div className="space-y-8 max-w-md mx-auto">
          <div className="text-center space-y-3">
            <h1 className="font-display text-3xl sm:text-4xl font-bold">Basic info</h1>
            <p className="text-muted-foreground">Your business name, handle, and location</p>
          </div>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Business name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={selectedCase?.id === "gaming_cafe" ? "e.g. XP Arena" : selectedCase?.id === "salon" ? "e.g. Glow Beauty Studio" : "e.g. Sunrise Clinic"}
                className="bg-card/50"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>VOXA handle</Label>
              <div className="flex rounded-lg border border-border bg-card/50 overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                <span className="px-3 text-sm text-muted-foreground bg-secondary/50 h-10 flex items-center whitespace-nowrap">callcentral.io/</span>
                <input
                  value={voxaHandle}
                  onChange={(e) => setVoxaHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="yourname"
                  className="flex-1 h-10 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <p className="text-xs text-muted-foreground">Letters, numbers, and hyphens only. e.g. my-salon</p>
            </div>

            {/* Google Places Location Search */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Business Location</Label>
              <div className="relative">
                <Input
                  value={placeQuery}
                  onChange={(e) => { setPlaceQuery(e.target.value); searchPlaces(e.target.value); }}
                  placeholder="Search for your business location..."
                  className="bg-card/50"
                />
                {placeResults.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                    {placeResults.map((r) => (
                      <button
                        key={r.place_id}
                        onClick={() => selectPlace(r.place_id, r.description)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b border-border/50 last:border-0"
                      >
                        {r.description}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedPlace && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-2 text-xs">
                  <span className="text-primary font-medium">{selectedPlace.name}</span>
                  <span className="text-muted-foreground ml-1">({selectedPlace.lat.toFixed(4)}, {selectedPlace.lng.toFixed(4)})</span>
                </div>
              )}
            </div>

            {selectedCase?.fields.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label>{field.label}</Label>
                <Input value={formData[field.name] || ""} onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })} placeholder={field.placeholder} className="bg-card/50" />
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Step 3: Type-specific setup
    if (step === 3) {
      return (
        <div className="space-y-8 max-w-2xl mx-auto">
          <div className="text-center space-y-3">
            <h1 className="font-display text-3xl sm:text-4xl font-bold">
              {selectedCase?.id === "gaming_cafe" ? "Locations & Machines"
                : selectedCase?.id === "salon" ? "Branches & Services"
                : "Doctors"}
            </h1>
            <p className="text-muted-foreground">
              {selectedCase?.id === "gaming_cafe" ? "Add your gaming locations and the machines available at each."
                : selectedCase?.id === "salon" ? "Add branches and the services offered at each."
                : "Add your doctors and their consultation details."}
            </p>
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
        </div>
      );
    }

    return null;
  };

  const isLastStep = step === 3;
  const canProceed = step === 0 ? true
    : step === 2 ? voxaHandle.trim().length >= 2 && displayName.trim().length >= 1
    : true;

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
        <span className="font-display text-lg font-bold text-gradient-primary">VOXA</span>
        <span className="text-xs text-muted-foreground">Step {step + 1}</span>
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
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
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
            <Input value={loc.address} onChange={(e) => updateLocation(loc.id, { address: e.target.value })} placeholder="Address / notes" className="bg-card/60 h-9 text-sm" />
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
            <div className="grid grid-cols-2 gap-2">
              <Input value={br.address} onChange={(e) => updateBranch(br.id, { address: e.target.value })} placeholder="Address / area" className="bg-card/60 h-9 text-sm" />
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0">Seats</Label>
                <Input type="number" min={1} value={br.capacity || ""} onChange={(e) => updateBranch(br.id, { capacity: Number(e.target.value) || 1 })} className="bg-card/60 h-9 text-sm" />
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

export default Onboarding;
