// Deja un GLB exportado por salon-3d listo para juego:
// una malla por material, UV en proyección de caja a densidad fija, sin transmisión, materiales con nombre.
// Uso: node optimizar_juego.mjs entrada.glb salida.glb [uv_por_metro=1]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsTransmission, KHRMaterialsVolume } from '@gltf-transform/extensions';
import { dedup, flatten, join, weld, prune, unweld, quantize, transformPrimitive, textureCompress, normals } from '@gltf-transform/functions';
import sharp from 'sharp';

const [, , inp, out, dens = '1'] = process.argv;
const UVM = Number(dens);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const root = doc.getRoot();

// Nombres de material por color base (los del script del muelle)
const NOMBRES = [
  ['Hierro_Muelle', [0.14, 0.15, 0.14]], ['Hierro_Oxido', [0.24, 0.16, 0.12]], ['Barandilla_Verde', [0.11, 0.21, 0.17]],
  ['Brida_Acople', [0.36, 0.30, 0.16]], ['Acero_Rail', [0.64, 0.66, 0.68]], ['Madera_Tablero', [0.34, 0.23, 0.14]],
  ['Madera_Traviesa', [0.18, 0.12, 0.08]], ['Madera_Caja', [0.48, 0.34, 0.19]], ['Defensa_Pilote', [0.22, 0.16, 0.11]],
  ['Saco_Arpillera', [0.58, 0.50, 0.36]], ['Mineral_Riotinto', [0.46, 0.16, 0.09]], ['Luz_Farola', [1.0, 0.75, 0.33]],
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

// Materiales: nombre, sin transmisión/volumen (pasada extra de render en three.js), farola opaca y emisiva
for (const mat of root.listMaterials()) {
  const bc = mat.getBaseColorFactor();
  let best = null, bd = 1e9;
  for (const [name, col] of NOMBRES) {
    const d = Math.hypot(bc[0] - col[0], bc[1] - col[1], bc[2] - col[2]);
    if (d < bd) { bd = d; best = name; }
  }
  if (bd < 0.06) mat.setName(best);
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
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 85, resize: [512, 512] }),
  quantize(),
);

// Nombre de cada malla y nodo = su material
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const name = mesh.listPrimitives()[0].getMaterial()?.getName() || 'Pieza';
  mesh.setName('Muelle_' + name);
  node.setName('Muelle_' + name);
}
await io.write(out, doc);
