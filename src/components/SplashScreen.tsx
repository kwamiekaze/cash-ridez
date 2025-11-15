import { motion } from 'motion/react';
import { CashCarIcon } from './CashCarIcon';
import { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete?: () => void;
  duration?: number;
}

export function SplashScreen({ onComplete, duration = 3000 }: SplashScreenProps) {
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShouldRender(false);
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  if (!shouldRender) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        background: 'linear-gradient(180deg, #020610 0%, #071214 50%, #0a1a1f 100%)'
      }}
    >
      {/* Faint City Grid Background */}
      <div className="absolute inset-0 opacity-20">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(0, 178, 111, 0.3)" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Glowing Orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(249, 226, 125, 0.15) 0%, transparent 70%)' }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(0, 178, 111, 0.15) 0%, transparent 70%)' }}
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.5, 0.3, 0.5]
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-4">
        {/* Cash Car Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ 
            duration: 0.8, 
            delay: 0.3,
            ease: [0.34, 1.56, 0.64, 1]
          }}
          className="mb-8"
        >
          <motion.div
            animate={{
              filter: [
                'drop-shadow(0 0 20px rgba(249, 226, 125, 0.5))',
                'drop-shadow(0 0 40px rgba(249, 226, 125, 0.8))',
                'drop-shadow(0 0 20px rgba(249, 226, 125, 0.5))'
              ]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <CashCarIcon width={200} height={100} glowIntensity="high" />
          </motion.div>
        </motion.div>

        {/* Brand Name */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-5xl md:text-7xl font-bold mb-4"
          style={{
            background: 'linear-gradient(90deg, #F9E27D 0%, #FFD700 50%, #F9E27D 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 0 40px rgba(249, 226, 125, 0.3)'
          }}
        >
          CashRidez
        </motion.h1>

        {/* Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="space-y-2 mb-4"
        >
          <p className="text-xl md:text-2xl font-semibold text-[#F9E27D]">
            Powered by people, driven by cash.
          </p>
          <p className="text-lg md:text-xl font-medium text-[#F9E27D]/80">
            Earn more, save more.
          </p>
        </motion.div>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.2 }}
          className="text-sm md:text-base text-gray-400 max-w-md"
        >
          Connecting riders and drivers for cash rides, no commissions.
        </motion.p>

        {/* Pulsing Dollar Badge Animation */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          animate={{
            scale: [1, 1.05, 1],
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <div 
            className="w-40 h-40 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(249, 226, 125, 0.2) 0%, transparent 70%)',
              filter: 'blur(20px)'
            }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
