import { motion } from "framer-motion";
import { Link2, MousePointerClick, MessageCircle } from "lucide-react";

const steps = [
  {
    icon: Link2,
    title: "Create Your Link",
    description: "Set up your AI persona, upload knowledge, and configure behavior in minutes.",
    tag: "voxa.ai/yourname",
  },
  {
    icon: MousePointerClick,
    title: "Share Anywhere",
    description: "Put it in your bio, website, business card, QR code — anywhere you'd share a contact.",
    tag: "Tap → Connect",
  },
  {
    icon: MessageCircle,
    title: "Instant Conversations",
    description: "Visitors speak or type. Your AI responds in real time — answers, collects info, takes action.",
    tag: "Voice or Text",
  },
];

const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="relative py-28 overflow-hidden">
      <div className="absolute inset-0 bg-radial-glow opacity-50" />
      <div className="container relative z-10 mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">
            How It Works
          </span>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
            Three steps. Zero friction.
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              className="group relative rounded-2xl border border-border bg-card/50 backdrop-blur-sm p-8 hover:border-glow transition-all duration-300"
            >
              <div className="mb-6 inline-flex items-center justify-center h-12 w-12 rounded-xl bg-primary/10 text-primary">
                <step.icon className="h-6 w-6" />
              </div>
              <span className="block text-xs font-mono text-primary/60 mb-2">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="font-display text-xl font-semibold mb-3">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.description}</p>
              <span className="inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                {step.tag}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
