import { motion } from 'motion/react';
import { SportsCar } from './SportsCar';
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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Subtle background gradient - very dark */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(20, 20, 20, 0.8) 0%, rgba(0, 0, 0, 1) 70%)'
        }}
      />

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-4">
        
        {/* Sparkle Particles around car area */}
        {[...Array(12)].map((_, i) => {
          const angle = (i * 30) * (Math.PI / 180);
          const radius = 140 + (i % 3) * 20;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius - 40;
          
          return (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-yellow-300"
              style={{
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${y}px)`,
                boxShadow: '0 0 4px 2px rgba(255, 215, 0, 0.8)'
              }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0, 1.5, 0]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeInOut"
              }}
            />
          );
        })}

        {/* Gold Sports Car */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ 
            duration: 0.8, 
            delay: 0.3,
            ease: [0.34, 1.56, 0.64, 1]
          }}
          className="mb-8 relative"
        >
          {/* Subtle glow around car only */}
          <motion.div
            className="absolute inset-0 -m-8"
            animate={{
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            style={{
              background: 'radial-gradient(circle, rgba(255, 215, 0, 0.15) 0%, transparent 70%)',
              filter: 'blur(20px)'
            }}
          />
          
          <motion.div
            animate={{
              filter: [
                'drop-shadow(0 0 8px rgba(255, 215, 0, 0.4))',
                'drop-shadow(0 0 12px rgba(255, 215, 0, 0.6))',
                'drop-shadow(0 0 8px rgba(255, 215, 0, 0.4))'
              ]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <SportsCar width={220} height={110} />
          </motion.div>
        </motion.div>

        {/* Brand Name with shimmer */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-5xl md:text-7xl font-bold mb-6 gold-shimmer"
          style={{
            textShadow: '0 0 20px rgba(255, 215, 0, 0.3)'
          }}
        >
          cashridez.com
        </motion.h1>

        {/* Tagline with shimmer */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="text-xl md:text-2xl font-semibold gold-shimmer"
          style={{
            textShadow: '0 0 15px rgba(255, 215, 0, 0.2)'
          }}
        >
          Powered by people, driven by cash 💰
        </motion.p>
      </div>
    </motion.div>
  );
}
