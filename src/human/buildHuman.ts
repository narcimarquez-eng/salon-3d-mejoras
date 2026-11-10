// ============================================================================
// HUMANO DESDE IMÁGENES
// ----------------------------------------------------------------------------
// Junta las piezas portadas de Vortex3D (repo 3d-con-imagenes) y devuelve algo
// que salon-3d pueda montar en su escena: una malla (o SkinnedMesh con sus
// animaciones) con la textura sacada de las propias fotos.
//
//   fotos -> imagePrep (recorte, silueta, relieve, atlas)
//         -> humanBodyTemplate (cuerpo cerrado ajustado a la silueta)
//         -> humanRig (19 huesos, pesos de piel y 4 animaciones)
// ============================================================================

import * as THREE from 'three';
import {
  buildHumanBodyTemplateGeometry,
  hasProfileDriven3DFeatures,
  maskFromCutoutAndPaint,
  rebindHumanGeometry,
  type ActiveFaceFeatureId,
  type ChinShapeId,
  type EyeSocketShapeId,
  type FaceFeaturePoints3D,
  type FaceModelId,
  type HumanBodyLandmarks,
  type HumanRebindData,
  type MouthShapeId,
  type NoseShapeId,
  type ProfileSeamViewInput,
} from './humanBodyTemplate';

export type {
  ActiveFaceFeatureId,
  FaceFeaturePoints3D,
  FaceModelId,
  NoseShapeId,
  MouthShapeId,
  ChinShapeId,
  EyeSocketShapeId,
};
import {
  computeHumanRig,
  createHumanAnimationClips,
  createSkeletonBones,
  type HumanRig,
} from './humanRig';
import {
  attachHumanEquipment,
  type HumanOffhandId,
  type HumanWeaponId,
} from './humanWeapons';
import { LAYER_CLASSES } from './layerMap';
import { createCreatureAnimationClips } from './creatureAnimations';
import { applyLimbAndFaceExtras } from './limbFaceExtras';
import { syncFaceDuplicates, type FacePartId } from './faceTexture';
import {
  averageSilhouettes,
  estimateOutlineThickness,
  largestBlobBounds as figureBounds,
  maskIoU,
  mirrorMaskX,
  trimOutline,
} from './maskRefine';
import {
  ATLAS,
  DEFAULT_CUTOUT,
  DEFAULT_PHOTO_TRANSFORM,
  TENSOR,
  TENSOR_LEN,
  alignBackViewToFront,
  applyPhotoTransformToPreparedView,
  buildAtlas,
  computeRelativePhotoTransform,
  fitImageToTensor,
  getCutoutBounds,
  getPhotoRecuadroBox,
  isPhotoTransformModified,
  loadLayerMap,
  photoTransformFromRecuadroBox,
  prepareView,
  type CutoutBounds,
  type CutoutSettings,
  type LayerMapBuffers,
  type PhotoRecuadroBox,
  type PhotoTransform,
  type PhotoTransformSlotId,
  type PhotoTransformsMap,
  type TensorCrop,
  type CleanPoint,
} from './imagePrep';

export {
  DEFAULT_PHOTO_TRANSFORM,
  computeRelativePhotoTransform,
  getCutoutBounds,
  getPhotoRecuadroBox,
  isPhotoTransformModified,
  photoTransformFromRecuadroBox,
};
export type {
  CutoutBounds,
  PhotoRecuadroBox,
  PhotoTransform,
  PhotoTransformSlotId,
  PhotoTransformsMap,
};

/** Tope de vértices ampliado para soportar hasta 1000 filas de malla con máxima definición. */
export const MAX_HUMAN_VERTICES = 600000;

export interface HumanImageSet {
  front: HTMLImageElement;
  back?: HTMLImageElement | null;
  /** Vista de perfil principal (o perfil derecho en hojas de 4 columnas): de ahí sale el grosor real del cuerpo a cada altura y la textura de unión. */
  side?: HTMLImageElement | null;
  /** Segunda vista de perfil (perfil izquierdo en hojas de 4 columnas). */
  sideLeft?: HTMLImageElement | null;
  /** Vista superior (cenital): tercer plano ortográfico, da el ancho a lo largo del cuerpo. */
  top?: HTMLImageElement | null;
  frontLayer?: HTMLImageElement | null;
  backLayer?: HTMLImageElement | null;
  sideLayer?: HTMLImageElement | null;
  sideLeftLayer?: HTMLImageElement | null;
  topLayer?: HTMLImageElement | null;
}

export interface HumanBuildOptions {
  /** Profundidad general del cuerpo (1 = proporciones humanas naturales). */
  depthScale: number;
  /** Cuánto relieve de la foto se añade encima (0..1). */
  reliefAmount: number;
  /** Cuánto talla la vista superior el molde 3D (0 = ignorarla, 1 = casco visual completo). */
  topStrength: number;
  /**
   * Píxeles de línea de contorno que se recortan de cada silueta.
   * -1 = automático (mide el grosor del borde oscuro del dibujo), 0 = desactivado.
   */
  outlineTrimPx: number;
  /** Promediar perfil derecho e izquierdo cuando están los dos (corrige la asimetría de la pose). */
  mergeProfiles: boolean;
  /** Usar solo el perfil principal: se ignora la foto del 2.º perfil aunque esté cargada. */
  singleProfile?: boolean;
  /** Patas y colas pinchadas en la imagen de detección: se limpian los hilos que las unen. */
  cleanPoints?: CleanPoint[];
  /** Orientación de la vista superior: 'auto', o forzar la cabeza al principio / al final de su eje largo. */
  topOrientation: 'auto' | 'head-first' | 'tail-first';
  /**
   * Qué esqueleto montar. 'auto' lo decide por la forma de la malla: un bicho
   * horizontal recibe el de criatura (cuadrúpedo, con alas si las tiene) y una
   * figura erguida el humanoide de 19 huesos.
   */
  rigKind: 'auto' | 'human' | 'creature';
  /** Filas de malla sobre la altura de la figura. */
  rows: number;
  /**
   * Modo ortogonal 4 vistas + unión de perfil:
   * - Silueta izquierda/derecha de la imagen delantera
   * - Textura delantera de la imagen delantera y trasera de la imagen trasera (alineada a la silueta frontal)
   * - Silueta frente/atrás de la imagen lateral
   * - Textura alrededor de la unión lateral (~5,6 cm) sacada de las imágenes de perfil
   */
  orthogonalSilhouetteAndSeam: boolean;
  /** Ancho total en centímetros (p. ej. 5.6 cm) alrededor de la unión lateral tomado de las imágenes de perfil. */
  profileSeamWidthCm: number;
  /** Porcentaje de aplicación de la textura de los perfiles en todo el perfil (0% = solo Frente delante y Atrás detrás; 100% = aplicación total del perfil). */
  profileTexturePct?: number;
  /** Origen de la textura difusa ('original' = fotos originales, 'layerMap' = mapa de colores). */
  textureSource?: 'original' | 'layerMap';
  /** Construcción libre basada únicamente en las fotos para generar el molde 3D (sin molde anatómico previo). */
  freeformFromPhotos: boolean;
  /** Intensidad del volumen macroscópico extraído del relieve/luminancia de las fotos en construcción libre (0..2). */
  freeformPhotoVolume: number;
  /** Curvatura / redondez de la sección transversal en construcción libre (0.3..2.5, 1 = orgánico). */
  freeformSectionRoundness: number;
  /** Tamaño total 3D de la cabeza (0.4..2.5, 1 = original). */
  headScale: number;
  /** Forma / redondez 3D de la cabeza (0.2 = angulosa/cuadrada, 1 = natural, 2.5 = muy redondeada/esférica). */
  headRoundness: number;
  /** Fuerza global de los rasgos de la cara (0 = ninguno, 1 = natural). */
  faceDetail: number;
  /** Activar huesos/rasgos de cara predeterminados en vez de basar la cabeza solo en la imagen y perfil. */
  presetFaceFeatures: boolean;
  /** Modelo / arquetipo de cara 3D. */
  faceModel: FaceModelId;
  /** Tamaño / proyección de la nariz (0..6.0). */
  noseSize: number;
  /** Forma de la nariz. */
  noseShape: NoseShapeId;
  /** Posición horizontal X de la nariz (-0.5..+0.5, positivo = derecha). */
  noseXOffset: number;
  /** Posición vertical Y de la nariz (-0.5..+0.5, positivo = más arriba). */
  noseYOffset: number;
  /** Posición profundidad Z de la nariz (-0.6..+0.8, positivo = más afuera). */
  noseZOffset: number;
  /** Tamaño / volumen de la boca y labios (0..6.0). */
  mouthSize: number;
  /** Forma de la boca. */
  mouthShape: MouthShapeId;
  /** Posición horizontal X de la boca (-0.5..+0.5, positivo = derecha). */
  mouthXOffset: number;
  /** Posición vertical Y de la boca y labios (-0.5..+0.5, positivo = más arriba). */
  mouthYOffset: number;
  /** Posición profundidad Z de la boca y labios (-0.6..+0.8, positivo = más afuera). */
  mouthZOffset: number;
  /** Tamaño / proyección del mentón y mandíbula (0..6.0). */
  chinSize: number;
  /** Forma del mentón. */
  chinShape: ChinShapeId;
  /** Posición horizontal X del mentón (-0.5..+0.5, positivo = derecha). */
  chinXOffset: number;
  /** Posición vertical Y del mentón (-0.5..+0.5, positivo = más arriba). */
  chinYOffset: number;
  /** Posición profundidad Z del mentón (-0.6..+0.8, positivo = más afuera). */
  chinZOffset: number;
  /** Tamaño / profundidad de las órbitas de los ojos y cejas (0..6.0). */
  eyeSocketSize: number;
  /** Forma de las órbitas de los ojos. */
  eyeSocketShape: EyeSocketShapeId;
  /** Posición horizontal X de las órbitas de los ojos (-0.5..+0.5, positivo = derecha). */
  eyeSocketXOffset: number;
  /** Posición vertical Y de las órbitas de los ojos (-0.5..+0.5, positivo = más arriba). */
  eyeSocketYOffset: number;
  /** Posición profundidad Z de las órbitas de los ojos (-0.6..+0.8, positivo = más afuera). */
  eyeSocketZOffset: number;
  /** Multiplicador de altura del mapa de capas pintado. */
  layerStrength: number;
  /** Crear esqueleto, pesos de piel y animaciones. */
  rig: boolean;
  /** Esqueleto personalizado (si el usuario movió articulaciones). */
  customRig?: HumanRig | null;
  /** Añadir botas. */
  shoes: boolean;
  /** Cuánto manda el perfil sobre el grosor del cuerpo (0 = nada, 1 = del todo). */
  sideStrength: number;
  /** Escala la metalicidad del atlas (1 = igual que Vortex3D). */
  metalMix: number;
  /** Fuerza del mapa de normales. */
  normalStrength: number;
  /** Arma principal 3D de Enemigo-rpg en la mano derecha. */
  weapon: HumanWeaponId;
  /** Escudo / mano izquierda secundaria 3D de Enemigo-rpg. */
  offhand: HumanOffhandId;
  /**
   * Modo patas y rabos: corta los hilos finos que unen dos partes en cada
   * silueta antes de rellenar huecos, y detecta patas y rabos. No cambia cómo
   * se crea el molde: solo limpia lo que recibe.
   */
  separateLimbs?: boolean;
  /** Grosor máximo de un hilo, en píxeles del tensor de 256. */
  threadWidth?: number;
  /** Partes de la cara sacadas de la foto de frente en alta resolución (vacío = ninguna). */
  faceParts?: FacePartId[];
  /** Sin foto de espalda, quitar de la nuca los ojos y la boca del frente espejado. */
  clearNape?: boolean;
  cutout?: CutoutSettings;
  /** Transformaciones interactivas de posición, tamaño, giro y espejo por vista. */
  photoTransforms?: PhotoTransformsMap;
}

export const FACE_MODELS: { id: FaceModelId; label: string; hint: string }[] = [
  { id: 'none', label: 'Sin molde (Solo imagen y perfil)', hint: 'La cabeza se construye igual que el resto del cuerpo sin añadir rasgos prefabricados.' },
  { id: 'classic', label: 'Humano Clásico / Realista', hint: 'Proporciones anatómicas equilibradas de nariz, órbitas, pómulos, labios y mentón.' },
  { id: 'heroic', label: 'Guerrero Heroico / Mandíbula Fuerte', hint: 'Mentón cuadrado pronunciado, ceño marcado, nariz aguileña y pómulos esculpidos.' },
  { id: 'anime', label: 'Anime / Estilizado (Goku, etc.)', hint: 'Nariz fina y pequeña, órbitas grandes y suaves, boca delicada y mentón en V.' },
  { id: 'brute', label: 'Bruto / Minotauro / Orco', hint: 'Hocico o nariz ancha, arco superciliar profundo, mandíbula pesada y boca ancha.' },
  { id: 'elf', label: 'Élfico / Fino', hint: 'Puente nasal esbelto, pómulos altos, órbitas almendradas y mentón afilado.' },
  { id: 'skull', label: 'Calavera / Esqueleto', hint: 'Cavidad nasal hundida, cuencas oculares óseas profundas y arco cigomático marcado.' },
];

export const NOSE_SHAPES: { id: NoseShapeId; label: string }[] = [
  { id: 'classic', label: 'Recta / Clásica' },
  { id: 'sharp', label: 'Fina / Puntiaguda (Anime)' },
  { id: 'broad', label: 'Ancha / Chata' },
  { id: 'aquiline', label: 'Aguileña / Romana' },
  { id: 'snout', label: 'Hocico / Bestia' },
  { id: 'hollow', label: 'Hueco Nasal (Calavera)' },
];

export const MOUTH_SHAPES: { id: MouthShapeId; label: string }[] = [
  { id: 'neutral', label: 'Natural / Recta' },
  { id: 'full', label: 'Labios Carnosos' },
  { id: 'thin', label: 'Fina / Estrecha' },
  { id: 'wide', label: 'Ancha / Fiera' },
  { id: 'smile', label: 'Arco / Sonrisa' },
];

export const CHIN_SHAPES: { id: ChinShapeId; label: string }[] = [
  { id: 'rounded', label: 'Redondeado / Natural' },
  { id: 'square', label: 'Cuadrado / Fuerte' },
  { id: 'pointed', label: 'Puntiagudo / En V' },
  { id: 'cleft', label: 'Partido / Con Hoyuelo' },
  { id: 'jowls', label: 'Mandíbula Pesada / Bruto' },
];

export const EYE_SOCKET_SHAPES: { id: EyeSocketShapeId; label: string }[] = [
  { id: 'almond', label: 'Almendrada / Humana' },
  { id: 'round', label: 'Redonda / Profunda' },
  { id: 'wide', label: 'Grande / Suave (Anime)' },
  { id: 'hooded', label: 'Ceño Fruncido / Guerrero' },
  { id: 'skeletal', label: 'Cuenca Ósea (Calavera)' },
];

export function applyFaceModelPreset(
  prev: HumanBuildOptions,
  model: FaceModelId
): HumanBuildOptions {
  if (model === 'none') {
    return {
      ...prev,
      faceModel: 'none',
      presetFaceFeatures: false,
    };
  }
  if (model === 'heroic') {
    return {
      ...prev,
      faceModel: 'heroic',
      presetFaceFeatures: true,
      faceDetail: 1.15,
      noseSize: 1.15,
      noseShape: 'aquiline',
      mouthSize: 1.0,
      mouthShape: 'neutral',
      chinSize: 1.3,
      chinShape: 'square',
      eyeSocketSize: 1.2,
      eyeSocketShape: 'hooded',
    };
  }
  if (model === 'anime') {
    return {
      ...prev,
      faceModel: 'anime',
      presetFaceFeatures: true,
      faceDetail: 0.85,
      noseSize: 0.85,
      noseShape: 'sharp',
      mouthSize: 0.75,
      mouthShape: 'thin',
      chinSize: 0.95,
      chinShape: 'pointed',
      eyeSocketSize: 0.75,
      eyeSocketShape: 'wide',
    };
  }
  if (model === 'brute') {
    return {
      ...prev,
      faceModel: 'brute',
      presetFaceFeatures: true,
      faceDetail: 1.35,
      noseSize: 1.45,
      noseShape: 'snout',
      mouthSize: 1.25,
      mouthShape: 'wide',
      chinSize: 1.4,
      chinShape: 'jowls',
      eyeSocketSize: 1.35,
      eyeSocketShape: 'hooded',
    };
  }
  if (model === 'elf') {
    return {
      ...prev,
      faceModel: 'elf',
      presetFaceFeatures: true,
      faceDetail: 0.95,
      noseSize: 0.95,
      noseShape: 'sharp',
      mouthSize: 0.9,
      mouthShape: 'neutral',
      chinSize: 1.0,
      chinShape: 'pointed',
      eyeSocketSize: 0.9,
      eyeSocketShape: 'almond',
    };
  }
  if (model === 'skull') {
    return {
      ...prev,
      faceModel: 'skull',
      presetFaceFeatures: true,
      faceDetail: 1.35,
      noseSize: 1.25,
      noseShape: 'hollow',
      mouthSize: 1.1,
      mouthShape: 'wide',
      chinSize: 1.15,
      chinShape: 'square',
      eyeSocketSize: 1.45,
      eyeSocketShape: 'skeletal',
    };
  }
  // 'classic'
  return {
    ...prev,
    faceModel: 'classic',
    presetFaceFeatures: true,
    faceDetail: 1.0,
    noseSize: 1.0,
    noseShape: 'classic',
    mouthSize: 1.0,
    mouthShape: 'neutral',
    chinSize: 1.0,
    chinShape: 'rounded',
    eyeSocketSize: 1.0,
    eyeSocketShape: 'almond',
  };
}

export const FACTORY_HUMAN_OPTIONS: HumanBuildOptions = {
  depthScale: 1.0,
  reliefAmount: 0.5,
  rows: 246, // 112 * 2.2, la rejilla por defecto de Vortex3D
  orthogonalSilhouetteAndSeam: true,
  profileSeamWidthCm: 5.6,
  profileTexturePct: 0,
  textureSource: 'original',
  freeformFromPhotos: false,
  freeformPhotoVolume: 1.0,
  freeformSectionRoundness: 1.0,
  headScale: 1.0,
  headRoundness: 1.0,
  faceDetail: 1.0,
  presetFaceFeatures: false,
  faceModel: 'none',
  noseSize: 1.0,
  noseShape: 'classic',
  noseXOffset: 0.0,
  noseYOffset: 0.0,
  noseZOffset: 0.0,
  mouthSize: 1.0,
  mouthShape: 'neutral',
  mouthXOffset: 0.0,
  mouthYOffset: 0.0,
  mouthZOffset: 0.0,
  chinSize: 1.0,
  chinShape: 'rounded',
  chinXOffset: 0.0,
  chinYOffset: 0.0,
  chinZOffset: 0.0,
  eyeSocketSize: 1.0,
  eyeSocketShape: 'almond',
  eyeSocketXOffset: 0.0,
  eyeSocketYOffset: 0.0,
  eyeSocketZOffset: 0.0,
  layerStrength: 1.0,
  rig: true,
  shoes: true,
  sideStrength: 1.0,
  topStrength: 1.0,
  outlineTrimPx: -1,
  mergeProfiles: true,
  topOrientation: 'auto',
  rigKind: 'auto',
  metalMix: 0.45,
  normalStrength: 0.6,
  weapon: 'none',
  offhand: 'none',
  separateLimbs: true,
  threadWidth: 3,
  faceParts: ["eyes", "nose", "mouth", "ears"],
  clearNape: true,
};

const SAVED_DEFAULT_HUMAN_OPTIONS_KEY = 'celshade_human_default_options_v1';

export function loadSavedDefaultHumanOptions(): HumanBuildOptions {
  if (typeof window === 'undefined') return { ...FACTORY_HUMAN_OPTIONS };
  try {
    const raw = window.localStorage.getItem(SAVED_DEFAULT_HUMAN_OPTIONS_KEY);
    if (!raw) return { ...FACTORY_HUMAN_OPTIONS };
    const parsed = JSON.parse(raw) as Partial<HumanBuildOptions>;
    const merged: HumanBuildOptions = {
      ...FACTORY_HUMAN_OPTIONS,
      ...parsed,
      // No arrastrar un esqueleto fijo de una imagen anterior a una imagen nueva
      customRig: null,
    };
    return merged;
  } catch {
    return { ...FACTORY_HUMAN_OPTIONS };
  }
}

export function saveDefaultHumanOptions(opts: HumanBuildOptions): void {
  if (typeof window === 'undefined') return;
  try {
    const toSave: Partial<HumanBuildOptions> = { ...opts };
    delete toSave.customRig;
    window.localStorage.setItem(SAVED_DEFAULT_HUMAN_OPTIONS_KEY, JSON.stringify(toSave));
  } catch {
    // Ignore storage quota errors
  }
}

export function hasSavedDefaultHumanOptions(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.localStorage.getItem(SAVED_DEFAULT_HUMAN_OPTIONS_KEY));
  } catch {
    return false;
  }
}

export function clearSavedDefaultHumanOptions(): HumanBuildOptions {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(SAVED_DEFAULT_HUMAN_OPTIONS_KEY);
    } catch {
      // Ignore
    }
  }
  return { ...FACTORY_HUMAN_OPTIONS };
}

export const DEFAULT_HUMAN_OPTIONS: HumanBuildOptions = loadSavedDefaultHumanOptions();

export interface HumanBuildResult {
  /** Raíz lista para montar: contiene la malla (o SkinnedMesh) del personaje. */
  root: THREE.Group;
  mesh: THREE.Mesh | THREE.SkinnedMesh;
  clips: THREE.AnimationClip[];
  vertexCount: number;
  triangleCount: number;
  landmarks: HumanBodyLandmarks;
  rig?: HumanRig;
  rebindData?: HumanRebindData;
  /** Avisos para el usuario (sin espalda, sin mapa de capas...). */
  notes: string[];
  /** Resumen de lo detectado (patas, rabos, hilos, cara), una línea por cosa. */
  detection: string[];
  /** Imagen (data URL) con lo detectado sobre la foto de frente (y el perfil). */
  detectionPreview?: string;
}

/** Dibuja una imagen en el tensor de 256 y devuelve sus píxeles y el recorte. */
function toTensorPixels(img: HTMLImageElement): {
  pixels: Uint8ClampedArray;
  crop: TensorCrop | null;
} {
  const canvas = document.createElement('canvas');
  canvas.width = TENSOR;
  canvas.height = TENSOR;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { pixels: new Uint8ClampedArray(TENSOR_LEN * 4), crop: null };
  const crop = fitImageToTensor(ctx, img);
  return { pixels: ctx.getImageData(0, 0, TENSOR, TENSOR).data, crop };
}

function makeAtlasTexture(
  data: Uint8Array,
  colorSpace: THREE.ColorSpace
): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, ATLAS, ATLAS, THREE.RGBAFormat);
  tex.colorSpace = colorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function prepareProfileInput(
  sideImg: HTMLImageElement,
  sideLayerImg: HTMLImageElement | null | undefined,
  cut: CutoutSettings,
  freeformFromPhotos = false
): {
  view: ReturnType<typeof prepareView>;
  mask: Uint8Array;
  layer: LayerMapBuffers | null;
  profileSeam: ProfileSeamViewInput;
  hadLayerPaint: boolean;
} {
  const side = toTensorPixels(sideImg);
  const sideView = prepareView(side.pixels, false, cut);
  const sidePaint = sideLayerImg ? loadLayerMap(sideLayerImg, side.crop) : null;
  let offsets = sidePaint?.offset ?? null;
  if (offsets) {
    const clothOff = LAYER_CLASSES.find((c) => c.id === 'cloth')?.offset ?? 0.35;
    const spikesOff = LAYER_CLASSES.find((c) => c.id === 'spikes')?.offset ?? 1.8;
    let clothCount = 0;
    let spikeCount = 0;
    for (let i = 0; i < offsets.length; i++) {
      const v = offsets[i];
      if (!Number.isFinite(v)) continue;
      if (Math.abs(v - clothOff) < 0.05) clothCount++;
      if (Math.abs(v - spikesOff) < 0.10) spikeCount++;
    }
    const isWingedCreatureProfile = clothCount > 300 && spikeCount > 20;

    if (freeformFromPhotos || isWingedCreatureProfile) {
      // En modo Construcción Libre (o criaturas aladas/4 vistas) se conservan todas las clases pintadas del perfil
      // (incluidos cuernos, púas dorsales, garras, alas y cola completa) para construir el molde 3D real.
      const body = new Float32Array(offsets.length);
      for (let i = 0; i < offsets.length; i++) {
        const v = offsets[i];
        body[i] = Number.isFinite(v) ? v : NaN;
      }
      offsets = body;
    } else {
      // En modo con molde humano previo, en la parte baja del cuerpo (y >= 45%), el color amarillo ('fur')
      // suele ser una cola trasera (p. ej. Minotauro) que no está en la vista frontal y conviene
      // ignorar al medir las piernas. En cambio, en la cabeza y torso superior (y < 45%),
      // el amarillo ('fur') forma el volumen real del cráneo/pelo de perfil (p. ej. Goku).
      const fur = LAYER_CLASSES.find((c) => c.id === 'fur')?.offset;
      const spikes = LAYER_CLASSES.find((c) => c.id === 'spikes')?.offset;
      const body = new Float32Array(offsets.length);
      const lowerBodyRow = Math.round(TENSOR * 0.45);
      for (let i = 0; i < offsets.length; i++) {
        const y = (i / TENSOR) | 0;
        const v = offsets[i];
        const isLowerTailFur = y >= lowerBodyRow && v === fur;
        body[i] = Number.isFinite(v) && v !== spikes && !isLowerTailFur ? v : NaN;
      }
      offsets = body;
    }
  }
  const mask = maskFromCutoutAndPaint(sideView.cutout, TENSOR, offsets);
  return {
    view: sideView,
    mask,
    layer: sidePaint,
    profileSeam: {
      inpainted: sideView.inpainted,
      cutout: mask,
      layer: sidePaint,
    },
    hadLayerPaint: Boolean(offsets),
  };
}

/**
 * Construye el personaje. Devuelve la malla ya con material y, si se pidió
 * esqueleto, una SkinnedMesh con sus cuatro animaciones.
 */
export function buildHumanFromImages(
  images: HumanImageSet,
  optionsIn: Partial<HumanBuildOptions> = {}
): HumanBuildResult {
  const options: HumanBuildOptions = { ...DEFAULT_HUMAN_OPTIONS, ...optionsIn };
  const baseCut = options.cutout ?? DEFAULT_CUTOUT;
  // Patas y rabos: el corte de hilos va en el recorte de cada silueta. El
  // molde sigue igual; solo recibe siluetas sin membranas entre las partes.
  const cut: CutoutSettings = options.separateLimbs
    ? { ...baseCut, separateThreads: true, threadWidth: Math.max(1, Math.min(10, options.threadWidth ?? 3)) }
    : baseCut;
  const notes: string[] = [];

  // 1. Fotos -> tensores
  const front = toTensorPixels(images.front);
  const frontView = prepareView(front.pixels, false, cut);

  let backView: ReturnType<typeof prepareView> | null = null;
  let backCrop: TensorCrop | null = null;
  if (images.back) {
    const back = toTensorPixels(images.back);
    // La espalda se guarda espejada para que quede alineada con el frente.
    backView = prepareView(back.pixels, true, cut);
    backCrop = back.crop;
  } else {
    notes.push(
      'Sin foto de espalda: la parte de atrás reutiliza el frente espejado.'
    );
  }

  // 2. Perfil(es): interesa su silueta delantera y trasera por altura, y su textura para el molde 3D y unión lateral.
  let sideView: ReturnType<typeof prepareView> | null = null;
  let sideMask: Uint8Array | null = null;
  let sideLayer: LayerMapBuffers | null = null;
  let sideProfileSeam: ProfileSeamViewInput | null = null;

  let sideLeftView: ReturnType<typeof prepareView> | null = null;
  let sideLeftMask: Uint8Array | null = null;
  let sideLeftLayer: LayerMapBuffers | null = null;
  let sideLeftProfileSeam: ProfileSeamViewInput | null = null;

  const isFreeform = Boolean(options.freeformFromPhotos);

  if (images.side) {
    const rightRes = prepareProfileInput(images.side, images.sideLayer, cut, isFreeform);
    sideView = rightRes.view;
    sideMask = rightRes.mask;
    sideLayer = rightRes.layer;
    sideProfileSeam = rightRes.profileSeam;
    if (!rightRes.hadLayerPaint) {
      notes.push(
        'El perfil se mide con su silueta entera: si tiene cuernos o cola suelta, píntale el mapa de capas del perfil.'
      );
    }
  } else if (!images.sideLeft) {
    notes.push(
      isFreeform
        ? 'Construcción libre sin vista de perfil: el volumen 3D se genera directamente de la silueta y del relieve de las fotos, sin molde previo.'
        : 'Sin vista de perfil: el grosor del cuerpo sale de proporciones humanas, no del dibujo.'
    );
  }

  if (isFreeform) {
    notes.push(
      'Modo Construcción Libre activo: el molde 3D se genera 100% a raíz de la foto de perfil y frontal (hocico, cuello, patas, cola y alas en 3D) sin molde anatómico previo.'
    );
  }

  if (images.sideLeft) {
    const leftRes = prepareProfileInput(images.sideLeft, images.sideLeftLayer, cut, isFreeform);
    sideLeftView = leftRes.view;
    sideLeftMask = leftRes.mask;
    sideLeftLayer = leftRes.layer;
    sideLeftProfileSeam = leftRes.profileSeam;
    // Si solo había sideLeft pero no side, usar sideLeft también como perfil principal
    if (!sideMask) {
      sideView = sideLeftView;
      sideMask = sideLeftMask;
      sideLayer = sideLeftLayer;
      sideProfileSeam = sideLeftProfileSeam;
    }
  }

  // 2b. Vista superior (cenital): TERCER plano ortográfico. Frente y perfil miden ambos en
  //     función de la altura; la cenital da el ancho a lo largo del cuerpo, que es lo que
  //     distingue un hocico de un pecho y una cola de un torso en un cuadrúpedo.
  let topMask: Uint8Array | null = null;
  let topLayer: LayerMapBuffers | null = null;
  let topPrepared: ReturnType<typeof prepareProfileInput> | null = null;
  if (images.top) {
    const topRes = prepareProfileInput(images.top, images.topLayer, cut, isFreeform);
    topPrepared = topRes;
    topMask = topRes.mask;
    topLayer = topRes.layer;
    notes.push(
      'Vista superior activa: el molde se talla con los tres planos (frente, perfil y cenital), así que el hocico, la cola y la separación entre patas salen del dibujo y no de una estimación.'
    );
  } else if (isFreeform) {
    notes.push(
      'Sin vista superior: el ancho solo puede medirse por altura, así que en criaturas horizontales (cuadrúpedos, dragones) el hocico y la cola saldrán tan anchos como el torso. Añade una quinta columna cenital a la hoja para corregirlo.'
    );
  }

  // 2c. CONCORDANCIA ENTRE LOS DOS PERFILES.
  //     Cada vista se encuadra por su cuenta: se recorta a su contenido y se centra en el
  //     cuadrado de 256. Si una celda arrastra algo al lado de la figura (un boceto, una cota),
  //     esa figura se dibuja MÁS PEQUEÑA y, al centrarse, queda flotando a media altura
  //     mientras la otra llega al suelo. Son el mismo bicho, así que su altura y su línea de
  //     suelo tienen que coincidir: aquí se reencuadra una de las dos para que concuerden.
  //     (Al frente no se le puede igualar el perfil: el perfil es mucho más largo que alto y,
  //     estirado a la altura del frente, se saldría del lienzo. Esa diferencia la compensa el
  //     molde con su propia escala.)
  if (sideView && sideLeftView && sideMask && sideLeftMask) {
    const bR = figureBounds(sideMask, TENSOR);
    const bL = figureBounds(sideLeftMask, TENSOR);
    if (!bR.empty && !bL.empty) {
      const hR = bR.y1 - bR.y0 + 1;
      const hL = bL.y1 - bL.y0 + 1;
      const ratio = hR / Math.max(1, hL);
      if (ratio < 0.97 || ratio > 1.03) {
        const c = (TENSOR - 1) * 0.5;
        // ¿Cabe la figura pequeña si se agranda hasta la grande? Si no, se encoge la grande.
        const fits = (box: { x0: number; x1: number; y0: number; y1: number }, s: number) => {
          const halfW = Math.max(Math.abs(box.x0 - c), Math.abs(box.x1 - c)) * s;
          const halfH = Math.max(Math.abs(box.y0 - c), Math.abs(box.y1 - c)) * s;
          return halfW <= c - 2 && halfH <= c - 2;
        };
        const growRight = hR < hL;
        const sGrow = growRight ? hL / hR : hR / hL;
        const canGrow =
          sGrow <= 1.6 && fits(growRight ? bR : bL, sGrow);
        // Vista que se mueve, su caja, y a qué altura debe quedar su línea de suelo.
        const moveRight = canGrow ? growRight : !growRight;
        const view = moveRight ? sideView : sideLeftView;
        const layer = moveRight ? sideLayer : sideLeftLayer;
        const box = moveRight ? bR : bL;
        const refBox = moveRight ? bL : bR;
        const scale = (refBox.y1 - refBox.y0 + 1) / Math.max(1, box.y1 - box.y0 + 1);
        const clamped = Math.max(0.45, Math.min(2.2, scale));
        const dy = refBox.y1 - c - (box.y1 - c) * clamped;
        applyPhotoTransformToPreparedView(
          view,
          layer,
          {
            ...DEFAULT_PHOTO_TRANSFORM,
            scaleX: clamped,
            scaleY: clamped,
            offsetY: (dy / TENSOR) * 100,
          },
          true,
          false
        );
        const newMask = maskFromCutoutAndPaint(view.cutout, TENSOR, layer?.offset);
        if (moveRight) {
          sideMask = newMask;
          if (sideProfileSeam) sideProfileSeam = { ...sideProfileSeam, inpainted: view.inpainted, cutout: newMask };
        } else {
          sideLeftMask = newMask;
          if (sideLeftProfileSeam) sideLeftProfileSeam = { ...sideLeftProfileSeam, inpainted: view.inpainted, cutout: newMask };
        }
        notes.push(
          `Los dos perfiles venían a escalas distintas (alto ${hR} vs ${hL} texels): se ha reencuadrado el ${moveRight ? 'derecho' : 'izquierdo'} (x${clamped.toFixed(2)}) para que coincidan en tamaño y línea de suelo.`
        );
      }
    }
  }

  // 3. Mapas de capas pintados (opcionales)
  let frontLayer: LayerMapBuffers | null = null;
  let backLayer: LayerMapBuffers | null = null;
  if (images.frontLayer) {
    frontLayer = loadLayerMap(images.frontLayer, front.crop);
  }
  if (images.backLayer) {
    backLayer = loadLayerMap(images.backLayer, backCrop ?? front.crop);
  }
  if (!frontLayer && !backLayer) {
    notes.push(
      'Sin mapa de capas: el relieve sale del brillo de la foto, que es menos fiel que un mapa pintado.'
    );
  }

  // Aplicar rotación/espejo sobre los tensores de 256x256; el desplazamiento X/Y y el escalado del recuadro
  // se aplican analíticamente sin recortar los bordes del lienzo de 256x256.
  if (options.photoTransforms?.front) {
    applyPhotoTransformToPreparedView(frontView, frontLayer, options.photoTransforms.front, false, false);
  }
  if (backView && options.photoTransforms?.back) {
    applyPhotoTransformToPreparedView(backView, backLayer, options.photoTransforms.back, false, true);
  }
  if (sideView && options.photoTransforms?.side) {
    applyPhotoTransformToPreparedView(sideView, sideLayer, options.photoTransforms.side, false, false);
    if (sideMask) {
      sideMask = maskFromCutoutAndPaint(sideView.cutout, TENSOR, sideLayer?.offset);
    }
  }
  if (topMask && options.photoTransforms?.top) {
    applyPhotoTransformToPreparedView(topPrepared!.view, topLayer, options.photoTransforms.top, false, false);
    topMask = maskFromCutoutAndPaint(topPrepared!.view.cutout, TENSOR, topLayer?.offset);
  }
  if (sideLeftView && options.photoTransforms?.sideLeft) {
    applyPhotoTransformToPreparedView(sideLeftView, sideLeftLayer, options.photoTransforms.sideLeft, false, false);
    if (sideLeftMask) {
      sideLeftMask = maskFromCutoutAndPaint(sideLeftView.cutout, TENSOR, sideLeftLayer?.offset);
    }
  }

  let frontMask = maskFromCutoutAndPaint(frontView.cutout, TENSOR, frontLayer?.offset);
  let rawBackMask = backView
    ? maskFromCutoutAndPaint(backView.cutout, TENSOR, backLayer?.offset, true)
    : frontMask;

  // 3b. Recorte de la línea de contorno. En arte cel-shade la línea negra forma parte del
  //     recorte, así que cada vista sale engordada media línea por lado y el error se suma al
  //     cruzar las vistas. Se mide el grosor real del borde oscuro y se recorta la mitad.
  const trimOption = options.outlineTrimPx ?? -1;
  let trimPx = 0;
  if (trimOption !== 0) {
    trimPx =
      trimOption > 0
        ? Math.min(3, Math.round(trimOption))
        : Math.min(3, Math.floor(estimateOutlineThickness(frontMask, frontView.rgb, TENSOR) / 2));
  }
  if (trimPx > 0) {
    frontMask = trimOutline(frontMask, TENSOR, trimPx);
    if (backView) rawBackMask = trimOutline(rawBackMask, TENSOR, trimPx);
    if (sideMask) sideMask = trimOutline(sideMask, TENSOR, trimPx);
    if (sideLeftMask) sideLeftMask = trimOutline(sideLeftMask, TENSOR, trimPx);
    if (topMask) topMask = trimOutline(topMask, TENSOR, trimPx);
    notes.push(
      `Contorno del dibujo detectado (${trimPx * 2} px): se recortan ${trimPx} px de cada silueta para que la línea negra no engorde el modelo.`
    );
  }

  // 3c. Si hay los dos perfiles, son la misma silueta vista desde ±X: se promedian (tras espejar
  //     el izquierdo) para que una pose asimétrica no deje el cuerpo torcido.
  if (options.mergeProfiles !== false && sideMask && sideLeftMask && sideMask !== sideLeftMask) {
    // Normalmente los dos perfiles miran en sentidos opuestos y hay que espejar uno, pero no
    // siempre: se queda el que mejor solapa con el perfil principal.
    const mirrored = mirrorMaskX(sideLeftMask, TENSOR);
    const other =
      maskIoU(sideMask, mirrored, TENSOR) >= maskIoU(sideMask, sideLeftMask, TENSOR)
        ? mirrored
        : sideLeftMask;
    sideMask = averageSilhouettes(sideMask, other, TENSOR, 0.5);
    notes.push(
      'Los dos perfiles se han promediado: la silueta de frente/atrás sale de la forma media de ambos, no solo del derecho.'
    );
  }

  const autoProfile3D =
    Boolean(sideMask || sideLeftMask) &&
    hasProfileDriven3DFeatures(
      frontMask,
      (sideMask ?? sideLeftMask)!,
      TENSOR,
      frontLayer,
      sideMask ? sideLayer : sideLeftLayer
    );
  const isProfile3D = isFreeform || autoProfile3D;

  const useOrthogonalMode = options.orthogonalSilhouetteAndSeam !== false;
  if (backView && !isProfile3D) {
    const aligned = alignBackViewToFront(frontView, backView, frontLayer, backLayer);
    backView = aligned.back;
    backLayer = aligned.backLayer;
    const relBackTf = computeRelativePhotoTransform(
      options.photoTransforms?.front,
      options.photoTransforms?.back
    );
    if (isPhotoTransformModified(relBackTf)) {
      applyPhotoTransformToPreparedView(backView, backLayer, relBackTf, true, true);
      rawBackMask = maskFromCutoutAndPaint(backView.cutout, TENSOR, backLayer?.offset, true);
    }
  }

  // 4. Atlas de textura (4 cuadrantes: Frente, Espalda, Perfil Derecho, Perfil Izquierdo)
  const atlas = buildAtlas(
    frontView,
    backView,
    options.metalMix,
    frontLayer,
    backLayer,
    sideView,
    sideLeftView,
    sideLayer,
    sideLeftLayer
  );

  // Textura de los perfiles en el molde 3D: al 0% la cara y la espalda se proyectan a lo
  // largo de TODO el cuerpo, lo que en una figura erguida es correcto pero en un bicho
  // horizontal de tres metros deja la foto frontal estirada por todo el costado. En ese
  // modo el 0% se interpreta como "automático" y se aplica el perfil entero.
  let profileTexPct = Math.max(0, Math.min(100, options.profileTexturePct ?? 0));
  if (isProfile3D && profileTexPct < 0.5 && (sideMask || sideLeftMask)) {
    profileTexPct = 100;
    notes.push(
      'Molde por perfil: la textura de los costados se toma de las fotos de perfil (100%). Con el 0% la foto de frente se estiraría a lo largo de todo el cuerpo.'
    );
  }

  const seamWidthCm = Math.max(0, Math.min(20, options.profileSeamWidthCm ?? 5.6));
  if (useOrthogonalMode && (sideProfileSeam || sideLeftProfileSeam) && seamWidthCm > 0.05) {
    notes.push(
      `Modo ortogonal 4 vistas activo: silueta de frente, atrás y perfiles tallando el molde 3D y texturizando las 4 caras.`
    );
  }

  // 5. Cuerpo / molde 3D ajustado a la silueta frontal, trasera y de perfil
  const geometry = new THREE.BufferGeometry();
  const vertexUsedMask = new Uint8Array(MAX_HUMAN_VERTICES);
  const effectiveBackMask = isProfile3D ? rawBackMask : frontMask;
  const stats = buildHumanBodyTemplateGeometry(
    geometry,
    {
      mask: frontMask,
      backMask: effectiveBackMask,
      w: TENSOR,
      frontRgb: frontView.rgb,
      frontLayer,
      backLayer,
      frontRelief: frontView.relief,
      backRelief: (backView ?? frontView).relief,
      sideMask,
      sideLeftMask,
      sideLayer,
      sideLeftLayer,
      sideRelief: sideView ? sideView.relief : null,
      sideLeftRelief: sideLeftView ? sideLeftView.relief : null,
      topMask,
      topLayer,
      vertexUsedMask,
      maxVertices: MAX_HUMAN_VERTICES,
      atlas: {
        albedo: atlas.albedo,
        roughMetal: atlas.roughMetal,
        atlasWidth: atlas.atlasWidth,
        background: frontView.bg,
        backBackground: backView ? backView.bg : undefined,
        backMask: effectiveBackMask,
        sideProfile: sideProfileSeam,
        sideLeftProfile: sideLeftProfileSeam,
      },
    },
    {
      depthScale: Math.max(0.2, Math.min(1.8, options.depthScale)),
      reliefAmount: Math.max(0, Math.min(1, options.reliefAmount)),
      topStrength: Math.max(0, Math.min(1, options.topStrength ?? 1)),
      topOrientation: options.topOrientation ?? 'auto',
      rigKind: options.rigKind ?? 'auto',
      rows: Math.max(40, Math.min(1000, Math.round(options.rows))),
      orthogonalSilhouetteAndSeam: useOrthogonalMode,
      profileSeamWidthCm: seamWidthCm,
      profileTexturePct: profileTexPct,
      freeformFromPhotos: Boolean(options.freeformFromPhotos),
      freeformPhotoVolume: Math.max(0, Math.min(2.0, options.freeformPhotoVolume ?? 1.0)),
      freeformSectionRoundness: Math.max(0.3, Math.min(2.5, options.freeformSectionRoundness ?? 1.0)),
      headScale: Math.max(0.4, Math.min(2.5, options.headScale ?? 1.0)),
      headRoundness: Math.max(0.2, Math.min(2.5, options.headRoundness ?? 1.0)),
      faceDetail: Math.max(0, Math.min(5.0, options.faceDetail)),
      presetFaceFeatures: Boolean(options.presetFaceFeatures),
      faceModel: options.faceModel,
      noseSize: Math.max(0, Math.min(6.0, options.noseSize)),
      noseShape: options.noseShape,
      noseXOffset: Math.max(-0.5, Math.min(0.5, options.noseXOffset ?? 0)),
      noseYOffset: Math.max(-0.5, Math.min(0.5, options.noseYOffset ?? 0)),
      noseZOffset: Math.max(-0.6, Math.min(0.8, options.noseZOffset ?? 0)),
      mouthSize: Math.max(0, Math.min(6.0, options.mouthSize)),
      mouthShape: options.mouthShape,
      mouthXOffset: Math.max(-0.5, Math.min(0.5, options.mouthXOffset ?? 0)),
      mouthYOffset: Math.max(-0.5, Math.min(0.5, options.mouthYOffset ?? 0)),
      mouthZOffset: Math.max(-0.6, Math.min(0.8, options.mouthZOffset ?? 0)),
      chinSize: Math.max(0, Math.min(6.0, options.chinSize)),
      chinShape: options.chinShape,
      chinXOffset: Math.max(-0.5, Math.min(0.5, options.chinXOffset ?? 0)),
      chinYOffset: Math.max(-0.5, Math.min(0.5, options.chinYOffset ?? 0)),
      chinZOffset: Math.max(-0.6, Math.min(0.8, options.chinZOffset ?? 0)),
      eyeSocketSize: Math.max(0, Math.min(6.0, options.eyeSocketSize)),
      eyeSocketShape: options.eyeSocketShape,
      eyeSocketXOffset: Math.max(-0.5, Math.min(0.5, options.eyeSocketXOffset ?? 0)),
      eyeSocketYOffset: Math.max(-0.5, Math.min(0.5, options.eyeSocketYOffset ?? 0)),
      eyeSocketZOffset: Math.max(-0.6, Math.min(0.8, options.eyeSocketZOffset ?? 0)),
      layerStrength: Math.max(0, options.layerStrength),
      rig: options.rig,
      customRig: options.customRig ?? null,
      shoes: options.shoes,
      sideStrength: Math.max(0, Math.min(1, options.sideStrength)),
      photoTransforms: options.photoTransforms,
    }
  );

  if (stats.vertexCount === 0) {
    throw new Error(
      'No se ha encontrado una silueta de personaje en la imagen. Prueba con una foto de cuerpo entero en pose A, con fondo liso.'
    );
  }

  // 5b. Patas, rabos y cara (no cambian el molde).
  const extras = applyLimbAndFaceExtras({
    geometry,
    atlas,
    frontMask,
    frontView,
    frontImage: images.front,
    frontCrop: front.crop,
    frontTransformed: isPhotoTransformModified(options.photoTransforms?.front),
    layerTexture: options.textureSource === 'layerMap',
    hasBack: !!backView,
    views: [
      ['frente', frontView],
      ['espalda', backView],
      ['perfil', sideView],
      ['2.º perfil', sideLeftView !== sideView ? sideLeftView : null],
      ['cenital', topPrepared?.view ?? null],
    ],
    sideMask,
    sideView,
    landmarks: stats.landmarks,
    rigKind: stats.rigKind,
    creatureMetrics: stats.creatureMetrics,
    options,
  });
  notes.push(...extras.notes);

  // 6. Material: el mismo montaje que el visor de Vortex3D
  const albedoTex = makeAtlasTexture(atlas.albedo, THREE.SRGBColorSpace);
  const roughMetalTex = makeAtlasTexture(atlas.roughMetal, THREE.NoColorSpace);
  const normalTex = makeAtlasTexture(atlas.normal, THREE.NoColorSpace);
  const nStrength = Math.max(0, options.normalStrength);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: albedoTex,
    normalMap: normalTex,
    normalScale: new THREE.Vector2(nStrength, nStrength),
    roughnessMap: roughMetalTex,
    metalnessMap: roughMetalTex,
    roughness: 1.0,
    metalness: 1.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.5,
    vertexColors: false,
    side: THREE.DoubleSide,
  });
  material.name = 'Humano_Foto_PBR';

  // 7. Malla, con esqueleto si se pidió
  const root = new THREE.Group();
  root.name = 'Humano_Desde_Imagenes';
  let mesh: THREE.Mesh | THREE.SkinnedMesh;
  let clips: THREE.AnimationClip[] = [];

  const hasSkin =
    options.rig &&
    stats.rig &&
    geometry.getAttribute('skinIndex') &&
    geometry.getAttribute('skinWeight');

  if (hasSkin && stats.rig) {
    const { root: boneRoot, bones } = createSkeletonBones(stats.rig);
    const skinned = new THREE.SkinnedMesh(geometry, material);
    skinned.name = 'Personaje';
    skinned.frustumCulled = false;
    skinned.add(boneRoot);
    skinned.updateMatrixWorld(true);
    skinned.bind(new THREE.Skeleton(bones));
    if (stats.rigKind && stats.rigKind !== 'human' && stats.creatureMetrics) {
      // Esqueleto de criatura: sus propios clips (paso, trote, galope, salto,
      // zarpazo, mordisco, impacto, muerte, sentado y, si hay alas, vuelo).
      // Las armas son de mano humana, así que aquí no se enganchan.
      clips = createCreatureAnimationClips(stats.rig, stats.creatureMetrics);
      notes.push(
        stats.rigKind === 'quadrupedWinged'
          ? `Esqueleto de cuadrúpedo ALADO (${stats.rig.bones.length} huesos): columna horizontal, cuatro patas, cola y dos alas, con ${clips.length} animaciones propias.`
          : `Esqueleto de cuadrúpedo (${stats.rig.bones.length} huesos): columna horizontal, cuatro patas y cola, con ${clips.length} animaciones propias.`
      );
    } else {
      attachHumanEquipment(skinned, stats.rig, options.weapon, options.offhand);
      clips = createHumanAnimationClips(stats.rig, options.weapon);
    }
    mesh = skinned;
  } else {
    mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Personaje';
    if (options.rig) {
      notes.push('No se ha podido crear el esqueleto para esta silueta.');
    }
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Marca para que las texturas de procedimiento de la app no le pisen sus
  // mapas sacados de la foto.
  mesh.userData.photoHuman = true;
  root.add(mesh);

  return {
    root,
    mesh,
    clips,
    // La cara en alta resolución duplica los vértices del borde del parche.
    vertexCount: geometry.getAttribute('position').count,
    triangleCount: stats.triangleCount,
    landmarks: stats.landmarks,
    rig: stats.rig,
    rebindData: stats.rebindData,
    notes,
    detection: extras.detection,
    detectionPreview: extras.detectionPreview,
  };
}

/**
 * Reasigna un nuevo esqueleto (editado manualmente por el usuario) sobre la malla
 * ya construida, recalculando los pesos de piel y las animaciones en ~35 ms.
 */
export function rebuildHumanSkinAndClips(
  rootOrSkinned: THREE.Object3D,
  rebindData: HumanRebindData,
  newRig: HumanRig,
  weapon: HumanWeaponId = 'none',
  offhand: HumanOffhandId = 'none'
): THREE.AnimationClip[] {
  let skinned: THREE.SkinnedMesh | null = null;
  rootOrSkinned.traverse((o) => {
    if (!skinned && (o as THREE.SkinnedMesh).isSkinnedMesh) {
      skinned = o as THREE.SkinnedMesh;
    }
  });
  if (!skinned) return [];
  const targetSkinned = skinned as THREE.SkinnedMesh;

  // Recalcular skinIndex y skinWeight sobre la geometría existente
  rebindHumanGeometry(targetSkinned.geometry, newRig, rebindData);
  // Los vértices duplicados por la cara copian los pesos de su original.
  syncFaceDuplicates(targetSkinned.geometry);
  const si = targetSkinned.geometry.getAttribute('skinIndex');
  const sw = targetSkinned.geometry.getAttribute('skinWeight');
  if (si) si.needsUpdate = true;
  if (sw) sw.needsUpdate = true;

  // Quitar los huesos antiguos
  const oldChildren = [...targetSkinned.children];
  for (const ch of oldChildren) {
    if ((ch as THREE.Bone).isBone) targetSkinned.remove(ch);
  }
  if (targetSkinned.skeleton) {
    targetSkinned.skeleton.dispose();
  }

  // Crear nuevos huesos en pose de reposo manteniendo la transformación del SkinnedMesh
  const savedPos = targetSkinned.position.clone();
  const savedQuat = targetSkinned.quaternion.clone();
  const savedScale = targetSkinned.scale.clone();

  targetSkinned.position.set(0, 0, 0);
  targetSkinned.quaternion.identity();
  targetSkinned.scale.set(1, 1, 1);
  targetSkinned.updateMatrixWorld(true);

  const { root: boneRoot, bones } = createSkeletonBones(newRig);
  targetSkinned.add(boneRoot);
  targetSkinned.updateMatrixWorld(true);
  targetSkinned.bind(new THREE.Skeleton(bones));
  attachHumanEquipment(targetSkinned, newRig, weapon, offhand);

  targetSkinned.position.copy(savedPos);
  targetSkinned.quaternion.copy(savedQuat);
  targetSkinned.scale.copy(savedScale);
  targetSkinned.updateMatrixWorld(true);

  return createHumanAnimationClips(newRig, weapon);
}

/**
 * Cambia en tiempo real el arma y escudo de Enemigo-rpg sobre el personaje actual
 * y regenera los clips de animación (p. ej. modo Arquero con Arco vs Campeón Melee).
 */
export function updateHumanEquipmentAndClips(
  rootOrSkinned: THREE.Object3D,
  rig: HumanRig,
  weapon: HumanWeaponId,
  offhand: HumanOffhandId
): THREE.AnimationClip[] {
  attachHumanEquipment(rootOrSkinned, rig, weapon, offhand);
  return createHumanAnimationClips(rig, weapon);
}

/** Calcula el esqueleto automático original a partir de los datos guardados. */
export function computeDefaultRigFromRebindData(rebindData: HumanRebindData): HumanRig {
  return computeHumanRig(rebindData.mask, rebindData.w, rebindData.landmarks, 2.85);
}

