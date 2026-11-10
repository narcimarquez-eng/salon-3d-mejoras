import {
  BufferAttribute,
  BufferGeometry,
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

export function slugifyTextureId(id: string): string {
  return id
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '_');
}

export async function listAllColorMapTextures(): Promise<ColorMapTextureInfo[]> {
  const builtins: ColorMapTextureInfo[] = Object.entries(BUILTIN_SETS).map(([id, b]) => ({
    id,
    name: b.name,
    url: texturesBaseUrl() + b.color,
    license: 'CC0 (Poly Haven)',
    source: 'builtin',
  }));
  return [...builtins, ...userTextures];
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
  loadedSets.delete(id);
  failedIds.delete(id);
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

// Texturas de imagen incluidas en public/textures (CC0). Cada una trae color, normal y rugosidad.
const BUILTIN_SETS: Record<string, { name: string; color: string; normal?: string; roughness?: string }> = {
  cal_blanca: {
    name: 'Cal blanca',
    color: 'cal_blanca_diff_1k.jpg',
    normal: 'cal_blanca_nor_gl_1k.jpg',
    roughness: 'cal_blanca_rough_1k.jpg',
  },
  teja_arcilla: {
    name: 'Teja de arcilla',
    color: 'teja_arcilla_diff_1k.jpg',
    normal: 'teja_arcilla_nor_gl_1k.jpg',
    roughness: 'teja_arcilla_rough_1k.jpg',
  },
};

const loadedSets = new Map<string, ColorMapSet>();
const failedIds = new Set<string>();

function texturesBaseUrl(): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base.endsWith('/') ? base : base + '/'}textures/`;
}

async function loadTexture(url: string, isColor: boolean): Promise<Texture | null> {
  try {
    const tex = await new TextureLoader().loadAsync(url);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.anisotropy = 4;
    if (isColor) tex.colorSpace = SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  } catch {
    return null;
  }
}

async function loadSet(id: string): Promise<void> {
  if (loadedSets.has(id) || failedIds.has(id)) return;
  const base = texturesBaseUrl();
  const user = userTextures.find((t) => t.id === id);
  let set: ColorMapSet | null = null;
  if (user) {
    const color = await loadTexture(user.url, true);
    if (color) set = { color, diffuse: color, normal: null, roughness: null };
  } else if (BUILTIN_SETS[id]) {
    const b = BUILTIN_SETS[id];
    const [color, normal, roughness] = await Promise.all([
      loadTexture(base + b.color, true),
      b.normal ? loadTexture(base + b.normal, false) : Promise.resolve(null),
      b.roughness ? loadTexture(base + b.roughness, false) : Promise.resolve(null),
    ]);
    if (color) set = { color, diffuse: color, normal, roughness };
  } else {
    // Imagen suelta en public/textures/<id>.jpg|png (p. ej. las fotos de una hoja de vistas)
    for (const ext of ['jpg', 'png', 'webp']) {
      const color = await loadTexture(`${base}${id}.${ext}`, true);
      if (color) {
        set = { color, diffuse: color, normal: null, roughness: null };
        break;
      }
    }
  }
  if (set) loadedSets.set(id, set);
  else failedIds.add(id);
}

export function getColorMapSet(id: string): ColorMapSet {
  return (
    loadedSets.get(slugifyTextureId(id)) ?? {
      color: null,
      diffuse: null,
      normal: null,
      roughness: null,
    }
  );
}

/** Carga una imagen pedida tarde (p. ej. con el nombre en una variable). true si ya está. */
export async function ensureColorMapLoaded(id: string): Promise<boolean> {
  const key = slugifyTextureId(id);
  await loadSet(key);
  return loadedSets.has(key);
}

export function isColorMapLoaded(id: string): boolean {
  return loadedSets.has(slugifyTextureId(id));
}

/**
 * Carga en memoria las imágenes que va a pedir un script (`mat.color_map = "..."`), para que
 * el motor las resuelva de forma síncrona. Sin script, carga las incluidas y las del usuario.
 */
export async function preloadColorMapImages(script?: string): Promise<void> {
  const ids = new Set<string>();
  if (script) {
    const re = /\b(?:color_map|textura_imagen|imagen)\s*=\s*["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(script))) ids.add(slugifyTextureId(m[1]));
    // También `mat.color_map = HOJA` con `HOJA = "..."` definido en el script
    const reVar = /\b(?:color_map|textura_imagen|imagen)\s*=\s*([A-Za-z_]\w*)\s*$/gm;
    while ((m = reVar.exec(script))) {
      const def = new RegExp(`^\\s*${m[1]}\\s*=\\s*["']([^"']+)["']`, 'm').exec(script);
      if (def) ids.add(slugifyTextureId(def[1]));
    }
  } else {
    Object.keys(BUILTIN_SETS).forEach((k) => ids.add(k));
    userTextures.forEach((t) => ids.add(t.id));
  }
  await Promise.all([...ids].map((id) => loadSet(id)));
}

/**
 * Proyección de caja en metros: cada vértice toma el plano al que más mira su normal
 * y la imagen se repite cada `tileMeters` metros.
 */
export function applyBoxProjectedUv(
  geometry: BufferGeometry,
  matrixOrScale: Matrix4 | number,
  tileMeters = 3
): void {
  if (!geometry.attributes.position) return;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  const m = typeof matrixOrScale === 'number' ? new Matrix4().makeScale(matrixOrScale, matrixOrScale, matrixOrScale) : matrixOrScale;
  const nm = new Matrix4().extractRotation(m);
  const p = new Vector3();
  const n = new Vector3();
  const t = Math.max(0.05, tileMeters);
  for (let i = 0; i < count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(m);
    n.fromBufferAttribute(nor, i).applyMatrix4(nm);
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    if (ay >= ax && ay >= az) {
      uvs[i * 2] = p.x / t;
      uvs[i * 2 + 1] = p.z / t;
    } else if (ax >= az) {
      uvs[i * 2] = p.z / t;
      uvs[i * 2 + 1] = p.y / t;
    } else {
      uvs[i * 2] = p.x / t;
      uvs[i * 2 + 1] = p.y / t;
    }
  }
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
}

/**
 * Vista de una foto para proyectarla sobre un modelo: el eje por el que mira la cámara
 * ('x', 'y' o 'z' del script), el lado (+1, -1 o 0 = los dos), el rectángulo de la imagen en
 * píxeles (u0, v0, u1, v1; origen arriba a la izquierda) y el rectángulo que ocupa en metros
 * del script (h0, h1 en horizontal y w0, w1 en vertical).
 *   eje 'x' (perfil): horizontal = Y, vertical = Z
 *   eje 'y' (frente o espalda): horizontal = X, vertical = Z
 *   eje 'z' (cenital): horizontal = Y, vertical = X
 * Un 11.º valor opcional es el peso de la vista (1 por defecto): con 1.6 en el perfil, la
 * cenital solo gana en el lomo de verdad y la costura entre ambas sube a donde no se ve.
 */
export type PhotoView =
  | [string, number, number, number, number, number, number, number, number, number]
  | [string, number, number, number, number, number, number, number, number, number, number];

/**
 * Proyecta las vistas de una hoja de fotos sobre la geometría. Cada triángulo usa la vista que
 * mejor lo ve (según su normal suave), así que la geometría se separa en triángulos sueltos;
 * las normales suaves se conservan y quedan marcadas para que nadie las recalcule.
 * Devuelve la geometría nueva (o la misma si ya estaba separada).
 */
export function applyPhotoViewsUv(
  geometry: BufferGeometry,
  matrix: Matrix4,
  views: PhotoView[],
  imageWidth: number,
  imageHeight: number,
  zUp: boolean
): BufferGeometry {
  let geo = geometry;
  if (!geo.attributes.position || views.length === 0) return geo;
  if (geo.index) {
    geo.computeVertexNormals();
    geo = geo.toNonIndexed();
  } else if (!geo.attributes.normal) {
    geo.computeVertexNormals();
  }
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  const nm = new Matrix4().extractRotation(matrix);
  const p = new Vector3();
  const n = new Vector3();
  const toScript = (v: Vector3): [number, number, number] => (zUp ? [v.x, -v.z, v.y] : [v.x, v.y, v.z]);
  const axisIndex = (a: string) => (a === 'x' ? 0 : a === 'y' ? 1 : 2);
  for (let tri = 0; tri + 2 < count; tri += 3) {
    const avg = new Vector3();
    for (let k = 0; k < 3; k++) avg.add(n.fromBufferAttribute(nor, tri + k).applyMatrix4(nm));
    const ns = toScript(avg.normalize());
    let best = -1;
    let bestScore = -1;
    let anyBest = 0;
    let anyScore = -1;
    for (let vi = 0; vi < views.length; vi++) {
      const c = ns[axisIndex(String(views[vi][0]))];
      const sign = Number(views[vi][1]) || 0;
      const weight = views[vi].length > 10 ? Number(views[vi][10]) || 1 : 1;
      const score = Math.abs(c) * weight;
      if (score > anyScore) {
        anyScore = score;
        anyBest = vi;
      }
      if (sign !== 0 && c * sign <= 0) continue;
      if (score > bestScore) {
        bestScore = score;
        best = vi;
      }
    }
    const view = views[best >= 0 ? best : anyBest];
    const ai = axisIndex(String(view[0]));
    const [, , u0, v0, u1, v1, h0, h1, w0, w1] = (view as unknown[]).map(Number);
    for (let k = 0; k < 3; k++) {
      const s = toScript(p.fromBufferAttribute(pos, tri + k).applyMatrix4(matrix));
      const h = ai === 0 ? s[1] : ai === 1 ? s[0] : s[1];
      const w = ai === 2 ? s[0] : s[2];
      const px = u0 + ((h - h0) / (h1 - h0 || 1)) * (u1 - u0);
      const py = v0 + ((w - w0) / (w1 - w0 || 1)) * (v1 - v0);
      uvs[(tri + k) * 2] = px / imageWidth;
      uvs[(tri + k) * 2 + 1] = 1 - py / imageHeight;
    }
  }
  geo.setAttribute('uv', new BufferAttribute(uvs, 2));
  geo.userData.normalesFijas = true;
  return geo;
}
