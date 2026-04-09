(() => {
  const CONFIG = {
    boardSizePx: 900,
    minGivens: 17,
    cropMinRatio: 0.16,
    cropDefaultRatio: 0.86,
    classifier: {
      inputSize: 28,
      minInkRatio: 0.012,
      minConfidence: 0.45
    }
  };

  function createBoard(fillValue) {
    return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => fillValue));
  }

  function copyBoard(board) {
    return board.map((row) => [...row]);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  class BoardUtils {
    static countGivens(board) {
      let count = 0;
      for (let row = 0; row < 9; row += 1) {
        for (let col = 0; col < 9; col += 1) {
          if (board[row][col] !== 0) count += 1;
        }
      }
      return count;
    }

    static isPlacementValid(board, row, col, value) {
      for (let i = 0; i < 9; i += 1) {
        if (board[row][i] === value) return false;
        if (board[i][col] === value) return false;
      }

      const br = Math.floor(row / 3) * 3;
      const bc = Math.floor(col / 3) * 3;
      for (let dr = 0; dr < 3; dr += 1) {
        for (let dc = 0; dc < 3; dc += 1) {
          if (board[br + dr][bc + dc] === value) return false;
        }
      }
      return true;
    }

    static isBoardValid(board) {
      for (let row = 0; row < 9; row += 1) {
        for (let col = 0; col < 9; col += 1) {
          const value = board[row][col];
          if (!value) continue;
          board[row][col] = 0;
          const ok = this.isPlacementValid(board, row, col, value);
          board[row][col] = value;
          if (!ok) return false;
        }
      }
      return true;
    }

    static getCandidates(board, row, col) {
      const used = new Set();
      for (let i = 0; i < 9; i += 1) {
        used.add(board[row][i]);
        used.add(board[i][col]);
      }

      const br = Math.floor(row / 3) * 3;
      const bc = Math.floor(col / 3) * 3;
      for (let dr = 0; dr < 3; dr += 1) {
        for (let dc = 0; dc < 3; dc += 1) {
          used.add(board[br + dr][bc + dc]);
        }
      }

      const candidates = [];
      for (let value = 1; value <= 9; value += 1) {
        if (!used.has(value)) candidates.push(value);
      }
      return candidates;
    }

    static findBestEmptyCell(board) {
      let best = null;
      for (let row = 0; row < 9; row += 1) {
        for (let col = 0; col < 9; col += 1) {
          if (board[row][col] !== 0) continue;
          const candidates = this.getCandidates(board, row, col);
          if (!best || candidates.length < best.candidates.length) {
            best = { row, col, candidates };
          }
        }
      }
      return best;
    }

    static solveSudoku(board) {
      const target = this.findBestEmptyCell(board);
      if (!target) return board;
      if (!target.candidates.length) return null;

      for (const value of target.candidates) {
        board[target.row][target.col] = value;
        const solved = this.solveSudoku(board);
        if (solved) return solved;
        board[target.row][target.col] = 0;
      }
      return null;
    }

    static countSolutions(board, limit) {
      const target = this.findBestEmptyCell(board);
      if (!target) return 1;

      let count = 0;
      for (const value of target.candidates) {
        board[target.row][target.col] = value;
        count += this.countSolutions(board, limit - count);
        board[target.row][target.col] = 0;
        if (count >= limit) return count;
      }
      return count;
    }
  }

  class SudokuHintEngine {
    constructor() {
      this.prepared = false;
      this.dirtySincePrepare = true;
      this.workingBoard = null;
      this.solvedBoard = null;
      this.givenMask = createBoard(false);
    }

    markDirty() {
      this.prepared = false;
      this.dirtySincePrepare = true;
    }

    setGivenMaskFromBoard(board) {
      this.givenMask = board.map((row) => row.map((v) => v !== 0));
    }

    prepare(board) {
      const givens = BoardUtils.countGivens(board);
      if (givens < CONFIG.minGivens) {
        throw new Error(`Board has only ${givens} clues. Add/correct digits before asking for hints.`);
      }
      if (!BoardUtils.isBoardValid(board)) {
        throw new Error('The board has conflicts. Fix duplicated digits in row/column/box.');
      }

      const solutionCount = BoardUtils.countSolutions(copyBoard(board), 2);
      if (solutionCount !== 1) {
        throw new Error('Board is ambiguous or unsolvable. Please correct OCR/manual digits before hints.');
      }

      const solved = BoardUtils.solveSudoku(copyBoard(board));
      if (!solved) {
        throw new Error('Could not solve this Sudoku. Please review OCR/manual edits.');
      }

      this.workingBoard = copyBoard(board);
      this.solvedBoard = solved;
      this.setGivenMaskFromBoard(board);
      this.prepared = true;
      this.dirtySincePrepare = false;
    }

    buildCandidateMap(board) {
      const map = createBoard(null);
      for (let row = 0; row < 9; row += 1) {
        for (let col = 0; col < 9; col += 1) {
          map[row][col] = board[row][col] !== 0 ? [] : BoardUtils.getCandidates(board, row, col);
        }
      }
      return map;
    }

    findHiddenSingleByUnit(candidates, board, unitType) {
      for (let index = 0; index < 9; index += 1) {
        for (let num = 1; num <= 9; num += 1) {
          const hits = [];
          for (let k = 0; k < 9; k += 1) {
            const row = unitType === 'row' ? index : k;
            const col = unitType === 'col' ? index : k;
            if (board[row][col] !== 0) continue;
            if (candidates[row][col].includes(num)) hits.push({ row, col });
          }
          if (hits.length === 1) {
            const hit = hits[0];
            const label = unitType === 'row' ? `row ${index + 1}` : `column ${index + 1}`;
            return {
              row: hit.row,
              col: hit.col,
              value: num,
              reason: `Hint: R${hit.row + 1}C${hit.col + 1} = ${num}. In ${label}, this number can go in only one spot (hidden single).`
            };
          }
        }
      }
      return null;
    }

    findHiddenSingleInBox(candidates, board) {
      for (let boxRow = 0; boxRow < 3; boxRow += 1) {
        for (let boxCol = 0; boxCol < 3; boxCol += 1) {
          const sr = boxRow * 3;
          const sc = boxCol * 3;
          for (let num = 1; num <= 9; num += 1) {
            const hits = [];
            for (let dr = 0; dr < 3; dr += 1) {
              for (let dc = 0; dc < 3; dc += 1) {
                const row = sr + dr;
                const col = sc + dc;
                if (board[row][col] !== 0) continue;
                if (candidates[row][col].includes(num)) hits.push({ row, col });
              }
            }
            if (hits.length === 1) {
              const hit = hits[0];
              return {
                row: hit.row,
                col: hit.col,
                value: num,
                reason: `Hint: R${hit.row + 1}C${hit.col + 1} = ${num}. In its 3x3 box, this number has only one valid spot (hidden single).`
              };
            }
          }
        }
      }
      return null;
    }

    getNextHint() {
      const board = this.workingBoard;
      const solution = this.solvedBoard;
      const candidates = this.buildCandidateMap(board);

      for (let row = 0; row < 9; row += 1) {
        for (let col = 0; col < 9; col += 1) {
          if (board[row][col] !== 0) continue;
          if (candidates[row][col].length === 1) {
            const value = candidates[row][col][0];
            return {
              row,
              col,
              value,
              reason: `Hint: R${row + 1}C${col + 1} = ${value}. It is the only candidate for that cell (naked single).`
            };
          }
        }
      }

      const hiddenRow = this.findHiddenSingleByUnit(candidates, board, 'row');
      if (hiddenRow) return hiddenRow;
      const hiddenCol = this.findHiddenSingleByUnit(candidates, board, 'col');
      if (hiddenCol) return hiddenCol;
      const hiddenBox = this.findHiddenSingleInBox(candidates, board);
      if (hiddenBox) return hiddenBox;

      let best = null;
      for (let row = 0; row < 9; row += 1) {
        for (let col = 0; col < 9; col += 1) {
          if (board[row][col] !== 0) continue;
          const options = candidates[row][col];
          if (!best || options.length < best.options.length) {
            best = { row, col, options };
          }
        }
      }
      if (!best) return null;

      const value = solution[best.row][best.col];
      return {
        row: best.row,
        col: best.col,
        value,
        reason: `Hint: R${best.row + 1}C${best.col + 1} = ${value}. This cell has candidates (${best.options.join(', ')}) and ${value} is the only one consistent with the full puzzle.`
      };
    }
  }

  class DigitTemplateClassifier {
    constructor() {
      this.templates = this.buildTemplates();
    }

    buildTemplates() {
      const templates = [];
      const fonts = ['Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman'];
      const weights = ['600', '700'];
      const shifts = [-1, 0, 1];

      for (let digit = 1; digit <= 9; digit += 1) {
        for (const font of fonts) {
          for (const weight of weights) {
            for (const sx of shifts) {
              for (const sy of shifts) {
                const pixels = this.renderDigitTemplate(digit, font, weight, sx, sy);
                templates.push({ digit, pixels });
              }
            }
          }
        }
      }

      return templates;
    }

    renderDigitTemplate(digit, fontFamily, fontWeight, shiftX, shiftY) {
      const size = CONFIG.classifier.inputSize;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#000000';
      ctx.font = `${fontWeight} ${Math.floor(size * 0.78)}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(digit), size / 2 + shiftX, size / 2 + shiftY + 1);

      return this.canvasToBinaryVector(canvas);
    }

    canvasToBinaryVector(canvas) {
      const ctx = canvas.getContext('2d');
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const out = new Float32Array(width * height);

      let sum = 0;
      for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const v = gray < 140 ? 1 : 0;
        out[p] = v;
        sum += v;
      }

      if (sum > 0) {
        for (let i = 0; i < out.length; i += 1) out[i] /= sum;
      }
      return out;
    }

    predict(cellCanvas) {
      const input = this.canvasToBinaryVector(cellCanvas);
      let best = null;
      let second = null;

      for (const tpl of this.templates) {
        const score = this.cosineSimilarity(input, tpl.pixels);
        if (!best || score > best.score) {
          second = best;
          best = { digit: tpl.digit, score };
        } else if (!second || score > second.score) {
          second = { digit: tpl.digit, score };
        }
      }

      if (!best) return { digit: 0, confidence: 0 };

      const margin = best.score - (second ? second.score : 0);
      const confidence = clamp(best.score * 0.75 + margin * 2.0, 0, 1);
      return { digit: best.digit, confidence };
    }

    cosineSimilarity(a, b) {
      let dot = 0;
      let na = 0;
      let nb = 0;
      for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      if (!na || !nb) return 0;
      return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }
  }

  class SudokuVision {
    constructor() {
      this.classifier = new DigitTemplateClassifier();
    }

    getCenteredSquare(canvas) {
      const side = Math.floor(Math.min(canvas.width, canvas.height) * CONFIG.cropDefaultRatio);
      return {
        x: Math.floor((canvas.width - side) / 2),
        y: Math.floor((canvas.height - side) / 2),
        size: side
      };
    }

    clampSquareToCanvas(square, canvasWidth, canvasHeight) {
      const maxSize = Math.min(canvasWidth, canvasHeight);
      const size = Math.max(1, Math.min(square.size, maxSize));

      let x = square.x;
      let y = square.y;
      if (x + size > canvasWidth) x = canvasWidth - size;
      if (y + size > canvasHeight) y = canvasHeight - size;
      if (x < 0) x = 0;
      if (y < 0) y = 0;

      return { x: Math.floor(x), y: Math.floor(y), size: Math.floor(size) };
    }

    extractSquare(sourceCanvas, square, outputSize) {
      const out = document.createElement('canvas');
      out.width = outputSize;
      out.height = outputSize;
      const ctx = out.getContext('2d');
      ctx.drawImage(sourceCanvas, square.x, square.y, square.size, square.size, 0, 0, outputSize, outputSize);
      return out;
    }

    cloneCanvas(sourceCanvas) {
      const out = document.createElement('canvas');
      out.width = sourceCanvas.width;
      out.height = sourceCanvas.height;
      const ctx = out.getContext('2d');
      ctx.drawImage(sourceCanvas, 0, 0);
      return out;
    }

    detectSudokuBounds(sourceCanvas) {
      const scaled = this.makeScaledGray(sourceCanvas, 420);
      const threshold = this.getOtsuThreshold(scaled.gray);
      const dark = new Uint8Array(scaled.width * scaled.height);

      for (let i = 0; i < dark.length; i += 1) dark[i] = scaled.gray[i] < threshold ? 1 : 0;

      const integral = this.buildIntegralImage(dark, scaled.width, scaled.height);
      const minDim = Math.min(scaled.width, scaled.height);
      const minSide = Math.floor(minDim * 0.34);
      const maxSide = Math.floor(minDim * 0.98);
      const stepSide = Math.max(4, Math.floor(minDim * 0.024));
      const stepPos = Math.max(3, Math.floor(minDim * 0.014));

      let best = null;
      for (let side = minSide; side <= maxSide; side += stepSide) {
        const band = Math.max(2, Math.floor(side * 0.07));
        const innerSide = side - band * 2;
        if (innerSide <= 6) continue;

        for (let y = 0; y + side < scaled.height; y += stepPos) {
          for (let x = 0; x + side < scaled.width; x += stepPos) {
            const outer = this.rectSum(integral, scaled.width, x, y, side, side);
            const inner = this.rectSum(integral, scaled.width, x + band, y + band, innerSide, innerSide);

            const borderPixels = side * side - innerSide * innerSide;
            const borderDensity = (outer - inner) / Math.max(1, borderPixels);
            const innerDensity = inner / Math.max(1, innerSide * innerSide);
            if (borderDensity < 0.11 || innerDensity < 0.02) continue;

            const cx = x + side / 2;
            const cy = y + side / 2;
            const dx = (cx - scaled.width / 2) / scaled.width;
            const dy = (cy - scaled.height / 2) / scaled.height;
            const centerPenalty = Math.sqrt(dx * dx + dy * dy);

            const score = borderDensity * 2.1 + innerDensity * 0.8 + (side / minDim) * 0.2 - centerPenalty * 0.35;
            if (!best || score > best.score) best = { x, y, side, score };
          }
        }
      }

      if (!best) return null;

      const scaleX = sourceCanvas.width / scaled.width;
      const scaleY = sourceCanvas.height / scaled.height;
      return this.clampSquareToCanvas(
        {
          x: Math.floor(best.x * scaleX),
          y: Math.floor(best.y * scaleY),
          size: Math.floor(best.side * Math.min(scaleX, scaleY))
        },
        sourceCanvas.width,
        sourceCanvas.height
      );
    }

    makeScaledGray(sourceCanvas, maxSize) {
      const scale = Math.min(1, maxSize / Math.max(sourceCanvas.width, sourceCanvas.height));
      const width = Math.max(32, Math.round(sourceCanvas.width * scale));
      const height = Math.max(32, Math.round(sourceCanvas.height * scale));

      const tmp = document.createElement('canvas');
      tmp.width = width;
      tmp.height = height;
      const ctx = tmp.getContext('2d');
      ctx.drawImage(sourceCanvas, 0, 0, width, height);

      const { data } = ctx.getImageData(0, 0, width, height);
      const gray = new Uint8Array(width * height);
      for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        gray[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }

      return { gray, width, height };
    }

    getOtsuThreshold(grayValues) {
      const histogram = new Uint32Array(256);
      for (let i = 0; i < grayValues.length; i += 1) histogram[grayValues[i]] += 1;

      const total = grayValues.length;
      let sum = 0;
      for (let t = 0; t < 256; t += 1) sum += t * histogram[t];

      let sumB = 0;
      let wB = 0;
      let maxVariance = -1;
      let threshold = 127;

      for (let t = 0; t < 256; t += 1) {
        wB += histogram[t];
        if (wB === 0) continue;
        const wF = total - wB;
        if (wF === 0) break;

        sumB += t * histogram[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const variance = wB * wF * (mB - mF) * (mB - mF);
        if (variance > maxVariance) {
          maxVariance = variance;
          threshold = t;
        }
      }

      return threshold;
    }

    buildIntegralImage(binary, width, height) {
      const integral = new Uint32Array((width + 1) * (height + 1));
      for (let y = 1; y <= height; y += 1) {
        let rowSum = 0;
        for (let x = 1; x <= width; x += 1) {
          rowSum += binary[(y - 1) * width + (x - 1)];
          integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + rowSum;
        }
      }
      return integral;
    }

    rectSum(integral, width, x, y, w, h) {
      const stride = width + 1;
      const x2 = x + w;
      const y2 = y + h;
      return integral[y2 * stride + x2] - integral[y * stride + x2] - integral[y2 * stride + x] + integral[y * stride + x];
    }

    preprocessBoard(boardCanvas) {
      const out = document.createElement('canvas');
      out.width = boardCanvas.width;
      out.height = boardCanvas.height;
      const ctx = out.getContext('2d');
      ctx.drawImage(boardCanvas, 0, 0);

      const image = ctx.getImageData(0, 0, out.width, out.height);
      const data = image.data;
      const gray = new Uint8Array(out.width * out.height);

      let min = 255;
      let max = 0;
      for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        gray[p] = g;
        if (g < min) min = g;
        if (g > max) max = g;
      }

      const range = Math.max(1, max - min);
      for (let p = 0; p < gray.length; p += 1) {
        gray[p] = Math.round(((gray[p] - min) * 255) / range);
      }

      const threshold = this.getOtsuThreshold(gray);
      for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        const bw = gray[p] < threshold ? 0 : 255;
        data[i] = bw;
        data[i + 1] = bw;
        data[i + 2] = bw;
        data[i + 3] = 255;
      }

      ctx.putImageData(image, 0, 0);
      return out;
    }

    suppressGridLines(canvas) {
      const ctx = canvas.getContext('2d');
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const rowDark = new Float32Array(height);
      const colDark = new Float32Array(width);

      for (let y = 0; y < height; y += 1) {
        let dark = 0;
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          if (data[i] < 80) dark += 1;
        }
        rowDark[y] = dark / width;
      }

      for (let x = 0; x < width; x += 1) {
        let dark = 0;
        for (let y = 0; y < height; y += 1) {
          const i = (y * width + x) * 4;
          if (data[i] < 80) dark += 1;
        }
        colDark[x] = dark / height;
      }

      const rowLines = this.pickTopPeaks(rowDark, 14, Math.floor(height / 12));
      const colLines = this.pickTopPeaks(colDark, 14, Math.floor(width / 12));

      const eraseBand = Math.max(1, Math.floor(width / 220));
      for (const y of rowLines) {
        for (let yy = Math.max(0, y - eraseBand); yy <= Math.min(height - 1, y + eraseBand); yy += 1) {
          for (let x = 0; x < width; x += 1) {
            const i = (yy * width + x) * 4;
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
          }
        }
      }

      for (const x of colLines) {
        for (let xx = Math.max(0, x - eraseBand); xx <= Math.min(width - 1, x + eraseBand); xx += 1) {
          for (let y = 0; y < height; y += 1) {
            const i = (y * width + xx) * 4;
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
          }
        }
      }

      ctx.putImageData(new ImageData(data, width, height), 0, 0);
    }

    pickTopPeaks(series, limit, minDistance) {
      const peaks = [];
      for (let i = 1; i < series.length - 1; i += 1) {
        if (series[i] > series[i - 1] && series[i] >= series[i + 1]) {
          peaks.push({ idx: i, value: series[i] });
        }
      }

      peaks.sort((a, b) => b.value - a.value);
      const selected = [];
      for (const peak of peaks) {
        if (selected.length >= limit) break;
        if (selected.every((v) => Math.abs(v - peak.idx) >= minDistance)) {
          selected.push(peak.idx);
        }
      }
      return selected;
    }

    extractDigitFromCell(boardCanvas, row, col) {
      const cellSize = boardCanvas.width / 9;
      const pads = [0.08, 0.12, 0.16, 0.2];

      let best = { digit: 0, confidence: 0, inkRatio: 0 };
      for (const padRatio of pads) {
        const pad = Math.floor(cellSize * padRatio);
        const sx = Math.floor(col * cellSize + pad);
        const sy = Math.floor(row * cellSize + pad);
        const sw = Math.floor(cellSize - pad * 2);
        const sh = Math.floor(cellSize - pad * 2);
        if (sw <= 2 || sh <= 2) continue;

        const cell = document.createElement('canvas');
        cell.width = 112;
        cell.height = 112;
        const ctx = cell.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 112, 112);
        ctx.drawImage(boardCanvas, sx, sy, sw, sh, 8, 8, 96, 96);

        const segmented = this.segmentDigit(cell);
        if (!segmented) continue;

        const prediction = this.classifier.predict(segmented);
        if (prediction.confidence > best.confidence) {
          best = { ...prediction, inkRatio: segmented.inkRatio || 0 };
        }
      }

      if (best.confidence < CONFIG.classifier.minConfidence) {
        return { digit: 0, confidence: best.confidence, pad: null };
      }
      return best;
    }

    segmentDigit(cellCanvas) {
      const srcCtx = cellCanvas.getContext('2d');
      const { data, width, height } = srcCtx.getImageData(0, 0, cellCanvas.width, cellCanvas.height);

      const binary = new Uint8Array(width * height);
      let darkCount = 0;
      for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        const gray = data[i];
        const isDark = gray < 170 ? 1 : 0;
        binary[p] = isDark;
        darkCount += isDark;
      }

      const inkRatio = darkCount / (width * height);
      if (inkRatio < CONFIG.classifier.minInkRatio) return null;

      const box = this.findBoundingBox(binary, width, height);
      if (!box) return null;

      const boxAreaRatio = (box.w * box.h) / (width * height);
      if (boxAreaRatio < 0.03 || boxAreaRatio > 0.78) return null;

      const aspect = box.w / Math.max(1, box.h);
      if (aspect < 0.12 || aspect > 1.25) return null;

      const out = document.createElement('canvas');
      out.width = CONFIG.classifier.inputSize;
      out.height = CONFIG.classifier.inputSize;
      const outCtx = out.getContext('2d');
      outCtx.fillStyle = '#ffffff';
      outCtx.fillRect(0, 0, out.width, out.height);

      const targetSize = Math.floor(out.width * 0.72);
      const scale = Math.min(targetSize / box.w, targetSize / box.h);
      const dw = box.w * scale;
      const dh = box.h * scale;
      const dx = (out.width - dw) / 2;
      const dy = (out.height - dh) / 2;

      outCtx.drawImage(cellCanvas, box.x, box.y, box.w, box.h, dx, dy, dw, dh);

      const outImg = outCtx.getImageData(0, 0, out.width, out.height);
      const od = outImg.data;
      for (let i = 0; i < od.length; i += 4) {
        const bw = od[i] < 175 ? 0 : 255;
        od[i] = bw;
        od[i + 1] = bw;
        od[i + 2] = bw;
      }
      outCtx.putImageData(outImg, 0, 0);
      out.inkRatio = inkRatio;
      return out;
    }

    pickPrediction(rawPred, cleanPred) {
      const rawScore = rawPred.confidence + rawPred.inkRatio * 0.25;
      const cleanScore = cleanPred.confidence + cleanPred.inkRatio * 0.25;
      return cleanScore >= rawScore
        ? { ...cleanPred, source: 'clean', score: cleanScore }
        : { ...rawPred, source: 'raw', score: rawScore };
    }

    buildConsistentBoard(predictions) {
      const board = createBoard(0);
      const accepted = createBoard(false);
      const sorted = [...predictions].sort((a, b) => b.score - a.score);

      for (const pred of sorted) {
        if (!pred.digit) continue;
        if (pred.confidence < CONFIG.classifier.minConfidence) continue;
        if (BoardUtils.isPlacementValid(board, pred.row, pred.col, pred.digit)) {
          board[pred.row][pred.col] = pred.digit;
          accepted[pred.row][pred.col] = true;
        }
      }

      return { board, accepted };
    }

    findBoundingBox(binary, width, height) {
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      const xStart = Math.floor(width * 0.05);
      const xEnd = Math.ceil(width * 0.95);
      const yStart = Math.floor(height * 0.05);
      const yEnd = Math.ceil(height * 0.95);

      for (let y = yStart; y < yEnd; y += 1) {
        for (let x = xStart; x < xEnd; x += 1) {
          if (binary[y * width + x]) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      if (maxX < minX || maxY < minY) return null;
      return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }

    async readBoard(snapshotCanvas, bounds, onProgress, debugEnabled = false) {
      const boardRaw = this.extractSquare(snapshotCanvas, bounds, CONFIG.boardSizePx);
      const boardClean = this.preprocessBoard(boardRaw);
      const predictions = [];
      const debug = {
        rawBoardCanvas: debugEnabled ? this.cloneCanvas(boardRaw) : null,
        cleanBoardCanvas: debugEnabled ? this.cloneCanvas(boardClean) : null,
        cells: []
      };

      for (let row = 0; row < 9; row += 1) {
        for (let col = 0; col < 9; col += 1) {
          const index = row * 9 + col + 1;
          if (onProgress) onProgress(index);
          const pClean = this.extractDigitFromCell(boardClean, row, col);
          const pRaw = this.extractDigitFromCell(boardRaw, row, col);
          const chosen = this.pickPrediction(pRaw, pClean);
          predictions.push({ row, col, ...chosen, raw: pRaw, clean: pClean });

          if (debugEnabled) {
            debug.cells.push({
              row,
              col,
              rawDigit: pRaw.digit,
              rawConfidence: Number(pRaw.confidence.toFixed(3)),
              cleanDigit: pClean.digit,
              cleanConfidence: Number(pClean.confidence.toFixed(3)),
              initialChosenDigit: chosen.digit,
              chosenDigit: chosen.digit,
              chosenSource: chosen.source
            });
          }
        }
      }

      const consistent = this.buildConsistentBoard(predictions);
      if (debugEnabled) {
        for (const cell of debug.cells) {
          cell.accepted = consistent.accepted[cell.row][cell.col];
          if (!cell.accepted) cell.chosenDigit = 0;
        }
      }

      return { board: consistent.board, debug };
    }
  }

  class CropOverlayController {
    constructor(captureView, vision) {
      this.captureView = captureView;
      this.ctx = captureView.getContext('2d');
      this.vision = vision;

      this.snapshotCanvas = null;
      this.hasCapture = false;
      this.bounds = null;
      this.previewTransform = null;
      this.dragState = null;

      this.captureView.addEventListener('pointerdown', (event) => this.onPointerDown(event));
      this.captureView.addEventListener('pointermove', (event) => this.onPointerMove(event));
      this.captureView.addEventListener('pointerup', (event) => this.onPointerUp(event));
      this.captureView.addEventListener('pointercancel', (event) => this.onPointerUp(event));
    }

    setSnapshotCanvas(snapshotCanvas) {
      this.snapshotCanvas = snapshotCanvas;
    }

    setHasCapture(value) {
      this.hasCapture = value;
      if (!value) {
        this.bounds = null;
        this.previewTransform = null;
      }
    }

    fitCanvas() {
      const rect = this.captureView.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dpr = window.devicePixelRatio || 1;
      this.captureView.width = Math.round(rect.width * dpr);
      this.captureView.height = Math.round(rect.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.draw();
    }

    setAutoBounds() {
      if (!this.snapshotCanvas) return;
      this.bounds = this.vision.detectSudokuBounds(this.snapshotCanvas) || this.vision.getCenteredSquare(this.snapshotCanvas);
    }

    setCenteredBounds() {
      if (!this.snapshotCanvas) return;
      this.bounds = this.vision.getCenteredSquare(this.snapshotCanvas);
    }

    draw() {
      const w = this.captureView.clientWidth;
      const h = this.captureView.clientHeight;
      if (!w || !h) return;

      this.ctx.clearRect(0, 0, w, h);

      if (!this.hasCapture || !this.snapshotCanvas) {
        this.previewTransform = null;
        this.ctx.fillStyle = '#0c1220';
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.fillStyle = 'rgba(231, 238, 247, 0.85)';
        this.ctx.font = '600 16px system-ui, -apple-system, Segoe UI, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('No image selected', w / 2, h / 2);
        return;
      }

      this.previewTransform = this.drawImageCover(this.ctx, this.snapshotCanvas, w, h);
      if (!this.bounds) return;

      const x = this.previewTransform.dx + this.bounds.x * this.previewTransform.scale;
      const y = this.previewTransform.dy + this.bounds.y * this.previewTransform.scale;
      const side = this.bounds.size * this.previewTransform.scale;

      this.ctx.strokeStyle = 'rgba(72, 181, 117, 0.95)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x, y, side, side);

      this.ctx.strokeStyle = 'rgba(72, 181, 117, 0.5)';
      this.ctx.lineWidth = 1;
      const cell = side / 9;
      for (let i = 1; i < 9; i += 1) {
        this.ctx.beginPath();
        this.ctx.moveTo(x + i * cell, y);
        this.ctx.lineTo(x + i * cell, y + side);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(x, y + i * cell);
        this.ctx.lineTo(x + side, y + i * cell);
        this.ctx.stroke();
      }

      this.drawHandles(x, y, side);
    }

    drawImageCover(ctx, source, targetW, targetH) {
      const sw = source.width;
      const sh = source.height;
      const scale = Math.max(targetW / sw, targetH / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      const dx = (targetW - dw) / 2;
      const dy = (targetH - dh) / 2;
      ctx.drawImage(source, dx, dy, dw, dh);
      return { scale, dx, dy };
    }

    drawHandles(x, y, side) {
      const handle = Math.max(10, Math.min(18, side * 0.06));
      const corners = [
        { x, y },
        { x: x + side, y },
        { x, y: y + side },
        { x: x + side, y: y + side }
      ];

      this.ctx.fillStyle = 'rgba(72, 181, 117, 0.95)';
      this.ctx.strokeStyle = 'rgba(5, 15, 24, 0.8)';
      this.ctx.lineWidth = 2;
      for (const corner of corners) {
        this.ctx.beginPath();
        this.ctx.rect(corner.x - handle / 2, corner.y - handle / 2, handle, handle);
        this.ctx.fill();
        this.ctx.stroke();
      }
    }

    onPointerDown(event) {
      if (!this.hasCapture || !this.bounds || !this.previewTransform || !this.snapshotCanvas) return;
      const sourcePoint = this.toSourcePoint(event);
      if (!sourcePoint) return;

      const grip = this.pickGrip(sourcePoint.x, sourcePoint.y, this.bounds);
      if (!grip) return;

      this.dragState = {
        pointerId: event.pointerId,
        mode: grip.mode,
        corner: grip.corner || null,
        startPointer: sourcePoint,
        startBounds: { ...this.bounds }
      };

      this.captureView.setPointerCapture(event.pointerId);
      event.preventDefault();
    }

    onPointerMove(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId || !this.snapshotCanvas) return;
      const sourcePoint = this.toSourcePoint(event);
      if (!sourcePoint) return;

      const minSize = Math.floor(Math.min(this.snapshotCanvas.width, this.snapshotCanvas.height) * CONFIG.cropMinRatio);
      const maxSize = Math.min(this.snapshotCanvas.width, this.snapshotCanvas.height);
      const dx = sourcePoint.x - this.dragState.startPointer.x;
      const dy = sourcePoint.y - this.dragState.startPointer.y;

      let next = { ...this.dragState.startBounds };
      if (this.dragState.mode === 'move') {
        next.x += dx;
        next.y += dy;
      } else {
        next = this.resizeFromCorner(this.dragState.startBounds, this.dragState.corner, sourcePoint, minSize, maxSize);
      }

      this.bounds = this.vision.clampSquareToCanvas(next, this.snapshotCanvas.width, this.snapshotCanvas.height);
      this.draw();
      event.preventDefault();
    }

    onPointerUp(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;
      if (this.captureView.hasPointerCapture(event.pointerId)) {
        this.captureView.releasePointerCapture(event.pointerId);
      }
      this.dragState = null;
    }

    toSourcePoint(event) {
      if (!this.previewTransform || !this.snapshotCanvas) return null;
      const rect = this.captureView.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      return {
        x: (px - this.previewTransform.dx) / this.previewTransform.scale,
        y: (py - this.previewTransform.dy) / this.previewTransform.scale
      };
    }

    pickGrip(x, y, bounds) {
      const corners = {
        tl: { x: bounds.x, y: bounds.y },
        tr: { x: bounds.x + bounds.size, y: bounds.y },
        bl: { x: bounds.x, y: bounds.y + bounds.size },
        br: { x: bounds.x + bounds.size, y: bounds.y + bounds.size }
      };
      const handleRadius = Math.max(14, bounds.size * 0.06);

      for (const [corner, point] of Object.entries(corners)) {
        const dx = x - point.x;
        const dy = y - point.y;
        if (Math.sqrt(dx * dx + dy * dy) <= handleRadius) return { mode: 'resize', corner };
      }

      const inside = x >= bounds.x && y >= bounds.y && x <= bounds.x + bounds.size && y <= bounds.y + bounds.size;
      if (inside) return { mode: 'move' };
      return null;
    }

    resizeFromCorner(start, corner, pointer, minSize, maxSize) {
      let ax = start.x;
      let ay = start.y;

      if (corner === 'tl') {
        ax = start.x + start.size;
        ay = start.y + start.size;
      } else if (corner === 'tr') {
        ax = start.x;
        ay = start.y + start.size;
      } else if (corner === 'bl') {
        ax = start.x + start.size;
        ay = start.y;
      } else if (corner === 'br') {
        ax = start.x;
        ay = start.y;
      }

      const candidate = Math.max(Math.abs(pointer.x - ax), Math.abs(pointer.y - ay));
      const size = clamp(candidate, minSize, maxSize);

      if (corner === 'tl') return { x: ax - size, y: ay - size, size };
      if (corner === 'tr') return { x: ax, y: ay - size, size };
      if (corner === 'bl') return { x: ax - size, y: ay, size };
      return { x: ax, y: ay, size };
    }
  }

  class CameraModalController {
    constructor(modalEls) {
      this.modal = modalEls.modal;
      this.video = modalEls.video;
      this.guide = modalEls.guide;
      this.guideCtx = this.guide.getContext('2d');
      this.captureBtn = modalEls.captureBtn;
      this.closeBtn = modalEls.closeBtn;

      this.stream = null;

      this.closeBtn.addEventListener('click', () => this.close());
      this.modal.addEventListener('click', (event) => {
        if (event.target === this.modal) this.close();
      });

      this.captureBtn.disabled = true;
      window.addEventListener('resize', () => this.fitGuide());
    }

    async open() {
      if (this.stream) this.stopStream();

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      this.video.srcObject = this.stream;
      await this.video.play();
      this.modal.classList.add('open');
      this.modal.setAttribute('aria-hidden', 'false');
      this.captureBtn.disabled = false;
      this.fitGuide();
    }

    close() {
      this.modal.classList.remove('open');
      this.modal.setAttribute('aria-hidden', 'true');
      this.captureBtn.disabled = true;
      this.stopStream();
    }

    stopStream() {
      if (!this.stream) return;
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
      this.video.srcObject = null;
    }

    fitGuide() {
      const rect = this.guide.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dpr = window.devicePixelRatio || 1;
      this.guide.width = Math.round(rect.width * dpr);
      this.guide.height = Math.round(rect.height * dpr);
      this.guideCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawGuide();
    }

    drawGuide() {
      const w = this.guide.clientWidth;
      const h = this.guide.clientHeight;
      if (!w || !h) return;

      this.guideCtx.clearRect(0, 0, w, h);

      const side = Math.floor(Math.min(w, h) * CONFIG.cropDefaultRatio);
      const x = (w - side) / 2;
      const y = (h - side) / 2;

      this.guideCtx.fillStyle = 'rgba(0,0,0,0.33)';
      this.guideCtx.fillRect(0, 0, w, h);
      this.guideCtx.clearRect(x, y, side, side);

      this.guideCtx.strokeStyle = 'rgba(231, 238, 247, 0.95)';
      this.guideCtx.lineWidth = 2;
      this.guideCtx.strokeRect(x, y, side, side);

      this.guideCtx.strokeStyle = 'rgba(231, 238, 247, 0.45)';
      this.guideCtx.lineWidth = 1;
      const cell = side / 9;
      for (let i = 1; i < 9; i += 1) {
        this.guideCtx.beginPath();
        this.guideCtx.moveTo(x + i * cell, y);
        this.guideCtx.lineTo(x + i * cell, y + side);
        this.guideCtx.stroke();

        this.guideCtx.beginPath();
        this.guideCtx.moveTo(x, y + i * cell);
        this.guideCtx.lineTo(x + side, y + i * cell);
        this.guideCtx.stroke();
      }
    }
  }

  class SudokuApp {
    constructor() {
      this.els = {
        captureView: document.getElementById('captureView'),
        imageTag: document.getElementById('imageTag'),
        fileInput: document.getElementById('fileInput'),
        openCameraBtn: document.getElementById('openCameraBtn'),
        autoCropBtn: document.getElementById('autoCropBtn'),
        resetCropBtn: document.getElementById('resetCropBtn'),
        scanBtn: document.getElementById('scanBtn'),
        clearBtn: document.getElementById('clearBtn'),
        giveHintBtn: document.getElementById('giveHintBtn'),
        resetHintsBtn: document.getElementById('resetHintsBtn'),
        status: document.getElementById('status'),
        explanation: document.getElementById('explanation'),
        sudokuGrid: document.getElementById('sudokuGrid'),
        snapshotCanvas: document.getElementById('snapshotCanvas'),
        debugToggleBtn: document.getElementById('debugToggleBtn'),
        debugPanel: document.getElementById('debugPanel'),
        debugRawCanvas: document.getElementById('debugRawCanvas'),
        debugCleanCanvas: document.getElementById('debugCleanCanvas'),
        debugTableBody: document.getElementById('debugTableBody'),
        debugLog: document.getElementById('debugLog')
      };

      this.snapshotCtx = this.els.snapshotCanvas.getContext('2d');
      this.inputs = [];
      this.debugEnabled = false;
      this.vision = new SudokuVision();
      this.hints = new SudokuHintEngine();
      this.crop = new CropOverlayController(this.els.captureView, this.vision);
      this.crop.setSnapshotCanvas(this.els.snapshotCanvas);

      this.cameraModal = new CameraModalController({
        modal: document.getElementById('cameraModal'),
        video: document.getElementById('modalVideo'),
        guide: document.getElementById('modalGuide'),
        captureBtn: document.getElementById('modalCaptureBtn'),
        closeBtn: document.getElementById('modalCloseBtn')
      });

      this.buildGrid();
      this.bindEvents();
      this.renderEmptyState();
      this.crop.fitCanvas();
      window.addEventListener('resize', () => this.crop.fitCanvas());
      window.addEventListener('beforeunload', () => this.cameraModal.close());
    }

    bindEvents() {
      this.els.openCameraBtn.addEventListener('click', () => this.onOpenCamera());
      this.cameraModal.captureBtn.addEventListener('click', () => this.onCaptureFromCamera());
      this.els.fileInput.addEventListener('change', (event) => this.onUploadFile(event));

      this.els.autoCropBtn.addEventListener('click', () => {
        if (!this.crop.hasCapture) return;
        this.crop.setAutoBounds();
        this.crop.draw();
        this.setStatus('Auto crop updated. Adjust manually if needed.', 'ok');
      });

      this.els.resetCropBtn.addEventListener('click', () => {
        if (!this.crop.hasCapture) return;
        this.crop.setCenteredBounds();
        this.crop.draw();
        this.setStatus('Crop reset to centered square. Drag to adjust.', 'ok');
      });

      this.els.scanBtn.addEventListener('click', () => this.onReadSudoku());
      this.els.clearBtn.addEventListener('click', () => this.clearBoard());
      this.els.giveHintBtn.addEventListener('click', () => this.onGiveHint());
      this.els.resetHintsBtn.addEventListener('click', () => this.resetHints());
      this.els.debugToggleBtn.addEventListener('click', () => this.toggleDebugMode());
    }

    buildGrid() {
      for (let row = 0; row < 9; row += 1) {
        this.inputs[row] = [];
        for (let col = 0; col < 9; col += 1) {
          const input = document.createElement('input');
          input.type = 'text';
          input.inputMode = 'numeric';
          input.maxLength = 1;
          input.className = 'sudoku-cell';
          input.setAttribute('aria-label', `Row ${row + 1}, column ${col + 1}`);
          input.dataset.row = String(row);
          input.dataset.col = String(col);
          if (col === 2 || col === 5) input.dataset.rightBorder = 'true';
          if (row === 2 || row === 5) input.dataset.bottomBorder = 'true';

          input.addEventListener('input', () => {
            input.value = input.value.replace(/[^1-9]/g, '').slice(0, 1);
            input.classList.remove('hint');
            input.classList.remove('given');
            this.hints.givenMask[row][col] = false;
            this.hints.markDirty();
          });

          this.els.sudokuGrid.appendChild(input);
          this.inputs[row][col] = input;
        }
      }
    }

    renderEmptyState() {
      this.crop.setHasCapture(false);
      this.crop.draw();
      this.els.scanBtn.disabled = true;
      this.els.autoCropBtn.disabled = true;
      this.els.resetCropBtn.disabled = true;
      this.setImageTag('No image selected', true);
      if (this.debugEnabled) {
        this.drawCanvasInto(this.els.debugRawCanvas, null);
        this.drawCanvasInto(this.els.debugCleanCanvas, null);
        this.els.debugTableBody.innerHTML = '';
        this.els.debugLog.textContent = '';
      }
    }

    setImageTag(text, warn = false) {
      this.els.imageTag.textContent = text;
      this.els.imageTag.classList.toggle('warn', warn);
    }

    setStatus(message, tone) {
      this.els.status.textContent = message;
      this.els.status.classList.remove('error', 'ok');
      if (tone) this.els.status.classList.add(tone);
    }

    toggleDebugMode() {
      this.debugEnabled = !this.debugEnabled;
      this.els.debugPanel.classList.toggle('open', this.debugEnabled);
      this.els.debugPanel.setAttribute('aria-hidden', this.debugEnabled ? 'false' : 'true');
      this.els.debugToggleBtn.textContent = this.debugEnabled ? 'debug on' : 'debug';
      if (!this.debugEnabled) {
        this.els.debugLog.textContent = '';
        this.els.debugTableBody.innerHTML = '';
      }
    }

    appendDebugLog(line) {
      if (!this.debugEnabled) return;
      const ts = new Date().toLocaleTimeString();
      this.els.debugLog.textContent += `[${ts}] ${line}\n`;
      this.els.debugLog.scrollTop = this.els.debugLog.scrollHeight;
      console.log(`[sudoku-debug] ${line}`);
    }

    drawCanvasInto(targetCanvas, sourceCanvas) {
      const ctx = targetCanvas.getContext('2d');
      ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
      if (!sourceCanvas) return;
      ctx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
    }

    renderDebugResult(debug) {
      if (!this.debugEnabled) return;

      this.drawCanvasInto(this.els.debugRawCanvas, debug.rawBoardCanvas);
      this.drawCanvasInto(this.els.debugCleanCanvas, debug.cleanBoardCanvas);

      this.els.debugTableBody.innerHTML = '';
      for (const cell of debug.cells) {
        const row = document.createElement('tr');
        row.innerHTML = [
          `<td>R${cell.row + 1}C${cell.col + 1}</td>`,
          `<td>${cell.rawDigit || '-'} (${cell.rawConfidence})</td>`,
          `<td>${cell.cleanDigit || '-'} (${cell.cleanConfidence})</td>`,
          `<td>${cell.chosenDigit || '-'} (${cell.chosenSource})</td>`,
          `<td>${cell.accepted ? 'yes' : 'no'}</td>`
        ].join('');
        this.els.debugTableBody.appendChild(row);
      }

      const lowConfidence = debug.cells.filter((c) => Math.max(c.rawConfidence, c.cleanConfidence) < 0.45).length;
      const rejected = debug.cells.filter((c) => !c.accepted && c.initialChosenDigit).length;
      this.appendDebugLog(`OCR finished. Cells: 81, low-confidence: ${lowConfidence}, rejected-by-consistency: ${rejected}.`);
      console.table(debug.cells.slice(0, 81));
    }

    async onOpenCamera() {
      try {
        await this.cameraModal.open();
        this.setStatus('Camera open. Capture the Sudoku when it is centered.', 'ok');
      } catch (error) {
        this.setStatus(`Camera error: ${error.message}`, 'error');
      }
    }

    onCaptureFromCamera() {
      const video = this.cameraModal.video;
      if (!video.videoWidth || !video.videoHeight) {
        this.setStatus('Camera is not ready yet.', 'error');
        return;
      }

      this.els.snapshotCanvas.width = video.videoWidth;
      this.els.snapshotCanvas.height = video.videoHeight;
      this.snapshotCtx.drawImage(video, 0, 0, this.els.snapshotCanvas.width, this.els.snapshotCanvas.height);

      this.cameraModal.close();
      this.onImageLoaded('Captured image');
      this.setStatus('Image captured. Adjust crop if needed, then press Read Sudoku.', 'ok');
    }

    onUploadFile(event) {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          this.els.snapshotCanvas.width = img.naturalWidth;
          this.els.snapshotCanvas.height = img.naturalHeight;
          this.snapshotCtx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

          this.onImageLoaded('Uploaded image');
          this.setStatus('Photo uploaded. Adjust crop if needed, then press Read Sudoku.', 'ok');
        };
        img.onerror = () => this.setStatus('Could not read uploaded image.', 'error');
        img.src = String(reader.result || '');
      };

      reader.onerror = () => this.setStatus('Could not read file.', 'error');
      reader.readAsDataURL(file);
      event.target.value = '';
    }

    onImageLoaded(tag) {
      this.crop.setHasCapture(true);
      this.crop.setAutoBounds();
      this.crop.draw();

      this.els.scanBtn.disabled = false;
      this.els.autoCropBtn.disabled = false;
      this.els.resetCropBtn.disabled = false;

      this.setImageTag(tag);
      this.appendDebugLog(`${tag} ready. Auto crop initialized.`);
    }

    async onReadSudoku() {
      if (!this.crop.hasCapture || !this.crop.bounds) {
        this.setStatus('Select an image first (camera or upload).', 'error');
        return;
      }

      this.els.scanBtn.disabled = true;
      this.appendDebugLog(
        `Start OCR. Crop x=${Math.round(this.crop.bounds.x)}, y=${Math.round(this.crop.bounds.y)}, size=${Math.round(this.crop.bounds.size)}`
      );
      try {
        const result = await this.vision.readBoard(this.els.snapshotCanvas, this.crop.bounds, (index) => {
          this.setStatus(`Reading Sudoku... cell ${index}/81`, '');
        }, this.debugEnabled);
        const board = result.board;

        this.applyBoardToGrid(board);
        this.markCurrentAsGiven();
        this.hints.markDirty();
        if (this.debugEnabled) this.renderDebugResult(result.debug);

        const givens = BoardUtils.countGivens(board);
        if (givens < CONFIG.minGivens) {
          this.setStatus(`OCR read ${givens} digits. Too few for reliable hints; correct the board manually before Give hint.`, 'error');
          this.els.explanation.textContent = 'OCR result is incomplete. Edit the grid until the puzzle is correct, then use Give hint.';
        } else {
          this.setStatus(`OCR completed with ${givens} digits. Review/correct and press Give hint.`, 'ok');
          this.els.explanation.textContent = 'Puzzle loaded. Each click on Give hint reveals one number.';
        }
      } catch (error) {
        this.setStatus(`OCR failed: ${error.message}`, 'error');
      } finally {
        this.els.scanBtn.disabled = false;
      }
    }

    onGiveHint() {
      try {
        if (!this.hints.prepared || this.hints.dirtySincePrepare) {
          this.hints.prepare(this.readBoardFromGrid());
          this.clearHintStyles();
          this.applyGivenStyles();
        }

        const hint = this.hints.getNextHint();
        if (!hint) {
          this.els.explanation.textContent = 'No more hints. Puzzle is complete.';
          this.setStatus('Sudoku solved with hints.', 'ok');
          return;
        }

        this.hints.workingBoard[hint.row][hint.col] = hint.value;
        const cell = this.inputs[hint.row][hint.col];
        cell.value = String(hint.value);
        cell.classList.remove('given');
        cell.classList.add('hint');

        this.els.explanation.textContent = hint.reason;
        this.setStatus('Hint delivered. Press Give hint again for the next one.', 'ok');
      } catch (error) {
        this.setStatus(error.message, 'error');
      }
    }

    resetHints() {
      if (!this.hints.prepared && !this.hints.dirtySincePrepare) return;

      const board = this.readBoardFromGrid();
      for (let row = 0; row < 9; row += 1) {
        for (let col = 0; col < 9; col += 1) {
          if (!this.hints.givenMask[row][col]) {
            this.inputs[row][col].value = '';
            this.inputs[row][col].classList.remove('hint');
          }
        }
      }

      this.hints.workingBoard = copyBoard(board.map((r, i) => r.map((v, j) => (this.hints.givenMask[i][j] ? v : 0))));
      this.hints.prepared = false;
      this.hints.dirtySincePrepare = true;
      this.els.explanation.textContent = 'Hints reset. Press Give hint to start again from current givens.';
      this.setStatus('Hints cleared.', 'ok');
    }

    clearBoard() {
      for (let row = 0; row < 9; row += 1) {
        for (let col = 0; col < 9; col += 1) {
          const cell = this.inputs[row][col];
          cell.value = '';
          cell.classList.remove('hint');
          cell.classList.remove('given');
        }
      }

      this.hints = new SudokuHintEngine();
      this.els.explanation.textContent = 'Hints will appear here.';
      this.setStatus('Board cleared.', '');
      this.renderEmptyState();
    }

    readBoardFromGrid() {
      const board = createBoard(0);
      for (let row = 0; row < 9; row += 1) {
        for (let col = 0; col < 9; col += 1) {
          const value = Number(this.inputs[row][col].value);
          board[row][col] = Number.isInteger(value) && value >= 1 && value <= 9 ? value : 0;
        }
      }
      return board;
    }

    applyBoardToGrid(board) {
      for (let row = 0; row < 9; row += 1) {
        for (let col = 0; col < 9; col += 1) {
          this.inputs[row][col].value = board[row][col] === 0 ? '' : String(board[row][col]);
        }
      }
      this.clearHintStyles();
    }

    markCurrentAsGiven() {
      this.hints.givenMask = createBoard(false);
      for (let row = 0; row < 9; row += 1) {
        for (let col = 0; col < 9; col += 1) {
          const value = Number(this.inputs[row][col].value);
          const isGiven = value >= 1 && value <= 9;
          this.hints.givenMask[row][col] = isGiven;
          this.inputs[row][col].classList.toggle('given', isGiven);
          this.inputs[row][col].classList.remove('hint');
        }
      }
    }

    applyGivenStyles() {
      for (let row = 0; row < 9; row += 1) {
        for (let col = 0; col < 9; col += 1) {
          this.inputs[row][col].classList.toggle('given', this.hints.givenMask[row][col]);
        }
      }
    }

    clearHintStyles() {
      for (let row = 0; row < 9; row += 1) {
        for (let col = 0; col < 9; col += 1) {
          this.inputs[row][col].classList.remove('hint');
        }
      }
    }
  }

  new SudokuApp();
})();
