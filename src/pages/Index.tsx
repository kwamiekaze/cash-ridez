import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Car, Shield, Users, MapPin, Star, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";

const Index = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-hero relative overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gold/20 rounded-full blur-3xl animate-float-1" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald/20 rounded-full blur-3xl animate-float-2" />
      </div>

      {/* Animated sports car */}
      <div className="absolute top-8 w-full pointer-events-none z-10">
        <div className="animate-drive-across">
          <Car className="w-12 h-12 text-gold" />
        </div>
      </div>

      {/* Destination pin */}
      <div className="hidden md:block absolute top-20 right-20 animate-floating z-10">
        <div className="relative">
          <MapPin className="w-16 h-16 text-gold fill-gold/20" />
          <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-2xl font-bold">$</span>
        </div>
      </div>

      {/* Fixed Navigation */}
      <header className="fixed top-0 left-0 right-0 bg-black/50 backdrop-blur-md border-b border-white/5 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-4xl md:text-6xl font-serif lowercase bg-gradient-primary bg-clip-text text-transparent animate-gold-shimmer">
                cashridez
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="#how-it-works" className="text-white/80 hover:text-gold font-medium transition-colors">
                How It Works
              </a>
              <a href="#community" className="text-white/80 hover:text-gold font-medium transition-colors">
                Community
              </a>
              <a href="#support" className="text-white/80 hover:text-gold font-medium transition-colors">
                Support
              </a>
              <ThemeToggle />
              <Button variant="ghost" onClick={() => navigate("/auth")} className="text-white hover:text-gold">
                Sign In
              </Button>
              <Button onClick={() => navigate("/auth")} className="bg-gradient-button text-black hover:shadow-glow rounded-full">
                Get Started
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32">
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-5xl mx-auto text-center">
            {/* Tagline Badge */}
            <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-primary mb-8 animate-pulse-glow">
              <span className="text-sm font-bold text-black">Revolutionary Ride-Sharing Platform</span>
            </div>
            
            {/* Main Heading */}
            <h1 className="text-6xl md:text-8xl font-heading font-bold mb-6 leading-tight text-white">
              Turn Every Mile Into Money
            </h1>
            
            {/* Subheading Quote */}
            <p className="text-2xl md:text-3xl text-gold italic mb-6 font-medium">
              "Where community meets opportunity"
            </p>
            
            {/* Description */}
            <p className="text-lg md:text-xl text-white/70 mb-12 max-w-3xl mx-auto">
              Connect with verified community members, share rides, and build trusted relationships 
              in a safe, people-powered platform designed for the modern traveler.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Button 
                size="lg" 
                onClick={() => navigate("/auth")} 
                className="bg-gradient-button text-black hover:shadow-glow text-lg px-8 py-6 rounded-full font-bold"
              >
                Post a Trip
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                onClick={() => navigate("/auth")} 
                className="border-2 border-white text-white hover:bg-white hover:text-black text-lg px-8 py-6 rounded-full font-bold"
              >
                Respond to Trips
              </Button>
            </div>

            {/* Trust Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
              <Card className="p-6 bg-card/10 backdrop-blur-sm border border-white/10 hover:border-gold/50 transition-all">
                <Shield className="w-12 h-12 text-gold mx-auto mb-3" />
                <p className="text-white font-bold">Verified Drivers</p>
              </Card>
              <Card className="p-6 bg-card/10 backdrop-blur-sm border border-white/10 hover:border-emerald/50 transition-all">
                <Users className="w-12 h-12 text-emerald mx-auto mb-3" />
                <p className="text-white font-bold">Active Community</p>
              </Card>
              <Card className="p-6 bg-card/10 backdrop-blur-sm border border-white/10 hover:border-gold/50 transition-all">
                <Star className="w-12 h-12 text-gold mx-auto mb-3" />
                <p className="text-white font-bold">5-Star Service</p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 relative z-10">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-heading font-bold text-white mb-4">
              How It Works
            </h2>
            <p className="text-xl text-white/70">
              Get started in three simple steps
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { step: "1", title: "Sign Up", desc: "Create your account and get verified" },
              { step: "2", title: "Connect", desc: "Find riders or drivers in your area" },
              { step: "3", title: "Ride", desc: "Coordinate travel and build connections" },
            ].map((item, i) => (
              <Card key={i} className="p-8 bg-card/10 backdrop-blur-sm border border-white/10 hover:border-gold/50 transition-all text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-primary flex items-center justify-center text-3xl font-bold text-black mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">{item.title}</h3>
                <p className="text-white/70">{item.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Community Section */}
      <section id="community" className="py-20 relative z-10">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-heading font-bold text-white mb-6">
              Join Our Community
            </h2>
            <p className="text-xl text-white/70 mb-8">
              Be part of a verified, trusted network of travelers and drivers
            </p>
            <Button 
              size="lg" 
              onClick={() => navigate("/auth")}
              className="bg-gradient-button text-black hover:shadow-glow text-lg px-10 py-6 rounded-full font-bold"
            >
              Get Started Today
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;