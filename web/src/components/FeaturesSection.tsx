import { motion } from "framer-motion";
import { Zap, Brain, Database, Bot, Globe2, Shield } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Real-Time Voice & Text",
    desc: "Powered by Nova 2 Sonic for natural, human-like speech conversations and instant text responses.",
  },
  {
    icon: Brain,
    title: "Intelligent Reasoning",
    desc: "Nova 2 Lite detects intent, extracts details, and manages multi-step conversation workflows.",
  },
  {
    icon: Database,
    title: "Knowledge Indexed",
    desc: "Upload FAQs, docs, portfolios — Nova Multimodal Embeddings ensure accurate, grounded answers.",
  },
  {
    icon: Bot,
    title: "Agentic Actions",
    desc: "Book meetings, store leads, trigger workflows, send notifications, and escalate to humans.",
  },
  {
    icon: Globe2,
    title: "Globally Accessible",
    desc: "No phone numbers, no telecom. Just a URL that works anywhere, embeddable on any platform.",
  },
  {
    icon: Shield,
    title: "Secure & Private",
    desc: "Enterprise-grade security with encrypted conversations and configurable data policies.",
  },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="relative py-28 overflow-hidden">
      <div className="absolute inset-0 bg-radial-glow opacity-30" />
      <div className="container relative z-10 mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">
            Features
          </span>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Powered by Amazon Nova.
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            A full conversational AI stack — voice, reasoning, knowledge, and actions — in one link.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="rounded-2xl border border-border bg-card/30 backdrop-blur-sm p-7 hover:border-glow transition-all duration-300 group"
            >
              <div className="mb-5 inline-flex items-center justify-center h-11 w-11 rounded-xl bg-primary/10 text-primary group-hover:glow-primary transition-all duration-300">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
