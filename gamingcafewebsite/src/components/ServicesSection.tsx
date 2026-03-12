import { motion } from "framer-motion";
import { Monitor, Users, Trophy, Headphones, Wifi, Coffee } from "lucide-react";

const services = [
  { icon: Monitor, title: "High-End PCs", desc: "RTX 4080 rigs, 240Hz monitors, mechanical keyboards" },
  { icon: Trophy, title: "Tournaments", desc: "Weekly competitions with cash prizes and bragging rights" },
  { icon: Users, title: "Private Rooms", desc: "Book a room for your squad — up to 10 players" },
  { icon: Headphones, title: "Premium Gear", desc: "Top-tier peripherals from SteelSeries, Logitech & more" },
  { icon: Wifi, title: "1Gbps Internet", desc: "Dedicated fiber line with <5ms ping to game servers" },
  { icon: Coffee, title: "Cafe & Snacks", desc: "Energy drinks, coffee, and snacks to fuel your session" },
];

const ServicesSection = () => {
  return (
    <section id="services" className="py-24 bg-background relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="container px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="font-body text-sm uppercase tracking-[0.3em] text-primary mb-3">What We Offer</p>
          <h2 className="font-display text-3xl md:text-5xl font-bold uppercase text-foreground">
            Level Up Your <span className="text-primary neon-text">Game</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group p-6 border border-border bg-card hover:border-primary/40 transition-all duration-300 hover:neon-glow"
            >
              <s.icon className="h-8 w-8 text-primary mb-4 transition-transform group-hover:scale-110" />
              <h3 className="font-display text-lg font-bold uppercase text-foreground mb-2">{s.title}</h3>
              <p className="font-body text-muted-foreground leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
