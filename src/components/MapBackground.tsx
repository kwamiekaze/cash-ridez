import { motion } from 'motion/react';
import { CashCarIcon } from './CashCarIcon';
import { useIsMobile } from '@/hooks/use-mobile';

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

// Desktop: Icons positioned around the perimeter (safe zone in center)
const riderMarkersDesktop: RiderMarker[] = [
  { id: 1, x: 12, y: 25 },  // Top-left
  { id: 2, x: 88, y: 25 },  // Top-right
  { id: 3, x: 12, y: 75 },  // Bottom-left
  { id: 4, x: 88, y: 75 },  // Bottom-right
  { id: 5, x: 50, y: 88 },  // Bottom-center
];

// Mobile: Fewer icons, positioned at corners only
const riderMarkersMobile: RiderMarker[] = [
  { id: 1, x: 10, y: 20 },  // Top-left
  { id: 2, x: 90, y: 20 },  // Top-right
  { id: 3, x: 10, y: 85 },  // Bottom-left
  { id: 4, x: 90, y: 85 },  // Bottom-right
];

// Car travels around the perimeter, never through the center
const carWaypointsDesktop = [
  { x: 10, y: 20 },   // Top-left corner
  { x: 50, y: 10 },   // Top-center (moved higher)
  { x: 90, y: 20 },   // Top-right corner
  { x: 92, y: 50 },   // Right-center
  { x: 90, y: 80 },   // Bottom-right corner
  { x: 50, y: 85 },   // Bottom-center
  { x: 10, y: 80 },   // Bottom-left corner
  { x: 8, y: 50 },    // Left-center
  { x: 10, y: 20 },   // Loop back to start
];

const carWaypointsMobile = [
  { x: 10, y: 18 },   // Top-left
  { x: 90, y: 18 },   // Top-right
  { x: 90, y: 85 },   // Bottom-right
  { x: 10, y: 85 },   // Bottom-left
  { x: 10, y: 18 },   // Loop back
];

export function MapBackground({ 
  showAnimatedCar = false, 
  showRiders = false,
  intensity = 'normal',
  className = ''
}: MapBackgroundProps) {
  const isMobile = useIsMobile();
  
  const opacityMap = {
    subtle: 0.1,
    normal: 0.15,
    prominent: 0.25
  };

  const gridOpacity = opacityMap[intensity];
  
  // Use mobile or desktop markers/waypoints based on screen size
  const riderMarkers = isMobile ? riderMarkersMobile : riderMarkersDesktop;
  const carWaypoints = isMobile ? carWaypointsMobile : carWaypointsDesktop;

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
        
        {/* Bright Intersection Nodes - positioned at perimeter */}
        {showRiders && (
          <g>
            {riderMarkers.map(marker => (
              <circle 
                key={marker.id} 
                cx={`${marker.x}%`} 
                cy={`${marker.y}%`} 
                r="4" 
                fill="url(#nodeGlow)" 
              />
            ))}
          </g>
        )}
      </svg>

      {/* Rider Markers - positioned around perimeter with reduced opacity */}
      {showRiders && riderMarkers.map((marker) => (
        <motion.div
          key={marker.id}
          className="absolute"
          style={{
            left: `${marker.x}%`,
            top: `${marker.y}%`,
            transform: 'translate(-50%, -50%)',
            opacity: 0.4
          }}
          animate={{
            scale: [1, 1.15, 1],
            y: [0, -5, 0]
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
            delay: marker.id * 0.4
          }}
        >
          <div className="relative">
            {/* Subtle Glow Ring */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                width: '35px',
                height: '35px',
                background: 'radial-gradient(circle, rgba(249, 226, 125, 0.25) 0%, transparent 70%)',
                filter: 'blur(6px)',
                transform: 'translate(-50%, -50%)',
                left: '50%',
                top: '50%'
              }}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.3, 0.5, 0.3]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            {/* Person with Dollar Icon */}
            <div className="relative flex flex-col items-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
                  boxShadow: '0 0 6px rgba(249, 226, 125, 0.6)'
                }}
              >
                $
              </div>
            </div>
          </div>
        </motion.div>
      ))}

      {/* Animated Car - travels around perimeter with reduced opacity */}
      {showAnimatedCar && (
        <motion.div
          className="absolute pointer-events-none"
          style={{
            opacity: 0.35
          }}
          animate={{
            left: carWaypoints.map(wp => `${wp.x}%`),
            top: carWaypoints.map(wp => `${wp.y}%`)
          }}
          transition={{
            duration: isMobile ? 20 : 35,
            repeat: Infinity,
            ease: "linear"
          }}
        >
          <div style={{ transform: 'translate(-50%, -50%)' }}>
            <CashCarIcon width={isMobile ? 60 : 80} height={isMobile ? 30 : 40} glowIntensity="low" />
          </div>
        </motion.div>
      )}

      {/* Scattered Background Cars (Static) - positioned at edges with reduced opacity */}
      {!showAnimatedCar && (
        <>
          <motion.div 
            className="absolute"
            style={{ left: '10%', top: '20%', opacity: 0.15 }}
            animate={{ x: [0, 8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          >
            <CashCarIcon width={55} height={28} glowIntensity="low" />
          </motion.div>
          <motion.div 
            className="absolute"
            style={{ left: '88%', top: '30%', opacity: 0.15 }}
            animate={{ x: [0, -6, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          >
            <CashCarIcon width={55} height={28} glowIntensity="low" />
          </motion.div>
          <motion.div 
            className="absolute"
            style={{ left: '12%', top: '78%', opacity: 0.12 }}
            animate={{ x: [0, 10, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          >
            <CashCarIcon width={50} height={25} glowIntensity="low" />
          </motion.div>
        </>
      )}
    </div>
  );
}
