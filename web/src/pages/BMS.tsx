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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const useCaseLabels: Record<string, string> = {
  gaming_cafe: "Gaming Cafe",
  salon: "Salon",
  clinic: "Clinic",
  retail_shop: "Retail Shop",
  unknown: "Unknown",
};

const bmsNavItems = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "phone-numbers", label: "Phone Numbers", icon: Phone },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "businesses", label: "Businesses", icon: Building2 },
  { id: "credits", label: "Credits", icon: Coins },
];

function getApiBase() {
  return (
    (import.meta as any).env?.VITE_API_BASE_URL ||
    localStorage.getItem("voxa_api_base") ||
    "https://6kbd4veax6.execute-api.us-east-1.amazonaws.com"
  );
}

function getHeaders() {
  const token = localStorage.getItem("voxa_id_token") || "";
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
  }, [activeNav, accessDenied, loading, numbersLoaded, paymentsLoaded, businessesLoaded, creditsLoaded]);

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
        </div>
      </main>
    </div>
  );
}
