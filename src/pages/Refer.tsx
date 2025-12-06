import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Users, DollarSign, Gift, Car, Star, ArrowRight, CheckCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { SplashScreen } from "@/components/SplashScreen";

const Refer = () => {
  const navigate = useNavigate();
  const [showSplash, setShowSplash] = useState(true);

  // Set page-specific meta tags for SEO
  useEffect(() => {
    // Update document title
    document.title = "Georgia Cash Ride Referral Program | Earn Cash Referring Riders | CashRidez";
    
    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", "Join Georgia's #1 cash ride platform. Earn $10 per rider referral + bonus rewards. Track referrals, trips, and earnings with the CashRidez Referral Dashboard. Powered by People & Driven by Cash.");
    }

    // Update OG meta tags
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    const ogImageSecure = document.querySelector('meta[property="og:image:secure_url"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDesc = document.querySelector('meta[name="twitter:description"]');
    const twitterImage = document.querySelector('meta[name="twitter:image"]');

    if (ogTitle) ogTitle.setAttribute("content", "CashRidez Referral & Rewards – Earn Cash for Every Rider You Refer");
    if (ogDesc) ogDesc.setAttribute("content", "Georgia's leading cash ride referral system. Earn $10 per rider + bonus trip rewards.");
    if (ogUrl) ogUrl.setAttribute("content", "https://cashridez.com/refer");
    if (ogImage) ogImage.setAttribute("content", "https://cashridez.com/referrals/og-referral.jpg");
    if (ogImageSecure) ogImageSecure.setAttribute("content", "https://cashridez.com/referrals/og-referral.jpg");
    if (twitterTitle) twitterTitle.setAttribute("content", "CashRidez Referral & Rewards – Earn Cash for Every Rider You Refer");
    if (twitterDesc) twitterDesc.setAttribute("content", "Georgia's leading cash ride referral system. Earn $10 per rider + bonus trip rewards.");
    if (twitterImage) twitterImage.setAttribute("content", "https://cashridez.com/referrals/og-referral.jpg");

    // Add JSON-LD structured data
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'refer-jsonld';
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "CashRidez Referral Program",
      "description": "Join Georgia's #1 cash ride platform. Earn $10 per rider referral + bonus rewards.",
      "url": "https://cashridez.com/refer",
      "publisher": {
        "@type": "LocalBusiness",
        "name": "CashRidez",
        "description": "Georgia's leading rideshare alternative - cash ride platform powered by people and driven by cash",
        "@id": "https://cashridez.com",
        "url": "https://cashridez.com",
        "areaServed": {
          "@type": "State",
          "name": "Georgia",
          "containedInPlace": {
            "@type": "Country",
            "name": "United States"
          }
        },
        "serviceType": ["Ride Service", "Transportation Service", "Rideshare Alternative"],
        "keywords": "cash ride, cash rides, cash ride georgia, georgia cash rides, georgia cash ride platform, rideshare alternative georgia, cash ride referral, rider referral program"
      }
    });
    document.head.appendChild(script);

    // Cleanup on unmount
    return () => {
      const existingScript = document.getElementById('refer-jsonld');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

  const handleShare = async () => {
    const shareData = {
      title: "CashRidez Referral & Rewards – Earn Cash for Every Rider You Refer",
      text: "Georgia's leading cash ride referral system. Earn $10 per rider + bonus trip rewards.",
      url: "https://cashridez.com/refer"
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled or error
        console.log("Share cancelled");
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText("https://cashridez.com/refer");
        toast({
          title: "Link Copied!",
          description: "Referral page link copied to clipboard",
        });
      } catch {
        toast({
          title: "Share Error",
          description: "Could not copy link to clipboard",
          variant: "destructive",
        });
      }
    }
  };

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} duration={2500} />;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Hero Section */}
      <section className="relative py-16 px-4 md:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none" />
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h1 className="text-4xl md:text-6xl font-bold text-[#FACC15] mb-4 font-poppins">
            🚀 CashRidez Referral & Rewards System Is LIVE!
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-8">
            Powered by People 🚀 & Driven by Cash 💰
          </p>
        </div>
      </section>

      {/* OG Image Display */}
      <section className="px-4 md:px-8 pb-12">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-2xl border-2 border-[#FACC15]/30 overflow-hidden shadow-2xl shadow-yellow-500/10">
            <img 
              src="/referrals/og-referral.jpg" 
              alt="CashRidez Referral Dashboard - Track analytics, customize your code, and earn cash for every rider you refer"
              className="w-full h-auto"
            />
          </div>
        </div>
      </section>

      {/* Announcement Content */}
      <section className="px-4 md:px-8 py-12">
        <div className="max-w-4xl mx-auto space-y-12">
          
          {/* What Is It */}
          <div className="bg-black/50 border-2 border-[#FACC15]/30 rounded-2xl p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-[#FACC15] mb-6 flex items-center gap-3">
              <Gift className="w-8 h-8" />
              🎁 What Is It?
            </h2>
            <p className="text-lg text-white/90 leading-relaxed">
              A brand-new in-app Referral Dashboard where you can track your referrals, see how many trips your referrals have completed, and earn real cash rewards — just for spreading the word.
            </p>
          </div>

          {/* How It Works */}
          <div className="bg-black/50 border-2 border-[#FACC15]/30 rounded-2xl p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-[#FACC15] mb-6 flex items-center gap-3">
              <Star className="w-8 h-8" />
              💡 How It Works
            </h2>
            <ul className="space-y-4 text-lg text-white/90">
              <li className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-[#FACC15] mt-1 flex-shrink-0" />
                <span><strong>1.</strong> Go to your Profile → "My Referrals"</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-[#FACC15] mt-1 flex-shrink-0" />
                <span><strong>2.</strong> Copy your unique referral code or link</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-[#FACC15] mt-1 flex-shrink-0" />
                <span><strong>3.</strong> Share it with friends, family, coworkers, or your social media followers</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-[#FACC15] mt-1 flex-shrink-0" />
                <span><strong>4.</strong> When someone signs up using your code and becomes a Rider, you earn cash</span>
              </li>
            </ul>
          </div>

          {/* Earn Section */}
          <div className="bg-black/50 border-2 border-[#FACC15]/30 rounded-2xl p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-[#FACC15] mb-6 flex items-center gap-3">
              <DollarSign className="w-8 h-8" />
              💵 Earn $10 Cash for Every Rider Referral
            </h2>
            <div className="space-y-4 text-lg text-white/90">
              <p>For every person you refer who becomes a <strong>Subscribed Rider</strong>, you'll earn <strong>$10 cash</strong> — no limits.</p>
              <p className="text-[#FACC15] font-semibold">Refer 10 people = Earn $100.</p>
              <p className="text-[#FACC15] font-semibold">Refer 100 people = Earn $1,000.</p>
            </div>
          </div>

          {/* Bonus Rewards */}
          <div className="bg-black/50 border-2 border-[#FACC15]/30 rounded-2xl p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-[#FACC15] mb-6 flex items-center gap-3">
              <Car className="w-8 h-8" />
              🚗 BONUS: Earn from Their Free Trips Too!
            </h2>
            <div className="space-y-4 text-lg text-white/90">
              <p>Every new user gets <strong>3 Free Trial Trips</strong>.</p>
              <p>If someone you referred takes a trip during their free trial, you'll earn <strong>$1 per trip</strong> (up to <strong>$3 max per referral</strong>).</p>
              <div className="bg-[#FACC15]/10 border border-[#FACC15]/30 rounded-xl p-4 mt-4">
                <p className="font-semibold text-[#FACC15]">
                  That means you could earn up to $13 total per referral ($10 for subscription + $3 from their trial trips).
                </p>
              </div>
            </div>
          </div>

          {/* What You Can Track */}
          <div className="bg-black/50 border-2 border-[#FACC15]/30 rounded-2xl p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-[#FACC15] mb-6 flex items-center gap-3">
              <Users className="w-8 h-8" />
              📊 What You Can Track in the Dashboard
            </h2>
            <ul className="space-y-3 text-lg text-white/90">
              <li className="flex items-center gap-3">
                <ArrowRight className="w-5 h-5 text-[#FACC15]" />
                <span>Your unique referral code (customize it once before first use!)</span>
              </li>
              <li className="flex items-center gap-3">
                <ArrowRight className="w-5 h-5 text-[#FACC15]" />
                <span>Shareable referral link for easy sharing</span>
              </li>
              <li className="flex items-center gap-3">
                <ArrowRight className="w-5 h-5 text-[#FACC15]" />
                <span>List of everyone you referred</span>
              </li>
              <li className="flex items-center gap-3">
                <ArrowRight className="w-5 h-5 text-[#FACC15]" />
                <span>Their verification status, subscription status, and role</span>
              </li>
              <li className="flex items-center gap-3">
                <ArrowRight className="w-5 h-5 text-[#FACC15]" />
                <span>Number of trips they've completed</span>
              </li>
            </ul>
          </div>

          {/* Who Can Use It */}
          <div className="bg-black/50 border-2 border-[#FACC15]/30 rounded-2xl p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-[#FACC15] mb-6">
              🌍 Who Can Use the Referral System?
            </h2>
            <p className="text-lg text-white/90 leading-relaxed">
              Everyone with a CashRidez account. Riders, Drivers, Admins — if you're verified, you've got a referral code.
            </p>
          </div>

          {/* Why Refer */}
          <div className="bg-black/50 border-2 border-[#FACC15]/30 rounded-2xl p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-[#FACC15] mb-6">
              🔥 Why Refer People to CashRidez?
            </h2>
            <ul className="space-y-3 text-lg text-white/90">
              <li className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span>Help grow a <strong>community-powered</strong> rideshare alternative</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span>Help riders <strong>save money</strong> and help drivers <strong>earn more</strong></span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span>Get <strong>real cash rewards</strong> for every person you refer</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span>Be part of the <strong>first wave</strong> — early adopters win big</span>
              </li>
            </ul>
          </div>

          {/* CTA Section */}
          <div className="text-center py-8">
            <p className="text-2xl md:text-3xl font-bold text-[#FACC15] mb-6">
              Start sharing. Start earning. Let's grow this together. 🚀💰
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button 
                onClick={() => navigate("/auth")}
                className="bg-[#FACC15] hover:bg-[#FACC15]/90 text-black font-bold text-lg px-8 py-6 rounded-xl"
              >
                Get Started
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button 
                onClick={handleShare}
                variant="outline"
                className="border-2 border-[#FACC15] text-[#FACC15] hover:bg-[#FACC15]/10 font-bold text-lg px-8 py-6 rounded-xl"
              >
                <Share2 className="mr-2 w-5 h-5" />
                Share This Page
              </Button>
            </div>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#FACC15]/20 py-8 px-4 text-center">
        <p className="text-white/60 text-sm">
          © {new Date().getFullYear()} CashRidez. Georgia's #1 Cash Ride Platform.
        </p>
        <p className="text-[#FACC15] text-sm mt-2">
          Powered by People 🚀 & Driven by Cash 💰
        </p>
      </footer>
    </div>
  );
};

export default Refer;
