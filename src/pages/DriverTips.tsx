import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import RoleGuard from "@/components/RoleGuard";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  MapPin, 
  Clock, 
  CreditCard, 
  Phone, 
  Car, 
  Star,
  XCircle,
  TrendingUp,
  Lightbulb
} from "lucide-react";
import { useAnalyticsEvents } from "@/hooks/useAnalyticsEvents";
import { supabase } from "@/integrations/supabase/client";

const tips = [
  {
    icon: MapPin,
    title: "Keep Your Map Pin Updated",
    content: "Before browsing or responding to trip requests:",
    bullets: [
      "Allow location access",
      "Update your approximate map pin"
    ],
    footer: "This helps nearby riders see you faster and improves the quality of trip matches. Your exact location is never shared publicly — only an approximate location is shown."
  },
  {
    icon: Clock,
    title: "Respond Quickly to Trip Requests",
    content: "Trip requests can be competitive. Responding quickly:",
    bullets: [
      "Increases your chances of securing the trip",
      "Builds trust with riders",
      "Helps you earn more consistently"
    ],
    footer: "Even if you plan to negotiate, a quick response goes a long way."
  },
  {
    icon: CreditCard,
    title: "Clarify Payment Method Upfront",
    content: "CashRidez defaults to cash payments, but some riders may prefer other payment methods. If you're unsure, confirm the payment method with the rider before arrival."
  },
  {
    icon: Phone,
    title: "Enable In-App Calling",
    content: "For smooth coordination with riders:",
    bullets: [
      "Add a phone number to your profile",
      "Save the CashRidez calling number to your contacts"
    ],
    highlight: "+1 (678) 928-8816",
    footer: "Your phone number is never shared publicly with riders."
  },
  {
    icon: Car,
    title: "Arrival & Payment Expectations",
    content: "Once you arrive at the pickup location:",
    bullets: [
      "Confirm the rider",
      "Collect payment before or as the rider enters the vehicle"
    ],
    footer: "This keeps trips professional and helps prevent disputes."
  },
  {
    icon: Star,
    title: "Complete Trips & Rate Riders",
    content: "After completing a trip:",
    bullets: [
      "Rate the rider honestly",
      "Leave respectful feedback when appropriate"
    ],
    footer: "Ratings help build trust and protect drivers across the platform."
  },
  {
    icon: XCircle,
    title: "Cancel Responsibly",
    content: "If you must cancel a trip:",
    bullets: [
      "Cancel as early as possible",
      "Communicate clearly with the rider"
    ],
    footer: "Frequent or late cancellations may negatively affect your account standing."
  },
  {
    icon: TrendingUp,
    title: "Build Your Reputation",
    content: "Consistent professionalism leads to better outcomes:",
    bullets: [
      "Fair pricing",
      "On-time arrivals",
      "Clear communication",
      "Honest ratings"
    ],
    footer: "Strong ratings help unlock better trip opportunities over time."
  }
];

const DriverTipsContent = () => {
  const { trackEvent } = useAnalyticsEvents();

  // Mark tips as visited on mount and track page view
  useEffect(() => {
    const markVisited = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({
            driver_tips_visited: true,
            driver_tips_visited_at: new Date().toISOString()
          })
          .eq('id', user.id);
      }
    };
    
    markVisited();
    trackEvent({
      eventName: 'tips_page_viewed',
      pagePath: '/driver/tips',
      role: 'driver'
    });
  }, [trackEvent]);

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Driver Tips | CashRidez</title>
        <meta name="description" content="Earn more, move smarter, and build trust with these essential CashRidez driver tips." />
      </Helmet>
      
      <AppHeader showCar={true} />
      
      <main className="container mx-auto px-4 py-6 md:py-10 max-w-4xl">
        {/* Header Section */}
        <div className="text-center mb-8 md:mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Lightbulb className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-3">
            CashRidez Driver Tips
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground">
            Earn More. Move Smarter. Build Trust.
          </p>
        </div>

        {/* Intro Paragraph */}
        <div className="mb-8 md:mb-10 text-center">
          <p className="text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            CashRidez is powered by people and driven by cash. These tips are designed to help you earn more, secure better trip matches, and build a strong, trusted reputation on the platform.
          </p>
        </div>

        {/* Tips Grid */}
        <div className="space-y-4 md:space-y-6">
          {tips.map((tip, index) => (
            <Card key={index} className="border-border bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-3 text-lg md:text-xl">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <tip.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-foreground">{tip.title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pl-[4.25rem]">
                <p className="text-muted-foreground leading-relaxed">
                  {tip.content}
                </p>
                {tip.bullets && (
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {tip.bullets.map((bullet, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {tip.highlight && (
                  <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
                    <Phone className="w-4 h-4 text-primary" />
                    <span className="font-mono font-semibold text-primary">
                      {tip.highlight}
                    </span>
                  </div>
                )}
                {tip.footer && (
                  <p className="mt-3 text-muted-foreground/80 text-sm leading-relaxed">
                    {tip.footer}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer Note */}
        <div className="mt-8 md:mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            Need help? Reach out to our support team anytime.
          </p>
        </div>
      </main>
    </div>
  );
};

const DriverTips = () => {
  return (
    <RoleGuard requiredRole="driver">
      <DriverTipsContent />
    </RoleGuard>
  );
};

export default DriverTips;
