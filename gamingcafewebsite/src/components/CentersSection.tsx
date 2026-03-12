import { motion } from "framer-motion";
import { MapPin, Clock, Phone, Monitor, Gamepad2, Glasses } from "lucide-react";

const centers = [
  {
    name: "M80 Downtown",
    address: "123 Gamer Street, Downtown",
    hours: "10AM – 2AM Daily",
    phone: "(555) 080-1337",
    features: ["30 PC Stations", "8 PS5 Bays", "6 Xbox Stations", "VR Zone", "Tournament Stage"],
    flagship: true,
  },
  {
    name: "M80 Westside",
    address: "456 Pixel Avenue, Westside Mall",
    hours: "11AM – Midnight Daily",
    phone: "(555) 080-1338",
    features: ["20 PC Stations", "6 PS5 Bays", "4 Xbox Stations", "Cafe Lounge"],
    flagship: false,
  },
  {
    name: "M80 University",
    address: "789 Campus Drive, University District",
    hours: "9AM – 1AM Daily",
    phone: "(555) 080-1339",
    features: ["25 PC Stations", "6 PS5 Bays", "4 Xbox Stations", "VR Zone", "Study Lounge"],
    flagship: false,
  },
  {
    name: "M80 Northgate",
    address: "321 Arena Blvd, Northgate",
    hours: "10AM – 2AM Fri–Sun, 12PM – 11PM Mon–Thu",
    phone: "(555) 080-1340",
    features: ["15 PC Stations", "4 PS5 Bays", "Private Rooms", "Streaming Studio"],
    flagship: false,
  },
];

const CentersSection = () => {
  return (
    <section id="centers" className="py-24 bg-background relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="container px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="font-body text-sm uppercase tracking-[0.3em] text-primary mb-3">Our Locations</p>
          <h2 className="font-display text-3xl md:text-5xl font-bold uppercase text-foreground">
            Find Your <span className="text-primary neon-text">Center</span>
          </h2>
          <p className="font-body text-muted-foreground mt-4 max-w-xl mx-auto">
            4 locations across the city. Each center is equipped with top-tier gaming hardware and a unique vibe.
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
              className={`relative p-6 border transition-all duration-300 hover:neon-glow ${
                center.flagship
                  ? "border-primary bg-card neon-glow md:col-span-2"
                  : "border-border bg-card hover:border-primary/30"
              }`}
            >
              {center.flagship && (
                <span className="absolute -top-3 left-6 px-3 py-1 bg-accent text-accent-foreground font-display text-[9px] font-bold uppercase tracking-widest">
                  Flagship
                </span>
              )}
              <h3 className="font-display text-xl font-bold uppercase text-foreground mb-4">{center.name}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="font-body text-sm text-muted-foreground">{center.address}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="font-body text-sm text-muted-foreground">{center.hours}</span>
                </div>
                <div className="flex items-start gap-2">
                  <Phone className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="font-body text-sm text-muted-foreground">{center.phone}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {center.features.map((f) => (
                  <span
                    key={f}
                    className="px-3 py-1 border border-border bg-secondary text-secondary-foreground font-body text-xs font-semibold uppercase tracking-wider"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CentersSection;
