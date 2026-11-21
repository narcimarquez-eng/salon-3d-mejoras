import * as THREE from 'three';
import { BufferAttribute, BufferGeometry, Matrix4, Texture } from 'three';
import {
  TEXTURE_PRESETS,
  generateProceduralBumpTexture,
  generateProceduralTexture,
  getTexturePresetInfo,
  resolveTexturePatternId,
} from './proceduralTextures';

export interface ColorMapSet {
  color: Texture | null;
  diffuse: Texture | null;
  normal: Texture | null;
  roughness: Texture | null;
  metalness?: Texture | null;
}

export interface PolyHavenTextureEntry {
  id: string;
  name: string;
  categories: string[];
  tags: string[];
  description: string;
  downloadCount: number;
  thumbnailUrl: string;
  proxyThumbnailUrl: string;
  authors: string[];
}

export interface SubTileSpec {
  /** Código corto del mosaico/baldosa en la lámina (ej. "T-01", "T-21") */
  code: string;
  /** ID único para usar directamente en Python: mat.color_map = "suelo_mazmorra_t04" */
  id: string;
  /** Nombre descriptivo en español */
  name: string;
  /** Indica si esta sub-textura es específicamente un mosaico artístico */
  isMosaic?: boolean;
  /** Columna (0..4) y fila (0..1) dentro del atlas */
  col: number;
  row: number;
  /** Rectángulo normalizado [x0, y0, x1, y1] (0..1 desde esquina superior-izquierda) para recorte Canvas sin marco */
  cropRect: [number, number, number, number];
  /** Rango UV [u0, v0, u1, v1] (origen inferior-izquierdo de OpenGL/Blender) */
  uvRect: [number, number, number, number];
}

export interface ColorMapTextureInfo {
  id: string;
  aliases?: string[];
  name: string;
  url: string;
  license: string;
  source: 'builtin' | 'user';
  /** Categoría funcional: mosaico completo, lámina atlas de 10 texturas, sub-textura recortada o PBR */
  kind?: 'mosaic' | 'atlas' | 'subtile' | 'pbr';
  /** Si es un mosaico o contiene mosaicos (para descripciones y mapeo UV 1:1 sin costuras) */
  isMosaic?: boolean;
  /** Estructura de cuadrícula o distribución geométrica (ej. "Mosaico circular + orla", "Cuadrícula 5x3", "Atlas 5x2 (10 tiles)") */
  gridLayout?: string;
  /** Descripción técnica detallada de la textura/mosaico y cómo proyectarla */
  description?: string;
  /** Lista de sub-texturas si pertenece a un catálogo Atlas 5x2 */
  subTiles?: SubTileSpec[];
  /** Si es un sub-tile, ID del catálogo padre */
  parentAtlasId?: string;
}

/**
 * Coordenadas normalizadas exactas de las 10 cajas (5 columnas x 2 filas) en las láminas de catálogo 1376x768.
 * Se aplica un ligero margen interior (inset) para recortar limpiamente el borde gris/negro y los textos inferiores.
 */
const ATLAS_5X2_COLS: Array<[number, number]> = [
  [0.025, 0.191], // Columna 1 (T-01 / T-06)
  [0.218, 0.384], // Columna 2 (T-02 / T-07)
  [0.415, 0.581], // Columna 3 (T-03 / T-08)
  [0.611, 0.777], // Columna 4 (T-04 / T-09)
  [0.807, 0.973], // Columna 5 (T-05 / T-10)
];

const ATLAS_5X2_ROWS: Array<[number, number]> = [
  [0.172, 0.464], // Fila Superior (T-01 a T-05 / T-21 a T-25, texto debajo)
  [0.592, 0.884], // Fila Inferior (T-06 a T-10 / T-26 a T-30, texto debajo)
];

/**
 * Coordenadas para láminas 5x2 donde las etiquetas T-01..T-10 están ENCIMA de cada recuadro
 * (ej. Progresión de Profundidad: Agua y Arena).
 */
const ATLAS_5X2_ROWS_LABELS_ABOVE: Array<[number, number]> = [
  [0.238, 0.548], // Fila Superior (T-01 a T-05, texto arriba)
  [0.654, 0.962], // Fila Inferior (T-06 a T-10, texto arriba)
];

function buildAtlas5x2SubTiles(
  prefix: string,
  items: Array<{ code: string; name: string; isMosaic?: boolean }>,
  customRows?: Array<[number, number]>
): SubTileSpec[] {
  const rowsToUse = customRows || ATLAS_5X2_ROWS;
  return items.map((item, idx) => {
    const col = idx % 5;
    const row = Math.floor(idx / 5);
    const [x0, x1] = ATLAS_5X2_COLS[col] || [0, 1];
    const [y0, y1] = rowsToUse[row] || [0, 1];
    const cleanCode = item.code.toLowerCase().replace(/[^a-z0-9]/g, '');
    return {
      code: item.code,
      id: `${prefix}_${cleanCode}`,
      name: `${item.code}: ${item.name}`,
      isMosaic: item.isMosaic,
      col,
      row,
      cropRect: [x0, y0, x1, y1],
      uvRect: [x0, 1 - y1, x1, 1 - y0],
    };
  });
}

const IGLESIA_GRANADA_TEXTURAS = [
  'ig_fachada_oeste',
  'ig_muro_norte',
  'ig_clerestorio',
  'ig_torre_cana_norte',
  'ig_torre_cana_oeste',
  'ig_torre_campanas',
  'ig_torre_cuerpo_a',
  'ig_torre_cuerpo_b',
  'ig_torre_linterna',
  'ig_balaustrada',
  'ig_portada_sur',
  'ig_cupula',
  'ig_tambor',
  'ig_teja',
];

/**
 * Catálogo oficial integrado con las 9 láminas/mosaicos subidos + sets PBR existentes.
 */
export const BUILTIN_COLOR_MAP_TEXTURES: ColorMapTextureInfo[] = [
  // ============================================================================
  // 1. LOS 3 MOSAICOS Y MURALES ARQUITECTÓNICOS COMPLETOS (FULL-BLEED MOSAICS)
  // ============================================================================
  {
    id: 'mosaico_romano_imperial',
    aliases: [
      'mosaico_romano',
      'mosaico_circular',
      'roseton_romano',
      'gemini_generated_image__5__1ae882e3',
      'Gemini_Generated_Image__5__1ae882e3.jpeg',
    ],
    name: 'Mosaico Romano Imperial (Medallón Circular Estrellado)',
    url: '/assets/aistudio/Gemini_Generated_Image__5__1ae882e3.jpeg',
    license: 'Integrada en Estudio (Mosaico Artístico)',
    source: 'builtin',
    kind: 'mosaic',
    isMosaic: true,
    gridLayout: 'Mosaico concéntrico 1:1 con cenefa en T y losas perimetrales',
    description:
      'Mosaico pavimentario romano/bizantino de teselas con medallón circular central (estrella de 8 puntas rodeada de 8 medallones estrellados menores, olas vitruvianas y trenza guilloche) enmarcado en losas de piedra antigua. Ideal para suelos de templos, patios, salones del trono y plazas (proyección UV plana 0..1 o repeat=1).',
  },
  {
    id: 'mosaico_gotico_carmesi',
    aliases: [
      'mosaico_gotico',
      'mosaico_catedral',
      'bajorrelieve_gotico',
      'gemini_generated_image__4__e9135642',
      'Gemini_Generated_Image__4__e9135642.jpeg',
    ],
    name: 'Mosaico Gótico Carmesí y Basalto (Cuadrícula 5×3)',
    url: '/assets/aistudio/Gemini_Generated_Image__4__e9135642.jpeg',
    license: 'Integrada en Estudio (Mosaico Catedralicio)',
    source: 'builtin',
    kind: 'mosaic',
    isMosaic: true,
    gridLayout: 'Mosaico en cuadrícula de 5 columnas × 3 filas de losas',
    description:
      'Mosaico y bajorrelieve gótico sobre losas de basalto negro dispuestas en cuadrícula 5×3, con rosetón central calado, estrellas de 8 puntas sobre pigmento rojo carmesí desgastado y tracería ojival con cuadrifolios. Perfecto para altares, criptas, suelos de mazmorra señorial y muros de catedral.',
  },
  {
    id: 'mosaico_muro_nazari',
    aliases: [
      'mosaico_nazari',
      'mosaico_andalusi',
      'muro_nazari',
      'arcos_herradura_mosaico',
      'gemini_generated_image__1__7c26b354',
      'Gemini_Generated_Image__1__7c26b354.jpeg',
    ],
    name: 'Mural y Mosaico Nazarí con Triple Arco y Zócalo (Cuadrícula 6×3)',
    url: '/assets/aistudio/Gemini_Generated_Image__1__7c26b354.jpeg',
    license: 'Integrada en Estudio (Mural y Alicatado Nazarí)',
    source: 'builtin',
    kind: 'mosaic',
    isMosaic: true,
    gridLayout: 'Mural arquitectónico en cuadrícula de 6 columnas × 3 filas',
    description:
      'Mural arquitectónico hispanomusulmán / nazarí dividido en rejilla 6×3: las 2 filas superiores contienen triple arco de herradura polilobulado con yeserías epigráficas y ladrillo visto deteriorado; la fila inferior (v=0.00..0.34) es un zócalo de mosaico cerámico alicatado con lacería estrellada azul, ocre y verde.',
  },

  // ============================================================================
  // 2. LOS 6 CATÁLOGOS / ATLAS DE 10 SUB-TEXTURAS (5 COLUMNAS × 2 FILAS)
  // ============================================================================
  {
    id: 'catalogo_suelos_mazmorra',
    aliases: [
      'suelos_mazmorra',
      'atlas_suelos_mazmorra',
      'gemini_generated_image__6__3481a3a2',
      'Gemini_Generated_Image__6__3481a3a2.jpeg',
    ],
    name: 'Catálogo: Suelos de Mazmorra (T-01 a T-10 • Incluye Mosaico T-04)',
    url: '/assets/aistudio/Gemini_Generated_Image__6__3481a3a2.jpeg',
    license: 'Integrada en Estudio (Atlas 5×2 — 512×512 px/tile)',
    source: 'builtin',
    kind: 'atlas',
    isMosaic: true,
    gridLayout: 'Atlas 5×2 (10 sub-texturas recortables automáticamente: suelo_mazmorra_t01 .. t10)',
    description:
      'Catálogo de 10 suelos de mazmorra: T-01 Losas Desgastadas, T-02 Losas con Musgo, T-03 Baldosas Agrietadas, T-04 Mosaico Desgastado (mosaico rosetón antiguo), T-05 Tierra y Cascotes, T-06 Adoquines Antiguos, T-07 Baldosas de Sillar, T-08 Rocas y Gravilla, T-09 Suelo con Charcos, T-10 Barro y Detritus.',
    subTiles: buildAtlas5x2SubTiles('suelo_mazmorra', [
      { code: 'T-01', name: 'Losas Desgastadas' },
      { code: 'T-02', name: 'Losas con Musgo' },
      { code: 'T-03', name: 'Baldosas Agrietadas' },
      { code: 'T-04', name: 'Mosaico Desgastado (Rosetón)', isMosaic: true },
      { code: 'T-05', name: 'Tierra y Cascotes' },
      { code: 'T-06', name: 'Adoquines Antiguos' },
      { code: 'T-07', name: 'Baldosas de Sillar' },
      { code: 'T-08', name: 'Rocas y Gravilla' },
      { code: 'T-09', name: 'Suelo con Charcos' },
      { code: 'T-10', name: 'Barro y Detritus' },
    ]),
  },
  {
    id: 'catalogo_paredes_mazmorra',
    aliases: [
      'paredes_mazmorra',
      'atlas_paredes_mazmorra',
      'gemini_generated_image__2__21d9a1af',
      'Gemini_Generated_Image__2__21d9a1af.jpeg',
    ],
    name: 'Catálogo: Paredes de Mazmorra (T-01 a T-10 • Incluye Mosaicos T-03 y T-08)',
    url: '/assets/aistudio/Gemini_Generated_Image__2__21d9a1af.jpeg',
    license: 'Integrada en Estudio (Atlas 5×2 — 512×512 px/tile)',
    source: 'builtin',
    kind: 'atlas',
    isMosaic: true,
    gridLayout: 'Atlas 5×2 (10 sub-texturas recortables automáticamente: pared_mazmorra_t01 .. t10)',
    description:
      'Catálogo de 10 muros de mazmorra: T-01 Ladrillos Desgastados, T-02 Ladrillos con Musgo, T-03 Mosaicos Antiguos (azulejería en damero), T-04 Mampostería Irregular, T-05 Piedra con Enredaderas, T-06 Piedra de Calabozo, T-07 Sillares Ruinosos, T-08 Mosaico Decorativo (fresco mural geométrico), T-09 Roca Excavada, T-10 Pared Chamuscada.',
    subTiles: buildAtlas5x2SubTiles('pared_mazmorra', [
      { code: 'T-01', name: 'Ladrillos Desgastados' },
      { code: 'T-02', name: 'Ladrillos con Musgo' },
      { code: 'T-03', name: 'Mosaicos Antiguos (Azulejería)', isMosaic: true },
      { code: 'T-04', name: 'Mampostería Irregular' },
      { code: 'T-05', name: 'Piedra con Enredaderas' },
      { code: 'T-06', name: 'Piedra de Calabozo' },
      { code: 'T-07', name: 'Sillares Ruinosos' },
      { code: 'T-08', name: 'Mosaico Decorativo Mural', isMosaic: true },
      { code: 'T-09', name: 'Roca Excavada' },
      { code: 'T-10', name: 'Pared Chamuscada' },
    ]),
  },
  {
    id: 'catalogo_columnas_mazmorra',
    aliases: [
      'columnas_mazmorra',
      'atlas_columnas_mazmorra',
      'gemini_generated_image__3__1fb7fe52',
      'Gemini_Generated_Image__3__1fb7fe52.jpeg',
    ],
    name: 'Catálogo: Columnas de Mazmorra (T-01 a T-10)',
    url: '/assets/aistudio/Gemini_Generated_Image__3__1fb7fe52.jpeg',
    license: 'Integrada en Estudio (Atlas 5×2 — 512×512 px/tile)',
    source: 'builtin',
    kind: 'atlas',
    isMosaic: false,
    gridLayout: 'Atlas 5×2 (10 sub-texturas recortables automáticamente: columna_mazmorra_t01 .. t10)',
    description:
      'Catálogo de 10 fustes y columnas: T-01 Fuste de Ladrillos, T-02 Columna con Musgo, T-03 Grabados y Runas, T-04 Piedra Arruinada, T-05 Espiral Medieval, T-06 Con Cadenas, T-07 Base y Capitel, T-08 Refuerzos de Hierro, T-09 Raíces de Mazmorra, T-10 Bajorrelieve Gótico.',
    subTiles: buildAtlas5x2SubTiles('columna_mazmorra', [
      { code: 'T-01', name: 'Fuste de Ladrillos' },
      { code: 'T-02', name: 'Columna con Musgo' },
      { code: 'T-03', name: 'Grabados y Runas' },
      { code: 'T-04', name: 'Piedra Arruinada' },
      { code: 'T-05', name: 'Espiral Medieval' },
      { code: 'T-06', name: 'Con Cadenas' },
      { code: 'T-07', name: 'Base y Capitel' },
      { code: 'T-08', name: 'Refuerzos de Hierro' },
      { code: 'T-09', name: 'Raíces de Mazmorra' },
      { code: 'T-10', name: 'Bajorrelieve Gótico' },
    ]),
  },
  {
    id: 'catalogo_tejados',
    aliases: [
      'texturas_tejados',
      'atlas_tejados',
      'gemini_generated_image__9__d05da0a2',
      'Gemini_Generated_Image__9__d05da0a2.jpeg',
    ],
    name: 'Catálogo: Texturas de Tejados (T-01 a T-10)',
    url: '/assets/aistudio/Gemini_Generated_Image__9__d05da0a2.jpeg',
    license: 'Integrada en Estudio (Atlas 5×2 — 512×512 px/tile)',
    source: 'builtin',
    kind: 'atlas',
    isMosaic: false,
    gridLayout: 'Atlas 5×2 (10 sub-texturas recortables automáticamente: tejado_t01 .. t10)',
    description:
      'Catálogo de 10 cubiertas arquitectónicas: T-01 Teja Árabe Terracota, T-02 Pizarra Negra, T-03 Tejamanil de Madera, T-04 Teja Rústica con Musgo, T-05 Chapa Metálica Oxidada, T-06 Teja Asfáltica Gris, T-07 Cubierta de Paja/Brezo, T-08 Teja Plana Cerámica, T-09 Teja Escama de Pez, T-10 Laja de Piedra con Liquen.',
    subTiles: buildAtlas5x2SubTiles('tejado', [
      { code: 'T-01', name: 'Teja Árabe Terracota' },
      { code: 'T-02', name: 'Pizarra Negra Escalonada' },
      { code: 'T-03', name: 'Tejamanil de Madera' },
      { code: 'T-04', name: 'Teja Rústica con Musgo' },
      { code: 'T-05', name: 'Chapa Corrugada Oxidada' },
      { code: 'T-06', name: 'Teja Asfáltica Antracita' },
      { code: 'T-07', name: 'Cubierta de Paja Rústica' },
      { code: 'T-08', name: 'Teja Plana Cerámica' },
      { code: 'T-09', name: 'Teja Escama (Cola de Castor)' },
      { code: 'T-10', name: 'Laja de Piedra con Liquen' },
    ]),
  },
  {
    id: 'catalogo_hierbas',
    aliases: [
      'texturas_hierbas',
      'atlas_hierbas',
      'gemini_generated_image__8__fcd86848',
      'Gemini_Generated_Image__8__fcd86848.jpeg',
    ],
    name: 'Catálogo: Texturas de Hierbas y Biomas (T-01 a T-10)',
    url: '/assets/aistudio/Gemini_Generated_Image__8__fcd86848.jpeg',
    license: 'Integrada en Estudio (Atlas 5×2 — 512×512 px/tile)',
    source: 'builtin',
    kind: 'atlas',
    isMosaic: false,
    gridLayout: 'Atlas 5×2 (10 sub-texturas recortables automáticamente: hierba_t01 .. t10)',
    description:
      'Catálogo de 10 suelos naturales: T-01 Césped Tupido, T-02 Pradera de Tréboles, T-03 Pasto Seco Dorado, T-04 Tierra Húmeda con Hierba, T-05 Musgo Esponjoso, T-06 Hierba Alta Salvaje, T-07 Suelo Forestal con Hojas, T-08 Terreno Árido Pedregoso, T-09 Pradera con Margaritas, T-10 Hierba Escarchada Helada.',
    subTiles: buildAtlas5x2SubTiles('hierba', [
      { code: 'T-01', name: 'Césped Verde Tupido' },
      { code: 'T-02', name: 'Pradera de Tréboles' },
      { code: 'T-03', name: 'Pasto Seco Dorado' },
      { code: 'T-04', name: 'Tierra Húmeda con Hierba' },
      { code: 'T-05', name: 'Musgo Esponjoso de Bosque' },
      { code: 'T-06', name: 'Hierba Alta Salvaje' },
      { code: 'T-07', name: 'Suelo Forestal con Hojas' },
      { code: 'T-08', name: 'Terreno Árido Pedregoso' },
      { code: 'T-09', name: 'Pradera Florida con Margaritas' },
      { code: 'T-10', name: 'Hierba Escarchada / Helada' },
    ]),
  },
  {
    id: 'catalogo_agua_cristalina',
    aliases: [
      'agua_cristalina',
      'atlas_agua',
      'gemini_generated_image__7__6ea2e795',
      'Gemini_Generated_Image__7__6ea2e795.jpeg',
    ],
    name: 'Catálogo: Agua Cristalina y Lechos Fluviales (T-21 a T-30)',
    url: '/assets/aistudio/Gemini_Generated_Image__7__6ea2e795.jpeg',
    license: 'Integrada en Estudio (Atlas 5×2 — 512×512 px/tile)',
    source: 'builtin',
    kind: 'atlas',
    isMosaic: false,
    gridLayout: 'Atlas 5×2 (10 sub-texturas recortables automáticamente: agua_t21 .. t30)',
    description:
      'Catálogo de 10 superficies acuáticas: T-21 Orilla Turquesa, T-22 Cenote Submarino, T-23 Arroyo de Cantos Rodados, T-24 Cáusticas Solares con Conchas, T-25 Laguna Esmeralda, T-26 Guijarros de Río, T-27 Ola en Playa de Arena, T-28 Arrecife Coralino, T-29 Riachuelo con Plantas Acuáticas, T-30 Manantial con Burbujas.',
    subTiles: buildAtlas5x2SubTiles('agua', [
      { code: 'T-21', name: 'Orilla Turquesa y Arena Blanca' },
      { code: 'T-22', name: 'Cenote / Cueva Submarina' },
      { code: 'T-23', name: 'Arroyo con Cantos Rodados' },
      { code: 'T-24', name: 'Cáusticas Solares y Conchas' },
      { code: 'T-25', name: 'Laguna Esmeralda Caliza' },
      { code: 'T-26', name: 'Lecho de Guijarros Suaves' },
      { code: 'T-27', name: 'Rompiente de Ola en Playa' },
      { code: 'T-28', name: 'Arrecife Coralino Somero' },
      { code: 'T-29', name: 'Riachuelo con Flora Acuática' },
      { code: 'T-30', name: 'Manantial Burbujeante' },
    ]),
  },
  {
    id: 'catalogo_progresion_agua_arena',
    aliases: [
      'progresion_agua_arena',
      'agua_profundidad',
      'atlas_agua_arena',
      'gemini_generated_image_hsj3lhsj3lhsj3lh__1__668c886b',
      'Gemini_Generated_Image_hsj3lhsj3lhsj3lh__1__668c886b.jfif',
    ],
    name: 'Catálogo: Progresión de Profundidad Agua y Arena (T-01 a T-10 • Tileables)',
    url: '/assets/aistudio/Gemini_Generated_Image_hsj3lhsj3lhsj3lh__1__668c886b.jfif',
    license: 'Integrada en Estudio (Atlas 5×2 — 512×512 px Tileable)',
    source: 'builtin',
    kind: 'atlas',
    isMosaic: false,
    gridLayout: 'Atlas 5×2 Continuo/Tileable (10 sub-texturas por profundidad: agua_profundidad_t01 .. t10)',
    description:
      'Catálogo de 10 texturas continuas (tileables) de transición batimétrica desde la orilla hasta alta mar: T-01 Arena y Agua Playa (0.5m), T-02 Transición Playa (1m), T-03 Agua Poco Profunda (2m), T-04 Agua Turquesa Media (3m), T-05 Transición Profundidad (5m), T-06 Arena Difuminada (8m), T-07 Agua Profunda Sin Fondo (12m), T-08 Azul Marino Inicial (15m), T-09 Agua Azul Marina (20m), T-10 Alta Mar Profunda (30m+).',
    subTiles: buildAtlas5x2SubTiles(
      'agua_profundidad',
      [
        { code: 'T-01', name: 'Arena y Agua Playa (0.5m)' },
        { code: 'T-02', name: 'Transición Playa (1m)' },
        { code: 'T-03', name: 'Agua Poco Profunda (2m)' },
        { code: 'T-04', name: 'Agua Turquesa Media (3m)' },
        { code: 'T-05', name: 'Transición Profundidad (5m)' },
        { code: 'T-06', name: 'Arena Difuminada (8m)' },
        { code: 'T-07', name: 'Agua Profunda Sin Fondo (12m)' },
        { code: 'T-08', name: 'Azul Marino Inicial (15m)' },
        { code: 'T-09', name: 'Agua Azul Marina (20m)' },
        { code: 'T-10', name: 'Alta Mar Profunda (30m+)' },
      ],
      ATLAS_5X2_ROWS_LABELS_ABOVE
    ),
  },

  // ============================================================================
  // 3. TEXTURAS PBR 1K EXISTENTES EN /public/textures
  // ============================================================================
  {
    id: 'cal_blanca',
    aliases: ['encalado', 'estuco_blanco'],
    name: 'Cal Blanca Mediterránea 1K (Color + Normal + Roughness)',
    url: '/textures/cal_blanca_diff_1k.jpg',
    license: 'CC0 Public Domain (1K PBR)',
    source: 'builtin',
    kind: 'pbr',
    isMosaic: false,
    gridLayout: 'Seamless 1:1 PBR (Difuso + Normal + Rugosidad)',
    description: 'Muro encalado blanco tradicional con mapas PBR de normales y rugosidad.',
  },
  {
    id: 'teja_arcilla',
    aliases: ['teja_roja_pbr'],
    name: 'Teja de Arcilla 1K (Color + Normal + Roughness)',
    url: '/textures/teja_arcilla_diff_1k.jpg',
    license: 'CC0 Public Domain (1K PBR)',
    source: 'builtin',
    kind: 'pbr',
    isMosaic: false,
    gridLayout: 'Seamless 1:1 PBR (Difuso + Normal + Rugosidad)',
    description: 'Tejado de arcilla cocida con mapas PBR de normales y rugosidad.',
  },
  // Iglesia de Nuestra Señora de la Granada (Moguer): recortes enderezados de fotos del usuario
  // (iglesia_granada/hacer_texturas.py). Se proyectan con UV propias desde el script.
  ...IGLESIA_GRANADA_TEXTURAS.map(
    (id): ColorMapTextureInfo => ({
      id,
      name: `Iglesia de la Granada: ${id.replace(/^ig_/, '').replace(/_/g, ' ')}`,
      url: `/assets/iglesia_granada/${id}.jpg`,
      license: 'Fotos del usuario',
      source: 'builtin',
      kind: 'mosaic',
      isMosaic: true,
      description: 'Recorte de foto enderezado para la Iglesia de la Granada de Moguer.',
    })
  ),
];

const userTextures: ColorMapTextureInfo[] = [];
const loadedTextureCache = new Map<string, THREE.Texture>();
const loadedImageElements = new Map<string, HTMLImageElement>();

export function slugifyTextureId(id: string): string {
  return String(id || '')
    .toLowerCase()
    .trim()
    .replace(/^.*[\\/]/, '')
    .replace(/\.(jpeg|jpg|png|webp|jfif)$/i, '')
    .replace(/[^a-z0-9_]/g, '_');
}

/**
 * Busca una textura integrada o de usuario, o bien una sub-textura de un Atlas (ej. "suelo_mazmorra_t04" o "catalogo_tejados:T-01").
 */
export function findCatalogTextureOrSubTile(rawIdOrName: string): {
  info: ColorMapTextureInfo;
  subTile?: SubTileSpec;
} | null {
  if (!rawIdOrName) return null;
  const trimmed = String(rawIdOrName).trim();

  // Sintaxis explícita "catalogo_id:T-04" o "catalogo_id#T-04"
  if (trimmed.includes(':') || trimmed.includes('#')) {
    const [parentRaw, tileRaw] = trimmed.split(/[:#]/);
    const parentMatch = findCatalogTextureOrSubTile(parentRaw);
    if (parentMatch?.info?.subTiles) {
      const normTile = tileRaw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const sub = parentMatch.info.subTiles.find(
        (s) => s.code.replace(/[^A-Z0-9]/g, '') === normTile || slugifyTextureId(s.id) === slugifyTextureId(tileRaw)
      );
      if (sub) return { info: parentMatch.info, subTile: sub };
    }
  }

  const slug = slugifyTextureId(trimmed);

  // 1. Buscar en texturas subidas por el usuario
  const userHit = userTextures.find(
    (u) => u.id === slug || slugifyTextureId(u.name) === slug
  );
  if (userHit) return { info: userHit };

  // 2. Buscar en texturas principales y sus alias
  for (const item of BUILTIN_COLOR_MAP_TEXTURES) {
    if (
      item.id === slug ||
      slugifyTextureId(item.url) === slug ||
      item.aliases?.some((a) => slugifyTextureId(a) === slug)
    ) {
      return { info: item };
    }
  }

  // 3. Buscar en las 60 sub-texturas de los 6 catálogos Atlas 5x2
  // Soporta también alias como "agua_t01" -> "agua_t21"
  const normalizedAguaAlias = slug.replace(/^agua_t0([1-9])$/, (_m, d) => `agua_t2${d}`).replace(/^agua_t10$/, 'agua_t30');
  for (const item of BUILTIN_COLOR_MAP_TEXTURES) {
    if (!item.subTiles) continue;
    for (const sub of item.subTiles) {
      if (sub.id === slug || sub.id === normalizedAguaAlias) {
        return { info: item, subTile: sub };
      }
    }
  }

  return null;
}

/**
 * Crea una textura Three.js recortando en un Canvas HTML5 la sub-textura exacta (512x512)
 * a partir de una imagen de catálogo Atlas 5x2, eliminando bordes y etiquetas de texto.
 */
function createSubTileCanvasTexture(
  parentUrl: string,
  subTile: SubTileSpec,
  cacheKey: string
): THREE.Texture {
  const existing = loadedTextureCache.get(cacheKey);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#555555';
    ctx.fillRect(0, 0, 512, 512);
  }

  const canvasTex = new THREE.CanvasTexture(canvas);
  canvasTex.colorSpace = THREE.SRGBColorSpace;
  canvasTex.wrapS = THREE.RepeatWrapping;
  canvasTex.wrapT = THREE.RepeatWrapping;
  canvasTex.needsUpdate = true;
  loadedTextureCache.set(cacheKey, canvasTex);

  const drawFromImg = (img: HTMLImageElement) => {
    if (!ctx || !img.naturalWidth || !img.naturalHeight) return;
    const [x0, y0, x1, y1] = subTile.cropRect;
    const sx = Math.round(x0 * img.naturalWidth);
    const sy = Math.round(y0 * img.naturalHeight);
    const sw = Math.max(1, Math.round((x1 - x0) * img.naturalWidth));
    const sh = Math.max(1, Math.round((y1 - y0) * img.naturalHeight));
    ctx.clearRect(0, 0, 512, 512);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 512, 512);
    canvasTex.needsUpdate = true;
    // Registrar también dataURL en window.uploadedTextures para compatibilidad con TextureLoader
    if (typeof window !== 'undefined') {
      try {
        if (!window.uploadedTextures) window.uploadedTextures = {};
        window.uploadedTextures[subTile.id] = canvas.toDataURL('image/jpeg', 0.92);
      } catch {
        // Ignorar errores de canvas tainted si ocurrieran
      }
    }
  };

  const cachedImg = loadedImageElements.get(parentUrl);
  if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
    drawFromImg(cachedImg);
  } else if (typeof Image !== 'undefined') {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      loadedImageElements.set(parentUrl, img);
      drawFromImg(img);
    };
    img.src = parentUrl;
  }

  return canvasTex;
}

function loadOrGetThreeTexture(url: string, isSRGB: boolean = true): THREE.Texture {
  const cacheKey = `${url}_${isSRGB ? 'srgb' : 'lin'}`;
  const cached = loadedTextureCache.get(cacheKey);
  if (cached) return cached;

  const loader = new THREE.TextureLoader();
  const tex = loader.load(url, (loaded) => {
    loaded.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    loaded.wrapS = THREE.RepeatWrapping;
    loaded.wrapT = THREE.RepeatWrapping;
    loaded.needsUpdate = true;
    if (loaded.image instanceof HTMLImageElement) {
      loadedImageElements.set(url, loaded.image);
    }
  });
  tex.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  loadedTextureCache.set(cacheKey, tex);
  return tex;
}

export async function listAllColorMapTextures(): Promise<ColorMapTextureInfo[]> {
  return [...userTextures, ...BUILTIN_COLOR_MAP_TEXTURES];
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
    kind: 'mosaic',
    description: 'Textura personalizada subida por el usuario en esta sesión.',
  };
  const existingIdx = userTextures.findIndex((t) => t.id === id);
  if (existingIdx >= 0) {
    userTextures[existingIdx] = info;
  } else {
    userTextures.push(info);
  }
  if (typeof window !== 'undefined') {
    if (!window.uploadedTextures) window.uploadedTextures = {};
    window.uploadedTextures[file.name] = url;
    window.uploadedTextures[id] = url;
    window.uploadedTextures['default'] = url;
  }
  loadOrGetThreeTexture(url, true);
  return info;
}

export async function removeUserTexture(id: string): Promise<void> {
  const idx = userTextures.findIndex((t) => t.id === id);
  if (idx >= 0) {
    userTextures.splice(idx, 1);
  }
}

const polyHavenSetCache = new Map<string, ColorMapSet>();
const polyHavenInFlightCache = new Map<string, Promise<ColorMapSet>>();

/**
 * Analiza especificaciones de Poly Haven como:
 * "polyhaven:brick_wall_001", "polyhaven:brick_wall_001@2k", "ph:wood_planks"
 */
export function parsePolyHavenSpec(
  raw: string
): { assetId: string; resolution: '1k' | '2k'; cacheKey: string } | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const match = trimmed.match(/^(?:polyhaven|poly_haven|ph)\s*[:/]\s*([a-zA-Z0-9_-]+)(?:@(1k|2k))?$/i);
  if (!match) return null;
  const assetId = match[1].toLowerCase();
  const resolution: '1k' | '2k' = match[2]?.toLowerCase() === '2k' ? '2k' : '1k';
  return {
    assetId,
    resolution,
    cacheKey: `polyhaven:${assetId}@${resolution}`,
  };
}

/**
 * Consulta la API del servidor (/api/polyhaven/textures) para buscar entre las 871+ texturas CC0 de Poly Haven.
 */
export async function searchPolyHavenTextures(
  query: string = '',
  category: string = 'all',
  limit: number = 36
): Promise<{ total: number; totalCatalog: number; items: PolyHavenTextureEntry[] }> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (category && category !== 'all') params.set('category', category);
  params.set('limit', String(limit));
  const res = await fetch(`/api/polyhaven/textures?${params.toString()}`);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Error consultando Poly Haven (${res.status})`);
  }
  return res.json();
}

function loadThreeTextureAsync(url: string, isSRGB: boolean): Promise<THREE.Texture | null> {
  const cacheKey = `${url}_${isSRGB ? 'srgb' : 'lin'}`;
  const cached = loadedTextureCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (loaded) => {
        loaded.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.wrapT = THREE.RepeatWrapping;
        loaded.anisotropy = 8;
        loaded.needsUpdate = true;
        loadedTextureCache.set(cacheKey, loaded);
        resolve(loaded);
      },
      undefined,
      () => resolve(null)
    );
  });
}

/**
 * Descarga y prepara el set PBR completo (Diffuse sRGB + Normal GL + Roughness + Metalness)
 * de cualquier textura CC0 de Poly Haven a través del proxy same-origin /api/polyhaven.
 */
export async function loadPolyHavenColorMapSet(
  assetIdOrSpec: string,
  resolutionOverride?: '1k' | '2k'
): Promise<ColorMapSet> {
  const parsed = parsePolyHavenSpec(assetIdOrSpec);
  const assetId = (parsed ? parsed.assetId : String(assetIdOrSpec).trim().toLowerCase()).replace(
    /[^a-z0-9_-]/g,
    ''
  );
  const resolution: '1k' | '2k' = resolutionOverride || parsed?.resolution || '1k';
  const cacheKey = `polyhaven:${assetId}@${resolution}`;

  const cached = polyHavenSetCache.get(cacheKey);
  if (cached) return cached;

  const existingPromise = polyHavenInFlightCache.get(cacheKey);
  if (existingPromise) return existingPromise;

  const task = (async (): Promise<ColorMapSet> => {
    const res = await fetch(
      `/api/polyhaven/files/${encodeURIComponent(assetId)}?res=${encodeURIComponent(resolution)}`
    );
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `No se pudo cargar "${assetId}" de Poly Haven`);
    }
    const data = (await res.json()) as {
      maps: {
        diffuse: string | null;
        normal: string | null;
        roughness: string | null;
        metalness: string | null;
      };
    };

    const [diffuseTex, normalTex, roughTex, metalTex] = await Promise.all([
      data.maps.diffuse ? loadThreeTextureAsync(data.maps.diffuse, true) : Promise.resolve(null),
      data.maps.normal ? loadThreeTextureAsync(data.maps.normal, false) : Promise.resolve(null),
      data.maps.roughness
        ? loadThreeTextureAsync(data.maps.roughness, false)
        : Promise.resolve(null),
      data.maps.metalness
        ? loadThreeTextureAsync(data.maps.metalness, false)
        : Promise.resolve(null),
    ]);

    const resultSet: ColorMapSet = {
      color: diffuseTex,
      diffuse: diffuseTex,
      normal: normalTex,
      roughness: roughTex,
      metalness: metalTex,
    };
    polyHavenSetCache.set(cacheKey, resultSet);
    // Registrar también por clave sin @res para resoluciones rápidas
    polyHavenSetCache.set(`polyhaven:${assetId}`, resultSet);
    return resultSet;
  })();

  polyHavenInFlightCache.set(cacheKey, task);
  try {
    return await task;
  } finally {
    polyHavenInFlightCache.delete(cacheKey);
  }
}

export function getColorMapSet(id: string): ColorMapSet {
  const phParsed = parsePolyHavenSpec(id);
  if (phParsed) {
    const cachedPh =
      polyHavenSetCache.get(phParsed.cacheKey) ||
      polyHavenSetCache.get(`polyhaven:${phParsed.assetId}`);
    if (cachedPh) return cachedPh;
  }

  const match = findCatalogTextureOrSubTile(id);
  if (!match) {
    return {
      color: null,
      diffuse: null,
      normal: null,
      roughness: null,
      metalness: null,
    };
  }

  const { info, subTile } = match;
  if (subTile) {
    const subTex = createSubTileCanvasTexture(info.url, subTile, `subtile_${subTile.id}`);
    return {
      color: subTex,
      diffuse: subTex,
      normal: null,
      roughness: null,
      metalness: null,
    };
  }

  const colorTex = loadOrGetThreeTexture(info.url, true);
  let normalTex: THREE.Texture | null = null;
  let roughTex: THREE.Texture | null = null;

  if (info.id === 'cal_blanca') {
    normalTex = loadOrGetThreeTexture('/textures/cal_blanca_nor_gl_1k.jpg', false);
    roughTex = loadOrGetThreeTexture('/textures/cal_blanca_rough_1k.jpg', false);
  } else if (info.id === 'teja_arcilla') {
    normalTex = loadOrGetThreeTexture('/textures/teja_arcilla_nor_gl_1k.jpg', false);
    roughTex = loadOrGetThreeTexture('/textures/teja_arcilla_rough_1k.jpg', false);
  }

  return {
    color: colorTex,
    diffuse: colorTex,
    normal: normalTex,
    roughness: roughTex,
    metalness: null,
  };
}

export async function preloadColorMapImages(): Promise<void> {
  if (typeof Image === 'undefined') return;
  const promises = BUILTIN_COLOR_MAP_TEXTURES.map(
    (item) =>
      new Promise<void>((resolve) => {
        if (loadedImageElements.has(item.url)) {
          resolve();
          return;
        }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          loadedImageElements.set(item.url, img);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = item.url;
      })
  );
  await Promise.all(promises);
}

/**
 * Proyección UV triplanar / caja con matriz o escala en metros, respetando UVs personalizadas.
 */
export function applyBoxProjectedUv(
  geometry: BufferGeometry,
  matrixOrScale: Matrix4 | number,
  tileMeters: number = 3
): void {
  if (!geometry.attributes.position) return;
  if (geometry.attributes.uv && geometry.userData?.hasCustomUV) return;
  const pos = geometry.attributes.position;
  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }
  const norm = geometry.attributes.normal;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  const invTile = 1 / Math.max(0.1, tileMeters || 3);
  const scale = typeof matrixOrScale === 'number' ? matrixOrScale * invTile : invTile;

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i) * scale;
    const y = pos.getY(i) * scale;
    const z = pos.getZ(i) * scale;
    const nx = norm ? Math.abs(norm.getX(i)) : 0;
    const ny = norm ? Math.abs(norm.getY(i)) : 1;
    const nz = norm ? Math.abs(norm.getZ(i)) : 0;
    if (ny >= nx && ny >= nz) {
      uvs[i * 2] = x + 0.5;
      uvs[i * 2 + 1] = z + 0.5;
    } else if (nx >= ny && nx >= nz) {
      uvs[i * 2] = z + 0.5;
      uvs[i * 2 + 1] = y + 0.5;
    } else {
      uvs[i * 2] = x + 0.5;
      uvs[i * 2 + 1] = y + 0.5;
    }
  }
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
}

/**
 * Proyecta coordenadas UV específicas para Mosaicos completos, Celdas de Cuadrícula (ej. 5x3 o 6x3)
 * o Sub-Texturas de un Atlas 5x2 sobre un BufferGeometry.
 */
export function applyMosaicUvProjection(
  geometry: BufferGeometry,
  options?: {
    projection?: 'FLAT' | 'BOX' | 'CYLINDER';
    repeat?: number;
    uvRect?: [number, number, number, number];
  }
): void {
  const pos = geometry.attributes.position;
  if (!pos || pos.count === 0) return;
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  if (!bb) return;

  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }
  const norm = geometry.attributes.normal;

  const spanX = Math.max(1e-5, bb.max.x - bb.min.x);
  const spanY = Math.max(1e-5, bb.max.y - bb.min.y);
  const spanZ = Math.max(1e-5, bb.max.z - bb.min.z);

  const proj = (options?.projection || 'FLAT').toUpperCase();
  const repeat = Math.max(0.1, Number(options?.repeat ?? 1));
  const [u0, v0, u1, v1] = options?.uvRect || [0, 0, 1, 1];
  const uSpan = u1 - u0;
  const vSpan = v1 - v0;

  const uvs = new Float32Array(pos.count * 2);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let rawU = 0;
    let rawV = 0;

    if (proj === 'CYLINDER') {
      const cx = (bb.min.x + bb.max.x) * 0.5;
      const cz = (bb.min.z + bb.max.z) * 0.5;
      rawU = (Math.atan2(z - cz, x - cx) / (Math.PI * 2) + 0.5) * repeat;
      rawV = ((y - bb.min.y) / spanY) * repeat;
    } else if (proj === 'BOX') {
      const nx = norm ? Math.abs(norm.getX(i)) : 0;
      const ny = norm ? Math.abs(norm.getY(i)) : 1;
      const nz = norm ? Math.abs(norm.getZ(i)) : 0;
      if (ny >= nx && ny >= nz) {
        rawU = ((x - bb.min.x) / spanX) * repeat;
        rawV = (1 - (z - bb.min.z) / spanZ) * repeat;
      } else if (nx >= ny && nx >= nz) {
        rawU = ((z - bb.min.z) / spanZ) * repeat;
        rawV = ((y - bb.min.y) / spanY) * repeat;
      } else {
        rawU = ((x - bb.min.x) / spanX) * repeat;
        rawV = ((y - bb.min.y) / spanY) * repeat;
      }
    } else {
      // FLAT: Detecta si la geometría es horizontal (suelo) o vertical (muro)
      if (spanY < spanZ * 0.35 && spanY < spanX * 0.35) {
        rawU = ((x - bb.min.x) / spanX) * repeat;
        rawV = (1 - (z - bb.min.z) / spanZ) * repeat;
      } else if (spanZ < spanX * 0.35 && spanZ < spanY * 0.35) {
        rawU = ((x - bb.min.x) / spanX) * repeat;
        rawV = ((y - bb.min.y) / spanY) * repeat;
      } else if (spanX < spanZ * 0.35 && spanX < spanY * 0.35) {
        rawU = ((z - bb.min.z) / spanZ) * repeat;
        rawV = ((y - bb.min.y) / spanY) * repeat;
      } else {
        const nx = norm ? Math.abs(norm.getX(i)) : 0;
        const ny = norm ? Math.abs(norm.getY(i)) : 1;
        const nz = norm ? Math.abs(norm.getZ(i)) : 0;
        if (ny >= nx && ny >= nz) {
          rawU = ((x - bb.min.x) / spanX) * repeat;
          rawV = (1 - (z - bb.min.z) / spanZ) * repeat;
        } else if (nx >= ny && nx >= nz) {
          rawU = ((z - bb.min.z) / spanZ) * repeat;
          rawV = ((y - bb.min.y) / spanY) * repeat;
        } else {
          rawU = ((x - bb.min.x) / spanX) * repeat;
          rawV = ((y - bb.min.y) / spanY) * repeat;
        }
      }
    }

    // Si se recorta a un uvRect concreto dentro de un atlas/mosaico, envolver dentro de [u0..u1, v0..v1]
    if (options?.uvRect) {
      const wrappedU = ((rawU % 1) + 1) % 1;
      const wrappedV = ((rawV % 1) + 1) % 1;
      uvs[i * 2] = u0 + wrappedU * uSpan;
      uvs[i * 2 + 1] = v0 + wrappedV * vSpan;
    } else {
      uvs[i * 2] = rawU;
      uvs[i * 2 + 1] = rawV;
    }
  }

  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.userData.hasCustomUV = true;
}

/**
 * Pinta/texturiza un conjunto de piezas completas (THREE.Mesh[]) con una textura del catálogo
 * (mosaico completo, sub-textura 512x512 de un Atlas 5x2, textura subida o cualquiera de las
 * 40+ texturas PBR procedurales con relieve Bump) y su proyección UV.
 */
export function applyCatalogTextureToMeshes(
  meshes: THREE.Mesh[],
  textureIdOrSpec: string,
  options?: {
    projection?: 'FLAT' | 'BOX' | 'CYLINDER';
    repeat?: number;
    uvRect?: [number, number, number, number];
    bumpStrength?: number;
  }
): { appliedCount: number; resolvedId: string; resolvedName: string } {
  const phParsed = parsePolyHavenSpec(textureIdOrSpec);
  const match = !phParsed ? findCatalogTextureOrSubTile(textureIdOrSpec) : null;
  const set = getColorMapSet(textureIdOrSpec);

  // Si es una textura de Poly Haven que aún no está en caché, disparar su carga PBR asíncrona y reaplicar al terminar
  if (phParsed && !set.color) {
    void applyPolyHavenTextureToMeshes(meshes, phParsed.assetId, {
      resolution: phParsed.resolution,
      projection: options?.projection,
      repeat: options?.repeat,
      uvRect: options?.uvRect,
    });
    return {
      appliedCount: meshes.length,
      resolvedId: `polyhaven:${phParsed.assetId}`,
      resolvedName: `Poly Haven: ${phParsed.assetId} (${phParsed.resolution.toUpperCase()})`,
    };
  }

  // Si no es del catálogo de imágenes/mosaicos, comprobar si es una textura PBR procedural (ej. "stone_ashlar", "gold_damascene")
  const procPatternId = !set.color ? resolveTexturePatternId(textureIdOrSpec) : 'none';
  const procPreset = procPatternId !== 'none' ? getTexturePresetInfo(procPatternId) : null;

  if (!set.color && (!procPreset || procPatternId === 'none')) {
    return { appliedCount: 0, resolvedId: textureIdOrSpec, resolvedName: textureIdOrSpec };
  }

  const resolvedId = phParsed
    ? `polyhaven:${phParsed.assetId}`
    : match?.subTile
    ? match.subTile.id
    : match?.info.id || (procPreset ? procPreset.id : textureIdOrSpec);
  const resolvedName = phParsed
    ? `Poly Haven: ${phParsed.assetId} (${phParsed.resolution.toUpperCase()})`
    : match?.subTile
    ? `${match.info.name.replace(/^Catálogo:\s*/i, '')} — ${match.subTile.name}`
    : match?.info.name || (procPreset ? procPreset.name : textureIdOrSpec);

  const defaultProj: 'FLAT' | 'BOX' | 'CYLINDER' =
    options?.projection || (match?.info.kind === 'mosaic' && !match?.subTile ? 'FLAT' : 'BOX');
  const repeat = Math.max(
    0.1,
    Number(options?.repeat ?? (match?.info.kind === 'mosaic' && !match?.subTile ? 1 : 2))
  );

  let colorMapTex: THREE.Texture | null = set.color;
  let bumpMapTex: THREE.Texture | null = null;
  if (!colorMapTex && procPreset && procPatternId !== 'none') {
    colorMapTex = generateProceduralTexture(procPatternId, 'auto', 1);
    colorMapTex.colorSpace = THREE.SRGBColorSpace;
    bumpMapTex = generateProceduralBumpTexture(procPatternId, 1);
  } else if (colorMapTex) {
    colorMapTex.wrapS = THREE.RepeatWrapping;
    colorMapTex.wrapT = THREE.RepeatWrapping;
    colorMapTex.colorSpace = THREE.SRGBColorSpace;
    colorMapTex.needsUpdate = true;
  }

  let appliedCount = 0;
  for (const m of meshes) {
    if (!m || !m.isMesh || m.userData?.isOutlineMesh) continue;
    if (m.geometry) {
      applyMosaicUvProjection(m.geometry as BufferGeometry, {
        projection: defaultProj,
        repeat,
        uvRect: options?.uvRect,
      });
    }

    // Clonar materiales de esta pieza si eran compartidos con otras piezas para no pintar piezas no seleccionadas
    if (!m.userData?.hasIsolatedMaterialInstance) {
      if (m.material && typeof (m.material as any).clone === 'function') {
        m.material = (m.material as any).clone();
      }
      for (const key of ['originalMaterial', 'toonMaterial', 'eeveeMaterial', 'cyclesMaterial']) {
        if (m.userData?.[key] && typeof m.userData[key].clone === 'function') {
          m.userData[key] = m.userData[key].clone();
        }
      }
      m.userData = { ...m.userData, hasIsolatedMaterialInstance: true };
    }

    const mats = [
      m.material,
      m.userData?.originalMaterial,
      m.userData?.toonMaterial,
      m.userData?.eeveeMaterial,
      m.userData?.cyclesMaterial,
    ];
    for (const mat of mats) {
      if (mat && typeof mat === 'object' && 'map' in mat) {
        (mat as any).map = colorMapTex;
        if ('normalMap' in mat) {
          (mat as any).normalMap = set.normal ?? null;
        }
        if ('roughnessMap' in mat) {
          (mat as any).roughnessMap = set.roughness ?? null;
          if (set.roughness && 'roughness' in mat) {
            (mat as any).roughness = 1.0; // Permite que el mapa roughnessMap controle la rugosidad real
          }
        }
        if ('metalnessMap' in mat) {
          (mat as any).metalnessMap = set.metalness ?? null;
          if (set.metalness && 'metalness' in mat) {
            (mat as any).metalness = 1.0;
          }
        }
        if ('bumpMap' in mat) {
          (mat as any).bumpMap = bumpMapTex ?? null;
          if (bumpMapTex) {
            (mat as any).bumpScale =
              (procPreset?.pbr.bumpScale ?? 0.04) * Number(options?.bumpStrength ?? 1.2);
          }
        }
        if (procPreset) {
          if ('roughness' in mat) (mat as any).roughness = procPreset.pbr.roughness;
          if ('metalness' in mat) (mat as any).metalness = procPreset.pbr.metalness;
        }
        if ('color' in mat && (mat as any).color?.set) {
          (mat as any).color.set('#ffffff');
        }
        (mat as any).needsUpdate = true;
      }
    }

    m.userData.appliedTextureId = resolvedId;
    m.userData.appliedTextureName = resolvedName;
    appliedCount++;
  }

  return { appliedCount, resolvedId, resolvedName };
}

/**
 * Carga en vivo los mapas PBR (Diffuse + Normal GL + Roughness + Metalness) de Poly Haven
 * y los aplica a todas las piezas 3D indicadas.
 */
export async function applyPolyHavenTextureToMeshes(
  meshes: THREE.Mesh[],
  assetIdOrSpec: string,
  options?: {
    resolution?: '1k' | '2k';
    projection?: 'FLAT' | 'BOX' | 'CYLINDER';
    repeat?: number;
    uvRect?: [number, number, number, number];
  }
): Promise<{
  appliedCount: number;
  resolvedId: string;
  resolvedName: string;
  mapsLoaded: string[];
}> {
  const parsed = parsePolyHavenSpec(assetIdOrSpec);
  const assetId = parsed ? parsed.assetId : String(assetIdOrSpec).trim().toLowerCase();
  const resolution: '1k' | '2k' = options?.resolution || parsed?.resolution || '1k';
  const set = await loadPolyHavenColorMapSet(assetId, resolution);
  const mapsLoaded: string[] = [];
  if (set.color) mapsLoaded.push('Diffuse');
  if (set.normal) mapsLoaded.push('Normal');
  if (set.roughness) mapsLoaded.push('Roughness');
  if (set.metalness) mapsLoaded.push('Metalness');

  const applied = applyCatalogTextureToMeshes(meshes, `polyhaven:${assetId}@${resolution}`, {
    projection: options?.projection || 'BOX',
    repeat: options?.repeat ?? 2,
    uvRect: options?.uvRect,
  });

  return {
    ...applied,
    mapsLoaded,
  };
}

export { TEXTURE_PRESETS };


