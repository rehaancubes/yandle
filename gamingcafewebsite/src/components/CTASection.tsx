import { motion } from "framer-motion";

const CTASection = () => {
  return (
    <section className="py-24 bg-card relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      {/* Glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
      <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-accent/5 blur-[80px]" />

      <div className="container px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto"
        >
          <p className="font-body text-sm uppercase tracking-[0.3em] text-primary mb-3">Ready to Play?</p>
          <h2 className="font-display text-3xl md:text-5xl font-bold uppercase text-foreground mb-6">
            Your Next <span className="text-primary neon-text">Victory</span> Starts Here
          </h2>
          <p className="font-body text-lg text-muted-foreground mb-10 leading-relaxed">
            Walk in or book ahead. First-timers get 1 hour free on any station. Bring your crew, dominate the leaderboard, and become part of the M80 community.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#pricing"
              className="inline-flex items-center justify-center px-10 py-4 font-display text-sm font-bold uppercase tracking-widest bg-primary text-primary-foreground neon-glow hover:neon-glow-strong transition-shadow"
            >
              Book a Session
            </a>
            <a
              href="#centers"
              className="inline-flex items-center justify-center px-10 py-4 font-display text-sm font-bold uppercase tracking-widest border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
            >
              Find a Center
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
