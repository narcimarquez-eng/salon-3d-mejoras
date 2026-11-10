import * as THREE from 'three';
import { computeHumanRig, computeSkinWeightMaps, sampleSkinWeights, type HumanRig } from './humanRig';
import {
  computeCreatureRig,
  computeSkinWeights3D,
  looksLikeQuadruped,
  type CreatureKind,
  type CreatureMetrics,
} from './creatureRig';
import {
  computeRelativePhotoTransform,
  type PhotoTransform,
  type PhotoTransformsMap,
} from './imagePrep';
export type { PhotoTransform, PhotoTransformsMap };

// ============================================================================
// HUMAN BODY TEMPLATE
// Builds a closed 3D body that follows the drawing's silhouette exactly and
// gets its depth from human proportions instead of from image brightness:
//   - head: oval, a bit deeper than wide
//   - neck: round
//   - torso: wider than deep (chest ≈ 0.6, waist ≈ 0.52, hips ≈ 0.58)
//   - legs: two round cylinders, even when cloth hangs between them
//   - arms, hands and anything else: round tubes sized by their own width
// Front and back surfaces meet directly on the outline, so there is no
// separate "joint" strip with its own colours.
// ============================================================================

export interface HumanBodyInputs {
  /** Silhouette mask, 1 = body, size w*w. */
  mask: Uint8Array;
  /** Back view silhouette mask (already mirrored in X to match front), 1 = body, size w*w. */
  backMask?: Uint8Array | null;
  /** Tensor size (square). */
  w: number;
  /** Front image RGB (0..1), size w*w*3. Used to find the eyes and chin. */
  frontRgb?: Float32Array;
  /** Painted layer maps (offset in units per texel, NaN = no change); the back one is in back-image coordinates. */
  frontLayer?: { offset: Float32Array; soft: Uint8Array } | null;
  backLayer?: { offset: Float32Array; soft: Uint8Array } | null;
  /** Normalised photo relief of the front / back image, size w*w. */
  frontRelief: Float32Array;
  backRelief: Float32Array;
  /**
   * Silueta de la vista de perfil (derecho), en un tensor del mismo tamaño. Da el grosor
   * real (de delante a atrás) a cada altura, en vez de deducirlo de
   * proporciones humanas fijas.
   */
  sideMask?: Uint8Array | null;
  /** Mapa de capas pintado del perfil (opcional), ayuda a orientar frente vs espalda del perfil. */
  sideLayer?: { offset: Float32Array; soft: Uint8Array } | null;
  /** Segunda vista de perfil (izquierdo, p. ej. columna 2 de una hoja de 4 vistas). */
  sideLeftMask?: Uint8Array | null;
  sideLeftLayer?: { offset: Float32Array; soft: Uint8Array } | null;
  /** Relieve normalizado (0..1) de las vistas de perfil derecho e izquierdo. */
  sideRelief?: Float32Array | null;
  sideLeftRelief?: Float32Array | null;
  /**
   * Silueta de la VISTA SUPERIOR (cenital), en un tensor del mismo tamaño.
   * Es el TERCER plano ortográfico: frente y perfil solo miden en función de la ALTURA
   * (ancho(Y) y profundidad(Y)), así que en un cuadrúpedo toda la franja de altura de la
   * barriga -hocico, pecho, cadera y cola- recibe el mismo ancho. La vista superior da
   * ancho(Z): hocico estrecho, hombros anchos, separación real entre patas y cola fina.
   */
  topMask?: Uint8Array | null;
  /** Mapa de capas pintado de la vista superior (opcional). */
  topLayer?: { offset: Float32Array; soft: Uint8Array } | null;
  /** Marks which vertices are in use (the viewport reads it). */
  vertexUsedMask: Uint8Array;
  maxVertices: number;
  atlas?: AtlasRepairInput;
}

export interface ProfileSeamViewInput {
  /** Color rellenado (0..1), tamaño w*w*3. */
  inpainted: Float32Array;
  /** Silueta del perfil (1 = cuerpo), tamaño w*w. */
  cutout: Uint8Array;
  /** Mapa de capas opcional del perfil. */
  layer?: { offset: Float32Array; soft: Uint8Array } | null;
}

export interface AtlasRepairInput {
  /** RGBA8 atlas (front quadrant at x 0..w-1, back quadrant at x w..2w-1, rows 0..w-1). */
  albedo: Uint8Array;
  /** RGBA8 roughness (G) / metalness (B) atlas with the same layout. */
  roughMetal?: Uint8Array;
  atlasWidth: number;
  /** Background colour of the front / back photos (0..1). */
  background: [number, number, number];
  backBackground?: [number, number, number];
  /** Silueta propia de la vista de espalda para reparar su cuadrante sin recortar cola/alas traseras. */
  backMask?: Uint8Array | null;
  /** Vistas de perfil para texturizar la banda de unión lateral (p. ej. 5,6 cm). */
  sideProfile?: ProfileSeamViewInput | null;
  sideLeftProfile?: ProfileSeamViewInput | null;
}

export type FaceModelId =
  | 'none'
  | 'classic'
  | 'heroic'
  | 'anime'
  | 'brute'
  | 'elf'
  | 'skull';

export type NoseShapeId =
  | 'classic'
  | 'sharp'
  | 'broad'
  | 'aquiline'
  | 'snout'
  | 'hollow';

export type MouthShapeId =
  | 'neutral'
  | 'full'
  | 'thin'
  | 'wide'
  | 'smile';

export type ChinShapeId =
  | 'rounded'
  | 'square'
  | 'pointed'
  | 'cleft'
  | 'jowls';

export type EyeSocketShapeId =
  | 'almond'
  | 'round'
  | 'wide'
  | 'hooded'
  | 'skeletal';

export type ActiveFaceFeatureId =
  | 'none'
  | 'head'
  | 'nose'
  | 'eyes'
  | 'mouth'
  | 'chin';

export interface FaceFeaturePoints3D {
  head: [number, number, number];
  nose: [number, number, number];
  eyes: [number, number, number];
  leftEye: [number, number, number];
  rightEye: [number, number, number];
  mouth: [number, number, number];
  chin: [number, number, number];
  headRadiusWorld: number;
  faceHalfWorld: number;
}

export interface HumanBodyOptions {
  /** Overall body depth multiplier (1 = natural human proportions). */
  depthScale: number;
  /** How much of the photo relief is added on top (0..1). */
  reliefAmount: number;
  /** Cuánto talla la vista superior el molde 3D (0 = ignorarla, 1 = casco visual completo). */
  topStrength?: number;
  /**
   * Orientación de la vista superior a lo largo del eje del cuerpo:
   * 'auto' la deduce correlacionando su perfil de anchura con el grosor del perfil lateral,
   * 'head-first' / 'tail-first' la fuerzan (cabeza en el extremo inicial del eje largo o en el final).
   */
  topOrientation?: 'auto' | 'head-first' | 'tail-first';
  /** Mesh rows over the figure height. */
  rows: number;
  /** Also build a skeleton and skin weights (skinIndex / skinWeight attributes). */
  rig?: boolean;
  /**
   * Qué esqueleto montar. 'auto' decide por la forma de la malla: un bicho
   * horizontal (cuadrúpedo, dragón, montura) recibe el esqueleto de criatura y
   * una figura erguida el humanoide de 19 huesos.
   */
  rigKind?: 'auto' | 'human' | 'creature';
  /** Optional custom skeleton rig (if the user edited bone positions). */
  customRig?: HumanRig | null;
  /** Height multiplier for painted layer maps. */
  layerStrength?: number;
  /** Total 3D head size multiplier (0.4..2.5, 1 = original proportion). */
  headScale?: number;
  /** 3D head roundness / shape (0.2 = angular/square/flat, 1 = natural, 2.5 = very rounded/spherical). */
  headRoundness?: number;
  /** Strength of the facial features (0 = none, 1 = subtle). */
  faceDetail?: number;
  /** Whether to generate preset facial features/bones (nose, brow ridge, cheekbones, chin) instead of deriving head volume purely from the image, profile, and layers like the rest of the body. */
  presetFaceFeatures?: boolean;
  /** Archetype face model preset. */
  faceModel?: FaceModelId;
  /** Nose size/projection multiplier (0..6.0). */
  noseSize?: number;
  /** Nose anatomical shape. */
  noseShape?: NoseShapeId;
  /** Nose horizontal X offset (-0.5..+0.5, positive = right). */
  noseXOffset?: number;
  /** Nose vertical Y offset (-0.5..+0.5, positive = higher). */
  noseYOffset?: number;
  /** Nose depth Z offset (-0.6..+0.8, positive = further forward). */
  noseZOffset?: number;
  /** Mouth & lips size/volume multiplier (0..6.0). */
  mouthSize?: number;
  /** Mouth anatomical shape. */
  mouthShape?: MouthShapeId;
  /** Mouth horizontal X offset (-0.5..+0.5, positive = right). */
  mouthXOffset?: number;
  /** Mouth vertical Y offset (-0.5..+0.5, positive = higher). */
  mouthYOffset?: number;
  /** Mouth depth Z offset (-0.6..+0.8, positive = further forward). */
  mouthZOffset?: number;
  /** Chin & jaw projection multiplier (0..6.0). */
  chinSize?: number;
  /** Chin anatomical shape. */
  chinShape?: ChinShapeId;
  /** Chin horizontal X offset (-0.5..+0.5, positive = right). */
  chinXOffset?: number;
  /** Chin vertical Y offset (-0.5..+0.5, positive = higher). */
  chinYOffset?: number;
  /** Chin depth Z offset (-0.6..+0.8, positive = further forward). */
  chinZOffset?: number;
  /** Eye sockets & brow depth/size multiplier (0..6.0). */
  eyeSocketSize?: number;
  /** Eye sockets anatomical shape. */
  eyeSocketShape?: EyeSocketShapeId;
  /** Eye sockets horizontal X offset (-0.5..+0.5, positive = right). */
  eyeSocketXOffset?: number;
  /** Eye sockets vertical Y offset (-0.5..+0.5, positive = higher). */
  eyeSocketYOffset?: number;
  /** Eye sockets depth Z offset (-0.6..+0.8, positive = further forward). */
  eyeSocketZOffset?: number;
  /** Add shoes (flat sole, toe forward). Default true. */
  shoes?: boolean;
  /** Cuánto manda el perfil sobre el grosor del cuerpo (0 = nada, 1 = del todo). */
  sideStrength?: number;
  /** Perfil único: el cuerpo se recorta con la silueta del perfil principal. */
  singleProfile?: boolean;
  /**
   * Modo ortogonal 4 vistas:
   * - Silueta Izq/Der tomada estrictamente de la imagen delantera,
   * - Silueta Frente/Atrás (+Z/-Z) tomada directamente de la imagen lateral (perfil),
   * - Textura delantera de la imagen delantera, trasera de la trasera y banda de unión de las imágenes de perfil.
   */
  orthogonalSilhouetteAndSeam?: boolean;
  /** Anchura en centímetros (p. ej. 5.6 cm) de la banda de textura de perfil alrededor de la unión lateral. */
  profileSeamWidthCm?: number;
  /** Porcentaje de aplicación de la textura de los perfiles (0..100, por defecto 0 = Frente delante y Atrás detrás). */
  profileTexturePct?: number;
  /**
   * Modo de construcción libre (Sin molde previo):
   * Genera el molde 3D íntegramente a partir de las fotos (silueta frontal,
   * silueta de perfil si existe, campo de distancia geométrico y volumen/relieve
   * luminoso de las propias imágenes), sin aplicar un molde anatómico humano previo.
   */
  freeformFromPhotos?: boolean;
  /**
   * Intensidad del volumen macroscópico extraído del sombreado/luminancia de las fotos
   * en el modo de construcción libre (0..2, por defecto 1.0).
   */
  freeformPhotoVolume?: number;
  /**
   * Redondez de la sección transversal en construcción libre (0.3 = más plano/angular,
   * 1.0 = elíptico orgánico natural, 2.5 = muy abombado/cilíndrico).
   */
  freeformSectionRoundness?: number;
  /** Transformaciones interactivas de posición, tamaño, giro y espejo por vista. */
  photoTransforms?: PhotoTransformsMap;
}

export interface HumanBodyLandmarks {
  top: number;
  bottom: number;
  axisX: number;
  neckY: number;
  shoulderY: number;
  armpitY: number;
  crotchY: number;
  /** Signed Z-center offset per row (in front-texel units) extracted from the profile silhouette. */
  zCenterByRow?: Float32Array;
  /** Face found in the image (texel coords), when detection is confident. */
  face?: FaceFeatures;
  /** Exact 3D local coordinates of the head and facial features on the mesh. */
  facePoints3D?: FaceFeaturePoints3D;
}

export interface FaceFeatures {
  eyeY: number;
  chinY: number;
  centerX: number;
  /** Half the distance between the eyes. */
  eyeHalfSpacing: number;
}

export interface HumanBodyStats {
  vertexCount: number;
  triangleCount: number;
  landmarks: HumanBodyLandmarks;
  rig?: HumanRig;
  /** Qué esqueleto se ha montado: humanoide o criatura (cuadrúpedo / cuadrúpedo alado). */
  rigKind?: 'human' | CreatureKind;
  /** Medidas del cuerpo, solo con esqueleto de criatura: las usan sus animaciones. */
  creatureMetrics?: CreatureMetrics;
  rebindData?: HumanRebindData;
}

// World units: the existing pipeline maps the full tensor width to 2.85 units.
const WORLD_SPAN = 2.85;

let _size = 0;
let _field = new Float32Array(0);
let _tmp = new Float32Array(0);
let _dist = new Float32Array(0);
let _radius = new Float32Array(0);
let _depth = new Float32Array(0);
let _frontBase = new Float32Array(0);
let _backBase = new Float32Array(0);
let _frontD = new Float32Array(0);
let _backD = new Float32Array(0);
let _coreMask = new Uint8Array(0);
let _limbMask = new Uint8Array(0);
let _limbDist = new Float32Array(0);
let _limbRadius = new Float32Array(0);
let _rowCoreDepth = new Float32Array(0);

function ensureBuffers(w: number) {
  if (_size === w) return;
  _size = w;
  const n = w * w;
  _field = new Float32Array(n);
  _tmp = new Float32Array(n);
  _dist = new Float32Array(n);
  _radius = new Float32Array(n);
  _depth = new Float32Array(n);
  _frontBase = new Float32Array(n);
  _backBase = new Float32Array(n);
  _frontD = new Float32Array(n);
  _backD = new Float32Array(n);
  _coreMask = new Uint8Array(n);
  _limbMask = new Uint8Array(n);
  _limbDist = new Float32Array(n);
  _limbRadius = new Float32Array(n);
  _rowCoreDepth = new Float32Array(w);
}

const K5 = [0.0625, 0.25, 0.375, 0.25, 0.0625];

/** Separable 5-tap blur; when `mask` is given, pixels outside it are forced to 0. */
function blur5(src: Float32Array, w: number, passes: number, mask?: Uint8Array) {
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let o = -2; o <= 2; o++) {
          const sx = x + o < 0 ? 0 : x + o >= w ? w - 1 : x + o;
          s += src[y * w + sx] * K5[o + 2];
        }
        _tmp[y * w + x] = s;
      }
    }
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (mask && mask[i] !== 1) {
          src[i] = 0;
          continue;
        }
        let s = 0;
        for (let o = -2; o <= 2; o++) {
          const sy = y + o < 0 ? 0 : y + o >= w ? w - 1 : y + o;
          s += _tmp[sy * w + x] * K5[o + 2];
        }
        src[i] = s;
      }
    }
  }
}

function sample(buf: Float32Array, w: number, x: number, y: number): number {
  const cx = Math.max(0, Math.min(w - 1.001, x));
  const cy = Math.max(0, Math.min(w - 1.001, y));
  const x0 = cx | 0;
  const y0 = cy | 0;
  const fx = cx - x0;
  const fy = cy - y0;
  const i = y0 * w + x0;
  const a = buf[i] * (1 - fx) + buf[i + 1] * fx;
  const b = buf[i + w] * (1 - fx) + buf[i + w + 1] * fx;
  return a * (1 - fy) + b * fy;
}

/** Chamfer distance to the outside plus the radius of the largest inscribed disk covering each pixel. */
function distanceAndRadius(mask: Uint8Array, w: number, D: Float32Array = _dist, R: Float32Array = _radius) {
  const INF = 1e6;
  for (let i = 0; i < w * w; i++) D[i] = mask[i] === 1 ? INF : 0;
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
  for (let i = 0; i < w * w; i++) if (D[i] > 0) D[i] -= 0.5;

  R.fill(0);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = D[i];
      if (r < 1) continue;
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

function runNearest(runs: Run[], x: number): number {
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

function smooth1D(arr: Float32Array, from: number, to: number, radius: number) {
  const out = new Float32Array(arr.length);
  for (let y = from; y <= to; y++) {
    let s = 0;
    let ws = 0;
    for (let o = -radius; o <= radius; o++) {
      const yy = y + o;
      if (yy < from || yy > to) continue;
      const wt = Math.exp(-(o * o) / (2 * (radius * 0.5) ** 2));
      s += arr[yy] * wt;
      ws += wt;
    }
    out[y] = ws > 0 ? s / ws : arr[y];
  }
  for (let y = from; y <= to; y++) arr[y] = out[y];
}

/** Superellipse cross-section height: depth at centre, 0 at ±halfWidth. */
function crossSection(dx: number, halfWidth: number, depth: number, p: number): number {
  if (halfWidth <= 0) return 0;
  const t = Math.abs(dx) / halfWidth;
  if (t >= 1) return 0;
  return depth * Math.pow(1 - Math.pow(t, p), 1 / p);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Torso depth/width ratio along the torso (t = 0 at neck, 1 at crotch). */
function torsoDepthRatio(t: number): number {
  if (t < 0.25) return lerp(0.8, 0.74, t / 0.25); // upper chest / shoulders
  if (t < 0.6) return lerp(0.74, 0.64, (t - 0.25) / 0.35); // chest -> waist
  return lerp(0.64, 0.7, Math.min(1, (t - 0.6) / 0.4)); // waist -> hips
}

/**
 * Finds the eye line and the chin in the front image.
 * - Eyes: the row where two dark spots sit symmetrically either side of the
 *   face centre, darker than the brow above and the cheeks below.
 * - Chin: going down from the eyes, where the skin colour (sampled under the
 *   eyes) stops filling the lower face.
 * Returns null when nothing convincing is found (the caller then falls back
 * to proportions).
 */
function detectFace(
  rgb: Float32Array,
  mask: Uint8Array,
  w: number,
  top: number,
  axisX: number,
  skullW: number,
  chinGuess: number,
  shoulderY: number
): FaceFeatures | null {
  const half = skullW / 2;
  const Hg = chinGuess - top;
  if (half < 4 || Hg < 10) return null;
  const lum = (x: number, y: number) => {
    const xi = Math.max(0, Math.min(w - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(w - 1, Math.round(y)));
    const i = (yi * w + xi) * 3;
    return 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
  };
  // 3x3 mean luminance (smooths single dark pixels / outlines).
  const lum3 = (x: number, y: number) => {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += lum(x + dx, y + dy);
    return s / 9;
  };

  // --- Eye line -----------------------------------------------------------
  let best = -Infinity;
  let eyeY = -1;
  let eyeLx = 0;
  let eyeRx = 0;
  const band = Math.max(2, Math.round(Hg * 0.12));
  for (let y = Math.round(top + 0.35 * Hg); y <= Math.round(top + 0.8 * Hg); y++) {
    const darkest = (side: -1 | 1) => {
      let m = Infinity;
      let mx = axisX;
      for (let k = 0.12; k <= 0.6; k += 0.04) {
        const x = axisX + side * k * half;
        if (mask[Math.round(y) * w + Math.round(x)] !== 1) continue;
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
    // Brow above and cheek below at the same columns.
    const around =
      (lum3(lx, y - band) + lum3(rx, y - band) + lum3(lx, y + band) + lum3(rx, y + band)) / 4;
    const eyes = (dl + dr) / 2;
    const symmetry = Math.abs(dl - dr) + Math.abs((axisX - lx) - (rx - axisX)) / half * 0.15;
    const score = around - eyes - symmetry;
    if (score > best) {
      best = score;
      eyeY = y;
      eyeLx = lx;
      eyeRx = rx;
    }
  }
  if (eyeY < 0 || best < 0.035) return null;
  const centerX = (eyeLx + eyeRx) / 2;
  const eyeHalfSpacing = Math.max(half * 0.25, Math.min(half * 0.75, (eyeRx - eyeLx) / 2));

  // --- Chin ---------------------------------------------------------------
  // Skin colour: median-ish average below the eyes, between nose and cheeks.
  let sr = 0, sg = 0, sb = 0, sn = 0;
  for (let y = Math.round(eyeY + 0.12 * Hg); y <= Math.round(eyeY + 0.25 * Hg); y++) {
    for (let x = Math.round(centerX - 0.35 * half); x <= Math.round(centerX + 0.35 * half); x++) {
      if (mask[y * w + x] !== 1) continue;
      const i = (y * w + x) * 3;
      sr += rgb[i];
      sg += rgb[i + 1];
      sb += rgb[i + 2];
      sn++;
    }
  }
  if (sn < 4) return null;
  sr /= sn;
  sg /= sn;
  sb /= sn;
  const skinFraction = (y: number) => {
    let hit = 0;
    let n = 0;
    for (let x = Math.round(centerX - 0.45 * half); x <= Math.round(centerX + 0.45 * half); x++) {
      if (x < 0 || x >= w) continue;
      n++;
      const i = (y * w + x) * 3;
      const dr = rgb[i] - sr;
      const dg = rgb[i + 1] - sg;
      const db = rgb[i + 2] - sb;
      if (dr * dr + dg * dg + db * db < 0.018) hit++;
    }
    return n ? hit / n : 0;
  };
  let chinY = -1;
  let seenSkin = false;
  let miss = 0;
  const yEnd = Math.min(w - 2, Math.max(shoulderY, chinGuess) + Math.round(0.35 * Hg));
  for (let y = Math.round(eyeY + 0.2 * Hg); y <= yEnd; y++) {
    const f = skinFraction(y);
    if (f >= 0.45) {
      seenSkin = true;
      miss = 0;
    } else if (seenSkin && f < 0.25) {
      if (++miss >= 3) {
        chinY = y - 3;
        break;
      }
    } else {
      miss = 0;
    }
  }
  // Fallback: classic proportion from the eyes (eyes ~59% of the way from top to chin).
  if (chinY < 0) chinY = Math.round(top + (eyeY - top) / 0.59);
  // Sanity: the chin must sit a plausible distance below the eyes.
  const minChin = eyeY + 0.25 * (eyeY - top);
  const maxChin = eyeY + 1.1 * (eyeY - top);
  chinY = Math.round(Math.max(minChin, Math.min(maxChin, chinY)));
  return { eyeY, chinY, centerX, eyeHalfSpacing };
}

/**
 * Builds the half-thickness map (in texels) of a human body that fills the silhouette.
 */
/**
 * Mide con detenimiento el contorno delantero (+Z) y trasero (-Z) de la vista de perfil
 * fila por fila respecto al eje anatómico vertical (tobillo -> cadera -> cuello -> cabeza).
 *
 * Detecta automáticamente si el perfil mira hacia la derecha (+X) o hacia la izquierda (-X)
 * combinando:
 *   1) La posición de la piel de la cara frente al pelo/cráneo en `sideLayer` (si existe),
 *   2) La proyección de la puntera del pie respecto al tobillo/espinilla,
 *   3) El contorno de nariz/pecho frente a nuca/espalda.
 *
 * Devuelve `frontHalf` y `backHalf` en unidades de texel de la vista de frente para cada fila `y`.
 */
interface SideProfileContours {
  frontHalf: Float32Array;
  backHalf: Float32Array;
  totalHalf: Float32Array;
  zCenter: Float32Array;
  facingRight: boolean;
  sTop: number;
  sBot: number;
  minX: Int32Array;
  maxX: Int32Array;
  sideAxis: Float32Array;
}

function fillAndSmoothRowCurve(
  arr: Float32Array,
  top: number,
  bottom: number,
  smoothPasses: number
): boolean {
  let prev = -1;
  for (let y = top; y <= bottom; y++) {
    if (!Number.isFinite(arr[y])) continue;
    if (prev >= 0 && y - prev > 1) {
      for (let q = prev + 1; q < y; q++) {
        const t = (q - prev) / (y - prev);
        arr[q] = arr[prev] * (1 - t) + arr[y] * t;
      }
    }
    prev = y;
  }
  let first = -1;
  let last = -1;
  for (let y = top; y <= bottom; y++) {
    if (!Number.isFinite(arr[y])) continue;
    if (first < 0) first = y;
    last = y;
  }
  if (first < 0) return false;
  for (let y = top; y < first; y++) arr[y] = arr[first];
  for (let y = last + 1; y <= bottom; y++) arr[y] = arr[last];
  if (smoothPasses > 0) smooth1D(arr, top, bottom, smoothPasses);
  return true;
}

function sideProfileContoursByRow(
  sideMask: Uint8Array,
  w: number,
  top: number,
  bottom: number,
  sideLayer?: { offset: Float32Array; soft: Uint8Array } | null,
  excludeWingCloth = false,
  sideTransform?: PhotoTransform | null
): SideProfileContours | null {
  const minX = new Int32Array(w).fill(-1);
  const maxX = new Int32Array(w).fill(-1);
  const coreMinX = new Int32Array(w).fill(-1);
  const coreMaxX = new Int32Array(w).fill(-1);
  let sTop = -1;
  let sBot = -1;
  let autoExcludeWings = excludeWingCloth;
  if (!autoExcludeWings && sideLayer) {
    let clothCnt = 0;
    let spikeCnt = 0;
    for (let i = 0; i < w * w; i++) {
      const off = sideLayer.offset[i];
      if (!Number.isFinite(off)) continue;
      if (Math.abs(off - 0.35) < 0.05) clothCnt++;
      else if (Math.abs(off - 1.8) < 0.1) spikeCnt++;
    }
    if (clothCnt > 280 && spikeCnt > 15) autoExcludeWings = true;
  }
  for (let y = 0; y < w; y++) {
    let a = -1;
    let b = -1;
    let ca = -1;
    let cb = -1;
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (sideMask[idx] !== 1) continue;
      if (a < 0) a = x;
      b = x;
      const off = sideLayer ? sideLayer.offset[idx] : NaN;
      const isWingCloth =
        autoExcludeWings && Number.isFinite(off) && Math.abs(off - 0.35) < 0.05;
      if (!isWingCloth) {
        if (ca < 0) ca = x;
        cb = x;
      }
    }
    minX[y] = a;
    maxX[y] = b;
    coreMinX[y] = ca >= 0 ? ca : a;
    coreMaxX[y] = cb >= 0 ? cb : b;
    if (a >= 0) {
      if (sTop < 0) sTop = y;
      sBot = y;
    }
  }
  const Hf = bottom - top + 1;
  const Hs = sBot - sTop + 1;
  if (sTop < 0 || Hs < 8 || Hf < 8) return null;

  // 1) Detectar automáticamente hacia qué lado mira el perfil (derecha = +X es frente, izquierda = -X es frente)
  let rightScore = 0;

  if (sideLayer) {
    let frontClassXSum = 0;
    let frontClassCnt = 0;
    let backClassXSum = 0;
    let backClassCnt = 0;
    for (let y = sTop; y <= sBot; y++) {
      if (minX[y] < 0) continue;
      for (let x = minX[y]; x <= maxX[y]; x++) {
        const off = sideLayer.offset[y * w + x];
        if (!Number.isFinite(off)) continue;
        if (Math.abs(off - 1.0) < 0.08) {
          frontClassXSum += x;
          frontClassCnt++;
        } else if (
          Math.abs(off - 1.8) < 0.10 ||
          (autoExcludeWings && Math.abs(off - 0.35) < 0.05)
        ) {
          backClassXSum += x;
          backClassCnt++;
        }
      }
    }
    if (frontClassCnt >= 10 && backClassCnt >= 10) {
      const diff = (frontClassXSum / frontClassCnt - backClassXSum / backClassCnt) / Math.max(1, Hs * 0.25);
      rightScore += diff * 12.0;
    }

    const yHead0 = Math.round(sTop + Hs * 0.06);
    const yHead1 = Math.round(sTop + Hs * 0.25);
    let skinDxSum = 0;
    let skinCount = 0;
    for (let y = yHead0; y <= yHead1; y++) {
      if (coreMinX[y] < 0) continue;
      const mid = 0.5 * (coreMinX[y] + coreMaxX[y]);
      const span = Math.max(1, coreMaxX[y] - coreMinX[y]);
      for (let x = coreMinX[y]; x <= coreMaxX[y]; x++) {
        const off = sideLayer.offset[y * w + x];
        if (Number.isFinite(off) && Math.abs(off) < 0.05) {
          skinDxSum += (x - mid) / span;
          skinCount++;
        }
      }
    }
    if (skinCount >= 8) {
      rightScore += (skinDxSum / skinCount) * 4.0;
    }
  }

  let groundMidSum = 0;
  let groundCnt = 0;
  for (let y = Math.round(sTop + Hs * 0.93); y <= Math.round(sTop + Hs * 0.99); y++) {
    if (minX[y] >= 0) {
      groundMidSum += 0.5 * (minX[y] + maxX[y]);
      groundCnt++;
    }
  }
  if (groundCnt > 0) {
    const groundMid = groundMidSum / groundCnt;
    let extRight = 0;
    let extLeft = 0;
    let extCnt = 0;
    for (let y = Math.round(sTop + Hs * 0.65); y <= Math.round(sTop + Hs * 0.88); y++) {
      if (minX[y] >= 0) {
        extRight = Math.max(extRight, maxX[y] - groundMid);
        extLeft = Math.max(extLeft, groundMid - minX[y]);
        extCnt++;
      }
    }
    for (let y = Math.round(sTop + Hs * 0.12); y <= Math.round(sTop + Hs * 0.44); y++) {
      if (minX[y] >= 0) {
        extRight = Math.max(extRight, maxX[y] - groundMid);
        extLeft = Math.max(extLeft, groundMid - minX[y]);
        extCnt++;
      }
    }
    if (extCnt > 0 && Math.abs(extRight - extLeft) > Hs * 0.14) {
      rightScore += ((extLeft - extRight) / Math.max(1, Hs * 0.25)) * 5.0;
    } else {
      let ankleMidSum = 0;
      let ankleCnt = 0;
      for (let y = Math.round(sTop + Hs * 0.80); y <= Math.round(sTop + Hs * 0.89); y++) {
        if (minX[y] >= 0) {
          ankleMidSum += 0.5 * (minX[y] + maxX[y]);
          ankleCnt++;
        }
      }
      if (ankleCnt > 0) {
        const ankleMid = ankleMidSum / ankleCnt;
        const diff = (groundMid - ankleMid) / Math.max(1, Hs * 0.05);
        rightScore += diff * 2.5;
      }
    }
  }

  const facingRight = rightScore >= 0;

  // 2) Eje de plomada vertical fijo (`sOriginX`, donde Z = 0 en el plano ZY del perfil)
  //    y curva local de cada fila (`sideAxis[ys]`) para la proyección de costura.
  const regionMid = (t0: number, t1: number): number => {
    const vals: number[] = [];
    const y0 = Math.max(sTop, Math.round(sTop + Hs * t0));
    const y1 = Math.min(sBot, Math.round(sTop + Hs * t1));
    for (let y = y0; y <= y1; y++) {
      if (coreMinX[y] >= 0) vals.push(0.5 * (coreMinX[y] + coreMaxX[y]));
    }
    if (!vals.length) return w * 0.5;
    vals.sort((a, b) => a - b);
    return vals[vals.length >> 1];
  };

  const neckMid = regionMid(0.18, 0.28);
  const waistMid = regionMid(0.38, 0.55);
  const kneeMid = regionMid(0.68, 0.78);
  const ankleMid = regionMid(0.88, 0.98);
  const originCandidates = [neckMid, waistMid, waistMid, ankleMid].sort((a, b) => a - b);
  const sOriginX = 0.5 * (originCandidates[1] + originCandidates[2]);

  const sideAxis = new Float32Array(w);
  for (let ys = sTop; ys <= sBot; ys++) {
    const t = (ys - sTop) / Math.max(1, Hs - 1);
    let spineX: number;
    if (t <= 0.21) {
      spineX = neckMid;
    } else if (t <= 0.48) {
      const u = (t - 0.21) / 0.27;
      spineX = lerp(neckMid, waistMid, u);
    } else if (t <= 0.73) {
      const u = (t - 0.48) / 0.25;
      spineX = lerp(waistMid, kneeMid, u);
    } else {
      const u = Math.min(1, (t - 0.73) / 0.22);
      spineX = lerp(kneeMid, ankleMid, u);
    }
    const rowMid = coreMinX[ys] >= 0 ? 0.5 * (coreMinX[ys] + coreMaxX[ys]) : spineX;
    sideAxis[ys] = lerp(rowMid, spineX, 0.35);
  }

  const k = Hf / Hs;
  const scaleSideX = Math.max(0.15, Math.min(3.5, sideTransform?.scaleX ?? 1));
  const scaleSideY = Math.max(0.15, Math.min(3.5, sideTransform?.scaleY ?? 1));
  const dxSideTex = ((sideTransform?.offsetX ?? 0) / 100) * Hf;
  const dySideTex = ((sideTransform?.offsetY ?? 0) / 100) * Hf;
  const dzSideTex = (facingRight ? 1 : -1) * dxSideTex;
  const fMidY = 0.5 * (top + bottom);

  const accF = new Float32Array(w);
  const accB = new Float32Array(w);
  const accT = new Float32Array(w);
  const accZ = new Float32Array(w);
  const cnt = new Float32Array(w);

  for (let ys = sTop; ys <= sBot; ys++) {
    if (coreMinX[ys] < 0) continue;
    const t = (ys - sTop) / Math.max(1, Hs - 1);
    const yfBase = top + t * (Hf - 1);
    const yf = Math.round(fMidY + (yfBase - fMidY) * scaleSideY + dySideTex);
    if (yf < 0 || yf >= w) continue;

    // Coordenadas firmadas Z respecto a la línea vertical de plomada `sOriginX`:
    // zFrontSigned = límite delantero (+Z) de la silueta de perfil en esta fila
    // zBackSigned  = límite trasero (-Z) de la silueta de perfil en esta fila
    const zFrontSigned =
      (facingRight ? coreMaxX[ys] - sOriginX + 0.5 : sOriginX - coreMinX[ys] + 0.5) * k * scaleSideX;
    const zBackSigned =
      (facingRight ? coreMinX[ys] - sOriginX - 0.5 : sOriginX - coreMaxX[ys] - 0.5) * k * scaleSideX;
    const halfThick = Math.max(1.2, 0.5 * (zFrontSigned - zBackSigned));
    const zCenterRow = 0.5 * (zFrontSigned + zBackSigned) + dzSideTex;

    accF[yf] += halfThick;
    accB[yf] += halfThick;
    accT[yf] += halfThick;
    accZ[yf] += zCenterRow;
    cnt[yf] += 1;
  }

  const frontHalf = new Float32Array(w).fill(NaN);
  const backHalf = new Float32Array(w).fill(NaN);
  const totalHalf = new Float32Array(w).fill(NaN);
  const zCenter = new Float32Array(w).fill(NaN);
  for (let y = top; y <= bottom; y++) {
    if (cnt[y] > 0) {
      frontHalf[y] = accF[y] / cnt[y];
      backHalf[y] = accB[y] / cnt[y];
      totalHalf[y] = accT[y] / cnt[y];
      zCenter[y] = accZ[y] / cnt[y];
    }
  }

  if (
    !fillAndSmoothRowCurve(frontHalf, top, bottom, 1) ||
    !fillAndSmoothRowCurve(backHalf, top, bottom, 1) ||
    !fillAndSmoothRowCurve(totalHalf, top, bottom, 1) ||
    !fillAndSmoothRowCurve(zCenter, top, bottom, 2)
  ) {
    return null;
  }

  return { frontHalf, backHalf, totalHalf, zCenter, facingRight, sTop, sBot, minX, maxX, sideAxis };
}

function buildHumanDepthMap(
  mask: Uint8Array,
  w: number,
  rgb?: Float32Array,
  sideMask?: Uint8Array | null,
  sideStrength = 1,
  presetFaceFeatures = false,
  sideLayer?: { offset: Float32Array; soft: Uint8Array } | null,
  headRoundness = 1.0,
  sideLeftMask?: Uint8Array | null,
  sideLeftLayer?: { offset: Float32Array; soft: Uint8Array } | null,
  orthogonalSilhouette = true,
  photoTransforms?: PhotoTransformsMap
): HumanBodyLandmarks {
  distanceAndRadius(mask, w);

  // --- Landmarks -----------------------------------------------------------
  let top = -1;
  let bottom = -1;
  let massX = 0;
  let mass = 0;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) continue;
      if (top < 0) top = y;
      bottom = y;
      massX += x;
      mass++;
    }
  }
  _depth.fill(0);
  _frontBase.fill(0);
  _backBase.fill(0);
  if (top < 0 || mass < 50) {
    return { top: 0, bottom: 0, axisX: w / 2, neckY: 0, shoulderY: 0, armpitY: 0, crotchY: 0 };
  }
  const H = bottom - top + 1;
  const axisX = massX / mass;
  const ax = Math.round(axisX);

  const runsByRow: Run[][] = [];
  for (let y = 0; y < w; y++) runsByRow.push(y >= top && y <= bottom ? rowRuns(mask, w, y) : []);
  const axisRun = (y: number) => {
    const runs = runsByRow[y];
    const k = runNearest(runs, axisX);
    return k >= 0 ? runs[k] : null;
  };

  const axisWidth = (y: number) => {
    const r = axisRun(y);
    return r ? r[1] - r[0] + 1 : 0;
  };

  const axisCenterRun = (y: number) => {
    const runs = runsByRow[y];
    for (let k = 0; k < runs.length; k++) {
      if (runs[k][0] <= axisX + 3 && runs[k][1] >= axisX - 3) return runs[k];
    }
    return null;
  };

  // Real head top: first row where the central axis itself is inside the silhouette
  // (lateral helmet horns sit on the sides and leave the centre empty).
  let headTop = top;
  for (let y = top; y <= top + Math.round(H * 0.15); y++) {
    if (axisCenterRun(y)) {
      headTop = y;
      break;
    }
  }

  // Skull width from the upper-middle part of the head (below horn roots, above shoulders).
  const skullWidths: number[] = [];
  for (let y = headTop + Math.round(H * 0.03); y <= headTop + Math.round(H * 0.13); y++) {
    const r = axisCenterRun(y) ?? axisRun(y);
    const wd = r ? r[1] - r[0] + 1 : 0;
    if (wd > 4 && wd < H * 0.22) skullWidths.push(wd);
  }
  skullWidths.sort((p, q) => p - q);
  const skullW = skullWidths.length ? skullWidths[Math.floor(skullWidths.length * 0.4)] : H * 0.105;
  // A head (hair/helmet included) is ~1.35 times as tall as its skull is wide.
  const chinEstimate = Math.max(headTop + Math.round(skullW * 1.25), top + Math.round(H * 0.13));

  // Shoulders: below the head, where the body run becomes much wider than the skull and stays so.
  let shoulderY = Math.max(chinEstimate, top + Math.round(H * 0.16));
  {
    let wideRows = 0;
    const minShoulderStart = Math.max(headTop + Math.round(skullW * 1.15), top + Math.round(H * 0.13));
    const minShoulderWidth = Math.max(skullW * 1.65, H * 0.22);
    for (let y = minShoulderStart; y <= top + Math.round(H * 0.34); y++) {
      const wd = axisWidth(y);
      if (wd >= minShoulderWidth) {
        if (++wideRows >= 3) {
          shoulderY = y - 2;
          break;
        }
      } else {
        wideRows = 0;
      }
    }
  }

  // Neck: narrowest axis run between the lower head and the shoulders.
  let neckY = Math.max(headTop + 1, shoulderY - 2);
  let neckW = Infinity;
  const neckSearchStart = Math.max(headTop + Math.round(skullW * 0.8), top + Math.round(H * 0.1));
  for (let y = neckSearchStart; y < shoulderY; y++) {
    const wd = axisWidth(y);
    if (wd > 0 && wd <= neckW) {
      neckW = wd;
      neckY = y;
    }
  }
  neckY = Math.max(neckY, Math.min(chinEstimate, shoulderY - 1));
  const headHalfMax = (skullW / 2) * 1.15;

  // Eyes and chin read from the image only when preset facial features are enabled.
  // Otherwise neckY comes directly from the silhouette constriction like the rest of the body.
  const face =
    presetFaceFeatures && rgb
      ? detectFace(rgb, mask, w, headTop, axisX, skullW, chinEstimate, Math.max(shoulderY, chinEstimate))
      : null;
  if (face) neckY = Math.round(Math.max(face.chinY, headTop + skullW * 0.9));
  if (face && shoulderY < neckY) shoulderY = neckY;

  // Crotch: top of the gap between the legs (on the body axis), but never lower
  // than an anatomical limit, so cloth hanging between the legs is not torso.
  let crotchY = top + Math.round(H * 0.53);
  for (let y = bottom - Math.round(H * 0.03); y > top + Math.round(H * 0.35); y--) {
    const gap = mask[y * w + ax] !== 1 && mask[y * w + Math.min(w - 1, ax + 1)] !== 1;
    if (!gap) {
      if (y < bottom - Math.round(H * 0.06)) {
        crotchY = Math.min(y + 1, top + Math.round(H * 0.56));
        break;
      }
    }
  }
  crotchY = Math.max(crotchY, neckY + Math.round(H * 0.25));

  // Armpit: first row below the shoulders where real arms hang free on both
  // sides for several consecutive rows and the body run is narrower than across the shoulders.
  let maxShoulderW = 0;
  let armpitY = shoulderY + Math.round(H * 0.1);
  let armSplitStreak = 0;
  for (let y = shoulderY; y < crotchY; y++) {
    const runs = runsByRow[y];
    const k = runNearest(runs, axisX);
    if (k < 0) continue;
    const wd = runs[k][1] - runs[k][0] + 1;
    maxShoulderW = Math.max(maxShoulderW, wd);
    const leftArm = k > 0 && runs[k - 1][1] - runs[k - 1][0] + 1 >= 5;
    const rightArm = k < runs.length - 1 && runs[k + 1][1] - runs[k + 1][0] + 1 >= 5;
    if (y > shoulderY + H * 0.03 && leftArm && rightArm && wd < maxShoulderW * 0.82) {
      if (++armSplitStreak >= 3) {
        armpitY = y - 2;
        break;
      }
    } else {
      armSplitStreak = 0;
    }
  }

  // --- Torso core width per row -------------------------------------------
  const coreHalf = new Float32Array(w);
  const coreCenter = new Float32Array(w);
  let chestHalf = 0;
  let chestCount = 0;
  for (let y = armpitY; y <= Math.min(crotchY, armpitY + Math.round(H * 0.06)); y++) {
    const r = axisRun(y);
    if (!r) continue;
    chestHalf += (r[1] - r[0] + 1) / 2;
    chestCount++;
  }
  chestHalf = chestCount > 0 ? chestHalf / chestCount : H * 0.12;
  const neckHalf = Math.max(2, (Number.isFinite(neckW) ? neckW + 1 : H * 0.06) / 2);

  for (let y = neckY; y <= crotchY; y++) {
    const r = axisRun(y);
    if (!r) continue;
    const runHalf = (r[1] - r[0] + 1) / 2;
    const runCenter = (r[0] + r[1]) / 2;
    if (y >= armpitY) {
      coreHalf[y] = runHalf;
      coreCenter[y] = runCenter;
    } else {
      // Shoulders: grow from neck width to chest width over the upper part.
      const t = Math.min(1, (y - neckY) / Math.max(1, (armpitY - neckY) * 0.45));
      const s = t * t * (3 - 2 * t);
      coreHalf[y] = Math.min(runHalf, lerp(neckHalf, chestHalf, s));
      coreCenter[y] = lerp(axisX, runCenter, 0.3);
    }
  }
  smooth1D(coreHalf, neckY, crotchY, 4);
  smooth1D(coreCenter, neckY, crotchY, 4);

  // --- Depth map, pass 1: head, torso and legs ("core") ----------------------
  const D = _depth;
  _coreMask.fill(0);
  _rowCoreDepth.fill(0);
  const clampedRoundness = Math.max(0.2, Math.min(2.5, headRoundness));
  // Exponente de superelipse: < 1 = más cuadrado/facetado (p hasta 4.6), > 1 = más esférico/redondeado (p ~ 1.75)
  const headExp =
    clampedRoundness < 1
      ? 2.0 + (1 - clampedRoundness) * 3.25
      : Math.max(1.68, 2.0 - (clampedRoundness - 1) * 0.22);
  const headSpanY = Math.max(4, neckY - top);

  for (let y = top; y <= bottom; y++) {
    const runs = runsByRow[y];
    const kAxis = runNearest(runs, axisX);
    for (let k = 0; k < runs.length; k++) {
      const [a, b] = runs[k];
      const runHalf = (b - a + 1) / 2;
      const runCenter = (a + b) / 2;
      for (let x = a; x <= b; x++) {
        const i = y * w + x;
        let d = 0;
        if (y < neckY) {
          // Curvatura vertical del cráneo según headRoundness
          const vHead = Math.max(0, Math.min(1, (y - top) / headSpanY));
          const verticalDome = Math.sin(Math.max(0.08, Math.min(0.94, vHead)) * Math.PI);
          const roundDepthFactor =
            clampedRoundness >= 1
              ? 1 + (clampedRoundness - 1) * (0.35 * verticalDome)
              : 1 - (1 - clampedRoundness) * 0.22 * (1 - verticalDome * 0.5);

          if (k === kAxis) {
            const hh = presetFaceFeatures && !sideMask ? Math.min(runHalf, headHalfMax) : runHalf;
            const hc = presetFaceFeatures && !sideMask && runHalf > headHalfMax ? axisX : runCenter;
            const headDepthRatio = (presetFaceFeatures ? 1.04 : 0.92) * roundDepthFactor;
            d = crossSection(x - hc, hh, hh * headDepthRatio, headExp);
          } else {
            d = crossSection(x - runCenter, runHalf, runHalf * 0.88 * roundDepthFactor, Math.max(1.65, headExp - 0.1));
          }
        } else if (y >= neckY && y <= crotchY) {
          const t = (y - neckY) / Math.max(1, crotchY - neckY);
          const half = coreHalf[y];
          // Flaring clothes (skirts, tabards) widen the outline but not the body depth.
          const depth = Math.min(half * torsoDepthRatio(t), chestHalf * 0.85);
          _rowCoreDepth[y] = depth;
          d = crossSection(x - coreCenter[y], half, depth, 2.3);
        } else if (y > crotchY && k === kAxis && a < ax && b > ax) {
          // Piernas unidas por tabardo, falda o armadura: dos cilindros de pierna más un puente suave en el eje central
          // para que el tabardo o las grebas nunca se hundan a Z = 0 entre las piernas.
          const left = x <= ax;
          const la = left ? a : ax;
          const lb = left ? ax : b;
          const lh = Math.max(1.5, (lb - la + 1) / 2);
          const legD = crossSection(x - (la + lb) / 2, lh, lh * 0.95, 2.0);
          const spanD = crossSection(x - runCenter, runHalf, Math.min(runHalf * 0.62, lh * 0.88), 2.1);
          d = Math.max(legD, spanD * 0.82);
        } else if (y > crotchY) {
          // Separate legs / feet / hands: round section from their own width.
          d = crossSection(x - runCenter, runHalf, runHalf * 0.94, 2.0);
        }
        D[i] = d;
        if (d > 0) _coreMask[i] = 1;
      }
    }
  }

  const relSideTf = computeRelativePhotoTransform(photoTransforms?.front, photoTransforms?.side);
  const relSideLeftTf = computeRelativePhotoTransform(
    photoTransforms?.front,
    photoTransforms?.sideLeft ?? photoTransforms?.side
  );
  const sideContoursR =
    sideMask && sideStrength > 0.001
      ? sideProfileContoursByRow(sideMask, w, top, bottom, sideLayer, false, relSideTf)
      : null;
  const sideContoursL =
    sideLeftMask && sideStrength > 0.001
      ? sideProfileContoursByRow(sideLeftMask, w, top, bottom, sideLeftLayer, false, relSideLeftTf)
      : null;

  let sideContours: SideProfileContours | null = sideContoursR ?? sideContoursL;
  if (sideContoursR && sideContoursL) {
    const frontHalf = new Float32Array(w);
    const backHalf = new Float32Array(w);
    const totalHalf = new Float32Array(w);
    const zCenter = new Float32Array(w);
    for (let y = top; y <= bottom; y++) {
      frontHalf[y] = 0.5 * (sideContoursR.frontHalf[y] + sideContoursL.frontHalf[y]);
      backHalf[y] = 0.5 * (sideContoursR.backHalf[y] + sideContoursL.backHalf[y]);
      totalHalf[y] = 0.5 * (sideContoursR.totalHalf[y] + sideContoursL.totalHalf[y]);
      zCenter[y] = 0.5 * (sideContoursR.zCenter[y] + sideContoursL.zCenter[y]);
    }
    sideContours = {
      ...sideContoursR,
      frontHalf,
      backHalf,
      totalHalf,
      zCenter,
    };
  }

  // Si hay perfil, ajustamos primero _rowCoreDepth para que los brazos no superen el grosor medio del torso
  if (sideContours) {
    const strength = Math.max(0, Math.min(1, sideStrength));
    for (let y = neckY; y <= crotchY; y++) {
      if (_rowCoreDepth[y] > 0.5 && Number.isFinite(sideContours.totalHalf[y])) {
        const s = 1 + (Math.max(0.3, Math.min(3.4, sideContours.totalHalf[y] / _rowCoreDepth[y])) - 1) * strength;
        _rowCoreDepth[y] *= s;
      }
    }
  }

  // --- Pass 2: arms, shoulder pads and everything else ------------------------
  // Their thickness comes from their own shape (the silhouette minus the core),
  // so a shoulder pad attached to the torso does not inherit the torso's depth.
  for (let i = 0; i < w * w; i++) _limbMask[i] = mask[i] === 1 && _coreMask[i] === 0 ? 1 : 0;
  distanceAndRadius(_limbMask, w, _limbDist, _limbRadius);
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] !== 1) continue;
      const outline = _dist[i];
      if (_limbMask[i] === 1) {
        const r = Math.max(_limbRadius[i], _limbDist[i], 1);
        const d = Math.min(outline, r);
        let limb = Math.sqrt(Math.max(0, 2 * r * d - d * d)) * 0.95;
        if (_rowCoreDepth[y] > 0) limb = Math.min(limb, _rowCoreDepth[y]);
        // Smooth union so there is no crease where a shoulder pad meets the torso.
        const k = 4;
        const a = D[i];
        const hmix = Math.max(0, Math.min(1, 0.5 + (0.5 * (limb - a)) / k));
        D[i] = Math.max(a, limb, a * (1 - hmix) + limb * hmix + k * hmix * (1 - hmix));
      }
      // Never thinner than a rounded rim near the outline.
      const e = Math.min(outline, 3);
      D[i] = Math.max(D[i], Math.sqrt(Math.max(0, 6 * e - e * e)) * 0.8);
    }
  }

  // Blend the parts together (head/neck, torso/legs, torso/arms) without seams.
  blur5(D, w, 2, mask);

  // --- Pass 3: Reconstrucción asimétrica de alta fidelidad del perfil (+Z frente y -Z espalda) ---
  _frontBase.set(D);
  _backBase.set(D);

  if (sideContours) {
    const strength = Math.max(0, Math.min(1, sideStrength));
    const maxScale = orthogonalSilhouette ? 4.2 : 3.4;
    const minScale = orthogonalSilhouette ? 0.16 : 0.22;
    const scaleF = new Float32Array(w).fill(1);
    const scaleB = new Float32Array(w).fill(1);
    for (let y = top; y <= bottom; y++) {
      let modelPeak = 0;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (_coreMask[i] === 1 && D[i] > modelPeak) modelPeak = D[i];
      }
      if (modelPeak < 0.4) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (mask[i] === 1 && D[i] > modelPeak) modelPeak = D[i];
        }
      }
      if (modelPeak < 0.4) continue;
      if (Number.isFinite(sideContours.frontHalf[y]) && sideContours.frontHalf[y] > 0) {
        scaleF[y] = Math.max(minScale, Math.min(maxScale, sideContours.frontHalf[y] / modelPeak));
      }
      if (Number.isFinite(sideContours.backHalf[y]) && sideContours.backHalf[y] > 0) {
        scaleB[y] = Math.max(minScale, Math.min(maxScale, sideContours.backHalf[y] / modelPeak));
      }
    }
    smooth1D(scaleF, top, bottom, 1);
    smooth1D(scaleB, top, bottom, 1);

    for (let y = top; y <= bottom; y++) {
      const sF = 1 + (scaleF[y] - 1) * strength;
      const sB = 1 + (scaleB[y] - 1) * strength;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (mask[i] !== 1) continue;
        if (_coreMask[i] === 1) {
          _frontBase[i] = D[i] * sF;
          _backBase[i] = D[i] * sB;
        } else {
          // En modo silueta ortogonal, la silueta delantera y trasera de perfil también guía las extremidades con mayor fidelidad
          const limbFactor = orthogonalSilhouette ? 0.68 : 0.45;
          const sLimbF = 1 + (scaleF[y] - 1) * (strength * limbFactor);
          const sLimbB = 1 + (scaleB[y] - 1) * (strength * limbFactor);
          _frontBase[i] = D[i] * sLimbF;
          _backBase[i] = D[i] * sLimbB;
        }
      }
    }
    blur5(_frontBase, w, 1, mask);
    blur5(_backBase, w, 1, mask);
  }

  // En el tramo inferior de las espinillas y botas (último 14% de la altura), asegurar una transición
  // progresiva hacia el empeine de la bota para que la caña de la bota conecte con volumen continuo.
  const bootZoneTop = Math.max(crotchY, Math.round(bottom - 0.14 * H));
  for (let y = bootZoneTop; y <= bottom; y++) {
    const tBoot = (y - bootZoneTop) / Math.max(1, bottom - bootZoneTop);
    const instepBoost = 1 + 0.24 * tBoot * tBoot;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] !== 1) continue;
      _frontBase[i] *= instepBoost;
    }
  }

  return {
    top,
    bottom,
    axisX,
    neckY,
    shoulderY,
    armpitY,
    crotchY,
    zCenterByRow: sideContours?.zCenter,
    face: face ?? undefined,
  };
}

/**
 * CONSTRUCCIÓN LIBRE (SIN MOLDE PREVIO):
 * Genera el mapa de grosor delantero (_frontBase) y trasero (_backBase)
 * 100% a raíz de las imágenes cargadas, sin aplicar proporciones de un molde
 * humano previo (no impone ratios de pecho/cintura ni divide faldas/túnicas en
 * dos cilindros ni estrecha el cuello artificialmente).
 */
function buildFreeformDepthMapFromPhotos(
  mask: Uint8Array,
  w: number,
  frontRelief: Float32Array,
  backRelief: Float32Array,
  sideMask?: Uint8Array | null,
  sideStrength = 1,
  sideLayer?: { offset: Float32Array; soft: Uint8Array } | null,
  sideLeftMask?: Uint8Array | null,
  sideLeftLayer?: { offset: Float32Array; soft: Uint8Array } | null,
  freeformPhotoVolume = 1.0,
  freeformSectionRoundness = 1.0,
  photoTransforms?: PhotoTransformsMap
): HumanBodyLandmarks {
  distanceAndRadius(mask, w);

  let top = -1;
  let bottom = -1;
  let massX = 0;
  let mass = 0;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) continue;
      if (top < 0) top = y;
      bottom = y;
      massX += x;
      mass++;
    }
  }
  _depth.fill(0);
  _frontBase.fill(0);
  _backBase.fill(0);
  _coreMask.fill(0);
  if (top < 0 || mass < 50) {
    return { top: 0, bottom: 0, axisX: w / 2, neckY: 0, shoulderY: 0, armpitY: 0, crotchY: 0 };
  }

  const H = bottom - top + 1;
  const axisX = massX / mass;

  // Hitos de referencia únicamente como metadatos (por si el usuario activa el esqueleto opcional o la costura de perfil).
  const neckY = top + Math.round(H * 0.19);
  const shoulderY = top + Math.round(H * 0.22);
  const armpitY = top + Math.round(H * 0.30);
  const crotchY = top + Math.round(H * 0.54);

  const runsByRow: Run[][] = [];
  for (let y = 0; y < w; y++) {
    runsByRow.push(y >= top && y <= bottom ? rowRuns(mask, w, y) : []);
  }

  const clampedRound = Math.max(0.3, Math.min(2.5, freeformSectionRoundness));
  const pExp =
    clampedRound < 1.0
      ? 2.0 + (1.0 - clampedRound) * 3.4
      : Math.max(1.32, 2.0 - (clampedRound - 1.0) * 0.44);
  const depthCurvatureGain =
    clampedRound >= 1.0
      ? 1.0 + (clampedRound - 1.0) * 0.28
      : 0.72 + clampedRound * 0.28;

  // 1) Volumen geométrico libre extraído de la silueta frontal (eje medial + arco de cuerda)
  const D = _depth;
  const maxChordRef = H * 0.26;
  for (let y = top; y <= bottom; y++) {
    const runs = runsByRow[y];
    for (let k = 0; k < runs.length; k++) {
      const [a, b] = runs[k];
      const runHalf = (b - a + 1) * 0.5;
      const runCenter = (a + b) * 0.5;
      const effectiveSpanHalf = Math.min(runHalf, maxChordRef);
      for (let x = a; x <= b; x++) {
        const i = y * w + x;
        const dOutline = _dist[i];
        const rMedial = Math.max(_radius[i], dOutline, 1.5);

        const uMed = Math.min(1, dOutline / rMedial);
        const medialDome = Math.pow(Math.max(0, 1 - Math.pow(1 - uMed, pExp)), 1 / pExp);

        const tChord = Math.min(1, Math.abs(x - runCenter) / Math.max(1, runHalf));
        const chordDome = Math.pow(Math.max(0, 1 - Math.pow(tChord, pExp)), 1 / pExp);

        const dFree =
          (0.60 * (rMedial * medialDome) + 0.40 * (effectiveSpanHalf * 0.85 * chordDome)) *
          depthCurvatureGain;

        const e = Math.min(dOutline, 2.8);
        const rim = Math.sqrt(Math.max(0, 5.6 * e - e * e)) * 0.78;
        D[i] = Math.max(dFree, rim);
        _coreMask[i] = 1;
      }
    }
  }

  blur5(D, w, 2, mask);

  _frontBase.set(D);
  _backBase.set(D);

  // 2) Si hay foto(s) de perfil, aplicar intersección visual (Visual Hull) directa sin molde previo
  const relSideTf = computeRelativePhotoTransform(photoTransforms?.front, photoTransforms?.side);
  const relSideLeftTf = computeRelativePhotoTransform(
    photoTransforms?.front,
    photoTransforms?.sideLeft ?? photoTransforms?.side
  );
  const sideContoursR =
    sideMask && sideStrength > 0.001
      ? sideProfileContoursByRow(sideMask, w, top, bottom, sideLayer, false, relSideTf)
      : null;
  const sideContoursL =
    sideLeftMask && sideStrength > 0.001
      ? sideProfileContoursByRow(sideLeftMask, w, top, bottom, sideLeftLayer, false, relSideLeftTf)
      : null;

  let sideContours: SideProfileContours | null = sideContoursR ?? sideContoursL;
  if (sideContoursR && sideContoursL) {
    const frontHalf = new Float32Array(w);
    const backHalf = new Float32Array(w);
    const totalHalf = new Float32Array(w);
    const zCenter = new Float32Array(w);
    for (let y = top; y <= bottom; y++) {
      frontHalf[y] = 0.5 * (sideContoursR.frontHalf[y] + sideContoursL.frontHalf[y]);
      backHalf[y] = 0.5 * (sideContoursR.backHalf[y] + sideContoursL.backHalf[y]);
      totalHalf[y] = 0.5 * (sideContoursR.totalHalf[y] + sideContoursL.totalHalf[y]);
      zCenter[y] = 0.5 * (sideContoursR.zCenter[y] + sideContoursL.zCenter[y]);
    }
    sideContours = {
      ...sideContoursR,
      frontHalf,
      backHalf,
      totalHalf,
      zCenter,
    };
  }

  if (sideContours) {
    const strength = Math.max(0, Math.min(1, sideStrength));
    for (let y = top; y <= bottom; y++) {
      let rowPeak = 0;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (mask[i] === 1 && D[i] > rowPeak) rowPeak = D[i];
      }
      if (rowPeak < 0.35) continue;

      const profF = Number.isFinite(sideContours.frontHalf[y])
        ? Math.max(0.8, sideContours.frontHalf[y])
        : rowPeak;
      const profB = Number.isFinite(sideContours.backHalf[y])
        ? Math.max(0.8, sideContours.backHalf[y])
        : rowPeak;
      const profTotal = Math.max(1, sideContours.totalHalf[y] || (profF + profB) * 0.5);

      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (mask[i] !== 1) continue;
        const arch = D[i] / rowPeak;
        const dxAxis = Math.abs(x - axisX);
        const rLocal = Math.max(_radius[i], _dist[i], 1.5);
        // En el tronco central (|x - axisX| <= H * 0.22), el perfil manda al 100% sin recortar por `rLocal`;
        // solo en apéndices laterales lejanos (alas abiertas) se limita por `rLocal`.
        const lateralWingBlend = Math.max(0, Math.min(1, (dxAxis - H * 0.20) / Math.max(4, H * 0.12)));
        const localCap = lerp(1.0, Math.min(1.0, (rLocal * 1.45) / profTotal), lateralWingBlend);
        const freeArch = arch * (0.32 + 0.68 * localCap) * depthCurvatureGain;

        const targetF = profF * freeArch;
        const targetB = profB * freeArch;
        _frontBase[i] = lerp(D[i], targetF, strength);
        _backBase[i] = lerp(D[i], targetB, strength);
      }
    }
  }

  // 3) Volumen macroscópico directo desde el relieve/luminancia de las propias fotos (frontRelief y backRelief)
  const photoVolStrength = Math.max(0, Math.min(2.0, freeformPhotoVolume));
  if (photoVolStrength > 0.005) {
    const smoothFrontRel = new Float32Array(w * w);
    const smoothBackRel = new Float32Array(w * w);
    let sumF = 0;
    let sumB = 0;
    let count = 0;
    for (let i = 0; i < w * w; i++) {
      if (mask[i] === 1) {
        smoothFrontRel[i] = frontRelief[i];
        smoothBackRel[i] = backRelief[i];
        sumF += frontRelief[i];
        sumB += backRelief[i];
        count++;
      }
    }
    if (count > 0) {
      const meanF = sumF / count;
      const meanB = sumB / count;
      blur5(smoothFrontRel, w, 3, mask);
      blur5(smoothBackRel, w, 3, mask);

      const baseSpan = Math.max(6, H * 0.055);
      for (let i = 0; i < w * w; i++) {
        if (mask[i] !== 1) continue;
        const dOutline = _dist[i];
        const rimFade = Math.min(1, Math.max(0, (dOutline - 0.5) / 3.2));
        const localAmp = Math.min(baseSpan * 1.6, Math.max(3.5, _radius[i] * 0.55));
        const deltaF = (smoothFrontRel[i] - meanF * 0.72) * localAmp * photoVolStrength * rimFade;
        const deltaB = (smoothBackRel[i] - meanB * 0.72) * localAmp * photoVolStrength * rimFade;

        const e = Math.min(dOutline, 2.2);
        const minRim = Math.sqrt(Math.max(0, 4.4 * e - e * e)) * 0.55;
        _frontBase[i] = Math.max(minRim, _frontBase[i] + deltaF);
        _backBase[i] = Math.max(minRim, _backBase[i] + deltaB);
      }
    }
  }

  blur5(_frontBase, w, 1, mask);
  blur5(_backBase, w, 1, mask);

  return {
    top,
    bottom,
    axisX,
    neckY,
    shoulderY,
    armpitY,
    crotchY,
    zCenterByRow: sideContours?.zCenter,
  };
}

/** Blurred mask whose 0.5 level is the smooth outline. */
function buildOutlineField(mask: Uint8Array, w: number) {
  for (let i = 0; i < w * w; i++) _field[i] = mask[i] === 1 ? 1 : 0;
  blur5(_field, w, 2);
}

/** High-pass of the photo relief (local detail only), faded near the outline. */
function addPhotoDetail(dst: Float32Array, base: Float32Array, relief: Float32Array, mask: Uint8Array, w: number, amount: number) {
  // Local mean of the relief.
  for (let i = 0; i < w * w; i++) _radius[i] = relief[i];
  blur5(_radius, w, 4, mask);
  for (let i = 0; i < w * w; i++) {
    if (mask[i] !== 1) {
      dst[i] = 0;
      continue;
    }
    const hp = relief[i] - _radius[i];
    const fade = Math.min(1, Math.max(0, (_dist[i] - 1) / 5));
    const minKeep = Math.min(base[i], Math.max(0.8, base[i] * 0.55));
    dst[i] = Math.max(minKeep, base[i] + hp * amount * fade);
  }
}

/**
 * Floor shadows often join the feet with a thin strip along the ground.
 * Between the two shins, columns whose silhouette near the floor is shorter
 * than 3.5% of the figure height are treated as shadow and removed.
 */
function removeFloorBridge(mask: Uint8Array, w: number) {
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
  if (top < 0) return;
  const H = bottom - top + 1;
  const shinY = Math.round(bottom - 0.13 * H);
  const runs = rowRuns(mask, w, shinY);
  if (runs.length < 2) return;
  // The two runs closest to the image centre are the legs.
  const cx = w / 2;
  let left: Run | null = null;
  let right: Run | null = null;
  for (const r of runs) {
    const c = (r[0] + r[1]) / 2;
    if (c < cx && (!left || r[1] > left[1])) left = r;
    if (c >= cx && (!right || r[0] < right[0])) right = r;
  }
  if (!left || !right || right[0] - left[1] < 3) return;
  const y0 = Math.round(bottom - 0.1 * H);
  const maxH = 0.035 * H;
  for (let x = left[1] + 1; x < right[0]; x++) {
    let count = 0;
    for (let y = y0; y <= bottom; y++) if (mask[y * w + x] === 1) count++;
    if (count > 0 && count < maxH) {
      for (let y = y0; y <= bottom; y++) mask[y * w + x] = 0;
    }
  }
  keepLargestComponent(mask, w);
}

/** Keeps only the largest 4-connected region of a mask (in place). */
/**
 * Silueta de una vista a partir de su recorte automático y, si lo hay, de su
 * mapa de capas pintado: lo pintado manda (recupera cuernos y pinchos finos) y
 * del recorte solo se acepta lo que queda a 2 px o menos de la pintura.
 * Es la misma regla que usa la vista de frente.
 */
export function maskFromCutoutAndPaint(
  cutout: Uint8Array,
  w: number,
  paintedOffsets?: Float32Array | null,
  mirrorPaintedX = false
): Uint8Array {
  const out = new Uint8Array(w * w);
  if (!paintedOffsets) {
    out.set(cutout);
    keepLargestComponent(out, w);
    return out;
  }
  const painted = new Uint8Array(w * w);
  if (mirrorPaintedX) {
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        if (Number.isFinite(paintedOffsets[y * w + (w - 1 - x)])) {
          painted[y * w + x] = 1;
        }
      }
    }
  } else {
    for (let i = 0; i < w * w; i++) if (Number.isFinite(paintedOffsets[i])) painted[i] = 1;
  }
  let near = painted.slice();
  for (let r = 0; r < 4; r++) {
    const prev = near;
    near = prev.slice();
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (prev[i]) continue;
        if (
          (x > 0 && prev[i - 1]) ||
          (x < w - 1 && prev[i + 1]) ||
          (y > 0 && prev[i - w]) ||
          (y < w - 1 && prev[i + w])
        ) {
          near[i] = 1;
        }
      }
    }
  }
  for (let i = 0; i < w * w; i++) out[i] = painted[i] || (cutout[i] && near[i]) ? 1 : 0;
  // Cerrar micro-cortes de 1 px dentro del recorte (p. ej. trazos negros internos de contorno)
  for (let y = 1; y < w - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (out[i] === 0 && cutout[i] === 1) {
        if ((out[i - 1] === 1 && out[i + 1] === 1) || (out[i - w] === 1 && out[i + w] === 1)) {
          out[i] = 1;
        }
      }
    }
  }
  keepLargestComponent(out, w);
  return out;
}

function keepLargestComponent(mask: Uint8Array, w: number) {
  const n = w * w;
  const label = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let best = -1;
  let bestSize = 0;
  let comp = 0;
  for (let s0 = 0; s0 < n; s0++) {
    if (mask[s0] !== 1 || label[s0] >= 0) continue;
    let qh = 0;
    let qt = 0;
    queue[qt++] = s0;
    label[s0] = comp;
    while (qh < qt) {
      const i = queue[qh++];
      const x = i % w;
      if (x > 0 && mask[i - 1] === 1 && label[i - 1] < 0) { label[i - 1] = comp; queue[qt++] = i - 1; }
      if (x < w - 1 && mask[i + 1] === 1 && label[i + 1] < 0) { label[i + 1] = comp; queue[qt++] = i + 1; }
      if (i >= w && mask[i - w] === 1 && label[i - w] < 0) { label[i - w] = comp; queue[qt++] = i - w; }
      if (i < n - w && mask[i + w] === 1 && label[i + w] < 0) { label[i + w] = comp; queue[qt++] = i + w; }
    }
    if (qt > bestSize) {
      bestSize = qt;
      best = comp;
    }
    comp++;
  }
  for (let i = 0; i < n; i++) if (mask[i] === 1 && label[i] !== best) mask[i] = 0;
}

/**
 * Adds the painted layer map to a depth map: each class raises (or sinks) the
 * surface by its offset. Hard materials get a small bevel, fur/hair a soft edge.
 * `mirror` reads the map flipped horizontally (back view seen from the front).
 */
function addLayerRelief(
  D: Float32Array,
  layer: { offset: Float32Array; soft: Uint8Array },
  mask: Uint8Array,
  w: number,
  unit: number,
  mirror: boolean
) {
  const n = w * w;
  const hard = new Float32Array(n);
  const soft = new Float32Array(n);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] !== 1) continue;
      const j = mirror ? y * w + (w - 1 - x) : i;
      const o = layer.offset[j];
      if (!Number.isFinite(o)) continue;
      if (layer.soft[j]) soft[i] = o;
      else hard[i] = o;
    }
  }
  blur5(hard, w, 1, mask);
  blur5(soft, w, 3, mask);
  for (let i = 0; i < n; i++) {
    if (mask[i] !== 1) continue;
    const add = (hard[i] + soft[i]) * unit;
    if (add === 0) continue;
    // Fade at the outline so front and back still close neatly, and never let negative layer offsets collapse the mesh.
    const fade = Math.min(1, Math.max(0, (_dist[i] - 1) / 3));
    const minKeep = Math.min(D[i], Math.max(0.9, D[i] * 0.48));
    D[i] = Math.max(minKeep, D[i] + add * fade);
  }
}

/**
 * Parametric 3D facial relief on the front of the head.
 * Supports multiple face archetypes and independent size + shape controls for:
 *   - Nose (classic, sharp, broad, aquiline, snout, hollow/skull)
 *   - Mouth & lips (neutral, full, thin, wide, smile)
 *   - Chin & jaw (rounded, square, pointed, cleft, jowls)
 *   - Eye orbits & brow ridge (almond, round, wide/anime, hooded, skeletal)
 * Automatically anchors to the painted face skin region in `frontLayer` when available
 * so tall hair, helmets or horns never shift the face upwards.
 */
interface FaceFrameInfo {
  top: number;
  chin: number;
  Hh: number;
  cx: number;
  faceHalf: number;
  headHalf: number;
  vOf: (y: number) => number;
  yOf: (v: number) => number;
}

function computeFaceFrame(
  mask: Uint8Array,
  w: number,
  lm: HumanBodyLandmarks,
  frontLayer?: { offset: Float32Array; soft: Uint8Array } | null
): FaceFrameInfo | null {
  let top = lm.top;
  let chin = lm.neckY;

  let skinTop = -1;
  let skinBot = -1;
  let skinCenterSum = 0;
  let skinCenterCount = 0;
  const skinHalves: number[] = [];
  if (frontLayer) {
    const searchBot = Math.min(w - 1, Math.round(lm.shoulderY));
    for (let y = Math.max(0, lm.top); y <= searchBot; y++) {
      let minX = -1;
      let maxX = -1;
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (mask[idx] !== 1) continue;
        const off = frontLayer.offset[idx];
        if (Number.isFinite(off) && Math.abs(off) < 0.05) {
          if (minX < 0) minX = x;
          maxX = x;
        }
      }
      if (minX >= 0 && maxX - minX >= 3) {
        if (skinTop < 0) skinTop = y;
        skinBot = y;
        skinCenterSum += (minX + maxX) * 0.5;
        skinCenterCount++;
        skinHalves.push((maxX - minX + 1) * 0.5);
      }
    }
  }

  const hasSkinFace = skinTop >= 0 && skinBot - skinTop >= 6 && skinCenterCount >= 4;
  if (hasSkinFace) {
    const skinH = skinBot - skinTop + 1;
    top = Math.max(lm.top, Math.round(skinTop - skinH * 0.38));
    chin = skinBot;
  }

  const Hh = chin - top;
  if (Hh < 6) return null;

  let sumC = 0;
  let nC = 0;
  const halves: number[] = [];
  for (let y = Math.round(top + 0.3 * Hh); y <= Math.round(top + 0.85 * Hh); y++) {
    const runs = rowRuns(mask, w, y);
    const k = runNearest(runs, lm.axisX);
    if (k < 0) continue;
    const [a, b] = runs[k];
    sumC += (a + b) / 2;
    nC++;
    halves.push((b - a + 1) / 2);
  }
  halves.sort((p, q) => p - q);
  const headHalf = halves.length ? halves[halves.length >> 1] : Math.max(4, Hh * 0.35);
  let half = headHalf;
  if (hasSkinFace && skinHalves.length > 0) {
    skinHalves.sort((p, q) => p - q);
    const medSkinHalf = skinHalves[Math.floor(skinHalves.length * 0.65)];
    if (medSkinHalf >= 3) half = medSkinHalf;
  }
  if (nC === 0 || half < 2) return null;

  let cx = hasSkinFace ? skinCenterSum / skinCenterCount : sumC / nC;
  let faceHalf = half;
  let vOf = (y: number) => (y - top) / Hh;
  let yOf = (v: number) => top + v * Hh;
  if (!hasSkinFace && lm.face) {
    const f = lm.face;
    cx = f.centerX;
    faceHalf = Math.max(half * 0.7, Math.min(half * 1.25, f.eyeHalfSpacing / 0.32));
    const span = Math.max(4, f.chinY - f.eyeY);
    vOf = (y: number) => 0.565 + ((y - f.eyeY) / span) * (0.95 - 0.565);
    yOf = (v: number) => f.eyeY + ((v - 0.565) / (0.95 - 0.565)) * span;
  }

  return { top, chin, Hh, cx, faceHalf, headHalf, vOf, yOf };
}

function addFaceRelief(
  D: Float32Array,
  mask: Uint8Array,
  w: number,
  lm: HumanBodyLandmarks,
  options: HumanBodyOptions,
  frontLayer?: { offset: Float32Array; soft: Uint8Array } | null
) {
  const amount = Math.max(0, Math.min(5.0, options.faceDetail ?? 1));
  const headRoundness = Math.max(0.2, Math.min(2.5, options.headRoundness ?? 1.0));
  if (amount <= 0.001 && Math.abs(headRoundness - 1.0) < 0.01) return;

  const noseSize = Math.max(0, Math.min(6.0, options.noseSize ?? 1.0));
  const noseShape: NoseShapeId = options.noseShape ?? 'classic';
  const noseXOffset = Math.max(-0.5, Math.min(0.5, options.noseXOffset ?? 0));
  const noseYOffset = Math.max(-0.5, Math.min(0.5, options.noseYOffset ?? 0));
  const noseZOffset = Math.max(-0.6, Math.min(0.8, options.noseZOffset ?? 0));

  const mouthSize = Math.max(0, Math.min(6.0, options.mouthSize ?? 1.0));
  const mouthShape: MouthShapeId = options.mouthShape ?? 'neutral';
  const mouthXOffset = Math.max(-0.5, Math.min(0.5, options.mouthXOffset ?? 0));
  const mouthYOffset = Math.max(-0.5, Math.min(0.5, options.mouthYOffset ?? 0));
  const mouthZOffset = Math.max(-0.6, Math.min(0.8, options.mouthZOffset ?? 0));

  const chinSize = Math.max(0, Math.min(6.0, options.chinSize ?? 1.0));
  const chinShape: ChinShapeId = options.chinShape ?? 'rounded';
  const chinXOffset = Math.max(-0.5, Math.min(0.5, options.chinXOffset ?? 0));
  const chinYOffset = Math.max(-0.5, Math.min(0.5, options.chinYOffset ?? 0));
  const chinZOffset = Math.max(-0.6, Math.min(0.8, options.chinZOffset ?? 0));

  const eyeSocketSize = Math.max(0, Math.min(6.0, options.eyeSocketSize ?? 1.0));
  const eyeSocketShape: EyeSocketShapeId = options.eyeSocketShape ?? 'almond';
  const eyeSocketXOffset = Math.max(-0.5, Math.min(0.5, options.eyeSocketXOffset ?? 0));
  const eyeSocketYOffset = Math.max(-0.5, Math.min(0.5, options.eyeSocketYOffset ?? 0));
  const eyeSocketZOffset = Math.max(-0.6, Math.min(0.8, options.eyeSocketZOffset ?? 0));

  const faceModel: FaceModelId = options.faceModel ?? 'classic';

  // Escala progresiva de proyección y anchura/altura cuando el usuario sube el tamaño por encima de 100%
  const noseAmp = noseSize <= 1 ? noseSize : 1 + (noseSize - 1) * 1.55;
  const noseSpan = 1 + Math.max(0, noseSize - 1) * 0.28;
  const eyeAmp = eyeSocketSize <= 1 ? eyeSocketSize : 1 + (eyeSocketSize - 1) * 1.45;
  const eyeSpan = 1 + Math.max(0, eyeSocketSize - 1) * 0.24;
  const mouthAmp = mouthSize <= 1 ? mouthSize : 1 + (mouthSize - 1) * 1.55;
  const mouthSpan = 1 + Math.max(0, mouthSize - 1) * 0.28;
  const chinAmp = chinSize <= 1 ? chinSize : 1 + (chinSize - 1) * 1.55;
  const chinSpan = 1 + Math.max(0, chinSize - 1) * 0.30;

  const frame = computeFaceFrame(mask, w, lm, frontLayer);
  if (!frame) return;
  const { top, chin, Hh, cx, faceHalf, vOf } = frame;

  // Escala de esculpido 3D robusta: garantiza que aunque la cara expuesta sea estrecha por el pelo,
  // los cambios de nariz, órbitas, boca y mentón tengan verdadero volumen 3D visible.
  const figH = Math.max(40, lm.bottom - lm.top);
  const reliefScale = Math.max(faceHalf * 2.25, figH * 0.082);

  const g = (d: number, s: number) => Math.exp(-(d * d) / (2 * s * s));
  const g2 = (u: number, u0: number, su: number, v: number, v0: number, sv: number) =>
    g(u - u0, su) * g(v - v0, sv);
  const smooth = (a: number, b: number, t: number) => {
    const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };

  // Archetype cranial & cheek modifiers
  const cheekStrength =
    faceModel === 'skull'
      ? 1.45
      : faceModel === 'heroic' || faceModel === 'elf'
      ? 1.25
      : faceModel === 'anime'
      ? 0.55
      : 1.0;
  const cranialDome =
    (faceModel === 'anime' ? 0.045 : faceModel === 'brute' ? 0.03 : 0.055) * headRoundness;

  const y0 = Math.max(0, Math.round(top - 0.28 * Hh));
  const y1 = Math.min(w - 1, Math.round(chin + 0.35 * Hh));
  const x0 = Math.max(0, Math.floor(cx - faceHalf * 1.9));
  const x1 = Math.min(w - 1, Math.ceil(cx + faceHalf * 1.9));

  for (let y = y0; y <= y1; y++) {
    const v = vOf(y);
    if (v < -0.15 || v > 1.45) continue;
    // Coordenadas verticales desplazadas por la altura Y elegida por el usuario (positivo = más arriba -> menor v)
    const ve = v + eyeSocketYOffset;
    const vn = v + noseYOffset;
    const vm = v + mouthYOffset;
    const vc = v + chinYOffset;

    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (mask[i] !== 1) continue;
      const u = (x - cx) / faceHalf;
      const au = Math.abs(u);
      // Coordenadas horizontales X desplazadas por el usuario (positivo = derecha +X)
      const ue = u - eyeSocketXOffset;
      const aue = Math.abs(ue);
      const un = (u - noseXOffset) / noseSpan;
      const um = u - mouthXOffset;
      const uc = (u - chinXOffset) / chinSpan;
      const auc = Math.abs(uc);

      let f = 0;

      // 0) Cranial forehead dome & subtle temple taper + overall 3D head roundness
      f += cranialDome * (1 - smooth(0.0, 0.85, au)) * smooth(0.24, 0.42, v) * (1 - smooth(0.5, 0.65, v));
      f -= 0.025 * g2(aue, 0.68, 0.14, ve, 0.48, 0.08);
      if (Math.abs(headRoundness - 1.0) > 0.01) {
        const ovalR2 = u * u * 0.75 + (v - 0.62) * (v - 0.62) * 1.6;
        const sphereBulge = Math.max(0, 1 - ovalR2);
        f += (headRoundness - 1.0) * 0.14 * Math.sqrt(sphereBulge);
      }

      // 1) EYE ORBITS & BROW RIDGE (Órbitas de los ojos y cejas)
      if (eyeSocketSize > 0.001 || Math.abs(eyeSocketZOffset) > 0.001) {
        let eyeU = 0.32;
        let su = 0.13 * eyeSpan;
        let sv = 0.045 * eyeSpan;
        let socketDepth = 0.078;
        let browHeight = 0.055;
        let eyeballBulk = 0.028;

        if (eyeSocketShape === 'round') {
          su = 0.125 * eyeSpan;
          sv = 0.065 * eyeSpan;
          socketDepth = 0.095;
          browHeight = 0.06;
        } else if (eyeSocketShape === 'wide') {
          eyeU = 0.34;
          su = 0.165 * eyeSpan;
          sv = 0.068 * eyeSpan;
          socketDepth = 0.052;
          browHeight = 0.035;
          eyeballBulk = 0.026;
        } else if (eyeSocketShape === 'hooded') {
          su = 0.14 * eyeSpan;
          sv = 0.042 * eyeSpan;
          socketDepth = 0.105;
          browHeight = 0.095;
          eyeballBulk = 0.02;
        } else if (eyeSocketShape === 'skeletal') {
          su = 0.145 * eyeSpan;
          sv = 0.068 * eyeSpan;
          socketDepth = 0.155;
          browHeight = 0.085;
          eyeballBulk = 0.0;
        }

        const browTilt = eyeSocketShape === 'hooded' ? 0.018 * (1 - aue / 0.5) : 0;
        const browV = 0.495 + browTilt;
        f +=
          eyeAmp *
          browHeight *
          g(ve - browV, 0.032 * eyeSpan) *
          (1 - smooth(0.56 * eyeSpan, 0.82 * eyeSpan, aue)) *
          (1 - 0.3 * g(ue, 0.09));

        const leftOrbit = g2(ue, -eyeU, su, ve, 0.565, sv);
        const rightOrbit = g2(ue, eyeU, su, ve, 0.565, sv);
        f -= eyeAmp * socketDepth * (leftOrbit + rightOrbit);

        if (eyeballBulk > 0) {
          const leftBall = g2(ue, -eyeU, su * 0.62, ve, 0.565, sv * 0.58);
          const rightBall = g2(ue, eyeU, su * 0.62, ve, 0.565, sv * 0.58);
          f += eyeAmp * eyeballBulk * (leftBall + rightBall);
        }

        if (Math.abs(eyeSocketZOffset) > 0.001) {
          const zEnv =
            g2(ue, -eyeU, su * 1.25, ve, 0.555, sv * 1.35) +
            g2(ue, eyeU, su * 1.25, ve, 0.555, sv * 1.35);
          f += eyeSocketZOffset * 0.24 * zEnv;
        }
      }

      // 2) NOSE (Tamaño, forma y posición X, Y, Z de la nariz)
      if (noseSize > 0.001 || Math.abs(noseZOffset) > 0.001) {
        if (noseShape === 'hollow') {
          f += noseAmp * 0.05 * g2(un, 0, 0.085, vn, 0.58, 0.038 * noseSpan);
          f -= noseAmp * 0.135 * g2(un, 0, 0.12, vn, 0.70, 0.058 * noseSpan);
          f += noseAmp * 0.036 * (g2(un, -0.14, 0.048, vn, 0.71, 0.052) + g2(un, 0.14, 0.048, vn, 0.71, 0.052));
        } else if (noseShape === 'sharp') {
          f += noseAmp * 0.125 * g(un, 0.072) * smooth(0.54, 0.72, vn) * (1 - smooth(0.73, 0.79, vn));
          f += noseAmp * 0.082 * g2(un, 0, 0.09, vn, 0.725, 0.036 * noseSpan);
          f += noseAmp * 0.02 * (g2(un, -0.10, 0.052, vn, 0.75, 0.025) + g2(un, 0.10, 0.052, vn, 0.75, 0.025));
        } else if (noseShape === 'broad') {
          f += noseAmp * 0.14 * g(un, 0.15) * smooth(0.52, 0.71, vn) * (1 - smooth(0.74, 0.82, vn));
          f += noseAmp * 0.095 * g2(un, 0, 0.18, vn, 0.735, 0.052 * noseSpan);
          f += noseAmp * 0.058 * (g2(un, -0.19, 0.088, vn, 0.76, 0.038) + g2(un, 0.19, 0.088, vn, 0.76, 0.038));
        } else if (noseShape === 'aquiline') {
          f += noseAmp * 0.18 * g(un, 0.095) * smooth(0.50, 0.68, vn) * (1 - smooth(0.74, 0.81, vn));
          f += noseAmp * 0.055 * g2(un, 0, 0.09, vn, 0.64, 0.042 * noseSpan);
          f += noseAmp * 0.085 * g2(un, 0, 0.12, vn, 0.745, 0.042 * noseSpan);
          f += noseAmp * 0.034 * (g2(un, -0.14, 0.068, vn, 0.765, 0.03) + g2(un, 0.14, 0.068, vn, 0.765, 0.03));
        } else if (noseShape === 'snout') {
          f += noseAmp * 0.195 * g(un, 0.225) * smooth(0.52, 0.72, vn) * (1 - smooth(0.78, 0.87, vn));
          f += noseAmp * 0.13 * g2(un, 0, 0.255, vn, 0.73, 0.068 * noseSpan);
          f += noseAmp * 0.075 * (g2(un, -0.22, 0.092, vn, 0.74, 0.042) + g2(un, 0.22, 0.092, vn, 0.74, 0.042));
          f -= noseAmp * 0.05 * (g2(un, -0.16, 0.052, vn, 0.745, 0.026) + g2(un, 0.16, 0.052, vn, 0.745, 0.026));
        } else {
          f += noseAmp * 0.15 * g(un, 0.105) * smooth(0.52, 0.72, vn) * (1 - smooth(0.74, 0.81, vn));
          f += noseAmp * 0.08 * g2(un, 0, 0.13, vn, 0.73, 0.044 * noseSpan);
          f += noseAmp * 0.035 * (g2(un, -0.14, 0.072, vn, 0.76, 0.03) + g2(un, 0.14, 0.072, vn, 0.76, 0.03));
        }

        if (Math.abs(noseZOffset) > 0.001) {
          const noseZEnv =
            0.65 * g(un, 0.14) * smooth(0.50, 0.72, vn) * (1 - smooth(0.75, 0.84, vn)) +
            0.85 * g2(un, 0, 0.17, vn, 0.73, 0.06 * noseSpan);
          f += noseZOffset * 0.28 * noseZEnv;
        }
      }

      // 3) CHEEKBONES & BUCCAL HOLLOWS (Pómulos y mejillas)
      f += cheekStrength * 0.055 * (g2(ue, -0.46, 0.13, ve, 0.655, 0.052) + g2(ue, 0.46, 0.13, ve, 0.655, 0.052));
      const hollowDepth = faceModel === 'skull' ? 0.075 : faceModel === 'heroic' ? 0.032 : 0.022;
      f -= hollowDepth * (g2(um, -0.42, 0.125, vm, 0.79, 0.052) + g2(um, 0.42, 0.125, vm, 0.79, 0.052));

      // 4) MOUTH & LIPS (Tamaño, forma y posición X, Y, Z de la boca y labios)
      if (mouthSize > 0.001 || Math.abs(mouthZOffset) > 0.001) {
        let mouthW = 0.22 * mouthSpan;
        let upperLipH = 0.032;
        let lowerLipH = 0.04;
        let cleftDepth = 0.032;
        let cornerLift = 0.0;

        if (mouthShape === 'full') {
          mouthW = 0.25 * mouthSpan;
          upperLipH = 0.058;
          lowerLipH = 0.072;
          cleftDepth = 0.04;
        } else if (mouthShape === 'thin') {
          mouthW = 0.18 * mouthSpan;
          upperLipH = 0.018;
          lowerLipH = 0.022;
          cleftDepth = 0.022;
        } else if (mouthShape === 'wide') {
          mouthW = 0.34 * mouthSpan;
          upperLipH = 0.042;
          lowerLipH = 0.05;
          cleftDepth = 0.045;
        } else if (mouthShape === 'smile') {
          mouthW = 0.26 * mouthSpan;
          upperLipH = 0.036;
          lowerLipH = 0.044;
          cleftDepth = 0.034;
          cornerLift = -0.022 * Math.min(1.5, (um / mouthW) * (um / mouthW));
        }

        const mv = vm + cornerLift;
        const cupidDip = 1 - 0.25 * g(um, 0.045 * mouthSpan);
        f += mouthAmp * upperLipH * g2(um, 0, mouthW * 0.84, mv, 0.822, 0.018 * mouthSpan) * cupidDip;
        f -= mouthAmp * cleftDepth * g2(um, 0, mouthW, mv, 0.842, 0.015 * mouthSpan);
        f -=
          mouthAmp *
          (cleftDepth * 0.75) *
          (g2(um, -mouthW, 0.048 * mouthSpan, mv, 0.844, 0.02 * mouthSpan) +
            g2(um, mouthW, 0.048 * mouthSpan, mv, 0.844, 0.02 * mouthSpan));
        f += mouthAmp * lowerLipH * g2(um, 0, mouthW * 0.76, mv, 0.868, 0.022 * mouthSpan);
        f -= mouthAmp * 0.024 * g2(um, 0, mouthW * 0.72, vm, 0.898, 0.02 * mouthSpan);

        if (Math.abs(mouthZOffset) > 0.001) {
          f += mouthZOffset * 0.24 * g2(um, 0, mouthW * 1.05, mv, 0.845, 0.048 * mouthSpan);
        }
      }

      // 5) CHIN & JAWLINE (Tamaño, forma y posición X, Y, Z del mentón)
      if (chinSize > 0.001 || Math.abs(chinZOffset) > 0.001) {
        if (chinShape === 'square') {
          const sqProfile = Math.exp(-Math.pow(auc / 0.27, 4) * 0.5) * g(vc - 0.95, 0.052 * chinSpan);
          f += chinAmp * 0.11 * sqProfile;
          f += chinAmp * 0.055 * (g2(uc, -0.38, 0.115, vc, 0.90, 0.048 * chinSpan) + g2(uc, 0.38, 0.115, vc, 0.90, 0.048 * chinSpan));
        } else if (chinShape === 'pointed') {
          f += chinAmp * 0.092 * g2(uc, 0, 0.13, vc, 0.955, 0.042 * chinSpan);
        } else if (chinShape === 'cleft') {
          const lobes = g2(uc, -0.088, 0.115, vc, 0.95, 0.05 * chinSpan) + g2(uc, 0.088, 0.115, vc, 0.95, 0.05 * chinSpan);
          const dimple = g2(uc, 0, 0.036, vc, 0.952, 0.042 * chinSpan);
          f += chinAmp * (0.088 * lobes - 0.042 * dimple);
        } else if (chinShape === 'jowls') {
          f += chinAmp * 0.12 * g2(uc, 0, 0.29, vc, 0.945, 0.056 * chinSpan);
          f += chinAmp * 0.082 * (g2(uc, -0.44, 0.145, vc, 0.88, 0.058 * chinSpan) + g2(uc, 0.44, 0.145, vc, 0.88, 0.058 * chinSpan));
        } else {
          f += chinAmp * 0.098 * g2(uc, 0, 0.21, vc, 0.95, 0.048 * chinSpan);
        }

        if (Math.abs(chinZOffset) > 0.001) {
          f += chinZOffset * 0.28 * g2(uc, 0, 0.25, vc, 0.948, 0.065 * chinSpan);
        }
      }

      // Keep the outer rim of the head smooth so front and back weld cleanly.
      const fade = Math.min(1, Math.max(0, (_dist[i] - 0.5) / 1.8));
      const effectiveAmount = Math.max(amount, 0.25);
      D[i] = Math.max(0, D[i] + f * reliefScale * effectiveAmount * fade);
    }
  }
}

/**
 * Cleans the rim of the front and back textures: pixels near the outline that
 * still show the photo background (e.g. the white margin of a back view that
 * does not line up exactly) are replaced by the nearest body colour. Pixels
 * just outside the outline are filled too, so texture filtering never pulls
 * background in. This is what removes the grey/white "joint" on the rim.
 */
export function repairAtlasRim(input: AtlasRepairInput, mask: Uint8Array, w: number) {
  const { albedo, atlasWidth } = input;
  const band = 6; // texels inside the outline that may hold background
  const grow = 4; // texels outside the outline to fill
  const valid = new Uint8Array(w * w);
  const region = new Uint8Array(w * w);
  const nextR = new Float32Array(w * w);
  const nextG = new Float32Array(w * w);
  const nextB = new Float32Array(w * w);

  // Reparar tanto los cuadrantes superiores (Frente y Espalda, qy = 0) como los inferiores (Perfiles, qy = w)
  const quadrants: Array<{ qx: number; qy: number; qMask: Uint8Array; isBack: boolean }> = [
    { qx: 0, qy: 0, qMask: mask, isBack: false },
    { qx: w, qy: 0, qMask: input.backMask ?? mask, isBack: true },
  ];
  if (input.sideProfile) {
    quadrants.push({ qx: 0, qy: w, qMask: input.sideProfile.cutout, isBack: false });
  }
  if (input.sideLeftProfile || input.sideProfile) {
    quadrants.push({
      qx: w,
      qy: w,
      qMask: (input.sideLeftProfile ?? input.sideProfile)!.cutout,
      isBack: false,
    });
  }

  const qDist = new Float32Array(w * w);
  const qRad = new Float32Array(w * w);

  for (const { qx, qy, qMask, isBack } of quadrants) {
    if (qy === 0 && !isBack) {
      qDist.set(_dist);
    } else {
      distanceAndRadius(qMask, w, qDist, qRad);
    }
    for (let i = 0; i < w * w; i++) region[i] = qMask[i];
    for (let g = 0; g < grow; g++) {
      const prev = region.slice();
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (prev[i]) continue;
          if (
            (x > 0 && prev[i - 1]) ||
            (x < w - 1 && prev[i + 1]) ||
            (y > 0 && prev[i - w]) ||
            (y < w - 1 && prev[i + w])
          ) {
            region[i] = 1;
          }
        }
      }
    }

    const [br, bg, bb] = isBack && input.backBackground ? input.backBackground : input.background;
    const px = (x: number, y: number) => ((qy + y) * atlasWidth + qx + x) * 4;
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (qMask[i] !== 1) {
          valid[i] = 0;
          continue;
        }
        if (qDist[i] > band) {
          valid[i] = 1;
          continue;
        }
        const o = px(x, y);
        const dr = albedo[o] / 255 - br;
        const dg = albedo[o + 1] / 255 - bg;
        const db = albedo[o + 2] / 255 - bb;
        const r = albedo[o] / 255;
        const g = albedo[o + 1] / 255;
        const b = albedo[o + 2] / 255;
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const nearBg = dr * dr + dg * dg + db * db < (isBack ? 0.3 : 0.12);
        const paleGrey = isBack ? mx > 0.4 && mx - mn < 0.1 : mx > 0.72 && mx - mn < 0.12;
        valid[i] = nearBg || paleGrey ? 0 : 1;
      }
    }
    for (let pass = 0; pass < band + grow + 4; pass++) {
      let changed = 0;
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          nextR[i] = -1;
          if (valid[i] || !region[i]) continue;
          let r = 0,
            g = 0,
            b = 0,
            n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if ((dx === 0 && dy === 0) || xx < 0 || yy < 0 || xx >= w || yy >= w) continue;
              const j = yy * w + xx;
              if (!valid[j]) continue;
              const o = px(xx, yy);
              r += albedo[o];
              g += albedo[o + 1];
              b += albedo[o + 2];
              n++;
            }
          }
          if (n > 0) {
            nextR[i] = r / n;
            nextG[i] = g / n;
            nextB[i] = b / n;
          }
        }
      }
      for (let i = 0; i < w * w; i++) {
        if (nextR[i] < 0) continue;
        const x = i % w;
        const y = (i / w) | 0;
        const o = px(x, y);
        albedo[o] = Math.round(nextR[i]);
        albedo[o + 1] = Math.round(nextG[i]);
        albedo[o + 2] = Math.round(nextB[i]);
        valid[i] = 1;
        changed++;
      }
      if (!changed) break;
    }
  }
}

/**
 * The roughness/metalness atlas is classified per pixel and comes out noisy,
 * which shows as sparkling dots. Blur it (inside the silhouette) per quadrant.
 */
function smoothRoughMetal(rm: Uint8Array, atlasWidth: number, mask: Uint8Array, w: number) {
  const chan = new Float32Array(w * w);
  const tmp = new Float32Array(w * w);
  for (const qy of [0, w]) {
    for (const qx of [0, w]) {
      for (const c of [1, 2]) {
        for (let y = 0; y < w; y++) {
          for (let x = 0; x < w; x++) {
            chan[y * w + x] = rm[((qy + y) * atlasWidth + qx + x) * 4 + c];
          }
        }
        for (let p = 0; p < 3; p++) {
          for (let y = 0; y < w; y++) {
            for (let x = 0; x < w; x++) {
              let sum = 0;
              for (let o = -2; o <= 2; o++) {
                const sx = x + o < 0 ? 0 : x + o >= w ? w - 1 : x + o;
                sum += chan[y * w + sx] * K5[o + 2];
              }
              tmp[y * w + x] = sum;
            }
          }
          for (let y = 0; y < w; y++) {
            for (let x = 0; x < w; x++) {
              let sum = 0;
              for (let o = -2; o <= 2; o++) {
                const sy = y + o < 0 ? 0 : y + o >= w ? w - 1 : y + o;
                sum += tmp[sy * w + x] * K5[o + 2];
              }
              chan[y * w + x] = sum;
            }
          }
        }
        for (let y = 0; y < w; y++) {
          for (let x = 0; x < w; x++) {
            if (qy === 0 && mask[y * w + x] !== 1) continue;
            rm[((qy + y) * atlasWidth + qx + x) * 4 + c] = Math.round(chan[y * w + x]);
          }
        }
      }
    }
  }
}

/**
 * Aplica la textura de las vistas de perfil alrededor de la unión lateral (por defecto 5,6 cm)
 * entre la mitad delantera y la mitad trasera del personaje.
 * En el borde mismo de la unión (_dist -> 0), el cuadrante delantero y el trasero coinciden
 * exactamente en el color de la línea media del perfil, eliminando el corte visual y
 * proyectando los detalles laterales reales (pelo lateral, oreja, costado del traje, cinturón, pantalón).
 */
function applyProfileSeamTextureToAtlas(
  input: AtlasRepairInput,
  mask: Uint8Array,
  w: number,
  landmarks: HumanBodyLandmarks,
  seamWidthCm: number,
  profileTexturePct = 0,
  photoTransforms?: PhotoTransformsMap
) {
  const pct = Math.max(0, Math.min(100, profileTexturePct)) / 100;
  // Por defecto (0%), del centro hacia el frente manda la foto delantera y del centro hacia atrás manda la foto trasera.
  // Solo se aplica la textura de los perfiles cuando el usuario lo solicita con la barra de porcentaje (> 0%).
  if (pct <= 0.001) return;
  const rightFlankView = input.sideProfile ?? input.sideLeftProfile ?? null;
  const leftFlankView = input.sideLeftProfile ?? input.sideProfile ?? null;
  if (!rightFlankView && !leftFlankView) return;

  const { top, bottom, axisX, shoulderY, crotchY } = landmarks;
  const Hf = Math.max(10, bottom - top + 1);
  const fMidY = 0.5 * (top + bottom);
  // Conforme aumenta el porcentaje (0% -> 100%), la aplicación de textura del perfil se extiende gradualmente
  // desde el borde del perfil hacia todo el ancho de la figura.
  const baseBand = Math.max(2.5, Math.min(28.0, (Math.max(1.0, seamWidthCm) / 175.0) * Hf * 1.15));
  const bandTexels = baseBand * (0.25 + 0.75 * pct) + Hf * 0.42 * pct * pct;

  const relRightTf = computeRelativePhotoTransform(
    photoTransforms?.front,
    input.sideProfile ? photoTransforms?.side : photoTransforms?.sideLeft
  );
  const relLeftTf = computeRelativePhotoTransform(
    photoTransforms?.front,
    input.sideLeftProfile ? photoTransforms?.sideLeft : photoTransforms?.side
  );

  const prepareProfileGeometry = (view: ProfileSeamViewInput | null, relTf: PhotoTransform) => {
    if (!view) return null;
    return sideProfileContoursByRow(view.cutout, w, top, bottom, view.layer ?? null, false, relTf);
  };

  const rightGeom = prepareProfileGeometry(rightFlankView, relRightTf);
  const leftGeom =
    leftFlankView === rightFlankView ? rightGeom : prepareProfileGeometry(leftFlankView, relLeftTf);
  if (!rightGeom && !leftGeom) return;

  const { albedo, atlasWidth } = input;
  const byte = (v: number) => Math.min(255, Math.max(0, Math.round(v * 255)));

  // 1) Detectar para cada fila `y` los bordes exteriores absolutos (izquierdo y derecho) de la silueta
  //    y el rango vertical de los brazos (`armZoneTopY .. armZoneBotY`).
  //    En la zona vertical de los brazos, la vista de perfil muestra el BRAZO (que tapa al torso).
  //    Por tanto:
  //    - En los brazos exteriores (`_limbMask === 1` cerca del borde exterior), se aplica la textura del perfil.
  //    - En el cuerpo/torso (`_coreMask === 1` dentro de la zona de los brazos) y en los bordes interiores
  //      (axila, cara interna del brazo, entrepierna), NO se pinta el perfil del brazo, sino que se conservan
  //      las texturas de Frente y Espalda aplicando un suavizado progresivo en la unión lateral.
  const rowOuterMinX = new Int32Array(w).fill(-1);
  const rowOuterMaxX = new Int32Array(w).fill(-1);
  let maxLimbY = Math.round(crotchY + 0.05 * Hf);
  for (let y = top; y <= bottom; y++) {
    let a = -1;
    let b = -1;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] !== 1) continue;
      if (a < 0) a = x;
      b = x;
      if (_limbMask[i] === 1 && y < bottom - Math.round(0.18 * Hf) && y > maxLimbY) {
        maxLimbY = y;
      }
    }
    rowOuterMinX[y] = a;
    rowOuterMaxX[y] = b;
  }
  const armZoneTopY = Math.max(landmarks.neckY, Math.round(shoulderY - 0.015 * Hf));
  const armZoneBotY = Math.min(
    Math.round(top + 0.68 * Hf),
    Math.max(maxLimbY, Math.round(crotchY + 0.06 * Hf))
  );
  const armTransitionRows = Math.max(4, Math.round(0.045 * Hf));

  // Regiones justo fuera de la silueta (1 px) para que el filtrado bilineal en el borde tampoco chupe otro color
  const outerRim = new Uint8Array(w * w);
  for (let y = 1; y < w - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] === 1) continue;
      if (
        mask[i - 1] === 1 ||
        mask[i + 1] === 1 ||
        mask[i - w] === 1 ||
        mask[i + w] === 1
      ) {
        outerRim[i] = 1;
      }
    }
  }

  // Copia de lectura del albedo original (tras repairAtlasRim) para muestrear colores limpios de Frente y Atrás
  // al hacer el suavizado de la unión sin realimentación.
  const origAlbedo = albedo.slice();

  const sampleCleanQuadRGB = (qx: number, fx: number, fy: number): [number, number, number] => {
    const cx = Math.max(0, Math.min(w - 1, Math.round(fx)));
    const cy = Math.max(0, Math.min(w - 1, Math.round(fy)));
    const o = (cy * atlasWidth + qx + cx) * 4;
    return [origAlbedo[o], origAlbedo[o + 1], origAlbedo[o + 2]];
  };

  for (let y = top; y <= bottom; y++) {
    const tf = (y - top) / Math.max(1, Hf - 1);
    const outMin = rowOuterMinX[y];
    const outMax = rowOuterMaxX[y];
    if (outMin < 0 || outMax < outMin) continue;

    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const isOuter = outerRim[i] === 1;
      if (mask[i] !== 1 && !isOuter) continue;
      const d = isOuter ? 0 : _dist[i];
      if (d > bandTexels) continue;

      // t = 0 en la costura lateral exacta (_dist = 0), t = 1 al terminar la banda de unión
      const t = Math.max(0, Math.min(1, d / bandTexels));
      // Curva de suavizado C2 (coseno elevado): 1.0 en la unión lateral, fundiéndose suavemente a 0.0 hacia el interior
      const wSeam = 0.5 * (1 + Math.cos(Math.PI * t));
      if (wSeam <= 0.004) continue;

      // Vector normal hacia el interior de la silueta para tomar el color limpio de Frente y Espalda
      // un par de texels hacia dentro (evitando trazos oscuros del borde del dibujo).
      let inX = x;
      let inY = y;
      if (d < 2.5) {
        let gx = 0;
        let gy = 0;
        if (x > 0 && x < w - 1) gx = 0.5 * (_dist[i + 1] - _dist[i - 1]);
        if (y > 0 && y < w - 1) gy = 0.5 * (_dist[i + w] - _dist[i - w]);
        const gl = Math.hypot(gx, gy);
        if (gl > 1e-4) {
          const step = 2.5 - d;
          inX = x + (gx / gl) * step;
          inY = y + (gy / gl) * step;
        }
      }
      const [fInR, fInG, fInB] = sampleCleanQuadRGB(0, inX, inY);
      const [bInR, bInG, bInB] = sampleCleanQuadRGB(w, inX, inY);
      // Color de unión suavizada Frente <-> Espalda en el borde (promedio limpio de ambas vistas)
      const fbUnionR = 0.5 * (fInR + bInR);
      const fbUnionG = 0.5 * (fInG + bInG);
      const fbUnionB = 0.5 * (fInB + bInB);

      // En la imagen frontal: x < axisX es el lado izquierdo de la imagen (costado derecho del personaje),
      // x >= axisX es el lado derecho de la imagen (costado izquierdo del personaje).
      const useRightFlank = x < axisX;
      // Distancia horizontal desde este píxel hasta el borde exterior absoluto de la fila en su mismo costado
      const dFromOuterFlank = useRightFlank ? Math.max(0, x - outMin) : Math.max(0, outMax - x);

      // ¿Es este píxel parte del tronco/cuerpo (`_coreMask`) a la altura donde el perfil pertenece al brazo?
      let isNearestInnerCore = _coreMask[i] === 1;
      if (isOuter) {
        const nx = x < axisX ? Math.min(w - 1, x + 1) : Math.max(0, x - 1);
        isNearestInnerCore = _coreMask[y * w + nx] === 1;
      }

      // 1) Factor de visibilidad lateral (`wOuter`): 1.0 en el borde exterior real del costado,
      //    cayendo suavemente a 0.0 en bordes interiores (hueco brazo-torso, cara interna del brazo o entrepierna).
      const outerLimit = bandTexels * 1.15;
      const tOuter = Math.max(0, Math.min(1, (dFromOuterFlank - bandTexels * 0.55) / Math.max(1.5, outerLimit - bandTexels * 0.55)));
      let wProfile = 0.5 * (1 + Math.cos(Math.PI * tOuter));

      // 2) Si el píxel pertenece al CUERPO (`_coreMask`) dentro de la franja vertical de los brazos (`armZoneTopY..armZoneBotY`),
      //    sabemos que la foto de perfil en esta altura muestra el BRAZO y no el torso.
      //    Desactivamos la proyección del perfil sobre el torso con una transición vertical suave (`suavizado`).
      if (isNearestInnerCore && y >= armZoneTopY - armTransitionRows && y <= armZoneBotY + armTransitionRows) {
        let armOcclusion = 1.0;
        if (y < armZoneTopY) {
          const u = (y - (armZoneTopY - armTransitionRows)) / armTransitionRows;
          armOcclusion = 0.5 * (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, u))));
        } else if (y > armZoneBotY) {
          const u = (armZoneBotY + armTransitionRows - y) / armTransitionRows;
          armOcclusion = 0.5 * (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, u))));
        }
        wProfile *= 1 - armOcclusion;
      }

      // Color objetivo de la costura para Frente y para Espalda:
      // - Cuando wProfile == 0 (en el torso bajo los brazos o en caras internas), el objetivo es `fbUnion`
      //   (suavizado puro entre la textura Frontal y la de Espalda del cuerpo).
      // - Cuando wProfile > 0 (en el borde exterior de los brazos, cabeza o piernas), se interpola suavemente
      //   con la textura real de la vista de perfil.
      let targetFR = fbUnionR;
      let targetFG = fbUnionG;
      let targetFB = fbUnionB;
      let targetBR = fbUnionR;
      let targetBG = fbUnionG;
      let targetBB = fbUnionB;

      if (wProfile > 0.005) {
        const pView = useRightFlank ? (rightFlankView ?? leftFlankView) : (leftFlankView ?? rightFlankView);
        const pGeom = useRightFlank ? (rightGeom ?? leftGeom) : (leftGeom ?? rightGeom);
        const pTf = useRightFlank ? relRightTf : relLeftTf;
        if (pView && pGeom) {
          const Hs = Math.max(1, pGeom.sBot - pGeom.sTop + 1);
          const scaleSideY = Math.max(0.15, Math.min(3.5, pTf.scaleY ?? 1));
          const dySideTex = ((pTf.offsetY ?? 0) / 100) * Hf;
          const yRel = fMidY + (y - dySideTex - fMidY) / scaleSideY;
          const tfMapped = Math.max(0, Math.min(1, (yRel - top) / Math.max(1, Hf - 1)));
          const ysTarget = Math.max(
            pGeom.sTop,
            Math.min(pGeom.sBot, Math.round(pGeom.sTop + tfMapped * (Hs - 1)))
          );

          let ys = ysTarget;
          if (pGeom.minX[ys] < 0) {
            for (let dy = 1; dy <= 8; dy++) {
              if (ysTarget - dy >= pGeom.sTop && pGeom.minX[ysTarget - dy] >= 0) {
                ys = ysTarget - dy;
                break;
              }
              if (ysTarget + dy <= pGeom.sBot && pGeom.minX[ysTarget + dy] >= 0) {
                ys = ysTarget + dy;
                break;
              }
            }
          }
          const sMin = pGeom.minX[ys];
          const sMax = pGeom.maxX[ys];
          if (sMin >= 0 && sMax >= sMin) {
            const sSpan = Math.max(1, sMax - sMin);
            const inset = sSpan >= 10 ? 2 : sSpan >= 5 ? 1 : 0;
            const sMinIn = sMin + inset;
            const sMaxIn = sMax - inset;
            const sMid = Math.max(sMinIn, Math.min(sMaxIn, pGeom.sideAxis[ys]));

            const reach = t * 0.42;
            const sxFront = pGeom.facingRight
              ? Math.round(sMid + reach * (sMaxIn - sMid))
              : Math.round(sMid - reach * (sMid - sMinIn));
            const sxBack = pGeom.facingRight
              ? Math.round(sMid - reach * (sMid - sMinIn))
              : Math.round(sMid + reach * (sMaxIn - sMid));

            const idxFront = (ys * w + Math.max(0, Math.min(w - 1, sxFront))) * 3;
            const idxBack = (ys * w + Math.max(0, Math.min(w - 1, sxBack))) * 3;

            const prF = byte(pView.inpainted[idxFront]);
            const pgF = byte(pView.inpainted[idxFront + 1]);
            const pbF = byte(pView.inpainted[idxFront + 2]);

            const prB = byte(pView.inpainted[idxBack]);
            const pgB = byte(pView.inpainted[idxBack + 1]);
            const pbB = byte(pView.inpainted[idxBack + 2]);

            targetFR = fbUnionR * (1 - wProfile) + prF * wProfile;
            targetFG = fbUnionG * (1 - wProfile) + pgF * wProfile;
            targetFB = fbUnionB * (1 - wProfile) + pbF * wProfile;

            targetBR = fbUnionR * (1 - wProfile) + prB * wProfile;
            targetBG = fbUnionG * (1 - wProfile) + pgB * wProfile;
            targetBB = fbUnionB * (1 - wProfile) + pbB * wProfile;
          }
        }
      }

      // Cuando wProfile == 0 (unión Frente-Espalda del torso o cara interna), usamos un ancho de suavizado
      // ligeramente más concentrado en el borde para conservar al máximo el detalle frontal/trasero del pecho
      // mientras la unión lateral queda totalmente fundida y sin cortes.
      const effectiveSeamWeight =
        (wProfile > 0.05
          ? wSeam * (0.65 + 0.35 * wProfile)
          : Math.pow(wSeam, 1.35) * 0.85) * pct;

      const oFront = (y * atlasWidth + x) * 4;
      albedo[oFront] = Math.round(origAlbedo[oFront] * (1 - effectiveSeamWeight) + targetFR * effectiveSeamWeight);
      albedo[oFront + 1] = Math.round(origAlbedo[oFront + 1] * (1 - effectiveSeamWeight) + targetFG * effectiveSeamWeight);
      albedo[oFront + 2] = Math.round(origAlbedo[oFront + 2] * (1 - effectiveSeamWeight) + targetFB * effectiveSeamWeight);

      const oBack = (y * atlasWidth + w + x) * 4;
      albedo[oBack] = Math.round(origAlbedo[oBack] * (1 - effectiveSeamWeight) + targetBR * effectiveSeamWeight);
      albedo[oBack + 1] = Math.round(origAlbedo[oBack + 1] * (1 - effectiveSeamWeight) + targetBG * effectiveSeamWeight);
      albedo[oBack + 2] = Math.round(origAlbedo[oBack + 2] * (1 - effectiveSeamWeight) + targetBB * effectiveSeamWeight);
    }
  }
}

/**
 * Detecta si las siluetas frontal y de perfil corresponden a una criatura / figura
 * con geometría 3D en el plano de perfil (cola trasera proyectada, hocico, 4 patas
 * o alas desplegadas) que requiere reconstrucción volumétrica 3D directa desde el perfil.
 */
export function hasProfileDriven3DFeatures(
  frontMask: Uint8Array,
  sideMask: Uint8Array,
  w: number,
  frontLayer?: { offset: Float32Array; soft: Uint8Array } | null,
  sideLayer?: { offset: Float32Array; soft: Uint8Array } | null
): boolean {
  // Si el mapa de capas de perfil tiene membrana de ala ('cloth' offset = 0.35) y púas ('spikes' offset = 1.8)
  if (sideLayer || frontLayer) {
    let wingClothCount = 0;
    let spikeCount = 0;
    const n = w * w;
    for (let i = 0; i < n; i++) {
      const fo = frontLayer ? frontLayer.offset[i] : NaN;
      const so = sideLayer ? sideLayer.offset[i] : NaN;
      if (
        (Number.isFinite(fo) && Math.abs(fo - 0.35) < 0.05) ||
        (Number.isFinite(so) && Math.abs(so - 0.35) < 0.05)
      ) {
        wingClothCount++;
      }
      if (
        (Number.isFinite(fo) && Math.abs(fo - 1.8) < 0.10) ||
        (Number.isFinite(so) && Math.abs(so - 1.8) < 0.10)
      ) {
        spikeCount++;
      }
    }
    if (wingClothCount > 350 && spikeCount > 25) return true;
  }

  // Comprobar en la silueta de perfil si la envergadura horizontal (cola / alas) supera ampliamente el apoyo de los pies
  let sTop = -1;
  let sBot = -1;
  const minX = new Int32Array(w).fill(-1);
  const maxX = new Int32Array(w).fill(-1);
  for (let y = 0; y < w; y++) {
    let a = -1;
    let b = -1;
    for (let x = 0; x < w; x++) {
      if (sideMask[y * w + x] === 1) {
        if (a < 0) a = x;
        b = x;
      }
    }
    minX[y] = a;
    maxX[y] = b;
    if (a >= 0) {
      if (sTop < 0) sTop = y;
      sBot = y;
    }
  }
  const Hs = sBot - sTop + 1;
  if (sTop < 0 || Hs < 20) return false;

  let footMin = w;
  let footMax = -1;
  for (let y = Math.round(sTop + Hs * 0.92); y <= sBot; y++) {
    if (minX[y] >= 0) {
      if (minX[y] < footMin) footMin = minX[y];
      if (maxX[y] > footMax) footMax = maxX[y];
    }
  }
  let maxSpan = 0;
  let maxTailBack = 0;
  const footMid = footMax >= footMin ? 0.5 * (footMin + footMax) : w * 0.5;
  for (let y = sTop; y <= sBot; y++) {
    if (minX[y] >= 0) {
      const sp = maxX[y] - minX[y] + 1;
      if (sp > maxSpan) maxSpan = sp;
      if (y >= sTop + Hs * 0.62 && y <= sTop + Hs * 0.90) {
        const ext = Math.max(maxX[y] - footMid, footMid - minX[y]);
        if (ext > maxTailBack) maxTailBack = ext;
      }
    }
  }
  void frontMask;
  return maxSpan > Hs * 0.72 || maxTailBack > Hs * 0.36;
}

/**
 * RECONSTRUCCIÓN VOLUMÉTRICA 3D GUIADA POR LAS 4 VISTAS (FRENTE, ATRÁS Y PERFILES)
 * CORTANDO ESTRICTAMENTE LO QUE SOBRA (VISUAL HULL + ESCULPIDO ANATÓMICO 3D):
 *   - Tiene en cuenta simultáneamente el FRENTE (`frontMask`), ATRÁS (`backMask`) y los PERFILES (`sideMask`, `sideLeftMask`).
 *   - Corta todo el material sobrante fuera de las siluetas de Frente, Atrás y Perfil (ventanas vacías entre cuello y alas,
 *     espacio entre cuernos, arco vacío bajo el vientre, hueco entre las 4 patas y recortes entre los dedos de las alas).
 *   - Separa con precisión las membranas y brazos de las alas (`offset = 0.35`) respecto del tronco/cuello para que el
 *     cuerpo nunca se infle con la anchura del ala y las alas se desplieguen como láminas 3D esculpidas.
 */
function buildProfileDriven3DMoldGeometry(
  geometry: THREE.BufferGeometry,
  inputs: HumanBodyInputs,
  options: HumanBodyOptions,
  frontMask: Uint8Array,
  landmarks: HumanBodyLandmarks
): HumanBodyStats {
  const { w } = inputs;
  const rawBackMask = inputs.backMask ?? frontMask;
  const sMaskPrimary = (inputs.sideMask ?? inputs.sideLeftMask)!;
  const sLayerPrimary = inputs.sideMask ? inputs.sideLayer : inputs.sideLeftLayer;
  const sMaskLeft = inputs.sideLeftMask ?? sMaskPrimary;
  const sLayerLeft = inputs.sideLeftMask ? inputs.sideLeftLayer : sLayerPrimary;

  // Clasificadores exactos según LAYER_CLASSES en layerMap.ts:
  // skin = 0.0, armor = 1.0, cloth = 0.35, fur = 0.8, spikes = 1.8, hollow = -0.6, leather = 0.5
  const isClothOff = (off: number) => Number.isFinite(off) && Math.abs(off - 0.35) < 0.05;
  const isArmorOff = (off: number) => Number.isFinite(off) && Math.abs(off - 1.0) < 0.08;
  const isSpikesOff = (off: number) => Number.isFinite(off) && Math.abs(off - 1.8) < 0.10;
  const isHollowOff = (off: number) => Number.isFinite(off) && Math.abs(off - -0.6) < 0.08;
  const isLeatherOff = (off: number) => Number.isFinite(off) && Math.abs(off - 0.5) < 0.06;
  const isBodyCoreClass = (off: number) =>
    isArmorOff(off) || isSpikesOff(off) || isHollowOff(off) || isLeatherOff(off);

  // 1) Analizar FRENTE (`frontMask`) y ATRÁS (`rawBackMask`):
  const fTop = landmarks.top;
  const fBot = landmarks.bottom;
  const Hf = Math.max(16, fBot - fTop + 1);

  let bTop = -1;
  let bBot = -1;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      if (rawBackMask[y * w + x] === 1) {
        if (bTop < 0) bTop = y;
        bBot = y;
      }
    }
  }
  if (bTop < 0) {
    bTop = fTop;
    bBot = fBot;
  }
  const Hb = Math.max(16, bBot - bTop + 1);

  // Eje central de simetría X en Frente (`fAxisX`) y en Atrás (`bAxisX`) medido en cabeza/cuello y pecho/caderas
  const computeViewAxisX = (
    m: Uint8Array,
    vTop: number,
    vBot: number,
    layer?: { offset: Float32Array; soft: Uint8Array } | null,
    isMirroredBack = false
  ): number => {
    const Hv = Math.max(16, vBot - vTop + 1);
    const centers: number[] = [];
    for (let y = vTop; y <= vBot; y++) {
      const tY = (y - vTop) / Math.max(1, Hv - 1);
      if (tY < 0.08 || tY > 0.78) continue;
      const runs = rowRuns(m, w, y);
      if (runs.length === 0) continue;
      const k = runNearest(runs, w * 0.5);
      if (k < 0) continue;
      let [ra, rb] = runs[k];
      if (layer) {
        while (ra < rb - 4) {
          const lx = isMirroredBack ? w - 1 - ra : ra;
          if (!isClothOff(layer.offset[y * w + lx])) break;
          ra++;
        }
        while (rb > ra + 4) {
          const lx = isMirroredBack ? w - 1 - rb : rb;
          if (!isClothOff(layer.offset[y * w + lx])) break;
          rb--;
        }
      }
      if (rb - ra + 1 <= Hv * 0.36) {
        centers.push(0.5 * (ra + rb));
      }
    }
    if (!centers.length) return w * 0.5;
    centers.sort((a, b) => a - b);
    return centers[centers.length >> 1];
  };

  const fAxisX = computeViewAxisX(frontMask, fTop, fBot, inputs.frontLayer, false);
  const bAxisX = computeViewAxisX(rawBackMask, bTop, bBot, inputs.backLayer, true);
  landmarks.axisX = fAxisX;

  // Remapear `rawBackMask` y `inputs.backLayer` al marco vertical/horizontal `[fTop..fBot, fAxisX]` del Frente
  // aplicando además la configuración relativa del recuadro de Espalda (`relBackTf`) para que mover o redimensionar
  // el recuadro de Espalda (o del Frente) acople en tiempo real tanto la silueta como la textura trasera.
  const relBackTf = computeRelativePhotoTransform(
    options.photoTransforms?.front,
    options.photoTransforms?.back
  );
  const scaleBackX = Math.max(0.15, Math.min(3.5, relBackTf.scaleX ?? 1));
  const scaleBackY = Math.max(0.15, Math.min(3.5, relBackTf.scaleY ?? 1));
  // Nota: `rawBackMask` ya está espejada en horizontal para coincidir con el Frente, de modo que un offsetX positivo
  // en el estudio visual mueve la silueta hacia +X en el lienzo.
  const dxBackTex = ((relBackTf.offsetX ?? 0) / 100) * Hf;
  const dyBackTex = ((relBackTf.offsetY ?? 0) / 100) * Hf;
  const fMidYAll = 0.5 * (fTop + fBot);

  const backMask = new Uint8Array(w * w);
  const backLayerAlignedOff = new Float32Array(w * w).fill(NaN);
  for (let y = 0; y < w; y++) {
    const yRel = fMidYAll + (y - dyBackTex - fMidYAll) / scaleBackY;
    const tY = (yRel - fTop) / Math.max(1, Hf - 1);
    if (tY < -0.02 || tY > 1.02) continue;
    const by = Math.max(bTop, Math.min(bBot, Math.round(bTop + Math.max(0, Math.min(1, tY)) * (Hb - 1))));
    for (let x = 0; x < w; x++) {
      const xRel = fAxisX + (x - dxBackTex - fAxisX) / scaleBackX;
      const bx = Math.round(bAxisX + (xRel - fAxisX) * (Hb / Hf));
      if (bx < 0 || bx >= w) continue;
      const i = y * w + x;
      const bi = by * w + bx;
      backMask[i] = rawBackMask[bi];
      if (inputs.backLayer) {
        // Nota: backLayer está en coordenadas sin espejar (w - 1 - bx)
        const blx = Math.max(0, Math.min(w - 1, w - 1 - bx));
        backLayerAlignedOff[i] = inputs.backLayer.offset[by * w + blx];
      }
    }
  }

  // Estimar el semiancho del cuerpo central (`refBodyHalf`: cuello, cabeza, pecho y caderas sin alas)
  const coreSamples: number[] = [];
  for (let y = fTop; y <= fBot; y++) {
    const tY = (y - fTop) / Math.max(1, Hf - 1);
    const runs = rowRuns(frontMask, w, y);
    const k = runNearest(runs, fAxisX);
    if (k < 0) continue;
    let [ra, rb] = runs[k];
    // El tramo debe cruzar realmente el eje central fAxisX
    if (ra > fAxisX + 6 || rb < fAxisX - 6) continue;
    if (inputs.frontLayer) {
      while (ra < fAxisX - 2 && isClothOff(inputs.frontLayer.offset[y * w + ra])) ra++;
      while (rb > fAxisX + 2 && isClothOff(inputs.frontLayer.offset[y * w + rb])) rb--;
    }
    const half = 0.5 * (rb - ra + 1);
    if ((tY >= 0.14 && tY <= 0.31) || (tY >= 0.54 && tY <= 0.90)) {
      if (half >= 3 && half <= Hf * 0.22) coreSamples.push(half);
    }
  }
  coreSamples.sort((a, b) => a - b);
  const refBodyHalf = coreSamples.length
    ? coreSamples[Math.floor(coreSamples.length * 0.65)]
    : Math.max(8, Hf * 0.105);

  // 1a) Función auxiliar: Rellenar micro-poros internos (<= 20 px de 0 rodeados por 1) sin tocar ningún hueco real
  //     (como las ventanas entre cuello y alas, el espacio entre cuernos, el arco bajo la barriga o el hueco entre patas).
  const closeTinyInternalPinholes = (m: Uint8Array) => {
    const visited = new Uint8Array(w * w);
    const comp: number[] = [];
    for (let i = 0; i < w * w; i++) {
      if (m[i] === 1 || visited[i] === 1) continue;
      comp.length = 0;
      visited[i] = 1;
      comp.push(i);
      let touchesBorder = false;
      let head = 0;
      while (head < comp.length) {
        const curr = comp[head++];
        const cx = curr % w;
        const cy = (curr / w) | 0;
        if (cx === 0 || cx === w - 1 || cy === 0 || cy === w - 1) touchesBorder = true;
        const nbs = [
          cx > 0 ? curr - 1 : -1,
          cx < w - 1 ? curr + 1 : -1,
          cy > 0 ? curr - w : -1,
          cy < w - 1 ? curr + w : -1,
        ];
        for (let k = 0; k < 4; k++) {
          const nb = nbs[k];
          if (nb >= 0 && m[nb] === 0 && visited[nb] === 0) {
            visited[nb] = 1;
            comp.push(nb);
          }
        }
      }
      if (!touchesBorder && comp.length <= 20) {
        for (let k = 0; k < comp.length; k++) m[comp[k]] = 1;
      }
    }
  };

  // 1b) Campo de distancia con signo verdadero (`sdf`: > 0 dentro de la silueta, < 0 fuera de la silueta)
  //     + radio local de cresta por tramo horizontal (`runRad`: máximo de `sdf` dentro de cada tramo `[ra, rb]` de la fila `y`).
  //     Propiedad matemática clave: en el centro de CADA tramo horizontal de CADA fila (cuernos, cuello, torso, barriga,
  //     4 patas, cola y alas), `sdf === runRad` -> `u = 1 - sdf / runRad === 0`, por lo que es IMPOSIBLE que se formen
  //     agujeros dentro del cuerpo, mientras que fuera de la silueta (`sdf <= 0`) se corta estrictamente todo lo que sobra.
  const dInBuf = new Float32Array(w * w);
  const dOutBuf = new Float32Array(w * w);
  const invMaskBuf = new Uint8Array(w * w);
  const dummyRadBuf = new Float32Array(w * w);

  const signedDistanceAndRunRadius = (
    m: Uint8Array,
    sdfOut: Float32Array,
    runRadOut: Float32Array
  ) => {
    for (let i = 0; i < w * w; i++) invMaskBuf[i] = m[i] === 1 ? 0 : 1;
    distanceAndRadius(m, w, dInBuf, dummyRadBuf);
    distanceAndRadius(invMaskBuf, w, dOutBuf, dummyRadBuf);
    for (let i = 0; i < w * w; i++) {
      sdfOut[i] = m[i] === 1 ? dInBuf[i] : -dOutBuf[i];
    }

    runRadOut.fill(2.0);
    for (let y = 0; y < w; y++) {
      const runs = rowRuns(m, w, y);
      if (runs.length === 0) continue;
      for (let rIdx = 0; rIdx < runs.length; rIdx++) {
        const [ra, rb] = runs[rIdx];
        let maxD = 1.25;
        for (let x = ra; x <= rb; x++) {
          const d = dInBuf[y * w + x];
          if (d > maxD) maxD = d;
        }
        const padLeft = rIdx === 0 ? 0 : Math.floor((runs[rIdx - 1][1] + ra) * 0.5) + 1;
        const padRight =
          rIdx === runs.length - 1 ? w - 1 : Math.floor((rb + runs[rIdx + 1][0]) * 0.5);
        for (let x = padLeft; x <= padRight; x++) {
          runRadOut[y * w + x] = maxD;
        }
      }
    }
  };

  closeTinyInternalPinholes(frontMask);
  closeTinyInternalPinholes(backMask);
  closeTinyInternalPinholes(sMaskPrimary);

  // Estimar el límite superior del cuerpo central (`fCoreTopEst`: cuernos/cabeza cerca de `fAxisX`) antes de separar alas,
  // para que si las alas suben muy por encima de la cabeza las zonas anatómicas (cuernos, cuello, hombros) se midan desde la cabeza real.
  let fCoreTopEst = fBot;
  for (let y = fTop; y <= fBot; y++) {
    let hasCentralBody = false;
    const maxScanDx = Math.ceil(refBodyHalf * 0.92);
    for (let dx = -maxScanDx; dx <= maxScanDx; dx++) {
      const x = Math.max(0, Math.min(w - 1, Math.round(fAxisX + dx)));
      const i = y * w + x;
      if (frontMask[i] === 1 || backMask[i] === 1) {
        const fOff = inputs.frontLayer ? inputs.frontLayer.offset[i] : NaN;
        if (!isClothOff(fOff)) {
          hasCentralBody = true;
          break;
        }
      }
    }
    if (hasCentralBody) {
      fCoreTopEst = y;
      break;
    }
  }
  if (fCoreTopEst >= fBot - 8) fCoreTopEst = fTop;
  const HcoreEst = Math.max(16, fBot - fCoreTopEst + 1);

  // Función que separa una vista (Frente o Atrás) en su Cuerpo Central (`coreMask`: cabeza, ambos cuernos, cuello, torso,
  // barriga, ambas patas y cola) y sus Alas Laterales (`wingMask`: membranas y brazos/dedos de las alas desplegadas en ±X).
  const splitFrontOrBackMask = (
    viewMask: Uint8Array,
    layerOff: Float32Array | null,
    coreOut: Uint8Array,
    wingOut: Uint8Array
  ): { wingCount: number; maxWingSpan: number; coreTop: number } => {
    let wingCount = 0;
    let maxWingSpan = refBodyHalf;
    let coreTop = fBot;

    // ¿La tela pintada en esta vista se comporta como una membrana de ala, o es ropa?
    // La clase `cloth` (azul) sirve para las dos cosas: la membrana de un ala desplegada, pero
    // también una manta de silla, una gualdrapa, una capa o un tabardo. La diferencia es dónde
    // está: un ala sale POR FUERA del cuerpo, y una tela encima del lomo no. Si en toda la vista
    // no hay tela más allá del cuerpo, no hay alas que separar y la tela se queda como cuerpo
    // (si no, la manta de la silla se extruye en una placa plana que atraviesa el modelo).
    let maxClothDx = 0;
    for (let y = fTop; y <= fBot; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (viewMask[i] !== 1) continue;
        const off = layerOff ? layerOff[i] : NaN;
        if (!isClothOff(off)) continue;
        const dx = Math.abs(x - fAxisX);
        if (dx > maxClothDx) maxClothDx = dx;
      }
    }
    const clothIsWingLike = maxClothDx > refBodyHalf * 1.1;

    for (let y = fTop; y <= fBot; y++) {
      const uCoreY = (y - fCoreTopEst) / Math.max(1, HcoreEst - 1);
      const runs = rowRuns(viewMask, w, y);
      if (runs.length === 0) continue;

      let rowMin = w;
      let rowMax = -1;
      for (const [ra, rb] of runs) {
        if (ra < rowMin) rowMin = ra;
        if (rb > rowMax) rowMax = rb;
      }
      const rowHalf = rowMax >= rowMin ? 0.5 * (rowMax - rowMin + 1) : 0;

      // Semiancho máximo del cuerpo central en cada altura relativa `uCoreY` medida desde el tope de la cabeza/cuernos:
      // - Por encima de los cuernos (`uCoreY < -0.02`): 0 (solo hay puntas altas de alas).
      // - En la cabeza y cuernos (`uCoreY < 0.18`): hasta 1.28 * refBodyHalf (conserva AMBOS cuernos aunque sean 2 tramos separados).
      // - En el cuello (`0.18 <= uCoreY < 0.34`): hasta 0.94 * refBodyHalf (el cuello central está separado de las alas por la ventana blanca).
      // - En los hombros y pecho (`0.34 <= uCoreY < 0.56`): hasta 1.15 * refBodyHalf.
      // - En la barriga, caderas y las 2 patas (`uCoreY >= 0.56`): hasta 1.28 * refBodyHalf (conserva AMBAS patas izquierda y derecha).
      const maxCoreDx =
        uCoreY < -0.02
          ? 0
          : uCoreY < 0.18
          ? refBodyHalf * 1.28
          : uCoreY < 0.34
          ? refBodyHalf * 0.94
          : uCoreY < 0.56
          ? refBodyHalf * 1.15
          : refBodyHalf * 1.28;

      for (let rIdx = 0; rIdx < runs.length; rIdx++) {
        const [ra, rb] = runs[rIdx];
        const runMinDx = ra <= fAxisX && rb >= fAxisX ? 0 : Math.min(Math.abs(ra - fAxisX), Math.abs(rb - fAxisX));
        const runMaxDx = Math.max(Math.abs(ra - fAxisX), Math.abs(rb - fAxisX));

        // Un tramo lateral desconectado es ala SOLO si todo el tramo queda fuera de la zona central de cuernos/cuello/patas
        // (p. ej. las puntas altas de las alas a los lados de la cabeza, las alas junto a la ventana del cuello, o las puntas bajas de las alas).
        const isOuterWingRun =
          uCoreY < -0.02 ||
          runMinDx > refBodyHalf * 0.96 ||
          (uCoreY < 0.56 && runMinDx > refBodyHalf * 0.52 && runMaxDx > maxCoreDx * 1.05);

        for (let x = ra; x <= rb; x++) {
          const i = y * w + x;
          const dx = Math.abs(x - fAxisX);
          const off = layerOff ? layerOff[i] : NaN;
          const fOff = inputs.frontLayer ? inputs.frontLayer.offset[i] : NaN;
          // Nota: en el mapa de capas trasero del dragón las alas están pintadas en verde (skin), mientras que en el frontal
          // las membranas de las alas están pintadas en azul (cloth = 0.35). Usamos ambos para identificar la membrana.
          const isCloth =
            clothIsWingLike && (isClothOff(off) || (dx > refBodyHalf * 0.85 && isClothOff(fOff)));
          const isCoreArmorOrSpike =
            dx <= maxCoreDx &&
            (isArmorOff(off) ||
              isSpikesOff(off) ||
              isHollowOff(off) ||
              isLeatherOff(off) ||
              isArmorOff(fOff));

          const isWing =
            isOuterWingRun ||
            (!isCoreArmorOrSpike && isCloth) ||
            (!isCoreArmorOrSpike && uCoreY >= 0.02 && uCoreY < 0.82 && dx > maxCoreDx && rowHalf > refBodyHalf * 1.48);

          if (isWing) {
            wingOut[i] = 1;
            wingCount++;
            if (dx > maxWingSpan) maxWingSpan = dx;
            // Solape sólido de 5.5 px en la raíz del hombro (uCoreY = 0.14..0.68) para soldar el ala al torso sin huecos
            if (!isOuterWingRun && uCoreY >= 0.14 && uCoreY <= 0.68 && dx <= maxCoreDx + 5.5) {
              coreOut[i] = 1;
            }
          } else {
            coreOut[i] = 1;
            if (y < coreTop) coreTop = y;
            if (uCoreY >= 0.14 && uCoreY <= 0.68 && dx >= maxCoreDx - 4.5 && rowHalf > refBodyHalf * 1.48) {
              wingOut[i] = 1;
            }
          }
        }
      }
    }
    return { wingCount, maxWingSpan, coreTop };
  };

  const frontCoreMask = new Uint8Array(w * w);
  const frontWingMask = new Uint8Array(w * w);
  const frontSplit = splitFrontOrBackMask(
    frontMask,
    inputs.frontLayer ? inputs.frontLayer.offset : null,
    frontCoreMask,
    frontWingMask
  );

  const backCoreMask = new Uint8Array(w * w);
  const backWingMask = new Uint8Array(w * w);
  const backSplit = splitFrontOrBackMask(
    backMask,
    inputs.backLayer ? backLayerAlignedOff : null,
    backCoreMask,
    backWingMask
  );

  const maxWingHalfSpan = Math.max(frontSplit.maxWingSpan, backSplit.maxWingSpan);
  // Para que haya alas no basta con que sobresalga algo del cuerpo: un ala DESPLEGADA
  // llega mucho más lejos que el torso. Sin esta condición, la melena de un león, unas
  // orejas grandes o una gorguera disparaban la separación de alas, y entonces el perfil
  // se medía desde debajo de la melena (`sBodyTop`), con lo que la textura del perfil se
  // aplastaba contra la mitad inferior del dibujo y el lomo acababa pintado con la barriga.
  const wingSpanRatio = maxWingHalfSpan / Math.max(1, refBodyHalf);
  const hasWings =
    (frontSplit.wingCount > 180 || backSplit.wingCount > 180) && wingSpanRatio > 1.55;
  const fCoreTop = Math.min(frontSplit.coreTop, backSplit.coreTop, fCoreTopEst);
  const tCoreTop = Math.max(0, (fCoreTop - fTop) / Math.max(1, Hf - 1));

  // Encontrar dónde termina realmente la barriga roja (`armor = 1.0`) en el centro (`x ~ fAxisX`)
  // para NO abrir el hueco de la entrepierna en mitad de la barriga/pelvis (lo que causaba un agujero en el vientre).
  let lastBellyArmorY = Math.round(fTop + Hf * 0.62);
  if (inputs.frontLayer) {
    for (let y = Math.round(fTop + Hf * 0.45); y <= Math.round(fTop + Hf * 0.78); y++) {
      let hasCenterArmor = false;
      for (let dx = -3; dx <= 3; dx++) {
        const x = Math.max(0, Math.min(w - 1, Math.round(fAxisX + dx)));
        if (isArmorOff(inputs.frontLayer.offset[y * w + x])) {
          hasCenterArmor = true;
          break;
        }
      }
      if (hasCenterArmor) lastBellyArmorY = y;
    }
  }
  const crotchStartT = Math.max(
    0.65,
    Math.min(0.73, (lastBellyArmorY - fTop) / Math.max(1, Hf - 1) + 0.03)
  );

  // Construir `frontLegsMask` y `backLegsMask` COPIANDO íntegramente `frontCoreMask` y `backCoreMask` en toda la altura `0..w-1`
  // (para que la transformada de distancia 2D sea 100% continua con el torso y NUNCA cree una ranura horizontal),
  // y vaciando únicamente por debajo de la entrepierna (`tY >= crotchStartT`) la tira central de la cola (`dx < innerGap`)
  // y la punta lateral de la cola en el suelo (`dx > maxLegOuter`).
  const frontLegsMask = frontCoreMask.slice();
  const backLegsMask = backCoreMask.slice();
  const fCoreHalfByRow = new Float32Array(w).fill(refBodyHalf);

  for (let y = fTop; y <= fBot; y++) {
    const tY = (y - fTop) / Math.max(1, Hf - 1);
    let maxDx = 0;
    for (let x = 0; x < w; x++) {
      if (frontCoreMask[y * w + x] === 1 || backCoreMask[y * w + x] === 1) {
        const dx = Math.abs(x - fAxisX);
        if (dx > maxDx) maxDx = dx;
      }
    }
    if (maxDx > 0) fCoreHalfByRow[y] = maxDx;

    if (tY >= crotchStartT) {
      const openRamp = Math.min(1, Math.max(0, (tY - crotchStartT) / 0.06));
      // Hueco interior moderado (~0.19 * refBodyHalf) que elimina la cola colgante entre los muslos/tobillos
      // sin comerse el interior de las patas
      const innerGap = openRamp * Math.max(2.2, refBodyHalf * 0.19);
      const maxLegOuter = refBodyHalf * 1.16;

      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const dx = Math.abs(x - fAxisX);
        if (dx < innerGap || (tY > 0.78 && dx > maxLegOuter)) {
          frontLegsMask[i] = 0;
          backLegsMask[i] = 0;
        }
      }
      // Si en la vista trasera la cola tapaba una de las patas, reforzar simetría con la silueta de las patas delanteras
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (frontLegsMask[i] === 1 && backCoreMask[i] === 1) {
          backLegsMask[i] = 1;
        }
      }
    }
  }
  smooth1D(fCoreHalfByRow, fTop, fBot, 2);

  const fCoreDist = new Float32Array(w * w);
  const fCoreRad = new Float32Array(w * w);
  signedDistanceAndRunRadius(frontCoreMask, fCoreDist, fCoreRad);

  const bCoreDist = new Float32Array(w * w);
  const bCoreRad = new Float32Array(w * w);
  signedDistanceAndRunRadius(backCoreMask, bCoreDist, bCoreRad);

  const fLegsDist = new Float32Array(w * w);
  const fLegsRad = new Float32Array(w * w);
  signedDistanceAndRunRadius(frontLegsMask, fLegsDist, fLegsRad);

  const bLegsDist = new Float32Array(w * w);
  const bLegsRad = new Float32Array(w * w);
  signedDistanceAndRunRadius(backLegsMask, bLegsDist, bLegsRad);

  // Para las alas desplegadas en X-Y, combinamos la unión de las siluetas de ala frontal y trasera
  const unionWingMask = new Uint8Array(w * w);
  const fWingDist = new Float32Array(w * w);
  const fWingRad = new Float32Array(w * w);
  if (hasWings) {
    for (let i = 0; i < w * w; i++) {
      unionWingMask[i] = frontWingMask[i] === 1 || backWingMask[i] === 1 ? 1 : 0;
    }
    closeTinyInternalPinholes(unionWingMask);
    signedDistanceAndRunRadius(unionWingMask, fWingDist, fWingRad);
  }

  // 2) Analizar el PERFIL (`sMaskPrimary` y `sMaskLeft`):
  //    Separar con precisión el Cuerpo (`sideBodyMask`: hocico, cabeza, cuernos, cuello en S, púas dorsales,
  //    torso entero, barriga, 4 patas y cola) respecto del Ala (`sideWingMask`: membrana azul `cloth = 0.35`,
  //    brazo superior del ala detrás del hueco en V del cuello y dedos del ala).
  const rawPrimarySideTf =
    (inputs.sideMask ? options.photoTransforms?.side : options.photoTransforms?.sideLeft) ??
    options.photoTransforms?.side;
  const rawLeftSideTf =
    (inputs.sideLeftMask ? options.photoTransforms?.sideLeft : options.photoTransforms?.side) ??
    rawPrimarySideTf;
  const relSideTf = computeRelativePhotoTransform(options.photoTransforms?.front, rawPrimarySideTf);
  const relSideLeftTf = computeRelativePhotoTransform(options.photoTransforms?.front, rawLeftSideTf);

  const sideContours = sideProfileContoursByRow(
    sMaskPrimary,
    w,
    fTop,
    fBot,
    sLayerPrimary,
    false,
    relSideTf
  );
  const facingRight = sideContours ? sideContours.facingRight : true;
  const sTop = sideContours ? sideContours.sTop : fTop;
  const sBot = sideContours ? sideContours.sBot : fBot;
  const Hs = Math.max(16, sBot - sTop + 1);
  const kScale = Hf / Hs;

  const sideContoursLeft = sideProfileContoursByRow(
    sMaskLeft,
    w,
    fTop,
    fBot,
    sLayerLeft,
    false,
    relSideLeftTf
  );
  const facingRightLeft = sideContoursLeft ? sideContoursLeft.facingRight : !facingRight;
  const sTopLeft = sideContoursLeft ? sideContoursLeft.sTop : sTop;
  const sBotLeft = sideContoursLeft ? sideContoursLeft.sBot : sBot;
  const HsLeft = Math.max(16, sBotLeft - sTopLeft + 1);

  const sideBodyMask = new Uint8Array(w * w);
  const sideWingMask = new Uint8Array(w * w);

  if (!hasWings) {
    sideBodyMask.set(sMaskPrimary);
  } else {
    // 2a) Marcar todos los píxeles de membrana azul de ala (`cloth` offset = 0.35) y calcular por columna `x`
    //     el límite inferior de la membrana (`clothBottomByX`), para que la expansión del borde del ala NUNCA
    //     baje hacia la espalda, el torso, las caderas ni la cola!
    const clothSeed = new Uint8Array(w * w);
    const clothBottomByX = new Int32Array(w).fill(-1);
    if (sLayerPrimary) {
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (sMaskPrimary[i] === 1 && isClothOff(sLayerPrimary.offset[i])) {
            clothSeed[i] = 1;
            if (y > clothBottomByX[x]) clothBottomByX[x] = y;
          }
        }
      }
    }
    const nearCloth = clothSeed.slice();
    for (let pass = 0; pass < 3; pass++) {
      const prev = nearCloth.slice();
      for (let y = 1; y < w - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (prev[i] || sMaskPrimary[i] !== 1) continue;
          const off = sLayerPrimary ? sLayerPrimary.offset[i] : NaN;
          if (isBodyCoreClass(off)) continue;
          // No expandir hacia abajo dentro del lomo/cuerpo cuando estamos en la mitad delantera/central
          const colBot = clothBottomByX[x];
          if (colBot >= 0 && y > colBot + 1) continue;
          if (prev[i - 1] || prev[i + 1] || prev[i - w] || prev[i + w]) {
            nearCloth[i] = 1;
          }
        }
      }
    }

    // 2b) Separar en cada fila `ys` del perfil el Cuerpo (`sideBodyMask`) respecto del Ala (`sideWingMask`):
    //     - Donde existe un tramo con membrana de ala (`clothCount >= 2`) y ADEMÁS hay tramos sin tela por delante de él
    //       (al otro lado del hueco blanco en V entre el ala y la cabeza/cuello), TODOS los tramos delanteros son 100%
    //       cabeza/cuernos/hocico/mandíbula/cuello (`sideBodyMask`), y el tramo con tela (incluido su brazo verde de borde
    //       de ataque) es 100% ala (`sideWingMask`).
    //     - Justo al cerrarse el hueco en V en la raíz del hombro (`ys = lastSplitY + 1 .. lastSplitY + 8`), el límite trasero
    //       del cuello (`lastSplitNeckRearX`) se funde suavemente hacia la membrana azul (`nearCloth`) para no dejar escalón.
    //     - En el resto del torso, lomo, púas dorsales, barriga, 4 patas y cola: se conserva el 100% del cuerpo salvo `nearCloth`
    //       y las puntas traseras de ala desconectadas en el aire por encima del lomo (`uBody < 0.56`).
    let lastSplitY = -1;
    let lastSplitNeckRearX = -1;
    let firstHeadSplitY = -1;

    for (let ys = sTop; ys <= sBot; ys++) {
      const tY = (ys - sTop) / Math.max(1, Hs - 1);
      const uBody = (tY - tCoreTop) / Math.max(0.25, 1 - tCoreTop);
      if (uBody < -0.05) {
        for (let x = 0; x < w; x++) {
          const i = ys * w + x;
          if (sMaskPrimary[i] === 1) sideWingMask[i] = 1;
        }
        continue;
      }

      const runs = rowRuns(sMaskPrimary, w, ys);
      if (runs.length === 0) continue;

      // Analizar cada tramo `[ra, rb]` para saber si contiene membrana azul (`nearCloth`).
      // Si no hay mapa de colores (`!sLayerPrimary`), en la mitad superior donde el hueco en V separa el ala
      // trasera de la cabeza/cuernos/cuello delanteros (`runs.length >= 2`), el tramo más trasero es el ala.
      let clothFrontMostRunEnd = facingRight ? -1 : w;
      let hasClothRun = false;
      for (let rIdx = 0; rIdx < runs.length; rIdx++) {
        const [ra, rb] = runs[rIdx];
        let cCnt = 0;
        for (let x = ra; x <= rb; x++) {
          if (nearCloth[ys * w + x] === 1) cCnt++;
        }
        if (cCnt >= 2) {
          hasClothRun = true;
          if (facingRight) {
            if (rb > clothFrontMostRunEnd) clothFrontMostRunEnd = rb;
          } else {
            if (ra < clothFrontMostRunEnd) clothFrontMostRunEnd = ra;
          }
        }
      }
      if (!hasClothRun && runs.length >= 2 && uBody >= -0.02 && uBody < 0.46) {
        hasClothRun = true;
        if (facingRight) {
          clothFrontMostRunEnd = runs[0][1];
        } else {
          clothFrontMostRunEnd = runs[runs.length - 1][0];
        }
      }

      // ¿Hay tramos de cuerpo/cabeza/cuernos/cuello estrictamente por delante del tramo del ala (separados por el hueco en V)?
      let frontBodyStart = -1;
      let frontBodySpan = 0;
      if (hasClothRun && uBody < 0.56) {
        for (let rIdx = 0; rIdx < runs.length; rIdx++) {
          const [ra, rb] = runs[rIdx];
          if (facingRight && ra > clothFrontMostRunEnd + 1) {
            if (frontBodyStart < 0 || ra < frontBodyStart) frontBodyStart = ra;
            frontBodySpan += rb - ra + 1;
          } else if (!facingRight && rb < clothFrontMostRunEnd - 1) {
            if (frontBodyStart < 0 || rb > frontBodyStart) frontBodyStart = rb;
            frontBodySpan += rb - ra + 1;
          }
        }
      }

      // Ignorar la diminuta uña amarilla del pulgar del ala si aparece aislada muy arriba antes de los cuernos
      const isTrueHeadOrNeckSplit =
        frontBodyStart >= 0 &&
        (firstHeadSplitY >= 0 ||
          uBody >= -0.01 ||
          frontBodySpan >= 6 ||
          (facingRight
            ? frontBodyStart - clothFrontMostRunEnd >= 6
            : clothFrontMostRunEnd - frontBodyStart >= 6));

      if (isTrueHeadOrNeckSplit) {
        if (firstHeadSplitY < 0) firstHeadSplitY = ys;
        lastSplitY = ys;
        lastSplitNeckRearX = frontBodyStart;

        for (let rIdx = 0; rIdx < runs.length; rIdx++) {
          const [ra, rb] = runs[rIdx];
          const isFrontOfWing = facingRight
            ? ra > clothFrontMostRunEnd + 1
            : rb < clothFrontMostRunEnd - 1;
          for (let x = ra; x <= rb; x++) {
            const i = ys * w + x;
            if (isFrontOfWing && nearCloth[i] === 0) {
              sideBodyMask[i] = 1;
            } else {
              sideWingMask[i] = 1;
            }
          }
        }
        continue;
      }

      // Si aún no ha empezado la cabeza (`firstHeadSplitY < 0`) y estamos en el tercio superior (`uBody < 0.36`),
      // todo lo que asoma por encima de la cabeza/cuernos es 100% parte superior del ala (incluyendo su garra superior).
      if (firstHeadSplitY < 0 && uBody < 0.36) {
        for (let x = 0; x < w; x++) {
          const i = ys * w + x;
          if (sMaskPrimary[i] === 1) sideWingMask[i] = 1;
        }
        continue;
      }

      // Debajo del cierre del hueco en V (hombros, torso, lomo, barriga, 4 patas y cola):
      const frontRunIdx = facingRight ? runs.length - 1 : 0;
      const [fRa, fRb] = runs[frontRunIdx];
      const frontEdgeX = facingRight ? fRb : fRa;

      // Transición suave de 8 filas justo debajo de `lastSplitY` donde el brazo verde del ala entra en el hombro
      const dyAfterSplit = lastSplitY >= 0 ? ys - lastSplitY : 999;
      const useShoulderTaper = dyAfterSplit >= 1 && dyAfterSplit <= 8 && lastSplitNeckRearX >= 0;

      for (let rIdx = 0; rIdx < runs.length; rIdx++) {
        const [ra, rb] = runs[rIdx];
        const distRunClosestToFront =
          (facingRight ? frontEdgeX - rb : ra - frontEdgeX) * kScale;

        // Tramos traseros desconectados en el aire detrás del hombro/espalda alta (`uBody < 0.52`) son puntas inferiores de ala
        let runClothCnt = 0;
        let runSpikesCnt = 0;
        for (let x = ra; x <= rb; x++) {
          if (nearCloth[ys * w + x] === 1) runClothCnt++;
          if (sLayerPrimary && isSpikesOff(sLayerPrimary.offset[ys * w + x])) runSpikesCnt++;
        }
        const isDisconnectedWingTip =
          rIdx !== frontRunIdx &&
          uBody < 0.52 &&
          runSpikesCnt === 0 &&
          (runClothCnt >= 1 || distRunClosestToFront > refBodyHalf * 1.85);

        for (let x = ra; x <= rb; x++) {
          const i = ys * w + x;
          let isShoulderArmBridge = false;
          if (useShoulderTaper && !isBodyCoreClass(sLayerPrimary ? sLayerPrimary.offset[i] : NaN)) {
            const taperShift = ((8 - dyAfterSplit) / 8) * (refBodyHalf * 0.55);
            if (facingRight && x < lastSplitNeckRearX - dyAfterSplit * 1.5 && x <= clothFrontMostRunEnd + taperShift) {
              isShoulderArmBridge = true;
            } else if (!facingRight && x > lastSplitNeckRearX + dyAfterSplit * 1.5 && x >= clothFrontMostRunEnd - taperShift) {
              isShoulderArmBridge = true;
            }
          }

          if (isDisconnectedWingTip || nearCloth[i] === 1 || isShoulderArmBridge) {
            sideWingMask[i] = 1;
          } else {
            sideBodyMask[i] = 1;
          }
        }
      }
    }

    keepLargestComponent(sideBodyMask, w);
    closeTinyInternalPinholes(sideBodyMask);

    for (let ys = sTop; ys <= sBot; ys++) {
      const tY = (ys - sTop) / Math.max(1, Hs - 1);
      const uBody = (tY - tCoreTop) / Math.max(0.25, 1 - tCoreTop);
      for (let x = 0; x < w; x++) {
        const i = ys * w + x;
        if (sMaskPrimary[i] === 1 && sideBodyMask[i] === 0) {
          sideWingMask[i] = 1;
        } else if (
          sideBodyMask[i] === 1 &&
          uBody >= 0.20 &&
          uBody <= 0.68 &&
          ((x > 0 && sideWingMask[i - 1] === 1) || (x < w - 1 && sideWingMask[i + 1] === 1))
        ) {
          sideWingMask[i] = 1;
        }
      }
    }
  }

  const sBodyDist = new Float32Array(w * w);
  const sBodyRad = new Float32Array(w * w);
  signedDistanceAndRunRadius(sideBodyMask, sBodyDist, sBodyRad);

  // 3) Medir por fila del perfil de cuerpo (`sideBodyMask`) los límites delantero y trasero,
  //    el tope real de la cabeza/cuernos en el perfil (`sBodyTop`), el eje Z = 0 (`sSpineX`),
  //    el límite trasero de la pata trasera (`hindLegRearByRow`) donde empieza la cola,
  //    y la envergadura Z de las alas (`wingFrontS`, `wingBackS`).
  const bMinX = new Int32Array(w).fill(-1);
  const bMaxX = new Int32Array(w).fill(-1);
  const wMinX = new Int32Array(w).fill(-1);
  const wMaxX = new Int32Array(w).fill(-1);
  let sBodyTop = -1;

  for (let ys = sTop; ys <= sBot; ys++) {
    let ba = -1,
      bb = -1;
    let wa = -1,
      wb = -1;
    for (let x = 0; x < w; x++) {
      const idx = ys * w + x;
      if (sideBodyMask[idx] === 1) {
        if (ba < 0) ba = x;
        bb = x;
      }
      if (sideWingMask[idx] === 1) {
        if (wa < 0) wa = x;
        wb = x;
      }
    }
    bMinX[ys] = ba;
    bMaxX[ys] = bb;
    wMinX[ys] = wa;
    wMaxX[ys] = wb;
    if (ba >= 0 && sBodyTop < 0) sBodyTop = ys;
  }
  if (sBodyTop < 0) sBodyTop = sTop;

  // Calcular `sSpineX` (el eje vertical Z = 0 en el perfil que corresponde al plano central X-Y del frente)
  // midiendo en el cuello y parte alta del pecho (`0.18 .. 0.38` desde `sBodyTop` hasta `sBot`)
  const neckCenters: number[] = [];
  const HsBody = Math.max(16, sBot - sBodyTop + 1);
  const yNeck0 = Math.max(sBodyTop, Math.round(sBodyTop + HsBody * 0.18));
  const yNeck1 = Math.min(sBot, Math.round(sBodyTop + HsBody * 0.38));
  for (let ys = yNeck0; ys <= yNeck1; ys++) {
    if (bMinX[ys] >= 0) {
      neckCenters.push(0.5 * (bMinX[ys] + bMaxX[ys]));
    }
  }
  neckCenters.sort((a, b) => a - b);
  const sSpineX = neckCenters.length
    ? neckCenters[neckCenters.length >> 1]
    : sideContours
    ? sideContours.sideAxis[Math.round(0.5 * (yNeck0 + yNeck1))]
    : w * 0.5;

  // Encontrar la línea trasera real de la pata trasera (`hindLegRearByRow`) sin confundir nunca el hueco bajo la barriga
  // (entre la pata delantera y la trasera) con el hueco entre la pata trasera y la cola:
  const hindFootSamples: number[] = [];
  for (let ys = Math.round(sTop + Hs * 0.91); ys <= sBot; ys++) {
    if (bMinX[ys] >= 0) {
      hindFootSamples.push(facingRight ? bMinX[ys] : bMaxX[ys]);
    }
  }
  hindFootSamples.sort((a, b) => a - b);
  const hindFootRearX = hindFootSamples.length
    ? hindFootSamples[hindFootSamples.length >> 1]
    : sSpineX + (facingRight ? -refBodyHalf * 1.6 : refBodyHalf * 1.6);

  const hindLegRearByRow = new Float32Array(w).fill(hindFootRearX);
  for (let ys = Math.round(sTop + Hs * 0.48); ys <= sBot; ys++) {
    const runs = rowRuns(sideBodyMask, w, ys);
    let boundaryX = hindFootRearX + (facingRight ? -2.5 : 2.5);
    if (runs.length >= 2) {
      const rearRun = facingRight ? runs[0] : runs[runs.length - 1];
      const nextRun = facingRight ? runs[1] : runs[runs.length - 2];
      const gapMid = facingRight
        ? 0.5 * (rearRun[1] + nextRun[0])
        : 0.5 * (nextRun[1] + rearRun[0]);
      // El hueco entre `rearRun` y `nextRun` es el hueco entre la cola y la pata trasera SOLO si dicho hueco
      // está claramente detrás de `sSpineX` (cerca o detrás de `hindFootRearX`), y NO bajo la barriga!
      const isGapBehindHindLeg = facingRight
        ? gapMid < sSpineX - refBodyHalf * 0.85
        : gapMid > sSpineX + refBodyHalf * 0.85;
      if (isGapBehindHindLeg) {
        boundaryX = gapMid;
      }
    }
    hindLegRearByRow[ys] = boundaryX;
  }
  smooth1D(hindLegRearByRow, Math.round(sTop + Hs * 0.48), sBot, 2);

  // Límites Z de las alas por fila para guiar la curvatura 3D suave de las alas desde el hombro hasta la punta trasera
  const wingFrontS = new Float32Array(w).fill(NaN);
  const wingBackS = new Float32Array(w).fill(NaN);
  if (hasWings) {
    for (let ys = sTop; ys <= sBot; ys++) {
      if (wMinX[ys] >= 0) {
        wingFrontS[ys] = facingRight ? wMaxX[ys] : wMinX[ys];
        wingBackS[ys] = facingRight ? wMinX[ys] : wMaxX[ys];
      }
    }
    fillAndSmoothRowCurve(wingFrontS, sTop, sBot, 4);
    fillAndSmoothRowCurve(wingBackS, sTop, sBot, 4);
  }

  // 4) Configurar la rejilla volumétrica 3D (X, Y, Z) en unidades de texel frontal
  let fMinX = w,
    fMaxX = 0;
  for (let y = fTop; y <= fBot; y++) {
    for (let x = 0; x < w; x++) {
      if (frontMask[y * w + x] === 1 || backMask[y * w + x] === 1) {
        if (x < fMinX) fMinX = x;
        if (x > fMaxX) fMaxX = x;
      }
    }
  }
  let sGlobalMinX = w,
    sGlobalMaxX = 0;
  for (let ys = sTop; ys <= sBot; ys++) {
    if (bMinX[ys] >= 0) {
      if (bMinX[ys] < sGlobalMinX) sGlobalMinX = bMinX[ys];
      if (bMaxX[ys] > sGlobalMaxX) sGlobalMaxX = bMaxX[ys];
    }
    if (wMinX[ys] >= 0) {
      if (wMinX[ys] < sGlobalMinX) sGlobalMinX = wMinX[ys];
      if (wMaxX[ys] > sGlobalMaxX) sGlobalMaxX = wMaxX[ys];
    }
  }

  const scaleSideX = Math.max(0.15, Math.min(3.5, relSideTf.scaleX ?? 1));
  const scaleSideY = Math.max(0.15, Math.min(3.5, relSideTf.scaleY ?? 1));
  const dxSideTex = ((relSideTf.offsetX ?? 0) / 100) * Hf;
  const dySideTex = ((relSideTf.offsetY ?? 0) / 100) * Hf;
  const dzSideTex = (facingRight ? 1 : -1) * dxSideTex;
  const kScaleEff = kScale * scaleSideX;

  const scaleSideLeftX = Math.max(0.15, Math.min(3.5, relSideLeftTf.scaleX ?? 1));
  const scaleSideLeftY = Math.max(0.15, Math.min(3.5, relSideLeftTf.scaleY ?? 1));
  const dxSideLeftTex = ((relSideLeftTf.offsetX ?? 0) / 100) * Hf;
  const dySideLeftTex = ((relSideLeftTf.offsetY ?? 0) / 100) * Hf;
  const dzSideLeftTex = (facingRightLeft ? 1 : -1) * dxSideLeftTex;

  const fMidY = 0.5 * (fTop + fBot);
  const sideMappedTop = fMidY - 0.5 * Hf * scaleSideY + dySideTex;
  const sideMappedBot = fMidY + 0.5 * Hf * scaleSideY + dySideTex;

  const padTex = 4.5;
  const x0Tex = Math.max(0, fMinX - padTex);
  const x1Tex = Math.min(w - 1, fMaxX + padTex);
  const y0Tex = Math.max(0, Math.min(fTop, sideMappedTop) - padTex);
  const y1Tex = Math.min(w - 1, Math.max(fBot, sideMappedBot) + padTex);

  const zMinRaw = (facingRight ? sGlobalMinX - sSpineX : sSpineX - sGlobalMaxX) * kScaleEff + dzSideTex;
  const zMaxRaw = (facingRight ? sGlobalMaxX - sSpineX : sSpineX - sGlobalMinX) * kScaleEff + dzSideTex;
  const z0Tex = Math.min(-refBodyHalf - padTex, zMinRaw - padTex);
  const z1Tex = Math.max(refBodyHalf + padTex, zMaxRaw + padTex);

  const spanX = Math.max(16, x1Tex - x0Tex);
  const spanY = Math.max(16, y1Tex - y0Tex);
  const spanZ = Math.max(16, z1Tex - z0Tex);

  // Suelo de resolución de la rejilla volumétrica. Con menos de ~180 filas los vóxeles son
  // tan gruesos que los huecos estrechos del perfil -el que hay entre la cola colgante y la
  // pata trasera- dejan de resolverse y se rellenan de un bloque macizo. Medido en una hoja
  // de león: con 170 filas la silueta lateral del modelo coincidía un 0,709 con el dibujo, y
  // con 180 un 0,845, sin tocar nada más. El deslizador de filas sigue mandando por encima.
  const userRows = Math.max(200, Math.min(1000, Math.round(options.rows ?? 160)));
  const sideStrength = Math.max(0, Math.min(1, options.sideStrength ?? 1));
  // Perfil único: el volumen del cuerpo se recorta con la silueta del perfil cargado (ver más abajo).
  const clipBodyToProfile = Boolean(options.singleProfile) && Boolean(inputs.sideMask);
  const rowScale = Math.max(0.4, Math.min(5.0, userRows / 160));
  const baseStep = Math.max(
    1.6,
    Math.min(2.25, Math.cbrt((spanX * spanY * spanZ) / 1550000))
  );
  const targetStep = Math.max(0.50, baseStep / Math.pow(rowScale, 0.72));
  const maxN = userRows > 600 ? 360 : userRows > 350 ? 260 : 180;
  const nx = Math.max(36, Math.min(maxN, Math.ceil(spanX / targetStep) + 1));
  const ny = Math.max(48, Math.min(Math.min(420, Math.round(userRows * 0.48) + 30), Math.ceil(spanY / targetStep) + 1));
  const nz = Math.max(36, Math.min(maxN, Math.ceil(spanZ / targetStep) + 1));

  const stepX = spanX / (nx - 1);
  const stepY = spanY / (ny - 1);
  const stepZ = spanZ / (nz - 1);

  const clampedRound = Math.max(0.3, Math.min(2.5, options.freeformSectionRoundness ?? 1.0));
  const pExp =
    clampedRound < 1.0
      ? 2.15 + (1.0 - clampedRound) * 2.5
      : Math.max(1.75, 2.15 - (clampedRound - 1.0) * 0.25);

  const nGrid = nx * ny * nz;
  const vol = new Float32Array(nGrid).fill(-10);

  // Intersección superelíptica con signo:
  // - Positiva en todo el interior donde dA > 0 (Frente/Atrás) y dB > 0 (Perfil), con uA = 0 y uB = 0 en el eje de cada tramo.
  // - Negativa (<= 0) fuera de cualquiera de las siluetas (CORTA LO QUE SOBRA).
  const signedSuperellipse = (dA: number, rA: number, dB: number, rB: number): number => {
    if (dA <= 0 || dB <= 0) return Math.min(dA, dB);
    const effRA = Math.max(1.25, rA, dA);
    const effRB = Math.max(1.25, rB, dB);
    const uA = Math.max(0, 1 - dA / effRA);
    const uB = Math.max(0, 1 - dB / effRB);
    const norm = Math.pow(Math.pow(uA, pExp) + Math.pow(uB, pExp), 1 / pExp);
    const rEff = Math.min(effRA, effRB);
    return (1 - norm) * rEff;
  };

  // Función que mapea la coordenada vertical `ty` del cuerpo frontal `[fCoreTop .. fBot]`
  // a la coordenada vertical exacta `syBody` del cuerpo en el perfil `[sBodyTop .. sBot]`,
  // aplicando además el desplazamiento vertical `dySideTex` y la escala `scaleSideY` de la foto de perfil.
  const mapTyToSyBody = (tyVal: number): number => {
    const tyRel = fMidY + (tyVal - dySideTex - fMidY) / scaleSideY;
    if (tyRel >= fCoreTop) {
      const uB = (tyRel - fCoreTop) / Math.max(1, fBot - fCoreTop);
      return sBodyTop + uB * (sBot - sBodyTop);
    }
    const uAbove = (tyRel - fTop) / Math.max(1, fCoreTop - fTop);
    return sTop + uAbove * (sBodyTop - sTop);
  };

  // Evaluar el campo volumétrico 3D combinando FRENTE, ATRÁS y PERFIL
  for (let iy = 1; iy < ny - 1; iy++) {
    const ty = y0Tex + iy * stepY;
    const tyForSide = fMidY + (ty - dySideTex - fMidY) / scaleSideY;
    const tYSide = Math.max(0, Math.min(1, (tyForSide - fTop) / Math.max(1, Hf - 1)));
    const uBody = (tyForSide - fCoreTop) / Math.max(1, fBot - fCoreTop);
    const syWing = sTop + tYSide * (Hs - 1);
    const syWingClamped = Math.max(sTop, Math.min(sBot, Math.round(syWing)));
    const syBody = mapTyToSyBody(ty);
    const syBodyClamped = Math.max(sTop, Math.min(sBot, Math.round(syBody)));
    const tyClamped = Math.max(fTop, Math.min(fBot, Math.round(ty)));

    const fCoreHalf = fCoreHalfByRow[tyClamped];
    const tailRearLimitS = hindLegRearByRow[syBodyClamped];

    const wFrontS = wingFrontS[syWingClamped];
    const wBackS = wingBackS[syWingClamped];

    // Anclar la raíz del ala (`uWing = 0`) directamente en el centro del cuerpo (`rowBodyMidS`)
    // para que el ala SIEMPRE nazca profundamente dentro del volumen 3D del torso/hombros.
    const rowBodyMidS =
      bMinX[syBodyClamped] >= 0
        ? 0.5 * (bMinX[syBodyClamped] + bMaxX[syBodyClamped])
        : Number.isFinite(wFrontS)
        ? 0.5 * (wFrontS + sSpineX)
        : sSpineX;
    const sxWingRootRow = rowBodyMidS;

    for (let iz = 1; iz < nz - 1; iz++) {
      const zTex = z0Tex + iz * stepZ;
      const sx = sSpineX + (facingRight ? 1 : -1) * ((zTex - dzSideTex) / kScaleEff);

      const outOfSideY = syBody < sTop - 1.5 || syBody > sBot + 1.5;
      const dSideProfile = outOfSideY ? -10 : sample(sBodyDist, w, sx, syBody) * kScaleEff;
      const rSideProfile = Math.max(
        outOfSideY ? 1.35 : sample(sBodyRad, w, sx, syBody) * kScaleEff,
        dSideProfile,
        1.35
      );

      // Peso suave entre Frente (zTex > 0 -> fbBlend = 0) y Atrás (zTex < 0 -> fbBlend = 1)
      const fbBlend = Math.max(0, Math.min(1, 0.5 - zTex / Math.max(4.5, refBodyHalf * 0.85)));

      // ¿Estamos en la cola libre detrás del límite trasero de las patas traseras (`tailRearLimitS`)?
      const backPastHindLeg = (facingRight ? tailRearLimitS - sx : sx - tailRearLimitS) * kScaleEff;
      const tailBlend =
        !outOfSideY && uBody >= 0.44
          ? Math.max(0, Math.min(1, (backPastHindLeg + 1.0) / Math.max(4.0, refBodyHalf * 0.50))) * sideStrength
          : 0;

      // ¿Estamos en la punta del hocico proyectado hacia delante (+Z) debajo de los cuernos (0.14 <= uBody < 0.25)?
      const snoutBlend =
        !outOfSideY && uBody >= 0.14 && uBody < 0.25
          ? Math.max(0, Math.min(1, (zTex - dzSideTex - refBodyHalf * 0.65) / Math.max(3.5, refBodyHalf * 0.65))) * sideStrength
          : 0;

      const sxRound = Math.max(0, Math.min(w - 1, Math.round(sx)));
      const sOff = sLayerPrimary ? sLayerPrimary.offset[syBodyClamped * w + sxRound] : NaN;
      const isProfileSpike = isSpikesOff(sOff);

      for (let ix = 1; ix < nx - 1; ix++) {
        const tx = x0Tex + ix * stepX;
        const dxAxis = Math.abs(tx - fAxisX);
        let valBody = -10;

        // En la zona de las patas (por debajo de la entrepierna `crotchStartT`), usar `fLegsDist`/`bLegsDist`
        // que ya son idénticos a `fCoreDist`/`bCoreDist` arriba y tienen el hueco entre las patas limpio abajo.
        const dF = sample(fLegsDist, w, tx, ty);
        const rF = Math.max(sample(fLegsRad, w, tx, ty), dF, 1.5);
        const dB = sample(bLegsDist, w, tx, ty);
        const rB = Math.max(sample(bLegsRad, w, tx, ty), dB, 1.5);

        // Combinar Frente y Atrás: en +Z manda el Frente, en -Z manda el Atrás, y en la unión central (zTex ~ 0)
        // evitamos que una pequeña diferencia de 1-2 px entre los dibujos de Frente y Atrás pellizque el contorno.
        const dCoreFB = Math.max(
          lerp(dF, dB, fbBlend),
          Math.min(dF, dB)
        );
        const rCoreFB = Math.max(lerp(rF, rB, fbBlend), dCoreFB, 1.5);

        // Barra gradual de importancia del perfil (`sideStrength` 0..1):
        // En 0% usa el grosor redondo estimado solo desde el frente (`dSide0`), y hacia 100% converge
        // continuamente a la silueta lateral exacta del perfil en el plano ZY (`dSideProfile`).
        const rSide0 = Math.max(1.5, rCoreFB * 0.85);
        const dSide0 = dCoreFB > 0 ? rSide0 - Math.abs(zTex) : -10;
        const dSide = lerp(dSide0, dSideProfile, sideStrength);
        const rSide = Math.max(1.35, lerp(rSide0, rSideProfile, sideStrength));

        if (dSide > -2.5) {
          let dX = -10;
          let rX = rCoreFB;

          if (isProfileSpike && tailBlend > 0.35) {
            // Púas dorsales a lo largo de la cola trasera
            rX = Math.max(1.5, Math.min(3.0, rSide * 0.78));
            dX = rX - dxAxis;
          } else if (tailBlend > 0.01) {
            // Cola trasera en -Z (detrás de las patas traseras):
            // Sección tubular centrada en `fAxisX` cuyo radio sale del grosor vertical de la cola en el Perfil (`rSide`),
            // fundiéndose suavemente con la pelvis/cadera en la raíz de la cola (`tailBlend` 0 -> 1).
            const rTailX = Math.max(1.6, rSide * 0.90);
            const dTailX = rTailX - dxAxis;
            dX = lerp(dCoreFB, dTailX, tailBlend);
            rX = Math.max(1.5, lerp(rCoreFB, rTailX, tailBlend));
          } else if (snoutBlend > 0.01) {
            // Hocico delantero en +Z: se estrecha suavemente hacia la punta del morro sin salirse nunca de la silueta frontal
            const rSnoutX = Math.min(fCoreHalf, Math.max(3.2, rSide * 1.15));
            const dSnoutX = rSnoutX - dxAxis;
            dX = Math.min(dCoreFB, lerp(dCoreFB, dSnoutX, snoutBlend));
            rX = Math.max(1.5, Math.min(rCoreFB, lerp(rCoreFB, rSnoutX, snoutBlend)));
          } else {
            dX = dCoreFB;
            rX = rCoreFB;
          }

          valBody = signedSuperellipse(dX, rX, dSide, rSide);
          // Perfil único: nada del cuerpo puede quedar fuera de la silueta de perfil. La superelipse
          // deja un margen blando que sobresale por el lomo; aquí se intersecta con el perfil.
          if (clipBodyToProfile) valBody = Math.min(valBody, dSide);
        }

        // B) Alas 3D desplegadas en ±X:
        //    Superficie 3D continua y sin saltos entre los nervios/dedos del ala y la membrana azul:
        //    - El contorno exterior (arcos inferiores, puntas de garras y ventana vacía junto al cuello) lo talla `dWingXY` (Frente/Atrás).
        //    - La curvatura anteroposterior `zWingTarget` barre suavemente desde la raíz del hombro en el torso (`sxWingRootRow`) hasta `wBackS`.
        let valWing = -10;
        if (hasWings) {
          const dWingXY = sample(fWingDist, w, tx, ty);
          if (dWingXY > -2.0 && Number.isFinite(wFrontS) && Number.isFinite(wBackS)) {
            const wingSpanX = Math.max(8, maxWingHalfSpan - refBodyHalf * 0.55);
            const uWing = Math.max(0, Math.min(1, (dxAxis - refBodyHalf * 0.55) / wingSpanX));
            // Función 100% continua de uWing (sin saltos entre nervios verdes y membrana azul para que NUNCA se abran grietas en Z)
            const sweepT = Math.min(1, Math.pow(uWing, 0.85) * 0.85);
            const sxWingTarget = lerp(sxWingRootRow, wBackS, sweepT);
            const zWingTarget =
              ((facingRight ? sxWingTarget - sSpineX : sSpineX - sxWingTarget) * kScaleEff + dzSideTex) * sideStrength;

            const fOff = inputs.frontLayer
              ? inputs.frontLayer.offset[tyClamped * w + Math.max(0, Math.min(w - 1, Math.round(tx)))]
              : NaN;
            const isWingMembrane = isClothOff(fOff);
            const wingHalfThick = Math.max(
              isWingMembrane ? 2.85 : 3.65,
              stepZ * (isWingMembrane ? 1.55 : 1.85)
            );
            const dWingZ = wingHalfThick - Math.abs(zTex - zWingTarget);
            const rWingXY = Math.max(sample(fWingRad, w, tx, ty), dWingXY, 2.2);
            valWing = signedSuperellipse(dWingXY, rWingXY, dWingZ, wingHalfThick);
          }
        }

        // Unión suave en la raíz del hombro/espalda donde el ala se suelda al torso
        let vFinal: number;
        if (valBody > -3.0 && valWing > -3.0 && uBody >= 0.08 && uBody <= 0.74 && dxAxis <= refBodyHalf * 1.75) {
          const kSmooth = 2.8;
          const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (valWing - valBody)) / kSmooth));
          vFinal = lerp(valBody, valWing, h) + kSmooth * h * (1 - h);
        } else {
          vFinal = Math.max(valBody, valWing);
        }

        vol[(iy * nz + iz) * nx + ix] = vFinal;
      }
    }
  }

  // 4c) TERCER PLANO ORTOGRÁFICO: intersección del volumen con la VISTA SUPERIOR (`topMask`).
  //
  //     Frente y perfil miden AMBOS en función de la altura: el frente da ancho(Y) y el perfil
  //     profundidad(Y). En un bípedo basta, porque cada franja de altura es una sola parte del
  //     cuerpo (cabeza, hombros, cintura, piernas). En un cuadrúpedo se rompe: a la altura de la
  //     barriga el perfil contiene hocico + cuello + torso + cadera + cola a la vez y el frente
  //     solo aporta UN ancho para toda esa franja, así que el morro sale tan ancho como el pecho,
  //     la cola tan gruesa como el torso y las cuatro patas se funden en una losa.
  //
  //     La vista superior aporta la dimensión que falta, ancho(Z): hocico estrecho -> cuello ->
  //     hombros anchos -> cintura -> caderas -> cola que se afila, y la separación real entre la
  //     pata izquierda y la derecha. Aquí se aplica como una INTERSECCIÓN pura (solo talla, nunca
  //     añade volumen), que es justo la definición de casco visual de tres planos.
  const topMaskIn = inputs.topMask ?? null;
  const topStrength = Math.max(0, Math.min(1, options.topStrength ?? 1));
  let topViewApplied = false;
  if (topMaskIn && topStrength > 0.001) {
    // a) Caja de la silueta cenital y eje largo (longitud del cuerpo) vs eje corto (anchura).
    let tpX0 = w, tpX1 = -1, tpY0 = w, tpY1 = -1;
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        if (topMaskIn[y * w + x] === 1) {
          if (x < tpX0) tpX0 = x;
          if (x > tpX1) tpX1 = x;
          if (y < tpY0) tpY0 = y;
          if (y > tpY1) tpY1 = y;
        }
      }
    }
    const tpW = tpX1 - tpX0 + 1;
    const tpH = tpY1 - tpY0 + 1;
    if (tpX1 >= 0 && tpW >= 8 && tpH >= 8) {
      const longHorizontal = tpW >= tpH;
      const lenSpan = Math.max(8, longHorizontal ? tpW : tpH);
      const lenStart = longHorizontal ? tpX0 : tpY0;

      // b) Por cada corte perpendicular al eje largo: semianchura y centro de la silueta cenital.
      //    Se toma el casco (mín..máx) del corte, no cada tramo suelto, para que el hueco entre las
      //    dos patas de un mismo corte no talle el cuerpo que hay por encima.
      const topHalf = new Float32Array(lenSpan);
      const topCent = new Float32Array(lenSpan);
      const topHas = new Uint8Array(lenSpan);
      for (let u = 0; u < lenSpan; u++) {
        const a = lenStart + u;
        let lo = w, hi = -1;
        if (longHorizontal) {
          for (let y = tpY0; y <= tpY1; y++) {
            if (topMaskIn[y * w + a] === 1) {
              if (y < lo) lo = y;
              if (y > hi) hi = y;
            }
          }
        } else {
          const row = a * w;
          for (let x = tpX0; x <= tpX1; x++) {
            if (topMaskIn[row + x] === 1) {
              if (x < lo) lo = x;
              if (x > hi) hi = x;
            }
          }
        }
        if (hi >= lo) {
          topHalf[u] = 0.5 * (hi - lo + 1);
          topCent[u] = 0.5 * (lo + hi);
          topHas[u] = 1;
        }
      }
      // Rellenar cortes vacíos (anti-aliasing, huecos del dibujo) con el vecino válido más cercano.
      for (let u = 1; u < lenSpan; u++) {
        if (!topHas[u] && topHas[u - 1]) {
          topHalf[u] = topHalf[u - 1];
          topCent[u] = topCent[u - 1];
          topHas[u] = 1;
        }
      }
      for (let u = lenSpan - 2; u >= 0; u--) {
        if (!topHas[u] && topHas[u + 1]) {
          topHalf[u] = topHalf[u + 1];
          topCent[u] = topCent[u + 1];
          topHas[u] = 1;
        }
      }
      smooth1D(topHalf, 0, lenSpan - 1, 2);
      smooth1D(topCent, 0, lenSpan - 1, 2);

      // c) ¿Qué extremo del eje largo es la CABEZA? El perfil lateral ya sabe hacia dónde mira
      //    (`facingRight`), y su grosor vertical a lo largo de Z es fino en el hocico, grueso en el
      //    torso y muy fino en la cola. Se correlaciona ese perfil con la anchura cenital en los dos
      //    sentidos y gana el que menos error cuadrático da. `topOrientation` permite forzarlo.
      const BINS = 48;
      const resample = (src: Float32Array, reversed: boolean): Float32Array => {
        const out = new Float32Array(BINS);
        for (let b = 0; b < BINS; b++) {
          const t = b / (BINS - 1);
          const idx = (reversed ? 1 - t : t) * (src.length - 1);
          const i0 = Math.max(0, Math.min(src.length - 1, Math.floor(idx)));
          const i1 = Math.max(0, Math.min(src.length - 1, i0 + 1));
          out[b] = lerp(src[i0], src[i1], idx - i0);
        }
        let mx = 0;
        for (let b = 0; b < BINS; b++) if (out[b] > mx) mx = out[b];
        if (mx > 1e-5) for (let b = 0; b < BINS; b++) out[b] /= mx;
        return out;
      };

      // Grosor vertical del perfil lateral por columna, ya normalizado a "0 = cola, 1 = cabeza".
      const sideThick = new Float32Array(BINS);
      {
        const span = Math.max(1, sGlobalMaxX - sGlobalMinX);
        for (let sx = sGlobalMinX; sx <= sGlobalMaxX; sx++) {
          let yA = -1;
          let yB = -1;
          for (let sy = sTop; sy <= sBot; sy++) {
            if (sMaskPrimary[sy * w + sx] === 1) {
              if (yA < 0) yA = sy;
              yB = sy;
            }
          }
          if (yA < 0) continue;
          const tHead = facingRight ? (sx - sGlobalMinX) / span : (sGlobalMaxX - sx) / span;
          const b = Math.max(0, Math.min(BINS - 1, Math.round(tHead * (BINS - 1))));
          const th = yB - yA + 1;
          if (th > sideThick[b]) sideThick[b] = th;
        }
        for (let b = 1; b < BINS; b++) if (sideThick[b] === 0) sideThick[b] = sideThick[b - 1];
        for (let b = BINS - 2; b >= 0; b--) if (sideThick[b] === 0) sideThick[b] = sideThick[b + 1];
        let mx = 0;
        for (let b = 0; b < BINS; b++) if (sideThick[b] > mx) mx = sideThick[b];
        if (mx > 1e-5) for (let b = 0; b < BINS; b++) sideThick[b] /= mx;
      }

      // El error se pondera hacia los extremos (`|2t-1|`): el centro del cuerpo es parecido mire
      // hacia donde mire, y lo que distingue cabeza de cola está justo en las puntas.
      const ssd = (a: Float32Array, b: Float32Array): number => {
        let acc = 0;
        for (let i = 0; i < BINS; i++) {
          const t = i / (BINS - 1);
          const wgt = Math.pow(Math.abs(2 * t - 1), 1.5);
          const d = a[i] - b[i];
          acc += wgt * d * d;
        }
        return acc;
      };
      // headAtEnd = true -> la cabeza está en el extremo FINAL del eje largo (x máx / y máx).
      const errHeadAtEnd = ssd(resample(topHalf, false), sideThick);
      const errHeadAtStart = ssd(resample(topHalf, true), sideThick);

      // Señal principal: la punta de la cola es más fina que el hocico, casi sin excepción.
      // Solo se usa cuando la diferencia entre las dos puntas es clara; si no, decide el error.
      const tipMean = (fromEnd: boolean): number => {
        const n = Math.max(2, Math.round(lenSpan * 0.06));
        let acc = 0;
        for (let k = 0; k < n; k++) acc += topHalf[fromEnd ? lenSpan - 1 - k : k];
        return acc / n;
      };
      const tipStart = tipMean(false);
      const tipEnd = tipMean(true);
      const tipRatio = Math.max(tipStart, tipEnd) / Math.max(1e-3, Math.min(tipStart, tipEnd));

      const orientation = options.topOrientation ?? 'auto';
      const headAtEnd =
        orientation === 'head-first'
          ? false
          : orientation === 'tail-first'
          ? true
          : tipRatio > 1.5
          ? tipEnd > tipStart
          : errHeadAtEnd <= errHeadAtStart;

      // d) Escala. La vista superior y el perfil miden la MISMA longitud de cuerpo (hocico->cola),
      //    así que la escala sale de la longitud y se respeta la proporción con la que está dibujada.
      //    Si aun así la anchura resultante se desvía más de un tercio de la del frente, se recalibra
      //    (dibujo mal proporcionado) en vez de deformar todo el bicho.
      const zSpan = Math.max(4, zMaxRaw - zMinRaw);
      let xScale = zSpan / lenSpan;
      let topHalfMax = 0;
      for (let u = 0; u < lenSpan; u++) if (topHalf[u] > topHalfMax) topHalfMax = topHalf[u];
      const frontHalfMax = Math.max(4, Math.max(fAxisX - fMinX, fMaxX - fAxisX));
      const widthRatio = (topHalfMax * xScale) / frontHalfMax;
      if (widthRatio > 1e-3 && (widthRatio < 0.75 || widthRatio > 1.33)) {
        xScale *= 1 / widthRatio;
      }

      // e) Tallado: por cada vóxel, su Z dice en qué corte cenital cae y ese corte limita su X.
      const kSmooth = Math.max(1.0, stepX * 1.35);
      // Suelo de media anchura: al menos un vóxel de ancho. Si se deja tallar por
      // debajo de eso, una cola o un cuerno finos se parten en trozos sueltos
      // porque la rejilla ya no puede representarlos.
      const minHalfTex = Math.max(1.25, stepX * 1.05);
      for (let iz = 1; iz < nz - 1; iz++) {
        const zTex = z0Tex + iz * stepZ;
        // zMaxRaw = cabeza (el perfil siempre deja la cabeza en +Z), zMinRaw = cola.
        const tHead = Math.max(0, Math.min(1, (zTex - zMinRaw) / zSpan));
        const uf = (headAtEnd ? tHead : 1 - tHead) * (lenSpan - 1);
        const u0 = Math.max(0, Math.min(lenSpan - 1, Math.floor(uf)));
        const u1 = Math.max(0, Math.min(lenSpan - 1, u0 + 1));
        const ut = uf - u0;
        const halfTex = Math.max(minHalfTex, lerp(topHalf[u0], topHalf[u1], ut) * xScale);
        const centTop = lerp(topCent[u0], topCent[u1], ut);
        const centTex = fAxisX + (centTop - 0.5 * (longHorizontal ? tpY0 + tpY1 : tpX0 + tpX1)) * xScale;
        for (let ix = 1; ix < nx - 1; ix++) {
          const tx = x0Tex + ix * stepX;
          const dC = halfTex - Math.abs(tx - centTex);
          for (let iy = 1; iy < ny - 1; iy++) {
            const vi = (iy * nz + iz) * nx + ix;
            const cur = vol[vi];
            if (cur <= dC - kSmooth) continue; // el frente/perfil ya corta más que la cenital
            // Mínimo suave (intersección redondeada) y mezcla según `topStrength`.
            const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (cur - dC)) / kSmooth));
            const inter = lerp(cur, dC, h) - kSmooth * h * (1 - h);
            vol[vi] = lerp(cur, inter, topStrength);
          }
        }
      }
      topViewApplied = true;
    }
  }
  if (topMaskIn && !topViewApplied) {
    // La vista superior venía vacía o demasiado pequeña: se construye solo con frente y perfil.
  }

  // 5) Mantener la componente conexa principal y cualquier pieza sustancial (>= 150 vóxeles)
  //    eliminando únicamente motas flotantes diminutas (< 150 vóxeles), y rellenar cualquier cavidad interna.
  {
    const visited = new Uint8Array(nGrid);
    const keepVox = new Uint8Array(nGrid);
    const queue = new Int32Array(nGrid);
    let bestCompStart = -1;
    let bestSize = 0;

    for (let i = 0; i < nGrid; i++) {
      if (vol[i] < 0 || visited[i]) continue;
      let qh = 0;
      let qt = 0;
      visited[i] = 1;
      queue[qt++] = i;
      while (qh < qt) {
        const curr = queue[qh++];
        const ix = curr % nx;
        const tmp = (curr / nx) | 0;
        const iz = tmp % nz;
        const iy = (tmp / nz) | 0;

        if (ix > 0) {
          const n = curr - 1;
          if (!visited[n] && vol[n] >= 0) {
            visited[n] = 1;
            queue[qt++] = n;
          }
        }
        if (ix < nx - 1) {
          const n = curr + 1;
          if (!visited[n] && vol[n] >= 0) {
            visited[n] = 1;
            queue[qt++] = n;
          }
        }
        if (iz > 0) {
          const n = curr - nx;
          if (!visited[n] && vol[n] >= 0) {
            visited[n] = 1;
            queue[qt++] = n;
          }
        }
        if (iz < nz - 1) {
          const n = curr + nx;
          if (!visited[n] && vol[n] >= 0) {
            visited[n] = 1;
            queue[qt++] = n;
          }
        }
        if (iy > 0) {
          const n = curr - nx * nz;
          if (!visited[n] && vol[n] >= 0) {
            visited[n] = 1;
            queue[qt++] = n;
          }
        }
        if (iy < ny - 1) {
          const n = curr + nx * nz;
          if (!visited[n] && vol[n] >= 0) {
            visited[n] = 1;
            queue[qt++] = n;
          }
        }
      }
      if (qt >= 150) {
        for (let k = 0; k < qt; k++) keepVox[queue[k]] = 1;
      }
      if (qt > bestSize) {
        bestSize = qt;
        bestCompStart = i;
      }
    }

    if (bestCompStart >= 0) {
      let qh = 0;
      let qt = 0;
      if (bestSize < 150) {
        visited.fill(0);
        visited[bestCompStart] = 1;
        queue[qt++] = bestCompStart;
        while (qh < qt) {
          const curr = queue[qh++];
          keepVox[curr] = 1;
          const ix = curr % nx;
          const tmp = (curr / nx) | 0;
          const iz = tmp % nz;
          const iy = (tmp / nz) | 0;
          for (const n of [
            ix > 0 ? curr - 1 : -1,
            ix < nx - 1 ? curr + 1 : -1,
            iz > 0 ? curr - nx : -1,
            iz < nz - 1 ? curr + nx : -1,
            iy > 0 ? curr - nx * nz : -1,
            iy < ny - 1 ? curr + nx * nz : -1,
          ]) {
            if (n >= 0 && !visited[n] && vol[n] >= 0) {
              visited[n] = 1;
              queue[qt++] = n;
            }
          }
        }
      }
      for (let i = 0; i < nGrid; i++) {
        if (vol[i] >= 0 && !keepVox[i]) vol[i] = -0.5;
      }

      // Inundar el exterior negativo desde el borde (0, 0, 0) para rellenar cualquier burbuja o poro interno encerrado
      visited.fill(0);
      qh = 0;
      qt = 0;
      visited[0] = 1;
      queue[qt++] = 0;
      while (qh < qt) {
        const curr = queue[qh++];
        const ix = curr % nx;
        const tmp = (curr / nx) | 0;
        const iz = tmp % nz;
        const iy = (tmp / nz) | 0;
        for (const n of [
          ix > 0 ? curr - 1 : -1,
          ix < nx - 1 ? curr + 1 : -1,
          iz > 0 ? curr - nx : -1,
          iz < nz - 1 ? curr + nx : -1,
          iy > 0 ? curr - nx * nz : -1,
          iy < ny - 1 ? curr + nx * nz : -1,
        ]) {
          if (n >= 0 && !visited[n] && vol[n] < 0) {
            visited[n] = 1;
            queue[qt++] = n;
          }
        }
      }
      for (let i = 0; i < nGrid; i++) {
        if (vol[i] < 0 && !visited[i]) vol[i] = 0.5;
      }
    }
  }

  // 6) Extracción de superficie isocontorno 3D cerrada (2-manifold sin bordes abiertos) mediante Surface Nets
  const cxCells = nx - 1;
  const cyCells = ny - 1;
  const czCells = nz - 1;
  const cellVert = new Int32Array(cxCells * cyCells * czCells).fill(-1);

  const maxBaseVerts = Math.min(inputs.maxVertices ?? 600000, 600000);
  const baseX = new Float32Array(maxBaseVerts);
  const baseY = new Float32Array(maxBaseVerts);
  const baseZ = new Float32Array(maxBaseVerts);
  let nBaseVerts = 0;

  const cubeEdges: ReadonlyArray<[number, number, number, number, number, number]> = [
    [0, 0, 0, 1, 0, 0],
    [0, 1, 0, 1, 1, 0],
    [0, 0, 1, 1, 0, 1],
    [0, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1, 0],
    [1, 0, 0, 1, 1, 0],
    [0, 0, 1, 0, 1, 1],
    [1, 0, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 1],
    [1, 0, 0, 1, 0, 1],
    [0, 1, 0, 0, 1, 1],
    [1, 1, 0, 1, 1, 1],
  ];

  const vIdx = (ix: number, iy: number, iz: number) => (iy * nz + iz) * nx + ix;
  const cIdx = (ix: number, iy: number, iz: number) => (iy * czCells + iz) * cxCells + ix;

  for (let iy = 0; iy < cyCells; iy++) {
    for (let iz = 0; iz < czCells; iz++) {
      for (let ix = 0; ix < cxCells; ix++) {
        let maskBits = 0;
        let bit = 1;
        for (let dy = 0; dy <= 1; dy++) {
          for (let dz = 0; dz <= 1; dz++) {
            for (let dx = 0; dx <= 1; dx++) {
              if (vol[vIdx(ix + dx, iy + dy, iz + dz)] >= 0) maskBits |= bit;
              bit <<= 1;
            }
          }
        }
        if (maskBits === 0 || maskBits === 255) continue;
        if (nBaseVerts >= maxBaseVerts) break;

        let sumX = 0,
          sumY = 0,
          sumZ = 0,
          crossCount = 0;
        for (let e = 0; e < 12; e++) {
          const [x0, y0, z0, x1, y1, z1] = cubeEdges[e];
          const v0 = vol[vIdx(ix + x0, iy + y0, iz + z0)];
          const v1 = vol[vIdx(ix + x1, iy + y1, iz + z1)];
          if ((v0 >= 0) === (v1 >= 0)) continue;
          const t = v0 / (v0 - v1);
          sumX += ix + x0 + t * (x1 - x0);
          sumY += iy + y0 + t * (y1 - y0);
          sumZ += iz + z0 + t * (z1 - z0);
          crossCount++;
        }
        const inv = crossCount > 0 ? 1 / crossCount : 0.5;
        const vid = nBaseVerts++;
        cellVert[cIdx(ix, iy, iz)] = vid;
        baseX[vid] = x0Tex + (crossCount > 0 ? sumX * inv : ix + 0.5) * stepX;
        baseY[vid] = y0Tex + (crossCount > 0 ? sumY * inv : iy + 0.5) * stepY;
        baseZ[vid] = z0Tex + (crossCount > 0 ? sumZ * inv : iz + 0.5) * stepZ;
      }
    }
  }

  if (nBaseVerts < 12) {
    geometry.setIndex([]);
    return { vertexCount: 0, triangleCount: 0, landmarks };
  }

  // Emitir caras (2 triángulos por cada arista interior con cambio de signo)
  const triBuf: number[] = [];
  const emitQuad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) {
      triBuf.push(a, c, b, a, d, c);
    } else {
      triBuf.push(a, b, c, a, c, d);
    }
  };

  for (let iy = 1; iy < cyCells; iy++) {
    for (let iz = 1; iz < czCells; iz++) {
      for (let ix = 1; ix < cxCells; ix++) {
        const v0 = vol[vIdx(ix, iy, iz)];
        const s0 = v0 >= 0;

        // Arista +X: (ix, iy, iz) -> (ix + 1, iy, iz)
        const sx = vol[vIdx(ix + 1, iy, iz)] >= 0;
        if (s0 !== sx) {
          emitQuad(
            cellVert[cIdx(ix, iy - 1, iz - 1)],
            cellVert[cIdx(ix, iy, iz - 1)],
            cellVert[cIdx(ix, iy, iz)],
            cellVert[cIdx(ix, iy - 1, iz)],
            !s0
          );
        }

        // Arista +Y: (ix, iy, iz) -> (ix, iy + 1, iz)
        const sySign = vol[vIdx(ix, iy + 1, iz)] >= 0;
        if (s0 !== sySign) {
          emitQuad(
            cellVert[cIdx(ix - 1, iy, iz - 1)],
            cellVert[cIdx(ix - 1, iy, iz)],
            cellVert[cIdx(ix, iy, iz)],
            cellVert[cIdx(ix, iy, iz - 1)],
            !s0
          );
        }

        // Arista +Z: (ix, iy, iz) -> (ix, iy, iz + 1)
        const sz = vol[vIdx(ix, iy, iz + 1)] >= 0;
        if (s0 !== sz) {
          emitQuad(
            cellVert[cIdx(ix - 1, iy - 1, iz)],
            cellVert[cIdx(ix, iy - 1, iz)],
            cellVert[cIdx(ix, iy, iz)],
            cellVert[cIdx(ix - 1, iy, iz)],
            !s0
          );
        }
      }
    }
  }

  const nTris = (triBuf.length / 3) | 0;
  if (nTris === 0) {
    geometry.setIndex([]);
    return { vertexCount: 0, triangleCount: 0, landmarks };
  }

  // 7) Suavizado sin encogimiento (Taubin λ/μ) en el espacio de texels
  {
    const sumX = new Float32Array(nBaseVerts);
    const sumY = new Float32Array(nBaseVerts);
    const sumZ = new Float32Array(nBaseVerts);
    const deg = new Uint16Array(nBaseVerts);

    for (let pass = 0; pass < 8; pass++) {
      const weight = pass % 2 === 0 ? 0.46 : -0.49;
      sumX.fill(0);
      sumY.fill(0);
      sumZ.fill(0);
      deg.fill(0);

      for (let t = 0; t < triBuf.length; t += 3) {
        const a = triBuf[t];
        const b = triBuf[t + 1];
        const c = triBuf[t + 2];
        sumX[a] += baseX[b] + baseX[c];
        sumY[a] += baseY[b] + baseY[c];
        sumZ[a] += baseZ[b] + baseZ[c];
        deg[a] += 2;

        sumX[b] += baseX[a] + baseX[c];
        sumY[b] += baseY[a] + baseY[c];
        sumZ[b] += baseZ[a] + baseZ[c];
        deg[b] += 2;

        sumX[c] += baseX[a] + baseX[b];
        sumY[c] += baseY[a] + baseY[b];
        sumZ[c] += baseZ[a] + baseZ[b];
        deg[c] += 2;
      }

      for (let v = 0; v < nBaseVerts; v++) {
        const d = deg[v];
        if (d === 0) continue;
        baseX[v] += weight * (sumX[v] / d - baseX[v]);
        baseY[v] += weight * (sumY[v] / d - baseY[v]);
        baseZ[v] += weight * (sumZ[v] / d - baseZ[v]);
      }
    }
  }

  // 8) Convertir a coordenadas de escena 3D, calcular normales suaves y aplicar relieve fotográfico/capas
  const texelWorld = WORLD_SPAN / (w - 1);
  const zWorldScale = texelWorld * Math.max(0.2, options.depthScale ?? 0.6);
  const baseWX = new Float32Array(nBaseVerts);
  const baseWY = new Float32Array(nBaseVerts);
  const baseWZ = new Float32Array(nBaseVerts);
  const baseNX = new Float32Array(nBaseVerts);
  const baseNY = new Float32Array(nBaseVerts);
  const baseNZ = new Float32Array(nBaseVerts);

  const frontTfForWorld = options.photoTransforms?.front;
  const frontAspectX = Math.max(
    0.35,
    Math.min(
      2.8,
      (frontTfForWorld?.scaleX ?? 1) / Math.max(0.2, frontTfForWorld?.scaleY ?? 1)
    )
  );
  for (let v = 0; v < nBaseVerts; v++) {
    baseWX[v] = (baseX[v] / (w - 1) - 0.5) * WORLD_SPAN * frontAspectX;
    baseWY[v] = (0.5 - baseY[v] / (w - 1)) * WORLD_SPAN;
    baseWZ[v] = baseZ[v] * zWorldScale;
  }

  const computeBaseNormals = () => {
    baseNX.fill(0);
    baseNY.fill(0);
    baseNZ.fill(0);
    for (let t = 0; t < triBuf.length; t += 3) {
      const a = triBuf[t];
      const b = triBuf[t + 1];
      const c = triBuf[t + 2];
      // Nota: al invertir el sentido de Y (de texel hacia abajo a world hacia arriba), la orientación se invierte,
      // por lo que la normal exterior viene dada por (c - a) x (b - a).
      const e1x = baseWX[c] - baseWX[a];
      const e1y = baseWY[c] - baseWY[a];
      const e1z = baseWZ[c] - baseWZ[a];
      const e2x = baseWX[b] - baseWX[a];
      const e2y = baseWY[b] - baseWY[a];
      const e2z = baseWZ[b] - baseWZ[a];
      const fnx = e1y * e2z - e1z * e2y;
      const fny = e1z * e2x - e1x * e2z;
      const fnz = e1x * e2y - e1y * e2x;
      baseNX[a] += fnx;
      baseNY[a] += fny;
      baseNZ[a] += fnz;
      baseNX[b] += fnx;
      baseNY[b] += fny;
      baseNZ[b] += fnz;
      baseNX[c] += fnx;
      baseNY[c] += fny;
      baseNZ[c] += fnz;
    }
    for (let v = 0; v < nBaseVerts; v++) {
      const len = Math.hypot(baseNX[v], baseNY[v], baseNZ[v]) || 1;
      baseNX[v] /= len;
      baseNY[v] /= len;
      baseNZ[v] /= len;
    }
  };

  computeBaseNormals();

  // Desplazamiento de relieve local (foto + mapa de capas) a lo largo de la normal 3D de cada vértice
  const reliefGain =
    (0.55 * Math.max(0, Math.min(1, options.reliefAmount ?? 0)) +
      0.35 * Math.max(0, Math.min(2, options.freeformPhotoVolume ?? 1))) *
    texelWorld *
    2.2;
  const layerGain = 0.0065 * Hf * Math.max(0, options.layerStrength ?? 1) * texelWorld;

  if (reliefGain > 1e-4 || layerGain > 1e-4) {
    for (let v = 0; v < nBaseVerts; v++) {
      const tx = baseX[v];
      const ty = baseY[v];
      const zTex = baseZ[v];
      const sy = mapTyToSyBody(ty);
      const sx = sSpineX + (facingRight ? 1 : -1) * ((zTex - dzSideTex) / kScaleEff);

      const anx = Math.abs(baseNX[v]);
      const anz = Math.abs(baseNZ[v]);
      let relDelta = 0;

      if (anx >= anz * 0.85 && inputs.sideRelief) {
        const r = sample(inputs.sideRelief, w, sx, sy) - 0.45;
        relDelta += r * reliefGain;
        if (sLayerPrimary) {
          const ix = Math.max(0, Math.min(w - 1, Math.round(sx)));
          const iy = Math.max(0, Math.min(w - 1, Math.round(sy)));
          const lo = sLayerPrimary.offset[iy * w + ix];
          if (Number.isFinite(lo) && !isClothOff(lo)) {
            relDelta += lo * layerGain;
          }
        }
      } else if (baseNZ[v] >= 0) {
        const r = sample(inputs.frontRelief, w, tx, ty) - 0.45;
        relDelta += r * reliefGain;
        if (inputs.frontLayer) {
          const ix = Math.max(0, Math.min(w - 1, Math.round(tx)));
          const iy = Math.max(0, Math.min(w - 1, Math.round(ty)));
          const lo = inputs.frontLayer.offset[iy * w + ix];
          if (Number.isFinite(lo) && !isClothOff(lo)) {
            relDelta += lo * layerGain;
          }
        }
      } else {
        const r = sample(inputs.backRelief, w, tx, ty) - 0.45;
        relDelta += r * reliefGain;
        if (inputs.backLayer) {
          const ix = Math.max(0, Math.min(w - 1, Math.round(tx)));
          const iy = Math.max(0, Math.min(w - 1, Math.round(ty)));
          const lo = backLayerAlignedOff[iy * w + ix];
          if (Number.isFinite(lo) && !isClothOff(lo)) {
            relDelta += lo * layerGain;
          }
        }
      }

      baseWX[v] += baseNX[v] * relDelta;
      baseWY[v] += baseNY[v] * relDelta;
      baseWZ[v] += baseNZ[v] * relDelta;
    }
    computeBaseNormals();
  }

  // 9) Mapeo UV en los 4 cuadrantes del atlas (0: Frente, 1: Espalda, 2: Perfil Derecho, 3: Perfil Izquierdo)
  //    con proyección interior al contorno de cada vista para que nunca aparezcan bordes blancos ni rayas horizontales.
  const clampInsideMask = (
    m: Uint8Array,
    distField: Float32Array,
    txIn: number,
    tyIn: number,
    nearMap?: Int32Array
  ): [number, number] => {
    let x = Math.max(1, Math.min(w - 2, txIn));
    let y = Math.max(1, Math.min(w - 2, tyIn));
    if (sample(distField, w, x, y) >= 1.8) return [x, y];
    const rx = Math.round(x);
    const ry = Math.round(y);
    let bestX = x;
    let bestY = y;
    let bestScore = -1e9;
    for (let r = 1; r <= 12; r += 1) {
      let foundGood = false;
      for (let dy = -r; dy <= r; dy++) {
        const yy = ry + dy;
        if (yy < 1 || yy >= w - 1) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const xx = rx + dx;
          if (xx < 1 || xx >= w - 1) continue;
          const idx = yy * w + xx;
          if (m[idx] !== 1) continue;
          const d = distField[idx];
          const score = Math.min(d, 3.0) * 4.0 - Math.hypot(dx, dy);
          if (score > bestScore) {
            bestScore = score;
            bestX = xx;
            bestY = yy;
            if (d >= 1.8) foundGood = true;
          }
        }
      }
      if (foundGood) break;
    }
    if (bestScore <= -1e8 && nearMap) {
      // El punto está MUY fuera del dibujo (p. ej. la barriga del molde cuelga por debajo de la
      // del dibujo, o la pata rellena el hueco que el dibujo deja entre las patas). Se va al
      // punto del dibujo más cercano -da el color de la pieza vecina- en lugar de quedarse con
      // el relleno gris del fondo, que es lo que pintaba de gris la mitad baja del modelo.
      const qi = nearMap[ry * w + rx];
      if (qi >= 0) {
        let nx = qi % w;
        let ny = (qi / w) | 0;
        // Un paso hacia dentro para no caer justo en la línea de contorno del dibujo.
        for (let step = 0; step < 3; step++) {
          let bx = nx;
          let by = ny;
          let bd = distField[ny * w + nx];
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const xx = nx + dx;
              const yy = ny + dy;
              if (xx < 1 || xx >= w - 1 || yy < 1 || yy >= w - 1) continue;
              const di = yy * w + xx;
              if (m[di] !== 1) continue;
              if (distField[di] > bd) {
                bd = distField[di];
                bx = xx;
                by = yy;
              }
            }
          }
          if (bx === nx && by === ny) break;
          nx = bx;
          ny = by;
        }
        bestX = nx;
        bestY = ny;
        bestScore = 0;
      }
    }
    if (bestScore <= -1e8) {
      // Si el punto está en una cola o morro proyectados fuera del ancho X del frente/espalda,
      // buscar horizontalmente en la misma fila (o filas vecinas) el píxel válido más cercano de `m`.
      for (let dy = 0; dy <= 16; dy++) {
        for (const sgn of dy === 0 ? [0] : [-1, 1]) {
          const yy = ry + dy * sgn;
          if (yy < 1 || yy >= w - 1) continue;
          let closestX = -1;
          let minDx = 1e9;
          for (let xx = 1; xx < w - 1; xx++) {
            const idx = yy * w + xx;
            if (m[idx] === 1 && distField[idx] >= 1.0) {
              const dxx = Math.abs(xx - rx);
              if (dxx < minDx) {
                minDx = dxx;
                closestX = xx;
              }
            }
          }
          if (closestX >= 0) {
            bestX = closestX;
            bestY = yy;
            dy = 999;
            break;
          }
        }
      }
    }
    x = bestX;
    y = bestY;
    return [x, y];
  };

  // Para cada texel FUERA de la silueta, el índice del texel de dentro más cercano.
  // Transformada de rasgo (dos pasadas tipo chamfer). Sirve para que ningún vértice del
  // modelo acabe muestreando el fondo: si cae fuera del dibujo, se le da el color del
  // trozo de dibujo más cercano en vez del relleno gris de alrededor.
  const buildNearestInsideMap = (m: Uint8Array): Int32Array => {
    const near = new Int32Array(w * w).fill(-1);
    const best = new Float64Array(w * w).fill(Infinity);
    for (let i = 0; i < w * w; i++) {
      if (m[i] === 1) {
        near[i] = i;
        best[i] = 0;
      }
    }
    const relax = (i: number, j: number) => {
      const nj = near[j];
      if (nj < 0) return;
      const fx = nj % w;
      const fy = (nj / w) | 0;
      const x = i % w;
      const y = (i / w) | 0;
      const dx = x - fx;
      const dy = y - fy;
      const d = dx * dx + dy * dy;
      if (d < best[i]) {
        best[i] = d;
        near[i] = nj;
      }
    };
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (x > 0) relax(i, i - 1);
        if (y > 0) relax(i, i - w);
        if (y > 0 && x > 0) relax(i, i - w - 1);
        if (y > 0 && x < w - 1) relax(i, i - w + 1);
      }
    }
    for (let y = w - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (x < w - 1) relax(i, i + 1);
        if (y < w - 1) relax(i, i + w);
        if (y < w - 1 && x < w - 1) relax(i, i + w + 1);
        if (y < w - 1 && x > 0) relax(i, i + w - 1);
      }
    }
    return near;
  };

  // Para recortar las UV hay que usar la silueta de la FOTO que se va a muestrear, no la que
  // se usó para tallar el volumen. No son la misma: la de tallar puede venir promediada entre
  // los dos perfiles o recortada de contorno, y entonces el modelo acaba muestreando por fuera
  // del dibujo -el gris del fondo- aunque geométricamente esté "dentro".
  const sTexMask = inputs.atlas?.sideProfile?.cutout ?? sMaskPrimary;
  const sTexMaskLeft = inputs.atlas?.sideLeftProfile?.cutout ?? sMaskLeft;

  // ANCLAJE VERTICAL DE LA TEXTURA DE PERFIL.
  // El mapeo vertical venía de las filas del dibujo del FRENTE, no del dibujo que se va a
  // muestrear, así que la textura del perfil podía quedar unas filas por encima de donde le
  // toca y dejar una banda sin pintar abajo. Aquí se anclan los extremos: lo más alto de la
  // MALLA cae en lo más alto del dibujo de perfil y lo más bajo en lo más bajo. Es decir, se
  // baja (o se sube) la textura hasta que acopla, sin tocar el volumen.
  let meshTopTy = Infinity;
  let meshBotTy = -Infinity;
  for (let v = 0; v < nBaseVerts; v++) {
    const y = baseY[v];
    if (y < meshTopTy) meshTopTy = y;
    if (y > meshBotTy) meshBotTy = y;
  }
  const maskRowRange = (m: Uint8Array): [number, number] => {
    let y0 = -1;
    let y1 = -1;
    for (let y = 0; y < w; y++) {
      let any = false;
      for (let x = 0; x < w; x++) {
        if (m[y * w + x] === 1) { any = true; break; }
      }
      if (any) {
        if (y0 < 0) y0 = y;
        y1 = y;
      }
    }
    return [y0, y1];
  };
  const [texTopR, texBotR] = maskRowRange(sTexMask);
  const [texTopL, texBotL] = maskRowRange(sTexMaskLeft);
  const meshSpanTy = Math.max(1, meshBotTy - meshTopTy);
  /** Fila del dibujo de perfil que le corresponde a la altura `ty` de la malla. */
  const anchoredSideRow = (ty: number, top: number, bot: number): number => {
    if (top < 0 || bot <= top) return ty;
    const t = (ty - meshTopTy) / meshSpanTy;
    return top + t * (bot - top);
  };

  const sFullDistR = new Float32Array(w * w);
  const sFullRadR = new Float32Array(w * w);
  distanceAndRadius(sTexMask, w, sFullDistR, sFullRadR);

  const sFullDistL = new Float32Array(w * w);
  const sFullRadL = new Float32Array(w * w);
  distanceAndRadius(sTexMaskLeft, w, sFullDistL, sFullRadL);

  const fFullDist = new Float32Array(w * w);
  const fFullRad = new Float32Array(w * w);
  distanceAndRadius(frontMask, w, fFullDist, fFullRad);

  const bFullDist = new Float32Array(w * w);
  const bFullRad = new Float32Array(w * w);
  distanceAndRadius(rawBackMask, w, bFullDist, bFullRad);

  const sNearR = buildNearestInsideMap(sTexMask);
  const sNearL = buildNearestInsideMap(sTexMaskLeft);
  const fNear = buildNearestInsideMap(frontMask);
  const bNear = buildNearestInsideMap(rawBackMask);

  // COBERTURA LATERAL POR FILAS. El perfil se mapeaba con una escala global (la de la altura del
  // cuerpo), así que en cada fila la profundidad de la malla no coincidía con el ancho del dibujo
  // de esa fila: lo que sobraba se fijaba al borde del dibujo y salían franjas horizontales en
  // las patas y el vientre. Ahora, en cada fila, la profundidad de la malla (de la grupa al
  // hocico) se estira exactamente al ancho del dibujo de perfil de esa fila.
  const rowExtent = (m: Uint8Array): [Float32Array, Float32Array] => {
    const L = new Float32Array(w).fill(-1);
    const R = new Float32Array(w).fill(-1);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        if (m[y * w + x] === 1) {
          if (L[y] < 0) L[y] = x;
          R[y] = x;
        }
      }
    }
    return [L, R];
  };
  const meshZMinRow = new Float32Array(w).fill(Infinity);
  const meshZMaxRow = new Float32Array(w).fill(-Infinity);
  for (let v = 0; v < nBaseVerts; v++) {
    const yi = Math.max(0, Math.min(w - 1, Math.round(baseY[v])));
    if (baseZ[v] < meshZMinRow[yi]) meshZMinRow[yi] = baseZ[v];
    if (baseZ[v] > meshZMaxRow[yi]) meshZMaxRow[yi] = baseZ[v];
  }
  /** Profundidad de la malla en la fila `yi`, mirando 2 filas a cada lado para no depender de pocos vértices. */
  const meshZSpanAt = (yi: number): [number, number] => {
    let zmin = Infinity;
    let zmax = -Infinity;
    for (let k = -2; k <= 2; k++) {
      const j = yi + k;
      if (j < 0 || j >= w) continue;
      if (meshZMinRow[j] < zmin) zmin = meshZMinRow[j];
      if (meshZMaxRow[j] > zmax) zmax = meshZMaxRow[j];
    }
    return [zmin, zmax];
  };
  const [rowLeftR, rowRightR] = rowExtent(sTexMask);
  const [rowLeftL, rowRightL] = rowExtent(sTexMaskLeft);
  /** Columna del dibujo de perfil para el vértice con profundidad `z` en la fila de malla `ty`. Null si la fila no tiene dibujo. */
  const fitSideColumn = (
    ty: number,
    sy: number,
    rowL: Float32Array,
    rowR: Float32Array,
    z: number,
    facing: boolean
  ): number | null => {
    const ry = Math.max(0, Math.min(w - 1, Math.round(sy)));
    const xl = rowL[ry];
    const xr = rowR[ry];
    if (xl < 0 || xr < 0) return null;
    const [zmin, zmax] = meshZSpanAt(Math.max(0, Math.min(w - 1, Math.round(ty))));
    if (!Number.isFinite(zmin) || !Number.isFinite(zmax) || zmax - zmin < 1e-6) return null;
    const t = Math.max(0, Math.min(1, (z - zmin) / (zmax - zmin)));
    return facing ? xl + t * (xr - xl) : xr - t * (xr - xl);
  };

  const vertQuadMap = new Int32Array(nBaseVerts * 4).fill(-1);
  const outPos: number[] = [];
  const outNor: number[] = [];
  const outUV: number[] = [];
  const outBaseV: number[] = [];
  const outIndices = new Uint32Array(nTris * 3);

  const getOrCreateChartVertex = (v: number, quadId: number): number => {
    const key = v * 4 + quadId;
    const existing = vertQuadMap[key];
    if (existing >= 0) return existing;

    const tx = baseX[v];
    const ty = baseY[v];
    const zTex = baseZ[v];
    const tY = Math.max(0, Math.min(1, (ty - fTop) / Math.max(1, Hf - 1)));
    const syBodyV = mapTyToSyBody(ty);
    const tBodyS = Math.max(0, Math.min(1, (syBodyV - sTop) / Math.max(1, Hs - 1)));

    let u = 0.25;
    let vCoord = 0.25;

    if (quadId === 0) {
      // Cuadrante 0 (arriba-izquierda): Frente (`frontMask`)
      const [cx, cy] = clampInsideMask(frontMask, fFullDist, tx, ty, fNear);
      const uLoc = Math.max(0, Math.min(1, cx / (w - 1)));
      const vLoc = Math.max(0, Math.min(1, cy / (w - 1)));
      u = 0.002 + uLoc * 0.495;
      vCoord = 0.002 + vLoc * 0.495;
    } else if (quadId === 1) {
      // Cuadrante 1 (arriba-derecha): Espalda (`rawBackMask`) con su transformación de recuadro
      const yRelB = fMidYAll + (ty - dyBackTex - fMidYAll) / scaleBackY;
      const tYB = Math.max(0, Math.min(1, (yRelB - fTop) / Math.max(1, Hf - 1)));
      const by = bTop + tYB * (Hb - 1);
      const xRelB = fAxisX + (tx - dxBackTex - fAxisX) / scaleBackX;
      const bx = bAxisX + (xRelB - fAxisX) * (Hb / Hf);
      const [cx, cy] = clampInsideMask(rawBackMask, bFullDist, bx, by, bNear);
      const uLoc = Math.max(0, Math.min(1, cx / (w - 1)));
      const vLoc = Math.max(0, Math.min(1, cy / (w - 1)));
      u = 0.502 + uLoc * 0.495;
      vCoord = 0.002 + vLoc * 0.495;
    } else if (quadId === 2) {
      // Cuadrante 2 (abajo-izquierda): Perfil Derecho (`sMaskPrimary`)
      const sy = anchoredSideRow(ty, texTopR, texBotR);
      const sxFit = fitSideColumn(ty, sy, rowLeftR, rowRightR, zTex, facingRight);
      const sx = sxFit ?? sSpineX + (facingRight ? 1 : -1) * ((zTex - dzSideTex) / kScaleEff);
      const [cx, cy] = clampInsideMask(sTexMask, sFullDistR, sx, sy, sNearR);
      const uLoc = Math.max(0, Math.min(1, cx / (w - 1)));
      const vLoc = Math.max(0, Math.min(1, cy / (w - 1)));
      u = 0.002 + uLoc * 0.495;
      vCoord = 0.502 + vLoc * 0.495;
    } else {
      // Cuadrante 3 (abajo-derecha): Perfil Izquierdo (`sMaskLeft`)
      const syL = anchoredSideRow(ty, texTopL, texBotL);
      const kScaleL = (Hf / HsLeft) * scaleSideLeftX;
      const sSpineXL = sideContoursLeft
        ? sideContoursLeft.sideAxis[Math.round(sTopLeft + HsLeft * 0.3)]
        : sSpineX;
      const sxLFit = fitSideColumn(ty, syL, rowLeftL, rowRightL, zTex, facingRightLeft);
      const sxL = sxLFit ?? sSpineXL + (facingRightLeft ? 1 : -1) * ((zTex - dzSideLeftTex) / kScaleL);
      const [cx, cy] = clampInsideMask(sTexMaskLeft, sFullDistL, sxL, syL, sNearL);
      const uLoc = Math.max(0, Math.min(1, cx / (w - 1)));
      const vLoc = Math.max(0, Math.min(1, cy / (w - 1)));
      u = 0.502 + uLoc * 0.495;
      vCoord = 0.502 + vLoc * 0.495;
    }

    const outIdx = outBaseV.length;
    vertQuadMap[key] = outIdx;
    outBaseV.push(v);
    outPos.push(baseWX[v], baseWY[v], baseWZ[v]);
    outNor.push(baseNX[v], baseNY[v], baseNZ[v]);
    outUV.push(u, vCoord);
    return outIdx;
  };

  // Porcentaje de aplicación de la textura de los perfiles (0% por defecto: del centro hacia el frente manda
  // la foto del frente y del centro hacia detrás manda la foto de atrás; al subir `profileTexturePct` de 0% a 100%,
  // la textura de los perfiles se aplica gradualmente a todo el perfil lateral).
  const profTexFrac = Math.max(0, Math.min(1, (options.profileTexturePct ?? 0) / 100));

  for (let t = 0; t < nTris; t++) {
    const a = triBuf[t * 3];
    const b = triBuf[t * 3 + 1];
    const c = triBuf[t * 3 + 2];

    const cx = (baseX[a] + baseX[b] + baseX[c]) / 3;
    const cy = (baseY[a] + baseY[b] + baseY[c]) / 3;
    const cz = (baseZ[a] + baseZ[b] + baseZ[c]) / 3;
    const tY = (cy - fTop) / Math.max(1, Hf - 1);
    const uBodyTri = (cy - fCoreTop) / Math.max(1, fBot - fCoreTop);

    const fnx = (baseNX[a] + baseNX[b] + baseNX[c]) / 3;
    const fnz = (baseNZ[a] + baseNZ[b] + baseNZ[c]) / 3;

    const dxAxis = Math.abs(cx - fAxisX);
    const onWing = hasWings && dxAxis > refBodyHalf * 1.05 && tY < 0.78;
    const inTailOrHind =
      !onWing &&
      ((uBodyTri >= 0.42 && cz < -refBodyHalf * 0.45) || (uBodyTri >= 0.52 && cz < -refBodyHalf * 0.15));
    const inSnout = !onWing && uBodyTri < 0.26 && cz > refBodyHalf * 0.55;

    let quadId: number;
    if (profTexFrac <= 0.001 || onWing) {
      // Con 0% de textura de perfil (o en las alas desplegadas en ±X):
      // del centro hacia delante (+Z) manda la foto del Frente (0) y del centro hacia detrás (-Z) la de Atrás (1).
      quadId = fnz >= -0.02 ? 0 : 1;
    } else {
      // Al aumentar la barra de porcentaje de aplicación de textura de perfil (0% -> 100%),
      // el umbral lateral baja progresivamente hasta cubrir el 100% del perfil.
      const nxRatioThresh = Math.max(0, (1 - profTexFrac) * 1.65);
      const useProfileChart =
        profTexFrac >= 0.995 ||
        (profTexFrac >= 0.15 && (inTailOrHind || inSnout)) ||
        Math.abs(fnx) >= Math.abs(fnz) * nxRatioThresh;
      if (useProfileChart) {
        quadId = cx <= fAxisX ? 2 : 3;
      } else {
        quadId = fnz >= 0 ? 0 : 1;
      }
    }

    // Invertir el orden de dos vértices al escribir en Three.js porque Y crece hacia arriba en world space
    outIndices[t * 3] = getOrCreateChartVertex(a, quadId);
    outIndices[t * 3 + 1] = getOrCreateChartVertex(c, quadId);
    outIndices[t * 3 + 2] = getOrCreateChartVertex(b, quadId);
  }

  const allCount = outBaseV.length;
  const P = new Float32Array(outPos);
  const N = new Float32Array(outNor);
  const U = new Float32Array(outUV);
  const C = new Float32Array(allCount * 3).fill(1);

  const usedNodeX = new Float32Array(allCount);
  const usedNodeY = new Float32Array(allCount);
  for (let i = 0; i < allCount; i++) {
    const bv = outBaseV[i];
    usedNodeX[i] = baseX[bv];
    usedNodeY[i] = baseY[bv];
  }

  let rig: HumanRig | undefined;
  let rigKind: 'human' | CreatureKind = 'human';
  let creatureMetrics: CreatureMetrics | undefined;
  if (options.rig) {
    // ¿Esqueleto humanoide o de criatura? En un bicho horizontal el humanoide no
    // vale: su columna es vertical y solo tiene dos piernas, así que al animarlo
    // despedaza al animal. `looksLikeQuadruped` lo decide con la malla ya hecha.
    const kindOption = options.rigKind ?? 'auto';
    const useCreature =
      !options.customRig &&
      (kindOption === 'creature' || (kindOption === 'auto' && looksLikeQuadruped(P)));

    if (useCreature) {
      const built = computeCreatureRig(P);
      rig = built.rig;
      rigKind = built.kind;
      creatureMetrics = built.metrics;
      // Pesos en 3D: en la vista frontal las patas delanteras tapan a las traseras,
      // así que un mapa 2D les daría los mismos pesos y la malla reventaría al andar.
      const skin = computeSkinWeights3D(rig, P, WORLD_SPAN);
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skin.index, 4));
      geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skin.weight, 4));
    } else {
      rig = options.customRig
        ? {
            bones: options.customRig.bones.map((b) => ({
              name: b.name,
              parent: b.parent,
              head: [...b.head] as [number, number, number],
              tail: [...b.tail] as [number, number, number],
            })),
          }
        : computeHumanRig(frontMask, w, landmarks, WORLD_SPAN);
      const maps = computeSkinWeightMaps(rig, frontMask, w, WORLD_SPAN);
      const skinIndex = new Uint16Array(allCount * 4);
      const skinWeight = new Float32Array(allCount * 4);
      for (let i = 0; i < allCount; i++) {
        sampleSkinWeights(
          maps,
          frontMask,
          w,
          usedNodeX[i],
          usedNodeY[i],
          skinIndex,
          skinWeight,
          i * 4
        );
      }
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
      geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    }
  } else {
    if (geometry.getAttribute('skinIndex')) geometry.deleteAttribute('skinIndex');
    if (geometry.getAttribute('skinWeight')) geometry.deleteAttribute('skinWeight');
  }

  const rebindData: HumanRebindData = {
    mask: frontMask.slice(),
    w,
    landmarks,
    nUsed: allCount,
    allCount,
    usedNodeX,
    usedNodeY,
    shoeRanges: [],
  };

  inputs.vertexUsedMask.fill(0);
  inputs.vertexUsedMask.fill(1, 0, Math.min(allCount, inputs.vertexUsedMask.length));

  geometry.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geometry.setIndex(new THREE.BufferAttribute(outIndices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return {
    vertexCount: allCount,
    triangleCount: nTris,
    landmarks,
    rig,
    rigKind,
    creatureMetrics,
    rebindData,
  };
}

/**
 * Replaces `geometry` with a closed human-body mesh fitted to the silhouette.
 * UVs use the same atlas layout as the relief pipeline: front image in the
 * top-left quadrant, back image (already mirrored/aligned) in the top-right.
 */
export function buildHumanBodyTemplateGeometry(
  geometry: THREE.BufferGeometry,
  inputs: HumanBodyInputs,
  options: HumanBodyOptions
): HumanBodyStats {
  const { w } = inputs;
  const orthogonalMode = options.orthogonalSilhouetteAndSeam !== false;
  // En modo ortogonal 4 vistas, la silueta de los laterales izquierdo y derecho
  // sale estrictamente de la imagen delantera (inputs.mask + inputs.frontLayer).
  let mask = inputs.mask;
  if (inputs.frontLayer || (!orthogonalMode && inputs.backLayer)) {
    const painted = new Uint8Array(w * w);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (inputs.frontLayer && Number.isFinite(inputs.frontLayer.offset[i])) painted[i] = 1;
        if (!orthogonalMode && inputs.backLayer) {
          const j = y * w + (w - 1 - x);
          if (Number.isFinite(inputs.backLayer.offset[j])) painted[i] = 1;
        }
      }
    }
    let near = painted.slice();
    for (let r = 0; r < 4; r++) {
      const prev = near;
      near = prev.slice();
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (prev[i]) continue;
          if ((x > 0 && prev[i - 1]) || (x < w - 1 && prev[i + 1]) || (y > 0 && prev[i - w]) || (y < w - 1 && prev[i + w])) near[i] = 1;
        }
      }
    }
    mask = new Uint8Array(w * w);
    for (let i = 0; i < w * w; i++) mask[i] = painted[i] || (inputs.mask[i] && near[i]) ? 1 : 0;
    for (let y = 1; y < w - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (mask[i] === 0 && inputs.mask[i] === 1) {
          if ((mask[i - 1] === 1 && mask[i + 1] === 1) || (mask[i - w] === 1 && mask[i + w] === 1)) {
            mask[i] = 1;
          }
        }
      }
    }
    keepLargestComponent(mask, w);
  }
  ensureBuffers(w);
  if (mask === inputs.mask) mask = inputs.mask.slice();
  removeFloorBridge(mask, w);

  // The depth map is computed before the outline field because both use _tmp.
  // El molde respeta siempre la silueta frontal en el PLANO XY y aplica la silueta de perfil en el PLANO ZY
  // de forma 100% gradual según la barra de importancia del perfil (`sideStrength` 0%..100%), sin saltos bruscos.
  const isFreeform = Boolean(options.freeformFromPhotos);
  const headScale = Math.max(0.4, Math.min(2.5, options.headScale ?? 1.0));
  const headRoundness = Math.max(0.2, Math.min(2.5, options.headRoundness ?? 1.0));
  const usePresetFace = Boolean(
    !isFreeform && options.presetFaceFeatures && (options.faceModel ?? 'classic') !== 'none'
  );
  const landmarks = isFreeform
    ? buildFreeformDepthMapFromPhotos(
        mask,
        w,
        inputs.frontRelief,
        inputs.backRelief,
        inputs.sideMask ?? null,
        options.sideStrength ?? 1,
        inputs.sideLayer ?? null,
        inputs.sideLeftMask ?? null,
        inputs.sideLeftLayer ?? null,
        options.freeformPhotoVolume ?? 1.0,
        options.freeformSectionRoundness ?? 1.0,
        options.photoTransforms
      )
    : buildHumanDepthMap(
        mask,
        w,
        inputs.frontRgb,
        inputs.sideMask ?? null,
        options.sideStrength ?? 1,
        usePresetFace,
        inputs.sideLayer ?? null,
        headRoundness,
        inputs.sideLeftMask ?? null,
        inputs.sideLeftLayer ?? null,
        orthogonalMode,
        options.photoTransforms
      );
  if (inputs.atlas) {
    repairAtlasRim(inputs.atlas, mask, w);
    const profTexPct = Math.max(0, Math.min(100, options.profileTexturePct ?? 0));
    if (profTexPct > 0.1) {
      applyProfileSeamTextureToAtlas(
        inputs.atlas,
        mask,
        w,
        landmarks,
        options.profileSeamWidthCm ?? 5.6,
        profTexPct,
        options.photoTransforms
      );
    }
    if (inputs.atlas.roughMetal) smoothRoughMetal(inputs.atlas.roughMetal, inputs.atlas.atlasWidth, mask, w);
  }

  // Si existe foto de perfil (`sideMask` o `sideLeftMask`) y `sideStrength > 0`, cuando estamos en modo libre
  // (`isFreeform`) o la figura tiene rasgos 3D en el perfil (alas, cola, hocico, mochila, silueta ZY profunda),
  // tallar el volumen 3D por intersección real de las siluetas XY (Frente/Atrás) y ZY (Perfil),
  // graduado por `sideStrength` (0%..100%) y aplicando la textura de perfil solo según `profileTexturePct` (0%..100%).
  const primarySideMask = inputs.sideMask ?? inputs.sideLeftMask ?? null;
  const primarySideLayer = inputs.sideMask ? inputs.sideLayer : inputs.sideLeftLayer;
  if (
    primarySideMask &&
    (options.sideStrength ?? 1) > 0.01 &&
    (isFreeform ||
      hasProfileDriven3DFeatures(mask, primarySideMask, w, inputs.frontLayer, primarySideLayer))
  ) {
    return buildProfileDriven3DMoldGeometry(geometry, inputs, options, mask, landmarks);
  }

  // Note: buildHumanDepthMap / buildFreeformDepthMapFromPhotos also fills _dist, which addPhotoDetail uses for fading.
  const reliefTexels = (isFreeform ? 11 : 9) * Math.max(0, Math.min(1, options.reliefAmount));
  // With a painted layer map the relief comes from the map; keep only a little photo detail.
  const frontRelief = inputs.frontLayer ? reliefTexels * 0.35 : reliefTexels;
  const backRelief = inputs.backLayer ? reliefTexels * 0.35 : reliefTexels;
  addPhotoDetail(_frontD, _frontBase, inputs.frontRelief, mask, w, frontRelief);
  addPhotoDetail(_backD, _backBase, inputs.backRelief, mask, w, backRelief);
  const unit = 0.012 * Math.max(1, landmarks.bottom - landmarks.top) * Math.max(0, options.layerStrength ?? 1);
  if (inputs.frontLayer && unit > 0) addLayerRelief(_frontD, inputs.frontLayer, mask, w, unit, false);
  if (inputs.backLayer && unit > 0) addLayerRelief(_backD, inputs.backLayer, mask, w, unit, true);
  if (!isFreeform && (usePresetFace || Math.abs(headRoundness - 1.0) > 0.01)) {
    addFaceRelief(_frontD, mask, w, landmarks, options, inputs.frontLayer);
  }
  buildOutlineField(mask, w);

  const { top, bottom } = landmarks;
  const rows = Math.max(40, Math.min(1000, Math.round(options.rows)));
  const H = Math.max(1, bottom - top + 1);
  const cs = (H + 4) / rows; // texels per cell

  // Horizontal extent of the figure.
  let minX = w;
  let maxX = -1;
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] === 1) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (maxX < 0) {
    geometry.setIndex([]);
    return { vertexCount: 0, triangleCount: 0, landmarks };
  }

  const gx0 = minX - 2;
  const gy0 = top - 2;
  const nCols = Math.ceil((maxX - minX + 5) / cs) + 1;
  const nRows = rows + 1;
  const nNodes = nCols * nRows;

  const nodeX = new Float32Array(nNodes);
  const nodeY = new Float32Array(nNodes);
  const inside = new Uint8Array(nNodes);
  for (let j = 0; j < nRows; j++) {
    for (let i = 0; i < nCols; i++) {
      const n = j * nCols + i;
      nodeX[n] = gx0 + i * cs;
      nodeY[n] = gy0 + j * cs;
      inside[n] = sample(_field, w, nodeX[n], nodeY[n]) >= 0.5 ? 1 : 0;
    }
  }

  const qCols = nCols - 1;
  const qRows = nRows - 1;
  const quadOn = new Uint8Array(qCols * qRows);
  for (let j = 0; j < qRows; j++) {
    for (let i = 0; i < qCols; i++) {
      const a = j * nCols + i;
      quadOn[j * qCols + i] =
        inside[a] && inside[a + 1] && inside[a + nCols] && inside[a + nCols + 1] ? 1 : 0;
    }
  }

  // Keep only the largest connected group of quads (drops tiny islands the
  // smoothed outline can leave, e.g. a speck of floor shadow between the feet).
  {
    const comp = new Int32Array(quadOn.length).fill(-1);
    const queue = new Int32Array(quadOn.length);
    let best = -1;
    let bestSize = 0;
    let c = 0;
    for (let q0 = 0; q0 < quadOn.length; q0++) {
      if (!quadOn[q0] || comp[q0] >= 0) continue;
      let qh = 0;
      let qt = 0;
      queue[qt++] = q0;
      comp[q0] = c;
      while (qh < qt) {
        const q = queue[qh++];
        const qi = q % qCols;
        for (const nq of [qi > 0 ? q - 1 : -1, qi < qCols - 1 ? q + 1 : -1, q - qCols, q + qCols]) {
          if (nq < 0 || nq >= quadOn.length || !quadOn[nq] || comp[nq] >= 0) continue;
          comp[nq] = c;
          queue[qt++] = nq;
        }
      }
      if (qt > bestSize) {
        bestSize = qt;
        best = c;
      }
      c++;
    }
    for (let q = 0; q < quadOn.length; q++) if (quadOn[q] && comp[q] !== best) quadOn[q] = 0;
  }

  // Boundary edges -> neighbour links.
  const nbA = new Int32Array(nNodes).fill(-1);
  const nbB = new Int32Array(nNodes).fill(-1);
  const nbCount = new Uint8Array(nNodes);
  const used = new Uint8Array(nNodes);
  const link = (p: number, q: number) => {
    for (const [s, t] of [
      [p, q],
      [q, p],
    ]) {
      const c = nbCount[s];
      if (c === 0) nbA[s] = t;
      else if (c === 1) nbB[s] = t;
      nbCount[s] = Math.min(255, c + 1);
    }
  };
  const qOn = (i: number, j: number) => i >= 0 && j >= 0 && i < qCols && j < qRows && quadOn[j * qCols + i] === 1;
  for (let j = 0; j < qRows; j++) {
    for (let i = 0; i < qCols; i++) {
      if (!quadOn[j * qCols + i]) continue;
      const a = j * nCols + i;
      const b = a + 1;
      const c = a + nCols;
      const d = c + 1;
      used[a] = used[b] = used[c] = used[d] = 1;
      if (!qOn(i, j - 1)) link(a, b);
      if (!qOn(i, j + 1)) link(c, d);
      if (!qOn(i - 1, j)) link(a, c);
      if (!qOn(i + 1, j)) link(b, d);
    }
  }
  const isBoundary = (n: number) => nbCount[n] > 0;

  // 1) Snap boundary nodes onto the smooth outline.
  for (let n = 0; n < nNodes; n++) {
    if (!used[n] || !isBoundary(n)) continue;
    const x0 = nodeX[n];
    const y0 = nodeY[n];
    let x = x0;
    let y = y0;
    for (let it = 0; it < 6; it++) {
      const f = sample(_field, w, x, y) - 0.5;
      const gx = 0.5 * (sample(_field, w, x + 1, y) - sample(_field, w, x - 1, y));
      const gy = 0.5 * (sample(_field, w, x, y + 1) - sample(_field, w, x, y - 1));
      const g2 = gx * gx + gy * gy;
      if (g2 < 1e-6) break;
      x -= (f * gx) / g2;
      y -= (f * gy) / g2;
      if (Math.abs(f) < 0.01) break;
    }
    let dx = x - x0;
    let dy = y - y0;
    const len = Math.hypot(dx, dy);
    const lim = 1.05 * cs;
    if (len > lim) {
      dx *= lim / len;
      dy *= lim / len;
    }
    nodeX[n] = x0 + dx;
    nodeY[n] = y0 + dy;
  }

  // 2) Smooth the outline as a curve (Taubin, no shrinking).
  const tmpX = new Float32Array(nNodes);
  const tmpY = new Float32Array(nNodes);
  for (let it = 0; it < 12; it++) {
    const k = it % 2 === 0 ? 0.5 : -0.53;
    for (let n = 0; n < nNodes; n++) {
      if (nbCount[n] !== 2) continue;
      const a = nbA[n];
      const b = nbB[n];
      tmpX[n] = nodeX[n] + k * (0.5 * (nodeX[a] + nodeX[b]) - nodeX[n]);
      tmpY[n] = nodeY[n] + k * (0.5 * (nodeY[a] + nodeY[b]) - nodeY[n]);
    }
    for (let n = 0; n < nNodes; n++) {
      if (nbCount[n] !== 2) continue;
      nodeX[n] = tmpX[n];
      nodeY[n] = tmpY[n];
    }
  }

  // 3) Even out the first rows inside the outline.
  for (let it = 0; it < 4; it++) {
    for (let n = 0; n < nNodes; n++) {
      tmpX[n] = NaN;
      if (!used[n] || isBoundary(n)) continue;
      const dist = sample(_dist, w, nodeX[n], nodeY[n]);
      if (dist > cs * 2.6) continue;
      let sx = 0;
      let sy = 0;
      let c = 0;
      for (const m of [n - 1, n + 1, n - nCols, n + nCols]) {
        if (m < 0 || m >= nNodes || !used[m]) continue;
        sx += nodeX[m];
        sy += nodeY[m];
        c++;
      }
      if (c < 3) continue;
      const k = 0.5 * (1 - dist / (cs * 3.1));
      tmpX[n] = nodeX[n] + k * (sx / c - nodeX[n]);
      tmpY[n] = nodeY[n] + k * (sy / c - nodeY[n]);
    }
    for (let n = 0; n < nNodes; n++) {
      if (Number.isNaN(tmpX[n])) continue;
      nodeX[n] = tmpX[n];
      nodeY[n] = tmpY[n];
    }
  }

  // 4) Vertices: one front + one back vertex per used node (boundary nodes share position).
  const frontIdx = new Int32Array(nNodes).fill(-1);
  let nUsed = 0;
  for (let n = 0; n < nNodes; n++) if (used[n]) frontIdx[n] = nUsed++;
  const vCount = Math.min(nUsed * 2, inputs.maxVertices);
  if (nUsed * 2 > inputs.maxVertices) {
    geometry.setIndex([]);
    return { vertexCount: 0, triangleCount: 0, landmarks };
  }

  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = new Float32Array(vCount * 3).fill(1);
  const texelWorld = WORLD_SPAN / (w - 1);
  const zScale = texelWorld * Math.max(0, options.depthScale);

  // Marco anatómico de la cabeza y pivote del cuello para escalado (headScale), redondez 3D (headRoundness)
  // y cálculo de puntos exactos 3D (facePoints3D).
  const faceFrame = computeFaceFrame(mask, w, landmarks, inputs.frontLayer);
  const headPivotTx = faceFrame ? faceFrame.cx : landmarks.axisX;
  const headPivotTy = landmarks.neckY;
  const headPivotWX = (headPivotTx / (w - 1) - 0.5) * WORLD_SPAN;
  const headPivotWY = (0.5 - headPivotTy / (w - 1)) * WORLD_SPAN;
  const headMidTy = (landmarks.top + landmarks.neckY) * 0.5;
  const headCenterWY = (0.5 - headMidTy / (w - 1)) * WORLD_SPAN;
  const headHalfTex = faceFrame ? Math.max(faceFrame.headHalf, faceFrame.faceHalf) : Math.max(6, (landmarks.neckY - landmarks.top) * 0.42);
  const headRadiusWX = Math.max(0.04, headHalfTex * texelWorld);
  const headRadiusWY = Math.max(0.04, ((landmarks.neckY - landmarks.top) * 0.5) * texelWorld);

  const frontTfStd = options.photoTransforms?.front;
  const frontAspectXStd = Math.max(
    0.35,
    Math.min(2.8, (frontTfStd?.scaleX ?? 1) / Math.max(0.2, frontTfStd?.scaleY ?? 1))
  );
  const transformHeadPoint3D = (
    tx: number,
    ty: number,
    zfRaw: number,
    zbRaw: number,
    onEdge: boolean
  ): [number, number, number, number] => {
    let wx = (tx / (w - 1) - 0.5) * WORLD_SPAN * frontAspectXStd;
    let wy = (0.5 - ty / (w - 1)) * WORLD_SPAN;
    let zf = zfRaw;
    let zb = zbRaw;
    if (isFreeform) return [wx, wy, zf, zb];

    // Peso suave de cabeza: 1.0 por encima del cuello, cae suavemente a 0 en la base del cuello
    const neckTransition = Math.max(2.5, cs * 2.2);
    const tNeck = (ty - (headPivotTy - neckTransition * 0.35)) / neckTransition;
    const clampedT = Math.max(0, Math.min(1, tNeck));
    const wHead = 1 - clampedT * clampedT * (3 - 2 * clampedT);

    if (wHead > 0.001) {
      // 1) Redondez 3D de la silueta y cúpula craneal (headRoundness)
      if (Math.abs(headRoundness - 1.0) > 0.005) {
        const nx = (wx - headPivotWX) / headRadiusWX;
        const ny = (wy - headCenterWY) / headRadiusWY;
        const r = Math.hypot(nx, ny);
        if (r > 0.02 && r < 1.65) {
          const theta = Math.atan2(ny, nx);
          // cos(4*theta) es -1 en las esquinas diagonales (sienes y ángulos mandibulares) y +1 en los ejes
          const cornerTerm = -Math.cos(4 * theta);
          const roundDelta =
            headRoundness >= 1.0
              ? -(headRoundness - 1.0) * 0.085 * cornerTerm
              : (1.0 - headRoundness) * 0.115 * cornerTerm;
          const radialScale = 1 + roundDelta * wHead * Math.min(1, r);
          wx = headPivotWX + (wx - headPivotWX) * radialScale;
          wy = headCenterWY + (wy - headCenterWY) * radialScale;
        }
        if (!onEdge && r < 1.25) {
          const dome = Math.sqrt(Math.max(0, 1 - Math.min(1, r * r * 0.72)));
          const zBulge = (headRoundness - 1.0) * headRadiusWX * 0.34 * dome * wHead;
          zf = Math.max(0, zf + zBulge);
          zb = Math.max(0, zb + zBulge * 0.85);
        }
      }

      // 2) Tamaño total de la cabeza (headScale) alrededor de la unión con el cuello
      if (Math.abs(headScale - 1.0) > 0.002) {
        const s = 1 + (headScale - 1.0) * wHead;
        wx = headPivotWX + (wx - headPivotWX) * s;
        wy = headPivotWY + (wy - headPivotWY) * s;
        zf *= s;
        zb *= s;
      }
    }

    return [wx, wy, zf, zb];
  };

  for (let n = 0; n < nNodes; n++) {
    const f = frontIdx[n];
    if (f < 0) continue;
    const b = f + nUsed;
    const tx = nodeX[n];
    const ty = nodeY[n];
    const onEdge = isBoundary(n);
    const zfRaw = onEdge ? 0 : sample(_frontD, w, tx, ty) * zScale;
    const zbRaw = onEdge ? 0 : sample(_backD, w, tx, ty) * zScale;
    const [wx, wy, zf, zb] = transformHeadPoint3D(tx, ty, zfRaw, zbRaw, onEdge);
    let zCenterTex = 0;
    if (landmarks.zCenterByRow) {
      const yClamped = Math.max(0, Math.min(w - 1.0001, ty));
      const y0 = Math.floor(yClamped);
      const fy = yClamped - y0;
      zCenterTex =
        landmarks.zCenterByRow[y0] * (1 - fy) +
        landmarks.zCenterByRow[Math.min(w - 1, y0 + 1)] * fy;
    }
    const zCenterShift = zCenterTex * zScale;
    pos[f * 3] = wx;
    pos[f * 3 + 1] = wy;
    pos[f * 3 + 2] = zCenterShift + zf;
    pos[b * 3] = wx;
    pos[b * 3 + 1] = wy;
    pos[b * 3 + 2] = zCenterShift - zb;

    // Texture lookup moves slightly inside near the outline, so the drawing's
    // dark outline / background never paints the rim. When profile seam texturing is active,
    // use a minimal inset (0.35 px) so the 5.6 cm profile seam band on the rim is sampled cleanly.
    let sx = tx;
    let sy = ty;
    const dist = sample(_dist, w, tx, ty);
    const hasProfileSeam =
      orthogonalMode &&
      (options.profileSeamWidthCm ?? 5.6) > 0 &&
      Boolean(inputs.atlas?.sideProfile || inputs.atlas?.sideLeftProfile);
    const maxInset = hasProfileSeam ? 0.35 : 1.6;
    const inset = Math.max(0, maxInset - dist);
    if (inset > 0) {
      const gx = 0.5 * (sample(_field, w, tx + 1, ty) - sample(_field, w, tx - 1, ty));
      const gy = 0.5 * (sample(_field, w, tx, ty + 1) - sample(_field, w, tx, ty - 1));
      const gl = Math.hypot(gx, gy);
      if (gl > 1e-5) {
        sx += (gx / gl) * inset;
        sy += (gy / gl) * inset;
      }
    }
    const u = Math.max(0, Math.min(1, sx / (w - 1)));
    const v = Math.max(0, Math.min(1, sy / (w - 1)));
    uv[f * 2] = 0.002 + u * 0.495;
    uv[f * 2 + 1] = 0.002 + v * 0.495;
    uv[b * 2] = 0.502 + u * 0.495;
    uv[b * 2 + 1] = 0.002 + v * 0.495;
  }

  // Calcular las coordenadas 3D exactas de cada punto facial (nariz, órbitas, boca, mentón y cabeza)
  if (faceFrame) {
    const { cx, faceHalf, yOf } = faceFrame;
    const evalFeaturePt = (uOff: number, vTarget: number): [number, number, number] => {
      const tx = Math.max(0, Math.min(w - 1, cx + uOff * faceHalf));
      const ty = Math.max(0, Math.min(w - 1, yOf(vTarget)));
      // Tomamos el máximo local en un pequeño radio de 1.5 texels para posarse justo en la cumbre del rasgo
      let bestZf = sample(_frontD, w, tx, ty) * zScale;
      for (const dy of [-1, 0, 1]) {
        for (const dx of [-1, 0, 1]) {
          const zCandidate = sample(_frontD, w, tx + dx * 0.8, ty + dy * 0.8) * zScale;
          if (zCandidate > bestZf) bestZf = zCandidate;
        }
      }
      const [wx, wy, zf] = transformHeadPoint3D(tx, ty, bestZf, 0, false);
      return [wx, wy, zf + 0.008];
    };

    const eyeU = (options.eyeSocketShape ?? 'almond') === 'wide' ? 0.34 : 0.32;
    const eyeX = options.eyeSocketXOffset ?? 0;
    const eyeV = 0.565 - (options.eyeSocketYOffset ?? 0);
    const noseX = options.noseXOffset ?? 0;
    const noseV = 0.73 - (options.noseYOffset ?? 0);
    const mouthX = options.mouthXOffset ?? 0;
    const mouthV = 0.842 - (options.mouthYOffset ?? 0);
    const chinX = options.chinXOffset ?? 0;
    const chinV = 0.95 - (options.chinYOffset ?? 0);

    landmarks.facePoints3D = {
      head: evalFeaturePt(0, 0.48),
      nose: evalFeaturePt(noseX, noseV),
      eyes: evalFeaturePt(eyeX, eyeV),
      leftEye: evalFeaturePt(-eyeU + eyeX, eyeV),
      rightEye: evalFeaturePt(eyeU + eyeX, eyeV),
      mouth: evalFeaturePt(mouthX, mouthV),
      chin: evalFeaturePt(chinX, chinV),
      headRadiusWorld: headRadiusWX * headScale,
      faceHalfWorld: Math.max(0.03, faceHalf * texelWorld * headScale),
    };
  }

  // 5) Triangles. Texel y grows downwards, world y upwards.
  let activeQuads = 0;
  for (let q = 0; q < quadOn.length; q++) activeQuads += quadOn[q];
  const index = new Uint32Array(activeQuads * 12);
  let ip = 0;
  for (let j = 0; j < qRows; j++) {
    for (let i = 0; i < qCols; i++) {
      if (!quadOn[j * qCols + i]) continue;
      const a = frontIdx[j * nCols + i];
      const b = frontIdx[j * nCols + i + 1];
      const c = frontIdx[(j + 1) * nCols + i];
      const d = frontIdx[(j + 1) * nCols + i + 1];
      // Front (+Z)
      index[ip++] = a; index[ip++] = c; index[ip++] = b;
      index[ip++] = b; index[ip++] = c; index[ip++] = d;
      // Back (-Z), reversed winding
      index[ip++] = a + nUsed; index[ip++] = b + nUsed; index[ip++] = c + nUsed;
      index[ip++] = b + nUsed; index[ip++] = d + nUsed; index[ip++] = c + nUsed;
    }
  }

  // 6) Smooth normals; front and back copies of an outline node share one normal
  //    so the rim is shaded as one continuous surface.
  for (let t = 0; t < ip; t += 3) {
    const i0 = index[t] * 3;
    const i1 = index[t + 1] * 3;
    const i2 = index[t + 2] * 3;
    const e1x = pos[i1] - pos[i0];
    const e1y = pos[i1 + 1] - pos[i0 + 1];
    const e1z = pos[i1 + 2] - pos[i0 + 2];
    const e2x = pos[i2] - pos[i0];
    const e2y = pos[i2 + 1] - pos[i0 + 1];
    const e2z = pos[i2 + 2] - pos[i0 + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const vi of [i0, i1, i2]) {
      nor[vi] += nx;
      nor[vi + 1] += ny;
      nor[vi + 2] += nz;
    }
  }
  for (let n = 0; n < nNodes; n++) {
    const f = frontIdx[n];
    if (f < 0 || !isBoundary(n)) continue;
    const b = f + nUsed;
    for (let c = 0; c < 3; c++) {
      const s = nor[f * 3 + c] + nor[b * 3 + c];
      nor[f * 3 + c] = s;
      nor[b * 3 + c] = s;
    }
  }
  for (let v = 0; v < vCount; v++) {
    const l = Math.hypot(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]) || 1;
    nor[v * 3] /= l;
    nor[v * 3 + 1] /= l;
    nor[v * 3 + 2] /= l;
  }

  // 7) Shoes: one per leg, with a flat sole, the toe forward and the heel back.
  const shoes = options.shoes === false ? [] : buildShoes(mask, w, landmarks, texelWorld);
  let shoeVerts = 0;
  let shoeIdx = 0;
  for (const sh of shoes) {
    shoeVerts += sh.pos.length / 3;
    shoeIdx += sh.index.length;
  }
  const total = vCount + shoeVerts;
  if (total > inputs.maxVertices) shoes.length = 0;
  const allCount = shoes.length ? total : vCount;
  const P = new Float32Array(allCount * 3);
  const N = new Float32Array(allCount * 3);
  const U = new Float32Array(allCount * 2);
  const C = new Float32Array(allCount * 3).fill(1);
  const I = new Uint32Array(ip + (shoes.length ? shoeIdx : 0));
  P.set(pos);
  N.set(nor);
  U.set(uv);
  I.set(index.subarray(0, ip));
  let vb = vCount;
  let ib = ip;
  const shoeRanges: Array<{ start: number; count: number; side: -1 | 1; soleY: number; height: number }> = [];
  for (const sh of shoes) {
    const n = sh.pos.length / 3;
    P.set(sh.pos, vb * 3);
    N.set(sh.nor, vb * 3);
    U.set(sh.uv, vb * 2);
    for (let k = 0; k < sh.index.length; k++) I[ib + k] = sh.index[k] + vb;
    shoeRanges.push({ start: vb, count: n, side: sh.side, soleY: sh.soleY, height: sh.height });
    vb += n;
    ib += sh.index.length;
  }

  // Skeleton + skin weights (optional).
  let rig: HumanRig | undefined;
  if (options.rig) {
    rig = options.customRig
      ? {
          bones: options.customRig.bones.map((b) => ({
            name: b.name,
            parent: b.parent,
            head: [...b.head] as [number, number, number],
            tail: [...b.tail] as [number, number, number],
          })),
        }
      : computeHumanRig(mask, w, landmarks, WORLD_SPAN);
    const maps = computeSkinWeightMaps(rig, mask, w, WORLD_SPAN);
    const skinIndex = new Uint16Array(allCount * 4);
    const skinWeight = new Float32Array(allCount * 4);
    for (let n = 0; n < nNodes; n++) {
      const f = frontIdx[n];
      if (f < 0) continue;
      sampleSkinWeights(maps, mask, w, nodeX[n], nodeY[n], skinIndex, skinWeight, f * 4);
      const b = f + nUsed;
      for (let k = 0; k < 4; k++) {
        skinIndex[b * 4 + k] = skinIndex[f * 4 + k];
        skinWeight[b * 4 + k] = skinWeight[f * 4 + k];
      }
    }
    // Shoes follow the foot, blending into the shin at the top.
    const boneIndex = (name: string) => Math.max(0, rig!.bones.findIndex((b) => b.name === name));
    for (const r of shoeRanges) {
      const sideName = r.side < 0 ? 'Right' : 'Left';
      const foot = boneIndex(`${sideName}Foot`);
      const leg = boneIndex(`${sideName}Leg`);
      for (let v = r.start; v < r.start + r.count; v++) {
        const t = (P[v * 3 + 1] - r.soleY) / Math.max(1e-6, r.height);
        const wLeg = Math.max(0, Math.min(0.5, (t - 0.55) * 1.2));
        skinIndex[v * 4] = foot;
        skinWeight[v * 4] = 1 - wLeg;
        skinIndex[v * 4 + 1] = leg;
        skinWeight[v * 4 + 1] = wLeg;
      }
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  } else {
    if (geometry.getAttribute('skinIndex')) geometry.deleteAttribute('skinIndex');
    if (geometry.getAttribute('skinWeight')) geometry.deleteAttribute('skinWeight');
  }

  const usedNodeX = new Float32Array(nUsed);
  const usedNodeY = new Float32Array(nUsed);
  for (let n = 0; n < nNodes; n++) {
    const f = frontIdx[n];
    if (f >= 0) {
      usedNodeX[f] = nodeX[n];
      usedNodeY[f] = nodeY[n];
    }
  }
  const rebindData: HumanRebindData = {
    mask: mask.slice(),
    w,
    landmarks,
    nUsed,
    allCount,
    usedNodeX,
    usedNodeY,
    shoeRanges,
  };

  inputs.vertexUsedMask.fill(0);
  inputs.vertexUsedMask.fill(1, 0, allCount);

  geometry.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geometry.setIndex(new THREE.BufferAttribute(I, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return { vertexCount: allCount, triangleCount: I.length / 3, landmarks, rig, rebindData };
}

export interface HumanRebindData {
  mask: Uint8Array;
  w: number;
  landmarks: HumanBodyLandmarks;
  nUsed: number;
  allCount: number;
  usedNodeX: Float32Array;
  usedNodeY: Float32Array;
  shoeRanges: Array<{ start: number; count: number; side: -1 | 1; soleY: number; height: number }>;
}

export function rebindHumanGeometry(
  geometry: THREE.BufferGeometry,
  rig: HumanRig,
  data: HumanRebindData
): void {
  const { mask, w, nUsed, allCount, usedNodeX, usedNodeY, shoeRanges } = data;
  const maps = computeSkinWeightMaps(rig, mask, w, WORLD_SPAN);
  const skinIndex = new Uint16Array(allCount * 4);
  const skinWeight = new Float32Array(allCount * 4);
  for (let f = 0; f < nUsed; f++) {
    sampleSkinWeights(maps, mask, w, usedNodeX[f], usedNodeY[f], skinIndex, skinWeight, f * 4);
    const b = f + nUsed;
    if (b < allCount) {
      for (let k = 0; k < 4; k++) {
        skinIndex[b * 4 + k] = skinIndex[f * 4 + k];
        skinWeight[b * 4 + k] = skinWeight[f * 4 + k];
      }
    }
  }
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  const P = posAttr ? (posAttr.array as Float32Array) : null;
  const boneIndex = (name: string) => Math.max(0, rig.bones.findIndex((b) => b.name === name));
  if (P) {
    for (const r of shoeRanges) {
      const sideName = r.side < 0 ? 'Right' : 'Left';
      const foot = boneIndex(`${sideName}Foot`);
      const leg = boneIndex(`${sideName}Leg`);
      for (let v = r.start; v < r.start + r.count; v++) {
        const t = (P[v * 3 + 1] - r.soleY) / Math.max(1e-6, r.height);
        const wLeg = Math.max(0, Math.min(0.5, (t - 0.55) * 1.2));
        skinIndex[v * 4] = foot;
        skinWeight[v * 4] = 1 - wLeg;
        skinIndex[v * 4 + 1] = leg;
        skinWeight[v * 4 + 1] = wLeg;
      }
    }
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
}

interface ShoePart {
  side: -1 | 1;
  pos: Float32Array;
  nor: Float32Array;
  uv: Float32Array;
  index: Uint32Array;
  soleY: number;
  height: number;
}

/**
 * Builds a shoe for each leg: an ellipsoid stretched along Z (toe forward,
 * heel back), lower towards the toe and cut flat at the sole. It is textured
 * with the front image of the boot and covers the end of the leg.
 */
function buildShoes(mask: Uint8Array, w: number, lm: HumanBodyLandmarks, texelWorld: number): ShoePart[] {
  const H = lm.bottom - lm.top + 1;
  if (H < 20) return [];
  const ax = lm.axisX;
  const ankleY = Math.round(lm.bottom - 0.075 * H);
  const parts: ShoePart[] = [];
  const toWX = (tx: number) => (tx / (w - 1) - 0.5) * WORLD_SPAN;
  const toWY = (ty: number) => (0.5 - ty / (w - 1)) * WORLD_SPAN;

  for (const side of [-1, 1] as const) {
    // Width of the leg just above the ankle (the shin). The bottom rows are
    // not used: sandals, floor shadows or toes would make the foot too wide.
    const halves: number[] = [];
    const centers: number[] = [];
    for (let y = Math.round(lm.bottom - 0.17 * H); y <= Math.round(lm.bottom - 0.1 * H); y++) {
      const runs = rowRuns(mask, w, y);
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (const [a, b] of runs) {
        // A run spanning the axis holds both legs: keep this side's half.
        const lo = side < 0 ? a : Math.max(a, Math.ceil(ax));
        const hi = side < 0 ? Math.min(b, Math.floor(ax)) : b;
        if (hi - lo < 1) continue;
        const d = Math.abs((lo + hi) / 2 - ax);
        if (d > 0.3 * H) continue;
        if (d < bestD) {
          bestD = d;
          best = [lo, hi];
        }
      }
      if (best) {
        halves.push((best[1] - best[0] + 1) / 2);
        centers.push((best[0] + best[1]) / 2);
      }
    }
    if (halves.length < 2) continue;
    halves.sort((p, q) => p - q);
    centers.sort((p, q) => p - q);
    const legHalfTex = halves[halves.length >> 1];
    const legCenterTex = centers[centers.length >> 1];
    const minX = legCenterTex - legHalfTex;
    const maxX = legCenterTex + legHalfTex;

    const halfW = legHalfTex * texelWorld;
    const cx = toWX(legCenterTex);
    const soleY = toWY(lm.bottom + 0.5);
    // Normal foot proportions: length ~15.5% of the body height, ankle a
    // quarter of the way from the heel, toe low and slightly pointed.
    const length = 0.155 * H * texelWorld;
    const height0 = 0.09 * H * texelWorld; // heel / ankle height
    // The heel must still cover the back of the leg above it.
    const heelZ = -Math.max(0.25 * length, halfW * 0.95);
    // ...and the toe always reaches well past the front of the leg.
    const toeZ = Math.max(0.75 * length, halfW * 0.9 + 0.45 * length);
    const span = toeZ - heelZ;

    // Boot shape from a sphere: boxier section, flat sole, high heel side, low toe.
    const box = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
    const sphere = new THREE.SphereGeometry(1, 32, 20);
    const sp = sphere.getAttribute('position') as THREE.BufferAttribute;
    const n = sp.count;
    const pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const ux = box(sp.getX(i), 0.55);
      const uy = box(sp.getY(i), 0.5);
      const uz = box(sp.getZ(i), 0.7);
      const t = (uz + 1) / 2; // 0 = heel, 1 = toe
      const toeT = Math.max(0, Math.min(1, (t - 0.3) / 0.7));
      const ts = toeT * toeT * (3 - 2 * toeT);
      const hp = 1 - 0.58 * ts; // low toe, smooth instep
      const wp = 0.96 + 0.05 * Math.sin(Math.PI * Math.min(1, t * 1.15)) - 0.28 * ts * ts;
      // En la parte superior de la bota (uy > 0.25), recoger suavemente la puntera hacia el eje de la espinilla
      // para que la bota se funda sin escalón con la pierna que sube desde el tobillo.
      const topCollarT = Math.max(0, Math.min(1, (uy - 0.25) / 0.75));
      const collarBlend = topCollarT * topCollarT * (3 - 2 * topCollarT);
      const rawZ = heelZ + t * span;
      const ankleAlignedZ = (t - 0.46) * (halfW * 1.85);
      const X = cx + ux * halfW * wp;
      const Y = soleY + ((uy + 1) / 2) * height0 * hp;
      const Z = lerp(rawZ, ankleAlignedZ, collarBlend * 0.55);
      pos[i * 3] = X;
      pos[i * 3 + 1] = Y;
      pos[i * 3 + 2] = Z;
      // Front projection of the boot, kept inside the foot's own pixels.
      const tx = Math.max(minX + 1, Math.min(maxX - 1, (X / WORLD_SPAN + 0.5) * (w - 1)));
      const ty = Math.max(ankleY - 0.065 * H, Math.min(lm.bottom - 1.5, (0.5 - Y / WORLD_SPAN) * (w - 1)));
      uv[i * 2] = 0.002 + (tx / (w - 1)) * 0.495;
      uv[i * 2 + 1] = 0.002 + (ty / (w - 1)) * 0.495;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(sphere.getIndex());
    g.computeVertexNormals();
    const idx = sphere.getIndex()!;
    const index = new Uint32Array(idx.count);
    for (let k = 0; k < idx.count; k++) index[k] = idx.getX(k);
    parts.push({
      side,
      pos,
      nor: (g.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array,
      uv,
      index,
      soleY,
      height: height0,
    });
    sphere.dispose();
    g.dispose();
  }
  return parts;
}

/** Debug helper: depth map (texels), core mask and landmarks for a silhouette. */
export function debugHumanDepthMap(mask: Uint8Array, w: number, rgb?: Float32Array) {
  ensureBuffers(w);
  const landmarks = buildHumanDepthMap(mask, w, rgb);
  return { landmarks, depth: _depth.slice(), core: _coreMask.slice() };
}
