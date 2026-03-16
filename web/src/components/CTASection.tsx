import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const CTASection = () => {
  return (
    <section id="cta" className="relative py-28">
      <div className="absolute inset-0 bg-radial-glow" />
      <div className="container relative z-10 mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mx-auto max-w-3xl"
        >
          <h2 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6">
            Make yourself <span className="text-gradient-primary">accessible</span>.
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
            Get your business website, AI chat, and voice link in one place. Set up in minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/onboarding"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-10 py-4 text-base font-semibold text-primary-foreground transition-all hover:opacity-90 glow-primary"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Free to start. No credit card required.
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
