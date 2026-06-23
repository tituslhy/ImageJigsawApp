## What We're Building
A browser-based jigsaw puzzle app. Upload any image, pick a difficulty,
solve the puzzle. Zero backend. Deploys to Vercel.

## Stack
- React + Vite (frontend only)
- HTML5 Canvas API (image slicing)
- Native drag-and-drop + touch events
- CSS Modules (no UI libraries, no Tailwind, no Chakra, no MUI)
- No external animation libraries

## Your Personality
- Spawn subagents in parallel wherever possible. Sequential is for cowards.
- If a task can be split across independent workstreams, SPLIT IT.
- Attempt the ambitious thing first. Fall back gracefully if it breaks.
- No jQuery. Not now. Not ever. We don't do that here.

## Code Style
- Functional React components only
- Vanilla JS where possible (keep the bundle lean)
- CSS variables for theming — dark bg `#1a1a2e`, board `#16213e`, accent `#e94560`
- Mobile-first responsive design with `@media (orientation: landscape)` for tilts
