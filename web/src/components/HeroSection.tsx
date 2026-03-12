import { motion } from "framer-motion";
import { Mic, MessageSquare, ArrowRight } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0">
        <img src={heroBg} alt="" className="w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-background/60" />
        <div className="absolute inset-0 bg-radial-glow" />
        <div className="absolute inset-0 bg-grid opacity-20" />
      </div>

      <div className="container relative z-10 mx-auto px-6 pt-24 pb-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-6"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-glow bg-secondary/50 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
            Powered by Amazon Nova
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05] mb-6"
        >
          Your AI Conversation
          <br />
          <span className="text-gradient-primary glow-text">Link</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mx-auto max-w-2xl text-lg sm:text-xl text-muted-foreground mb-10 leading-relaxed"
        >
          Turn yourself or your business into a live AI endpoint.
          Share a link — anyone can talk or text your AI in real time.
        </motion.p>

        {/* Link preview */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mx-auto mb-12 max-w-md"
        >
          <div className="rounded-xl border border-glow bg-card/80 backdrop-blur-sm p-4 glow-primary">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-3 w-3 rounded-full bg-primary/40" />
              <div className="h-3 w-3 rounded-full bg-primary/20" />
              <div className="h-3 w-3 rounded-full bg-primary/10" />
            </div>
            <div className="rounded-lg bg-secondary/50 px-4 py-3 font-mono text-sm sm:text-base text-foreground">
              voxa.ai/<span className="text-primary font-semibold">yourname</span>
            </div>
            <div className="flex gap-3 mt-4">
              <button className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary/10 border border-primary/20 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/20">
                <Mic className="h-4 w-4" />
                Speak
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary/10 border border-primary/20 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/20">
                <MessageSquare className="h-4 w-4" />
                Type
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a
            href="/onboarding"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground transition-all hover:opacity-90 glow-primary"
          >
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-8 py-3.5 text-base font-medium text-foreground transition-all hover:bg-secondary"
          >
            See How It Works
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
