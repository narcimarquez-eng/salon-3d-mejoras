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
  fillMissingBoneTracks(clips, built.rig.bones.map((b) => b.name));
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

/**
 * Cada clip mueve todos los huesos: los que no anima quedan en reposo. Si no, un hueso que
 * solo mueve otro clip (p. ej. la cadera en Death) se quedaba torcido al cambiar de clip, y
 * el .glb se exportaba con esa pose (el personaje salía inclinado).
 */
export function fillMissingBoneTracks(clips: THREE.AnimationClip[], boneNames: string[]): void {
  for (const c of clips) {
    const has = new Set(c.tracks.filter((t) => t.name.endsWith('.quaternion')).map((t) => t.name.split('.')[0]));
    for (const n of boneNames) {
      if (has.has(n)) continue;
      c.tracks.push(new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, [0, c.duration], [0, 0, 0, 1, 0, 0, 0, 1]));
    }
  }
}

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

/** Flecha sencilla (asta, punta y plumas) a lo largo de +Z, centrada en el origen. */
function buildArrowGeometry(len: number): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.009, 0.009, len * 0.86, 6);
  shaft.rotateX(Math.PI / 2);
  shaft.translate(0, 0, -len * 0.07);
  const head = new THREE.ConeGeometry(0.02, len * 0.14, 6);
  head.rotateX(Math.PI / 2);
  head.translate(0, 0, len * 0.43);
  const fl1 = new THREE.BoxGeometry(0.002, 0.04, len * 0.16);
  fl1.translate(0, 0, -len * 0.4);
  const fl2 = new THREE.BoxGeometry(0.04, 0.002, len * 0.16);
  fl2.translate(0, 0, -len * 0.4);
  const parts = [shaft, head, fl1, fl2].map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    return n;
  });
  return mergeGeometries(parts, false)!;
}

export async function rigHumanoidFromObject(
  root: THREE.Object3D,
  facing: QuadrupedFacing = 0
): Promise<HumanoidRigResult> {
  const { parts, box } = collectParts(root, facing);
  const H = Math.max(1e-6, box.max.y - box.min.y);
  const rig = computeHumanoidRig(parts, H, H);
  const bowPart = parts.find((p) => p.prop && /arco|bow/i.test(p.name));
  const weapon = bowPart ? 'bone_recurved_bow' : 'none';

  // Arco: hueso propio en la mano derecha (en su agarre). Su giro se calcula fotograma a
  // fotograma para que el arco siga recto respecto al cuerpo: vertical al andar y al apuntar.
  // Flecha: hueso propio colgado de la cadera, que la lleva de la cuerda al blanco.
  let arrowLen = 0;
  if (bowPart) {
    const rh = rig.bones.find((b) => b.name === 'RightHand')!;
    const grip: V3 = [rh.tail[0], rh.tail[1], rh.tail[2]];
    rig.bones.push({ name: 'Bow', parent: 'RightHand', head: grip, tail: [grip[0], grip[1] + 0.1 * H, grip[2]] });
    arrowLen = 0.42 * H;
    const hips = rig.bones[0].head;
    rig.bones.push({ name: 'Arrow', parent: 'Hips', head: [...hips] as V3, tail: [hips[0], hips[1], hips[2] + arrowLen] });
  }

  const { root: rootBone, bones } = createSkeletonBones(rig);
  const skeleton = new THREE.Skeleton(bones);
  const model = new THREE.Group();
  model.name = 'Humanoide_Animado';
  model.add(rootBone);
  model.updateMatrixWorld(true);
  skeleton.calculateInverses();
  const idx = (n: string) => rig.bones.findIndex((b) => b.name === n);
  const rigidSkin = (n: number, bone: string) => {
    const index = new Uint16Array(n * 4);
    const weight = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { index[i * 4] = idx(bone); weight[i * 4] = 1; }
    return { index, weight };
  };
  const bodyRig: HumanRig = { bones: rig.bones.filter((b) => b.name !== 'Bow' && b.name !== 'Arrow') };
  for (const p of parts) {
    const pos = p.geo.attributes.position.array as Float32Array;
    let skin: { index: Uint16Array; weight: Float32Array };
    if (p.prop) {
      // Arma rígida: el arco en su hueso; otra arma, en la mano más cercana a su centro
      let bone = 'RightHand';
      if (/arco|bow/i.test(p.name)) bone = 'Bow';
      else {
        p.geo.computeBoundingBox();
        const c = p.geo.boundingBox!.getCenter(new THREE.Vector3());
        const r = rig.bones[idx('RightHand')].head, l = rig.bones[idx('LeftHand')].head;
        const dr = (c.x - r[0]) ** 2 + (c.y - r[1]) ** 2 + (c.z - r[2]) ** 2;
        const dl = (c.x - l[0]) ** 2 + (c.y - l[1]) ** 2 + (c.z - l[2]) ** 2;
        bone = dl < dr ? 'LeftHand' : 'RightHand';
      }
      skin = rigidSkin(pos.length / 3, bone);
    } else {
      // índices del esqueleto del cuerpo = los primeros del esqueleto completo
      skin = computeSkinWeights3D(bodyRig, pos, H);
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
  if (bowPart) {
    const hips = rig.bones[0].head;
    const geo = buildArrowGeometry(arrowLen);
    // centrada en el hueso: su posición en las pistas es la del centro de la flecha
    geo.translate(hips[0], hips[1], hips[2]);
    const n = geo.attributes.position.count;
    const sk = rigidSkin(n, 'Arrow');
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sk.index, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sk.weight, 4));
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a7348, roughness: 0.6 });
    mat.name = 'Flecha';
    const arrow = new THREE.SkinnedMesh(geo, mat);
    arrow.name = 'Flecha';
    model.add(arrow);
    arrow.bind(skeleton, new THREE.Matrix4());
  }

  // Las pistas de la flecha y de la estela de Enemigo-rpg apuntan a piezas que no existen
  const clips = createHumanAnimationClips(bodyRig, weapon).map((c) => {
    c.tracks = c.tracks.filter((t) => !/^(Arrow_Projectile_Mesh|Weapon_Slash_Trail_Arc)\./.test(t.name));
    return c;
  });
  if (bowPart) {
    // El Attack de arquero de Enemigo-rpg está pensado para otro esqueleto: con este, la
    // mano que tensa se iba arriba y afuera. Se sustituye por un disparo resuelto por
    // objetivos (brazo del arco al frente, cuerda a la cara).
    const i = clips.findIndex((c) => c.name === 'Attack');
    const shot = createBowShotClip(bodyRig);
    if (i >= 0) clips[i] = shot;
    else clips.push(shot);
  }
  fillMissingBoneTracks(clips, bodyRig.bones.map((b) => b.name));
  if (bowPart) addBowAndArrowTracks(model, clips, arrowLen);
  const bytes = await exportHumanToGLBBytes(model, clips);
  return { bytes, boneCount: bones.length, clipNames: clips.map((c) => c.name), meshCount: parts.length + (bowPart ? 1 : 0), weapon };
}

/**
 * Pistas del arco y de la flecha, calculadas reproduciendo cada clip:
 * - el arco mantiene la orientación del cuerpo (cadera), así va recto al andar y al apuntar;
 * - en Attack (dos disparos por clip, mismas fases que Enemigo-rpg) la flecha va montada entre
 *   la mano que tensa (izquierda) y el arco mientras se tensa, sale hacia delante al soltar y
 *   desaparece hasta el siguiente disparo. En los demás clips va escondida.
 */
function addBowAndArrowTracks(model: THREE.Object3D, clips: THREE.AnimationClip[], arrowLen: number): void {
  const mixer = new THREE.AnimationMixer(model);
  const get = (n: string) => model.getObjectByName(n) as THREE.Bone;
  const hips = get('Hips'), rhand = get('RightHand'), lhand = get('LeftHand'), bow = get('Bow');
  const qH = new THREE.Quaternion(), qR = new THREE.Quaternion(), q = new THREE.Quaternion();
  const pL = new THREE.Vector3(), pB = new THREE.Vector3(), dir = new THREE.Vector3();
  const mHinv = new THREE.Matrix4(), m = new THREE.Matrix4(), s = new THREE.Vector3();
  const z = new THREE.Vector3(0, 0, 1);
  for (const clip of clips) {
    const fps = 30;
    const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times: number[] = [];
    const bowQ: number[] = [], arP: number[] = [], arQ: number[] = [], arS: number[] = [];
    const act = mixer.clipAction(clip);
    act.reset().play();
    const isShot = clip.name === 'Attack';
    let releasePos = new THREE.Vector3(), releaseDir = new THREE.Vector3(0, 0, 1);
    for (let f = 0; f < frames; f++) {
      const t = (f / (frames - 1)) * clip.duration;
      times.push(t);
      mixer.setTime(Math.min(t, clip.duration - 1e-4));
      model.updateMatrixWorld(true);
      hips.getWorldQuaternion(qH);
      rhand.getWorldQuaternion(qR);
      // arco: local = (mano en el mundo)^-1 * (cadera en el mundo)
      q.copy(qR).invert().multiply(qH);
      bowQ.push(q.x, q.y, q.z, q.w);
      // flecha (en coordenadas de la cadera)
      let pos = new THREE.Vector3(0, -10, 0), rot = new THREE.Quaternion(), sc = 0.001;
      if (isShot) {
        const u = t / clip.duration;
        const bowU = (u * 2) % 1;
        lhand.getWorldPosition(pL);
        bow.getWorldPosition(pB);
        dir.copy(pB).sub(pL);
        if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
        dir.normalize();
        if (bowU < 0.44) {
          // montada: la cola en la mano que tensa, la punta pasando por el arco
          pos.copy(pL).addScaledVector(dir, arrowLen * 0.5);
          rot.setFromUnitVectors(z, dir);
          sc = 1;
          releasePos.copy(pos);
          // sale recta hacia donde mira el cuerpo, en horizontal
          releaseDir.copy(z).applyQuaternion(qH);
          releaseDir.y = 0;
          if (releaseDir.lengthSq() < 1e-8) releaseDir.set(0, 0, 1);
          releaseDir.normalize();
        } else if (bowU < 0.86) {
          const fly = (bowU - 0.44) / 0.42;
          pos.copy(releasePos).addScaledVector(releaseDir, fly * 12);
          rot.setFromUnitVectors(z, releaseDir);
          sc = fly < 0.95 ? 1 : 0.001;
        }
      }
      // del mundo al espacio de la cadera (la flecha cuelga de ella)
      mHinv.copy(hips.matrixWorld).invert();
      m.compose(pos, rot, s.set(sc, sc, sc)).premultiply(mHinv);
      const lp = new THREE.Vector3(), lq = new THREE.Quaternion(), ls = new THREE.Vector3();
      m.decompose(lp, lq, ls);
      // la flecha en reposo está en la cadera: su posición local es relativa a ella
      arP.push(lp.x, lp.y, lp.z);
      arQ.push(lq.x, lq.y, lq.z, lq.w);
      arS.push(sc, sc, sc);
    }
    act.stop();
    clip.tracks = clip.tracks.filter((t) => !/^(Bow|Arrow)\./.test(t.name));
    clip.tracks.push(new THREE.QuaternionKeyframeTrack('Bow.quaternion', times, bowQ));
    clip.tracks.push(new THREE.VectorKeyframeTrack('Arrow.position', times, arP));
    clip.tracks.push(new THREE.QuaternionKeyframeTrack('Arrow.quaternion', times, arQ));
    clip.tracks.push(new THREE.VectorKeyframeTrack('Arrow.scale', times, arS));
  }
  mixer.stopAllAction();
  model.traverse((o) => {
    const sk = (o as THREE.SkinnedMesh).skeleton;
    if (sk) sk.pose();
  });
}

/**
 * Disparo con arco (2 disparos, 2,513 s, mismas fases que Enemigo-rpg: tensar 0-0,44,
 * soltar y vuelo 0,44-0,86, recuperar 0,86-1). Cada brazo se resuelve con IK de dos huesos
 * hacia un objetivo: el arco al frente a la altura del hombro y la mano que tensa de la
 * cuerda a la cara, con el codo alto. Válido para cualquier esqueleto de humanRig en reposo.
 */
function createBowShotClip(rig: HumanRig): THREE.AnimationClip {
  const B = (n: string) => rig.bones.find((b) => b.name === n)!;
  const v = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);
  const chain = (side: 'Right' | 'Left') => {
    const S = v(B(`${side}Arm`).head), E = v(B(`${side}ForeArm`).head), W = v(B(`${side}Hand`).head);
    return { S, E, W, a: E.distanceTo(S), b: W.distanceTo(E), u0: E.clone().sub(S).normalize(), f0: W.clone().sub(E).normalize() };
  };
  const R = chain('Right'), L = chain('Left');
  const reach = R.a + R.b;
  const fwd = new THREE.Vector3(0, 0, 1);
  // Objetivos (el personaje mira a +Z; su derecha está en -X)
  const bowAim = R.S.clone().add(new THREE.Vector3(0.02, 0.02, 0)).addScaledVector(fwd, reach * 0.96);
  const bowLow = R.W.clone(); // mano del arco en reposo
  const face = new THREE.Vector3(R.S.x * 0.25, R.S.y + 0.06 * reach, R.S.z + 0.1 * reach);
  const nock = bowAim.clone().addScaledVector(fwd, -0.12 * reach).add(new THREE.Vector3(0.04 * reach, 0, 0));
  const drawRest = L.W.clone();
  const poleR = new THREE.Vector3(-0.3, -1, 0).normalize();
  const poleL = new THREE.Vector3(1, 0.35, -0.6).normalize();

  const solve = (c: ReturnType<typeof chain>, T: THREE.Vector3, pole: THREE.Vector3) => {
    const d0 = T.clone().sub(c.S);
    const d = THREE.MathUtils.clamp(d0.length(), Math.abs(c.a - c.b) + 1e-4, (c.a + c.b) * 0.999);
    const dir = d0.normalize();
    const cosA = THREE.MathUtils.clamp((c.a * c.a + d * d - c.b * c.b) / (2 * c.a * d), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const perp = pole.clone().addScaledVector(dir, -pole.dot(dir));
    if (perp.lengthSq() < 1e-8) perp.set(0, -1, 0);
    perp.normalize();
    const E = c.S.clone().addScaledVector(dir, c.a * cosA).addScaledVector(perp, c.a * sinA);
    const Tc = c.S.clone().addScaledVector(dir, d);
    const u1 = E.clone().sub(c.S).normalize();
    const f1 = Tc.clone().sub(E).normalize();
    const qU = new THREE.Quaternion().setFromUnitVectors(c.u0, u1);
    const qF = new THREE.Quaternion().setFromUnitVectors(c.f0, f1);
    const fore = qU.clone().invert().multiply(qF);
    const hand = qF.clone().invert(); // la mano sigue recta respecto al mundo (como en reposo)
    return { arm: qU, fore, hand };
  };
  const smooth = (x: number) => x * x * (3 - 2 * x);
  const lerpV = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t);

  const duration = 2.513, fps = 30;
  const frames = Math.round(duration * fps) + 1;
  const times: number[] = [];
  const tr: Record<string, number[]> = {};
  const push = (n: string, q: THREE.Quaternion) => (tr[n] ??= []).push(q.x, q.y, q.z, q.w);
  const id = new THREE.Quaternion();
  for (let f = 0; f < frames; f++) {
    const t = (f / (frames - 1)) * duration;
    times.push(t);
    const u = f === frames - 1 ? 0 : t / duration;
    const k = (u * 2) % 1;
    let tR: THREE.Vector3, tL: THREE.Vector3;
    if (k < 0.44) {
      const p = k / 0.44;
      const up = smooth(Math.min(1, p / 0.3));          // sube el arco
      const pull = smooth(Math.max(0, (p - 0.3) / 0.7)); // tensa la cuerda
      tR = lerpV(bowLow, bowAim, up);
      tL = p < 0.3 ? lerpV(drawRest, nock, up) : lerpV(nock, face, pull);
    } else if (k < 0.86) {
      const p = (k - 0.44) / 0.42;
      tR = bowAim;
      // al soltar, la mano sale un poco hacia atrás y se queda
      tL = face.clone().add(new THREE.Vector3(0.05 * reach * smooth(Math.min(1, p * 4)), 0, -0.06 * reach * smooth(Math.min(1, p * 4))));
    } else {
      const p = smooth((k - 0.86) / 0.14);
      tR = lerpV(bowAim, bowLow, p);
      tL = lerpV(face, drawRest, p);
    }
    const r = solve(R, tR, poleR), l = solve(L, tL, poleL);
    push('RightArm', r.arm); push('RightForeArm', r.fore); push('RightHand', r.hand);
    push('LeftArm', l.arm); push('LeftForeArm', l.fore); push('LeftHand', l.hand);
    // la cabeza mira por encima de la flecha
    push('Head', new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, -0.12, 0)));
    push('Hips', id);
  }
  const tracks: THREE.KeyframeTrack[] = Object.entries(tr).map(([n, vals]) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, vals));
  const hips = rig.bones[0].head;
  tracks.push(new THREE.VectorKeyframeTrack('Hips.position', [0, duration], [...hips, ...hips]));
  return new THREE.AnimationClip('Attack', duration, tracks);
}
