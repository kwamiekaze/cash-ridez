import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Navigation } from '@/components/Navigation';
import { HeroSection } from '@/components/HeroSection';
import SupportDialog from '@/components/SupportDialog';

export default function LandingNew() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const steps = [
    {
      number: '01',
      title: 'Join & Verify',
      description: 'Create your profile and verify your ID to join our trusted community network',
    },
    {
      number: '02',
      title: 'Post or Explore Trips',
      description: 'Share your travel plans or browse trip requests in your area',
    },
    {
      number: '03',
      title: 'Chat & Coordinate',
      description: 'Message others, plan travel details, and arrange everything privately',
    },
  ];

  const benefits = [
    {
      title: 'No Upfront Cost',
      description: 'Join the CashRidez community for free - no hidden fees or upfront payments.',
    },
    {
      title: 'Request a Trip for Free',
      description: 'Post your pickup and drop-off locations in seconds. Fast, convenient, and completely free.',
    },
    {
      title: 'Accept a Trip for Free',
      description: 'Drivers can view and accept available trip requests at no charge.',
    },
    {
      title: 'Safe & Trusted Community',
      description: 'Every member is part of a verified network built on safety and respect.',
    },
    {
      title: 'Verified Members Only',
      description: 'All users are verified through our secure system to maintain reliability.',
    },
  ];

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <Navigation />
      <HeroSection />

      {/* How It Works */}
      <section id="how-it-works" className="relative py-24 bg-gradient-to-b from-black to-gray-950">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              How It Works
            </h2>
            <p className="text-gray-400 text-lg">
              Simple, Safe, and Social - Getting started takes just a few minutes
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                className="relative bg-gradient-to-br from-gray-900/80 to-black/80 border border-white/10 rounded-2xl p-8 hover:border-gold/30 transition-all"
              >
                <div className="w-16 h-16 bg-gradient-to-br from-gold to-emerald rounded-full flex items-center justify-center text-2xl font-bold text-black mb-6">
                  {step.number}
                </div>
                <h3 className="text-2xl font-bold mb-4">{step.title}</h3>
                <p className="text-gray-400">{step.description}</p>
                <div className="absolute top-4 right-4">
                  <CheckCircle2 className="w-6 h-6 text-emerald/30" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Join CashRidez */}
      <section id="community" className="relative py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Why Join CashRidez?
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
            {benefits.map((benefit, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-gradient-to-br from-gray-900/80 to-black/80 border border-white/5 rounded-xl p-6 hover:border-emerald/30 transition-all"
              >
                <h3 className="text-xl font-bold mb-3 text-gold">{benefit.title}</h3>
                <p className="text-gray-400 text-sm">{benefit.description}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mt-16"
          >
            <p className="text-gray-400 text-sm">
              CashRidez never books or manages trips, we simply help people connect and communicate.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Support Section */}
      <section id="support" className="relative py-24 bg-gradient-to-b from-gray-950 to-black">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Need Help? We're Here! 👋
            </h2>
            <p className="text-gray-400 text-lg mb-8">
              Have questions? Our support team is ready to assist you
            </p>
            <button
              onClick={() => setIsSupportOpen(true)}
              className="bg-gradient-to-r from-gold to-emerald text-black font-bold text-lg px-12 py-4 rounded-lg hover:shadow-2xl hover:shadow-gold/50 transition-all"
            >
              Contact Support
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/5 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-gold to-emerald rounded-full flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-black" />
              </div>
              <span className="text-lg font-semibold text-gray-400">© 2025 CashRidez</span>
            </div>
            <div className="flex gap-6 text-gray-400 text-sm">
              <button className="hover:text-gold transition-colors">Terms</button>
              <button className="hover:text-gold transition-colors">Privacy</button>
              <button onClick={() => setIsSupportOpen(true)} className="hover:text-gold transition-colors">
                Contact
              </button>
            </div>
          </div>
        </div>
      </footer>

      <SupportDialog open={isSupportOpen} onOpenChange={setIsSupportOpen} />
    </div>
  );
}
