import * as THREE from 'three';

export type MatcapPresetId = 'clay' | 'jade' | 'gold' | 'pearl';

export interface MatcapPresetInfo {
  id: MatcapPresetId;
  name: string;
  description: string;
  swatchHex: string;
}

export const MATCAP_PRESETS: MatcapPresetInfo[] = [
  {
    id: 'clay',
    name: 'Arcilla de Escultura',
    description: 'Terracota mate de estudio para resaltar cada pliegue y volumen al esculpir',
    swatchHex: '#c26d53',
  },
  {
    id: 'jade',
    name: 'Jade Esmeralda',
    description: 'Acabado translúcido de piedra pulida con reflejos especulares suaves',
    swatchHex: '#10b981',
  },
  {
    id: 'gold',
    name: 'Bronce / Oro Anodizado',
    description: 'Alto contraste metálico para inspeccionar continuidad de normales',
    swatchHex: '#f59e0b',
  },
  {
    id: 'pearl',
    name: 'Cerámica Perlada',
    description: 'Superficie blanca satinada de museo con rebote de luz envolvente',
    swatchHex: '#e2e8f0',
  },
];

const matcapCache = new Map<MatcapPresetId, THREE.CanvasTexture>();

/**
 * Genera una textura esférica MatCap (Material Capture) de alta definición en 2D Canvas.
 * Permite iluminar cualquier modelo instantáneamente con máxima legibilidad de volumen.
 */
export function getProceduralMatcapTexture(preset: MatcapPresetId): THREE.CanvasTexture {
  if (matcapCache.has(preset)) {
    return matcapCache.get(preset)!;
  }

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2;

  // Configuraciones de color según el tipo de MatCap
  let baseStop0 = '#f4a28c';
  let baseStop1 = '#b85d43';
  let baseStop2 = '#5e2b1d';
  let rimColor = 'rgba(255, 225, 210, 0.45)';
  let specOpacity = 0.28;

  if (preset === 'jade') {
    baseStop0 = '#6ee7b7';
    baseStop1 = '#059669';
    baseStop2 = '#064e3b';
    rimColor = 'rgba(167, 243, 208, 0.6)';
    specOpacity = 0.55;
  } else if (preset === 'gold') {
    baseStop0 = '#fef08a';
    baseStop1 = '#d97706';
    baseStop2 = '#451a03';
    rimColor = 'rgba(254, 240, 138, 0.75)';
    specOpacity = 0.85;
  } else if (preset === 'pearl') {
    baseStop0 = '#ffffff';
    baseStop1 = '#cbd5e1';
    baseStop2 = '#475569';
    rimColor = 'rgba(248, 250, 252, 0.7)';
    specOpacity = 0.45;
  }

  // 1. Gradiente esférico principal (Key + Fill + Shadow)
  const mainGrad = ctx.createRadialGradient(
    cx - radius * 0.28,
    cy - radius * 0.32,
    radius * 0.05,
    cx,
    cy,
    radius
  );
  mainGrad.addColorStop(0.0, baseStop0);
  mainGrad.addColorStop(0.55, baseStop1);
  mainGrad.addColorStop(1.0, baseStop2);

  ctx.fillStyle = mainGrad;
  ctx.fillRect(0, 0, size, size);

  // 2. Luz de reborde esférica (Rim Light para despegar siluetas)
  const rimGrad = ctx.createRadialGradient(cx, cy, radius * 0.72, cx, cy, radius);
  rimGrad.addColorStop(0.0, 'rgba(0,0,0,0)');
  rimGrad.addColorStop(0.85, rimColor);
  rimGrad.addColorStop(1.0, baseStop0);

  ctx.fillStyle = rimGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // 3. Brillo especular superior izquierdo (Key Highlight)
  const specGrad = ctx.createRadialGradient(
    cx - radius * 0.32,
    cy - radius * 0.36,
    2,
    cx - radius * 0.32,
    cy - radius * 0.36,
    radius * 0.35
  );
  specGrad.addColorStop(0.0, `rgba(255, 255, 255, ${specOpacity})`);
  specGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

  ctx.fillStyle = specGrad;
  ctx.beginPath();
  ctx.arc(cx - radius * 0.32, cy - radius * 0.36, radius * 0.35, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  matcapCache.set(preset, texture);
  return texture;
}
