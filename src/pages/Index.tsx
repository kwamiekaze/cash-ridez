import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Shield, MessageSquare, Users, Handshake, MapPin, Star, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BrandCar } from "@/components/icons/BrandCar";

const Index = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Shield,
      title: "Verified Members",
      description: "Each user verifies their ID to keep our community trustworthy and safe"
    },
    {
      icon: Handshake,
      title: "Flexible Arrangements",
      description: "Discuss travel plans and compensation directly with community members"
    },
    {
      icon: MessageSquare,
      title: "Private Messaging",
      description: "Coordinate and stay connected through secure in-app communication"
    },
    {
      icon: Star,
      title: "Reputation System",
      description: "Build trust through transparent community feedback and ratings"
    }
  ];

  const stats = [
    { label: "Verified Members", value: "10K+" },
    { label: "Connections Made", value: "50K+" },
    { label: "Community Rating", value: "4.8" },
    { label: "Active Cities", value: "25+" }
  ];

  const trustBadges = [
    { icon: Shield, label: "ID Verified" },
    { icon: CheckCircle2, label: "Safe Connections" },
    { icon: Users, label: "Community-Driven" }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-white/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant">
                <BrandCar className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                CashRidez
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-8">
              <a href="#how-it-works" className="text-foreground/70 hover:text-primary font-medium transition-colors">
                How It Works
              </a>
              <a href="#features" className="text-foreground/70 hover:text-primary font-medium transition-colors">
                Community
              </a>
              <a href="#" className="text-foreground/70 hover:text-primary font-medium transition-colors">
                Support
              </a>
              <Button variant="outline" onClick={() => navigate("/auth")} className="rounded-full">
                Sign In
              </Button>
              <Button onClick={() => navigate("/auth")} className="rounded-full">
                Get Started
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-32 bg-gradient-hero">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(160_84%_39%/0.1),transparent_50%)]"></div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,hsl(145_85%_23%/0.1),transparent_50%)]"></div>
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border-2 border-primary/20 mb-6 shadow-elegant">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-primary">Powered by People</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold mb-4 leading-tight">
              Your Community Travel Network
            </h1>
            
            <p className="text-xl md:text-2xl text-foreground/70 mb-4 max-w-3xl mx-auto font-medium">
              Connect with locals. Coordinate travel. Move together.
            </p>
            
            <p className="text-lg text-foreground/60 mb-12 max-w-2xl mx-auto">
              A people-powered platform where verified community members share travel plans, 
              coordinate trips, and build trusted connections, safely and independently.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <Button 
                size="lg" 
                className="text-lg px-10 py-7 rounded-full shadow-glow"
                onClick={() => navigate("/auth")}
              >
                <MapPin className="w-5 h-5 mr-2" />
                Post a Trip
              </Button>
              <Button 
                size="lg" 
                variant="secondary"
                className="text-lg px-10 py-7 rounded-full"
                onClick={() => navigate("/auth")}
              >
                <BrandCar className="w-5 h-5 mr-2" />
                Offer a Lift
              </Button>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap items-center justify-center gap-6 mb-8">
              {trustBadges.map((badge) => (
                <div key={badge.label} className="flex items-center gap-2 text-sm text-foreground/70">
                  <badge.icon className="w-4 h-4 text-primary" />
                  <span className="font-medium">{badge.label}</span>
                </div>
              ))}
            </div>

            <p className="text-sm text-foreground/50 max-w-2xl mx-auto">
              CashRidez is a communication tool for travel coordination. Users arrange all details 
              and payments independently through our secure messaging platform.
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-white border-y border-border shadow-sm">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-2">
                  {stat.value}
                </div>
                <div className="text-foreground/60 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-gradient-hero">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Why Join the CashRidez Community?
            </h2>
            <p className="text-xl text-foreground/70 max-w-2xl mx-auto font-medium">
              A communication platform that puts safety, trust, and people first
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {features.map((feature) => (
              <Card 
                key={feature.title} 
                className="p-8 hover:shadow-elegant transition-all hover:border-primary/30 bg-white rounded-2xl"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center mb-6 shadow-elegant">
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-foreground/70 leading-relaxed">{feature.description}</p>
              </Card>
            ))}
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
            <Button 
              size="lg" 
              variant="secondary"
              className="text-lg px-12 py-7 rounded-full shadow-elegant hover:scale-105 transition-transform"
              onClick={() => navigate("/auth")}
            >
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
                  <BrandCar className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold">CashRidez</span>
              </div>
              <p className="text-foreground/60 text-sm leading-relaxed">
                People-powered travel coordination platform
              </p>
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
    </div>
  );
};

export default Index;
