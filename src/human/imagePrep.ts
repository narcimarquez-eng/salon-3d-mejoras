// ============================================================================
// PREPARACIÓN DE IMÁGENES PARA EL MOLDE HUMANO
// ----------------------------------------------------------------------------
// Portado de la app Vortex3D (repo 3d-con-imagenes), donde este trabajo vivía
// repartido entre `engine/cnnReconstruction.ts` y `App.tsx`. Aquí se queda solo
// lo que el molde humano necesita de verdad:
//
//   1. recortar la foto al personaje y encajarla en el tensor de 256x256,
//   2. detectar el color de fondo y el fondo exterior,
//   3. sacar el relieve de la foto (brillo filtrado) y sus normales,
//   4. recortar la silueta (máscara de cuerpo),
//   5. rellenar el color hacia fuera del contorno (Voronoï) para que el borde
//      nunca chupe color de fondo,
//   6. montar el atlas de 512: frente en el cuadrante izquierdo, espalda en el
//      derecho, igual que espera `humanBodyTemplate`.
//
// Lo que NO se ha portado, porque el molde humano no lo usa: el solucionador de
// Poisson, las formas preset (esfera, cuadrúpedo...), la tira lateral de unión
// y el modo de relieve antiguo. El relieve que recibe el molde es el mapa
// normalizado de brillo; `addPhotoDetail` ya le aplica un paso alto, así que la
// parte baja de frecuencia que aportaba Poisson se descartaba de todos modos.
// ============================================================================

import { layerMapToOffsets, LAYER_CLASSES } from './layerMap';

export const TENSOR = 256;
export const TENSOR_LEN = TENSOR * TENSOR;
export const ATLAS = 512;

/** Rugosidad y metalicidad por defecto (ropa y piel mate, sin brillos plásticos). */
const ZONE_ROUGHNESS = [0.76, 0.82, 0.88, 0.42];
const ZONE_METALNESS = [0.06, 0.02, 0.00, 0.35];

export interface TensorCrop {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tamaño de la imagen de origen a la que se refiere el recorte. */
  iw: number;
  ih: number;
}

export interface LayerMapBuffers {
  offset: Float32Array;
  soft: Uint8Array;
  classIds: Int8Array;
}

export interface ViewTensors {
  /** Color de la foto (0..1), TENSOR_LEN * 3. */
  rgb: Float32Array;
  alpha: Float32Array;
  /** 1 = fondo exterior alcanzado desde los bordes. */
  exteriorBg: Uint8Array;
  candidateBg: Uint8Array;
  /** Silueta final: 1 = cuerpo. */
  cutout: Uint8Array;
  /** Relieve normalizado 0..1 (brillo filtrado). */
  relief: Float32Array;
  /** Color con el contorno rellenado hacia fuera. */
  inpainted: Float32Array;
  /** Normales de la imagen (-1..1), TENSOR_LEN * 3. */
  normal: Float32Array;
  /** Zona PBR por texel (0..3). */
  zone: Uint8Array;
  /** Color de fondo detectado (0..1). */
  bg: [number, number, number];
  bgHex: string;
}

export interface CutoutSettings {
  /** Umbral de relieve plano que se considera fondo. */
  flatThreshold: number;
  /** Margen radial que recorta el marco exterior. */
  borderMargin: number;
  colorTolerance: number;
  hueTolerance: number;
  matchByHueTone: boolean;
  closeInternalHoles: boolean;
  holeFillRadius: number;
}

export const DEFAULT_CUTOUT: CutoutSettings = {
  flatThreshold: 0.14,
  borderMargin: 0.06,
  colorTolerance: 0.24,
  hueTolerance: 0.15,
  matchByHueTone: true,
  closeInternalHoles: true,
  holeFillRadius: 1,
};

/** Modos de recorte de Vortex3D; aquí solo se usa el automático por color de esquina. */
const CUTOUT_FLAT_RELIEF_AND_BORDER = 'flat_relief_border';
const CUTOUT_AUTO_CORNER_COLOR = 'auto_corner_color';
const CUTOUT_CUSTOM_COLOR_HUE = 'custom_color_hue';
const CUTOUT_NONE = 'none';

// Module-scoped HSL registers for Zero-GC color/hue tone matching
let _hslH = 0;
let _hslS = 0;
let _hslL = 0;

function computeHSLInPlace(r: number, g: number, b: number): void {
  const max = r > g ? (r > b ? r : b) : g > b ? g : b;
  const min = r < g ? (r < b ? r : b) : g < b ? g : b;
  const l = (max + min) * 0.5;
  const d = max - min;

  if (d < 1e-5) {
    _hslH = 0;
    _hslS = 0;
    _hslL = l;
    return;
  }

  const s = l > 0.5 ? d / (2.0 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) {
    h = (g - b) / d + (g < b ? 6.0 : 0.0);
  } else if (max === g) {
    h = (b - r) / d + 2.0;
  } else {
    h = (r - g) / d + 4.0;
  }
  _hslH = h / 6.0;
  _hslS = s;
  _hslL = l;
}

function parseHexToRGBNormalized(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [0.05, 0.07, 0.12];
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return [0.05, 0.07, 0.12];
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255,
  ];
}

/**
 * Recorta la imagen al personaje y la encaja sin deformar en el tensor
 * cuadrado, rellenando con el color de fondo de la propia imagen. Devuelve el
 * recorte usado, para que el mapa de capas se recorte exactamente igual.
 */
export function fitImageToTensor(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement
): TensorCrop {
  const size = TENSOR;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  // Average a small patch in each corner of the source image to get its background colour.
  const probe = document.createElement('canvas');
  probe.width = iw;
  probe.height = ih;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  let fill = '#0c1220';
  if (pctx) {
    pctx.drawImage(img, 0, 0);
    const patch = Math.max(1, Math.min(8, Math.floor(Math.min(iw, ih) / 20)));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (const [x, y] of [[0, 0], [iw - patch, 0], [0, ih - patch], [iw - patch, ih - patch]]) {
      const d = pctx.getImageData(x, y, patch, patch).data;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3]; n++;
      }
    }
    // Transparent PNG backgrounds stay transparent so the alpha-based cutout keeps working.
    fill = a / n < 32 ? 'rgba(0,0,0,0)' : `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  }

  // Crop to the character: bounding box of pixels that differ from the background.
  let cx0 = 0;
  let cy0 = 0;
  let cw = iw;
  let ch = ih;
  if (pctx) {
    const ps = Math.min(1, 512 / Math.max(iw, ih));
    const sw = Math.max(1, Math.round(iw * ps));
    const sh = Math.max(1, Math.round(ih * ps));
    const small = document.createElement('canvas');
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    if (sctx) {
      sctx.drawImage(img, 0, 0, sw, sh);
      const d = sctx.getImageData(0, 0, sw, sh).data;
      const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(fill);
      const transparentBg = !m;
      const br = m ? +m[1] : 0;
      const bg = m ? +m[2] : 0;
      const bb = m ? +m[3] : 0;
      const colCount = new Int32Array(sw);
      const rowCount = new Int32Array(sh);
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const o = (y * sw + x) * 4;
          const fg = transparentBg
            ? d[o + 3] > 32
            : (d[o] - br) ** 2 + (d[o + 1] - bg) ** 2 + (d[o + 2] - bb) ** 2 > 30 * 30;
          if (fg) {
            colCount[x]++;
            rowCount[y]++;
          }
        }
      }
      // Ignore specks: a row/column must hold a few foreground pixels.
      const minHits = 2;
      let x0 = 0, x1 = sw - 1, y0 = 0, y1 = sh - 1;
      while (x0 < sw && colCount[x0] < minHits) x0++;
      while (x1 > x0 && colCount[x1] < minHits) x1--;
      while (y0 < sh && rowCount[y0] < minHits) y0++;
      while (y1 > y0 && rowCount[y1] < minHits) y1--;
      if (x1 - x0 > sw * 0.05 && y1 - y0 > sh * 0.05) {
        const margin = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
        x0 = Math.max(0, x0 - margin);
        y0 = Math.max(0, y0 - margin);
        x1 = Math.min(sw - 1, x1 + margin);
        y1 = Math.min(sh - 1, y1 + margin);
        cx0 = x0 / ps;
        cy0 = y0 / ps;
        cw = (x1 - x0 + 1) / ps;
        ch = (y1 - y0 + 1) / ps;
      }
    }
  }

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size, size);
  const scale = Math.min(size / cw, size / ch);
  const dw = cw * scale;
  const dh = ch * scale;
  ctx.drawImage(img, cx0, cy0, cw, ch, (size - dw) / 2, (size - dh) / 2, dw, dh);
  return { x: cx0, y: cy0, w: cw, h: ch, iw, ih };

}

export function loadLayerMap(
  img: HTMLImageElement,
  crop: TensorCrop | null
): LayerMapBuffers | null {
  const offsets = new Float32Array(TENSOR_LEN).fill(NaN);
  const soft = new Uint8Array(TENSOR_LEN);
  const classIds = new Int8Array(TENSOR_LEN).fill(-1);
  const size = TENSOR;
  const mw = img.naturalWidth || img.width;
  const mh = img.naturalHeight || img.height;
  // The map may be saved at another resolution than the picture: scale the crop.
  const c = crop
    ? {
        x: (crop.x * mw) / crop.iw,
        y: (crop.y * mh) / crop.ih,
        w: (crop.w * mw) / crop.iw,
        h: (crop.h * mh) / crop.ih,
      }
    : { x: 0, y: 0, w: mw, h: mh };
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  const scale = Math.min(size / c.w, size / c.h);
  const dw = c.w * scale;
  const dh = c.h * scale;
  ctx.drawImage(img, c.x, c.y, c.w, c.h, (size - dw) / 2, (size - dh) / 2, dw, dh);
  layerMapToOffsets(ctx.getImageData(0, 0, size, size).data, offsets, soft, classIds);
  return { offset: offsets, soft, classIds };
}

/** Espeja la imagen en horizontal (la espalda se guarda alineada con el frente). */
function mirrorImageDataX(src: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < TENSOR; y++) {
    for (let x = 0; x < TENSOR; x++) {
      const s = (y * TENSOR + (TENSOR - 1 - x)) * 4;
      const d = (y * TENSOR + x) * 4;
      out[d] = src[s];
      out[d + 1] = src[s + 1];
      out[d + 2] = src[s + 2];
      out[d + 3] = src[s + 3];
    }
  }
  return out;
}

/**
 * De los píxeles de una vista (256x256 ya recortada) a todo lo que el molde
 * humano necesita: color, silueta, relieve, normales y color sin fondo.
 */
export function prepareView(
  source: Uint8ClampedArray,
  mirrorX: boolean,
  cut: CutoutSettings = DEFAULT_CUTOUT
): ViewTensors {
  const w = TENSOR;
  const h = TENSOR;
  const imgData = mirrorX ? mirrorImageDataX(source) : source;

  const rgbInput = new Float32Array(TENSOR_LEN * 3);
  const alphaInput = new Float32Array(TENSOR_LEN);
  const luminance = new Float32Array(TENSOR_LEN);
  const convGradX = new Float32Array(TENSOR_LEN);
  const convGradY = new Float32Array(TENSOR_LEN);
  const convLaplacian = new Float32Array(TENSOR_LEN);
  const blurTemp = new Float32Array(TENSOR_LEN);
  const lowFreqVolume = new Float32Array(TENSOR_LEN);
  const rawCnnDepth = new Float32Array(TENSOR_LEN);
  const exteriorBgMask = new Uint8Array(TENSOR_LEN);
  const candidateBgMask = new Uint8Array(TENSOR_LEN);
  const floodVisited = new Uint8Array(TENSOR_LEN);
  const floodQueue = new Int32Array(TENSOR_LEN);
  const morphTempMask = new Uint8Array(TENSOR_LEN);
  const texelCutoutMask = new Uint8Array(TENSOR_LEN).fill(1);
  const slopeP = new Float32Array(TENSOR_LEN);
  const slopeQ = new Float32Array(TENSOR_LEN);
  const normalTensor = new Float32Array(TENSOR_LEN * 3);
  const frontInpaintedRgb = new Float32Array(TENSOR_LEN * 3);
  const nearestFgTexelIdx = new Int32Array(TENSOR_LEN);
  const zone = new Uint8Array(TENSOR_LEN);
  // El bloque portado escribe aquí el color de fondo que detecta.
  const buffers = {
    autoDetectedBgR: 0.047,
    autoDetectedBgG: 0.071,
    autoDetectedBgB: 0.125,
    autoDetectedBgHex: '#0c1220',
  };

  // --- Color, fondo exterior y relieve (portado de runCNNReconstructionPipeline) ---
  {
  for (let i = 0; i < TENSOR_LEN; i++) {
    const i4 = i * 4;
    const i3 = i * 3;
    const r = imgData[i4] / 255;
    const g = imgData[i4 + 1] / 255;
    const b = imgData[i4 + 2] / 255;
    const a = imgData[i4 + 3] / 255;

    rgbInput[i3] = r;
    rgbInput[i3 + 1] = g;
    rgbInput[i3 + 2] = b;
    alphaInput[i] = a;
  }

  // Automatically sample the 4 outer corners (8x8 patches) to detect background frame color
  let bgSumR = 0;
  let bgSumG = 0;
  let bgSumB = 0;
  let bgCount = 0;
  const cornerCoords = [
    [2, 2],
    [w - 10, 2],
    [2, h - 10],
    [w - 10, h - 10],
  ];
  for (let c = 0; c < 4; c++) {
    const startX = cornerCoords[c][0];
    const startY = cornerCoords[c][1];
    for (let dy = 0; dy < 8; dy++) {
      for (let dx = 0; dx < 8; dx++) {
        const idx = (startY + dy) * w + (startX + dx);
        if (alphaInput[idx] < 0.2) continue;
        const idx3 = idx * 3;
        bgSumR += rgbInput[idx3];
        bgSumG += rgbInput[idx3 + 1];
        bgSumB += rgbInput[idx3 + 2];
        bgCount++;
      }
    }
  }
  if (bgCount > 0) {
    buffers.autoDetectedBgR = bgSumR / bgCount;
    buffers.autoDetectedBgG = bgSumG / bgCount;
    buffers.autoDetectedBgB = bgSumB / bgCount;
    const cr = Math.min(255, Math.max(0, Math.round(buffers.autoDetectedBgR * 255)));
    const cg = Math.min(255, Math.max(0, Math.round(buffers.autoDetectedBgG * 255)));
    const cb = Math.min(255, Math.max(0, Math.round(buffers.autoDetectedBgB * 255)));
    buffers.autoDetectedBgHex =
      '#' +
      cr.toString(16).padStart(2, '0') +
      cg.toString(16).padStart(2, '0') +
      cb.toString(16).padStart(2, '0');
  }

  const bgR = buffers.autoDetectedBgR;
  const bgG = buffers.autoDetectedBgG;
  const bgB = buffers.autoDetectedBgB;
  const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
  const isLightBackground = bgLum > 0.46;

  // Flood-fill exterior background from the 4 outer edges using color similarity to corner background (Zero-GC)
  exteriorBgMask.fill(0);
  let qHead = 0;
  let qTail = 0;
  const extColorTolSq = isLightBackground ? 0.085 : 0.045;

  const trySeedExterior = (idx: number) => {
    if (exteriorBgMask[idx] === 1) return;
    if (alphaInput[idx] < 0.15) {
      exteriorBgMask[idx] = 1;
      floodQueue[qTail++] = idx;
      return;
    }
    const i3 = idx * 3;
    const dr = rgbInput[i3] - bgR;
    const dg = rgbInput[i3 + 1] - bgG;
    const db = rgbInput[i3 + 2] - bgB;
    if (dr * dr + dg * dg + db * db <= extColorTolSq) {
      exteriorBgMask[idx] = 1;
      floodQueue[qTail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    trySeedExterior(x);
    trySeedExterior((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    trySeedExterior(y * w);
    trySeedExterior(y * w + (w - 1));
  }

  while (qHead < qTail) {
    const curr = floodQueue[qHead++];
    const cx = curr % w;
    const cy = (curr / w) | 0;

    if (cx > 0) trySeedExterior(curr - 1);
    if (cx < w - 1) trySeedExterior(curr + 1);
    if (cy > 0) trySeedExterior(curr - w);
    if (cy < h - 1) trySeedExterior(curr + w);
  }

  // Compute foreground-aware luminance/height signal so light/white backgrounds drop to 0.0
  // while dark armor/outlines inside the foreground subject retain solid positive depth!
  for (let i = 0; i < TENSOR_LEN; i++) {
    const a = alphaInput[i];
    if (a < 0.12 || exteriorBgMask[i] === 1) {
      luminance[i] = 0.0;
      continue;
    }
    const i3 = i * 3;
    const r = rgbInput[i3];
    const g = rgbInput[i3 + 1];
    const b = rgbInput[i3 + 2];
    const rawLum = (0.299 * r + 0.587 * g + 0.114 * b) * a;

    if (isLightBackground) {
      // En fondos claros/blancos, los píxeles interiores del sujeto ya están filtrados por exteriorBgMask === 0:
      // el relieve debe crecer monótonamente con la iluminación (rawLum) para que las zonas iluminadas sobresalgan
      // y los pliegues oscuros se hundan, sin invertir los tonos claros cercanos al blanco.
      const dr = r - bgR;
      const dg = g - bgG;
      const db = b - bgB;
      const bgDist = Math.min(1.0, Math.sqrt((dr * dr + dg * dg + db * db) * 4.5));
      const edgeFeather = bgDist * bgDist * (3.0 - 2.0 * bgDist);
      luminance[i] = (0.34 + 0.66 * rawLum * (0.65 + 0.35 * edgeFeather)) * a;
    } else {
      // On a dark background, ensure interior foreground pixels keep a minimum base volume so internal dark details never vanish
      luminance[i] = Math.max(0.24 * a, rawLum);
    }
  }

  const kernel5 = [0.0625, 0.25, 0.375, 0.25, 0.0625];
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? luminance : lowFreqVolume;
    for (let y = 0; y < h; y++) {
      const rowOffset = y * w;
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -2; k <= 2; k++) {
          const sx = Math.min(w - 1, Math.max(0, x + k));
          sum += src[rowOffset + sx] * kernel5[k + 2];
        }
        blurTemp[rowOffset + x] = sum;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -2; k <= 2; k++) {
          const sy = Math.min(h - 1, Math.max(0, y + k));
          sum += blurTemp[sy * w + x] * kernel5[k + 2];
        }
        lowFreqVolume[y * w + x] = sum;
      }
    }
  }

  let maxDepth = 1e-5;
  for (let y = 0; y < h; y++) {
    const ym1 = Math.max(0, y - 1) * w;
    const y0 = y * w;
    const yp1 = Math.min(h - 1, y + 1) * w;

    for (let x = 0; x < w; x++) {
      const xm1 = Math.max(0, x - 1);
      const xp1 = Math.min(w - 1, x + 1);

      const tl = luminance[ym1 + xm1];
      const tc = luminance[ym1 + x];
      const tr = luminance[ym1 + xp1];
      const ml = luminance[y0 + xm1];
      const mc = luminance[y0 + x];
      const mr = luminance[y0 + xp1];
      const bl = luminance[yp1 + xm1];
      const bc = luminance[yp1 + x];
      const br = luminance[yp1 + xp1];

      const gx = (3 * tr + 10 * mr + 3 * br - (3 * tl + 10 * ml + 3 * bl)) / 16;
      const gy = (3 * bl + 10 * bc + 3 * br - (3 * tl + 10 * tc + 3 * tr)) / 16;
      const lap =
        mc * 4.0 - (tc + bc + ml + mr) * 0.7 - (tl + tr + bl + br) * 0.3;

      const idx = y0 + x;
      convGradX[idx] = gx;
      convGradY[idx] = gy;
      const activeLap = lap > 0 ? lap : lap * 0.15;
      convLaplacian[idx] = activeLap;

      if (exteriorBgMask[idx] === 1) {
        rawCnnDepth[idx] = 0.0;
      } else {
        const fused =
          0.52 * lowFreqVolume[idx] +
          0.36 * mc +
          0.12 * Math.min(1.0, Math.abs(activeLap) * 2.0);
        rawCnnDepth[idx] = fused;
        if (fused > maxDepth) maxDepth = fused;
      }
    }
  }

  const invMax = 1.0 / maxDepth;
  for (let i = 0; i < TENSOR_LEN; i++) {
    rawCnnDepth[i] =
      exteriorBgMask[i] === 1
        ? 0.0
        : Math.max(0.18, Math.min(1, rawCnnDepth[i] * invMax));
  }
  }

  // --- Normales y pendientes del relieve ---
  // En Vortex3D venían del solucionador de Poisson; aquí se sacan directamente
  // del gradiente del relieve, que es para lo que el recorte las usa (detectar
  // zonas planas) y lo que el mapa de normales representa.
  const SLOPE_GAIN = 2.4 * 1.45;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const xm = y * w + Math.max(0, x - 1);
      const xp = y * w + Math.min(w - 1, x + 1);
      const ym = Math.max(0, y - 1) * w + x;
      const yp = Math.min(h - 1, y + 1) * w + x;
      const dzdx = (rawCnnDepth[xp] - rawCnnDepth[xm]) * 0.5 * SLOPE_GAIN;
      const dzdy = (rawCnnDepth[yp] - rawCnnDepth[ym]) * 0.5 * SLOPE_GAIN;
      slopeP[i] = -dzdx;
      slopeQ[i] = -dzdy;
      const len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
      const i3 = i * 3;
      normalTensor[i3] = -dzdx / len;
      normalTensor[i3 + 1] = -dzdy / len;
      normalTensor[i3 + 2] = 1 / len;
    }
  }

  // --- Recorte de la silueta (portado de evaluateBackgroundCutoutMask) ---
  const depthTensor = rawCnnDepth;
  const params = {
    cutoutMode: CUTOUT_FLAT_RELIEF_AND_BORDER,
    cutoutBorderMargin: cut.borderMargin,
    cutoutFlatThreshold: cut.flatThreshold,
    cutoutColorTolerance: cut.colorTolerance,
    cutoutHueTolerance: cut.hueTolerance,
    cutoutTargetColorHex: buffers.autoDetectedBgHex,
    matchByHueTone: cut.matchByHueTone,
    invertCutout: false,
    closeInternalHoles: cut.closeInternalHoles,
    holeFillRadius: cut.holeFillRadius,
  };
  {

  const mode = params.cutoutMode || CUTOUT_NONE;
  const borderMargin = Math.max(0, Math.min(0.48, params.cutoutBorderMargin || 0));
  const flatThreshold = Math.max(0, Math.min(0.65, params.cutoutFlatThreshold || 0));
  const colorTol = Math.max(0.01, Math.min(0.85, params.cutoutColorTolerance || 0.22));
  const colorTolSq = colorTol * colorTol * 3.0; // Normalized across 3 RGB channels
  const hueTol = Math.max(0.01, Math.min(0.5, params.cutoutHueTolerance || 0.14));

  let targetR = buffers.autoDetectedBgR;
  let targetG = buffers.autoDetectedBgG;
  let targetB = buffers.autoDetectedBgB;

  if (mode === CUTOUT_CUSTOM_COLOR_HUE) {
    const parsed = parseHexToRGBNormalized(params.cutoutTargetColorHex || '#0c1220');
    targetR = parsed[0];
    targetG = parsed[1];
    targetB = parsed[2];
  }

  computeHSLInPlace(targetR, targetG, targetB);
  const targetH = _hslH;
  const targetS = _hslS;
  const targetL = _hslL;

  const maxRadiusNorm = 1.0 - borderMargin;
  const maxRadiusSq = maxRadiusNorm * maxRadiusNorm;

  // Step 1: Classify candidate foreground (1) vs candidate background (0) in candidateBgMask (1 = background candidate)
  for (let ty = 0; ty < h; ty++) {
    const ny = (ty / (h - 1)) * 2.0 - 1.0; // -1 to +1
    const rowOffset = ty * w;

    for (let tx = 0; tx < w; tx++) {
      const nx = (tx / (w - 1)) * 2.0 - 1.0; // -1 to +1
      const i = rowOffset + tx;

      // 1. Always discard transparent alpha pixels from uploaded PNGs
      if (alphaInput[i] < 0.12) {
        candidateBgMask[i] = 1;
        texelCutoutMask[i] = 0;
        continue;
      }

      // 2. Outer Frame / Radial Margin Cutout (removes outer flat frame corners/border)
      const rSq = nx * nx + ny * ny;
      if (borderMargin > 0.002 && rSq > maxRadiusSq) {
        candidateBgMask[i] = 1;
        texelCutoutMask[i] = 0;
        continue;
      }

      if (mode === CUTOUT_NONE) {
        candidateBgMask[i] = 0;
        texelCutoutMask[i] = 1;
        continue;
      }

      const d = depthTensor[i];
      const p = slopeP[i];
      const q = slopeQ[i];
      const slopeMagSq = p * p + q * q;

      const i3 = i * 3;
      const pr = rgbInput[i3];
      const pg = rgbInput[i3 + 1];
      const pb = rgbInput[i3 + 2];

      if (mode === CUTOUT_FLAT_RELIEF_AND_BORDER) {
        // Check both flat relief depth AND similarity to auto-detected corner background color (handles white, light, or dark backgrounds!)
        const drBg = pr - buffers.autoDetectedBgR;
        const dgBg = pg - buffers.autoDetectedBgG;
        const dbBg = pb - buffers.autoDetectedBgB;
        const distSqAutoBg = drBg * drBg + dgBg * dgBg + dbBg * dbBg;
        const autoBgTolSq = Math.max(0.025, flatThreshold * 1.45) * 0.45;

        const isOuterFlatZone =
          exteriorBgMask[i] === 1 ||
          (distSqAutoBg <= autoBgTolSq && slopeMagSq < 0.24) ||
          (d <= flatThreshold && (slopeMagSq < 0.14 || rSq > 0.68));
        const isOutsideDefaultMedallion =
          rSq > 0.92 && (d <= flatThreshold + 0.08 || distSqAutoBg <= autoBgTolSq * 1.5);

        let keep = !(isOuterFlatZone || isOutsideDefaultMedallion);
        if (params.invertCutout) keep = !keep;
        candidateBgMask[i] = keep ? 0 : 1;
        texelCutoutMask[i] = keep ? 1 : 0;
        continue;
      }

      // Color / Hue Tone Matching (for AutoCornerColor and CustomColorAndHue)
      let matchesColorOrTone = false;

      if (params.matchByHueTone) {
        computeHSLInPlace(pr, pg, pb);
        const pixH = _hslH;
        const pixS = _hslS;
        const pixL = _hslL;

        if (targetS < 0.14) {
          // Target is dark/gray/white achromatic tone: match low saturation & similar luminance
          matchesColorOrTone =
            pixS < 0.24 + hueTol * 0.55 &&
            Math.abs(pixL - targetL) <= colorTol * 0.9;
        } else {
          // Chromatic tone: match angular Hue distance + reasonable saturation
          const rawDiff = Math.abs(pixH - targetH);
          const angularHueDiff = rawDiff > 0.5 ? 1.0 - rawDiff : rawDiff;
          matchesColorOrTone =
            angularHueDiff <= hueTol &&
            pixS >= Math.max(0.05, targetS - colorTol * 0.75) &&
            Math.abs(pixL - targetL) <= Math.max(0.28, colorTol);
        }
      } else {
        // Euclidean squared RGB distance (Zero Math.sqrt)
        const dr = pr - targetR;
        const dg = pg - targetG;
        const db = pb - targetB;
        const distSq = dr * dr + dg * dg + db * db;
        matchesColorOrTone = distSq <= colorTolSq;
      }

      const isFlatBg = flatThreshold > 0.01 && d <= flatThreshold && slopeMagSq < 0.1;

      let keep = !(matchesColorOrTone || isFlatBg);
      if (params.invertCutout) {
        keep = matchesColorOrTone && !isFlatBg;
      }
      candidateBgMask[i] = keep ? 0 : 1;
      texelCutoutMask[i] = keep ? 1 : 0;
    }
  }

  // Step 2: Close Internal Holes & Bridge Separated Zones (Zero-GC)
  const closeInternal = params.closeInternalHoles !== false;
  const fillRadius = Math.max(0, Math.min(12, Math.round(params.holeFillRadius ?? 4)));

  if (mode !== CUTOUT_NONE && closeInternal) {
    // 2A. Flood-fill background ONLY from the outer border through candidateBgMask === 1
    // This prevents dark shadows or armor lines inside the character from ever turning into gaping holes!
    floodVisited.fill(0);
    let qHead = 0;
    let qTail = 0;

    for (let i = 0; i < TENSOR_LEN; i++) {
      const tx = i % w;
      const ty = (i / w) | 0;
      const nx = (tx / (w - 1)) * 2.0 - 1.0;
      const ny = (ty / (h - 1)) * 2.0 - 1.0;
      const onOuterBorder =
        tx === 0 ||
        tx === w - 1 ||
        ty === 0 ||
        ty === h - 1 ||
        (borderMargin > 0.002 && nx * nx + ny * ny >= maxRadiusSq * 0.96);

      if (onOuterBorder && candidateBgMask[i] === 1) {
        floodVisited[i] = 1;
        floodQueue[qTail++] = i;
      }
    }

    while (qHead < qTail) {
      const curr = floodQueue[qHead++];
      const cx = curr % w;
      const cy = (curr / w) | 0;

      if (cx > 0) {
        const n = curr - 1;
        if (floodVisited[n] === 0 && candidateBgMask[n] === 1) {
          floodVisited[n] = 1;
          floodQueue[qTail++] = n;
        }
      }
      if (cx < w - 1) {
        const n = curr + 1;
        if (floodVisited[n] === 0 && candidateBgMask[n] === 1) {
          floodVisited[n] = 1;
          floodQueue[qTail++] = n;
        }
      }
      if (cy > 0) {
        const n = curr - w;
        if (floodVisited[n] === 0 && candidateBgMask[n] === 1) {
          floodVisited[n] = 1;
          floodQueue[qTail++] = n;
        }
      }
      if (cy < h - 1) {
        const n = curr + w;
        if (floodVisited[n] === 0 && candidateBgMask[n] === 1) {
          floodVisited[n] = 1;
          floodQueue[qTail++] = n;
        }
      }
    }

    // 2A-bis. Also punch out large enclosed background windows (e.g. enclosed negative space >= 48 px
    // whose RGB strictly matches the detected background), without ever punching out eyes, teeth, or highlights.
    const bgMatchVisited = new Uint8Array(TENSOR_LEN);
    const compIndices: number[] = [];
    for (let i = 0; i < TENSOR_LEN; i++) {
      if (floodVisited[i] === 1 || bgMatchVisited[i] === 1 || candidateBgMask[i] === 0) continue;
      const i3 = i * 3;
      const dr = rgbInput[i3] - targetR;
      const dg = rgbInput[i3 + 1] - targetG;
      const db = rgbInput[i3 + 2] - targetB;
      if (dr * dr + dg * dg + db * db > 0.012) continue;

      compIndices.length = 0;
      bgMatchVisited[i] = 1;
      compIndices.push(i);
      let cHead = 0;
      while (cHead < compIndices.length) {
        const curr = compIndices[cHead++];
        const cx = curr % w;
        const cy = (curr / w) | 0;
        const nbs = [
          cx > 0 ? curr - 1 : -1,
          cx < w - 1 ? curr + 1 : -1,
          cy > 0 ? curr - w : -1,
          cy < h - 1 ? curr + w : -1,
        ];
        for (let k = 0; k < 4; k++) {
          const nb = nbs[k];
          if (nb < 0 || floodVisited[nb] === 1 || bgMatchVisited[nb] === 1 || candidateBgMask[nb] === 0) continue;
          const nb3 = nb * 3;
          const ndr = rgbInput[nb3] - targetR;
          const ndg = rgbInput[nb3 + 1] - targetG;
          const ndb = rgbInput[nb3 + 2] - targetB;
          if (ndr * ndr + ndg * ndg + ndb * ndb <= 0.016) {
            bgMatchVisited[nb] = 1;
            compIndices.push(nb);
          }
        }
      }
      if (compIndices.length >= 48) {
        for (let k = 0; k < compIndices.length; k++) {
          const idx = compIndices[k];
          floodVisited[idx] = 1;
          exteriorBgMask[idx] = 1;
        }
      }
    }

    for (let i = 0; i < TENSOR_LEN; i++) {
      texelCutoutMask[i] = floodVisited[i] === 1 ? 0 : 1;
    }
  }

  // 2B. Morphological Closing (Dilation + Interior Fill + Erosion) to fuse separated zones & eliminate gaps
  if (mode !== CUTOUT_NONE && fillRadius > 0) {
    // Horizontal Dilation (texelCutoutMask -> morphTempMask)
    for (let ty = 0; ty < h; ty++) {
      const rowOff = ty * w;
      for (let tx = 0; tx < w; tx++) {
        const x0 = Math.max(0, tx - fillRadius);
        const x1 = Math.min(w - 1, tx + fillRadius);
        let anyFg = 0;
        for (let sx = x0; sx <= x1; sx++) {
          if (texelCutoutMask[rowOff + sx] === 1) {
            anyFg = 1;
            break;
          }
        }
        morphTempMask[rowOff + tx] = anyFg;
      }
    }
    // Vertical Dilation (morphTempMask -> texelCutoutMask)
    for (let ty = 0; ty < h; ty++) {
      const y0 = Math.max(0, ty - fillRadius);
      const y1 = Math.min(h - 1, ty + fillRadius);
      const rowOff = ty * w;
      for (let tx = 0; tx < w; tx++) {
        let anyFg = 0;
        for (let sy = y0; sy <= y1; sy++) {
          if (morphTempMask[sy * w + tx] === 1) {
            anyFg = 1;
            break;
          }
        }
        texelCutoutMask[rowOff + tx] = anyFg;
      }
    }

    // Horizontal Erosion (texelCutoutMask -> morphTempMask)
    for (let ty = 0; ty < h; ty++) {
      const rowOff = ty * w;
      for (let tx = 0; tx < w; tx++) {
        if (tx === 0 || tx === w - 1 || ty === 0 || ty === h - 1) {
          morphTempMask[rowOff + tx] = texelCutoutMask[rowOff + tx];
          continue;
        }
        const x0 = Math.max(0, tx - fillRadius);
        const x1 = Math.min(w - 1, tx + fillRadius);
        let allFg = 1;
        for (let sx = x0; sx <= x1; sx++) {
          if (texelCutoutMask[rowOff + sx] === 0) {
            allFg = 0;
            break;
          }
        }
        morphTempMask[rowOff + tx] = allFg;
      }
    }
    // Vertical Erosion (morphTempMask -> texelCutoutMask)
    for (let ty = 0; ty < h; ty++) {
      const y0 = Math.max(0, ty - fillRadius);
      const y1 = Math.min(h - 1, ty + fillRadius);
      const rowOff = ty * w;
      for (let tx = 0; tx < w; tx++) {
        const nx = (tx / (w - 1)) * 2.0 - 1.0;
        const ny = (ty / (h - 1)) * 2.0 - 1.0;
        if (borderMargin > 0.002 && nx * nx + ny * ny > maxRadiusSq) {
          texelCutoutMask[rowOff + tx] = 0;
          continue;
        }
        let allFg = 1;
        for (let sy = y0; sy <= y1; sy++) {
          if (morphTempMask[sy * w + tx] === 0) {
            allFg = 0;
            break;
          }
        }
        texelCutoutMask[rowOff + tx] = allFg;
      }
    }

    // Keep only the main connected foreground subject (removes stray disconnected background scraps in corners)
    if (closeInternal) {
      floodVisited.fill(0);
      let qHead = 0;
      let qTail = 0;
      const cMinX = Math.floor(w * 0.25);
      const cMaxX = Math.floor(w * 0.75);
      const cMinY = Math.floor(h * 0.22);
      const cMaxY = Math.floor(h * 0.78);

      for (let ty = cMinY; ty <= cMaxY; ty++) {
        const rOff = ty * w;
        for (let tx = cMinX; tx <= cMaxX; tx++) {
          const idx = rOff + tx;
          if (texelCutoutMask[idx] === 1) {
            floodVisited[idx] = 1;
            floodQueue[qTail++] = idx;
          }
        }
      }

      if (qTail > 0) {
        while (qHead < qTail) {
          const curr = floodQueue[qHead++];
          const cx = curr % w;
          const cy = (curr / w) | 0;

          if (cx > 0) {
            const n = curr - 1;
            if (floodVisited[n] === 0 && texelCutoutMask[n] === 1) {
              floodVisited[n] = 1;
              floodQueue[qTail++] = n;
            }
          }
          if (cx < w - 1) {
            const n = curr + 1;
            if (floodVisited[n] === 0 && texelCutoutMask[n] === 1) {
              floodVisited[n] = 1;
              floodQueue[qTail++] = n;
            }
          }
          if (cy > 0) {
            const n = curr - w;
            if (floodVisited[n] === 0 && texelCutoutMask[n] === 1) {
              floodVisited[n] = 1;
              floodQueue[qTail++] = n;
            }
          }
          if (cy < h - 1) {
            const n = curr + w;
            if (floodVisited[n] === 0 && texelCutoutMask[n] === 1) {
              floodVisited[n] = 1;
              floodQueue[qTail++] = n;
            }
          }
        }

        for (let i = 0; i < TENSOR_LEN; i++) {
          texelCutoutMask[i] = floodVisited[i];
        }
      }
    }
  }
  }

  // --- Relleno de color hacia el contorno (Voronoï, portado tal cual) ---
  {
  nearestFgTexelIdx.fill(-1);
  let qHead = 0;
  let qTail = 0;
  const bgR = buffers.autoDetectedBgR;
  const bgG = buffers.autoDetectedBgG;
  const bgB = buffers.autoDetectedBgB;

  for (let ty = 2; ty < h - 2; ty++) {
    const rOff = ty * w;
    for (let tx = 2; tx < w - 2; tx++) {
      const idx = rOff + tx;
      if (
        texelCutoutMask[idx] === 1 &&
        exteriorBgMask[idx] === 0 &&
        candidateBgMask[idx] === 0 &&
        exteriorBgMask[idx - 1] === 0 &&
        exteriorBgMask[idx + 1] === 0 &&
        exteriorBgMask[idx - w] === 0 &&
        exteriorBgMask[idx + w] === 0 &&
        candidateBgMask[idx - 1] === 0 &&
        candidateBgMask[idx + 1] === 0 &&
        candidateBgMask[idx - w] === 0 &&
        candidateBgMask[idx + w] === 0
      ) {
        const i3 = idx * 3;
        const r = rgbInput[i3];
        const g = rgbInput[i3 + 1];
        const b = rgbInput[i3 + 2];
        const dr = r - bgR;
        const dg = g - bgG;
        const db = b - bgB;
        if (dr * dr + dg * dg + db * db <= 0.022) continue;

        // Si el píxel está a <= 3 px del fondo exterior, evitar usar trazos negros de contorno 2D
        // como semilla Voronoï para que nunca se estiren bandas negras por el borde del modelo 3D.
        let nearBorder = false;
        for (let dy = -3; dy <= 3 && !nearBorder; dy++) {
          const ny = Math.min(h - 1, Math.max(0, ty + dy)) * w;
          for (let dx = -3; dx <= 3; dx++) {
            const ni = ny + Math.min(w - 1, Math.max(0, tx + dx));
            if (exteriorBgMask[ni] === 1 || texelCutoutMask[ni] === 0) {
              nearBorder = true;
              break;
            }
          }
        }
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (nearBorder && lum < 0.24) continue;

        nearestFgTexelIdx[idx] = idx;
        floodQueue[qTail++] = idx;
      }
    }
  }

  // Fallback for ultra-thin line art or full-frame textures
  if (qTail < 32) {
    qTail = 0;
    for (let i = 0; i < TENSOR_LEN; i++) {
      if (texelCutoutMask[i] === 1 && exteriorBgMask[i] === 0) {
        nearestFgTexelIdx[i] = i;
        floodQueue[qTail++] = i;
      }
    }
  }
  if (qTail === 0) {
    for (let i = 0; i < TENSOR_LEN; i++) {
      nearestFgTexelIdx[i] = i;
    }
  } else {
    while (qHead < qTail) {
      const curr = floodQueue[qHead++];
      const seedIdx = nearestFgTexelIdx[curr];
      const cx = curr % w;
      const cy = (curr / w) | 0;

      if (cx > 0) {
        const n = curr - 1;
        if (nearestFgTexelIdx[n] === -1) {
          nearestFgTexelIdx[n] = seedIdx;
          floodQueue[qTail++] = n;
        }
      }
      if (cx < w - 1) {
        const n = curr + 1;
        if (nearestFgTexelIdx[n] === -1) {
          nearestFgTexelIdx[n] = seedIdx;
          floodQueue[qTail++] = n;
        }
      }
      if (cy > 0) {
        const n = curr - w;
        if (nearestFgTexelIdx[n] === -1) {
          nearestFgTexelIdx[n] = seedIdx;
          floodQueue[qTail++] = n;
        }
      }
      if (cy < h - 1) {
        const n = curr + w;
        if (nearestFgTexelIdx[n] === -1) {
          nearestFgTexelIdx[n] = seedIdx;
          floodQueue[qTail++] = n;
        }
      }
    }
  }

  // Populate frontInpaintedRgb and smoothly bridge depthTensor across united gaps/joints
  for (let i = 0; i < TENSOR_LEN; i++) {
    const seedIdx = nearestFgTexelIdx[i] >= 0 ? nearestFgTexelIdx[i] : i;
    const i3 = i * 3;
    const s3 = seedIdx * 3;
    frontInpaintedRgb[i3] = rgbInput[s3];
    frontInpaintedRgb[i3 + 1] = rgbInput[s3 + 1];
    frontInpaintedRgb[i3 + 2] = rgbInput[s3 + 2];

    // If this pixel is part of an active bridged union zone (where raw image had background),
    // inherit smooth volume from the nearest foreground seed so the joint is covered without trenches!
    if (
      texelCutoutMask[i] === 1 &&
      (exteriorBgMask[i] === 1 || candidateBgMask[i] === 1) &&
      seedIdx !== i
    ) {
      const seedDepth = depthTensor[seedIdx];
      if (depthTensor[i] < seedDepth * 0.85) {
        depthTensor[i] = seedDepth * 0.85;
      }
    }
  }

  // Smooth the inpainted border/joint pixels (where nearestFgTexelIdx[i] !== i) using a 3x3 neighborhood average
  // so adjacent image regions blend their colors organically across any joint!
  for (let ty = 1; ty < h - 1; ty++) {
    const rOff = ty * w;
    for (let tx = 1; tx < w - 1; tx++) {
      const idx = rOff + tx;
      if (nearestFgTexelIdx[idx] === idx) continue;
      let sr = 0.0;
      let sg = 0.0;
      let sb = 0.0;
      for (let dy = -1; dy <= 1; dy++) {
        const nr = (ty + dy) * w;
        for (let dx = -1; dx <= 1; dx++) {
          const n3 = (nr + tx + dx) * 3;
          sr += frontInpaintedRgb[n3];
          sg += frontInpaintedRgb[n3 + 1];
          sb += frontInpaintedRgb[n3 + 2];
        }
      }
      const i3 = idx * 3;
      frontInpaintedRgb[i3] = sr / 9.0;
      frontInpaintedRgb[i3 + 1] = sg / 9.0;
      frontInpaintedRgb[i3 + 2] = sb / 9.0;
    }
  }
  }

  // --- Recalcular mapa de normales desde el detalle local (paso alto) sin escalón de silueta ---
  // La malla 3D ya aporta el volumen curvo macroscópico y el reborde redondeado.
  // Si el normalMap incluyera la rampa global de silueta o el escalón hacia el fondo (0.0),
  // en la costura lateral (donde el eje tangente U invierte su sentido Z entre frente y espalda)
  // inclinaría las normales de delante hacia la luz y las de atrás hacia la sombra.
  {
    const detailLum = new Float32Array(TENSOR_LEN);
    const smoothLum = new Float32Array(TENSOR_LEN);
    for (let i = 0; i < TENSOR_LEN; i++) {
      const i3 = i * 3;
      detailLum[i] =
        0.299 * frontInpaintedRgb[i3] +
        0.587 * frontInpaintedRgb[i3 + 1] +
        0.114 * frontInpaintedRgb[i3 + 2];
    }
    const k5 = [0.0625, 0.25, 0.375, 0.25, 0.0625];
    for (let pass = 0; pass < 3; pass++) {
      const src = pass === 0 ? detailLum : smoothLum;
      for (let y = 0; y < h; y++) {
        const ro = y * w;
        for (let x = 0; x < w; x++) {
          let s = 0;
          for (let k = -2; k <= 2; k++) {
            const sx = Math.min(w - 1, Math.max(0, x + k));
            s += src[ro + sx] * k5[k + 2];
          }
          blurTemp[ro + x] = s;
        }
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let s = 0;
          for (let k = -2; k <= 2; k++) {
            const sy = Math.min(h - 1, Math.max(0, y + k));
            s += blurTemp[sy * w + x] * k5[k + 2];
          }
          smoothLum[y * w + x] = s;
        }
      }
    }
    const hpDetail = blurTemp;
    for (let i = 0; i < TENSOR_LEN; i++) {
      hpDetail[i] = detailLum[i] - smoothLum[i];
    }
    const DETAIL_GAIN = 2.6;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const i3 = i * 3;
        // Atenuar suavemente a normal neutra (0, 0, 1) cerca del borde de recorte
        let rimFade = 1.0;
        if (texelCutoutMask[i] === 0 || exteriorBgMask[i] === 1) {
          rimFade = 0.0;
        } else {
          for (let dy = -3; dy <= 3; dy++) {
            const ny = Math.min(h - 1, Math.max(0, y + dy));
            for (let dx = -3; dx <= 3; dx++) {
              const nx = Math.min(w - 1, Math.max(0, x + dx));
              const ni = ny * w + nx;
              if (texelCutoutMask[ni] === 0 || exteriorBgMask[ni] === 1) {
                const dist = Math.hypot(dx, dy);
                const f = Math.max(0, (dist - 1.0) / 2.5);
                if (f < rimFade) rimFade = f;
              }
            }
          }
        }
        if (rimFade <= 0.001) {
          normalTensor[i3] = 0;
          normalTensor[i3 + 1] = 0;
          normalTensor[i3 + 2] = 1;
          continue;
        }
        const xm = y * w + Math.max(0, x - 1);
        const xp = y * w + Math.min(w - 1, x + 1);
        const ym = Math.max(0, y - 1) * w + x;
        const yp = Math.min(h - 1, y + 1) * w + x;
        const dzdx = (hpDetail[xp] - hpDetail[xm]) * 0.5 * DETAIL_GAIN * rimFade;
        const dzdy = (hpDetail[yp] - hpDetail[ym]) * 0.5 * DETAIL_GAIN * rimFade;
        const len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
        normalTensor[i3] = -dzdx / len;
        normalTensor[i3 + 1] = -dzdy / len;
        normalTensor[i3 + 2] = 1 / len;
      }
    }
  }

  // --- Zonas PBR por texel (rugosidad y metalicidad), como en Vortex3D ---
  for (let i = 0; i < TENSOR_LEN; i++) {
    const d = depthTensor[i];
    const lapMag = Math.abs(convLaplacian[i]);
    if (lapMag > 0.18 && d > 0.22) zone[i] = 3;
    else if (d >= 0.58) zone[i] = 0;
    else if (d >= 0.26) zone[i] = 1;
    else zone[i] = 2;
  }

  return {
    rgb: rgbInput,
    alpha: alphaInput,
    exteriorBg: exteriorBgMask,
    candidateBg: candidateBgMask,
    cutout: texelCutoutMask,
    relief: rawCnnDepth,
    inpainted: frontInpaintedRgb,
    normal: normalTensor,
    zone,
    bg: [buffers.autoDetectedBgR, buffers.autoDetectedBgG, buffers.autoDetectedBgB],
    bgHex: buffers.autoDetectedBgHex,
  };
}

export interface HumanAtlas {
  albedo: Uint8Array;
  roughMetal: Uint8Array;
  normal: Uint8Array;
  atlasWidth: number;
}

/**
 * Monta el atlas de 512 que espera `humanBodyTemplate`:
 * - Filas 0..255: frente en columnas 0..255 y espalda en 256..511.
 * - Filas 256..511: perfil derecho en columnas 0..255 y perfil izquierdo en 256..511.
 * Sin vista de espalda, se reutiliza el frente (la espalda sale espejada).
 */
export function buildAtlas(
  front: ViewTensors,
  back: ViewTensors | null,
  metalMix = 1,
  frontLayer?: LayerMapBuffers | null,
  backLayer?: LayerMapBuffers | null,
  sideView?: ViewTensors | null,
  sideLeftView?: ViewTensors | null,
  sideLayer?: LayerMapBuffers | null,
  sideLeftLayer?: LayerMapBuffers | null
): HumanAtlas {
  const w = TENSOR;
  const h = TENSOR;
  const atlasW = ATLAS;
  const albedo = new Uint8Array(atlasW * atlasW * 4);
  const roughMetal = new Uint8Array(atlasW * atlasW * 4);
  const normal = new Uint8Array(atlasW * atlasW * 4);
  const b = back ?? front;
  const sRight = sideView ?? sideLeftView ?? front;
  const sLeft = sideLeftView ?? sideView ?? b;
  const mm = Math.max(0, Math.min(1, metalMix));

  const byte = (v: number) => Math.min(255, Math.max(0, Math.round(v * 255)));

  const applyLayerMaterial = (
    layerBuf: LayerMapBuffers | null | undefined,
    layerIdx: number,
    zId: number
  ): [number, number] => {
    let rough = ZONE_ROUGHNESS[zId];
    let metal = ZONE_METALNESS[zId] * mm;
    if (layerBuf?.classIds) {
      const cid = layerBuf.classIds[layerIdx];
      if (cid >= 0) {
        const cls = LAYER_CLASSES[cid]?.id;
        if (cls === 'cloth') {
          rough = 0.92;
          metal = 0.0;
        } else if (cls === 'skin') {
          rough = 0.72;
          metal = 0.0;
        } else if (cls === 'fur') {
          rough = 0.85;
          metal = 0.0;
        } else if (cls === 'leather') {
          rough = 0.62;
          metal = 0.06 * mm;
        } else if (cls === 'armor') {
          rough = 0.28;
          metal = 0.85 * mm;
        } else if (cls === 'spikes') {
          rough = 0.35;
          metal = 0.25 * mm;
        } else if (cls === 'hollow') {
          rough = 0.95;
          metal = 0.0;
        }
      }
    }
    return [rough, metal];
  };

  for (let ty = 0; ty < h; ty++) {
    const rowOffsetTop = ty * atlasW;
    const rowOffsetBot = (ty + h) * atlasW;
    for (let tx = 0; tx < w; tx++) {
      const texIdx = ty * w + tx;

      // Cuadrantes superiores (filas 0..255): Frente (side=0) y Espalda (side=1)
      for (let side = 0; side < 2; side++) {
        const view = side === 0 ? front : b;
        const srcIdx = side === 1 && !back ? ty * w + (w - 1 - tx) : texIdx;
        const s3 = srcIdx * 3;
        const zId = view.zone[srcIdx] & 3;
        const dst4 = (rowOffsetTop + (side === 1 ? w : 0) + tx) * 4;

        albedo[dst4] = byte(view.inpainted[s3]);
        albedo[dst4 + 1] = byte(view.inpainted[s3 + 1]);
        albedo[dst4 + 2] = byte(view.inpainted[s3 + 2]);
        albedo[dst4 + 3] = 255;

        const layerBuf = side === 0 ? frontLayer : backLayer;
        const layerIdx = side === 1 && back ? ty * w + (w - 1 - tx) : srcIdx;
        const [rough, metal] = applyLayerMaterial(layerBuf, layerIdx, zId);

        roughMetal[dst4] = 255;
        roughMetal[dst4 + 1] = byte(rough);
        roughMetal[dst4 + 2] = byte(metal);
        roughMetal[dst4 + 3] = 255;

        let nx = view.normal[s3];
        const ny = view.normal[s3 + 1];
        const nz = view.normal[s3 + 2];
        if (side === 1 && !back) nx = -nx;
        normal[dst4] = byte(nx * 0.5 + 0.5);
        normal[dst4 + 1] = byte(ny * 0.5 + 0.5);
        normal[dst4 + 2] = byte(nz * 0.5 + 0.5);
        normal[dst4 + 3] = 255;
      }

      // Cuadrantes inferiores (filas 256..511): Perfil Derecho (col 0..255) y Perfil Izquierdo (col 256..511)
      for (let pSide = 0; pSide < 2; pSide++) {
        const view = pSide === 0 ? sRight : sLeft;
        const mirrorFallback =
          (pSide === 0 && !sideView && Boolean(sideLeftView)) ||
          (pSide === 1 && !sideLeftView && Boolean(sideView));
        const srcIdx = mirrorFallback ? ty * w + (w - 1 - tx) : texIdx;
        const s3 = srcIdx * 3;
        const zId = view.zone[srcIdx] & 3;
        const dst4 = (rowOffsetBot + (pSide === 1 ? w : 0) + tx) * 4;

        albedo[dst4] = byte(view.inpainted[s3]);
        albedo[dst4 + 1] = byte(view.inpainted[s3 + 1]);
        albedo[dst4 + 2] = byte(view.inpainted[s3 + 2]);
        albedo[dst4 + 3] = 255;

        const layerBuf = pSide === 0 ? (sideLayer ?? sideLeftLayer) : (sideLeftLayer ?? sideLayer);
        const [rough, metal] = applyLayerMaterial(layerBuf, srcIdx, zId);

        roughMetal[dst4] = 255;
        roughMetal[dst4 + 1] = byte(rough);
        roughMetal[dst4 + 2] = byte(metal);
        roughMetal[dst4 + 3] = 255;

        let nx = view.normal[s3];
        const ny = view.normal[s3 + 1];
        const nz = view.normal[s3 + 2];
        if (mirrorFallback) nx = -nx;
        normal[dst4] = byte(nx * 0.5 + 0.5);
        normal[dst4 + 1] = byte(ny * 0.5 + 0.5);
        normal[dst4 + 2] = byte(nz * 0.5 + 0.5);
        normal[dst4 + 3] = 255;
      }
    }
  }

  return { albedo, roughMetal, normal, atlasWidth: atlasW };
}

/**
 * Extrae los tramos horizontales de silueta en una fila `y`, uniendo huecos
 * diminutos (<= 2 px) y descartando motas sueltas (< 3 px).
 */
function extractRowRuns(mask: Uint8Array, w: number, y: number): Array<[number, number]> {
  const raw: Array<[number, number]> = [];
  const ro = y * w;
  let x = 0;
  while (x < w) {
    while (x < w && mask[ro + x] === 0) x++;
    if (x >= w) break;
    const a = x;
    while (x < w && mask[ro + x] === 1) x++;
    raw.push([a, x - 1]);
  }
  if (raw.length === 0) return raw;
  const merged: Array<[number, number]> = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const prev = merged[merged.length - 1];
    if (raw[i][0] - prev[1] <= 3) {
      prev[1] = raw[i][1];
    } else {
      merged.push(raw[i]);
    }
  }
  const filtered = merged.filter(([a, b]) => b - a + 1 >= 3);
  return filtered.length > 0 ? filtered : merged;
}

/**
 * Alinea la vista de espalda (`backView` y opcionalmente `backLayer`) fila por fila
 * y tramo por tramo (cabeza, brazos, torso, piernas) con la silueta de frente (`frontView`).
 * Así, aunque el dibujo de espalda tenga los brazos o el cuerpo ligeramente desplazados
 * o más estrechos que el frente, la textura y el relieve traseros encajan exactamente
 * en el molde 3D sin meter fondo ni bandas oscuras en el borde lateral.
 */
export function alignBackViewToFront(
  front: ViewTensors,
  back: ViewTensors,
  frontLayer?: LayerMapBuffers | null,
  backLayer?: LayerMapBuffers | null
): { back: ViewTensors; backLayer: LayerMapBuffers | null } {
  const w = TENSOR;
  const h = TENSOR;

  const fMask = new Uint8Array(TENSOR_LEN);
  const bMask = new Uint8Array(TENSOR_LEN);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const fPainted = frontLayer ? Number.isFinite(frontLayer.offset[i]) : false;
      fMask[i] = front.cutout[i] === 1 || fPainted ? 1 : 0;
      const bmIdx = y * w + (w - 1 - x);
      const bPainted = backLayer ? Number.isFinite(backLayer.offset[bmIdx]) : false;
      bMask[i] = back.cutout[i] === 1 || bPainted ? 1 : 0;
    }
  }

  let fTop = h, fBottom = -1;
  let bTop = h, bBottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (fMask[y * w + x] === 1) {
        if (y < fTop) fTop = y;
        if (y > fBottom) fBottom = y;
      }
      if (bMask[y * w + x] === 1) {
        if (y < bTop) bTop = y;
        if (y > bBottom) bBottom = y;
      }
    }
  }

  if (fBottom < fTop || bBottom < bTop) {
    return { back, backLayer: backLayer ?? null };
  }

  const outInpainted = new Float32Array(back.inpainted);
  const outRgb = new Float32Array(back.rgb);
  const outRelief = new Float32Array(back.relief);
  const outNormal = new Float32Array(back.normal);
  const outZone = new Uint8Array(back.zone);
  const outCutout = new Uint8Array(back.cutout);

  const outLayer: LayerMapBuffers | null = backLayer
    ? {
        offset: new Float32Array(backLayer.offset),
        soft: new Uint8Array(backLayer.soft),
        classIds: new Int8Array(backLayer.classIds),
      }
    : null;

  const fSpan = Math.max(1, fBottom - fTop);
  const bSpan = Math.max(1, bBottom - bTop);

  for (let y = 0; y < h; y++) {
    const fRuns = extractRowRuns(fMask, w, y);
    if (fRuns.length === 0) continue;

    const byTarget = Math.max(
      bTop,
      Math.min(bBottom, Math.round(bTop + ((y - fTop) / fSpan) * bSpan))
    );

    let by = byTarget;
    let bRuns = extractRowRuns(bMask, w, by);
    if (bRuns.length === 0) {
      for (let dy = 1; dy <= 10; dy++) {
        if (byTarget - dy >= bTop) {
          bRuns = extractRowRuns(bMask, w, byTarget - dy);
          if (bRuns.length > 0) {
            by = byTarget - dy;
            break;
          }
        }
        if (byTarget + dy <= bBottom) {
          bRuns = extractRowRuns(bMask, w, byTarget + dy);
          if (bRuns.length > 0) {
            by = byTarget + dy;
            break;
          }
        }
      }
    }
    if (bRuns.length === 0) continue;

    for (let rIdx = 0; rIdx < fRuns.length; rIdx++) {
      const [fa, fb] = fRuns[rIdx];
      let ba: number;
      let bb: number;

      if (fRuns.length === bRuns.length) {
        [ba, bb] = bRuns[rIdx];
      } else if (bRuns.length === 1) {
        [ba, bb] = bRuns[0];
      } else {
        // Elegir el tramo trasero que más se solape o esté más cerca en X
        const fc = (fa + fb) * 0.5;
        let bestK = 0;
        let bestScore = -Infinity;
        for (let k = 0; k < bRuns.length; k++) {
          const [ka, kb] = bRuns[k];
          const overlap = Math.min(fb, kb) - Math.max(fa, ka);
          const dist = Math.abs((ka + kb) * 0.5 - fc);
          const score = overlap * 2 - dist;
          if (score > bestScore) {
            bestScore = score;
            bestK = k;
          }
        }
        [ba, bb] = bRuns[bestK];
      }

      const bWidth = Math.max(1, bb - ba);
      // Pequeño margen interior (hasta 2 px) para no muestrear el trazo de contorno exterior de la espalda
      const inset = bWidth >= 10 ? 2 : bWidth >= 5 ? 1 : 0;
      const baIn = ba + inset;
      const bbIn = bb - inset;
      const fWidth = Math.max(1, fb - fa);

      const xStart = Math.max(0, fa - 3);
      const xEnd = Math.min(w - 1, fb + 3);
      for (let x = xStart; x <= xEnd; x++) {
        const t = Math.max(0, Math.min(1, (x - fa) / fWidth));
        const bx = Math.round(baIn + t * Math.max(0, bbIn - baIn));
        const dstIdx = y * w + x;
        const srcIdx = by * w + bx;
        const dst3 = dstIdx * 3;
        const src3 = srcIdx * 3;

        outInpainted[dst3] = back.inpainted[src3];
        outInpainted[dst3 + 1] = back.inpainted[src3 + 1];
        outInpainted[dst3 + 2] = back.inpainted[src3 + 2];

        outRgb[dst3] = back.rgb[src3];
        outRgb[dst3 + 1] = back.rgb[src3 + 1];
        outRgb[dst3 + 2] = back.rgb[src3 + 2];

        outRelief[dstIdx] = back.relief[srcIdx];
        outZone[dstIdx] = back.zone[srcIdx];
        outCutout[dstIdx] = 1;

        outNormal[dst3] = back.normal[src3];
        outNormal[dst3 + 1] = back.normal[src3 + 1];
        outNormal[dst3 + 2] = back.normal[src3 + 2];

        if (outLayer && backLayer) {
          // backLayer está sin espejar en horizontal: la coordenada X es w - 1 - x
          const dstLayerIdx = y * w + (w - 1 - x);
          const srcLayerIdx = by * w + (w - 1 - bx);
          outLayer.offset[dstLayerIdx] = backLayer.offset[srcLayerIdx];
          outLayer.soft[dstLayerIdx] = backLayer.soft[srcLayerIdx];
          outLayer.classIds[dstLayerIdx] = backLayer.classIds[srcLayerIdx];
        }
      }
    }
  }

  return {
    back: {
      ...back,
      rgb: outRgb,
      inpainted: outInpainted,
      relief: outRelief,
      normal: outNormal,
      zone: outZone,
      cutout: outCutout,
    },
    backLayer: outLayer,
  };
}

export interface PhotoTransform {
  /** Desplazamiento horizontal en porcentaje del lienzo (-80 .. +80). Positivo = derecha. */
  offsetX: number;
  /** Desplazamiento vertical en porcentaje del lienzo (-80 .. +80). Positivo = abajo. */
  offsetY: number;
  /** Escala horizontal (0.20 .. 3.00, 1.0 = 100%). */
  scaleX: number;
  /** Escala vertical (0.20 .. 3.00, 1.0 = 100%). */
  scaleY: number;
  /** Rotación en grados (-180 .. +180). */
  rotation: number;
  /** Volteo horizontal en espejo. */
  flipX: boolean;
}

export type PhotoTransformSlotId =
  | 'front'
  | 'back'
  | 'side'
  | 'sideLeft'
  | 'top'
  | 'frontLayer'
  | 'backLayer'
  | 'sideLayer'
  | 'sideLeftLayer'
  | 'topLayer';

export type PhotoTransformsMap = Partial<Record<PhotoTransformSlotId, PhotoTransform>>;

export const DEFAULT_PHOTO_TRANSFORM: PhotoTransform = {
  offsetX: 0,
  offsetY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  flipX: false,
};

export function isPhotoTransformModified(tf?: PhotoTransform | null): boolean {
  if (!tf) return false;
  return (
    Math.abs(tf.offsetX) > 0.05 ||
    Math.abs(tf.offsetY) > 0.05 ||
    Math.abs(tf.scaleX - 1) > 0.005 ||
    Math.abs(tf.scaleY - 1) > 0.005 ||
    Math.abs(tf.rotation) > 0.05 ||
    Boolean(tf.flipX)
  );
}

export interface CutoutBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface PhotoRecuadroBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  baseWidth: number;
  baseHeight: number;
  baseCenterX: number;
  baseCenterY: number;
}

/**
 * Calcula la caja delimitadora real (recuadro) de la silueta recortada en el tensor de 256x256.
 */
export function getCutoutBounds(cutout: Uint8Array, w = TENSOR): CutoutBounds {
  let minX = w;
  let maxX = -1;
  let minY = w;
  let maxY = -1;
  for (let y = 0; y < w; y++) {
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      if (cutout[rowOff + x] === 1) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    return {
      minX: 28,
      maxX: w - 29,
      minY: 16,
      maxY: w - 17,
      width: w - 56,
      height: w - 32,
      centerX: (w - 1) * 0.5,
      centerY: (w - 1) * 0.5,
    };
  }
  const width = Math.max(8, maxX - minX + 1);
  const height = Math.max(8, maxY - minY + 1);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    centerX: 0.5 * (minX + maxX),
    centerY: 0.5 * (minY + maxY),
  };
}

/**
 * Calcula la transformación relativa de una vista (Perfil o Espalda) respecto al Frente.
 * Así, mover o cambiar el recuadro del Frente acopla exactamente igual que mover el Perfil o la Espalda.
 */
export function computeRelativePhotoTransform(
  frontTf?: PhotoTransform | null,
  targetTf?: PhotoTransform | null
): PhotoTransform {
  const f = frontTf ?? DEFAULT_PHOTO_TRANSFORM;
  const t = targetTf ?? DEFAULT_PHOTO_TRANSFORM;
  const fScaleX = Math.max(0.2, Math.min(3.0, f.scaleX || 1));
  const fScaleY = Math.max(0.2, Math.min(3.0, f.scaleY || 1));
  return {
    offsetX: (t.offsetX - f.offsetX) / fScaleX,
    offsetY: (t.offsetY - f.offsetY) / fScaleY,
    scaleX: Math.max(0.15, Math.min(3.5, t.scaleX / fScaleX)),
    scaleY: Math.max(0.15, Math.min(3.5, t.scaleY / fScaleY)),
    rotation: t.rotation - f.rotation,
    flipX: Boolean(t.flipX),
  };
}

/**
 * Devuelve las coordenadas exactas del recuadro configurable en el lienzo de 256x256
 * para cualquier ranura, garantizando identidad 1:1 con el constructor 3D.
 */
export function getPhotoRecuadroBox(
  slot: PhotoTransformSlotId,
  tf: PhotoTransform,
  frontBounds: CutoutBounds,
  targetBounds: CutoutBounds
): PhotoRecuadroBox {
  const baseCenterX = frontBounds.centerX;
  const baseCenterY = frontBounds.centerY;
  const baseHeight = Math.max(16, frontBounds.height);
  const isFrontOrBack =
    slot === 'front' || slot === 'frontLayer' || slot === 'back' || slot === 'backLayer';
  const baseWidth = isFrontOrBack
    ? Math.max(16, frontBounds.width)
    : Math.max(16, targetBounds.width * (baseHeight / Math.max(16, targetBounds.height)));

  const width = Math.max(12, baseWidth * tf.scaleX);
  const height = Math.max(12, baseHeight * tf.scaleY);
  const centerX = baseCenterX + (tf.offsetX / 100) * baseHeight;
  const centerY = baseCenterY + (tf.offsetY / 100) * baseHeight;

  return {
    left: centerX - 0.5 * width,
    top: centerY - 0.5 * height,
    right: centerX + 0.5 * width,
    bottom: centerY + 0.5 * height,
    width,
    height,
    centerX,
    centerY,
    baseWidth,
    baseHeight,
    baseCenterX,
    baseCenterY,
  };
}

/**
 * Convierte un nuevo recuadro `[left, top, right, bottom]` editado por el usuario
 * (arrastrando bordes/esquinas o mediante deslizadores) en el `PhotoTransform` exacto.
 */
export function photoTransformFromRecuadroBox(
  newLeft: number,
  newTop: number,
  newRight: number,
  newBottom: number,
  prevTf: PhotoTransform,
  baseBox: Pick<PhotoRecuadroBox, 'baseWidth' | 'baseHeight' | 'baseCenterX' | 'baseCenterY'>
): PhotoTransform {
  const rawW = Math.max(14, newRight - newLeft);
  const rawH = Math.max(14, newBottom - newTop);
  const centerX = 0.5 * (newLeft + newRight);
  const centerY = 0.5 * (newTop + newBottom);

  const scaleX =
    Math.round(Math.max(0.2, Math.min(3.0, rawW / Math.max(1, baseBox.baseWidth))) * 1000) / 1000;
  const scaleY =
    Math.round(Math.max(0.2, Math.min(3.0, rawH / Math.max(1, baseBox.baseHeight))) * 1000) / 1000;
  const offsetX =
    Math.round(
      Math.max(
        -80,
        Math.min(80, ((centerX - baseBox.baseCenterX) / Math.max(1, baseBox.baseHeight)) * 100)
      ) * 10
    ) / 10;
  const offsetY =
    Math.round(
      Math.max(
        -80,
        Math.min(80, ((centerY - baseBox.baseCenterY) / Math.max(1, baseBox.baseHeight)) * 100)
      ) * 10
    ) / 10;

  return {
    ...prevTf,
    offsetX,
    offsetY,
    scaleX,
    scaleY,
  };
}

/**
 * Aplica la transformación interactiva de posición/tamaño/giro/espejo sobre los buffers
 * ya recortados (`ViewTensors` y `LayerMapBuffers`) de 256x256, de modo que la detección
 * de fondo de las esquinas y el margen de borde nunca se rompan al mover o empequeñecer/agrandar.
 *
 * Si `applyFullSpatialWarp` es `false` (usado en los perfiles laterales donde `offsetX/offsetY/scaleX/scaleY`
 * se aplican analíticamente en el molde 3D sin recortar los bordes del lienzo de 256x256),
 * aplica únicamente `rotation` y `flipX` sobre el tensor.
 */
export function applyPhotoTransformToPreparedView(
  view: ViewTensors,
  layer: LayerMapBuffers | null,
  tf?: PhotoTransform | null,
  applyFullSpatialWarp = true,
  isMirroredBackLayer = false
): void {
  if (!tf) return;
  const effOffsetX = applyFullSpatialWarp ? tf.offsetX : 0;
  const effOffsetY = applyFullSpatialWarp ? tf.offsetY : 0;
  const effScaleX = applyFullSpatialWarp ? Math.max(0.15, Math.min(3.5, tf.scaleX)) : 1;
  const effScaleY = applyFullSpatialWarp ? Math.max(0.15, Math.min(3.5, tf.scaleY)) : 1;
  const rotRad = (tf.rotation * Math.PI) / 180;
  const flipX = Boolean(tf.flipX);

  if (
    Math.abs(effOffsetX) <= 0.05 &&
    Math.abs(effOffsetY) <= 0.05 &&
    Math.abs(effScaleX - 1) <= 0.005 &&
    Math.abs(effScaleY - 1) <= 0.005 &&
    Math.abs(tf.rotation) <= 0.05 &&
    !flipX
  ) {
    return;
  }

  const w = TENSOR;
  const h = TENSOR;
  const cx = (w - 1) * 0.5;
  const cy = (h - 1) * 0.5;
  const dx = (effOffsetX / 100) * w;
  const dy = (effOffsetY / 100) * h;
  const cosR = Math.cos(-rotRad);
  const sinR = Math.sin(-rotRad);

  const srcRgb = view.rgb.slice();
  const srcAlpha = view.alpha.slice();
  const srcExtBg = view.exteriorBg.slice();
  const srcCandBg = view.candidateBg.slice();
  const srcCutout = view.cutout.slice();
  const srcRelief = view.relief.slice();
  const srcInpainted = view.inpainted.slice();
  const srcNormal = view.normal.slice();
  const srcZone = view.zone.slice();

  const srcLayerOff = layer ? layer.offset.slice() : null;
  const srcLayerSoft = layer ? layer.soft.slice() : null;
  const srcLayerClass = layer ? layer.classIds.slice() : null;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Transformación inversa: del píxel destino (x, y) al píxel origen (sx, sy)
      const rx = x - cx - dx;
      const ry = y - cy - dy;
      const ux = (rx * cosR - ry * sinR) / effScaleX;
      const uy = (rx * sinR + ry * cosR) / effScaleY;
      const sx = cx + (flipX ? -ux : ux);
      const sy = cy + uy;

      const dstIdx = y * w + x;
      const dst3 = dstIdx * 3;
      const isx = Math.round(sx);
      const isy = Math.round(sy);

      if (isx < 0 || isx >= w || isy < 0 || isy >= h) {
        view.rgb[dst3] = view.bg[0];
        view.rgb[dst3 + 1] = view.bg[1];
        view.rgb[dst3 + 2] = view.bg[2];
        view.alpha[dstIdx] = 0;
        view.exteriorBg[dstIdx] = 1;
        view.candidateBg[dstIdx] = 1;
        view.cutout[dstIdx] = 0;
        view.relief[dstIdx] = 0;
        view.inpainted[dst3] = view.bg[0];
        view.inpainted[dst3 + 1] = view.bg[1];
        view.inpainted[dst3 + 2] = view.bg[2];
        view.normal[dst3] = 0;
        view.normal[dst3 + 1] = 0;
        view.normal[dst3 + 2] = 1;
        view.zone[dstIdx] = 0;
      } else {
        const srcIdx = isy * w + isx;
        const src3 = srcIdx * 3;
        view.rgb[dst3] = srcRgb[src3];
        view.rgb[dst3 + 1] = srcRgb[src3 + 1];
        view.rgb[dst3 + 2] = srcRgb[src3 + 2];
        view.alpha[dstIdx] = srcAlpha[srcIdx];
        view.exteriorBg[dstIdx] = srcExtBg[srcIdx];
        view.candidateBg[dstIdx] = srcCandBg[srcIdx];
        view.cutout[dstIdx] = srcCutout[srcIdx];
        view.relief[dstIdx] = srcRelief[srcIdx];
        view.inpainted[dst3] = srcInpainted[src3];
        view.inpainted[dst3 + 1] = srcInpainted[src3 + 1];
        view.inpainted[dst3 + 2] = srcInpainted[src3 + 2];
        view.normal[dst3] = flipX ? -srcNormal[src3] : srcNormal[src3];
        view.normal[dst3 + 1] = srcNormal[src3 + 1];
        view.normal[dst3 + 2] = srcNormal[src3 + 2];
        view.zone[dstIdx] = srcZone[srcIdx];
      }

      if (layer && srcLayerOff && srcLayerSoft && srcLayerClass) {
        // En `backLayer` la coordenada X está sin espejar respecto a `backView`
        const dstLayerX = isMirroredBackLayer ? w - 1 - x : x;
        const dstLayerIdx = y * w + dstLayerX;
        if (isx < 0 || isx >= w || isy < 0 || isy >= h) {
          layer.offset[dstLayerIdx] = NaN;
          layer.soft[dstLayerIdx] = 0;
          layer.classIds[dstLayerIdx] = -1;
        } else {
          const srcLayerX = isMirroredBackLayer ? w - 1 - isx : isx;
          const srcLayerIdx = isy * w + srcLayerX;
          layer.offset[dstLayerIdx] = srcLayerOff[srcLayerIdx];
          layer.soft[dstLayerIdx] = srcLayerSoft[srcLayerIdx];
          layer.classIds[dstLayerIdx] = srcLayerClass[srcLayerIdx];
        }
      }
    }
  }
}


