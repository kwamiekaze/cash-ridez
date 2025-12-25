import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { MapPin, DollarSign, MessageCircle, Phone, Car, Star, Users, CheckCircle2 } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { MapBackground } from '@/components/MapBackground';
import { Button } from '@/components/ui/button';
import { CashCarIcon } from '@/components/CashCarIcon';

// Section IDs for navigation
const SECTIONS = [
  { id: 'rider-flow', label: 'Rider Flow' },
  { id: 'driver-flow', label: 'Driver Flow' },
  { id: 'community', label: 'Community-First' },
];

// Sticky section navigation
function StickyNav({ activeSection }: { activeSection: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="fixed top-20 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-yellow-500/20"
    >
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-center gap-2 md:gap-6 overflow-x-auto">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => {
                document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all whitespace-nowrap ${
                activeSection === section.id
                  ? 'bg-gradient-to-r from-yellow-500 to-emerald-500 text-black'
                  : 'text-gray-400 hover:text-yellow-400'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// Step card component for rider/driver flows
function StepCard({ 
  number, 
  title, 
  children, 
  icon: Icon 
}: { 
  number: number; 
  title: string; 
  children: React.ReactNode;
  icon: React.ElementType;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.5, delay: number * 0.1 }}
      className="relative bg-gradient-to-br from-gray-900/80 to-black/80 border border-yellow-500/30 rounded-2xl p-6 md:p-8 hover:border-yellow-500/50 transition-all group"
    >
      {/* Step number badge */}
      <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-to-br from-yellow-500 to-emerald-500 rounded-full flex items-center justify-center text-xl font-bold text-black shadow-lg shadow-yellow-500/30">
        {number}
      </div>
      
      {/* Icon */}
      <div className="absolute top-4 right-4 w-10 h-10 bg-yellow-500/10 rounded-full flex items-center justify-center">
        <Icon className="w-5 h-5 text-yellow-400" />
      </div>
      
      <h3 className="text-xl md:text-2xl font-bold mt-4 mb-4 pr-12 gold-shimmer">{title}</h3>
      <div className="text-gray-300 space-y-3">
        {children}
      </div>
    </motion.div>
  );
}

// Section observer hook
function useActiveSection() {
  const [activeSection, setActiveSection] = useState('rider-flow');
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-40% 0px -40% 0px', threshold: 0.1 }
    );
    
    SECTIONS.forEach((section) => {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    });
    
    return () => observer.disconnect();
  }, []);
  
  return activeSection;
}

export default function HowItWorks() {
  const navigate = useNavigate();
  const activeSection = useActiveSection();
  
  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-black via-gray-950 to-black">
      {/* Global Map Background */}
      <MapBackground intensity="subtle" className="fixed inset-0 z-0" />
      
      <div className="relative z-10">
        <Navigation />
        <StickyNav activeSection={activeSection} />
        
        {/* Hero Section */}
        <section className="relative pt-44 pb-20 overflow-hidden">
          <MapBackground showRiders intensity="prominent" className="absolute inset-0 z-0 pointer-events-none" />
          
          {/* Animated Car - Background layer with smooth easing */}
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={{ 
              opacity: 0.25, 
              x: [0, 20, 0],
            }}
            transition={{ 
              opacity: { duration: 1, ease: "easeOut" },
              x: { duration: 8, repeat: Infinity, ease: "easeInOut" }
            }}
            className="absolute top-32 left-1/2 -translate-x-1/2 z-0 pointer-events-none md:top-36"
            style={{ maxWidth: '120px' }}
          >
            <CashCarIcon width={100} height={50} glowIntensity="medium" />
          </motion.div>
          
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-4xl mx-auto text-center">
              {/* Main Heading */}
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="text-5xl md:text-7xl font-bold gold-shimmer"
              >
                How CashRidez Works
              </motion.h1>
              
              {/* Subtitle - with breathing room */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="text-xl md:text-2xl max-w-3xl mx-auto gold-shimmer mt-6 mb-12"
              >
                A simple step-by-step flow for riders and independent drivers to connect, negotiate, and ride with confidence.
              </motion.p>
              
              {/* Divider + Buttons Group - Raised upward */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="relative -mt-4"
              >
                {/* Thin divider line */}
                <div className="w-32 h-px bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent mx-auto mb-6" />
                
                {/* Flow Buttons */}
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <button
                    onClick={() => document.getElementById('rider-flow')?.scrollIntoView({ behavior: 'smooth' })}
                    className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold rounded-full hover:scale-105 transition-all shadow-lg shadow-yellow-500/30"
                  >
                    Rider Flow
                  </button>
                  <button
                    onClick={() => document.getElementById('driver-flow')?.scrollIntoView({ behavior: 'smooth' })}
                    className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-black font-bold rounded-full hover:scale-105 transition-all shadow-lg shadow-emerald-500/30"
                  >
                    Driver Flow
                  </button>
                  <button
                    onClick={() => document.getElementById('community')?.scrollIntoView({ behavior: 'smooth' })}
                    className="px-8 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-bold rounded-full hover:scale-105 transition-all shadow-lg shadow-purple-500/30"
                  >
                    Community-First
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        </section>
        
        {/* Introduction */}
        <section className="relative py-16 overflow-hidden">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-4xl mx-auto text-center"
            >
              <p className="text-lg md:text-xl text-gray-300 leading-relaxed">
                CashRidez is a ride-connection platform designed to help riders and independent drivers connect directly, negotiate fairly, and arrange affordable transportation without surge pricing. Below is a step-by-step breakdown of how the CashRidez experience works for both riders and drivers.
              </p>
            </motion.div>
          </div>
        </section>
        
        {/* Rider Flow Section */}
        <section id="rider-flow" className="relative py-24 overflow-hidden">
          <MapBackground showAnimatedCar intensity="subtle" className="absolute inset-0 z-0 pointer-events-none" />
          
          <div className="container mx-auto px-4 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl md:text-5xl font-bold mb-4 gold-shimmer">
                For Riders: Requesting a Trip
              </h2>
              <p className="text-gray-400 text-lg">How riders post trips, negotiate, and connect with drivers</p>
            </motion.div>
            
            <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
              <StepCard number={1} title="Create a Trip Request" icon={MapPin}>
                <p>Riders begin by posting a trip inside the CashRidez app or platform. When creating a trip, the rider enters:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                  <li>Pickup location</li>
                  <li>Drop-off location</li>
                  <li>Preferred pickup time</li>
                  <li>Any helpful trip notes (luggage, number of passengers, special requests, etc.)</li>
                </ul>
                <p className="text-gray-400 italic">This information helps nearby drivers quickly understand the trip details.</p>
              </StepCard>
              
              <StepCard number={2} title="Set Your Initial Offer" icon={DollarSign}>
                <p>After entering the trip details, the rider sets an initial price offer they are willing to pay for the trip.</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                  <li>This offer is not final</li>
                  <li>There is no surge pricing</li>
                  <li>Riders stay in control of what they're willing to pay</li>
                </ul>
                <p className="text-gray-400 italic">Once posted, the trip becomes visible to nearby independent drivers.</p>
              </StepCard>
              
              <StepCard number={3} title="Review Driver Responses" icon={CheckCircle2}>
                <p>Drivers who are interested in the trip may respond in one of two ways:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                  <li>Accept the rider's initial offer, or</li>
                  <li>Submit a counter-offer (bid) with a different price</li>
                </ul>
                <p className="text-gray-400 italic">This gives riders flexibility to choose what works best for their budget and timing.</p>
              </StepCard>
              
              <StepCard number={4} title="Get Connected After Acceptance" icon={Users}>
                <p>When a driver accepts a rider's initial offer or a rider accepts a driver's counter-offer, the rider and driver become directly connected inside the platform.</p>
                <p className="mt-2">At this point:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                  <li>The trip price is locked in</li>
                  <li>Both parties can communicate freely</li>
                </ul>
              </StepCard>
              
              <StepCard number={5} title="Chat & Call Securely In-App" icon={MessageCircle}>
                <p>Once connected, riders and drivers can:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                  <li>Chat directly inside the app</li>
                  <li>Use CashRidez in-app calling</li>
                </ul>
                <p className="mt-2">For in-app calling to work:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                  <li>Both users must have a phone number added to their profile</li>
                  <li>Both users must save the official CashRidez in-app calling number to their contacts: <span className="text-yellow-400 font-semibold">(678) 928-8816</span></li>
                </ul>
                <p className="text-gray-400 italic mt-2">This allows private communication without exposing personal phone numbers.</p>
              </StepCard>
              
              <StepCard number={6} title="Trip Pickup" icon={Car}>
                <p>The driver arrives at the pickup location at the agreed time and completes the trip to the drop-off location.</p>
              </StepCard>
              
              <StepCard number={7} title="Pay the Driver Directly Upon Arrival" icon={DollarSign}>
                <p>After the driver arrives:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                  <li>The rider pays the driver directly</li>
                  <li>The payment amount is the exact agreed-upon price</li>
                </ul>
                <p className="text-gray-400 italic mt-2">Payment methods are arranged between the rider and driver, keeping transactions simple and transparent.</p>
              </StepCard>
              
              <StepCard number={8} title="Rate Each Other" icon={Star}>
                <p>After the trip is completed:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                  <li>Riders rate drivers</li>
                  <li>Drivers rate riders</li>
                </ul>
                <p className="mt-2">Ratings help:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                  <li>Build trust</li>
                  <li>Improve accountability</li>
                  <li>Create a dependable, respectful community</li>
                </ul>
              </StepCard>
            </div>
          </div>
        </section>
        
        {/* Driver Flow Section */}
        <section id="driver-flow" className="relative py-24 bg-gradient-to-b from-black via-gray-900 to-black overflow-hidden">
          <MapBackground showRiders intensity="subtle" className="absolute inset-0 z-0 pointer-events-none" />
          
          <div className="container mx-auto px-4 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl md:text-5xl font-bold mb-4 gold-shimmer">
                For Drivers: Accepting & Negotiating Trips
              </h2>
              <p className="text-gray-400 text-lg">How drivers find trips, negotiate fares, and earn more</p>
            </motion.div>
            
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              <StepCard number={1} title="View Nearby Trip Requests" icon={MapPin}>
                <p>Drivers browse available trip requests in their area and review:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                  <li>Pickup and drop-off locations</li>
                  <li>Timing</li>
                  <li>Rider's initial price offer</li>
                  <li>Trip notes</li>
                </ul>
              </StepCard>
              
              <StepCard number={2} title="Accept or Negotiate" icon={DollarSign}>
                <p>Drivers may:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                  <li>Accept the rider's offer immediately, or</li>
                  <li>Submit a counter-offer with a price that better fits the trip</li>
                </ul>
                <p className="text-gray-400 italic mt-2">This allows drivers to earn fairly and choose trips that make sense for them.</p>
              </StepCard>
              
              <StepCard number={3} title="Get Connected After Acceptance" icon={Users}>
                <p>Once a rider accepts a driver's offer:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                  <li>Both users are connected</li>
                  <li>In-app chat and calling are unlocked</li>
                  <li>The agreed price is finalized</li>
                </ul>
              </StepCard>
              
              <StepCard number={4} title="Communicate & Get Paid Upon Arrival" icon={Phone}>
                <p>Drivers communicate with riders using:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                  <li>In-app chat</li>
                  <li>In-app calling (after saving <span className="text-yellow-400 font-semibold">(678) 928-8816</span>)</li>
                </ul>
                <p className="mt-2">After arriving at the pickup location:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                  <li>The driver receives direct payment from the rider</li>
                </ul>
              </StepCard>
              
              <StepCard number={5} title="Rate the Experience" icon={Star}>
                <p>After the trip:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
                  <li>Drivers rate riders</li>
                  <li>Riders rate drivers</li>
                </ul>
                <p className="text-gray-400 italic mt-2">This ensures respectful interactions and helps strengthen the platform.</p>
              </StepCard>
            </div>
          </div>
        </section>
        
        {/* Community-First Section */}
        <section id="community" className="relative py-24 overflow-hidden">
          <MapBackground showAnimatedCar showRiders intensity="subtle" className="absolute inset-0 z-0 pointer-events-none" />
          
          <div className="container mx-auto px-4 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl md:text-5xl font-bold mb-4 gold-shimmer">
                A Community-First Approach
              </h2>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-4xl mx-auto"
            >
              <div className="bg-gradient-to-br from-gray-900/80 to-black/80 border border-yellow-500/30 rounded-2xl p-8 md:p-12">
                <p className="text-lg md:text-xl text-gray-300 mb-6 leading-relaxed">
                  CashRidez was built to support:
                </p>
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  {[
                    { text: 'Community drivers earning more', icon: DollarSign },
                    { text: 'Community riders saving money', icon: Users },
                    { text: 'Transparent, negotiated pricing', icon: CheckCircle2 },
                    { text: 'Direct communication and accountability', icon: MessageCircle },
                  ].map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center gap-4"
                    >
                      <div className="w-12 h-12 bg-gradient-to-br from-yellow-500/20 to-emerald-500/20 rounded-full flex items-center justify-center border border-yellow-500/30">
                        <item.icon className="w-6 h-6 text-yellow-400" />
                      </div>
                      <span className="text-gray-200 font-medium">{item.text}</span>
                    </motion.div>
                  ))}
                </div>
                
                <div className="border-t border-yellow-500/20 pt-8">
                  <p className="text-gray-400 text-sm leading-relaxed">
                    CashRidez does not provide transportation services and does not employ drivers. We operate as a communication and connection platform, empowering users to arrange trips on their own terms.
                  </p>
                </div>
              </div>
            </motion.div>
            
            {/* Thank You Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mt-16 max-w-3xl mx-auto"
            >
              <h3 className="text-2xl md:text-3xl font-bold mb-4 gold-shimmer">
                Thank You for Supporting Your Community
              </h3>
              <p className="text-gray-300 text-lg">
                Thank you for supporting your community by helping drivers earn more and helping riders save big. Together, we're building a trusted, dependable, community-powered way to get around.
              </p>
            </motion.div>
          </div>
        </section>
        
        
        {/* CTA Section */}
        <section className="relative py-24 overflow-hidden">
          <MapBackground showAnimatedCar showRiders intensity="subtle" className="absolute inset-0 z-0 pointer-events-none" />
          
          <div className="container mx-auto px-4 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center space-y-8"
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white">
                Ready to Get Started?
              </h2>
              <p className="text-gray-300 text-lg max-w-2xl mx-auto">
                Join the CashRidez community today and experience a better way to ride.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => navigate("/auth")}
                  className="w-full sm:w-auto px-12 py-5 text-xl font-bold rounded-2xl transition-all hover:scale-105 flex items-center justify-center gap-3 bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-500 hover:from-yellow-600 hover:via-yellow-500 hover:to-yellow-600 text-black shadow-lg shadow-yellow-500/50 hover:shadow-yellow-500/70"
                >
                  <span>📍</span>
                  Post a Trip
                </button>
                <button
                  onClick={() => navigate("/auth")}
                  className="w-full sm:w-auto px-12 py-5 text-xl font-bold rounded-2xl border-2 border-emerald-400 transition-all hover:scale-105 flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500/20 to-yellow-500/20 backdrop-blur-sm text-white hover:from-emerald-500/30 hover:to-yellow-500/30"
                >
                  <CashCarIcon width={40} height={20} glowIntensity="low" />
                  Browse Trips
                </button>
              </div>
            </motion.div>
          </div>
        </section>
        
        {/* Bottom Slogan - Matching homepage glow style */}
        <section className="relative py-16 overflow-hidden">
          <div className="container mx-auto px-4 text-center">
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-5xl font-bold gold-shimmer"
            >
              Powered by People, Driven by Cash
            </motion.p>
          </div>
        </section>
        
        {/* Footer */}
        <footer className="relative border-t border-yellow-500/20 py-12 bg-black">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-2">
                <a href="https://instagram.com/cash.ridez" target="_blank" rel="noopener noreferrer" className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-500 dark:hover:text-yellow-300 transition-colors">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg>
                </a>
                <a href="https://youtube.com/@cashridez" target="_blank" rel="noopener noreferrer" className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-500 dark:hover:text-yellow-300 transition-colors">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
                </a>
                <a href="https://www.tiktok.com/@cashridez" target="_blank" rel="noopener noreferrer" className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-500 dark:hover:text-yellow-300 transition-colors">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" /></svg>
                </a>
                <a href="https://x.com/cashridez?s=21" target="_blank" rel="noopener noreferrer" className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-500 dark:hover:text-yellow-300 transition-colors">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </a>
              </div>
              <div className="flex gap-6 text-gray-400 text-sm">
                <button onClick={() => navigate("/terms")} className="hover:text-yellow-400 transition-colors">Terms</button>
                <button onClick={() => navigate("/privacy")} className="hover:text-yellow-400 transition-colors">Privacy</button>
                <button onClick={() => navigate("/")} className="hover:text-yellow-400 transition-colors">Home</button>
              </div>
            </div>
            
            {/* Disclaimer */}
            <div className="border-t border-yellow-500/10 pt-8 mt-8 text-center">
              <p className="text-xs text-gray-500 max-w-4xl mx-auto">
                CashRidez is a communication platform that connects riders and drivers. CashRidez does not provide transportation services, employ drivers, or guarantee the quality or safety of any trips arranged through the platform. All trips are arranged directly between users at their own discretion and risk.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
