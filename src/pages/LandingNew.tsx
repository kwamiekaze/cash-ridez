import { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, DollarSign, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SplashScreen } from '@/components/SplashScreen';
import { MapBackground } from '@/components/MapBackground';
import { Navigation } from '@/components/Navigation';
import { HeroSection } from '@/components/HeroSection';
import { CashCarIcon } from '@/components/CashCarIcon';
import SupportDialog from '@/components/SupportDialog';
export default function LandingNew() {
  const [showSplash, setShowSplash] = useState(true);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const navigate = useNavigate();
  const steps = [{
    number: '01',
    title: 'Join & Verify',
    description: 'Create your profile and verify your ID to join our trusted community network'
  }, {
    number: '02',
    title: 'Post or Explore Trips',
    description: 'Share your travel plans or browse trip requests in your area'
  }, {
    number: '03',
    title: 'Chat & Coordinate',
    description: 'Message others, plan travel details, and arrange everything privately'
  }];
  const benefits = [{
    title: 'No Upfront Cost',
    description: 'Join the CashRidez community for free - no hidden fees or upfront payments.'
  }, {
    title: 'Request a Trip for Free',
    description: 'Post your pickup and drop-off locations in seconds. Fast, convenient, and completely free.'
  }, {
    title: 'Accept a Trip for Free',
    description: 'Drivers can view and accept available trip requests at no charge.'
  }, {
    title: 'Set Your Price',
    description: 'Riders set the price on their trip postings, drivers can accept any posted trip or counter offer.'
  }, {
    title: 'Safe & Trusted Community',
    description: 'Every member is part of a verified network built on safety and respect.'
  }, {
    title: 'Verified Members Only',
    description: 'All users are verified through our secure system to maintain reliability.'
  }];
  return <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} duration={3000} />}
      
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-white via-gray-50 to-white dark:from-black dark:via-gray-950 dark:to-black">
        {/* Global Map Background */}
        <MapBackground intensity="subtle" className="fixed inset-0 z-0" />
        
        <div className="relative z-10">
          <Navigation />
          
          {/* Hero Section with Animated Map */}
          <section className="relative min-h-screen flex flex-col overflow-hidden">
            {/* Animated Map Background for Hero */}
            <MapBackground showAnimatedCar showRiders intensity="prominent" className="absolute inset-0 z-0 pointer-events-none" />
            
            {/* Top Section with Buttons and Car */}
            <div className="relative z-50 pt-36 pb-4">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* CTA Buttons at Top */}
                <motion.div initial={{
                opacity: 0,
                y: -20
              }} animate={{
                opacity: 1,
                y: 0
              }} transition={{
                duration: 0.8,
                delay: 0.2
              }} className="flex flex-col items-center gap-6">
                  <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                    <button onClick={() => navigate("/auth")} className="w-full sm:w-auto px-16 py-6 text-2xl font-bold rounded-2xl transition-all hover:scale-105 flex items-center justify-center gap-3 bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-500 hover:from-yellow-600 hover:via-yellow-500 hover:to-yellow-600 text-black shadow-lg shadow-yellow-500/50 hover:shadow-yellow-500/70">
                      <span>📍</span>
                      Post a Trip
                    </button>
                    <button onClick={() => navigate("/auth")} className="w-full sm:w-auto px-16 py-6 text-2xl font-bold rounded-2xl border-2 border-emerald-400 transition-all hover:scale-105 flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500/20 to-yellow-500/20 backdrop-blur-sm text-gray-900 dark:text-white hover:from-emerald-500/30 hover:to-yellow-500/30">
                      <CashCarIcon width={48} height={24} glowIntensity="low" />
                      Respond to Trips
                    </button>
                  </div>
                  
                  {/* Trust Badges */}
                  <motion.div initial={{
                  opacity: 0,
                  y: 10
                }} animate={{
                  opacity: 1,
                  y: 0
                }} transition={{
                  duration: 0.8,
                  delay: 0.4
                }} className="flex flex-wrap justify-center gap-6 text-sm sm:text-base">
                    <div className="flex items-center gap-2">
                      <Check className="w-6 h-6 text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)] stroke-[3]" />
                      <span className="font-medium text-neutral-50">ID Verified</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-6 h-6 text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)] stroke-[3]" />
                      <span className="font-medium text-green-700">Safe Connections</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-6 h-6 text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)] stroke-[3]" />
                      <span className="font-medium text-amber-400">Community-Driven</span>
                    </div>
                  </motion.div>
                </motion.div>
              </div>
            </div>
            
            {/* Slogan Section */}
            <div className="relative z-10 pt-8">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <motion.p initial={{
                opacity: 0,
                y: 10
              }} animate={{
                opacity: 1,
                y: 0
              }} transition={{
                duration: 0.8,
                delay: 0.6
              }} className="text-center text-2xl md:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  Powered by People, driven by cash. Earn more, save more.
                </motion.p>
              </div>
            </div>

            {/* Hero Content Below */}
            <div className="relative z-10 flex-1 flex items-center justify-center pt-4">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="text-center space-y-6">
                  {/* Main Heading */}
                  <motion.h1 initial={{
                  opacity: 0,
                  y: 30
                }} animate={{
                  opacity: 1,
                  y: 0
                }} transition={{
                  duration: 0.8,
                  delay: 0.4
                }} className="text-5xl md:text-7xl lg:text-8xl font-bold gold-shimmer">Keep 100% of your earnings💰</motion.h1>

                  {/* Subtext */}
                  <motion.p initial={{
                  opacity: 0,
                  y: 20
                }} animate={{
                  opacity: 1,
                  y: 0
                }} transition={{
                  duration: 0.8,
                  delay: 0.6
                }} className="text-xl md:text-2xl max-w-3xl mx-auto py-[65px] text-stone-400">CashRidez connects riders and drivers directly for cash based rides with zero commissions. Join our ID-verified community powered transportation network. Maintain excellent ratings to qualify for weekly prizes and exclusive giveaways!</motion.p>
                </div>
              </div>
            </div>
          </section>
          
          <HeroSection />

          {/* How It Works */}
          <section id="how-it-works" className="relative py-24 bg-gradient-to-b from-gray-50 via-white to-gray-50 dark:from-black dark:via-gray-900 dark:to-black overflow-hidden">
            <MapBackground showAnimatedCar showRiders intensity="subtle" className="absolute inset-0 z-0 pointer-events-none" />
            <div className="container mx-auto px-4 relative z-10">
          <motion.div initial={{
              opacity: 0,
              y: 20
            }} whileInView={{
              opacity: 1,
              y: 0
            }} viewport={{
              once: true
            }} className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-emerald-500 bg-clip-text text-transparent">
              How It Works
            </h2>
            <p className="text-gray-600 dark:text-gray-300 text-lg">
              Simple, Safe, and Social - Getting started takes just a few minutes
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {steps.map((step, i) => <motion.div key={i} initial={{
                opacity: 0,
                y: 30
              }} whileInView={{
                opacity: 1,
                y: 0
              }} viewport={{
                once: true
              }} transition={{
                delay: i * 0.2
              }} className="relative bg-white dark:bg-gray-900 border border-yellow-500/30 dark:border-yellow-500/20 rounded-2xl p-8 hover:border-yellow-500/50 dark:hover:border-yellow-500/40 transition-all shadow-lg dark:shadow-none">
                <div className="w-16 h-16 bg-gradient-to-br from-yellow-500 to-emerald-500 rounded-full flex items-center justify-center text-2xl font-bold text-black mb-6 border-2 border-yellow-300 shadow-md">
                  {step.number}
                </div>
                <h3 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">{step.title}</h3>
                <p className="text-gray-600 dark:text-gray-300">{step.description}</p>
                <div className="absolute top-4 right-4">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
                </div>
              </motion.div>)}
          </div>
        </div>
      </section>

      {/* Why Join CashRidez */}
      <section id="community" className="relative py-24 overflow-hidden">
        <MapBackground showAnimatedCar showRiders intensity="subtle" className="absolute inset-0 z-0 pointer-events-none" />
        <div className="container mx-auto px-4 relative z-10">
          <motion.div initial={{
              opacity: 0,
              y: 20
            }} whileInView={{
              opacity: 1,
              y: 0
            }} viewport={{
              once: true
            }} className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-emerald-500 bg-clip-text text-transparent">
              Why Join CashRidez?
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
            {benefits.map((benefit, i) => <motion.div key={i} initial={{
                opacity: 0,
                scale: 0.95
              }} whileInView={{
                opacity: 1,
                scale: 1
              }} viewport={{
                once: true
              }} transition={{
                delay: i * 0.1
              }} className="bg-white dark:bg-gray-900 border border-yellow-500/30 dark:border-yellow-500/20 rounded-xl p-6 hover:border-emerald-500/50 dark:hover:border-emerald-500/40 transition-all text-center shadow-lg dark:shadow-none">
                <h3 className="text-xl font-bold mb-3 text-yellow-600 dark:text-yellow-400">{benefit.title}</h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">{benefit.description}</p>
              </motion.div>)}
          </div>

          <motion.div initial={{
              opacity: 0,
              y: 20
            }} whileInView={{
              opacity: 1,
              y: 0
            }} viewport={{
              once: true
            }} className="text-center mt-16">
            <p className="text-gray-600 dark:text-gray-300 text-sm max-w-3xl mx-auto">
              CashRidez never books or manages trips, we simply help people connect and communicate.
            </p>
            </motion.div>
          </div>
        </section>

        {/* Support Section */}
        <section id="support" className="relative py-24 bg-gradient-to-b from-white via-gray-50 to-white dark:from-black dark:via-gray-900 dark:to-black overflow-hidden">
          <MapBackground showAnimatedCar showRiders intensity="subtle" className="absolute inset-0 z-0 pointer-events-none" />
          <div className="container mx-auto px-4 text-center relative z-10">
          <motion.div initial={{
              opacity: 0,
              y: 20
            }} whileInView={{
              opacity: 1,
              y: 0
            }} viewport={{
              once: true
            }}>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
              Need Help? We're Here! 👋
            </h2>
            <p className="text-gray-600 dark:text-gray-300 text-lg mb-8">
              Have questions? Our support team is ready to assist you
            </p>
            <button onClick={() => setIsSupportOpen(true)} className="bg-gradient-to-r from-yellow-500 to-emerald-500 hover:from-yellow-600 hover:to-emerald-600 text-black font-bold text-lg px-12 py-4 rounded-lg shadow-lg shadow-yellow-500/50 hover:shadow-2xl transition-all hover:scale-105">
              Contact Support
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-yellow-500/20 py-12 bg-white dark:bg-black">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
            <div className="flex items-center gap-2">
              <a href="https://instagram.com/cash.ridez" target="_blank" rel="noopener noreferrer" className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-500 dark:hover:text-yellow-300 transition-colors">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              </a>
              <a href="https://www.tiktok.com/@cashridez" target="_blank" rel="noopener noreferrer" className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-500 dark:hover:text-yellow-300 transition-colors">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>
              </a>
              <a href="https://x.com/cashridez?s=21" target="_blank" rel="noopener noreferrer" className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-500 dark:hover:text-yellow-300 transition-colors">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
            </div>
            <div className="flex gap-6 text-gray-700 dark:text-gray-400 text-sm">
              <button onClick={() => navigate("/terms")} className="hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors">Terms</button>
              <button onClick={() => navigate("/privacy")} className="hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors">Privacy</button>
              <button onClick={() => setIsSupportOpen(true)} className="hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors">
                Contact
              </button>
            </div>
          </div>
          
          {/* Disclaimer */}
          <div className="border-t border-yellow-500/10 pt-8 text-center">
            <p className="text-xs text-gray-600 dark:text-gray-500 max-w-4xl mx-auto mb-4">
              CashRidez is a communication and networking platform designed to connect individuals for travel coordination. CashRidez does not arrange, control, or provide transportation services and is not responsible for user transactions or travel outcomes.
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-500">
              © 2025 CashRidez. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      <SupportDialog open={isSupportOpen} onOpenChange={setIsSupportOpen} />
        </div>
      </div>
    </>;
}