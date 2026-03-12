const Footer = () => {
  return (
    <footer className="border-t border-border py-10">
      <div className="container mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="font-display text-lg font-bold text-gradient-primary">VOXA</span>
        <p className="text-sm text-muted-foreground">
          © 2025 VOXA. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
