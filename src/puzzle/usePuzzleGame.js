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

      const { w: canvasW, h: canvasH } = canvasSizeRef.current;
      const isSmallScreen = canvasW < 600 || canvasH < 600;

      // On mobile, we want the board to be smaller relative to the canvas
      // so there's more room to scatter pieces.
      const scaleFactor = isSmallScreen ? 0.45 : 0.85;

      // Calculate responsive max dimensions
      let maxWidth = Math.min(800, canvasW * scaleFactor);
      let maxHeight = Math.min(600, canvasH * scaleFactor);

      // On phones, also cap the board by piece count so each piece's touch
      // target stays a comfortable, constant size regardless of difficulty.
      // Without this, "easy" (few, large pieces) ballooned to take up a huge
      // fraction of a small screen since it only scaled with canvas size.
      if (isSmallScreen) {
        const maxPieceSize = 60;
        maxWidth = Math.min(maxWidth, maxPieceSize * cols);
        maxHeight = Math.min(maxHeight, maxPieceSize * rows);
      }

      const { pieces, boardWidth, boardHeight } = generatePuzzlePieces(img, rows, cols, maxWidth, maxHeight);

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
