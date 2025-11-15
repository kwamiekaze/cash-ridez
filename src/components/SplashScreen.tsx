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
        background: 'linear-gradient(180deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)'
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
        style={{ background: 'radial-gradient(circle, rgba(232, 195, 104, 0.2) 0%, transparent 70%)' }}
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
        style={{ background: 'radial-gradient(circle, rgba(152, 195, 121, 0.15) 0%, transparent 70%)' }}
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
        {/* Cash Car Icon with Drawing Animation */}
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
          <svg width="200" height="100" viewBox="0 0 140 70">
            <defs>
              <linearGradient id="cashCarGold" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#E8C368" stopOpacity="1" />
                <stop offset="50%" stopColor="#F5D98B" stopOpacity="1" />
                <stop offset="100%" stopColor="#E8C368" stopOpacity="1" />
              </linearGradient>
            </defs>
            
            {/* Car with draw animation */}
            <motion.g 
              stroke="#E8C368" 
              strokeWidth="2.5" 
              fill="none" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 2, ease: "easeInOut", delay: 0.5 }}
              style={{ 
                filter: 'drop-shadow(0 0 8px rgba(232, 195, 104, 0.5)) drop-shadow(0 0 12px rgba(232, 195, 104, 0.3))'
              }}
            >
              <motion.path d="M 25 42 L 115 42" />
              <motion.path d="M 25 42 Q 20 42 20 38 Q 20 34 25 34 L 40 34" />
              <motion.path d="M 100 34 L 115 34 Q 120 34 120 38 Q 120 42 115 42" />
              <motion.path d="M 40 34 L 45 24 L 55 24" />
              <motion.path d="M 55 24 L 85 24" />
              <motion.path d="M 85 24 L 95 24 L 100 34" />
              <motion.path d="M 25 42 L 25 48" />
              <motion.path d="M 40 48 L 100 48" />
              <motion.path d="M 115 42 L 115 48" />
              <motion.path d="M 25 48 Q 30 50 35 50 Q 40 50 40 48" />
              <motion.path d="M 100 48 Q 105 50 110 50 Q 115 50 115 48" />
              <motion.circle cx="35" cy="50" r="8" strokeWidth="3" />
              <motion.circle cx="35" cy="50" r="4" strokeWidth="2" />
              <motion.circle cx="35" cy="50" r="2" fill="#E8C368" />
              <motion.circle cx="105" cy="50" r="8" strokeWidth="3" />
              <motion.circle cx="105" cy="50" r="4" strokeWidth="2" />
              <motion.circle cx="105" cy="50" r="2" fill="#E8C368" />
              <motion.line x1="60" y1="24" x2="60" y2="28" strokeWidth="1.5" />
              <motion.line x1="80" y1="24" x2="80" y2="28" strokeWidth="1.5" />
            </motion.g>
            
            {/* Dollar Badge with draw animation */}
            <g transform="translate(67.5, 12)">
              <motion.circle 
                cx="0" 
                cy="0" 
                r="10" 
                fill="#2d2d2d" 
                stroke="#E8C368" 
                strokeWidth="2.5"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 2 }}
              />
              <motion.text 
                x="0" 
                y="0" 
                textAnchor="middle" 
                dominantBaseline="central" 
                fill="#E8C368" 
                fontSize="16" 
                fontWeight="bold"
                fontFamily="Arial, sans-serif"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 2.3 }}
              >
                $
              </motion.text>
            </g>
          </svg>
        </motion.div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 2.5 }}
          className="text-xl md:text-2xl font-semibold text-[#E8C368]"
        >
          Powered by people, driven by cash.
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
              background: 'radial-gradient(circle, rgba(232, 195, 104, 0.25) 0%, transparent 70%)',
              filter: 'blur(20px)'
            }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
