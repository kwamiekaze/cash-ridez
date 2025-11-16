import { motion } from 'motion/react';
import { CashCarIcon } from './CashCarIcon';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMemo } from 'react';

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

// Generate random riders around the perimeter (avoiding center)
const generateRandomRiders = (count: number, isMobile: boolean): RiderMarker[] => {
  const riders: RiderMarker[] = [];
  
  // Define perimeter zones (edges of the map)
  const zones = isMobile 
    ? [
        // Mobile zones - corners and edges
        { xRange: [5, 20], yRange: [15, 25] },    // Top-left
        { xRange: [80, 95], yRange: [15, 25] },   // Top-right
        { xRange: [5, 20], yRange: [75, 90] },    // Bottom-left
        { xRange: [80, 95], yRange: [75, 90] },   // Bottom-right
      ]
    : [
        // Desktop zones - more variety around perimeter
        { xRange: [5, 25], yRange: [20, 35] },    // Top-left
        { xRange: [75, 95], yRange: [20, 35] },   // Top-right
        { xRange: [5, 25], yRange: [65, 85] },    // Bottom-left
        { xRange: [75, 95], yRange: [65, 85] },   // Bottom-right
        { xRange: [35, 65], yRange: [80, 92] },   // Bottom-center
        { xRange: [3, 15], yRange: [40, 60] },    // Left-center
        { xRange: [85, 97], yRange: [40, 60] },   // Right-center
        { xRange: [35, 65], yRange: [15, 25] },   // Top-center
      ];

  for (let i = 0; i < count; i++) {
    const zone = zones[i % zones.length];
    const x = zone.xRange[0] + Math.random() * (zone.xRange[1] - zone.xRange[0]);
    const y = zone.yRange[0] + Math.random() * (zone.yRange[1] - zone.yRange[0]);
    
    riders.push({
      id: i + 1,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
    });
  }
  
  return riders;
};

// Generate waypoints for the car to visit riders
const generateCarWaypoints = (riders: RiderMarker[]) => {
  // Add starting position, then visit each rider, then loop back
  const waypoints = riders.map(rider => ({ x: rider.x, y: rider.y }));
  // Add the first position at the end to complete the loop
  if (waypoints.length > 0) {
    waypoints.push({ x: waypoints[0].x, y: waypoints[0].y });
  }
  return waypoints;
};

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
  
  // Generate random number of riders (3-12) for this instance
  const riderCount = useMemo(() => 3 + Math.floor(Math.random() * 10), []);
  
  // Generate random rider positions
  const riderMarkers = useMemo(() => 
    generateRandomRiders(riderCount, isMobile), 
    [riderCount, isMobile]
  );
  
  // Generate car waypoints to visit riders
  const carWaypoints = useMemo(() => 
    generateCarWaypoints(riderMarkers), 
    [riderMarkers]
  );

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
            duration: isMobile ? 40 : 70,
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
