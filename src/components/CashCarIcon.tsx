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
      
      {/* Car Outline - Exact Match to Reference */}
      <g stroke="url(#cashCarGold)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Main Body - Rectangular with rounded wheel wells */}
        <path d="M 20 40 L 20 32 L 35 32 L 35 25 L 70 25 L 70 32 L 100 32 L 100 40" />
        
        {/* Curved wheel wells */}
        <path d="M 20 40 Q 25 45 30 40" />
        <path d="M 90 40 Q 95 45 100 40" />
        
        {/* Front and rear sections */}
        <line x1="35" y1="32" x2="35" y2="25" />
        <line x1="70" y1="32" x2="70" y2="25" />
        
        {/* Roof line */}
        <line x1="35" y1="25" x2="70" y2="25" />
        
        {/* Front Wheel */}
        <circle cx="25" cy="40" r="6" />
        
        {/* Rear Wheel */}
        <circle cx="95" cy="40" r="6" />
      </g>
      
      {/* Dollar Badge on Roof */}
      <g transform="translate(52.5, 15)">
        <circle 
          cx="0" 
          cy="0" 
          r="8" 
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
          fontSize="12" 
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
