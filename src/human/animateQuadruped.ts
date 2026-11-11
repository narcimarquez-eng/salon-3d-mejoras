import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { computeCreatureRig, computeSkinWeights3D } from './creatureRig';
import { createCreatureAnimationClips } from './creatureAnimations';
import { createSkeletonBones, createHumanAnimationClips, HumanRig } from './humanRig';
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
/** Armas y objetos en la mano (por su nombre): van rígidos con la mano, sin deformarse. */
const PROP = /arco|bow|espada|sword|escudo|shield|hacha|axe|lanza|spear|arma|weapon/i;

function pickMaterial(mesh: THREE.Mesh): THREE.Material | THREE.Material[] {
  // Los modelos del estudio Python guardan su material PBR "de verdad" aparte del que se ve
  // (EEVEE, Cel, Matcap...). Para el .glb interesa el PBR, que lleva la textura.
  const orig = mesh.userData?.originalMaterial as THREE.Material | undefined;
  return orig && (orig as THREE.Material).isMaterial ? orig : mesh.material;
}

type Part = { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; name: string; wing?: boolean; prop?: boolean };

/** Junta las piezas del visor en el mundo, une las de igual material y pone los pies en el suelo. */
function collectParts(root: THREE.Object3D, facing: number): { parts: Part[]; box: THREE.Box3; total: number } {
  root.updateMatrixWorld(true);
  const turn = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(facing));

  // 1. Piezas en el espacio del mundo (sin suelo, contornos ni mallas ya animadas)
  const parts: Part[] = [];
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
    parts.push({ geo, mat: pickMaterial(m), name, wing: WING.test(name), prop: PROP.test(name) });
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
    if (list.length === 1 || Array.isArray(list[0].mat) || list.some((p) => p.prop)) {
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

  return { parts, box, total };
}

/**
 * Crea un modelo animado de cuadrúpedo a partir de `root` y lo devuelve como .glb.
 * `facing` gira el modelo antes de montar el esqueleto si su cabeza no mira a +Z.
 */
export async function rigQuadrupedFromObject(
  root: THREE.Object3D,
  facing: QuadrupedFacing = 0
): Promise<QuadrupedRigResult> {
  const { parts, box, total } = collectParts(root, facing);

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
  // Alas solo si el modelo tiene piezas de ala: sin ellas, unas hombreras anchas o los
  // cuernos se tomaban por alas y salía un esqueleto de dragón.
  const hasWingParts = parts.some((p) => p.wing);
  const built = computeCreatureRig(all, { bodyHalfWidth, allowWings: hasWingParts });
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

// ============================================================================
// ANIMAR UN MODELO COMO HUMANOIDE (bípedo en pose A o T, mirando a +Z)
// Esqueleto de 19 huesos de `humanRig.ts` colocado por proporciones y por la
// forma del modelo (pies, manos), y las 11 animaciones de Enemigo-rpg. Si hay
// una pieza con "Arco"/"Bow" en el nombre, usa las animaciones de arquero y el
// arco va rígido en la mano derecha (las demás armas, en la mano más cercana).
// ============================================================================

export interface HumanoidRigResult {
  bytes: Uint8Array;
  boneCount: number;
  clipNames: string[];
  meshCount: number;
  weapon: string;
}

type V3 = [number, number, number];

function computeHumanoidRig(parts: Part[], H: number, topY: number): HumanRig {
  const body: Float32Array[] = parts.filter((p) => !p.prop).map((p) => p.geo.attributes.position.array as Float32Array);
  const each = (fn: (x: number, y: number, z: number) => void) => {
    for (const a of body) for (let i = 0; i < a.length; i += 3) fn(a[i], a[i + 1], a[i + 2]);
  };
  // z medio del cuerpo en una franja de altura (cerca del eje)
  const zAt = (y0: number, y1: number) => {
    let sz = 0, n = 0;
    each((x, y, z) => {
      if (y >= y0 && y <= y1 && Math.abs(x) < 0.1 * H) { sz += z; n++; }
    });
    return n ? sz / n : 0;
  };
  // Pies: los vértices más bajos de cada lado
  const foot = (s: number) => {
    let sx = 0, sz = 0, n = 0, toeZ = -Infinity;
    each((x, y, z) => {
      if (y < 0.06 * H && x * s > 0) { sx += x; sz += z; n++; if (z > toeZ) toeZ = z; }
    });
    return n ? { x: sx / n, z: sz / n, toeZ } : { x: s * 0.1 * H, z: 0, toeZ: 0.08 * H };
  };
  // Mano: el punto más alejado hacia ese lado, entre la cadera y los hombros
  const hand = (s: number): V3 => {
    let best = -Infinity;
    let p: V3 = [s * 0.4 * H, 0.5 * H, 0];
    each((x, y, z) => {
      if (y > 0.3 * H && y < 0.85 * H && x * s > best) { best = x * s; p = [x, y, z]; }
    });
    return p;
  };
  const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  const zHips = zAt(0.45 * H, 0.55 * H);
  const zChest = zAt(0.65 * H, 0.78 * H);
  const hips: V3 = [0, 0.5 * H, zHips];
  const spine: V3 = [0, 0.6 * H, lerp3(hips, [0, 0, zChest], 0.5)[2]];
  const chest: V3 = [0, 0.7 * H, zChest];
  const neck: V3 = [0, 0.82 * H, zAt(0.8 * H, 0.84 * H)];
  const head: V3 = [0, 0.86 * H, neck[2]];
  const headTop: V3 = [0, Math.min(topY, 0.99 * H), neck[2]];

  const arm = (s: number) => {
    const tip = hand(s);
    const shoulder: V3 = [s * 0.1 * H, 0.79 * H, zChest];
    const clavicle: V3 = [s * 0.03 * H, 0.8 * H, zChest];
    const wrist = lerp3(tip, shoulder, 0.1);
    const elbow = lerp3(shoulder, wrist, 0.5);
    return { clavicle, shoulder, elbow, wrist, handEnd: tip };
  };
  const leg = (s: number) => {
    const f = foot(s);
    const hip: V3 = [f.x * 0.85, 0.47 * H, zHips];
    const ankle: V3 = [f.x, 0.055 * H, f.z - 0.02 * H];
    const knee: V3 = [f.x * 0.95, 0.27 * H, zAt(0.25 * H, 0.29 * H) + 0.01 * H];
    const toe: V3 = [f.x, 0.01 * H, f.toeZ];
    return { hip, knee, ankle, toe };
  };
  // El lado derecho del personaje queda en -X (mira a +Z)
  const R = arm(-1), L = arm(1), RL = leg(-1), LL = leg(1);
  return {
    bones: [
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
    ],
  };
}

export async function rigHumanoidFromObject(
  root: THREE.Object3D,
  facing: QuadrupedFacing = 0
): Promise<HumanoidRigResult> {
  const { parts, box } = collectParts(root, facing);
  const H = Math.max(1e-6, box.max.y - box.min.y);
  const rig = computeHumanoidRig(parts, H, H);
  const hasBow = parts.some((p) => p.prop && /arco|bow/i.test(p.name));
  const weapon = hasBow ? 'bone_recurved_bow' : 'none';

  const { root: rootBone, bones } = createSkeletonBones(rig);
  const skeleton = new THREE.Skeleton(bones);
  const model = new THREE.Group();
  model.name = 'Humanoide_Animado';
  model.add(rootBone);
  model.updateMatrixWorld(true);
  skeleton.calculateInverses();
  const idx = (n: string) => rig.bones.findIndex((b) => b.name === n);
  for (const p of parts) {
    const pos = p.geo.attributes.position.array as Float32Array;
    let skin: { index: Uint16Array; weight: Float32Array };
    if (p.prop) {
      // Arma rígida en una mano: el arco en la derecha (así lo sujetan las animaciones de
      // arquero); otra arma, en la mano más cercana a su centro
      const n = pos.length / 3;
      let hand = 'RightHand';
      if (!/arco|bow/i.test(p.name)) {
        p.geo.computeBoundingBox();
        const c = p.geo.boundingBox!.getCenter(new THREE.Vector3());
        const r = rig.bones[idx('RightHand')].head, l = rig.bones[idx('LeftHand')].head;
        const dr = (c.x - r[0]) ** 2 + (c.y - r[1]) ** 2 + (c.z - r[2]) ** 2;
        const dl = (c.x - l[0]) ** 2 + (c.y - l[1]) ** 2 + (c.z - l[2]) ** 2;
        hand = dl < dr ? 'LeftHand' : 'RightHand';
      }
      const index = new Uint16Array(n * 4);
      const weight = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { index[i * 4] = idx(hand); weight[i * 4] = 1; }
      skin = { index, weight };
    } else {
      skin = computeSkinWeights3D(rig, pos, H);
    }
    p.geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skin.index, 4));
    p.geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skin.weight, 4));
    const sm = new THREE.SkinnedMesh(p.geo, p.mat);
    sm.name = p.name;
    sm.castShadow = true;
    sm.receiveShadow = true;
    model.add(sm);
    sm.bind(skeleton, new THREE.Matrix4());
  }
  // Las pistas de la flecha y de la estela apuntan a piezas que no existen: se quitan
  const clips = createHumanAnimationClips(rig, weapon).map((c) => {
    c.tracks = c.tracks.filter((t) => !/^(Arrow_Projectile_Mesh|Weapon_Slash_Trail_Arc)\./.test(t.name));
    return c;
  });
  const bytes = await exportHumanToGLBBytes(model, clips);
  return { bytes, boneCount: bones.length, clipNames: clips.map((c) => c.name), meshCount: parts.length, weapon };
}
