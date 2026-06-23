---
name: canvas-api
description: Use this skill when working with HTML5 Canvas — slicing images into puzzle pieces, drawing piece shapes, handling CORS image loading, or implementing bezier curve tab/blank interlocking edges.
---

# Canvas API — JigsawIt Reference

## Image Loading (CORS is mandatory)
Always load images with `crossOrigin = "anonymous"` BEFORE setting `src`.
Without this, Canvas throws a security error when reading pixel data.

```js
const img = new Image()
img.crossOrigin = "anonymous"  // MUST come before src
img.onload = () => { /* draw to canvas here */ }
img.src = url
```

## Slicing an Image Into Grid Pieces
```js
const pieceW = img.width / cols
const pieceH = img.height / rows

for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    const canvas = document.createElement('canvas')
    canvas.width = pieceW
    canvas.height = pieceH
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img,
      col * pieceW, row * pieceH, pieceW, pieceH,  // source
      0, 0, pieceW, pieceH                           // destination
    )
    // canvas.toDataURL() gives you the base64 image for this piece
  }
}
```

## Interlocking Piece Shapes (Bezier Curves)
Each edge has either a TAB (bump out) or BLANK (indent in).
Adjacent pieces must be complementary — if piece A's right edge is TAB,
piece B's left edge must be BLANK.

Generate edge types randomly but store them so neighbours are always opposite:
```js
// edgeTypes[row][col] = { top, right, bottom, left }
// 1 = tab (protrudes out), -1 = blank (indents in)
// When drawing, clip the canvas to the piece shape using bezierCurveTo
```

## Fallback: Rectangular Pieces with Drop Shadow
If bezier curves fail or render incorrectly after ONE attempt, use this instead:
```js
ctx.save()
ctx.shadowColor = 'rgba(0,0,0,0.4)'
ctx.shadowBlur = 8
ctx.shadowOffsetX = 2
ctx.shadowOffsetY = 2
ctx.drawImage(pieceCanvas, x, y)
ctx.restore()
```