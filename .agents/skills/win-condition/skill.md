---
name: win-condition
description: Use this skill when implementing or debugging the jigsaw puzzle win condition, piece locking logic, or snap detection.
---

# Win Condition & Snap Logic — JigsawIt

## Piece Data Shape
Each piece object must have:
```js
{
  id: 'piece-0-0',        // unique: `piece-${row}-${col}`
  row: 0,                 // correct grid row
  col: 0,                 // correct grid column
  imageData: '...',       // base64 canvas snapshot
  x: 120,                 // current x position (dragged)
  y: 340,                 // current y position (dragged)
  correctX: 0,            // x position when correctly placed
  correctY: 0,            // y position when correctly placed
  locked: false           // true = snapped in place, cannot be dragged
}
```

## Snap Logic
After every drop event, check distance from correct position:
```js
const distance = Math.hypot(
  piece.x - piece.correctX,
  piece.y - piece.correctY
)

if (distance < 20) {
  // Snap into exact position and lock
  piece.x = piece.correctX
  piece.y = piece.correctY
  piece.locked = true
}
```

## Win Condition
Check ONLY after a successful snap (not on a timer, not on every mousemove):
```js
const hasWon = pieces.every(p => p.locked === true)
if (hasWon) {
  // Trigger win screen — show overlay, confetti, time taken
}
```

## Timer
- Start: on the first `dragstart` event (first piece moved)
- Display: MM:SS format, update every second with setInterval
- Stop: when win condition fires, clear the interval
- Never start the timer on page load — only on first interaction