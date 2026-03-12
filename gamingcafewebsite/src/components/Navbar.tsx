import { useState } from "react";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import logo from "@/assets/logo.png";

const navItems = ["About", "Gallery", "Pricing", "Centers", "Contact"];

const Navbar = () => {
  const [open, setOpen] = useState(false);

  return (
    <motion.nav
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl"
    >
      <div className="container flex h-16 items-center justify-between">
        <a href="#" className="flex items-center gap-2">
          <img src={logo} alt="M80 Esports" className="h-10 w-10" />
          <span className="font-display text-lg font-bold tracking-wider text-primary neon-text">
            M80 ESPORTS
          </span>
        </a>

        <ul className="hidden lg:flex items-center gap-8">
          {navItems.map((item) => (
            <li key={item}>
              <a
                href={`#${item.toLowerCase()}`}
                className="font-body text-sm font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-primary"
              >
                {item}
              </a>
            </li>
          ))}
        </ul>

        <a
          href="#pricing"
          className="hidden lg:inline-flex items-center px-5 py-2 font-display text-xs font-bold uppercase tracking-widest bg-primary text-primary-foreground neon-glow transition-shadow hover:neon-glow-strong"
        >
          Book Now
        </a>

        <button className="lg:hidden text-foreground" onClick={() => setOpen(!open)}>
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="lg:hidden border-t border-border bg-background/95 backdrop-blur-xl"
        >
          <ul className="flex flex-col items-center gap-4 py-6">
            {navItems.map((item) => (
              <li key={item}>
                <a
                  href={`#${item.toLowerCase()}`}
                  onClick={() => setOpen(false)}
                  className="font-body text-base font-semibold uppercase tracking-widest text-muted-foreground hover:text-primary"
                >
                  {item}
                </a>
              </li>
            ))}
            <a
              href="#pricing"
              onClick={() => setOpen(false)}
              className="mt-2 px-6 py-2 font-display text-xs font-bold uppercase tracking-widest bg-primary text-primary-foreground neon-glow"
            >
              Book Now
            </a>
          </ul>
        </motion.div>
      )}
    </motion.nav>
  );
};

export default Navbar;
