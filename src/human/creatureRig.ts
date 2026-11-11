import * as THREE from 'three';
import type { HumanRig, RigBone } from './humanRig';

// ============================================================================
// ESQUELETO DE CRIATURA (cuadrúpedo, con o sin alas)
// ----------------------------------------------------------------------------
// `humanRig.ts` coloca un esqueleto humanoide de 19 huesos: columna VERTICAL
// (Hips -> Spine -> Chest -> Neck -> Head), dos brazos colgando del pecho y dos
// piernas de la cadera. En una persona funciona; en un león no hay por dónde
// cogerlo: la columna es HORIZONTAL, hay CUATRO patas (no dos brazos y dos
// piernas) y hay cola. Al emparejar el torso humano tumbado dentro del animal,
// `Walk` -que balancea unas piernas bajo un cuerpo vertical- lo descuartiza.
//
// Aquí se ajusta el esqueleto a la MALLA YA CONSTRUIDA, en 3D, en vez de a la
// silueta frontal. Es lo que permite distinguir las patas delanteras de las
// traseras: en la vista de frente están unas encima de otras, y solo se separan
// en Z. Por el mismo motivo los pesos de piel se calculan en 3D.
//
// Convenio de ejes de la malla: X = ancho (izquierda/derecha), Y = alto,
// Z = largo del cuerpo, con la CABEZA en +Z y la COLA en -Z.
// ============================================================================

export type CreatureKind = 'quadruped' | 'quadrupedWinged';

export interface CreatureRigResult {
  rig: HumanRig;
  kind: CreatureKind;
  /** Medidas usadas, para los clips y para depurar. */
  metrics: CreatureMetrics;
}

export interface CreatureMetrics {
  axisX: number;
  groundY: number;
  topY: number;
  bellyY: number;
  minZ: number;
  maxZ: number;
  height: number;
  length: number;
  bodyHalfWidth: number;
  hipZ: number;
  chestZ: number;
  hasWings: boolean;
  /** Alas abiertas en los clips de suelo (en vez de plegadas contra el lomo). */
  wingsOpenOnGround?: boolean;
}

type V3 = [number, number, number];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * ¿La malla es un bicho horizontal (cuadrúpedo, dragón, montura) o una figura
 * erguida? Se mide el largo contra el alto descontando la cola, que es fina y
 * alargaría la medida en cualquier bípedo con rabo.
 */
export function looksLikeQuadruped(positions: Float32Array): boolean {
  const n = positions.length / 3;
  if (n < 64) return false;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const H = maxY - minY;
  if (H <= 1e-6) return false;

  // Largo "con cuerpo": tramos de Z cuya sección vertical ocupa al menos el 25%
  // de la altura total. Así la cola y el hocico no cuentan como longitud de cuerpo.
  const NB = 40;
  const binTop = new Float32Array(NB).fill(-Infinity);
  const binBot = new Float32Array(NB).fill(Infinity);
  for (let i = 0; i < n; i++) {
    const z = positions[i * 3 + 2];
    const b = clamp(Math.floor(((z - minZ) / Math.max(1e-6, maxZ - minZ)) * NB), 0, NB - 1);
    const y = positions[i * 3 + 1];
    if (y > binTop[b]) binTop[b] = y;
    if (y < binBot[b]) binBot[b] = y;
  }
  let bodyBins = 0;
  for (let b = 0; b < NB; b++) {
    if (binTop[b] > -Infinity && binTop[b] - binBot[b] > H * 0.25) bodyBins++;
  }
  const bodyLength = ((maxZ - minZ) * bodyBins) / NB;
  return bodyLength > H * 1.05;
}

interface Bins {
  NB: number;
  minZ: number;
  maxZ: number;
  top: Float32Array;
  bot: Float32Array;
  xMin: Float32Array;
  xMax: Float32Array;
  count: Int32Array;
}

function makeBins(positions: Float32Array, NB: number): Bins {
  const n = positions.length / 3;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const z = positions[i * 3 + 2];
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const top = new Float32Array(NB).fill(-Infinity);
  const bot = new Float32Array(NB).fill(Infinity);
  const xMin = new Float32Array(NB).fill(Infinity);
  const xMax = new Float32Array(NB).fill(-Infinity);
  const count = new Int32Array(NB);
  const span = Math.max(1e-6, maxZ - minZ);
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const b = clamp(Math.floor(((z - minZ) / span) * NB), 0, NB - 1);
    if (y > top[b]) top[b] = y;
    if (y < bot[b]) bot[b] = y;
    if (x < xMin[b]) xMin[b] = x;
    if (x > xMax[b]) xMax[b] = x;
    count[b]++;
  }
  return { NB, minZ, maxZ, top, bot, xMin, xMax, count };
}

/** Z del bin b (centro). */
const binZ = (bins: Bins, b: number) => bins.minZ + ((b + 0.5) / bins.NB) * (bins.maxZ - bins.minZ);

/**
 * Agrupa los vértices de la franja de las patas en cuatro grupos
 * (delantera/trasera x izquierda/derecha) y devuelve, de cada uno, dónde se
 * engancha arriba y dónde apoya abajo.
 */
interface LegCluster {
  topX: number; topZ: number; topY: number;
  midX: number; midZ: number; midY: number;
  footX: number; footZ: number; footY: number;
  count: number;
}

function clusterLegs(
  positions: Float32Array,
  axisX: number,
  groundY: number,
  bellyY: number,
  splitZ: number
): Record<'FL' | 'FR' | 'HL' | 'HR', LegCluster> {
  const mk = (): LegCluster => ({
    topX: 0, topZ: 0, topY: 0, midX: 0, midZ: 0, midY: 0,
    footX: 0, footZ: 0, footY: 0, count: 0,
  });
  const acc: Record<string, { top: number[][]; mid: number[][]; foot: number[][] }> = {
    FL: { top: [], mid: [], foot: [] }, FR: { top: [], mid: [], foot: [] },
    HL: { top: [], mid: [], foot: [] }, HR: { top: [], mid: [], foot: [] },
  };
  const legH = Math.max(1e-6, bellyY - groundY);
  const n = positions.length / 3;
  for (let i = 0; i < n; i++) {
    const y = positions[i * 3 + 1];
    if (y > bellyY) continue;
    const x = positions[i * 3];
    const z = positions[i * 3 + 2];
    // En este motor la figura mira al espectador desde +Z, así que la derecha
    // del animal cae en X negativa (igual criterio que en humanRig).
    const side = x < axisX ? 'R' : 'L';
    const fb = z >= splitZ ? 'F' : 'H';
    const key = fb + side;
    const u = (y - groundY) / legH;
    if (u > 0.78) acc[key].top.push([x, y, z]);
    else if (u > 0.34 && u < 0.62) acc[key].mid.push([x, y, z]);
    else if (u < 0.14) acc[key].foot.push([x, y, z]);
  }
  const out: Record<string, LegCluster> = {};
  for (const key of ['FL', 'FR', 'HL', 'HR']) {
    const c = mk();
    const mean = (arr: number[][], k: number) =>
      arr.length ? arr.reduce((s, p) => s + p[k], 0) / arr.length : NaN;
    c.topX = mean(acc[key].top, 0); c.topY = mean(acc[key].top, 1); c.topZ = mean(acc[key].top, 2);
    c.midX = mean(acc[key].mid, 0); c.midY = mean(acc[key].mid, 1); c.midZ = mean(acc[key].mid, 2);
    c.footX = mean(acc[key].foot, 0); c.footY = mean(acc[key].foot, 1); c.footZ = mean(acc[key].foot, 2);
    c.count = acc[key].top.length + acc[key].mid.length + acc[key].foot.length;
    out[key] = c;
  }
  return out as Record<'FL' | 'FR' | 'HL' | 'HR', LegCluster>;
}

/**
 * Ajusta un esqueleto de cuadrúpedo (más alas, si las hay) a la malla.
 * Devuelve huesos en el mismo formato que `humanRig`, así que
 * `createSkeletonBones` y la exportación a .glb funcionan sin cambios.
 */
export interface CreatureRigOptions {
  /**
   * Medio ancho del tronco, si se conoce. Con las alas abiertas el ancho de cada tramo es el
   * de las alas, y entonces el tronco parecía enorme y las alas no se detectaban.
   */
  bodyHalfWidth?: number;
}

export function computeCreatureRig(positions: Float32Array, opts: CreatureRigOptions = {}): CreatureRigResult {
  const n = positions.length / 3;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const axisX = 0.5 * (minX + maxX);
  const groundY = minY;
  const topY = maxY;
  const H = Math.max(1e-6, topY - groundY);

  const NB = 56;
  const bins = makeBins(positions, NB);
  const L = Math.max(1e-6, bins.maxZ - bins.minZ);

  // --- Franja de las patas -------------------------------------------------
  // El vientre está donde la sección deja de ser "cuerpo" y pasa a ser patas.
  // Se toma el 44% inferior de la altura, que en un felino cae justo bajo el pecho.
  const bellyY = groundY + 0.44 * H;

  // Bins que son cuerpo de verdad (no cola ni hocico): su sección llega bien por
  // encima del vientre y tienen vértices de sobra.
  const isBodyBin = (b: number) =>
    bins.count[b] > n / (NB * 12) && bins.top[b] > bellyY + 0.12 * H;
  let bodyFirst = -1, bodyLast = -1;
  for (let b = 0; b < NB; b++) if (isBodyBin(b)) { if (bodyFirst < 0) bodyFirst = b; bodyLast = b; }
  if (bodyFirst < 0) { bodyFirst = 0; bodyLast = NB - 1; }

  // Corte delantera/trasera: el punto medio del cuerpo, afinado al bin con menos
  // material bajo el vientre (el hueco entre el codo y la rodilla).
  const midB = Math.round(0.5 * (bodyFirst + bodyLast));
  const lowCount = new Float32Array(NB);
  for (let i = 0; i < n; i++) {
    const y = positions[i * 3 + 1];
    if (y > bellyY) continue;
    const z = positions[i * 3 + 2];
    lowCount[clamp(Math.floor(((z - bins.minZ) / L) * NB), 0, NB - 1)]++;
  }
  let splitB = midB;
  let splitBest = Infinity;
  for (let b = Math.round(lerp(bodyFirst, bodyLast, 0.3)); b <= Math.round(lerp(bodyFirst, bodyLast, 0.7)); b++) {
    if (lowCount[b] < splitBest) { splitBest = lowCount[b]; splitB = b; }
  }
  const splitZ = binZ(bins, splitB);

  const legs = clusterLegs(positions, axisX, groundY, bellyY, splitZ);

  // Semiancho del cuerpo: mediana de los bins de cuerpo (ignora alas y patas abiertas).
  const halves: number[] = [];
  for (let b = bodyFirst; b <= bodyLast; b++) {
    if (bins.xMax[b] > -Infinity) halves.push(0.5 * (bins.xMax[b] - bins.xMin[b]));
  }
  halves.sort((a, b) => a - b);
  const bodyHalfWidth =
    opts.bodyHalfWidth && opts.bodyHalfWidth > 0
      ? opts.bodyHalfWidth
      : halves.length
      ? halves[halves.length >> 1]
      : 0.1 * H;

  // --- Columna -------------------------------------------------------------
  // Altura del espinazo en cada Z: entre el vientre y el lomo, tirando hacia arriba.
  const spineYAt = (z: number): number => {
    const b0 = clamp(Math.floor(((z - bins.minZ) / L) * NB), 0, NB - 1);
    // Un bin puede estar vacío (hueco del dibujo, punta de la cola): se busca el
    // más cercano con material, en vez de interpolar con los centinelas ±Infinity.
    let b = -1;
    for (let d = 0; d < NB; d++) {
      if (b0 - d >= 0 && bins.count[b0 - d] > 0) { b = b0 - d; break; }
      if (b0 + d < NB && bins.count[b0 + d] > 0) { b = b0 + d; break; }
    }
    if (b < 0) return lerp(bellyY, topY, 0.62);
    const t = bins.top[b];
    const lo = Math.max(bellyY, bins.bot[b]);
    return lerp(Math.min(lo, t), t, 0.62);
  };

  const fallbackZ = (v: number, alt: number) => (Number.isFinite(v) ? v : alt);
  const hipZ = fallbackZ(
    0.5 * (legs.HL.topZ + legs.HR.topZ),
    lerp(binZ(bins, bodyFirst), splitZ, 0.45)
  );
  const chestZ = fallbackZ(
    0.5 * (legs.FL.topZ + legs.FR.topZ),
    lerp(splitZ, binZ(bins, bodyLast), 0.55)
  );

  const bones: RigBone[] = [];
  const add = (name: string, parent: string | null, head: V3, tail: V3) =>
    bones.push({ name, parent, head, tail });

  const hips: V3 = [axisX, spineYAt(hipZ), hipZ];
  const spine1: V3 = [axisX, spineYAt(lerp(hipZ, chestZ, 0.34)), lerp(hipZ, chestZ, 0.34)];
  const spine2: V3 = [axisX, spineYAt(lerp(hipZ, chestZ, 0.67)), lerp(hipZ, chestZ, 0.67)];
  const chest: V3 = [axisX, spineYAt(chestZ), chestZ];

  // --- Cabeza y cuello -----------------------------------------------------
  // La cabeza es el bulto de delante que queda por encima del vientre.
  let headSumX = 0, headSumY = 0, headSumZ = 0, headN = 0;
  const headFromZ = lerp(chestZ, bins.maxZ, 0.45);
  for (let i = 0; i < n; i++) {
    const z = positions[i * 3 + 2];
    if (z < headFromZ) continue;
    const y = positions[i * 3 + 1];
    if (y < bellyY) continue;
    headSumX += positions[i * 3]; headSumY += y; headSumZ += z; headN++;
  }
  const headC: V3 = headN
    ? [axisX, headSumY / headN, headSumZ / headN]
    : [axisX, spineYAt(bins.maxZ), lerp(chestZ, bins.maxZ, 0.75)];
  const neck: V3 = [axisX, lerp(chest[1], headC[1], 0.55), lerp(chestZ, headC[2], 0.45)];
  const headTip: V3 = [axisX, headC[1], lerp(headC[2], bins.maxZ, 0.85)];

  add('Hips', null, hips, spine1);
  add('Spine1', 'Hips', spine1, spine2);
  add('Spine2', 'Spine1', spine2, chest);
  add('Chest', 'Spine2', chest, neck);
  add('Neck', 'Chest', neck, headC);
  add('Head', 'Neck', headC, headTip);

  // --- Cola ----------------------------------------------------------------
  // Va del nacimiento (justo detrás de la cadera) a la punta, en 4 tramos que
  // siguen la altura real de la malla en cada Z.
  const tailTipZ = bins.minZ;
  const tailRootZ = lerp(hipZ, tailTipZ, 0.18);
  const tailPt = (t: number): V3 => {
    const z = lerp(tailRootZ, tailTipZ, t);
    return [axisX, spineYAt(z), z];
  };
  let tailParent = 'Hips';
  for (let k = 0; k < 4; k++) {
    const name = `Tail${k + 1}`;
    add(name, tailParent, tailPt(k / 4), tailPt((k + 1) / 4));
    tailParent = name;
  }

  // --- Las cuatro patas ----------------------------------------------------
  // Delanteras: escápula -> húmero -> antebrazo -> metacarpo -> dedos.
  // Traseras:   cadera   -> fémur  -> tibia     -> corvejón  -> dedos.
  // El corvejón de la trasera dobla AL REVÉS que el codo de la delantera: es lo
  // que hace que un felino se lea como un felino y no como una mesa.
  const legChain = (
    key: 'FL' | 'FR' | 'HL' | 'HR',
    side: 'Left' | 'Right',
    front: boolean
  ) => {
    const c = legs[key];
    const sgn = side === 'Left' ? 1 : -1;
    const fallbackX = axisX + sgn * bodyHalfWidth * 0.62;
    const rootZ = front ? chestZ : hipZ;
    const topX = Number.isFinite(c.topX) ? c.topX : fallbackX;
    const topZ = Number.isFinite(c.topZ) ? c.topZ : rootZ;
    const footX = Number.isFinite(c.footX) ? c.footX : topX;
    const footZ = Number.isFinite(c.footZ) ? c.footZ : topZ;
    const midX = Number.isFinite(c.midX) ? c.midX : lerp(topX, footX, 0.5);
    const midZ = Number.isFinite(c.midZ) ? c.midZ : lerp(topZ, footZ, 0.5);

    const attachY = front ? chest[1] : hips[1];
    const upperY = lerp(attachY, groundY, 0.30);
    const kneeY = lerp(attachY, groundY, 0.58);
    const ankleY = lerp(attachY, groundY, 0.84);

    const prefix = side + (front ? 'Front' : 'Hind');
    const parent = front ? 'Chest' : 'Hips';
    const attach: V3 = [lerp(axisX, topX, 0.45), attachY, front ? chestZ : hipZ];
    const upper: V3 = [topX, upperY, topZ];
    const knee: V3 = [midX, kneeY, midZ];
    const ankle: V3 = [lerp(midX, footX, 0.7), ankleY, lerp(midZ, footZ, 0.7)];
    const foot: V3 = [footX, groundY, footZ];
    const toe: V3 = [footX, groundY, footZ + (front ? 1 : 1) * 0.06 * H];

    add(`${prefix}Shoulder`, parent, attach, upper);
    add(`${prefix}UpperLeg`, `${prefix}Shoulder`, upper, knee);
    add(`${prefix}LowerLeg`, `${prefix}UpperLeg`, knee, ankle);
    add(`${prefix}Foot`, `${prefix}LowerLeg`, ankle, foot);
    add(`${prefix}Toe`, `${prefix}Foot`, foot, toe);
  };
  legChain('FL', 'Left', true);
  legChain('FR', 'Right', true);
  legChain('HL', 'Left', false);
  legChain('HR', 'Right', false);

  // --- Alas ----------------------------------------------------------------
  // Hay alas si una parte sustancial de la malla sale muy por fuera del cuerpo y
  // por encima del vientre: justo lo que el molde separa como membrana.
  let wingN = 0;
  let wingTipL: V3 | null = null;
  let wingTipR: V3 | null = null;
  let bestL = -Infinity, bestR = -Infinity;
  const wingThresh = bodyHalfWidth * 1.45;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    if (y < bellyY) continue;
    const dx = x - axisX;
    if (Math.abs(dx) < wingThresh) continue;
    wingN++;
    if (dx > bestL) { bestL = dx; wingTipL = [x, y, z]; }
    if (-dx > bestR) { bestR = -dx; wingTipR = [x, y, z]; }
  }
  const hasWings = wingN > n * 0.02 && wingTipL !== null && wingTipR !== null;

  if (hasWings) {
    const wingChain = (side: 'Left' | 'Right', tip: V3) => {
      const sgn = side === 'Left' ? 1 : -1;
      const root: V3 = [axisX + sgn * bodyHalfWidth * 0.7, chest[1] + 0.10 * H, chestZ];
      const at = (t: number): V3 => [
        lerp(root[0], tip[0], t),
        lerp(root[1], tip[1], t),
        lerp(root[2], tip[2], t),
      ];
      const prefix = side + 'Wing';
      add(`${prefix}Root`, 'Chest', root, at(0.26));
      add(`${prefix}Humerus`, `${prefix}Root`, at(0.26), at(0.52));
      add(`${prefix}Radius`, `${prefix}Humerus`, at(0.52), at(0.74));
      add(`${prefix}Hand`, `${prefix}Radius`, at(0.74), at(0.88));
      add(`${prefix}Finger`, `${prefix}Hand`, at(0.88), tip);
    };
    wingChain('Left', wingTipL!);
    wingChain('Right', wingTipR!);
  }

  // Red de seguridad: si alguna medida saliera NaN (dibujo con huecos raros), el
  // hueso se coloca en el eje a media altura en vez de envenenar toda la malla.
  for (const b of bones) {
    for (const p of [b.head, b.tail]) {
      if (!Number.isFinite(p[0])) p[0] = axisX;
      if (!Number.isFinite(p[1])) p[1] = lerp(bellyY, topY, 0.5);
      if (!Number.isFinite(p[2])) p[2] = 0.5 * (bins.minZ + bins.maxZ);
    }
  }

  return {
    rig: { bones },
    kind: hasWings ? 'quadrupedWinged' : 'quadruped',
    metrics: {
      axisX, groundY, topY, bellyY,
      minZ: bins.minZ, maxZ: bins.maxZ,
      height: H, length: L, bodyHalfWidth,
      hipZ, chestZ, hasWings,
    },
  };
}

// ============================================================================
// PESOS DE PIEL EN 3D
// `computeSkinWeightMaps` de humanRig trabaja sobre la silueta FRONTAL, en 2D.
// En un cuadrúpedo la pata delantera y la trasera caen en el mismo (x, y) y solo
// se distinguen en Z, así que ahí compartirían pesos y la malla se rompería al
// animar. Aquí cada vértice se liga a los 4 huesos cuyo SEGMENTO queda más cerca
// en 3D, con caída inversa a la distancia.
// ============================================================================

function distToSegment(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number
): number {
  const vx = bx - ax, vy = by - ay, vz = bz - az;
  const wx = px - ax, wy = py - ay, wz = pz - az;
  const vv = vx * vx + vy * vy + vz * vz;
  const t = vv > 1e-12 ? clamp((wx * vx + wy * vy + wz * vz) / vv, 0, 1) : 0;
  const dx = wx - vx * t, dy = wy - vy * t, dz = wz - vz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function computeSkinWeights3D(
  rig: HumanRig,
  positions: Float32Array,
  scale: number
): { index: Uint16Array; weight: Float32Array } {
  const n = positions.length / 3;
  const nb = rig.bones.length;
  const index = new Uint16Array(n * 4);
  const weight = new Float32Array(n * 4);
  const eps = Math.max(1e-6, scale * 0.012);

  const bi = new Int32Array(4);
  const bd = new Float64Array(4);
  for (let i = 0; i < n; i++) {
    const px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
    bi.fill(0);
    bd.fill(Infinity);
    for (let b = 0; b < nb; b++) {
      const h = rig.bones[b].head, t = rig.bones[b].tail;
      const d = distToSegment(px, py, pz, h[0], h[1], h[2], t[0], t[1], t[2]);
      // Inserción ordenada en el top-4.
      if (d < bd[3]) {
        let k = 3;
        while (k > 0 && d < bd[k - 1]) { bd[k] = bd[k - 1]; bi[k] = bi[k - 1]; k--; }
        bd[k] = d;
        bi[k] = b;
      }
    }
    let sum = 0;
    const w4 = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const d = bd[k] + eps;
      // Caída 1/d^4: pega fuerte al hueso propio y mezcla suave solo en las juntas.
      const wv = Number.isFinite(d) ? 1 / (d * d * d * d) : 0;
      w4[k] = wv;
      sum += wv;
    }
    for (let k = 0; k < 4; k++) {
      index[i * 4 + k] = bi[k];
      weight[i * 4 + k] = sum > 0 ? w4[k] / sum : k === 0 ? 1 : 0;
    }
  }
  return { index, weight };
}
