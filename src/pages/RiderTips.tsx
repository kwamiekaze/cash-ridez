import { Helmet } from "react-helmet-async";
import RoleGuard from "@/components/RoleGuard";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Clock, 
  MapPin, 
  DollarSign, 
  CreditCard, 
  Phone, 
  Wallet, 
  Star,
  Lightbulb
} from "lucide-react";

const tips = [
  {
    icon: Clock,
    title: "Post Trip Requests Early",
    content: "Post trip requests as early as you know you'll need a ride. Posting early gives drivers sufficient time to review, accept, or negotiate."
  },
  {
    icon: MapPin,
    title: "Update Your Map Pin for Better Matches",
    content: "Before posting a trip, allow location access and update your approximate map pin. This helps nearby drivers see your request faster. Your exact address is never shared publicly — only approximate location."
  },
  {
    icon: DollarSign,
    title: "Be Fair With Offers",
    content: "CashRidez lets you negotiate directly with drivers. Consider distance, time of day, and traffic. A fair offer gets accepted faster."
  },
  {
    icon: CreditCard,
    title: "Payment Type",
    content: "Mention your preferred payment type(s) in the trip details if it's not cash."
  },
  {
    icon: Phone,
    title: "In-App Calling Setup",
    content: "Add a phone number to your profile and save the following number to your contacts for easy in-app calling. Your number is never shared publicly.",
    highlight: "+1 (678) 928-8816"
  },
  {
    icon: Wallet,
    title: "Payment Expectation",
    content: "You're expected to pay the driver upon the driver's arrival, as you enter their vehicle."
  },
  {
    icon: Star,
    title: "Rate After Your Trip",
    content: "Ratings help build a trusted community. Be honest and respectful."
  }
];

const RiderTipsContent = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Rider Tips | CashRidez</title>
        <meta name="description" content="Ride smarter, save more, and connect faster with these essential CashRidez rider tips." />
      </Helmet>
      
      <AppHeader showCar={true} />
      
      <main className="container mx-auto px-4 py-6 md:py-10 max-w-4xl">
        {/* Header Section */}
        <div className="text-center mb-8 md:mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Lightbulb className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-3">
            CashRidez Rider Tips
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground">
            Ride Smarter. Save More. Connect Faster.
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
                {tip.highlight && (
                  <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
                    <Phone className="w-4 h-4 text-primary" />
                    <span className="font-mono font-semibold text-primary">
                      {tip.highlight}
                    </span>
                  </div>
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

const RiderTips = () => {
  return (
    <RoleGuard requiredRole="rider">
      <RiderTipsContent />
    </RoleGuard>
  );
};

export default RiderTips;
