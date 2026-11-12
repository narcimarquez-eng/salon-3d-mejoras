// Deja un .glb exportado con "Juego" listo para un juego: junta piezas por material, PNG a JPEG de 512 px.
// Uso (desde la raíz del repo): node .claude/skills/salon3d-glb/scripts/optimizar_juego.mjs entrada.glb salida.glb [1 = con Draco]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, join, flatten, draco } from '@gltf-transform/functions';
import draco3d from 'draco3d';
import { spawnSync } from 'child_process';
import fs from 'fs';
const [,, ent, sal, conDraco] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() });
const d = await io.read(ent);
for (const t of d.getRoot().listTextures()) {
  if (t.getMimeType() !== 'image/png') continue;
  fs.writeFileSync('/tmp/_t.png', t.getImage());
  const r = spawnSync('python3', ['-c', "from PIL import Image; im=Image.open('/tmp/_t.png').convert('RGB'); im.thumbnail((512,512)); im.save('/tmp/_t.jpg', quality=82)"]);
  if (r.status) throw new Error(r.stderr.toString());
  t.setImage(fs.readFileSync('/tmp/_t.jpg')); t.setMimeType('image/jpeg');
}
const tareas = [dedup(), flatten(), join(), weld(), prune()];
if (conDraco) tareas.push(draco({ method: 'edgebreaker' }));
await d.transform(...tareas);
await io.write(sal, d);
let tris = 0; for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
console.log(sal, (fs.statSync(sal).size / 1e6).toFixed(2), 'MB', 'mallas', d.getRoot().listMeshes().length, 'materiales', d.getRoot().listMaterials().length, 'tris', tris);
