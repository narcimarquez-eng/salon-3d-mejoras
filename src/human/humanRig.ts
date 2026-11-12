import * as THREE from 'three';

// ============================================================================
// AUTOMATIC HUMAN RIG
// Places a standard humanoid skeleton inside the drawing's silhouette and
// computes skin weights, then provides a few procedural animation clips.
// Bone names follow the common humanoid convention (Hips, Spine, LeftArm…)
// so the exported .glb also works in Blender, Unity, Godot or three.js.
// "Left"/"Right" are the character's own sides: the front image shows the
// character facing the viewer, so the character's right arm is on the
// image's left (world -X).
// ============================================================================

export interface RigLandmarks {
  top: number;
  bottom: number;
  axisX: number;
  neckY: number;
  shoulderY: number;
  armpitY: number;
  crotchY: number;
}

export interface RigBone {
  name: string;
  parent: string | null;
  /** Joint position in world units (bind pose). */
  head: [number, number, number];
  /** End of the bone (child joint or tip), world units. Used for skinning. */
  tail: [number, number, number];
}

export interface HumanRig {
  bones: RigBone[];
}

export interface SkinWeightMaps {
  /** 4 bone indices per texel. */
  index: Uint16Array;
  /** 4 weights per texel (sum 1 inside the silhouette). */
  weight: Float32Array;
}

type Run = [number, number];

function rowRuns(mask: Uint8Array, w: number, y: number): Run[] {
  const runs: Run[] = [];
  let start = -1;
  for (let x = 0; x < w; x++) {
    const on = mask[y * w + x] === 1;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      runs.push([start, x - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, w - 1]);
  return runs;
}

function nearestRun(runs: Run[], x: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < runs.length; k++) {
    const [a, b] = runs[k];
    const d = x < a ? a - x : x > b ? x - b : 0;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** Least-squares line x = a + b·y through (y, x) samples. */
function fitLine(samples: Array<[number, number]>): [number, number] {
  if (samples.length === 0) return [0, 0];
  if (samples.length === 1) return [samples[0][1], 0];
  let sy = 0, sx = 0, syy = 0, sxy = 0;
  for (const [y, x] of samples) {
    sy += y;
    sx += x;
    syy += y * y;
    sxy += x * y;
  }
  const n = samples.length;
  const den = n * syy - sy * sy;
  const b = Math.abs(den) < 1e-6 ? 0 : (n * sxy - sx * sy) / den;
  const a = (sx - b * sy) / n;
  return [a, b];
}

/**
 * Works out joint positions from the silhouette.
 * Coordinates are computed in texels and converted to world units
 * (same mapping as the mesh: full tensor width = `worldSpan`).
 */
export function computeHumanRig(
  mask: Uint8Array,
  w: number,
  lm: RigLandmarks,
  worldSpan: number
): HumanRig {
  const H = Math.max(1, lm.bottom - lm.top + 1);
  const ax = lm.axisX;
  const toWorld = (tx: number, ty: number, z = 0): [number, number, number] => [
    (tx / (w - 1) - 0.5) * worldSpan,
    (0.5 - ty / (w - 1)) * worldSpan,
    z,
  ];
  const texelWorld = worldSpan / (w - 1);

  const runsAt = (y: number) => rowRuns(mask, w, Math.max(0, Math.min(w - 1, Math.round(y))));

  // --- Spine ---------------------------------------------------------------
  const hipsY = lm.crotchY - 0.05 * H;
  const neckBaseY = lm.neckY + 0.5 * Math.max(2, lm.shoulderY - lm.neckY) + 0.01 * H;
  const spineY = hipsY - (hipsY - neckBaseY) * 0.33;
  const chestY = hipsY - (hipsY - neckBaseY) * 0.66;
  const headY = lm.neckY;

  // --- Arms: centre line of the arm runs hanging beside the torso ----------
  const armChain = (side: -1 | 1) => {
    const samples: Array<[number, number]> = [];
    let lastY = -1;
    let lastX = ax + side * 0.16 * H;
    let misses = 0;
    const limitY = Math.min(lm.bottom, lm.crotchY + 0.32 * H);
    for (let y = lm.armpitY; y <= limitY; y++) {
      const runs = runsAt(y);
      const k = nearestRun(runs, ax);
      if (k >= 0) {
        const [ta, tb] = runs[k];
        // Pick the run on `side` of the torso that is closest to the previous arm X
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let j = 0; j < runs.length; j++) {
          if (j === k) continue;
          const [ra, rb] = runs[j];
          const rc = (ra + rb) / 2;
          if (side < 0 && rb >= ta) continue;
          if (side > 0 && ra <= tb) continue;
          const d = samples.length > 0 ? Math.abs(rc - lastX) : Math.abs(rc - (side < 0 ? ta : tb));
          if (d < bestDist) {
            bestDist = d;
            bestIdx = j;
          }
        }
        // Un brazo baja casi recto: si el trozo más cercano está lejos del anterior, es otra
        // cosa (con los brazos en A, al acabar la mano aparece la pierna de ese lado y la
        // cadena saltaba a ella: la mano acababa en la rodilla).
        if (bestIdx >= 0 && samples.length > 0 && bestDist > Math.max(4, 0.04 * H)) bestIdx = -1;
        if (bestIdx >= 0) {
          const [a, b] = runs[bestIdx];
          const cx = (a + b) / 2;
          samples.push([y, cx]);
          lastY = y;
          lastX = cx;
          misses = 0;
          continue;
        }
      }
      if (samples.length > 0 && ++misses > 6) {
        break;
      }
    }
    // Fallback: arms touching the body — put them along the torso sides.
    if (samples.length < 6) {
      const r = runsAt(lm.armpitY + 0.05 * H);
      const k = nearestRun(r, ax);
      const edge = k >= 0 ? (side < 0 ? r[k][0] : r[k][1]) : ax + side * 0.15 * H;
      const x0 = edge - side * 0.03 * H;
      samples.length = 0;
      for (let y = lm.armpitY; y <= lm.armpitY + 0.32 * H; y++) samples.push([y, x0 + side * (y - lm.armpitY) * 0.15]);
      lastY = lm.armpitY + 0.32 * H;
    }
    const upper = samples.slice(0, Math.max(3, Math.round(samples.length * 0.35)));
    const [ua, ub] = fitLine(upper);
    const xAtCenter = (y: number) => {
      let best = samples[0];
      for (const s of samples) if (Math.abs(s[0] - y) < Math.abs(best[0] - y)) best = s;
      return best[1];
    };

    const shoulderJY = lm.shoulderY + 0.45 * (lm.armpitY - lm.shoulderY);
    const shoulderJX = ua + ub * shoulderJY;
    const handEndY = lastY;
    const wristY = handEndY - 0.075 * H;
    const elbowY = (shoulderJY + wristY) / 2;
    const elbowX = elbowY < lm.armpitY ? ua + ub * elbowY : xAtCenter(elbowY);
    return {
      clavicle: toWorld(ax + side * 0.02 * H, neckBaseY + 0.02 * H),
      shoulder: toWorld(shoulderJX, shoulderJY),
      elbow: toWorld(elbowX, elbowY, -0.01 * H * texelWorld),
      wrist: toWorld(xAtCenter(wristY), wristY),
      handEnd: toWorld(xAtCenter(handEndY), handEndY),
    };
  };

  // --- Legs: centre of each leg below the crotch ---------------------------
  // Measure clean shin X first (near bottom - 0.15*H) where skirts/loincloths rarely hang.
  const findCleanShinX = (side: -1 | 1): number => {
    const xs: number[] = [];
    for (let y = Math.round(lm.bottom - 0.22 * H); y <= Math.round(lm.bottom - 0.08 * H); y++) {
      const runs = runsAt(y);
      let best = -1;
      let bestW = 0;
      for (let j = 0; j < runs.length; j++) {
        const [a, b] = runs[j];
        const c = (a + b) / 2;
        if ((c - ax) * side <= 2) continue;
        if (Math.abs(c - ax) > 0.28 * H) continue;
        const rw = b - a + 1;
        if (rw > bestW) {
          bestW = rw;
          best = j;
        }
      }
      if (best >= 0) xs.push((runs[best][0] + runs[best][1]) / 2);
    }
    if (xs.length === 0) return ax + side * 0.08 * H;
    xs.sort((p, q) => p - q);
    return xs[xs.length >> 1];
  };

  const shinRefR = findCleanShinX(-1);
  const shinRefL = findCleanShinX(1);

  const legX = (side: -1 | 1, y: number) => {
    const refX = side < 0 ? shinRefR : shinRefL;
    const runs = runsAt(y);
    const k = nearestRun(runs, ax);
    if (k < 0) return refX;
    const [a, b] = runs[k];
    // Separate runs on this side: pick the one closest to the clean shin reference X
    // (ignores central loincloths/tabards hanging on the axis).
    let best = -1;
    let bestScore = Infinity;
    for (let j = 0; j < runs.length; j++) {
      const [ra, rb] = runs[j];
      const c = (ra + rb) / 2;
      if ((c - ax) * side <= 1) continue;
      if (ra < ax - 2 && rb > ax + 2) continue; // spans across axis
      const score = Math.abs(c - refX);
      if (score < bestScore) {
        bestScore = score;
        best = j;
      }
    }
    if (best >= 0) return (runs[best][0] + runs[best][1]) / 2;
    if (a < ax && b > ax) {
      // One wide run spanning both legs (e.g. skirt): blend between hip and shinRefX
      return side < 0 ? Math.max(a + 2, Math.min(ax - 2, refX * 0.85 + ((a + ax) / 2) * 0.15)) : Math.min(b - 2, Math.max(ax + 2, refX * 0.85 + ((ax + b) / 2) * 0.15));
    }
    return refX;
  };
  const legChain = (side: -1 | 1) => {
    const hipY = lm.crotchY - 0.03 * H;
    const ankleY = lm.bottom - 0.06 * H;
    const kneeY = (hipY + ankleY) / 2;
    const hipX = legX(side, kneeY) * 0.75 + (ax + side * 0.065 * H) * 0.25;
    // Toe of a normal foot (15.5% of the height) with the ankle a quarter from the heel.
    const footLen = 0.155 * 0.75 * H * texelWorld;
    return {
      hip: toWorld(hipX, hipY),
      knee: toWorld(legX(side, kneeY), kneeY, 0.01 * H * texelWorld),
      ankle: toWorld(legX(side, ankleY), ankleY),
      toe: toWorld(legX(side, ankleY), lm.bottom, footLen),
    };
  };

  const R = armChain(-1);
  const L = armChain(1);
  const RL = legChain(-1);
  const LL = legChain(1);

  // Centro horizontal real de la silueta en la fila y (igual que extremidades)
  const centerAtY = (y: number): number => {
    const runs = runsAt(y);
    const k = nearestRun(runs, ax);
    if (k < 0) return ax;
    const rc = (runs[k][0] + runs[k][1]) / 2;
    return ax * 0.35 + rc * 0.65;
  };

  // Parte superior real de la cabeza sobre el eje central (evita poner la punta en el hueco entre dos cuernos laterales)
  let realHeadTopY = lm.top;
  for (let y = lm.top; y < lm.neckY; y++) {
    const runs = runsAt(y);
    const hasCenter = runs.some(([a, b]) => a <= ax + 4 && b >= ax - 4);
    if (hasCenter) {
      realHeadTopY = y;
      break;
    }
  }

  const hips = toWorld(centerAtY(hipsY), hipsY);
  const spine = toWorld(centerAtY(spineY), spineY);
  const chest = toWorld(centerAtY(chestY), chestY);
  const neck = toWorld(centerAtY(neckBaseY), neckBaseY);
  const head = toWorld(centerAtY(headY), headY);
  const headTop = toWorld(centerAtY((realHeadTopY + headY) * 0.5), realHeadTopY);

  const bones: RigBone[] = [
    { name: 'Hips', parent: null, head: hips, tail: spine },
    { name: 'Spine', parent: 'Hips', head: spine, tail: chest },
    { name: 'Chest', parent: 'Spine', head: chest, tail: neck },
    { name: 'Neck', parent: 'Chest', head: neck, tail: head },
    { name: 'Head', parent: 'Neck', head: head, tail: headTop },
    { name: 'RightShoulder', parent: 'Chest', head: R.clavicle, tail: R.shoulder },
    { name: 'RightArm', parent: 'RightShoulder', head: R.shoulder, tail: R.elbow },
    { name: 'RightForeArm', parent: 'RightArm', head: R.elbow, tail: R.wrist },
    { name: 'RightHand', parent: 'RightForeArm', head: R.wrist, tail: R.handEnd },
    { name: 'LeftShoulder', parent: 'Chest', head: L.clavicle, tail: L.shoulder },
    { name: 'LeftArm', parent: 'LeftShoulder', head: L.shoulder, tail: L.elbow },
    { name: 'LeftForeArm', parent: 'LeftArm', head: L.elbow, tail: L.wrist },
    { name: 'LeftHand', parent: 'LeftForeArm', head: L.wrist, tail: L.handEnd },
    { name: 'RightUpLeg', parent: 'Hips', head: RL.hip, tail: RL.knee },
    { name: 'RightLeg', parent: 'RightUpLeg', head: RL.knee, tail: RL.ankle },
    { name: 'RightFoot', parent: 'RightLeg', head: RL.ankle, tail: RL.toe },
    { name: 'LeftUpLeg', parent: 'Hips', head: LL.hip, tail: LL.knee },
    { name: 'LeftLeg', parent: 'LeftUpLeg', head: LL.knee, tail: LL.ankle },
    { name: 'LeftFoot', parent: 'LeftLeg', head: LL.ankle, tail: LL.toe },
  ];
  return { bones };
}

const K5 = [0.0625, 0.25, 0.375, 0.25, 0.0625];

/**
 * Skin weights per texel.
 * 1) Every silhouette pixel is bound to the bone it reaches first when walking
 *    *inside* the silhouette from all bones at once, so the side of the torso
 *    goes to the spine and not to the arm hanging next to it.
 * 2) Each bone's region is blurred so joints bend smoothly.
 * 3) A pixel only keeps weights of its own bone, its parent and its children.
 */
export function computeSkinWeightMaps(
  rig: HumanRig,
  mask: Uint8Array,
  w: number,
  worldSpan: number
): SkinWeightMaps {
  const n = w * w;
  const nb = rig.bones.length;
  const toTex = (p: [number, number, number]): [number, number] => [
    (p[0] / worldSpan + 0.5) * (w - 1),
    (0.5 - p[1] / worldSpan) * (w - 1),
  ];

  const label = new Int16Array(n).fill(-1);
  const queue = new Int32Array(n);
  let qh = 0;
  let qt = 0;

  // Seed: rasterise every bone segment (inside the silhouette).
  for (let b = 0; b < nb; b++) {
    const [x0, y0] = toTex(rig.bones[b].head);
    const [x1, y1] = toTex(rig.bones[b].tail);
    const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      // Leave the very ends to neighbouring bones so joints sit between regions.
      if (t < 0.08 && rig.bones[b].parent !== null) continue;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      if (x < 0 || y < 0 || x >= w || y >= w) continue;
      const i = y * w + x;
      if (mask[i] !== 1 || label[i] >= 0) continue;
      label[i] = b;
      queue[qt++] = i;
    }
  }
  // Geodesic flood inside the silhouette.
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % w;
    const y = (i / w) | 0;
    const l = label[i];
    if (x > 0 && mask[i - 1] === 1 && label[i - 1] < 0) { label[i - 1] = l; queue[qt++] = i - 1; }
    if (x < w - 1 && mask[i + 1] === 1 && label[i + 1] < 0) { label[i + 1] = l; queue[qt++] = i + 1; }
    if (y > 0 && mask[i - w] === 1 && label[i - w] < 0) { label[i - w] = l; queue[qt++] = i - w; }
    if (y < w - 1 && mask[i + w] === 1 && label[i + w] < 0) { label[i + w] = l; queue[qt++] = i + w; }
  }
  // Pixels not reached (islands) go to the Hips.
  for (let i = 0; i < n; i++) if (mask[i] === 1 && label[i] < 0) label[i] = 0;

  // Parent / children lookup.
  const parentIdx = rig.bones.map((b) => rig.bones.findIndex((p) => p.name === b.parent));
  const related: number[][] = rig.bones.map((_, b) => {
    const set = [b];
    if (parentIdx[b] >= 0) set.push(parentIdx[b]);
    for (let c = 0; c < nb; c++) if (parentIdx[c] === b) set.push(c);
    return set;
  });

  // Blur each bone's region.
  const maps: Float32Array[] = [];
  const tmp = new Float32Array(n);
  const passes = 5;
  for (let b = 0; b < nb; b++) {
    const m = new Float32Array(n);
    for (let i = 0; i < n; i++) m[i] = label[i] === b ? 1 : 0;
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          let s = 0;
          for (let o = -2; o <= 2; o++) {
            const sx = x + o < 0 ? 0 : x + o >= w ? w - 1 : x + o;
            s += m[y * w + sx] * K5[o + 2];
          }
          tmp[y * w + x] = s;
        }
      }
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          let s = 0;
          for (let o = -2; o <= 2; o++) {
            const sy = y + o < 0 ? 0 : y + o >= w ? w - 1 : y + o;
            s += tmp[sy * w + x] * K5[o + 2];
          }
          m[y * w + x] = s;
        }
      }
    }
    maps.push(m);
  }

  const index = new Uint16Array(n * 4);
  const weight = new Float32Array(n * 4);
  const cand: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const l = label[i];
    if (l < 0) continue;
    cand.length = 0;
    for (const b of related[l]) cand.push([b, maps[b][i]]);
    cand.sort((p, q) => q[1] - p[1]);
    let sum = 0;
    for (let k = 0; k < 4 && k < cand.length; k++) sum += cand[k][1];
    if (sum <= 1e-6) {
      index[i * 4] = l;
      weight[i * 4] = 1;
      continue;
    }
    for (let k = 0; k < 4; k++) {
      if (k < cand.length) {
        index[i * 4 + k] = cand[k][0];
        weight[i * 4 + k] = cand[k][1] / sum;
      }
    }
  }
  return { index, weight };
}

/** Looks up skin weights for a texel position, searching nearby if it lies just outside the silhouette. */
export function sampleSkinWeights(
  maps: SkinWeightMaps,
  mask: Uint8Array,
  w: number,
  tx: number,
  ty: number,
  outIndex: Uint16Array | number[],
  outWeight: Float32Array | number[],
  outOffset: number
) {
  const cx = Math.round(tx);
  const cy = Math.round(ty);
  for (let r = 0; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= w) continue;
        const i = y * w + x;
        if (mask[i] !== 1) continue;
        for (let k = 0; k < 4; k++) {
          outIndex[outOffset + k] = maps.index[i * 4 + k];
          outWeight[outOffset + k] = maps.weight[i * 4 + k];
        }
        return;
      }
    }
  }
  outIndex[outOffset] = 0;
  outWeight[outOffset] = 1;
}

// ============================================================================
// SKELETON + ANIMATIONS (three.js objects)
// ============================================================================

export const RIG_ANIMATIONS = [
  { id: 'idle', clipName: 'Idle', label: 'Reposo (Idle)' },
  { id: 'walk', clipName: 'Walk', label: 'Marcha Realista (Walk)' },
  { id: 'attack', clipName: 'Attack', label: 'Ataque / Fuego (Attack)' },
  { id: 'jump_bite', clipName: 'JumpBite', label: 'Salto y Golpeo (JumpBite)' },
  { id: 'stun_combo', clipName: 'StunCombo', label: 'Combo Stun (StunCombo)' },
  { id: 'elemental_shot', clipName: 'ElementalShot', label: 'Doble Elemental (ElementalShot)' },
  { id: 'whirlwind_spin', clipName: 'WhirlwindSpin', label: 'Torbellino 360° (WhirlwindSpin)' },
  { id: 'hit', clipName: 'Hit', label: 'Impacto (Hit)' },
  { id: 'death', clipName: 'Death', label: 'Derrota (Death)' },
  { id: 't_pose', clipName: 'TPose', label: 'Pose T (TPose)' },
  { id: 'a_pose', clipName: 'APose', label: 'Pose A (APose)' },
] as const;

export type RigAnimationId = (typeof RIG_ANIMATIONS)[number]['id'];

/** Creates THREE.Bones (bind pose = identity rotations, joint offsets as positions). */
export function createSkeletonBones(rig: HumanRig): { root: THREE.Bone; bones: THREE.Bone[] } {
  const byName = new Map<string, THREE.Bone>();
  const bones: THREE.Bone[] = [];
  for (const b of rig.bones) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    byName.set(b.name, bone);
    bones.push(bone);
  }
  let root = bones[0];
  rig.bones.forEach((b, i) => {
    const bone = bones[i];
    if (b.parent) {
      const parent = byName.get(b.parent)!;
      const ph = rig.bones.find((p) => p.name === b.parent)!.head;
      bone.position.set(b.head[0] - ph[0], b.head[1] - ph[1], b.head[2] - ph[2]);
      parent.add(bone);
    } else {
      bone.position.set(b.head[0], b.head[1], b.head[2]);
      root = bone;
    }
    // Remembered so exports can put the skeleton back in its rest pose.
    bone.userData.bindPosition = bone.position.toArray();
  });
  return { root, bones };
}

/**
 * Portado directamente de `bakeEnemyAnimationClips` y `updateEnemyAnimation`
 * en `src/enemigos/vendor/three/enemyBuilder.ts` (repositorio Enemigo-rpg).
 * Genera los 11 clips exactos de los enemigos/campeones de Enemigo-rpg:
 *  - Idle (2.73s)
 *  - Walk (1.18s)
 *  - Attack (2.513s)
 *  - JumpBite (1.85s)
 *  - StunCombo (2.30s)
 *  - ElementalShot (2.10s)
 *  - WhirlwindSpin (1.70s)
 *  - Hit (0.75s)
 *  - Death (1.50s)
 *  - TPose (1.00s)
 *  - APose (1.00s)
 */
export function createHumanAnimationClips(
  rig: HumanRig,
  weapon: string = 'none'
): THREE.AnimationClip[] {
  const boneHead = new Map(rig.bones.map((b) => [b.name, b]));
  const hipsPos = boneHead.get('Hips')!.head;
  const height = Math.max(
    0.5,
    boneHead.get('Head')!.tail[1] - Math.min(rig.bones.find((b) => b.name === 'RightFoot')!.tail[1], 0)
  );
  const scaleOffset = height / 2.25;
  const isBowWeapon = weapon === 'bone_recurved_bow';

  // Ángulo del brazo en la foto original respecto a la vertical (0, -1, 0)
  const getArmBindAngleZ = (armName: string, defaultSign: number): number => {
    const b = boneHead.get(armName);
    if (!b) return defaultSign * 0.48;
    const dx = b.tail[0] - b.head[0];
    const dy = b.tail[1] - b.head[1];
    return Math.atan2(dx, -dy);
  };
  const bindAngleR = getArmBindAngleZ('RightArm', -1);
  const bindAngleL = getArmBindAngleZ('LeftArm', 1);
  const adductR = -bindAngleR * 0.78;
  const adductL = -bindAngleL * 0.78;

  type Pose = Record<string, [number, number, number] | undefined>; // Euler XYZ in radians
  interface FramePose {
    rot: Pose;
    hipsOffset?: [number, number, number];
    chestScale?: [number, number, number];
    slashScale?: [number, number, number];
    slashRot?: [number, number, number];
    arrowPos?: [number, number, number];
    arrowScale?: [number, number, number];
  }

  const build = (
    name: string,
    duration: number,
    samples: number,
    loopSeamless: boolean,
    pose: (u: number, t: number) => FramePose
  ) => {
    const times: number[] = [];
    const rotValues = new Map<string, number[]>();
    const posValues: number[] = [];
    const chestScaleValues: number[] = [];
    const slashScaleValues: number[] = [];
    const slashQuatValues: number[] = [];
    const arrowPosValues: number[] = [];
    const arrowScaleValues: number[] = [];
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();

    for (let s = 0; s <= samples; s++) {
      const u = s / samples;
      const t = u * duration;
      times.push(Number(t.toFixed(4)));
      const effectiveU = loopSeamless && s === samples ? 0 : u;
      const effectiveT = loopSeamless && s === samples ? 0 : t;
      const frame = pose(effectiveU, effectiveT);

      for (const b of rig.bones) {
        const r = frame.rot[b.name] || [0, 0, 0];
        e.set(r[0], r[1], r[2], 'XYZ');
        q.setFromEuler(e);
        if (!rotValues.has(b.name)) rotValues.set(b.name, []);
        rotValues.get(b.name)!.push(q.x, q.y, q.z, q.w);
      }

      const o = frame.hipsOffset || [0, 0, 0];
      posValues.push(
        hipsPos[0] + o[0] * scaleOffset,
        hipsPos[1] + o[1] * scaleOffset,
        hipsPos[2] + o[2] * scaleOffset
      );

      const cs = frame.chestScale || [1, 1, 1];
      chestScaleValues.push(cs[0], cs[1], cs[2]);

      const ss = frame.slashScale || [0.0001, 0.0001, 0.0001];
      slashScaleValues.push(ss[0], ss[1], ss[2]);

      const sr = frame.slashRot || [0, 0, 0];
      e.set(sr[0], sr[1], sr[2], 'XYZ');
      q.setFromEuler(e);
      slashQuatValues.push(q.x, q.y, q.z, q.w);

      const ap = frame.arrowPos || [0, 0, 0.36];
      arrowPosValues.push(ap[0], ap[1], ap[2]);

      const asc = frame.arrowScale || [isBowWeapon ? 1.0 : 0.0001, isBowWeapon ? 1.0 : 0.0001, isBowWeapon ? 1.0 : 0.0001];
      arrowScaleValues.push(asc[0], asc[1], asc[2]);
    }

    const tracks: THREE.KeyframeTrack[] = [];
    for (const [bone, values] of rotValues) {
      let moves = false;
      for (let i = 0; i < values.length; i += 4) {
        if (Math.abs(values[i + 3] - 1) > 1e-5) {
          moves = true;
          break;
        }
      }
      if (!moves) continue;
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
    }
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, posValues));
    tracks.push(new THREE.VectorKeyframeTrack('Chest.scale', times, chestScaleValues));
    tracks.push(new THREE.VectorKeyframeTrack('Weapon_Slash_Trail_Arc.scale', times, slashScaleValues));
    tracks.push(new THREE.QuaternionKeyframeTrack('Weapon_Slash_Trail_Arc.quaternion', times, slashQuatValues));
    if (isBowWeapon) {
      tracks.push(new THREE.VectorKeyframeTrack('Arrow_Projectile_Mesh.position', times, arrowPosValues));
      tracks.push(new THREE.VectorKeyframeTrack('Arrow_Projectile_Mesh.scale', times, arrowScaleValues));
    }
    return new THREE.AnimationClip(name, duration, tracks);
  };

  const TWO_PI = Math.PI * 2;

  // 1. IDLE (2.73s) — Respiración orgánica de caja torácica y cambio de peso en guardia (Enemigo-rpg)
  const idle = build('Idle', 2.73, 28, true, (u) => {
    const phase = u * TWO_PI;
    const breath = Math.sin(phase);
    const weightShift = Math.sin(phase);
    const alertLook = Math.cos(phase);
    const breathScale = 1.0 + breath * 0.026;
    return {
      rot: {
        Hips: [0, 0, 0],
        Spine: [breath * 0.012, 0, 0],
        Chest: [breath * 0.025, 0, 0],
        Neck: [breath * 0.035, weightShift * 0.12, 0],
        Head: [-breath * 0.045, weightShift * 0.11 + alertLook * 0.06, 0],
        LeftShoulder: [0, 0, breath * 0.045],
        RightShoulder: [0, 0, -breath * 0.045],
        RightArm: [-0.18 + breath * 0.05, 0, adductR],
        LeftArm: [-0.22 - breath * 0.04, 0, adductL],
        RightForeArm: [-0.32 + breath * 0.05, 0, 0],
        LeftForeArm: [-0.32 - breath * 0.05, 0, 0],
        LeftUpLeg: [-0.08, 0, 0],
        RightUpLeg: [0.06, 0, 0],
        LeftLeg: [0.14, 0, 0],
        RightLeg: [0.08, 0, 0],
      },
      hipsOffset: [weightShift * 0.018, breath * 0.008, 0],
      chestScale: [breathScale, 1.0 + breath * 0.016, breathScale],
    };
  });

  // 2. WALK (1.18s) — Marcha realista bípeda pesada con contrapposto de cadera y contragiro de torso (Enemigo-rpg)
  const walk = build('Walk', 1.18, 28, true, (u) => {
    const phase = u * TWO_PI;
    const stride = Math.sin(phase);
    const liftL = Math.max(0, Math.cos(phase));
    const liftR = Math.max(0, -Math.cos(phase));
    const torsoX = 0.07 + Math.abs(stride) * 0.025;
    const torsoY = stride * 0.095;
    const torsoZ = -stride * 0.038;

    return {
      rot: {
        Hips: [0.04, -stride * 0.085, stride * 0.052],
        Spine: [torsoX * 0.45, torsoY * 0.45, torsoZ * 0.45],
        Chest: [torsoX * 0.55, torsoY * 0.55, torsoZ * 0.55],
        Head: [0, -stride * 0.06, 0],
        LeftUpLeg: [-stride * 0.46, 0, 0],
        RightUpLeg: [stride * 0.46, 0, 0],
        LeftLeg: [0.1 + liftL * 0.56 + Math.max(0, -stride) * 0.08, 0, 0],
        RightLeg: [0.1 + liftR * 0.56 + Math.max(0, stride) * 0.08, 0, 0],
        LeftFoot: [stride * 0.14, 0, 0],
        RightFoot: [-stride * 0.14, 0, 0],
        RightArm: [-stride * 0.42 - 0.12, 0, adductR],
        LeftArm: [stride * 0.42 - 0.12, 0, adductL],
        RightForeArm: [-0.28 - Math.max(0, stride) * 0.36, 0, 0],
        LeftForeArm: [-0.28 - Math.max(0, -stride) * 0.36, 0, 0],
      },
      hipsOffset: [-stride * 0.026, -Math.abs(stride) * 0.024 + Math.cos(phase * 2.0) * 0.012, 0],
    };
  });

  // 3. ATTACK (2.513s) — Ataque de campeón con arma y estela 3D / Disparo horizontal de arquero (Enemigo-rpg)
  const attack = build('Attack', 2.513, 32, true, (u) => {
    if (isBowWeapon) {
      const bowU = (u * 2) % 1.0;
      if (bowU < 0.44) {
        const drawP = bowU / 0.44;
        const pullZ = drawP * 0.56;
        return {
          rot: {
            Hips: [0, 0, 0],
            Spine: [0, -0.1, 0],
            Chest: [0, -0.12, 0],
            Head: [0, 0.22, 0],
            RightArm: [-1.52, 0.22, adductR],
            RightForeArm: [-0.0508, 0, 0],
            LeftArm: [
              THREE.MathUtils.lerp(-1.5, -1.56, drawP),
              THREE.MathUtils.lerp(-0.36, 0.18, drawP),
              adductL + THREE.MathUtils.lerp(0.06, 0.26, drawP),
            ],
            LeftForeArm: [THREE.MathUtils.lerp(-0.24, -1.96, drawP), 0, 0],
            LeftUpLeg: [-0.16 * drawP, 0, 0],
            RightUpLeg: [0.18 * drawP, 0, 0],
          },
          hipsOffset: [0, -0.03 * drawP, -0.1 * drawP],
          arrowPos: [0, 0, 0.36 - pullZ],
          arrowScale: [1.05, 1.05, 1.05],
        };
      } else if (bowU < 0.86) {
        const flyP = (bowU - 0.44) / 0.42;
        const flash = flyP < 0.24 ? (1.0 - flyP / 0.24) * 0.85 : 0.0001;
        return {
          rot: {
            Hips: [0, 0, 0],
            Spine: [0, -0.1, 0],
            Chest: [0, -0.12, 0],
            Head: [0, 0.22, 0],
            RightArm: [-1.52, 0.22, adductR],
            RightForeArm: [-0.0508, 0, 0],
            LeftArm: [-1.56, 0.24, adductL + 0.28],
            LeftForeArm: [-2.02, 0, 0],
            LeftUpLeg: [-0.16, 0, 0],
            RightUpLeg: [0.18, 0, 0],
          },
          hipsOffset: [0, -0.02, -0.08],
          slashScale: [0.8, flash, flash],
          arrowPos: [0, 0, 0.36 + flyP * 11.4],
          arrowScale: [1.25, 1.25, 1.6],
        };
      } else {
        const relP = (bowU - 0.86) / 0.14;
        return {
          rot: {
            Spine: [0, -0.08, 0],
            Chest: [0, -0.1, 0],
            RightArm: [-1.42, 0.18, adductR],
            RightForeArm: [-0.15, 0, 0],
            LeftArm: [
              THREE.MathUtils.lerp(-1.72, -1.5, relP),
              THREE.MathUtils.lerp(0.15, -0.36, relP),
              adductL + 0.08,
            ],
            LeftForeArm: [THREE.MathUtils.lerp(-1.25, -0.24, relP), 0, 0],
          },
          arrowPos: [0, 0, 0.36],
          arrowScale: [Math.max(0.01, relP), Math.max(0.01, relP), Math.max(0.01, relP)],
        };
      }
    }

    const cycle = u * TWO_PI;
    const swing = Math.sin(cycle);
    const lunge = Math.max(0, Math.sin(cycle - 0.4));
    const windup = Math.max(0, -swing);
    const slashPower = Math.max(0, Math.sin(cycle - 0.25));
    const sMag = slashPower > 0.05 ? Math.min(1.35, slashPower * 1.35) : 0.0001;
    const torsoY = -0.28 * windup + 0.36 * lunge;
    const torsoX = -0.1 * windup + 0.22 * lunge;

    return {
      rot: {
        Hips: [0, torsoY * 0.25, 0],
        Spine: [torsoX * 0.45, torsoY * 0.45, 0],
        Chest: [torsoX * 0.55, torsoY * 0.55, 0],
        Head: [-torsoX * 0.3, -torsoY * 0.35, 0],
        RightArm: [swing > 0 ? -1.45 + lunge * 2.25 : -0.35 - windup * 0.55, 0, adductR],
        RightForeArm: [swing > 0 ? -0.65 + lunge * 0.55 : -0.45, 0, 0],
        LeftArm: [-0.52 + swing * 0.32, 0, adductL],
        LeftForeArm: [-0.42, 0, 0],
        LeftUpLeg: [-lunge * 0.34, 0, 0],
        RightUpLeg: [lunge * 0.34, 0, 0],
        LeftLeg: [0.24 + lunge * 0.34, 0, 0],
        RightLeg: [0.22 + lunge * 0.18, 0, 0],
      },
      hipsOffset: [0, -0.06 * lunge, -0.08 * windup + 0.38 * lunge],
      slashScale: slashPower > 0.05 ? [1.0, sMag, sMag * 1.15] : [0.0001, 0.0001, 0.0001],
      slashRot: [-0.35 + slashPower * 1.15, 0.08 * swing, -0.18 * swing],
    };
  });

  // 4. JUMPBITE (1.85s) — Salto heroico y golpeo brutal desde el aire con estela 3D (Enemigo-rpg)
  const jumpBite = build('JumpBite', 1.85, 34, true, (u) => {
    if (u < 0.24) {
      const p = u / 0.24;
      const coil = Math.sin(p * Math.PI * 0.5);
      return {
        rot: {
          Hips: [0.2 * coil, 0, 0],
          Spine: [0.12 * coil, -0.18 * coil, 0],
          Chest: [0.14 * coil, -0.2 * coil, 0],
          Neck: [-0.22 * coil, 0, 0],
          Head: [-0.18 * coil, 0, 0],
          LeftUpLeg: [-0.62 * coil, 0, 0],
          RightUpLeg: [-0.58 * coil, 0, 0],
          LeftLeg: [0.26 + 0.68 * coil, 0, 0],
          RightLeg: [0.26 + 0.64 * coil, 0, 0],
          RightArm: [-1.55 * coil, 0, adductR - 0.22 * coil],
          RightForeArm: [-0.68 * coil, 0, 0],
          LeftArm: [-0.58 * coil, 0, adductL + 0.18 * coil],
          LeftForeArm: [-0.48 * coil, 0, 0],
        },
        hipsOffset: [0, -0.24 * coil, -0.38 * coil],
      };
    } else if (u < 0.56) {
      const airU = (u - 0.24) / 0.32;
      const arcHeight = Math.sin(airU * Math.PI) * 0.82;
      const forwardDist = THREE.MathUtils.lerp(-0.2, 0.88, airU);
      const pitch = THREE.MathUtils.lerp(-0.28, 0.32, airU);
      const torsoYaw = THREE.MathUtils.lerp(-0.38, 0.12, airU);
      const targetWeaponArmX =
        airU < 0.72
          ? THREE.MathUtils.lerp(-1.65, -2.42, airU / 0.72)
          : THREE.MathUtils.lerp(-2.42, -0.45, (airU - 0.72) / 0.28);
      const preSlash = airU > 0.7 ? (airU - 0.7) / 0.3 : 0;
      return {
        rot: {
          Hips: [pitch * 0.7, 0, 0],
          Spine: [pitch * 0.45, torsoYaw * 0.45, 0],
          Chest: [pitch * 0.55, torsoYaw * 0.55, 0],
          LeftUpLeg: [-0.54, 0, 0],
          RightUpLeg: [0.48, 0, 0],
          LeftLeg: [0.88, 0, 0],
          RightLeg: [0.46, 0, 0],
          RightArm: [targetWeaponArmX, 0, adductR - 0.14],
          RightForeArm: [-0.28, 0, 0],
          LeftArm: [-1.15, 0, adductL + 0.28],
          LeftForeArm: [-0.35, 0, 0],
        },
        hipsOffset: [0, arcHeight * 1.14, forwardDist],
        slashScale:
          preSlash > 0 ? [1.15, preSlash * 1.25, preSlash * 1.35] : [0.0001, 0.0001, 0.0001],
        slashRot: [-0.45 + preSlash * 0.85, 0.1, -0.12],
      };
    } else if (u < 0.78) {
      const slamU = (u - 0.56) / 0.22;
      const shockAbsorb = Math.sin(slamU * Math.PI);
      const sMag = Math.max(0.0001, (1.0 - slamU * 0.48) * 1.55);
      return {
        rot: {
          Hips: [0.22, 0, 0],
          Spine: [0.16, 0.18, 0],
          Chest: [0.2, 0.2, 0],
          Head: [0.16, 0, 0],
          RightArm: [0.58, 0, adductR + 0.08],
          RightForeArm: [-0.14, 0, 0],
          LeftArm: [-0.35, 0, adductL + 0.12],
          LeftForeArm: [-0.52, 0, 0],
          LeftUpLeg: [-0.38, 0, 0],
          RightUpLeg: [0.34, 0, 0],
          LeftLeg: [0.62, 0, 0],
          RightLeg: [0.48, 0, 0],
        },
        hipsOffset: [0, -0.18 * shockAbsorb, 0.84 * (1 - slamU * 0.25)],
        slashScale: [1.25, sMag, sMag * 1.32],
        slashRot: [0.45 + slamU * 0.55, 0.14, -0.18],
      };
    } else {
      const recU = (u - 0.78) / 0.22;
      const easeBack = 1.0 - Math.sin(recU * Math.PI * 0.5);
      const hopBackArc = Math.sin(recU * Math.PI) * 0.1;
      return {
        rot: {
          RightArm: [-0.18 * easeBack, 0, adductR],
          LeftArm: [-0.18 * easeBack, 0, adductL],
          RightForeArm: [-0.32 * easeBack, 0, 0],
          LeftForeArm: [-0.32 * easeBack, 0, 0],
          LeftUpLeg: [-0.06 * easeBack, 0, 0],
          RightUpLeg: [0.06 * easeBack, 0, 0],
          LeftLeg: [0.12 * easeBack, 0, 0],
          RightLeg: [0.12 * easeBack, 0, 0],
        },
        hipsOffset: [0, hopBackArc, 0.62 * easeBack],
      };
    }
  });

  // 5. STUNCOMBO (2.30s) — Carga frontal, tambaleo de aturdimiento y golpe demoledor contra el suelo (Enemigo-rpg)
  const stunCombo = build('StunCombo', 2.3, 36, true, (u) => {
    if (u < 0.28) {
      const p = u / 0.28;
      const charge = Math.sin(p * Math.PI * 0.5);
      const fScale = p > 0.6 ? Math.max(0.0001, (p - 0.6) * 2.5) : 0.0001;
      return {
        rot: {
          Hips: [0.12 * charge, 0, 0],
          Spine: [0.13 * charge, 0, 0],
          Chest: [0.15 * charge, 0, 0],
          RightArm: [-1.65 * charge, 0, adductR],
          RightForeArm: [-0.45 * charge, 0, 0],
          LeftArm: [-0.95 * charge, 0, adductL],
        },
        hipsOffset: [0, -0.06 * charge, 0.8 * charge],
        slashScale: [fScale * 1.1, fScale, fScale],
        slashRot: [0.1, 0, 0],
      };
    } else if (u < 0.6) {
      const stunU = (u - 0.28) / 0.32;
      const wobble = Math.sin(stunU * Math.PI * 7.5);
      const wobbleCos = Math.cos(stunU * Math.PI * 7.5);
      return {
        rot: {
          Spine: [0, 0, -wobble * 0.07],
          Chest: [0, 0, -wobble * 0.07],
          Head: [0.18 + Math.abs(wobble) * 0.15, wobble * 0.32, wobbleCos * 0.24],
          LeftLeg: [0.42 + wobble * 0.15, 0, 0],
          RightLeg: [0.42 - wobble * 0.15, 0, 0],
          RightArm: [-0.65 + wobble * 0.2, 0, adductR],
          LeftArm: [-0.65 - wobble * 0.2, 0, adductL],
        },
        hipsOffset: [0, -0.1 + Math.sin(stunU * Math.PI * 4.0) * 0.04, 0.53],
      };
    } else if (u < 0.85) {
      const slamU = (u - 0.6) / 0.25;
      if (slamU < 0.4) {
        const lift = slamU / 0.4;
        return {
          rot: {
            Spine: [-0.15 * lift, 0, 0],
            Chest: [-0.17 * lift, 0, 0],
            Head: [-0.25 * lift, 0, 0],
            RightArm: [-2.4 * lift, 0, adductR],
            LeftArm: [-2.4 * lift, 0, adductL],
          },
          hipsOffset: [0, lift * 0.28, 0.53],
        };
      } else {
        const smash = (slamU - 0.4) / 0.6;
        const sM = Math.max(0.0001, (1.0 - smash) * 1.6);
        return {
          rot: {
            Hips: [0.25, 0, 0],
            Spine: [0.2, 0, 0],
            Chest: [0.24, 0, 0],
            Head: [0.35, 0, 0],
            RightArm: [0.52, 0, adductR],
            LeftArm: [0.52, 0, adductL],
          },
          hipsOffset: [0, -0.18, 0.59],
          slashScale: [1.4, sM, sM * 1.5],
          slashRot: [Math.PI * 0.45, 0, 0],
        };
      }
    } else {
      const rec = (u - 0.85) / 0.15;
      const ease = 1.0 - rec;
      return {
        rot: {
          RightArm: [-0.25 * ease, 0, adductR],
          LeftArm: [-0.25 * ease, 0, adductL],
        },
        hipsOffset: [0, -0.1 * ease, 0.2 * ease],
      };
    }
  });

  // 6. ELEMENTALSHOT (2.10s) — Doble Tiro / Tajo Elemental Cruzado en X (Enemigo-rpg)
  const elementalShot = build('ElementalShot', 2.1, 34, true, (u) => {
    if (isBowWeapon) {
      if (u < 0.46) {
        const shot1U = u / 0.46;
        if (shot1U < 0.45) {
          const draw = shot1U / 0.45;
          return {
            rot: {
              Head: [0, 0.22, 0],
              RightArm: [-1.52, 0.22, adductR],
              RightForeArm: [-0.0508, 0, 0],
              LeftArm: [-1.54, 0, adductL],
              LeftForeArm: [-0.24 - draw * 1.7, 0, 0],
            },
            arrowPos: [0, 0, 0.36 - draw * 0.45],
            arrowScale: [1.05, 1.05, 1.05],
          };
        } else {
          const fly = (shot1U - 0.45) / 0.55;
          const flash = Math.max(0.0001, (1.0 - fly * 2.5) * 0.95);
          return {
            rot: {
              Head: [0, 0.22, 0],
              RightArm: [-1.52, 0.22, adductR],
              RightForeArm: [-0.0508, 0, 0],
              LeftArm: [-1.56, 0, adductL],
              LeftForeArm: [-1.98, 0, 0],
            },
            slashScale: [0.9, flash, flash],
            arrowPos: [0, 0, 0.36 + fly * 12.0],
            arrowScale: [1.3, 1.3, 1.8],
          };
        }
      } else if (u < 0.9) {
        const shot2U = (u - 0.46) / 0.44;
        if (shot2U < 0.4) {
          const draw2 = shot2U / 0.4;
          return {
            rot: {
              Head: [0, 0.22, 0],
              RightArm: [-1.52, 0.22, adductR],
              RightForeArm: [-0.0508, 0, 0],
              LeftArm: [-1.58, 0, adductL],
              LeftForeArm: [-0.24 - draw2 * 1.75, 0, 0],
            },
            hipsOffset: [0, Math.sin(draw2 * Math.PI) * 0.12, 0],
            arrowPos: [0, 0, 0.36 - draw2 * 0.5],
            arrowScale: [1.15, 1.15, 1.15],
          };
        } else {
          const fly2 = (shot2U - 0.4) / 0.6;
          const flash2 = Math.max(0.0001, (1.0 - fly2 * 2.2) * 1.15);
          return {
            rot: {
              Head: [0, 0.22, 0],
              RightArm: [-1.52, 0.22, adductR],
              RightForeArm: [-0.0508, 0, 0],
              LeftArm: [-1.58, 0, adductL],
              LeftForeArm: [-2.04, 0, 0],
            },
            slashScale: [1.1, flash2, flash2],
            arrowPos: [0, 0, 0.36 + fly2 * 13.5],
            arrowScale: [1.4, 1.4, 2.0],
          };
        }
      } else {
        const rec = (u - 0.9) / 0.1;
        return {
          rot: {
            RightArm: [-0.35 * (1 - rec), 0, adductR],
            LeftArm: [-0.35 * (1 - rec), 0, adductL],
          },
          arrowPos: [0, 0, 0.36],
          arrowScale: [Math.max(0.01, rec), Math.max(0.01, rec), Math.max(0.01, rec)],
        };
      }
    }

    if (u < 0.48) {
      const s1 = u / 0.48;
      const sl1 = Math.sin(s1 * Math.PI);
      const yaw = -0.35 + s1 * 0.7;
      return {
        rot: {
          Spine: [0, yaw * 0.45, 0],
          Chest: [0, yaw * 0.55, 0],
          RightArm: [-1.6 + s1 * 2.2, 0, adductR],
          RightForeArm: [-0.35, 0, 0],
          LeftArm: [-0.45, 0, adductL],
        },
        slashScale: [1.2, Math.max(0.0001, sl1 * 1.3), Math.max(0.0001, sl1 * 1.3)],
        slashRot: [-0.25 + s1 * 0.6, 0.1, -0.2],
      };
    } else if (u < 0.9) {
      const s2 = (u - 0.48) / 0.42;
      const sl2 = Math.sin(s2 * Math.PI);
      const yaw = 0.35 - s2 * 0.7;
      return {
        rot: {
          Spine: [0, yaw * 0.45, 0],
          Chest: [0, yaw * 0.55, 0],
          RightArm: [-1.9 + s2 * 2.4, 0, adductR - 0.4 + s2 * 0.8],
          RightForeArm: [-0.3, 0, 0],
          LeftArm: [-0.55, 0, adductL],
        },
        slashScale: [1.3, Math.max(0.0001, sl2 * 1.45), Math.max(0.0001, sl2 * 1.45)],
        slashRot: [0.4 - s2 * 0.8, -0.15, 0.3],
      };
    } else {
      return {
        rot: {
          RightArm: [-0.2, 0, adductR],
          LeftArm: [-0.2, 0, adductL],
        },
      };
    }
  });

  // 7. WHIRLWINDSPIN (1.70s) — Tiro Giratorio / Ataque Torbellino 360° (Enemigo-rpg)
  const whirlwindSpin = build('WhirlwindSpin', 1.7, 34, true, (u) => {
    const spinAngle = u * TWO_PI;
    const torsoTwist = Math.sin(spinAngle * 2) * 0.15;
    if (isBowWeapon) {
      const airHeight = Math.sin(u * Math.PI) * 0.65;
      const spinTrail = Math.max(0.0001, Math.sin(u * Math.PI) * 1.4);
      const isFlying = u > 0.35 && u < 0.85;
      const fly = isFlying ? (u - 0.35) / 0.5 : 0;
      return {
        rot: {
          Hips: [0, spinAngle, 0],
          Spine: [0, torsoTwist * 0.5, 0],
          Chest: [0, torsoTwist * 0.5, 0],
          RightArm: [-1.52, 0, adductR],
          RightForeArm: [-0.0508, 0, 0],
          LeftArm: [-1.55, 0, adductL],
          LeftForeArm: [-1.85, 0, 0],
        },
        hipsOffset: [0, airHeight * 1.3, 0],
        slashScale: [spinTrail, spinTrail, spinTrail],
        slashRot: [0, spinAngle * 2, 0],
        arrowPos: [0, 0, isFlying ? 0.36 + fly * 12.0 : 0.36],
        arrowScale: isFlying ? [1.3, 1.3, 1.7] : [1.0, 1.0, 1.0],
      };
    }

    return {
      rot: {
        Hips: [0, spinAngle, 0],
        Spine: [0, torsoTwist * 0.45, 0],
        Chest: [0, torsoTwist * 0.55, 0],
        RightArm: [-1.55, 0, adductR - 0.55],
        RightForeArm: [-0.15, 0, 0],
        LeftArm: [-1.55, 0, adductL + 0.55],
        LeftForeArm: [-0.15, 0, 0],
        LeftUpLeg: [Math.sin(spinAngle) * 0.35, 0, 0],
        RightUpLeg: [-Math.sin(spinAngle) * 0.35, 0, 0],
      },
      hipsOffset: [0, Math.sin(u * TWO_PI * 2) * 0.05, 0],
      slashScale: [1.65, 1.65, 1.65],
      slashRot: [0, spinAngle * 2.5, 0],
    };
  });

  // 8. HIT (0.75s) — Retroceso cinético por impacto y sacudida muscular (Enemigo-rpg)
  const hit = build('Hit', 0.75, 20, false, (u, t) => {
    const env = Math.sin(u * Math.PI);
    const stagger = Math.sin(t * 10.0) * 0.18 * env;
    return {
      rot: {
        Hips: [-0.16 * env, 0, 0],
        Spine: [(-0.12 + stagger * 0.2) * env, stagger * 0.25, 0],
        Chest: [(-0.12 + stagger * 0.2) * env, stagger * 0.25, 0],
        Head: [(-0.38 + stagger) * env, 0, 0],
        RightArm: [0, 0, adductR - 0.45 * env],
        LeftArm: [0, 0, adductL + 0.45 * env],
        LeftUpLeg: [-0.22 * env, 0, 0],
        RightUpLeg: [0.26 * env, 0, 0],
        LeftLeg: [0.48 * env, 0, 0],
        RightLeg: [0.42 * env, 0, 0],
      },
      hipsOffset: [0, -0.08 * env, -0.14 * env],
    };
  });

  // 9. DEATH (1.50s) — Colapso al suelo doblando rodillas e inclinando torso (Enemigo-rpg)
  const death = build('Death', 1.5, 26, false, (u) => {
    const ease = 1 - Math.pow(1 - u, 2.4);
    return {
      rot: {
        Hips: [1.02 * ease, 0, 0],
        Spine: [0.12 * ease, 0, 0],
        Chest: [0.12 * ease, 0, 0],
        Head: [0.42 * ease, 0, 0],
        RightArm: [-1.15 * ease, 0, adductR],
        LeftArm: [-1.05 * ease, 0, adductL],
        LeftLeg: [0.78 * ease, 0, 0],
        RightLeg: [0.78 * ease, 0, 0],
      },
      hipsOffset: [0, -0.42 * ease, -0.12 * ease],
    };
  });

  // 10. TPOSE (1.00s) — Pose T estándar de Rigging con brazos a 90° (Enemigo-rpg)
  const tPose = build('TPose', 1.0, 8, true, () => ({
    rot: {
      RightArm: [0, 0, -Math.PI * 0.5 - bindAngleR],
      LeftArm: [0, 0, Math.PI * 0.5 - bindAngleL],
      RightForeArm: [0, 0, 0],
      LeftForeArm: [0, 0, 0],
    },
  }));

  // 11. APOSE (1.00s) — Pose A estándar de Rigging con brazos a 45° (Enemigo-rpg)
  const aPose = build('APose', 1.0, 8, true, () => ({
    rot: {
      RightArm: [0, 0, -Math.PI * 0.25 - bindAngleR],
      LeftArm: [0, 0, Math.PI * 0.25 - bindAngleL],
      RightForeArm: [0, 0, 0],
      LeftForeArm: [0, 0, 0],
      LeftUpLeg: [0, 0, 0.08],
      RightUpLeg: [0, 0, -0.08],
    },
  }));

  return [
    idle,
    walk,
    attack,
    jumpBite,
    stunCombo,
    elementalShot,
    whirlwindSpin,
    hit,
    death,
    tPose,
    aPose,
  ];
}

export function clipNameForAnimation(id: string): string | null {
  const found = RIG_ANIMATIONS.find(
    (a) => a.id === id || a.clipName === id || a.label === id
  );
  return found ? found.clipName : null;
}

/** Nombres claros en español para cada articulación del esqueleto humanoide. */
export const BONE_LABELS_ES: Record<string, string> = {
  Hips: 'Cadera (Centro)',
  Spine: 'Cintura / Abdomen',
  Chest: 'Pecho',
  Neck: 'Cuello',
  Head: 'Cabeza',
  RightShoulder: 'Clavícula Derecha',
  RightArm: 'Hombro Derecho',
  RightForeArm: 'Codo Derecho',
  RightHand: 'Muñeca / Mano Der.',
  LeftShoulder: 'Clavícula Izquierda',
  LeftArm: 'Hombro Izquierdo',
  LeftForeArm: 'Codo Izquierdo',
  LeftHand: 'Muñeca / Mano Izq.',
  RightUpLeg: 'Cadera / Muslo Der.',
  RightLeg: 'Rodilla Derecha',
  RightFoot: 'Tobillo / Pie Der.',
  LeftUpLeg: 'Cadera / Muslo Izq.',
  LeftLeg: 'Rodilla Izquierda',
  LeftFoot: 'Tobillo / Pie Izq.',
};

/** Parejas de huesos simétricos (Derecha <-> Izquierda). */
export const BONE_MIRROR_MAP: Record<string, string> = {
  RightShoulder: 'LeftShoulder',
  LeftShoulder: 'RightShoulder',
  RightArm: 'LeftArm',
  LeftArm: 'RightArm',
  RightForeArm: 'LeftForeArm',
  LeftForeArm: 'RightForeArm',
  RightHand: 'LeftHand',
  LeftHand: 'RightHand',
  RightUpLeg: 'LeftUpLeg',
  LeftUpLeg: 'RightUpLeg',
  RightLeg: 'LeftLeg',
  LeftLeg: 'RightLeg',
  RightFoot: 'LeftFoot',
  LeftFoot: 'RightFoot',
};

export function cloneHumanRig(rig: HumanRig): HumanRig {
  return {
    bones: rig.bones.map((b) => ({
      name: b.name,
      parent: b.parent,
      head: [...b.head] as [number, number, number],
      tail: [...b.tail] as [number, number, number],
    })),
  };
}

/**
 * Mueve una articulación (`head` o `tail` en huesos terminales) y mantiene conectado
 * el `tail` del hueso padre, con opción de simetría bilateral en X.
 */
export function moveRigBoneJoint(
  rig: HumanRig,
  boneName: string,
  newPos: [number, number, number],
  editTail: boolean,
  mirrorSymmetry: boolean
): HumanRig {
  const next = cloneHumanRig(rig);

  const applyOne = (name: string, pos: [number, number, number], isTail: boolean) => {
    const bone = next.bones.find((b) => b.name === name);
    if (!bone) return;
    if (isTail) {
      bone.tail = [...pos];
      return;
    }
    const dx = pos[0] - bone.head[0];
    const dy = pos[1] - bone.head[1];
    const dz = pos[2] - bone.head[2];
    bone.head = [...pos];

    // Si es un hueso terminal (Head, Hand, Foot), desplazar también su punta para conservar el vector del hueso
    const hasChildren = next.bones.some((c) => c.parent === name);
    if (!hasChildren) {
      bone.tail = [bone.tail[0] + dx, bone.tail[1] + dy, bone.tail[2] + dz];
    }

    // Actualizar el tail del padre si este hueso es su hijo principal en la cadena
    if (bone.parent) {
      const parent = next.bones.find((p) => p.name === bone.parent);
      if (parent) {
        const isMainChild =
          (parent.name === 'Hips' && name === 'Spine') ||
          (parent.name === 'Chest' && name === 'Neck') ||
          parent.name !== 'Hips' && parent.name !== 'Chest';
        if (isMainChild) {
          parent.tail = [...pos];
        }
      }
    }
  };

  applyOne(boneName, newPos, editTail);

  if (mirrorSymmetry) {
    const mirrorName = BONE_MIRROR_MAP[boneName];
    if (mirrorName) {
      applyOne(mirrorName, [-newPos[0], newPos[1], newPos[2]], editTail);
    }
  }

  return next;
}

