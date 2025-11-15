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
        {/* Low aerodynamic body with curves */}
        <path d="M 15 48 Q 18 46 25 46 L 30 46 Q 32 50 38 50 Q 42 46 48 44 L 92 44 Q 98 46 102 50 Q 108 50 110 46 L 115 46 Q 122 46 125 48" />
        
        {/* Sleek windshield and roofline */}
        <path d="M 48 44 L 52 28 Q 53 25 56 25 L 84 25 Q 87 25 88 28 L 92 44" />
        
        {/* Front hood slope */}
        <path d="M 25 46 L 30 38 L 48 38 L 48 44" />
        
        {/* Rear spoiler detail */}
        <path d="M 92 44 L 92 38 L 110 38 L 115 42" />
        <path d="M 110 38 L 112 36 L 117 40" />
        
        {/* Undercarriage detail */}
        <path d="M 48 44 L 48 46" />
        <path d="M 92 44 L 92 46" />
        
        {/* Front Wheel */}
        <circle cx="35" cy="50" r="8" strokeWidth="3" />
        <circle cx="35" cy="50" r="3" fill="#E8C368" />
        <path d="M 31 50 L 39 50" strokeWidth="1.5" />
        
        {/* Rear Wheel */}
        <circle cx="105" cy="50" r="8" strokeWidth="3" />
        <circle cx="105" cy="50" r="3" fill="#E8C368" />
        <path d="M 101 50 L 109 50" strokeWidth="1.5" />
        
        {/* Side mirror */}
        <circle cx="50" cy="32" r="2" fill="#E8C368" />
        <line x1="50" y1="32" x2="48" y2="35" strokeWidth="1.5" />
        
        {/* Headlight accent */}
        <line x1="20" y1="44" x2="25" y2="45" strokeWidth="2" />
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
