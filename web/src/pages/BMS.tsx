import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Phone,
  DollarSign,
  CreditCard,
  Building2,
  ShieldAlert,
  Loader2,
  LayoutDashboard,
  Coins,
  ChevronLeft,
  ChevronRight,
  Search,
  Calendar,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Bot,
  PhoneOutgoing,
  Play,
  Pause,
  Square,
  Flame,
  Thermometer,
  Snowflake,
  Ban,
  MapPin,
  Globe,
  Star,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import AuthButton from "@/components/auth/AuthButton";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Summary {
  totalNumbersSold: number;
  totalRevenue: number;
  totalPayments: number;
  activeBusinesses: number;
  totalBusinesses: number;
  totalBookings: number;
  totalConversations: number;
  currency: string;
}

interface PhoneNumber {
  phoneNumber: string;
  handle: string;
  businessName: string;
  assignedAt: string;
  monthlyPrice: number;
  status: string;
}

interface Payment {
  paymentId: string;
  handle: string;
  amount: number;
  currency: string;
  type: string;
  phoneNumber: string;
  status: string;
  createdAt: string;
}

interface Business {
  handle: string;
  displayName: string;
  useCaseId: string;
  phoneNumber: string | null;
  hasAiPhone: boolean;
  knowledgeBaseId: string | null;
  createdAt: string;
  updatedAt: string;
  credits: number;
  totalCreditsUsed: number;
  planType: string;
  totalBookings: number;
  totalConversations: number;
  ownerEmail: string | null;
  hasWebsite: boolean;
  lastActive: string;
}

interface CreditRecord {
  handle: string;
  displayName: string;
  useCaseId: string;
  credits: number;
  totalCreditsUsed: number;
  planType: string;
  phoneNumber?: string;
  createdAt: string;
  updatedAt: string;
}

interface SalesLead {
  leadId: string;
  campaignId: string;
  businessName: string;
  phoneNumber: string;
  address?: string;
  googlePlaceId?: string;
  rating?: number | null;
  website?: string | null;
  status: "pending" | "calling" | "completed" | "failed" | "skipped";
  classification: "hot" | "warm" | "cold" | "not_interested" | null;
  callSummary: string | null;
  callDurationSeconds: number | null;
  transcript?: string | null;
  callbackRequested?: boolean;
  callbackPreferredTime?: string | null;
  createdAt: string;
}

interface SalesCampaign {
  campaignId: string;
  name: string;
  businessType: string;
  location: string;
  status: "draft" | "running" | "paused" | "completed" | "stopped";
  totalLeads: number;
  completedCalls: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  notInterested: number;
  failedCalls: number;
  createdAt: string;
}

interface PlacesResult {
  name: string;
  phone: string;
  address: string;
  placeId: string;
  rating: number | null;
  ratingCount: number;
  website: string | null;
  types: string[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const useCaseLabels: Record<string, string> = {
  gaming_cafe: "Gaming Cafe",
  salon: "Salon",
  clinic: "Clinic",
  general: "General",
  customer_support: "Customer Support",
  unknown: "Unknown",
};

const bmsNavItems = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "salesbot", label: "Salesbot", icon: Bot },
  { id: "leads", label: "Leads", icon: MessageSquare },
  { id: "phone-numbers", label: "Phone Numbers", icon: Phone },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "businesses", label: "Businesses", icon: Building2 },
  { id: "credits", label: "Credits", icon: Coins },
];

function getApiBase() {
  return (
    (import.meta as any).env?.VITE_API_BASE_URL ||
    localStorage.getItem("yandle_api_base") ||
    "https://6kbd4veax6.execute-api.us-east-1.amazonaws.com"
  );
}

function getHeaders() {
  const token = localStorage.getItem("yandle_id_token") || "";
  return { authorization: `Bearer ${token}` };
}

function statusBadge(status: string) {
  const cls =
    status === "completed" || status === "success"
      ? "bg-emerald-500/20 text-emerald-400"
      : status === "pending"
        ? "bg-yellow-500/20 text-yellow-400"
        : status === "failed"
          ? "bg-red-500/20 text-red-400"
          : "bg-secondary text-muted-foreground";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function creditColor(credits: number) {
  if (credits < 100) return "text-red-400";
  if (credits < 500) return "text-amber-400";
  return "text-emerald-400";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BMS() {
  const [activeNav, setActiveNav] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  // Data
  const [summary, setSummary] = useState<Summary | null>(null);
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [credits, setCredits] = useState<CreditRecord[]>([]);

  // Data loaded flags
  const [numbersLoaded, setNumbersLoaded] = useState(false);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [businessesLoaded, setBusinessesLoaded] = useState(false);
  const [creditsLoaded, setCreditsLoaded] = useState(false);

  // Tab loading
  const [tabLoading, setTabLoading] = useState(false);

  // Salesbot state
  const [campaigns, setCampaigns] = useState<SalesCampaign[]>([]);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<SalesCampaign | null>(null);
  const [activeCampaignLeads, setActiveCampaignLeads] = useState<SalesLead[]>([]);
  const [searchedLeads, setSearchedLeads] = useState<PlacesResult[]>([]);
  const [selectedLeadIdxs, setSelectedLeadIdxs] = useState<Set<number>>(new Set());
  const [leadSearchType, setLeadSearchType] = useState("salon");
  const [leadSearchLocation, setLeadSearchLocation] = useState("");
  const [leadSearching, setLeadSearching] = useState(false);
  const [testCallPhone, setTestCallPhone] = useState("");
  const [testCallStatus, setTestCallStatus] = useState<"idle" | "calling" | "completed">("idle");
  const [testCallResult, setTestCallResult] = useState<{ summary: string; classification: string; duration: number } | null>(null);
  const [testCallPollId, setTestCallPollId] = useState<string | null>(null);
  const [campaignPolling, setCampaignPolling] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [allLeads, setAllLeads] = useState<SalesLead[]>([]);
  const [allLeadsLoaded, setAllLeadsLoaded] = useState(false);
  const [outboundConfig, setOutboundConfig] = useState<{ handle: string; systemPrompt: string; voiceId: string; knowledgeBaseId: string }>({
    handle: "voxa-salesbot",
    systemPrompt: "",
    voiceId: "tiffany",
    knowledgeBaseId: "",
  });
  const [outboundConfigLoaded, setOutboundConfigLoaded] = useState(false);
  const [outboundSaving, setOutboundSaving] = useState(false);

  // Search
  const [phoneSearch, setPhoneSearch] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [businessSearch, setBusinessSearch] = useState("");
  const [creditSearch, setCreditSearch] = useState("");

  // Initial load — summary + access check
  useEffect(() => {
    const apiBase = getApiBase();
    const headers = getHeaders();

    fetch(`${apiBase}/bms/summary`, { headers })
      .then((r) => {
        if (r.status === 403) {
          setAccessDenied(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setSummary(data);
      })
      .catch(() => setAccessDenied(true))
      .finally(() => setLoading(false));
  }, []);

  // Lazy-load per tab
  useEffect(() => {
    if (accessDenied || loading) return;
    const apiBase = getApiBase();
    const headers = getHeaders();

    if (activeNav === "phone-numbers" && !numbersLoaded) {
      setTabLoading(true);
      fetch(`${apiBase}/bms/numbers`, { headers })
        .then((r) => r.json())
        .then((d) => { setNumbers(d.numbers || []); setNumbersLoaded(true); })
        .catch(() => {})
        .finally(() => setTabLoading(false));
    }
    if (activeNav === "payments" && !paymentsLoaded) {
      setTabLoading(true);
      fetch(`${apiBase}/bms/payments`, { headers })
        .then((r) => r.json())
        .then((d) => { setPayments(d.payments || []); setPaymentsLoaded(true); })
        .catch(() => {})
        .finally(() => setTabLoading(false));
    }
    if (activeNav === "businesses" && !businessesLoaded) {
      setTabLoading(true);
      fetch(`${apiBase}/bms/businesses`, { headers })
        .then((r) => r.json())
        .then((d) => { setBusinesses(d.businesses || []); setBusinessesLoaded(true); })
        .catch(() => {})
        .finally(() => setTabLoading(false));
    }
    if (activeNav === "credits" && !creditsLoaded) {
      setTabLoading(true);
      fetch(`${apiBase}/bms/credits`, { headers })
        .then((r) => r.json())
        .then((d) => { setCredits(d.credits || []); setCreditsLoaded(true); })
        .catch(() => {})
        .finally(() => setTabLoading(false));
    }
    if (activeNav === "salesbot" && !campaignsLoaded) {
      setTabLoading(true);
      fetch(`${apiBase}/bms/salesbot/campaigns`, { headers })
        .then((r) => r.json())
        .then((d) => { setCampaigns(d.campaigns || []); setCampaignsLoaded(true); })
        .catch(() => {})
        .finally(() => setTabLoading(false));
    }
    if (activeNav === "leads" && !allLeadsLoaded) {
      setTabLoading(true);
      fetch(`${apiBase}/bms/salesbot/leads?all=1&limit=200`, { headers })
        .then((r) => r.json())
        .then((d) => { setAllLeads(d.leads || []); setAllLeadsLoaded(true); })
        .catch(() => {})
        .finally(() => setTabLoading(false));
    }
    if (activeNav === "salesbot" && !outboundConfigLoaded) {
      fetch(`${apiBase}/bms/salesbot/outbound-config`, { headers })
        .then((r) => r.json())
        .then((d) => {
          setOutboundConfig({
            handle: d.handle ?? "voxa-salesbot",
            systemPrompt: d.systemPrompt ?? "",
            voiceId: d.voiceId ?? "tiffany",
            knowledgeBaseId: d.knowledgeBaseId ?? "",
          });
          setOutboundConfigLoaded(true);
        })
        .catch(() => setOutboundConfigLoaded(true));
    }
  }, [activeNav, accessDenied, loading, numbersLoaded, paymentsLoaded, businessesLoaded, creditsLoaded, campaignsLoaded, allLeadsLoaded, outboundConfigLoaded]);

  // Salesbot — poll active campaign every 5s
  useEffect(() => {
    if (!activeCampaign || !["running"].includes(activeCampaign.status)) return;
    setCampaignPolling(true);
    const interval = setInterval(async () => {
      try {
        const apiBase = getApiBase();
        const headers = getHeaders();
        const res = await fetch(`${apiBase}/bms/salesbot/campaigns/${activeCampaign.campaignId}`, { headers });
        const data = await res.json();
        if (data.campaign) {
          setActiveCampaign(data.campaign);
          setActiveCampaignLeads(data.leads || []);
          // Update in campaigns list too
          setCampaigns((prev) => prev.map((c) => c.campaignId === data.campaign.campaignId ? data.campaign : c));
          if (data.campaign.status !== "running") setCampaignPolling(false);
        }
      } catch {}
    }, 5000);
    return () => { clearInterval(interval); setCampaignPolling(false); };
  }, [activeCampaign?.campaignId, activeCampaign?.status]);

  // Salesbot — poll test call result
  useEffect(() => {
    if (!testCallPollId || testCallStatus !== "calling") return;
    const interval = setInterval(async () => {
      try {
        const apiBase = getApiBase();
        const headers = getHeaders();
        const res = await fetch(`${apiBase}/bms/salesbot/campaigns/${testCallPollId}`, { headers });
        const data = await res.json();
        const leads: SalesLead[] = data.leads || [];
        const lead = leads[0];
        if (lead && lead.status === "completed") {
          setTestCallResult({ summary: lead.callSummary || "", classification: lead.classification || "cold", duration: lead.callDurationSeconds || 0 });
          setTestCallStatus("completed");
          clearInterval(interval);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [testCallPollId, testCallStatus]);

  // Salesbot functions
  async function searchLeads() {
    if (!leadSearchLocation.trim()) return;
    setLeadSearching(true);
    setSearchedLeads([]);
    setSelectedLeadIdxs(new Set());
    try {
      const res = await fetch(`${getApiBase()}/bms/salesbot/leads?type=${encodeURIComponent(leadSearchType)}&location=${encodeURIComponent(leadSearchLocation)}`, { headers: getHeaders() });
      const data = await res.json();
      setSearchedLeads(data.businesses || []);
      // Select all by default
      setSelectedLeadIdxs(new Set((data.businesses || []).map((_: PlacesResult, i: number) => i)));
    } catch {}
    setLeadSearching(false);
  }

  async function createCampaign() {
    if (selectedLeadIdxs.size === 0) return;
    setCreatingCampaign(true);
    try {
      const apiBase = getApiBase();
      const headers = { ...getHeaders(), "content-type": "application/json" };
      // Create campaign
      const campRes = await fetch(`${apiBase}/bms/salesbot/campaigns`, {
        method: "POST", headers,
        body: JSON.stringify({ name: `${leadSearchType} in ${leadSearchLocation}`, businessType: leadSearchType, location: leadSearchLocation }),
      });
      const campaign: SalesCampaign = await campRes.json();
      // Save leads
      const leads = Array.from(selectedLeadIdxs).map((i) => searchedLeads[i]);
      await fetch(`${apiBase}/bms/salesbot/leads/save`, {
        method: "POST", headers,
        body: JSON.stringify({ campaignId: campaign.campaignId, leads }),
      });
      // Refresh
      campaign.totalLeads = leads.length;
      setCampaigns((prev) => [campaign, ...prev]);
      setActiveCampaign(campaign);
      // Load leads
      const detailRes = await fetch(`${apiBase}/bms/salesbot/campaigns/${campaign.campaignId}`, { headers: getHeaders() });
      const detail = await detailRes.json();
      setActiveCampaignLeads(detail.leads || []);
      setSearchedLeads([]);
    } catch {}
    setCreatingCampaign(false);
  }

  async function updateCampaignStatus(status: string) {
    if (!activeCampaign) return;
    const headers = { ...getHeaders(), "content-type": "application/json" };
    await fetch(`${getApiBase()}/bms/salesbot/campaigns/${activeCampaign.campaignId}`, {
      method: "PATCH", headers, body: JSON.stringify({ status }),
    });
    setActiveCampaign({ ...activeCampaign, status: status as SalesCampaign["status"] });
    setCampaigns((prev) => prev.map((c) => c.campaignId === activeCampaign.campaignId ? { ...c, status: status as SalesCampaign["status"] } : c));
    // If starting, trigger first batch
    if (status === "running") {
      await fetch(`${getApiBase()}/bms/salesbot/call-next`, {
        method: "POST", headers, body: JSON.stringify({ campaignId: activeCampaign.campaignId }),
      });
    }
  }

  async function startTestCall() {
    if (!testCallPhone.trim()) return;
    setTestCallStatus("calling");
    setTestCallResult(null);
    try {
      const res = await fetch(`${getApiBase()}/bms/salesbot/test-call`, {
        method: "POST", headers: { ...getHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ phoneNumber: testCallPhone }),
      });
      const data = await res.json();
      setTestCallPollId(data.campaignId || null);
    } catch {
      setTestCallStatus("idle");
    }
  }

  async function loadCampaignDetail(campaign: SalesCampaign) {
    setActiveCampaign(campaign);
    try {
      const res = await fetch(`${getApiBase()}/bms/salesbot/campaigns/${campaign.campaignId}`, { headers: getHeaders() });
      const data = await res.json();
      setActiveCampaignLeads(data.leads || []);
      if (data.campaign) setActiveCampaign(data.campaign);
    } catch {}
  }

  function classificationBadge(cls: string | null) {
    if (!cls) return <span className="text-xs text-muted-foreground">—</span>;
    const config: Record<string, { icon: typeof Flame; cls: string; label: string }> = {
      hot: { icon: Flame, cls: "bg-red-500/20 text-red-400", label: "Hot" },
      warm: { icon: Thermometer, cls: "bg-orange-500/20 text-orange-400", label: "Warm" },
      cold: { icon: Snowflake, cls: "bg-blue-500/20 text-blue-400", label: "Cold" },
      not_interested: { icon: Ban, cls: "bg-zinc-500/20 text-zinc-400", label: "Not Interested" },
    };
    const c = config[cls] || config.cold;
    const Icon = c.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.cls}`}>
        <Icon className="h-3 w-3" /> {c.label}
      </span>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Loading state                                                    */
  /* ---------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Access denied                                                    */
  /* ---------------------------------------------------------------- */
  if (accessDenied) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-12 w-12 text-red-400" />
        <h1 className="text-xl font-semibold">Access Denied</h1>
        <p className="text-muted-foreground text-sm">Super admin only</p>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Filtered data                                                    */
  /* ---------------------------------------------------------------- */
  const filteredNumbers = numbers.filter((n) => {
    const q = phoneSearch.toLowerCase();
    return !q || n.phoneNumber.toLowerCase().includes(q) || n.handle.toLowerCase().includes(q) || (n.businessName || "").toLowerCase().includes(q);
  });

  const filteredPayments = payments.filter((p) => {
    const q = paymentSearch.toLowerCase();
    return !q || p.handle.toLowerCase().includes(q) || p.paymentId.toLowerCase().includes(q) || p.type.toLowerCase().includes(q);
  });

  const filteredBusinesses = businesses.filter((b) => {
    const q = businessSearch.toLowerCase();
    return !q || b.handle.toLowerCase().includes(q) || b.displayName.toLowerCase().includes(q) || (b.ownerEmail || "").toLowerCase().includes(q) || (useCaseLabels[b.useCaseId] || "").toLowerCase().includes(q);
  });

  const filteredCredits = credits.filter((c) => {
    const q = creditSearch.toLowerCase();
    return !q || c.handle.toLowerCase().includes(q) || c.displayName.toLowerCase().includes(q);
  });

  /* ---------------------------------------------------------------- */
  /*  Stat cards config                                                */
  /* ---------------------------------------------------------------- */
  const stats = [
    { label: "Total Businesses", value: summary?.totalBusinesses ?? 0, icon: Building2, format: (v: number) => v.toLocaleString() },
    { label: "Active (w/ Phone)", value: summary?.activeBusinesses ?? 0, icon: Phone, format: (v: number) => v.toLocaleString() },
    { label: "Numbers Sold", value: summary?.totalNumbersSold ?? 0, icon: Phone, format: (v: number) => v.toLocaleString() },
    { label: "Total Revenue", value: summary?.totalRevenue ?? 0, icon: DollarSign, format: (v: number) => `\u20B9${v.toLocaleString()}` },
    { label: "Total Payments", value: summary?.totalPayments ?? 0, icon: CreditCard, format: (v: number) => v.toLocaleString() },
    { label: "Total Bookings", value: summary?.totalBookings ?? 0, icon: Calendar, format: (v: number) => v.toLocaleString() },
    { label: "Conversations", value: summary?.totalConversations ?? 0, icon: MessageSquare, format: (v: number) => v.toLocaleString() },
    { label: "Currency", value: 0, icon: DollarSign, format: () => summary?.currency || "INR" },
  ];

  /* ---------------------------------------------------------------- */
  /*  Tab loading spinner                                              */
  /* ---------------------------------------------------------------- */
  const TabLoader = () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Search bar                                                       */
  /* ---------------------------------------------------------------- */
  const SearchBar = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
    <div className="relative max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 h-9 bg-card/50 border-border"
      />
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Empty state                                                      */
  /* ---------------------------------------------------------------- */
  const EmptyRow = ({ cols, text }: { cols: number; text: string }) => (
    <tr><td colSpan={cols} className="py-12 text-center text-muted-foreground">{text}</td></tr>
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <div className="min-h-screen bg-background flex">
      {/* ============ Sidebar ============ */}
      <aside
        className={`fixed top-0 left-0 h-full z-40 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {/* Logo + collapse toggle */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-sidebar-border">
          {!collapsed && (
            <span className="font-display text-lg font-bold text-gradient-primary">YANDLE BMS</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
          {bmsNavItems.map((item) => (
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

        {/* Bottom — Super Admin badge */}
        {!collapsed && (
          <div className="p-3 border-t border-sidebar-border">
            <div className="rounded-lg bg-sidebar-accent p-3 space-y-1">
              <p className="text-xs text-sidebar-foreground/60">Logged in as</p>
              <p className="text-sm font-medium text-sidebar-primary">Super Admin</p>
            </div>
          </div>
        )}
      </aside>

      {/* ============ Main Content ============ */}
      <main className={`flex-1 transition-all duration-300 ${collapsed ? "ml-16" : "ml-60"}`}>
        {/* Top bar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
          <h1 className="font-display text-lg font-semibold">
            {bmsNavItems.find((n) => n.id === activeNav)?.label}
          </h1>
          <div className="flex items-center gap-3">
            <AuthButton />
            <div className="h-8 w-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 font-semibold text-sm">
              SA
            </div>
          </div>
        </header>

        {/* Dashboard content */}
        <div className="p-6 space-y-6">
          {/* ==================== Overview ==================== */}
          {activeNav === "overview" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {stats.map((s) => (
                  <Card key={s.label} className="bg-card/50 border-border">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                      <s.icon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{s.format(s.value)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}

          {/* ==================== Phone Numbers ==================== */}
          {activeNav === "phone-numbers" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              {tabLoading && !numbersLoaded ? <TabLoader /> : (
                <>
                  <SearchBar value={phoneSearch} onChange={setPhoneSearch} placeholder="Search by number, business, handle..." />
                  <Card className="bg-card/50 border-border mt-4">
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="text-left py-3 px-4 font-medium">Phone Number</th>
                              <th className="text-left py-3 px-4 font-medium">Business Name</th>
                              <th className="text-left py-3 px-4 font-medium">Handle</th>
                              <th className="text-left py-3 px-4 font-medium">Assigned Date</th>
                              <th className="text-right py-3 px-4 font-medium">Monthly Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredNumbers.length === 0 ? (
                              <EmptyRow cols={5} text="No phone numbers found" />
                            ) : (
                              filteredNumbers.map((n) => (
                                <tr key={n.phoneNumber} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                                  <td className="py-3 px-4 font-mono text-xs">{n.phoneNumber}</td>
                                  <td className="py-3 px-4">{n.businessName || n.handle}</td>
                                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground">@{n.handle}</td>
                                  <td className="py-3 px-4 text-muted-foreground">{n.assignedAt ? new Date(n.assignedAt).toLocaleDateString() : "—"}</td>
                                  <td className="py-3 px-4 text-right font-medium">{`\u20B9${n.monthlyPrice.toLocaleString()}`}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </motion.div>
          )}

          {/* ==================== Payments ==================== */}
          {activeNav === "payments" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              {tabLoading && !paymentsLoaded ? <TabLoader /> : (
                <>
                  <SearchBar value={paymentSearch} onChange={setPaymentSearch} placeholder="Search by business, payment ID, type..." />
                  <Card className="bg-card/50 border-border mt-4">
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="text-left py-3 px-4 font-medium">Date</th>
                              <th className="text-left py-3 px-4 font-medium">Payment ID</th>
                              <th className="text-left py-3 px-4 font-medium">Business</th>
                              <th className="text-right py-3 px-4 font-medium">Amount</th>
                              <th className="text-left py-3 px-4 font-medium">Type</th>
                              <th className="text-left py-3 px-4 font-medium">Phone Number</th>
                              <th className="text-left py-3 px-4 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredPayments.length === 0 ? (
                              <EmptyRow cols={7} text="No payments found" />
                            ) : (
                              filteredPayments.map((p) => (
                                <tr key={p.paymentId} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                                  <td className="py-3 px-4 text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</td>
                                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground truncate max-w-[120px]">{p.paymentId?.slice(0, 8)}...</td>
                                  <td className="py-3 px-4">@{p.handle}</td>
                                  <td className="py-3 px-4 text-right font-medium">{`\u20B9${(p.amount || 0).toLocaleString()}`}</td>
                                  <td className="py-3 px-4 capitalize">{p.type?.replace(/_/g, " ")}</td>
                                  <td className="py-3 px-4 font-mono text-xs">{p.phoneNumber || "—"}</td>
                                  <td className="py-3 px-4">{statusBadge(p.status)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </motion.div>
          )}

          {/* ==================== Businesses ==================== */}
          {activeNav === "businesses" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              {tabLoading && !businessesLoaded ? <TabLoader /> : (
                <>
                  <SearchBar value={businessSearch} onChange={setBusinessSearch} placeholder="Search by handle, name, email, type..." />
                  <Card className="bg-card/50 border-border mt-4">
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="text-left py-3 px-4 font-medium">Handle</th>
                              <th className="text-left py-3 px-4 font-medium">Display Name</th>
                              <th className="text-left py-3 px-4 font-medium">Type</th>
                              <th className="text-left py-3 px-4 font-medium">Phone</th>
                              <th className="text-left py-3 px-4 font-medium">Owner Email</th>
                              <th className="text-right py-3 px-4 font-medium">Credits</th>
                              <th className="text-center py-3 px-4 font-medium">KB</th>
                              <th className="text-center py-3 px-4 font-medium">Website</th>
                              <th className="text-right py-3 px-4 font-medium">Bookings</th>
                              <th className="text-right py-3 px-4 font-medium">Convos</th>
                              <th className="text-left py-3 px-4 font-medium">Last Active</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredBusinesses.length === 0 ? (
                              <EmptyRow cols={11} text="No businesses found" />
                            ) : (
                              filteredBusinesses.map((b) => (
                                <tr key={b.handle} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                                  <td className="py-3 px-4 font-mono text-xs">@{b.handle}</td>
                                  <td className="py-3 px-4 font-medium">{b.displayName}</td>
                                  <td className="py-3 px-4">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                      {useCaseLabels[b.useCaseId] || b.useCaseId}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 font-mono text-xs">{b.phoneNumber || "—"}</td>
                                  <td className="py-3 px-4 text-muted-foreground text-xs">{b.ownerEmail || "—"}</td>
                                  <td className={`py-3 px-4 text-right font-medium ${creditColor(b.credits)}`}>{b.credits.toLocaleString()}</td>
                                  <td className="py-3 px-4 text-center">
                                    {b.knowledgeBaseId ? (
                                      <CheckCircle2 className="h-4 w-4 text-emerald-400 inline-block" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-muted-foreground/40 inline-block" />
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    {b.hasWebsite ? (
                                      <CheckCircle2 className="h-4 w-4 text-emerald-400 inline-block" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-muted-foreground/40 inline-block" />
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-right">{b.totalBookings.toLocaleString()}</td>
                                  <td className="py-3 px-4 text-right">{b.totalConversations.toLocaleString()}</td>
                                  <td className="py-3 px-4 text-muted-foreground text-xs">{b.lastActive ? new Date(b.lastActive).toLocaleDateString() : "—"}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </motion.div>
          )}

          {/* ==================== Credits ==================== */}
          {activeNav === "credits" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              {tabLoading && !creditsLoaded ? <TabLoader /> : (
                <>
                  <SearchBar value={creditSearch} onChange={setCreditSearch} placeholder="Search by handle, business name..." />
                  <Card className="bg-card/50 border-border mt-4">
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="text-left py-3 px-4 font-medium">Handle</th>
                              <th className="text-left py-3 px-4 font-medium">Business Name</th>
                              <th className="text-left py-3 px-4 font-medium">Type</th>
                              <th className="text-right py-3 px-4 font-medium">Credits Balance</th>
                              <th className="text-right py-3 px-4 font-medium">Total Used</th>
                              <th className="text-left py-3 px-4 font-medium">Plan</th>
                              <th className="text-left py-3 px-4 font-medium">Updated</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredCredits.length === 0 ? (
                              <EmptyRow cols={7} text="No credit records found" />
                            ) : (
                              filteredCredits.map((c) => (
                                <tr key={c.handle} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                                  <td className="py-3 px-4 font-mono text-xs">@{c.handle}</td>
                                  <td className="py-3 px-4 font-medium">{c.displayName}</td>
                                  <td className="py-3 px-4">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                      {useCaseLabels[c.useCaseId] || c.useCaseId}
                                    </span>
                                  </td>
                                  <td className={`py-3 px-4 text-right font-bold ${creditColor(c.credits)}`}>{c.credits.toLocaleString()}</td>
                                  <td className="py-3 px-4 text-right text-muted-foreground">{c.totalCreditsUsed.toLocaleString()}</td>
                                  <td className="py-3 px-4">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-muted-foreground capitalize">
                                      {c.planType?.replace(/_/g, " ") || "none"}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-muted-foreground text-xs">{c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : "—"}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </motion.div>
          )}
          {/* ==================== Leads (all outbound calls) ==================== */}
          {activeNav === "leads" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
              {tabLoading && !allLeadsLoaded ? <TabLoader /> : (
                <Card className="bg-card/50 border-border">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <MessageSquare className="h-4 w-4" /> All outbound calls
                        </CardTitle>
                        <CardDescription>Every outbound call (test and campaign). AI overview from transcript. If they requested a callback, preferred time is shown.</CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAllLeadsLoaded(false);
                          setTabLoading(true);
                          fetch(`${getApiBase()}/bms/salesbot/leads?all=1&limit=200`, { headers: getHeaders() })
                            .then((r) => r.json())
                            .then((d) => { setAllLeads(d.leads || []); setAllLeadsLoaded(true); })
                            .catch(() => {})
                            .finally(() => setTabLoading(false));
                        }}
                      >
                        Refresh
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {allLeads.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8">No leads yet. Test calls and campaign calls will appear here.</p>
                    ) : (
                      <div className="space-y-4">
                        {allLeads.map((lead) => (
                          <div
                            key={`${lead.campaignId}-${lead.leadId}`}
                            className="rounded-lg border border-border bg-background/50 p-4 space-y-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{lead.businessName || "—"}</span>
                              <span className="text-muted-foreground text-sm font-mono">{lead.phoneNumber}</span>
                              <span className="text-xs text-muted-foreground">
                                {lead.campaignId?.startsWith("test_") ? "Test call" : lead.campaignId}
                              </span>
                              {classificationBadge(lead.classification)}
                              {statusBadge(lead.status)}
                              {lead.callDurationSeconds != null && (
                                <span className="text-xs text-muted-foreground">{lead.callDurationSeconds}s</span>
                              )}
                            </div>
                            {lead.callSummary && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">AI overview</p>
                                <p className="text-sm">{lead.callSummary}</p>
                              </div>
                            )}
                            {(lead.callbackRequested || lead.callbackPreferredTime) && (
                              <div className="flex flex-wrap items-center gap-2 rounded bg-amber-500/10 border border-amber-500/30 px-3 py-2">
                                <CheckCircle2 className="h-4 w-4 text-amber-500" />
                                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Callback requested</span>
                                {lead.callbackPreferredTime && (
                                  <span className="text-sm text-muted-foreground">· Preferred time: {lead.callbackPreferredTime}</span>
                                )}
                              </div>
                            )}
                            {lead.transcript && (
                              <details className="group">
                                <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">Transcript</summary>
                                <pre className="mt-2 p-3 rounded bg-muted/50 text-xs whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
                                  {lead.transcript}
                                </pre>
                              </details>
                            )}
                            <p className="text-xs text-muted-foreground">{new Date(lead.createdAt).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}
          {/* ==================== Salesbot ==================== */}
          {activeNav === "salesbot" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
              {tabLoading && !campaignsLoaded ? <TabLoader /> : (
                <>
                  {/* --- Outbound voice config (handle, system prompt, voice, KB for salesbot) --- */}
                  <Card className="bg-card/50 border-border">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">Outbound voice config</CardTitle>
                      <CardDescription>System prompt, voice, and knowledge base for the number used for outbound sales calls. Used for test calls and campaigns.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 max-w-2xl">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1">Handle (yandle number)</label>
                          <Input
                            value={outboundConfig.handle}
                            onChange={(e) => setOutboundConfig((c) => ({ ...c, handle: e.target.value }))}
                            placeholder="voxa-salesbot"
                            className="bg-background"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1">System prompt</label>
                          <textarea
                            value={outboundConfig.systemPrompt}
                            onChange={(e) => setOutboundConfig((c) => ({ ...c, systemPrompt: e.target.value }))}
                            placeholder="Leave empty to use default sales pitch. Override to customize how the AI introduces and pitches."
                            rows={6}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[120px]"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1">Voice</label>
                          <select
                            value={outboundConfig.voiceId}
                            onChange={(e) => setOutboundConfig((c) => ({ ...c, voiceId: e.target.value }))}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full max-w-xs"
                          >
                            <option value="tiffany">Tiffany (female)</option>
                            <option value="matthew">Matthew (male)</option>
                            <option value="joanna">Joanna (female)</option>
                            <option value="ivy">Ivy (female)</option>
                            <option value="joey">Joey (male)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1">Knowledge base ID (optional)</label>
                          <Input
                            value={outboundConfig.knowledgeBaseId}
                            onChange={(e) => setOutboundConfig((c) => ({ ...c, knowledgeBaseId: e.target.value }))}
                            placeholder="Leave empty for no KB"
                            className="bg-background max-w-md"
                          />
                        </div>
                        <Button
                          onClick={async () => {
                            setOutboundSaving(true);
                            try {
                              await fetch(`${getApiBase()}/bms/salesbot/outbound-config`, {
                                method: "PATCH",
                                headers: { ...getHeaders(), "content-type": "application/json" },
                                body: JSON.stringify(outboundConfig),
                              });
                            } finally {
                              setOutboundSaving(false);
                            }
                          }}
                          disabled={outboundSaving}
                        >
                          {outboundSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Save outbound config
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  {/* --- Test Call Section --- */}
                  <Card className="bg-card/50 border-border">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <PhoneOutgoing className="h-4 w-4" /> Test Call
                      </CardTitle>
                      <CardDescription>Enter a phone number to test the AI sales pitch. The AI will call, pitch Voxa, and classify the lead.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-3">
                        <Input
                          value={testCallPhone}
                          onChange={(e) => setTestCallPhone(e.target.value)}
                          placeholder="+91 98765 43210"
                          className="max-w-xs bg-background"
                          disabled={testCallStatus === "calling"}
                        />
                        <Button
                          onClick={startTestCall}
                          disabled={testCallStatus === "calling" || !testCallPhone.trim()}
                          className="bg-indigo-600 hover:bg-indigo-700"
                        >
                          {testCallStatus === "calling" ? (
                            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Calling...</>
                          ) : (
                            <><Phone className="h-4 w-4 mr-2" /> Call</>
                          )}
                        </Button>
                        {testCallStatus === "completed" && (
                          <Button variant="outline" size="sm" onClick={() => { setTestCallStatus("idle"); setTestCallResult(null); setTestCallPollId(null); }}>
                            Reset
                          </Button>
                        )}
                      </div>
                      {testCallStatus === "calling" && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>AI is calling {testCallPhone}... Waiting for call to complete.</span>
                        </div>
                      )}
                      {testCallResult && (
                        <div className="rounded-lg border border-border bg-background p-4 space-y-2">
                          <div className="flex items-center gap-3">
                            {classificationBadge(testCallResult.classification)}
                            <span className="text-xs text-muted-foreground">{testCallResult.duration}s</span>
                          </div>
                          <p className="text-sm">{testCallResult.summary}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* --- Lead Finder --- */}
                  <Card className="bg-card/50 border-border">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <MapPin className="h-4 w-4" /> Find Leads
                      </CardTitle>
                      <CardDescription>Search for businesses by type and location using Google Places. Select leads to create a campaign.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-3 flex-wrap">
                        <select
                          value={leadSearchType}
                          onChange={(e) => setLeadSearchType(e.target.value)}
                          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                        >
                          <option value="salon">Salon</option>
                          <option value="clinic">Clinic</option>
                          <option value="gaming_cafe">Gaming Cafe</option>
                          <option value="retail_shop">Retail Shop</option>
                          <option value="restaurant">Restaurant</option>
                          <option value="gym">Gym</option>
                          <option value="spa">Spa</option>
                          <option value="dental_clinic">Dental Clinic</option>
                        </select>
                        <Input
                          value={leadSearchLocation}
                          onChange={(e) => setLeadSearchLocation(e.target.value)}
                          placeholder="e.g. Bangalore, Koramangala"
                          className="max-w-xs bg-background"
                        />
                        <Button onClick={searchLeads} disabled={leadSearching || !leadSearchLocation.trim()}>
                          {leadSearching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                          Find Leads
                        </Button>
                      </div>

                      {searchedLeads.length > 0 && (
                        <>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">{searchedLeads.length} businesses found · {selectedLeadIdxs.size} selected</p>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setSelectedLeadIdxs(new Set(searchedLeads.map((_, i) => i)))}>Select All</Button>
                              <Button variant="ghost" size="sm" onClick={() => setSelectedLeadIdxs(new Set())}>Deselect All</Button>
                            </div>
                          </div>
                          <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full text-sm">
                              <thead><tr className="border-b border-border bg-muted/30">
                                <th className="py-2 px-3 text-left w-8">
                                  <input
                                    type="checkbox"
                                    checked={selectedLeadIdxs.size === searchedLeads.length}
                                    onChange={(e) => setSelectedLeadIdxs(e.target.checked ? new Set(searchedLeads.map((_, i) => i)) : new Set())}
                                    className="rounded"
                                  />
                                </th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Business</th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Phone</th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Address</th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Rating</th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Website</th>
                              </tr></thead>
                              <tbody>
                                {searchedLeads.map((lead, idx) => (
                                  <tr key={idx} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                                    <td className="py-2 px-3">
                                      <input
                                        type="checkbox"
                                        checked={selectedLeadIdxs.has(idx)}
                                        onChange={(e) => {
                                          const next = new Set(selectedLeadIdxs);
                                          e.target.checked ? next.add(idx) : next.delete(idx);
                                          setSelectedLeadIdxs(next);
                                        }}
                                        className="rounded"
                                      />
                                    </td>
                                    <td className="py-2 px-3 font-medium">{lead.name}</td>
                                    <td className="py-2 px-3 font-mono text-xs">{lead.phone}</td>
                                    <td className="py-2 px-3 text-xs text-muted-foreground max-w-[200px] truncate">{lead.address}</td>
                                    <td className="py-2 px-3">
                                      {lead.rating ? (
                                        <span className="inline-flex items-center gap-1 text-xs">
                                          <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" /> {lead.rating} <span className="text-muted-foreground">({lead.ratingCount})</span>
                                        </span>
                                      ) : "—"}
                                    </td>
                                    <td className="py-2 px-3">
                                      {lead.website ? (
                                        <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline inline-flex items-center gap-1 text-xs">
                                          <Globe className="h-3 w-3" /> Visit
                                        </a>
                                      ) : <span className="text-xs text-muted-foreground">None</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <Button onClick={createCampaign} disabled={selectedLeadIdxs.size === 0 || creatingCampaign} className="bg-emerald-600 hover:bg-emerald-700">
                            {creatingCampaign ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Bot className="h-4 w-4 mr-2" />}
                            Create Campaign ({selectedLeadIdxs.size} leads)
                          </Button>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* --- Campaign List --- */}
                  {campaigns.length > 0 && !activeCampaign && (
                    <Card className="bg-card/50 border-border">
                      <CardHeader>
                        <CardTitle className="text-base">Campaigns</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {campaigns.map((c) => (
                            <button
                              key={c.campaignId}
                              onClick={() => loadCampaignDetail(c)}
                              className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-secondary/20 transition-colors text-left"
                            >
                              <div>
                                <p className="font-medium text-sm">{c.name}</p>
                                <p className="text-xs text-muted-foreground">{c.totalLeads} leads · {c.completedCalls} completed · {new Date(c.createdAt).toLocaleDateString()}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex gap-1">
                                  {c.hotLeads > 0 && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400"><Flame className="h-2.5 w-2.5" />{c.hotLeads}</span>}
                                  {c.warmLeads > 0 && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-orange-500/20 text-orange-400"><Thermometer className="h-2.5 w-2.5" />{c.warmLeads}</span>}
                                </div>
                                {statusBadge(c.status)}
                              </div>
                            </button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* --- Active Campaign Detail --- */}
                  {activeCampaign && (
                    <>
                      <Card className="bg-card/50 border-border">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="text-base flex items-center gap-2">
                                {activeCampaign.name}
                                {statusBadge(activeCampaign.status)}
                                {campaignPolling && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                              </CardTitle>
                              <CardDescription>{activeCampaign.totalLeads} leads · {activeCampaign.businessType} in {activeCampaign.location}</CardDescription>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => { setActiveCampaign(null); setActiveCampaignLeads([]); }}>
                              ← Back
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* Progress bar */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{activeCampaign.completedCalls} / {activeCampaign.totalLeads} calls completed</span>
                              <span>{activeCampaign.totalLeads > 0 ? Math.round((activeCampaign.completedCalls / activeCampaign.totalLeads) * 100) : 0}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-secondary overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                style={{ width: `${activeCampaign.totalLeads > 0 ? (activeCampaign.completedCalls / activeCampaign.totalLeads) * 100 : 0}%` }}
                              />
                            </div>
                          </div>

                          {/* Stats row */}
                          <div className="grid grid-cols-4 gap-3">
                            <div className="rounded-lg bg-red-500/10 p-3 text-center">
                              <p className="text-2xl font-bold text-red-400">{activeCampaign.hotLeads}</p>
                              <p className="text-xs text-red-400/70">Hot</p>
                            </div>
                            <div className="rounded-lg bg-orange-500/10 p-3 text-center">
                              <p className="text-2xl font-bold text-orange-400">{activeCampaign.warmLeads}</p>
                              <p className="text-xs text-orange-400/70">Warm</p>
                            </div>
                            <div className="rounded-lg bg-blue-500/10 p-3 text-center">
                              <p className="text-2xl font-bold text-blue-400">{activeCampaign.coldLeads}</p>
                              <p className="text-xs text-blue-400/70">Cold</p>
                            </div>
                            <div className="rounded-lg bg-zinc-500/10 p-3 text-center">
                              <p className="text-2xl font-bold text-zinc-400">{activeCampaign.notInterested}</p>
                              <p className="text-xs text-zinc-400/70">Not Interested</p>
                            </div>
                          </div>

                          {/* Controls */}
                          <div className="flex gap-3">
                            {(activeCampaign.status === "draft" || activeCampaign.status === "paused") && (
                              <Button onClick={() => updateCampaignStatus("running")} className="bg-emerald-600 hover:bg-emerald-700">
                                <Play className="h-4 w-4 mr-2" /> {activeCampaign.status === "draft" ? "Start Campaign" : "Resume"}
                              </Button>
                            )}
                            {activeCampaign.status === "running" && (
                              <Button onClick={() => updateCampaignStatus("paused")} variant="outline" className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10">
                                <Pause className="h-4 w-4 mr-2" /> Pause
                              </Button>
                            )}
                            {["running", "paused"].includes(activeCampaign.status) && (
                              <Button onClick={() => updateCampaignStatus("stopped")} variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10">
                                <Square className="h-4 w-4 mr-2" /> Stop
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Lead Dashboard */}
                      <Card className="bg-card/50 border-border">
                        <CardHeader>
                          <CardTitle className="text-base">Leads ({activeCampaignLeads.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full text-sm">
                              <thead><tr className="border-b border-border bg-muted/30">
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Business</th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Phone</th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Status</th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Classification</th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Summary</th>
                                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Duration</th>
                              </tr></thead>
                              <tbody>
                                {activeCampaignLeads.length === 0 ? (
                                  <EmptyRow cols={6} text="No leads yet" />
                                ) : (
                                  activeCampaignLeads.map((lead) => (
                                    <tr key={lead.leadId} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                                      <td className="py-3 px-3 font-medium">{lead.businessName}</td>
                                      <td className="py-3 px-3 font-mono text-xs">{lead.phoneNumber}</td>
                                      <td className="py-3 px-3">{statusBadge(lead.status)}</td>
                                      <td className="py-3 px-3">{classificationBadge(lead.classification)}</td>
                                      <td className="py-3 px-3 text-xs text-muted-foreground max-w-[300px] truncate">{lead.callSummary || "—"}</td>
                                      <td className="py-3 px-3 text-xs text-muted-foreground">{lead.callDurationSeconds ? `${lead.callDurationSeconds}s` : "—"}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </>
              )}
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
