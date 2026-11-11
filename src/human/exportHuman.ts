// ============================================================================
// EXPORTAR EL HUMANO A .GLB
// ----------------------------------------------------------------------------
// Portado de `engine/exportEngine.ts` de Vortex3D. El exportador normal de
// salon-3d reconstruye cada malla como THREE.Mesh con un material nuevo, así
// que perdería el esqueleto, las animaciones y los mapas de la foto. Esta ruta
// los conserva:
//   - SkeletonUtils.clone mantiene la piel unida a sus huesos clonados,
//   - los huesos vuelven a la pose de reposo (el movimiento vive en el clip),
//   - las DataTexture se pasan a canvas (GLTFExporter falla con ellas),
//   - se quita la transformación de exhibición de la escena.
// ============================================================================

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Pasa una DataTexture a CanvasTexture conservando orientación y espacio de color. */
function dataTextureToCanvasTexture(tex: THREE.Texture): THREE.Texture {
  const img = tex.image as
    | { data?: ArrayLike<number>; width: number; height: number }
    | undefined;
  if (!(tex as THREE.DataTexture).isDataTexture || !img || !img.data) return tex;

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return tex;

  const imageData = ctx.createImageData(img.width, img.height);
  imageData.data.set(img.data as ArrayLike<number>);
  ctx.putImageData(imageData, 0, 0);

  const out = new THREE.CanvasTexture(canvas);
  out.colorSpace = tex.colorSpace;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  out.minFilter = tex.minFilter;
  out.magFilter = tex.magFilter;
  out.channel = tex.channel;
  out.flipY = tex.flipY;
  return out;
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

/** Copia lista para exportar: materiales clonados y texturas convertidas. */
function prepareObjectForGLTFExport(root: THREE.Object3D): THREE.Object3D {
  const copy = SkeletonUtils.clone(root);
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

  // El visor cuelga de cada malla copias de trabajo (posiciones originales,
  // pila de deshacer, normales de suavizado...). GLTFExporter mete userData
  // entero en el JSON del .glb: con eso dentro, un personaje de 35.000
  // vértices pesaba 103 MB en vez de 3. Se vacía en la copia, no en la escena.
  // El contorno de tinta es una copia invertida de la malla solo para el visor:
  // en el .glb duplicaría los triángulos.
  const outlines: THREE.Object3D[] = [];
  copy.traverse((o) => {
    if (o.userData?.isOutlineMesh || o.name.endsWith('_outline')) outlines.push(o);
  });
  for (const o of outlines) o.removeFromParent();

  copy.traverse((o) => {
    o.userData = {};
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    // Atributos propios del visor (p. ej. _ASMOOTHNORMAL) fuera del .glb.
    // SkeletonUtils.clone comparte la geometría con la escena, así que aquí se
    // clona antes de tocarla: si no, se le quitarían al modelo que se está viendo.
    const custom = Object.keys(mesh.geometry.attributes).filter((n) => n.startsWith('_'));
    if (custom.length > 0) {
      mesh.geometry = mesh.geometry.clone();
      for (const name of custom) mesh.geometry.deleteAttribute(name);
    }
    // Mallas en triángulos sueltos (fotos proyectadas, from_pydata): se unen los vértices
    // repetidos (misma posición, normal, UV y pesos). El .glb pesa 3-5 veces menos y se ve igual.
    if (!mesh.geometry.index && mesh.geometry.attributes.position?.count > 0) {
      mesh.geometry = mergeVertices(mesh.geometry, 1e-5);
    }
  });

  const converted = new Map<THREE.Texture, THREE.Texture>();
  const convert = (t: THREE.Texture) => {
    let c = converted.get(t);
    if (!c) {
      c = dataTextureToCanvasTexture(t);
      converted.set(t, c);
    }
    return c;
  };

  copy.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const cloned = mats.map((m) => {
      const mc = m.clone() as THREE.Material & Record<string, unknown>;
      for (const key of EXPORTABLE_MAP_KEYS) {
        const t = mc[key];
        if (t && (t as THREE.Texture).isTexture) mc[key] = convert(t as THREE.Texture);
      }
      return mc;
    });
    mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
  });
  return copy;
}

/** Serializa el personaje (con sus animaciones) a bytes .glb. */
export function exportHumanToGLBBytes(
  object: THREE.Object3D,
  animations: THREE.AnimationClip[] = []
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      prepareObjectForGLTFExport(object),
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(new Uint8Array(result));
        } else {
          reject(new Error('Se esperaba un ArrayBuffer binario desde GLTFExporter.'));
        }
      },
      (err) => reject(err),
      { binary: true, onlyVisible: false, animations }
    );
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

export function triggerBlobDownload(blob: Blob, filename: string): string {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.style.position = 'fixed';
  link.style.top = '-9999px';
  link.style.left = '-9999px';
  link.style.opacity = '0';
  link.style.pointerEvents = 'none';
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  try {
    link.click();
  } catch (err) {
    console.warn('triggerBlobDownload: click error', err);
  }
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
  }, 1000);
  // Mantener la URL del blob durante 5 minutos para que el gestor de descargas de Android / Chrome termine
  setTimeout(() => URL.revokeObjectURL(url), 300000);
  return url;
}

/** Descarga el personaje como .glb y devuelve el tamaño en bytes, el blob y la URL de descarga directa. */
export async function downloadHumanGLB(
  object: THREE.Object3D,
  animations: THREE.AnimationClip[],
  filename: string
): Promise<ExportGlbResult> {
  const bytes = await exportHumanToGLBBytes(object, animations);
  const blob = uint8ToBlob(bytes, 'model/gltf-binary');
  const url = triggerBlobDownload(blob, filename);
  return { byteLength: bytes.byteLength, blob, url };
}
