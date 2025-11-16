import { motion } from 'motion/react';
import { MapPin, Shield, CheckCircle2, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
export function HeroSection() {
  const navigate = useNavigate();
  const features = [{
    icon: Shield,
    label: 'ID Verified'
  }, {
    icon: CheckCircle2,
    label: 'Safe Connections'
  }, {
    icon: Users,
    label: 'Community-Driven'
  }];
  return <section className="relative min-h-screen pt-52 pb-20 overflow-hidden">
      {/* Animated Background Orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-950 to-black" />
        <motion.div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-gold/5 rounded-full blur-3xl" animate={{
        scale: [1, 1.2, 1],
        opacity: [0.3, 0.5, 0.3]
      }} transition={{
        duration: 8,
        repeat: Infinity
      }} />
        <motion.div className="absolute bottom-0 right-1/4 w-[800px] h-[800px] bg-emerald/5 rounded-full blur-3xl" animate={{
        scale: [1.2, 1, 1.2],
        opacity: [0.5, 0.3, 0.5]
      }} transition={{
        duration: 8,
        repeat: Infinity
      }} />
        <motion.div className="absolute top-1/3 right-1/3 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-3xl" animate={{
        scale: [1, 1.3, 1],
        opacity: [0.2, 0.4, 0.2]
      }} transition={{
        duration: 10,
        repeat: Infinity
      }} />
      </div>


      <div className="container px-4 relative z-20 mx-0">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Location Badge */}
          

          {/* Tagline */}
          

          {/* Main Heading with Gold Shimmer */}
          <motion.h1 initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.4
        }} className="text-6xl md:text-8xl font-bold leading-tight">
            <span className="gold-shimmer block mb-4">Your Community Travel Network</span>
            
          </motion.h1>

          {/* Quote Section */}
          <motion.div initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.5
        }} className="max-w-3xl mx-auto p-6 border-l-4 border-gold bg-gold/5 rounded-r-lg">
            <p className="text-xl text-gray-300 italic">
              "Powered by people, Driven by Cash. Earn More, Save More" 
            </p>
          </motion.div>

          {/* Description */}
          <motion.p initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.6
        }} className="text-xl text-gray-300 max-w-2xl mx-auto">
            Connect with locals. Coordinate travel. Move together.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.7
        }} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button onClick={() => navigate('/auth')} size="lg" className="bg-gradient-to-r from-gold to-emerald text-black font-bold text-lg px-12 py-6 hover:shadow-2xl hover:shadow-gold/50 transition-all">
              Post a Trip
            </Button>
            <Button onClick={() => navigate('/auth')} size="lg" variant="outline" className="border-2 border-gold text-gold hover:bg-gold hover:text-black font-bold text-lg px-12 py-6 transition-all">
              Respond to Trips
            </Button>
          </motion.div>

          {/* Trust Badges */}
          <motion.div initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.8
        }} className="flex flex-wrap justify-center gap-8 pt-8">
            {features.map((feature, i) => <div key={i} className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-gold/20 to-emerald/20 rounded-full flex items-center justify-center border border-gold/30">
                  <feature.icon className="w-6 h-6 text-gold" />
                </div>
                <span className="text-gray-300 font-medium">{feature.label}</span>
              </div>)}
          </motion.div>
        </div>
      </div>
    </section>;
}