import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Car, Shield, MessageSquare, Users, Star, ThumbsUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Shield,
      title: "Verified Members",
      description: "Each user verifies their ID to keep our community trustworthy"
    },
    {
      icon: MessageSquare,
      title: "Flexible Arrangements",
      description: "Discuss travel plans and compensation directly with others"
    },
    {
      icon: Users,
      title: "Private Messaging",
      description: "Coordinate and stay updated through secure in-app chat"
    },
    {
      icon: Star,
      title: "Reputation System",
      description: "Build trust through community feedback"
    }
  ];

  const stats = [
    { label: "Verified Members", value: "10K+" },
    { label: "Connections Made", value: "50K+" },
    { label: "Community Rating", value: "4.8" },
    { label: "Active Cities", value: "25+" }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
                <Car className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                Cash Ridez
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">
                How It Works
              </a>
              <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
                Features
              </a>
              <Button variant="outline" onClick={() => navigate("/auth")}>
                Sign In
              </Button>
              <Button className="bg-gradient-primary" onClick={() => navigate("/auth")}>
                Get Started
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-32">
        <div className="absolute inset-0 bg-gradient-hero opacity-10"></div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              Local Travel Connections —
              <span className="bg-gradient-primary bg-clip-text text-transparent"> Simplified</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Connect with verified community members who share similar routes or travel plans. Post your trip, chat, and coordinate privately and safely through our communication-first platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-gradient-primary hover:shadow-glow transition-all text-lg px-8 py-6"
                onClick={() => navigate("/auth")}
              >
                <ThumbsUp className="w-5 h-5 mr-2" />
                Post a Trip
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="text-lg px-8 py-6"
                onClick={() => navigate("/auth")}
              >
                <Car className="w-5 h-5 mr-2" />
                Explore Trip Requests
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-6 max-w-xl mx-auto">
              CashRidez is a communication tool that helps people network for travel coordination. Users handle their own arrangements and payments directly.
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 bg-card border-y border-border">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-2">
                  {stat.value}
                </div>
                <div className="text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Why Join the CashRidez Community?</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              A communication platform that puts safety, trust, and community first
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="p-6 hover:shadow-lg transition-all hover:border-primary/50">
                <div className="w-12 h-12 rounded-lg bg-gradient-primary flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">How It Works — Simple, Safe, and Social</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Getting started is simple and takes just a few minutes
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-primary text-white text-2xl font-bold flex items-center justify-center mx-auto mb-4">
                1
              </div>
              <h3 className="text-xl font-semibold mb-2">Join & Verify</h3>
              <p className="text-muted-foreground">
                Create your profile and verify your ID to join the network
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-primary text-white text-2xl font-bold flex items-center justify-center mx-auto mb-4">
                2
              </div>
              <h3 className="text-xl font-semibold mb-2">Post or Explore Trips</h3>
              <p className="text-muted-foreground">
                Share your travel plans or browse requests in your area
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-primary text-white text-2xl font-bold flex items-center justify-center mx-auto mb-4">
                3
              </div>
              <h3 className="text-xl font-semibold mb-2">Chat & Coordinate</h3>
              <p className="text-muted-foreground">
                Message others, plan details, and manage your arrangements privately
              </p>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-8 max-w-2xl mx-auto">
            CashRidez never books or manages trips — we simply help people connect and communicate.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <Card className="p-12 bg-gradient-primary text-white text-center">
            <h2 className="text-4xl font-bold mb-4">Ready to Connect? 👋</h2>
            <p className="text-xl mb-8 opacity-90">
              Join thousands of travelers coordinating trips across Georgia and beyond
            </p>
            <Button 
              size="lg" 
              variant="secondary"
              className="text-lg px-8 py-6"
              onClick={() => navigate("/auth")}
            >
              Sign Up Free
            </Button>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                  <Car className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold">Cash Ridez</span>
              </div>
              <p className="text-muted-foreground text-sm">
                Community-first travel coordination platform
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Post Trip</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Join Network</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Safety</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">About</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Support</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Terms</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Connect</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Twitter</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Facebook</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Instagram</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-xs text-muted-foreground text-center max-w-4xl mx-auto mb-4">
              CashRidez is a communication and networking platform designed to connect individuals for travel coordination. CashRidez does not arrange, control, or provide transportation services and is not responsible for user transactions or travel outcomes.
            </p>
            <p className="text-center text-sm text-muted-foreground">
              © 2025 Cash Ridez. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
