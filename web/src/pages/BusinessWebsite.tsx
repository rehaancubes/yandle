import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Phone, Mail, MapPin, MessageSquare,
  Gamepad2, Scissors, Stethoscope, Calendar,
  Clock, Users, Sparkles, ArrowRight,
  Monitor, Glasses, Check, Menu, X,
  Trophy, Headphones, Wifi, Coffee,
  Building2, Headset,
} from "lucide-react";
import heroBgAsset from "@/assets/hero-bg.jpg";

const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

type Machine = {
  name?: string;
  type?: string;
  count?: number;
  pricePerHour?: number;
};

type Center = {
  name: string;
  location?: string;
  machines?: Machine[];
};

type WebsiteData = {
  handle: string;
  displayName?: string;
  persona?: string;
  useCase?: string;
  useCaseId?: string;
  phoneNumber?: string;
  address?: string;
  geoLat?: number;
  geoLng?: number;
  heroTagline?: string;
  aboutText?: string;
  galleryImages?: string[];
  colorTheme?: string;
  contactEmail?: string;
  socialLinks?: Record<string, string>;
  branches?: any[];
  services?: any[];
  doctors?: any[];
  locations?: any[];
  centers?: Center[];
};

const useCaseIcons: Record<string, typeof Gamepad2> = {
  gaming_cafe: Gamepad2,
  salon: Scissors,
  clinic: Stethoscope,
  general: Building2,
  customer_support: Headset,
};

const useCaseDefaults: Record<string, { tagline: string; cta: string }> = {
  gaming_cafe: { tagline: "Level up your gaming experience", cta: "Book a Session" },
  salon: { tagline: "Your beauty, our passion", cta: "Book Appointment" },
  clinic: { tagline: "Quality healthcare, compassionate care", cta: "Book Appointment" },
  general: { tagline: "How can we help you today?", cta: "Contact Us" },
  customer_support: { tagline: "We're here to help", cta: "Get Support" },
};

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: [0.25, 0.4, 0.25, 1] },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

/* ────────────────────────────────────────────
   Color theme helpers
   ──────────────────────────────────────────── */

const COLOR_NAME_MAP: Record<string, string> = {
  indigo: "#6366f1",
  emerald: "#10b981",
  rose: "#f43f5e",
  amber: "#f59e0b",
  cyan: "#06b6d4",
  violet: "#8b5cf6",
};

function resolveThemeColor(colorTheme?: string): string {
  if (!colorTheme) return "#6366f1";
  const lower = colorTheme.toLowerCase().trim();
  if (COLOR_NAME_MAP[lower]) return COLOR_NAME_MAP[lower];
  if (lower.startsWith("#")) return lower;
  return "#6366f1";
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "99, 102, 241";
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

/* ────────────────────────────────────────────
   Machine type → icon mapping
   ──────────────────────────────────────────── */

const machineIconMap: Record<string, typeof Monitor> = {
  pc: Monitor,
  computer: Monitor,
  ps5: Gamepad2,
  ps4: Gamepad2,
  playstation: Gamepad2,
  xbox: Gamepad2,
  console: Gamepad2,
  vr: Glasses,
  "virtual reality": Glasses,
};

function getMachineIcon(type: string): typeof Monitor {
  const lower = type.toLowerCase();
  for (const [key, icon] of Object.entries(machineIconMap)) {
    if (lower.includes(key)) return icon;
  }
  return Gamepad2;
}

/* ────────────────────────────────────────────
   Animated counter (for stats)
   ──────────────────────────────────────────── */

const Counter = ({ target, suffix }: { target: number; suffix: string }) => {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    let current = 0;
    const step = Math.max(1, Math.floor(target / 40));
    const interval = setInterval(() => {
      current += step;
      if (current >= target) {
        setCount(target);
        clearInterval(interval);
      } else {
        setCount(current);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [started, target]);

  return (
    <motion.div
      onViewportEnter={() => setStarted(true)}
      viewport={{ once: true }}
      className="text-center"
    >
      <span className="font-display text-4xl md:text-5xl font-black" style={{ color: "var(--gc-primary)" }}>
        {count}{suffix}
      </span>
    </motion.div>
  );
};

/* ────────────────────────────────────────────
   Gaming Cafe Website Component
   — Matches the gamingcafewebsite/ template exactly
   ──────────────────────────────────────────── */

const gcFontsLink = "https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&display=swap";

const gcScopedCSS = `
.gc-root { --gc-bg: hsl(240 15% 5%); --gc-fg: hsl(200 20% 92%); --gc-card: hsl(240 12% 8%); --gc-border: hsl(240 10% 18%); --gc-muted: hsl(220 10% 55%); --gc-secondary: hsl(240 10% 14%); }
.gc-root * { box-sizing: border-box; }
.gc-root { font-family: 'Rajdhani', sans-serif; background: var(--gc-bg); color: var(--gc-fg); }
.gc-root h1,.gc-root h2,.gc-root h3,.gc-root h4,.gc-root h5,.gc-root h6,.gc-root .gc-font-display { font-family: 'Orbitron', sans-serif; }
.gc-root .gc-neon-glow { box-shadow: var(--gc-neon-glow); }
.gc-root .gc-neon-glow-strong { box-shadow: var(--gc-neon-glow-strong); }
.gc-root .gc-neon-text { text-shadow: 0 0 10px var(--gc-primary-alpha60), 0 0 40px var(--gc-primary-alpha30); }
.gc-root .gc-neon-text-accent { text-shadow: 0 0 10px hsl(150 100% 50% / 0.6), 0 0 40px hsl(150 100% 50% / 0.3); }
`;

const defaultServices = [
  { icon: "Monitor", title: "High-End PCs", desc: "RTX 4080 rigs, 240Hz monitors, mechanical keyboards" },
  { icon: "Trophy", title: "Tournaments", desc: "Weekly competitions with cash prizes and bragging rights" },
  { icon: "Users", title: "Private Rooms", desc: "Book a room for your squad — up to 10 players" },
  { icon: "Headphones", title: "Premium Gear", desc: "Top-tier peripherals from SteelSeries, Logitech & more" },
  { icon: "Wifi", title: "1Gbps Internet", desc: "Dedicated fiber line with <5ms ping to game servers" },
  { icon: "Coffee", title: "Cafe & Snacks", desc: "Energy drinks, coffee, and snacks to fuel your session" },
];

const serviceIconMap: Record<string, typeof Monitor> = {
  Monitor, Trophy, Users, Headphones, Wifi, Coffee, Gamepad2, Glasses,
};

const GamingCafeWebsite = ({ data }: { data: WebsiteData }) => {
  const [activePricingTab, setActivePricingTab] = useState<string>("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const themeHex = resolveThemeColor(data.colorTheme);
  const themeRgb = hexToRgb(themeHex);

  const centers = data.centers || [];
  const galleryImages = data.galleryImages || [];

  // Inject Google Fonts
  useEffect(() => {
    if (!document.querySelector(`link[href*="Orbitron"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = gcFontsLink;
      document.head.appendChild(link);
    }
  }, []);

  // Aggregate machines from all centers
  const machineAggregation: Record<string, { type: string; totalCount: number; prices: number[] }> = {};
  centers.forEach((center) => {
    (center.machines || []).forEach((m) => {
      const key = (m.name || m.type || "Unknown").toLowerCase();
      if (!machineAggregation[key]) {
        machineAggregation[key] = { type: m.name || m.type || "Unknown", totalCount: 0, prices: [] };
      }
      machineAggregation[key].totalCount += m.count || 0;
      if (m.pricePerHour) machineAggregation[key].prices.push(m.pricePerHour);
    });
  });
  const aggregatedMachines = Object.values(machineAggregation);

  // Build pricing tabs from unique machine types
  const pricingTabs = aggregatedMachines.map((m) => ({
    id: m.type.toLowerCase().replace(/\s+/g, "-"),
    label: m.type,
    icon: getMachineIcon(m.type),
  }));

  useEffect(() => {
    if (pricingTabs.length > 0 && !activePricingTab) {
      setActivePricingTab(pricingTabs[0].id);
    }
  }, [pricingTabs, activePricingTab]);

  // Stats
  const totalStations = aggregatedMachines.reduce((sum, m) => sum + m.totalCount, 0);
  const stats = [
    { value: totalStations || 90, suffix: "+", label: "Gaming Stations" },
    { value: centers.length || 4, suffix: "", label: centers.length === 1 ? "Location" : "Locations" },
    { value: aggregatedMachines.length || 5, suffix: "", label: "Machine Types" },
  ];

  // Build pricing per tab
  const getPricingForTab = (tabId: string) => {
    const machineType = aggregatedMachines.find(
      (m) => m.type.toLowerCase().replace(/\s+/g, "-") === tabId
    );
    if (!machineType) return [];
    const items: { centerName: string; count: number; pricePerHour: number }[] = [];
    centers.forEach((center) => {
      (center.machines || []).forEach((m) => {
        const key = (m.name || m.type || "").toLowerCase();
        if (key === machineType.type.toLowerCase() && m.pricePerHour) {
          items.push({ centerName: center.name, count: m.count || 0, pricePerHour: m.pricePerHour });
        }
      });
    });
    return items;
  };

  const neonGlow = `0 0 20px rgba(${themeRgb}, 0.4), 0 0 60px rgba(${themeRgb}, 0.15)`;
  const neonGlowStrong = `0 0 20px rgba(${themeRgb}, 0.6), 0 0 80px rgba(${themeRgb}, 0.3), 0 0 120px rgba(${themeRgb}, 0.1)`;
  const neonText = `0 0 10px rgba(${themeRgb}, 0.6), 0 0 40px rgba(${themeRgb}, 0.3)`;
  const gradientLine = `linear-gradient(to right, transparent, rgba(${themeRgb}, 0.3), transparent)`;
  const displayName = data.displayName || data.handle;
  const navItems = ["About", "Gallery", "Pricing", "Centers", "Contact"];

  return (
    <div
      className="gc-root min-h-screen"
      style={{
        "--gc-primary": themeHex,
        "--gc-primary-rgb": themeRgb,
        "--gc-primary-alpha60": `rgba(${themeRgb}, 0.6)`,
        "--gc-primary-alpha30": `rgba(${themeRgb}, 0.3)`,
        "--gc-neon-glow": neonGlow,
        "--gc-neon-glow-strong": neonGlowStrong,
        fontFamily: "'Rajdhani', sans-serif",
      } as React.CSSProperties}
    >
      <style>{gcScopedCSS}</style>

      {/* ── Navbar ── */}
      <motion.nav
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="fixed top-0 left-0 right-0 z-50 border-b bg-[hsl(240,15%,5%)]/80 backdrop-blur-xl"
        style={{ borderColor: "hsl(240 10% 18%)" }}
      >
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <a href="#" className="flex items-center gap-2">
            <Gamepad2 className="h-10 w-10" style={{ color: themeHex }} />
            <span
              className="gc-font-display text-lg font-bold tracking-wider uppercase gc-neon-text"
              style={{ fontFamily: "'Orbitron', sans-serif", color: themeHex }}
            >
              {displayName}
            </span>
          </a>

          <ul className="hidden lg:flex items-center gap-8">
            {navItems.map((item) => (
              <li key={item}>
                <a
                  href={`#${item.toLowerCase()}`}
                  className="text-sm font-semibold uppercase tracking-widest transition-colors hover:text-white"
                  style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(220 10% 55%)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = themeHex)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "hsl(220 10% 55%)")}
                >
                  {item}
                </a>
              </li>
            ))}
          </ul>

          <button
            onClick={() => window.open(`/shareable/${data.handle}`, "_blank")}
            className="hidden lg:inline-flex items-center px-5 py-2 text-xs font-bold uppercase tracking-widest text-white transition-shadow"
            style={{ fontFamily: "'Orbitron', sans-serif", backgroundColor: themeHex, boxShadow: neonGlow }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = neonGlowStrong)}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = neonGlow)}
          >
            Book Now
          </button>

          <button className="lg:hidden text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="lg:hidden border-t bg-[hsl(240,15%,5%)]/95 backdrop-blur-xl"
            style={{ borderColor: "hsl(240 10% 18%)" }}
          >
            <ul className="flex flex-col items-center gap-4 py-6">
              {navItems.map((item) => (
                <li key={item}>
                  <a
                    href={`#${item.toLowerCase()}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-base font-semibold uppercase tracking-widest hover:text-white"
                    style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(220 10% 55%)" }}
                  >
                    {item}
                  </a>
                </li>
              ))}
              <button
                onClick={() => { setMobileMenuOpen(false); window.open(`/shareable/${data.handle}`, "_blank"); }}
                className="mt-2 px-6 py-2 text-xs font-bold uppercase tracking-widest text-white"
                style={{ fontFamily: "'Orbitron', sans-serif", backgroundColor: themeHex, boxShadow: neonGlow }}
              >
                Book Now
              </button>
            </ul>
          </motion.div>
        )}
      </motion.nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBgAsset} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[hsl(240,15%,5%)]/70" />
          <div className="absolute inset-0 bg-gradient-to-t from-[hsl(240,15%,5%)] via-[hsl(240,15%,5%)]/40 to-transparent" />
        </div>

        <div
          className="absolute top-0 left-1/4 w-px h-full animate-pulse"
          style={{ background: `linear-gradient(to bottom, transparent, rgba(${themeRgb}, 0.2), transparent)` }}
        />
        <div
          className="absolute top-0 right-1/3 w-px h-full animate-pulse"
          style={{ background: `linear-gradient(to bottom, transparent, rgba(${themeRgb}, 0.1), transparent)`, animationDelay: "1.5s" }}
        />

        <div className="relative z-10 container mx-auto text-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <p className="text-sm md:text-base font-semibold uppercase tracking-[0.3em] mb-4" style={{ fontFamily: "'Rajdhani', sans-serif", color: themeHex }}>
              Welcome to the Arena
            </p>
            <h1
              className="text-5xl md:text-7xl lg:text-8xl font-black uppercase leading-none mb-6"
              style={{ fontFamily: "'Orbitron', sans-serif", color: "hsl(200 20% 92%)" }}
            >
              {displayName.split(" ").map((word, i) => (
                <span key={i}>
                  {i > 0 && " "}
                  {i === displayName.split(" ").length - 1
                    ? <span className="gc-neon-text" style={{ color: themeHex }}>{word}</span>
                    : word}
                </span>
              ))}
            </h1>
            <p className="text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed" style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(220 10% 55%)" }}>
              {data.heroTagline || "Premium gaming cafe with high-end rigs, competitive tournaments, and an elite gaming community. Level up your experience."}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <a
              href="#pricing"
              className="inline-flex items-center justify-center px-8 py-3 text-sm font-bold uppercase tracking-widest text-white transition-shadow"
              style={{ fontFamily: "'Orbitron', sans-serif", backgroundColor: themeHex, boxShadow: neonGlow }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = neonGlowStrong)}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = neonGlow)}
            >
              View Pricing
            </a>
            <a
              href="#about"
              className="inline-flex items-center justify-center px-8 py-3 text-sm font-bold uppercase tracking-widest border transition-colors"
              style={{ fontFamily: "'Orbitron', sans-serif", borderColor: `rgba(${themeRgb}, 0.4)`, color: themeHex }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `rgba(${themeRgb}, 0.1)`)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              Explore
            </a>
          </motion.div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-16 relative border-y" style={{ backgroundColor: "hsl(240 15% 5%)", borderColor: "hsl(240 10% 18%)" }}>
        <div className="container mx-auto px-4">
          <div className={`grid grid-cols-2 ${stats.length >= 4 ? "md:grid-cols-4" : "md:grid-cols-3"} gap-8`}>
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <Counter target={stat.value} suffix={stat.suffix} />
                <p className="text-xs font-bold uppercase tracking-widest mt-2" style={{ fontFamily: "'Orbitron', sans-serif", color: "hsl(220 10% 55%)" }}>
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Services ── */}
      <section id="about" className="py-24 relative" style={{ backgroundColor: "hsl(240 15% 5%)" }}>
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: gradientLine }} />
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <p className="text-sm uppercase tracking-[0.3em] mb-3" style={{ fontFamily: "'Rajdhani', sans-serif", color: themeHex }}>What We Offer</p>
            <h2 className="text-3xl md:text-5xl font-bold uppercase" style={{ fontFamily: "'Orbitron', sans-serif", color: "hsl(200 20% 92%)" }}>
              Level Up Your <span className="gc-neon-text" style={{ color: themeHex }}>Game</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {defaultServices.map((s, i) => {
              const SIcon = serviceIconMap[s.icon] || Gamepad2;
              return (
                <motion.div
                  key={s.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="group p-6 border transition-all duration-300"
                  style={{ borderColor: "hsl(240 10% 18%)", backgroundColor: "hsl(240 12% 8%)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = `rgba(${themeRgb}, 0.4)`; e.currentTarget.style.boxShadow = neonGlow; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "hsl(240 10% 18%)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <SIcon className="h-8 w-8 mb-4 transition-transform group-hover:scale-110" style={{ color: themeHex }} />
                  <h3 className="text-lg font-bold uppercase mb-2" style={{ fontFamily: "'Orbitron', sans-serif", color: "hsl(200 20% 92%)" }}>{s.title}</h3>
                  <p className="leading-relaxed" style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(220 10% 55%)" }}>{s.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Gallery ── */}
      {galleryImages.length > 0 && (
        <section id="gallery" className="py-24 relative" style={{ backgroundColor: "hsl(240 12% 8%)" }}>
          <div className="absolute top-0 left-0 right-0 h-px" style={{ background: gradientLine }} />
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16"
            >
              <p className="text-sm uppercase tracking-[0.3em] mb-3" style={{ fontFamily: "'Rajdhani', sans-serif", color: themeHex }}>Gallery</p>
              <h2 className="text-3xl md:text-5xl font-bold uppercase" style={{ fontFamily: "'Orbitron', sans-serif", color: "hsl(200 20% 92%)" }}>
                Inside The <span className="gc-neon-text" style={{ color: themeHex }}>Arena</span>
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {galleryImages.map((url, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="group relative overflow-hidden border transition-all duration-300"
                  style={{ borderColor: "hsl(240 10% 18%)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = `rgba(${themeRgb}, 0.4)`)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "hsl(240 10% 18%)")}
                >
                  <img src={url} alt={`Gallery ${i + 1}`} className="w-full h-64 object-cover transition-transform duration-500 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[hsl(240,15%,5%)] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                    <span className="gc-neon-text text-sm font-bold uppercase tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif", color: themeHex }}>
                      Gallery {i + 1}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Pricing ── */}
      {pricingTabs.length > 0 && (
        <section id="pricing" className="py-24 relative" style={{ backgroundColor: "hsl(240 12% 8%)" }}>
          <div className="absolute top-0 left-0 right-0 h-px" style={{ background: gradientLine }} />
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <p className="text-sm uppercase tracking-[0.3em] mb-3" style={{ fontFamily: "'Rajdhani', sans-serif", color: themeHex }}>Pricing</p>
              <h2 className="text-3xl md:text-5xl font-bold uppercase" style={{ fontFamily: "'Orbitron', sans-serif", color: "hsl(200 20% 92%)" }}>
                Choose Your <span className="gc-neon-text-accent" style={{ color: "hsl(150 100% 50%)" }}>Weapon</span>
              </h2>
            </motion.div>

            <div className="flex flex-wrap justify-center gap-2 mb-12">
              {pricingTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActivePricingTab(tab.id)}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-widest transition-all duration-300 border"
                  style={{
                    fontFamily: "'Orbitron', sans-serif",
                    ...(activePricingTab === tab.id
                      ? { backgroundColor: themeHex, color: "hsl(240 15% 5%)", borderColor: themeHex, boxShadow: neonGlow }
                      : { borderColor: "hsl(240 10% 18%)", color: "hsl(220 10% 55%)" }),
                  }}
                  onMouseEnter={(e) => { if (activePricingTab !== tab.id) { e.currentTarget.style.borderColor = `rgba(${themeRgb}, 0.4)`; e.currentTarget.style.color = themeHex; }}}
                  onMouseLeave={(e) => { if (activePricingTab !== tab.id) { e.currentTarget.style.borderColor = "hsl(240 10% 18%)"; e.currentTarget.style.color = "hsl(220 10% 55%)"; }}}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            <motion.div
              key={activePricingTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto"
            >
              {getPricingForTab(activePricingTab).map((item, i) => (
                <motion.div
                  key={`${item.centerName}-${i}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className="relative flex flex-col p-6 border transition-all duration-300"
                  style={{ borderColor: "hsl(240 10% 18%)", backgroundColor: "hsl(240 15% 5%)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = `rgba(${themeRgb}, 0.3)`; e.currentTarget.style.boxShadow = neonGlow; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "hsl(240 10% 18%)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <h3 className="text-base font-bold uppercase mb-3" style={{ fontFamily: "'Orbitron', sans-serif", color: "hsl(200 20% 92%)" }}>
                    {item.centerName}
                  </h3>
                  <div className="mb-5">
                    <span className="text-3xl font-black" style={{ fontFamily: "'Orbitron', sans-serif", color: themeHex }}>
                      {"\u20B9"}{item.pricePerHour}
                    </span>
                    <span className="text-sm" style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(220 10% 55%)" }}>/hr</span>
                  </div>
                  <ul className="flex-1 space-y-2.5 mb-6">
                    <li className="flex items-start gap-2 text-sm" style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(220 10% 55%)" }}>
                      <Check className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: themeHex }} />
                      {item.count} station{item.count !== 1 ? "s" : ""} available
                    </li>
                    <li className="flex items-start gap-2 text-sm" style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(220 10% 55%)" }}>
                      <Check className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: themeHex }} />
                      Premium peripherals
                    </li>
                    <li className="flex items-start gap-2 text-sm" style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(220 10% 55%)" }}>
                      <Check className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: themeHex }} />
                      Free Wi-Fi
                    </li>
                  </ul>
                  <button
                    onClick={() => window.open(`/shareable/${data.handle}`, "_blank")}
                    className="inline-flex items-center justify-center py-2.5 text-[10px] font-bold uppercase tracking-widest border transition-all"
                    style={{ fontFamily: "'Orbitron', sans-serif", borderColor: `rgba(${themeRgb}, 0.4)`, color: themeHex }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `rgba(${themeRgb}, 0.1)`)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    Book Now
                  </button>
                </motion.div>
              ))}
              {getPricingForTab(activePricingTab).length === 0 && (
                <div className="col-span-full text-center py-12" style={{ color: "hsl(220 10% 55%)" }}>
                  No pricing data available for this machine type.
                </div>
              )}
            </motion.div>
          </div>
        </section>
      )}

      {/* ── Centers ── */}
      {centers.length > 0 && (
        <section id="centers" className="py-24 relative" style={{ backgroundColor: "hsl(240 15% 5%)" }}>
          <div className="absolute top-0 left-0 right-0 h-px" style={{ background: gradientLine }} />
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16"
            >
              <p className="text-sm uppercase tracking-[0.3em] mb-3" style={{ fontFamily: "'Rajdhani', sans-serif", color: themeHex }}>Our Locations</p>
              <h2 className="text-3xl md:text-5xl font-bold uppercase" style={{ fontFamily: "'Orbitron', sans-serif", color: "hsl(200 20% 92%)" }}>
                Find Your <span className="gc-neon-text" style={{ color: themeHex }}>Center</span>
              </h2>
              <p className="mt-4 max-w-xl mx-auto" style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(220 10% 55%)" }}>
                {centers.length} location{centers.length !== 1 ? "s" : ""}. Each center is equipped with top-tier gaming hardware.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
              {centers.map((center, i) => (
                <motion.div
                  key={center.name}
                  initial={{ opacity: 0, y: 25 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className={`relative p-6 border transition-all duration-300 ${i === 0 && centers.length > 2 ? "md:col-span-2" : ""}`}
                  style={{
                    borderColor: i === 0 ? `rgba(${themeRgb}, 0.3)` : "hsl(240 10% 18%)",
                    backgroundColor: "hsl(240 12% 8%)",
                    boxShadow: i === 0 ? neonGlow : "none",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = neonGlow; e.currentTarget.style.borderColor = `rgba(${themeRgb}, 0.4)`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = i === 0 ? neonGlow : "none"; e.currentTarget.style.borderColor = i === 0 ? `rgba(${themeRgb}, 0.3)` : "hsl(240 10% 18%)"; }}
                >
                  {i === 0 && centers.length > 1 && (
                    <span
                      className="absolute -top-3 left-6 px-3 py-1 text-[9px] font-bold uppercase tracking-widest"
                      style={{ fontFamily: "'Orbitron', sans-serif", backgroundColor: "hsl(150 100% 50%)", color: "hsl(240 15% 5%)" }}
                    >
                      Flagship
                    </span>
                  )}
                  <h3 className="text-xl font-bold uppercase mb-4" style={{ fontFamily: "'Orbitron', sans-serif", color: "hsl(200 20% 92%)" }}>
                    {center.name}
                  </h3>
                  {center.location && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: themeHex }} />
                        <span className="text-sm" style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(220 10% 55%)" }}>{center.location}</span>
                      </div>
                    </div>
                  )}
                  {(center.machines || []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {center.machines!.map((m, mIdx) => (
                        <span
                          key={mIdx}
                          className="px-3 py-1 border text-xs font-semibold uppercase tracking-wider"
                          style={{ fontFamily: "'Rajdhani', sans-serif", borderColor: "hsl(240 10% 18%)", backgroundColor: "hsl(240 10% 14%)", color: "hsl(200 20% 92%)" }}
                        >
                          {m.count}x {m.name || m.type}{m.pricePerHour ? ` \u00B7 \u20B9${m.pricePerHour}/hr` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA ── */}
      <section className="py-24 relative overflow-hidden" style={{ backgroundColor: "hsl(240 12% 8%)" }}>
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: gradientLine }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px]" style={{ backgroundColor: `rgba(${themeRgb}, 0.05)` }} />
        <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full blur-[80px]" style={{ backgroundColor: "hsla(150, 100%, 50%, 0.05)" }} />

        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <p className="text-sm uppercase tracking-[0.3em] mb-3" style={{ fontFamily: "'Rajdhani', sans-serif", color: themeHex }}>Ready to Play?</p>
            <h2 className="text-3xl md:text-5xl font-bold uppercase mb-6" style={{ fontFamily: "'Orbitron', sans-serif", color: "hsl(200 20% 92%)" }}>
              Your Next <span className="gc-neon-text" style={{ color: themeHex }}>Victory</span> Starts Here
            </h2>
            <p className="text-lg mb-10 leading-relaxed" style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(220 10% 55%)" }}>
              Walk in or book ahead. Bring your crew, dominate the leaderboard, and become part of the {displayName} community.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => window.open(`/shareable/${data.handle}`, "_blank")}
                className="inline-flex items-center justify-center px-10 py-4 text-sm font-bold uppercase tracking-widest text-white transition-shadow"
                style={{ fontFamily: "'Orbitron', sans-serif", backgroundColor: themeHex, boxShadow: neonGlow }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = neonGlowStrong)}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = neonGlow)}
              >
                Book a Session
              </button>
              <button
                onClick={() => window.open(`/shareable/${data.handle}`, "_blank")}
                className="inline-flex items-center justify-center px-10 py-4 text-sm font-bold uppercase tracking-widest border transition-colors"
                style={{ fontFamily: "'Orbitron', sans-serif", borderColor: `rgba(${themeRgb}, 0.4)`, color: themeHex }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `rgba(${themeRgb}, 0.1)`)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                Find a Center
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Contact ── */}
      <section id="contact" className="py-24 relative" style={{ backgroundColor: "hsl(240 15% 5%)" }}>
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: gradientLine }} />
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <p className="text-sm uppercase tracking-[0.3em] mb-3" style={{ fontFamily: "'Rajdhani', sans-serif", color: themeHex }}>Find Us</p>
            <h2 className="text-3xl md:text-5xl font-bold uppercase" style={{ fontFamily: "'Orbitron', sans-serif", color: "hsl(200 20% 92%)" }}>
              Visit The <span className="gc-neon-text" style={{ color: themeHex }}>Arena</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {data.address && (
              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
                className="text-center p-6 border transition-colors" style={{ borderColor: "hsl(240 10% 18%)", backgroundColor: "hsl(240 12% 8%)" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = `rgba(${themeRgb}, 0.3)`)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "hsl(240 10% 18%)")}
              >
                <MapPin className="h-6 w-6 mx-auto mb-3" style={{ color: themeHex }} />
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ fontFamily: "'Orbitron', sans-serif", color: "hsl(220 10% 55%)" }}>Location</p>
                <p className="text-sm" style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(200 20% 92%)" }}>{data.address}</p>
              </motion.div>
            )}
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 }}
              className="text-center p-6 border transition-colors" style={{ borderColor: "hsl(240 10% 18%)", backgroundColor: "hsl(240 12% 8%)" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = `rgba(${themeRgb}, 0.3)`)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "hsl(240 10% 18%)")}
            >
              <Clock className="h-6 w-6 mx-auto mb-3" style={{ color: themeHex }} />
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ fontFamily: "'Orbitron', sans-serif", color: "hsl(220 10% 55%)" }}>Hours</p>
              <p className="text-sm" style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(200 20% 92%)" }}>Open Daily</p>
            </motion.div>
            {data.phoneNumber && (
              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.2 }}
                className="text-center p-6 border transition-colors" style={{ borderColor: "hsl(240 10% 18%)", backgroundColor: "hsl(240 12% 8%)" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = `rgba(${themeRgb}, 0.3)`)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "hsl(240 10% 18%)")}
              >
                <Phone className="h-6 w-6 mx-auto mb-3" style={{ color: themeHex }} />
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ fontFamily: "'Orbitron', sans-serif", color: "hsl(220 10% 55%)" }}>Phone</p>
                <a href={`tel:${data.phoneNumber}`} className="text-sm hover:underline" style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(200 20% 92%)" }}>{data.phoneNumber}</a>
              </motion.div>
            )}
            {data.contactEmail && (
              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.3 }}
                className="text-center p-6 border transition-colors" style={{ borderColor: "hsl(240 10% 18%)", backgroundColor: "hsl(240 12% 8%)" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = `rgba(${themeRgb}, 0.3)`)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "hsl(240 10% 18%)")}
              >
                <Mail className="h-6 w-6 mx-auto mb-3" style={{ color: themeHex }} />
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ fontFamily: "'Orbitron', sans-serif", color: "hsl(220 10% 55%)" }}>Email</p>
                <a href={`mailto:${data.contactEmail}`} className="text-sm hover:underline" style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(200 20% 92%)" }}>{data.contactEmail}</a>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 border-t" style={{ borderColor: "hsl(240 10% 18%)", backgroundColor: "hsl(240 12% 8%)" }}>
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-8 w-8" style={{ color: themeHex }} />
            <span className="text-sm font-bold tracking-wider uppercase" style={{ fontFamily: "'Orbitron', sans-serif", color: themeHex }}>
              {displayName}
            </span>
          </div>
          <p className="text-sm" style={{ fontFamily: "'Rajdhani', sans-serif", color: "hsl(220 10% 55%)" }}>
            Powered by{" "}
            <a href="/" className="font-semibold hover:underline" style={{ color: themeHex }}>
              YANDLE
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};

/* ────────────────────────────────────────────
   Main BusinessWebsite Component
   ──────────────────────────────────────────── */

const BusinessWebsite = () => {
  const { handle } = useParams();
  const navigate = useNavigate();
  const safeHandle = (handle || "").toLowerCase().replace(/[^a-z0-9-]/g, "") || "demo";
  const [data, setData] = useState<WebsiteData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apiBase) {
      navigate("/", { replace: true });
      return;
    }
    (async () => {
      try {
        const resp = await fetch(`${apiBase}/website/public/${encodeURIComponent(safeHandle)}`);
        if (!resp.ok) {
          navigate("/", { replace: true });
          return;
        }
        const json = await resp.json();
        // Redirect to shareable link if website is disabled
        if (json.profile?.websiteEnabled === false || json.websiteEnabled === false) {
          navigate(`/shareable/${safeHandle}`, { replace: true });
          return;
        }
        setData({ handle: safeHandle, ...json });
      } catch {
        navigate("/", { replace: true });
        return;
      }
      setLoading(false);
    })();
  }, [safeHandle, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (!data) return null;

  const useCase = data.useCase || data.useCaseId || "salon";

  /* ── Gaming cafe gets its own dedicated template ── */
  if (useCase === "gaming_cafe") {
    return <GamingCafeWebsite data={data} />;
  }

  /* ── Generic template for salon, clinic, retail_shop, etc. ── */
  const Icon = useCaseIcons[useCase] || Sparkles;
  const defaults = useCaseDefaults[useCase] || useCaseDefaults.salon;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <span className="font-display text-lg font-semibold text-foreground">
              {data.displayName || data.handle}
            </span>
          </div>
          <button
            onClick={() => window.open(`/shareable/${data.handle}`, "_blank")}
            className="glow-primary rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-all hover:scale-105"
          >
            {defaults.cta}
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-16 overflow-hidden">
        <div className="absolute inset-0 bg-radial-glow" />
        <div className="absolute inset-0 bg-grid opacity-20" />

        <div className="relative z-10 container mx-auto px-6 py-28 text-center">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
          >
            <motion.div variants={fadeUp} custom={0} className="mb-6">
              <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
                <Icon className="h-3.5 w-3.5" />
                {useCase.replace(/_/g, " ")}
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              custom={1}
              className="font-display text-5xl md:text-7xl font-bold leading-tight tracking-tight"
            >
              <span className="text-gradient-primary glow-text">
                {data.displayName || data.handle}
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              custom={2}
              className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
            >
              {data.heroTagline || defaults.tagline}
            </motion.p>

            <motion.div
              variants={fadeUp}
              custom={3}
              className="mt-10 flex flex-col sm:flex-row justify-center gap-4"
            >
              <button
                onClick={() => window.open(`/shareable/${data.handle}`, "_blank")}
                className="glow-primary inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground transition-all hover:scale-105"
              >
                <Calendar className="h-5 w-5" />
                {defaults.cta}
              </button>
              {data.phoneNumber && (
                <a
                  href={`tel:${data.phoneNumber}`}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card/50 backdrop-blur-sm px-8 py-3.5 text-base font-semibold text-foreground transition-all hover:border-glow hover:scale-105"
                >
                  <Phone className="h-5 w-5" />
                  Call Us
                </a>
              )}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── About ── */}
      {data.aboutText && (
        <section className="relative py-28">
          <div className="absolute inset-0 bg-radial-glow opacity-30" />
          <div className="relative container mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={stagger}
              className="max-w-3xl mx-auto text-center"
            >
              <motion.p variants={fadeUp} custom={0} className="text-xs font-semibold uppercase tracking-widest text-primary mb-4">
                About Us
              </motion.p>
              <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl md:text-4xl font-bold mb-8">
                <span className="text-gradient-primary">Who We Are</span>
              </motion.h2>
              <motion.p variants={fadeUp} custom={2} className="text-muted-foreground text-lg leading-relaxed">
                {data.aboutText}
              </motion.p>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── Services (salon / clinic) ── */}
      {(data.services || []).length > 0 && (
        <section className="relative py-28">
          <div className="container mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={stagger}
            >
              <motion.p variants={fadeUp} custom={0} className="text-xs font-semibold uppercase tracking-widest text-primary mb-4 text-center">
                Services
              </motion.p>
              <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl md:text-4xl font-bold text-center mb-12">
                <span className="text-gradient-primary">What We Offer</span>
              </motion.h2>
              <motion.div variants={stagger} className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
                {(data.services || []).map((s: any, idx: number) => (
                  <motion.div
                    key={idx}
                    variants={fadeUp}
                    custom={idx}
                    className="group rounded-2xl border border-border bg-card/30 backdrop-blur-sm p-6 hover:border-glow transition-all duration-300"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-display font-semibold text-lg text-foreground">{s.name}</h3>
                        {s.durationMinutes && (
                          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" /> {s.durationMinutes} min
                          </p>
                        )}
                      </div>
                      {s.priceCents != null && (
                        <span className="text-primary font-display font-bold text-lg whitespace-nowrap">
                          {"\u20B9"}{(s.priceCents / 100).toFixed(0)}
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── Gaming Centers ── */}
      {(data.centers || []).length > 0 && (
        <section className="relative py-28">
          <div className="container mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={stagger}
            >
              <motion.p variants={fadeUp} custom={0} className="text-xs font-semibold uppercase tracking-widest text-primary mb-4 text-center">
                Gaming Centers
              </motion.p>
              <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl md:text-4xl font-bold text-center mb-12">
                <span className="text-gradient-primary">Our Setups</span>
              </motion.h2>
              <motion.div variants={stagger} className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                {(data.centers || []).map((center: any, idx: number) => (
                  <motion.div
                    key={idx}
                    variants={fadeUp}
                    custom={idx}
                    className="rounded-2xl border border-border bg-card/30 backdrop-blur-sm p-7 hover:border-glow transition-all duration-300"
                  >
                    <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <Gamepad2 className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-display font-semibold text-xl text-foreground mb-2">{center.name}</h3>
                    {center.location && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mb-4">
                        <MapPin className="h-3.5 w-3.5" /> {center.location}
                      </p>
                    )}
                    {(center.machines || []).length > 0 && (
                      <ul className="space-y-2 pt-3 border-t border-border">
                        {center.machines.map((m: any, mIdx: number) => (
                          <li key={mIdx} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{m.name || m.type}</span>
                            <span className="text-primary font-medium">{m.count}x {m.pricePerHour ? `\u00B7 \u20B9${m.pricePerHour}/hr` : ""}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── Doctors (clinic) ── */}
      {(data.doctors || []).length > 0 && (
        <section className="relative py-28">
          <div className="absolute inset-0 bg-radial-glow opacity-20" />
          <div className="relative container mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={stagger}
            >
              <motion.p variants={fadeUp} custom={0} className="text-xs font-semibold uppercase tracking-widest text-primary mb-4 text-center">
                Our Team
              </motion.p>
              <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl md:text-4xl font-bold text-center mb-12">
                <span className="text-gradient-primary">Meet Our Doctors</span>
              </motion.h2>
              <motion.div variants={stagger} className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                {(data.doctors || []).map((d: any, idx: number) => (
                  <motion.div
                    key={idx}
                    variants={fadeUp}
                    custom={idx}
                    className="rounded-2xl border border-border bg-card/30 backdrop-blur-sm p-7 text-center hover:border-glow transition-all duration-300"
                  >
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <Stethoscope className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-display font-semibold text-lg text-foreground">{d.name}</h3>
                    {d.specialty && <p className="text-sm text-primary mt-1">{d.specialty}</p>}
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── Branches / Locations ── */}
      {((data.branches || []).length > 0 || (data.locations || []).length > 0) && (
        <section className="relative py-28">
          <div className="container mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={stagger}
            >
              <motion.p variants={fadeUp} custom={0} className="text-xs font-semibold uppercase tracking-widest text-primary mb-4 text-center">
                Locations
              </motion.p>
              <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl md:text-4xl font-bold text-center mb-12">
                <span className="text-gradient-primary">Find Us</span>
              </motion.h2>
              <motion.div variants={stagger} className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                {[...(data.branches || []), ...(data.locations || [])].map((loc: any, idx: number) => (
                  <motion.div
                    key={idx}
                    variants={fadeUp}
                    custom={idx}
                    className="rounded-2xl border border-border bg-card/30 backdrop-blur-sm p-7 hover:border-glow transition-all duration-300"
                  >
                    <div className="flex items-start gap-4">
                      <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <MapPin className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-display font-semibold text-lg text-foreground">{loc.name}</h3>
                        {(loc.location || loc.address) && (
                          <p className="text-sm text-muted-foreground mt-1">{loc.location || loc.address}</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── Gallery ── */}
      {(data.galleryImages || []).length > 0 && (
        <section className="relative py-28">
          <div className="absolute inset-0 bg-radial-glow opacity-20" />
          <div className="relative container mx-auto px-6">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={stagger}
            >
              <motion.p variants={fadeUp} custom={0} className="text-xs font-semibold uppercase tracking-widest text-primary mb-4 text-center">
                Gallery
              </motion.p>
              <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl md:text-4xl font-bold text-center mb-12">
                <span className="text-gradient-primary">Take a Look</span>
              </motion.h2>
              <motion.div variants={stagger} className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
                {(data.galleryImages || []).map((url, idx) => (
                  <motion.div
                    key={idx}
                    variants={fadeUp}
                    custom={idx}
                    className="aspect-square rounded-2xl overflow-hidden border border-border hover:border-glow transition-all duration-300"
                  >
                    <img
                      src={url}
                      alt={`Gallery ${idx + 1}`}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                    />
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── CTA Section ── */}
      <section className="relative py-28">
        <div className="absolute inset-0 bg-radial-glow" />
        <div className="absolute inset-0 bg-grid opacity-10" />
        <div className="relative container mx-auto px-6 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
          >
            <motion.h2 variants={fadeUp} custom={0} className="font-display text-4xl md:text-5xl font-bold mb-6">
              <span className="text-gradient-primary glow-text">Ready to get started?</span>
            </motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-muted-foreground text-lg max-w-xl mx-auto mb-10">
              {useCase === "clinic"
                ? "Schedule your appointment with our expert team today."
                : "Book your appointment and let us take care of you."}
            </motion.p>
            <motion.div variants={fadeUp} custom={2} className="flex flex-col sm:flex-row justify-center gap-4">
              <button
                onClick={() => window.open(`/shareable/${data.handle}`, "_blank")}
                className="glow-primary inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground transition-all hover:scale-105"
              >
                <Calendar className="h-5 w-5" />
                {defaults.cta}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => window.open(`/shareable/${data.handle}`, "_blank")}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card/50 backdrop-blur-sm px-8 py-3.5 text-base font-semibold text-foreground transition-all hover:border-glow hover:scale-105"
              >
                <MessageSquare className="h-5 w-5" />
                Chat with Us
              </button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Contact Footer ── */}
      <footer className="border-t border-border py-14">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <span className="font-display text-lg font-semibold text-gradient-primary">
                {data.displayName || data.handle}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6">
              {data.phoneNumber && (
                <a href={`tel:${data.phoneNumber}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
                  <Phone className="h-4 w-4" /> {data.phoneNumber}
                </a>
              )}
              {data.contactEmail && (
                <a href={`mailto:${data.contactEmail}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
                  <Mail className="h-4 w-4" /> {data.contactEmail}
                </a>
              )}
              {data.address && (
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <MapPin className="h-4 w-4" /> {data.address}
                </span>
              )}
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-border text-center">
            <p className="text-xs text-muted-foreground">
              Powered by{" "}
              <a href="/" className="text-gradient-primary font-semibold hover:underline">
                CallCentral
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default BusinessWebsite;
