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
  { id: 1, x: 20, y: 45 },
  { id: 2, x: 45, y: 55 },
  { id: 3, x: 70, y: 50 },
  { id: 4, x: 55, y: 65 },
  { id: 5, x: 30, y: 60 },
];

const carWaypoints = [
  { x: 50, y: 15 }, // Start higher near header
  { x: 20, y: 45 },
  { x: 45, y: 55 },
  { x: 70, y: 50 },
  { x: 55, y: 65 },
  { x: 30, y: 60 },
  { x: 50, y: 15 }, // Loop back to start
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
            <circle cx="20%" cy="45%" r="4" fill="url(#nodeGlow)" />
            <circle cx="45%" cy="55%" r="4" fill="url(#nodeGlow)" />
            <circle cx="70%" cy="50%" r="4" fill="url(#nodeGlow)" />
            <circle cx="55%" cy="65%" r="4" fill="url(#nodeGlow)" />
            <circle cx="30%" cy="60%" r="4" fill="url(#nodeGlow)" />
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
            {/* Person with Dollar Icon */}
            <div className="relative flex flex-col items-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Person head */}
                <circle cx="12" cy="7" r="3" fill="#F9E27D" stroke="#F9E27D" strokeWidth="1.5"/>
                {/* Person body */}
                <path d="M12 11C8.5 11 6 13 6 16V20H18V16C18 13 15.5 11 12 11Z" fill="#F9E27D" stroke="#F9E27D" strokeWidth="1.5"/>
              </svg>
              {/* Dollar sign badge */}
              <div 
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{
                  backgroundColor: '#F9E27D',
                  color: '#000000',
                  boxShadow: '0 0 8px rgba(249, 226, 125, 0.8)'
                }}
              >
                $
              </div>
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
