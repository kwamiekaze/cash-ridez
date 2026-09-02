import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Car, Shield, Users, MapPin, CheckCircle2, Download, HeadphonesIcon, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { CarIcon } from "@/components/CarIcon";
import { motion } from "motion/react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import SupportDialog from "@/components/SupportDialog";
import { HEADER_LOGO_URL } from "@/lib/newHomeConfig";

// three.js kept out of the main bundle
const CashCar3D = lazy(() => import("@/components/newhome/CashCar3D"));

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

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

const whyCards = [
  { icon: CheckCircle2, title: "No Upfront Cost", body: "Join the CashRidez community for free - no hidden fees or upfront payments." },
  { icon: MapPin, title: "Request a Trip for Free", body: "Post your pickup and drop-off locations in seconds. Fast, convenient, and completely free." },
  { icon: Car, title: "Accept a Trip for Free", body: "Drivers can view and accept available trip requests at no charge." },
  { icon: Shield, title: "Safe & Trusted Community", body: "Every member is part of a verified network built on safety and respect." },
  { icon: Users, title: "Verified Members Only", body: "All users are verified through our secure system to maintain reliability." },
];

const steps = [
  { n: "01", title: "Join & Verify", body: "Create your profile and verify your ID to join our trusted community network" },
  { n: "02", title: "Post or Explore Trips", body: "Share your travel plans or browse trip requests in your area" },
  { n: "03", title: "Chat & Coordinate", body: "Message others, plan travel details, and arrange everything privately" },
];

const NewHome = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <CarIcon />

      {/* Header */}
      <header className="border-b border-primary/15 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {logoFailed ? (
                <span className="text-2xl font-bold text-primary lowercase">cashridez</span>
              ) : (
                <img
                  src={HEADER_LOGO_URL}
                  alt="CashRidez"
                  onError={() => setLogoFailed(true)}
                  className="h-9 md:h-10 w-auto transition-all duration-300 hover:scale-[1.03] hover:drop-shadow-[0_0_14px_hsl(51_100%_50%/0.55)]"
                />
              )}
            </motion.div>
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-8">
              <a href="#how-it-works" className="text-foreground/80 hover:text-primary font-medium transition-all duration-300">
                How It Works
              </a>
              <a href="/community" className="text-foreground hover:text-primary font-medium transition-all duration-300">
                Community
              </a>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="text-foreground hover:text-primary">
                    <Menu className="h-4 w-4 mr-2" />
                    Menu
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-card border-border z-50">
                  <DropdownMenuItem onClick={() => setSupportDialogOpen(true)} className="cursor-pointer">
                    <HeadphonesIcon className="mr-2 h-4 w-4" />
                    Support
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/install-app')} className="cursor-pointer text-[hsl(var(--primary))]">
                    <Download className="mr-2 h-4 w-4" />
                    Download App
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" onClick={() => navigate("/auth")} className="text-foreground hover:text-primary">
                Sign In
              </Button>
              <Button onClick={() => navigate("/auth")} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6 shadow-[0_0_20px_hsl(51_100%_50%/0.6),0_0_40px_hsl(51_100%_50%/0.4)] hover:shadow-[0_0_30px_hsl(51_100%_50%/0.8),0_0_60px_hsl(51_100%_50%/0.6)] transition-all">
                Get Started
              </Button>
            </nav>

            {/* Mobile Navigation */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-foreground hover:text-primary">
                    <Menu className="h-6 w-6" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-card border-border z-50">
                  <DropdownMenuItem onClick={() => {
                    const element = document.getElementById('how-it-works');
                    element?.scrollIntoView({ behavior: 'smooth' });
                  }} className="cursor-pointer">
                    How It Works
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/community')} className="cursor-pointer">
                    Community
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSupportDialogOpen(true)} className="cursor-pointer">
                    <HeadphonesIcon className="mr-2 h-4 w-4" />
                    Support
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/install-app')} className="cursor-pointer text-[hsl(var(--primary))]">
                    <Download className="mr-2 h-4 w-4" />
                    Download App
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/auth')} className="cursor-pointer">
                    Sign In
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/auth')} className="cursor-pointer font-semibold text-primary">
                    Get Started
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section — cinematic 3D centerpiece */}
      <section className="relative overflow-hidden py-20 md:py-28 bg-gradient-hero">
        {/* Ambient depth */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[140px]" />
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-background" />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-5xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/20 border border-accent/40 mb-6">
                <MapPin className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold text-accent">Atlanta</span>
              </div>

              <p className="text-primary text-lg mb-6 font-medium">
                Powered by People - Driven by Cash 💵
              </p>

              <h1 className="text-5xl md:text-7xl font-bold mb-8 leading-tight tracking-tight">
                <span className="text-primary">Your Community</span>
                <br />
                <span className="text-primary">Travel </span>
                <span className="text-accent">Network</span>
              </h1>
            </motion.div>

            {/* Primary CTA — above the car */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="flex justify-center"
            >
              <Button
                size="lg"
                className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-12 py-7 rounded-full shadow-[0_0_20px_hsl(51_100%_50%/0.6),0_0_40px_hsl(51_100%_50%/0.4)] hover:shadow-[0_0_30px_hsl(51_100%_50%/0.8),0_0_60px_hsl(51_100%_50%/0.6)] transition-all"
                onClick={() => navigate("/rider/create-request")}
              >
                Post a Trip
              </Button>
            </motion.div>

            {/* 3D car centerpiece */}
            <div className="-mt-2 mb-2 md:-mt-4 md:mb-4">
              <Suspense
                fallback={
                  <div className="h-[440px] w-full sm:h-[560px] md:h-[680px] lg:h-[760px]" />
                }
              >
                <CashCar3D />
              </Suspense>
            </div>

            {/* Secondary CTA — below the car */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="flex justify-center mb-12"
            >
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground text-lg px-12 py-7 rounded-full shadow-[0_0_20px_hsl(51_100%_50%/0.6),0_0_40px_hsl(51_100%_50%/0.4)] hover:shadow-[0_0_30px_hsl(51_100%_50%/0.8),0_0_60px_hsl(51_100%_50%/0.6)] transition-all"
                onClick={() => navigate("/trips")}
              >
                Respond to Trips
              </Button>
            </motion.div>

            <motion.div {...reveal}>
              <div className="border-l-4 border-primary pl-6 py-4 mb-8 max-w-3xl mx-auto text-left">
                <p className="text-foreground/90 text-lg italic">
                  "Powered by people, Driven by Cash. Earn More, Save More with Cash Ridez. Your Community Travel Network."
                </p>
              </div>

              <p className="text-lg text-foreground/80 mb-10 max-w-2xl mx-auto">
                Connect with locals. Coordinate travel. Move together.
              </p>
            </motion.div>

            {/* Trust Badges */}
            <div className="flex flex-wrap items-center justify-center gap-8 mb-8">
              {trustBadges.map(badge => (
                <div key={badge.label} className="flex items-center gap-3 text-sm">
                  <div className="w-10 h-10 rounded-full border-2 border-primary/40 flex items-center justify-center">
                    <badge.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-medium text-foreground">{badge.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why Join CashRidez */}
      <section className="py-24 bg-background border-y border-border/30">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <motion.h2 {...reveal} className="text-4xl md:text-5xl font-bold text-center mb-16 text-primary">
              Why Join CashRidez?
            </motion.h2>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              {whyCards.map((card, i) => (
                <motion.div
                  key={card.title}
                  {...reveal}
                  transition={{ ...reveal.transition, delay: i * 0.06 }}
                >
                  <Card className="h-full p-8 border border-border/50 hover:border-primary/40 transition-all rounded-2xl bg-card hover:shadow-[0_0_40px_hsl(51_100%_50%/0.08)]">
                    <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mb-6">
                      <card.icon className="w-7 h-7 text-primary" />
                    </div>
                    <h3 className="text-2xl font-bold mb-4 text-foreground">{card.title}</h3>
                    <p className="text-foreground/70 leading-relaxed">{card.body}</p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <motion.div {...reveal} className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-primary">
              How It Works
            </h2>
            <p className="text-xl text-foreground/70 max-w-2xl mx-auto font-medium">
              Simple, Safe, and Social - Getting started takes just a few minutes
            </p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
            {steps.map((step, i) => (
              <motion.div
                key={step.n}
                {...reveal}
                transition={{ ...reveal.transition, delay: i * 0.1 }}
                className="text-center"
              >
                <div className="w-20 h-20 rounded-full bg-primary/20 text-primary text-3xl font-bold flex items-center justify-center mx-auto mb-6 border-2 border-primary/40">
                  {step.n}
                </div>
                <h3 className="text-2xl font-bold mb-4 text-foreground">{step.title}</h3>
                <p className="text-foreground/70 text-lg leading-relaxed">{step.body}</p>
              </motion.div>
            ))}
          </div>
          <motion.p {...reveal} className="text-center text-foreground/60 mt-12 max-w-2xl mx-auto text-lg font-medium">
            CashRidez never books or manages trips, we simply help people connect and communicate.
          </motion.p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-background border-t border-border/30">
        <div className="container mx-auto px-4">
          <motion.div {...reveal}>
            <Card className="p-12 md:p-16 bg-card border border-border/50 text-center max-w-4xl mx-auto rounded-3xl">
              <h2 className="text-4xl md:text-5xl font-bold mb-6 text-primary">Need Help? We're Here! 👋</h2>
              <p className="text-xl mb-10 text-foreground/80 font-medium">
                Have questions? Our support team is ready to assist you
              </p>
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-12 py-7 rounded-full" onClick={() => navigate("/auth")}>
                Contact Support
              </Button>
            </Card>
          </motion.div>
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
      <SupportDialog open={supportDialogOpen} onOpenChange={setSupportDialogOpen} />
    </div>
  );
};

export default NewHome;
