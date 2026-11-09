// Optimiza el GLB del Ayuntamiento de Moguer (modo Completo) en una única versión final.
// Uso:  node ayuntamiento/optimize_glb.mjs <entrada.glb> <salida.glb>
// Dependencias (solo para generar el archivo, no para la app):
//   npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer@1 sharp@0.34
//
// Pasos y pérdidas medidas (ver la descripción del commit):
//  1. Texturas procedurales opacas (PNG RGBA sin transparencia real) -> JPEG calidad 95.
//     Única pérdida del pipeline: PSNR 47-54 dB frente al original. Los mapas de cal y teja
//     ya son JPEG y no se recodifican.
//  2. Soldar vértices, deduplicar texturas/accesores y quitar propiedades sin uso: sin pérdida (verificado).
//  3. Reordenar vértices para caché (meshopt "reorder"): sin pérdida (verificado).
//
// No se usa compresión de geometría meshopt en modo FILTER ni `quantize`: ambos alteran normales
// (filtro octaédrico, hasta 79 grados en algunos vértices) o precisión de posición (hasta 3 cm).
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('Uso: node ayuntamiento/optimize_glb.mjs <entrada.glb> <salida.glb>');
  process.exit(1);
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inPath);
const sizeIn = readFileSync(inPath).byteLength;

// 1. Procedurales opacas PNG -> JPEG q95
let converted = 0;
for (const tex of doc.getRoot().listTextures()) {
  if (tex.getMimeType() !== 'image/png') continue;
  const png = Buffer.from(tex.getImage());
  if (!(await sharp(png).stats()).isOpaque) continue; // con transparencia real no se convierte
  const jpg = await sharp(png).jpeg({ quality: 95, mozjpeg: true }).toBuffer();
  tex.setImage(new Uint8Array(jpg)).setMimeType('image/jpeg');
  converted++;
}

// 2-3. Limpieza y reordenado sin pérdida
await doc.transform(weld(), dedup(), prune(), reorder({ encoder: MeshoptEncoder, target: 'size' }));

await io.write(outPath, doc);
const sizeOut = readFileSync(outPath).byteLength;
console.log(`Texturas procedurales convertidas a JPEG q95: ${converted}`);
console.log(`Tamaño: ${(sizeIn / 1e6).toFixed(2)} MB -> ${(sizeOut / 1e6).toFixed(2)} MB (${Math.round((1 - sizeOut / sizeIn) * 100)} % menos)`);
