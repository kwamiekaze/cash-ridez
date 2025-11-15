import { motion } from 'motion/react';
import { CashCarIcon } from './CashCarIcon';

interface MapBackgroundProps {
  showAnimatedCar?: boolean;
  showRiders?: boolean;
  intensity?: 'subtle' | 'normal' | 'prominent';
  className?: string;
}

interface RiderMarker {
  id: number;
  x: number;
  y: number;
  active?: boolean;
}

const riderMarkers: RiderMarker[] = [
  { id: 1, x: 20, y: 30 },
  { id: 2, x: 45, y: 50 },
  { id: 3, x: 70, y: 35 },
  { id: 4, x: 85, y: 65 },
  { id: 5, x: 55, y: 75 },
];

const carWaypoints = [
  { x: 20, y: 30 },
  { x: 45, y: 50 },
  { x: 70, y: 35 },
  { x: 85, y: 65 },
  { x: 55, y: 75 },
  { x: 20, y: 30 }, // Loop back
];

export function MapBackground({ 
  showAnimatedCar = false, 
  showRiders = false,
  intensity = 'normal',
  className = ''
}: MapBackgroundProps) {
  const opacityMap = {
    subtle: 0.15,
    normal: 0.3,
    prominent: 0.5
  };

  const gridOpacity = opacityMap[intensity];

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {/* Dark Gradient Base */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, #020610 0%, #071214 40%, #0a1a1f 100%)'
        }}
      />

      {/* Stylized City Grid */}
      <svg 
        className="absolute inset-0 w-full h-full" 
        xmlns="http://www.w3.org/2000/svg"
        style={{ opacity: gridOpacity }}
      >
        <defs>
          <pattern id="cityGrid" width="100" height="100" patternUnits="userSpaceOnUse">
            <rect width="100" height="100" fill="none" stroke="rgba(0, 178, 111, 0.4)" strokeWidth="1"/>
            <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(0, 178, 111, 0.3)" strokeWidth="0.5"/>
            <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(0, 178, 111, 0.3)" strokeWidth="0.5"/>
          </pattern>
          <radialGradient id="nodeGlow">
            <stop offset="0%" stopColor="rgba(249, 226, 125, 0.6)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#cityGrid)" />
        
        {/* Bright Intersection Nodes */}
        {showRiders && (
          <g>
            <circle cx="20%" cy="30%" r="4" fill="url(#nodeGlow)" />
            <circle cx="45%" cy="50%" r="4" fill="url(#nodeGlow)" />
            <circle cx="70%" cy="35%" r="4" fill="url(#nodeGlow)" />
            <circle cx="85%" cy="65%" r="4" fill="url(#nodeGlow)" />
            <circle cx="55%" cy="75%" r="4" fill="url(#nodeGlow)" />
          </g>
        )}
      </svg>

      {/* Rider Markers */}
      {showRiders && riderMarkers.map((marker) => (
        <motion.div
          key={marker.id}
          className="absolute"
          style={{
            left: `${marker.x}%`,
            top: `${marker.y}%`,
            transform: 'translate(-50%, -50%)'
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.6, 1, 0.6]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: marker.id * 0.3
          }}
        >
          <div className="relative">
            {/* Glow Ring */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                width: '40px',
                height: '40px',
                background: 'radial-gradient(circle, rgba(249, 226, 125, 0.4) 0%, transparent 70%)',
                filter: 'blur(8px)',
                transform: 'translate(-50%, -50%)',
                left: '50%',
                top: '50%'
              }}
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 0.8, 0.5]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            {/* Pin Icon */}
            <div 
              className="relative w-6 h-6 rounded-full border-2 flex items-center justify-center"
              style={{
                borderColor: '#F9E27D',
                backgroundColor: 'rgba(2, 6, 16, 0.9)',
                boxShadow: '0 0 12px rgba(249, 226, 125, 0.6)'
              }}
            >
              <span className="text-[#F9E27D] text-xs font-bold">$</span>
            </div>
          </div>
        </motion.div>
      ))}

      {/* Animated Car */}
      {showAnimatedCar && (
        <motion.div
          className="absolute pointer-events-none"
          animate={{
            left: carWaypoints.map(wp => `${wp.x}%`),
            top: carWaypoints.map(wp => `${wp.y}%`)
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: "linear"
          }}
          style={{
            transform: 'translate(-50%, -50%)'
          }}
        >
          <CashCarIcon width={80} height={40} glowIntensity="high" />
        </motion.div>
      )}

      {/* Scattered Background Cars (Static) */}
      {!showAnimatedCar && (
        <>
          <motion.div 
            className="absolute opacity-20"
            style={{ left: '15%', top: '20%' }}
            animate={{ x: [0, 10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <CashCarIcon width={60} height={30} glowIntensity="low" />
          </motion.div>
          <motion.div 
            className="absolute opacity-20"
            style={{ left: '75%', top: '45%' }}
            animate={{ x: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          >
            <CashCarIcon width={60} height={30} glowIntensity="low" />
          </motion.div>
          <motion.div 
            className="absolute opacity-15"
            style={{ left: '40%', top: '70%' }}
            animate={{ x: [0, 12, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          >
            <CashCarIcon width={60} height={30} glowIntensity="low" />
          </motion.div>
        </>
      )}
    </div>
  );
}
