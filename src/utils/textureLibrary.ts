import { BufferAttribute, BufferGeometry, Matrix4, Texture } from 'three';

export interface ColorMapSet {
  color: Texture | null;
  diffuse: Texture | null;
  normal: Texture | null;
  roughness: Texture | null;
}

export interface ColorMapTextureInfo {
  id: string;
  name: string;
  url: string;
  license: string;
  source: 'builtin' | 'user';
}

const userTextures: ColorMapTextureInfo[] = [];

export function slugifyTextureId(id: string): string {
  return id
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '_');
}

export async function listAllColorMapTextures(): Promise<ColorMapTextureInfo[]> {
  return [...userTextures];
}

export async function addUserTexture(file: File): Promise<ColorMapTextureInfo> {
  const url = URL.createObjectURL(file);
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'textura';
  const id = slugifyTextureId(baseName) || `tex_${Date.now()}`;
  const info: ColorMapTextureInfo = {
    id,
    name: baseName,
    url,
    license: 'Subida por el usuario',
    source: 'user',
  };
  const existingIdx = userTextures.findIndex((t) => t.id === id);
  if (existingIdx >= 0) {
    userTextures[existingIdx] = info;
  } else {
    userTextures.push(info);
  }
  return info;
}

export async function removeUserTexture(id: string): Promise<void> {
  const idx = userTextures.findIndex((t) => t.id === id);
  if (idx >= 0) {
    userTextures.splice(idx, 1);
  }
}

export function getColorMapSet(id: string): ColorMapSet {
  slugifyTextureId(id);
  return {
    color: null,
    diffuse: null,
    normal: null,
    roughness: null,
  };
}

export async function preloadColorMapImages(): Promise<void> {
  return Promise.resolve();
}

/**
 * Proyección UV triplanar / caja con matriz o escala en metros.
 */
export function applyBoxProjectedUv(
  geometry: BufferGeometry,
  matrixOrScale: Matrix4 | number,
  _tileMeters?: number
): void {
  if (!geometry.attributes.position) return;
  const pos = geometry.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  const scale = typeof matrixOrScale === 'number' ? matrixOrScale : 1;
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i) * scale;
    const y = pos.getY(i) * scale;
    const z = pos.getZ(i) * scale;
    uvs[i * 2] = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
    uvs[i * 2 + 1] = y * 0.5 + 0.5;
  }
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
}
