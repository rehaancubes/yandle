import { motion } from "framer-motion";
import heroBg from "@/assets/hero-bg.jpg";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <img src={heroBg} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-background/70" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      </div>

      {/* Animated accent lines */}
      <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-primary/20 to-transparent animate-pulse-glow" />
      <div className="absolute top-0 right-1/3 w-px h-full bg-gradient-to-b from-transparent via-accent/10 to-transparent animate-pulse-glow" style={{ animationDelay: "1.5s" }} />

      <div className="relative z-10 container text-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <p className="font-body text-sm md:text-base font-semibold uppercase tracking-[0.3em] text-primary mb-4">
            Welcome to the Arena
          </p>
          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-black uppercase leading-none text-foreground mb-6">
            M80{" "}
            <span className="text-primary neon-text">Esports</span>
          </h1>
          <p className="font-body text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Premium gaming cafe with high-end rigs, competitive tournaments, and an elite gaming community. Level up your experience.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <a
            href="#pricing"
            className="inline-flex items-center justify-center px-8 py-3 font-display text-sm font-bold uppercase tracking-widest bg-primary text-primary-foreground neon-glow hover:neon-glow-strong transition-shadow"
          >
            View Pricing
          </a>
          <a
            href="#services"
            className="inline-flex items-center justify-center px-8 py-3 font-display text-sm font-bold uppercase tracking-widest border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
          >
            Explore
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
