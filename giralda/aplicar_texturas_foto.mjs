// Pone las texturas sacadas de las fotos (texturas_foto.py) en el GLB de la Giralda ya unido por
// materiales con gltf-transform (dedup, flatten, join, weld, prune). Necesita @gltf-transform/core y
// @gltf-transform/extensions. Uso: node aplicar_texturas_foto.mjs entrada.glb ladrillo.png estuco.png salida.glb
// Pone las texturas sacadas de las fotos en los materiales del GLB unido de la Giralda.
// Uso: node aplicar.mjs entrada.glb ladrillo.png estuco.png salida.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'fs';
const [, , ent, pLad, pEst, sal] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(ent);
const root = doc.getRoot();
const tLad = doc.createTexture('Giralda_ladrillo_foto').setImage(fs.readFileSync(pLad)).setMimeType('image/png');
const tEst = doc.createTexture('Giralda_estuco_foto').setImage(fs.readFileSync(pEst)).setMimeType('image/png');
const cerca = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 0.006);
// Metros del modelo -> unidades del GLB (la app lo normaliza a 3 de alto; 104,45 m reales con pavimento)
let minY = 1e9, maxY = -1e9;
for (const me of root.listMeshes()) for (const p of me.listPrimitives()) {
  const pos = p.getAttribute('POSITION'); const mn = pos.getMin([]); const mx = pos.getMax([]);
  minY = Math.min(minY, mn[1]); maxY = Math.max(maxY, mx[1]);
}
const uPorM = (maxY - minY) / 104.45;
// material (color base) -> textura, factor nuevo, metros por repeticion (null = conservar UV)
// Las texturas son gris claro (0,85 lineal): el factor es el color del material / 0,85
const k85 = (c) => c.map((x) => Math.min(1, x / 0.85));
const plan = [
  { col: [0.54, 0.42, 0.315], tex: tLad, m: null, nombre: 'GI_Ladrillo_Foto' },
  { col: [0.62, 0.48, 0.36], tex: tLad, m: 1.4, nombre: 'GI_Ladrillo_Relieve_Foto' },
  { col: [0.3, 0.225, 0.165], tex: tLad, m: 1.4, nombre: 'GI_Ladrillo_Sombra_Foto' },
  { col: [0.61, 0.425, 0.23], tex: tEst, m: 2.5, nombre: 'GI_Ocre_Renacentista_Foto' },
  { col: [0.8, 0.7, 0.51], tex: tEst, m: 2.5, nombre: 'GI_Moldura_Clara_Foto' },
];
for (const q of plan) q.f = k85(q.col);
for (const mat of root.listMaterials()) {
  const c = mat.getBaseColorFactor().slice(0, 3);
  const pl = plan.find((q) => cerca(q.col, c));
  if (!pl) continue;
  mat.setName(pl.nombre).setBaseColorFactor([...pl.f, 1]).setBaseColorTexture(pl.tex);
  const info = mat.getBaseColorTextureInfo();
  info.setWrapS(10497).setWrapT(10497);
  if (pl.m === null) {
    // El ladrillo ya trae UV por cara con repeticion 10 (KHR_texture_transform): se conservan
    const ext = doc.createExtension(ALL_EXTENSIONS.find((e) => e.EXTENSION_NAME === 'KHR_texture_transform'));
    info.setExtension('KHR_texture_transform', ext.createTransform().setScale([10, 10]));
    continue;
  }
  // Sin UV: proyeccion por caras en metros (eje dominante de la normal)
  const k = 1 / (pl.m * uPorM);
  for (const me of root.listMeshes()) for (const p of me.listPrimitives()) {
    if (p.getMaterial() !== mat) continue;
    const pos = p.getAttribute('POSITION'); const nor = p.getAttribute('NORMAL');
    const n = pos.getCount(); const uv = new Float32Array(n * 2);
    const a = [], b = [];
    for (let i = 0; i < n; i++) {
      pos.getElement(i, a); nor.getElement(i, b);
      const ax = Math.abs(b[0]), ay = Math.abs(b[1]), az = Math.abs(b[2]);
      let u, v;
      if (ay >= ax && ay >= az) { u = a[0]; v = a[2]; }
      else if (ax >= az) { u = a[2]; v = a[1]; }
      else { u = a[0]; v = a[1]; }
      uv[i * 2] = u * k; uv[i * 2 + 1] = -v * k;
    }
    p.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(root.listBuffers()[0]));
  }
}
// Nombres al resto de materiales para que se reconozcan en cualquier editor
const otros = [[[0.3, 0.28, 0.25], 'GI_Pavimento'], [[0.42, 0.36, 0.27], 'GI_Sillares'], [[0.018, 0.014, 0.012], 'GI_Hueco'], [[0.7, 0.68, 0.62], 'GI_Marmol'], [[0.03, 0.03, 0.032], 'GI_Hierro'], [[0.1, 0.075, 0.035], 'GI_Bronce_Giraldillo'], [[0.8, 0.52, 0.14], 'GI_Dorado'], [[0.16, 0.12, 0.045], 'GI_Bronce_Campanas'], [[0.38, 0.11, 0.045], 'GI_Almagra'], [[0.05, 0.22, 0.13], 'GI_Azulejo']];
for (const mat of root.listMaterials()) {
  const o = otros.find((q) => cerca(q[0], mat.getBaseColorFactor().slice(0, 3)));
  if (o && !mat.getName()) mat.setName(o[1]);
}
for (const me of root.listMeshes()) for (const p of me.listPrimitives()) if (!me.getName()) me.setName(p.getMaterial()?.getName() || 'GI');
for (const nd of root.listNodes()) if (!nd.getName() && nd.getMesh()) nd.setName(nd.getMesh().getName());
await io.write(sal, doc);
console.log('hecho', root.listMaterials().map((m) => m.getName()).join(', '));
