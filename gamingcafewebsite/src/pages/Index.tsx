import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import StatsSection from "@/components/StatsSection";
import ServicesSection from "@/components/ServicesSection";
import GallerySection from "@/components/GallerySection";
import PricingSection from "@/components/PricingSection";
import CentersSection from "@/components/CentersSection";
import CTASection from "@/components/CTASection";
import ContactSection from "@/components/ContactSection";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <StatsSection />
      <div id="about">
        <ServicesSection />
      </div>
      <GallerySection />
      <PricingSection />
      <CentersSection />
      <CTASection />
      <ContactSection />
      <Footer />
    </div>
  );
};

export default Index;
