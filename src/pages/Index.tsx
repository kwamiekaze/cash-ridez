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
              <Card className="p-8 border-2 border-primary/20 hover:border-primary/40 transition-all hover:shadow-elegant rounded-2xl bg-white">
                <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center mb-6 shadow-elegant">
                  <CheckCircle2 className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-4">No Upfront Cost</h3>
                <p className="text-foreground/70 leading-relaxed">
                  Join the CashRidez community for free — no hidden fees or upfront payments. Get started instantly and explore real trip opportunities near you.
                </p>
              </Card>

              <Card className="p-8 border-2 border-primary/20 hover:border-primary/40 transition-all hover:shadow-elegant rounded-2xl bg-white">
                <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center mb-6 shadow-elegant">
                  <MapPin className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Request a Trip for Free</h3>
                <p className="text-foreground/70 leading-relaxed">
                  Post your pickup and drop-off locations in seconds. It's fast, convenient, and completely free to request a trip.
                </p>
              </Card>

              <Card className="p-8 border-2 border-primary/20 hover:border-primary/40 transition-all hover:shadow-elegant rounded-2xl bg-white">
                <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center mb-6 shadow-elegant">
                  <Car className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Accept a Trip for Free</h3>
                <p className="text-foreground/70 leading-relaxed">
                  Drivers can view and accept available trip requests at no charge. There's no commission or middleman — just direct, people-powered connections.
                </p>
              </Card>

              <Card className="p-8 border-2 border-primary/20 hover:border-primary/40 transition-all hover:shadow-elegant rounded-2xl bg-white">
                <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center mb-6 shadow-elegant">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Safe & Trusted Community</h3>
                <p className="text-foreground/70 leading-relaxed">
                  Every member is part of a verified network built on safety, respect, and accountability. Your security and trust are our top priorities.
                </p>
              </Card>

              <Card className="p-8 border-2 border-primary/20 hover:border-primary/40 transition-all hover:shadow-elegant rounded-2xl bg-white">
                <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center mb-6 shadow-elegant">
                  <Users className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Verified Members Only</h3>
                <p className="text-foreground/70 leading-relaxed">
                  All users are verified through our secure system to maintain a reliable and transparent experience for everyone.
                </p>
              </Card>

              <Card className="p-8 border-2 border-primary/20 hover:border-primary/40 transition-all hover:shadow-elegant rounded-2xl bg-white">
                <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center mb-6 shadow-elegant">
                  <Star className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-4">Join the Movement</h3>
                <p className="text-foreground/70 leading-relaxed">
                  Experience a smarter, community-driven way to travel. CashRidez — Powered by People.
                </p>
              </Card>
            </div>

            <div className="bg-gradient-hero border-2 border-primary/20 rounded-2xl p-8 text-center shadow-elegant">
              <p className="text-lg font-semibold mb-2 text-foreground">Note:</p>
              <p className="text-foreground/70 leading-relaxed">
                Requesting and accepting trips have limited actions for non-subscribed members. After subscribing, all users can make and accept unlimited trips with full access to the CashRidez network.
              </p>
            </div>
          </div>
        </div>
      </section>


      {/* How It Works */}
      <section id="how-it-works" className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              How It Works — Simple, Safe, and Social
            </h2>
            <p className="text-xl text-foreground/70 max-w-2xl mx-auto font-medium">
              Getting started takes just a few minutes
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-primary text-white text-3xl font-bold flex items-center justify-center mx-auto mb-6 shadow-glow">
                1
              </div>
              <h3 className="text-2xl font-bold mb-4">Join & Verify</h3>
              <p className="text-foreground/70 text-lg leading-relaxed">
                Create your profile and verify your ID to join our trusted community network
              </p>
            </div>
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-primary text-white text-3xl font-bold flex items-center justify-center mx-auto mb-6 shadow-glow">
                2
              </div>
              <h3 className="text-2xl font-bold mb-4">Post or Explore Trips</h3>
              <p className="text-foreground/70 text-lg leading-relaxed">
                Share your travel plans or browse trip requests in your area
              </p>
            </div>
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-primary text-white text-3xl font-bold flex items-center justify-center mx-auto mb-6 shadow-glow">
                3
              </div>
              <h3 className="text-2xl font-bold mb-4">Chat & Coordinate</h3>
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
      <section className="py-24 bg-gradient-hero">
        <div className="container mx-auto px-4">
          <Card className="p-16 bg-gradient-primary text-white text-center max-w-4xl mx-auto rounded-3xl shadow-glow">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Ready to Connect? 👋</h2>
            <p className="text-xl mb-10 opacity-95 font-medium">
              Join thousands of travelers coordinating trips across Georgia and beyond
            </p>
            <Button size="lg" variant="secondary" className="text-lg px-12 py-7 rounded-full shadow-elegant hover:scale-105 transition-transform" onClick={() => navigate("/auth")}>
              Sign Up Free
            </Button>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-2">
              Powered by People
            </p>
            <p className="text-foreground/60">Your Community Travel Network</p>
          </div>
          
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant">
                  <Car className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold">CashRidez</span>
              </div>
              <p className="text-foreground/60 text-sm leading-relaxed">People powered travel coordination platform</p>
            </div>
            <div>
              <h4 className="font-bold mb-4">Platform</h4>
              <ul className="space-y-3 text-sm text-foreground/70">
                <li><a href="#" className="hover:text-primary transition-colors font-medium">Post Trip</a></li>
                <li><a href="#" className="hover:text-primary transition-colors font-medium">Offer Lift</a></li>
                <li><a href="#" className="hover:text-primary transition-colors font-medium">Community</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Resources</h4>
              <ul className="space-y-3 text-sm text-foreground/70">
                <li><a href="#" className="hover:text-primary transition-colors font-medium">Community Guidelines</a></li>
                <li><a href="#" className="hover:text-primary transition-colors font-medium">Support</a></li>
                <li><a href="#" className="hover:text-primary transition-colors font-medium">Terms</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Connect</h4>
              <ul className="space-y-3 text-sm text-foreground/70">
                <li><a href="#" className="hover:text-primary transition-colors font-medium">Facebook</a></li>
                <li><a href="#" className="hover:text-primary transition-colors font-medium">Instagram</a></li>
                <li><a href="#" className="hover:text-primary transition-colors font-medium">YouTube</a></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-border">
            <p className="text-xs text-foreground/50 text-center max-w-4xl mx-auto mb-4 leading-relaxed">
              CashRidez is a communication and networking platform designed to connect individuals for travel coordination. 
              CashRidez does not arrange, control, or provide transportation services and is not responsible for user transactions or travel outcomes.
            </p>
            <p className="text-center text-sm text-foreground/60 font-medium">
              © 2025 CashRidez. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>;
};
export default Index;