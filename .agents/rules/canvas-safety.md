---
trigger: always_on
---

When working with Canvas API:
- Always check canvas and context exist before drawing
- Always call ctx.save() before and ctx.restore() after 
  any transform (translate, rotate, scale)
- Never draw outside requestAnimationFrame for animations
- Always use try/catch around image loading operations
- If bezier curve tab/blank generation fails or renders 
  incorrectly, fall back to rectangular pieces with 
  drop shadow immediately — do not attempt to fix bezier 
  curves more than once