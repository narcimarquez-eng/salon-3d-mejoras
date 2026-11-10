// ============================================================================
// PATAS Y RABOS
// ----------------------------------------------------------------------------
// Dos piezas del modo "patas y rabos" del panel de humanos:
//
//   1. cutThinBridges: corta los hilos finos (cuerdas, pelos sueltos, cadenas,
//      sombras) que unen dos partes de la silueta. Si no se cortan, el hilo
//      encierra el hueco que hay entre las partes, el recorte lo rellena y el
//      personaje sale con una membrana entre la mano y el muslo o entre las
//      dos piernas.
//   2. classifyLowerParts: mira lo que cuelga por debajo de la entrepierna y
//      dice qué es pata, qué es brazo y qué es rabo, para que el rabo tenga su
//      propio tubo redondo, quede detrás de las piernas y se mueva con la
//      cadera en vez de con una pierna.
// ============================================================================

/** Mapa de grosor: radio del mayor disco inscrito que cubre cada píxel. */
export function thicknessMap(mask: Uint8Array, w: number): Float32Array {
  const n = w * w;
  const D = new Float32Array(n);
  const R = new Float32Array(n);
  const INF = 1e6;
  for (let i = 0; i < n; i++) D[i] = mask[i] === 1 ? INF : 0;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (D[i] === 0) continue;
      let d = D[i];
      if (x === 0 || y === 0) d = Math.min(d, 1);
      if (x > 0) d = Math.min(d, D[i - 1] + 1);
      if (y > 0) {
        d = Math.min(d, D[i - w] + 1);
        if (x > 0) d = Math.min(d, D[i - w - 1] + 1.4142);
        if (x < w - 1) d = Math.min(d, D[i - w + 1] + 1.4142);
      }
      D[i] = d;
    }
  }
  for (let y = w - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (D[i] === 0) continue;
      let d = D[i];
      if (x === w - 1 || y === w - 1) d = Math.min(d, 1);
      if (x < w - 1) d = Math.min(d, D[i + 1] + 1);
      if (y < w - 1) {
        d = Math.min(d, D[i + w] + 1);
        if (x < w - 1) d = Math.min(d, D[i + w + 1] + 1.4142);
        if (x > 0) d = Math.min(d, D[i + w - 1] + 1.4142);
      }
      D[i] = d;
    }
  }
  for (let i = 0; i < n; i++) if (D[i] > 0) D[i] -= 0.5;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = D[i];
      if (r < 1) continue;
      // Solo los centros (máximos locales) pintan su disco.
      if (
        (x > 0 && D[i - 1] > r + 0.5) ||
        (x < w - 1 && D[i + 1] > r + 0.5) ||
        (y > 0 && D[i - w] > r + 0.5) ||
        (y < w - 1 && D[i + w] > r + 0.5)
      ) {
        continue;
      }
      const ri = Math.ceil(r);
      const r2 = r * r;
      for (let dy = -ri; dy <= ri; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= w) continue;
        for (let dx = -ri; dx <= ri; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (R[j] < r) R[j] = r;
        }
      }
    }
  }
  return R;
}

const N8 = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export interface BridgeCutResult {
  /** 1 = píxel quitado por ser un hilo que unía dos partes. */
  cut: Uint8Array;
  /** Cuántos hilos se han cortado. */
  count: number;
}

/**
 * Quita de `mask` (en el sitio) los hilos finos que unen dos partes.
 *
 * Un trozo fino (más estrecho que `maxWidth` píxeles) es un hilo si toca la
 * parte gruesa de la silueta por dos sitios separados. Si solo la toca por un
 * lado es un apéndice (un dedo, la punta del rabo, un mechón) y se deja.
 * Los hilos pequeños se quitan enteros; si el trozo fino es grande (un rabo
 * muy delgado cuya punta roza una pierna), solo se corta cerca de los
 * contactos secundarios y se queda pegado a su raíz.
 */
export function cutThinBridges(mask: Uint8Array, w: number, maxWidth: number): BridgeCutResult {
  const n = w * w;
  const cut = new Uint8Array(n);
  const R = thicknessMap(mask, w);
  const thin = new Uint8Array(n);
  let area = 0;
  for (let i = 0; i < n; i++) {
    if (mask[i] !== 1) continue;
    area++;
    if (R[i] * 2 <= maxWidth) thin[i] = 1;
  }
  if (area === 0) return { cut, count: 0 };

  const label = new Int32Array(n).fill(-1);
  const contactMark = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const contactQueue = new Int32Array(n);
  const smallLimit = Math.max(24, area * 0.006);
  const minSpread = Math.max(4, maxWidth * 1.5);
  let comp = 0;
  let count = 0;

  for (let s = 0; s < n; s++) {
    if (thin[s] !== 1 || label[s] >= 0) continue;
    // 1) Trozo fino conexo (8 vecinos) y sus contactos con la parte gruesa.
    let qh = 0;
    let qt = 0;
    queue[qt++] = s;
    label[s] = comp;
    let nc = 0;
    while (qh < qt) {
      const i = queue[qh++];
      const x = i % w;
      const y = (i / w) | 0;
      for (const [dx, dy] of N8) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= w) continue;
        const j = yy * w + xx;
        if (mask[j] !== 1) continue;
        if (thin[j] === 1) {
          if (label[j] < 0) {
            label[j] = comp;
            queue[qt++] = j;
          }
        } else if (contactMark[j] !== comp) {
          contactMark[j] = comp;
          contactQueue[nc++] = j;
        }
      }
    }
    const pieceSize = qt;
    comp++;
    if (nc < 2) continue;

    // 2) Agrupa los contactos por cercanía: cada grupo es un sitio donde el
    //    trozo fino se apoya en la parte gruesa.
    const group = new Map<number, number>();
    const groups: { sx: number; sy: number; n: number; members: number[] }[] = [];
    for (let c = 0; c < nc; c++) {
      const start = contactQueue[c];
      if (group.has(start)) continue;
      const g = { sx: 0, sy: 0, n: 0, members: [] as number[] };
      const stack = [start];
      group.set(start, groups.length);
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % w;
        const y = (i / w) | 0;
        g.sx += x;
        g.sy += y;
        g.n++;
        g.members.push(i);
        for (const [dx, dy] of N8) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= w) continue;
          const j = yy * w + xx;
          if (contactMark[j] !== comp - 1 || group.has(j)) continue;
          group.set(j, groups.length);
          stack.push(j);
        }
      }
      groups.push(g);
    }
    if (groups.length < 2) continue;
    let spread = 0;
    for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        const d = Math.hypot(
          groups[a].sx / groups[a].n - groups[b].sx / groups[b].n,
          groups[a].sy / groups[a].n - groups[b].sy / groups[b].n
        );
        if (d > spread) spread = d;
      }
    }
    if (spread < minSpread) continue;
    count++;

    if (pieceSize <= smallLimit) {
      // Hilo: fuera entero.
      for (let k = 0; k < pieceSize; k++) {
        const i = queue[k];
        mask[i] = 0;
        cut[i] = 1;
      }
      continue;
    }
    // Trozo fino grande: se queda pegado al contacto principal y se corta a
    // poca distancia (recorrida por dentro del trozo) de los demás.
    let root = 0;
    for (let g = 1; g < groups.length; g++) if (groups[g].n > groups[root].n) root = g;
    const reach = Math.max(3, Math.round(maxWidth + 2));
    const dist = new Map<number, number>();
    const bfs: number[] = [];
    for (let g = 0; g < groups.length; g++) {
      if (g === root) continue;
      for (const m of groups[g].members) {
        const x = m % w;
        const y = (m / w) | 0;
        for (const [dx, dy] of N8) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= w) continue;
          const j = yy * w + xx;
          if (label[j] !== comp - 1 || dist.has(j)) continue;
          dist.set(j, 1);
          bfs.push(j);
        }
      }
    }
    for (let h = 0; h < bfs.length; h++) {
      const i = bfs[h];
      const d = dist.get(i)!;
      mask[i] = 0;
      cut[i] = 1;
      if (d >= reach) continue;
      const x = i % w;
      const y = (i / w) | 0;
      for (const [dx, dy] of N8) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= w) continue;
        const j = yy * w + xx;
        if (label[j] !== comp - 1 || dist.has(j)) continue;
        dist.set(j, d + 1);
        bfs.push(j);
      }
    }
  }
  return { cut, count };
}

/**
 * Deja en `mask` (en el sitio) solo las partes con tamaño de verdad: la mayor
 * y las que tengan al menos `minFraction` de su tamaño. Así una pata o un rabo
 * que se ha quedado suelto al cortar sus hilos no desaparece, pero las motas
 * de sombra sí.
 */
export function keepSignificantComponents(mask: Uint8Array, w: number, minFraction = 0.02, minPixels = 25) {
  const n = w * w;
  const label = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const sizes: number[] = [];
  for (let s = 0; s < n; s++) {
    if (mask[s] !== 1 || label[s] >= 0) continue;
    const c = sizes.length;
    let qh = 0;
    let qt = 0;
    queue[qt++] = s;
    label[s] = c;
    while (qh < qt) {
      const i = queue[qh++];
      const x = i % w;
      if (x > 0 && mask[i - 1] === 1 && label[i - 1] < 0) { label[i - 1] = c; queue[qt++] = i - 1; }
      if (x < w - 1 && mask[i + 1] === 1 && label[i + 1] < 0) { label[i + 1] = c; queue[qt++] = i + 1; }
      if (i >= w && mask[i - w] === 1 && label[i - w] < 0) { label[i - w] = c; queue[qt++] = i - w; }
      if (i < n - w && mask[i + w] === 1 && label[i + w] < 0) { label[i + w] = c; queue[qt++] = i + w; }
    }
    sizes.push(qt);
  }
  if (!sizes.length) return;
  const biggest = Math.max(...sizes);
  const min = Math.max(minPixels, biggest * minFraction);
  for (let i = 0; i < n; i++) if (mask[i] === 1 && sizes[label[i]] < min) mask[i] = 0;
}

export type LowerPartKind = 'pata' | 'rabo' | 'brazo' | 'pieza';

export interface LowerPart {
  kind: LowerPartKind;
  area: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface LowerPartsResult {
  /** 1 = píxel de rabo. */
  tail: Uint8Array;
  parts: LowerPart[];
  legs: number;
  tails: number;
}

/**
 * Clasifica lo que hay por debajo de la entrepierna:
 * - pata: llega al suelo y es ancha (si una sola pieza cruza el eje, son dos
 *   patas juntas);
 * - brazo: cuelga desde fuera de la cadera y no llega al suelo;
 * - rabo: pieza alargada y claramente más estrecha que las patas;
 * - pieza: lo demás (un faldón, una bolsa...), que se deja como estaba.
 */
export function classifyLowerParts(
  mask: Uint8Array,
  w: number,
  lm: { top: number; bottom: number; axisX: number; crotchY: number },
  opts: { sideView?: boolean } = {}
): LowerPartsResult {
  const n = w * w;
  const tail = new Uint8Array(n);
  const H = Math.max(1, lm.bottom - lm.top + 1);
  const y0 = lm.crotchY + 1;
  const result: LowerPartsResult = { tail, parts: [], legs: 0, tails: 0 };
  if (y0 >= lm.bottom - 2) return result;

  // Cadera: tramo del eje en la fila de la entrepierna.
  let ha = lm.axisX - 0.12 * H;
  let hb = lm.axisX + 0.12 * H;
  {
    const y = lm.crotchY;
    let a = -1;
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let x = 0; x <= w; x++) {
      const on = x < w && mask[y * w + x] === 1;
      if (on && a < 0) a = x;
      if (!on && a >= 0) {
        const b = x - 1;
        const d = lm.axisX < a ? a - lm.axisX : lm.axisX > b ? lm.axisX - b : 0;
        if (d < bestD) {
          bestD = d;
          best = [a, b];
        }
        a = -1;
      }
    }
    if (best) {
      ha = best[0];
      hb = best[1];
    }
  }

  const label = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  interface Info extends LowerPart {
    topSumX: number;
    topN: number;
    rows: number;
  }
  const infos: Info[] = [];
  for (let s = y0 * w; s < n; s++) {
    if (mask[s] !== 1 || label[s] >= 0) continue;
    const c = infos.length;
    const info: Info = {
      kind: 'pieza', area: 0, minX: w, maxX: -1, minY: w, maxY: -1,
      topSumX: 0, topN: 0, rows: 0,
    };
    let qh = 0;
    let qt = 0;
    queue[qt++] = s;
    label[s] = c;
    const rowsSeen = new Set<number>();
    while (qh < qt) {
      const i = queue[qh++];
      const x = i % w;
      const y = (i / w) | 0;
      info.area++;
      rowsSeen.add(y);
      if (x < info.minX) info.minX = x;
      if (x > info.maxX) info.maxX = x;
      if (y < info.minY) info.minY = y;
      if (y > info.maxY) info.maxY = y;
      if (y === y0) {
        info.topSumX += x;
        info.topN++;
      }
      if (x > 0 && mask[i - 1] === 1 && label[i - 1] < 0) { label[i - 1] = c; queue[qt++] = i - 1; }
      if (x < w - 1 && mask[i + 1] === 1 && label[i + 1] < 0) { label[i + 1] = c; queue[qt++] = i + 1; }
      if (y > y0 && mask[i - w] === 1 && label[i - w] < 0) { label[i - w] = c; queue[qt++] = i - w; }
      if (i < n - w && mask[i + w] === 1 && label[i + w] < 0) { label[i + w] = c; queue[qt++] = i + w; }
    }
    info.rows = rowsSeen.size;
    infos.push(info);
  }
  const groundY = lm.bottom - Math.max(2, 0.03 * H);
  const minArea = Math.max(12, 0.002 * H * H);
  const meanWidth = (p: Info) => p.area / Math.max(1, p.rows);
  const touchesGround = (p: Info) => p.maxY >= groundY;
  const spansAxis = (p: Info) => p.minX < lm.axisX - 1 && p.maxX > lm.axisX + 1;

  // Ancho de referencia de una pata: la pieza más ancha que llega al suelo
  // (la mitad si cruza el eje, porque entonces son las dos patas juntas).
  let legRef = 0;
  for (const p of infos) {
    if (p.area < minArea || !touchesGround(p)) continue;
    const mw = spansAxis(p) && p.maxX - p.minX > 0.18 * H ? meanWidth(p) / 2 : meanWidth(p);
    if (mw > legRef) legRef = mw;
  }

  for (const p of infos) {
    if (p.area < minArea) continue;
    const mw = meanWidth(p);
    const long = Math.max(p.maxX - p.minX + 1, p.maxY - p.minY + 1);
    const elongated = long >= 2.5 * mw;
    const narrow = legRef > 0 && mw < 0.62 * legRef;
    const topX = p.topN ? p.topSumX / p.topN : -1;
    const hangsOutsideHips = p.topN > 0 && (topX < ha || topX > hb);
    // En un perfil no hay brazos colgando: lo que cuelga por detrás es el rabo.
    if (!opts.sideView && hangsOutsideHips && !touchesGround(p)) p.kind = 'brazo';
    else if (narrow && elongated) p.kind = 'rabo';
    else if (touchesGround(p)) p.kind = 'pata';
    else p.kind = 'pieza';
  }

  for (let i = y0 * w; i < n; i++) {
    const l = label[i];
    if (l >= 0 && infos[l].kind === 'rabo') tail[i] = 1;
  }
  const isLeg = (i: number) => label[i] >= 0 && infos[label[i]].kind === 'pata' && infos[label[i]].area >= minArea;

  // Rabo pegado a una pata (la punta toca un pie, o el recorte los ha unido
  // por un punto): fila a fila, el tramo claramente más estrecho que el más
  // ancho de su fila es candidato a rabo; si los candidatos forman una franja
  // larga y estrecha, es un rabo.
  const L = Math.max(1, lm.bottom - y0 + 1);
  const cand = new Uint8Array(n);
  for (let y = y0; y <= lm.bottom; y++) {
    const runs: [number, number][] = [];
    let a = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && isLeg(y * w + x);
      if (on && a < 0) a = x;
      if (!on && a >= 0) {
        runs.push([a, x - 1]);
        a = -1;
      }
    }
    if (runs.length < 2) continue;
    let maxW = 0;
    for (const [ra, rb] of runs) maxW = Math.max(maxW, rb - ra + 1);
    for (const [ra, rb] of runs) {
      if (rb - ra + 1 >= 0.62 * maxW) continue;
      for (let x = ra; x <= rb; x++) cand[y * w + x] = 1;
    }
  }
  // Franjas estrechas candidatas (sin mirar aún su largo).
  const narrowMask = new Uint8Array(n);
  const seen = new Uint8Array(n);
  for (let s0 = y0 * w; s0 < n; s0++) {
    if (!cand[s0] || seen[s0]) continue;
    const region: number[] = [s0];
    seen[s0] = 1;
    let ry0 = w;
    let ry1 = -1;
    for (let h = 0; h < region.length; h++) {
      const i = region[h];
      const x = i % w;
      const y = (i / w) | 0;
      ry0 = Math.min(ry0, y);
      ry1 = Math.max(ry1, y);
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < y0 * w || j >= n || !cand[j] || seen[j]) continue;
        seen[j] = 1;
        region.push(j);
      }
    }
    const mw = region.length / Math.max(1, ry1 - ry0 + 1);
    if (legRef > 0 && mw >= 0.62 * legRef) continue;
    for (const i of region) narrowMask[i] = 1;
  }
  // Un hilo cortado o un roce puede partir el rabo en trozos: se cosen los
  // huecos verticales cortos que quedan dentro de la silueta.
  const maxGap = Math.max(5, Math.round(0.12 * L));
  for (let x = 0; x < w; x++) {
    let last = -1;
    for (let y = y0; y <= lm.bottom; y++) {
      const i = y * w + x;
      if (!narrowMask[i]) continue;
      if (last >= 0 && y - last > 1 && y - last <= maxGap) {
        let inside = true;
        for (let q = last + 1; q < y; q++) if (mask[q * w + x] !== 1) inside = false;
        if (inside) for (let q = last + 1; q < y; q++) narrowMask[q * w + x] = 1;
      }
      last = y;
    }
  }
  const seen2 = new Uint8Array(n);
  for (let s0 = y0 * w; s0 < n; s0++) {
    if (!narrowMask[s0] || seen2[s0]) continue;
    const region: number[] = [s0];
    seen2[s0] = 1;
    let ry0 = w;
    let ry1 = -1;
    let rx0 = w;
    let rx1 = -1;
    for (let h = 0; h < region.length; h++) {
      const i = region[h];
      const x = i % w;
      const y = (i / w) | 0;
      ry0 = Math.min(ry0, y);
      ry1 = Math.max(ry1, y);
      rx0 = Math.min(rx0, x);
      rx1 = Math.max(rx1, x);
      for (const [dx, dy] of N8) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < y0 || xx >= w || yy >= w) continue;
        const j = yy * w + xx;
        if (!narrowMask[j] || seen2[j]) continue;
        seen2[j] = 1;
        region.push(j);
      }
    }
    if (ry1 - ry0 + 1 < Math.max(6, 0.2 * L)) continue;
    for (const i of region) tail[i] = 1;
    result.tails++;
    result.parts.push({ kind: 'rabo', area: region.length, minX: rx0, maxX: rx1, minY: ry0, maxY: ry1 });
  }

  // Patas: cuántos tramos anchos (sin el rabo) hay en la parte media de las piernas.
  const counts: number[] = [];
  for (let y = Math.round(y0 + 0.3 * L); y <= Math.round(lm.bottom - 0.15 * L); y++) {
    const runs: number[] = [];
    let a = -1;
    for (let x = 0; x <= w; x++) {
      const i = y * w + x;
      const on = x < w && isLeg(i) && !tail[i];
      if (on && a < 0) a = x;
      if (!on && a >= 0) {
        runs.push(x - a);
        a = -1;
      }
    }
    const maxW = Math.max(0, ...runs);
    let c = 0;
    for (const r of runs) if (r >= 0.62 * maxW) c++;
    // Una sola pieza que cruza el eje y es el doble de ancha: dos patas juntas.
    if (c === 1 && maxW > 1.4 * legRef && legRef > 0) c = 2;
    if (c > 0) counts.push(c);
  }
  counts.sort((p, q) => p - q);
  result.legs = counts.length ? counts[counts.length >> 1] : 0;

  for (const p of infos) {
    if (p.area < minArea) continue;
    if (p.kind === 'rabo') result.tails++;
    result.parts.push({ kind: p.kind, area: p.area, minX: p.minX, maxX: p.maxX, minY: p.minY, maxY: p.maxY });
  }
  return result;
}

export interface SideViewParts extends LowerPartsResult {
  top: number;
  bottom: number;
  /** Fila de la barriga: por debajo solo hay patas (y quizá el rabo). */
  bellyY: number;
}

/**
 * Patas y rabo en una vista de PERFIL de un cuadrúpedo. La línea de la
 * barriga es la fila más baja donde el cuerpo todavía ocupa casi todo el
 * ancho; por debajo, lo que llega al suelo son patas y lo largo y estrecho
 * que no llega es el rabo.
 */
export function detectSideViewParts(mask: Uint8Array, w: number): SideViewParts | null {
  let top = -1;
  let bottom = -1;
  const widest = new Int32Array(w);
  const widestMid = new Float32Array(w);
  let maxW = 0;
  for (let y = 0; y < w; y++) {
    let a = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && mask[y * w + x] === 1;
      if (on && a < 0) a = x;
      if (!on && a >= 0) {
        const len = x - a;
        if (len > widest[y]) {
          widest[y] = len;
          widestMid[y] = (a + x - 1) / 2;
        }
        a = -1;
      }
    }
    if (widest[y] > 0) {
      if (top < 0) top = y;
      bottom = y;
    }
    maxW = Math.max(maxW, widest[y]);
  }
  if (top < 0 || bottom - top < 12 || maxW < 8) return null;
  let bellyY = -1;
  for (let y = bottom; y >= top; y--) {
    if (widest[y] >= 0.45 * maxW) {
      bellyY = y;
      break;
    }
  }
  if (bellyY < 0 || bellyY >= bottom - 3) return null;
  const res = classifyLowerParts(mask, w, { top, bottom, axisX: widestMid[bellyY], crotchY: bellyY }, { sideView: true });
  return { ...res, top, bottom, bellyY };
}

/** Tramos de una fila: [inicio, fin] de los píxeles de la silueta. */
function rowRuns(mask: Uint8Array, w: number, y: number): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let a = -1;
  for (let x = 0; x <= w; x++) {
    const on = x < w && mask[y * w + x] === 1;
    if (on && a < 0) a = x;
    if (!on && a >= 0) {
      runs.push([a, x - 1]);
      a = -1;
    }
  }
  return runs;
}

function median(v: number[]): number {
  if (!v.length) return NaN;
  const s = [...v].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
}

/**
 * Quita del recorte los píxeles casi blancos de las filas [y0, y1]: el fondo claro que la silueta
 * arrastra alrededor de las patas pálidas. Así el ancho medido es el de la pata. Devuelve cuántos.
 */
export function removeBrightHalo(
  mask: Uint8Array,
  rgb: Float32Array,
  w: number,
  y0: number,
  y1: number,
  removed: Uint8Array,
  thresh = 0.86
): number {
  let n = 0;
  for (let y = Math.max(0, y0); y <= Math.min(w - 1, y1); y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] !== 1) continue;
      const lum = 0.3 * rgb[i * 3] + 0.59 * rgb[i * 3 + 1] + 0.11 * rgb[i * 3 + 2];
      if (lum > thresh) {
        mask[i] = 0;
        removed[i] = 1;
        n++;
      }
    }
  }
  return n;
}

/**
 * Quita el sobrante que queda fuera del contorno de tinta: en cada fila, desde el borde de la
 * silueta hacia dentro, si en los `maxDepth` píxeles primeros aparece una línea oscura (la tinta del
 * dibujo), todo lo que hay entre el borde y esa línea se quita. Solo se mira dentro de [xa, xb].
 * Devuelve cuántos píxeles se han quitado.
 */
export function trimToInkEdge(
  mask: Uint8Array,
  rgb: Float32Array,
  w: number,
  y0: number,
  y1: number,
  xa: number,
  xb: number,
  removed: Uint8Array,
  maxDepth = 12,
  darkThresh = 0.4
): number {
  const dark = (i: number) => 0.3 * rgb[i * 3] + 0.59 * rgb[i * 3 + 1] + 0.11 * rgb[i * 3 + 2] < darkThresh;
  let n = 0;
  for (let y = Math.max(0, y0); y <= Math.min(w - 1, y1); y++) {
    for (const r of rowRuns(mask, w, y)) {
      if (r[1] < xa || r[0] > xb) continue;
      // Borde izquierdo: buscar la tinta hacia dentro
      for (let k = 0; k < maxDepth && r[0] + k <= r[1]; k++) {
        const x = r[0] + k;
        if (dark(y * w + x)) {
          for (let q = r[0]; q < x; q++) {
            if (mask[y * w + q] === 1) { mask[y * w + q] = 0; removed[y * w + q] = 1; n++; }
          }
          break;
        }
      }
      // Borde derecho
      for (let k = 0; k < maxDepth && r[1] - k >= r[0]; k++) {
        const x = r[1] - k;
        if (dark(y * w + x)) {
          for (let q = x + 1; q <= r[1]; q++) {
            if (mask[y * w + q] === 1) { mask[y * w + q] = 0; removed[y * w + q] = 1; n++; }
          }
          break;
        }
      }
    }
  }
  return n;
}

/** Una pata con su centro y su ancho, medidos en su franja media. */
export interface LegMeasure {
  cx: number;
  width: number;
}

/**
 * Patas de frente o de espalda: en la franja baja del cuerpo (entre la entrepierna y los pies)
 * se miran los dos tramos más anchos de cada fila. Devuelve el centro y el ancho de cada pata.
 * Si las dos patas van pegadas, devuelve una sola.
 */
export function measureLegsFromView(mask: Uint8Array, w: number): LegMeasure[] {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < w; y++) {
    if (rowRuns(mask, w, y).length) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  if (top < 0 || bottom - top < 20) return [];
  const h = bottom - top + 1;
  const y0 = Math.round(bottom - 0.35 * h);
  const y1 = Math.round(bottom - 0.1 * h);
  const lefts: number[] = [];
  const rights: number[] = [];
  const widthsL: number[] = [];
  const widthsR: number[] = [];
  let split = 0;
  let rows = 0;
  for (let y = y0; y <= y1; y++) {
    const runs = rowRuns(mask, w, y).filter(([a, b]) => b - a + 1 >= 3);
    if (!runs.length) continue;
    rows++;
    runs.sort((p, q) => q[1] - q[0] - (p[1] - p[0]));
    if (runs.length >= 2) {
      split++;
      const [r1, r2] = [runs[0], runs[1]].sort((p, q) => p[0] - q[0]);
      lefts.push(0.5 * (r1[0] + r1[1]));
      widthsL.push(r1[1] - r1[0] + 1);
      rights.push(0.5 * (r2[0] + r2[1]));
      widthsR.push(r2[1] - r2[0] + 1);
    } else {
      const [r1] = runs;
      lefts.push(0.5 * (r1[0] + r1[1]));
      widthsL.push(r1[1] - r1[0] + 1);
    }
  }
  if (!rows) return [];
  if (split >= 0.5 * rows && lefts.length) {
    return [
      { cx: median(lefts), width: median(widthsL) },
      { cx: median(rights), width: median(widthsR) },
    ];
  }
  return [{ cx: median(lefts), width: median(widthsL) }];
}

/**
 * Deja solo la pata (o la cola) en las filas [y0, y1]: en cada fila se queda el tramo que contiene
 * el centro `cx` y se recorta a `halfWidth` a cada lado. Con `requireSplit`, solo se toca la fila si
 * hay dos o más tramos (así no se corta el tronco cuando las patas aún están unidas).
 * Devuelve cuántos píxeles se han quitado.
 */
export function trimLegRows(
  mask: Uint8Array,
  w: number,
  y0: number,
  y1: number,
  cx: number,
  halfWidth: number,
  opts: { requireSplit?: boolean; removed?: Uint8Array; xRange?: [number, number] } = {}
): number {
  let removed = 0;
  for (let y = Math.max(0, y0); y <= Math.min(w - 1, y1); y++) {
    const runs = rowRuns(mask, w, y);
    if (!runs.length) continue;
    if (opts.requireSplit && runs.length < 2) continue;
    // Tramo que contiene el centro, o el más cercano a él
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const r of runs) {
      const d = cx >= r[0] && cx <= r[1] ? 0 : Math.min(Math.abs(cx - r[0]), Math.abs(cx - r[1]));
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    if (!best || bestD > halfWidth) continue;
    const lo = cx - halfWidth;
    const hi = cx + halfWidth;
    const [xa, xb] = opts.xRange ?? [0, w - 1];
    for (let x = best[0]; x <= best[1]; x++) {
      if (x >= lo && x <= hi) continue;
      if (x < xa || x > xb) continue;
      const i = y * w + x;
      if (mask[i] === 1) {
        mask[i] = 0;
        removed++;
        if (opts.removed) opts.removed[i] = 1;
      }
    }
  }
  return removed;
}

/** Centro y ancho de la pata en las filas [y0, y1]: el tramo más largo de cada fila, medido en [xMin, xMax]. */
function measureRunsInRows(
  mask: Uint8Array,
  w: number,
  y0: number,
  y1: number,
  xMin: number,
  xMax: number
): LegMeasure | null {
  const cs: number[] = [];
  const ws: number[] = [];
  for (let y = Math.max(0, y0); y <= Math.min(w - 1, y1); y++) {
    let best: [number, number] | null = null;
    for (const r of rowRuns(mask, w, y)) {
      if (r[1] < xMin || r[0] > xMax) continue;
      if (!best || r[1] - r[0] > best[1] - best[0]) best = r;
    }
    if (!best) continue;
    cs.push(0.5 * (best[0] + best[1]));
    ws.push(best[1] - best[0] + 1);
  }
  if (!cs.length) return null;
  return { cx: median(cs), width: median(ws) };
}

/**
 * Quita lo que sobra alrededor de las patas en una vista de frente o de espalda: mide las dos patas
 * en la franja baja y deja cada una a su ancho más `margin` píxeles a cada lado.
 * Devuelve los anchos medidos (para usarlos como grosor de las patas traseras en el perfil).
 */
export function trimViewLegs(
  mask: Uint8Array,
  w: number,
  removed: Uint8Array,
  rgb: Float32Array,
  margin = 2
): LegMeasure[] {
  {
    let t = -1;
    let b = -1;
    for (let y = 0; y < w; y++) if (rowRuns(mask, w, y).length) { if (t < 0) t = y; b = y; }
    if (t >= 0) removeBrightHalo(mask, rgb, w, Math.round(b - 0.45 * (b - t + 1)), b - 2, removed);
  }
  {
    let t = -1;
    let b = -1;
    for (let y = 0; y < w; y++) if (rowRuns(mask, w, y).length) { if (t < 0) t = y; b = y; }
    if (t >= 0) trimToInkEdge(mask, rgb, w, Math.round(b - 0.45 * (b - t + 1)), b - 2, 0, w - 1, removed);
  }
  const legs = measureLegsFromView(mask, w);
  if (!legs.length) return [];
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < w; y++) {
    if (rowRuns(mask, w, y).length) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  const h = bottom - top + 1;
  for (const leg of legs) {
    trimLegRows(mask, w, Math.round(bottom - 0.45 * h), bottom - 2, leg.cx, leg.width / 2 + margin, {
      requireSplit: legs.length > 1,
      removed,
    });
  }
  return legs;
}

/**
 * Quita lo que sobra alrededor de las patas y la cola en el perfil. La pata delantera (la de la
 * derecha) se mide en su propio perfil; la trasera (la de la izquierda) usa el grosor de la espalda,
 * `hindWidth`, porque en el perfil va tapada por la delantera. La cola se mide en su tramo.
 * Devuelve cuántas patas y colas se han limpiado.
 */
export function trimSideLegs(
  mask: Uint8Array,
  w: number,
  removed: Uint8Array,
  parts: { parts: LowerPart[]; bottom: number; bellyY: number },
  hindWidth: number | null,
  rgb: Float32Array,
  margin = 2
): number {
  const pats = parts.parts.filter((p) => p.kind === 'pata' && p.area > 0).sort((a, b) => a.minX - b.minX);
  // Solo debajo del vientre: por encima está el tronco, que no se toca
  const legTop = Math.round(parts.bellyY + 0.15 * (parts.bottom - parts.bellyY));
  removeBrightHalo(mask, rgb, w, legTop, parts.bottom - 2, removed);
  for (const p of pats) trimToInkEdge(mask, rgb, w, Math.max(legTop, p.minY), p.maxY - 2, p.minX - 4, p.maxX + 4, removed);
  let done = 0;
  pats.forEach((p, idx) => {
    const y0 = Math.max(legTop, p.minY);
    const own = measureRunsInRows(mask, w, y0, p.maxY - 2, p.minX - 4, p.maxX + 4);
    if (!own) return;
    const isHind = pats.length > 1 && idx === 0;
    const width = isHind && hindWidth ? hindWidth : own.width;
    // La pata en el perfil puede ir inclinada: el centro se sigue fila a fila (mediana de 5 filas)
    const centers: number[] = [];
    for (let y = y0; y <= p.maxY - 2; y++) {
      const m = measureRunsInRows(mask, w, y, y, p.minX - 4, p.maxX + 4);
      centers.push(m ? m.cx : own.cx);
    }
    for (let y = y0; y <= p.maxY - 2; y++) {
      const k = y - y0;
      const win = centers.slice(Math.max(0, k - 2), Math.min(centers.length, k + 3));
      const cx = median(win);
      trimLegRows(mask, w, y, y, cx, width / 2 + margin, { removed, xRange: [p.minX - 4, p.maxX + 4] });
    }
    done++;
  });
  for (const p of parts.parts.filter((q) => q.kind === 'rabo')) {
    const h = p.maxY - p.minY + 1;
    const own = measureRunsInRows(mask, w, p.minY, p.maxY, p.minX - 4, p.maxX + 4);
    if (!own) continue;
    trimLegRows(mask, w, p.minY, p.maxY, own.cx, own.width / 2 + margin, { removed, xRange: [p.minX - 2, p.maxX + 2] });
    done++;
    void h;
  }
  return done;
}
