// Deja un GLB exportado por salon-3d listo para juego:
// una malla por material, UV en proyección de caja a densidad fija, sin transmisión, materiales con nombre.
// Variables: SUAVE=1 (normales suaves, para piezas orgánicas), NOMBRES='[["Nombre",[r,g,b]],...]' (tabla de nombres por color base), TEX=1024 (lado máximo de las texturas).
// Uso: node optimizar_juego.mjs entrada.glb salida.glb [uv_por_metro=1] [y_minima]
// y_minima: altura (m) a la que se coloca el punto más bajo; la app a veces apoya mal el modelo
// en el suelo, y con esto todos los módulos de una serie quedan a la misma altura que en el script.
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsTransmission, KHRMaterialsVolume } from '@gltf-transform/extensions';
import { dedup, flatten, join, weld, prune, unweld, quantize, transformPrimitive, textureCompress, normals } from '@gltf-transform/functions';
import sharp from 'sharp';

const [, , inp, out, dens = '1', ymin] = process.argv;
const UVM = Number(dens);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const root = doc.getRoot();

// Nombres de material por color base (los del script del muelle)
const NOMBRES = process.env.NOMBRES ? JSON.parse(process.env.NOMBRES) : [
  ['Hierro_Muelle', [0.14, 0.15, 0.14]], ['Hierro_Oxido', [0.24, 0.16, 0.12]], ['Barandilla_Verde', [0.11, 0.21, 0.17]],
  ['Brida_Acople', [0.36, 0.30, 0.16]], ['Acero_Rail', [0.64, 0.66, 0.68]], ['Madera_Tablero', [0.34, 0.23, 0.14]],
  ['Madera_Traviesa', [0.18, 0.12, 0.08]], ['Madera_Caja', [0.48, 0.34, 0.19]], ['Defensa_Pilote', [0.22, 0.16, 0.11]],
  ['Saco_Arpillera', [0.58, 0.50, 0.36]], ['Mineral_Riotinto', [0.46, 0.16, 0.09]], ['Luz_Farola', [1.0, 0.75, 0.33]], ['Senal_Roja', [0.95, 0.14, 0.10]], ['Senal_Curva', [1.0, 0.58, 0.08]],
];

await doc.transform(dedup({ propertyTypes: ['Material', 'Texture'] }), flatten());

// Sin instancias: cada nodo con su propia malla, y geometría en coordenadas de mundo
for (const node of root.listNodes()) {
  let mesh = node.getMesh();
  if (!mesh) continue;
  if (mesh.listParents().filter((p) => p.propertyType === 'Node').length > 1) {
    mesh = mesh.clone();
    node.setMesh(mesh);
  }
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    for (const sem of prim.listSemantics()) prim.setAttribute(sem, prim.getAttribute(sem).clone());
    if (prim.getIndices()) prim.setIndices(prim.getIndices().clone());
    transformPrimitive(prim, m);
  }
  node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
await doc.transform(unweld());

// UV de caja por triángulo (eje dominante de la normal de la cara), UVM unidades UV por metro
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute('POSITION');
  const n = pos.getCount();
  const uv = new Float32Array(n * 2);
  const a = [], b = [], c = [];
  for (let t = 0; t < n; t += 3) {
    pos.getElement(t, a); pos.getElement(t + 1, b); pos.getElement(t + 2, c);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
    for (let k = 0; k < 3; k++) {
      const p = [a, b, c][k];
      let u, v;
      if (nx >= ny && nx >= nz) { u = p[2]; v = p[1]; } else if (ny >= nz) { u = p[0]; v = p[2]; } else { u = p[0]; v = p[1]; }
      uv[(t + k) * 2] = u * UVM;
      uv[(t + k) * 2 + 1] = -v * UVM;
    }
  }
  const acc = doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(root.listBuffers()[0]);
  const old = prim.getAttribute('TEXCOORD_0');
  prim.setAttribute('TEXCOORD_0', acc);
  if (old && old.listParents().length <= 1) old.dispose();
}

// Normales suaves para piezas orgánicas (SUAVE=1): la app exporta caras planas. Cada vértice
// promedia las normales de las caras que lo tocan con menos de 60 grados de diferencia
// (las aristas vivas, como el borde de una pezuña, se quedan marcadas).
if (process.env.SUAVE === '1') {
  const LIM = Math.cos((60 * Math.PI) / 180);
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const n = pos.getCount();
    const fn = new Float32Array(n * 3);
    const a = [], b = [], c = [];
    for (let t = 0; t < n; t += 3) {
      pos.getElement(t, a); pos.getElement(t + 1, b); pos.getElement(t + 2, c);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
      const l = Math.hypot(x, y, z) || 1;
      for (let k = 0; k < 3; k++) { fn[(t + k) * 3] = x / l; fn[(t + k) * 3 + 1] = y / l; fn[(t + k) * 3 + 2] = z / l; }
    }
    const grupos = new Map();
    const p = [];
    for (let i = 0; i < n; i++) {
      pos.getElement(i, p);
      const key = p.map((v) => Math.round(v * 1e4)).join(',');
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(i);
    }
    const out = new Float32Array(n * 3);
    for (const lista of grupos.values()) {
      for (const i of lista) {
        let x = 0, y = 0, z = 0;
        for (const j of lista) {
          const d = fn[i * 3] * fn[j * 3] + fn[i * 3 + 1] * fn[j * 3 + 1] + fn[i * 3 + 2] * fn[j * 3 + 2];
          if (d >= LIM) { x += fn[j * 3]; y += fn[j * 3 + 1]; z += fn[j * 3 + 2]; }
        }
        const l = Math.hypot(x, y, z) || 1;
        out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
      }
    }
    prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(out).setBuffer(root.listBuffers()[0]));
  }
}

// Materiales: nombre, sin transmisión/volumen (pasada extra de render en three.js), farola opaca y emisiva
for (const mat of root.listMaterials()) {
  const bc = mat.getBaseColorFactor();
  let best = null, bd = 1e9;
  for (const [name, col] of NOMBRES) {
    const d = Math.hypot(bc[0] - col[0], bc[1] - col[1], bc[2] - col[2]);
    if (d < bd) { bd = d; best = name; }
  }
  if (bd < 0.1) mat.setName(best);
  mat.setExtension('KHR_materials_transmission', null);
  mat.setExtension('KHR_materials_volume', null);
  if (mat.getEmissiveFactor().some((x) => x > 0)) {
    mat.setAlphaMode('OPAQUE').setDoubleSided(false);
    mat.setBaseColorFactor([bc[0], bc[1], bc[2], 1]);
  }
}
for (const ext of root.listExtensionsUsed()) {
  if (ext instanceof KHRMaterialsTransmission || ext instanceof KHRMaterialsVolume) ext.dispose();
}

await doc.transform(
  weld(),
  join({ keepNamed: false }),
  weld(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 85, resize: [Number(process.env.TEX || 512), Number(process.env.TEX || 512)] }),
  quantize(),
);

// Nombre de cada malla y nodo = su material
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const name = mesh.listPrimitives()[0].getMaterial()?.getName() || 'Pieza';
  mesh.setName((process.env.PREFIJO ?? 'Muelle_') + name);
  node.setName((process.env.PREFIJO ?? 'Muelle_') + name);
}
if (ymin !== undefined) {
  const dy = Number(ymin) - getBounds(root.listScenes()[0]).min[1];
  for (const node of root.listScenes()[0].listChildren()) {
    const t = node.getTranslation();
    node.setTranslation([t[0], t[1] + dy, t[2]]);
  }
  console.log(`Altura corregida: ${dy.toFixed(3)} m`);
}
await io.write(out, doc);
