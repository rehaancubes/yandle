import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Link as LinkIcon, Mic, MessageSquare, Settings,
  Share2, Copy, Check, ExternalLink, ChevronLeft, ChevronRight,
  TrendingUp, User, Building2, Calendar as CalendarIcon, Users, BookOpen, Plus, Trash2, Loader2,
  UserPlus, Play, ChevronDown, ChevronUp, X, PhoneCall, XCircle, Globe2, Upload, Image, Coins,
  Phone, Ticket, Headset,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { getUseCaseById, type UseCase, type BusinessType } from "@/lib/onboarding-data";
import AuthButton from "@/components/auth/AuthButton";
import { getCurrentUserSub, getOnboardingStorageKey, getCurrentUserEmail, startFresh } from "@/lib/auth";

const allNavItems = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, ownerOnly: false, useCases: undefined },
  { id: "bookings", label: "Bookings", icon: CalendarIcon, ownerOnly: false, useCases: ["gaming_cafe", "salon", "clinic"] as string[] },
  { id: "requests", label: "Requests", icon: Phone, ownerOnly: false, useCases: ["general"] as string[] },
  { id: "tickets", label: "Tickets", icon: Ticket, ownerOnly: false, useCases: ["customer_support"] as string[] },
  { id: "customers", label: "Customers", icon: Users, ownerOnly: false, useCases: undefined },
  { id: "conversations", label: "Conversations", icon: MessageSquare, ownerOnly: false, useCases: undefined },
  { id: "knowledgebase", label: "Knowledge Base", icon: BookOpen, ownerOnly: false, useCases: undefined },
  { id: "voice", label: "Voice", icon: Mic, ownerOnly: false, useCases: undefined },
  { id: "embed", label: "Embed", icon: LinkIcon, ownerOnly: false, useCases: undefined },
  { id: "website", label: "Website", icon: Globe2, ownerOnly: false, useCases: undefined },
  { id: "members", label: "Members", icon: UserPlus, ownerOnly: true, useCases: undefined },
  { id: "phone", label: "Phone Number", icon: PhoneCall, ownerOnly: false, useCases: undefined },
  { id: "credits", label: "Credits", icon: Coins, ownerOnly: false, useCases: undefined },
  { id: "settings", label: "Settings", icon: Settings, ownerOnly: false, useCases: undefined },
];

const IST_TZ = "Asia/Kolkata";
function formatTimeAgo(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`;
  return `${Math.floor(diff / 86400000)} days ago`;
}
/** Format an ISO date-time string for display in IST (e.g. "10 Mar 2025, 7:00 pm IST"). */
function formatInIST(iso: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", { timeZone: IST_TZ, dateStyle: "medium", timeStyle: "short", hour12: true }) + " IST";
  } catch {
    return iso;
  }
}
/** Time only in IST (e.g. "7:00 PM") for calendar slots. */
function formatTimeOnlyIST(iso: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-IN", { timeZone: IST_TZ, hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return "—";
  }
}
/** Time in UTC so it matches the slot time the user booked (e.g. "2:00 PM UTC"). */
function formatTimeUTC(iso: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: true }) + " UTC";
  } catch {
    return "—";
  }
}
/** Date + time in UTC for booking lists (matches slot time). */
function formatDateTimeUTC(iso: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
    const timeStr = d.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: true });
    return `${dateStr}, ${timeStr} UTC`;
  } catch {
    return iso;
  }
}
/** Time only in UTC for grid column headers (matches slot time). */
function formatTimeOnlyUTC(iso: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return "—";
  }
}
/** One-line label for booking type: center + machine, or service/branch/doctor/location. */
function getBookingTypeLabel(b: any) {
  if (b.centerName && b.machineType) return `${b.centerName} · ${b.machineType}`;
  const parts = [b.serviceId, b.branchId, b.doctorId, b.locationId].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Booking";
}
/** Nova Sonic voice IDs for the business voice (dashboard + shareable link). */
const VOICE_OPTIONS = [
  { id: "tiffany", label: "Tiffany (English US, female)", locale: "en-US" },
  { id: "matthew", label: "Matthew (English US, male)", locale: "en-US" },
  { id: "amy", label: "Amy (English UK, female)", locale: "en-GB" },
  { id: "olivia", label: "Olivia (English Australia, female)", locale: "en-AU" },
  { id: "kiara", label: "Kiara (English India / Hindi, female)", locale: "en-IN" },
  { id: "arjun", label: "Arjun (English India / Hindi, male)", locale: "en-IN" },
  { id: "lupe", label: "Lupe (Spanish US, female)", locale: "es-US" },
  { id: "carlos", label: "Carlos (Spanish US, male)", locale: "es-US" },
  { id: "ambre", label: "Ambre (French, female)", locale: "fr-FR" },
  { id: "florian", label: "Florian (French, male)", locale: "fr-FR" },
  { id: "tina", label: "Tina (German, female)", locale: "de-DE" },
  { id: "lennart", label: "Lennart (German, male)", locale: "de-DE" },
];
const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function getDateInIST(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  } catch {
    return "";
  }
}

const bookingStatusColors: Record<string, string> = {
  new: "bg-primary/20 text-primary",
  active: "bg-primary/20 text-primary",
  pending: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
  qualified: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  confirmed: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
};

type VirtualStation = { centerId: string; centerName: string; machineType: string; machineName: string; slotIndex: number; displayLabel: string };

/** Build virtual stations from gaming centers (one per machine slot). */
function buildVirtualStations(centers: any[]): VirtualStation[] {
  const out: VirtualStation[] = [];
  for (const c of centers || []) {
    const machines = Array.isArray(c.machines) ? c.machines : [];
    for (const m of machines) {
      const type = (m.type || m.name || "PC").trim() || "PC";
      const name = (m.name || m.type || "Machine").trim() || "Machine";
      const count = Math.max(1, Number(m.count) || 1);
      for (let i = 0; i < count; i++) {
        out.push({
          centerId: c.centerId || c.id || "",
          centerName: c.name || "Center",
          machineType: type,
          machineName: name,
          slotIndex: i,
          displayLabel: count > 1 ? `${type}-${i + 1}` : type,
        });
      }
    }
  }
  return out;
}

/** Group virtual stations by branch/center (order follows centers array). */
function groupStationsByCenter(centers: any[], stations: VirtualStation[]): { centerName: string; stations: VirtualStation[] }[] {
  const byCenter = new Map<string, VirtualStation[]>();
  for (const s of stations) byCenter.set(s.centerName, [...(byCenter.get(s.centerName) || []), s]);
  return (centers || [])
    .map((c) => ({ centerName: c.name || "Center", stations: byCenter.get(c.name || "Center") || [] }))
    .filter((g) => g.stations.length > 0);
}

function GamingAvailabilityGrid({
  stations,
  bookings,
  gridDate,
  formatTime,
  onSlotClick,
  openHour = 9,
  closeHour = 18,
  slotGranularityMinutes = 60,
}: {
  stations: { centerId: string; centerName: string; machineType: string; machineName: string; slotIndex: number; displayLabel: string }[];
  bookings: any[];
  gridDate: string;
  formatTime: (iso: string) => string;
  onSlotClick: (station: typeof stations[0], slotStartIso: string) => void;
  openHour?: number;
  closeHour?: number;
  slotGranularityMinutes?: number;
}) {
  const [year, month, day] = gridDate.split("-").map(Number);
  const slotStarts: string[] = [];
  const totalMinutes = (closeHour - openHour) * 60;
  const numSlots = Math.max(1, Math.floor(totalMinutes / slotGranularityMinutes));
  for (let i = 0; i < numSlots; i++) {
    const mins = openHour * 60 + i * slotGranularityMinutes;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    slotStarts.push(new Date(Date.UTC(year, month - 1, day, h, m, 0)).toISOString());
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card/30">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left p-2 font-semibold text-primary w-28">Station</th>
            {slotStarts.map((s) => (
              <th key={s} className="p-1 w-14 text-center text-muted-foreground">{formatTime(s)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stations.map((st, idx) => {
            const rowBookings = bookings.filter((b: any) =>
              (b.centerName || "").toLowerCase() === st.centerName.toLowerCase() &&
              (b.machineType || "").toLowerCase() === st.machineType.toLowerCase()
            ).sort((a: any, b: any) => {
              const byTime = (a.startTime || "").localeCompare(b.startTime || "");
              if (byTime !== 0) return byTime;
              return (a.bookingId || "").localeCompare(b.bookingId || "");
            });
            return (
              <tr key={st.centerId + st.slotIndex + idx} className="border-b border-border/50 hover:bg-muted/20">
                <td className="p-2 font-medium">{st.displayLabel}</td>
                {slotStarts.map((slotStart) => {
                  const slotEnd = new Date(new Date(slotStart).getTime() + slotGranularityMinutes * 60000).toISOString();
                  const overlapping = rowBookings.filter((b: any) => {
                    const bStart = new Date(b.startTime);
                    const bEnd = new Date(bStart.getTime() + (b.durationMinutes || 60) * 60000);
                    const s = new Date(slotStart);
                    const e = new Date(slotEnd);
                    return bStart < e && bEnd > s;
                  }).sort((a: any, b: any) => {
                    const byTime = (a.startTime || "").localeCompare(b.startTime || "");
                    if (byTime !== 0) return byTime;
                    return (a.bookingId || "").localeCompare(b.bookingId || "");
                  });
                  // Row slotIndex shows the Nth overlapping booking (PC-1 = 0th, PC-2 = 1st, …)
                  const booking = overlapping[st.slotIndex] ?? null;
                  const isBooked = !!booking;
                  return (
                    <td key={slotStart} className="p-0.5">
                      <button
                        type="button"
                        onClick={() => !isBooked && onSlotClick(st, slotStart)}
                        disabled={isBooked}
                        className={`w-12 h-8 rounded block w-full text-center text-[10px] font-medium transition-colors ${
                          isBooked
                            ? "bg-primary/30 text-primary cursor-default"
                            : "bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary"
                        }`}
                      >
                        {booking ? (booking.name || booking.email || "—").split(" ")[0] : "—"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeNav, setActiveNav] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [useCase, setUseCase] = useState<UseCase | null>(null);
  const [yandleHandle, setYandleHandle] = useState("");
  const [myHandles, setMyHandles] = useState<any[]>([]);
  const [handlePhoneNumber, setHandlePhoneNumber] = useState("");
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [displayName, setDisplayName] = useState("");
  const [bookings, setBookings] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [onboardingCheckDone, setOnboardingCheckDone] = useState(false);
  const [slotConfig, setSlotConfig] = useState<{ slotGranularityMinutes?: number; bufferBetweenMinutes?: number; openHour?: number; closeHour?: number }>({});
  const [branchesList, setBranchesList] = useState<any[]>([]);
  const [servicesList, setServicesList] = useState<any[]>([]);
  const [doctorsList, setDoctorsList] = useState<any[]>([]);
  const [locationsList, setLocationsList] = useState<any[]>([]);
  const [centersList, setCentersList] = useState<any[]>([]);
  const [knowledgeBaseCustomText, setKnowledgeBaseCustomText] = useState("");
  const [kbProfileLoaded, setKbProfileLoaded] = useState(false);
  const [kbSaving, setKbSaving] = useState(false);
  const [kbSyncing, setKbSyncing] = useState(false);
  const [kbPreviewText, setKbPreviewText] = useState("");
  const [kbPreviewLoading, setKbPreviewLoading] = useState(false);
  const [ingestImageLoading, setIngestImageLoading] = useState(false);
  const [extractedTextFromImage, setExtractedTextFromImage] = useState("");
  const [uploadFileLoading, setUploadFileLoading] = useState(false);
  const [newCenterName, setNewCenterName] = useState("");
  const [newCenterLocation, setNewCenterLocation] = useState("");
  const [newCenterMachineType, setNewCenterMachineType] = useState("PC");
  const [newCenterMachineCount, setNewCenterMachineCount] = useState(10);
  const [newCenterPricePerHour, setNewCenterPricePerHour] = useState(500);
  const [addingCenter, setAddingCenter] = useState(false);
  // KB: salon CRUD
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchCapacity, setNewBranchCapacity] = useState(1);
  const [addingBranch, setAddingBranch] = useState(false);
  const [deletingBranchId, setDeletingBranchId] = useState<string | null>(null);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState(30);
  const [newServicePrice, setNewServicePrice] = useState("");
  const [addingService, setAddingService] = useState(false);
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  // KB: clinic CRUD
  const [newDoctorName, setNewDoctorName] = useState("");
  const [newDoctorSpecialty, setNewDoctorSpecialty] = useState("");
  const [addingDoctor, setAddingDoctor] = useState(false);
  const [deletingDoctorId, setDeletingDoctorId] = useState<string | null>(null);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationAddress, setNewLocationAddress] = useState("");
  const [addingLocation, setAddingLocation] = useState(false);
  const [deletingLocationId, setDeletingLocationId] = useState<string | null>(null);
  // KB: uploaded files
  const [kbFiles, setKbFiles] = useState<any[]>([]);
  const [kbFilesLoading, setKbFilesLoading] = useState(false);
  const [deletingFileKey, setDeletingFileKey] = useState<string | null>(null);
  const [addBookingOpen, setAddBookingOpen] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInEmail, setWalkInEmail] = useState("");
  const [walkInStartDate, setWalkInStartDate] = useState("");
  const [walkInDatePickerOpen, setWalkInDatePickerOpen] = useState(false);
  const [walkInStartTime, setWalkInStartTime] = useState("");
  const [walkInDuration, setWalkInDuration] = useState(60);
  const [walkInBranchId, setWalkInBranchId] = useState("");
  const [walkInServiceId, setWalkInServiceId] = useState("");
  const [walkInDoctorId, setWalkInDoctorId] = useState("");
  const [walkInLocationId, setWalkInLocationId] = useState("");
  const [walkInCenterName, setWalkInCenterName] = useState("");
  const [walkInMachineType, setWalkInMachineType] = useState("");
  const [walkInNotes, setWalkInNotes] = useState("");
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState<string | null>(null);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  // Gaming cafe bookings: sub-tabs (dashboard | reservations | hardware) and grid date
  const [gamingBookingsSubTab, setGamingBookingsSubTab] = useState<"dashboard" | "reservations" | "hardware">("dashboard");
  const [gamingSelectedCenterName, setGamingSelectedCenterName] = useState<string>("");
  const [gridDate, setGridDate] = useState(() => {
    const d = new Date();
    return d.toLocaleDateString("en-CA", { timeZone: "UTC" });
  });
  const [gridDatePickerOpen, setGridDatePickerOpen] = useState(false);
  const [gridDateBookings, setGridDateBookings] = useState<any[]>([]);
  const [gridDateBookingsLoading, setGridDateBookingsLoading] = useState(false);

  // Owner/member
  const [isOwner, setIsOwner] = useState(false);
  const currentUseCaseId = useCase?.id;
  const navItems = allNavItems.filter((n) => {
    if (n.ownerOnly && !isOwner) return false;
    if (n.useCases && currentUseCaseId && !n.useCases.includes(currentUseCaseId)) return false;
    if (n.useCases && !currentUseCaseId) return false;
    return true;
  });

  // Members tab
  const [membersList, setMembersList] = useState<any[]>([]);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  // Persona (voice tab)
  const [persona, setPersona] = useState("");
  const [personaSaving, setPersonaSaving] = useState(false);
  const [personaLoaded, setPersonaLoaded] = useState(false);

  // Embed theme
  const [embedColor, setEmbedColor] = useState("#7c3aed");
  const [embedBg, setEmbedBg] = useState("#ffffff");
  const [embedPosition, setEmbedPosition] = useState("bottom-right");
  const [embedLabel, setEmbedLabel] = useState("Chat with us");

  // Website tab
  const [websiteHeroTagline, setWebsiteHeroTagline] = useState("");
  const [websiteAboutText, setWebsiteAboutText] = useState("");
  const [websiteGalleryImages, setWebsiteGalleryImages] = useState<string[]>([]);
  const [websiteColorTheme, setWebsiteColorTheme] = useState("indigo");
  const [websiteContactEmail, setWebsiteContactEmail] = useState("");
  const [websiteSocialLinks, setWebsiteSocialLinks] = useState<Record<string, string>>({});
  const [websiteConfigLoaded, setWebsiteConfigLoaded] = useState(false);
  const [websiteSaving, setWebsiteSaving] = useState(false);
  const [websiteImageUploading, setWebsiteImageUploading] = useState(false);
  const [websiteChatMessages, setWebsiteChatMessages] = useState<Array<{ role: "user" | "ai"; text: string; changes?: Record<string, any> | null }>>([]);
  const [websiteChatInput, setWebsiteChatInput] = useState("");
  const [websiteChatLoading, setWebsiteChatLoading] = useState(false);

  // Color theme → CSS overrides
  const themeHslMap: Record<string, string> = {
    indigo: "239 84% 67%", emerald: "160 84% 39%", rose: "347 91% 60%",
    amber: "38 92% 50%", cyan: "189 94% 43%", violet: "263 90% 66%",
  };
  const dashThemeHsl = themeHslMap[websiteColorTheme] || themeHslMap.indigo;
  const dashThemeStyle: React.CSSProperties = {
    ["--primary" as string]: dashThemeHsl,
    ["--accent" as string]: dashThemeHsl,
    ["--ring" as string]: dashThemeHsl,
    ["--glow-primary" as string]: dashThemeHsl,
    ["--sidebar-primary" as string]: dashThemeHsl,
  };

  // Credits
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [creditsTotalUsed, setCreditsTotalUsed] = useState<number | null>(null);

  // Phone Number tab
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [assigningPhone, setAssigningPhone] = useState<string | null>(null);
  const [releasingPhone, setReleasingPhone] = useState(false);

  // Requests tab (general business type)
  const [requestsList, setRequestsList] = useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // Tickets tab (customer_support business type)
  const [ticketsList, setTicketsList] = useState<any[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);

  // Conversations: expanded row & full session objects
  const [expandedConvId, setExpandedConvId] = useState<string | null>(null);

  // Helper: fetch all handles from API and populate myHandles list.
  // Returns the fetched handles array (or empty array on failure).
  const fetchAllHandles = async (): Promise<any[]> => {
    if (!apiBase) return [];
    try {
      const resp = await fetch(`${apiBase}/handles`, {
        headers: { authorization: `Bearer ${localStorage.getItem("yandle_id_token") || ""}` },
      });
      if (!resp.ok) return [];
      const json = await resp.json();
      const handles = Array.isArray(json?.handles) ? json.handles : [];
      setMyHandles(handles);
      return handles;
    } catch {
      return [];
    }
  };

  useEffect(() => {
    const sub = getCurrentUserSub();
    const storageKey = getOnboardingStorageKey(sub);
    let raw = localStorage.getItem(storageKey);

    // Backward compatibility for data saved before per-user storage keys.
    if (!raw) {
      const legacyRaw = localStorage.getItem("yandle_onboarding");
      if (legacyRaw) {
        localStorage.setItem(storageKey, legacyRaw);
        raw = legacyRaw;
      }
    }

    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (data?.yandleHandle) {
          const loadedUseCase = data.useCaseId ? getUseCaseById(data.useCaseId) || null : null;
          if (loadedUseCase) setUseCase(loadedUseCase);
          setYandleHandle(data.yandleHandle);
          if (data.formData && typeof data.formData === "object") setFormData(data.formData);
          if (typeof data.displayName === "string") setDisplayName(data.displayName);
          setOnboardingCheckDone(true);
          // Even when restoring from localStorage, fetch all handles so the switcher is populated
          fetchAllHandles().then((handles) => {
            const current = handles.find((h: any) => h.handle === data.yandleHandle);
            if (current?.phoneNumber) setHandlePhoneNumber(current.phoneNumber);
          });
          return;
        }
      } catch {
        // fall through to try API or onboarding
      }
    }

    // No local onboarding data: try to restore from backend (returning user on new device/browser).
    (async () => {
      if (!apiBase) {
        setOnboardingCheckDone(true);
        navigate("/onboarding", { replace: true });
        return;
      }
      try {
        const handles = await fetchAllHandles();
        if (handles.length === 0) {
          setOnboardingCheckDone(true);
          navigate("/onboarding", { replace: true });
          return;
        }
        const first = handles[0];
        const handle = first?.handle;
        if (!handle) {
          setOnboardingCheckDone(true);
          navigate("/onboarding", { replace: true });
          return;
        }
        const restored = {
          ownerSub: sub,
          yandleHandle: handle,
          displayName: first.displayName || handle,
          useCaseId: first.useCaseId,
          formData: {},
        };
        localStorage.setItem(storageKey, JSON.stringify(restored));
        setYandleHandle(handle);
        if (typeof first.displayName === "string") setDisplayName(first.displayName);
        if (first.useCaseId) {
          const loadedUseCase = getUseCaseById(first.useCaseId) || null;
          if (loadedUseCase) setUseCase(loadedUseCase);
        }
        if (first.phoneNumber) setHandlePhoneNumber(first.phoneNumber);
      } catch {
        setOnboardingCheckDone(true);
        navigate("/onboarding", { replace: true });
      } finally {
        setOnboardingCheckDone(true);
      }
    })();
  }, [navigate]);

  // Load live bookings for current handle (all use cases)
  useEffect(() => {
    if (!apiBase || !yandleHandle) return;
    const controller = new AbortController();

    (async () => {
      try {
        const resp = await fetch(
          `${apiBase}/bookings?handle=${encodeURIComponent(yandleHandle)}`,
          {
            headers: {
              authorization: `Bearer ${localStorage.getItem("yandle_id_token") || ""}`,
            },
            signal: controller.signal,
          }
        );
        if (!resp.ok) return;
        const json = await resp.json();
        setBookings(Array.isArray(json.bookings) ? json.bookings : []);
      } catch {
        // ignore; keep bookings empty on error
      }
    })();

    return () => controller.abort();
  }, [apiBase, yandleHandle]);

  // Load branches/services/doctors/locations/centers when on Bookings tab so Add booking dialog has options
  useEffect(() => {
    if (!apiBase || !yandleHandle || activeNav !== "bookings") return;
    const token = localStorage.getItem("yandle_id_token") || "";
    if (useCase?.id === "salon") {
      Promise.all([
        fetch(`${apiBase}/branches?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => setBranchesList(Array.isArray(d?.branches) ? d.branches : [])),
        fetch(`${apiBase}/services?handle=${encodeURIComponent(yandleHandle)}&useCaseId=salon`, { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => setServicesList(Array.isArray(d?.services) ? d.services : [])),
      ]).catch(() => {});
    } else if (useCase?.id === "clinic") {
      Promise.all([
        fetch(`${apiBase}/doctors?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => setDoctorsList(Array.isArray(d?.doctors) ? d.doctors : [])),
        fetch(`${apiBase}/locations?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => setLocationsList(Array.isArray(d?.locations) ? d.locations : [])),
        fetch(`${apiBase}/services?handle=${encodeURIComponent(yandleHandle)}&useCaseId=clinic`, { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => setServicesList(Array.isArray(d?.services) ? d.services : [])),
      ]).catch(() => {});
    } else if (useCase?.id === "gaming_cafe") {
      fetch(`${apiBase}/centers?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setCentersList(Array.isArray(d?.centers) ? d.centers : []))
        .catch(() => setCentersList([]));
    }
  }, [apiBase, yandleHandle, activeNav, useCase?.id]);

  // Default gaming branch to first center when centers load
  useEffect(() => {
    if (useCase?.id !== "gaming_cafe" || !centersList?.length) return;
    if (!gamingSelectedCenterName && centersList[0]?.name) {
      setGamingSelectedCenterName(centersList[0].name);
    }
  }, [useCase?.id, centersList, gamingSelectedCenterName]);

  // Load bookings for selected date including today (gaming cafe: so grid always has date-scoped list and multiple per slot show correctly)
  useEffect(() => {
    if (!apiBase || !yandleHandle || useCase?.id !== "gaming_cafe" || activeNav !== "bookings") return;
    setGridDateBookingsLoading(true);
    const [y, m, d] = gridDate.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0)).toISOString();
    const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0)).toISOString();
    const token = localStorage.getItem("yandle_id_token") || "";
    fetch(`${apiBase}/bookings?handle=${encodeURIComponent(yandleHandle)}&fromTime=${encodeURIComponent(start)}&toTime=${encodeURIComponent(end)}&limit=100`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setGridDateBookings(Array.isArray(json?.bookings) ? json.bookings : []))
      .catch(() => setGridDateBookings([]))
      .finally(() => setGridDateBookingsLoading(false));
  }, [apiBase, yandleHandle, useCase?.id, activeNav, gridDate]);

  // Load requests for general business type
  useEffect(() => {
    if (!apiBase || !yandleHandle || activeNav !== "requests" || useCase?.id !== "general") return;
    setRequestsLoading(true);
    const token = localStorage.getItem("yandle_id_token") || "";
    fetch(`${apiBase}/requests?handle=${encodeURIComponent(yandleHandle)}`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setRequestsList(Array.isArray(data?.items) ? data.items : []))
      .catch(() => setRequestsList([]))
      .finally(() => setRequestsLoading(false));
  }, [apiBase, yandleHandle, activeNav, useCase?.id]);

  // Load tickets for customer_support business type
  useEffect(() => {
    if (!apiBase || !yandleHandle || activeNav !== "tickets" || useCase?.id !== "customer_support") return;
    setTicketsLoading(true);
    const token = localStorage.getItem("yandle_id_token") || "";
    fetch(`${apiBase}/tickets?handle=${encodeURIComponent(yandleHandle)}`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setTicketsList(Array.isArray(data?.items) ? data.items : []))
      .catch(() => setTicketsList([]))
      .finally(() => setTicketsLoading(false));
  }, [apiBase, yandleHandle, activeNav, useCase?.id]);

  useEffect(() => {
    if (!apiBase || !yandleHandle || (activeNav !== "conversations" && activeNav !== "overview")) return;
    const token = localStorage.getItem("yandle_id_token") || "";
    fetch(`${apiBase}/public/${yandleHandle}/conversations?limit=50`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const sessions = data?.sessions || [];
        setConversations(
          sessions.map((s: any) => ({
            user: s.callerName || (s.owner && s.owner !== "anonymous" ? s.owner : null) || s.displayName || null,
            intent: s.lastMessagePreview || s.intent || "",
            channel: (s.channel || "text").toLowerCase(),
            duration: s.duration || null,
            status: (s.status || "new").toLowerCase(),
            time: formatTimeAgo(s.createdAt),
            createdAt: s.createdAt,
            sessionId: s.pk?.replace("SESSION#", "") || s.sessionId,
            recordingUrl: s.recordingUrl || null,
            messages: Array.isArray(s.messages) ? s.messages : [],
          }))
        );
      })
      .catch(() => setConversations([]));
  }, [apiBase, yandleHandle, activeNav]);

  // Check isOwner when handle is known; also refresh handle list & phone number
  useEffect(() => {
    if (!apiBase || !yandleHandle) return;
    const token = localStorage.getItem("yandle_id_token") || "";
    fetch(`${apiBase}/handles`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const handles = Array.isArray(data?.handles) ? data.handles : [];
        setMyHandles(handles);
        const h = handles.find((x: any) => x.handle === yandleHandle);
        setIsOwner(h?.role === "owner" || !h?.role); // treat no role as owner (legacy)
        if (h?.phoneNumber) setHandlePhoneNumber(h.phoneNumber);
      })
      .catch(() => {});
  }, [apiBase, yandleHandle]);

  // Load persona when on voice tab
  useEffect(() => {
    if (!apiBase || !yandleHandle || activeNav !== "voice" || personaLoaded) return;
    const token = localStorage.getItem("yandle_id_token") || "";
    fetch(`${apiBase}/handles?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.profile?.persona) setPersona(data.profile.persona);
        setPersonaLoaded(true);
      })
      .catch(() => setPersonaLoaded(true));
  }, [apiBase, yandleHandle, activeNav, personaLoaded]);

  // Load members when on members tab
  useEffect(() => {
    if (!apiBase || !yandleHandle || activeNav !== "members") return;
    const token = localStorage.getItem("yandle_id_token") || "";
    fetch(`${apiBase}/members?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setMembersList(Array.isArray(data?.members) ? data.members : []))
      .catch(() => {});
  }, [apiBase, yandleHandle, activeNav]);

  useEffect(() => {
    if (!apiBase || !yandleHandle || activeNav !== "customers") return;
    const token = localStorage.getItem("yandle_id_token") || "";
    fetch(`${apiBase}/customers?handle=${encodeURIComponent(yandleHandle)}`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setCustomers(Array.isArray(data?.customers) ? data.customers : []))
      .catch(() => setCustomers([]));
  }, [apiBase, yandleHandle, activeNav]);

  useEffect(() => {
    if (!apiBase || !yandleHandle || (activeNav !== "settings" && activeNav !== "bookings")) return;
    const token = localStorage.getItem("yandle_id_token") || "";
    fetch(`${apiBase}/config/slots?handle=${encodeURIComponent(yandleHandle)}`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && (data.slotGranularityMinutes != null || data.bufferBetweenMinutes != null || data.openHour != null || data.closeHour != null)) {
          setSlotConfig({
            slotGranularityMinutes: data.slotGranularityMinutes ?? 15,
            bufferBetweenMinutes: data.bufferBetweenMinutes ?? 0,
            openHour: data.openHour ?? 9,
            closeHour: data.closeHour ?? 18,
          });
        }
      })
      .catch(() => {});
  }, [apiBase, yandleHandle, activeNav]);

  useEffect(() => {
    if (!apiBase || !yandleHandle || activeNav !== "settings") return;
    const token = localStorage.getItem("yandle_id_token") || "";
    if (useCase?.id === "salon") {
      Promise.all([
        fetch(`${apiBase}/branches?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => setBranchesList(Array.isArray(d?.branches) ? d.branches : [])),
        fetch(`${apiBase}/services?handle=${encodeURIComponent(yandleHandle)}&useCaseId=salon`, { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => setServicesList(Array.isArray(d?.services) ? d.services : [])),
      ]).catch(() => {});
    } else if (useCase?.id === "clinic") {
      Promise.all([
        fetch(`${apiBase}/doctors?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => setDoctorsList(Array.isArray(d?.doctors) ? d.doctors : [])),
        fetch(`${apiBase}/locations?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => setLocationsList(Array.isArray(d?.locations) ? d.locations : [])),
        fetch(`${apiBase}/services?handle=${encodeURIComponent(yandleHandle)}&useCaseId=clinic`, { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => setServicesList(Array.isArray(d?.services) ? d.services : [])),
      ]).catch(() => {});
    } else {
      setBranchesList([]);
      setServicesList([]);
      setDoctorsList([]);
      setLocationsList([]);
    }
  }, [apiBase, yandleHandle, activeNav, useCase?.id]);

  // Knowledge Base tab: load profile (custom text), centers (gaming), branches/services/doctors/locations/catalog/files by use case
  useEffect(() => {
    if (!apiBase || !yandleHandle || activeNav !== "knowledgebase") return;
    const token = localStorage.getItem("yandle_id_token") || "";
    setKbProfileLoaded(false);
    setKbPreviewLoading(true);
    setKbPreviewText("");
    setKbFilesLoading(true);
    Promise.all([
      fetch(`${apiBase}/handles?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.profile) {
            setKnowledgeBaseCustomText(d.profile.knowledgeBaseCustomText ?? "");
          }
          setKbProfileLoaded(true);
        })
        .catch(() => setKbProfileLoaded(true)),
      fetch(`${apiBase}/centers?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setCentersList(Array.isArray(d?.centers) ? d.centers : []))
        .catch(() => setCentersList([])),
      useCase?.id === "salon"
        ? Promise.all([
            fetch(`${apiBase}/branches?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => setBranchesList(Array.isArray(d?.branches) ? d.branches : [])),
            fetch(`${apiBase}/services?handle=${encodeURIComponent(yandleHandle)}&useCaseId=salon`, { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => setServicesList(Array.isArray(d?.services) ? d.services : [])),
          ])
        : useCase?.id === "clinic"
          ? Promise.all([
              fetch(`${apiBase}/doctors?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => setDoctorsList(Array.isArray(d?.doctors) ? d.doctors : [])),
              fetch(`${apiBase}/locations?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => setLocationsList(Array.isArray(d?.locations) ? d.locations : [])),
              fetch(`${apiBase}/services?handle=${encodeURIComponent(yandleHandle)}&useCaseId=clinic`, { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => setServicesList(Array.isArray(d?.services) ? d.services : [])),
            ])
          : Promise.resolve(),
      // Load the AI knowledge preview
      fetch(`${apiBase}/knowledge/preview?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d?.content) setKbPreviewText(d.content); })
        .catch(() => {})
        .finally(() => setKbPreviewLoading(false)),
      // Load uploaded files
      fetch(`${apiBase}/knowledge/files?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setKbFiles(Array.isArray(d?.files) ? d.files : []))
        .catch(() => setKbFiles([]))
        .finally(() => setKbFilesLoading(false)),
    ]).catch(() => { setKbPreviewLoading(false); setKbFilesLoading(false); });
  }, [apiBase, yandleHandle, activeNav, useCase?.id]);

  // Load website config (including colorTheme) as soon as we have a handle so dashboard theme,
  // shareable link, and mobile stay in sync without needing to open the Website tab first.
  useEffect(() => {
    if (!apiBase || !yandleHandle) return;
    const token = localStorage.getItem("yandle_id_token") || "";
    fetch(`${apiBase}/website/config?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const config = data?.config ?? data;
        if (config) {
          setWebsiteHeroTagline(config.heroTagline || "");
          setWebsiteAboutText(config.aboutText || "");
          setWebsiteGalleryImages(Array.isArray(config.galleryImages) ? config.galleryImages : []);
          setWebsiteColorTheme(config.colorTheme || "indigo");
          setWebsiteContactEmail(config.contactEmail || "");
          setWebsiteSocialLinks(config.socialLinks || {});
        }
        setWebsiteConfigLoaded(true);
      })
      .catch(() => setWebsiteConfigLoaded(true));
  }, [apiBase, yandleHandle]);

  // Load credits on overview tab
  useEffect(() => {
    if (!apiBase || !yandleHandle || activeNav !== "overview") return;
    const token = localStorage.getItem("yandle_id_token") || "";
    fetch(`${apiBase}/credits?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setCreditsBalance(data.credits ?? null);
          setCreditsTotalUsed(data.totalCreditsUsed ?? null);
        }
      })
      .catch(() => {});
  }, [apiBase, yandleHandle, activeNav]);

  // Load credits on credits tab
  useEffect(() => {
    if (!apiBase || !yandleHandle || activeNav !== "credits") return;
    const token = localStorage.getItem("yandle_id_token") || "";
    fetch(`${apiBase}/credits?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) { setCreditsBalance(data.credits ?? null); setCreditsTotalUsed(data.totalCreditsUsed ?? null); setFormData((p: any) => ({ ...p, planType: data.planType || "none" })); } })
      .catch(() => {});
  }, [apiBase, yandleHandle, activeNav]);

  // Load available phone numbers on phone tab
  useEffect(() => {
    if (!apiBase || !yandleHandle || activeNav !== "phone") return;
    if (handlePhoneNumber) return; // already has a number
    setPhoneLoading(true);
    const token = localStorage.getItem("yandle_id_token") || "";
    fetch(`${apiBase}/phone-numbers/available`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { numbers: [] }))
      .then((data) => setAvailableNumbers(data.numbers || []))
      .catch(() => {})
      .finally(() => setPhoneLoading(false));
  }, [apiBase, yandleHandle, activeNav, handlePhoneNumber]);

  const handleAssignPhone = async (phoneNumber: string) => {
    setAssigningPhone(phoneNumber);
    try {
      const token = localStorage.getItem("yandle_id_token") || "";
      const res = await fetch(`${apiBase}/phone-numbers/assign`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ handle: yandleHandle, phoneNumber })
      });
      const data = await res.json();
      if (data.ok) {
        setHandlePhoneNumber(phoneNumber);
        setCreditsBalance(data.credits ?? creditsBalance);
        setAvailableNumbers([]);
        toast({ title: "Phone number assigned!", description: `${phoneNumber} is now active with 1000 free credits.` });
      } else {
        toast({ title: "Error", description: data.error || "Could not assign number", variant: "destructive" });
      }
    } catch { toast({ title: "Error", description: "Network error", variant: "destructive" }); }
    setAssigningPhone(null);
  };

  const handleReleasePhone = async () => {
    if (!handlePhoneNumber) return;
    setReleasingPhone(true);
    try {
      const token = localStorage.getItem("yandle_id_token") || "";
      const res = await fetch(`${apiBase}/phone-numbers/release`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ handle: yandleHandle, phoneNumber: handlePhoneNumber })
      });
      const data = await res.json();
      if (data.ok) {
        setHandlePhoneNumber("");
        toast({ title: "Phone number released", description: "The number has been released and is available for others." });
      } else {
        toast({ title: "Error", description: data.error || "Could not release number", variant: "destructive" });
      }
    } catch { toast({ title: "Error", description: "Network error", variant: "destructive" }); }
    setReleasingPhone(false);
  };

  /** Switch the active handle — updates state, clears stale data, and persists to localStorage. */
  const switchHandle = (handle: any) => {
    if (!handle?.handle || handle.handle === yandleHandle) return;
    const sub = getCurrentUserSub();
    const storageKey = getOnboardingStorageKey(sub);

    // Update primary identifiers
    setYandleHandle(handle.handle);
    setDisplayName(handle.displayName || handle.handle);
    setHandlePhoneNumber(handle.phoneNumber || "");

    // Resolve useCase from useCaseId
    const newUseCase = handle.useCaseId ? getUseCaseById(handle.useCaseId) || null : null;
    setUseCase(newUseCase);

    // Determine owner/manager role from handle list
    setIsOwner(handle.role === "owner" || !handle.role);

    // Reset to overview tab for a clean start
    setActiveNav("overview");

    // Clear all stale data so useEffect hooks re-fetch for the new handle
    setBookings([]);
    setCustomers([]);
    setConversations([]);
    setPersona("");
    setPersonaLoaded(false);
    setKnowledgeBaseCustomText("");
    setKbProfileLoaded(false);
    setKbPreviewText("");
    setKbFiles([]);
    setCentersList([]);
    setBranchesList([]);
    setServicesList([]);
    setDoctorsList([]);
    setLocationsList([]);
    setMembersList([]);
    setSlotConfig({});
    setCreditsBalance(null);
    setCreditsTotalUsed(null);
    setWebsiteHeroTagline("");
    setWebsiteAboutText("");
    setWebsiteGalleryImages([]);
    setWebsiteColorTheme("indigo");
    setWebsiteContactEmail("");
    setWebsiteSocialLinks({});
    setWebsiteConfigLoaded(false);
    setExpandedConvId(null);
    setAvailableNumbers([]);
    setAssigningPhone(null);
    setReleasingPhone(false);

    // Persist the selected handle to localStorage
    const stored = {
      ownerSub: sub,
      yandleHandle: handle.handle,
      displayName: handle.displayName || handle.handle,
      useCaseId: handle.useCaseId,
      formData: {},
    };
    localStorage.setItem(storageKey, JSON.stringify(stored));
  };

  const widgets = useCase?.dashboardWidgets || [];
  const yandleLink = yandleHandle ? `callcentral.io/${yandleHandle}` : "callcentral.io/yourname";
  const shareablePath = yandleHandle ? `/shareable/${yandleHandle}` : "/onboarding";

  const handleCopy = () => {
    navigator.clipboard.writeText(`https://${yandleLink}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveSettings = async () => {
    const normalizedHandle = yandleHandle.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!normalizedHandle) {
      toast({ title: "Handle required", description: "Your YANDLE handle cannot be empty." });
      return;
    }
    const sub = getCurrentUserSub();
    const storageKey = getOnboardingStorageKey(sub);
    setSettingsSaving(true);
    const payload = {
      ownerSub: sub,
      useCaseId: useCase?.id,
      formData,
      yandleHandle: normalizedHandle,
      displayName: displayName.trim() || undefined,
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
    setYandleHandle(normalizedHandle);

    if (apiBase) {
      try {
        const displayNameToSend = displayName.trim()
          || normalizedHandle.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const response = await fetch(`${apiBase}/handle`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${localStorage.getItem("yandle_id_token") || ""}`,
          },
          body: JSON.stringify({
            handle: normalizedHandle,
            displayName: displayNameToSend,
            textEnabled: true,
            voiceEnabled: true,
            voiceId: (formData.voiceId as string) || "tiffany",
            persona: useCase
              ? `${useCase.title} assistant for lead qualification and conversation routing`
              : "YANDLE assistant",
            knowledgeSummary: JSON.stringify(formData).slice(0, 1500),
            captureEmail: formData.captureEmail !== false,
            capturePhone: formData.capturePhone !== false,
            websiteEnabled: formData.websiteEnabled !== false,
            useCaseId: useCase?.id,
          }),
        });
        if (!response.ok) {
          const errBody = await response.text();
          let msg = errBody;
          try {
            const j = JSON.parse(errBody);
            if (j.details) msg = j.details;
            else if (j.error) msg = j.error;
            else if (j.message) msg = j.message;
            console.error("[POST /handle] Error response:", j);
          } catch {
            console.error("[POST /handle] Error response (raw):", errBody);
          }
          if (response.status === 401) {
            toast({
              title: "Session expired",
              description: "Please sign in again to save changes.",
              variant: "destructive",
            });
            throw new Error("Unauthorized. Please sign in again.");
          }
          throw new Error(msg || `HTTP ${response.status}`);
        }
        if (useCase?.id !== "general" && useCase?.id !== "customer_support" && (slotConfig.slotGranularityMinutes != null || slotConfig.bufferBetweenMinutes != null || slotConfig.openHour != null || slotConfig.closeHour != null)) {
          await fetch(`${apiBase}/config/slots`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${localStorage.getItem("yandle_id_token") || ""}`,
            },
            body: JSON.stringify({
              handle: normalizedHandle,
              slotGranularityMinutes: slotConfig.slotGranularityMinutes ?? 15,
              bufferBetweenMinutes: slotConfig.bufferBetweenMinutes ?? 0,
              openHour: slotConfig.openHour ?? 9,
              closeHour: slotConfig.closeHour ?? 18,
            }),
          }).catch(() => {});
        }
        toast({ title: "Settings saved", description: "Your profile and AI details have been updated." });
      } catch (err) {
        toast({
          title: "Could not update backend",
          description: (err as Error).message,
        });
      }
    } else {
      toast({ title: "Settings saved locally", description: "Backend not configured; changes are stored in this browser only." });
    }
    setSettingsSaving(false);
  };

  const [voiceSaving, setVoiceSaving] = useState(false);
  const saveVoice = async (voiceId: string) => {
    const normalizedHandle = yandleHandle.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!normalizedHandle) return;
    setFormData((prev) => ({ ...prev, voiceId }));
    const sub = getCurrentUserSub();
    const storageKey = getOnboardingStorageKey(sub);
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (data.formData && typeof data.formData === "object") {
          data.formData.voiceId = voiceId;
          localStorage.setItem(storageKey, JSON.stringify(data));
        }
      } catch {
        /* ignore */
      }
    }
    if (!apiBase) {
      toast({ title: "Voice updated locally", description: "Backend not configured." });
      return;
    }
    setVoiceSaving(true);
    try {
      const resp = await fetch(`${apiBase}/handle`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${localStorage.getItem("yandle_id_token") || ""}`,
        },
        body: JSON.stringify({ handle: normalizedHandle, voiceId }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(err || `HTTP ${resp.status}`);
      }
      toast({ title: "Voice updated", description: "Callers will hear this voice on your link." });
    } catch (err) {
      toast({
        title: "Could not update voice",
        description: (err as Error).message,
        variant: "destructive",
      });
    }
    setVoiceSaving(false);
  };

  const savePersona = async () => {
    const normalizedHandle = yandleHandle.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!normalizedHandle || !apiBase) return;
    setPersonaSaving(true);
    try {
      const resp = await fetch(`${apiBase}/handle`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${localStorage.getItem("yandle_id_token") || ""}` },
        body: JSON.stringify({ handle: normalizedHandle, persona }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      toast({ title: "Persona saved", description: "Voice agent will use this persona on next session." });
    } catch (err) {
      toast({ title: "Could not save persona", description: (err as Error).message, variant: "destructive" });
    }
    setPersonaSaving(false);
  };

  const cancelBooking = async (b: { startTime: string; bookingId?: string }) => {
    if (!apiBase || !yandleHandle) return;
    const key = b.bookingId ? `${b.startTime}#${b.bookingId}` : b.startTime;
    setCancellingBooking(key);
    try {
      const params = new URLSearchParams({ handle: yandleHandle, startTime: b.startTime });
      if (b.bookingId) params.set("bookingId", b.bookingId);
      const r = await fetch(`${apiBase}/bookings?${params.toString()}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${localStorage.getItem("yandle_id_token") || ""}` },
      });
      if (r.ok) {
        setBookings((prev) => prev.filter((x) => (x.bookingId ? `${x.startTime}#${x.bookingId}` : x.startTime) !== key));
        toast({ title: "Booking cancelled" });
      } else {
        toast({ title: "Could not cancel booking", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error cancelling booking", variant: "destructive" });
    }
    setCancellingBooking(null);
  };

  const statusColors: Record<string, string> = {
    new: "bg-primary/20 text-primary",
    active: "bg-primary/20 text-primary",
    pending: "bg-yellow-500/20 text-yellow-400",
    qualified: "bg-emerald-500/20 text-emerald-400",
    confirmed: "bg-emerald-500/20 text-emerald-400",
    booked: "bg-primary/20 text-primary",
    resolved: "bg-muted text-muted-foreground",
    proposal: "bg-violet-500/20 text-violet-400",
  };

  if (!onboardingCheckDone || !yandleHandle) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex" style={dashThemeStyle}>
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-40 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-sidebar-border">
          {!collapsed && (
            <span className="font-display text-lg font-bold text-gradient-primary">YANDLE</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Handle switcher */}
        {!collapsed && myHandles.length > 1 && (
          <div className="px-3 pt-3 pb-1 border-b border-sidebar-border space-y-2">
            <Select value={yandleHandle} onValueChange={(val) => {
              const h = myHandles.find((x: any) => x.handle === val);
              if (h) switchHandle(h);
            }}>
              <SelectTrigger className="w-full h-9 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm">
                <SelectValue placeholder="Select business" />
              </SelectTrigger>
              <SelectContent>
                {myHandles.map((h: any) => (
                  <SelectItem key={h.handle} value={h.handle}>
                    <div className="flex flex-col">
                      <span className="font-medium">{h.displayName || h.handle}</span>
                      <span className="text-xs text-muted-foreground">@{h.handle}{h.role === "manager" ? " (manager)" : ""}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {handlePhoneNumber && (
              <div className="flex items-center gap-1.5 px-1 pb-1">
                <PhoneCall className="h-3 w-3 text-sidebar-foreground/60 shrink-0" />
                <span className="text-xs text-sidebar-foreground/60 truncate">{handlePhoneNumber}</span>
              </div>
            )}
          </div>
        )}
        {/* Single handle: show name + phone */}
        {!collapsed && myHandles.length <= 1 && (
          <div className="px-3 pt-3 pb-1 border-b border-sidebar-border space-y-1">
            <div className="flex items-center gap-2 px-1">
              <Building2 className="h-4 w-4 text-sidebar-foreground/60 shrink-0" />
              <span className="text-sm font-medium text-sidebar-foreground truncate">{displayName || yandleHandle}</span>
            </div>
            {handlePhoneNumber && (
              <div className="flex items-center gap-1.5 px-1 pb-1">
                <PhoneCall className="h-3 w-3 text-sidebar-foreground/60 shrink-0" />
                <span className="text-xs text-sidebar-foreground/60 truncate">{handlePhoneNumber}</span>
              </div>
            )}
          </div>
        )}

        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                activeNav === item.id
                  ? "bg-sidebar-accent text-sidebar-primary font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Link cards at bottom */}
        {!collapsed && (
          <div className="p-3 border-t border-sidebar-border space-y-2">
            {/* Shareable link */}
            <div className="rounded-lg bg-sidebar-accent p-3 space-y-1.5">
              <p className="text-xs text-sidebar-foreground/60">Shareable link</p>
              <div className="flex items-center gap-2">
                <Share2 className="h-3.5 w-3.5 text-sidebar-primary shrink-0" />
                <span className="text-xs font-medium text-sidebar-primary truncate cursor-pointer" onClick={() => navigate(shareablePath)}>
                  callcentral.io/shareable/{yandleHandle || "..."}
                </span>
              </div>
              <Button size="sm" variant="ghost" className="h-6 text-xs w-full gap-1" onClick={() => {
                navigator.clipboard.writeText(`https://callcentral.io/shareable/${yandleHandle}`);
                toast({ title: "Copied!", description: "Shareable link copied to clipboard." });
              }}>
                <Copy className="h-3 w-3" /> Copy link
              </Button>
            </div>
            {/* Website link */}
            <div className="rounded-lg bg-sidebar-accent p-3 space-y-1.5">
              <p className="text-xs text-sidebar-foreground/60">Your website</p>
              <div className="flex items-center gap-2">
                <LinkIcon className="h-3.5 w-3.5 text-sidebar-primary shrink-0" />
                <span className="text-sm font-medium text-sidebar-primary truncate">{yandleLink}</span>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" className="h-7 text-xs flex-1 gap-1" onClick={handleCopy}>
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs flex-1 gap-1">
                  <Share2 className="h-3 w-3" /> Share
                </Button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className={`flex-1 transition-all duration-300 ${collapsed ? "ml-16" : "ml-60"}`}>
        {/* Top bar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
          <div>
            <h1 className="font-display text-lg font-semibold">
              {navItems.find((n) => n.id === activeNav)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <AuthButton />
            <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={() => navigate(shareablePath)}>
              <ExternalLink className="h-3 w-3" /> View Link
            </Button>
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
              {yandleHandle[0]?.toUpperCase() || "V"}
            </div>
          </div>
        </header>

        {/* Dashboard content */}
        <div className="p-6 space-y-6">
          {activeNav === "overview" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Welcome banner */}
              <div className="rounded-xl border border-border bg-card/50 p-6 bg-radial-glow relative overflow-hidden">
                <div className="relative z-10">
                  <h2 className="font-display text-2xl font-bold mb-2">
                    Welcome back{yandleHandle ? `, ${yandleHandle}` : ""}! 👋
                  </h2>
                  <p className="text-muted-foreground mb-4">
                    Your AI is live and handling conversations. Here's what's happening with your{" "}
                    <span className="text-primary font-medium">{useCase?.title}</span> profile.
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      AI Active
                    </span>
                    {creditsBalance != null && (
                      <span className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                        {creditsBalance.toLocaleString()} credits remaining
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">Last conversation 5 minutes ago</span>
                  </div>
                </div>
              </div>

              {/* Recent bookings (all use cases) */}
              <Card className="bg-card/50 border-border">
                <CardHeader>
                  <CardTitle className="text-base font-display font-semibold">
                    Recent bookings
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Bookings created via voice or API for handle <strong>{yandleHandle || "—"}</strong>
                  </p>
                </CardHeader>
                <CardContent>
                  {(Array.isArray(bookings) && bookings.length > 0) ? (
                    <div className="space-y-2">
                      {bookings.slice(0, 10).map((b: any, idx: number) => (
                        <div
                          key={b.bookingId || idx}
                          className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/30"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {(b.centerName && b.machineType) ? `${b.centerName} · ${b.machineType}` : (b.serviceId || b.branchId || b.doctorId || b.locationId || "Booking")}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {formatDateTimeUTC(b.startTime)} · {b.name || "—"} · {[b.phone, b.email].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </div>
                          {b.status && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full capitalize shrink-0 ${
                                statusColors[b.status] || "bg-primary/10 text-primary"
                              }`}
                            >
                              {b.status}
                            </span>
                          )}
                        </div>
                      ))}
                      {bookings.length > 10 && (
                        <p className="text-xs text-muted-foreground pt-1">
                          Showing latest 10. Open the Bookings tab for the full list.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No bookings yet. Bookings created by your AI voice or staff will appear here.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Gaming cafe machine bookings overview */}
              {useCase?.id === "gaming_cafe" && (
                <Card className="bg-card/50 border-border">
                  <CardHeader>
                    <CardTitle className="text-base font-display font-semibold">
                      Gaming centers & machine bookings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Configured centers</p>
                      <div className="grid md:grid-cols-2 gap-3">
                        {(Array.isArray(formData.centers) ? formData.centers : []).map((center: any, idx: number) => (
                          <div key={center.id || idx} className="rounded-lg border border-border bg-card/40 p-3 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium truncate">
                                  {center.name || `Center ${idx + 1}`}
                                </p>
                                {center.location && (
                                  <p className="text-xs text-muted-foreground truncate">{center.location}</p>
                                )}
                              </div>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                {(Array.isArray(center.machines) ? center.machines : []).length} machine types
                              </span>
                            </div>
                            {(Array.isArray(center.machines) ? center.machines : []).length > 0 && (
                              <ul className="mt-1 space-y-1">
                                {center.machines.map((m: any, mIdx: number) => (
                                  <li key={mIdx} className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span className="truncate">{m.name || "Machine"}</span>
                                    <span>
                                      {m.count ?? 0} @ {m.pricePerHour ? `$${m.pricePerHour}/hr` : "-"}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                        {(!Array.isArray(formData.centers) || formData.centers.length === 0) && (
                          <p className="text-xs text-muted-foreground">
                            No centers configured yet. Use onboarding or Settings to add gaming centers and machines.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Current machine bookings</p>
                      <div className="space-y-2">
                        {(Array.isArray(bookings) ? bookings : []).map((b: any, idx: number) => (
                          <div
                            key={b.bookingId || idx}
                            className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/30"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {b.machineType || "Machine"} · {b.centerName || "Center"}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {formatDateTimeUTC(b.startTime) || "Time not set"}
                              </p>
                            </div>
                            {b.status && (
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                                  statusColors[b.status] || "bg-primary/10 text-primary"
                                }`}
                              >
                                {b.status}
                              </span>
                            )}
                          </div>
                        ))}
                        {(!Array.isArray(bookings) || bookings.length === 0) && (
                          <p className="text-xs text-muted-foreground">
                            No machines are booked right now. As your AI or staff create bookings, they can be stored
                            in this profile and will show up here.
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Stat widgets */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {widgets
                  .filter((w) => w.type === "stat")
                  .map((widget, i) => (
                    <motion.div
                      key={widget.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.3 }}
                    >
                      <Card className="bg-card/50 border-border hover:border-primary/20 transition-colors">
                        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            {widget.title}
                          </CardTitle>
                          <widget.icon className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-display font-bold text-muted-foreground/50">—</div>
                          <p className="text-xs text-muted-foreground mt-1">Data will appear once activity starts</p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                {/* List widget */}
                {widgets
                  .filter((w) => w.type === "list")
                  .map((widget) => (
                    <Card key={widget.id} className="bg-card/50 border-border">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-base font-display font-semibold flex items-center gap-2">
                          <widget.icon className="h-4 w-4 text-primary" />
                          {widget.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">No data yet — data will appear once you start receiving calls and bookings.</p>
                      </CardContent>
                    </Card>
                  ))}

                {/* Chart widget */}
                {widgets
                  .filter((w) => w.type === "chart")
                  .map((widget) => (
                    <Card key={widget.id} className="bg-card/50 border-border">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-base font-display font-semibold flex items-center gap-2">
                          <widget.icon className="h-4 w-4 text-primary" />
                          {widget.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">No conversation data yet — chart will populate as AI conversations occur.</p>
                      </CardContent>
                    </Card>
                  ))}
              </div>

              {/* Recent conversations — real data */}
              <Card className="bg-card/50 border-border">
                <CardHeader>
                  <CardTitle className="text-base font-display font-semibold flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    Recent Conversations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {conversations.length > 0 ? conversations.slice(0, 4).map((conv, i) => (
                    <div
                      key={conv.sessionId || i}
                      className="flex items-center justify-between py-3 px-4 rounded-lg bg-secondary/20 hover:bg-secondary/40 transition-colors cursor-pointer"
                      onClick={() => { setActiveNav("conversations"); }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          {conv.channel === "voice" ? (
                            <Mic className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <MessageSquare className="h-3.5 w-3.5 text-primary" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{conv.user || "Anonymous"}</p>
                          <p className="text-xs text-muted-foreground">{conv.channel}{conv.duration ? ` · ${conv.duration}` : ""}</p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{conv.time}</span>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground">No conversations yet — conversations will appear as users interact with your AI.</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeNav === "bookings" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Bookings header with actions */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-display font-semibold flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-primary" />
                    Bookings
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    All bookings for handle <strong>{yandleHandle || "—"}</strong>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      const now = new Date();
                      const tz = "Asia/Kolkata";
                      const dateStr = now.toLocaleDateString("en-CA", { timeZone: tz });
                      const hour = now.getHours();
                      const nextHour = (hour + 1) % 24;
                      setWalkInStartDate(dateStr);
                      setWalkInStartTime(`${String(nextHour).padStart(2, "0")}:00`);
                      setWalkInName("");
                      setWalkInPhone("");
                      setWalkInEmail("");
                      setWalkInDuration(60);
                      setWalkInBranchId("");
                      setWalkInServiceId("");
                      setWalkInDoctorId("");
                      setWalkInLocationId("");
                      setWalkInCenterName("");
                      setWalkInMachineType("");
                      setWalkInNotes("");
                      setAddBookingOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add booking (walk-in)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!apiBase || !yandleHandle) return;
                      fetch(`${apiBase}/bookings?handle=${encodeURIComponent(yandleHandle)}`, {
                        headers: { authorization: `Bearer ${localStorage.getItem("yandle_id_token") || ""}` },
                      })
                        .then((r) => (r.ok ? r.json() : null))
                        .then((json) => setBookings(Array.isArray(json?.bookings) ? json.bookings : []))
                        .catch(() => {});
                    }}
                  >
                    Refresh
                  </Button>
                </div>
              </div>

              {useCase?.id === "gaming_cafe" ? (
                <>
                  {/* Branch and date filters above all tabs */}
                  <div className="flex flex-wrap items-center gap-4 pb-4 border-b border-border">
                    {(centersList || []).length > 1 && (
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium">Branch</Label>
                        <Select value={gamingSelectedCenterName || (centersList?.[0]?.name ?? "")} onValueChange={setGamingSelectedCenterName}>
                          <SelectTrigger className="w-44 bg-card/50"><SelectValue placeholder="Select branch" /></SelectTrigger>
                          <SelectContent>
                            {(centersList || []).map((c: any) => <SelectItem key={c.centerId || c.name} value={c.name}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">Date</Label>
                      <Popover open={gridDatePickerOpen} onOpenChange={setGridDatePickerOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-40 justify-start text-left font-normal bg-card/50 hover:bg-card">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {gridDate ? format(new Date(gridDate + "T12:00:00"), "MMM d, yyyy") : "Pick date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={gridDate ? new Date(gridDate + "T12:00:00") : undefined}
                            onSelect={(d) => {
                              if (d) {
                                setGridDate(format(d, "yyyy-MM-dd"));
                                setGridDatePickerOpen(false);
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <Tabs value={gamingBookingsSubTab} onValueChange={(v) => setGamingBookingsSubTab(v as "dashboard" | "reservations" | "hardware")} className="w-full">
                    <TabsList className="bg-muted/40 border border-border">
                      <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                      <TabsTrigger value="reservations">Reservations</TabsTrigger>
                      <TabsTrigger value="hardware">Hardware</TabsTrigger>
                    </TabsList>
                  <TabsContent value="dashboard" className="space-y-4 pt-4">
                    {gridDateBookingsLoading ? (
                      <p className="text-sm text-muted-foreground py-4">Loading…</p>
                    ) : (
                      (() => {
                        const centers = centersList || [];
                        const selectedCenter = gamingSelectedCenterName || centers[0]?.name || "";
                        const dayBookings = gridDateBookings;
                        const branchBookings = selectedCenter ? dayBookings.filter((b: any) => (b.centerName || "").toLowerCase() === selectedCenter.toLowerCase()) : [];
                        const virtualStations = buildVirtualStations(centers);
                        const branchStations = selectedCenter ? virtualStations.filter((s) => s.centerName === selectedCenter) : [];
                        const now = new Date();
                        const activeNow = branchBookings.filter((b: any) => {
                          const start = new Date(b.startTime);
                          const end = new Date(start.getTime() + (b.durationMinutes || 60) * 60000);
                          return start <= now && end >= now;
                        }).length;
                        const upcoming = branchBookings.filter((b: any) => new Date(b.startTime) >= now).sort((a: any, b: any) => (a.startTime || "").localeCompare(b.startTime || ""));
                        return (
                          <>
                            {selectedCenter && (
                              <>
                                <div className="grid grid-cols-2 gap-3">
                                  <Card className="bg-card/50 border-border p-4">
                                    <p className="text-xs text-muted-foreground">Active now</p>
                                    <p className="text-2xl font-bold text-primary">{activeNow} / {branchStations.length}</p>
                                    <p className="text-xs text-muted-foreground">sessions</p>
                                  </Card>
                                  <Card className="bg-card/50 border-border p-4">
                                    <p className="text-xs text-muted-foreground">{gridDate === new Date().toLocaleDateString("en-CA", { timeZone: "UTC" }) ? "Today's bookings" : "Bookings on selected date"}</p>
                                    <p className="text-2xl font-bold text-primary">{branchBookings.length}</p>
                                    <p className="text-xs text-muted-foreground">total</p>
                                  </Card>
                                </div>
                                <Card className="bg-card/50 border-border p-4">
                                  <p className="text-xs text-muted-foreground">Total stations</p>
                                  <p className="text-2xl font-bold text-primary">{branchStations.length}</p>
                                  <p className="text-xs text-muted-foreground">available</p>
                                </Card>
                                <div>
                                  <h3 className="text-sm font-semibold mb-2">Upcoming bookings</h3>
                                  {upcoming.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No upcoming bookings.</p>
                                  ) : (
                                    <ul className="space-y-2">
                                      {upcoming.slice(0, 12).map((b: any, idx: number) => (
                                        <li key={b.startTime + "-" + idx} className="flex items-center gap-2 text-sm rounded-lg border border-border bg-card/50 px-3 py-2">
                                          <span className="font-medium text-primary">{formatTimeOnlyUTC(b.startTime)}</span>
                                          <span className="text-muted-foreground">·</span>
                                          <span>{b.machineType ?? "—"} — {b.name || b.email || "Guest"}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </>
                            )}
                            {!selectedCenter && centers.length > 0 && <p className="text-sm text-muted-foreground">Select a branch.</p>}
                            {centers.length === 0 && <p className="text-sm text-muted-foreground">No branches configured.</p>}
                          </>
                        );
                      })()
                    )}
                  </TabsContent>
                  <TabsContent value="reservations" className="space-y-4 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Live availability</h3>
                      <Button size="sm" onClick={() => { setWalkInStartDate(gridDate); setWalkInStartTime("10:00"); setWalkInCenterName(""); setWalkInMachineType(""); setWalkInName(""); setWalkInPhone(""); setWalkInEmail(""); setWalkInNotes(""); setAddBookingOpen(true); }}>
                        <Plus className="h-4 w-4 mr-1" /> New Booking
                      </Button>
                    </div>
                    {gridDateBookingsLoading ? (
                      <p className="text-sm text-muted-foreground py-4">Loading…</p>
                    ) : (() => {
                      const selectedCenter = gamingSelectedCenterName || centersList?.[0]?.name || "";
                      const allStations = buildVirtualStations(centersList || []);
                      const branchStations = selectedCenter ? allStations.filter((s) => s.centerName === selectedCenter) : [];
                      const dayBookings = gridDateBookings;
                      if (!selectedCenter) return <p className="text-sm text-muted-foreground py-4">Select a branch.</p>;
                      return (
                        <GamingAvailabilityGrid
                          stations={branchStations}
                          bookings={dayBookings}
                          gridDate={gridDate}
                          formatTime={formatTimeOnlyUTC}
                          openHour={slotConfig.openHour ?? 9}
                          closeHour={slotConfig.closeHour ?? 18}
                          slotGranularityMinutes={slotConfig.slotGranularityMinutes ?? 60}
                          onSlotClick={(station, slotStartIso) => {
                            const d = new Date(slotStartIso);
                            setWalkInStartDate(d.toLocaleDateString("en-CA", { timeZone: "UTC" }));
                            setWalkInStartTime(`${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`);
                            setWalkInCenterName(station.centerName);
                            setWalkInMachineType(station.machineType);
                            setWalkInName("");
                            setWalkInPhone("");
                            setWalkInEmail("");
                            setWalkInNotes("");
                            setAddBookingOpen(true);
                          }}
                        />
                      );
                    })()}
                  </TabsContent>
                  <TabsContent value="hardware" className="space-y-4 pt-4">
                    {gridDateBookingsLoading ? (
                      <p className="text-sm text-muted-foreground py-4">Loading…</p>
                    ) : (() => {
                      const centers = centersList || [];
                      const selectedCenter = gamingSelectedCenterName || centers[0]?.name || "";
                      const todayUtc = new Date().toLocaleDateString("en-CA", { timeZone: "UTC" });
                      const dayBookings = gridDateBookings;
                      const allStations = buildVirtualStations(centers);
                      const branchStations = selectedCenter ? allStations.filter((s) => s.centerName === selectedCenter) : [];
                      const branchBookings = selectedCenter ? dayBookings.filter((b: any) => (b.centerName || "").toLowerCase() === selectedCenter.toLowerCase()) : [];
                      const now = new Date();
                      const bookedNow = branchBookings.filter((b: any) => {
                        const start = new Date(b.startTime);
                        const end = new Date(start.getTime() + (b.durationMinutes || 60) * 60000);
                        return start <= now && end >= now;
                      }).length;
                      return (
                        <>
                          <div className="flex gap-3 flex-wrap">
                            <Card className="bg-card/50 border-border p-3">
                              <p className="text-xs text-muted-foreground">Total units</p>
                              <p className="text-xl font-bold text-primary">{branchStations.length}</p>
                            </Card>
                            <Card className="bg-card/50 border-border p-3">
                              <p className="text-xs text-muted-foreground">{gridDate === todayUtc ? "Booked now" : "Bookings on this date"}</p>
                              <p className="text-xl font-bold text-primary">{gridDate === todayUtc ? bookedNow : branchBookings.length}</p>
                            </Card>
                          </div>
                          {selectedCenter ? (
                            <ul className="space-y-2">
                              {branchStations.map((s, idx) => {
                                const activeNowForMachine = branchBookings
                                  .filter((b: any) => {
                                    const cn = (b.centerName || "").toLowerCase();
                                    const mt = (b.machineType || "").toLowerCase();
                                    if (cn !== s.centerName.toLowerCase() || mt !== s.machineType.toLowerCase()) return false;
                                    const start = new Date(b.startTime);
                                    const end = new Date(start.getTime() + (b.durationMinutes || 60) * 60000);
                                    return start <= now && end >= now;
                                  })
                                  .sort((a: any, b: any) => {
                                    const byTime = (a.startTime || "").localeCompare(b.startTime || "");
                                    if (byTime !== 0) return byTime;
                                    return (a.bookingId || "").localeCompare(b.bookingId || "");
                                  });
                                const booking = activeNowForMachine[s.slotIndex] ?? null;
                                const status = booking ? "Occupied" : "Available";
                                const statusColor = booking ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
                                return (
                                  <li key={s.centerId + s.machineType + s.slotIndex + idx} className="flex items-center gap-3 rounded-lg border border-border bg-card/50 p-3">
                                    <div className="flex items-center gap-2">
                                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                                        <Headset className="h-4 w-4 text-primary" />
                                      </div>
                                      <div>
                                        <p className="font-medium text-sm">{s.displayLabel}</p>
                                        <p className="text-xs text-muted-foreground">{s.machineName}</p>
                                        <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>{status}</span>
                                      </div>
                                    </div>
                                    {booking && <span className="text-xs text-muted-foreground ml-auto">{formatTimeOnlyIST(booking.startTime)}</span>}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="text-sm text-muted-foreground">Select a branch.</p>
                          )}
                          {centers.length === 0 && <p className="text-sm text-muted-foreground">No branches configured.</p>}
                        </>
                      );
                    })()}
                  </TabsContent>
                </Tabs>
                </>
              ) : (
              /* Upcoming / Past tabs */
              <Tabs defaultValue="upcoming" className="w-full">
                <TabsList className="bg-muted/40 border border-border">
                  <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                  <TabsTrigger value="past">Past</TabsTrigger>
                </TabsList>

                {["upcoming", "past"].map((tabKey) => {
                  const now = new Date();
                  const filtered = (bookings || [])
                    .filter((b: any) => {
                      const bTime = new Date(b.startTime);
                      return tabKey === "upcoming" ? bTime >= now : bTime < now;
                    })
                    .sort((a: any, b: any) =>
                      tabKey === "upcoming"
                        ? (a.startTime || "").localeCompare(b.startTime || "")
                        : (b.startTime || "").localeCompare(a.startTime || "")
                    );
                  const isUpcoming = tabKey === "upcoming";

                  /* -- Booking chip renderer shared across all business types -- */
                  const renderBookingChip = (b: any, idx: number) => {
                    const chipId = b.bookingId || `${b.startTime}-${idx}`;
                    const isExpanded = expandedBookingId === chipId;
                    const chipStatusClass =
                      b.status === "booked" || b.status === "new" || b.status === "active"
                        ? "bg-primary/15 border-primary/30 text-primary"
                        : b.status === "confirmed" || b.status === "qualified"
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                        : b.status === "cancelled"
                        ? "bg-muted/60 border-border text-muted-foreground"
                        : "bg-primary/10 border-primary/20 text-foreground";

                    return (
                      <div key={chipId} className="inline-flex flex-col">
                        <button
                          type="button"
                          onClick={() => setExpandedBookingId(isExpanded ? null : chipId)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all hover:shadow-sm ${chipStatusClass} ${
                            isExpanded ? "ring-1 ring-primary/40" : ""
                          }`}
                        >
                          <span className="font-semibold">{formatTimeOnlyIST(b.startTime)}</span>
                          <span className="opacity-80">·</span>
                          <span className="truncate max-w-[140px]">{b.name || "—"}</span>
                          {b.status && (
                            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] capitalize ${
                              bookingStatusColors[b.status] || "bg-primary/10 text-primary"
                            }`}>
                              {b.status}
                            </span>
                          )}
                          {isExpanded ? <ChevronUp className="h-3 w-3 ml-0.5 shrink-0" /> : <ChevronDown className="h-3 w-3 ml-0.5 shrink-0" />}
                        </button>
                        {isExpanded && (
                          <div className="mt-1.5 ml-1 rounded-lg border border-border bg-card p-3 text-xs space-y-2 shadow-sm max-w-xs">
                            <div>
                              <p className="text-muted-foreground font-medium">Time</p>
                              <p className="font-medium">{formatDateTimeUTC(b.startTime)}</p>
                              {b.durationMinutes != null && <p className="text-muted-foreground">{b.durationMinutes} min</p>}
                            </div>
                            <div>
                              <p className="text-muted-foreground font-medium">Customer</p>
                              <p className="font-medium">{b.name || "—"}</p>
                              <p className="text-muted-foreground break-all">{[b.phone, b.email].filter(Boolean).join(" · ") || "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground font-medium">Type</p>
                              <p className="font-medium">{getBookingTypeLabel(b)}</p>
                            </div>
                            {b.notes && (
                              <div>
                                <p className="text-muted-foreground font-medium">Notes</p>
                                <p className="italic">{b.notes}</p>
                              </div>
                            )}
                            {isUpcoming && b.status !== "cancelled" && (
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 text-xs mt-1"
                                disabled={cancellingBooking === (b.bookingId ? `${b.startTime}#${b.bookingId}` : b.startTime)}
                                onClick={(e) => { e.stopPropagation(); cancelBooking(b); }}
                              >
                                {cancellingBooking === (b.bookingId ? `${b.startTime}#${b.bookingId}` : b.startTime) ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                Cancel booking
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  };

                  return (
                    <TabsContent key={tabKey} value={tabKey} className="space-y-4">
                      {filtered.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">
                          {isUpcoming
                            ? "No upcoming bookings. Bookings created by your AI voice or via the API will appear here."
                            : "No past bookings to show."}
                        </p>
                      ) : useCase?.id === "gaming_cafe" ? (
                        /* ── Gaming Cafe: cards per center ── */
                        (() => {
                          const centerNames = Array.from(new Set(filtered.map((b: any) => b.centerName || "Unknown Center")));
                          return (
                            <div className="space-y-4">
                              {centerNames.map((cName) => {
                                const centerBookings = filtered.filter((b: any) => (b.centerName || "Unknown Center") === cName);
                                const centerInfo = centersList.find((c: any) => c.name === cName);
                                /* Group by machine type */
                                const machineTypes = Array.from(new Set(centerBookings.map((b: any) => b.machineType || "General")));
                                return (
                                  <Card key={cName} className="bg-card/50 border-border">
                                    <CardHeader className="pb-2">
                                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                        <Building2 className="h-4 w-4 text-primary" />
                                        {cName}
                                        {centerInfo && (
                                          <span className="text-xs font-normal text-muted-foreground ml-2">
                                            {centerInfo.location || ""}
                                          </span>
                                        )}
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                      {machineTypes.map((mType) => {
                                        const machineBookings = centerBookings.filter((b: any) => (b.machineType || "General") === mType);
                                        const centerMachineInfo = centerInfo?.machines?.find((m: any) => m.type === mType);
                                        const totalCount = centerMachineInfo?.count ?? "?";
                                        const bookedCount = machineBookings.filter((b: any) => b.status !== "cancelled").length;
                                        const pricePerHr = centerMachineInfo?.pricePerHour;
                                        return (
                                          <div key={mType} className="space-y-1.5">
                                            <div className="flex items-center gap-2 text-sm">
                                              <span className="font-medium">{mType}</span>
                                              <span className="text-xs text-muted-foreground">
                                                — {typeof totalCount === "number" ? `${Math.max(0, totalCount - bookedCount)}/${totalCount} available` : `${bookedCount} booked`}
                                              </span>
                                              {pricePerHr != null && (
                                                <span className="text-xs text-muted-foreground ml-auto">{pricePerHr}/hr</span>
                                              )}
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                              {machineBookings.map((b: any, idx: number) => renderBookingChip(b, idx))}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          );
                        })()
                      ) : useCase?.id === "salon" ? (
                        /* ── Salon: cards per branch ── */
                        (() => {
                          const branchIds = Array.from(new Set(filtered.map((b: any) => b.branchId || "walk-in")));
                          return (
                            <div className="space-y-4">
                              {branchIds.map((bId) => {
                                const branchBookings = filtered.filter((b: any) => (b.branchId || "walk-in") === bId);
                                const branchInfo = branchesList.find((br: any) => br.branchId === bId);
                                const branchName = branchInfo?.name || bId;
                                const capacity = branchInfo?.capacity;
                                const activeCount = branchBookings.filter((b: any) => b.status !== "cancelled").length;
                                return (
                                  <Card key={bId} className="bg-card/50 border-border">
                                    <CardHeader className="pb-2">
                                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                        <Building2 className="h-4 w-4 text-primary" />
                                        {branchName}
                                        {capacity != null && (
                                          <span className={`text-xs font-normal ml-2 px-2 py-0.5 rounded-full ${
                                            activeCount >= capacity
                                              ? "bg-red-500/15 text-red-400"
                                              : "bg-emerald-500/15 text-emerald-400"
                                          }`}>
                                            {activeCount}/{capacity} slots used
                                          </span>
                                        )}
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                      <div className="flex flex-wrap gap-1.5">
                                        {branchBookings.map((b: any, idx: number) => {
                                          const svc = servicesList.find((s: any) => s.serviceId === b.serviceId);
                                          const svcName = svc?.name || b.serviceId || "";
                                          const chipId = b.bookingId || `${b.startTime}-${idx}`;
                                          const isExpanded = expandedBookingId === chipId;
                                          const chipStatusClass =
                                            b.status === "booked" || b.status === "new" || b.status === "active"
                                              ? "bg-primary/15 border-primary/30 text-primary"
                                              : b.status === "confirmed" || b.status === "qualified"
                                              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                                              : b.status === "cancelled"
                                              ? "bg-muted/60 border-border text-muted-foreground"
                                              : "bg-primary/10 border-primary/20 text-foreground";
                                          return (
                                            <div key={chipId} className="inline-flex flex-col">
                                              <button
                                                type="button"
                                                onClick={() => setExpandedBookingId(isExpanded ? null : chipId)}
                                                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all hover:shadow-sm ${chipStatusClass} ${
                                                  isExpanded ? "ring-1 ring-primary/40" : ""
                                                }`}
                                              >
                                                {svcName && <span className="font-semibold truncate max-w-[100px]">{svcName}</span>}
                                                <span className="opacity-80">·</span>
                                                <span>{formatTimeOnlyIST(b.startTime)}</span>
                                                <span className="opacity-80">·</span>
                                                <span className="truncate max-w-[100px]">{b.name || "—"}</span>
                                                {isExpanded ? <ChevronUp className="h-3 w-3 ml-0.5 shrink-0" /> : <ChevronDown className="h-3 w-3 ml-0.5 shrink-0" />}
                                              </button>
                                              {isExpanded && (
                                                <div className="mt-1.5 ml-1 rounded-lg border border-border bg-card p-3 text-xs space-y-2 shadow-sm max-w-xs">
                                                  <div>
                                                    <p className="text-muted-foreground font-medium">Time</p>
                                                    <p className="font-medium">{formatDateTimeUTC(b.startTime)}</p>
                                                    {b.durationMinutes != null && <p className="text-muted-foreground">{b.durationMinutes} min</p>}
                                                  </div>
                                                  {svcName && (
                                                    <div>
                                                      <p className="text-muted-foreground font-medium">Service</p>
                                                      <p className="font-medium">{svcName}</p>
                                                    </div>
                                                  )}
                                                  <div>
                                                    <p className="text-muted-foreground font-medium">Customer</p>
                                                    <p className="font-medium">{b.name || "—"}</p>
                                                    <p className="text-muted-foreground break-all">{[b.phone, b.email].filter(Boolean).join(" · ") || "—"}</p>
                                                  </div>
                                                  {b.status && (
                                                    <span className={`inline-block px-2 py-0.5 rounded-full capitalize ${bookingStatusColors[b.status] || "bg-primary/10 text-primary"}`}>{b.status}</span>
                                                  )}
                                                  {b.notes && (
                                                    <div>
                                                      <p className="text-muted-foreground font-medium">Notes</p>
                                                      <p className="italic">{b.notes}</p>
                                                    </div>
                                                  )}
                                                  {isUpcoming && b.status !== "cancelled" && (
                                                    <Button
                                                      variant="destructive"
                                                      size="sm"
                                                      className="h-7 text-xs mt-1"
                                                      disabled={cancellingBooking === (b.bookingId ? `${b.startTime}#${b.bookingId}` : b.startTime)}
                                                      onClick={(e) => { e.stopPropagation(); cancelBooking(b); }}
                                                    >
                                                      {cancellingBooking === (b.bookingId ? `${b.startTime}#${b.bookingId}` : b.startTime) ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                                      Cancel booking
                                                    </Button>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          );
                        })()
                      ) : useCase?.id === "clinic" ? (
                        /* ── Clinic: cards per doctor ── */
                        (() => {
                          const docIds = Array.from(new Set(filtered.map((b: any) => b.doctorId || "unassigned")));
                          return (
                            <div className="space-y-4">
                              {docIds.map((dId) => {
                                const docBookings = filtered.filter((b: any) => (b.doctorId || "unassigned") === dId);
                                const docInfo = doctorsList.find((d: any) => d.doctorId === dId);
                                const docName = docInfo?.name || dId;
                                const specialty = docInfo?.specialty || "";
                                return (
                                  <Card key={dId} className="bg-card/50 border-border">
                                    <CardHeader className="pb-2">
                                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                        <User className="h-4 w-4 text-primary" />
                                        {docName}
                                        {specialty && (
                                          <span className="text-xs font-normal text-muted-foreground ml-1">
                                            ({specialty})
                                          </span>
                                        )}
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                      <div className="flex flex-wrap gap-1.5">
                                        {docBookings.map((b: any, idx: number) => {
                                          const chipId = b.bookingId || `${b.startTime}-${idx}`;
                                          const isExpanded = expandedBookingId === chipId;
                                          const chipStatusClass =
                                            b.status === "booked" || b.status === "new" || b.status === "active"
                                              ? "bg-primary/15 border-primary/30 text-primary"
                                              : b.status === "confirmed" || b.status === "qualified"
                                              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                                              : b.status === "cancelled"
                                              ? "bg-muted/60 border-border text-muted-foreground"
                                              : "bg-primary/10 border-primary/20 text-foreground";
                                          return (
                                            <div key={chipId} className="inline-flex flex-col">
                                              <button
                                                type="button"
                                                onClick={() => setExpandedBookingId(isExpanded ? null : chipId)}
                                                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all hover:shadow-sm ${chipStatusClass} ${
                                                  isExpanded ? "ring-1 ring-primary/40" : ""
                                                }`}
                                              >
                                                <span className="font-semibold">{formatTimeOnlyIST(b.startTime)}</span>
                                                <span className="opacity-80">·</span>
                                                <span className="truncate max-w-[120px]">{b.name || "—"}</span>
                                                {isExpanded ? <ChevronUp className="h-3 w-3 ml-0.5 shrink-0" /> : <ChevronDown className="h-3 w-3 ml-0.5 shrink-0" />}
                                              </button>
                                              {isExpanded && (
                                                <div className="mt-1.5 ml-1 rounded-lg border border-border bg-card p-3 text-xs space-y-2 shadow-sm max-w-xs">
                                                  <div>
                                                    <p className="text-muted-foreground font-medium">Time</p>
                                                    <p className="font-medium">{formatDateTimeUTC(b.startTime)}</p>
                                                    {b.durationMinutes != null && <p className="text-muted-foreground">{b.durationMinutes} min</p>}
                                                  </div>
                                                  <div>
                                                    <p className="text-muted-foreground font-medium">Patient</p>
                                                    <p className="font-medium">{b.name || "—"}</p>
                                                    <p className="text-muted-foreground break-all">{[b.phone, b.email].filter(Boolean).join(" · ") || "—"}</p>
                                                  </div>
                                                  {specialty && (
                                                    <div>
                                                      <p className="text-muted-foreground font-medium">Specialty</p>
                                                      <p className="font-medium">{specialty}</p>
                                                    </div>
                                                  )}
                                                  {b.status && (
                                                    <span className={`inline-block px-2 py-0.5 rounded-full capitalize ${bookingStatusColors[b.status] || "bg-primary/10 text-primary"}`}>{b.status}</span>
                                                  )}
                                                  {b.notes && (
                                                    <div>
                                                      <p className="text-muted-foreground font-medium">Notes</p>
                                                      <p className="italic">{b.notes}</p>
                                                    </div>
                                                  )}
                                                  {isUpcoming && b.status !== "cancelled" && (
                                                    <Button
                                                      variant="destructive"
                                                      size="sm"
                                                      className="h-7 text-xs mt-1"
                                                      disabled={cancellingBooking === (b.bookingId ? `${b.startTime}#${b.bookingId}` : b.startTime)}
                                                      onClick={(e) => { e.stopPropagation(); cancelBooking(b); }}
                                                    >
                                                      {cancellingBooking === (b.bookingId ? `${b.startTime}#${b.bookingId}` : b.startTime) ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                                      Cancel booking
                                                    </Button>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          );
                        })()
                      ) : (
                        /* ── Fallback / Retail: group by date ── */
                        (() => {
                          const byDate: Record<string, any[]> = {};
                          filtered.forEach((b: any) => {
                            const key = getDateInIST(b.startTime) || "Unknown";
                            if (!byDate[key]) byDate[key] = [];
                            byDate[key].push(b);
                          });
                          const sortedDates = Object.keys(byDate).sort((a, b) =>
                            isUpcoming ? a.localeCompare(b) : b.localeCompare(a)
                          );
                          return (
                            <div className="space-y-4">
                              {sortedDates.map((dateKey) => (
                                <Card key={dateKey} className="bg-card/50 border-border">
                                  <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                      <CalendarIcon className="h-4 w-4 text-primary" />
                                      {(() => {
                                        try {
                                          const [y, m, d] = dateKey.split("-").map(Number);
                                          return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
                                        } catch {
                                          return dateKey;
                                        }
                                      })()}
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="flex flex-wrap gap-1.5">
                                      {byDate[dateKey].map((b: any, idx: number) => renderBookingChip(b, idx))}
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          );
                        })()
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
              )}

              <Dialog open={addBookingOpen} onOpenChange={setAddBookingOpen}>
                <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add booking (walk-in)</DialogTitle>
                    <DialogDescription>Create a booking for a walk-in customer. All times are in IST.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Date (IST)</Label>
                        <Popover open={walkInDatePickerOpen} onOpenChange={setWalkInDatePickerOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {walkInStartDate ? format(new Date(walkInStartDate + "T12:00:00"), "MMM d, yyyy") : "Pick date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={walkInStartDate ? new Date(walkInStartDate + "T12:00:00") : undefined}
                              onSelect={(d) => {
                                if (d) {
                                  setWalkInStartDate(format(d, "yyyy-MM-dd"));
                                  setWalkInDatePickerOpen(false);
                                }
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-1">
                        <Label>Time (IST)</Label>
                        <Input type="time" value={walkInStartTime} onChange={(e) => setWalkInStartTime(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Duration (minutes)</Label>
                      <Input type="number" min={1} value={walkInDuration} onChange={(e) => setWalkInDuration(Number(e.target.value) || 60)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Customer name *</Label>
                      <Input value={walkInName} onChange={(e) => setWalkInName(e.target.value)} placeholder="Name" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Phone</Label>
                        <Input value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} placeholder="Phone" />
                      </div>
                      <div className="space-y-1">
                        <Label>Email</Label>
                        <Input type="email" value={walkInEmail} onChange={(e) => setWalkInEmail(e.target.value)} placeholder="Email" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">At least one of phone or email is required.</p>
                    {useCase?.id === "salon" && (
                      <>
                        <div className="space-y-1">
                          <Label>Branch</Label>
                          <Select value={walkInBranchId} onValueChange={setWalkInBranchId}>
                            <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                            <SelectContent>
                              {branchesList.map((b: any) => (
                                <SelectItem key={b.branchId} value={b.branchId}>{b.name || b.branchId}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Service</Label>
                          <Select value={walkInServiceId} onValueChange={(v) => { setWalkInServiceId(v); const s = servicesList.find((x: any) => x.serviceId === v); if (s?.durationMinutes) setWalkInDuration(s.durationMinutes); }}>
                            <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                            <SelectContent>
                              {servicesList.map((s: any) => (
                                <SelectItem key={s.serviceId} value={s.serviceId}>{s.name || s.serviceId} ({s.durationMinutes} min)</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    {useCase?.id === "clinic" && (
                      <>
                        <div className="space-y-1">
                          <Label>Doctor</Label>
                          <Select value={walkInDoctorId} onValueChange={setWalkInDoctorId}>
                            <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                            <SelectContent>
                              {(doctorsList || []).map((d: any) => (
                                <SelectItem key={d.doctorId} value={d.doctorId}>{d.name || d.doctorId}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Location</Label>
                          <Select value={walkInLocationId} onValueChange={setWalkInLocationId}>
                            <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                            <SelectContent>
                              {(locationsList || []).map((l: any) => (
                                <SelectItem key={l.locationId} value={l.locationId}>{l.name || l.locationId}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Service</Label>
                          <Select value={walkInServiceId} onValueChange={(v) => { setWalkInServiceId(v); const s = servicesList.find((x: any) => x.serviceId === v); if (s?.durationMinutes) setWalkInDuration(s.durationMinutes); }}>
                            <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                            <SelectContent>
                              {servicesList.map((s: any) => (
                                <SelectItem key={s.serviceId} value={s.serviceId}>{s.name || s.serviceId} ({s.durationMinutes} min)</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    {useCase?.id === "gaming_cafe" && (
                      <>
                        <div className="space-y-1">
                          <Label>Center</Label>
                          <Select value={walkInCenterName} onValueChange={setWalkInCenterName}>
                            <SelectTrigger><SelectValue placeholder="Select center" /></SelectTrigger>
                            <SelectContent>
                              {centersList.map((c: any) => (
                                <SelectItem key={c.centerId} value={c.name || c.centerId}>{c.name || c.centerId}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Machine type</Label>
                          <Input value={walkInMachineType} onChange={(e) => setWalkInMachineType(e.target.value)} placeholder="e.g. PC, Console" />
                        </div>
                      </>
                    )}
                    <div className="space-y-1">
                      <Label>Notes (optional)</Label>
                      <Input value={walkInNotes} onChange={(e) => setWalkInNotes(e.target.value)} placeholder="Notes" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddBookingOpen(false)}>Cancel</Button>
                    <Button
                      disabled={walkInSubmitting || !walkInName.trim() || (!walkInPhone.trim() && !walkInEmail.trim()) || !walkInStartDate || !walkInStartTime}
                      onClick={async () => {
                        if (!apiBase || !yandleHandle) return;
                        const startTime = `${walkInStartDate}T${walkInStartTime}:00+05:30`;
                        setWalkInSubmitting(true);
                        try {
                          const body: Record<string, unknown> = {
                            handle: yandleHandle,
                            startTime,
                            name: walkInName.trim(),
                            phone: walkInPhone.trim() || undefined,
                            email: walkInEmail.trim() || undefined,
                            durationMinutes: walkInDuration,
                            notes: walkInNotes.trim() || undefined,
                          };
                          if (walkInBranchId) body.branchId = walkInBranchId;
                          if (walkInServiceId) body.serviceId = walkInServiceId;
                          if (walkInDoctorId) body.doctorId = walkInDoctorId;
                          if (walkInLocationId) body.locationId = walkInLocationId;
                          if (walkInCenterName) body.centerName = walkInCenterName;
                          if (walkInMachineType) body.machineType = walkInMachineType;
                          const r = await fetch(`${apiBase}/bookings`, {
                            method: "POST",
                            headers: { "content-type": "application/json", authorization: `Bearer ${localStorage.getItem("yandle_id_token") || ""}` },
                            body: JSON.stringify(body),
                          });
                          const data = r.ok ? await r.json() : null;
                          if (r.ok && data?.booking) {
                            setBookings((prev) => [...(prev || []), data.booking].sort((a, b) => (a.startTime || "").localeCompare(b.startTime || "")));
                            setAddBookingOpen(false);
                            toast({ title: "Booking created" });
                          } else {
                            toast({ title: "Error", description: (data as any)?.error || "Failed to create booking", variant: "destructive" });
                          }
                        } finally {
                          setWalkInSubmitting(false);
                        }
                      }}
                    >
                      {walkInSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Create booking
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </motion.div>
          )}

          {/* Requests tab — general business type */}
          {activeNav === "requests" && useCase?.id === "general" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Callback Requests</h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRequestsLoading(true);
                    const token = localStorage.getItem("yandle_id_token") || "";
                    fetch(`${apiBase}/requests?handle=${encodeURIComponent(yandleHandle)}`, {
                      headers: { authorization: `Bearer ${token}` },
                    })
                      .then((r) => (r.ok ? r.json() : null))
                      .then((data) => setRequestsList(Array.isArray(data?.items) ? data.items : []))
                      .catch(() => {})
                      .finally(() => setRequestsLoading(false));
                  }}
                >
                  Refresh
                </Button>
              </div>
              {requestsLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin h-8 w-8 text-muted-foreground" /></div>
              ) : requestsList.length === 0 ? (
                <Card className="bg-card/50 border-border">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    No requests yet — requests will appear once callers leave callback messages via AI.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {requestsList.map((req) => (
                    <Card key={req.requestId} className="bg-card/50 border-border">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{req.callerName || "Unknown"}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                req.classification === "important" ? "bg-emerald-500/20 text-emerald-600" :
                                req.classification === "spam" ? "bg-red-500/20 text-red-600" :
                                "bg-yellow-500/20 text-yellow-600"
                              }`}>
                                {req.classification || "unknown"}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                req.status === "new" ? "bg-blue-500/20 text-blue-600" :
                                req.status === "reviewed" ? "bg-purple-500/20 text-purple-600" :
                                "bg-emerald-500/20 text-emerald-600"
                              }`}>
                                {req.status}
                              </span>
                            </div>
                            {req.phone && <p className="text-sm text-muted-foreground">Phone: {req.phone}</p>}
                            {req.email && <p className="text-sm text-muted-foreground">Email: {req.email}</p>}
                            {req.description && <p className="text-sm text-foreground mt-1">{req.description}</p>}
                            <p className="text-xs text-muted-foreground">{formatInIST(req.createdAt)} &middot; via {req.source}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Select
                              value={req.status}
                              onValueChange={async (val) => {
                                const token = localStorage.getItem("yandle_id_token") || "";
                                await fetch(`${apiBase}/requests`, {
                                  method: "PUT",
                                  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ handle: yandleHandle, requestId: req.requestId, status: val }),
                                });
                                setRequestsList((prev) => prev.map((r) => r.requestId === req.requestId ? { ...r, status: val } : r));
                              }}
                            >
                              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="new">New</SelectItem>
                                <SelectItem value="reviewed">Reviewed</SelectItem>
                                <SelectItem value="actioned">Actioned</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Tickets tab — customer_support business type */}
          {activeNav === "tickets" && useCase?.id === "customer_support" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Support Tickets</h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTicketsLoading(true);
                    const token = localStorage.getItem("yandle_id_token") || "";
                    fetch(`${apiBase}/tickets?handle=${encodeURIComponent(yandleHandle)}`, {
                      headers: { authorization: `Bearer ${token}` },
                    })
                      .then((r) => (r.ok ? r.json() : null))
                      .then((data) => setTicketsList(Array.isArray(data?.items) ? data.items : []))
                      .catch(() => {})
                      .finally(() => setTicketsLoading(false));
                  }}
                >
                  Refresh
                </Button>
              </div>
              {ticketsLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin h-8 w-8 text-muted-foreground" /></div>
              ) : ticketsList.length === 0 ? (
                <Card className="bg-card/50 border-border">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    No tickets yet — tickets will appear once customers report issues via AI.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {ticketsList.map((ticket) => (
                    <Card key={ticket.ticketId} className="bg-card/50 border-border">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm text-muted-foreground">{ticket.ticketId}</span>
                              <span className="font-medium text-foreground">{ticket.customerName || "Unknown"}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                ticket.priority === "high" ? "bg-red-500/20 text-red-600" :
                                ticket.priority === "low" ? "bg-gray-500/20 text-gray-600" :
                                "bg-yellow-500/20 text-yellow-600"
                              }`}>
                                {ticket.priority}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                                {ticket.category}
                              </span>
                            </div>
                            {ticket.phone && <p className="text-sm text-muted-foreground">Phone: {ticket.phone}</p>}
                            {ticket.email && <p className="text-sm text-muted-foreground">Email: {ticket.email}</p>}
                            {ticket.description && <p className="text-sm text-foreground mt-1">{ticket.description}</p>}
                            <p className="text-xs text-muted-foreground">{formatInIST(ticket.createdAt)} &middot; via {ticket.source}</p>
                            {ticket.resolvedAt && <p className="text-xs text-emerald-600">Resolved: {formatInIST(ticket.resolvedAt)}</p>}
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Select
                              value={ticket.status}
                              onValueChange={async (val) => {
                                setUpdatingTicketId(ticket.ticketId);
                                const token = localStorage.getItem("yandle_id_token") || "";
                                await fetch(`${apiBase}/tickets`, {
                                  method: "PUT",
                                  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ handle: yandleHandle, ticketId: ticket.ticketId, status: val }),
                                });
                                setTicketsList((prev) => prev.map((t) =>
                                  t.ticketId === ticket.ticketId
                                    ? { ...t, status: val, resolvedAt: (val === "Resolved" || val === "Closed") ? new Date().toISOString() : t.resolvedAt }
                                    : t
                                ));
                                setUpdatingTicketId(null);
                              }}
                            >
                              <SelectTrigger className="w-[130px] h-8 text-xs">
                                {updatingTicketId === ticket.ticketId ? <Loader2 className="animate-spin h-3 w-3" /> : <SelectValue />}
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Open">Open</SelectItem>
                                <SelectItem value="InProgress">In Progress</SelectItem>
                                <SelectItem value="Resolved">Resolved</SelectItem>
                                <SelectItem value="Closed">Closed</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeNav === "customers" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <Card className="bg-card/50 border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base font-display font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      Customers
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      People who have booked or interacted with <strong>{yandleHandle || "—"}</strong>
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!apiBase || !yandleHandle) return;
                      const token = localStorage.getItem("yandle_id_token") || "";
                      fetch(`${apiBase}/customers?handle=${encodeURIComponent(yandleHandle)}`, {
                        headers: { authorization: `Bearer ${token}` },
                      })
                        .then((r) => (r.ok ? r.json() : null))
                        .then((data) => setCustomers(Array.isArray(data?.customers) ? data.customers : []))
                        .catch(() => {});
                    }}
                  >
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent>
                  {(Array.isArray(customers) && customers.length > 0) ? (
                    <div className="space-y-2">
                      {customers.map((c: any, idx: number) => (
                        <div
                          key={c.customerId || idx}
                          className="flex flex-wrap items-center justify-between gap-2 py-3 px-3 rounded-lg bg-secondary/30 border border-border/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{c.name || "—"}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {[c.phone, c.email].filter(Boolean).join(" · ") || "No contact"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Last booking: {c.lastBookingAt ? formatTimeAgo(c.lastBookingAt) : "—"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No customers yet. Customers are added when someone books via your AI or API.
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeNav === "conversations" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl font-semibold">Conversations</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">All voice and text sessions for <strong>{yandleHandle}</strong></p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!apiBase || !yandleHandle) return;
                    const token = localStorage.getItem("yandle_id_token") || "";
                    fetch(`${apiBase}/public/${yandleHandle}/conversations?limit=50`, { headers: { authorization: `Bearer ${token}` } })
                      .then((r) => (r.ok ? r.json() : null))
                      .then((data) => {
                        const sessions = data?.sessions || [];
                        setConversations(sessions.map((s: any) => ({
                          user: s.callerName || (s.owner && s.owner !== "anonymous" ? s.owner : null) || s.displayName || null,
                          intent: s.lastMessagePreview || s.intent || "",
                          channel: (s.channel || "text").toLowerCase(),
                          duration: s.duration || null,
                          status: (s.status || "new").toLowerCase(),
                          time: formatTimeAgo(s.createdAt),
                          createdAt: s.createdAt,
                          sessionId: s.pk?.replace("SESSION#", "") || s.sessionId,
                          recordingUrl: s.recordingUrl || null,
                          messages: Array.isArray(s.messages) ? s.messages : [],
                        })));
                      })
                      .catch(() => {});
                  }}
                >
                  Refresh
                </Button>
              </div>

              {conversations.length === 0 ? (
                <Card className="bg-card/50 border-border">
                  <CardContent className="py-12 text-center">
                    <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No conversations yet. Sessions from your AI voice and text will appear here.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conv: any, i: number) => {
                    const isExpanded = expandedConvId === (conv.sessionId || i.toString());
                    return (
                      <Card key={conv.sessionId || i} className="bg-card/50 border-border overflow-hidden">
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setExpandedConvId(isExpanded ? null : (conv.sessionId || i.toString()))}
                        >
                          <div className="flex items-center gap-3 p-4">
                            <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                              conv.channel === "voice" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
                            }`}>
                              {conv.channel === "voice" ? <Mic className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate">
                                  {conv.user || <span className="text-muted-foreground italic">Anonymous caller</span>}
                                </p>
                                <span className={`text-xs px-2 py-0.5 rounded-full capitalize shrink-0 ${statusColors[conv.status] || "bg-muted text-muted-foreground"}`}>
                                  {conv.status}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {conv.channel === "voice" ? "Voice call" : "Text chat"}
                                {conv.duration ? ` · ${conv.duration}` : ""}
                                {conv.intent ? ` · ${conv.intent}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-xs text-muted-foreground">{conv.time}</span>
                              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            </div>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                            {conv.recordingUrl && (
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground">Recording</p>
                                <audio
                                  controls
                                  src={conv.recordingUrl}
                                  className="w-full h-9"
                                  style={{ borderRadius: "6px" }}
                                />
                              </div>
                            )}
                            {conv.messages && conv.messages.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Transcript</p>
                                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                                  {conv.messages.map((msg: any, mi: number) => (
                                    <div key={mi} className={`text-xs rounded-lg px-3 py-2 ${
                                      msg.role === "assistant" || msg.role === "ai"
                                        ? "bg-primary/10 text-foreground"
                                        : "bg-secondary/50 text-foreground"
                                    }`}>
                                      <span className="font-medium text-muted-foreground mr-1">
                                        {msg.role === "assistant" || msg.role === "ai" ? "AI:" : (conv.user || "Caller") + ":"}
                                      </span>
                                      {msg.content || msg.text || ""}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : conv.intent ? (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Last message</p>
                                <p className="text-xs text-foreground">{conv.intent}</p>
                              </div>
                            ) : null}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                              {conv.createdAt && <span>Started {formatInIST(conv.createdAt)}</span>}
                              {conv.sessionId && <span className="font-mono opacity-50">{conv.sessionId}</span>}
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {activeNav === "voice" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 max-w-2xl"
            >
              <div className="rounded-xl border border-border bg-card/50 p-6 bg-radial-glow relative overflow-hidden">
                <div className="relative z-10 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-2xl font-bold mb-1">Voice Experience</h2>
                    <p className="text-sm text-muted-foreground">
                      Configure the voice, persona, and behavior callers hear on your YANDLE link.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 shrink-0"
                    onClick={() => window.open(shareablePath, "_blank")}
                  >
                    <PhoneCall className="h-4 w-4" /> Test Voice
                  </Button>
                </div>
              </div>

              <Card className="bg-card/50 border-border">
                <CardHeader>
                  <CardTitle className="text-base font-display font-semibold flex items-center gap-2">
                    <Mic className="h-4 w-4 text-primary" />
                    Business Voice
                  </CardTitle>
                  <p className="text-sm text-muted-foreground font-normal">
                    Voice callers hear on your public link (callcentral.io/shareable/{yandleHandle || "yourname"}).
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Select voice</Label>
                    <Select
                      value={(formData.voiceId as string) || "tiffany"}
                      onValueChange={(value) => saveVoice(value)}
                      disabled={voiceSaving}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a voice" />
                      </SelectTrigger>
                      <SelectContent>
                        {VOICE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {voiceSaving && <p className="text-xs text-muted-foreground">Saving…</p>}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-border">
                <CardHeader>
                  <CardTitle className="text-base font-display font-semibold flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    AI Persona
                  </CardTitle>
                  <p className="text-sm text-muted-foreground font-normal">
                    Instructions for how the AI should behave, what to say first, and its personality.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Persona prompt</Label>
                    <Textarea
                      value={persona}
                      onChange={(e) => setPersona(e.target.value)}
                      placeholder={`You are a helpful assistant for ${displayName || yandleHandle}. Greet callers warmly, answer their questions about services and bookings, and speak clearly and professionally.`}
                      className="min-h-[120px] bg-card/50 text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      This sets the AI's opening instructions. Keep it concise — focus on tone, role, and key info.
                    </p>
                  </div>
                  <Button onClick={savePersona} disabled={personaSaving}>
                    {personaSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Save persona
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}



          {activeNav === "knowledgebase" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 max-w-2xl"
            >
              <Card className="bg-card/50 border-border">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <CardTitle className="font-display text-xl">Knowledge Base</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">Update the data your voice agent uses. Changes sync to the knowledge base automatically.</p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Button
                        size="sm"
                        disabled={kbSaving}
                        onClick={async () => {
                          const token = localStorage.getItem("yandle_id_token") || "";
                          const normalizedHandle = yandleHandle.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
                          if (!normalizedHandle) {
                            toast({ title: "Error", description: "Select a handle first.", variant: "destructive" });
                            return;
                          }
                          setKbSaving(true);
                          try {
                            const r = await fetch(`${apiBase}/handle`, {
                              method: "POST",
                              headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                              body: JSON.stringify({ handle: normalizedHandle, displayName: displayName || yandleHandle, knowledgeBaseCustomText }),
                            });
                            if (r.ok) {
                              toast({ title: "Saved", description: "Triggering sync to voice agent…" });
                              const syncRes = await fetch(`${apiBase}/knowledge/sync`, {
                                method: "POST",
                                headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                body: JSON.stringify({ handle: normalizedHandle }),
                              });
                              const syncText = await syncRes.text();
                              let syncData: { ok?: boolean; message?: string; error?: string } | null = null;
                              try {
                                syncData = JSON.parse(syncText);
                              } catch {
                                /* non-JSON response */
                              }
                              if (syncRes.ok && syncData?.ok) {
                                toast({ title: "Sync started", description: "Voice agent may take 2–5 minutes to reflect changes." });
                              } else {
                                const msg = syncData?.error || syncData?.message || "Sync failed.";
                                const hint = msg.toLowerCase().includes("no knowledge base") ? " Save your profile in Settings once, then try again." : "";
                                toast({ title: "Sync issue", description: msg + hint, variant: "destructive" });
                              }
                            } else {
                              const errBody = await r.text();
                              let msg = "Failed to save.";
                              try {
                                const j = JSON.parse(errBody);
                                msg = j.error || j.message || msg;
                              } catch {
                                if (errBody) msg = errBody.slice(0, 200);
                              }
                              toast({ title: "Error", description: msg, variant: "destructive" });
                            }
                          } finally {
                            setKbSaving(false);
                          }
                        }}
                      >
                        {kbSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Save & sync to voice
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={kbSyncing}
                        onClick={async () => {
                          const token = localStorage.getItem("yandle_id_token") || "";
                          const normalizedHandle = yandleHandle.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
                          if (!normalizedHandle) {
                            toast({ title: "Error", description: "Select a handle first.", variant: "destructive" });
                            return;
                          }
                          setKbSyncing(true);
                          try {
                            const r = await fetch(`${apiBase}/knowledge/sync`, {
                              method: "POST",
                              headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                              body: JSON.stringify({ handle: normalizedHandle }),
                            });
                            const data = r.ok ? await r.json() : null;
                            if (data?.ok) {
                              toast({ title: "Sync started", description: "Voice agent may take 2–5 minutes to reflect changes." });
                            } else {
                              const msg = data?.message || "Sync failed or no KB configured.";
                              const hint = msg.toLowerCase().includes("no knowledge base") ? " Save your profile in Settings once, then try again." : "";
                              toast({ title: "Sync", description: msg + hint, variant: "destructive" });
                            }
                          } finally {
                            setKbSyncing(false);
                          }
                        }}
                      >
                        {kbSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Sync now
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">

                  {/* ── Gaming café: centers & machines ──────────────── */}
                  {useCase?.id === "gaming_cafe" && (
                    <div className="space-y-4">
                      <Label className="text-base">Gaming centers & machines</Label>
                      <p className="text-xs text-muted-foreground">Centers with machine types, capacity, and pricing. Used for capacity checks and voice answers.</p>
                      <ul className="space-y-2">
                        {centersList.map((c: any) => (
                          <li key={c.centerId} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                            <span><strong>{c.name || c.centerId}</strong>{c.location ? ` · ${c.location}` : ""}
                              {(c.machines || []).length > 0 && (
                                <span className="text-muted-foreground ml-2">
                                  ({c.machines.map((m: any) => `${m.name || m.type} x${m.count ?? 1}`).join(", ")})
                                </span>
                              )}
                            </span>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => {
                              const token = localStorage.getItem("yandle_id_token") || "";
                              const r = await fetch(`${apiBase}/centers?handle=${encodeURIComponent(yandleHandle)}`, {
                                method: "DELETE",
                                headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                body: JSON.stringify({ handle: yandleHandle, centerId: c.centerId }),
                              });
                              if (r.ok) setCentersList((prev) => prev.filter((x: any) => x.centerId !== c.centerId));
                            }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Input placeholder="Center name" value={newCenterName} onChange={(e) => setNewCenterName(e.target.value)} className="w-36" />
                        <Input placeholder="Location" value={newCenterLocation} onChange={(e) => setNewCenterLocation(e.target.value)} className="w-32" />
                        <Input placeholder="Machine type" value={newCenterMachineType} onChange={(e) => setNewCenterMachineType(e.target.value)} className="w-28" />
                        <Input type="number" min={1} placeholder="Count" value={newCenterMachineCount} onChange={(e) => setNewCenterMachineCount(Number(e.target.value) || 1)} className="w-20" />
                        <Input type="number" min={0} placeholder="₹/hr" value={newCenterPricePerHour} onChange={(e) => setNewCenterPricePerHour(Number(e.target.value) || 0)} className="w-20" />
                        <Button size="sm" disabled={addingCenter || !newCenterName.trim()} onClick={async () => {
                          const token = localStorage.getItem("yandle_id_token") || "";
                          setAddingCenter(true);
                          try {
                            const r = await fetch(`${apiBase}/centers`, {
                              method: "POST",
                              headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                              body: JSON.stringify({ handle: yandleHandle, name: newCenterName.trim(), location: newCenterLocation.trim(), machines: [{ name: newCenterMachineType, type: newCenterMachineType, count: newCenterMachineCount, pricePerHour: newCenterPricePerHour }] }),
                            });
                            if (r.ok) {
                              const d = await r.json();
                              setCentersList((prev) => [...prev, d.center]);
                              setNewCenterName(""); setNewCenterLocation("");
                              toast({ title: "Center added & synced" });
                            }
                          } finally { setAddingCenter(false); }
                        }}>
                          {addingCenter ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add center
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* ── Salon: branches & services ──────────────────── */}
                  {useCase?.id === "salon" && (
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <Label className="text-base">Branches</Label>
                        <p className="text-xs text-muted-foreground">Salon locations with seating capacity.</p>
                        <ul className="space-y-2">
                          {branchesList.map((b: any) => (
                            <li key={b.branchId} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                              <span><strong>{b.name || b.branchId}</strong> · Capacity {b.capacity ?? 1}{b.location ? ` · ${b.location}` : ""}</span>
                              <Button variant="ghost" size="sm" className="text-destructive" disabled={deletingBranchId === b.branchId} onClick={async () => {
                                const token = localStorage.getItem("yandle_id_token") || "";
                                setDeletingBranchId(b.branchId);
                                try {
                                  const r = await fetch(`${apiBase}/branches`, {
                                    method: "DELETE",
                                    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                    body: JSON.stringify({ handle: yandleHandle, branchId: b.branchId }),
                                  });
                                  if (r.ok) setBranchesList((prev) => prev.filter((x: any) => x.branchId !== b.branchId));
                                } finally { setDeletingBranchId(null); }
                              }}>
                                {deletingBranchId === b.branchId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-2">
                          <Input placeholder="Branch name" value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} className="w-40" />
                          <Input type="number" min={1} placeholder="Capacity" value={newBranchCapacity} onChange={(e) => setNewBranchCapacity(Number(e.target.value) || 1)} className="w-24" />
                          <Button size="sm" disabled={addingBranch || !newBranchName.trim()} onClick={async () => {
                            const token = localStorage.getItem("yandle_id_token") || "";
                            setAddingBranch(true);
                            try {
                              const r = await fetch(`${apiBase}/branches`, {
                                method: "POST",
                                headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                body: JSON.stringify({ handle: yandleHandle, name: newBranchName.trim(), capacity: newBranchCapacity }),
                              });
                              if (r.ok) {
                                const d = await r.json();
                                setBranchesList((prev) => [...prev, d.branch]);
                                setNewBranchName(""); setNewBranchCapacity(1);
                                toast({ title: "Branch added & synced" });
                              }
                            } finally { setAddingBranch(false); }
                          }}>
                            {addingBranch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add branch
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-base">Services</Label>
                        <p className="text-xs text-muted-foreground">Services with duration and price.</p>
                        <ul className="space-y-2">
                          {servicesList.map((s: any) => (
                            <li key={s.serviceId} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                              <span><strong>{s.name || s.serviceId}</strong> · {s.durationMinutes ?? 0} min{s.priceCents != null ? ` · ₹${(s.priceCents / 100).toFixed(0)}` : ""}</span>
                              <Button variant="ghost" size="sm" className="text-destructive" disabled={deletingServiceId === s.serviceId} onClick={async () => {
                                const token = localStorage.getItem("yandle_id_token") || "";
                                setDeletingServiceId(s.serviceId);
                                try {
                                  const r = await fetch(`${apiBase}/services`, {
                                    method: "DELETE",
                                    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                    body: JSON.stringify({ handle: yandleHandle, serviceId: s.serviceId }),
                                  });
                                  if (r.ok) setServicesList((prev) => prev.filter((x: any) => x.serviceId !== s.serviceId));
                                } finally { setDeletingServiceId(null); }
                              }}>
                                {deletingServiceId === s.serviceId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-2">
                          <Input placeholder="Service name" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} className="w-36" />
                          <Input type="number" min={1} placeholder="Minutes" value={newServiceDuration} onChange={(e) => setNewServiceDuration(Number(e.target.value) || 30)} className="w-24" />
                          <Input placeholder="Price (₹)" value={newServicePrice} onChange={(e) => setNewServicePrice(e.target.value)} className="w-24" />
                          <Button size="sm" disabled={addingService || !newServiceName.trim()} onClick={async () => {
                            const token = localStorage.getItem("yandle_id_token") || "";
                            setAddingService(true);
                            try {
                              const priceNum = newServicePrice.trim() ? Number(newServicePrice) : undefined;
                              const r = await fetch(`${apiBase}/services`, {
                                method: "POST",
                                headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                body: JSON.stringify({ handle: yandleHandle, name: newServiceName.trim(), durationMinutes: newServiceDuration, priceCents: priceNum != null && !isNaN(priceNum) ? Math.round(priceNum * 100) : undefined, useCaseId: "salon" }),
                              });
                              if (r.ok) {
                                const d = await r.json();
                                setServicesList((prev) => [...prev, d.service]);
                                setNewServiceName(""); setNewServiceDuration(30); setNewServicePrice("");
                                toast({ title: "Service added & synced" });
                              }
                            } finally { setAddingService(false); }
                          }}>
                            {addingService ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add service
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Clinic: doctors, locations & services ─────────── */}
                  {useCase?.id === "clinic" && (
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <Label className="text-base">Doctors</Label>
                        <ul className="space-y-2">
                          {(doctorsList || []).map((d: any) => (
                            <li key={d.doctorId} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                              <span><strong>{d.name || d.doctorId}</strong>{d.specialty ? ` · ${d.specialty}` : ""}</span>
                              <Button variant="ghost" size="sm" className="text-destructive" disabled={deletingDoctorId === d.doctorId} onClick={async () => {
                                const token = localStorage.getItem("yandle_id_token") || "";
                                setDeletingDoctorId(d.doctorId);
                                try {
                                  const r = await fetch(`${apiBase}/doctors`, {
                                    method: "DELETE",
                                    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                    body: JSON.stringify({ handle: yandleHandle, doctorId: d.doctorId }),
                                  });
                                  if (r.ok) setDoctorsList((prev) => prev.filter((x: any) => x.doctorId !== d.doctorId));
                                } finally { setDeletingDoctorId(null); }
                              }}>
                                {deletingDoctorId === d.doctorId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-2">
                          <Input placeholder="Doctor name" value={newDoctorName} onChange={(e) => setNewDoctorName(e.target.value)} className="w-36" />
                          <Input placeholder="Specialty" value={newDoctorSpecialty} onChange={(e) => setNewDoctorSpecialty(e.target.value)} className="w-32" />
                          <Button size="sm" disabled={addingDoctor || !newDoctorName.trim()} onClick={async () => {
                            const token = localStorage.getItem("yandle_id_token") || "";
                            setAddingDoctor(true);
                            try {
                              const r = await fetch(`${apiBase}/doctors`, {
                                method: "POST",
                                headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                body: JSON.stringify({ handle: yandleHandle, name: newDoctorName.trim(), specialty: newDoctorSpecialty.trim() || undefined }),
                              });
                              if (r.ok) {
                                const d = await r.json();
                                setDoctorsList((prev) => [...prev, d.doctor]);
                                setNewDoctorName(""); setNewDoctorSpecialty("");
                                toast({ title: "Doctor added & synced" });
                              }
                            } finally { setAddingDoctor(false); }
                          }}>
                            {addingDoctor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add doctor
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-base">Locations (clinics/offices)</Label>
                        <ul className="space-y-2">
                          {(locationsList || []).map((l: any) => (
                            <li key={l.locationId} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                              <span><strong>{l.name || l.locationId}</strong>{l.address ? ` · ${l.address}` : ""}</span>
                              <Button variant="ghost" size="sm" className="text-destructive" disabled={deletingLocationId === l.locationId} onClick={async () => {
                                const token = localStorage.getItem("yandle_id_token") || "";
                                setDeletingLocationId(l.locationId);
                                try {
                                  const r = await fetch(`${apiBase}/locations`, {
                                    method: "DELETE",
                                    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                    body: JSON.stringify({ handle: yandleHandle, locationId: l.locationId }),
                                  });
                                  if (r.ok) setLocationsList((prev) => prev.filter((x: any) => x.locationId !== l.locationId));
                                } finally { setDeletingLocationId(null); }
                              }}>
                                {deletingLocationId === l.locationId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-2">
                          <Input placeholder="Location name" value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)} className="w-36" />
                          <Input placeholder="Address" value={newLocationAddress} onChange={(e) => setNewLocationAddress(e.target.value)} className="w-40" />
                          <Button size="sm" disabled={addingLocation || !newLocationName.trim()} onClick={async () => {
                            const token = localStorage.getItem("yandle_id_token") || "";
                            setAddingLocation(true);
                            try {
                              const r = await fetch(`${apiBase}/locations`, {
                                method: "POST",
                                headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                body: JSON.stringify({ handle: yandleHandle, name: newLocationName.trim(), address: newLocationAddress.trim() || undefined }),
                              });
                              if (r.ok) {
                                const d = await r.json();
                                setLocationsList((prev) => [...prev, d.location]);
                                setNewLocationName(""); setNewLocationAddress("");
                                toast({ title: "Location added & synced" });
                              }
                            } finally { setAddingLocation(false); }
                          }}>
                            {addingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add location
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-base">Services</Label>
                        <ul className="space-y-2">
                          {servicesList.map((s: any) => (
                            <li key={s.serviceId} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                              <span><strong>{s.name || s.serviceId}</strong> · {s.durationMinutes ?? 0} min{s.priceCents != null ? ` · ₹${(s.priceCents / 100).toFixed(0)}` : ""}</span>
                              <Button variant="ghost" size="sm" className="text-destructive" disabled={deletingServiceId === s.serviceId} onClick={async () => {
                                const token = localStorage.getItem("yandle_id_token") || "";
                                setDeletingServiceId(s.serviceId);
                                try {
                                  const r = await fetch(`${apiBase}/services`, {
                                    method: "DELETE",
                                    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                    body: JSON.stringify({ handle: yandleHandle, serviceId: s.serviceId }),
                                  });
                                  if (r.ok) setServicesList((prev) => prev.filter((x: any) => x.serviceId !== s.serviceId));
                                } finally { setDeletingServiceId(null); }
                              }}>
                                {deletingServiceId === s.serviceId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-2">
                          <Input placeholder="Service name" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} className="w-36" />
                          <Input type="number" min={1} placeholder="Minutes" value={newServiceDuration} onChange={(e) => setNewServiceDuration(Number(e.target.value) || 30)} className="w-24" />
                          <Input placeholder="Price (₹)" value={newServicePrice} onChange={(e) => setNewServicePrice(e.target.value)} className="w-24" />
                          <Button size="sm" disabled={addingService || !newServiceName.trim()} onClick={async () => {
                            const token = localStorage.getItem("yandle_id_token") || "";
                            setAddingService(true);
                            try {
                              const priceNum = newServicePrice.trim() ? Number(newServicePrice) : undefined;
                              const r = await fetch(`${apiBase}/services`, {
                                method: "POST",
                                headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                body: JSON.stringify({ handle: yandleHandle, name: newServiceName.trim(), durationMinutes: newServiceDuration, priceCents: priceNum != null && !isNaN(priceNum) ? Math.round(priceNum * 100) : undefined, useCaseId: "clinic" }),
                              });
                              if (r.ok) {
                                const d = await r.json();
                                setServicesList((prev) => [...prev, d.service]);
                                setNewServiceName(""); setNewServiceDuration(30); setNewServicePrice("");
                                toast({ title: "Service added & synced" });
                              }
                            } finally { setAddingService(false); }
                          }}>
                            {addingService ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add service
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── What the AI currently knows ──────────────────── */}
                  <div className="space-y-2 pt-4 border-t border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-base">What the AI currently knows</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">Live snapshot of the knowledge document that powers your voice and chat agent.</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={kbPreviewLoading}
                        onClick={async () => {
                          if (!apiBase || !yandleHandle) return;
                          setKbPreviewLoading(true);
                          try {
                            const token = localStorage.getItem("yandle_id_token") || "";
                            const r = await fetch(`${apiBase}/knowledge/preview?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } });
                            const d = r.ok ? await r.json() : null;
                            if (d?.content) setKbPreviewText(d.content);
                          } finally { setKbPreviewLoading(false); }
                        }}
                      >
                        {kbPreviewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Refresh
                      </Button>
                    </div>
                    {kbPreviewLoading && !kbPreviewText && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
                      </div>
                    )}
                    {kbPreviewText ? (
                      <pre className="text-xs font-mono bg-muted/40 border border-border rounded-lg p-4 overflow-auto max-h-72 whitespace-pre-wrap leading-relaxed">
                        {kbPreviewText}
                      </pre>
                    ) : (!kbPreviewLoading && (
                      <p className="text-xs text-muted-foreground italic">No knowledge data yet — fill in your business details and sync.</p>
                    ))}
                  </div>

                  {/* ── Custom knowledge text ────────────────────────── */}
                  <div className="space-y-2 pt-4 border-t border-border">
                    <Label className="text-base">Custom knowledge (policies, FAQ, other)</Label>
                    <p className="text-xs text-muted-foreground">Free-form text appended to your knowledge base — policies, FAQs, opening hours, pricing notes. Hit &quot;Save &amp; sync to voice&quot; above to push changes.</p>
                    <Textarea
                      placeholder="Policies, opening hours, FAQs..."
                      value={knowledgeBaseCustomText}
                      onChange={(e) => setKnowledgeBaseCustomText(e.target.value)}
                      className="min-h-[120px] bg-card/50 font-mono text-sm"
                    />
                  </div>

                  {/* ── Upload image to extract text ─────────────────── */}
                  <div className="space-y-2 pt-4 border-t border-border">
                    <Label className="text-base">Upload image to extract text</Label>
                    <p className="text-xs text-muted-foreground">Upload an image (e.g. menu, price list). Extracted text will be appended to your custom knowledge and synced.</p>
                    <input
                      type="file"
                      accept="image/*"
                      className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !apiBase || !yandleHandle) return;
                        setIngestImageLoading(true);
                        setExtractedTextFromImage("");
                        try {
                          const reader = new FileReader();
                          reader.onload = async () => {
                            const base64 = (reader.result as string)?.split(",")?.[1];
                            if (!base64) { setIngestImageLoading(false); return; }
                            const token = localStorage.getItem("yandle_id_token") || "";
                            const r = await fetch(`${apiBase}/knowledge/ingest-image`, {
                              method: "POST",
                              headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                              body: JSON.stringify({ handle: yandleHandle, imageBase64: base64 }),
                            });
                            const data = r.ok ? await r.json() : null;
                            if (data?.ok && data.extractedText) {
                              setExtractedTextFromImage(data.extractedText);
                              setKnowledgeBaseCustomText((prev) => prev + (prev ? "\n\n--- Extracted from image ---\n\n" : "") + data.extractedText);
                              toast({ title: "Done", description: "Text extracted and added to knowledge base." });
                            } else if (data?.ok) {
                              toast({ title: "No text", description: "No text was detected in the image." });
                            } else {
                              toast({ title: "Error", description: data?.error || "Failed to process image.", variant: "destructive" });
                            }
                            setIngestImageLoading(false);
                          };
                          reader.readAsDataURL(file);
                        } catch {
                          setIngestImageLoading(false);
                          toast({ title: "Error", description: "Failed to process image.", variant: "destructive" });
                        }
                        e.target.value = "";
                      }}
                    />
                    {ingestImageLoading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Extracting text...</p>}
                    {extractedTextFromImage && <pre className="text-xs bg-muted/50 p-3 rounded overflow-auto max-h-40">{extractedTextFromImage}</pre>}
                  </div>

                  {/* ── Upload files to knowledge base ──────────────── */}
                  <div className="space-y-3 pt-4 border-t border-border">
                    <Label className="text-base">Upload files to knowledge base</Label>
                    <p className="text-xs text-muted-foreground">Upload images (PNG, JPG, WebP, GIF), video (MP4, MOV, WebM), or audio (MP3, WAV, OGG). Files are indexed for retrieval. Max 5MB per file.</p>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.gif,.mp4,.mov,.webm,.mkv,.mp3,.wav,.ogg,image/*,video/*,audio/*"
                      className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground"
                      disabled={uploadFileLoading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !apiBase || !yandleHandle) return;
                        if (file.size > 5 * 1024 * 1024) {
                          toast({ title: "File too large", description: "Keep files under 5MB.", variant: "destructive" });
                          e.target.value = ""; return;
                        }
                        setUploadFileLoading(true);
                        try {
                          const base64 = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve((reader.result as string)?.split(",")?.[1] ?? "");
                            reader.onerror = reject;
                            reader.readAsDataURL(file);
                          });
                          if (!base64) throw new Error("Could not read file");
                          const token = localStorage.getItem("yandle_id_token") || "";
                          const r = await fetch(`${apiBase}/knowledge/upload-file`, {
                            method: "POST",
                            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                            body: JSON.stringify({ handle: yandleHandle, fileBase64: base64, fileName: file.name }),
                          });
                          const data = r.ok ? await r.json() : null;
                          if (data?.ok) {
                            toast({ title: "Uploaded", description: data.message ?? "File uploaded; sync started." });
                            // Refresh file list
                            fetch(`${apiBase}/knowledge/files?handle=${encodeURIComponent(yandleHandle)}`, { headers: { authorization: `Bearer ${token}` } })
                              .then((fr) => (fr.ok ? fr.json() : null))
                              .then((fd) => setKbFiles(Array.isArray(fd?.files) ? fd.files : []))
                              .catch(() => {});
                          } else {
                            toast({ title: "Error", description: data?.error ?? "Upload failed.", variant: "destructive" });
                          }
                        } catch {
                          toast({ title: "Error", description: "Upload failed.", variant: "destructive" });
                        } finally {
                          setUploadFileLoading(false);
                          e.target.value = "";
                        }
                      }}
                    />
                    {uploadFileLoading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Uploading and syncing...</p>}

                    {/* Uploaded files list */}
                    {kbFilesLoading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading files…
                      </div>
                    )}
                    {!kbFilesLoading && kbFiles.length > 0 && (
                      <ul className="space-y-2 mt-2">
                        {kbFiles.map((f: any) => (
                          <li key={f.key} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                            <span className="truncate min-w-0 flex-1">
                              <span className="font-medium">{f.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{f.size != null ? `${(f.size / 1024).toFixed(1)} KB` : ""}</span>
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive shrink-0"
                              disabled={deletingFileKey === f.key}
                              onClick={async () => {
                                const token = localStorage.getItem("yandle_id_token") || "";
                                setDeletingFileKey(f.key);
                                try {
                                  const r = await fetch(`${apiBase}/knowledge/files?handle=${encodeURIComponent(yandleHandle)}&key=${encodeURIComponent(f.key)}`, {
                                    method: "DELETE",
                                    headers: { authorization: `Bearer ${token}` },
                                  });
                                  if (r.ok) {
                                    setKbFiles((prev) => prev.filter((x: any) => x.key !== f.key));
                                    toast({ title: "File deleted & sync triggered" });
                                  }
                                } finally { setDeletingFileKey(null); }
                              }}
                            >
                              {deletingFileKey === f.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!kbFilesLoading && kbFiles.length === 0 && !uploadFileLoading && (
                      <p className="text-xs text-muted-foreground italic">No files uploaded yet.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeNav === "embed" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 max-w-2xl"
            >
              <Card className="bg-card/50 border-border">
                <CardHeader>
                  <CardTitle className="font-display text-xl">Embed on your site</CardTitle>
                  <p className="text-sm text-muted-foreground">Add a chat & voice bubble to any website with a single script tag. Paste it before the closing &lt;/body&gt; tag.</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Theme configurator */}
                  <div className="space-y-4">
                    <Label className="text-base">Theme</Label>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-sm">Button color</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={embedColor}
                            onChange={(e) => setEmbedColor(e.target.value)}
                            className="h-9 w-14 rounded border border-border cursor-pointer bg-transparent p-0.5"
                          />
                          <Input value={embedColor} onChange={(e) => setEmbedColor(e.target.value)} className="flex-1 font-mono text-sm" maxLength={7} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-sm">Background color</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={embedBg}
                            onChange={(e) => setEmbedBg(e.target.value)}
                            className="h-9 w-14 rounded border border-border cursor-pointer bg-transparent p-0.5"
                          />
                          <Input value={embedBg} onChange={(e) => setEmbedBg(e.target.value)} className="flex-1 font-mono text-sm" maxLength={7} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-sm">Position</Label>
                        <Select value={embedPosition} onValueChange={setEmbedPosition}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bottom-right">Bottom right</SelectItem>
                            <SelectItem value="bottom-left">Bottom left</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-sm">Button label</Label>
                        <Input value={embedLabel} onChange={(e) => setEmbedLabel(e.target.value)} placeholder="Chat with us" />
                      </div>
                    </div>
                  </div>

                  {/* Generated snippet */}
                  <div className="space-y-2">
                    <Label className="text-base">Your snippet</Label>
                    <pre className="rounded-lg border border-border bg-muted/50 p-3 text-xs overflow-x-auto whitespace-pre-wrap font-mono break-all">
{`<script src="${typeof window !== "undefined" ? window.location.origin : "https://your-app.com"}/voxa-embed.js" data-handle="${yandleHandle || "YOUR_HANDLE"}" data-origin="${typeof window !== "undefined" ? window.location.origin : "https://your-app.com"}" data-color="${embedColor}" data-bg="${embedBg}" data-position="${embedPosition}" data-label="${embedLabel}"></script>`}
                    </pre>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        const snippet = `<script src="${window.location.origin}/voxa-embed.js" data-handle="${yandleHandle || ""}" data-origin="${window.location.origin}" data-color="${embedColor}" data-bg="${embedBg}" data-position="${embedPosition}" data-label="${embedLabel}"></script>`;
                        navigator.clipboard.writeText(snippet)
                          .then(() => toast({ title: "Copied!", description: "Snippet copied to clipboard." }))
                          .catch(() => toast({ title: "Copy failed", variant: "destructive" }));
                      }}
                    >
                      <Copy className="h-4 w-4" /> Copy snippet
                    </Button>
                  </div>

                  {/* Test button */}
                  <div className="pt-2 border-t border-border space-y-2">
                    <Label className="text-base">Test it here</Label>
                    <p className="text-xs text-muted-foreground">Preview the widget on this page.</p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        // Remove existing test widget if present
                        const existing = document.getElementById("voxa-embed-test-script");
                        if (existing) {
                          existing.remove();
                          // Also remove the bubble the script injected
                          document.querySelectorAll("[data-voxa-embed]").forEach(el => el.remove());
                          toast({ title: "Test closed" });
                          return;
                        }
                        if (!yandleHandle?.trim()) {
                          toast({ title: "No handle", description: "Save your profile first.", variant: "destructive" });
                          return;
                        }
                        // Remove any stale script/widget first
                        document.getElementById("voxa-embed-test-script")?.remove();
                        // Inject a fresh copy of voxa-embed.js as a script tag with the current settings
                        const script = document.createElement("script");
                        script.id = "voxa-embed-test-script";
                        script.setAttribute("data-handle", yandleHandle);
                        script.setAttribute("data-color", embedColor);
                        script.setAttribute("data-bg", embedBg);
                        script.setAttribute("data-position", embedPosition);
                        script.setAttribute("data-label", embedLabel);
                        script.setAttribute("data-origin", window.location.origin);
                        script.src = `${window.location.origin}/voxa-embed.js?t=${Date.now()}`;
                        // Mark injected DOM nodes so we can clean them up
                        script.onload = () => {
                          // Tag the last appended child (the bubble wrapper) for cleanup
                          const last = document.body.lastElementChild;
                          if (last && last.tagName !== "SCRIPT") last.setAttribute("data-voxa-embed", "test");
                        };
                        document.body.appendChild(script);
                        toast({ title: "Test started", description: "Look for the bubble in the corner." });
                      }}
                    >
                      Test on this page
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeNav === "website" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 max-w-2xl"
            >
              <Card className="bg-card/50 border-border">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <CardTitle className="font-display text-xl">Business website</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Customize your public website at{" "}
                        <a
                          href={`https://callcentral.io/${yandleHandle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-medium"
                        >
                          callcentral.io/{yandleHandle}
                        </a>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={websiteSaving}
                      onClick={async () => {
                        if (!apiBase || !yandleHandle) return;
                        setWebsiteSaving(true);
                        try {
                          const token = localStorage.getItem("yandle_id_token") || "";
                          const r = await fetch(`${apiBase}/website/config`, {
                            method: "POST",
                            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                            body: JSON.stringify({
                              handle: yandleHandle,
                              heroTagline: websiteHeroTagline,
                              aboutText: websiteAboutText,
                              galleryImages: websiteGalleryImages,
                              colorTheme: websiteColorTheme,
                              contactEmail: websiteContactEmail,
                              socialLinks: websiteSocialLinks,
                            }),
                          });
                          if (r.ok) {
                            toast({ title: "Website saved", description: "Changes are live on your public page." });
                          } else {
                            toast({ title: "Error", description: "Failed to save website config.", variant: "destructive" });
                          }
                        } finally { setWebsiteSaving(false); }
                      }}
                    >
                      {websiteSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Save & publish
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Hero tagline */}
                  <div className="space-y-2">
                    <Label>Hero tagline</Label>
                    <Input
                      value={websiteHeroTagline}
                      onChange={(e) => setWebsiteHeroTagline(e.target.value)}
                      placeholder="Welcome to our business — book your appointment today!"
                      className="bg-card/50"
                    />
                    <p className="text-xs text-muted-foreground">Displayed prominently on your website hero section.</p>
                  </div>

                  {/* About text */}
                  <div className="space-y-2">
                    <Label>About your business</Label>
                    <Textarea
                      value={websiteAboutText}
                      onChange={(e) => setWebsiteAboutText(e.target.value)}
                      placeholder="Tell visitors about your business, what you offer, and why they should choose you..."
                      className="bg-card/50 min-h-[120px]"
                    />
                  </div>

                  {/* Color theme */}
                  <div className="space-y-2">
                    <Label>Color theme</Label>
                    <div className="flex flex-wrap gap-2">
                      {["indigo", "emerald", "rose", "amber", "cyan", "violet"].map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setWebsiteColorTheme(color)}
                          className={`w-10 h-10 rounded-lg border-2 transition-all ${
                            websiteColorTheme === color ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"
                          }`}
                          style={{
                            background: {
                              indigo: "#6366f1", emerald: "#10b981", rose: "#f43f5e",
                              amber: "#f59e0b", cyan: "#06b6d4", violet: "#8b5cf6",
                            }[color] || "#6366f1",
                          }}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Contact email */}
                  <div className="space-y-2">
                    <Label>Contact email (shown on website)</Label>
                    <Input
                      type="email"
                      value={websiteContactEmail}
                      onChange={(e) => setWebsiteContactEmail(e.target.value)}
                      placeholder="hello@yourbusiness.com"
                      className="bg-card/50"
                    />
                  </div>

                  {/* Gallery images */}
                  <div className="space-y-3 pt-4 border-t border-border">
                    <Label className="text-base">Gallery photos</Label>
                    <p className="text-xs text-muted-foreground">Upload photos of your business. They appear in the gallery section of your website.</p>
                    <div className="grid grid-cols-3 gap-3">
                      {websiteGalleryImages.map((url, idx) => (
                        <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-muted/30">
                          <img src={url} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={async () => {
                              const newGallery = websiteGalleryImages.filter((_, i) => i !== idx);
                              setWebsiteGalleryImages(newGallery);
                              const token = localStorage.getItem("yandle_id_token") || "";
                              try {
                                const r = await fetch(`${apiBase}/website/config`, {
                                  method: "POST",
                                  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                  body: JSON.stringify({
                                    handle: yandleHandle,
                                    heroTagline: websiteHeroTagline,
                                    aboutText: websiteAboutText,
                                    galleryImages: newGallery,
                                    colorTheme: websiteColorTheme,
                                    contactEmail: websiteContactEmail,
                                    socialLinks: websiteSocialLinks,
                                  }),
                                });
                                if (r.ok) toast({ title: "Photo removed", description: "Saved." });
                              } catch (_) {}
                            }}
                            className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {/* Upload button */}
                      <label className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center cursor-pointer transition-colors bg-muted/10">
                        {websiteImageUploading ? (
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        ) : (
                          <>
                            <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                            <span className="text-xs text-muted-foreground">Upload</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={websiteImageUploading}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !apiBase || !yandleHandle) return;
                            setWebsiteImageUploading(true);
                            try {
                              const token = localStorage.getItem("yandle_id_token") || "";
                              // Get presigned upload URL
                              const presignResp = await fetch(`${apiBase}/website/upload-image`, {
                                method: "POST",
                                headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                body: JSON.stringify({ handle: yandleHandle, fileName: file.name, contentType: file.type }),
                              });
                              if (!presignResp.ok) throw new Error("Failed to get upload URL");
                              const { uploadUrl, publicUrl } = await presignResp.json();

                              // Upload file directly to S3
                              const uploadResp = await fetch(uploadUrl, {
                                method: "PUT",
                                headers: { "Content-Type": file.type },
                                body: file,
                              });
                              if (!uploadResp.ok) throw new Error("Upload failed");

                              const newGallery = [...websiteGalleryImages, publicUrl];
                              setWebsiteGalleryImages(newGallery);
                              // Persist so image appears on mobile and after refresh
                              const saveRes = await fetch(`${apiBase}/website/config`, {
                                method: "POST",
                                headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                                body: JSON.stringify({
                                  handle: yandleHandle,
                                  heroTagline: websiteHeroTagline,
                                  aboutText: websiteAboutText,
                                  galleryImages: newGallery,
                                  colorTheme: websiteColorTheme,
                                  contactEmail: websiteContactEmail,
                                  socialLinks: websiteSocialLinks,
                                }),
                              });
                              if (saveRes.ok) toast({ title: "Photo uploaded", description: "Saved to website." });
                              else toast({ title: "Photo uploaded", description: "Save config failed — tap Save & publish to sync.", variant: "destructive" });
                            } catch (err) {
                              toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
                            } finally {
                              setWebsiteImageUploading(false);
                              e.target.value = "";
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Preview link */}
                  <div className="pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => window.open(`/${yandleHandle}`, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Preview website
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* AI Website Assistant */}
              <Card className="bg-card/50 border-border">
                <CardHeader>
                  <CardTitle className="text-base font-display font-semibold flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    AI Website Assistant
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Ask the AI to help you write content, suggest changes, or improve your website.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Chat messages */}
                  {websiteChatMessages.length > 0 && (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {websiteChatMessages.map((msg, i) => (
                        <div key={i} className={`text-sm p-3 rounded-lg ${msg.role === "user" ? "bg-primary/10 text-foreground ml-8" : "bg-secondary/30 text-foreground mr-8"}`}>
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                          {msg.changes && Object.keys(msg.changes).length > 0 && (
                            <div className="mt-2 pt-2 border-t border-border">
                              <p className="text-xs text-muted-foreground mb-1">Suggested changes:</p>
                              {Object.entries(msg.changes).map(([key, val]) => (
                                <div key={key} className="flex items-center justify-between gap-2 text-xs py-1">
                                  <span className="font-mono text-muted-foreground">{key}:</span>
                                  <span className="truncate flex-1">{String(val).slice(0, 60)}</span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-xs px-2"
                                    onClick={() => {
                                      if (key === "heroTagline") setWebsiteHeroTagline(String(val));
                                      else if (key === "aboutText") setWebsiteAboutText(String(val));
                                      else if (key === "colorTheme") setWebsiteColorTheme(String(val));
                                      else if (key === "contactEmail") setWebsiteContactEmail(String(val));
                                      toast({ title: "Applied", description: `Updated ${key}. Save to publish.` });
                                    }}
                                  >
                                    Apply
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={websiteChatInput}
                      onChange={(e) => setWebsiteChatInput(e.target.value)}
                      placeholder="e.g. Write a professional tagline for my salon..."
                      className="bg-card/50"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && websiteChatInput.trim() && !websiteChatLoading) {
                          e.preventDefault();
                          const userMsg = websiteChatInput.trim();
                          setWebsiteChatInput("");
                          setWebsiteChatMessages((prev) => [...prev, { role: "user", text: userMsg }]);
                          setWebsiteChatLoading(true);
                          const token = localStorage.getItem("yandle_id_token") || "";
                          fetch(`${apiBase}/website/chat`, {
                            method: "POST",
                            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                            body: JSON.stringify({
                              handle: yandleHandle,
                              message: userMsg,
                              currentConfig: { heroTagline: websiteHeroTagline, aboutText: websiteAboutText, colorTheme: websiteColorTheme, contactEmail: websiteContactEmail },
                            }),
                          })
                            .then((r) => r.json())
                            .then((data) => {
                              setWebsiteChatMessages((prev) => [...prev, { role: "ai", text: data.reply || "Sorry, I couldn't generate a response.", changes: data.suggestedChanges }]);
                            })
                            .catch(() => {
                              setWebsiteChatMessages((prev) => [...prev, { role: "ai", text: "Sorry, something went wrong." }]);
                            })
                            .finally(() => setWebsiteChatLoading(false));
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      disabled={websiteChatLoading || !websiteChatInput.trim()}
                      onClick={() => {
                        const userMsg = websiteChatInput.trim();
                        if (!userMsg) return;
                        setWebsiteChatInput("");
                        setWebsiteChatMessages((prev) => [...prev, { role: "user", text: userMsg }]);
                        setWebsiteChatLoading(true);
                        const token = localStorage.getItem("yandle_id_token") || "";
                        fetch(`${apiBase}/website/chat`, {
                          method: "POST",
                          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
                          body: JSON.stringify({
                            handle: yandleHandle,
                            message: userMsg,
                            currentConfig: { heroTagline: websiteHeroTagline, aboutText: websiteAboutText, colorTheme: websiteColorTheme, contactEmail: websiteContactEmail },
                          }),
                        })
                          .then((r) => r.json())
                          .then((data) => {
                            setWebsiteChatMessages((prev) => [...prev, { role: "ai", text: data.reply || "Sorry, I couldn't generate a response.", changes: data.suggestedChanges }]);
                          })
                          .catch(() => {
                            setWebsiteChatMessages((prev) => [...prev, { role: "ai", text: "Sorry, something went wrong." }]);
                          })
                          .finally(() => setWebsiteChatLoading(false));
                      }}
                    >
                      {websiteChatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeNav === "members" && isOwner && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 max-w-2xl"
            >
              <Card className="bg-card/50 border-border">
                <CardHeader>
                  <CardTitle className="font-display text-xl flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-primary" />
                    Managers
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Add managers by email. They can manage bookings, conversations, and knowledge — but cannot add or remove other managers.
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Add manager */}
                  <div className="space-y-2">
                    <Label>Invite manager by email</Label>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        value={addMemberEmail}
                        onChange={(e) => setAddMemberEmail(e.target.value)}
                        placeholder="manager@example.com"
                        className="flex-1"
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                      />
                      <Button
                        disabled={addMemberLoading || !addMemberEmail.trim()}
                        onClick={async () => {
                          if (!apiBase || !yandleHandle || !addMemberEmail.trim()) return;
                          setAddMemberLoading(true);
                          try {
                            const r = await fetch(`${apiBase}/members`, {
                              method: "POST",
                              headers: { "content-type": "application/json", authorization: `Bearer ${localStorage.getItem("yandle_id_token") || ""}` },
                              body: JSON.stringify({ handle: yandleHandle, email: addMemberEmail.trim().toLowerCase() }),
                            });
                            const data = r.ok ? await r.json() : null;
                            if (r.ok && data?.member) {
                              setMembersList((prev) => [...prev.filter((m) => m.email !== data.member.email), data.member]);
                              setAddMemberEmail("");
                              toast({ title: "Manager added", description: `${data.member.email} can now manage ${yandleHandle}.` });
                            } else {
                              toast({ title: "Could not add manager", description: data?.error || "Unknown error", variant: "destructive" });
                            }
                          } catch {
                            toast({ title: "Error adding manager", variant: "destructive" });
                          }
                          setAddMemberLoading(false);
                        }}
                      >
                        {addMemberLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Add
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      If they already have a Yandle account they'll get instant access. Otherwise they'll need to sign up first.
                    </p>
                  </div>

                  {/* Manager list */}
                  <div className="space-y-2">
                    <Label>Current managers</Label>
                    {membersList.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No managers yet. Add one above.</p>
                    ) : (
                      <ul className="space-y-2">
                        {membersList.map((m: any) => (
                          <li key={m.email} className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-2.5">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{m.email}</p>
                              {m.addedAt && <p className="text-xs text-muted-foreground">Added {formatTimeAgo(m.addedAt)}</p>}
                            </div>
                            <button
                              type="button"
                              disabled={removingMember === m.email}
                              onClick={async () => {
                                if (!apiBase || !yandleHandle) return;
                                setRemovingMember(m.email);
                                try {
                                  const r = await fetch(`${apiBase}/members?handle=${encodeURIComponent(yandleHandle)}&email=${encodeURIComponent(m.email)}`, {
                                    method: "DELETE",
                                    headers: { authorization: `Bearer ${localStorage.getItem("yandle_id_token") || ""}` },
                                  });
                                  if (r.ok) {
                                    setMembersList((prev) => prev.filter((x) => x.email !== m.email));
                                    toast({ title: "Manager removed" });
                                  } else {
                                    toast({ title: "Could not remove manager", variant: "destructive" });
                                  }
                                } catch {
                                  toast({ title: "Error", variant: "destructive" });
                                }
                                setRemovingMember(null);
                              }}
                              className="text-muted-foreground hover:text-destructive transition-colors ml-3 shrink-0"
                            >
                              {removingMember === m.email ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeNav === "phone" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              {handlePhoneNumber ? (
                <>
                  <Card className="bg-card/50 border-border">
                    <CardHeader>
                      <CardTitle className="text-lg">Your Phone Number</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-xl bg-primary/15 flex items-center justify-center">
                          <PhoneCall className="h-7 w-7 text-primary" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-white tracking-wide">{handlePhoneNumber}</p>
                          <p className="text-sm text-muted-foreground">Active · ₹500/month</p>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-border">
                        <p className="text-sm text-muted-foreground mb-3">
                          This number is connected to your AI voice agent. Callers to this number will be handled by your AI assistant.
                        </p>
                        <Button variant="destructive" size="sm" disabled={releasingPhone} onClick={handleReleasePhone}>
                          {releasingPhone ? "Releasing..." : "Cancel & Release Number"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <>
                  <div className="mb-2">
                    <h3 className="text-lg font-semibold text-white">Get a Phone Number</h3>
                    <p className="text-sm text-muted-foreground">Purchase a dedicated phone number for your AI voice agent. Includes 1000 free credits.</p>
                  </div>
                  {phoneLoading ? (
                    <div className="flex justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                  ) : availableNumbers.length === 0 ? (
                    <Card className="bg-card/50 border-border">
                      <CardContent className="pt-6 text-center">
                        <p className="text-muted-foreground">No phone numbers available at the moment. Please check back later.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {availableNumbers.map((n: any) => (
                        <Card key={n.phoneNumber} className="bg-card/50 border-border hover:border-primary/40 transition-colors">
                          <CardContent className="pt-5 flex items-center justify-between">
                            <div>
                              <p className="text-lg font-mono font-semibold text-white">{n.phoneNumber}</p>
                              <p className="text-xs text-muted-foreground">₹{n.monthlyPrice || 500}/month</p>
                            </div>
                            <Button size="sm" disabled={assigningPhone !== null} onClick={() => handleAssignPhone(n.phoneNumber)}>
                              {assigningPhone === n.phoneNumber ? "Assigning..." : "Purchase"}
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {activeNav === "credits" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              {/* Large balance card */}
              <div className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-2">
                  <Coins className="h-6 w-6 text-primary" />
                  <span className="text-sm text-muted-foreground">Available Credits</span>
                </div>
                <div className="text-5xl font-bold text-white mb-1">{(creditsBalance ?? 0).toLocaleString()}</div>
                <p className="text-sm text-muted-foreground">credits remaining</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-card/50 border-border">
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground mb-1">Total Used</p>
                    <p className="text-2xl font-bold text-white">{(creditsTotalUsed ?? 0).toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50 border-border">
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground mb-1">Plan</p>
                    <p className="text-2xl font-bold text-white capitalize">{(formData.planType as string) || "None"}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50 border-border">
                  <CardContent className="pt-6">
                    <p className="text-xs text-muted-foreground mb-1">Usage</p>
                    <div className="flex items-end gap-2">
                      <p className="text-2xl font-bold text-white">
                        {creditsBalance != null && creditsTotalUsed != null
                          ? Math.round((creditsTotalUsed / Math.max(1, creditsBalance + creditsTotalUsed)) * 100)
                          : 0}%
                      </p>
                    </div>
                    <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{
                        width: `${creditsBalance != null && creditsTotalUsed != null ? Math.round((creditsTotalUsed / Math.max(1, creditsBalance + creditsTotalUsed)) * 100) : 0}%`
                      }} />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-card/50 border-border">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">
                    Credits are consumed per AI voice call and chat message. Each voice call costs approximately 5-10 credits depending on duration. Chat messages cost 1 credit each.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeNav === "settings" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 max-w-2xl"
            >
              <Card className="bg-card/50 border-border">
                <CardHeader>
                  <CardTitle className="font-display text-xl">Profile & AI setup</CardTitle>
                  <p className="text-sm text-muted-foreground">Edit the same details you set during onboarding. Changes are saved locally and synced to your public YANDLE link.</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* YANDLE handle */}
                  <div className="space-y-2">
                    <Label>YANDLE handle</Label>
                    <div className="flex rounded-lg border border-border bg-card/50 overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                      <span className="px-3 text-sm text-muted-foreground bg-secondary/50 h-10 flex items-center">callcentral.io/</span>
                      <Input
                        value={yandleHandle}
                        onChange={(e) => setYandleHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        placeholder="yourname"
                        className="border-0 bg-transparent focus-visible:ring-0"
                      />
                    </div>
                  </div>

                  {/* Display name */}
                  <div className="space-y-2">
                    <Label>Display name (optional)</Label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={yandleHandle ? yandleHandle.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Your Name"}
                      className="bg-card/50"
                    />
                  </div>

                  {/* Contact capture (per business) */}
                  <div className="space-y-4 pt-2 border-t border-border">
                    <Label className="text-base">Contact capture</Label>
                    <p className="text-xs text-muted-foreground">At least one of phone or email is always required when booking. Toggle whether to ask for each.</p>
                    <div className="flex items-center justify-between rounded-lg border border-border p-3">
                      <Label htmlFor="capture-email" className="cursor-pointer flex-1">Capture email</Label>
                      <Switch
                        id="capture-email"
                        checked={formData.captureEmail !== false}
                        onCheckedChange={(checked) => setFormData((p) => ({ ...p, captureEmail: checked }))}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-border p-3">
                      <Label htmlFor="capture-phone" className="cursor-pointer flex-1">Capture phone</Label>
                      <Switch
                        id="capture-phone"
                        checked={formData.capturePhone !== false}
                        onCheckedChange={(checked) => setFormData((p) => ({ ...p, capturePhone: checked }))}
                      />
                    </div>
                  </div>

                  {/* Website toggle */}
                  <div className="space-y-4 pt-2 border-t border-border">
                    <Label className="text-base">Website</Label>
                    <div className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="flex-1">
                        <Label htmlFor="website-enabled" className="cursor-pointer">Enable website</Label>
                        <p className="text-xs text-muted-foreground">When disabled, callcentral.io/{yandleHandle} will redirect to the shareable link.</p>
                      </div>
                      <Switch
                        id="website-enabled"
                        checked={formData.websiteEnabled !== false}
                        onCheckedChange={(checked) => setFormData((p) => ({ ...p, websiteEnabled: checked }))}
                      />
                    </div>
                  </div>

                  {/* Slot & buffer — only for use cases with bookings (no slots for general / support tickets) */}
                  {useCase?.id !== "general" && useCase?.id !== "customer_support" && (
                    <div className="space-y-4 pt-2 border-t border-border">
                      <Label className="text-base">Slot & buffer</Label>
                      <p className="text-xs text-muted-foreground">Slot granularity (e.g. 15 min) and buffer between appointments. Used for availability.</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-sm">Slot granularity (min)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={120}
                            value={slotConfig.slotGranularityMinutes ?? 15}
                            onChange={(e) => setSlotConfig((p) => ({ ...p, slotGranularityMinutes: Math.max(1, Math.min(120, Number(e.target.value) || 15)) }))}
                            className="bg-card/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Buffer between (min)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={60}
                            value={slotConfig.bufferBetweenMinutes ?? 0}
                            onChange={(e) => setSlotConfig((p) => ({ ...p, bufferBetweenMinutes: Math.max(0, Math.min(60, Number(e.target.value) || 0)) }))}
                            className="bg-card/50"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-sm">Business open (UTC hour)</Label>
                          <Select
                            value={String(slotConfig.openHour ?? 9)}
                            onValueChange={(v) => setSlotConfig((p) => ({ ...p, openHour: Number(v) }))}
                          >
                            <SelectTrigger className="bg-card/50">
                              <SelectValue placeholder="Open" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 24 }, (_, i) => (
                                <SelectItem key={i} value={String(i)}>
                                  {i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Business close (UTC hour)</Label>
                          <Select
                            value={String(slotConfig.closeHour ?? 18)}
                            onValueChange={(v) => setSlotConfig((p) => ({ ...p, closeHour: Number(v) }))}
                          >
                            <SelectTrigger className="bg-card/50">
                              <SelectValue placeholder="Close" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 25 }, (_, i) => (
                                <SelectItem key={i} value={String(i)}>
                                  {i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Salon: branches & services */}
                  {useCase?.id === "salon" && (
                    <Card className="bg-card/50 border-border">
                      <CardHeader>
                        <CardTitle className="text-base">Salon setup</CardTitle>
                        <p className="text-xs text-muted-foreground">Branches and services (duration drives slot length).</p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label className="text-sm">Branches</Label>
                          <ul className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                            {branchesList.map((b: any) => (
                              <li key={b.branchId} className="flex justify-between items-center text-sm py-1">
                                <span>{b.name || b.branchId} {b.location && `· ${b.location}`} (cap: {b.capacity ?? 1})</span>
                              </li>
                            ))}
                            {branchesList.length === 0 && <li className="text-xs text-muted-foreground">No branches. Add via API or dashboard.</li>}
                          </ul>
                        </div>
                        <div>
                          <Label className="text-sm">Services</Label>
                          <ul className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                            {servicesList.map((s: any) => (
                              <li key={s.serviceId} className="flex justify-between items-center text-sm py-1">
                                <span>{s.name || s.serviceId} · {s.durationMinutes ?? 0} min</span>
                              </li>
                            ))}
                            {servicesList.length === 0 && <li className="text-xs text-muted-foreground">No services. Add via API or dashboard.</li>}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Clinic: doctors, locations & services */}
                  {useCase?.id === "clinic" && (
                    <Card className="bg-card/50 border-border">
                      <CardHeader>
                        <CardTitle className="text-base">Clinic setup</CardTitle>
                        <p className="text-xs text-muted-foreground">Doctors, locations, and services with pricing.</p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label className="text-sm">Doctors</Label>
                          <ul className="mt-1 space-y-1 max-h-24 overflow-y-auto">
                            {doctorsList.map((d: any) => (
                              <li key={d.doctorId} className="text-sm py-1">{d.name || d.doctorId} {d.specialty && `· ${d.specialty}`}</li>
                            ))}
                            {doctorsList.length === 0 && <li className="text-xs text-muted-foreground">No doctors added.</li>}
                          </ul>
                        </div>
                        <div>
                          <Label className="text-sm">Locations</Label>
                          <ul className="mt-1 space-y-1 max-h-24 overflow-y-auto">
                            {locationsList.map((l: any) => (
                              <li key={l.locationId} className="text-sm py-1">{l.name || l.locationId} {l.address && `· ${l.address}`}</li>
                            ))}
                            {locationsList.length === 0 && <li className="text-xs text-muted-foreground">No locations added.</li>}
                          </ul>
                        </div>
                        <div>
                          <Label className="text-sm">Services</Label>
                          <ul className="mt-1 space-y-1 max-h-24 overflow-y-auto">
                            {servicesList.map((s: any) => (
                              <li key={s.serviceId} className="text-sm py-1">{s.name || s.serviceId} · {s.durationMinutes ?? 0} min{s.priceCents != null ? ` · $${(s.priceCents / 100).toFixed(2)}` : ""}</li>
                            ))}
                            {servicesList.length === 0 && <li className="text-xs text-muted-foreground">No services added.</li>}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Use-case-specific fields = knowledge base for chat */}
                  {useCase?.fields && useCase.fields.length > 0 && (
                    <div className="space-y-4 pt-2 border-t border-border">
                      <div>
                        <Label className="text-base">Knowledge base (for chat)</Label>
                        <p className="text-xs text-muted-foreground mt-1">Your {useCase.title} details below are sent to the AI so chat replies use your real services, pricing, and info.</p>
                      </div>
                      {useCase.fields.map((field) => (
                        <div key={field.name} className="space-y-2">
                          <Label className="text-sm">{field.label}</Label>
                          {field.type === "text" && (
                            <Input
                              value={formData[field.name] || ""}
                              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                              placeholder={field.placeholder}
                              className="bg-card/50"
                            />
                          )}
                          {field.type === "textarea" && (
                            <Textarea
                              value={formData[field.name] || ""}
                              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                              placeholder={field.placeholder}
                              className="bg-card/50 min-h-[80px]"
                            />
                          )}
                          {field.type === "select" && (
                            <Select
                              value={formData[field.name] || ""}
                              onValueChange={(v) => setFormData({ ...formData, [field.name]: v })}
                            >
                              <SelectTrigger className="bg-card/50">
                                <SelectValue placeholder={field.placeholder} />
                              </SelectTrigger>
                              <SelectContent>
                                {field.options?.map((opt) => (
                                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <Button onClick={saveSettings} disabled={settingsSaving} className="w-full sm:w-auto">
                    {settingsSaving ? "Saving..." : "Save changes"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-border border-amber-500/30">
                <CardHeader>
                  <CardTitle className="font-display text-base">Start fresh</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Clear all saved onboarding data from this browser and sign out. You will need to log in again and go through onboarding from scratch. Use this after running a backend data purge or to reset your local state.
                  </p>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10" onClick={() => { if (window.confirm("Clear all onboarding data and sign out? You will need to log in and complete onboarding again.")) startFresh(); }}>
                    Clear onboarding & sign out
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
