# Implementation Plan: Shades Creator - Pattern Grid, Optimization & Rose Curve Correction

## Goal
Enhance the Shades Creator to support repeating grid patterns, correct the Rose curve drawing routine, and implement performance optimizations to eliminate lag and over‑glow.

### User Review Required
Please review the proposed design decisions:

#### Rose Curve Mathematical Correction
- Compute period based on denominator `d`:
  ```js
  const period = (d % 2 === 0 ? 2 * d : d) * Math.PI;
  ```
- Map `theta` from `0` to `period` using the current step count. This guarantees a closed curve for any `d`.

#### Repeated Shapes (Pattern Grid)
- Add state fields:
  - `repeatMode` (boolean) – toggles pattern repeating.
  - `repeatCount` (number, 2‑5) – grid size (e.g., 3 → 3×3).
- In `canvas-renderer.js`, when `repeatMode` is true, segment the canvas into a `repeatCount × repeatCount` matrix, translate the origin to each cell center, scale drawing appropriately, and render active shapes.

#### Visualizer Performance & Lag Prevention
- **Throttled Communication**: 40 ms debounce (≈25 Hz) for slider updates; instant emission for quick actions (Random, Clear, Send to screen).
- **Transition Trigger Refinement**: Restrict cross‑fade resets to structural changes only (shape add/remove, background type, render mode). Color/slider changes will now smoothly lerp without resetting the cross‑fade loop.

#### Over‑Glow (Burn‑in) Mitigation
- Apply alpha normalization based on shape count:
  ```js
  const strokeAlpha = state.opacity * Math.min(1.0, 45 / count);
  const fillAlpha   = state.opacity * Math.min(0.25, 8 / count);
  ```
- This keeps detailed visuals from washing out to white.

## Proposed Code Changes
1. **canvas-renderer.js**
   - Update `drawRoses` to use the corrected period.
   - Extend `lerpState` with `repeatMode` & `repeatCount`.
   - Refactor shape rendering into a shared `renderShape` helper.
   - Modify `drawCanvas` to loop over a grid when `repeatMode` is enabled.
   - Implement alpha normalization in `applyStyle`.
2. **ControlApp.jsx**
   - Add default state fields.
   - Insert a new sidebar card for repetition controls (toggle + slider).
   - Remove color fields from cross‑fade trigger list.
   - Add a 40 ms throttle using `useRef` to batch slider updates before emitting via socket.
3. **ViewerApp.jsx**
   - Apply the same cross‑fade restriction logic.
   - Support rendering of the repeated grid layout.

## Verification Plan
- **Local Tests**: Run dev servers, verify closed Rose curves, grid rendering, smooth color transitions, and no over‑glow at high shape counts.
- **Performance**: Confirm socket traffic is throttled (≈25 Hz) during slider drags.
- **Production Build**: Run `npm run build` and ensure no permission errors.
- **Render Deploy**: Push to GitHub and trigger a new Render deploy; verify both creator and viewer URLs work without the previous errors.

---
*Implementation plan stored as `IMPLEMENTATION_PLAN.md` in the repository.*
