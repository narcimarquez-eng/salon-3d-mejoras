// ============================================================================
// AFINADO DE SILUETAS
// Dos correcciones que no dependen del molde 3D sino de cómo se lee el dibujo:
//
//  1. RECORTE DEL CONTORNO. El arte cel-shade lleva una línea negra gruesa
//     alrededor de la figura. Esa línea es parte del recorte, así que la
//     silueta sale engordada media línea por cada lado, en las cuatro vistas, y
//     el error se acumula al cruzarlas. Aquí se mide el grosor real del borde
//     oscuro y se recorta la mitad, pero solo donde la pieza es lo bastante
//     gruesa como para permitírselo: una cola fina o un bigote no se tocan.
//
//  2. FUSIÓN DE LOS DOS PERFILES. En una hoja de 4 o 5 columnas hay perfil
//     izquierdo y derecho del mismo cuerpo. Son la misma silueta vista desde
//     ±X, así que cualquier diferencia entre ellas es error de pose o de
//     dibujo. Se promedian sus campos de distancia con signo (la forma media,
//     no la intersección, que encogería el cuerpo si están desalineados).
// ============================================================================

/** Distancia con signo a la silueta, en píxeles: > 0 dentro, < 0 fuera. */
function signedDistance(mask: Uint8Array, w: number): Float32Array {
  const INF = 1e9;
  const inD = new Float32Array(w * w);
  const outD = new Float32Array(w * w);
  for (let i = 0; i < w * w; i++) {
    inD[i] = mask[i] === 1 ? INF : 0;
    outD[i] = mask[i] === 1 ? 0 : INF;
  }
  const chamfer = (d: Float32Array) => {
    // Dos pasadas (3-4 chamfer): barato y con menos de un 2% de error frente a la euclídea.
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + 3);
        if (y > 0) v = Math.min(v, d[i - w] + 3);
        if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + 4);
        if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + 4);
        d[i] = v;
      }
    }
    for (let y = w - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        let v = d[i];
        if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
        if (y < w - 1) v = Math.min(v, d[i + w] + 3);
        if (x < w - 1 && y < w - 1) v = Math.min(v, d[i + w + 1] + 4);
        if (x > 0 && y < w - 1) v = Math.min(v, d[i + w - 1] + 4);
        d[i] = v;
      }
    }
    for (let i = 0; i < w * w; i++) d[i] /= 3;
  };
  chamfer(inD);
  chamfer(outD);
  const sdf = new Float32Array(w * w);
  for (let i = 0; i < w * w; i++) sdf[i] = mask[i] === 1 ? inD[i] : -outD[i];
  return sdf;
}

/**
 * Grosor, en píxeles, de la línea de contorno oscura que rodea la figura.
 * Devuelve 0 si el dibujo no tiene contorno marcado (fotos, render suave):
 * así el recorte solo actúa sobre arte con línea.
 */
export function estimateOutlineThickness(
  mask: Uint8Array,
  rgb: Float32Array | null | undefined,
  w: number
): number {
  if (!rgb) return 0;
  const sdf = signedDistance(mask, w);
  const MAXD = 7;
  const darkAt = new Float64Array(MAXD + 1);
  const totalAt = new Float64Array(MAXD + 1);
  for (let i = 0; i < w * w; i++) {
    if (mask[i] !== 1) continue;
    const d = Math.round(sdf[i]);
    if (d < 1 || d > MAXD) continue;
    const o = i * 3;
    // Luma perceptual; la línea de contorno es claramente más oscura que el relleno.
    const luma = 0.2126 * rgb[o] + 0.7152 * rgb[o + 1] + 0.0722 * rgb[o + 2];
    totalAt[d]++;
    if (luma < 0.3) darkAt[d]++;
  }
  if (totalAt[1] < 40) return 0;
  let thickness = 0;
  for (let d = 1; d <= MAXD; d++) {
    if (totalAt[d] < 25) break;
    if (darkAt[d] / totalAt[d] < 0.5) break;
    thickness = d;
  }
  return thickness;
}

/**
 * Encoge la silueta `px` píxeles, pero solo donde la pieza mide al menos
 * `4 * px` de ancho, para no comerse colas, cuernos, bigotes ni dedos.
 */
export function trimOutline(mask: Uint8Array, w: number, px: number): Uint8Array {
  if (px <= 0) return mask;
  const sdf = signedDistance(mask, w);
  // Radio local de la pieza: el máximo de la distancia interior en su entorno.
  const radius = new Float32Array(w * w);
  const r = Math.max(2, Math.ceil(px * 2));
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] !== 1) continue;
      let mx = sdf[i];
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= w) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const v = sdf[yy * w + xx];
          if (v > mx) mx = v;
        }
      }
      radius[i] = mx;
    }
  }
  const out = new Uint8Array(w * w);
  for (let i = 0; i < w * w; i++) {
    if (mask[i] !== 1) continue;
    const isRim = sdf[i] <= px;
    const isThinPart = radius[i] < px * 4;
    // Se quita solo el borde de las piezas gruesas; el interior y las piezas finas se mantienen.
    out[i] = !isRim || isThinPart ? 1 : 0;
  }
  return out;
}

/** Solape (IoU) entre dos siluetas, para saber si hace falta espejar una de ellas. */
export function maskIoU(a: Uint8Array, b: Uint8Array, w: number): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < w * w; i++) {
    const x = a[i] === 1;
    const y = b[i] === 1;
    if (x && y) inter++;
    if (x || y) union++;
  }
  return union > 0 ? inter / union : 0;
}

/** Espeja la silueta en X (un perfil izquierdo queda alineado con el derecho). */
export function mirrorMaskX(mask: Uint8Array, w: number): Uint8Array {
  const out = new Uint8Array(w * w);
  for (let y = 0; y < w; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) out[row + x] = mask[row + (w - 1 - x)];
  }
  return out;
}

function maskBounds(mask: Uint8Array, w: number) {
  let x0 = w, x1 = -1, y0 = w, y1 = -1;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] === 1) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, x1, y0, y1, empty: x1 < 0 };
}

/**
 * Forma media de dos siluetas del mismo cuerpo. `b` se encaja primero en la
 * caja de `a` (si las dos vistas están dibujadas a distinta escala o altura,
 * promediarlas sin encajarlas destrozaría la silueta) y luego se promedian sus
 * campos de distancia con signo, que es la media geométrica de las dos formas.
 */
export function averageSilhouettes(
  a: Uint8Array,
  b: Uint8Array,
  w: number,
  weightB = 0.5
): Uint8Array {
  const ba = maskBounds(a, w);
  const bb = maskBounds(b, w);
  if (ba.empty || bb.empty) return a;
  const sx = (ba.x1 - ba.x0 + 1) / Math.max(1, bb.x1 - bb.x0 + 1);
  const sy = (ba.y1 - ba.y0 + 1) / Math.max(1, bb.y1 - bb.y0 + 1);
  // Encajes absurdos (una vista casi vacía) se descartan en vez de deformar nada.
  if (sx < 0.55 || sx > 1.8 || sy < 0.55 || sy > 1.8) return a;

  const fitted = new Uint8Array(w * w);
  for (let y = 0; y < w; y++) {
    const srcY = Math.round(bb.y0 + (y - ba.y0) / sy);
    if (srcY < 0 || srcY >= w) continue;
    for (let x = 0; x < w; x++) {
      const srcX = Math.round(bb.x0 + (x - ba.x0) / sx);
      if (srcX < 0 || srcX >= w) continue;
      fitted[y * w + x] = b[srcY * w + srcX];
    }
  }

  // Si tras encajarlas siguen sin parecerse, no son la misma pose (o una de las dos vistas
  // trae basura en su recorte): promediarlas estropearía la silueta, así que se deja `a`.
  let inter = 0;
  let union = 0;
  for (let i = 0; i < w * w; i++) {
    const x = a[i] === 1;
    const y = fitted[i] === 1;
    if (x && y) inter++;
    if (x || y) union++;
  }
  if (union === 0 || inter / union < 0.82) return a;

  const sa = signedDistance(a, w);
  const sb = signedDistance(fitted, w);
  const kb = Math.max(0, Math.min(1, weightB));
  const out = new Uint8Array(w * w);
  for (let i = 0; i < w * w; i++) {
    out[i] = sa[i] * (1 - kb) + sb[i] * kb > 0 ? 1 : 0;
  }
  return out;
}
