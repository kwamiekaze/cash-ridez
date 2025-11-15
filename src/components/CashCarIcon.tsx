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
      
      {/* Sleek Sports/Muscle Car */}
      <g stroke="#E8C368" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Low-profile body with aggressive angles */}
        <path d="M 20 45 L 25 45 L 30 40 L 115 40 L 120 45" />
        
        {/* Front hood slope */}
        <path d="M 20 45 L 18 43 L 20 40 L 30 40" />
        
        {/* Rear spoiler */}
        <path d="M 115 40 L 122 40 L 124 42 L 120 45" />
        
        {/* Aggressive windshield and roofline */}
        <path d="M 40 40 L 48 26 L 58 24 L 82 24 L 92 26 L 100 40" />
        
        {/* Side window contour */}
        <path d="M 48 26 L 58 26" />
        <path d="M 82 26 L 92 26" />
        <line x1="70" y1="24" x2="70" y2="27" strokeWidth="1.5" />
        
        {/* Lower body line */}
        <path d="M 25 45 L 25 50" />
        <path d="M 42 50 L 98 50" />
        <path d="M 120 45 L 120 50" />
        
        {/* Front wheel well - aggressive curve */}
        <path d="M 25 50 Q 31 52 37 52 Q 42 52 42 50" />
        
        {/* Rear wheel well - aggressive curve */}
        <path d="M 98 50 Q 104 52 110 52 Q 120 52 120 50" />
        
        {/* Front Wheel - Full circle with sporty design */}
        <circle cx="37" cy="52" r="8" strokeWidth="3" />
        <circle cx="37" cy="52" r="5" fill="none" strokeWidth="2" />
        <circle cx="37" cy="52" r="2" fill="#E8C368" />
        
        {/* Rear Wheel - Full circle with sporty design */}
        <circle cx="110" cy="52" r="8" strokeWidth="3" />
        <circle cx="110" cy="52" r="5" fill="none" strokeWidth="2" />
        <circle cx="110" cy="52" r="2" fill="#E8C368" />
        
        {/* Air intake detail on front */}
        <path d="M 23 42 L 27 42" strokeWidth="1.5" />
        
        {/* Side vent detail */}
        <path d="M 75 35 L 78 35 M 76 37 L 79 37" strokeWidth="1" />
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
