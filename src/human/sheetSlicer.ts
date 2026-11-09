import { SlotId } from '../components/HumanFromImagesPanel';

export interface SlicedSheetResult {
  images: Record<SlotId, HTMLImageElement | null>;
  names: Record<SlotId, string | null>;
  isAllInOne: boolean;
}

/**
 * Creates an HTMLImageElement from a canvas or Data URL.
 */
function imgFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo decodificar la subimagen'));
    img.src = dataUrl;
  });
}

/**
 * Finds the column index in [x0 .. x1] with the lowest foreground density,
 * preferring the center of any flat valley (e.g. white space between figures).
 */
function findBestValley(counts: Float32Array, x0: number, x1: number): number {
  let minVal = Infinity;
  for (let x = x0; x <= x1; x++) {
    if (counts[x] < minVal) minVal = counts[x];
  }
  const tol = minVal + Math.max(1, minVal * 0.15);
  let bestStart = x0;
  let bestLen = 0;
  let curStart = -1;
  for (let x = x0; x <= x1; x++) {
    if (counts[x] <= tol) {
      if (curStart < 0) curStart = x;
      const len = x - curStart + 1;
      if (len > bestLen) {
        bestLen = len;
        bestStart = curStart;
      }
    } else {
      curStart = -1;
    }
  }
  return Math.round(bestStart + (bestLen - 1) * 0.5);
}

/**
 * Automatically inspects an image to determine if it is a multi-view composite sheet:
 * - 4x2 grid (4 columns: Front, Side L, Side R, Back; Row 2: corresponding layer maps)
 * - 4x1 grid (4 columns: Front, Side L, Side R, Back)
 * Uses connected-component figure isolation so wide side profiles (e.g. dragons with
 * long tails and wings) never get their tails/wings clipped or merged into adjacent views.
 */
export async function sliceCompositeSheet(
  sheetImg: HTMLImageElement,
  fileName: string = 'hoja_todo_en_uno.png'
): Promise<SlicedSheetResult> {
  const w = sheetImg.naturalWidth || sheetImg.width;
  const h = sheetImg.naturalHeight || sheetImg.height;
  const ratio = w / h;

  // If the image is roughly square or tall (single portrait / front-only photo)
  if (ratio < 1.15) {
    return {
      images: {
        front: sheetImg,
        back: null,
        side: null,
        sideLeft: null,
        frontLayer: null,
        backLayer: null,
        sideLayer: null,
        sideLeftLayer: null,
      },
      names: {
        front: fileName,
        back: null,
        side: null,
        sideLeft: null,
        frontLayer: null,
        backLayer: null,
        sideLayer: null,
        sideLeftLayer: null,
      },
      isAllInOne: false,
    };
  }

  // Analysis resolution for connected-component figure isolation
  const scale = Math.min(1, 960 / Math.max(w, h));
  const sw = Math.max(64, Math.round(w * scale));
  const sh = Math.max(64, Math.round(h * scale));

  const probeCanvas = document.createElement('canvas');
  probeCanvas.width = sw;
  probeCanvas.height = sh;
  const pctx = probeCanvas.getContext('2d', { willReadFrequently: true });
  if (!pctx) {
    throw new Error('No se pudo inicializar el contexto 2D para recortar la hoja');
  }
  pctx.drawImage(sheetImg, 0, 0, sw, sh);
  const pData = pctx.getImageData(0, 0, sw, sh).data;

  // 1. Sample corners and top/bottom edges to detect background color
  let bgR = 0, bgG = 0, bgB = 0, bgA = 0, bgN = 0;
  const patch = Math.max(2, Math.min(8, Math.floor(Math.min(sw, sh) / 24)));
  const samplePoints = [
    [0, 0],
    [sw - patch, 0],
    [0, sh - patch],
    [sw - patch, sh - patch],
    [Math.floor(sw * 0.5), 0],
    [Math.floor(sw * 0.5), sh - patch],
  ];
  for (const [px, py] of samplePoints) {
    for (let dy = 0; dy < patch; dy++) {
      for (let dx = 0; dx < patch; dx++) {
        const idx = ((py + dy) * sw + (px + dx)) * 4;
        bgR += pData[idx];
        bgG += pData[idx + 1];
        bgB += pData[idx + 2];
        bgA += pData[idx + 3];
        bgN++;
      }
    }
  }
  bgR = Math.round(bgR / bgN);
  bgG = Math.round(bgG / bgN);
  bgB = Math.round(bgB / bgN);
  bgA = Math.round(bgA / bgN);
  const transparentBg = bgA < 32;
  const bgFillCss = transparentBg ? 'rgba(0,0,0,0)' : `rgb(${bgR},${bgG},${bgB})`;

  const isFgPixel = (x: number, y: number): boolean => {
    const idx = (y * sw + x) * 4;
    if (transparentBg) return pData[idx + 3] > 32;
    const dr = pData[idx] - bgR;
    const dg = pData[idx + 1] - bgG;
    const db = pData[idx + 2] - bgB;
    return dr * dr + dg * dg + db * db > 28 * 28;
  };

  // 2. Determine if the sheet has 2 rows (Row 0: views, Row 1: layer maps)
  const hasTwoRows = ratio > 1.22 && ratio < 2.25;
  let splitYSmall = hasTwoRows ? Math.round(sh * 0.5) : sh;
  if (hasTwoRows) {
    const rowCounts = new Float32Array(sh);
    for (let y = 0; y < sh; y++) {
      let c = 0;
      for (let x = 0; x < sw; x++) {
        if (isFgPixel(x, y)) c++;
      }
      rowCounts[y] = c;
    }
    const smoothRow = new Float32Array(sh);
    for (let y = 0; y < sh; y++) {
      let s = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < sh) {
          s += rowCounts[yy];
          n++;
        }
      }
      smoothRow[y] = s / n;
    }
    splitYSmall = findBestValley(
      smoothRow,
      Math.round(sh * 0.41),
      Math.round(sh * 0.59)
    );
  }

  const rowSh = hasTwoRows ? splitYSmall : sh;

  // 3. Build a unified foreground mask for a single row (union of Row 0 and Row 1)
  const fgMask = new Uint8Array(sw * rowSh);
  const colCounts = new Float32Array(sw);
  for (let y = 0; y < rowSh; y++) {
    const y2 = hasTwoRows ? Math.min(sh - 1, y + splitYSmall) : y;
    for (let x = 0; x < sw; x++) {
      if (isFgPixel(x, y) || (hasTwoRows && isFgPixel(x, y2))) {
        fgMask[y * sw + x] = 1;
        colCounts[x]++;
      }
    }
  }

  const smoothCol = new Float32Array(sw);
  for (let x = 0; x < sw; x++) {
    let s = 0, n = 0;
    for (let dx = -3; dx <= 3; dx++) {
      const xx = x + dx;
      if (xx >= 0 && xx < sw) {
        s += colCounts[xx];
        n++;
      }
    }
    smoothCol[x] = s / n;
  }

  // Find the 3 vertical valleys separating the 4 columns
  const split1 = findBestValley(smoothCol, Math.round(sw * 0.13), Math.round(sw * 0.33));
  const split2 = findBestValley(smoothCol, Math.round(sw * 0.40), Math.round(sw * 0.60));
  const split3 = findBestValley(smoothCol, Math.round(sw * 0.67), Math.round(sw * 0.87));
  const splits = [0, split1, split2, split3, sw];

  const colOfX = (x: number): number => {
    if (x < split1) return 0;
    if (x < split2) return 1;
    if (x < split3) return 2;
    return 3;
  };

  // 4. Connected-Component Figure Isolation:
  // Keeps each figure's connected components intact (so a long dragon tail or wing tip
  // that crosses a vertical split line stays with its own body instead of being chopped off!)
  const compId = new Int32Array(sw * rowSh).fill(-1);
  const figOwner = new Int8Array(sw * rowSh).fill(-1);
  const queue = new Int32Array(sw * rowSh);
  let nextComp = 0;

  for (let i0 = 0; i0 < sw * rowSh; i0++) {
    if (fgMask[i0] === 0 || compId[i0] >= 0) continue;
    const cid = nextComp++;
    let qh = 0;
    let qt = 0;
    queue[qt++] = i0;
    compId[i0] = cid;

    let minX = sw, maxX = 0;
    let sumX = 0;
    while (qh < qt) {
      const idx = queue[qh++];
      const cx = idx % sw;
      const cy = (idx / sw) | 0;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      sumX += cx;

      if (cx > 0 && fgMask[idx - 1] === 1 && compId[idx - 1] < 0) {
        compId[idx - 1] = cid;
        queue[qt++] = idx - 1;
      }
      if (cx < sw - 1 && fgMask[idx + 1] === 1 && compId[idx + 1] < 0) {
        compId[idx + 1] = cid;
        queue[qt++] = idx + 1;
      }
      if (cy > 0 && fgMask[idx - sw] === 1 && compId[idx - sw] < 0) {
        compId[idx - sw] = cid;
        queue[qt++] = idx - sw;
      }
      if (cy < rowSh - 1 && fgMask[idx + sw] === 1 && compId[idx + sw] < 0) {
        compId[idx + sw] = cid;
        queue[qt++] = idx + sw;
      }
    }

    const spanX = maxX - minX + 1;
    const meanX = sumX / qt;
    // If this component is a single figure (doesn't bridge two figures across >44% of the sheet),
    // assign the entire connected component to the column of its center of mass!
    if (spanX < sw * 0.44) {
      const owner = colOfX(meanX);
      for (let k = 0; k < qt; k++) {
        figOwner[queue[k]] = owner;
      }
    } else {
      // Fallback if two figures touch: split at the vertical valley lines
      for (let k = 0; k < qt; k++) {
        const idx = queue[k];
        figOwner[idx] = colOfX(idx % sw);
      }
    }
  }

  // Dilate figOwner by 2 pixels into background so anti-aliased edges around tails/wings are preserved
  for (let pass = 0; pass < 2; pass++) {
    const prev = figOwner.slice();
    for (let y = 1; y < rowSh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        const i = y * sw + x;
        if (prev[i] >= 0) continue;
        const n =
          prev[i - 1] >= 0
            ? prev[i - 1]
            : prev[i + 1] >= 0
            ? prev[i + 1]
            : prev[i - sw] >= 0
            ? prev[i - sw]
            : prev[i + sw];
        if (n >= 0) figOwner[i] = n;
      }
    }
  }

  // Compute horizontal bounding box [colMinX, colMaxX] for each of the 4 figures in full resolution
  const colBounds: Array<[number, number]> = [];
  for (let col = 0; col < 4; col++) {
    let minX = splits[col];
    let maxX = splits[col + 1] - 1;
    let found = false;
    let fMin = sw - 1;
    let fMax = 0;
    for (let y = 0; y < rowSh; y++) {
      for (let x = 0; x < sw; x++) {
        if (figOwner[y * sw + x] === col) {
          if (x < fMin) fMin = x;
          if (x > fMax) fMax = x;
          found = true;
        }
      }
    }
    if (found && fMax > fMin) {
      const pad = Math.round(sw * 0.012);
      minX = Math.max(0, fMin - pad);
      maxX = Math.min(sw - 1, fMax + pad);
    }
    const fullX0 = Math.max(0, Math.round((minX / sw) * w));
    const fullX1 = Math.min(w, Math.round(((maxX + 1) / sw) * w));
    colBounds.push([fullX0, Math.max(fullX0 + 16, fullX1)]);
  }

  // Detect whether Row 0 or Row 1 contains the color-coded layer map:
  // In a layer map, pixels have pure high-saturation primary colors (bright blue, neon magenta, bright cyan, etc.).
  // In an original drawing, pixels have natural tones, shading, and gradients.
  let row0LayerScore = 0;
  let row1LayerScore = 0;
  if (hasTwoRows) {
    const isLayerPixel = (x: number, y: number): boolean => {
      const idx = (y * sw + x) * 4;
      const r = pData[idx];
      const g = pData[idx + 1];
      const b = pData[idx + 2];
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      if (mx < 50 || (mx > 245 && mn > 240)) return false;
      const sat = mx > 0 ? (mx - mn) / mx : 0;
      if (sat > 0.55 && mx > 110) {
        if (
          (b > 140 && r < 110) ||
          (r > 140 && b > 130 && g < 90) ||
          (b > 140 && g > 140 && r < 90)
        ) {
          return true;
        }
      }
      return false;
    };
    for (let y = 0; y < rowSh; y++) {
      const y2 = Math.min(sh - 1, y + splitYSmall);
      for (let x = 0; x < sw; x++) {
        if (isLayerPixel(x, y)) row0LayerScore++;
        if (isLayerPixel(x, y2)) row1LayerScore++;
      }
    }
  }

  // Row index for original photos (0 by default) and for layer maps (1 by default)
  // If row 0 has significantly more layer-like colors, invert so the original photos always map to photo slots!
  const photoRow = hasTwoRows && row0LayerScore > row1LayerScore * 1.5 ? 1 : 0;
  const layerRow = hasTwoRows ? (photoRow === 0 ? 1 : 0) : -1;

  const rowH = hasTwoRows ? Math.round((splitYSmall / sh) * h) : h;

  const cropCell = async (col: number, row: number): Promise<HTMLImageElement> => {
    const [x0, x1] = colBounds[col];
    const cellW = x1 - x0;
    const y0 = row === 0 ? 0 : rowH;
    const cellH = row === 0 ? rowH : h - rowH;

    const cellCanvas = document.createElement('canvas');
    cellCanvas.width = cellW;
    cellCanvas.height = cellH;
    const cellCtx = cellCanvas.getContext('2d', { willReadFrequently: true });
    if (!cellCtx) {
      throw new Error('No se pudo inicializar el contexto 2D para recortar la hoja');
    }

    if (!transparentBg) {
      cellCtx.fillStyle = bgFillCss;
      cellCtx.fillRect(0, 0, cellW, cellH);
    }
    cellCtx.drawImage(sheetImg, x0, y0, cellW, cellH, 0, 0, cellW, cellH);

    // Mask out any pixels in this crop rectangle that belong to a neighboring figure (j !== col)
    const imgData = cellCtx.getImageData(0, 0, cellW, cellH);
    const d = imgData.data;
    for (let py = 0; py < cellH; py++) {
      const sy = Math.min(rowSh - 1, Math.floor((py / Math.max(1, cellH)) * rowSh));
      const syOff = sy * sw;
      for (let px = 0; px < cellW; px++) {
        const sx = Math.min(sw - 1, Math.floor(((x0 + px) / w) * sw));
        const owner = figOwner[syOff + sx];
        if (owner >= 0 && owner !== col) {
          const o = (py * cellW + px) * 4;
          if (transparentBg) {
            d[o + 3] = 0;
          } else {
            d[o] = bgR;
            d[o + 1] = bgG;
            d[o + 2] = bgB;
            d[o + 3] = 255;
          }
        }
      }
    }
    cellCtx.putImageData(imgData, 0, 0);

    return imgFromDataUrl(cellCanvas.toDataURL('image/png'));
  };

  // Col 0: Front, Col 1: Profile facing right (left flank), Col 2: Profile facing left (right flank), Col 3: Back
  // The original photo (photoRow) strictly populates front, sideLeft, side, and back
  const [front, sideLeft, side, back] = await Promise.all([
    cropCell(0, photoRow),
    cropCell(1, photoRow),
    cropCell(2, photoRow),
    cropCell(3, photoRow),
  ]);

  let frontLayer: HTMLImageElement | null = null;
  let sideLeftLayer: HTMLImageElement | null = null;
  let sideLayer: HTMLImageElement | null = null;
  let backLayer: HTMLImageElement | null = null;

  if (hasTwoRows && layerRow >= 0) {
    [frontLayer, sideLeftLayer, sideLayer, backLayer] = await Promise.all([
      cropCell(0, layerRow),
      cropCell(1, layerRow),
      cropCell(2, layerRow),
      cropCell(3, layerRow),
    ]);
  }

  const basePrefix = fileName.replace(/\.[^/.]+$/, '');

  return {
    images: {
      front,
      side,
      sideLeft,
      back,
      frontLayer,
      sideLayer,
      sideLeftLayer,
      backLayer,
    },
    names: {
      front: `${basePrefix}_frente.png`,
      side: `${basePrefix}_perfil_der.png`,
      sideLeft: `${basePrefix}_perfil_izq.png`,
      back: `${basePrefix}_espalda.png`,
      frontLayer: frontLayer ? `${basePrefix}_capas_frente.png` : null,
      sideLayer: sideLayer ? `${basePrefix}_capas_perfil_der.png` : null,
      sideLeftLayer: sideLeftLayer ? `${basePrefix}_capas_perfil_izq.png` : null,
      backLayer: backLayer ? `${basePrefix}_capas_espalda.png` : null,
    },
    isAllInOne: true,
  };
}
