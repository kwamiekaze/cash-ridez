import { DollarSign } from 'lucide-react';

interface SportsCarProps {
  width?: number;
  height?: number;
  className?: string;
  showDollarSign?: boolean;
  dollarClassName?: string;
}

export function SportsCar({ 
  width = 180, 
  height = 90, 
  className = "", 
  showDollarSign = true,
  dollarClassName = ""
}: SportsCarProps) {
  return (
    <div className={`relative ${className}`} style={{ width: `${width}px`, height: `${height}px` }}>
      {/* Sports Car SVG */}
      <svg 
        width={width} 
        height={height} 
        viewBox="0 0 180 90" 
        className="drop-shadow-2xl"
      >
        <defs>
          <linearGradient id="sportsCarGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFD700" />
            <stop offset="50%" stopColor="#FFF4A3" />
            <stop offset="100%" stopColor="#FFD700" />
          </linearGradient>
          <filter id="carGlow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Car Body - Sports Car Shape */}
        {/* Lower Body */}
        <path 
          d="M 20 55 L 25 50 L 160 50 L 165 55 L 165 65 L 20 65 Z" 
          fill="url(#sportsCarGold)" 
          filter="url(#carGlow)"
        />
        
        {/* Upper Body/Cabin - Sleek Sports Car Design */}
        <path 
          d="M 45 50 L 60 30 L 100 27 L 125 30 L 140 50 Z" 
          fill="url(#sportsCarGold)" 
          filter="url(#carGlow)"
        />
        
        {/* Windshield */}
        <path 
          d="M 62 33 L 72 35 L 75 48 L 65 48 Z" 
          fill="#1a1a1a" 
          opacity="0.5"
        />
        
        {/* Side Window */}
        <path 
          d="M 78 35 L 98 33 L 105 48 L 80 48 Z" 
          fill="#1a1a1a" 
          opacity="0.5"
        />
        
        {/* Rear Window */}
        <path 
          d="M 108 35 L 122 33 L 130 48 L 110 48 Z" 
          fill="#1a1a1a" 
          opacity="0.5"
        />
        
        {/* Front Spoiler */}
        <path 
          d="M 160 52 L 168 52 L 170 56 L 165 56 Z" 
          fill="#B8860B"
        />
        
        {/* Front Wheels */}
        <circle cx="135" cy="65" r="12" fill="#1a1a1a" />
        <circle cx="135" cy="65" r="8" fill="#333" />
        <circle cx="135" cy="65" r="4" fill="#FFD700" />
        
        {/* Rear Wheels */}
        <circle cx="50" cy="65" r="12" fill="#1a1a1a" />
        <circle cx="50" cy="65" r="8" fill="#333" />
        <circle cx="50" cy="65" r="4" fill="#FFD700" />
        
        {/* Headlights */}
        <ellipse cx="162" cy="54" rx="3" ry="4" fill="#FFF4A3" opacity="0.9" />
        <ellipse cx="162" cy="61" rx="3" ry="4" fill="#FFF4A3" opacity="0.9" />
        
        {/* Side Vents */}
        <rect x="110" y="52" width="2" height="8" fill="#B8860B" opacity="0.6" />
        <rect x="115" y="52" width="2" height="8" fill="#B8860B" opacity="0.6" />
        <rect x="120" y="52" width="2" height="8" fill="#B8860B" opacity="0.6" />
        
        {/* Door Lines */}
        <line x1="75" y1="50" x2="78" y2="65" stroke="#B8860B" strokeWidth="1" opacity="0.5" />
        <line x1="105" y1="50" x2="108" y2="65" stroke="#B8860B" strokeWidth="1" opacity="0.5" />
      </svg>

      {/* Dollar Sign Badge on Car Door */}
      {showDollarSign && (
        <div className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 ${dollarClassName}`}>
          <div 
            className="rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border-2 border-yellow-300 shadow-lg shadow-yellow-500/50"
            style={{ 
              width: `${width * 0.22}px`, 
              height: `${width * 0.22}px`,
              borderWidth: `${Math.max(1, width * 0.011)}px`
            }}
          >
            <DollarSign 
              className="text-yellow-400" 
              strokeWidth={3}
              style={{ 
                width: `${width * 0.14}px`, 
                height: `${width * 0.14}px`
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
