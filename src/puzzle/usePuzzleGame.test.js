import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePuzzleGame } from './usePuzzleGame';
import * as generator from './generator';

vi.mock('./generator', () => ({
  loadImage: vi.fn(),
  generatePuzzlePieces: vi.fn()
}));

describe('usePuzzleGame', () => {
  const mockPieces = [
    { id: 'p1', row: 0, col: 0, correctX: 0, correctY: 0, width: 100, height: 100, pad: 10 },
    { id: 'p2', row: 0, col: 1, correctX: 100, correctY: 0, width: 100, height: 100, pad: 10 }
  ];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => usePuzzleGame());
    expect(result.current.pieces).toEqual([]);
    expect(result.current.isWon).toBe(false);
    expect(result.current.hasStarted).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('should start a new game successfully', async () => {
    const mockImg = { width: 800, height: 600 };
    generator.loadImage.mockResolvedValue(mockImg);
    generator.generatePuzzlePieces.mockReturnValue({
      pieces: mockPieces,
      boardWidth: 800,
      boardHeight: 600
    });

    const { result } = renderHook(() => usePuzzleGame());

    await act(async () => {
      await result.current.startNewGame('test.jpg', 'easy');
    });

    expect(result.current.pieces.length).toBe(2);
    expect(result.current.boardWidth).toBe(800);
    expect(result.current.image).toBe('test.jpg');
    expect(result.current.isLoading).toBe(false);
  });

  it('should handle game start error', async () => {
    generator.loadImage.mockRejectedValue(new Error('Load failed'));

    const { result } = renderHook(() => usePuzzleGame());

    await act(async () => {
      await result.current.startNewGame('test.jpg', 'easy');
    });

    expect(result.current.error).toBe('Load failed');
    expect(result.current.isLoading).toBe(false);
  });

  it('should update time elapsed when game has started', async () => {
    generator.loadImage.mockResolvedValue({});
    generator.generatePuzzlePieces.mockReturnValue({ pieces: mockPieces, boardWidth: 800, boardHeight: 600 });

    const { result } = renderHook(() => usePuzzleGame());

    await act(async () => {
      await result.current.startNewGame('test.jpg', 'easy');
    });

    // Simulate first move to start timer
    act(() => {
      result.current.moveGroup([{ id: 'p1', startX: 0, startY: 0 }], 10, 10);
    });

    expect(result.current.hasStarted).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.timeElapsed).toBe(2);
  });

  it('should move a group of pieces', async () => {
    generator.loadImage.mockResolvedValue({});
    generator.generatePuzzlePieces.mockReturnValue({ pieces: mockPieces, boardWidth: 800, boardHeight: 600 });

    const { result } = renderHook(() => usePuzzleGame());

    await act(async () => {
      await result.current.startNewGame('test.jpg', 'easy');
    });

    const p1 = result.current.pieces.find(p => p.id === 'p1');
    const startX = p1.x;
    const startY = p1.y;

    act(() => {
      result.current.moveGroup([{ id: 'p1', startX, startY }], 50, 50);
    });

    const movedP1 = result.current.pieces.find(p => p.id === 'p1');
    expect(movedP1.x).toBe(startX + 50);
    expect(movedP1.y).toBe(startY + 50);
  });

  it('should connect pieces when dropped near each other', async () => {
    generator.loadImage.mockResolvedValue({});
    // p1 is at (0,0), p2 is at (100,0) in correct positions
    generator.generatePuzzlePieces.mockReturnValue({ pieces: mockPieces, boardWidth: 800, boardHeight: 600 });

    const { result } = renderHook(() => usePuzzleGame());

    await act(async () => {
      await result.current.startNewGame('test.jpg', 'easy');
    });

    // Manually position pieces close to each other's relative correct positions
    // Let's say p1 is at (50, 50), then p2 should be at (150, 50)
    act(() => {
      // We need to override the random positions from startNewGame
      // Since we can't easily do that without another act/setState,
      // we'll use moveGroup to position them.
      const p1 = result.current.pieces.find(p => p.id === 'p1');
      const p2 = result.current.pieces.find(p => p.id === 'p2');

      result.current.moveGroup([{ id: 'p1', startX: p1.x, startY: p1.y }], 50 - p1.x, 50 - p1.y);
      result.current.moveGroup([{ id: 'p2', startX: p2.x, startY: p2.y }], 152 - p2.x, 52 - p2.y); // Slightly off but within snapThreshold
    });

    act(() => {
      result.current.tryConnect('p2');
    });

    const p1Final = result.current.pieces.find(p => p.id === 'p1');
    const p2Final = result.current.pieces.find(p => p.id === 'p2');

    expect(p1Final.groupId).toBe(p2Final.groupId);
    // Pieces should be perfectly aligned now: p2.x - p1.x === 100, p2.y - p1.y === 0
    expect(p2Final.x - p1Final.x).toBe(100);
    expect(p2Final.y - p1Final.y).toBe(0);
  });

  it('should detect win condition', async () => {
    generator.loadImage.mockResolvedValue({});
    generator.generatePuzzlePieces.mockReturnValue({ pieces: mockPieces, boardWidth: 800, boardHeight: 600 });

    const { result } = renderHook(() => usePuzzleGame());

    await act(async () => {
      await result.current.startNewGame('test.jpg', 'easy');
    });

    act(() => {
      const p1 = result.current.pieces.find(p => p.id === 'p1');
      const p2 = result.current.pieces.find(p => p.id === 'p2');

      // Move p2 exactly where it should be relative to p1
      result.current.moveGroup([{ id: 'p2', startX: p2.x, startY: p2.y }], (p1.x + 100) - p2.x, p1.y - p2.y);
    });

    act(() => {
      result.current.tryConnect('p2');
    });

    expect(result.current.isWon).toBe(true);
  });

  it('should handle different difficulties', async () => {
    generator.loadImage.mockResolvedValue({});
    generator.generatePuzzlePieces.mockReturnValue({ pieces: mockPieces, boardWidth: 800, boardHeight: 600 });

    const { result } = renderHook(() => usePuzzleGame());

    await act(async () => {
      await result.current.startNewGame('test.jpg', 'medium');
    });
    expect(result.current.difficulty).toBe('medium');

    await act(async () => {
      await result.current.startNewGame('test.jpg', 'hard');
    });
    expect(result.current.difficulty).toBe('hard');
  });

  it('should set canvas size', () => {
    const { result } = renderHook(() => usePuzzleGame());
    act(() => {
      result.current.setCanvasSize(1200, 800);
    });
    // canvasSizeRef is internal, but we can verify it's used in startNewGame
  });
});
