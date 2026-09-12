import { useEffect, useId, useRef, useState } from 'react';

interface CityMapBackgroundProps {
  showAnimatedCar?: boolean;
  showRiders?: boolean;
  intensity?: 'subtle' | 'normal' | 'prominent';
  className?: string;
}

interface RoutePoint {
  x: number;
  y: number;
}

const VIEWBOX = '0 0 1200 800';
const ROUTE_DURATION_SECONDS = 28;
const ROUTE = 'M 84 178 C 176 92 282 110 356 188 C 446 284 426 566 574 654 C 712 736 778 438 888 362 C 1004 282 1132 398 1082 566 C 1038 714 846 718 730 624 C 606 522 520 406 382 448 C 244 490 178 668 82 586 C 10 524 26 286 84 178 Z';
const RIDER_FRACTIONS_DESKTOP = [0.08, 0.3, 0.56, 0.82];
const RIDER_FRACTIONS_MOBILE = [0.3, 0.7];
const PICKUP_BEGINS_DESKTOP = ['2.8s', '9.1s', '16.1s', '23.1s'];
const PICKUP_BEGINS_MOBILE = ['7.8s', '18.2s'];
const DESKTOP_KEY_POINTS = '0;0.08;0.08;0.18;0.30;0.30;0.44;0.56;0.56;0.70;0.82;0.82;1';
const DESKTOP_KEY_TIMES = '0;0.09;0.13;0.22;0.31;0.36;0.47;0.55;0.60;0.72;0.80;0.85;1';
const MOBILE_KEY_POINTS = '0;0.18;0.30;0.30;0.48;0.70;0.70;0.84;1';
const MOBILE_KEY_TIMES = '0;0.18;0.28;0.34;0.48;0.65;0.72;0.85;1';

const intensityOpacity = {
  subtle: 0.1,
  normal: 0.15,
  prominent: 0.25,
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

export function CityMapBackground({
  showAnimatedCar = false,
  showRiders = false,
  intensity = 'normal',
  className = '',
}: CityMapBackgroundProps) {
  const rawId = useId();
  const instanceId = rawId.replace(/:/g, '');
  const routeId = `city-route-${instanceId}`;
  const glowId = `city-glow-${instanceId}`;
  const grainId = `city-grain-${instanceId}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const routeRef = useRef<SVGPathElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const isMobile = useMediaQuery('(max-width: 767px), (pointer: coarse)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const riderFractions = isMobile ? RIDER_FRACTIONS_MOBILE : RIDER_FRACTIONS_DESKTOP;
  const pickupBegins = isMobile ? PICKUP_BEGINS_MOBILE : PICKUP_BEGINS_DESKTOP;

  useEffect(() => {
    const path = routeRef.current;
    if (!path || !showRiders) {
      setRoutePoints([]);
      return;
    }

    const length = path.getTotalLength();
    setRoutePoints(riderFractions.map((fraction) => path.getPointAtLength(length * fraction)));
  }, [isMobile, showRiders]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '120px', threshold: 0.01 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (!isVisible || reducedMotion) svg.pauseAnimations?.();
    else svg.unpauseAnimations?.();
  }, [isVisible, reducedMotion]);

  const motionEnabled = isVisible && !reducedMotion;

  return (
    <div
      ref={containerRef}
      className={`city-map-background absolute inset-0 overflow-hidden ${className}`}
      data-active={motionEnabled}
      data-mobile={isMobile}
      data-reduced-motion={reducedMotion}
      aria-hidden="true"
    >
      <div className="city-map-base absolute inset-0" />

      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        viewBox={VIEWBOX}
        preserveAspectRatio="xMidYMid slice"
        role="presentation"
      >
        <defs>
          <path ref={routeRef} id={routeId} d={ROUTE} pathLength="1000" />
          <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={grainId} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" seed="17" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <radialGradient id={`emerald-haze-${instanceId}`}>
            <stop offset="0" stopColor="hsl(var(--emerald))" stopOpacity="0.18" />
            <stop offset="1" stopColor="hsl(var(--emerald))" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`gold-haze-${instanceId}`}>
            <stop offset="0" stopColor="hsl(var(--gold-light))" stopOpacity="0.13" />
            <stop offset="1" stopColor="hsl(var(--gold-light))" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g className="city-map-road-layer" style={{ opacity: intensityOpacity[intensity] }}>
          <g className="city-map-atmosphere">
            <ellipse className="city-map-haze city-map-haze-a" cx="120" cy="170" rx="280" ry="220" fill={`url(#emerald-haze-${instanceId})`} />
            <ellipse className="city-map-haze city-map-haze-b" cx="1080" cy="640" rx="300" ry="230" fill={`url(#gold-haze-${instanceId})`} />
            {!isMobile && <ellipse className="city-map-haze city-map-haze-c" cx="1050" cy="110" rx="210" ry="170" fill={`url(#emerald-haze-${instanceId})`} />}
          </g>

          <g className="city-map-landmarks">
            <rect x="112" y="282" width="184" height="104" rx="12" />
            <rect x="914" y="82" width="176" height="120" rx="10" />
            {!isMobile && <path d="M 640 -40 C 600 180 704 312 672 510 C 648 650 570 730 594 840" />}
          </g>

          <g className="city-map-secondary-roads">
            <path d="M -40 116 L 452 116 L 708 306 L 1240 306" />
            <path d="M -40 388 L 292 388 L 504 254 L 1240 254" />
            <path d="M -40 704 L 328 704 L 566 530 L 1240 530" />
            <path d="M 172 -40 L 172 246 L 330 418 L 330 840" />
            <path d="M 986 -40 L 986 180 L 848 410 L 848 840" />
            {!isMobile && (
              <>
                <path d="M 492 -40 L 492 202 L 610 334 L 610 840" />
                <path d="M 1092 -40 L 1092 356 L 970 478 L 970 840" />
                <path d="M -80 580 L 268 242 L 536 36" />
                <path d="M 714 840 L 862 612 L 1250 216" />
                <path d="M 268 840 L 480 608 L 760 94" />
              </>
            )}
          </g>

          <g className="city-map-blocks">
            <rect x="366" y="132" width="92" height="74" rx="5" />
            <rect x="748" y="112" width="164" height="92" rx="5" />
            <rect x="58" y="438" width="124" height="92" rx="5" />
            <rect x="884" y="552" width="142" height="96" rx="5" />
            {!isMobile && <rect x="398" y="586" width="98" height="128" rx="5" />}
          </g>

          <use href={`#${routeId}`} className="city-map-arterial-glow" filter={`url(#${glowId})`} />
          <use href={`#${routeId}`} className="city-map-arterial" />
          <use href={`#${routeId}`} className="city-map-centre-line" />

          {showAnimatedCar && motionEnabled && (
            <use href={`#${routeId}`} className="city-map-route-trail">
              <animate
                attributeName="stroke-dashoffset"
                values="1080;0;-1080"
                dur={`${ROUTE_DURATION_SECONDS}s`}
                repeatCount="indefinite"
              />
            </use>
          )}

          {!isMobile && motionEnabled && (
            <g className="city-map-traffic">
              <circle r="4"><animateMotion dur="18s" repeatCount="indefinite" path="M -30 388 L 292 388 L 504 254 L 1230 254" /></circle>
              <circle r="3"><animateMotion dur="23s" begin="-9s" repeatCount="indefinite" path="M 172 -20 L 172 246 L 330 418 L 330 820" /></circle>
              <circle r="3.5"><animateMotion dur="29s" begin="-17s" repeatCount="indefinite" path="M 714 820 L 862 612 L 1230 236" /></circle>
              <circle r="3"><animateMotion dur="21s" begin="-4s" repeatCount="indefinite" path="M 1092 -20 L 1092 356 L 970 478 L 970 820" /></circle>
            </g>
          )}
        </g>

        <g className="city-map-foreground-layer">
          {showRiders && routePoints.map((point, index) => (
            <g
              key={`${point.x}-${point.y}`}
              className="city-map-rider"
              data-route-fraction={riderFractions[index]}
              transform={`translate(${point.x} ${point.y})`}
            >
              <circle className="city-map-rider-ring" r="25">
                {motionEnabled && <animate attributeName="opacity" values="0.2;0.95;0.2" dur="2.5s" begin={pickupBegins[index]} repeatCount="indefinite" />}
                {motionEnabled && <animate attributeName="r" values="22;34;22" dur="2.5s" begin={pickupBegins[index]} repeatCount="indefinite" />}
              </circle>
              <circle className="city-map-rider-body" cy="4" r="11" />
              <circle className="city-map-rider-head" cy="-12" r="7" />
              <g className="city-map-pickup-dollar">
                <text x="0" y="-30" textAnchor="middle">$</text>
                {motionEnabled && <animateTransform attributeName="transform" type="translate" values="0 5;0 -20;0 -28" dur="2.5s" begin={pickupBegins[index]} repeatCount="indefinite" />}
                {motionEnabled && <animate attributeName="opacity" values="0;1;0" dur="2.5s" begin={pickupBegins[index]} repeatCount="indefinite" />}
              </g>
            </g>
          ))}

          {showAnimatedCar && motionEnabled && (
            <g className="city-map-route-car" data-duration={ROUTE_DURATION_SECONDS}>
              <ellipse cx="0" cy="7" rx="29" ry="12" className="city-map-car-shadow" />
              <path d="M -27 -10 L 17 -10 L 30 -2 L 30 8 L 18 13 L -23 13 L -31 5 L -31 -3 Z" className="city-map-car-body" />
              <path d="M -13 -15 L 12 -15 L 20 -9 L -20 -9 Z" className="city-map-car-cabin" />
              <path d="M 20 -7 L 29 -3" className="city-map-car-light" />
              <circle cx="-18" cy="13" r="5" className="city-map-car-wheel" />
              <circle cx="18" cy="13" r="5" className="city-map-car-wheel" />
              <text x="0" y="5" textAnchor="middle" className="city-map-car-dollar">$</text>
              <animateMotion
                dur={`${ROUTE_DURATION_SECONDS}s`}
                repeatCount="indefinite"
                rotate="auto"
                calcMode="linear"
                keyPoints={isMobile ? MOBILE_KEY_POINTS : DESKTOP_KEY_POINTS}
                keyTimes={isMobile ? MOBILE_KEY_TIMES : DESKTOP_KEY_TIMES}
              >
                <mpath href={`#${routeId}`} />
              </animateMotion>
            </g>
          )}
        </g>

        {!isMobile && <rect className="city-map-grain" width="1200" height="800" filter={`url(#${grainId})`} />}
      </svg>

      <div className="city-map-centre-scrim absolute inset-0" />
      <div className="city-map-vignette absolute inset-0" />
    </div>
  );
}