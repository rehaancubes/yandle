import logo from "@/assets/logo.png";

const Footer = () => {
  return (
    <footer className="py-10 border-t border-border bg-card">
      <div className="container px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <img src={logo} alt="M80 Esports" className="h-8 w-8" />
          <span className="font-display text-sm font-bold tracking-wider text-primary">M80 ESPORTS</span>
        </div>
        <p className="font-body text-sm text-muted-foreground">
          © {new Date().getFullYear()} M80 Esports. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
