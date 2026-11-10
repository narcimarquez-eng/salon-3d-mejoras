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

/**
 * Caja del trozo conexo MÁS GRANDE de la silueta.
 *
 * Para encajar dos vistas hay que medirlas por la figura, no por todo lo que haya en la
 * imagen. Si un recorte arrastra un boceto suelto, una firma o una cota, la caja de la
 * máscara entera se estira y la escala sale mal: se acaba encajando "figura + basura"
 * contra "figura". El trozo más grande siempre es la figura.
 */
export function largestBlobBounds(mask: Uint8Array, w: number) {
  const n = w * w;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let best = { x0: w, x1: -1, y0: w, y1: -1, empty: true, area: 0 };
  for (let start = 0; start < n; start++) {
    if (mask[start] !== 1 || seen[start]) continue;
    let qh = 0;
    let qt = 0;
    queue[qt++] = start;
    seen[start] = 1;
    let x0 = w, x1 = -1, y0 = w, y1 = -1;
    while (qh < qt) {
      const i = queue[qh++];
      const x = i % w;
      const y = (i / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && mask[i - 1] === 1 && !seen[i - 1]) { seen[i - 1] = 1; queue[qt++] = i - 1; }
      if (x < w - 1 && mask[i + 1] === 1 && !seen[i + 1]) { seen[i + 1] = 1; queue[qt++] = i + 1; }
      if (y > 0 && mask[i - w] === 1 && !seen[i - w]) { seen[i - w] = 1; queue[qt++] = i - w; }
      if (y < w - 1 && mask[i + w] === 1 && !seen[i + w]) { seen[i + w] = 1; queue[qt++] = i + w; }
    }
    if (qt > best.area) best = { x0, x1, y0, y1, empty: false, area: qt };
  }
  return best;
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
  const ba = largestBlobBounds(a, w);
  const bb = largestBlobBounds(b, w);
  if (ba.empty || bb.empty) return a;

  const aCx = 0.5 * (ba.x0 + ba.x1);
  const aCy = 0.5 * (ba.y0 + ba.y1);
  const bCx = 0.5 * (bb.x0 + bb.x1);
  const bCy = 0.5 * (bb.y0 + bb.y1);
  const sx0 = (ba.x1 - ba.x0 + 1) / Math.max(1, bb.x1 - bb.x0 + 1);
  const sy0 = (ba.y1 - ba.y0 + 1) / Math.max(1, bb.y1 - bb.y0 + 1);
  if (sx0 < 0.5 || sx0 > 2.0 || sy0 < 0.5 || sy0 > 2.0) return a;

  /** Remuestrea `b` con la escala y el desplazamiento dados, en coordenadas de `a`. */
  const warp = (sx: number, sy: number, dx: number, dy: number, step: number, out?: Uint8Array) => {
    let inter = 0;
    let union = 0;
    for (let y = 0; y < w; y += step) {
      const srcY = Math.round(bCy + (y - aCy - dy) / sy);
      for (let x = 0; x < w; x += step) {
        const srcX = Math.round(bCx + (x - aCx - dx) / sx);
        const inB =
          srcX >= 0 && srcX < w && srcY >= 0 && srcY < w && b[srcY * w + srcX] === 1;
        if (out && inB) out[y * w + x] = 1;
        if (!out) {
          const inA = a[y * w + x] === 1;
          if (inA && inB) inter++;
          if (inA || inB) union++;
        }
      }
    }
    return union > 0 ? inter / union : 0;
  };

  // La caja da una primera estimación, pero cuando un recorte arrastra algo pegado a la
  // figura (un boceto suelto que la toca) la caja miente. Así que se BUSCA la escala y el
  // desplazamiento que hacen coincidir de verdad las dos siluetas, quedándose con los que
  // maximizan el solape. Es lo mismo que ajustar el tamaño de un lado hasta que encaje.
  let best = { sx: sx0, sy: sy0, dx: 0, dy: 0, iou: warp(sx0, sy0, 0, 0, 2) };
  const shift = Math.round(w * 0.06);
  for (const m of [0.84, 0.88, 0.92, 0.96, 1.0, 1.04, 1.08, 1.13, 1.18]) {
    for (let dy = -shift; dy <= shift; dy += Math.max(2, Math.round(shift / 3))) {
      for (let dx = -shift; dx <= shift; dx += Math.max(2, Math.round(shift / 3))) {
        const sx = sx0 * m;
        const sy = sy0 * m;
        if (sx < 0.45 || sx > 2.2 || sy < 0.45 || sy > 2.2) continue;
        const iou = warp(sx, sy, dx, dy, 2);
        if (iou > best.iou) best = { sx, sy, dx, dy, iou };
      }
    }
  }

  // Si ni con el mejor encaje se parecen, no son la misma pose (o una vista trae basura):
  // promediarlas estropearía la silueta, así que se deja `a` tal cual.
  if (best.iou < 0.82) return a;

  const fitted = new Uint8Array(w * w);
  warp(best.sx, best.sy, best.dx, best.dy, 1, fitted);

  const sa = signedDistance(a, w);
  const sb = signedDistance(fitted, w);
  const kb = Math.max(0, Math.min(1, weightB));
  const out = new Uint8Array(w * w);
  for (let i = 0; i < w * w; i++) {
    out[i] = sa[i] * (1 - kb) + sb[i] * kb > 0 ? 1 : 0;
  }
  return out;
}
