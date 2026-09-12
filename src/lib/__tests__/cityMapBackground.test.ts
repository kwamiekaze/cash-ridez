import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const cityMap = read('src/components/newhome/CityMapBackground.tsx');
const newHome = read('src/pages/NewHome.tsx');
const legacyMap = read('src/components/MapBackground.tsx');
const landing = read('src/pages/LandingNew.tsx');
const css = read('src/index.css');

describe('NewHome cinematic city map', () => {
  it('uses the new component for all five direct homepage map placements', () => {
    expect(newHome.match(/<CityMapBackground/g)).toHaveLength(5);
    expect(newHome).not.toContain('<MapBackground');
    expect(newHome).toContain("from '@/components/newhome/CityMapBackground'");
  });

  it('uses one route for the road, trail, and auto-rotating car', () => {
    expect(cityMap).toContain('id={routeId}');
    expect(cityMap.match(/href={`#\$\{routeId\}`}/g)?.length).toBeGreaterThanOrEqual(4);
    expect(cityMap).toContain('rotate="auto"');
    expect(cityMap).toContain('<mpath href={`#${routeId}`} />');
  });

  it('places riders from route length and includes timed pickup pauses', () => {
    expect(cityMap).toContain('getPointAtLength');
    expect(cityMap).toContain('data-route-fraction');
    expect(cityMap).toContain('keyPoints="0;0.08;0.08;0.18;0.30;0.30;0.44;0.56;0.56;0.70;0.82;0.82;1"');
    expect(cityMap).toContain('calcMode="linear"');
  });

  it('pauses offscreen and renders motion-free reduced and mobile modes', () => {
    expect(cityMap).toContain('IntersectionObserver');
    expect(cityMap).toContain('pauseAnimations');
    expect(cityMap).toContain('(prefers-reduced-motion: reduce)');
    expect(cityMap).toContain('const motionEnabled = isVisible && !reducedMotion');
    expect(cityMap).toContain('RIDER_FRACTIONS_MOBILE');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (max-width: 767px), (pointer: coarse)');
  });

  it('never animates layout position properties', () => {
    const animationObjects = cityMap.match(/animate=\{\{[\s\S]*?\}\}/g) ?? [];
    for (const animation of animationObjects) {
      expect(animation).not.toMatch(/\bleft\b|\btop\b/);
    }
    expect(css).not.toMatch(/@keyframes city-map-[^{]+\{[^}]*\bleft\s*:|@keyframes city-map-[^{]+\{[^}]*\btop\s*:/s);
  });

  it('keeps the legacy map and landing page on their original integration', () => {
    expect(legacyMap).toContain('export function MapBackground');
    expect(landing).toContain("from '@/components/MapBackground'");
    expect(landing).not.toContain('CityMapBackground');
  });
});