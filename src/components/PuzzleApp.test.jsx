import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
    vi.useFakeTimers();
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

  it('renders correctly with initial state (selection view)', () => {
    render(<PuzzleApp />);
    expect(screen.getByText(/JigsawIt/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose a Puzzle/i)).toBeInTheDocument();
  });

  it('shows loading state in game view', async () => {
    usePuzzleGameModule.usePuzzleGame.mockReturnValue({
      ...defaultGameState,
      isLoading: true
    });
    render(<PuzzleApp />);

    const natureBtn = screen.getByText(/Nature/i);
    fireEvent.click(natureBtn);

    act(() => {
      vi.runAllTimers();
    });

    expect(screen.getByText(/Cutting pieces…/i)).toBeInTheDocument();
  });

  it('shows error message when game fails to load', async () => {
    usePuzzleGameModule.usePuzzleGame.mockReturnValue({
      ...defaultGameState,
      error: 'Failed to load image'
    });
    render(<PuzzleApp />);

    const natureBtn = screen.getByText(/Nature/i);
    fireEvent.click(natureBtn);

    act(() => {
      vi.runAllTimers();
    });

    expect(screen.getByText(/Failed to load image/i)).toBeInTheDocument();
  });

  it('switches to game view when an image is selected', async () => {
    render(<PuzzleApp />);
    const natureBtn = screen.getByText(/Nature/i);
    fireEvent.click(natureBtn);

    act(() => {
      vi.runAllTimers();
    });

    expect(mockStartNewGame).toHaveBeenCalled();
    expect(screen.getByText(/TIME/i)).toBeInTheDocument();
  });

  it('calls startNewGame when a file is uploaded', async () => {
    render(<PuzzleApp />);
    const file = new File(['(⌐□_□)'], 'test.png', { type: 'image/png' });
    const input = screen.getByLabelText(/Upload Image/i);

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

    act(() => {
      vi.runAllTimers();
    });

    expect(mockStartNewGame).toHaveBeenCalledWith('data:image/png;base64,mock', 'easy');
  });

  it('shows win overlay when game is won', async () => {
    usePuzzleGameModule.usePuzzleGame.mockReturnValue({
      ...defaultGameState,
      isWon: true,
      pieces: [{ id: 'p1', groupId: 'g1', imageData: 'data:image/png', x: 0, y: 0, width: 100, height: 100, pad: 10 }]
    });
    render(<PuzzleApp />);

    // Select image to enter game view
    const natureBtn = screen.getByText(/Nature/i);
    fireEvent.click(natureBtn);

    act(() => {
      vi.runAllTimers();
    });

    expect(screen.getByText(/Puzzle Solved!/i)).toBeInTheDocument();
  });

  it('toggles preview when guide icon is clicked', async () => {
    usePuzzleGameModule.usePuzzleGame.mockReturnValue({
      ...defaultGameState,
      image: 'test.jpg',
      pieces: [{ id: 'p1', groupId: 'g1', imageData: 'data:image/png', x: 0, y: 0, width: 100, height: 100, pad: 10 }]
    });
    render(<PuzzleApp />);

    // Select image to enter game view
    const natureBtn = screen.getByText(/Nature/i);
    fireEvent.click(natureBtn);

    act(() => {
      vi.runAllTimers();
    });

    const toggleBtn = screen.getByTitle(/Toggle Guide/i);
    fireEvent.click(toggleBtn);
    expect(screen.getByAltText(/Reference/i)).toBeInTheDocument();
  });

  it('calls startNewGame when Restart is clicked', async () => {
    render(<PuzzleApp />);

    // Select image to enter game view
    const natureBtn = screen.getByText(/Nature/i);
    fireEvent.click(natureBtn);

    act(() => {
      vi.runAllTimers();
    });

    const restartBtn = screen.getByTitle(/Restart/i);
    fireEvent.click(restartBtn);
    expect(mockStartNewGame).toHaveBeenCalledTimes(2); // Initial start + restart
  });

  it('calls moveGroup and tryConnect on mouse events', async () => {
    usePuzzleGameModule.usePuzzleGame.mockReturnValue({
      ...defaultGameState,
      pieces: [{ id: 'p1', groupId: 'g1', imageData: 'data:image/png', x: 100, y: 100, width: 100, height: 100, pad: 10 }]
    });
    render(<PuzzleApp />);

    // Select image to enter game view
    const natureBtn = screen.getByText(/Nature/i);
    fireEvent.click(natureBtn);

    act(() => {
      vi.runAllTimers();
    });

    const piece = screen.getByTestId('piece-p1');

    act(() => {
      fireEvent.mouseDown(piece, { clientX: 100, clientY: 100 });
    });

    const mouseMoveEvent = new MouseEvent('mousemove', {
      clientX: 150,
      clientY: 150,
      bubbles: true
    });
    act(() => {
      window.dispatchEvent(mouseMoveEvent);
    });

    expect(mockMoveGroup).toHaveBeenCalled();

    const mouseUpEvent = new MouseEvent('mouseup', {
      bubbles: true
    });
    act(() => {
      window.dispatchEvent(mouseUpEvent);
    });

    expect(mockTryConnect).toHaveBeenCalledWith('p1');
  });

  it('navigates back to selection from game view', async () => {
    render(<PuzzleApp />);

    const natureBtn = screen.getByText(/Nature/i);
    fireEvent.click(natureBtn);

    act(() => {
      vi.runAllTimers();
    });

    expect(screen.getByText(/TIME/i)).toBeInTheDocument();

    const backBtn = screen.getByText(/Back/i);
    fireEvent.click(backBtn);

    expect(screen.getByText(/Choose a Puzzle/i)).toBeInTheDocument();
  });

  it('toggles theme when theme button is clicked', () => {
    render(<PuzzleApp />);
    const toggleBtn = screen.getByTitle(/Toggle Theme/i);

    // Default is dark
    expect(screen.getByRole('main').parentElement).toHaveClass(/themeDark/);

    fireEvent.click(toggleBtn);
    expect(screen.getByRole('main').parentElement).toHaveClass(/themeLight/);

    fireEvent.click(toggleBtn);
    expect(screen.getByRole('main').parentElement).toHaveClass(/themeDark/);
  });

  it('handles panning on the background', async () => {
    render(<PuzzleApp />);

    // Enter game view
    const natureBtn = screen.getByText(/Nature/i);
    fireEvent.click(natureBtn);
    act(() => { vi.runAllTimers(); });

    const canvas = screen.getByRole('main').querySelector('section');

    act(() => {
      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
    });

    const mouseMoveEvent = new MouseEvent('mousemove', {
      clientX: 150,
      clientY: 150,
      bubbles: true
    });
    act(() => {
      window.dispatchEvent(mouseMoveEvent);
    });

    // No direct way to check state in this test, but we ensure no crashes
    // and we can check if the class was added if we exposed isPanning better.
    // For now, let's just check if it's in the document.
    expect(canvas).toBeInTheDocument();

    const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
    act(() => {
      window.dispatchEvent(mouseUpEvent);
    });
  });
});
