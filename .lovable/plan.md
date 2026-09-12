# Level the car and activate the new homepage

## Changes
- Update both default camera direction calculations to `[3.2, 0.85, 3.2]` and reduce the look-at drop to `frameHeight * 0.08`.
- Compare the retained and new homepage content before changing `/`; add only genuinely missing live-page content if needed.
- Point `/` to `NewHome`, preserving the `LandingNew` import/file, `/newhome`, and every other route unchanged.

## Verification
- Check `/` and `/newhome` at 390×844 and 1440×900.
- Inspect the car through a full rotation for clipping and button overlap; confirm the 10.6° camera elevation.
- Exercise links below the opening section and confirm all retained content is present.
- Confirm `LandingNew.tsx` has no diff, then run the TypeScript check.

## Technical details
- Preserve the current camera field of view, fit calculation, controls, animation, rotation speed, damping, distance limits, and responsive framing boosts.
- No deployment or publication.
