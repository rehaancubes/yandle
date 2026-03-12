import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const stats = [
  { value: 90, suffix: "+", label: "Gaming Stations" },
  { value: 4, suffix: "", label: "Locations" },
  { value: 50, suffix: "K+", label: "Hours Played" },
  { value: 200, suffix: "+", label: "Tournaments Hosted" },
];

const Counter = ({ target, suffix }: { target: number; suffix: string }) => {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    let current = 0;
    const step = Math.max(1, Math.floor(target / 40));
    const interval = setInterval(() => {
      current += step;
      if (current >= target) {
        setCount(target);
        clearInterval(interval);
      } else {
        setCount(current);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [started, target]);

  return (
    <motion.div
      onViewportEnter={() => setStarted(true)}
      viewport={{ once: true }}
      className="text-center"
    >
      <span className="font-display text-4xl md:text-5xl font-black text-primary neon-text">
        {count}{suffix}
      </span>
    </motion.div>
  );
};

const StatsSection = () => {
  return (
    <section className="py-16 bg-background relative border-y border-border">
      <div className="container px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <Counter target={stat.value} suffix={stat.suffix} />
              <p className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground mt-2">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsSection;
