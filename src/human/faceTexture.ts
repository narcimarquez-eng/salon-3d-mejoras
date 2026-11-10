// ============================================================================
// RASGOS DE LA CARA DESDE LA FOTO DE FRENTE
// ----------------------------------------------------------------------------
// El atlas del personaje guarda cada vista a 256 px, así que la cara entera se
// queda en unos 20-40 píxeles y los ojos, la nariz y la boca salen borrosos.
//
// Este módulo NO toca el molde ni la forma de la cabeza. Solo:
//
//   1. detecta la cara en la foto de frente (ojos, nariz, boca y orejas), con
//      su propia búsqueda, válida para personas y para caras de animal;
//   2. busca el hueco libre más grande del atlas (lo que ninguna UV usa) y
//      pinta allí las partes elegidas sacadas de la foto original a toda
//      resolución; el resto de la cara sigue con la textura de siempre y la
//      unión se funde con un borde suave;
//   3. hace que los triángulos de la cara miren a ese parche, duplicando los
//      vértices del borde: la malla no cambia de forma y no hay costuras;
//   4. sin foto de espalda, quita de la nuca los ojos y la boca que salían
//      por detrás al reutilizar el frente espejado.
// ============================================================================

import * as THREE from 'three';
import type { TensorCrop } from './imagePrep';

export type FacePartId = 'eyes' | 'nose' | 'mouth' | 'ears' | 'whole';

export const FACE_PARTS: { id: FacePartId; label: string; hint: string }[] = [
  { id: 'eyes', label: 'Ojos y cejas', hint: 'Los dos ojos con sus cejas.' },
  { id: 'nose', label: 'Nariz', hint: 'Puente, punta y orificios de la nariz (o el hocico).' },
  { id: 'mouth', label: 'Boca', hint: 'Labios, dientes o colmillos.' },
  { id: 'ears', label: 'Orejas', hint: 'Las orejas, a los lados o encima de la cabeza.' },
  { id: 'whole', label: 'Toda la cara', hint: 'La cabeza entera vista de frente.' },
];

export interface FaceEllipse {
  id: FacePartId;
  /** Lado de la imagen para ojos y orejas (-1 izquierda, 1 derecha). */
  side?: -1 | 1;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface FaceLayout {
  /** true si los ojos se han encontrado en la foto; false si se colocan por proporciones. */
  detected: boolean;
  centerX: number;
  eyeY: number;
  mouthY: number;
  chinY: number;
  /** Ancho medio de la cara (sin orejas ni melena). */
  faceHalf: number;
  /** Orejas que sobresalen de la silueta. */
  earsFound: number;
  parts: FaceEllipse[];
}

export interface FaceSearchHint {
  /** Fila donde termina la cabeza (cuello o barbilla), si se conoce. */
  headBottom?: number;
  /** Animal (orejas encima de la cabeza, hocico) en vez de persona. */
  animal?: boolean;
}

type Run = [number, number];

function runAt(mask: Uint8Array, w: number, y: number, x: number): Run | null {
  if (y < 0 || y >= w) return null;
  let best: Run | null = null;
  let bestD = Infinity;
  let a = -1;
  for (let xx = 0; xx <= w; xx++) {
    const on = xx < w && mask[y * w + xx] === 1;
    if (on && a < 0) a = xx;
    if (!on && a >= 0) {
      const b = xx - 1;
      const d = x < a ? a - x : x > b ? x - b : 0;
      if (d < bestD) {
        bestD = d;
        best = [a, b];
      }
      a = -1;
    }
  }
  return best;
}

/**
 * Busca la cara en la vista de frente (tensor w*w).
 *
 * Ojos: la fila donde hay dos puntos oscuros simétricos a los lados del eje,
 * más oscuros que lo que tienen encima y debajo. Una boca con dientes o una
 * nariz de animal también lo son, así que si hay otra franja fuerte claramente
 * por encima de la mejor, los ojos son esa. Boca: la franja más oscura bajo la
 * nariz. Orejas: lo que sobresale de la cabeza.
 */
export function detectFaceParts(
  mask: Uint8Array,
  rgb: Float32Array,
  w: number,
  hint: FaceSearchHint = {}
): FaceLayout | null {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) continue;
      if (top < 0) top = y;
      bottom = y;
      break;
    }
  }
  if (top < 0) return null;
  const H = bottom - top + 1;
  const headBottom = Math.min(
    bottom,
    hint.headBottom && hint.headBottom > top + 8 ? hint.headBottom : top + (hint.animal ? 0.5 : 0.2) * H
  );
  const Hh = headBottom - top;
  if (Hh < 8) return null;

  // Eje y medio ancho de la cabeza.
  let sx = 0;
  let sn = 0;
  for (let y = top; y <= headBottom; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) continue;
      sx += x;
      sn++;
    }
  }
  const axis = sn ? sx / sn : w / 2;
  const halves: number[] = [];
  for (let y = Math.round(top + 0.2 * Hh); y <= Math.round(top + 0.85 * Hh); y++) {
    const r = runAt(mask, w, y, axis);
    if (r) halves.push((r[1] - r[0] + 1) / 2);
  }
  if (!halves.length) return null;
  halves.sort((a, b) => a - b);
  const half = halves[halves.length >> 1];
  if (half < 4) return null;

  const lum = (x: number, y: number) => {
    const xi = Math.max(0, Math.min(w - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(w - 1, Math.round(y)));
    const i = (yi * w + xi) * 3;
    return 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
  };
  const lum3 = (x: number, y: number) => {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += lum(x + dx, y + dy);
    return s / 9;
  };

  // --- Ojos ---
  const band = Math.max(2, Math.round(Hh * 0.08));
  const rows: { y: number; score: number; lx: number; rx: number }[] = [];
  for (let y = Math.round(top + 0.15 * Hh); y <= Math.round(top + 0.85 * Hh); y++) {
    const darkest = (side: -1 | 1): [number, number] => {
      let m = Infinity;
      let mx = axis;
      for (let k = 0.1; k <= 0.7; k += 0.03) {
        const x = axis + side * k * half;
        if (mask[y * w + Math.round(x)] !== 1) continue;
        const l = lum3(x, y);
        if (l < m) {
          m = l;
          mx = x;
        }
      }
      return [m, mx];
    };
    const [dl, lx] = darkest(-1);
    const [dr, rx] = darkest(1);
    if (!Number.isFinite(dl) || !Number.isFinite(dr)) continue;
    const around = (lum3(lx, y - band) + lum3(rx, y - band) + lum3(lx, y + band) + lum3(rx, y + band)) / 4;
    const symmetry = Math.abs(dl - dr) + (Math.abs(axis - lx - (rx - axis)) / half) * 0.15;
    rows.push({ y, score: around - (dl + dr) / 2 - symmetry, lx, rx });
  }
  let best: (typeof rows)[number] | null = null;
  for (const r of rows) if (!best || r.score > best.score) best = r;
  let detected = !!best && best.score >= 0.035;
  let eyeY = top + 0.5 * Hh;
  let eyeHalf = half * 0.32;
  let cx = axis;
  if (best && detected) {
    let pick = best;
    const minGap = Math.max(3, 0.12 * Hh);
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k];
      if (r.y > best.y - minGap || r.score < 0.6 * best.score) continue;
      const prev = rows[k - 1]?.score ?? -Infinity;
      const next = rows[k + 1]?.score ?? -Infinity;
      if (r.score < prev || r.score < next) continue;
      if (pick === best || r.score > pick.score) pick = r;
    }
    eyeY = pick.y;
    cx = (pick.lx + pick.rx) / 2;
    eyeHalf = Math.max(half * 0.15, (pick.rx - pick.lx) / 2);
    // Ojos casi juntos o casi en el borde: no es una cara de verdad.
    if (eyeHalf > half * 0.85) detected = false;
  }
  if (!detected) {
    eyeY = top + (hint.animal ? 0.45 : 0.55) * Hh;
    cx = axis;
    eyeHalf = half * 0.32;
  }
  const faceHalf = Math.max(half * 0.4, Math.min(half * 1.25, eyeHalf / 0.34));
  const span = Math.max(4, 1.05 * faceHalf);

  // --- Nariz: lo más oscuro en una columna estrecha bajo los ojos ---
  // (en un animal la nariz es más oscura que la boca, así que hay que
  // encontrarla antes para buscar la boca por debajo de ella).
  let noseY = eyeY + 0.45 * span;
  {
    let bestV = Infinity;
    for (let y = Math.round(eyeY + 0.3 * span); y <= Math.round(eyeY + 0.95 * span); y++) {
      if (y < 1 || y >= w - 1) continue;
      let acc = 0;
      let n = 0;
      for (let x = Math.round(cx - 0.18 * faceHalf); x <= Math.round(cx + 0.18 * faceHalf); x++) {
        if (x < 0 || x >= w || mask[y * w + x] !== 1) continue;
        acc += (lum(x, y - 1) + lum(x, y) + lum(x, y + 1)) / 3;
        n++;
      }
      if (n < 2) continue;
      if (acc / n < bestV) {
        bestV = acc / n;
        noseY = y;
      }
    }
  }

  // --- Boca: la franja más oscura bajo la nariz ---
  let mouthY = eyeY + 0.75 * span;
  {
    let bestV = Infinity;
    const y0 = Math.max(eyeY + 0.5 * span, noseY + 0.18 * span);
    const y1 = Math.max(y0 + 2, eyeY + (hint.animal ? 1.45 : 1.15) * span);
    for (let y = Math.round(y0); y <= Math.round(y1); y++) {
      if (y < 0 || y >= w) continue;
      let s = 0;
      let n = 0;
      for (let x = Math.round(cx - 0.3 * faceHalf); x <= Math.round(cx + 0.3 * faceHalf); x++) {
        if (x < 0 || x >= w || mask[y * w + x] !== 1) continue;
        s += lum(x, y);
        n++;
      }
      if (n < 2) continue;
      const v = s / n + 0.04 * Math.abs((y - noseY) / span - 0.35);
      if (v < bestV) {
        bestV = v;
        mouthY = y;
      }
    }
  }
  const chinY = Math.max(eyeY + span, mouthY + 0.25 * span);

  const parts: FaceEllipse[] = [];
  for (const side of [-1, 1] as const) {
    parts.push({
      id: 'eyes', side,
      // Generoso: la detección mide los ojos por su punto más oscuro.
      cx: cx + side * 0.38 * faceHalf,
      cy: eyeY - 0.12 * span,
      rx: 0.5 * faceHalf,
      ry: 0.5 * span,
    });
  }
  parts.push({
    id: 'nose',
    cx,
    cy: (eyeY + 0.2 * span + noseY + 0.12 * span) / 2,
    rx: 0.32 * faceHalf,
    ry: Math.max(0.3 * span, (noseY + 0.12 * span - (eyeY + 0.2 * span)) / 2 + 0.1 * span),
  });
  parts.push({ id: 'mouth', cx, cy: mouthY, rx: 0.62 * faceHalf, ry: 0.26 * span });

  // --- Orejas ---
  let earsFound = 0;
  for (const side of [-1, 1] as const) {
    const faceEdge = cx + side * faceHalf;
    let tip = faceEdge;
    let sumY = 0;
    let nY = 0;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let y = Math.max(top, Math.round(eyeY - 1.5 * span)); y <= Math.round(eyeY + 0.5 * span); y++) {
      const r = runAt(mask, w, y, cx);
      if (!r) continue;
      const edge = side < 0 ? r[0] : r[1];
      if ((edge - faceEdge) * side > 0.12 * faceHalf) {
        sumY += y;
        nY++;
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      if ((edge - tip) * side > 0) tip = edge;
    }
    // Con melena o pelo largo lo que sobresale no es la oreja: solo cuenta si
    // es una punta (no ocupa toda la altura de la cara).
    // En un animal las orejas van arriba: lo que sobresale por los lados es melena.
    const protrudes = !hint.animal && nY >= 2 && (tip - faceEdge) * side > 0.2 * faceHalf && y1 - y0 < 1.6 * span;
    if (protrudes) {
      earsFound++;
      const len = Math.abs(tip - faceEdge);
      parts.push({
        id: 'ears', side,
        cx: faceEdge + side * len * 0.45,
        cy: sumY / nY,
        rx: len * 0.65 + 0.2 * faceHalf,
        ry: Math.max(0.3 * span, (y1 - y0) / 2 + 0.15 * span),
      });
    } else if (hint.animal) {
      // Animal: orejas encima y a los lados de la frente.
      parts.push({ id: 'ears', side, cx: cx + side * 0.75 * faceHalf, cy: eyeY - 0.8 * span, rx: 0.35 * faceHalf, ry: 0.4 * span });
    } else {
      parts.push({ id: 'ears', side, cx: faceEdge, cy: eyeY + 0.2 * span, rx: 0.28 * faceHalf, ry: 0.42 * span });
    }
  }

  let hx0 = cx - faceHalf;
  let hx1 = cx + faceHalf;
  let hy0 = eyeY - (hint.animal ? 1.3 : 0.9) * span;
  for (const p of parts) {
    hx0 = Math.min(hx0, p.cx - p.rx);
    hx1 = Math.max(hx1, p.cx + p.rx);
    hy0 = Math.min(hy0, p.cy - p.ry);
  }
  const hy1 = chinY + 0.12 * span;
  parts.push({ id: 'whole', cx: (hx0 + hx1) / 2, cy: (hy0 + hy1) / 2, rx: (hx1 - hx0) / 2, ry: (hy1 - hy0) / 2 });

  return { detected, centerX: cx, eyeY, mouthY, chinY, faceHalf, earsFound, parts };
}

/** Cuadrado del tensor que cubre las partes elegidas, con margen para el borde suave. */
export function faceRect(layout: FaceLayout, selected: Set<FacePartId>): { x: number; y: number; size: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of layout.parts) {
    if (!selected.has(p.id)) continue;
    x0 = Math.min(x0, p.cx - p.rx);
    x1 = Math.max(x1, p.cx + p.rx);
    y0 = Math.min(y0, p.cy - p.ry);
    y1 = Math.max(y1, p.cy + p.ry);
  }
  if (!Number.isFinite(x0)) return null;
  const size = Math.max(x1 - x0, y1 - y0) * 1.06 + 2;
  return { x: (x0 + x1) / 2 - size / 2, y: (y0 + y1) / 2 - size / 2, size };
}

const smoothstep = (a: number, b: number, t: number) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Peso (0..1) de las partes elegidas en un punto del tensor. */
export function featureWeight(parts: FaceEllipse[], selected: Set<FacePartId>, x: number, y: number, grow = 1): number {
  let wgt = 0;
  for (const p of parts) {
    if (!selected.has(p.id)) continue;
    const dx = (x - p.cx) / (p.rx * grow);
    const dy = (y - p.cy) / (p.ry * grow);
    const e = 1 - smoothstep(0.72, 1.0, Math.sqrt(dx * dx + dy * dy));
    if (e > wgt) wgt = e;
  }
  return wgt;
}

export interface AtlasSpot {
  /** Esquina superior izquierda y lado, en píxeles del atlas. */
  px: number;
  py: number;
  size: number;
}

/**
 * El cuadrado libre más grande del atlas: ningún triángulo tiene allí sus UV
 * (con 3 px de margen para que el filtrado no mezcle). El atlas del molde está
 * repartido en cuatro vistas, pero cada figura deja huecos a su alrededor.
 */
export function findFreeAtlasSpot(geometry: THREE.BufferGeometry, atlasW: number, maxSize = 192): AtlasSpot | null {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const index = geometry.getIndex();
  if (!uv || !index) return null;
  const used = new Uint8Array(atlasW * atlasW);
  const pad = 3;
  const idx = index.array as ArrayLike<number>;
  for (let t = 0; t < idx.length; t += 3) {
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const vi = idx[t + k];
      const u = uv.getX(vi) * atlasW;
      const v = uv.getY(vi) * atlasW;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u);
      v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const xa = Math.max(0, Math.floor(u0) - pad);
    const xb = Math.min(atlasW - 1, Math.ceil(u1) + pad);
    const ya = Math.max(0, Math.floor(v0) - pad);
    const yb = Math.min(atlasW - 1, Math.ceil(v1) + pad);
    for (let y = ya; y <= yb; y++) used.fill(1, y * atlasW + xa, y * atlasW + xb + 1);
  }
  // Mayor cuadrado de ceros (programación dinámica).
  const dp = new Int32Array(atlasW * atlasW);
  let bestS = 0;
  let bx = 0;
  let by = 0;
  for (let y = 0; y < atlasW; y++) {
    for (let x = 0; x < atlasW; x++) {
      const i = y * atlasW + x;
      if (used[i]) continue;
      const v = x === 0 || y === 0 ? 1 : 1 + Math.min(dp[i - 1], dp[i - atlasW], dp[i - atlasW - 1]);
      dp[i] = v;
      if (v > bestS) {
        bestS = v;
        bx = x;
        by = y;
      }
    }
  }
  // Se deja 1 px de borde dentro del hueco.
  const size = Math.min(maxSize, bestS - 2);
  if (size < 32) return null;
  return { px: bx - bestS + 2, py: by - bestS + 2, size };
}


function bilinear(buf: Uint8Array, atlasW: number, px: number, py: number, out: number[]) {
  const fx = Math.max(0, Math.min(atlasW - 1.001, px - 0.5));
  const fy = Math.max(0, Math.min(atlasW - 1.001, py - 0.5));
  const x0 = fx | 0;
  const y0 = fy | 0;
  const ax = fx - x0;
  const ay = fy - y0;
  for (let c = 0; c < 4; c++) {
    const a = buf[(y0 * atlasW + x0) * 4 + c] * (1 - ax) + buf[(y0 * atlasW + x0 + 1) * 4 + c] * ax;
    const b = buf[((y0 + 1) * atlasW + x0) * 4 + c] * (1 - ax) + buf[((y0 + 1) * atlasW + x0 + 1) * 4 + c] * ax;
    out[c] = a * (1 - ay) + b * ay;
  }
}

export interface FacePatchInput {
  geometry: THREE.BufferGeometry;
  albedo: Uint8Array;
  roughMetal: Uint8Array;
  normal: Uint8Array;
  atlasWidth: number;
  /** Silueta de frente (tensor w*w): también sirve para situar la malla respecto a la foto. */
  mask: Uint8Array;
  w: number;
  /** Color de fondo de la foto de frente (0..1). */
  background: [number, number, number];
  frontImage: HTMLImageElement;
  frontCrop: TensorCrop;
}

export interface FacePatchResult {
  /** Píxeles de la foto original por píxel del tensor en la cara. */
  gain: number;
  /** Triángulos que ahora miran al parche. */
  triangles: number;
}

/**
 * Pone los rasgos de la cara de la foto de frente en la malla.
 *
 * 1. Sitúa cada vértice en la foto de frente por su posición (la silueta de la
 *    malla vista de frente es la de la foto, así que basta con encajar sus
 *    cajas). Así funciona igual si la cabeza se texturiza con la foto de
 *    frente o con los perfiles, como en los cuadrúpedos.
 * 2. Elige los triángulos de la cara que se ven desde delante: dentro del
 *    cuadrado de la cara, mirando hacia la foto y sin nada delante.
 * 3. Pinta el parche en `spot`: de fondo, la misma textura que esos triángulos
 *    tenían (se interpolan sus UV de antes, así no hay costura con lo de
 *    alrededor); encima, las partes elegidas de la foto original.
 * 4. Duplica los vértices de esos triángulos y les da UV del parche: la forma
 *    no cambia y los vecinos conservan su textura.
 */
export function applyFacePatch(
  input: FacePatchInput,
  layout: FaceLayout,
  rect: { x: number; y: number; size: number },
  spot: AtlasSpot,
  selected: Set<FacePartId>
): FacePatchResult | null {
  const { geometry, albedo, roughMetal, normal, atlasWidth: A, mask, w, frontImage: img, frontCrop: crop } = input;
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  const norAttr = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const uvAttr = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const index = geometry.getIndex();
  if (!posAttr || !uvAttr || !index) return null;
  const nV = posAttr.count;

  // --- 1. Malla -> coordenadas de la foto de frente ---
  let mx0 = w, mx1 = -1, my0 = w, my1 = -1;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (x < mx0) mx0 = x;
      if (x > mx1) mx1 = x;
      if (y < my0) my0 = y;
      if (y > my1) my1 = y;
    }
  }
  let px0 = Infinity, px1 = -Infinity, py0 = Infinity, py1 = -Infinity;
  for (let v = 0; v < nV; v++) {
    const x = posAttr.getX(v);
    const y = posAttr.getY(v);
    if (x < px0) px0 = x;
    if (x > px1) px1 = x;
    if (y < py0) py0 = y;
    if (y > py1) py1 = y;
  }
  if (mx1 <= mx0 || my1 <= my0 || px1 <= px0 || py1 <= py0) return null;
  // Los bordes de la silueta son píxeles enteros: la malla llega medio píxel más allá.
  const kx = (mx1 - mx0 + 1) / (px1 - px0);
  const ky = (my1 - my0 + 1) / (py1 - py0);
  const tX = (x: number) => mx0 - 0.5 + (x - px0) * kx;
  const tY = (y: number) => my0 - 0.5 + (py1 - y) * ky;
  const tx = new Float32Array(nV);
  const ty = new Float32Array(nV);
  for (let v = 0; v < nV; v++) {
    tx[v] = tX(posAttr.getX(v));
    ty[v] = tY(posAttr.getY(v));
  }

  // --- 2. Qué lado mira a la foto y qué se ve desde allí ---
  const { x: rx, y: ry, size } = rect;
  const inRect = (v: number) => tx[v] > rx && tx[v] < rx + size && ty[v] > ry && ty[v] < ry + size;
  let zAll = 0, zHead = 0, nHead = 0, zMin = Infinity, zMax = -Infinity;
  for (let v = 0; v < nV; v++) {
    const z = posAttr.getZ(v);
    zAll += z;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
    if (inRect(v)) {
      zHead += z;
      nHead++;
    }
  }
  if (!nHead) return null;
  zAll /= nV;
  zHead /= nHead;
  // En una figura erguida la cara mira a +Z. En un cuadrúpedo la cabeza está en
  // un extremo del cuerpo: se mira hacia ese extremo.
  const dir = Math.abs(zHead - zAll) > 0.12 * (zMax - zMin) ? Math.sign(zHead - zAll) : 1;
  const G = w; // rejilla de profundidad a la resolución del tensor
  const front = new Float32Array(G * G).fill(-Infinity);
  for (let v = 0; v < nV; v++) {
    const cx = Math.round(tx[v]);
    const cy = Math.round(ty[v]);
    if (cx < 0 || cy < 0 || cx >= G || cy >= G) continue;
    const d = posAttr.getZ(v) * dir;
    if (d > front[cy * G + cx]) front[cy * G + cx] = d;
  }
  const tol = 0.06 * (size / Math.max(1, mx1 - mx0 + 1)) * (px1 - px0);
  const visible = new Uint8Array(nV); // 1 = cara visible desde delante
  for (let v = 0; v < nV; v++) {
    if (!inRect(v)) continue;
    if (norAttr && norAttr.getZ(v) * dir < 0.05) continue;
    const cx = Math.round(tx[v]);
    const cy = Math.round(ty[v]);
    let top = -Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx;
        const yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= G || yy >= G) continue;
        top = Math.max(top, front[yy * G + xx]);
      }
    }
    if (posAttr.getZ(v) * dir >= top - tol) visible[v] = 1;
  }
  const idx = index.array as ArrayLike<number>;
  const triangles: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    if (visible[idx[t]] && visible[idx[t + 1]] && visible[idx[t + 2]]) triangles.push(t);
  }
  if (!triangles.length) return { gain: 0, triangles: 0 };

  // --- 3. Parche ---
  const P = spot.size;
  const toPatch = (t: number, o: number) => ((t - o) / size) * P; // px del parche
  // 3a. Fondo: lo que cada triángulo tenía, interpolando sus UV de antes.
  const baseR = new Float32Array(P * P * 4);
  const baseRM = new Float32Array(P * P * 4);
  const baseN = new Float32Array(P * P * 4);
  const covered = new Uint8Array(P * P);
  const tmp = [0, 0, 0, 0];
  const sampleAll = (u: number, v: number, o: number) => {
    bilinear(albedo, A, u * A, v * A, tmp);
    for (let c = 0; c < 4; c++) baseR[o + c] = tmp[c];
    bilinear(roughMetal, A, u * A, v * A, tmp);
    for (let c = 0; c < 4; c++) baseRM[o + c] = tmp[c];
    bilinear(normal, A, u * A, v * A, tmp);
    for (let c = 0; c < 4; c++) baseN[o + c] = tmp[c];
  };
  for (const t of triangles) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ax = toPatch(tx[a], rx), ay = toPatch(ty[a], ry);
    const bx = toPatch(tx[b], rx), by = toPatch(ty[b], ry);
    const cx = toPatch(tx[c], rx), cy = toPatch(ty[c], ry);
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const x1 = Math.min(P - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const y1 = Math.min(P - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const sx = px + 0.5;
        const sy = py + 0.5;
        const l1 = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) / den;
        const l2 = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) / den;
        const l3 = 1 - l1 - l2;
        if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
        const u = l1 * uvAttr.getX(a) + l2 * uvAttr.getX(b) + l3 * uvAttr.getX(c);
        const vv = l1 * uvAttr.getY(a) + l2 * uvAttr.getY(b) + l3 * uvAttr.getY(c);
        const k = py * P + px;
        sampleAll(u, vv, k * 4);
        covered[k] = 1;
      }
    }
  }
  // Lo que no cubre ningún triángulo se rellena con el vecino cubierto (para
  // que el filtrado del borde no mezcle negro).
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (let k = 0; k < P * P; k++) {
      if (covered[k]) continue;
      const x = k % P;
      const y = (k / P) | 0;
      for (const j of [x > 0 ? k - 1 : -1, x < P - 1 ? k + 1 : -1, y > 0 ? k - P : -1, y < P - 1 ? k + P : -1]) {
        if (j < 0 || covered[j] !== 1) continue;
        for (let c = 0; c < 4; c++) {
          baseR[k * 4 + c] = baseR[j * 4 + c];
          baseRM[k * 4 + c] = baseRM[j * 4 + c];
          baseN[k * 4 + c] = baseN[j * 4 + c];
        }
        covered[k] = 2;
        changed = true;
        break;
      }
    }
    for (let k = 0; k < P * P; k++) if (covered[k] === 2) covered[k] = 1;
    if (!changed) break;
  }

  // 3b. Foto original en la zona de la cara. El tensor se dibujó con
  //     drawImage(img, crop..., ox, oy, dw, dh): se deshace esa cuenta.
  const s = Math.min(w / crop.w, w / crop.h);
  const ox = (w - crop.w * s) / 2;
  const oy = (w - crop.h * s) / 2;
  // El tensor pone el centro del píxel i en i + 0,5 del lienzo.
  const sx0 = crop.x + (rx + 0.5 - ox) / s;
  const sy0 = crop.y + (ry + 0.5 - oy) / s;
  const sw = size / s;
  const sh = size / s;
  const canvas = document.createElement('canvas');
  canvas.width = P;
  canvas.height = P;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, P, P);
  ctx.drawImage(img, sx0, sy0, sw, sh, 0, 0, P, P);
  const hi = ctx.getImageData(0, 0, P, P).data;

  // Silueta suavizada: la foto solo se usa bien dentro del personaje.
  const soft = new Float32Array(w * w);
  for (let i = 0; i < w * w; i++) soft[i] = mask[i];
  const tmpS = new Float32Array(w * w);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let o = -1; o <= 1; o++) acc += soft[y * w + Math.max(0, Math.min(w - 1, x + o))];
        tmpS[y * w + x] = acc / 3;
      }
    }
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let o = -1; o <= 1; o++) acc += tmpS[Math.max(0, Math.min(w - 1, y + o)) * w + x];
        soft[y * w + x] = acc / 3;
      }
    }
  }
  const sampleSoft = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(w - 1.001, x));
    const cy = Math.max(0, Math.min(w - 1.001, y));
    const x0 = cx | 0;
    const y0 = cy | 0;
    const fx = cx - x0;
    const fy = cy - y0;
    const i = y0 * w + x0;
    return (soft[i] * (1 - fx) + soft[i + 1] * fx) * (1 - fy) + (soft[i + w] * (1 - fx) + soft[i + w + 1] * fx) * fy;
  };

  const [br, bgc, bb] = input.background;
  const innerSel = new Set<FacePartId>([...selected].filter((p) => p === 'eyes' || p === 'nose' || p === 'mouth'));
  const outerSel = new Set<FacePartId>([...selected].filter((p) => p === 'ears' || p === 'whole'));
  for (let py = 0; py < P; py++) {
    const tyy = ry + ((py + 0.5) / P) * size;
    for (let px = 0; px < P; px++) {
      const txx = rx + ((px + 0.5) / P) * size;
      const k = py * P + px;
      const h = k * 4;
      const wIn = featureWeight(layout.parts, innerSel, txx, tyy);
      const wOut = featureWeight(layout.parts, outerSel, txx, tyy);
      let wgt = 0;
      if (wIn > 0 || wOut > 0) {
        const m = sampleSoft(txx, tyy);
        const inside = smoothstep(0.5, 0.85, m);
        const dBg = Math.sqrt((hi[h] / 255 - br) ** 2 + (hi[h + 1] / 255 - bgc) ** 2 + (hi[h + 2] / 255 - bb) ** 2);
        const strict = hi[h + 3] < 32 ? 0 : smoothstep(0.06, 0.18, dBg);
        // Ojos, nariz y boca están bien dentro de la cara: allí no se descarta
        // nada (el blanco de los ojos puede parecerse al fondo) salvo cerca del
        // contorno. Orejas y cabeza entera llegan al borde: allí todo lo que
        // tenga el color del fondo se descarta.
        const deep = smoothstep(0.93, 0.995, m);
        const tolerant = hi[h + 3] < 32 ? 0 : deep + (1 - deep) * strict;
        wgt = Math.max(wIn * inside * tolerant, wOut * inside * strict);
      }
      const o = ((spot.py + py) * A + spot.px + px) * 4;
      albedo[o] = Math.round(baseR[h] + (hi[h] - baseR[h]) * wgt);
      albedo[o + 1] = Math.round(baseR[h + 1] + (hi[h + 1] - baseR[h + 1]) * wgt);
      albedo[o + 2] = Math.round(baseR[h + 2] + (hi[h + 2] - baseR[h + 2]) * wgt);
      albedo[o + 3] = 255;
      for (let c = 0; c < 4; c++) {
        roughMetal[o + c] = Math.round(baseRM[h + c]);
        // Donde manda la foto, el relieve de textura de otra vista no encaja: se aplana.
        const flat = c === 2 ? 255 : c === 3 ? baseN[h + 3] : 128;
        normal[o + c] = Math.round(baseN[h + c] + (flat - baseN[h + c]) * wgt);
      }
    }
  }

  // --- 4. Vértices duplicados con UV del parche ---
  const dupOf = new Map<number, number>();
  let next = nV;
  for (const t of triangles) {
    for (let k = 0; k < 3; k++) {
      const v = idx[t + k];
      if (!dupOf.has(v)) dupOf.set(v, next++);
    }
  }
  const total = next;
  for (const name of Object.keys(geometry.attributes)) {
    const attr = geometry.getAttribute(name) as THREE.BufferAttribute;
    const item = attr.itemSize;
    const src = attr.array as THREE.TypedArray;
    const Ctor = (src as unknown as { constructor: new (n: number) => THREE.TypedArray }).constructor;
    const arr = new Ctor(total * item);
    arr.set(src);
    for (const [v, d] of dupOf) {
      for (let c = 0; c < item; c++) arr[d * item + c] = src[v * item + c];
    }
    if (name === 'uv') {
      for (const [v, d] of dupOf) {
        arr[d * 2] = (spot.px + Math.max(0.5, Math.min(P - 0.5, toPatch(tx[v], rx)))) / A;
        arr[d * 2 + 1] = (spot.py + Math.max(0.5, Math.min(P - 0.5, toPatch(ty[v], ry)))) / A;
      }
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(arr, item, attr.normalized));
  }
  const newIndex = new Uint32Array(idx.length);
  for (let k = 0; k < idx.length; k++) newIndex[k] = idx[k];
  for (const t of triangles) {
    for (let k = 0; k < 3; k++) newIndex[t + k] = dupOf.get(idx[t + k])!;
  }
  geometry.setIndex(new THREE.BufferAttribute(newIndex, 1));
  const srcIdx = new Int32Array(total - nV);
  for (const [v, d] of dupOf) srcIdx[d - nV] = v;
  FACE_DUPLICATES.set(geometry, { base: nV, src: srcIdx });
  return { gain: 1 / s, triangles: triangles.length };
}

/** Vértices duplicados por la cara: a partir de `base`, cada uno copia a `src[i]`. */
const FACE_DUPLICATES = new WeakMap<THREE.BufferGeometry, { base: number; src: Int32Array }>();

/**
 * Después de recalcular los pesos de piel (al editar el esqueleto), los
 * vértices duplicados de la cara vuelven a copiar los de su original. Si el
 * atributo se ha rehecho con el número de vértices de antes, se alarga.
 */
export function syncFaceDuplicates(geometry: THREE.BufferGeometry, names = ['skinIndex', 'skinWeight']) {
  const dup = FACE_DUPLICATES.get(geometry);
  if (!dup) return;
  const total = dup.base + dup.src.length;
  for (const name of names) {
    const attr = geometry.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!attr) continue;
    const item = attr.itemSize;
    let arr = attr.array as THREE.TypedArray;
    if (attr.count < total) {
      const Ctor = (arr as unknown as { constructor: new (n: number) => THREE.TypedArray }).constructor;
      const bigger = new Ctor(total * item);
      bigger.set(arr.subarray(0, Math.min(arr.length, total * item)));
      arr = bigger;
    }
    for (let i = 0; i < dup.src.length; i++) {
      const d = dup.base + i;
      const v = dup.src[i];
      for (let c = 0; c < item; c++) arr[d * item + c] = arr[v * item + c];
    }
    if (arr !== attr.array) geometry.setAttribute(name, new THREE.BufferAttribute(arr, item, attr.normalized));
    else attr.needsUpdate = true;
  }
}

/**
 * Sin foto de espalda, la nuca es el frente espejado y enseñaba los ojos y la
 * boca por detrás. Se tapan con el color de lo alto de la cabeza (pelo o
 * melena) estirado hacia abajo, y se aplana su relieve.
 */
export function clearNapeFace(
  albedo: Uint8Array,
  normal: Uint8Array,
  atlasW: number,
  mask: Uint8Array,
  w: number,
  layout: FaceLayout
) {
  let top = -1;
  for (let y = 0; y < w && top < 0; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] === 1) {
        top = y;
        break;
      }
    }
  }
  if (top < 0) return;
  const Hh = Math.max(4, layout.chinY - top);
  const bandEnd = Math.round(top + 0.14 * Hh);
  // El atlas guarda cada texel del tensor en su mismo índice; la espalda va
  // en el cuadrante de arriba a la derecha (columnas w..2w-1).
  const colR = new Float32Array(w).fill(-1);
  const colG = new Float32Array(w);
  const colB = new Float32Array(w);
  let gr = 0, gg = 0, gb = 0, gn = 0;
  for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = top + 1; y <= bandEnd; y++) {
      if (mask[y * w + x] !== 1) continue;
      const o = (y * atlasW + x) * 4;
      r += albedo[o];
      g += albedo[o + 1];
      b += albedo[o + 2];
      n++;
    }
    if (n) {
      colR[x] = r / n;
      colG[x] = g / n;
      colB[x] = b / n;
      gr += r;
      gg += g;
      gb += b;
      gn += n;
    }
  }
  if (!gn) return;
  gr /= gn;
  gg /= gn;
  gb /= gn;
  const features = new Set<FacePartId>(['eyes', 'nose', 'mouth']);
  const span = Math.max(4, layout.chinY - layout.eyeY);
  const napeTop = layout.eyeY - 0.55 * span;
  const napeBottom = layout.chinY + 0.08 * span;
  const nape: FaceEllipse = {
    id: 'whole',
    cx: layout.centerX,
    cy: (napeTop + napeBottom) / 2,
    rx: layout.faceHalf,
    ry: (napeBottom - napeTop) / 2,
  };
  const napeSet = new Set<FacePartId>(['whole']);
  for (let y = Math.max(0, top); y <= Math.min(w - 1, Math.round(layout.chinY + 4)); y++) {
    for (let bx = 0; bx < w; bx++) {
      const fx = w - 1 - bx; // la espalda es el frente espejado
      const wgt = Math.max(featureWeight(layout.parts, features, fx, y, 1.25), featureWeight([nape], napeSet, fx, y));
      if (wgt <= 0) continue;
      const hasCol = colR[fx] >= 0;
      const r = hasCol ? colR[fx] : gr;
      const g = hasCol ? colG[fx] : gg;
      const b = hasCol ? colB[fx] : gb;
      const o = (y * atlasW + w + bx) * 4;
      albedo[o] = Math.round(albedo[o] + (r - albedo[o]) * wgt);
      albedo[o + 1] = Math.round(albedo[o + 1] + (g - albedo[o + 1]) * wgt);
      albedo[o + 2] = Math.round(albedo[o + 2] + (b - albedo[o + 2]) * wgt);
      normal[o] = Math.round(normal[o] + (128 - normal[o]) * wgt);
      normal[o + 1] = Math.round(normal[o + 1] + (128 - normal[o + 1]) * wgt);
      normal[o + 2] = Math.round(normal[o + 2] + (255 - normal[o + 2]) * wgt);
    }
  }
}
