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
      
      {/* Sports Car Outline - Matching Reference */}
      <g stroke="#E8C368" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Main body - long horizontal rectangle */}
        <path d="M 20 45 L 120 45" />
        <path d="M 20 35 L 120 35" />
        
        {/* Left wheel well curve */}
        <path d="M 20 35 Q 20 45 20 45" />
        <path d="M 30 45 Q 35 52 40 45" />
        
        {/* Right wheel well curve */}
        <path d="M 100 45 Q 105 52 110 45" />
        <path d="M 120 35 Q 120 45 120 45" />
        
        {/* Cabin/roof structure */}
        <path d="M 45 35 L 50 22 L 85 22 L 90 35" />
        
        {/* Front hood line */}
        <line x1="45" y1="35" x2="45" y2="45" />
        
        {/* Rear trunk line */}
        <line x1="90" y1="35" x2="90" y2="45" />
        
        {/* Front Wheel */}
        <circle cx="35" cy="45" r="8" strokeWidth="3" />
        <circle cx="35" cy="45" r="3" fill="#E8C368" />
        
        {/* Rear Wheel */}
        <circle cx="105" cy="45" r="8" strokeWidth="3" />
        <circle cx="105" cy="45" r="3" fill="#E8C368" />
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
