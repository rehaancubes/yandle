import { motion } from "framer-motion";
import { Monitor, Scissors, Building2, Headset } from "lucide-react";

const useCases = [
  { icon: Monitor, title: "Gaming Cafe", desc: "Manage locations, machines, bookings, and availability with AI." },
  { icon: Scissors, title: "Salon", desc: "Schedule appointments, answer service questions, manage branches." },
  { icon: Building2, title: "General Business", desc: "Answer questions, capture leads, and manage callback requests with AI." },
  { icon: Headset, title: "Customer Support", desc: "Categorize issues, create tickets, and track resolutions with AI." },
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
            Built for your business type.
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            YANDLE adapts to how you work — gaming cafes, salons, support, or general business.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {useCases.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="rounded-xl border border-border bg-card/30 p-6 hover:border-glow transition-all duration-300"
            >
              <item.icon className="h-6 w-6 text-primary mb-4" />
              <h4 className="font-display font-semibold mb-2">{item.title}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default UseCasesSection;
