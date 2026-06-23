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

  const [view, setView]                           = useState('selection'); // 'selection' | 'game'
  const [selectedImage, setSelectedImage]         = useState(DEFAULT_IMAGES[0].url);
  const [selectedDifficulty, setSelectedDifficulty] = useState('easy');
  const [showPreview, setShowPreview]             = useState(false);
  const [draggingGroupId, setDraggingGroupId]     = useState(null);
  const [completedPuzzles, setCompletedPuzzles]   = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('completedPuzzles') || '[]');
    } catch {
      return [];
    }
  });

  /** Ref to the full-screen canvas section element. */
  const canvasRef = useRef(null);

  // ── Persist completion ─────────────────────────────────────────────────────

  useEffect(() => {
    if (isWon && image) {
      setCompletedPuzzles(prev => {
        if (prev.includes(image)) return prev;
        const next = [...prev, image];
        localStorage.setItem('completedPuzzles', JSON.stringify(next));
        return next;
      });
    }
  }, [isWon, image]);

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
        handleStartGame(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleStartGame = (imageUrl) => {
    setSelectedImage(imageUrl);
    setView('game');
    // We give a tiny delay so the GameView can mount and the canvas section can be measured.
    setTimeout(() => startNewGame(imageUrl, selectedDifficulty), 50);
  };

  const handleReset = () => startNewGame(selectedImage, selectedDifficulty);

  const solvedCount = largestGroupSize(pieces);
  const progressPercent = pieces.length > 0 ? Math.round((solvedCount / pieces.length) * 100) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (view === 'selection') {
    return (
      <div className={styles.appContainer}>
        <header className={styles.appHeader}>
          <div className={styles.brand}>
            <h1>JigsawIt <span className={styles.logoPuzzle}>🧩</span></h1>
            <p className={styles.tagline}>Slice any image. Solve the puzzle.</p>
          </div>
        </header>

        <main className={styles.selectionLayout}>
          <section className={styles.selectionCard}>
            <div className={styles.difficultyPicker}>
              <h3>Select Difficulty</h3>
              <div className={styles.diffGrid}>
                {['easy', 'medium', 'hard'].map((diff) => (
                  <button
                    key={diff}
                    className={`${styles.diffBtn} ${selectedDifficulty === diff ? styles.activeDiff : ''}`}
                    onClick={() => setSelectedDifficulty(diff)}
                  >
                    {diff.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.imageGallery}>
              <h3>Choose a Puzzle</h3>
              <div className={styles.galleryGrid}>
                {DEFAULT_IMAGES.map((img) => (
                  <button
                    key={img.url}
                    className={styles.galleryItem}
                    onClick={() => handleStartGame(img.url)}
                  >
                    <div className={styles.galleryThumbWrap}>
                      <img src={img.url} alt={img.label} />
                      {completedPuzzles.includes(img.url) && (
                        <div className={styles.completedBadge}>
                          <span className={styles.checkIcon}>✓</span>
                          <span>COMPLETED</span>
                        </div>
                      )}
                    </div>
                    <span className={styles.galleryLabel}>{img.label}</span>
                  </button>
                ))}
              </div>

              <div className={styles.uploadBox}>
                <p>...or use your own photo</p>
                <label className={styles.uploadAction}>
                  📁 Upload Image
                  <input type="file" accept="image/*" onChange={handleFileUpload} className={styles.hiddenInput} />
                </label>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // Game View
  return (
    <div className={styles.appContainer}>
      <header className={styles.gameHeader}>
        <button className={styles.backBtn} onClick={() => setView('selection')}>
          ← Back
        </button>

        <div className={styles.gameStats}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>TIME</span>
            <span className={styles.statValue}>{formatTime(timeElapsed)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>MOVES</span>
            <span className={styles.statValue}>{movesCount}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>PROGRESS</span>
            <span className={styles.statValue}>{progressPercent}%</span>
          </div>
        </div>

        <div className={styles.gameActions}>
          <button
            className={`${styles.actionBtn} ${showPreview ? styles.activeAction : ''}`}
            onClick={() => setShowPreview(!showPreview)}
            title="Toggle Guide"
          >
            👁️
          </button>
          <button className={styles.actionBtn} onClick={handleReset} title="Restart">
            🔁
          </button>
        </div>
      </header>

      {/* Mobile-friendly top progress bar */}
      <div className={styles.topProgressBar}>
        <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
      </div>

      <main className={styles.gameLayout}>
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
              {showPreview && image && (
                <div className={styles.guideThumbnail}>
                  <img src={image} alt="Reference" />
                </div>
              )}
              {pieces.map((piece) => {
                const isDragging = draggingGroupId !== null && piece.groupId === draggingGroupId;
                return (
                  <img
                    key={piece.id}
                    src={piece.imageData}
                    alt=""
                    data-testid={`piece-${piece.id}`}
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

          {isWon && (
            <div className={styles.winOverlay}>
              <div className={styles.winCard}>
                <div className={styles.winEmoji}>🎉</div>
                <h2>Puzzle Solved!</h2>
                <div className={styles.winStats}>
                  <div className={styles.winRow}>
                    <span>Time</span><strong>{formatTime(timeElapsed)}</strong>
                  </div>
                  <div className={styles.winRow}>
                    <span>Moves</span><strong>{movesCount}</strong>
                  </div>
                </div>
                <button className={styles.playAgainBtn} onClick={() => setView('selection')}>
                  Awesome!
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
