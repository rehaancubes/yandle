import { motion } from "framer-motion";
import { Video, Briefcase, GraduationCap, Code, Globe, Stethoscope, ShoppingBag, Scissors } from "lucide-react";

const individualCases = [
  { icon: Video, title: "Creators", desc: "Handle brand inquiries, sponsorships, and collabs through your AI." },
  { icon: Briefcase, title: "Freelancers", desc: "Qualify leads, collect requirements, and book calls automatically." },
  { icon: GraduationCap, title: "Coaches", desc: "Explain packages, pre-qualify clients, and book paid sessions." },
  { icon: Code, title: "Developers", desc: "Share services, gather technical needs, and route serious leads." },
];

const businessCases = [
  { icon: Stethoscope, title: "Clinics", desc: "AI receptionist handles appointment booking and patient intake." },
  { icon: Scissors, title: "Salons", desc: "Schedule appointments, answer service questions, collect preferences." },
  { icon: ShoppingBag, title: "E-commerce", desc: "Product recommendations, order support, and returns handling." },
  { icon: Globe, title: "Agencies", desc: "Qualify prospects, explain services, and route to the right team." },
];

const UseCasesSection = () => {
  return (
    <section id="use-cases" className="relative py-28">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">
            Use Cases
          </span>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Built for everyone.
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Whether you're a solo creator or a global brand, VOXA makes you conversationally accessible.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
          {/* Individuals */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="h-8 w-1 rounded-full bg-primary" />
              <h3 className="font-display text-2xl font-semibold">For Individuals</h3>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {individualCases.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-border bg-card/30 p-5 hover:border-glow transition-all duration-300"
                >
                  <item.icon className="h-5 w-5 text-primary mb-3" />
                  <h4 className="font-display font-semibold mb-1.5">{item.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Businesses */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="h-8 w-1 rounded-full bg-primary" />
              <h3 className="font-display text-2xl font-semibold">For Businesses</h3>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {businessCases.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-border bg-card/30 p-5 hover:border-glow transition-all duration-300"
                >
                  <item.icon className="h-5 w-5 text-primary mb-3" />
                  <h4 className="font-display font-semibold mb-1.5">{item.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default UseCasesSection;
