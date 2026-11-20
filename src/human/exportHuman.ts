// ============================================================================
// EXPORTAR MODELOS 3D (HUMANO, MONSTRUOS, BLENDER PYTHON) A .GLB
// ----------------------------------------------------------------------------
// Conserva esqueleto, pesos de piel, animaciones y materiales PBR/texturas,
// evitando los fallos clásicos de GLTFExporter:
//   - Usa SkeletonUtils.clone solo si hay huesos/SkinnedMesh (evita errores en
//     grupos estáticos de Blender Python).
//   - Restaura mesh.userData.originalMaterial ANTES de limpiar userData, y
//     convierte MeshToonMaterial / MeshMatcapMaterial / MeshNormalMaterial /
//     ShaderMaterial a MeshStandardMaterial válido para glTF 2.0.
//   - Convierte DataTexture de 1/2/3/4 canales o Float32Array a CanvasTexture
//     sin lanzar RangeError, y valida imágenes HTML cargadas y sin taint CORS.
//   - Filtra clips de animación cuyas pistas no correspondan a nodos del modelo.
//   - Elimina mallas vacías, helpers y contornos de tinta del visor.
// ============================================================================

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  downloadBytesReliably,
  triggerAnchorDownload,
} from '../utils/reliableDownload';

function isNodeDocumentAvailable(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function copyTextureMetadata(src: THREE.Texture, dst: THREE.Texture): void {
  dst.colorSpace = src.colorSpace;
  dst.wrapS = src.wrapS;
  dst.wrapT = src.wrapT;
  dst.minFilter = src.minFilter;
  dst.magFilter = src.magFilter;
  dst.repeat.copy(src.repeat);
  dst.offset.copy(src.offset);
  dst.center.copy(src.center);
  dst.rotation = src.rotation;
  dst.channel = src.channel;
  dst.flipY = src.flipY;
  dst.needsUpdate = true;
}

/**
 * Convierte cualquier textura (DataTexture, CanvasTexture, HTMLImageElement,
 * ImageBitmap) en una textura segura para GLTFExporter. Si la imagen no ha
 * terminado de cargar o está bloqueada por CORS, devuelve null para no abortar
 * la exportación entera del modelo.
 */
function safeTextureForGLTF(tex: THREE.Texture): THREE.Texture | null {
  if (!tex || !tex.isTexture) return null;
  if (!isNodeDocumentAvailable()) {
    return (tex as THREE.DataTexture).isDataTexture ? null : tex;
  }

  // 1. DataTexture (p. ej. mapas procedurales o gradientMap)
  if ((tex as THREE.DataTexture).isDataTexture) {
    const img = tex.image as
      | { data?: ArrayLike<number>; width?: number; height?: number }
      | undefined;
    const width = Number(img?.width || 0);
    const height = Number(img?.height || 0);
    const data = img?.data;
    if (!data || width <= 0 || height <= 0) return null;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const imageData = ctx.createImageData(width, height);
      const dst = imageData.data;
      const pixelCount = width * height;
      const isFloat = data instanceof Float32Array;
      const toByte = (v: number) =>
        isFloat
          ? Math.max(0, Math.min(255, Math.round(v * 255)))
          : Math.max(0, Math.min(255, Math.round(v)));

      if (data.length === pixelCount * 4 && !isFloat) {
        dst.set(data as ArrayLike<number>);
      } else {
        const channels = Math.max(1, Math.floor(data.length / pixelCount));
        for (let p = 0; p < pixelCount; p++) {
          const base = p * channels;
          const out = p * 4;
          if (channels === 1) {
            const g = toByte(data[base] ?? 0);
            dst[out] = g;
            dst[out + 1] = g;
            dst[out + 2] = g;
            dst[out + 3] = 255;
          } else if (channels === 2) {
            const r = toByte(data[base] ?? 0);
            const g = toByte(data[base + 1] ?? 0);
            dst[out] = r;
            dst[out + 1] = g;
            dst[out + 2] = r;
            dst[out + 3] = 255;
          } else if (channels === 3) {
            dst[out] = toByte(data[base] ?? 0);
            dst[out + 1] = toByte(data[base + 1] ?? 0);
            dst[out + 2] = toByte(data[base + 2] ?? 0);
            dst[out + 3] = 255;
          } else {
            dst[out] = toByte(data[base] ?? 0);
            dst[out + 1] = toByte(data[base + 1] ?? 0);
            dst[out + 2] = toByte(data[base + 2] ?? 0);
            dst[out + 3] = toByte(data[base + 3] ?? 255);
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      const out = new THREE.CanvasTexture(canvas);
      copyTextureMetadata(tex, out);
      return out;
    } catch {
      return null;
    }
  }

  // 2. Texturas basadas en HTMLImageElement / HTMLCanvasElement / ImageBitmap
  const img = tex.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number; complete?: boolean }
    | undefined;
  if (!img) return null;

  if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
    if (!img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
      return null;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      // Verificar que el canvas no esté tainted por CORS antes de entregárselo a GLTFExporter
      ctx.getImageData(0, 0, 1, 1);
      const out = new THREE.CanvasTexture(canvas);
      copyTextureMetadata(tex, out);
      return out;
    } catch {
      return null;
    }
  }

  if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) {
    if (img.width <= 0 || img.height <= 0) return null;
    try {
      const ctx = img.getContext('2d');
      if (ctx) ctx.getImageData(0, 0, 1, 1);
      return tex;
    } catch {
      return null;
    }
  }

  const w = Number((img as { width?: number }).width || 0);
  const h = Number((img as { height?: number }).height || 0);
  if (w <= 0 || h <= 0) return null;

  return tex;
}

const EXPORTABLE_MAP_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'clearcoatMap',
  'clearcoatRoughnessMap',
  'clearcoatNormalMap',
] as const;

type ConvertTexFn = (t: THREE.Texture) => THREE.Texture | null;

/**
 * Garantiza que cualquier material (incluyendo MeshToonMaterial del modo Cel-Shade,
 * MeshMatcapMaterial, MeshNormalMaterial o ShaderMaterial) se exporte como un
 * material glTF 2.0 estándar sin errores ni pérdidas de textura/color.
 */
function normalizeMaterialForGLTF(
  sourceMat: THREE.Material | null | undefined,
  convert: ConvertTexFn
): THREE.Material {
  if (!sourceMat) {
    return new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.65, metalness: 0.05 });
  }

  const isStandard = (sourceMat as THREE.MeshStandardMaterial).isMeshStandardMaterial;
  const isPhysical = (sourceMat as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial;
  const isBasic = (sourceMat as THREE.MeshBasicMaterial).isMeshBasicMaterial;

  let out: THREE.Material & Record<string, unknown>;

  if (isPhysical || isStandard || isBasic) {
    out = sourceMat.clone() as THREE.Material & Record<string, unknown>;
  } else {
    // Convertir MeshToonMaterial / MeshPhongMaterial / MeshLambertMaterial /
    // MeshMatcapMaterial / MeshNormalMaterial / ShaderMaterial a MeshStandardMaterial
    const anyMat = sourceMat as THREE.Material & {
      color?: THREE.Color;
      map?: THREE.Texture | null;
      normalMap?: THREE.Texture | null;
      roughnessMap?: THREE.Texture | null;
      metalnessMap?: THREE.Texture | null;
      aoMap?: THREE.Texture | null;
      emissive?: THREE.Color;
      emissiveMap?: THREE.Texture | null;
      emissiveIntensity?: number;
      roughness?: number;
      metalness?: number;
    };

    out = new THREE.MeshStandardMaterial({
      name: sourceMat.name || 'Material_GLTF',
      color: anyMat.color instanceof THREE.Color ? anyMat.color.clone() : new THREE.Color(0xffffff),
      roughness: typeof anyMat.roughness === 'number' ? anyMat.roughness : 0.65,
      metalness: typeof anyMat.metalness === 'number' ? anyMat.metalness : 0.05,
      emissive:
        anyMat.emissive instanceof THREE.Color ? anyMat.emissive.clone() : new THREE.Color(0x000000),
      emissiveIntensity:
        typeof anyMat.emissiveIntensity === 'number' ? anyMat.emissiveIntensity : 1,
      transparent: Boolean(sourceMat.transparent),
      opacity: typeof sourceMat.opacity === 'number' ? sourceMat.opacity : 1,
      alphaTest: typeof sourceMat.alphaTest === 'number' ? sourceMat.alphaTest : 0,
      side: sourceMat.side ?? THREE.FrontSide,
      vertexColors: Boolean(sourceMat.vertexColors),
    }) as unknown as THREE.Material & Record<string, unknown>;

    if (anyMat.map) out.map = anyMat.map;
    if (anyMat.normalMap) out.normalMap = anyMat.normalMap;
    if (anyMat.roughnessMap) out.roughnessMap = anyMat.roughnessMap;
    if (anyMat.metalnessMap) out.metalnessMap = anyMat.metalnessMap;
    if (anyMat.aoMap) out.aoMap = anyMat.aoMap;
    if (anyMat.emissiveMap) out.emissiveMap = anyMat.emissiveMap;
  }

  for (const key of EXPORTABLE_MAP_KEYS) {
    const t = out[key];
    if (t && (t as THREE.Texture).isTexture) {
      out[key] = convert(t as THREE.Texture);
    }
  }

  // Limpiar mapas no estándar de glTF que puedan provocar fallos internos
  if ('gradientMap' in out) out.gradientMap = null;
  if ('matcap' in out) out.matcap = null;
  if ('bumpMap' in out) out.bumpMap = null;
  if ('displacementMap' in out) out.displacementMap = null;
  if ('userData' in out) out.userData = {};

  return out;
}

function hasSkinOrBones(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh || (o as THREE.Bone).isBone) {
      found = true;
    }
  });
  return found;
}

function shouldStripObjectFromExport(o: THREE.Object3D): boolean {
  if (o.userData?.isOutlineMesh || o.name.endsWith('_outline')) return true;
  if (o.type === 'SkeletonHelper' || o.type === 'GridHelper' || o.type === 'AxesHelper' || o.type === 'BoxHelper') {
    return true;
  }
  const mesh = o as THREE.Mesh;
  if (mesh.isMesh) {
    const pos = mesh.geometry?.attributes?.position;
    if (!pos || pos.count === 0) return true;
  }
  return false;
}

/** Copia lista para exportar: materiales restaurados y convertidos a glTF 2.0, texturas seguras. */
function prepareObjectForGLTFExport(root: THREE.Object3D): THREE.Object3D {
  const copy = hasSkinOrBones(root) ? SkeletonUtils.clone(root) : root.clone(true);

  copy.traverse((o) => {
    const bone = o as THREE.Bone;
    if (bone.isBone && Array.isArray(bone.userData.bindPosition)) {
      bone.position.fromArray(bone.userData.bindPosition as number[]);
      bone.quaternion.identity();
      bone.scale.set(1, 1, 1);
    }
    if (o.name === 'Weapon_Slash_Trail_Arc') {
      o.scale.setScalar(0.0001);
      o.quaternion.identity();
    }
    if (o.name === 'Arrow_Projectile_Mesh') {
      o.position.set(0, 0, 0.36);
    }
  });

  copy.position.set(0, 0, 0);
  copy.rotation.set(0, 0, 0);
  copy.scale.set(1, 1, 1);
  copy.updateMatrix();

  // Eliminar contornos de tinta, helpers del visor y mallas sin vértices
  const toRemove: THREE.Object3D[] = [];
  copy.traverse((o) => {
    if (o !== copy && shouldStripObjectFromExport(o)) {
      toRemove.push(o);
    }
  });
  for (const o of toRemove) o.removeFromParent();

  const converted = new Map<THREE.Texture, THREE.Texture | null>();
  const convert: ConvertTexFn = (t: THREE.Texture) => {
    if (converted.has(t)) return converted.get(t) ?? null;
    const c = safeTextureForGLTF(t);
    converted.set(t, c);
    return c;
  };

  // IMPORTANTE: Leer originalMaterial ANTES de vaciar userData para no perder
  // los materiales PBR originales cuando el visor está en modo Cel-Shade / Matcap / Normals.
  copy.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const originalMat = mesh.isMesh
      ? (mesh.userData?.originalMaterial as THREE.Material | THREE.Material[] | undefined)
      : undefined;

    // El visor cuelga de cada malla copias de trabajo (posiciones originales,
    // pila de deshacer, normales de suavizado...). GLTFExporter mete userData
    // entero en el JSON del .glb: vaciarlo mantiene el archivo pequeño y limpio.
    o.userData = {};

    if (!mesh.isMesh || !mesh.geometry) return;

    // Atributos propios del visor (p. ej. _ASMOOTHNORMAL) fuera del .glb.
    const custom = Object.keys(mesh.geometry.attributes).filter((n) => n.startsWith('_'));
    if (custom.length > 0) {
      mesh.geometry = mesh.geometry.clone();
      for (const name of custom) mesh.geometry.deleteAttribute(name);
    }

    // Si el material actual es de visualización temporal (Toon/Matcap/Normal) y
    // existe originalMaterial PBR guardado, preferimos ese para exportar.
    const currentMat = mesh.material;
    const isPreviewOnlyMat =
      !Array.isArray(currentMat) &&
      currentMat != null &&
      ((currentMat as THREE.MeshToonMaterial).isMeshToonMaterial ||
        (currentMat as THREE.MeshMatcapMaterial).isMeshMatcapMaterial ||
        (currentMat as THREE.MeshNormalMaterial).isMeshNormalMaterial);

    const chosen = isPreviewOnlyMat && originalMat ? originalMat : currentMat;
    if (Array.isArray(chosen)) {
      mesh.material = chosen.map((m) => normalizeMaterialForGLTF(m, convert));
    } else {
      mesh.material = normalizeMaterialForGLTF(chosen, convert);
    }
  });

  return copy;
}

/**
 * Filtra animaciones para conservar solo clips con pistas que realmente apuntan
 * a nodos presentes en el objeto exportado (evita fallos al exportar escenas
 * estáticas de Blender Python tras haber visualizado un personaje animado).
 */
function filterValidAnimations(
  root: THREE.Object3D,
  animations: THREE.AnimationClip[]
): THREE.AnimationClip[] {
  if (!animations || animations.length === 0) return [];
  const nodeNames = new Set<string>();
  root.traverse((o) => {
    if (o.name) nodeNames.add(o.name);
  });
  if (nodeNames.size === 0) return [];

  const valid: THREE.AnimationClip[] = [];
  for (const clip of animations) {
    if (!clip || !Array.isArray(clip.tracks) || clip.tracks.length === 0) continue;
    const matchingTracks = clip.tracks.filter((track) => {
      const dotIdx = track.name.indexOf('.');
      const targetName = dotIdx > 0 ? track.name.slice(0, dotIdx) : track.name;
      return nodeNames.has(targetName);
    });
    if (matchingTracks.length > 0) {
      valid.push(
        matchingTracks.length === clip.tracks.length
          ? clip
          : new THREE.AnimationClip(clip.name, clip.duration, matchingTracks)
      );
    }
  }
  return valid;
}

/** Serializa cualquier objeto 3D (personaje, monstruo o escena bpy) a bytes .glb. */
export function exportHumanToGLBBytes(
  object: THREE.Object3D,
  animations: THREE.AnimationClip[] = []
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      const prepared = prepareObjectForGLTFExport(object);
      const validAnimations = filterValidAnimations(prepared, animations);
      const exporter = new GLTFExporter();
      exporter.parse(
        prepared,
        (result) => {
          if (result instanceof ArrayBuffer && result.byteLength > 0) {
            resolve(new Uint8Array(result));
          } else {
            reject(new Error('GLTFExporter no devolvió un archivo .GLB binario válido.'));
          }
        },
        (err) => reject(err instanceof Error ? err : new Error(String(err))),
        { binary: true, onlyVisible: false, animations: validAnimations }
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export function uint8ToBlob(bytes: Uint8Array, mimeType: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: mimeType });
}

export interface ExportGlbResult {
  byteLength: number;
  blob: Blob;
  url: string;
}

/**
 * Mantiene compatibilidad con llamadas heredadas usando un tiempo de vida largo
 * (10 minutos) para el blobUrl. Para descargas fiables en iframes y móviles,
 * preferir `stageAndPrepareDownload` + `initiateDownload`.
 */
export function triggerBlobDownload(blob: Blob, filename: string): string {
  const url = URL.createObjectURL(blob);
  triggerAnchorDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
  return url;
}

/** Descarga el modelo como .glb usando el motor fiable HTTP + fallback Blob. */
export async function downloadHumanGLB(
  object: THREE.Object3D,
  animations: THREE.AnimationClip[],
  filename: string
): Promise<ExportGlbResult> {
  const bytes = await exportHumanToGLBBytes(object, animations);
  const prepared = await downloadBytesReliably(bytes, filename, 'model/gltf-binary');
  return { byteLength: bytes.byteLength, blob: prepared.blob, url: prepared.url };
}
