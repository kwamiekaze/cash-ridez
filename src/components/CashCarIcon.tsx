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
      
      {/* Sports Car Outline - Sleek & Desirable */}
      <g stroke="url(#cashCarGold)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Lower Body - Aerodynamic */}
        <path d="M 15 35 L 18 33 L 102 33 L 105 35 L 105 42 L 15 42 Z" />
        
        {/* Upper Body/Cabin - Low, Sleek Profile */}
        <path d="M 30 33 L 38 20 L 65 18 L 82 20 L 90 33" />
        
        {/* Windshield - Angled */}
        <path d="M 40 23 L 48 25 L 50 32 L 42 32 Z" />
        
        {/* Side Window */}
        <path d="M 52 24 L 63 22 L 68 32 L 54 32 Z" />
        
        {/* Rear Window - Sport */}
        <path d="M 70 24 L 78 22 L 84 32 L 72 32 Z" />
        
        {/* Front Spoiler */}
        <path d="M 102 34 L 108 34 L 110 37 L 105 37 Z" />
        
        {/* Rear Spoiler */}
        <path d="M 12 25 L 18 25 L 20 28 L 15 28 Z" />
        
        {/* Front Wheel */}
        <circle cx="88" cy="42" r="8" />
        <circle cx="88" cy="42" r="5" fill="url(#cashCarGold)" fillOpacity="0.3" />
        
        {/* Rear Wheel */}
        <circle cx="32" cy="42" r="8" />
        <circle cx="32" cy="42" r="5" fill="url(#cashCarGold)" fillOpacity="0.3" />
        
        {/* Headlights */}
        <circle cx="104" cy="36" r="1.5" fill="#F9E27D" opacity="0.9" />
        
        {/* Side Vents */}
        <line x1="72" y1="33" x2="72" y2="38" strokeWidth="1" />
        <line x1="76" y1="33" x2="76" y2="38" strokeWidth="1" />
        <line x1="80" y1="33" x2="80" y2="38" strokeWidth="1" />
      </g>
      
      {/* Dollar Badge on Roof */}
      <g transform="translate(60, 15)">
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
