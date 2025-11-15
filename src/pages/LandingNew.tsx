import { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SplashScreen } from '@/components/SplashScreen';
import { MapBackground } from '@/components/MapBackground';
import { Navigation } from '@/components/Navigation';
import { HeroSection } from '@/components/HeroSection';
import SupportDialog from '@/components/SupportDialog';

export default function LandingNew() {
  const [showSplash, setShowSplash] = useState(true);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const navigate = useNavigate();

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

  return (
    <>
      {showSplash && (
        <SplashScreen onComplete={() => setShowSplash(false)} duration={3000} />
      )}
      
      <div className="min-h-screen relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #020610 0%, #071214 40%, #0a1a1f 100%)' }}>
        {/* Global Map Background */}
        <MapBackground intensity="subtle" className="fixed inset-0 z-0" />
        
        <div className="relative z-10">
          <Navigation />
          
          {/* Hero Section with Animated Map */}
          <section className="relative min-h-screen flex flex-col overflow-hidden">
            {/* Animated Map Background for Hero */}
            <MapBackground 
              showAnimatedCar 
              showRiders 
              intensity="prominent" 
              className="absolute inset-0"
            />
            
            {/* Top Section with Buttons and Car */}
            <div className="relative z-10 pt-32 pb-8">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* CTA Buttons at Top */}
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8"
                >
                  <button
                    onClick={() => navigate("/auth")}
                    className="w-full sm:w-auto px-12 py-5 text-xl font-semibold rounded-2xl transition-all hover:scale-105 flex items-center justify-center gap-3 shadow-2xl"
                    style={{
                      background: '#F9E27D',
                      color: '#000000',
                      boxShadow: '0 8px 32px rgba(249, 226, 125, 0.6)',
                    }}
                  >
                    <span>📍</span>
                    Post a Trip
                  </button>
                  <button
                    onClick={() => navigate("/auth")}
                    className="w-full sm:w-auto px-12 py-5 text-xl font-semibold rounded-2xl border-3 transition-all hover:scale-105 flex items-center justify-center gap-3"
                    style={{
                      borderColor: '#F9E27D',
                      borderWidth: '3px',
                      color: '#F9E27D',
                      backgroundColor: 'transparent',
                    }}
                  >
                    <span>🚗</span>
                    Respond to Trips
                  </button>
                </motion.div>
              </div>
            </div>
            
            {/* Hero Content Below */}
            <div className="relative z-10 flex-1 flex items-center justify-center">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                <div className="text-center space-y-8">
                  {/* Main Heading */}
                  <motion.h1
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                    className="text-5xl md:text-7xl lg:text-8xl font-bold"
                    style={{
                      background: 'linear-gradient(90deg, #F9E27D 0%, #FFD700 50%, #F9E27D 100%)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      textShadow: '0 0 40px rgba(249, 226, 125, 0.3)'
                    }}
                  >
                    Keep 100% of your cash rides.
                  </motion.h1>

                  {/* Subtext */}
                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.6 }}
                    className="text-xl md:text-2xl max-w-3xl mx-auto"
                    style={{ color: 'rgba(249, 226, 125, 0.8)' }}
                  >
                    CashRidez connects riders and drivers directly for cash-only rides. 
                    No commissions. No fees. Just community-powered transportation.
                  </motion.p>
                </div>
              </div>
            </div>
          </section>
          
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
      </div>
    </>
  );
}
