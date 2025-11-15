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
      
      {/* Classic Sedan Car - Matching Reference Image */}
      <g stroke="#E8C368" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Main body - horizontal long shape */}
        <path d="M 25 42 L 115 42" />
        
        {/* Front fender curve */}
        <path d="M 25 42 Q 20 42 20 38 Q 20 34 25 34 L 40 34" />
        
        {/* Rear fender curve */}
        <path d="M 100 34 L 115 34 Q 120 34 120 38 Q 120 42 115 42" />
        
        {/* Windshield and roof */}
        <path d="M 40 34 L 45 24 L 55 24" />
        <path d="M 55 24 L 85 24" />
        <path d="M 85 24 L 95 24 L 100 34" />
        
        {/* Bottom body line */}
        <path d="M 25 42 L 25 48" />
        <path d="M 40 48 L 100 48" />
        <path d="M 115 42 L 115 48" />
        
        {/* Front wheel well */}
        <path d="M 25 48 Q 30 50 35 50 Q 40 50 40 48" />
        
        {/* Rear wheel well */}
        <path d="M 100 48 Q 105 50 110 50 Q 115 50 115 48" />
        
        {/* Front Wheel - Full circle */}
        <circle cx="35" cy="50" r="8" strokeWidth="3" />
        <circle cx="35" cy="50" r="4" fill="none" strokeWidth="2" />
        <circle cx="35" cy="50" r="2" fill="#E8C368" />
        
        {/* Rear Wheel - Full circle */}
        <circle cx="105" cy="50" r="8" strokeWidth="3" />
        <circle cx="105" cy="50" r="4" fill="none" strokeWidth="2" />
        <circle cx="105" cy="50" r="2" fill="#E8C368" />
        
        {/* Window detail */}
        <line x1="60" y1="24" x2="60" y2="28" strokeWidth="1.5" />
        <line x1="80" y1="24" x2="80" y2="28" strokeWidth="1.5" />
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
