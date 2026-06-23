/**
 * @fileoverview Main React presentation component for JigsawIt.
 * The canvas fills the entire area to the right of the sidebar.
 * Pieces scatter across the full canvas and connect directly to their
 * correct grid-neighbors wherever they're dragged — there is no fixed
 * drop zone. Connected pieces move together as a single cluster.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
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
