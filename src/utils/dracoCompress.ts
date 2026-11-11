import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';
// Codificador oficial de Google (wasm). El archivo "nodejs" funciona también en el navegador.
import createEncoderModule from 'draco3d/draco_encoder_nodejs.js';
import encoderWasmUrl from 'draco3d/draco_encoder.wasm?url';

// ============================================================================
// COMPRESIÓN DRACO DE UN .GLB
// three.js sabe leer Draco pero no escribirlo: el .glb se exporta como siempre y
// luego glTF-Transform comprime la geometría con el codificador de Google.
// Las texturas, los huesos y las animaciones no cambian.
// ============================================================================

let encoderPromise: Promise<unknown> | null = null;

function getEncoder(): Promise<unknown> {
  if (!encoderPromise) {
    encoderPromise = (createEncoderModule as (o: object) => Promise<unknown>)({
      locateFile: () => encoderWasmUrl,
    });
  }
  return encoderPromise;
}

export interface DracoResult {
  bytes: Uint8Array;
  before: number;
  after: number;
}

/** Comprime la geometría de un .glb con Draco (edgebreaker, nivel 7, cuantización por defecto). */
export async function compressGlbWithDraco(bytes: Uint8Array): Promise<DracoResult> {
  const io = new WebIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.encoder': await getEncoder() });
  const doc = await io.readBinary(bytes);
  await doc.transform(draco({ method: 'edgebreaker', encodeSpeed: 3, decodeSpeed: 5 }));
  const out = await io.writeBinary(doc);
  return { bytes: out, before: bytes.byteLength, after: out.byteLength };
}
