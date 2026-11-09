import * as THREE from 'three';

export type TexturePatternType =
  | 'none'
  // Naturaleza y Elementos
  | 'cobblestone'
  | 'wood_oak'
  | 'wood_mahogany'
  | 'tree_bark'
  | 'water_caustics'
  | 'ocean_deep'
  | 'desert_sand'
  | 'moss_nature'
  | 'grass_meadow'
  | 'ice_crystal'
  | 'fresh_snow'
  // Arquitectura, Piedras, Cerámica y Metales
  | 'stone_ashlar'
  | 'travertine_roman'
  | 'marble_carrara'
  | 'marble_nero'
  | 'brick_mudejar'
  | 'terracotta_roof'
  | 'slate_roof'
  | 'andalusi_tiles'
  | 'stained_glass'
  | 'concrete_brutalist'
  | 'brushed_metal'
  | 'damascus_steel'
  | 'gold_damascene'
  | 'copper_patina'
  | 'carbon_weave'
  // Tejidos, Cuero y Materiales Nobles
  | 'leather_tufted'
  | 'royal_velvet'
  | 'woven_linen'
  | 'beast_hide'
  // Animales y monstruos
  | 'animal_fur'
  | 'feathers'
  | 'bone_ivory'
  | 'chitin_carapace'
  // Fantasía, Sci-Fi y Anime
  | 'dragon_scales'
  | 'biomech_plates'
  | 'magma_cracks'
  | 'solar_plasma'
  | 'hologram_grid'
  | 'halftone_manga'
  | 'cyber_circuits'
  | 'smooth_skin';

export type TextureCategoryType = 'natural' | 'arquitectura' | 'tejidos' | 'fantasia';

export interface TexturePbrProfile {
  naturalColorHex: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
  ior: number;
  bumpScale: number;
  transmission?: number;
}

export interface TexturePresetInfo {
  id: TexturePatternType;
  name: string;
  category: TextureCategoryType;
  description: string;
  thumbnailColor: string;
  isEmissive?: boolean;
  pbr: TexturePbrProfile;
}

export const TEXTURE_PRESETS: TexturePresetInfo[] = [
  {
    id: 'none',
    name: 'Original / Sin Textura',
    category: 'natural',
    description: 'Mantiene el color y material original de cada pieza del modelo',
    thumbnailColor: '#64748b',
    pbr: {
      naturalColorHex: '#ffffff',
      roughness: 0.38,
      metalness: 0.2,
      clearcoat: 0.15,
      ior: 1.5,
      bumpScale: 0,
    },
  },
  // === 1. NATURALEZA Y ELEMENTOS (PIEDRA, MADERA, AGUA, ARENA, MUSGO, HIELO, NIEVE) ===
  {
    id: 'cobblestone',
    name: 'Roca Granítica / Piedra Bruta',
    category: 'natural',
    description: 'Piedra natural irregular con relieve escarpado, cuarzo y fisuras',
    thumbnailColor: '#78828c',
    pbr: {
      naturalColorHex: '#8b949e',
      roughness: 0.88,
      metalness: 0.06,
      clearcoat: 0.05,
      ior: 1.52,
      bumpScale: 0.075,
    },
  },
  {
    id: 'wood_oak',
    name: 'Madera Noble Veteada (Roble / Nogal)',
    category: 'natural',
    description: 'Tablones de madera con anillos de crecimiento, nudos y fibra barnizada',
    thumbnailColor: '#8f562e',
    pbr: {
      naturalColorHex: '#9c6236',
      roughness: 0.46,
      metalness: 0.02,
      clearcoat: 0.35,
      ior: 1.5,
      bumpScale: 0.04,
    },
  },
  {
    id: 'wood_mahogany',
    name: 'Caoba Real / Ébano Barnizado',
    category: 'natural',
    description: 'Madera exótica rojiza oscura con veta fina y laca de piano brillante',
    thumbnailColor: '#5c1f14',
    pbr: {
      naturalColorHex: '#6e2618',
      roughness: 0.2,
      metalness: 0.04,
      clearcoat: 0.88,
      ior: 1.54,
      bumpScale: 0.028,
    },
  },
  {
    id: 'tree_bark',
    name: 'Corteza de Árbol Centenario',
    category: 'natural',
    description: 'Surcos orgánicos profundos y rugosos de tronco de encina y roble',
    thumbnailColor: '#4a3525',
    pbr: {
      naturalColorHex: '#59402d',
      roughness: 0.94,
      metalness: 0.01,
      clearcoat: 0.0,
      ior: 1.45,
      bumpScale: 0.09,
    },
  },
  {
    id: 'water_caustics',
    name: 'Agua Cristalina & Cáusticas',
    category: 'natural',
    description: 'Superficie líquida con redes de cáusticas solares, ondas y refracción',
    thumbnailColor: '#0ea5e9',
    pbr: {
      naturalColorHex: '#38bdf8',
      roughness: 0.06,
      metalness: 0.08,
      clearcoat: 0.98,
      ior: 1.333,
      bumpScale: 0.045,
      transmission: 0.65,
    },
  },
  {
    id: 'ocean_deep',
    name: 'Mar Profundo & Espuma de Olas',
    category: 'natural',
    description: 'Oleaje oceánico azul turquesa profundo con crestas de espuma blanca',
    thumbnailColor: '#0369a1',
    pbr: {
      naturalColorHex: '#0284c7',
      roughness: 0.1,
      metalness: 0.12,
      clearcoat: 0.95,
      ior: 1.34,
      bumpScale: 0.06,
      transmission: 0.52,
    },
  },
  {
    id: 'desert_sand',
    name: 'Arena de Dunas / Desierto',
    category: 'natural',
    description: 'Ondulaciones finas de arena dorada esculpidas por el viento con micro-grano',
    thumbnailColor: '#e0b772',
    pbr: {
      naturalColorHex: '#e6c280',
      roughness: 0.9,
      metalness: 0.02,
      clearcoat: 0.0,
      ior: 1.46,
      bumpScale: 0.05,
    },
  },
  {
    id: 'moss_nature',
    name: 'Musgo y Roca Silvestre',
    category: 'natural',
    description: 'Manto orgánico de musgo verde esmeralda y líquenes sobre roca húmeda',
    thumbnailColor: '#228b22',
    pbr: {
      naturalColorHex: '#429e3d',
      roughness: 0.86,
      metalness: 0.02,
      clearcoat: 0.12,
      ior: 1.45,
      bumpScale: 0.065,
    },
  },
  {
    id: 'grass_meadow',
    name: 'Pradera / Césped Orgánico',
    category: 'natural',
    description: 'Tapiz tupido de hierba fresca y tréboles con gotas de rocío',
    thumbnailColor: '#16a34a',
    pbr: {
      naturalColorHex: '#22c55e',
      roughness: 0.78,
      metalness: 0.02,
      clearcoat: 0.18,
      ior: 1.44,
      bumpScale: 0.055,
    },
  },
  {
    id: 'ice_crystal',
    name: 'Hielo Glacial Escarchado',
    category: 'natural',
    description: 'Cristal helado translúcido con fracturas internas y escarcha polar',
    thumbnailColor: '#7dd3fc',
    pbr: {
      naturalColorHex: '#bae6fd',
      roughness: 0.12,
      metalness: 0.1,
      clearcoat: 0.92,
      ior: 1.31,
      bumpScale: 0.04,
      transmission: 0.55,
    },
  },
  {
    id: 'fresh_snow',
    name: 'Nieve Virgen / Escarcha Polar',
    category: 'natural',
    description: 'Manto blanco esponjoso con micro-cristales de hielo centelleantes',
    thumbnailColor: '#f1f5f9',
    pbr: {
      naturalColorHex: '#f8fafc',
      roughness: 0.68,
      metalness: 0.08,
      clearcoat: 0.45,
      ior: 1.31,
      bumpScale: 0.045,
    },
  },

  // === 2. ARQUITECTURA, PIEDRAS LABRADAS, CERÁMICA, VIDRIERAS Y METALES ===
  {
    id: 'stone_ashlar',
    name: 'Piedra de Sillería (Albero / Caliza)',
    category: 'arquitectura',
    description: 'Bloques de piedra labrada con juntas de mortero, poros y grano mineral',
    thumbnailColor: '#d4be94',
    pbr: {
      naturalColorHex: '#dcc8a0',
      roughness: 0.84,
      metalness: 0.04,
      clearcoat: 0.04,
      ior: 1.48,
      bumpScale: 0.055,
    },
  },
  {
    id: 'travertine_roman',
    name: 'Travertino Romano Clásico',
    category: 'arquitectura',
    description: 'Piedra monumental en vetas sedimento crema y marfil con poros naturales',
    thumbnailColor: '#dfd3be',
    pbr: {
      naturalColorHex: '#e8decb',
      roughness: 0.52,
      metalness: 0.03,
      clearcoat: 0.28,
      ior: 1.52,
      bumpScale: 0.045,
    },
  },
  {
    id: 'marble_carrara',
    name: 'Mármol Blanco de Carrara',
    category: 'arquitectura',
    description: 'Mármol clásico pulido al espejo con vetas orgánicas grises y doradas',
    thumbnailColor: '#e2e8f0',
    pbr: {
      naturalColorHex: '#f1f5f9',
      roughness: 0.14,
      metalness: 0.05,
      clearcoat: 0.82,
      ior: 1.56,
      bumpScale: 0.02,
    },
  },
  {
    id: 'marble_nero',
    name: 'Mármol Negro Marquina & Oro',
    category: 'arquitectura',
    description: 'Mármol imperial negro azabache con vetas blancas de calcita y filamentos de oro',
    thumbnailColor: '#1e293b',
    pbr: {
      naturalColorHex: '#1e2430',
      roughness: 0.12,
      metalness: 0.12,
      clearcoat: 0.92,
      ior: 1.58,
      bumpScale: 0.022,
    },
  },
  {
    id: 'brick_mudejar',
    name: 'Ladrillo Mudéjar / Terracota',
    category: 'arquitectura',
    description: 'Aparejo de ladrillo cerámico artesanal cocido con llaga de cal',
    thumbnailColor: '#b85d3b',
    pbr: {
      naturalColorHex: '#c46845',
      roughness: 0.82,
      metalness: 0.03,
      clearcoat: 0.06,
      ior: 1.5,
      bumpScale: 0.06,
    },
  },
  {
    id: 'terracotta_roof',
    name: 'Teja Árabe Curva / Barro Cocido',
    category: 'arquitectura',
    description: 'Cubierta tradicional de tejas curvas acanaladas de arcilla mediterránea',
    thumbnailColor: '#c25934',
    pbr: {
      naturalColorHex: '#cc603b',
      roughness: 0.74,
      metalness: 0.03,
      clearcoat: 0.12,
      ior: 1.5,
      bumpScale: 0.075,
    },
  },
  {
    id: 'slate_roof',
    name: 'Pizarra Negra / Teja Escamada',
    category: 'arquitectura',
    description: 'Lajas de pizarra oscura imbricadas para chapiteles, tejados y cúpulas',
    thumbnailColor: '#334155',
    pbr: {
      naturalColorHex: '#3e4c5e',
      roughness: 0.56,
      metalness: 0.14,
      clearcoat: 0.25,
      ior: 1.55,
      bumpScale: 0.065,
    },
  },
  {
    id: 'andalusi_tiles',
    name: 'Azulejo Andalusí / Alicatado Mudéjar',
    category: 'arquitectura',
    description: 'Cerámica vidriada con lacería geométrica de estrellas de 8 puntas en azul, miel y blanco',
    thumbnailColor: '#0284c7',
    pbr: {
      naturalColorHex: '#38bdf8',
      roughness: 0.12,
      metalness: 0.06,
      clearcoat: 0.94,
      ior: 1.54,
      bumpScale: 0.038,
    },
  },
  {
    id: 'stained_glass',
    name: 'Vitral Gótico / Vidriera Catedral',
    category: 'arquitectura',
    description: 'Cristal emplomado policromado (rubí, cobalto, ámbar y esmeralda) con luz translúcida',
    thumbnailColor: '#ec4899',
    isEmissive: true,
    pbr: {
      naturalColorHex: '#f472b6',
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 0.96,
      ior: 1.52,
      bumpScale: 0.045,
      transmission: 0.62,
    },
  },
  {
    id: 'concrete_brutalist',
    name: 'Hormigón Visto Arquitectónico',
    category: 'arquitectura',
    description: 'Paneles de cemento encofrado con juntas técnicas, poros y árido mineral',
    thumbnailColor: '#94a3b8',
    pbr: {
      naturalColorHex: '#9ca3af',
      roughness: 0.85,
      metalness: 0.04,
      clearcoat: 0.04,
      ior: 1.48,
      bumpScale: 0.05,
    },
  },
  {
    id: 'brushed_metal',
    name: 'Acero / Titanio Cepillado',
    category: 'arquitectura',
    description: 'Aleación metálica industrial con micro-surcos lineales anisotrópicos',
    thumbnailColor: '#94a3b8',
    pbr: {
      naturalColorHex: '#cbd5e1',
      roughness: 0.24,
      metalness: 0.92,
      clearcoat: 0.45,
      ior: 2.1,
      bumpScale: 0.025,
    },
  },
  {
    id: 'damascus_steel',
    name: 'Acero de Damasco Forjado',
    category: 'arquitectura',
    description: 'Acero al carbono multicapa con ondas fluidas de forja para hojas y armaduras',
    thumbnailColor: '#64748b',
    pbr: {
      naturalColorHex: '#94a3b8',
      roughness: 0.2,
      metalness: 0.94,
      clearcoat: 0.6,
      ior: 2.2,
      bumpScale: 0.035,
    },
  },
  {
    id: 'gold_damascene',
    name: 'Oro Antiguo / Damasquinado',
    category: 'arquitectura',
    description: 'Orfebrería de oro y bronce con grabados geométricos en relieve',
    thumbnailColor: '#eab308',
    pbr: {
      naturalColorHex: '#facc15',
      roughness: 0.22,
      metalness: 0.94,
      clearcoat: 0.65,
      ior: 1.9,
      bumpScale: 0.045,
    },
  },
  {
    id: 'copper_patina',
    name: 'Bronce / Cobre con Pátina Verde',
    category: 'arquitectura',
    description: 'Metal histórico envejecido con reflejos cobrizos y cardenillo turquesa en hendiduras',
    thumbnailColor: '#2dd4bf',
    pbr: {
      naturalColorHex: '#4fd1c5',
      roughness: 0.42,
      metalness: 0.78,
      clearcoat: 0.3,
      ior: 1.85,
      bumpScale: 0.048,
    },
  },
  {
    id: 'carbon_weave',
    name: 'Fibra de Carbono 3K',
    category: 'arquitectura',
    description: 'Tejido técnico trenzado en diagonal con barniz automotriz Clearcoat',
    thumbnailColor: '#334155',
    pbr: {
      naturalColorHex: '#475569',
      roughness: 0.2,
      metalness: 0.55,
      clearcoat: 0.95,
      ior: 1.6,
      bumpScale: 0.035,
    },
  },

  // === 3. TEJIDOS, CUERO Y TAPICERÍA NOBLE ===
  {
    id: 'leather_tufted',
    name: 'Cuero Curtido / Capitonnée',
    category: 'tejidos',
    description: 'Piel vacuna granulada artesanal con acolchado en rombo y pespuntes',
    thumbnailColor: '#7c2d12',
    pbr: {
      naturalColorHex: '#853a1e',
      roughness: 0.48,
      metalness: 0.04,
      clearcoat: 0.28,
      ior: 1.48,
      bumpScale: 0.055,
    },
  },
  {
    id: 'royal_velvet',
    name: 'Terciopelo / Damasco Real',
    category: 'tejidos',
    description: 'Tejido palaciego carmesí con brocado floral dorado y brillo sedoso',
    thumbnailColor: '#9f1239',
    pbr: {
      naturalColorHex: '#be123c',
      roughness: 0.72,
      metalness: 0.12,
      clearcoat: 0.2,
      ior: 1.46,
      bumpScale: 0.04,
    },
  },
  {
    id: 'woven_linen',
    name: 'Tela de Lino / Lienzo Natural',
    category: 'tejidos',
    description: 'Trama textil entrecruzada de hilo orgánico para velas, túnicas y carpas',
    thumbnailColor: '#d6d3d1',
    pbr: {
      naturalColorHex: '#e7e5e4',
      roughness: 0.88,
      metalness: 0.0,
      clearcoat: 0.0,
      ior: 1.42,
      bumpScale: 0.045,
    },
  },

  {
    id: 'beast_hide',
    name: 'Piel de Bestia / Cuero Granulado',
    category: 'tejidos',
    description: 'Grano de poros irregulares que se repite sin costuras: piel de monstruo, orco, botas y correas',
    thumbnailColor: '#8a6a4a',
    pbr: {
      naturalColorHex: '#8a6448',
      roughness: 0.7,
      metalness: 0.0,
      clearcoat: 0.08,
      ior: 1.45,
      bumpScale: 0.03,
    },
  },

  {
    id: 'animal_fur',
    name: 'Pelaje Animal',
    category: 'natural',
    description: 'Mechones de pelo direccionales con volumen, sin costuras: lobos, osos, jabalíes, felinos',
    thumbnailColor: '#7a6248',
    pbr: { naturalColorHex: '#7a6248', roughness: 0.9, metalness: 0.0, clearcoat: 0.0, ior: 1.45, bumpScale: 0.03 },
  },
  {
    id: 'feathers',
    name: 'Plumas',
    category: 'natural',
    description: 'Plumas solapadas con raquis y barbas: aves, grifos, arpías, fénix',
    thumbnailColor: '#8a6a44',
    pbr: { naturalColorHex: '#8a6a44', roughness: 0.75, metalness: 0.0, clearcoat: 0.0, ior: 1.45, bumpScale: 0.025 },
  },
  {
    id: 'bone_ivory',
    name: 'Hueso / Marfil',
    category: 'natural',
    description: 'Hueso con vetas longitudinales, poros y grietas finas: esqueletos, cuernos, colmillos, garras',
    thumbnailColor: '#e8dcc0',
    pbr: { naturalColorHex: '#e3d6b8', roughness: 0.55, metalness: 0.0, clearcoat: 0.1, ior: 1.5, bumpScale: 0.02 },
  },
  {
    id: 'chitin_carapace',
    name: 'Quitina / Caparazón',
    category: 'natural',
    description: 'Placas segmentadas brillantes con poros y moteado: arañas, escorpiones, escarabajos, cangrejos',
    thumbnailColor: '#3a2a22',
    pbr: { naturalColorHex: '#4a3326', roughness: 0.32, metalness: 0.05, clearcoat: 0.6, ior: 1.52, bumpScale: 0.04 },
  },

  // === 4. FANTASÍA, SCI-FI Y ESTILIZADO ===
  {
    id: 'dragon_scales',
    name: 'Escamas de Dragón',
    category: 'fantasia',
    description: 'Piel reptiliana escamada imbricada con relieve orgánico profundo',
    thumbnailColor: '#10b981',
    pbr: {
      naturalColorHex: '#10b981',
      roughness: 0.36,
      metalness: 0.28,
      clearcoat: 0.48,
      ior: 1.54,
      bumpScale: 0.065,
    },
  },
  {
    id: 'biomech_plates',
    name: 'Exoesqueleto Biomec',
    category: 'fantasia',
    description: 'Placas blindadas con biseles mecánicos y remaches de contención',
    thumbnailColor: '#8b5cf6',
    pbr: {
      naturalColorHex: '#a78bfa',
      roughness: 0.3,
      metalness: 0.72,
      clearcoat: 0.5,
      ior: 1.65,
      bumpScale: 0.055,
    },
  },
  {
    id: 'magma_cracks',
    name: 'Roca Volcánica & Magma',
    category: 'fantasia',
    description: 'Basalto oscuro agrietado con venas de lava incandescente',
    thumbnailColor: '#ef4444',
    isEmissive: true,
    pbr: {
      naturalColorHex: '#f97316',
      roughness: 0.75,
      metalness: 0.15,
      clearcoat: 0.15,
      ior: 1.5,
      bumpScale: 0.07,
    },
  },
  {
    id: 'solar_plasma',
    name: 'Plasma Estelar / Energía Arcana',
    category: 'fantasia',
    description: 'Vórtices de energía pura incandescente para núcleos, portales y armas mágicas',
    thumbnailColor: '#f59e0b',
    isEmissive: true,
    pbr: {
      naturalColorHex: '#fbbf24',
      roughness: 0.15,
      metalness: 0.35,
      clearcoat: 0.9,
      ior: 1.6,
      bumpScale: 0.04,
    },
  },
  {
    id: 'hologram_grid',
    name: 'Matriz Holográfica Sci-Fi',
    category: 'fantasia',
    description: 'Malla hexagonal láser cian con escaneo energético y semitransparencia',
    thumbnailColor: '#06b6d4',
    isEmissive: true,
    pbr: {
      naturalColorHex: '#22d3ee',
      roughness: 0.1,
      metalness: 0.5,
      clearcoat: 0.95,
      ior: 1.45,
      bumpScale: 0.025,
      transmission: 0.45,
    },
  },
  {
    id: 'halftone_manga',
    name: 'Trama Manga / Anime',
    category: 'fantasia',
    description: 'Patrón de puntos Ben-Day de cómic e imprenta japonesa clásica',
    thumbnailColor: '#f59e0b',
    pbr: {
      naturalColorHex: '#f8fafc',
      roughness: 0.55,
      metalness: 0.05,
      clearcoat: 0.1,
      ior: 1.45,
      bumpScale: 0.015,
    },
  },
  {
    id: 'cyber_circuits',
    name: 'Circuitos Cyber',
    category: 'fantasia',
    description: 'Trazado de pistas digitales y microprocesadores luminosos',
    thumbnailColor: '#06b6d4',
    pbr: {
      naturalColorHex: '#22d3ee',
      roughness: 0.25,
      metalness: 0.65,
      clearcoat: 0.7,
      ior: 1.6,
      bumpScale: 0.035,
    },
  },
  {
    id: 'smooth_skin',
    name: 'Porcelana / Piel Suave',
    category: 'fantasia',
    description: 'Gradiente sedoso sin costuras para rostros, figuras anime y cerámica fina',
    thumbnailColor: '#f43f5e',
    pbr: {
      naturalColorHex: '#fda4af',
      roughness: 0.28,
      metalness: 0.02,
      clearcoat: 0.62,
      ior: 1.48,
      bumpScale: 0.008,
    },
  },
];

// Mapa de alias en español/inglés para que scripts Python de Gemini funcionen con cualquier nombre descriptivo
const TEXTURE_ALIAS_MAP: Record<string, TexturePatternType> = {
  // Exact IDs
  none: 'none',
  cobblestone: 'cobblestone',
  wood_oak: 'wood_oak',
  wood_mahogany: 'wood_mahogany',
  tree_bark: 'tree_bark',
  water_caustics: 'water_caustics',
  ocean_deep: 'ocean_deep',
  desert_sand: 'desert_sand',
  moss_nature: 'moss_nature',
  grass_meadow: 'grass_meadow',
  ice_crystal: 'ice_crystal',
  fresh_snow: 'fresh_snow',
  stone_ashlar: 'stone_ashlar',
  travertine_roman: 'travertine_roman',
  marble_carrara: 'marble_carrara',
  marble_nero: 'marble_nero',
  brick_mudejar: 'brick_mudejar',
  terracotta_roof: 'terracotta_roof',
  slate_roof: 'slate_roof',
  andalusi_tiles: 'andalusi_tiles',
  stained_glass: 'stained_glass',
  concrete_brutalist: 'concrete_brutalist',
  brushed_metal: 'brushed_metal',
  damascus_steel: 'damascus_steel',
  gold_damascene: 'gold_damascene',
  copper_patina: 'copper_patina',
  carbon_weave: 'carbon_weave',
  leather_tufted: 'leather_tufted',
  royal_velvet: 'royal_velvet',
  woven_linen: 'woven_linen',
  beast_hide: 'beast_hide',
  animal_fur: 'animal_fur',
  feathers: 'feathers',
  bone_ivory: 'bone_ivory',
  chitin_carapace: 'chitin_carapace',
  dragon_scales: 'dragon_scales',
  biomech_plates: 'biomech_plates',
  magma_cracks: 'magma_cracks',
  solar_plasma: 'solar_plasma',
  hologram_grid: 'hologram_grid',
  halftone_manga: 'halftone_manga',
  cyber_circuits: 'cyber_circuits',
  smooth_skin: 'smooth_skin',
  // Alias en Español e Inglés para entrenamiento de Gemini
  sin_textura: 'none',
  piedra: 'stone_ashlar',
  silleria: 'stone_ashlar',
  albero: 'stone_ashlar',
  caliza: 'stone_ashlar',
  stone: 'stone_ashlar',
  roca: 'cobblestone',
  granito: 'cobblestone',
  adoquin: 'cobblestone',
  rock: 'cobblestone',
  travertino: 'travertine_roman',
  madera: 'wood_oak',
  roble: 'wood_oak',
  nogal: 'wood_oak',
  wood: 'wood_oak',
  caoba: 'wood_mahogany',
  ebano: 'wood_mahogany',
  mahogany: 'wood_mahogany',
  corteza: 'tree_bark',
  tronco: 'tree_bark',
  bark: 'tree_bark',
  agua: 'water_caustics',
  water: 'water_caustics',
  caustics: 'water_caustics',
  mar: 'ocean_deep',
  oceano: 'ocean_deep',
  ocean: 'ocean_deep',
  arena: 'desert_sand',
  desierto: 'desert_sand',
  dunas: 'desert_sand',
  sand: 'desert_sand',
  musgo: 'moss_nature',
  moss: 'moss_nature',
  cesped: 'grass_meadow',
  hierba: 'grass_meadow',
  pradera: 'grass_meadow',
  grass: 'grass_meadow',
  hielo: 'ice_crystal',
  glaciar: 'ice_crystal',
  ice: 'ice_crystal',
  nieve: 'fresh_snow',
  escarcha: 'fresh_snow',
  snow: 'fresh_snow',
  marmol: 'marble_carrara',
  marmol_blanco: 'marble_carrara',
  marble: 'marble_carrara',
  marmol_negro: 'marble_nero',
  black_marble: 'marble_nero',
  ladrillo: 'brick_mudejar',
  terracota: 'brick_mudejar',
  brick: 'brick_mudejar',
  teja: 'terracotta_roof',
  tejado: 'terracotta_roof',
  roof_tiles: 'terracotta_roof',
  pizarra: 'slate_roof',
  slate: 'slate_roof',
  azulejo: 'andalusi_tiles',
  alicatado: 'andalusi_tiles',
  ceramica: 'andalusi_tiles',
  tiles: 'andalusi_tiles',
  vidriera: 'stained_glass',
  vitral: 'stained_glass',
  cristal: 'stained_glass',
  hormigon: 'concrete_brutalist',
  cemento: 'concrete_brutalist',
  concrete: 'concrete_brutalist',
  metal: 'brushed_metal',
  titanio: 'brushed_metal',
  acero: 'brushed_metal',
  damasco: 'damascus_steel',
  acero_damasco: 'damascus_steel',
  oro: 'gold_damascene',
  gold: 'gold_damascene',
  bronce: 'copper_patina',
  cobre: 'copper_patina',
  patina: 'copper_patina',
  carbono: 'carbon_weave',
  fibra_carbono: 'carbon_weave',
  carbon: 'carbon_weave',
  cuero: 'leather_tufted',
  piel: 'leather_tufted',
  leather: 'leather_tufted',
  terciopelo: 'royal_velvet',
  velvet: 'royal_velvet',
  tela: 'woven_linen',
  lino: 'woven_linen',
  lienzo: 'woven_linen',
  fabric: 'woven_linen',
  escamas: 'dragon_scales',
  dragon: 'dragon_scales',
  biomec: 'biomech_plates',
  magma: 'magma_cracks',
  lava: 'magma_cracks',
  plasma: 'solar_plasma',
  energia: 'solar_plasma',
  holograma: 'hologram_grid',
  hologram: 'hologram_grid',
  manga: 'halftone_manga',
  anime: 'halftone_manga',
  circuitos: 'cyber_circuits',
  cyber: 'cyber_circuits',
  porcelana: 'smooth_skin',
  piel_bestia: 'beast_hide',
  cuero_granulado: 'beast_hide',
  hide: 'beast_hide',
  pelaje: 'animal_fur',
  pelo: 'animal_fur',
  fur: 'animal_fur',
  plumas: 'feathers',
  pluma: 'feathers',
  feather: 'feathers',
  hueso: 'bone_ivory',
  marfil: 'bone_ivory',
  bone: 'bone_ivory',
  quitina: 'chitin_carapace',
  caparazon: 'chitin_carapace',
  chitin: 'chitin_carapace',
};

export function resolveTexturePatternId(rawName: string): TexturePatternType {
  if (!rawName) return 'none';
  const clean = String(rawName)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
  if (clean in TEXTURE_ALIAS_MAP) {
    return TEXTURE_ALIAS_MAP[clean];
  }
  // Búsqueda por subcadena si pasaron un nombre compuesto como "Material_Piedra_Albero"
  if (clean.includes('marmol_negro') || clean.includes('nero')) return 'marble_nero';
  if (clean.includes('marmol') || clean.includes('carrara')) return 'marble_carrara';
  if (clean.includes('travertino')) return 'travertine_roman';
  if (clean.includes('ladrillo') || clean.includes('almohade') || clean.includes('mudejar')) return 'brick_mudejar';
  if (clean.includes('azulejo') || clean.includes('alicatado')) return 'andalusi_tiles';
  if (clean.includes('teja')) return 'terracotta_roof';
  if (clean.includes('pizarra')) return 'slate_roof';
  if (clean.includes('vidriera') || clean.includes('vitral')) return 'stained_glass';
  if (clean.includes('hormigon') || clean.includes('cemento')) return 'concrete_brutalist';
  if (clean.includes('piedra') || clean.includes('albero') || clean.includes('silleria')) return 'stone_ashlar';
  if (clean.includes('roca') || clean.includes('granito')) return 'cobblestone';
  if (clean.includes('caoba') || clean.includes('ebano')) return 'wood_mahogany';
  if (clean.includes('corteza') || clean.includes('tronco')) return 'tree_bark';
  if (clean.includes('madera') || clean.includes('roble') || clean.includes('nogal')) return 'wood_oak';
  if (clean.includes('agua') || clean.includes('caustica')) return 'water_caustics';
  if (clean.includes('oceano') || clean.includes('mar_')) return 'ocean_deep';
  if (clean.includes('arena') || clean.includes('duna')) return 'desert_sand';
  if (clean.includes('musgo')) return 'moss_nature';
  if (clean.includes('cesped') || clean.includes('hierba')) return 'grass_meadow';
  if (clean.includes('nieve')) return 'fresh_snow';
  if (clean.includes('hielo')) return 'ice_crystal';
  if (clean.includes('oro') || clean.includes('gold')) return 'gold_damascene';
  if (clean.includes('bronce') || clean.includes('cobre') || clean.includes('patina')) return 'copper_patina';
  if (clean.includes('damasco')) return 'damascus_steel';
  if (clean.includes('acero') || clean.includes('metal') || clean.includes('titanio')) return 'brushed_metal';
  if (clean.includes('carbono')) return 'carbon_weave';
  if (clean.includes('cuero') || clean.includes('piel')) return 'leather_tufted';
  if (clean.includes('terciopelo')) return 'royal_velvet';
  if (clean.includes('lino') || clean.includes('tela') || clean.includes('lienzo')) return 'woven_linen';
  if (clean.includes('escama') || clean.includes('dragon')) return 'dragon_scales';
  if (clean.includes('magma') || clean.includes('lava')) return 'magma_cracks';
  if (clean.includes('plasma') || clean.includes('energia')) return 'solar_plasma';
  if (clean.includes('hologram')) return 'hologram_grid';
  return 'none';
}

export function getTexturePresetInfo(type: TexturePatternType): TexturePresetInfo {
  return TEXTURE_PRESETS.find((p) => p.id === type) || TEXTURE_PRESETS[0];
}

// Generador determinista de ruido pseudo-aleatorio 2D y FBM (Fractional Brownian Motion)
function hash2D(ix: number, iy: number, seed: number = 1337): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise2D(x: number, y: number, seed: number = 1337): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);

  const a = hash2D(ix, iy, seed);
  const b = hash2D(ix + 1, iy, seed);
  const c = hash2D(ix, iy + 1, seed);
  const d = hash2D(ix + 1, iy + 1, seed);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm2D(x: number, y: number, octaves: number = 4, seed: number = 1337): number {
  let val = 0.0;
  let amp = 0.5;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    val += amp * smoothNoise2D(x * freq, y * freq, seed + i * 97);
    freq *= 2.02;
    amp *= 0.5;
  }
  return val;
}

// Distancia celular de Voronoi para cáusticas de agua, adoquines de roca y cristales
function voronoi2D(x: number, y: number, scale: number, seed: number = 42): { f1: number; f2: number; cellHash: number } {
  const sx = x * scale;
  const sy = y * scale;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  let f1 = 10.0;
  let f2 = 10.0;
  let bestHash = 0.5;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ((ix + dx) % scale + scale) % scale;
      const cy = ((iy + dy) % scale + scale) % scale;
      const jx = hash2D(cx, cy, seed);
      const jy = hash2D(cx, cy, seed + 31);
      const px = ix + dx + jx;
      const py = iy + dy + jy;
      const dist = Math.hypot(sx - px, sy - py);
      if (dist < f1) {
        f2 = f1;
        f1 = dist;
        bestHash = hash2D(cx, cy, seed + 79);
      } else if (dist < f2) {
        f2 = dist;
      }
    }
  }
  return { f1, f2, cellHash: bestHash };
}

// Ruido suave periódico: se repite exactamente en u,v ∈ [0,1) (periodos enteros), así la textura no tiene costuras
function periodicNoise2D(u: number, v: number, px: number, py: number, seed: number): number {
  const x = u * px;
  const y = v * py;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const wx = (n: number) => ((n % px) + px) % px;
  const wy = (n: number) => ((n % py) + py) % py;
  const a = hash2D(wx(ix), wy(iy), seed);
  const b = hash2D(wx(ix + 1), wy(iy), seed);
  const c = hash2D(wx(ix), wy(iy + 1), seed);
  const d = hash2D(wx(ix + 1), wy(iy + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function periodicFbm(u: number, v: number, px: number, py: number, octaves: number, seed: number): number {
  let val = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    val += amp * periodicNoise2D(u, v, px << i, py << i, seed + i * 97);
    norm += amp;
    amp *= 0.5;
  }
  return val / norm;
}

const colorTextureCache = new Map<string, THREE.CanvasTexture>();
const bumpTextureCache = new Map<string, THREE.CanvasTexture>();

function renderPatternToCanvas(
  ctx: CanvasRenderingContext2D,
  size: number,
  type: TexturePatternType,
  isBumpPass: boolean,
  baseHex: string
): void {
  const preset = getTexturePresetInfo(type);
  const effectiveHex = baseHex === 'auto' ? preset.pbr.naturalColorHex : baseHex;
  const baseColor = new THREE.Color(effectiveHex);
  const r255 = Math.round(baseColor.r * 255);
  const g255 = Math.round(baseColor.g * 255);
  const b255 = Math.round(baseColor.b * 255);

  if (type === 'stone_ashlar') {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const rows = 8;
    const cols = 4;
    const rowH = size / rows;
    const colW = size / cols;

    for (let y = 0; y < size; y++) {
      const rowIdx = Math.floor(y / rowH);
      const offset = (rowIdx % 2) * (colW * 0.5);
      const dyMortar = Math.min(y % rowH, rowH - (y % rowH));

      for (let x = 0; x < size; x++) {
        const sx = (x + offset) % size;
        const colIdx = Math.floor(sx / colW);
        const dxMortar = Math.min(sx % colW, colW - (sx % colW));
        const edgeDist = Math.min(dxMortar, dyMortar);

        const blockSeed = rowIdx * 17 + colIdx * 31;
        const blockTint = (hash2D(colIdx, rowIdx, 101) - 0.5) * 0.16;
        const grain = fbm2D((x / size) * 14, (y / size) * 14, 4, 210 + blockSeed);
        const finePore = (hash2D(x, y, 503) - 0.5) * 0.08;

        const isMortar = edgeDist < 3.2;
        const bevel = Math.min(1.0, edgeDist / 7.0);

        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const hVal = isMortar ? 0.12 : Math.max(0, Math.min(1, bevel * (0.45 + grain * 0.48 + finePore)));
          const b = Math.round(hVal * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          const shade = isMortar
            ? 0.55 + grain * 0.15
            : bevel * (0.82 + blockTint + (grain - 0.5) * 0.28 + finePore);
          data[idx] = Math.max(0, Math.min(255, Math.round(r255 * shade)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round(g255 * shade)));
          data[idx + 2] = Math.max(0, Math.min(255, Math.round(b255 * shade)));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'travertine_roman') {
    // Travertino Romano: bandas sedimentarias horizontales con cavidades porosas naturales
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const turb = fbm2D(u * 6, v * 12, 4, 601);
        const strata = Math.sin((v * 20 + turb * 1.8) * Math.PI) * 0.5 + 0.5;
        const poreNoise = fbm2D(u * 36, v * 10, 3, 619);
        const isPore = poreNoise < 0.27;
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const h = isPore ? 0.15 : 0.72 + strata * 0.22;
          const b = Math.round(h * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          const f = isPore ? 0.62 : 0.86 + strata * 0.18;
          data[idx] = Math.min(255, Math.round(r255 * f));
          data[idx + 1] = Math.min(255, Math.round(g255 * f));
          data[idx + 2] = Math.min(255, Math.round(b255 * f));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'cobblestone') {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const { f1, f2, cellHash } = voronoi2D(u, v, 8, 77);
        const edge = Math.max(0, Math.min(1, (f2 - f1) * 4.2));
        const micro = fbm2D(u * 18, v * 18, 4, 333);
        const dome = Math.max(0, 1.0 - f1 * 1.15);

        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const hVal = edge < 0.16 ? 0.08 : Math.min(1, (dome * 0.65 + micro * 0.35) * edge);
          const b = Math.round(hVal * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          const rockTone = 0.72 + (cellHash - 0.5) * 0.26 + (micro - 0.5) * 0.32;
          const mortarFactor = edge < 0.16 ? 0.38 : Math.min(1.0, 0.55 + edge * 0.5) * rockTone;
          data[idx] = Math.max(0, Math.min(255, Math.round(r255 * mortarFactor)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round(g255 * mortarFactor)));
          data[idx + 2] = Math.max(0, Math.min(255, Math.round(b255 * mortarFactor)));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'wood_oak' || type === 'wood_mahogany') {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const planks = 4;
    const plankW = size / planks;
    const isMahogany = type === 'wood_mahogany';

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const plankIdx = Math.floor(x / plankW);
        const dxGap = Math.min(x % plankW, plankW - (x % plankW));
        const u = x / size;
        const v = y / size;

        const warp = fbm2D(u * 6, v * 2.5, 4, 88 + plankIdx * 19) * (isMahogany ? 2.4 : 3.6);
        const rings = Math.sin((u * (isMahogany ? 42 : 28) + warp) * Math.PI * 2) * 0.5 + 0.5;
        const fiber = smoothNoise2D(u * 90, v * 12, 412) * 0.18;
        const plankTint = (hash2D(plankIdx, 0, 99) - 0.5) * 0.12;
        const isSeam = dxGap < 2.0;

        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const hVal = isSeam ? 0.08 : Math.max(0, Math.min(1, 0.38 + rings * 0.38 + fiber));
          const b = Math.round(hVal * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          const grainFactor = isSeam
            ? 0.25
            : 0.66 + rings * 0.36 + fiber + plankTint;
          data[idx] = Math.max(0, Math.min(255, Math.round(r255 * grainFactor)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round(g255 * (grainFactor * 0.94))));
          data[idx + 2] = Math.max(0, Math.min(255, Math.round(b255 * (grainFactor * 0.86))));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'tree_bark') {
    // Corteza de árbol centenario con fisuras verticales profundas
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const warp = fbm2D(u * 8, v * 4, 3, 701) * 0.45;
        const ridge = Math.abs(Math.sin((u * 16 + warp) * Math.PI * 2));
        const crag = fbm2D(u * 24, v * 14, 4, 733);
        const h = Math.pow(ridge, 0.65) * 0.65 + crag * 0.35;

        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.max(0, Math.min(255, Math.round(h * 255)));
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          const f = 0.45 + h * 0.72;
          data[idx] = Math.min(255, Math.round(r255 * f));
          data[idx + 1] = Math.min(255, Math.round(g255 * f));
          data[idx + 2] = Math.min(255, Math.round(b255 * f));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'water_caustics' || type === 'ocean_deep') {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const isOcean = type === 'ocean_deep';

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const warpX = u + Math.sin(v * Math.PI * 4) * 0.04;
        const warpY = v + Math.cos(u * Math.PI * 4) * 0.04;

        const { f1, f2 } = voronoi2D(warpX, warpY, isOcean ? 5 : 6, 123);
        const caustic = Math.pow(Math.max(0, 1.0 - (f2 - f1) * 2.8), isOcean ? 2.4 : 3.2);
        const ripple =
          Math.sin((u * 8 + v * 6) * Math.PI * 2) * 0.25 +
          Math.cos((u * 5 - v * 9) * Math.PI * 2) * 0.25 +
          0.5;

        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const hVal = Math.max(0, Math.min(1, ripple * 0.65 + caustic * 0.35));
          const b = Math.round(hVal * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          const depthFactor = (isOcean ? 0.55 : 0.68) + ripple * 0.22;
          const highlight = caustic * (isOcean ? 185 : 145);
          data[idx] = Math.max(0, Math.min(255, Math.round(r255 * depthFactor + highlight)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round(g255 * (depthFactor + 0.08) + highlight)));
          data[idx + 2] = Math.max(0, Math.min(255, Math.round(b255 * (depthFactor + 0.14) + highlight)));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'marble_carrara') {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const turb = fbm2D(u * 5.0, v * 5.0, 5, 555);
        const vein1 = Math.pow(Math.abs(Math.sin((u * 2.0 + v * 1.5 + turb * 2.6) * Math.PI)), 0.28);
        const goldVein = Math.pow(Math.max(0, 1.0 - Math.abs(Math.sin((u * 3.0 - v * 2.0 + turb * 3.1) * Math.PI)) * 12), 2.0);

        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const hVal = 0.78 + vein1 * 0.22 - goldVein * 0.12;
          const b = Math.max(0, Math.min(255, Math.round(hVal * 255)));
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          const lum = 0.62 + vein1 * 0.38;
          const r = Math.min(255, Math.round(r255 * lum + goldVein * 45));
          const g = Math.min(255, Math.round(g255 * lum + goldVein * 28));
          const b = Math.min(255, Math.round(b255 * lum - goldVein * 20));
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'marble_nero') {
    // Mármol Negro Marquina con vetas blancas de calcita y filamentos de oro
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const turb = fbm2D(u * 5.5, v * 5.5, 5, 811);
        const whiteVein = Math.pow(
          Math.max(0, 1.0 - Math.abs(Math.sin((u * 2.2 + v * 1.8 + turb * 2.9) * Math.PI)) * 9.5),
          1.8
        );
        const goldVein = Math.pow(
          Math.max(0, 1.0 - Math.abs(Math.cos((u * 3.1 - v * 2.4 + turb * 3.4) * Math.PI)) * 14.0),
          2.2
        );
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.round((0.68 + whiteVein * 0.25 + goldVein * 0.3) * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          const baseF = 0.75 + turb * 0.35;
          data[idx] = Math.min(255, Math.round(r255 * baseF + whiteVein * 210 + goldVein * 235));
          data[idx + 1] = Math.min(255, Math.round(g255 * baseF + whiteVein * 210 + goldVein * 175));
          data[idx + 2] = Math.min(255, Math.round(b255 * baseF + whiteVein * 215 + goldVein * 40));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'brick_mudejar') {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const rows = 12;
    const cols = 6;
    const rowH = size / rows;
    const colW = size / cols;

    for (let y = 0; y < size; y++) {
      const rIdx = Math.floor(y / rowH);
      const offX = (rIdx % 2) * (colW * 0.5);
      const dyJoint = Math.min(y % rowH, rowH - (y % rowH));

      for (let x = 0; x < size; x++) {
        const sx = (x + offX) % size;
        const cIdx = Math.floor(sx / colW);
        const dxJoint = Math.min(sx % colW, colW - (sx % colW));
        const jointDist = Math.min(dxJoint, dyJoint);
        const isMortar = jointDist < 3.5;

        const clayVar = (hash2D(cIdx, rIdx, 808) - 0.5) * 0.22;
        const clayGrain = fbm2D((x / size) * 22, (y / size) * 22, 3, 909);

        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const hVal = isMortar ? 0.1 : Math.min(1, (jointDist / 6.0) * (0.55 + clayGrain * 0.45));
          const b = Math.round(hVal * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          if (isMortar) {
            const m = Math.round((0.76 + (clayGrain - 0.5) * 0.15) * 235);
            data[idx] = m;
            data[idx + 1] = Math.round(m * 0.95);
            data[idx + 2] = Math.round(m * 0.85);
          } else {
            const f = 0.85 + clayVar + (clayGrain - 0.5) * 0.25;
            data[idx] = Math.max(0, Math.min(255, Math.round(r255 * f)));
            data[idx + 1] = Math.max(0, Math.min(255, Math.round(g255 * f)));
            data[idx + 2] = Math.max(0, Math.min(255, Math.round(b255 * f)));
          }
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'terracotta_roof') {
    // Teja Árabe Curva acanalada
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const cols = 8;
    const rows = 6;
    const colW = size / cols;
    const rowH = size / rows;
    for (let y = 0; y < size; y++) {
      const rIdx = Math.floor(y / rowH);
      const localY = (y % rowH) / rowH;
      for (let x = 0; x < size; x++) {
        const cIdx = Math.floor(x / colW);
        const localX = (x % colW) / colW;
        const arch = Math.sin(localX * Math.PI);
        const stepOverlap = localY < 0.12 ? 0.35 : 0.85 + localY * 0.15;
        const clayTint = (hash2D(cIdx, rIdx, 951) - 0.5) * 0.16;
        const h = arch * stepOverlap;
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.round(Math.max(0, Math.min(1, h)) * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          const f = 0.58 + h * 0.52 + clayTint;
          data[idx] = Math.min(255, Math.round(r255 * f));
          data[idx + 1] = Math.min(255, Math.round(g255 * f));
          data[idx + 2] = Math.min(255, Math.round(b255 * f));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'slate_roof') {
    // Pizarra negra laminada para tejados y chapiteles
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const rows = 10;
    const cols = 6;
    const rowH = size / rows;
    const colW = size / cols;
    for (let y = 0; y < size; y++) {
      const rIdx = Math.floor(y / rowH);
      const offX = (rIdx % 2) * (colW * 0.5);
      const dy = y % rowH;
      for (let x = 0; x < size; x++) {
        const sx = (x + offX) % size;
        const cIdx = Math.floor(sx / colW);
        const dx = Math.min(sx % colW, colW - (sx % colW));
        const isEdge = dy < 2.5 || dx < 1.8;
        const grain = fbm2D((x / size) * 20, (y / size) * 8, 3, 419);
        const tileTint = (hash2D(cIdx, rIdx, 421) - 0.5) * 0.15;
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const h = isEdge ? 0.12 : 0.55 + (dy / rowH) * 0.35 + grain * 0.12;
          const b = Math.round(Math.min(1, h) * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          const f = isEdge ? 0.35 : 0.78 + tileTint + (grain - 0.5) * 0.22;
          data[idx] = Math.min(255, Math.round(r255 * f));
          data[idx + 1] = Math.min(255, Math.round(g255 * f));
          data[idx + 2] = Math.min(255, Math.round(b255 * f));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'andalusi_tiles') {
    // Azulejo Andalusí / Alicatado Mudéjar con lacería de estrella de 8 puntas
    ctx.fillStyle = isBumpPass ? '#222222' : '#f8fafc';
    ctx.fillRect(0, 0, size, size);
    const tile = 128;
    for (let ty = 0; ty < size; ty += tile) {
      for (let tx = 0; tx < size; tx += tile) {
        const cx = tx + tile * 0.5;
        const cy = ty + tile * 0.5;
        // Junta de azulejo
        ctx.strokeStyle = isBumpPass ? '#101010' : '#cbd5e1';
        ctx.lineWidth = 3;
        ctx.strokeRect(tx + 1.5, ty + 1.5, tile - 3, tile - 3);

        // Estrella mudéjar de 8 puntas (2 cuadrados rotados 45°)
        for (let rot = 0; rot < 2; rot++) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((rot * Math.PI) / 4);
          ctx.fillStyle = isBumpPass
            ? '#e2e2e2'
            : rot === 0
            ? `rgb(${r255}, ${g255}, ${b255})`
            : '#d97706';
          ctx.strokeStyle = isBumpPass ? '#404040' : '#ffffff';
          ctx.lineWidth = 3;
          const s = tile * 0.52;
          ctx.fillRect(-s * 0.5, -s * 0.5, s, s);
          ctx.strokeRect(-s * 0.5, -s * 0.5, s, s);
          ctx.restore();
        }

        // Rosetón central turquesa / oro
        ctx.beginPath();
        ctx.arc(cx, cy, tile * 0.14, 0, Math.PI * 2);
        ctx.fillStyle = isBumpPass ? '#ffffff' : '#0f766e';
        ctx.fill();
      }
    }
  } else if (type === 'stained_glass') {
    // Vitral Gótico / Vidriera Catedral con emplomado negro y gemas translúcidas
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const palette = [
      [239, 68, 68],   // Rubí
      [37, 99, 235],   // Azul Cobalto
      [245, 158, 11],  // Ámbar Dorado
      [16, 185, 129],  // Esmeralda
      [168, 85, 247],  // Amatista
    ];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const { f1, f2, cellHash } = voronoi2D(u, v, 8, 509);
        const isLead = f2 - f1 < 0.065;
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = isLead ? 250 : Math.round((0.55 - f1 * 0.25) * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          if (isLead) {
            data[idx] = 24;
            data[idx + 1] = 26;
            data[idx + 2] = 32;
          } else {
            const pIdx = Math.floor(cellHash * palette.length) % palette.length;
            const col = palette[pIdx];
            const glow = 1.08 - f1 * 0.38;
            data[idx] = Math.min(255, Math.round(col[0] * glow));
            data[idx + 1] = Math.min(255, Math.round(col[1] * glow));
            data[idx + 2] = Math.min(255, Math.round(col[2] * glow));
          }
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'concrete_brutalist') {
    // Hormigón visto arquitectónico con juntas y coqueras
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const panelW = size / 2;
    const panelH = size / 4;
    for (let y = 0; y < size; y++) {
      const dy = Math.min(y % panelH, panelH - (y % panelH));
      for (let x = 0; x < size; x++) {
        const dx = Math.min(x % panelW, panelW - (x % panelW));
        const isSeam = Math.min(dx, dy) < 2.2;
        const n = fbm2D((x / size) * 16, (y / size) * 16, 4, 881);
        const speck = (hash2D(x, y, 887) - 0.5) * 0.1;
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.round((isSeam ? 0.15 : 0.48 + n * 0.42 + speck) * 255);
          data[idx] = Math.max(0, Math.min(255, b));
          data[idx + 1] = data[idx];
          data[idx + 2] = data[idx];
          data[idx + 3] = 255;
        } else {
          const f = isSeam ? 0.52 : 0.8 + (n - 0.5) * 0.28 + speck;
          data[idx] = Math.min(255, Math.round(r255 * f));
          data[idx + 1] = Math.min(255, Math.round(g255 * f));
          data[idx + 2] = Math.min(255, Math.round(b255 * f));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'desert_sand') {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const drift = fbm2D(u * 4.0, v * 4.0, 3, 612) * 0.35;
        const duneWave = Math.pow(Math.sin((v * 14.0 + u * 2.0 + drift) * Math.PI * 2) * 0.5 + 0.5, 0.75);
        const sparkle = (hash2D(x, y, 719) - 0.5) * 0.12;

        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const hVal = Math.max(0, Math.min(1, duneWave * 0.8 + 0.1 + sparkle));
          const b = Math.round(hVal * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          const shade = 0.76 + duneWave * 0.28 + sparkle;
          data[idx] = Math.max(0, Math.min(255, Math.round(r255 * shade)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round(g255 * shade)));
          data[idx + 2] = Math.max(0, Math.min(255, Math.round(b255 * shade)));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'moss_nature' || type === 'grass_meadow') {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const isGrass = type === 'grass_meadow';

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const patch = fbm2D(u * (isGrass ? 18 : 8), v * (isGrass ? 18 : 8), 5, 222);
        const microTuft = fbm2D(u * 32, v * 32, 3, 444);
        const isMoss = isGrass ? true : patch > 0.43;

        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const hVal = isMoss ? 0.45 + microTuft * 0.52 : 0.2 + patch * 0.4;
          const b = Math.max(0, Math.min(255, Math.round(hVal * 255)));
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          if (isMoss) {
            const mFactor = 0.65 + microTuft * 0.55;
            data[idx] = Math.max(0, Math.min(255, Math.round(r255 * mFactor)));
            data[idx + 1] = Math.max(0, Math.min(255, Math.round(g255 * (mFactor + 0.08))));
            data[idx + 2] = Math.max(0, Math.min(255, Math.round(b255 * (mFactor * 0.85))));
          } else {
            const rockGray = Math.round((0.38 + microTuft * 0.25) * 255);
            data[idx] = rockGray;
            data[idx + 1] = Math.round(rockGray * 1.02);
            data[idx + 2] = Math.round(rockGray * 0.96);
          }
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'ice_crystal' || type === 'fresh_snow') {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const isSnow = type === 'fresh_snow';

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = (x / size) * 6.0;
        const ny = (y / size) * 6.0;
        const n1 = fbm2D(nx, ny, 4, 312);
        const crack = isSnow
          ? 0
          : Math.pow(1.0 - Math.abs(Math.sin((nx * 1.8 - ny * 1.3 + n1 * 2.5) * Math.PI)), 8.0);
        const frost = hash2D(x, y, 71) * (isSnow ? 0.18 : 0.12);

        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.max(0, Math.min(255, Math.round((0.72 - crack * 0.55 + n1 * 0.18 + frost) * 255)));
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          const baseFactor = (isSnow ? 0.88 : 0.78) + n1 * 0.18 + frost * 0.4;
          const crackBoost = crack * 140;
          data[idx] = Math.max(0, Math.min(255, Math.round(r255 * baseFactor + crackBoost)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round(g255 * baseFactor + crackBoost)));
          data[idx + 2] = Math.max(0, Math.min(255, Math.round(b255 * (baseFactor + 0.06) + crackBoost)));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'brushed_metal') {
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      const rowScratch = hash2D(0, y, 19) * 0.24 + Math.sin((y / size) * Math.PI * 36) * 0.08;
      for (let x = 0; x < size; x++) {
        const fineStreak = smoothNoise2D((x / size) * 4.0, y * 0.75, 43) * 0.22;
        const sheen = Math.sin((x / size) * Math.PI * 2) * 0.08;
        const val = Math.max(0, Math.min(1, 0.65 + rowScratch + fineStreak + sheen));

        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.round(val * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          data[idx] = Math.max(0, Math.min(255, Math.round(r255 * val)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round(g255 * val)));
          data[idx + 2] = Math.max(0, Math.min(255, Math.round(b255 * val)));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'damascus_steel') {
    // Acero de Damasco con ondas fluidas de forja
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const warp = fbm2D(u * 6, v * 6, 4, 919) * 2.8;
        const wave = Math.sin((u * 12 + v * 8 + warp) * Math.PI * 2) * 0.5 + 0.5;
        const val = 0.45 + wave * 0.52;
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.round(val * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          data[idx] = Math.min(255, Math.round(r255 * val));
          data[idx + 1] = Math.min(255, Math.round(g255 * val));
          data[idx + 2] = Math.min(255, Math.round(b255 * val));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'gold_damascene') {
    ctx.fillStyle = isBumpPass ? '#383838' : `rgb(${Math.round(r255 * 0.42)}, ${Math.round(g255 * 0.36)}, ${Math.round(b255 * 0.22)})`;
    ctx.fillRect(0, 0, size, size);

    const tile = 64;
    ctx.strokeStyle = isBumpPass ? '#f5f5f5' : `rgb(${r255}, ${g255}, ${b255})`;
    ctx.lineWidth = 4;

    for (let y = 0; y <= size; y += tile) {
      for (let x = 0; x <= size; x += tile) {
        ctx.beginPath();
        ctx.moveTo(x, y - tile * 0.5);
        ctx.lineTo(x + tile * 0.5, y);
        ctx.lineTo(x, y + tile * 0.5);
        ctx.lineTo(x - tile * 0.5, y);
        ctx.closePath();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, tile * 0.24, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else if (type === 'copper_patina') {
    // Bronce / Cobre antiguo con pátina turquesa (cardenillo)
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const patinaMask = fbm2D(u * 9, v * 9, 4, 643);
        const micro = fbm2D(u * 28, v * 28, 3, 647);
        const isPatina = patinaMask > 0.48;
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.round((isPatina ? 0.6 + micro * 0.35 : 0.42 + micro * 0.2) * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          if (isPatina) {
            const f = 0.72 + micro * 0.38;
            data[idx] = Math.min(255, Math.round(68 * f));
            data[idx + 1] = Math.min(255, Math.round(198 * f));
            data[idx + 2] = Math.min(255, Math.round(176 * f));
          } else {
            const f = 0.78 + micro * 0.3;
            data[idx] = Math.min(255, Math.round(184 * f));
            data[idx + 1] = Math.min(255, Math.round(115 * f));
            data[idx + 2] = Math.min(255, Math.round(58 * f));
          }
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'carbon_weave') {
    const cell = 16;
    for (let y = 0; y < size; y += cell) {
      for (let x = 0; x < size; x += cell) {
        const step = ((x / cell) + (y / cell)) % 4;
        const isBright = step < 2;
        if (isBumpPass) {
          ctx.fillStyle = isBright ? '#dcdcdc' : '#525252';
        } else {
          const f = isBright ? 1.15 : 0.58;
          ctx.fillStyle = `rgb(${Math.min(255, Math.round(r255 * f))}, ${Math.min(255, Math.round(g255 * f))}, ${Math.min(255, Math.round(b255 * f))})`;
        }
        ctx.fillRect(x, y, cell - 1, cell - 1);
      }
    }
  } else if (type === 'leather_tufted') {
    // Cuero curtido con acolchado Capitonnée en rombo
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const cells = 4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * cells;
        const v = (y / size) * cells;
        // Coordenadas rotadas 45° para rombos de capitonnée
        const rx = (u + v) % 1.0;
        const ry = (u - v + cells) % 1.0;
        const dx = Math.min(rx, 1.0 - rx);
        const dy = Math.min(ry, 1.0 - ry);
        const seamDist = Math.min(dx, dy);
        const buttonDist = Math.hypot(dx, dy);
        const pebble = fbm2D((x / size) * 42, (y / size) * 42, 3, 521) * 0.16;
        const cushion = Math.min(1.0, seamDist * 3.2);
        const isButton = buttonDist < 0.08;

        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const h = isButton ? 0.85 : cushion * 0.78 + pebble;
          const b = Math.round(Math.max(0, Math.min(1, h)) * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          const f = isButton ? 0.45 : 0.52 + cushion * 0.48 + pebble;
          data[idx] = Math.min(255, Math.round(r255 * f));
          data[idx + 1] = Math.min(255, Math.round(g255 * f));
          data[idx + 2] = Math.min(255, Math.round(b255 * f));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'royal_velvet') {
    // Terciopelo / Damasco Real con brocado ornamental
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * 4 * Math.PI;
        const v = (y / size) * 4 * Math.PI;
        const damask = Math.sin(u) * Math.sin(v) + Math.cos(u * 2) * Math.cos(v * 2) * 0.5;
        const isGoldBrocade = damask > 0.65;
        const fuzz = (hash2D(x, y, 307) - 0.5) * 0.1;
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.round((isGoldBrocade ? 0.85 : 0.42 + fuzz) * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          if (isGoldBrocade) {
            data[idx] = 234;
            data[idx + 1] = 179;
            data[idx + 2] = 28;
          } else {
            const f = 0.78 + damask * 0.18 + fuzz;
            data[idx] = Math.min(255, Math.round(r255 * f));
            data[idx + 1] = Math.min(255, Math.round(g255 * f));
            data[idx + 2] = Math.min(255, Math.round(b255 * f));
          }
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'woven_linen') {
    // Trama de Lino / Lienzo Natural entrecruzado
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const warpThread = Math.sin((x / 4) * Math.PI);
        const weftThread = Math.sin((y / 4) * Math.PI);
        const weave = ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 ? warpThread : weftThread) * 0.22;
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.round(Math.max(0, Math.min(1, 0.55 + weave)) * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          const f = 0.86 + weave * 0.65;
          data[idx] = Math.min(255, Math.round(r255 * f));
          data[idx + 1] = Math.min(255, Math.round(g255 * f));
          data[idx + 2] = Math.min(255, Math.round(b255 * f));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'dragon_scales') {
    ctx.fillStyle = isBumpPass ? '#202020' : `rgb(${r255}, ${g255}, ${b255})`;
    ctx.fillRect(0, 0, size, size);
    const scaleW = 32;
    const scaleH = 24;
    for (let y = -scaleH; y < size + scaleH; y += scaleH * 0.75) {
      const rowOffset = Math.floor(y / scaleH) % 2 === 0 ? 0 : scaleW / 2;
      for (let x = -scaleW; x < size + scaleW; x += scaleW) {
        const cx = x + rowOffset;
        const cy = y;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, scaleW * 0.6, 0, Math.PI);
        ctx.closePath();

        const grad = ctx.createRadialGradient(cx, cy - 4, 2, cx, cy, scaleW * 0.6);
        if (isBumpPass) {
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.75, '#999999');
          grad.addColorStop(1, '#151515');
        } else {
          grad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
          grad.addColorStop(
            0.7,
            `rgba(${Math.max(0, r255 - 40)}, ${Math.max(0, g255 - 40)}, ${Math.max(0, b255 - 40)}, 0.9)`
          );
          grad.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
        }

        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = isBumpPass ? '#000000' : 'rgba(0, 0, 0, 0.75)';
        ctx.stroke();
        ctx.restore();
      }
    }
  } else if (type === 'biomech_plates') {
    ctx.fillStyle = isBumpPass ? '#808080' : `rgb(${r255}, ${g255}, ${b255})`;
    ctx.fillRect(0, 0, size, size);
    const step = 64;
    for (let x = 0; x < size; x += step) {
      for (let y = 0; y < size; y += step) {
        ctx.strokeStyle = isBumpPass ? '#101010' : 'rgba(15, 23, 42, 0.85)';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, step - 4, step - 4);

        ctx.fillStyle = isBumpPass ? '#c8c8c8' : 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(x + 4, y + 4, step - 8, step - 8);

        ctx.fillStyle = isBumpPass ? '#ffffff' : '#0f172a';
        ctx.beginPath();
        ctx.arc(x + 8, y + 8, 2.5, 0, Math.PI * 2);
        ctx.arc(x + step - 8, y + 8, 2.5, 0, Math.PI * 2);
        ctx.arc(x + 8, y + step - 8, 2.5, 0, Math.PI * 2);
        ctx.arc(x + step - 8, y + step - 8, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (type === 'magma_cracks') {
    ctx.fillStyle = isBumpPass ? '#b0b0b0' : '#141419';
    ctx.fillRect(0, 0, size, size);

    ctx.lineWidth = 4;
    ctx.strokeStyle = isBumpPass ? '#080808' : '#ff3700';
    ctx.shadowColor = isBumpPass ? 'transparent' : '#ff9900';
    ctx.shadowBlur = isBumpPass ? 0 : 12;

    const drawCrack = (
      x1: number,
      y1: number,
      length: number,
      angle: number,
      depth: number,
      seedIdx: number
    ) => {
      if (depth <= 0) return;
      const x2 = x1 + Math.cos(angle) * length;
      const y2 = y1 + Math.sin(angle) * length;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const r1 = hash2D(depth, seedIdx, 13);
      const r2 = hash2D(seedIdx, depth, 29);
      drawCrack(x2, y2, length * 0.75, angle + (r1 * 0.8 - 0.4), depth - 1, seedIdx + 1);
      if (r2 > 0.35) {
        drawCrack(x2, y2, length * 0.6, angle + (r2 * 0.8 + 0.25), depth - 1, seedIdx + 7);
      }
    };

    for (let i = 0; i < 8; i++) {
      const sx = (i * size) / 8 + 30;
      const sy = hash2D(i, 4, 91) * size;
      drawCrack(sx, sy, 55, hash2D(i, 9, 37) * Math.PI * 2, 4, i * 10);
    }
    ctx.shadowBlur = 0;
  } else if (type === 'solar_plasma') {
    // Plasma Estelar / Energía Arcana
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const n = fbm2D(u * 6, v * 6, 4, 977);
        const flare = Math.pow(Math.sin((u * 3 + v * 3 + n * 2.5) * Math.PI) * 0.5 + 0.5, 1.5);
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.round(flare * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          data[idx] = Math.min(255, Math.round(180 + flare * 75));
          data[idx + 1] = Math.min(255, Math.round(90 + flare * 155));
          data[idx + 2] = Math.min(255, Math.round(30 + Math.pow(flare, 3) * 220));
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'hologram_grid') {
    // Matriz Holográfica Sci-Fi
    ctx.fillStyle = isBumpPass ? '#202020' : '#082f49';
    ctx.fillRect(0, 0, size, size);
    const step = 32;
    ctx.strokeStyle = isBumpPass ? '#ffffff' : '#38bdf8';
    ctx.lineWidth = 2;
    for (let y = 0; y <= size; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    for (let x = 0; x <= size; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
  } else if (type === 'halftone_manga') {
    ctx.fillStyle = isBumpPass ? '#a0a0a0' : '#ffffff';
    ctx.fillRect(0, 0, size, size);

    const dotSpacing = 16;
    for (let x = 0; x < size; x += dotSpacing) {
      for (let y = 0; y < size; y += dotSpacing) {
        const distFromCenter = Math.hypot(x - size / 2, y - size / 2) / (size / 2);
        const radius = Math.max(1.5, Math.min(6.5, (1.0 - distFromCenter * 0.5) * 5.0));

        ctx.fillStyle = isBumpPass ? '#ffffff' : '#1e293b';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (type === 'cyber_circuits') {
    ctx.fillStyle = isBumpPass ? '#303030' : '#0a0f1d';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = isBumpPass ? '#e0e0e0' : '#06b6d4';
    ctx.lineWidth = 2.5;

    for (let i = 0; i < 18; i++) {
      let cx = (i * 32) % size;
      let cy = (i * 48) % size;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      cx += 40;
      ctx.lineTo(cx, cy);
      cy += 30;
      ctx.lineTo(cx, cy);
      cx += 60;
      ctx.lineTo(cx, cy);
      ctx.stroke();

      ctx.fillStyle = isBumpPass ? '#ffffff' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'beast_hide') {
    // Grano de piel: celdas de Voronoi periódicas (sin costuras al repetir)
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const big = voronoi2D(u, v, 18, 811);
        const fine = voronoi2D(u, v, 52, 829);
        const crease = Math.min(1, (big.f2 - big.f1) * 3.2); // 0 en la grieta entre poros
        const pore = Math.min(1, (fine.f2 - fine.f1) * 2.4);
        const h = 0.35 + 0.45 * crease + 0.12 * pore + 0.08 * big.cellHash;
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.round(Math.min(1, h) * 255);
          data[idx] = b;
          data[idx + 1] = b;
          data[idx + 2] = b;
        } else {
          const f = 0.74 + 0.22 * crease + 0.06 * pore + 0.1 * (big.cellHash - 0.5);
          data[idx] = Math.min(255, Math.round(r255 * f));
          data[idx + 1] = Math.min(255, Math.round(g255 * f));
          data[idx + 2] = Math.min(255, Math.round(b255 * f));
        }
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'animal_fur') {
    // Pelaje: hebras finas a lo largo de V, mechones y ondulación suave (todo periódico)
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const wave = 0.012 * Math.sin(2 * Math.PI * (v * 2 + periodicNoise2D(u, v, 4, 4, 905) * 0.6));
        const uu = (u + wave + 1) % 1;
        const strands = periodicNoise2D(uu, v, 160, 10, 911);
        const fine = periodicNoise2D(uu, v, 320, 18, 919);
        const clump = periodicFbm(uu, v, 12, 6, 3, 923);
        const tip = Math.pow(strands, 3);
        const h = Math.min(1, 0.25 + 0.45 * strands + 0.15 * fine + 0.25 * clump);
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.round(h * 255);
          data[idx] = b; data[idx + 1] = b; data[idx + 2] = b;
        } else {
          const f = 0.58 + 0.34 * h + 0.18 * tip;
          data[idx] = Math.min(255, Math.round(r255 * f));
          data[idx + 1] = Math.min(255, Math.round(g255 * f));
          data[idx + 2] = Math.min(255, Math.round(b255 * f));
        }
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'feathers') {
    // Plumas solapadas en filas desplazadas; cada pluma con raquis central y barbas inclinadas
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const cols = 8;
    const rows = 8;
    const len = 1.7; // largo de la pluma en filas (se solapan)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cols;
        const gy = (y / size) * rows;
        let shade = 0.35; // hueco oscuro entre plumas
        let height = 0.2;
        const r0 = Math.floor(gy);
        // de la fila más alta (debajo) a la más baja (encima): la última que cubre el píxel gana
        for (let dr = -2; dr <= 0; dr++) {
          const r = r0 + dr;
          const off = (((r % 2) + 2) % 2) * 0.5;
          for (let dc = -1; dc <= 1; dc++) {
            const cx = Math.floor(gx - off) + dc + off + 0.5;
            const t = (gy - r) / len; // 0 en la base, 1 en la punta
            if (t < 0 || t > 1) continue;
            const halfW = 0.62 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.08));
            const d = (gx - cx) / Math.max(0.001, halfW);
            if (Math.abs(d) > 1) continue;
            const wr = ((r % rows) + rows) % rows;
            const wc = ((Math.round(cx - off) % cols) + cols) % cols;
            const tone = hash2D(wc, wr, 947);
            const barbs = 0.5 + 0.5 * Math.sin((t * 26 + Math.abs(d) * 5) * Math.PI);
            const rachis = Math.abs(d) < 0.07 ? 0.25 : 0;
            const edge = 1 - Math.pow(Math.abs(d), 6);
            shade = (0.62 + 0.22 * tone + 0.12 * barbs + rachis) * (0.55 + 0.45 * edge) * (0.75 + 0.25 * t);
            height = 0.35 + 0.35 * t + 0.15 * barbs + rachis * 0.6 - 0.25 * Math.pow(Math.abs(d), 4);
          }
        }
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.round(Math.max(0, Math.min(1, height)) * 255);
          data[idx] = b; data[idx + 1] = b; data[idx + 2] = b;
        } else {
          data[idx] = Math.min(255, Math.round(r255 * shade));
          data[idx + 1] = Math.min(255, Math.round(g255 * shade));
          data[idx + 2] = Math.min(255, Math.round(b255 * shade));
        }
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'bone_ivory') {
    // Hueso: vetas a lo largo, poros pequeños y grietas finas aisladas
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const streak = periodicFbm(u, v, 48, 4, 3, 961);
        const blotch = periodicFbm(u, v, 6, 6, 3, 967);
        const pores = voronoi2D(u, v, 40, 971);
        const pore = pores.f1 < 0.18 ? 1 - pores.f1 / 0.18 : 0;
        const cr = voronoi2D(u, v, 7, 977);
        const crackMask = Math.max(0, (periodicNoise2D(u, v, 5, 5, 983) - 0.7) / 0.3);
        const crack = 0.5 * crackMask * Math.max(0, 1 - (cr.f2 - cr.f1) / 0.02);
        const h = 0.62 + 0.18 * streak + 0.12 * blotch - 0.35 * pore * 0.6 - 0.45 * crack;
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.round(Math.max(0, Math.min(1, h)) * 255);
          data[idx] = b; data[idx + 1] = b; data[idx + 2] = b;
        } else {
          const f = 0.78 + 0.16 * streak + 0.1 * blotch - 0.22 * pore - 0.4 * crack;
          // ligero amarilleo en las zonas manchadas
          data[idx] = Math.min(255, Math.round(r255 * f));
          data[idx + 1] = Math.min(255, Math.round(g255 * (f - 0.03 * blotch)));
          data[idx + 2] = Math.min(255, Math.round(b255 * (f - 0.08 * blotch)));
        }
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'chitin_carapace') {
    // Quitina: placas segmentadas (bandas en V) con borde solapado, poros y moteado
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const bands = 7;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const bend = 0.018 * Math.sin(2 * Math.PI * u) + 0.03 * periodicNoise2D(u, v, 6, 6, 991);
        const pos = (((v + bend) * bands) % 1 + 1) % 1; // 0 = borde superior de la placa
        const ridge = pos < 0.08 ? pos / 0.08 : 1;
        const curve = Math.sin(Math.PI * pos);
        const pits = voronoi2D(u, v, 34, 997);
        const pit = pits.f1 < 0.16 ? 1 - pits.f1 / 0.16 : 0;
        const mottle = periodicFbm(u, v, 8, 8, 3, 1009);
        const seg = 0;
        const h = 0.25 + 0.55 * curve * ridge - 0.15 * pit - 0.2 * seg;
        const idx = (y * size + x) * 4;
        if (isBumpPass) {
          const b = Math.round(Math.max(0, Math.min(1, h)) * 255);
          data[idx] = b; data[idx + 1] = b; data[idx + 2] = b;
        } else {
          const f = (0.5 + 0.3 * curve + 0.3 * mottle) * (0.6 + 0.4 * ridge) - 0.12 * pit - 0.15 * seg;
          data[idx] = Math.min(255, Math.round(r255 * f));
          data[idx + 1] = Math.min(255, Math.round(g255 * f));
          data[idx + 2] = Math.min(255, Math.round(b255 * f));
        }
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (type === 'smooth_skin') {
    const grad = ctx.createLinearGradient(0, 0, size, size);
    if (isBumpPass) {
      grad.addColorStop(0, '#808080');
      grad.addColorStop(1, '#888888');
    } else {
      grad.addColorStop(0, `rgb(${r255}, ${g255}, ${b255})`);
      grad.addColorStop(
        0.5,
        `rgb(${Math.min(255, r255 + 25)}, ${Math.min(255, g255 + 15)}, ${Math.min(255, b255 + 15)})`
      );
      grad.addColorStop(
        1,
        `rgb(${Math.max(0, r255 - 20)}, ${Math.max(0, g255 - 20)}, ${Math.max(0, b255 - 20)})`
      );
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
}

/**
 * Genera texturas procedurales 2D (Color Albedo en sRGB) con repetición perfecta.
 * Si `baseHex` es `'auto'`, utiliza la paleta cromática natural propia de la textura (piedra, madera, agua, etc.).
 */
export function generateProceduralTexture(
  type: TexturePatternType,
  baseHex: string = 'auto',
  repeatScale: number = 2
): THREE.CanvasTexture | null {
  if (type === 'none') return null;

  const cacheKey = `${type}_${baseHex}_${repeatScale}`;
  if (colorTextureCache.has(cacheKey)) {
    return colorTextureCache.get(cacheKey)!;
  }

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  renderPatternToCanvas(ctx, size, type, false, baseHex);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatScale, repeatScale);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  colorTextureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Genera el mapa de alturas / relieve (Bump Map en espacio lineal) asociado a la textura procedural.
 */
export function generateProceduralBumpTexture(
  type: TexturePatternType,
  repeatScale: number = 2
): THREE.CanvasTexture | null {
  if (type === 'none') return null;

  const cacheKey = `${type}_bump_${repeatScale}`;
  if (bumpTextureCache.has(cacheKey)) {
    return bumpTextureCache.get(cacheKey)!;
  }

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  renderPatternToCanvas(ctx, size, type, true, 'auto');

  const bumpTex = new THREE.CanvasTexture(canvas);
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.repeat.set(repeatScale, repeatScale);
  bumpTex.anisotropy = 8;
  bumpTex.needsUpdate = true;

  bumpTextureCache.set(cacheKey, bumpTex);
  return bumpTex;
}
