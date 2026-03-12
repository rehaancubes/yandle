import { motion } from "framer-motion";
import { MapPin, Clock, Phone, Mail } from "lucide-react";

const info = [
  { icon: MapPin, label: "Location", value: "123 Gamer Street, Downtown" },
  { icon: Clock, label: "Hours", value: "Mon–Sun: 10AM – 2AM" },
  { icon: Phone, label: "Phone", value: "(555) 080-1337" },
  { icon: Mail, label: "Email", value: "play@m80esports.com" },
];

const ContactSection = () => {
  return (
    <section id="contact" className="py-24 bg-background relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="container px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="font-body text-sm uppercase tracking-[0.3em] text-primary mb-3">Find Us</p>
          <h2 className="font-display text-3xl md:text-5xl font-bold uppercase text-foreground">
            Visit The <span className="text-primary neon-text">Arena</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {info.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="text-center p-6 border border-border bg-card hover:border-primary/30 transition-colors"
            >
              <item.icon className="h-6 w-6 text-primary mx-auto mb-3" />
              <p className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
                {item.label}
              </p>
              <p className="font-body text-sm text-foreground">{item.value}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
