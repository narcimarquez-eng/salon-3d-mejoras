import { useEffect, useRef, useState } from 'react';
import {
  ImagePlus,
  Trash2,
  UserRound,
  Download,
  Play,
  Bone as BoneIcon,
  Eye,
  EyeOff,
  RotateCcw,
  Move,
  Swords,
  Shield,
  Sparkles,
  Crosshair,
  BookmarkCheck,
  FlipHorizontal2,
  Maximize2,
  Layers,
} from 'lucide-react';
import { LAYER_CLASSES } from '../human/layerMap';
import { sliceCompositeSheet } from '../human/sheetSlicer';
import {
  DEFAULT_CUTOUT,
  DEFAULT_PHOTO_TRANSFORM,
  fitImageToTensor,
  getCutoutBounds,
  getPhotoRecuadroBox,
  isPhotoTransformModified,
  photoTransformFromRecuadroBox,
  prepareView,
  type CutoutBounds,
  type PhotoRecuadroBox,
  type PhotoTransform,
} from '../human/imagePrep';
import {
  CHIN_SHAPES,
  EYE_SOCKET_SHAPES,
  FACE_MODELS,
  FACTORY_HUMAN_OPTIONS,
  MOUTH_SHAPES,
  NOSE_SHAPES,
  applyFaceModelPreset,
  clearSavedDefaultHumanOptions,
  hasSavedDefaultHumanOptions,
  loadSavedDefaultHumanOptions,
  saveDefaultHumanOptions,
  type ActiveFaceFeatureId,
  type ChinShapeId,
  type EyeSocketShapeId,
  type FaceModelId,
  type HumanBuildOptions,
  type HumanImageSet,
  type MouthShapeId,
  type NoseShapeId,
} from '../human/buildHuman';
import {
  BONE_LABELS_ES,
  BONE_MIRROR_MAP,
  moveRigBoneJoint,
  type HumanRig,
} from '../human/humanRig';
import {
  HUMAN_OFFHANDS,
  HUMAN_WEAPONS,
  type HumanOffhandId,
  type HumanWeaponId,
} from '../human/humanWeapons';

export interface HumanPanelResult {
  vertexCount: number;
  triangleCount: number;
  notes: string[];
  hasRig: boolean;
  animations: { id: string; label: string }[];
}

interface Props {
  busy: boolean;
  result: HumanPanelResult | null;
  error: string | null;
  exporting: boolean;
  lastExportSize: string | null;
  activeAnimation: string;
  currentRig: HumanRig | null;
  showSkeleton: boolean;
  editSkeletonMode: boolean;
  selectedBoneName: string;
  boneSymmetry: boolean;
  activeFaceFeature?: ActiveFaceFeatureId;
  onSelectFaceFeature?: (feature: ActiveFaceFeatureId) => void;
  onBuild: (images: HumanImageSet, options: HumanBuildOptions) => void;
  onAnimationChange: (id: string) => void;
  onEquipmentChange?: (weapon: HumanWeaponId, offhand: HumanOffhandId) => void;
  onExport: (tier?: 'completo' | 'high' | 'medium' | 'low' | 'minimum') => void;
  onToggleShowSkeleton: (show: boolean) => void;
  onToggleEditSkeletonMode: (edit: boolean) => void;
  onSelectBone: (boneName: string) => void;
  onToggleBoneSymmetry: (sym: boolean) => void;
  onUpdateRig: (newRig: HumanRig) => void;
  onResetRigToAuto: () => void;
}

export type SlotId =
  | 'front'
  | 'back'
  | 'side'
  | 'sideLeft'
  | 'frontLayer'
  | 'backLayer'
  | 'sideLayer'
  | 'sideLeftLayer';

interface Slot {
  id: SlotId;
  label: string;
  hint: string;
}

const SLOTS: Slot[] = [
  { id: 'front', label: 'Foto de frente', hint: 'Obligatoria. Define la silueta de los laterales izquierdo y derecho y la textura delantera.' },
  { id: 'back', label: 'Foto de espalda', hint: 'Opcional. Aporta la textura trasera alineada a la silueta frontal.' },
  { id: 'side', label: 'Foto de perfil (Der / Principal)', hint: 'Define la silueta del frente y atrás y la textura alrededor de la unión lateral (~5,6 cm).' },
  { id: 'sideLeft', label: 'Foto de perfil izquierdo (2.º perfil)', hint: 'Opcional (se extrae sola en hojas de 4 vistas). Texturiza la unión lateral izquierda (~5,6 cm).' },
  { id: 'frontLayer', label: 'Mapa de capas (frente)', hint: 'Opcional. Copia de la foto pintada con colores planos.' },
  { id: 'backLayer', label: 'Mapa de capas (espalda)', hint: 'Opcional. Igual, sobre la foto de espalda.' },
  { id: 'sideLayer', label: 'Mapa de capas (perfil)', hint: 'Opcional. Afina la silueta del frente y atrás en el perfil.' },
  { id: 'sideLeftLayer', label: 'Mapa de capas (2.º perfil)', hint: 'Opcional. Afina el segundo perfil en hojas de 4 columnas.' },
];

const TERMINAL_BONES = new Set(['Head', 'RightHand', 'LeftHand', 'RightFoot', 'LeftFoot']);

const PAIRED_LAYER_SLOT: Partial<Record<SlotId, SlotId>> = {
  front: 'frontLayer',
  back: 'backLayer',
  side: 'sideLayer',
  sideLeft: 'sideLeftLayer',
};

interface CutoutPreviewData {
  canvas: HTMLCanvasElement;
  bounds: CutoutBounds;
}

type RecuadroHandleId = 'move' | 'n' | 's' | 'w' | 'e' | 'nw' | 'ne' | 'sw' | 'se';

const cutoutPreviewCacheNormal = new WeakMap<HTMLImageElement, CutoutPreviewData>();
const cutoutPreviewCacheMirror = new WeakMap<HTMLImageElement, CutoutPreviewData>();

function getCutoutPreviewData(img: HTMLImageElement, mirrorX = false): CutoutPreviewData {
  const cache = mirrorX ? cutoutPreviewCacheMirror : cutoutPreviewCacheNormal;
  const cached = cache.get(img);
  if (cached) return cached;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = 256;
  srcCanvas.height = 256;
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!sctx) {
    return {
      canvas: srcCanvas,
      bounds: {
        minX: 28,
        maxX: 227,
        minY: 16,
        maxY: 239,
        width: 200,
        height: 224,
        centerX: 127.5,
        centerY: 127.5,
      },
    };
  }
  fitImageToTensor(sctx, img);
  const pixels = sctx.getImageData(0, 0, 256, 256).data;
  const prep = prepareView(pixels, mirrorX, DEFAULT_CUTOUT);
  const bounds = getCutoutBounds(prep.cutout, 256);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = 256;
  outCanvas.height = 256;
  const octx = outCanvas.getContext('2d');
  if (octx) {
    const idata = octx.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const i3 = i * 3;
      const i4 = i * 4;
      idata.data[i4] = Math.round(prep.rgb[i3] * 255);
      idata.data[i4 + 1] = Math.round(prep.rgb[i3 + 1] * 255);
      idata.data[i4 + 2] = Math.round(prep.rgb[i3 + 2] * 255);
      idata.data[i4 + 3] = prep.cutout[i] === 1 ? 255 : 0;
    }
    octx.putImageData(idata, 0, 0);
  }
  const data: CutoutPreviewData = { canvas: outCanvas, bounds };
  cache.set(img, data);
  return data;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se ha podido leer la imagen.'));
      if (typeof reader.result === 'string') img.src = reader.result;
      else reject(new Error('No se ha podido leer la imagen.'));
    };
    reader.onerror = () => reject(new Error('No se ha podido leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

export default function HumanFromImagesPanel({
  busy,
  result,
  error,
  exporting,
  lastExportSize,
  activeAnimation,
  currentRig,
  showSkeleton,
  editSkeletonMode,
  selectedBoneName,
  boneSymmetry,
  activeFaceFeature = 'none',
  onSelectFaceFeature,
  onBuild,
  onAnimationChange,
  onEquipmentChange,
  onExport,
  onToggleShowSkeleton,
  onToggleEditSkeletonMode,
  onSelectBone,
  onToggleBoneSymmetry,
  onUpdateRig,
  onResetRigToAuto,
}: Props) {
  const [images, setImages] = useState<Record<SlotId, HTMLImageElement | null>>({
    front: null,
    back: null,
    side: null,
    sideLeft: null,
    frontLayer: null,
    backLayer: null,
    sideLayer: null,
    sideLeftLayer: null,
  });
  const [names, setNames] = useState<Record<SlotId, string | null>>({
    front: null,
    back: null,
    side: null,
    sideLeft: null,
    frontLayer: null,
    backLayer: null,
    sideLayer: null,
    sideLeftLayer: null,
  });
  const [options, setOptions] = useState<HumanBuildOptions>(() => loadSavedDefaultHumanOptions());
  const [hasCustomDefault, setHasCustomDefault] = useState<boolean>(() =>
    hasSavedDefaultHumanOptions()
  );
  const [defaultSaveMsg, setDefaultSaveMsg] = useState<string | null>(null);
  const [showLayerLegend, setShowLayerLegend] = useState(false);
  const [editingTip, setEditingTip] = useState(false);
  const [showAlignStudio, setShowAlignStudio] = useState(true);
  const [alignSlot, setAlignSlot] = useState<SlotId>('side');
  const [alignViewMode, setAlignViewMode] = useState<'overlay' | 'sideBySide'>('overlay');
  const [alignOpacity, setAlignOpacity] = useState<number>(0.62);
  const [uniformPhotoScale, setUniformPhotoScale] = useState<boolean>(false);
  const [syncLayerTransform, setSyncLayerTransform] = useState<boolean>(true);
  const alignCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStateRef = useRef<{
    mode: RecuadroHandleId;
    startX: number;
    startY: number;
    startTf: PhotoTransform;
    startBox: PhotoRecuadroBox;
  } | null>(null);
  const liveBuildTimerRef = useRef<number | null>(null);

  const inputs = useRef<Record<SlotId, HTMLInputElement | null>>({
    front: null,
    back: null,
    side: null,
    sideLeft: null,
    frontLayer: null,
    backLayer: null,
    sideLayer: null,
    sideLeftLayer: null,
  });
  const allInOneInputRef = useRef<HTMLInputElement | null>(null);
  const freeformInputRef = useRef<HTMLInputElement | null>(null);

  const triggerBuildIfReady = (nextOpts: HumanBuildOptions, interactivePreview = false) => {
    if (!images.front) return;
    if (liveBuildTimerRef.current !== null) {
      window.clearTimeout(liveBuildTimerRef.current);
      liveBuildTimerRef.current = null;
    }
    const buildNow = () => {
      const effectiveRows = interactivePreview ? Math.min(nextOpts.rows, 120) : nextOpts.rows;
      onBuild(
        {
          front: images.front!,
          back: images.back,
          side: images.side,
          sideLeft: images.sideLeft,
          frontLayer: images.frontLayer,
          backLayer: images.backLayer,
          sideLayer: images.sideLayer,
          sideLeftLayer: images.sideLeftLayer,
        },
        {
          ...nextOpts,
          rows: effectiveRows,
          customRig: currentRig ?? nextOpts.customRig ?? null,
        }
      );
    };
    if (interactivePreview) {
      liveBuildTimerRef.current = window.setTimeout(() => {
        liveBuildTimerRef.current = null;
        buildNow();
      }, 65);
    } else {
      buildNow();
    }
  };

  const getSlotTransform = (slot: SlotId, opts: HumanBuildOptions = options): PhotoTransform => {
    return opts.photoTransforms?.[slot] ?? { ...DEFAULT_PHOTO_TRANSFORM };
  };

  const updateSlotTransform = (
    slot: SlotId,
    patch: Partial<PhotoTransform>,
    interactivePreview = false
  ) => {
    const prevTf = getSlotTransform(slot, options);
    const nextTf: PhotoTransform = {
      ...prevTf,
      ...patch,
      offsetX: Math.max(-80, Math.min(80, patch.offsetX ?? prevTf.offsetX)),
      offsetY: Math.max(-80, Math.min(80, patch.offsetY ?? prevTf.offsetY)),
      scaleX: Math.max(0.2, Math.min(3.0, patch.scaleX ?? prevTf.scaleX)),
      scaleY: Math.max(0.2, Math.min(3.0, patch.scaleY ?? prevTf.scaleY)),
      rotation: Math.max(-180, Math.min(180, patch.rotation ?? prevTf.rotation)),
    };
    const nextMap = {
      ...(options.photoTransforms ?? {}),
      [slot]: nextTf,
    };
    if (syncLayerTransform) {
      const paired = PAIRED_LAYER_SLOT[slot];
      if (paired) {
        nextMap[paired] = { ...nextTf };
      }
    }
    const nextOpts: HumanBuildOptions = {
      ...options,
      photoTransforms: nextMap,
      customRig: currentRig ?? options.customRig ?? null,
    };
    setOptions(nextOpts);
    triggerBuildIfReady(nextOpts, interactivePreview);
  };

  const resetSlotTransform = (slot: SlotId) => {
    updateSlotTransform(slot, { ...DEFAULT_PHOTO_TRANSFORM }, false);
  };

  const resetAllPhotoTransforms = () => {
    const nextOpts: HumanBuildOptions = {
      ...options,
      photoTransforms: {},
      customRig: currentRig ?? options.customRig ?? null,
    };
    setOptions(nextOpts);
    triggerBuildIfReady(nextOpts, false);
  };

  // Seleccionar automáticamente el perfil (si existe) o el frente en el estudio de alineación
  const effectiveAlignSlot: SlotId = images[alignSlot]
    ? alignSlot
    : images.side
    ? 'side'
    : images.back
    ? 'back'
    : images.sideLeft
    ? 'sideLeft'
    : 'front';

  // Dibujar el lienzo interactivo translúcido cada vez que cambian las fotos, la transformación o la opacidad
  useEffect(() => {
    const canvas = alignCanvasRef.current;
    if (!canvas || !images.front) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isSideBySide = alignViewMode === 'sideBySide';
    const W = isSideBySide ? 512 : 256;
    const H = 256;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;

    // 1) Fondo damero oscuro de estudio
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, W, H);
    const tile = 16;
    ctx.fillStyle = '#111827';
    for (let y = 0; y < H; y += tile) {
      for (let x = 0; x < W; x += tile) {
        if (((x / tile + y / tile) & 1) === 0) {
          ctx.fillRect(x, y, tile, tile);
        }
      }
    }

    const frontTf = getSlotTransform('front', options);
    const activeImg = images[effectiveAlignSlot] ?? images.front;
    const activeTf = getSlotTransform(effectiveAlignSlot, options);
    const isBackSlot = effectiveAlignSlot === 'back';

    const frontData = getCutoutPreviewData(images.front, false);
    const activeData = getCutoutPreviewData(activeImg, isBackSlot);
    const frontBox = getPhotoRecuadroBox('front', frontTf, frontData.bounds, frontData.bounds);
    const activeBox = getPhotoRecuadroBox(
      effectiveAlignSlot,
      activeTf,
      frontData.bounds,
      activeData.bounds
    );

    const drawRecuadroPreview = (
      data: CutoutPreviewData,
      box: PhotoRecuadroBox,
      tf: PhotoTransform,
      originX: number,
      alpha: number
    ) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(originX, 0, 256, 256);
      ctx.clip();
      ctx.globalAlpha = alpha;
      ctx.translate(originX + box.centerX, box.centerY);
      ctx.rotate((tf.rotation * Math.PI) / 180);
      if (tf.flipX) {
        ctx.scale(-1, 1);
      }
      ctx.drawImage(
        data.canvas,
        data.bounds.minX,
        data.bounds.minY,
        data.bounds.width,
        data.bounds.height,
        -box.width * 0.5,
        -box.height * 0.5,
        box.width,
        box.height
      );
      ctx.restore();
    };

    if (isSideBySide) {
      // Mitad izquierda (0..255): Foto de Frente (Referencia)
      drawRecuadroPreview(frontData, frontBox, frontTf, 0, 0.95);
      // Mitad derecha (256..511): Fantasma translúcido de la Foto de Frente debajo + Foto Activa encima
      if (effectiveAlignSlot !== 'front') {
        drawRecuadroPreview(frontData, frontBox, frontTf, 256, 0.35);
      }
      drawRecuadroPreview(activeData, activeBox, activeTf, 256, alignOpacity);

      // Separador central
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(256, 0);
      ctx.lineTo(256, H);
      ctx.stroke();
    } else {
      // Modo Superpuesto Translúcido (Encima del Frente):
      if (effectiveAlignSlot !== 'front') {
        drawRecuadroPreview(frontData, frontBox, frontTf, 0, 0.88);
      }
      drawRecuadroPreview(
        activeData,
        activeBox,
        activeTf,
        0,
        effectiveAlignSlot === 'front' ? Math.max(0.45, alignOpacity) : alignOpacity
      );
    }

    // 2) Líneas guía dinámicas basadas en el Recuadro del Frente (Cabeza, Hombros, Cadera, Pies y Eje X)
    const guideRows = [
      { y: Math.round(frontBox.top), label: 'Cabeza (Tope)', color: 'rgba(56, 189, 248, 0.65)' },
      {
        y: Math.round(frontBox.top + frontBox.height * 0.22),
        label: 'Hombros',
        color: 'rgba(56, 189, 248, 0.30)',
      },
      {
        y: Math.round(frontBox.top + frontBox.height * 0.54),
        label: 'Cadera',
        color: 'rgba(56, 189, 248, 0.30)',
      },
      { y: Math.round(frontBox.bottom), label: 'Pies (Base)', color: 'rgba(56, 189, 248, 0.65)' },
    ];
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (const g of guideRows) {
      ctx.strokeStyle = g.color;
      ctx.beginPath();
      ctx.moveTo(0, g.y);
      ctx.lineTo(W, g.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(186, 230, 253, 0.82)';
      ctx.font = '9px monospace';
      ctx.fillText(g.label, 4, Math.max(9, g.y - 2));
    }
    // Eje central X del Frente
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.42)';
    ctx.beginPath();
    ctx.moveTo(frontBox.centerX, 0);
    ctx.lineTo(frontBox.centerX, H);
    if (isSideBySide) {
      ctx.moveTo(256 + frontBox.centerX, 0);
      ctx.lineTo(256 + frontBox.centerX, H);
    }
    ctx.stroke();
    ctx.restore();

    const activeOriginX = isSideBySide ? 256 : 0;

    // 2b) Si estamos editando otra vista (Perfil o Espalda), dibujar el Recuadro de referencia del Frente en azul cian
    if (effectiveAlignSlot !== 'front') {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(
        activeOriginX + frontBox.left,
        frontBox.top,
        frontBox.width,
        frontBox.height
      );
      ctx.restore();
    }

    // 3) Recuadro interactivo de 8 tiradores (4 lados + 4 esquinas) de la foto activa
    const rx = activeOriginX + activeBox.left;
    const ry = activeBox.top;
    const rw = activeBox.width;
    const rh = activeBox.height;
    const rcx = activeOriginX + activeBox.centerX;
    const rcy = activeBox.centerY;

    ctx.save();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);

    // Cruz central del recuadro activo
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rcx - 6, rcy);
    ctx.lineTo(rcx + 6, rcy);
    ctx.moveTo(rcx, rcy - 6);
    ctx.lineTo(rcx, rcy + 6);
    ctx.stroke();

    // 4 tiradores de borde (Arriba / Cabeza, Abajo / Pies, Izquierda, Derecha)
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 1.4;
    const edgeHandles = [
      { x: rcx - 10, y: ry - 4, w: 20, h: 8 }, // N (Cabeza)
      { x: rcx - 10, y: ry + rh - 4, w: 20, h: 8 }, // S (Pies)
      { x: rx - 4, y: rcy - 10, w: 8, h: 20 }, // W (Izquierda)
      { x: rx + rw - 4, y: rcy - 10, w: 8, h: 20 }, // E (Derecha)
    ];
    for (const eh of edgeHandles) {
      ctx.fillRect(eh.x, eh.y, eh.w, eh.h);
      ctx.strokeRect(eh.x, eh.y, eh.w, eh.h);
    }

    // 4 tiradores de esquina (NW, NE, SW, SE)
    ctx.fillStyle = '#fbbf24';
    const cornerPts = [
      [rx, ry],
      [rx + rw, ry],
      [rx, ry + rh],
      [rx + rw, ry + rh],
    ];
    for (const [hx, hy] of cornerPts) {
      ctx.fillRect(hx - 5, hy - 5, 10, 10);
      ctx.strokeRect(hx - 5, hy - 5, 10, 10);
    }
    ctx.restore();
  }, [images, options.photoTransforms, effectiveAlignSlot, alignViewMode, alignOpacity]);

  const setFreeformMode = (enabled: boolean) => {
    const nextOpts: HumanBuildOptions = enabled
      ? {
          ...options,
          freeformFromPhotos: true,
          presetFaceFeatures: false,
          faceModel: 'none',
          shoes: false,
          customRig: currentRig ?? options.customRig ?? null,
        }
      : {
          ...options,
          freeformFromPhotos: false,
          shoes: true,
          customRig: currentRig ?? options.customRig ?? null,
        };
    setOptions(nextOpts);
    triggerBuildIfReady(nextOpts);
  };

  const handleSheetUpload = async (file: File | undefined, forceFreeform?: boolean) => {
    if (!file) return;
    try {
      const img = await loadImage(file);
      const isFree = forceFreeform !== undefined ? forceFreeform : options.freeformFromPhotos;
      const baseOpts: HumanBuildOptions = {
        ...options,
        freeformFromPhotos: isFree,
        presetFaceFeatures: isFree ? false : options.presetFaceFeatures,
        faceModel: isFree ? 'none' : options.faceModel,
        shoes: isFree ? false : options.shoes,
        customRig: null,
      };
      setOptions(baseOpts);

      if (img.naturalWidth / img.naturalHeight > 1.15) {
        const sliced = await sliceCompositeSheet(img, file.name);
        setImages(sliced.images);
        setNames(sliced.names);
        if (sliced.images.front) {
          onBuild(sliced.images as HumanImageSet, baseOpts);
        }
      } else {
        const nextImages: Record<SlotId, HTMLImageElement | null> = {
          front: img,
          back: null,
          side: null,
          sideLeft: null,
          frontLayer: null,
          backLayer: null,
          sideLayer: null,
          sideLeftLayer: null,
        };
        setImages(nextImages);
        setNames({
          front: file.name,
          back: null,
          side: null,
          sideLeft: null,
          frontLayer: null,
          backLayer: null,
          sideLayer: null,
          sideLeftLayer: null,
        });
        onBuild({ front: img }, baseOpts);
      }
    } catch (err) {
      console.error('Error al procesar imagen:', err);
    }
  };

  const pick = async (slot: SlotId, file: File | undefined) => {
    if (!file) return;
    try {
      const img = await loadImage(file);
      // Si sube una hoja todo-en-uno en el slot de frente, detectarla y recortarla automáticamente
      if (slot === 'front' && img.naturalWidth / img.naturalHeight > 1.15) {
        const sliced = await sliceCompositeSheet(img, file.name);
        setImages(sliced.images);
        setNames(sliced.names);
        const baseOpts: HumanBuildOptions = { ...options, customRig: null };
        setOptions(baseOpts);
        if (sliced.images.front) {
          onBuild(sliced.images as HumanImageSet, baseOpts);
        }
        return;
      }
      const nextImages = { ...images, [slot]: img };
      setImages(nextImages);
      setNames((prev) => ({ ...prev, [slot]: file.name }));
      if (nextImages.front && !busy) {
        onBuild(
          {
            front: nextImages.front,
            back: nextImages.back,
            side: nextImages.side,
            sideLeft: nextImages.sideLeft,
            frontLayer: nextImages.frontLayer,
            backLayer: nextImages.backLayer,
            sideLayer: nextImages.sideLayer,
            sideLeftLayer: nextImages.sideLeftLayer,
          },
          { ...options, customRig: currentRig ?? options.customRig ?? null }
        );
      }
    } catch {
      setImages((prev) => ({ ...prev, [slot]: null }));
      setNames((prev) => ({ ...prev, [slot]: null }));
    }
  };

  const clear = (slot: SlotId) => {
    setImages((prev) => ({ ...prev, [slot]: null }));
    setNames((prev) => ({ ...prev, [slot]: null }));
    const input = inputs.current[slot];
    if (input) input.value = '';
  };

  const handleSaveAsDefault = () => {
    saveDefaultHumanOptions(options);
    setHasCustomDefault(true);
    setDefaultSaveMsg('¡Guardada como predeterminada para próximas imágenes!');
    window.setTimeout(() => setDefaultSaveMsg(null), 3200);
  };

  const handleRestoreFactoryDefault = () => {
    clearSavedDefaultHumanOptions();
    setHasCustomDefault(false);
    const factory: HumanBuildOptions = {
      ...FACTORY_HUMAN_OPTIONS,
      customRig: currentRig ?? null,
    };
    setOptions(factory);
    setDefaultSaveMsg('Valores de fábrica restaurados');
    window.setTimeout(() => setDefaultSaveMsg(null), 2500);
    triggerBuildIfReady(factory);
  };

  const slider = (
    label: string,
    key: keyof HumanBuildOptions,
    min: number,
    max: number,
    step: number,
    format: (v: number) => string,
    title: string
  ) => (
    <div title={title}>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-amber-300">{format(options[key] as number)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={options[key] as number}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          setOptions((prev) => ({ ...prev, [key]: val }));
        }}
        onMouseUp={() => triggerBuildIfReady(options)}
        onTouchEnd={() => triggerBuildIfReady(options)}
        onKeyUp={() => triggerBuildIfReady(options)}
        className="w-full accent-amber-400 cursor-pointer"
      />
    </div>
  );

  const renderFeatureMarkerButton = (featureId: ActiveFaceFeatureId, label: string) => {
    const isSelected = activeFaceFeature === featureId;
    return (
      <button
        type="button"
        data-testid={`mark-feature-${featureId}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelectFaceFeature?.(isSelected ? 'none' : featureId);
        }}
        className={`px-1.5 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 border transition-colors cursor-pointer ${
          isSelected
            ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-sm shadow-cyan-500/30'
            : 'bg-slate-950 hover:bg-slate-800 text-cyan-300 border-cyan-500/40'
        }`}
        title={`Señalar el punto exacto de ${label} y sus ejes X/Y/Z sobre el modelo 3D`}
      >
        <Crosshair className="w-2.5 h-2.5" />
        <span>{isSelected ? 'Señalado 3D' : 'Señalar'}</span>
      </button>
    );
  };

  const renderXYZFeatureSliders = (
    featureId: ActiveFaceFeatureId,
    xKey: 'noseXOffset' | 'eyeSocketXOffset' | 'mouthXOffset' | 'chinXOffset',
    yKey: 'noseYOffset' | 'eyeSocketYOffset' | 'mouthYOffset' | 'chinYOffset',
    zKey: 'noseZOffset' | 'eyeSocketZOffset' | 'mouthZOffset' | 'chinZOffset',
    xLabel = 'Eje X (Izq/Der):'
  ) => {
    const xVal = (options[xKey] as number) ?? 0;
    const yVal = (options[yKey] as number) ?? 0;
    const zVal = (options[zKey] as number) ?? 0;

    const updateAxis = (
      key: typeof xKey | typeof yKey | typeof zKey,
      val: number
    ) => {
      onSelectFaceFeature?.(featureId);
      const nextOpts: HumanBuildOptions = {
        ...options,
        [key]: val,
        presetFaceFeatures: true,
        faceModel: options.faceModel === 'none' ? 'classic' : options.faceModel,
        customRig: currentRig ?? options.customRig ?? null,
      };
      setOptions(nextOpts);
    };

    return (
      <div className="space-y-1 pt-0.5 border-t border-slate-800/60">
        {/* Eje X */}
        <div className="flex items-center gap-1.5 text-[9px]">
          <span className="text-rose-300 w-24 shrink-0 flex justify-between">
            <span>{xLabel}</span>
            <span className="font-mono text-amber-300">
              {xVal >= 0 ? '+' : ''}
              {Math.round(xVal * 100)}%
            </span>
          </span>
          <input
            type="range"
            data-testid={`${featureId}-x-slider`}
            min={-0.5}
            max={0.5}
            step={0.01}
            value={xVal}
            onPointerDown={() => onSelectFaceFeature?.(featureId)}
            onChange={(e) => updateAxis(xKey, parseFloat(e.target.value))}
            onMouseUp={() => triggerBuildIfReady(options)}
            onTouchEnd={() => triggerBuildIfReady(options)}
            onKeyUp={() => triggerBuildIfReady(options)}
            className="flex-1 accent-rose-400 cursor-pointer h-1.5"
            title="Mover posición en el Eje X (Izquierda / Derecha)"
          />
        </div>

        {/* Eje Y */}
        <div className="flex items-center gap-1.5 text-[9px]">
          <span className="text-emerald-300 w-24 shrink-0 flex justify-between">
            <span>Eje Y (Altura):</span>
            <span className="font-mono text-amber-300">
              {yVal >= 0 ? '+' : ''}
              {Math.round(yVal * 100)}%
            </span>
          </span>
          <input
            type="range"
            data-testid={`${featureId}-y-slider`}
            min={-0.5}
            max={0.5}
            step={0.01}
            value={yVal}
            onPointerDown={() => onSelectFaceFeature?.(featureId)}
            onChange={(e) => updateAxis(yKey, parseFloat(e.target.value))}
            onMouseUp={() => triggerBuildIfReady(options)}
            onTouchEnd={() => triggerBuildIfReady(options)}
            onKeyUp={() => triggerBuildIfReady(options)}
            className="flex-1 accent-emerald-400 cursor-pointer h-1.5"
            title="Mover posición en el Eje Y (Abajo / Arriba)"
          />
        </div>

        {/* Eje Z */}
        <div className="flex items-center gap-1.5 text-[9px]">
          <span className="text-sky-300 w-24 shrink-0 flex justify-between">
            <span>Eje Z (Fondo/Frente):</span>
            <span className="font-mono text-amber-300">
              {zVal >= 0 ? '+' : ''}
              {Math.round(zVal * 100)}%
            </span>
          </span>
          <input
            type="range"
            data-testid={`${featureId}-z-slider`}
            min={-0.6}
            max={0.8}
            step={0.02}
            value={zVal}
            onPointerDown={() => onSelectFaceFeature?.(featureId)}
            onChange={(e) => updateAxis(zKey, parseFloat(e.target.value))}
            onMouseUp={() => triggerBuildIfReady(options)}
            onTouchEnd={() => triggerBuildIfReady(options)}
            onKeyUp={() => triggerBuildIfReady(options)}
            className="flex-1 accent-sky-400 cursor-pointer h-1.5"
            title="Mover posición en el Eje Z (Hundir hacia atrás / Proyectar hacia adelante)"
          />
        </div>
      </div>
    );
  };

  const canBuild = Boolean(images.front) && !busy;

  const selectedBone = currentRig?.bones.find((b) => b.name === selectedBoneName) ?? currentRig?.bones[0] ?? null;
  const isTerminalBone = selectedBone ? TERMINAL_BONES.has(selectedBone.name) : false;
  const activeJointCoords: [number, number, number] = selectedBone
    ? isTerminalBone && editingTip
      ? selectedBone.tail
      : selectedBone.head
    : [0, 0, 0];

  const handleBoneCoordChange = (axisIdx: 0 | 1 | 2, val: number) => {
    if (!currentRig || !selectedBone) return;
    const nextPos: [number, number, number] = [...activeJointCoords];
    nextPos[axisIdx] = val;
    const updated = moveRigBoneJoint(
      currentRig,
      selectedBone.name,
      nextPos,
      isTerminalBone && editingTip,
      boneSymmetry
    );
    onUpdateRig(updated);
  };

  return (
    <div
      data-testid="human-panel"
      className="p-3 rounded-lg bg-slate-900/75 border border-slate-800/90 space-y-2.5 text-[11px]"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sky-300 flex items-center gap-1.5">
          <UserRound className="w-3.5 h-3.5 text-sky-400" />
          <span>{options.freeformFromPhotos ? 'Construcción Libre 3D desde Fotos' : 'Humano desde imágenes'}</span>
        </span>
        {result && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30">
            {result.triangleCount.toLocaleString()} tri
          </span>
        )}
      </div>

      {/* Selector de Modo de Generación del Molde 3D en la carga de imágenes */}
      <div className="p-2 rounded-lg bg-slate-950/90 border border-cyan-500/35 space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-semibold text-cyan-300">Modo de generación del molde 3D:</span>
          <span
            className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
              options.freeformFromPhotos
                ? 'bg-amber-500/20 text-amber-200 border-amber-400/50'
                : 'bg-sky-500/20 text-sky-200 border-sky-400/40'
            }`}
          >
            {options.freeformFromPhotos ? 'SIN MOLDE PREVIO' : 'MOLDE HUMANO'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            data-testid="mode-human-template-btn"
            onClick={() => setFreeformMode(false)}
            className={`py-1.5 px-2 rounded text-[10px] font-semibold border transition-all cursor-pointer flex flex-col items-center justify-center leading-tight ${
              !options.freeformFromPhotos
                ? 'bg-sky-500/25 border-sky-400 text-sky-100 shadow-sm shadow-sky-500/20'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="Usa un molde anatómico humano previo ajustado a la silueta de las fotos"
          >
            <span>🧍 Con Molde Previo</span>
            <span className="text-[8.5px] font-normal opacity-80">Anatomía humana base</span>
          </button>

          <button
            type="button"
            data-testid="mode-freeform-photos-btn"
            onClick={() => setFreeformMode(true)}
            className={`py-1.5 px-2 rounded text-[10px] font-semibold border transition-all cursor-pointer flex flex-col items-center justify-center leading-tight ${
              options.freeformFromPhotos
                ? 'bg-amber-500/25 border-amber-400 text-amber-100 shadow-sm shadow-amber-500/20'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="Construcción libre: genera el molde 3D íntegramente a raíz de las fotos (silueta, perfil y volumen luminoso) sin molde previo"
          >
            <span>✨ Construcción Libre</span>
            <span className="text-[8.5px] font-normal opacity-80">100% desde las fotos (Sin molde)</span>
          </button>
        </div>

        <p className="text-[9.5px] text-slate-400 leading-snug">
          {options.freeformFromPhotos
            ? 'El molde 3D se genera directamente a raíz de las imágenes cargadas (silueta frontal, perfil y relieve de la foto), sin aplicar ningún molde humano previo.'
            : 'Ajusta un molde de proporciones humanas a la silueta de tus fotos, con opción de botas y rasgos faciales.'}
        </p>

        {/* Controles específicos cuando está activa la Construcción Libre (Sin molde previo) */}
        {options.freeformFromPhotos && (
          <div className="pt-1.5 border-t border-amber-500/25 space-y-1.5">
            <div title="Cuánto esculpe el brillo/sombreado macroscópico de las propias fotos el volumen del molde libre.">
              <div className="flex items-center justify-between text-[9.5px]">
                <span className="text-amber-200 font-medium">Volumen desde las fotos (Molde libre):</span>
                <span className="font-mono text-amber-300">
                  {Math.round((options.freeformPhotoVolume ?? 1.0) * 100)}%
                </span>
              </div>
              <input
                type="range"
                data-testid="freeform-photo-volume-slider"
                min={0}
                max={2.0}
                step={0.05}
                value={options.freeformPhotoVolume ?? 1.0}
                onChange={(e) => {
                  const freeformPhotoVolume = parseFloat(e.target.value);
                  setOptions((prev) => ({ ...prev, freeformPhotoVolume }));
                }}
                onMouseUp={() => triggerBuildIfReady(options)}
                onTouchEnd={() => triggerBuildIfReady(options)}
                onKeyUp={() => triggerBuildIfReady(options)}
                className="w-full accent-amber-400 cursor-pointer h-1.5"
              />
            </div>

            <div title="Curvatura de la sección transversal generada desde la silueta de las fotos (menor = más plano/angular, mayor = más cilíndrico/abombado).">
              <div className="flex items-center justify-between text-[9.5px]">
                <span className="text-amber-200 font-medium">Curvatura de sección libre:</span>
                <span className="font-mono text-amber-300">
                  {Math.round((options.freeformSectionRoundness ?? 1.0) * 100)}%
                </span>
              </div>
              <input
                type="range"
                data-testid="freeform-section-roundness-slider"
                min={0.3}
                max={2.5}
                step={0.05}
                value={options.freeformSectionRoundness ?? 1.0}
                onChange={(e) => {
                  const freeformSectionRoundness = parseFloat(e.target.value);
                  setOptions((prev) => ({ ...prev, freeformSectionRoundness }));
                }}
                onMouseUp={() => triggerBuildIfReady(options)}
                onTouchEnd={() => triggerBuildIfReady(options)}
                onKeyUp={() => triggerBuildIfReady(options)}
                className="w-full accent-amber-400 cursor-pointer h-1.5"
              />
              <div className="grid grid-cols-4 gap-1 pt-0.5">
                {[
                  { label: 'Plano', val: 0.45 },
                  { label: 'Orgánico', val: 1.0 },
                  { label: 'Redondo', val: 1.5 },
                  { label: 'Esférico', val: 2.1 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      const nextOpts: HumanBuildOptions = {
                        ...options,
                        freeformSectionRoundness: p.val,
                        customRig: currentRig ?? options.customRig ?? null,
                      };
                      setOptions(nextOpts);
                      triggerBuildIfReady(nextOpts);
                    }}
                    className={`py-0.5 px-1 rounded text-[9px] font-medium border cursor-pointer ${
                      Math.abs((options.freeformSectionRoundness ?? 1.0) - p.val) < 0.08
                        ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                        : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Las imágenes individuales */}
      <div className="space-y-1">
        {SLOTS.map((slot) => {
          const slotTf = options.photoTransforms?.[slot.id];
          const isMod = isPhotoTransformModified(slotTf);
          return (
            <div key={slot.id} className="flex items-center gap-1.5" title={slot.hint}>
              <input
                ref={(el) => {
                  inputs.current[slot.id] = el;
                }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pick(slot.id, e.target.files?.[0])}
              />
              {!images[slot.id] ? (
                <button
                  type="button"
                  onClick={() => inputs.current[slot.id]?.click()}
                  className="flex-1 px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1.5 cursor-pointer"
                >
                  <ImagePlus className="w-3 h-3 text-sky-400" />
                  <span className="truncate">{slot.label}</span>
                  {slot.id === 'front' && (
                    <span className="ml-auto text-[9px] text-amber-400">necesaria</span>
                  )}
                </button>
              ) : (
                <div className="flex-1 flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-sky-400/15 border border-sky-400/40">
                  <img
                    src={images[slot.id]!.src}
                    alt={slot.label}
                    className="w-6 h-6 object-cover rounded"
                  />
                  <span className="truncate text-sky-200 max-w-[105px]">{names[slot.id]}</span>
                  {isMod && slotTf && (
                    <span className="text-[8.5px] font-mono px-1 py-0.5 rounded bg-amber-500/25 text-amber-200 border border-amber-400/40">
                      {Math.round(slotTf.scaleX * 100)}%
                    </span>
                  )}
                  <button
                    type="button"
                    data-testid={`align-slot-${slot.id}-btn`}
                    onClick={() => {
                      setAlignSlot(slot.id);
                      setShowAlignStudio(true);
                    }}
                    className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 border cursor-pointer transition-colors ${
                      showAlignStudio && effectiveAlignSlot === slot.id
                        ? 'bg-amber-400 text-slate-950 border-amber-300'
                        : 'bg-slate-900/90 hover:bg-slate-800 text-amber-200 border-amber-400/40'
                    }`}
                    title="Mover posición, cambiar tamaño o superponer translúcido con la foto del frente"
                  >
                    <Move className="w-2.5 h-2.5" />
                    <span>Posición/Tamaño</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => clear(slot.id)}
                    className="text-slate-400 hover:text-rose-400 cursor-pointer"
                    title="Quitar"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Estudio Interactivo Translúcido de Posición y Tamaño de Fotos (En Vivo) */}
      {images.front && (
        <div
          data-testid="photo-alignment-studio"
          className="p-2.5 rounded-lg bg-slate-950/95 border border-amber-400/45 space-y-2 shadow-inner"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowAlignStudio((v) => !v)}
              className="flex items-center gap-1.5 text-[10.5px] font-semibold text-amber-300 hover:text-amber-200 cursor-pointer"
            >
              <Move className="w-3.5 h-3.5 text-amber-400" />
              <span>Posición y Tamaño Translúcido (Junto al Frente)</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAlignStudio((v) => !v)}
              className="text-[9.5px] px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer"
            >
              {showAlignStudio ? 'Ocultar' : 'Abrir editor'}
            </button>
          </div>

          {showAlignStudio && (() => {
            const frontTf = getSlotTransform('front', options);
            const activeTf = getSlotTransform(effectiveAlignSlot, options);
            const activeImg = images[effectiveAlignSlot] ?? images.front!;
            const isBackSlot = effectiveAlignSlot === 'back';
            const frontData = getCutoutPreviewData(images.front!, false);
            const activeData = getCutoutPreviewData(activeImg, isBackSlot);
            const frontBox = getPhotoRecuadroBox(
              'front',
              frontTf,
              frontData.bounds,
              frontData.bounds
            );
            const activeBox = getPhotoRecuadroBox(
              effectiveAlignSlot,
              activeTf,
              frontData.bounds,
              activeData.bounds
            );

            const activeLabel =
              SLOTS.find((s) => s.id === effectiveAlignSlot)?.label ?? effectiveAlignSlot;
            const availableSlots = SLOTS.filter((s) => Boolean(images[s.id]));

            const applyRecuadroEdges = (
              newLeft: number,
              newTop: number,
              newRight: number,
              newBottom: number,
              interactive: boolean
            ) => {
              const nextTf = photoTransformFromRecuadroBox(
                newLeft,
                newTop,
                newRight,
                newBottom,
                activeTf,
                activeBox
              );
              updateSlotTransform(effectiveAlignSlot, nextTf, interactive);
            };

            const handleCouplingPreset = (mode: 'coupleToFront' | 'matchHeight' | 'matchAll4') => {
              if (mode === 'matchHeight') {
                applyRecuadroEdges(
                  activeBox.left,
                  frontBox.top,
                  activeBox.right,
                  frontBox.bottom,
                  false
                );
                return;
              }
              if (mode === 'matchAll4') {
                applyRecuadroEdges(
                  frontBox.left,
                  frontBox.top,
                  frontBox.right,
                  frontBox.bottom,
                  false
                );
                return;
              }
              // 'coupleToFront': iguala Cabeza (top) y Pies (bottom) al Frente, centra en X con el Frente
              // y mantiene la proporción natural de ancho del perfil (o iguala ancho en espalda).
              const targetScaleY = frontBox.height / Math.max(1, activeBox.baseHeight);
              const isBack =
                effectiveAlignSlot === 'back' || effectiveAlignSlot === 'backLayer';
              const targetW = isBack
                ? frontBox.width
                : activeBox.baseWidth * targetScaleY;
              const halfW = targetW * 0.5;
              applyRecuadroEdges(
                frontBox.centerX - halfW,
                frontBox.top,
                frontBox.centerX + halfW,
                frontBox.bottom,
                false
              );
            };

            const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
              const canvas = alignCanvasRef.current;
              if (!canvas) return;
              canvas.setPointerCapture(e.pointerId);
              const rect = canvas.getBoundingClientRect();
              const isSideBySide = alignViewMode === 'sideBySide';
              const W = isSideBySide ? 512 : 256;
              const H = 256;
              const cxCanvas = ((e.clientX - rect.left) / Math.max(1, rect.width)) * W;
              const cyCanvas = ((e.clientY - rect.top) / Math.max(1, rect.height)) * H;

              const activeOriginX = isSideBySide ? 256 : 0;
              const lx = cxCanvas - activeOriginX;
              const ly = cyCanvas;

              const { left, top, right, bottom, centerX, centerY } = activeBox;
              const tol = 14;

              let mode: RecuadroHandleId = 'move';
              if (Math.hypot(lx - left, ly - top) <= tol) mode = 'nw';
              else if (Math.hypot(lx - right, ly - top) <= tol) mode = 'ne';
              else if (Math.hypot(lx - left, ly - bottom) <= tol) mode = 'sw';
              else if (Math.hypot(lx - right, ly - bottom) <= tol) mode = 'se';
              else if (Math.abs(ly - top) <= tol && Math.abs(lx - centerX) <= Math.max(24, (right - left) * 0.35))
                mode = 'n';
              else if (Math.abs(ly - bottom) <= tol && Math.abs(lx - centerX) <= Math.max(24, (right - left) * 0.35))
                mode = 's';
              else if (Math.abs(lx - left) <= tol && Math.abs(ly - centerY) <= Math.max(24, (bottom - top) * 0.35))
                mode = 'w';
              else if (Math.abs(lx - right) <= tol && Math.abs(ly - centerY) <= Math.max(24, (bottom - top) * 0.35))
                mode = 'e';

              dragStateRef.current = {
                mode,
                startX: e.clientX,
                startY: e.clientY,
                startTf: { ...activeTf },
                startBox: { ...activeBox },
              };
            };

            const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
              const drag = dragStateRef.current;
              const canvas = alignCanvasRef.current;
              if (!drag || !canvas) return;
              const rect = canvas.getBoundingClientRect();
              const isSideBySide = alignViewMode === 'sideBySide';
              const singleWidthPx = isSideBySide ? rect.width * 0.5 : rect.width;
              const dxTex = ((e.clientX - drag.startX) / Math.max(40, singleWidthPx)) * 256;
              const dyTex = ((e.clientY - drag.startY) / Math.max(40, rect.height)) * 256;

              const sb = drag.startBox;
              let newLeft = sb.left;
              let newTop = sb.top;
              let newRight = sb.right;
              let newBottom = sb.bottom;

              if (drag.mode === 'move') {
                newLeft += dxTex;
                newRight += dxTex;
                newTop += dyTex;
                newBottom += dyTex;
              } else {
                // Redimensionamiento anclado del recuadro: al mover un borde o esquina,
                // el borde/esquina opuesto permanece 100% fijo para poder acoplar cabeza y pies sin desajustar el otro extremo.
                if (drag.mode === 'n' || drag.mode === 'nw' || drag.mode === 'ne') {
                  newTop = Math.min(sb.bottom - 16, sb.top + dyTex);
                }
                if (drag.mode === 's' || drag.mode === 'sw' || drag.mode === 'se') {
                  newBottom = Math.max(sb.top + 16, sb.bottom + dyTex);
                }
                if (drag.mode === 'w' || drag.mode === 'nw' || drag.mode === 'sw') {
                  newLeft = Math.min(sb.right - 16, sb.left + dxTex);
                }
                if (drag.mode === 'e' || drag.mode === 'ne' || drag.mode === 'se') {
                  newRight = Math.max(sb.left + 16, sb.right + dxTex);
                }

                if (uniformPhotoScale && drag.mode !== 'n' && drag.mode !== 's' && drag.mode !== 'e' && drag.mode !== 'w') {
                  const ratio = sb.width / Math.max(1, sb.height);
                  const newH = Math.max(16, newBottom - newTop);
                  const targetW = newH * ratio;
                  if (drag.mode === 'nw' || drag.mode === 'sw') {
                    newLeft = newRight - targetW;
                  } else {
                    newRight = newLeft + targetW;
                  }
                }
              }

              const nextTf = photoTransformFromRecuadroBox(
                newLeft,
                newTop,
                newRight,
                newBottom,
                drag.startTf,
                sb
              );
              updateSlotTransform(effectiveAlignSlot, nextTf, true);
            };

            const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
              if (!dragStateRef.current) return;
              dragStateRef.current = null;
              const canvas = alignCanvasRef.current;
              if (canvas && canvas.hasPointerCapture(e.pointerId)) {
                canvas.releasePointerCapture(e.pointerId);
              }
              triggerBuildIfReady(options, false);
            };

            const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
              e.preventDefault();
              const step = e.deltaY < 0 ? 0.04 : -0.04;
              const nextSX = Math.round(Math.max(0.2, Math.min(3.0, activeTf.scaleX + step)) * 100) / 100;
              const nextSY = uniformPhotoScale
                ? nextSX
                : Math.round(Math.max(0.2, Math.min(3.0, activeTf.scaleY + step)) * 100) / 100;
              updateSlotTransform(effectiveAlignSlot, { scaleX: nextSX, scaleY: nextSY }, false);
            };

            return (
              <div className="space-y-2">
                {/* Selector de cuál foto estamos moviendo / escalando */}
                <div className="flex flex-wrap gap-1">
                  {availableSlots.map((s) => {
                    const active = effectiveAlignSlot === s.id;
                    const shortName =
                      s.id === 'front'
                        ? 'Frente'
                        : s.id === 'side'
                        ? 'Perfil Der'
                        : s.id === 'back'
                        ? 'Espalda'
                        : s.id === 'sideLeft'
                        ? 'Perfil Izq'
                        : s.label.replace('Mapa de capas ', 'Capa ');
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setAlignSlot(s.id)}
                        className={`px-2 py-1 rounded text-[9.5px] font-semibold border cursor-pointer transition-all ${
                          active
                            ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-sm'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {shortName}
                      </button>
                    );
                  })}
                </div>

                {/* Selector de Modo de Superposición: Superpuesto Translúcido vs Junto al Frente */}
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setAlignViewMode('overlay')}
                    className={`py-1 px-2 rounded text-[9.5px] font-semibold border cursor-pointer flex items-center justify-center gap-1 ${
                      alignViewMode === 'overlay'
                        ? 'bg-sky-500/25 border-sky-400 text-sky-100'
                        : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400'
                    }`}
                    title="Superpone la foto seleccionada de forma translúcida directamente encima de la foto del frente"
                  >
                    <Layers className="w-3 h-3" />
                    <span>Superpuesto Translúcido</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlignViewMode('sideBySide')}
                    className={`py-1 px-2 rounded text-[9.5px] font-semibold border cursor-pointer flex items-center justify-center gap-1 ${
                      alignViewMode === 'sideBySide'
                        ? 'bg-sky-500/25 border-sky-400 text-sky-100'
                        : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400'
                    }`}
                    title="Muestra la foto del frente a la izquierda y la foto activa junto a ella con fantasma translúcido y guías horizontales"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>Junto al Frente + Guía</span>
                  </button>
                </div>

                {/* Lienzo Interactivo con Recuadro de 8 tiradores (4 lados azules + 4 esquinas amarillas) */}
                <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-slate-950 flex flex-col items-center">
                  <canvas
                    ref={alignCanvasRef}
                    data-testid="translucent-align-canvas"
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={handleCanvasPointerUp}
                    onPointerCancel={handleCanvasPointerUp}
                    onWheel={handleCanvasWheel}
                    className={`w-full ${
                      alignViewMode === 'sideBySide' ? 'aspect-[2/1]' : 'aspect-square max-w-[260px]'
                    } cursor-move touch-none select-none`}
                  />
                  <div className="w-full px-2 py-1 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-[9px] text-slate-300">
                    <span className="truncate">
                      Recuadro: <strong className="text-amber-300">{activeLabel}</strong>
                    </span>
                    <span className="text-sky-300 font-mono">
                      Centro = mover · 4 Lados/Esquinas = encajar
                    </span>
                  </div>
                </div>

                {/* Barra de Opacidad Translúcida */}
                <div>
                  <div className="flex items-center justify-between text-[9.5px]">
                    <span className="text-sky-200">Opacidad translúcida sobre el Frente:</span>
                    <span className="font-mono text-amber-300">{Math.round(alignOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    data-testid="align-opacity-slider"
                    min={0.15}
                    max={1.0}
                    step={0.05}
                    value={alignOpacity}
                    onChange={(e) => setAlignOpacity(parseFloat(e.target.value))}
                    className="w-full accent-sky-400 cursor-pointer h-1.5"
                  />
                </div>

                {/* Configuración Directa del Recuadro (4 Bordes Independientes + Auto-Acoplamiento al Frente) */}
                <div
                  data-testid="recuadro-config-box"
                  className="p-2 rounded bg-slate-900/95 border border-sky-500/40 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[9.5px]">
                    <span className="text-sky-200 font-semibold">
                      Configuración del Recuadro (4 Bordes):
                    </span>
                    <span className="font-mono text-[9px] text-amber-300">
                      {Math.round(activeBox.width)}×{Math.round(activeBox.height)} px
                    </span>
                  </div>

                  {/* Botones de acoplamiento instantáneo al Recuadro del Frente */}
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      data-testid="btn-couple-recuadro-front"
                      onClick={() => handleCouplingPreset('coupleToFront')}
                      className="py-1 px-1.5 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-[9px] font-semibold text-sky-100 cursor-pointer"
                      title="Encaja automáticamente el borde superior (Cabeza), inferior (Pies) y centro X al recuadro del Frente"
                    >
                      🎯 Acoplar al Frente
                    </button>
                    <button
                      type="button"
                      data-testid="btn-match-recuadro-height"
                      onClick={() => handleCouplingPreset('matchHeight')}
                      className="py-1 px-1.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-700 text-[9px] font-semibold text-slate-200 cursor-pointer"
                      title="Iguala el borde superior (Cabeza) y el borde inferior (Pies) con el recuadro del Frente"
                    >
                      ↕ Igualar Cabeza/Pies
                    </button>
                    <button
                      type="button"
                      data-testid="btn-match-recuadro-all4"
                      onClick={() => handleCouplingPreset('matchAll4')}
                      className="py-1 px-1.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-700 text-[9px] font-semibold text-slate-200 cursor-pointer"
                      title="Iguala los 4 bordes (Arriba, Abajo, Izquierda, Derecha) exactamente al recuadro del Frente"
                    >
                      ↔ Igualar 4 Bordes
                    </button>
                  </div>

                  {/* 4 Deslizadores independientes para mover cada borde del recuadro sin desajustar el borde opuesto */}
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-0.5">
                    <div>
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="text-sky-300">▲ Borde Sup. (Cabeza):</span>
                        <span className="font-mono text-amber-300">{Math.round(activeBox.top)}px</span>
                      </div>
                      <input
                        type="range"
                        data-testid="recuadro-top-slider"
                        min={-40}
                        max={Math.max(0, Math.round(activeBox.bottom - 20))}
                        step={1}
                        value={Math.round(activeBox.top)}
                        onChange={(e) =>
                          applyRecuadroEdges(
                            activeBox.left,
                            parseFloat(e.target.value),
                            activeBox.right,
                            activeBox.bottom,
                            true
                          )
                        }
                        onMouseUp={() => triggerBuildIfReady(options, false)}
                        onTouchEnd={() => triggerBuildIfReady(options, false)}
                        className="w-full accent-sky-400 cursor-pointer h-1.5"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="text-sky-300">▼ Borde Inf. (Pies):</span>
                        <span className="font-mono text-amber-300">{Math.round(activeBox.bottom)}px</span>
                      </div>
                      <input
                        type="range"
                        data-testid="recuadro-bottom-slider"
                        min={Math.min(250, Math.round(activeBox.top + 20))}
                        max={296}
                        step={1}
                        value={Math.round(activeBox.bottom)}
                        onChange={(e) =>
                          applyRecuadroEdges(
                            activeBox.left,
                            activeBox.top,
                            activeBox.right,
                            parseFloat(e.target.value),
                            true
                          )
                        }
                        onMouseUp={() => triggerBuildIfReady(options, false)}
                        onTouchEnd={() => triggerBuildIfReady(options, false)}
                        className="w-full accent-sky-400 cursor-pointer h-1.5"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="text-sky-300">◀ Borde Izquierdo:</span>
                        <span className="font-mono text-amber-300">{Math.round(activeBox.left)}px</span>
                      </div>
                      <input
                        type="range"
                        data-testid="recuadro-left-slider"
                        min={-60}
                        max={Math.max(0, Math.round(activeBox.right - 20))}
                        step={1}
                        value={Math.round(activeBox.left)}
                        onChange={(e) =>
                          applyRecuadroEdges(
                            parseFloat(e.target.value),
                            activeBox.top,
                            activeBox.right,
                            activeBox.bottom,
                            true
                          )
                        }
                        onMouseUp={() => triggerBuildIfReady(options, false)}
                        onTouchEnd={() => triggerBuildIfReady(options, false)}
                        className="w-full accent-sky-400 cursor-pointer h-1.5"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="text-sky-300">▶ Borde Derecho:</span>
                        <span className="font-mono text-amber-300">{Math.round(activeBox.right)}px</span>
                      </div>
                      <input
                        type="range"
                        data-testid="recuadro-right-slider"
                        min={Math.min(250, Math.round(activeBox.left + 20))}
                        max={316}
                        step={1}
                        value={Math.round(activeBox.right)}
                        onChange={(e) =>
                          applyRecuadroEdges(
                            activeBox.left,
                            activeBox.top,
                            parseFloat(e.target.value),
                            activeBox.bottom,
                            true
                          )
                        }
                        onMouseUp={() => triggerBuildIfReady(options, false)}
                        onTouchEnd={() => triggerBuildIfReady(options, false)}
                        className="w-full accent-sky-400 cursor-pointer h-1.5"
                      />
                    </div>
                  </div>
                </div>

                {/* Tamaño / Escala interactiva en tiempo real */}
                <div className="p-2 rounded bg-slate-900/90 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[9.5px]">
                    <span className="text-amber-200 font-semibold">
                      Tamaño / Escala ({uniformPhotoScale ? 'Proporcional' : 'Libre X/Y'}):
                    </span>
                    <label className="flex items-center gap-1 text-[9px] text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={uniformPhotoScale}
                        onChange={(e) => setUniformPhotoScale(e.target.checked)}
                        className="accent-amber-400"
                      />
                      <span>Mantener proporción</span>
                    </label>
                  </div>

                  {/* Barra principal de Tamaño (empequeñecer / agrandar con resultado en vivo) */}
                  <div>
                    <div className="flex items-center justify-between text-[9.5px]">
                      <span className="text-slate-300">
                        {uniformPhotoScale ? 'Tamaño general:' : 'Tamaño Ancho (X):'}
                      </span>
                      <span className="font-mono text-amber-300">
                        {Math.round(activeTf.scaleX * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      data-testid="photo-scale-x-slider"
                      min={0.25}
                      max={2.5}
                      step={0.01}
                      value={activeTf.scaleX}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        updateSlotTransform(
                          effectiveAlignSlot,
                          uniformPhotoScale ? { scaleX: val, scaleY: val } : { scaleX: val },
                          true
                        );
                      }}
                      onMouseUp={() => triggerBuildIfReady(options, false)}
                      onTouchEnd={() => triggerBuildIfReady(options, false)}
                      className="w-full accent-amber-400 cursor-pointer h-1.5"
                    />
                  </div>

                  {!uniformPhotoScale && (
                    <div>
                      <div className="flex items-center justify-between text-[9.5px]">
                        <span className="text-slate-300">Tamaño Alto (Y):</span>
                        <span className="font-mono text-amber-300">
                          {Math.round(activeTf.scaleY * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        data-testid="photo-scale-y-slider"
                        min={0.25}
                        max={2.5}
                        step={0.01}
                        value={activeTf.scaleY}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          updateSlotTransform(effectiveAlignSlot, { scaleY: val }, true);
                        }}
                        onMouseUp={() => triggerBuildIfReady(options, false)}
                        onTouchEnd={() => triggerBuildIfReady(options, false)}
                        className="w-full accent-amber-400 cursor-pointer h-1.5"
                      />
                    </div>
                  )}

                  {/* Botones rápidos para empequeñecer o agrandar al instante */}
                  <div className="grid grid-cols-5 gap-1 pt-0.5">
                    {[
                      { label: '-10%', delta: -0.1 },
                      { label: '-2%', delta: -0.02 },
                      { label: '100%', abs: 1.0 },
                      { label: '+2%', delta: 0.02 },
                      { label: '+10%', delta: 0.1 },
                    ].map((b) => (
                      <button
                        key={b.label}
                        type="button"
                        onClick={() => {
                          const sx =
                            b.abs !== undefined
                              ? b.abs
                              : Math.round(Math.max(0.2, Math.min(3.0, activeTf.scaleX + b.delta)) * 100) / 100;
                          const sy =
                            b.abs !== undefined
                              ? b.abs
                              : Math.round(Math.max(0.2, Math.min(3.0, activeTf.scaleY + b.delta)) * 100) / 100;
                          updateSlotTransform(effectiveAlignSlot, { scaleX: sx, scaleY: sy }, false);
                        }}
                        className="py-0.5 px-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-700 text-[9px] font-mono text-amber-200 cursor-pointer"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Posición X e Y en tiempo real */}
                <div className="p-2 rounded bg-slate-900/90 border border-slate-800 space-y-1.5">
                  <div>
                    <div className="flex items-center justify-between text-[9.5px]">
                      <span className="text-slate-300">Posición Horizontal (X):</span>
                      <span className="font-mono text-amber-300">
                        {activeTf.offsetX >= 0 ? '+' : ''}
                        {activeTf.offsetX.toFixed(1)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      data-testid="photo-offset-x-slider"
                      min={-60}
                      max={60}
                      step={0.5}
                      value={activeTf.offsetX}
                      onChange={(e) =>
                        updateSlotTransform(
                          effectiveAlignSlot,
                          { offsetX: parseFloat(e.target.value) },
                          true
                        )
                      }
                      onMouseUp={() => triggerBuildIfReady(options, false)}
                      onTouchEnd={() => triggerBuildIfReady(options, false)}
                      className="w-full accent-amber-400 cursor-pointer h-1.5"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[9.5px]">
                      <span className="text-slate-300">Posición Vertical (Y):</span>
                      <span className="font-mono text-amber-300">
                        {activeTf.offsetY >= 0 ? '+' : ''}
                        {activeTf.offsetY.toFixed(1)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      data-testid="photo-offset-y-slider"
                      min={-60}
                      max={60}
                      step={0.5}
                      value={activeTf.offsetY}
                      onChange={(e) =>
                        updateSlotTransform(
                          effectiveAlignSlot,
                          { offsetY: parseFloat(e.target.value) },
                          true
                        )
                      }
                      onMouseUp={() => triggerBuildIfReady(options, false)}
                      onTouchEnd={() => triggerBuildIfReady(options, false)}
                      className="w-full accent-amber-400 cursor-pointer h-1.5"
                    />
                  </div>

                  {/* Giro y Volteo Horizontal */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="text-slate-400">Giro:</span>
                        <span className="font-mono text-amber-300">{Math.round(activeTf.rotation)}°</span>
                      </div>
                      <input
                        type="range"
                        min={-45}
                        max={45}
                        step={1}
                        value={activeTf.rotation}
                        onChange={(e) =>
                          updateSlotTransform(
                            effectiveAlignSlot,
                            { rotation: parseFloat(e.target.value) },
                            true
                          )
                        }
                        onMouseUp={() => triggerBuildIfReady(options, false)}
                        onTouchEnd={() => triggerBuildIfReady(options, false)}
                        className="w-full accent-amber-400 cursor-pointer h-1.5"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateSlotTransform(effectiveAlignSlot, { flipX: !activeTf.flipX }, false)
                      }
                      className={`px-2 py-1 rounded text-[9px] font-semibold border flex items-center gap-1 cursor-pointer ${
                        activeTf.flipX
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                          : 'bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                      title="Voltear la foto horizontalmente en espejo"
                    >
                      <FlipHorizontal2 className="w-3 h-3" />
                      <span>Espejar</span>
                    </button>
                  </div>
                </div>

                {/* Opciones de sincronización con mapa de capas y restaurar */}
                <div className="flex items-center justify-between gap-1 pt-0.5">
                  <label className="flex items-center gap-1 text-[9px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncLayerTransform}
                      onChange={(e) => setSyncLayerTransform(e.target.checked)}
                      className="accent-sky-400"
                    />
                    <span>Vincular con su mapa de colores</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => resetSlotTransform(effectiveAlignSlot)}
                      className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[9px] text-slate-300 flex items-center gap-1 cursor-pointer"
                      title="Restaurar posición y tamaño original de esta foto"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Restaurar foto</span>
                    </button>
                    <button
                      type="button"
                      onClick={resetAllPhotoTransforms}
                      className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-rose-950/60 border border-slate-700 text-[9px] text-rose-300 cursor-pointer"
                      title="Restaurar todas las fotos a su posición y tamaño original"
                    >
                      Todo 100%
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Botones rápidos de carga directa (con opción directa de Construcción Libre sin molde previo) */}
      <input
        ref={allInOneInputRef}
        data-testid="all-in-one-file-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleSheetUpload(e.target.files?.[0])}
      />
      <input
        ref={freeformInputRef}
        data-testid="freeform-file-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleSheetUpload(e.target.files?.[0], true)}
      />
      <div className="space-y-1.5">
        <button
          type="button"
          data-testid="upload-all-in-one-btn"
          onClick={() => allInOneInputRef.current?.click()}
          className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-amber-500/25 via-sky-500/25 to-emerald-500/25 hover:from-amber-500/35 hover:to-emerald-500/35 border border-sky-400/40 text-sky-200 text-[11px] font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow-sky-500/10"
          title="Sube cualquier imagen (1 vista o todo-en-uno de 4/8 vistas) usando el modo seleccionado actualmente."
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span>Cargar imagen todo-en-uno (Cualquier personaje)</span>
        </button>

        <button
          type="button"
          data-testid="upload-freeform-photos-btn"
          onClick={() => freeformInputRef.current?.click()}
          className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-amber-500/30 via-orange-500/25 to-rose-500/25 hover:from-amber-500/40 hover:to-rose-500/35 border border-amber-400/50 text-amber-100 text-[11px] font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow-amber-500/10"
          title="Carga una foto (o lámina de vistas) y genera directamente el molde 3D en modo Construcción Libre basándose solo en las fotos, sin molde previo."
        >
          <ImagePlus className="w-3.5 h-3.5 text-amber-300" />
          <span>Cargar fotos en Construcción Libre (Sin molde previo)</span>
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowLayerLegend((v) => !v)}
        className="text-[10px] text-slate-400 hover:text-sky-300 underline cursor-pointer"
      >
        {showLayerLegend ? 'Ocultar' : 'Ver'} los colores del mapa de capas
      </button>
      {showLayerLegend && (
        <div className="space-y-0.5 p-1.5 rounded bg-slate-950/80 border border-slate-800">
          <p className="text-[10px] text-slate-400 leading-snug mb-1">
            Píntalo encima de una copia de la foto, con colores planos. Dice qué
            sobresale; la textura sigue saliendo de la foto.
          </p>
          {LAYER_CLASSES.map((c) => (
            <div key={c.id} className="flex items-center gap-1.5 text-[10px]">
              <span
                className="w-3 h-3 rounded border border-slate-700"
                style={{ background: `rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})` }}
              />
              <span className="text-slate-300 flex-1 truncate">{c.label}</span>
              <span className="font-mono text-slate-500">
                {c.offset > 0 ? '+' : ''}
                {c.offset}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Ajustes */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        {slider('Profundidad', 'depthScale', 0.2, 1.8, 0.05, (v) => `${Math.round(v * 100)}%`,
          'Grosor del cuerpo. 100% son proporciones humanas naturales.')}
        {slider('Relieve de la foto', 'reliefAmount', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`,
          'Cuánto detalle de brillo de la foto se añade encima del cuerpo.')}
        <div
          title="Fuerza global del molde facial 3D cuando hay un modelo de cara activo."
          className={options.presetFaceFeatures ? '' : 'opacity-55'}
        >
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-400">Detalle de la cara</span>
            <span className="font-mono text-amber-300">
              {options.presetFaceFeatures ? options.faceDetail.toFixed(2) : 'Auto (Imagen)'}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={5.0}
            step={0.05}
            value={options.faceDetail}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              const nextOpts: HumanBuildOptions = {
                ...options,
                faceDetail: val,
                presetFaceFeatures: val > 0 ? true : options.presetFaceFeatures,
                faceModel:
                  val > 0 && options.faceModel === 'none' ? 'classic' : options.faceModel,
                customRig: currentRig ?? options.customRig ?? null,
              };
              setOptions(nextOpts);
            }}
            onMouseUp={() => triggerBuildIfReady(options)}
            onTouchEnd={() => triggerBuildIfReady(options)}
            onKeyUp={() => triggerBuildIfReady(options)}
            className="w-full accent-amber-400 cursor-pointer"
          />
        </div>
        {slider('Altura de capas', 'layerStrength', 0, 2, 0.05, (v) => v.toFixed(2),
          'Escala el relieve del mapa de capas pintado.')}
        <div>
          {slider('Filas de malla', 'rows', 40, 1000, 2, (v) => `${Math.round(v)}`,
            'Más filas = más detalle y más triángulos (hasta 1000 filas).')}
          <div className="flex items-center gap-1 mt-1">
            {[80, 160, 246, 500, 1000].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  const nextOpts = { ...options, rows: r };
                  setOptions(nextOpts);
                  triggerBuildIfReady(nextOpts);
                }}
                className={`flex-1 py-0.5 rounded text-[9px] font-mono border transition-colors ${
                  Math.round(options.rows) === r
                    ? 'bg-amber-400 text-slate-950 font-bold border-amber-300 shadow-sm'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border-slate-800'
                }`}
                title={`Fijar a ${r} filas de malla`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {slider('Metalizado', 'metalMix', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`,
          '100% = igual que Vortex3D. Bájalo si la piel sale con brillo de metal.')}
        {slider('Relieve de textura', 'normalStrength', 0, 2, 0.05, (v) => v.toFixed(2),
          'Fuerza del mapa de normales sacado de la foto. 1,5 es el valor de Vortex3D.')}
        {slider('Importancia del perfil (Gradual)', 'sideStrength', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`,
          'Importancia gradual del perfil en el Plano ZY (0% a 100%, continuo sin saltos bruscos).')}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label className="flex items-center gap-1 cursor-pointer" title="19 huesos, pesos de piel y las 11 animaciones de Enemigo-rpg.">
          <input
            type="checkbox"
            checked={options.rig}
            onChange={(e) => setOptions((p) => ({ ...p, rig: e.target.checked }))}
            className="accent-amber-400 cursor-pointer"
          />
          <span className="text-slate-300">Esqueleto y animaciones</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer" title="Botas con el ancho de la pierna, unidas al hueso del pie.">
          <input
            type="checkbox"
            checked={options.shoes}
            onChange={(e) => setOptions((p) => ({ ...p, shoes: e.target.checked }))}
            className="accent-amber-400 cursor-pointer"
          />
          <span className="text-slate-300">Botas</span>
        </label>
        <label
          className="flex items-center gap-1 cursor-pointer"
          title="Si se desmarca (por defecto), la cabeza y la cara se generan igual que el resto del cuerpo a partir de la silueta, el perfil y el mapa de capas. Si se marca, esculpe el modelo de cara 3D seleccionado."
        >
          <input
            type="checkbox"
            data-testid="preset-face-checkbox"
            checked={options.presetFaceFeatures}
            onChange={(e) => {
              const checked = e.target.checked;
              const nextModel: FaceModelId =
                checked && options.faceModel === 'none' ? 'classic' : checked ? options.faceModel : 'none';
              const nextOpts: HumanBuildOptions = {
                ...options,
                presetFaceFeatures: checked,
                faceModel: nextModel,
                customRig: currentRig ?? options.customRig ?? null,
              };
              setOptions(nextOpts);
              triggerBuildIfReady(nextOpts);
            }}
            className="accent-amber-400 cursor-pointer"
          />
          <span className="text-slate-300">Huesos de cara predeterminados</span>
        </label>
      </div>

      {/* Silueta Ortogonal (Plano XY + Plano ZY Gradual) y Barra de Porcentaje de Textura de Perfil */}
      <div className="p-2.5 rounded-lg bg-slate-950/90 border border-emerald-500/30 space-y-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
            <span>📐 Silueta Plano XY (Frente) + Plano ZY (Perfil Gradual)</span>
          </span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/40">
            Perfil ZY: {Math.round((options.sideStrength ?? 1) * 100)}%
          </span>
        </div>

        <p className="text-[9.5px] text-slate-400 leading-tight">
          · <b>Plano XY (Frente):</b> la silueta delantera marca lo que ocupa el modelo. Del centro hacia delante (+Z) manda la foto delantera y del centro hacia atrás (-Z) manda la foto trasera.
          <br />· <b>Plano ZY (Perfil):</b> la silueta de perfil regula el comportamiento en profundidad de forma <b>gradual (0% a 100%)</b>.
        </p>

        {/* Barra de Importancia Gradual del Perfil en el Plano ZY (0% a 100%) */}
        <div className="space-y-1 pt-0.5 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-[9.5px]">
            <span className="text-slate-200 font-medium">
              Importancia del perfil en el Plano ZY (gradual):
            </span>
            <span className="font-mono text-amber-300 font-bold">
              {Math.round((options.sideStrength ?? 1) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={options.sideStrength ?? 1}
            onChange={(e) => {
              const sideStrength = parseFloat(e.target.value);
              setOptions((prev) => ({
                ...prev,
                sideStrength,
                customRig: currentRig ?? prev.customRig ?? null,
              }));
            }}
            onMouseUp={() => triggerBuildIfReady(options)}
            onTouchEnd={() => triggerBuildIfReady(options)}
            onKeyUp={() => triggerBuildIfReady(options)}
            className="w-full accent-amber-400 cursor-pointer h-1.5"
            title="Regula gradualmente de 0% a 100% cuánto influye la silueta de perfil en el plano ZY (sin saltos de todo o nada)"
          />
          <div className="flex items-center gap-1">
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  const nextOpts: HumanBuildOptions = {
                    ...options,
                    sideStrength: v,
                    customRig: currentRig ?? options.customRig ?? null,
                  };
                  setOptions(nextOpts);
                  triggerBuildIfReady(nextOpts);
                }}
                className={`flex-1 py-0.5 rounded text-[9px] font-mono border cursor-pointer ${
                  Math.abs((options.sideStrength ?? 1) - v) < 0.02
                    ? 'bg-amber-400 text-slate-950 font-bold border-amber-300'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800'
                }`}
              >
                {Math.round(v * 100)}%
              </button>
            ))}
          </div>
        </div>

        {/* Barra de Porcentaje de Aplicación de Textura de los Perfiles (0% por defecto = solo Frente/Atrás) */}
        <div className="space-y-1 pt-1 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-[9.5px]">
            <span className="text-slate-200 font-medium">
              Aplicación de textura de los perfiles (en todo el perfil):
            </span>
            <span className="font-mono text-emerald-300 font-bold">
              {Math.round(options.profileTexturePct ?? 0)}%
            </span>
          </div>
          <p className="text-[9px] text-slate-400 leading-tight">
            Al <b>0%</b> (por defecto), del frente al centro manda la foto del frente y del centro hacia atrás la foto de atrás. Sube la barra solo cuando quieras aplicar la textura de los perfiles.
          </p>
          <input
            type="range"
            data-testid="profile-texture-pct-slider"
            min={0}
            max={100}
            step={1}
            value={options.profileTexturePct ?? 0}
            onChange={(e) => {
              const profileTexturePct = parseFloat(e.target.value);
              setOptions((prev) => ({
                ...prev,
                orthogonalSilhouetteAndSeam: true,
                profileTexturePct,
                customRig: currentRig ?? prev.customRig ?? null,
              }));
            }}
            onMouseUp={() => triggerBuildIfReady(options)}
            onTouchEnd={() => triggerBuildIfReady(options)}
            onKeyUp={() => triggerBuildIfReady(options)}
            className="w-full accent-emerald-400 cursor-pointer h-1.5"
            title="Porcentaje de aplicación de la textura de los perfiles sobre el modelo (0% = solo Frente y Espalda; 100% = aplicación total en el perfil)"
          />
          <div className="flex items-center gap-1">
            {[
              { label: '0% (Frente/Atrás)', val: 0 },
              { label: '25%', val: 25 },
              { label: '50%', val: 50 },
              { label: '75%', val: 75 },
              { label: '100% (Todo)', val: 100 },
            ].map((item) => (
              <button
                key={item.val}
                type="button"
                onClick={() => {
                  const nextOpts: HumanBuildOptions = {
                    ...options,
                    orthogonalSilhouetteAndSeam: true,
                    profileTexturePct: item.val,
                    customRig: currentRig ?? options.customRig ?? null,
                  };
                  setOptions(nextOpts);
                  triggerBuildIfReady(nextOpts);
                }}
                className={`flex-1 py-0.5 rounded text-[8.5px] font-mono border cursor-pointer ${
                  Math.round(options.profileTexturePct ?? 0) === item.val
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 font-bold'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Modelos de Cara 3D, Tamaño/Forma de Cabeza y Esculpido X/Y/Z */}
      <div className="p-2 rounded-lg bg-slate-950/90 border border-sky-500/25 space-y-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-semibold text-sky-300 flex items-center gap-1">
            <UserRound className="w-3 h-3 text-sky-400" />
            <span>Cabeza, Modelos de Cara y Rasgos 3D</span>
          </span>
          {activeFaceFeature !== 'none' ? (
            <button
              type="button"
              onClick={() => onSelectFaceFeature?.('none')}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 cursor-pointer"
              title="Ocultar marcador 3D en el visor"
            >
              🎯 Punto: {activeFaceFeature.toUpperCase()} ✕
            </button>
          ) : (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
              {options.presetFaceFeatures ? 'Activo' : 'Solo imagen'}
            </span>
          )}
        </div>

        {/* 0. TAMAÑO TOTAL DE LA CABEZA Y FORMA REDONDEADA / ANGULAR */}
        <div
          onClick={() => onSelectFaceFeature?.('head')}
          className={`p-1.5 rounded bg-slate-900/80 border space-y-1.5 transition-colors ${
            activeFaceFeature === 'head'
              ? 'border-cyan-400/70 bg-cyan-950/20'
              : 'border-slate-800/90'
          }`}
        >
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold text-amber-200">🧑 Cabeza Total (Tamaño y Forma)</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-amber-300 text-[9px]">
                {Math.round(options.headScale * 100)}% · Red: {Math.round(options.headRoundness * 100)}%
              </span>
              {renderFeatureMarkerButton('head', 'la cabeza')}
            </div>
          </div>

          {/* Tamaño total de la cabeza */}
          <div className="flex items-center gap-1.5 text-[9.5px]">
            <span className="text-slate-300 w-24 shrink-0">Tamaño total:</span>
            <input
              type="range"
              data-testid="head-scale-slider"
              min={0.4}
              max={2.5}
              step={0.02}
              value={options.headScale}
              onPointerDown={() => onSelectFaceFeature?.('head')}
              onChange={(e) => {
                const headScale = parseFloat(e.target.value);
                onSelectFaceFeature?.('head');
                setOptions((prev) => ({
                  ...prev,
                  headScale,
                  customRig: currentRig ?? prev.customRig ?? null,
                }));
              }}
              onMouseUp={() => triggerBuildIfReady(options)}
              onTouchEnd={() => triggerBuildIfReady(options)}
              onKeyUp={() => triggerBuildIfReady(options)}
              className="flex-1 accent-amber-400 cursor-pointer h-1.5"
              title="Cambia el tamaño total 3D de la cabeza desde el cuello (40% a 250%)"
            />
          </div>

          {/* Redondez / Forma de la cabeza */}
          <div className="flex items-center gap-1.5 text-[9.5px]">
            <span className="text-slate-300 w-24 shrink-0">Forma / Redondez:</span>
            <input
              type="range"
              data-testid="head-roundness-slider"
              min={0.2}
              max={2.5}
              step={0.05}
              value={options.headRoundness}
              onPointerDown={() => onSelectFaceFeature?.('head')}
              onChange={(e) => {
                const headRoundness = parseFloat(e.target.value);
                onSelectFaceFeature?.('head');
                setOptions((prev) => ({
                  ...prev,
                  headRoundness,
                  customRig: currentRig ?? prev.customRig ?? null,
                }));
              }}
              onMouseUp={() => triggerBuildIfReady(options)}
              onTouchEnd={() => triggerBuildIfReady(options)}
              onKeyUp={() => triggerBuildIfReady(options)}
              className="flex-1 accent-cyan-400 cursor-pointer h-1.5"
              title="Poner formas menos redondeadas (20% angular/cuadrada) o más redondeadas y esféricas (250%)"
            />
          </div>

          {/* Botones rápidos de forma redondeada / angular */}
          <div className="grid grid-cols-4 gap-1 pt-0.5">
            {[
              { label: 'Angular', val: 0.45 },
              { label: 'Natural', val: 1.0 },
              { label: 'Redonda', val: 1.55 },
              { label: 'Esférica', val: 2.15 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectFaceFeature?.('head');
                  const nextOpts: HumanBuildOptions = {
                    ...options,
                    headRoundness: preset.val,
                    customRig: currentRig ?? options.customRig ?? null,
                  };
                  setOptions(nextOpts);
                  triggerBuildIfReady(nextOpts);
                }}
                className={`py-0.5 px-1 rounded text-[9px] font-medium border cursor-pointer transition-colors ${
                  Math.abs(options.headRoundness - preset.val) < 0.08
                    ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                    : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-400'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Selector de Modelo de Cara */}
        <div className="space-y-0.5">
          <span className="text-[9.5px] text-slate-400 block">Arquetipo / Modelo de cabeza:</span>
          <select
            data-testid="face-model-select"
            value={options.presetFaceFeatures ? options.faceModel : 'none'}
            onChange={(e) => {
              const model = e.target.value as FaceModelId;
              const nextOpts: HumanBuildOptions = {
                ...applyFaceModelPreset(options, model),
                customRig: currentRig ?? options.customRig ?? null,
              };
              setOptions(nextOpts);
              triggerBuildIfReady(nextOpts);
            }}
            className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-[10px] text-amber-200 font-medium cursor-pointer"
          >
            {FACE_MODELS.map((m) => (
              <option key={m.id} value={m.id} title={m.hint}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Controles detallados de Nariz, Órbitas, Boca y Mentón (Forma, Tamaño y Posición X, Y, Z) */}
        <div className={`space-y-2 pt-1 border-t border-slate-800/80 ${options.presetFaceFeatures ? '' : 'opacity-75'}`}>
          {/* 1. NARIZ */}
          <div
            onClick={() => onSelectFaceFeature?.('nose')}
            className={`p-1.5 rounded bg-slate-900/70 border space-y-1 transition-colors ${
              activeFaceFeature === 'nose'
                ? 'border-cyan-400/70 bg-cyan-950/20'
                : 'border-slate-800/80'
            }`}
          >
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium text-slate-200">👃 Nariz</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-amber-300 text-[9px]">
                  Tam: {Math.round(options.noseSize * 100)}%
                </span>
                {renderFeatureMarkerButton('nose', 'la nariz')}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 items-center">
              <select
                data-testid="nose-shape-select"
                value={options.noseShape}
                onFocus={() => onSelectFaceFeature?.('nose')}
                onChange={(e) => {
                  onSelectFaceFeature?.('nose');
                  const noseShape = e.target.value as NoseShapeId;
                  const nextOpts: HumanBuildOptions = {
                    ...options,
                    noseShape,
                    presetFaceFeatures: true,
                    faceModel: options.faceModel === 'none' ? 'classic' : options.faceModel,
                    customRig: currentRig ?? options.customRig ?? null,
                  };
                  setOptions(nextOpts);
                  triggerBuildIfReady(nextOpts);
                }}
                className="bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-[9.5px] text-slate-200 cursor-pointer"
                title="Forma anatómica de la nariz"
              >
                {NOSE_SHAPES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                type="range"
                data-testid="nose-size-slider"
                min={0}
                max={6.0}
                step={0.05}
                value={options.noseSize}
                onPointerDown={() => onSelectFaceFeature?.('nose')}
                onChange={(e) => {
                  onSelectFaceFeature?.('nose');
                  const noseSize = parseFloat(e.target.value);
                  const nextOpts: HumanBuildOptions = {
                    ...options,
                    noseSize,
                    presetFaceFeatures: true,
                    faceModel: options.faceModel === 'none' ? 'classic' : options.faceModel,
                    customRig: currentRig ?? options.customRig ?? null,
                  };
                  setOptions(nextOpts);
                }}
                onMouseUp={() => triggerBuildIfReady(options)}
                onTouchEnd={() => triggerBuildIfReady(options)}
                onKeyUp={() => triggerBuildIfReady(options)}
                className="w-full accent-amber-400 cursor-pointer"
                title="Tamaño y proyección 3D de la nariz (hasta 600%)"
              />
            </div>
            {renderXYZFeatureSliders('nose', 'noseXOffset', 'noseYOffset', 'noseZOffset')}
          </div>

          {/* 2. ÓRBITAS DE LOS OJOS Y CEJAS */}
          <div
            onClick={() => onSelectFaceFeature?.('eyes')}
            className={`p-1.5 rounded bg-slate-900/70 border space-y-1 transition-colors ${
              activeFaceFeature === 'eyes'
                ? 'border-cyan-400/70 bg-cyan-950/20'
                : 'border-slate-800/80'
            }`}
          >
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium text-slate-200">👁️ Órbitas de ojos</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-amber-300 text-[9px]">
                  Tam/Prof: {Math.round(options.eyeSocketSize * 100)}%
                </span>
                {renderFeatureMarkerButton('eyes', 'las órbitas de los ojos')}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 items-center">
              <select
                data-testid="eye-socket-shape-select"
                value={options.eyeSocketShape}
                onFocus={() => onSelectFaceFeature?.('eyes')}
                onChange={(e) => {
                  onSelectFaceFeature?.('eyes');
                  const eyeSocketShape = e.target.value as EyeSocketShapeId;
                  const nextOpts: HumanBuildOptions = {
                    ...options,
                    eyeSocketShape,
                    presetFaceFeatures: true,
                    faceModel: options.faceModel === 'none' ? 'classic' : options.faceModel,
                    customRig: currentRig ?? options.customRig ?? null,
                  };
                  setOptions(nextOpts);
                  triggerBuildIfReady(nextOpts);
                }}
                className="bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-[9.5px] text-slate-200 cursor-pointer"
                title="Forma de las cuencas oculares y arco superciliar"
              >
                {EYE_SOCKET_SHAPES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                type="range"
                data-testid="eye-socket-size-slider"
                min={0}
                max={6.0}
                step={0.05}
                value={options.eyeSocketSize}
                onPointerDown={() => onSelectFaceFeature?.('eyes')}
                onChange={(e) => {
                  onSelectFaceFeature?.('eyes');
                  const eyeSocketSize = parseFloat(e.target.value);
                  const nextOpts: HumanBuildOptions = {
                    ...options,
                    eyeSocketSize,
                    presetFaceFeatures: true,
                    faceModel: options.faceModel === 'none' ? 'classic' : options.faceModel,
                    customRig: currentRig ?? options.customRig ?? null,
                  };
                  setOptions(nextOpts);
                }}
                onMouseUp={() => triggerBuildIfReady(options)}
                onTouchEnd={() => triggerBuildIfReady(options)}
                onKeyUp={() => triggerBuildIfReady(options)}
                className="w-full accent-amber-400 cursor-pointer"
                title="Tamaño y profundidad de las órbitas oculares y cejas (hasta 600%)"
              />
            </div>
            {renderXYZFeatureSliders(
              'eyes',
              'eyeSocketXOffset',
              'eyeSocketYOffset',
              'eyeSocketZOffset'
            )}
          </div>

          {/* 3. BOCA Y LABIOS */}
          <div
            onClick={() => onSelectFaceFeature?.('mouth')}
            className={`p-1.5 rounded bg-slate-900/70 border space-y-1 transition-colors ${
              activeFaceFeature === 'mouth'
                ? 'border-cyan-400/70 bg-cyan-950/20'
                : 'border-slate-800/80'
            }`}
          >
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium text-slate-200">👄 Boca y labios</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-amber-300 text-[9px]">
                  Tam: {Math.round(options.mouthSize * 100)}%
                </span>
                {renderFeatureMarkerButton('mouth', 'la boca y labios')}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 items-center">
              <select
                data-testid="mouth-shape-select"
                value={options.mouthShape}
                onFocus={() => onSelectFaceFeature?.('mouth')}
                onChange={(e) => {
                  onSelectFaceFeature?.('mouth');
                  const mouthShape = e.target.value as MouthShapeId;
                  const nextOpts: HumanBuildOptions = {
                    ...options,
                    mouthShape,
                    presetFaceFeatures: true,
                    faceModel: options.faceModel === 'none' ? 'classic' : options.faceModel,
                    customRig: currentRig ?? options.customRig ?? null,
                  };
                  setOptions(nextOpts);
                  triggerBuildIfReady(nextOpts);
                }}
                className="bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-[9.5px] text-slate-200 cursor-pointer"
                title="Forma de la boca y los labios"
              >
                {MOUTH_SHAPES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                type="range"
                data-testid="mouth-size-slider"
                min={0}
                max={6.0}
                step={0.05}
                value={options.mouthSize}
                onPointerDown={() => onSelectFaceFeature?.('mouth')}
                onChange={(e) => {
                  onSelectFaceFeature?.('mouth');
                  const mouthSize = parseFloat(e.target.value);
                  const nextOpts: HumanBuildOptions = {
                    ...options,
                    mouthSize,
                    presetFaceFeatures: true,
                    faceModel: options.faceModel === 'none' ? 'classic' : options.faceModel,
                    customRig: currentRig ?? options.customRig ?? null,
                  };
                  setOptions(nextOpts);
                }}
                onMouseUp={() => triggerBuildIfReady(options)}
                onTouchEnd={() => triggerBuildIfReady(options)}
                onKeyUp={() => triggerBuildIfReady(options)}
                className="w-full accent-amber-400 cursor-pointer"
                title="Volumen y tamaño de los labios y comisuras (hasta 600%)"
              />
            </div>
            {renderXYZFeatureSliders('mouth', 'mouthXOffset', 'mouthYOffset', 'mouthZOffset')}
          </div>

          {/* 4. MENTÓN Y MANDÍBULA */}
          <div
            onClick={() => onSelectFaceFeature?.('chin')}
            className={`p-1.5 rounded bg-slate-900/70 border space-y-1 transition-colors ${
              activeFaceFeature === 'chin'
                ? 'border-cyan-400/70 bg-cyan-950/20'
                : 'border-slate-800/80'
            }`}
          >
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium text-slate-200">🧔 Mentón y mandíbula</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-amber-300 text-[9px]">
                  Tam: {Math.round(options.chinSize * 100)}%
                </span>
                {renderFeatureMarkerButton('chin', 'el mentón')}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 items-center">
              <select
                data-testid="chin-shape-select"
                value={options.chinShape}
                onFocus={() => onSelectFaceFeature?.('chin')}
                onChange={(e) => {
                  onSelectFaceFeature?.('chin');
                  const chinShape = e.target.value as ChinShapeId;
                  const nextOpts: HumanBuildOptions = {
                    ...options,
                    chinShape,
                    presetFaceFeatures: true,
                    faceModel: options.faceModel === 'none' ? 'classic' : options.faceModel,
                    customRig: currentRig ?? options.customRig ?? null,
                  };
                  setOptions(nextOpts);
                  triggerBuildIfReady(nextOpts);
                }}
                className="bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-[9.5px] text-slate-200 cursor-pointer"
                title="Forma del mentón y mandíbula"
              >
                {CHIN_SHAPES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                type="range"
                data-testid="chin-size-slider"
                min={0}
                max={6.0}
                step={0.05}
                value={options.chinSize}
                onPointerDown={() => onSelectFaceFeature?.('chin')}
                onChange={(e) => {
                  onSelectFaceFeature?.('chin');
                  const chinSize = parseFloat(e.target.value);
                  const nextOpts: HumanBuildOptions = {
                    ...options,
                    chinSize,
                    presetFaceFeatures: true,
                    faceModel: options.faceModel === 'none' ? 'classic' : options.faceModel,
                    customRig: currentRig ?? options.customRig ?? null,
                  };
                  setOptions(nextOpts);
                }}
                onMouseUp={() => triggerBuildIfReady(options)}
                onTouchEnd={() => triggerBuildIfReady(options)}
                onKeyUp={() => triggerBuildIfReady(options)}
                className="w-full accent-amber-400 cursor-pointer"
                title="Proyección y fuerza del mentón y línea mandibular (hasta 600%)"
              />
            </div>
            {renderXYZFeatureSliders('chin', 'chinXOffset', 'chinYOffset', 'chinZOffset')}
          </div>
        </div>

        {/* Botón para guardar la configuración actual como predeterminada para otras imágenes */}
        <div className="pt-1.5 border-t border-slate-800/90 space-y-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="save-default-human-options-btn"
              onClick={handleSaveAsDefault}
              className="flex-1 py-1.5 px-2 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 font-semibold flex items-center justify-center gap-1.5 text-[10px] transition-colors cursor-pointer"
              title="Guarda todos los ajustes actuales (tamaño y redondez de cabeza, modelo de cara, nariz, ojos, boca, mentón, profundidad, relieve, etc.) como predeterminados para las siguientes imágenes que cargues"
            >
              <BookmarkCheck className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>Guardar configuración como predeterminada</span>
            </button>
            {hasCustomDefault && (
              <button
                type="button"
                data-testid="restore-factory-human-options-btn"
                onClick={handleRestoreFactoryDefault}
                className="py-1.5 px-2 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1 text-[9.5px] cursor-pointer"
                title="Borrar configuración predeterminada guardada y volver a los valores de fábrica"
              >
                <RotateCcw className="w-3 h-3 text-rose-400" />
                <span>Fábrica</span>
              </button>
            )}
          </div>
          {defaultSaveMsg ? (
            <p className="text-[9.5px] text-emerald-300 font-medium text-center">
              ✓ {defaultSaveMsg}
            </p>
          ) : (
            hasCustomDefault && (
              <p className="text-[9px] text-amber-300/80 text-center">
                ★ Usando tu configuración predeterminada guardada para nuevas imágenes
              </p>
            )
          )}
        </div>
      </div>

      {/* Armamento y Escudos 3D de Enemigo-rpg */}
      <div className="p-2 rounded-lg bg-slate-950/85 border border-slate-800 space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-semibold text-amber-300 flex items-center gap-1">
            <Swords className="w-3 h-3 text-amber-400" />
            <span>Armas y Escudos 3D (Enemigo-rpg)</span>
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[9.5px] text-slate-400 w-16 shrink-0 flex items-center gap-1">
              <Swords className="w-2.5 h-2.5 text-sky-400" /> Mano Der.:
            </span>
            <select
              data-testid="human-weapon-select"
              value={options.weapon}
              onChange={(e) => {
                const nextWeapon = e.target.value as HumanWeaponId;
                setOptions((prev) => ({ ...prev, weapon: nextWeapon }));
                onEquipmentChange?.(nextWeapon, options.offhand);
              }}
              className="flex-1 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200 cursor-pointer"
            >
              {HUMAN_WEAPONS.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9.5px] text-slate-400 w-16 shrink-0 flex items-center gap-1">
              <Shield className="w-2.5 h-2.5 text-emerald-400" /> Mano Izq.:
            </span>
            <select
              data-testid="human-offhand-select"
              value={options.offhand}
              onChange={(e) => {
                const nextOffhand = e.target.value as HumanOffhandId;
                setOptions((prev) => ({ ...prev, offhand: nextOffhand }));
                onEquipmentChange?.(options.weapon, nextOffhand);
              }}
              className="flex-1 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200 cursor-pointer"
            >
              {HUMAN_OFFHANDS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={!canBuild}
        onClick={() => {
          if (!images.front) return;
          onBuild(
            {
              front: images.front,
              back: images.back,
              side: images.side,
              sideLeft: images.sideLeft,
              frontLayer: images.frontLayer,
              backLayer: images.backLayer,
              sideLayer: images.sideLayer,
              sideLeftLayer: images.sideLeftLayer,
            },
            options
          );
        }}
        className={`w-full py-1.5 px-3 rounded-md font-semibold flex items-center justify-center gap-1.5 transition-colors ${
          canBuild
            ? 'bg-sky-400 hover:bg-sky-300 text-slate-950 cursor-pointer'
            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
        }`}
      >
        <UserRound className="w-3.5 h-3.5" />
        <span>{busy ? 'Construyendo el cuerpo...' : 'Crear personaje 3D'}</span>
      </button>

      {error && (
        <p className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-400/30 rounded p-1.5 leading-snug">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-2 pt-1 border-t border-slate-800">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>
              {result.vertexCount.toLocaleString()} vértices ·{' '}
              {result.triangleCount.toLocaleString()} triángulos
            </span>
            {result.hasRig && <span className="text-emerald-300">19 huesos · 11 clips</span>}
          </div>

          {result.notes.map((n) => (
            <p key={n} className="text-[10px] text-amber-200/80 leading-snug">
              · {n}
            </p>
          ))}

          {/* Controles para Ver y Editar el Esqueleto */}
          {result.hasRig && currentRig && (
            <div className="p-2 rounded-lg bg-slate-950/90 border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-300 flex items-center gap-1 text-[10px]">
                  <BoneIcon className="w-3.5 h-3.5 text-amber-400" />
                  <span>Visor y Editor de Esqueleto (19 Huesos)</span>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggleShowSkeleton(!showSkeleton)}
                  className={`py-1 px-2 rounded font-semibold flex items-center justify-center gap-1 text-[10px] border transition-colors cursor-pointer ${
                    showSkeleton
                      ? 'bg-amber-400 text-slate-950 border-amber-300'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                  }`}
                  title="Muestra u oculta los huesos y articulaciones en rayos X sobre el personaje 3D"
                >
                  {showSkeleton ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  <span>{showSkeleton ? 'Ocultar Esqueleto' : 'Ver Esqueleto'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleEditSkeletonMode(!editSkeletonMode)}
                  className={`py-1 px-2 rounded font-semibold flex items-center justify-center gap-1 text-[10px] border transition-colors cursor-pointer ${
                    editSkeletonMode
                      ? 'bg-sky-400 text-slate-950 border-sky-300'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                  }`}
                  title="Pone al personaje en pose de reposo y permite arrastrar las articulaciones directamente con el ratón en el visor 3D o con los deslizadores"
                >
                  <Move className="w-3 h-3" />
                  <span>{editSkeletonMode ? 'Editando Huesos' : 'Editar Posición'}</span>
                </button>
              </div>

              {(showSkeleton || editSkeletonMode) && selectedBone && (
                <div className="space-y-1.5 pt-1 border-t border-slate-800/90">
                  {editSkeletonMode && (
                    <p className="text-[9.5px] text-sky-300/90 leading-tight bg-sky-500/10 border border-sky-500/20 rounded px-1.5 py-1">
                      💡 <b>Arrastra cualquier bola de articulación</b> con el ratón directamente sobre el modelo 3D, o ajústala aquí debajo:
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] text-slate-400">Hueso:</span>
                    <select
                      value={selectedBone.name}
                      onChange={(e) => {
                        setEditingTip(false);
                        onSelectBone(e.target.value);
                      }}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-amber-200 font-medium cursor-pointer"
                    >
                      {currentRig.bones.map((b) => (
                        <option key={b.name} value={b.name}>
                          {BONE_LABELS_ES[b.name] || b.name} ({b.name})
                        </option>
                      ))}
                    </select>
                  </div>

                  {isTerminalBone && (
                    <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800 text-[9.5px]">
                      <button
                        type="button"
                        onClick={() => setEditingTip(false)}
                        className={`flex-1 py-0.5 rounded font-medium cursor-pointer ${
                          !editingTip ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Base ({selectedBone.name})
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTip(true)}
                        className={`flex-1 py-0.5 rounded font-medium cursor-pointer ${
                          editingTip ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Punta final
                      </button>
                    </div>
                  )}

                  {/* Deslizadores X, Y, Z de la articulación seleccionada */}
                  <div className="space-y-1 bg-slate-900/70 p-1.5 rounded border border-slate-800/80">
                    <div>
                      <div className="flex justify-between text-[9.5px]">
                        <span className="text-rose-300">Posición X (Izq / Der)</span>
                        <span className="font-mono text-amber-300">{activeJointCoords[0].toFixed(3)}</span>
                      </div>
                      <input
                        type="range"
                        min={-1.4}
                        max={1.4}
                        step={0.005}
                        value={activeJointCoords[0]}
                        onChange={(e) => handleBoneCoordChange(0, parseFloat(e.target.value))}
                        className="w-full accent-rose-400 cursor-pointer h-1.5"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[9.5px]">
                        <span className="text-emerald-300">Posición Y (Altura)</span>
                        <span className="font-mono text-amber-300">{activeJointCoords[1].toFixed(3)}</span>
                      </div>
                      <input
                        type="range"
                        min={-1.45}
                        max={1.45}
                        step={0.005}
                        value={activeJointCoords[1]}
                        onChange={(e) => handleBoneCoordChange(1, parseFloat(e.target.value))}
                        className="w-full accent-emerald-400 cursor-pointer h-1.5"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[9.5px]">
                        <span className="text-sky-300">Posición Z (Fondo / Frente)</span>
                        <span className="font-mono text-amber-300">{activeJointCoords[2].toFixed(3)}</span>
                      </div>
                      <input
                        type="range"
                        min={-0.6}
                        max={0.6}
                        step={0.005}
                        value={activeJointCoords[2]}
                        onChange={(e) => handleBoneCoordChange(2, parseFloat(e.target.value))}
                        className="w-full accent-sky-400 cursor-pointer h-1.5"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <label
                      className="flex items-center gap-1 cursor-pointer text-[10px]"
                      title="Si mueves un hombro, codo, mano, rodilla o pie, el del lado opuesto se ajusta en espejo automáticamente"
                    >
                      <input
                        type="checkbox"
                        checked={boneSymmetry}
                        onChange={(e) => onToggleBoneSymmetry(e.target.checked)}
                        className="accent-amber-400 cursor-pointer"
                      />
                      <span className="text-slate-300">
                        Simetría Izq/Der {BONE_MIRROR_MAP[selectedBone.name] ? '✓' : ''}
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={onResetRigToAuto}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 flex items-center gap-1 text-[9.5px] cursor-pointer"
                      title="Devuelve todos los huesos a la posición calculada automáticamente"
                    >
                      <RotateCcw className="w-2.5 h-2.5 text-amber-400" />
                      <span>Restaurar huesos</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {result.hasRig && result.animations.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
                <Play className="w-3 h-3 text-emerald-400" />
                <span>Animación (Enemigo-rpg · 11 clips .GLB)</span>
              </div>
              <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => onAnimationChange('rest')}
                  className={`py-1 px-2 text-[10px] rounded font-semibold transition-colors cursor-pointer ${
                    activeAnimation === 'rest'
                      ? 'bg-emerald-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Pose Base (Bind)
                </button>
                {result.animations.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onAnimationChange(a.id)}
                    className={`py-1 px-2 text-[10px] rounded font-semibold transition-colors cursor-pointer ${
                      activeAnimation === a.id
                        ? 'bg-emerald-400 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5 p-2 rounded-lg bg-slate-950/80 border border-emerald-500/30">
            <div className="text-[10px] font-semibold text-emerald-300 flex items-center justify-between">
              <span>Bajar .GLB en distintos niveles (con huesos y animaciones):</span>
              {lastExportSize && (
                <span className="text-[9.5px] font-mono text-emerald-400">{lastExportSize}</span>
              )}
            </div>
            <button
              type="button"
              disabled={exporting}
              onClick={() => onExport('completo')}
              className="w-full py-1.5 px-3 rounded-md bg-emerald-500/90 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="Exporta el personaje al 100% de resolución con su esqueleto, sus animaciones y las texturas de la foto."
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {exporting ? 'Exportando...' : '💎 Descargar .GLB Completo (100%)'}
              </span>
            </button>
            <div className="grid grid-cols-4 gap-1">
              {(
                [
                  { id: 'high', label: '✨ High', sub: '75%' },
                  { id: 'medium', label: '⚖️ Medium', sub: '50%' },
                  { id: 'low', label: '⚡ Low', sub: '28%' },
                  { id: 'minimum', label: '🪶 Min', sub: '14%' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={exporting}
                  onClick={() => onExport(t.id)}
                  className="py-1 px-1.5 rounded bg-slate-900 hover:bg-emerald-500/20 border border-slate-700 hover:border-emerald-400 text-[10px] text-emerald-200 font-semibold flex flex-col items-center cursor-pointer disabled:opacity-50"
                  title={`Descargar personaje en nivel ${t.id.toUpperCase()} (${t.sub} triángulos) conservando esqueleto y animaciones`}
                >
                  <span>{t.label}</span>
                  <span className="text-[8.5px] text-slate-400 font-mono">{t.sub}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
