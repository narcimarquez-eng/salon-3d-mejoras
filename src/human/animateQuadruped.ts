import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { computeCreatureRig, computeSkinWeights3D } from './creatureRig';
import { createCreatureAnimationClips } from './creatureAnimations';
import { createSkeletonBones } from './humanRig';
import { exportHumanToGLBBytes } from './exportHuman';

// ============================================================================
// ANIMAR UN MODELO CUALQUIERA COMO CUADRÚPEDO
// Toma lo que hay en el visor (un modelo del estudio Python o un .glb cargado),
// junta sus piezas en el espacio del mundo, le coloca el esqueleto de criatura
// de `creatureRig.ts`, une cada vértice a sus huesos y genera las animaciones
// de `creatureAnimations.ts`. Devuelve un .glb listo para cargar o descargar.
// El esqueleto espera la cabeza hacia +Z, el lomo hacia +Y y los pies en el suelo.
// ============================================================================

/** Giro (en grados, sobre el eje vertical) que lleva la cabeza del modelo a +Z. */
export type QuadrupedFacing = 0 | 90 | 180 | 270;

export interface QuadrupedRigResult {
  bytes: Uint8Array;
  boneCount: number;
  clipNames: string[];
  meshCount: number;
  vertexCount: number;
  kind: string;
}

const IGNORED = /suelo|floor|ground|pedestal|grid|helper/i;
/** Piezas que son alas (por su nombre): no cuentan para medir el tronco. */
const WING = /(^|[^a-z])(ala|alas|wing|wings)([^a-z]|$)|_ala_|_ala$/i;

function pickMaterial(mesh: THREE.Mesh): THREE.Material | THREE.Material[] {
  // Los modelos del estudio Python guardan su material PBR "de verdad" aparte del que se ve
  // (EEVEE, Cel, Matcap...). Para el .glb interesa el PBR, que lleva la textura.
  const orig = mesh.userData?.originalMaterial as THREE.Material | undefined;
  return orig && (orig as THREE.Material).isMaterial ? orig : mesh.material;
}

/**
 * Crea un modelo animado de cuadrúpedo a partir de `root` y lo devuelve como .glb.
 * `facing` gira el modelo antes de montar el esqueleto si su cabeza no mira a +Z.
 */
export async function rigQuadrupedFromObject(
  root: THREE.Object3D,
  facing: QuadrupedFacing = 0
): Promise<QuadrupedRigResult> {
  root.updateMatrixWorld(true);
  const turn = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(facing));

  // 1. Piezas en el espacio del mundo (sin suelo, contornos ni mallas ya animadas)
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; name: string; wing?: boolean }[] = [];
  root.traverse((child) => {
    const m = child as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    if (m.userData?.isOutlineMesh || IGNORED.test(m.name || '')) return;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) return;
    const src = m.geometry as THREE.BufferGeometry;
    if (!src?.attributes?.position) return;
    const geo = src.clone();
    for (const key of Object.keys(geo.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(key)) geo.deleteAttribute(key);
    }
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(turn, m.matrixWorld));
    const name = m.name || `Pieza_${parts.length}`;
    parts.push({ geo, mat: pickMaterial(m), name, wing: WING.test(name) });
  });
  if (parts.length === 0) throw new Error('No hay ninguna malla en el visor para animar.');

  // Las piezas que comparten material se juntan en una: menos mallas y un solo esqueleto
  // por material en el .glb (más ligero de dibujar en un juego).
  const byMat = new Map<string, typeof parts>();
  for (const p of parts) {
    // Mismo material = mismo objeto, o (en un .glb, que copia el material en cada pieza)
    // mismo nombre, tipo e imagen
    const keyOf = (m: THREE.Material) => {
      const std = m as THREE.MeshStandardMaterial;
      const map = std.map;
      const img = map ? (map.source?.uuid ?? map.uuid) : '';
      const color = std.color ? std.color.getHexString() : '';
      return `${m.type}|${m.name}|${color}|${std.roughness ?? ''}|${std.metalness ?? ''}|${img}`;
    };
    const key = Array.isArray(p.mat) ? p.mat.map((m) => m.uuid).join('|') : keyOf(p.mat);
    const list = byMat.get(key) ?? [];
    list.push(p);
    byMat.set(key, list);
  }
  const merged: typeof parts = [];
  for (const list of byMat.values()) {
    if (list.length === 1 || Array.isArray(list[0].mat)) {
      merged.push(...list);
      continue;
    }
    // Todas con los mismos atributos y sin índice, para poder juntarlas
    const names = ['position', 'normal', 'uv'];
    const geos = list.map((p) => {
      let g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      for (const key of Object.keys(g.attributes)) if (!names.includes(key)) g.deleteAttribute(key);
      return g;
    });
    const one = mergeGeometries(geos, false);
    if (one) merged.push({ geo: one, mat: list[0].mat, name: list[0].name, wing: list.every((p) => p.wing) });
    else merged.push(...list);
  }
  parts.length = 0;
  parts.push(...merged);

  // 2. Pies en el suelo y centrado en X/Z
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geo.computeBoundingBox();
    box.union(p.geo.boundingBox!);
  }
  const shift = new THREE.Matrix4().makeTranslation(
    -(box.min.x + box.max.x) / 2,
    -box.min.y,
    -(box.min.z + box.max.z) / 2
  );
  let total = 0;
  for (const p of parts) {
    p.geo.applyMatrix4(shift);
    total += p.geo.attributes.position.count;
  }

  // Si hay alas (piezas con "Ala"/"Wing" en el nombre), el tronco se mide sin ellas
  let bodyHalfWidth: number | undefined;
  if (parts.some((p) => p.wing)) {
    const H = box.max.y - box.min.y;
    const belly = 0.44 * H;
    const xs: number[] = [];
    for (const p of parts) {
      if (p.wing) continue;
      const a = p.geo.attributes.position.array as Float32Array;
      for (let i = 0; i < a.length; i += 3) if (a[i + 1] > belly) xs.push(Math.abs(a[i]));
    }
    xs.sort((a, b) => a - b);
    if (xs.length) bodyHalfWidth = xs[Math.floor(xs.length * 0.9)];
  }

  // 3. Esqueleto a partir de todos los vértices juntos
  const all = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    all.set(p.geo.attributes.position.array as Float32Array, o);
    o += p.geo.attributes.position.count * 3;
  }
  const built = computeCreatureRig(all, { bodyHalfWidth });
  const height = Math.max(1e-6, box.max.y - box.min.y);

  const { root: rootBone, bones } = createSkeletonBones(built.rig);
  const skeleton = new THREE.Skeleton(bones);

  // 4. Cada pieza pasa a SkinnedMesh unida a sus huesos más cercanos (en 3D)
  const model = new THREE.Group();
  model.name = 'Cuadrupedo_Animado';
  model.add(rootBone);
  model.updateMatrixWorld(true);
  // El esqueleto calculó su pose de reposo al crearse, antes de colocar los huesos:
  // se recalcula ahora que cada hueso está en su sitio (si no, la malla sale estirada).
  skeleton.calculateInverses();
  for (const p of parts) {
    const pos = p.geo.attributes.position.array as Float32Array;
    const skin = computeSkinWeights3D(built.rig, pos, height);
    p.geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skin.index, 4));
    p.geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skin.weight, 4));
    const sm = new THREE.SkinnedMesh(p.geo, p.mat);
    sm.name = p.name;
    sm.castShadow = true;
    sm.receiveShadow = true;
    model.add(sm);
    sm.bind(skeleton, new THREE.Matrix4());
  }

  // 5. Animaciones de criatura y exportación
  // Alas de membrana grandes: en el suelo se quedan abiertas (plegarlas las enrolla)
  const clips = createCreatureAnimationClips(built.rig, { ...built.metrics, wingsOpenOnGround: true });
  const bytes = await exportHumanToGLBBytes(model, clips);
  return {
    bytes,
    boneCount: bones.length,
    clipNames: clips.map((c) => c.name),
    meshCount: parts.length,
    vertexCount: total,
    kind: built.kind,
  };
}
