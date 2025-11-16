import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Car, Shield, Users, MapPin, Star, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { CarIcon } from "@/components/CarIcon";
import { motion } from "motion/react";


const trustBadges = [{
  icon: Shield,
  label: "ID Verified"
}, {
  icon: CheckCircle2,
  label: "Safe Connections"
}, {
  icon: Users,
  label: "Community-Driven"
}];

const Index = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      // Let the dashboard handle role-based routing; this avoids an extra DB call here
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, navigate]);
  return <div className="min-h-screen bg-background">
      <CarIcon />
      
      {/* Header */}
      <header className="border-b border-border/30 bg-background/95 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <motion.span 
              className="text-2xl font-bold text-primary lowercase"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              cashridez
            </motion.span>
            <nav className="hidden md:flex items-center gap-8">
              <a href="#how-it-works" className="text-foreground/80 hover:text-primary font-medium transition-colors">
                How It Works
              </a>
              <a href="/community" className="text-foreground hover:text-primary font-medium transition-colors">
                Community
              </a>
              <a href="#" className="text-foreground/80 hover:text-primary font-medium transition-colors">
                Support
              </a>
              <Button variant="ghost" onClick={() => navigate("/auth")} className="text-foreground hover:text-primary">
                Sign In
              </Button>
              <Button onClick={() => navigate("/auth")} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6 drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)] hover:drop-shadow-[0_0_20px_hsl(var(--primary)/0.8)]">
                Get Started
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-32 bg-gradient-hero">
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/20 border border-accent/40 mb-6">
              <MapPin className="w-4 h-4 text-accent" />
              <span className="text-sm font-semibold text-accent">Atlanta</span>
            </div>

            <p className="text-primary text-lg mb-6 font-medium">
              Powered by People - Driven by Cash 💵
            </p>
            
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              <span className="text-primary">Your Community</span>
              <br />
              <span className="text-primary">Travel </span>
              <span className="text-accent">Network</span>
            </h1>
            
            <div className="border-l-4 border-primary pl-6 py-4 mb-8 max-w-3xl mx-auto">
              <p className="text-foreground/90 text-lg italic">
                "Powered by people, Driven by Cash. Earn More, Save More with Cash Ridez. Your Community Travel Network."
              </p>
            </div>

            <p className="text-lg text-foreground/80 mb-12 max-w-2xl mx-auto">
              Connect with locals. Coordinate travel. Move together.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-10 py-7 rounded-full drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)] hover:drop-shadow-[0_0_20px_hsl(var(--primary)/0.8)]" onClick={() => navigate("/rider/create-request")}>
                Post a Trip
              </Button>
              <Button size="lg" variant="outline" className="border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground text-lg px-10 py-7 rounded-full drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)] hover:drop-shadow-[0_0_20px_hsl(var(--primary)/0.8)]" onClick={() => navigate("/trips")}>
                Respond to Trips
              </Button>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap items-center justify-center gap-8 mb-8">
              {trustBadges.map(badge => <div key={badge.label} className="flex items-center gap-3 text-sm">
                  <div className="w-10 h-10 rounded-full border-2 border-primary/40 flex items-center justify-center">
                    <badge.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-medium text-foreground">{badge.label}</span>
                </div>)}
            </div>
          </div>
        </div>
      </section>

      {/* Why Join CashRidez */}
      <section className="py-20 bg-background border-y border-border/30">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-center mb-16 text-primary">
              Why Join CashRidez?
            </h2>
            
            <div className="grid md:grid-cols-2 gap-8 mb-12">
              <Card className="p-8 border border-border/50 hover:border-primary/40 transition-all rounded-2xl bg-card">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-foreground">No Upfront Cost</h3>
                <p className="text-foreground/70 leading-relaxed">
                  Join the CashRidez community for free - no hidden fees or upfront payments.
                </p>
              </Card>

              <Card className="p-8 border border-border/50 hover:border-primary/40 transition-all rounded-2xl bg-card">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mb-6">
                  <MapPin className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-foreground">Request a Trip for Free</h3>
                <p className="text-foreground/70 leading-relaxed">
                  Post your pickup and drop-off locations in seconds. Fast, convenient, and completely free.
                </p>
              </Card>

              <Card className="p-8 border border-border/50 hover:border-primary/40 transition-all rounded-2xl bg-card">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mb-6">
                  <Car className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-foreground">Accept a Trip for Free</h3>
                <p className="text-foreground/70 leading-relaxed">
                  Drivers can view and accept available trip requests at no charge.
                </p>
              </Card>

              <Card className="p-8 border border-border/50 hover:border-primary/40 transition-all rounded-2xl bg-card">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mb-6">
                  <Shield className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-foreground">Safe & Trusted Community</h3>
                <p className="text-foreground/70 leading-relaxed">
                  Every member is part of a verified network built on safety and respect.
                </p>
              </Card>

              <Card className="p-8 border border-border/50 hover:border-primary/40 transition-all rounded-2xl bg-card">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mb-6">
                  <Users className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-foreground">Verified Members Only</h3>
                <p className="text-foreground/70 leading-relaxed">
                  All users are verified through our secure system to maintain reliability.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </section>


      {/* How It Works */}
      <section id="how-it-works" className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-primary">
              How It Works
            </h2>
            <p className="text-xl text-foreground/70 max-w-2xl mx-auto font-medium">
              Simple, Safe, and Social - Getting started takes just a few minutes
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-primary/20 text-primary text-3xl font-bold flex items-center justify-center mx-auto mb-6 border-2 border-primary/40">
                01
              </div>
              <h3 className="text-2xl font-bold mb-4 text-foreground">Join & Verify</h3>
              <p className="text-foreground/70 text-lg leading-relaxed">
                Create your profile and verify your ID to join our trusted community network
              </p>
            </div>
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-primary/20 text-primary text-3xl font-bold flex items-center justify-center mx-auto mb-6 border-2 border-primary/40">
                02
              </div>
              <h3 className="text-2xl font-bold mb-4 text-foreground">Post or Explore Trips</h3>
              <p className="text-foreground/70 text-lg leading-relaxed">
                Share your travel plans or browse trip requests in your area
              </p>
            </div>
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-primary/20 text-primary text-3xl font-bold flex items-center justify-center mx-auto mb-6 border-2 border-primary/40">
                03
              </div>
              <h3 className="text-2xl font-bold mb-4 text-foreground">Chat & Coordinate</h3>
              <p className="text-foreground/70 text-lg leading-relaxed">
                Message others, plan travel details, and arrange everything privately
              </p>
            </div>
          </div>
          <p className="text-center text-foreground/60 mt-12 max-w-2xl mx-auto text-lg font-medium">
            CashRidez never books or manages trips, we simply help people connect and communicate.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-background border-t border-border/30">
        <div className="container mx-auto px-4">
          <Card className="p-16 bg-card border border-border/50 text-center max-w-4xl mx-auto rounded-3xl">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-primary">Need Help? We're Here! 👋</h2>
            <p className="text-xl mb-10 text-foreground/80 font-medium">
              Have questions? Our support team is ready to assist you
            </p>
            <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-12 py-7 rounded-full" onClick={() => navigate("/auth")}>
              Contact Support
            </Button>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-16 bg-background">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-6 text-sm">
              <a href="/community" className="text-foreground/60 hover:text-primary font-medium transition-colors">
                Community Guidelines
              </a>
              <a href="/privacy" className="text-foreground/60 hover:text-primary font-medium transition-colors">
                Privacy Policy
              </a>
              <a href="/terms" className="text-foreground/60 hover:text-primary font-medium transition-colors">
                Terms of Service
              </a>
            </div>
            <p className="text-center text-sm text-foreground/60 font-medium">
              © 2025 CashRidez. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>;
};
export default Index;