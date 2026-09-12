# Cinematic City Map Background

## Goal
Create a new, lightweight SVG city map exclusively for `NewHome`, replacing its five direct legacy map backgrounds without changing homepage content, controls, spacing, or the reversible `LandingNew` experience.

## Build
- Add `src/components/newhome/CityMapBackground.tsx` with the same props as the existing map background.
- Use one responsive SVG route as both the visible arterial road and the car’s motion path, with `animateMotion`, `mpath`, and `rotate="auto"`.
- Build an irregular city network around it: varied secondary streets, diagonals, uneven blocks, subtle park/river texture, arterial glow, dashed centre line, route trail, vignette, centre readability scrim, and restrained atmospheric glow.
- Place desktop rider markers from exact route-length fractions so they sit on the road; use two outer-region riders on mobile.
- Synchronize car pickup pauses with rider pulse and floating-dollar reactions. Add low-opacity ambient traffic on desktop only.
- Keep the existing opacity caps (`0.1`, `0.15`, `0.25`) on the road layer.

## Motion, performance, and accessibility
- Use SVG SMIL and CSS transform/opacity animation only; never animate `left` or `top`.
- Pause SVG animation while each background is offscreen using `IntersectionObserver`.
- Provide subtle desktop-only CSS scroll parallax; disable parallax, ambient traffic, grain, and extra streets on mobile.
- Detect `prefers-reduced-motion` and render a fully static map with no moving car, trail, glow, marker, traffic, or parallax animation.
- Give each component instance unique SVG definition IDs so five maps can coexist safely.

## Integration
- Replace all five direct `<MapBackground />` instances in `src/pages/NewHome.tsx` with `<CityMapBackground />`, preserving every existing prop value.
- Do not modify `src/components/MapBackground.tsx` or `src/pages/LandingNew.tsx`.
- Keep the existing `HeroSection` implementation unchanged; only the five map usages explicitly owned by `NewHome` are swapped.

## Verification
- Add focused source/component assertions for route/car geometry sharing, `rotate="auto"`, pickup timing, reduced-motion behavior, visibility pausing, mobile reductions, and absence of `left`/`top` animation.
- Use Playwright at 390×844 and 1440×900 to inspect the rendered route, car orientation at multiple times, rider/path alignment, pickup slowdown, static reduced-motion state, and text/button/badge readability.
- Compare screenshots against the current homepage and report readability as better, equal, or worse.
- Confirm `MapBackground.tsx` and `LandingNew.tsx` have no diff, then run focused tests and TypeScript checking.
- Do not deploy or publish.
