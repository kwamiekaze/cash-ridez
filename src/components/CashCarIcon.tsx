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
    low: 'drop-shadow(0 0 4px rgba(232, 195, 104, 0.3))',
    medium: 'drop-shadow(0 0 8px rgba(232, 195, 104, 0.5)) drop-shadow(0 0 12px rgba(232, 195, 104, 0.3))',
    high: 'drop-shadow(0 0 12px rgba(232, 195, 104, 0.7)) drop-shadow(0 0 20px rgba(232, 195, 104, 0.5))'
  };

  const CarSVG = (
    <svg 
      width={width} 
      height={height} 
      viewBox="0 0 140 70" 
      className={className}
      style={{ filter: glowFilters[glowIntensity] }}
    >
      <defs>
        <linearGradient id="cashCarGold" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#E8C368" stopOpacity="1" />
          <stop offset="50%" stopColor="#F5D98B" stopOpacity="1" />
          <stop offset="100%" stopColor="#E8C368" stopOpacity="1" />
        </linearGradient>
      </defs>
      
      {/* Sleek Sports Car Outline */}
      <g stroke="#E8C368" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Aerodynamic body with smooth curves */}
        <path d="M 15 48 Q 20 45 28 45 Q 32 48 40 48 Q 44 44 50 42 L 90 42 Q 96 44 100 48 Q 106 48 112 45 Q 118 45 123 48" />
        
        {/* Curved windshield and sporty roofline */}
        <path d="M 50 42 Q 52 35 54 28 Q 55 24 58 24 L 82 24 Q 85 24 86 28 Q 88 35 90 42" />
        
        {/* Sloped front hood */}
        <path d="M 28 45 Q 32 40 38 38 L 50 38 L 50 42" />
        
        {/* Aggressive rear spoiler */}
        <path d="M 90 42 L 90 36 Q 95 35 108 36 Q 112 38 115 42" />
        <path d="M 108 36 L 110 33 Q 112 32 116 38" />
        
        {/* Front Wheel with sporty rims */}
        <circle cx="38" cy="50" r="9" strokeWidth="3" />
        <circle cx="38" cy="50" r="4" fill="#E8C368" />
        <path d="M 34 50 L 42 50 M 38 46 L 38 54" strokeWidth="1.5" />
        
        {/* Rear Wheel with sporty rims */}
        <circle cx="102" cy="50" r="9" strokeWidth="3" />
        <circle cx="102" cy="50" r="4" fill="#E8C368" />
        <path d="M 98 50 L 106 50 M 102 46 L 102 54" strokeWidth="1.5" />
        
        {/* Side mirror detail */}
        <ellipse cx="52" cy="32" rx="3" ry="2" fill="#E8C368" />
        <line x1="52" y1="34" x2="50" y2="38" strokeWidth="1.5" />
        
        {/* Sharp headlight accent */}
        <path d="M 18 44 L 24 44 L 26 46" strokeWidth="2" />
        
        {/* Air intake detail */}
        <path d="M 24 48 Q 26 49 28 48" strokeWidth="1" />
      </g>
      
      {/* Dollar Badge on Roof */}
      <g transform="translate(67.5, 12)">
        <circle 
          cx="0" 
          cy="0" 
          r="10" 
          fill="#2d2d2d" 
          stroke="#E8C368" 
          strokeWidth="2.5"
        />
        <text 
          x="0" 
          y="0" 
          textAnchor="middle" 
          dominantBaseline="central" 
          fill="#E8C368" 
          fontSize="16" 
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
