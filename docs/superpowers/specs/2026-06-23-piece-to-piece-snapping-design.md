# Piece-to-Piece Snapping Design

## Problem

Pieces currently only "snap" when dragged close to one fixed absolute
position on the canvas (the center of the dashed `targetZone` rectangle).
There's no code that gates snapping by the rectangle's boundary — the
rectangle just happens to contain every piece's one valid target, so in
practice the puzzle can only be solved by placing each piece into that one
small region.

## Goal

Pieces should connect directly to their correct neighbors wherever the user
drags them, anywhere on the canvas. Connected pieces should move together as
a single cluster. The puzzle is solved as soon as all pieces form one fully
connected cluster — it does not need to end up in any particular location on
the canvas.

## Data model changes (`src/puzzle/usePuzzleGame.js`)

- `correctX`/`correctY` remain board-relative (`col * pieceW`,
  `row * pieceH`), exactly as produced by `generator.js`. The existing
  "convert to canvas-absolute by adding `targetX`/`targetY`" step is removed
  — nothing needs an absolute target position anymore.
- `targetX`/`targetY` are removed from hook state entirely.
- Each piece gains a `groupId` field, initialized to its own `id`. Pieces
  that share a `groupId` are physically connected and always move as one
  rigid body.
- The `locked` field is removed. There is no more "pinned to absolute slot"
  state — a piece's only relevant state is which group it belongs to.
- Initial scatter places pieces at random positions clamped to the canvas
  bounds. The existing "stay `minScatterDist` away from the absolute target"
  loop is removed since there is no fixed target to avoid.

## Connection algorithm

Replaces `snapPiece(id)` with `tryConnect(id)`, called on drop (mouseup/touchend):

1. Build a `"row,col" -> piece` lookup over all current pieces.
2. Let `groupMembers` = all pieces sharing the dragged piece's `groupId`.
3. For every member, check its 4 grid-neighbors (`row±1` same col, `col±1`
   same row) via the lookup. For each neighbor whose `groupId` differs from
   the dragged group:
   - Expected offset = `((neighbor.col - member.col) * pieceW, (neighbor.row - member.row) * pieceH)`.
   - Actual offset = `(neighbor.x - member.x, neighbor.y - member.y)`.
   - Candidate distance = `hypot(actual - expected)`.
4. If any candidate distance is below the existing per-piece
   `snapThreshold` (`min(pieceW, pieceH) * 0.32`), take the closest one:
   - Rigidly translate every piece in the dragged group by the correction
     needed to make that pairing pixel-perfect (preserves the dragged
     group's internal formation).
   - Merge the neighbor's group into the dragged group (relabel `groupId`).
5. Repeat steps 3-4 against the now-merged group until no further match is
   found in this drop. This handles a piece connecting on two sides at once
   (e.g. filling a gap between two already-joined neighbors) and chain
   reactions from a single drop.
6. `isWon` = every piece in `pieces` shares one `groupId`.
7. `movesCount` increments on every drop regardless of whether a connection
   happened, same as today.

## Group dragging mechanics (`src/components/PuzzleApp.jsx`)

- `handleDragStart` captures the starting positions of every piece in the
  dragged piece's group, not just the one piece.
- The hook's `updatePiecePosition(id, x, y)` is replaced with
  `moveGroup(ids, dx, dy)`, which applies the same delta to every listed
  piece in a single state update.
- The mousemove/touchmove handler computes one `(dx, dy)` from the mouse
  delta and calls `moveGroup` with all of the dragged group's piece ids.
- The entire dragged group is rendered with the same elevated z-index /
  dragging style that a single dragged piece gets today.

## Target zone / guide image (`src/components/PuzzleApp.jsx`, `.module.css`)

- The dashed-rectangle `targetZone` element and its boundary styling
  (`.targetZone`, `.corner`/`.tl`/`.tr`/`.bl`/`.br`) are removed — there is
  no fixed drop target left to visualize.
- The existing "Show Guide" toggle is kept, but re-homed: instead of a
  faint full-size overlay inside the (now-removed) rectangle, it renders a
  small fixed-position thumbnail of the full source image in a canvas
  corner (e.g. top-right), sized by the board's aspect ratio. It is purely
  a visual reference and has no effect on gameplay or piece positioning.

## Win overlay

No change to the win overlay UI itself — only what triggers `isWon` changes
(see Connection algorithm, step 6).

## Out of scope

- No change to piece-shape generation (`src/puzzle/generator.js`) — `row`,
  `col`, `correctX`, `correctY`, and `id` already provide everything the
  connection algorithm needs.
- No change to difficulty levels or grid sizing.
- No change to how individual pieces are dragged when their group has only
  one member (that's the existing single-piece drag path, now generalized).

## Testing approach

Manual verification via the dev server (no existing automated test suite
in this repo to extend):

- Connect two pieces away from the canvas center; confirm they snap together
  and drag as one unit afterward.
- Build a full cluster entirely off to one side of the canvas; confirm
  win triggers without ever visiting a center "zone."
- Drop a piece that simultaneously completes two edges at once (closes a
  gap between two already-joined neighbors); confirm both connections
  register in one drop.
- Drag an assembled multi-piece cluster and confirm all members move
  together with no relative drift.
- Verify "Show Guide" now shows a corner thumbnail instead of the removed
  center overlay, on both default and uploaded images.
- Repeat the above on touch (mobile/tablet emulation) in addition to mouse.
