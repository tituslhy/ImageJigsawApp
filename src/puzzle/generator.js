/**
 * @fileoverview Image processing and puzzle piece generation for JigsawIt.
 * Handles loading images, scaling them to fit, generating complementary puzzle edge
 * shapes (tabs/blanks), and drawing them onto canvas elements.
 */

/**
 * Generates complementary edge types for the puzzle grid.
 * 1 = tab (protrudes out), -1 = blank (indents in), 0 = flat boundary.
 *
 * @param {number} rows Number of rows in the grid.
 * @param {number} cols Number of columns in the grid.
 * @returns {Array<Array<Object>>} 2D array of edge profiles.
 */
function generateEdgeGrid(rows, cols) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      grid[r][c] = { top: 0, right: 0, bottom: 0, left: 0 };
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Top edge
      if (r === 0) {
        grid[r][c].top = 0;
      } else {
        grid[r][c].top = -grid[r - 1][c].bottom;
      }

      // Left edge
      if (c === 0) {
        grid[r][c].left = 0;
      } else {
        grid[r][c].left = -grid[r][c - 1].right;
      }

      // Bottom edge
      if (r === rows - 1) {
        grid[r][c].bottom = 0;
      } else {
        grid[r][c].bottom = Math.random() < 0.5 ? 1 : -1;
      }

      // Right edge
      if (c === cols - 1) {
        grid[r][c].right = 0;
      } else {
        grid[r][c].right = Math.random() < 0.5 ? 1 : -1;
      }
    }
  }
  return grid;
}

/**
 * Loads an image from a URL, respecting CORS.
 *
 * @param {string} url The image URL.
 * @returns {Promise<HTMLImageElement>} Promise resolving to the loaded image.
 */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Crucial to prevent tainted canvas errors
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(new Error('Failed to load image: ' + err.message));
      img.src = url;
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Downscales and re-encodes a data URL as a JPEG, so a full-resolution
 * phone photo doesn't blow past localStorage's quota when persisted as a
 * replayable puzzle entry.
 *
 * @param {string} dataUrl Source image as a data URL.
 * @param {number} maxDim Maximum width/height in pixels.
 * @param {number} quality JPEG quality (0-1).
 * @returns {Promise<string>} Promise resolving to the resized data URL.
 */
export function resizeImageDataUrl(dataUrl, maxDim = 1280, quality = 0.82) {
  return loadImage(dataUrl).then((img) => {
    let width = img.width;
    let height = img.height;

    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context for resizing canvas');

    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  });
}

/**
 * Draws a puzzle piece's clipping path using Bezier curves.
 *
 * @param {CanvasRenderingContext2D} ctx The canvas rendering context.
 * @param {number} W Width of the piece core.
 * @param {number} H Height of the piece core.
 * @param {Object} edges Edges object specifying {top, right, bottom, left}.
 * @param {number} depth Depth of the tabs/blanks.
 */
function drawJigsawPath(ctx, W, H, edges, depth) {
  ctx.beginPath();
  ctx.moveTo(0, 0);

  // 1. Top Edge (Left to Right)
  if (edges.top === 0) {
    ctx.lineTo(W, 0);
  } else {
    const dir = edges.top; // 1 = tab (up), -1 = blank (down)
    ctx.lineTo(0.35 * W, 0);
    ctx.bezierCurveTo(0.40 * W, -dir * depth * 0.1, 0.38 * W, -dir * depth * 0.3, 0.40 * W, -dir * depth * 0.5);
    ctx.bezierCurveTo(0.43 * W, -dir * depth * 0.9, 0.46 * W, -dir * depth * 1.0, 0.50 * W, -dir * depth * 1.0);
    ctx.bezierCurveTo(0.54 * W, -dir * depth * 1.0, 0.57 * W, -dir * depth * 0.9, 0.60 * W, -dir * depth * 0.5);
    ctx.bezierCurveTo(0.62 * W, -dir * depth * 0.3, 0.60 * W, -dir * depth * 0.1, 0.65 * W, 0);
    ctx.lineTo(W, 0);
  }

  // 2. Right Edge (Top to Bottom)
  if (edges.right === 0) {
    ctx.lineTo(W, H);
  } else {
    const dir = edges.right; // 1 = tab (right), -1 = blank (left)
    ctx.lineTo(W, 0.35 * H);
    ctx.bezierCurveTo(W + dir * depth * 0.1, 0.40 * H, W + dir * depth * 0.3, 0.38 * H, W + dir * depth * 0.5, 0.40 * H);
    ctx.bezierCurveTo(W + dir * depth * 1.0, 0.43 * H, W + dir * depth * 1.0, 0.46 * H, W + dir * depth * 1.0, 0.50 * H);
    ctx.bezierCurveTo(W + dir * depth * 1.0, 0.54 * H, W + dir * depth * 1.0, 0.57 * H, W + dir * depth * 0.5, 0.60 * H);
    ctx.bezierCurveTo(W + dir * depth * 0.3, 0.62 * H, W + dir * depth * 0.1, 0.60 * H, W, 0.65 * H);
    ctx.lineTo(W, H);
  }

  // 3. Bottom Edge (Right to Left)
  if (edges.bottom === 0) {
    ctx.lineTo(0, H);
  } else {
    const dir = edges.bottom; // 1 = tab (down), -1 = blank (up)
    ctx.lineTo(0.65 * W, H);
    ctx.bezierCurveTo(0.60 * W, H + dir * depth * 0.1, 0.62 * W, H + dir * depth * 0.3, 0.60 * W, H + dir * depth * 0.5);
    ctx.bezierCurveTo(0.57 * W, H + dir * depth * 0.9, 0.54 * W, H + dir * depth * 1.0, 0.50 * W, H + dir * depth * 1.0);
    ctx.bezierCurveTo(0.46 * W, H + dir * depth * 1.0, 0.43 * W, H + dir * depth * 0.9, 0.40 * W, H + dir * depth * 0.5);
    ctx.bezierCurveTo(0.38 * W, H + dir * depth * 0.3, 0.40 * W, H + dir * depth * 0.1, 0.35 * W, H);
    ctx.lineTo(0, H);
  }

  // 4. Left Edge (Bottom to Top)
  if (edges.left === 0) {
    ctx.lineTo(0, 0);
  } else {
    const dir = edges.left; // 1 = tab (left), -1 = blank (right)
    ctx.lineTo(0, 0.65 * H);
    ctx.bezierCurveTo(-dir * depth * 0.1, 0.60 * H, -dir * depth * 0.3, 0.62 * H, -dir * depth * 0.5, 0.60 * H);
    ctx.bezierCurveTo(-dir * depth * 1.0, 0.57 * H, -dir * depth * 1.0, 0.54 * H, -dir * depth * 1.0, 0.50 * H);
    ctx.bezierCurveTo(-dir * depth * 1.0, 0.46 * H, -dir * depth * 1.0, 0.43 * H, -dir * depth * 0.5, 0.40 * H);
    ctx.bezierCurveTo(-dir * depth * 0.3, 0.38 * H, -dir * depth * 0.1, 0.40 * H, 0, 0.35 * H);
    ctx.lineTo(0, 0);
  }

  ctx.closePath();
}

/**
 * Resizes the source image keeping aspect ratio and slices it into puzzle pieces.
 *
 * @param {HTMLImageElement} img The loaded source image.
 * @param {number} rows Number of rows.
 * @param {number} cols Number of columns.
 * @param {number} maxWidth Maximum board width (optional, defaults to 800).
 * @param {number} maxHeight Maximum board height (optional, defaults to 600).
 * @returns {Object} Slicing result: { pieces, boardWidth, boardHeight }.
 */
export function generatePuzzlePieces(img, rows, cols, maxWidth = 800, maxHeight = 600) {
  // 1. Calculate scaled board size inside maxWidth x maxHeight
  let boardWidth = img.width;
  let boardHeight = img.height;

  if (boardWidth > maxWidth || boardHeight > maxHeight) {
    const scale = Math.min(maxWidth / boardWidth, maxHeight / boardHeight);
    boardWidth = Math.round(boardWidth * scale);
    boardHeight = Math.round(boardHeight * scale);
  }

  // Draw the original image to a temporary canvas of the exact board size
  // so we can read from it at the correct scaled coordinates.
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = boardWidth;
  sourceCanvas.height = boardHeight;
  const sourceCtx = sourceCanvas.getContext('2d');
  
  if (!sourceCtx) {
    throw new Error('Could not get 2D context for scaling canvas');
  }
  
  sourceCtx.drawImage(img, 0, 0, boardWidth, boardHeight);

  const pieceW = boardWidth / cols;
  const pieceH = boardHeight / rows;
  const depth = Math.min(pieceW, pieceH) * 0.18; // tab/blank depth
  const pad = Math.max(Math.min(pieceW, pieceH) * 0.25, depth * 1.2); // padding for tabs

  const edgeGrid = generateEdgeGrid(rows, cols);
  const pieces = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const edges = edgeGrid[r][c];

      const pieceCanvas = document.createElement('canvas');
      pieceCanvas.width = pieceW + 2 * pad;
      pieceCanvas.height = pieceH + 2 * pad;
      const ctx = pieceCanvas.getContext('2d');

      if (!ctx) {
        throw new Error(`Could not get 2D context for piece [${r}, ${c}]`);
      }

      const correctX = c * pieceW;
      const correctY = r * pieceH;

      ctx.save();
      
      // We translate by pad, pad so coordinates 0..pieceW align with the core piece body
      ctx.translate(pad, pad);

      let bezierSuccess = false;
      try {
        drawJigsawPath(ctx, pieceW, pieceH, edges, depth);
        ctx.clip();
        bezierSuccess = true;
      } catch (err) {
        console.warn('Bezier jigsaw path generation failed, falling back to rectangular piece:', err);
        // Fallback: clear clip and draw simple rect
        ctx.restore();
        ctx.save();
        ctx.translate(pad, pad);
        
        ctx.beginPath();
        ctx.rect(0, 0, pieceW, pieceH);
        ctx.clip();
      }

      // Draw the entire source canvas offset by -correctX, -correctY
      // This is mathematically equivalent and avoids any out-of-bounds source coordinate issues on drawImage!
      ctx.drawImage(sourceCanvas, -correctX, -correctY);
      ctx.restore();

      // If Bezier failed, add a drop shadow to the rectangular border on canvas
      if (!bezierSuccess) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.restore();
      }

      pieces.push({
        id: `piece-${r}-${c}`,
        row: r,
        col: c,
        imageData: pieceCanvas.toDataURL('image/png'),
        correctX,
        correctY,
        width: pieceW + 2 * pad,
        height: pieceH + 2 * pad,
        pad,
        locked: false
      });
    }
  }

  return {
    pieces,
    boardWidth,
    boardHeight
  };
}
