import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Monitor, Gamepad2, Glasses, Users } from "lucide-react";

const categories = [
  { id: "pc", label: "PC Gaming", icon: Monitor },
  { id: "ps5", label: "PS5", icon: Gamepad2 },
  { id: "xbox", label: "Xbox Series X", icon: Gamepad2 },
  { id: "vr", label: "VR Zone", icon: Glasses },
  { id: "private", label: "Private Room", icon: Users },
];

const pricingData: Record<string, { name: string; price: string; unit: string; features: string[]; featured: boolean }[]> = {
  pc: [
    { name: "Casual", price: "$5", unit: "/hr", features: ["Standard PC station", "144Hz monitor", "Basic peripherals", "Free Wi-Fi"], featured: false },
    { name: "Pro", price: "$8", unit: "/hr", features: ["RTX 4080 rig", "240Hz monitor", "Premium peripherals", "Priority seating", "Free energy drink"], featured: true },
    { name: "Day Pass", price: "$35", unit: "/day", features: ["Unlimited PC hours", "Any available rig", "All peripherals", "Tournament entry", "Cafe credit $5"], featured: false },
    { name: "Monthly", price: "$129", unit: "/mo", features: ["Unlimited Pro PCs", "Reserved station", "All tournaments free", "Guest passes (3/mo)", "20% merch discount", "Priority booking"], featured: false },
  ],
  ps5: [
    { name: "Single", price: "$6", unit: "/hr", features: ["PS5 station", "55\" 4K TV", "DualSense controller", "Free Wi-Fi"], featured: false },
    { name: "Duo", price: "$10", unit: "/hr", features: ["PS5 station for 2", "65\" 4K TV", "2 controllers", "Couch seating", "Free snack"], featured: true },
    { name: "Day Pass", price: "$30", unit: "/day", features: ["Unlimited PS5 hours", "All games library", "Controller included", "Cafe credit $5"], featured: false },
    { name: "Monthly", price: "$89", unit: "/mo", features: ["Unlimited PS5 access", "Priority booking", "All games library", "Guest pass (2/mo)", "15% cafe discount"], featured: false },
  ],
  xbox: [
    { name: "Single", price: "$6", unit: "/hr", features: ["Xbox Series X", "55\" 4K TV", "Wireless controller", "Game Pass library"], featured: false },
    { name: "Duo", price: "$10", unit: "/hr", features: ["Xbox for 2 players", "65\" 4K TV", "2 controllers", "Game Pass Ultimate", "Couch seating"], featured: true },
    { name: "Day Pass", price: "$30", unit: "/day", features: ["Unlimited Xbox hours", "Full game library", "Controller included", "Cafe credit $5"], featured: false },
    { name: "Monthly", price: "$89", unit: "/mo", features: ["Unlimited Xbox access", "Priority booking", "Full game library", "Guest pass (2/mo)", "15% cafe discount"], featured: false },
  ],
  vr: [
    { name: "Try It", price: "$12", unit: "/30min", features: ["Meta Quest 3", "Guided experience", "Game selection", "Safety briefing"], featured: false },
    { name: "Full Session", price: "$20", unit: "/hr", features: ["Meta Quest Pro", "Full game library", "Multiplayer rooms", "Free drink", "Personal guide"], featured: true },
    { name: "Group VR", price: "$60", unit: "/hr", features: ["4 VR headsets", "Multiplayer games", "Private VR room", "Group photos", "Drinks included"], featured: false },
    { name: "Monthly", price: "$149", unit: "/mo", features: ["Unlimited VR access", "All headsets", "Priority booking", "New game early access", "Guest pass (2/mo)"], featured: false },
  ],
  private: [
    { name: "Small Room", price: "$25", unit: "/hr", features: ["Up to 4 players", "4 PC stations or consoles", "Private space", "Snack platter"], featured: false },
    { name: "Squad Room", price: "$45", unit: "/hr", features: ["Up to 6 players", "6 PC stations", "65\" spectator TV", "Drinks included", "Custom lighting"], featured: true },
    { name: "Tournament Room", price: "$80", unit: "/hr", features: ["Up to 10 players", "10 PC stations", "Stage setup", "Streaming kit", "Full catering", "Dedicated staff"], featured: false },
    { name: "Full Day Event", price: "$350", unit: "/day", features: ["Up to 10 players", "12 hours access", "Full catering", "Streaming setup", "Custom branding", "Event coordinator"], featured: false },
  ],
};

const PricingSection = () => {
  const [active, setActive] = useState("pc");
  const plans = pricingData[active];

  return (
    <section id="pricing" className="py-24 bg-card relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="container px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <p className="font-body text-sm uppercase tracking-[0.3em] text-primary mb-3">Pricing</p>
          <h2 className="font-display text-3xl md:text-5xl font-bold uppercase text-foreground">
            Choose Your <span className="text-accent neon-text-accent">Weapon</span>
          </h2>
        </motion.div>

        {/* Category tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActive(cat.id)}
              className={`flex items-center gap-2 px-5 py-2.5 font-display text-xs font-bold uppercase tracking-widest transition-all duration-300 border ${
                active === cat.id
                  ? "bg-primary text-primary-foreground border-primary neon-glow"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
              }`}
            >
              <cat.icon className="h-4 w-4" />
              {cat.label}
            </button>
          ))}
        </div>

        {/* Pricing cards */}
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto"
        >
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className={`relative flex flex-col p-6 border transition-all duration-300 ${
                plan.featured
                  ? "border-primary bg-background neon-glow-strong lg:scale-105"
                  : "border-border bg-background hover:border-primary/30 hover:neon-glow"
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground font-display text-[9px] font-bold uppercase tracking-widest whitespace-nowrap">
                  Best Value
                </span>
              )}
              <h3 className="font-display text-base font-bold uppercase text-foreground mb-3">{plan.name}</h3>
              <div className="mb-5">
                <span className="font-display text-3xl font-black text-primary">{plan.price}</span>
                <span className="font-body text-sm text-muted-foreground">{plan.unit}</span>
              </div>
              <ul className="flex-1 space-y-2.5 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 font-body text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="#contact"
                className={`inline-flex items-center justify-center py-2.5 font-display text-[10px] font-bold uppercase tracking-widest transition-all ${
                  plan.featured
                    ? "bg-primary text-primary-foreground hover:neon-glow-strong"
                    : "border border-primary/40 text-primary hover:bg-primary/10"
                }`}
              >
                Book Now
              </a>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default PricingSection;
