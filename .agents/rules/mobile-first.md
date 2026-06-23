---
trigger: always_on
---

Every UI component must work on mobile FIRST.
- Touch events (touchstart, touchmove, touchend) must be 
  implemented alongside mouse events — never mouse-only
- Test layout at 375px width mentally before desktop
- Use CSS @media (orientation: landscape) for tilt handling
- No hover-only interactions — hover doesn't exist on mobile