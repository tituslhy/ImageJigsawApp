# Piece-to-Piece Jigsaw Snapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let jigsaw pieces connect directly to their correct neighbors wherever they are dragged on the canvas, instead of only snapping into one fixed absolute slot inside a dashed rectangle.

**Architecture:** Replace the per-piece "distance to one absolute target" model with a union-find-style grouping model: every piece carries a `groupId`; on drop, the dragged piece's whole group is checked against every grid-adjacent piece outside the group, and matches within the existing snap threshold trigger a rigid-translation merge. The dashed rectangle is removed; the optional reference image moves to a fixed corner thumbnail.

**Tech Stack:** React 19 + Vite, plain JS hooks, CSS Modules. No new dependencies.

## Global Constraints

- Functional React components only (per `AGENTS.md`).
- Vanilla JS where possible — no new libraries (per `AGENTS.md`).
- No UI libraries, no Tailwind/Chakra/MUI, no external animation libraries (per `AGENTS.md`).
- CSS variables already define the theme (`--bg: #1a1a2e`, `--board: #16213e`, `--accent: #e94560`) — reuse them, don't hardcode new colors (per `AGENTS.md`).
- This repo has no automated test framework (`package.json` only has `vite`, `eslint`) — verification is `npm run lint`, `npm run build`, and scripted browser checks against the dev server, per the approved spec's "Testing approach" section.
- Tasks below are strictly sequential (each depends on the file state left by the previous one) — this is a single shared-file change, not an independent-workstream situation, so it is implemented as one ordered sequence rather than parallel subagents.

---

### Task 1: Cluster-based connection engine + group dragging

**Files:**
- Modify: `src/puzzle/usePuzzleGame.js` (full rewrite)
- Modify: `src/components/PuzzleApp.jsx` (full rewrite)

**Interfaces:**
- Consumes: `generatePuzzlePieces(img, rows, cols)` from `src/puzzle/generator.js`, unchanged — returns `{ pieces, boardWidth, boardHeight }` where each piece has `{ id, row, col, imageData, correctX, correctY, width, height, pad, locked }`. `correctX`/`correctY` are board-relative (`col * pieceWidth`, `row * pieceHeight`). (`locked` is no longer used by anything in this task and is left untouched on the piece object — out of scope to remove from the generator.)
- Produces: hook now returns `{ pieces, difficulty, image, boardWidth, boardHeight, timeElapsed, movesCount, isWon, hasStarted, isLoading, error, setCanvasSize, startNewGame, moveGroup, tryConnect }`. `targetX`/`targetY`/`updatePiecePosition`/`snapPiece` no longer exist. Each piece in `pieces` now also has `groupId` (string, equal to some piece's `id`) and `snapThreshold` (number); it no longer has a meaningful `locked` value to read. `moveGroup(memberStarts, dx, dy)` takes `memberStarts: Array<{id: string, startX: number, startY: number}>` and two numbers. `tryConnect(id)` takes a single piece id.

- [ ] **Step 1: Rewrite `src/puzzle/usePuzzleGame.js`**

Replace the entire file with:

```js
/**
 * @fileoverview Custom React hook for JigsawIt puzzle state management.
 * All piece coordinates are in "canvas space" — the full play surface.
 * Pieces connect directly to their correct grid-neighbors wherever they
 * are dragged; there is no fixed absolute target position. A piece's
 * groupId tracks which other pieces it is currently connected to — all
 * pieces sharing a groupId move together as one rigid cluster.
 * Exposes setCanvasSize so the component can inform the hook of the
 * available canvas dimensions before/after starting a game.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { loadImage, generatePuzzlePieces } from './generator';

/**
 * Gets grid size (rows and columns) based on difficulty string.
 *
 * @param {string} difficulty Difficulty level ('easy', 'medium', 'hard').
 * @returns {{rows: number, cols: number}}
 */
function getGridSize(difficulty) {
  switch (difficulty) {
    case 'medium': return { rows: 4, cols: 4 };
    case 'hard':   return { rows: 6, cols: 6 };
    default:       return { rows: 3, cols: 3 };
  }
}

/**
 * Custom hook to manage the jigsaw puzzle game state.
 * All coordinates (piece.x, piece.y, piece.correctX, piece.correctY) are in
 * canvas-space pixels — relative to the top-left of the play surface.
 * correctX/correctY are board-relative (col * pieceWidth, row * pieceHeight)
 * and are only ever used to compute the *expected offset* between two
 * grid-adjacent pieces — never as an absolute target position.
 *
 * @returns {Object} Game state and action methods.
 */
export function usePuzzleGame() {
  const [state, setState] = useState({
    pieces: [],
    difficulty: 'easy',
    image: null,
    boardWidth: 0,
    boardHeight: 0,
    timeElapsed: 0,
    movesCount: 0,
    isWon: false,
    hasStarted: false,
    isLoading: false,
    error: null
  });

  const timerRef = useRef(null);

  /**
   * Ref that always holds the latest canvas dimensions.
   * Using a ref (not state) avoids triggering re-renders on resize
   * and prevents stale closures inside startNewGame.
   * Defaults to a comfortable desktop size so the first game renders
   * even before the component has measured itself.
   */
  const canvasSizeRef = useRef({ w: 900, h: 620 });

  // ── Timer management ───────────────────────────────────────────────────────

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (state.hasStarted && !state.isWon && !state.isLoading) {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setState((prev) => ({ ...prev, timeElapsed: prev.timeElapsed + 1 }));
        }, 1000);
      }
    } else {
      stopTimer();
    }
    return stopTimer;
  }, [state.hasStarted, state.isWon, state.isLoading, stopTimer]);

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Tells the hook the current canvas pixel dimensions so that subsequent
   * calls to startNewGame can scatter pieces within the visible area.
   * Call this from a ResizeObserver or useEffect in the component.
   *
   * @param {number} w Canvas width in pixels.
   * @param {number} h Canvas height in pixels.
   */
  const setCanvasSize = useCallback((w, h) => {
    canvasSizeRef.current = { w, h };
  }, []);

  /**
   * Initializes a new game: loads the image, slices it into pieces,
   * and scatters pieces at random positions across the full canvas.
   * Each piece starts in its own group (groupId === piece.id).
   *
   * @param {string} imageUrl URL of the image to use for the puzzle.
   * @param {string} difficulty Difficulty level ('easy', 'medium', 'hard').
   */
  const startNewGame = useCallback(async (imageUrl, difficulty) => {
    stopTimer();
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      isWon: false,
      hasStarted: false,
      timeElapsed: 0,
      movesCount: 0,
      pieces: [],
      difficulty
    }));

    try {
      const img = await loadImage(imageUrl);
      const { rows, cols } = getGridSize(difficulty);
      const { pieces, boardWidth, boardHeight } = generatePuzzlePieces(img, rows, cols);

      const { w: canvasW, h: canvasH } = canvasSizeRef.current;

      const pieceW = boardWidth / cols;
      const pieceH = boardHeight / rows;
      const snapThreshold = Math.min(pieceW, pieceH) * 0.32;

      // Scatter pieces at random positions across the full canvas.
      // Each piece starts as its own group of one.
      const shuffledPieces = pieces.map((piece) => ({
        ...piece,
        x: pieceW * 0.5 + Math.random() * Math.max(1, canvasW - pieceW),
        y: pieceH * 0.5 + Math.random() * Math.max(1, canvasH - pieceH),
        snapThreshold,
        groupId: piece.id
      }));

      setState((prev) => ({
        ...prev,
        pieces: shuffledPieces,
        boardWidth,
        boardHeight,
        image: imageUrl,
        isLoading: false
      }));
    } catch (err) {
      console.error('Failed to initialize puzzle game:', err);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err.message || 'Failed to load image.'
      }));
    }
  }, [stopTimer]);

  /**
   * Moves every piece in a dragged group by the same delta, preserving
   * the group's rigid formation. Also starts the game timer on the very
   * first move.
   *
   * @param {Array<{id: string, startX: number, startY: number}>} memberStarts
   *   Each dragged group member's id and its position when the drag began.
   * @param {number} dx Horizontal mouse delta since drag start.
   * @param {number} dy Vertical mouse delta since drag start.
   */
  const moveGroup = useCallback((memberStarts, dx, dy) => {
    setState((prev) => {
      const startById = new Map(memberStarts.map((m) => [m.id, m]));
      const newPieces = prev.pieces.map((piece) => {
        const start = startById.get(piece.id);
        return start ? { ...piece, x: start.startX + dx, y: start.startY + dy } : piece;
      });
      return {
        ...prev,
        pieces: newPieces,
        hasStarted: prev.hasStarted ? true : !prev.isWon
      };
    });
  }, []);

  /**
   * Called after a drag ends. Checks the dragged piece's whole group
   * against every grid-adjacent piece outside the group; any neighbor
   * within snapping distance gets pulled into the group with a precise
   * rigid-translation correction. Repeats until no further connection is
   * found in this drop, so multi-side and chain connections resolve in a
   * single call. Increments the move counter and updates the win flag.
   *
   * @param {string} id The dragged piece's id.
   */
  const tryConnect = useCallback((id) => {
    setState((prev) => {
      let pieces = prev.pieces;
      let merged = true;

      while (merged) {
        merged = false;

        const dragged = pieces.find((p) => p.id === id);
        const groupId = dragged.groupId;
        const byRowCol = new Map(pieces.map((p) => [`${p.row},${p.col}`, p]));
        const groupMembers = pieces.filter((p) => p.groupId === groupId);

        let best = null;
        for (const member of groupMembers) {
          const neighborCoords = [
            [member.row - 1, member.col],
            [member.row + 1, member.col],
            [member.row, member.col - 1],
            [member.row, member.col + 1]
          ];

          for (const [nr, nc] of neighborCoords) {
            const neighbor = byRowCol.get(`${nr},${nc}`);
            if (!neighbor || neighbor.groupId === groupId) continue;

            const expectedDX = neighbor.correctX - member.correctX;
            const expectedDY = neighbor.correctY - member.correctY;
            const actualDX = neighbor.x - member.x;
            const actualDY = neighbor.y - member.y;
            const dist = Math.hypot(actualDX - expectedDX, actualDY - expectedDY);
            const threshold = member.snapThreshold ?? 40;

            if (dist < threshold && (!best || dist < best.dist)) {
              best = {
                dist,
                targetGroupId: neighbor.groupId,
                correctionX: (neighbor.x - expectedDX) - member.x,
                correctionY: (neighbor.y - expectedDY) - member.y
              };
            }
          }
        }

        if (best) {
          pieces = pieces.map((p) =>
            p.groupId === groupId
              ? { ...p, x: p.x + best.correctionX, y: p.y + best.correctionY, groupId: best.targetGroupId }
              : p
          );
          merged = true;
        }
      }

      const isWon = pieces.length > 0 && pieces.every((p) => p.groupId === pieces[0].groupId);

      return { ...prev, pieces, movesCount: prev.movesCount + 1, isWon };
    });
  }, []);

  return {
    ...state,
    setCanvasSize,
    startNewGame,
    moveGroup,
    tryConnect
  };
}
```

- [ ] **Step 2: Lint check**

Run: `npm run lint`
Expected: no errors (this file is syntactically self-contained; `src/components/PuzzleApp.jsx` still references the old hook shape at this point, but ESLint cannot detect that since there's no static typing — it will be fixed in Step 3).

- [ ] **Step 3: Rewrite `src/components/PuzzleApp.jsx`**

Replace the entire file with:

```jsx
/**
 * @fileoverview Main React presentation component for JigsawIt.
 * The canvas fills the entire area to the right of the sidebar.
 * Pieces scatter across the full canvas and connect directly to their
 * correct grid-neighbors wherever they're dragged — there is no fixed
 * drop zone. Connected pieces move together as a single cluster.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePuzzleGame } from '../puzzle/usePuzzleGame';
import styles from './PuzzleApp.module.css';

const DEFAULT_IMAGES = [
  { label: '🌿 Nature',   url: 'https://picsum.photos/seed/nature/800/600' },
  { label: '🏙️ City',    url: 'https://picsum.photos/seed/city/800/600' },
  { label: '🎨 Abstract', url: 'https://picsum.photos/seed/abstract/800/600' }
];

/**
 * Format seconds into MM:SS.
 *
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Extract clientX/Y from a mouse or touch event.
 *
 * @param {MouseEvent|TouchEvent} e
 * @returns {{clientX: number, clientY: number}}
 */
function getEventCoords(e) {
  if (e.touches && e.touches.length > 0)
    return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  if (e.changedTouches && e.changedTouches.length > 0)
    return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
  return { clientX: e.clientX, clientY: e.clientY };
}

/**
 * Counts how many pieces belong to the largest connected group, used as
 * the "solved" progress metric now that pieces connect into clusters
 * instead of locking individually into one absolute slot.
 *
 * @param {Array<Object>} pieces
 * @returns {number}
 */
function largestGroupSize(pieces) {
  const counts = new Map();
  for (const piece of pieces) {
    counts.set(piece.groupId, (counts.get(piece.groupId) || 0) + 1);
  }
  return counts.size > 0 ? Math.max(...counts.values()) : 0;
}

/**
 * Main presentation component for JigsawIt.
 *
 * @returns {React.ReactElement}
 */
export default function PuzzleApp() {
  const {
    pieces,
    difficulty,
    timeElapsed,
    movesCount,
    isWon,
    isLoading,
    error,
    setCanvasSize,
    startNewGame,
    moveGroup,
    tryConnect
  } = usePuzzleGame();

  const [selectedImage, setSelectedImage]         = useState(DEFAULT_IMAGES[0].url);
  const [selectedDifficulty, setSelectedDifficulty] = useState('easy');
  const [showPreview, setShowPreview]             = useState(false);
  const [draggingGroupId, setDraggingGroupId]     = useState(null);

  /** Ref to the full-screen canvas section element. */
  const canvasRef = useRef(null);

  /**
   * dragInfo holds mutable drag state. A ref avoids stale closures in
   * the stable window-level event handlers.
   */
  const dragInfo = useRef({ pieceId: null, startMouseX: 0, startMouseY: 0, memberStarts: [] });

  /** Stable refs for window listeners — same object every drag session. */
  const onMouseMove = useRef(null);
  const onMouseUp   = useRef(null);
  const onTouchMove = useRef(null);
  const onTouchEnd  = useRef(null);

  /** Always-fresh refs so stable handlers can read current values/callbacks. */
  const moveGroupRef = useRef(moveGroup);
  const connectRef   = useRef(tryConnect);
  const piecesRef    = useRef(pieces);
  const isWonRef     = useRef(isWon);
  useEffect(() => { moveGroupRef.current = moveGroup; }, [moveGroup]);
  useEffect(() => { connectRef.current   = tryConnect; }, [tryConnect]);
  useEffect(() => { piecesRef.current    = pieces; },    [pieces]);
  useEffect(() => { isWonRef.current     = isWon; },     [isWon]);

  // ── Canvas size tracking ───────────────────────────────────────────────────

  /**
   * Measures the canvas element and notifies the hook so it can scatter
   * pieces within the visible area. Called on mount, resize, and after
   * game start.
   */
  const measureCanvas = useCallback(() => {
    if (!canvasRef.current) return;
    const { clientWidth: w, clientHeight: h } = canvasRef.current;
    setCanvasSize(w, h);
  }, [setCanvasSize]);

  useEffect(() => {
    measureCanvas();
    const ro = new ResizeObserver(measureCanvas);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [measureCanvas]);

  // ── Initial game load ──────────────────────────────────────────────────────

  useEffect(() => {
    // Small timeout lets the canvas measure itself first.
    const t = setTimeout(() => startNewGame(selectedImage, selectedDifficulty), 80);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Drag handling ──────────────────────────────────────────────────────────

  /**
   * Begins dragging a piece's whole connected group. Registers stable
   * window-level handlers that are removed exactly (same reference) when
   * the drag ends.
   *
   * @param {React.SyntheticEvent} e
   * @param {Object} piece
   */
  const handleDragStart = useCallback((e, piece) => {
    if (isWonRef.current) return;
    if (e.cancelable) e.preventDefault();

    const coords = getEventCoords(e);
    const memberStarts = piecesRef.current
      .filter((p) => p.groupId === piece.groupId)
      .map((p) => ({ id: p.id, startX: p.x, startY: p.y }));

    dragInfo.current = {
      pieceId: piece.id,
      startMouseX: coords.clientX,
      startMouseY: coords.clientY,
      memberStarts
    };
    setDraggingGroupId(piece.groupId);

    onMouseMove.current = (ev) => {
      const info = dragInfo.current;
      if (!info.pieceId) return;
      const c = getEventCoords(ev);
      moveGroupRef.current(
        info.memberStarts,
        c.clientX - info.startMouseX,
        c.clientY - info.startMouseY
      );
    };

    onMouseUp.current = () => {
      const { pieceId } = dragInfo.current;
      if (!pieceId) return;
      connectRef.current(pieceId);
      dragInfo.current.pieceId = null;
      setDraggingGroupId(null);
      window.removeEventListener('mousemove', onMouseMove.current);
      window.removeEventListener('mouseup',   onMouseUp.current);
      window.removeEventListener('touchmove', onTouchMove.current);
      window.removeEventListener('touchend',  onTouchEnd.current);
    };

    onTouchMove.current = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      onMouseMove.current(ev);
    };
    onTouchEnd.current = () => onMouseUp.current();

    window.addEventListener('mousemove', onMouseMove.current);
    window.addEventListener('mouseup',   onMouseUp.current);
    window.addEventListener('touchmove', onTouchMove.current, { passive: false });
    window.addEventListener('touchend',  onTouchEnd.current);
  }, []);

  // No scale factor — canvas is 1:1 pixel. Drag delta maps directly to piece coords.

  // ── Control handlers ───────────────────────────────────────────────────────

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl === 'string') {
        setSelectedImage(dataUrl);
        startNewGame(dataUrl, selectedDifficulty);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDifficultyChange = (diff) => {
    setSelectedDifficulty(diff);
    startNewGame(selectedImage, diff);
  };

  const handleReset = () => startNewGame(selectedImage, selectedDifficulty);

  const handlePresetSelect = (url) => {
    setSelectedImage(url);
    startNewGame(url, selectedDifficulty);
  };

  const solvedCount = largestGroupSize(pieces);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.appContainer}>
      {/* ── Header ── */}
      <header className={styles.appHeader}>
        <div className={styles.brand}>
          <h1>JigsawIt <span className={styles.logoPuzzle}>🧩</span></h1>
          <p className={styles.tagline}>Slice any image. Solve the puzzle.</p>
        </div>
        <div className={styles.statsCard}>
          <div className={styles.statGroup}>
            <span className={styles.statLabel}>⏱️ Time</span>
            <span className={styles.statValue}>{formatTime(timeElapsed)}</span>
          </div>
          <div className={styles.statGroup}>
            <span className={styles.statLabel}>🔄 Moves</span>
            <span className={styles.statValue}>{movesCount}</span>
          </div>
          <div className={styles.statGroup}>
            <span className={styles.statLabel}>🧩 Solved</span>
            <span className={styles.statValue}>
              {pieces.length > 0 ? `${solvedCount}/${pieces.length}` : '—'}
            </span>
          </div>
        </div>
      </header>

      <main className={styles.gameLayout}>
        {/* ── Sidebar ── */}
        <aside className={styles.sidebar}>
          <div className={styles.controlSection}>
            <h3>Difficulty</h3>
            <div className={styles.btnGroup}>
              {['easy', 'medium', 'hard'].map((diff) => (
                <button
                  key={diff}
                  className={`${styles.controlBtn} ${selectedDifficulty === diff ? styles.activeBtn : ''}`}
                  onClick={() => handleDifficultyChange(diff)}
                >
                  {diff === 'easy' ? '🟢' : diff === 'medium' ? '🟡' : '🔴'} {diff.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.controlSection}>
            <h3>Image</h3>
            <div className={styles.presetGrid}>
              {DEFAULT_IMAGES.map((imgPreset) => (
                <button
                  key={imgPreset.url}
                  className={`${styles.presetBtn} ${selectedImage === imgPreset.url ? styles.activePreset : ''}`}
                  onClick={() => handlePresetSelect(imgPreset.url)}
                >
                  <div className={styles.presetPreviewWrap}>
                    <img src={imgPreset.url} alt={imgPreset.label} />
                  </div>
                  <span>{imgPreset.label}</span>
                </button>
              ))}
            </div>
            <label className={styles.uploadLabel}>
              📁 Upload your own
              <input type="file" accept="image/*" onChange={handleFileUpload} className={styles.hiddenInput} />
            </label>
          </div>

          <div className={styles.controlSection}>
            <h3>Options</h3>
            <div className={styles.optionsStack}>
              <button
                className={`${styles.controlBtn} ${showPreview ? styles.activeBtn : ''}`}
                onClick={() => setShowPreview((v) => !v)}
              >
                👁️ {showPreview ? 'Hide Guide' : 'Show Guide'}
              </button>
              <button className={styles.resetBtn} onClick={handleReset}>
                🔁 Restart
              </button>
            </div>
          </div>

          {/* Progress bar */}
          {pieces.length > 0 && (
            <div className={styles.progressSection}>
              <div className={styles.progressLabel}>
                <span>Progress</span>
                <span>{Math.round((solvedCount / pieces.length) * 100)}%</span>
              </div>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${(solvedCount / pieces.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </aside>

        {/* ── Full-screen Play Canvas ── */}
        <section ref={canvasRef} className={styles.playCanvas}>
          {isLoading && (
            <div className={styles.loadingSpinner}>
              <div className={styles.spinner} />
              <p>Cutting pieces…</p>
            </div>
          )}

          {error && !isLoading && (
            <div className={styles.errorMessage}>
              <p>⚠️ {error}</p>
              <button className={styles.resetBtn} onClick={handleReset}>Try Again</button>
            </div>
          )}

          {!isLoading && !error && pieces.length > 0 && (
            <>
              {/* Pieces — stacking order doesn't matter for correctness;
                  the dragged group is lifted above everything via z-index. */}
              {pieces.map((piece) => {
                const isDragging = draggingGroupId !== null && piece.groupId === draggingGroupId;
                return (
                  <img
                    key={piece.id}
                    src={piece.imageData}
                    alt=""
                    data-piece-id={piece.id}
                    data-row={piece.row}
                    data-col={piece.col}
                    data-group-id={piece.groupId}
                    data-x={piece.x}
                    data-y={piece.y}
                    data-correct-x={piece.correctX}
                    data-correct-y={piece.correctY}
                    className={`${styles.pieceImage} ${isDragging ? styles.dragging : ''}`}
                    style={{
                      left:   piece.x - piece.pad,
                      top:    piece.y - piece.pad,
                      width:  piece.width,
                      height: piece.height,
                      zIndex: isDragging ? 200 : 10,
                      cursor: isWon ? 'default' : (isDragging ? 'grabbing' : 'grab')
                    }}
                    onMouseDown={(e) => handleDragStart(e, piece)}
                    onTouchStart={(e) => handleDragStart(e, piece)}
                  />
                );
              })}
            </>
          )}

          {/* Win overlay */}
          {isWon && (
            <div className={styles.winOverlay}>
              <div className={styles.winCard}>
                <div className={styles.winEmoji}>🎉</div>
                <h2>Puzzle Solved!</h2>
                <p>You assembled the entire image. Nice work!</p>
                <div className={styles.winStats}>
                  <div className={styles.winRow}>
                    <span>Difficulty</span><strong>{difficulty.toUpperCase()}</strong>
                  </div>
                  <div className={styles.winRow}>
                    <span>Time</span><strong>{formatTime(timeElapsed)}</strong>
                  </div>
                  <div className={styles.winRow}>
                    <span>Moves</span><strong>{movesCount}</strong>
                  </div>
                </div>
                <button className={styles.playAgainBtn} onClick={handleReset}>
                  Play Again 🔄
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
```

Note: `boardWidth`/`boardHeight`/`image` are intentionally **not** destructured from the hook here — they aren't used until Task 2, and destructuring them now without using them would fail ESLint's `no-unused-vars` rule (part of `js.configs.recommended` in `eslint.config.js`).

- [ ] **Step 4: Lint check**

Run: `npm run lint`
Expected: no errors or warnings.

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: build succeeds (`vite build` completes, prints output file sizes, exits 0).

- [ ] **Step 6: Smoke-test the connection engine against the running dev server**

Start the dev server in the background:

```bash
npm run dev -- --port 5174 --strictPort &
for i in $(seq 1 10); do curl -s http://localhost:5174 >/dev/null && break; sleep 1; done
```

Fetch the Playwright tool schemas (they're deferred until first use):

`ToolSearch` with query `select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_wait_for,mcp__plugin_playwright_playwright__browser_evaluate`

Call `browser_navigate` to `http://localhost:5174`.

Call `browser_wait_for` for the text `"Cutting pieces"` to disappear (or wait ~1s — the puzzle loads from a 800x600 `picsum.photos` URL almost immediately).

Call `browser_evaluate` with this function as the payload (it drags piece (0,1) so it lands at the exact expected offset from piece (0,0), wherever piece (0,0) currently happens to be on the canvas, then reports whether the two pieces merged into one group):

```js
() => {
  function getPieces() {
    return Array.from(document.querySelectorAll('img[data-piece-id]')).map((el) => ({
      el,
      id: el.dataset.pieceId,
      row: Number(el.dataset.row),
      col: Number(el.dataset.col),
      groupId: el.dataset.groupId,
      x: Number(el.dataset.x),
      y: Number(el.dataset.y),
      correctX: Number(el.dataset.correctX),
      correctY: Number(el.dataset.correctY)
    }));
  }

  function fireMouse(target, type, clientX, clientY) {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 }));
  }

  const pieces = getPieces();
  const a = pieces.find((p) => p.row === 0 && p.col === 0);
  const b = pieces.find((p) => p.row === 0 && p.col === 1);

  const rectB = b.el.getBoundingClientRect();
  const startClientX = rectB.left + rectB.width / 2;
  const startClientY = rectB.top + rectB.height / 2;

  const desiredBX = a.x + (b.correctX - a.correctX);
  const desiredBY = a.y + (b.correctY - a.correctY);
  const dx = desiredBX - b.x;
  const dy = desiredBY - b.y;

  fireMouse(b.el, 'mousedown', startClientX, startClientY);
  fireMouse(window, 'mousemove', startClientX + dx, startClientY + dy);
  fireMouse(window, 'mouseup', startClientX + dx, startClientY + dy);

  const after = getPieces();
  const aAfter = after.find((p) => p.id === a.id);
  const bAfter = after.find((p) => p.id === b.id);
  return { sameGroup: aAfter.groupId === bAfter.groupId, aGroup: aAfter.groupId, bGroup: bAfter.groupId };
}
```

Expected: returns `{ sameGroup: true, ... }` with `aGroup === bGroup`.

Stop the dev server:

```bash
pkill -f "vite.*--port 5174" || true
```

- [ ] **Step 7: Commit**

```bash
git add src/puzzle/usePuzzleGame.js src/components/PuzzleApp.jsx
git commit -m "feat: connect jigsaw pieces by neighbor adjacency instead of one fixed target"
```

---

### Task 2: Remove the dashed target zone, add a corner guide thumbnail

**Files:**
- Modify: `src/components/PuzzleApp.module.css:325-369` (remove `.targetZone`, `.guideImage`, `.corner`, `.tl`, `.tr`, `.bl`, `.br`; add `.guideThumbnail`)
- Modify: `src/components/PuzzleApp.jsx` (re-add `image` to the hook destructure from Task 1; add the thumbnail JSX)

**Interfaces:**
- Consumes: `image` from the hook (already returned by `usePuzzleGame` — unchanged since before Task 1, just not destructured in Task 1's version of the component).
- Produces: no new exports. Adds a `.guideThumbnail` CSS class consumed only by this component.

- [ ] **Step 1: Replace the target-zone CSS block**

In `src/components/PuzzleApp.module.css`, replace lines 325-369 (from `/* ── Target zone ─...` through the `.br { ... }` rule) with:

```css
/* ── Guide thumbnail ──────────────────────────────────────────── */
/*
 * Optional small reference image shown in a fixed canvas corner via the
 * "Show Guide" toggle. Purely a visual aid — it has no effect on where
 * pieces connect.
 */
.guideThumbnail {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 140px;
  border: 1.5px solid rgba(233, 69, 96, 0.4);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  pointer-events: none;
  z-index: 150;
  opacity: 0.92;
}

.guideThumbnail img {
  display: block;
  width: 100%;
  height: auto;
}
```

- [ ] **Step 2: Add the thumbnail to `PuzzleApp.jsx` and re-add `image` to the destructure**

In `src/components/PuzzleApp.jsx`, change the hook destructure (added in Task 1) from:

```jsx
  const {
    pieces,
    difficulty,
    timeElapsed,
    movesCount,
    isWon,
    isLoading,
    error,
    setCanvasSize,
    startNewGame,
    moveGroup,
    tryConnect
  } = usePuzzleGame();
```

to:

```jsx
  const {
    pieces,
    difficulty,
    image,
    timeElapsed,
    movesCount,
    isWon,
    isLoading,
    error,
    setCanvasSize,
    startNewGame,
    moveGroup,
    tryConnect
  } = usePuzzleGame();
```

Then, inside the `{!isLoading && !error && pieces.length > 0 && (<> ... </>)}` block, immediately before the `{pieces.map((piece) => { ... })}` line, add:

```jsx
              {showPreview && image && (
                <div className={styles.guideThumbnail}>
                  <img src={image} alt="Reference" />
                </div>
              )}
```

- [ ] **Step 3: Lint check**

Run: `npm run lint`
Expected: no errors or warnings.

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Smoke-test the guide toggle against the running dev server**

Start the dev server and wait for it, same as Task 1 Step 6:

```bash
npm run dev -- --port 5174 --strictPort &
for i in $(seq 1 10); do curl -s http://localhost:5174 >/dev/null && break; sleep 1; done
```

Use the already-loaded Playwright tools: `browser_navigate` to `http://localhost:5174`, then `browser_evaluate`:

```js
() => !!document.querySelector('img[alt="Reference"]')
```

Expected: `false` (guide is off by default).

Use `browser_snapshot` to find the "Show Guide" button, then `browser_click` it. Re-run the same `browser_evaluate` check.

Expected: `true`. Also confirm via `browser_evaluate`:

```js
() => !!document.querySelector('.targetZone, [class*="targetZone"]')
```

Expected: `false` (dashed rectangle is gone — note CSS module class names are hashed, so this checks for any class containing "targetZone" as an extra safety net; it should not match anything since the class was deleted).

Stop the dev server:

```bash
pkill -f "vite.*--port 5174" || true
```

- [ ] **Step 6: Commit**

```bash
git add src/components/PuzzleApp.jsx src/components/PuzzleApp.module.css
git commit -m "feat: replace dashed target zone with a corner reference thumbnail"
```

---

### Task 3: Full scenario verification pass

**Files:** none (verification only — no code changes expected; if any scenario fails, fix the relevant file from Task 1 or 2 before continuing).

**Interfaces:**
- Consumes: the running dev server and the `data-piece-id`/`data-row`/`data-col`/`data-group-id`/`data-x`/`data-y`/`data-correct-x`/`data-correct-y` attributes added to each piece `<img>` in Task 1, plus the `.guideThumbnail`/`img[alt="Reference"]` markup added in Task 2.
- Produces: nothing new — this is the spec's "Testing approach" checklist executed end-to-end as the final gate before considering the feature done.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev -- --port 5174 --strictPort &
for i in $(seq 1 10); do curl -s http://localhost:5174 >/dev/null && break; sleep 1; done
```

`ToolSearch` for `select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_evaluate,mcp__plugin_playwright_playwright__browser_snapshot,mcp__plugin_playwright_playwright__browser_click` if not already loaded, then `browser_navigate` to `http://localhost:5174`.

- [ ] **Step 2: Verify connecting two pieces away from the canvas center, and that the cluster then drags as one unit**

`browser_evaluate`:

```js
() => {
  function getPieces() {
    return Array.from(document.querySelectorAll('img[data-piece-id]')).map((el) => ({
      el,
      id: el.dataset.pieceId,
      row: Number(el.dataset.row),
      col: Number(el.dataset.col),
      groupId: el.dataset.groupId,
      x: Number(el.dataset.x),
      y: Number(el.dataset.y),
      correctX: Number(el.dataset.correctX),
      correctY: Number(el.dataset.correctY)
    }));
  }
  function fireMouse(target, type, clientX, clientY) {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 }));
  }
  function dragPieceTo(piece, clientX, clientY) {
    const rect = piece.el.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    fireMouse(piece.el, 'mousedown', startX, startY);
    fireMouse(window, 'mousemove', clientX, clientY);
    fireMouse(window, 'mouseup', clientX, clientY);
  }

  // 1. Drag piece (0,0) into the canvas's top-left corner, far from center.
  let pieces = getPieces();
  let a = pieces.find((p) => p.row === 0 && p.col === 0);
  dragPieceTo(a, 90, 90);

  // 2. Drag piece (0,1) so it lands exactly where it should relative to a's new position.
  pieces = getPieces();
  a = pieces.find((p) => p.row === 0 && p.col === 0);
  const b = pieces.find((p) => p.row === 0 && p.col === 1);
  const bRect = b.el.getBoundingClientRect();
  const desiredBX = a.x + (b.correctX - a.correctX);
  const desiredBY = a.y + (b.correctY - a.correctY);
  const dx = desiredBX - b.x;
  const dy = desiredBY - b.y;
  const bStartX = bRect.left + bRect.width / 2;
  const bStartY = bRect.top + bRect.height / 2;
  dragPieceTo(b, bStartX + dx, bStartY + dy);

  pieces = getPieces();
  a = pieces.find((p) => p.row === 0 && p.col === 0);
  const bAfter = pieces.find((p) => p.row === 0 && p.col === 1);
  const connectedAwayFromCenter = a.groupId === bAfter.groupId && a.x < 300 && a.y < 300;

  // 3. Drag the now-merged cluster (grab piece a) by (200, 150) and confirm both move together.
  const aRectNow = a.el.getBoundingClientRect();
  const beforeAx = a.x, beforeAy = a.y, beforeBx = bAfter.x, beforeBy = bAfter.y;
  dragPieceTo(a, aRectNow.left + aRectNow.width / 2 + 200, aRectNow.top + aRectNow.height / 2 + 150);

  pieces = getPieces();
  const aMoved = pieces.find((p) => p.row === 0 && p.col === 0);
  const bMoved = pieces.find((p) => p.row === 0 && p.col === 1);
  const movedTogether =
    Math.abs((aMoved.x - beforeAx) - 200) < 1 &&
    Math.abs((aMoved.y - beforeAy) - 150) < 1 &&
    Math.abs((bMoved.x - beforeBx) - 200) < 1 &&
    Math.abs((bMoved.y - beforeBy) - 150) < 1;

  return { connectedAwayFromCenter, movedTogether };
}
```

Expected: `{ connectedAwayFromCenter: true, movedTogether: true }`.

- [ ] **Step 3: Verify a single drop can complete two connections at once (closing a gap between two already-joined neighbors)**

Reload the page first (`browser_navigate` to `http://localhost:5174` again) for a clean 3x3 "easy" puzzle, then `browser_evaluate`:

```js
() => {
  function getPieces() {
    return Array.from(document.querySelectorAll('img[data-piece-id]')).map((el) => ({
      el,
      id: el.dataset.pieceId,
      row: Number(el.dataset.row),
      col: Number(el.dataset.col),
      groupId: el.dataset.groupId,
      x: Number(el.dataset.x),
      y: Number(el.dataset.y),
      correctX: Number(el.dataset.correctX),
      correctY: Number(el.dataset.correctY)
    }));
  }
  function fireMouse(target, type, clientX, clientY) {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 }));
  }
  function dragPieceTo(piece, clientX, clientY) {
    const rect = piece.el.getBoundingClientRect();
    fireMouse(piece.el, 'mousedown', rect.left + rect.width / 2, rect.top + rect.height / 2);
    fireMouse(window, 'mousemove', clientX, clientY);
    fireMouse(window, 'mouseup', clientX, clientY);
  }
  function connect(fromRow, fromCol, toRow, toCol) {
    const pieces = getPieces();
    const from = pieces.find((p) => p.row === fromRow && p.col === fromCol);
    const to = pieces.find((p) => p.row === toRow && p.col === toCol);
    const toRect = to.el.getBoundingClientRect();
    const desiredX = from.x + (to.correctX - from.correctX);
    const desiredY = from.y + (to.correctY - from.correctY);
    const dx = desiredX - to.x;
    const dy = desiredY - to.y;
    dragPieceTo(to, toRect.left + toRect.width / 2 + dx, toRect.top + toRect.height / 2 + dy);
  }

  // Build an L-shape: (0,0)-(0,1) and (0,0)-(1,0), leaving (1,1) separate.
  connect(0, 0, 0, 1);
  connect(0, 0, 1, 0);

  // Now drop (1,1) into the gap — it has neighbors (0,1) [above] and (1,0) [left],
  // both already in the L-shaped group. Position it relative to (1,0).
  const before = getPieces();
  const anchor = before.find((p) => p.row === 1 && p.col === 0);
  const target = before.find((p) => p.row === 1 && p.col === 1);
  const targetRect = target.el.getBoundingClientRect();
  const desiredX = anchor.x + (target.correctX - anchor.correctX);
  const desiredY = anchor.y + (target.correctY - anchor.correctY);
  const dx = desiredX - target.x;
  const dy = desiredY - target.y;
  dragPieceTo(target, targetRect.left + targetRect.width / 2 + dx, targetRect.top + targetRect.height / 2 + dy);

  const after = getPieces();
  const groupIds = new Set(
    after.filter((p) => (p.row === 0 && p.col === 0) || (p.row === 0 && p.col === 1) ||
                         (p.row === 1 && p.col === 0) || (p.row === 1 && p.col === 1))
         .map((p) => p.groupId)
  );
  return { allFourSameGroup: groupIds.size === 1 };
}
```

Expected: `{ allFourSameGroup: true }`.

- [ ] **Step 4: Verify the puzzle can be fully solved off-center and the win overlay fires**

`browser_navigate` to `http://localhost:5174` for a fresh 3x3 board, then `browser_evaluate` to connect all remaining pairs (reuse the same `connect(fromRow, fromCol, toRow, toCol)` helper from Step 3, called for every grid-adjacent pair: `(0,0)-(0,1)`, `(0,1)-(0,2)`, `(0,0)-(1,0)`, `(1,0)-(1,1)`, `(1,1)-(1,2)`, `(1,0)-(2,0)`, `(2,0)-(2,1)`, `(2,1)-(2,2)`), then check:

```js
() => document.body.textContent.includes('Puzzle Solved!')
```

Expected: `true`.

- [ ] **Step 5: Verify the guide thumbnail toggle (regression check after Task 2)**

`browser_navigate` to `http://localhost:5174`. Use `browser_snapshot` to find the "Show Guide" control, `browser_click` it, then `browser_evaluate`:

```js
() => !!document.querySelector('img[alt="Reference"]')
```

Expected: `true`.

- [ ] **Step 6: Final build check and server cleanup**

```bash
npm run build
```

Expected: build succeeds.

```bash
pkill -f "vite.*--port 5174" || true
```

- [ ] **Step 7: Note on touch input (not scripted)**

Touch dragging shares the exact same delta-computation path as mouse dragging — `onTouchMove.current` calls `onMouseMove.current(ev)` directly (see `handleDragStart` in `PuzzleApp.jsx`), and both read coordinates through the same `getEventCoords` helper. Steps 2-4 above exercise that shared logic via mouse events. If you have access to a real touch device or a Playwright touch-emulation context, manually repeat the "connect two pieces" gesture there as a final confidence check — but no separate script is required since there is no separate code path to verify.

- [ ] **Step 8: Commit (only if Step 1-6 surfaced and you applied fixes)**

If every check above passed without code changes, there is nothing to commit for this task. If a fix was needed, commit it with a message describing the specific defect found, e.g.:

```bash
git add <fixed files>
git commit -m "fix: <specific defect found during verification pass>"
```
