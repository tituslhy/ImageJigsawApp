import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PuzzleApp from './PuzzleApp';
import * as usePuzzleGameModule from '../puzzle/usePuzzleGame';

vi.mock('../puzzle/usePuzzleGame', () => ({
  usePuzzleGame: vi.fn()
}));

describe('PuzzleApp', () => {
  const mockStartNewGame = vi.fn();
  const mockSetCanvasSize = vi.fn();
  const mockMoveGroup = vi.fn();
  const mockTryConnect = vi.fn();

  const defaultGameState = {
    pieces: [],
    difficulty: 'easy',
    image: null,
    timeElapsed: 0,
    movesCount: 0,
    isWon: false,
    isLoading: false,
    error: null,
    setCanvasSize: mockSetCanvasSize,
    startNewGame: mockStartNewGame,
    moveGroup: mockMoveGroup,
    tryConnect: mockTryConnect
  };

  beforeEach(() => {
    vi.clearAllMocks();
    usePuzzleGameModule.usePuzzleGame.mockReturnValue(defaultGameState);

    // Mock ResizeObserver using function declaration for constructor
    vi.stubGlobal('ResizeObserver', vi.fn(function() {
      return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
    }));
  });

  it('renders correctly with initial state', () => {
    render(<PuzzleApp />);
    expect(screen.getByText(/JigsawIt/i)).toBeInTheDocument();
    expect(screen.getByText(/Slice any image/i)).toBeInTheDocument();
  });

  it('shows loading state when pieces are being cut', () => {
    usePuzzleGameModule.usePuzzleGame.mockReturnValue({
      ...defaultGameState,
      isLoading: true
    });
    render(<PuzzleApp />);
    expect(screen.getByText(/Cutting pieces…/i)).toBeInTheDocument();
  });

  it('shows error message when game fails to load', () => {
    usePuzzleGameModule.usePuzzleGame.mockReturnValue({
      ...defaultGameState,
      error: 'Failed to load image'
    });
    render(<PuzzleApp />);
    expect(screen.getByText(/Failed to load image/i)).toBeInTheDocument();
  });

  it('calls startNewGame when difficulty is changed', async () => {
    render(<PuzzleApp />);
    const mediumBtn = screen.getByText(/MEDIUM/i);
    fireEvent.click(mediumBtn);
    expect(mockStartNewGame).toHaveBeenCalledWith(expect.any(String), 'medium');
  });

  it('calls startNewGame when a preset image is selected', () => {
    render(<PuzzleApp />);
    const natureBtn = screen.getByText(/Nature/i);
    fireEvent.click(natureBtn);
    expect(mockStartNewGame).toHaveBeenCalled();
  });

  it('calls startNewGame when a file is uploaded', async () => {
    render(<PuzzleApp />);
    const file = new File(['(⌐□_□)'], 'test.png', { type: 'image/png' });
    const input = screen.getByLabelText(/Upload your own/i);

    // Mock FileReader using function declaration for constructor
    const mockFileReader = {
      readAsDataURL: vi.fn(function() {
        if (this.onload) {
          this.onload({ target: { result: 'data:image/png;base64,mock' } });
        }
      }),
      onload: null
    };
    vi.stubGlobal('FileReader', vi.fn(function() { return mockFileReader; }));

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockStartNewGame).toHaveBeenCalledWith('data:image/png;base64,mock', 'easy');
    });
  });

  it('shows win overlay when game is won', () => {
    usePuzzleGameModule.usePuzzleGame.mockReturnValue({
      ...defaultGameState,
      isWon: true,
      pieces: [{ id: 'p1', groupId: 'g1', imageData: 'data:image/png', x: 0, y: 0, width: 100, height: 100, pad: 10 }]
    });
    render(<PuzzleApp />);
    expect(screen.getByText(/Puzzle Solved!/i)).toBeInTheDocument();
  });

  it('toggles preview when "Show Guide" is clicked', () => {
    usePuzzleGameModule.usePuzzleGame.mockReturnValue({
      ...defaultGameState,
      image: 'test.jpg',
      pieces: [{ id: 'p1', groupId: 'g1', imageData: 'data:image/png', x: 0, y: 0, width: 100, height: 100, pad: 10 }]
    });
    render(<PuzzleApp />);
    const toggleBtn = screen.getByText(/Show Guide/i);
    fireEvent.click(toggleBtn);
    expect(screen.getByAltText(/Reference/i)).toBeInTheDocument();
    expect(screen.getByText(/Hide Guide/i)).toBeInTheDocument();
  });

  it('calls startNewGame when Restart is clicked', () => {
    render(<PuzzleApp />);
    const restartBtn = screen.getByText(/Restart/i);
    fireEvent.click(restartBtn);
    expect(mockStartNewGame).toHaveBeenCalled();
  });

  it('calls moveGroup and tryConnect on mouse events', () => {
    usePuzzleGameModule.usePuzzleGame.mockReturnValue({
      ...defaultGameState,
      pieces: [{ id: 'p1', groupId: 'g1', imageData: 'data:image/png', x: 100, y: 100, width: 100, height: 100, pad: 10 }]
    });
    render(<PuzzleApp />);
    const piece = screen.getByTestId('piece-p1');

    fireEvent.mouseDown(piece, { clientX: 100, clientY: 100 });

    const mouseMoveEvent = new MouseEvent('mousemove', {
      clientX: 150,
      clientY: 150,
      bubbles: true
    });
    window.dispatchEvent(mouseMoveEvent);

    expect(mockMoveGroup).toHaveBeenCalled();

    const mouseUpEvent = new MouseEvent('mouseup', {
      bubbles: true
    });
    window.dispatchEvent(mouseUpEvent);

    expect(mockTryConnect).toHaveBeenCalledWith('p1');
  });

  it('calls moveGroup and tryConnect on touch events', () => {
    usePuzzleGameModule.usePuzzleGame.mockReturnValue({
      ...defaultGameState,
      pieces: [{ id: 'p1', groupId: 'g1', imageData: 'data:image/png', x: 100, y: 100, width: 100, height: 100, pad: 10 }]
    });
    render(<PuzzleApp />);
    const piece = screen.getByTestId('piece-p1');

    fireEvent.touchStart(piece, { touches: [{ clientX: 100, clientY: 100 }] });

    const touchMoveEvent = new TouchEvent('touchmove', {
      touches: [{ clientX: 150, clientY: 150 }],
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(touchMoveEvent);

    expect(mockMoveGroup).toHaveBeenCalled();

    const touchEndEvent = new TouchEvent('touchend', {
      bubbles: true
    });
    window.dispatchEvent(touchEndEvent);

    expect(mockTryConnect).toHaveBeenCalledWith('p1');
  });
});
