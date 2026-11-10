// ============================================================================
// PATAS, RABOS Y CARA: LO QUE SE HACE DESPUÉS DE CREAR EL MOLDE
// ----------------------------------------------------------------------------
// El molde no cambia. Con la malla ya construida, aquí se:
//   - resume qué patas, rabos e hilos cortados se han encontrado (los hilos se
//     cortaron antes, en el recorte de cada silueta, ver imagePrep);
//   - busca la cara en la foto de frente y, si se piden, se pintan sus rasgos
//     a más resolución en un hueco libre del atlas (faceTexture);
//   - quita la cara de la nuca cuando no hay foto de espalda;
//   - dibuja la imagen de detección que enseña el panel.
// Lo usan los dos caminos que crean el personaje: App.handleBuildHuman y
// buildHumanFromImages.
// ============================================================================

import type * as THREE from 'three';
import {
  FACE_PARTS,
  clearNapeFace,
  detectFaceParts,
  faceRect,
  findFreeAtlasSpot,
  applyFacePatch,
  type FaceLayout,
  type FacePartId,
} from './faceTexture';
import { classifyLowerParts, detectSideViewParts } from './limbParts';
import type { TensorCrop } from './imagePrep';

const W = 256;

interface ViewLike {
  rgb: Float32Array;
  bg: [number, number, number];
  threadCut?: Uint8Array;
  threadCount?: number;
}

export interface LimbFaceInput {
  geometry: THREE.BufferGeometry;
  atlas: { albedo: Uint8Array; roughMetal?: Uint8Array; normal?: Uint8Array; atlasWidth: number };
  frontMask: Uint8Array;
  frontView: ViewLike;
  frontImage: HTMLImageElement;
  frontCrop: TensorCrop | null;
  /** La foto de frente se ha movido o girado en el estudio de fotos. */
  frontTransformed: boolean;
  /** La textura sale del mapa de capas en vez de la foto. */
  layerTexture: boolean;
  hasBack: boolean;
  /** Vistas con sus hilos cortados, para el resumen. */
  views: Array<[string, ViewLike | null | undefined]>;
  sideMask: Uint8Array | null;
  sideView: ViewLike | null;
  landmarks: { top: number; bottom: number; axisX: number; crotchY: number; neckY: number };
  rigKind?: string;
  /** Resultado de cada parte pinchada para limpiar: cuántos píxeles de hilo se han quitado. */
  cleanReport?: Array<{ view: 'front' | 'side'; x: number; y: number; removed: number }>;
  /** Medidas de la criatura (suelo, vientre, largo), para separar las patas traseras. */
  creatureMetrics?: {
    axisX: number;
    groundY: number;
    bellyY: number;
    minZ: number;
    maxZ: number;
    height: number;
  };
  options: {
    separateLimbs?: boolean;
    faceParts?: FacePartId[];
    clearNape?: boolean;
  };
}

export interface LimbFaceResult {
  detection: string[];
  notes: string[];
  detectionPreview?: string;
}

/**
 * Separa las dos patas traseras de un cuadrúpedo. En el perfil se ven solapadas y el molde
 * las talla como un único bloque que llena el hueco entre ellas, así que la malla queda con
 * las dos patas pegadas. Aquí, en la mitad trasera y por debajo del vientre, los vértices
 * cercanos al eje se empujan hacia fuera dejando un hueco de `gap` metros; más arriba y lejos
 * del eje no cambian. La función es monótona en X, así que no se pliega la malla.
 */
export function separateHindLegs(
  geometry: THREE.BufferGeometry,
  m: { axisX: number; groundY: number; bellyY: number; minZ: number; maxZ: number; height: number },
  opts: { gap?: number; reach?: number } = {}
): number {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos) return 0;
  const gap = opts.gap ?? 0.06;
  const reach = opts.reach ?? 0.3;
  const length = Math.max(1e-3, m.maxZ - m.minZ);
  const zHind = m.minZ + 0.45 * length;
  const fade = 0.1 * Math.max(1e-3, m.height);
  let moved = 0;
  const arr = pos.array as Float32Array;
  for (let i = 0; i < pos.count; i++) {
    const x = arr[i * 3];
    const y = arr[i * 3 + 1];
    const z = arr[i * 3 + 2];
    if (z >= zHind) continue;
    // Peso vertical: pleno por debajo del vientre, se apaga hacia arriba
    const wy = Math.max(0, Math.min(1, (m.bellyY + fade - y) / fade));
    if (wy <= 0) continue;
    const dx = x - m.axisX;
    const ad = Math.abs(dx);
    if (ad >= reach) continue;
    const s = dx >= 0 ? 1 : -1;
    const push = gap * wy * (1 - ad / reach);
    arr[i * 3] = x + s * push;
    moved++;
  }
  if (moved > 0) {
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  return moved;
}

export function applyLimbAndFaceExtras(input: LimbFaceInput): LimbFaceResult {
  const { geometry, atlas, frontMask, frontView, options } = input;
  const detection: string[] = [];
  const notes: string[] = [];
  const isCreature = !!input.rigKind && input.rigKind !== 'human';

  // --- Patas y rabos ---
  let sideParts: ReturnType<typeof detectSideViewParts> = null;
  let frontTail: Uint8Array | null = null;
  if (options.separateLimbs) {
    const perView = input.views
      .filter(([, v]) => v && (v.threadCount ?? 0) > 0)
      .map(([n, v]) => `${v!.threadCount} ${n}`);
    const totalThreads = input.views.reduce((a, [, v]) => a + (v?.threadCount ?? 0), 0);
    let legs = 0;
    let tails = 0;
    let where = 'de frente';
    if (isCreature && input.sideMask) {
      sideParts = detectSideViewParts(input.sideMask, W);
      legs = sideParts?.legs ?? 0;
      tails = sideParts?.tails ?? 0;
      where = 'en el perfil';
    } else {
      const lm = input.landmarks;
      const res = classifyLowerParts(frontMask, W, { top: lm.top, bottom: lm.bottom, axisX: lm.axisX, crotchY: lm.crotchY });
      legs = res.legs;
      tails = res.tails;
      if (tails > 0) frontTail = res.tail;
    }
    detection.push(
      `Patas ${where}: ${legs || 'ninguna clara'} · rabos: ${tails || 'ninguno'} · hilos cortados: ${totalThreads}` +
        (perView.length ? ` (${perView.join(', ')})` : '')
    );
    if (isCreature) {
      detection.push('El esqueleto de cuadrúpedo coloca sus cuatro patas y la cola en la malla 3D.');
      if (input.creatureMetrics) {
        const movidos = separateHindLegs(geometry, input.creatureMetrics);
        detection.push(`Patas traseras separadas por el hueco entre ellas (${movidos} vértices).`);
      }
    }
  }

  if (input.cleanReport?.length) {
    for (const c of input.cleanReport) {
      const donde = c.view === 'front' ? 'frente' : 'perfil';
      detection.push(
        c.removed > 0
          ? `Parte limpiada (${donde}, ${c.x},${c.y}): ${c.removed} píxeles de hilo quitados.`
          : `Parte limpiada (${donde}, ${c.x},${c.y}): no hay hilos que quitar ahí.`
      );
    }
  }

  // --- Cara ---
  let face: FaceLayout | null = null;
  const wantParts = new Set<FacePartId>(options.faceParts ?? []);
  const needFace = wantParts.size > 0 || (!input.hasBack && options.clearNape !== false);
  if (needFace) {
    face = detectFaceParts(frontMask, frontView.rgb, W, {
      headBottom: isCreature ? undefined : input.landmarks.neckY,
      animal: isCreature,
    });
    if (!face) {
      notes.push('No se ha encontrado la cabeza en la foto de frente: la cara se queda con la textura normal.');
    } else {
      detection.push(
        face.detected
          ? `Cara: ojos encontrados en la foto${
              face.earsFound
                ? `, ${face.earsFound === 2 ? 'dos orejas que sobresalen' : 'una oreja que sobresale'}`
                : ''
            }.`
          : 'Cara: los ojos no se distinguen bien; nariz, boca y orejas se colocan por proporciones.'
      );
      if (wantParts.size > 0) {
        const rect = faceRect(face, wantParts);
        const spot = findFreeAtlasSpot(geometry, atlas.atlasWidth);
        if (input.frontTransformed) {
          notes.push('La foto de frente está movida o girada en el estudio de fotos: los rasgos de la cara se quedan con la textura normal.');
        } else if (input.layerTexture) {
          notes.push('La textura sale del mapa de capas: los rasgos de la cara de la foto no se aplican.');
        } else if (!geometry.getIndex()) {
          notes.push('La malla no tiene índices: los rasgos de la cara se quedan con la textura normal.');
        } else if (!rect || !spot || !input.frontCrop) {
          notes.push('No queda hueco libre en la textura para los rasgos de la cara: se quedan con la textura normal.');
        } else {
          const n = atlas.albedo.length;
          const res = applyFacePatch(
            {
              geometry,
              albedo: atlas.albedo,
              roughMetal: atlas.roughMetal ?? new Uint8Array(n),
              normal: atlas.normal ?? new Uint8Array(n),
              atlasWidth: atlas.atlasWidth,
              mask: frontMask,
              w: W,
              background: frontView.bg,
              frontImage: input.frontImage,
              frontCrop: input.frontCrop,
            },
            face,
            rect,
            spot,
            wantParts
          );
          if (res && res.triangles > 0) {
            // Detalle real: lo que dé la foto, sin pasar de lo que cabe en el hueco.
            const g = Math.min(res.gain, spot.size / Math.max(1, rect.size));
            const names = FACE_PARTS.filter((p) => wantParts.has(p.id)).map((p) => p.label.toLowerCase());
            detection.push(
              `Desde la foto de frente: ${names.join(', ')} (x${g.toFixed(1)} de detalle, ${res.triangles.toLocaleString()} triángulos de la cara).`
            );
            if (g < 1.3) {
              notes.push('La foto de frente es pequeña (o el hueco libre de la textura): los rasgos de la cara apenas ganan detalle.');
            }
          } else {
            notes.push('No se ha encontrado la cara de la malla que mira a la foto de frente: los rasgos se quedan como estaban.');
          }
        }
      }
      if (!input.hasBack && options.clearNape !== false && atlas.normal) {
        clearNapeFace(atlas.albedo, atlas.normal, atlas.atlasWidth, frontMask, W, face);
        detection.push('Nuca: se han quitado los ojos y la boca que salían por detrás.');
      } else if (!input.hasBack && options.clearNape !== false) {
        clearNapeFace(atlas.albedo, new Uint8Array(atlas.albedo.length), atlas.atlasWidth, frontMask, W, face);
        detection.push('Nuca: se han quitado los ojos y la boca que salían por detrás.');
      }
    }
  }

  const detectionPreview =
    options.separateLimbs || face
      ? drawDetectionPreview(
          frontView.rgb,
          frontMask,
          frontTail,
          options.separateLimbs ? frontView.threadCut ?? null : null,
          face,
          sideParts && input.sideView && input.sideMask
            ? {
                rgb: input.sideView.rgb,
                mask: input.sideMask,
                tail: sideParts.tail,
                cut: input.sideView.threadCut ?? null,
                bellyY: sideParts.bellyY,
                parts: sideParts.parts,
              }
            : null
        )
      : undefined;
  return { detection, notes, detectionPreview };
}

/**
 * Lo detectado: la foto de frente con el cuerpo en azul, el rabo en naranja,
 * los hilos cortados en rojo y los óvalos de la cara; y, en un cuadrúpedo, al
 * lado el perfil con su línea de barriga.
 */
function drawDetectionPreview(
  rgb: Float32Array,
  mask: Uint8Array,
  tail: Uint8Array | null,
  cut: Uint8Array | null,
  face: FaceLayout | null,
  side: {
    rgb: Float32Array;
    mask: Uint8Array;
    tail: Uint8Array;
    cut: Uint8Array | null;
    bellyY: number;
    parts?: Array<{ kind: string; minX: number; maxX: number; minY: number; maxY: number }>;
  } | null
): string | undefined {
  const S = 2;
  const panels = side ? 2 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = W * S * panels;
  canvas.height = W * S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  const paint = (src: Float32Array, m: Uint8Array, t: Uint8Array | null, c: Uint8Array | null, x0: number) => {
    const img = ctx.createImageData(W, W);
    for (let i = 0; i < W * W; i++) {
      let r = src[i * 3] * 255;
      let g = src[i * 3 + 1] * 255;
      let b = src[i * 3 + 2] * 255;
      if (c && c[i]) {
        r = 255; g = 40; b = 40;
      } else if (t && t[i]) {
        r = r * 0.35 + 255 * 0.65; g = g * 0.35 + 150 * 0.65; b = b * 0.35;
      } else if (m[i]) {
        r = r * 0.55 + 60 * 0.45; g = g * 0.55 + 150 * 0.45; b = b * 0.55 + 255 * 0.45;
      } else {
        r *= 0.35; g *= 0.35; b *= 0.35;
      }
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    const small = document.createElement('canvas');
    small.width = W;
    small.height = W;
    small.getContext('2d')?.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, x0, 0, W * S, W * S);
  };
  paint(rgb, mask, tail, cut, 0);
  if (face) {
    const colors: Record<FacePartId, string> = {
      eyes: '#22d3ee', nose: '#facc15', mouth: '#f472b6', ears: '#a3e635', whole: 'rgba(255,255,255,0.6)',
    };
    ctx.lineWidth = 1.5;
    for (const p of face.parts) {
      ctx.strokeStyle = colors[p.id];
      ctx.setLineDash(p.id === 'whole' ? [4, 3] : []);
      ctx.beginPath();
      ctx.ellipse((p.cx + 0.5) * S, (p.cy + 0.5) * S, p.rx * S, p.ry * S, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (side) {
    const x0 = W * S;
    paint(side.rgb, side.mask, side.tail, side.cut, x0);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, (side.bellyY + 0.5) * S);
    ctx.lineTo(x0 + W * S, (side.bellyY + 0.5) * S);
    ctx.stroke();
    ctx.setLineDash([]);
    // Cada pata y rabo detectados, con recuadro y número, para saber dónde pinchar
    let nPata = 0;
    let nRabo = 0;
    for (const p of side.parts ?? []) {
      if (p.kind !== 'pata' && p.kind !== 'rabo') continue;
      const label = p.kind === 'pata' ? `Pata ${++nPata}` : `Cola ${++nRabo}`;
      const color = p.kind === 'pata' ? '#a3e635' : '#fb923c';
      const bx = x0 + p.minX * S;
      const by = p.minY * S;
      const bw = (p.maxX - p.minX + 1) * S;
      const bh = (p.maxY - p.minY + 1) * S;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = color;
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(label, bx + 2, Math.max(12, by - 3));
    }
  }
  return canvas.toDataURL('image/png');
}
