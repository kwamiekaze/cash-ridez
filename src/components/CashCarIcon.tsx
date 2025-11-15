import { motion } from 'motion/react';
import { DollarSign } from 'lucide-react';

interface CashCarIconProps {
  width?: number;
  height?: number;
  className?: string;
  animate?: boolean;
  glowIntensity?: 'none' | 'low' | 'medium' | 'high';
}

export function CashCarIcon({ 
  width = 120, 
  height = 60,
  className = "",
  animate = false,
  glowIntensity = 'medium'
}: CashCarIconProps) {
  const glowFilters = {
    none: '',
    low: 'drop-shadow(0 0 4px rgba(249, 226, 125, 0.3))',
    medium: 'drop-shadow(0 0 8px rgba(249, 226, 125, 0.5)) drop-shadow(0 0 12px rgba(249, 226, 125, 0.3))',
    high: 'drop-shadow(0 0 12px rgba(249, 226, 125, 0.7)) drop-shadow(0 0 20px rgba(249, 226, 125, 0.5))'
  };

  const CarSVG = (
    <svg 
      width={width} 
      height={height} 
      viewBox="0 0 120 60" 
      className={className}
      style={{ filter: glowFilters[glowIntensity] }}
    >
      <defs>
        <linearGradient id="cashCarGold" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#F9E27D" stopOpacity="1" />
          <stop offset="50%" stopColor="#FFD700" stopOpacity="1" />
          <stop offset="100%" stopColor="#F9E27D" stopOpacity="1" />
        </linearGradient>
      </defs>
      
      {/* Car Outline - Side View */}
      <g stroke="url(#cashCarGold)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Main Body */}
        <path d="M 15 42 L 20 42 L 25 38 L 35 36 L 55 36 L 65 38 L 95 38 L 100 42 L 105 42" />
        
        {/* Roof/Cabin */}
        <path d="M 35 36 L 40 28 L 70 28 L 75 36" />
        
        {/* Windshield */}
        <line x1="40" y1="28" x2="44" y2="36" />
        
        {/* Rear Window */}
        <line x1="70" y1="28" x2="66" y2="36" />
        
        {/* Front Wheel */}
        <circle cx="30" cy="42" r="7" />
        <circle cx="30" cy="42" r="4" />
        
        {/* Rear Wheel */}
        <circle cx="85" cy="42" r="7" />
        <circle cx="85" cy="42" r="4" />
        
        {/* Undercarriage */}
        <path d="M 20 42 L 23 45 L 37 45 L 40 42" />
        <path d="M 75 42 L 78 45 L 92 45 L 95 42" />
      </g>
      
      {/* Dollar Badge on Roof */}
      <g transform="translate(55, 28)">
        <circle 
          cx="0" 
          cy="0" 
          r="10" 
          fill="rgba(2, 6, 16, 0.9)" 
          stroke="url(#cashCarGold)" 
          strokeWidth="2"
        />
        <text 
          x="0" 
          y="0" 
          textAnchor="middle" 
          dominantBaseline="central" 
          fill="#F9E27D" 
          fontSize="14" 
          fontWeight="bold"
          fontFamily="Arial, sans-serif"
        >
          $
        </text>
      </g>
    </svg>
  );

  if (animate) {
    return (
      <motion.div
        animate={{
          filter: [
            'drop-shadow(0 0 8px rgba(249, 226, 125, 0.5))',
            'drop-shadow(0 0 16px rgba(249, 226, 125, 0.8))',
            'drop-shadow(0 0 8px rgba(249, 226, 125, 0.5))'
          ]
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      >
        {CarSVG}
      </motion.div>
    );
  }

  return CarSVG;
}
