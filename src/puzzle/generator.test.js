import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadImage, generatePuzzlePieces } from './generator';

describe('generator.js', () => {
  describe('loadImage', () => {
    it('should load an image successfully', async () => {
      const mockImg = {
        set src(value) {
          setTimeout(() => this.onload(), 0);
        }
      };
      // Use a regular function instead of an arrow function for the constructor mock
      vi.stubGlobal('Image', vi.fn(function() { return mockImg; }));

      const img = await loadImage('http://example.com/image.jpg');
      expect(img).toBe(mockImg);
      expect(img.crossOrigin).toBe('anonymous');
    });

    it('should reject when image fails to load', async () => {
      const mockImg = {
        set src(value) {
          setTimeout(() => this.onerror(new Error('Load error')), 0);
        }
      };
      vi.stubGlobal('Image', vi.fn(function() { return mockImg; }));

      await expect(loadImage('http://example.com/bad-image.jpg')).rejects.toThrow('Failed to load image');
    });
  });

  describe('generatePuzzlePieces', () => {
    let mockImg;

    beforeEach(() => {
      mockImg = {
        width: 1600,
        height: 1200,
      };

      // Mock document.createElement for canvas
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          drawImage: vi.fn(),
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          bezierCurveTo: vi.fn(),
          closePath: vi.fn(),
          clip: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          rect: vi.fn(),
        })),
        toDataURL: vi.fn(() => 'data:image/png;base64,mockData'),
      };

      vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas);
    });

    it('should generate the correct number of pieces', () => {
      const rows = 3;
      const cols = 3;
      const result = generatePuzzlePieces(mockImg, rows, cols);

      expect(result.pieces.length).toBe(rows * cols);
      expect(result.boardWidth).toBe(800); // 1600 scaled to MAX_W 800
      expect(result.boardHeight).toBe(600); // 1200 scaled to 600
    });

    it('should handle small images without scaling up beyond original size', () => {
      mockImg.width = 400;
      mockImg.height = 300;
      const result = generatePuzzlePieces(mockImg, 2, 2);

      expect(result.boardWidth).toBe(400);
      expect(result.boardHeight).toBe(300);
    });

    it('should scale images maintaining aspect ratio', () => {
      mockImg.width = 2000;
      mockImg.height = 1000;
      const result = generatePuzzlePieces(mockImg, 2, 2);

      expect(result.boardWidth).toBe(800);
      expect(result.boardHeight).toBe(400);
    });

    it('should create pieces with correct properties', () => {
      const result = generatePuzzlePieces(mockImg, 2, 2);
      const piece = result.pieces[0];

      expect(piece).toHaveProperty('id');
      expect(piece).toHaveProperty('row');
      expect(piece).toHaveProperty('col');
      expect(piece).toHaveProperty('imageData');
      expect(piece).toHaveProperty('correctX');
      expect(piece).toHaveProperty('correctY');
      expect(piece).toHaveProperty('width');
      expect(piece).toHaveProperty('height');
      expect(piece).toHaveProperty('pad');
      expect(piece).toHaveProperty('locked', false);
    });

    it('should throw error if 2D context is not available', () => {
      document.createElement.mockReturnValue({
        getContext: vi.fn(() => null)
      });

      expect(() => generatePuzzlePieces(mockImg, 1, 1)).toThrow('Could not get 2D context');
    });
  });
});
