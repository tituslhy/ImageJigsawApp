---
trigger: always_on
---

- All puzzle game state lives in usePuzzleGame.js hook only
- Components are dumb — they receive props and call callbacks
- No useState in PuzzleApp.jsx for game logic — only UI state 
  (like which modal is open) is allowed in components
- Never mutate piece objects directly — always return new arrays