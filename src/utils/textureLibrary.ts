import {
  BufferAttribute,
  BufferGeometry,
  Matrix3,
  Matrix4,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from 'three';

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

/**
 * Texturas de imagen que trae la app en `public/textures/<id>_diff_1k.jpg` (más `_nor_gl_1k` y
 * `_rough_1k` cuando existen). Se usan desde Python con `mat.color_map = "<id>"`.
 * Las `burro_*` están recortadas de la hoja de vistas del burro de carga del usuario.
 */
const BUILTIN_TEXTURES: Array<{ id: string; name: string; license: string; pbr?: boolean }> = [
  { id: 'cal_blanca', name: 'Cal blanca', license: 'CC0 (Poly Haven)', pbr: true },
  { id: 'teja_arcilla', name: 'Teja de arcilla', license: 'CC0 (Poly Haven)', pbr: true },
  { id: 'burro_pelaje', name: 'Burro: pelaje', license: 'Foto del usuario' },
  { id: 'burro_barriga', name: 'Burro: pelaje claro', license: 'Foto del usuario' },
  { id: 'burro_hocico', name: 'Burro: hocico', license: 'Foto del usuario' },
  { id: 'burro_crin', name: 'Burro: crin oscura', license: 'Foto del usuario' },
  { id: 'burro_madera', name: 'Burro: madera de las cajas', license: 'Foto del usuario' },
  { id: 'burro_cuerda', name: 'Burro: cuerda', license: 'Foto del usuario' },
  { id: 'burro_saco', name: 'Burro: saco de arpillera', license: 'Foto del usuario' },
  { id: 'burro_manta_verde', name: 'Burro: manta verde', license: 'Foto del usuario' },
  { id: 'burro_manta_gris', name: 'Burro: manta gris', license: 'Foto del usuario' },
  { id: 'burro_cuero', name: 'Burro: cuero', license: 'Foto del usuario' },
  { id: 'burro_metal', name: 'Burro: metal de las sartenes', license: 'Foto del usuario' },
];

function textureBaseUrl(): string {
  const base = (import.meta as any).env?.BASE_URL ?? '/';
  return `${base.endsWith('/') ? base : base + '/'}textures/`;
}

function builtinInfo(): ColorMapTextureInfo[] {
  return BUILTIN_TEXTURES.map((t) => ({
    id: t.id,
    name: t.name,
    url: `${textureBaseUrl()}${t.id}_diff_1k.jpg`,
    license: t.license,
    source: 'builtin' as const,
  }));
}

// Texturas ya cargadas (el motor las pide de forma síncrona durante el script)
const loadedSets = new Map<string, ColorMapSet>();
const loadingSets = new Map<string, Promise<void>>();

function loadTexture(url: string, color: boolean): Promise<Texture | null> {
  return new Promise((resolve) => {
    new TextureLoader().load(
      url,
      (tex) => {
        tex.wrapS = RepeatWrapping;
        tex.wrapT = RepeatWrapping;
        if (color) tex.colorSpace = SRGBColorSpace;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  });
}

function ensureLoaded(id: string): Promise<void> {
  if (loadedSets.has(id)) return Promise.resolve();
  const pending = loadingSets.get(id);
  if (pending) return pending;
  const user = userTextures.find((t) => t.id === id);
  const builtin = BUILTIN_TEXTURES.find((t) => t.id === id);
  if (!user && !builtin) return Promise.resolve();
  const job = (async () => {
    const base = textureBaseUrl();
    const color = await loadTexture(user ? user.url : `${base}${id}_diff_1k.jpg`, true);
    let normal: Texture | null = null;
    let roughness: Texture | null = null;
    if (!user && builtin?.pbr) {
      normal = await loadTexture(`${base}${id}_nor_gl_1k.jpg`, false);
      roughness = await loadTexture(`${base}${id}_rough_1k.jpg`, false);
    }
    loadedSets.set(id, { color, diffuse: color, normal, roughness });
    loadingSets.delete(id);
  })();
  loadingSets.set(id, job);
  return job;
}

export function slugifyTextureId(id: string): string {
  return id
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '_');
}

export async function listAllColorMapTextures(): Promise<ColorMapTextureInfo[]> {
  return [...builtinInfo(), ...userTextures];
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
  loadedSets.delete(id);
  await ensureLoaded(id);
  return info;
}

export async function removeUserTexture(id: string): Promise<void> {
  const idx = userTextures.findIndex((t) => t.id === id);
  if (idx >= 0) {
    userTextures.splice(idx, 1);
  }
  loadedSets.delete(id);
}

export function getColorMapSet(id: string): ColorMapSet {
  const set = loadedSets.get(slugifyTextureId(id));
  return set ?? { color: null, diffuse: null, normal: null, roughness: null };
}

export async function preloadColorMapImages(): Promise<void> {
  const ids = [...BUILTIN_TEXTURES.map((t) => t.id), ...userTextures.map((t) => t.id)];
  await Promise.all(ids.map((id) => ensureLoaded(id)));
}

/**
 * Proyección UV de caja en metros: cada vértice se proyecta en el plano perpendicular al eje
 * dominante de su normal, con las medidas reales de la pieza (matriz con escala y giro), y
 * `tileMeters` metros por repetición de la imagen. Así una caja larga no estira la imagen.
 */
export function applyBoxProjectedUv(
  geometry: BufferGeometry,
  matrixOrScale: Matrix4 | number,
  tileMeters = 3
): void {
  const pos = geometry.attributes.position;
  if (!pos) return;
  const nrmAttr = geometry.attributes.normal;
  const m = typeof matrixOrScale === 'number' ? new Matrix4().makeScale(matrixOrScale, matrixOrScale, matrixOrScale) : matrixOrScale;
  const nm = new Matrix3().getNormalMatrix(m);
  const tile = Math.max(0.01, tileMeters);
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(m);
    if (nrmAttr) n.fromBufferAttribute(nrmAttr, i).applyMatrix3(nm).normalize();
    else n.set(0, 1, 0);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    let u: number, v: number;
    if (ay >= ax && ay >= az) { u = p.x; v = p.z; }
    else if (ax >= az) { u = p.z; v = p.y; }
    else { u = p.x; v = p.y; }
    uvs[i * 2] = u / tile;
    uvs[i * 2 + 1] = v / tile;
  }
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
}
