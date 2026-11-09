// @ts-nocheck
// Copiado de Enemigo-rpg (f53a67e) con scripts/sync-enemigos.mjs. No editar aquí.
export type MaterialPresetId =
  | 'dragon_crimson_scales'
  | 'feral_fur_hide'
  | 'blued_steel'
  | 'anisotropic_gold'
  | 'abyssal_obsidian'
  | 'ancient_bone'
  | 'arcane_crystal'
  | 'corroded_bronze';

export interface MaterialPresetDef {
  label: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  underbodyColor: string;
  emissiveColor: string;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
  anisotropy: number;
  crystalTransmission: number;
  grainWearIntensity: number;
}

export const MATERIAL_PRESETS: Record<MaterialPresetId, MaterialPresetDef> = {
  dragon_crimson_scales: {
    label: 'Escamas de Dragón Ígneo',
    description: 'Dermis reptiliana iridiscente con placas ventrales de bronce e ígor ardiente.',
    primaryColor: '#7a161b',
    secondaryColor: '#d49442',
    underbodyColor: '#261314',
    emissiveColor: '#ff5722',
    emissiveIntensity: 2.3,
    metalness: 0.48,
    roughness: 0.34,
    anisotropy: 0.55,
    crystalTransmission: 0.8,
    grainWearIntensity: 0.9,
  },
  feral_fur_hide: {
    label: 'Pelaje y Cuero Salvaje',
    description: 'Piel orgánica densa de bestia alfa con colmillos de marfil y ojos de ámbar.',
    primaryColor: '#3d352e',
    secondaryColor: '#a69378',
    underbodyColor: '#1b1815',
    emissiveColor: '#f59e0b',
    emissiveIntensity: 1.8,
    metalness: 0.08,
    roughness: 0.78,
    anisotropy: 0.15,
    crystalTransmission: 0.4,
    grainWearIntensity: 1.05,
  },
  blued_steel: {
    label: 'Acero Pavonado Real',
    description: 'Placas forjadas de alta densidad con ribetes de bronce templado.',
    primaryColor: '#28364d',
    secondaryColor: '#a88756',
    underbodyColor: '#141821',
    emissiveColor: '#38bdf8',
    emissiveIntensity: 1.5,
    metalness: 0.88,
    roughness: 0.24,
    anisotropy: 0.65,
    crystalTransmission: 0.75,
    grainWearIntensity: 0.8,
  },
  anisotropic_gold: {
    label: 'Oro Bruñido Celestial',
    description: 'Aleación solar con anisotropía cepillada y núcleo radiante.',
    primaryColor: '#d4a349',
    secondaryColor: '#f3e5ab',
    underbodyColor: '#2c221e',
    emissiveColor: '#fbbf24',
    emissiveIntensity: 1.9,
    metalness: 0.95,
    roughness: 0.16,
    anisotropy: 0.85,
    crystalTransmission: 0.9,
    grainWearIntensity: 0.65,
  },
  abyssal_obsidian: {
    label: 'Obsidiana Abisal',
    description: 'Roca volcánica vítrea con vetas de magma carmesí.',
    primaryColor: '#1a1724',
    secondaryColor: '#433354',
    underbodyColor: '#0d0b12',
    emissiveColor: '#f43f5e',
    emissiveIntensity: 2.1,
    metalness: 0.45,
    roughness: 0.18,
    anisotropy: 0.2,
    crystalTransmission: 0.85,
    grainWearIntensity: 0.95,
  },
  ancient_bone: {
    label: 'Hueso y Quitina Ancestral',
    description: 'Exoesqueleto orgánico calcificado con energía necrótica.',
    primaryColor: '#cbbba0',
    secondaryColor: '#5c5346',
    underbodyColor: '#1f1c18',
    emissiveColor: '#10b981',
    emissiveIntensity: 1.8,
    metalness: 0.15,
    roughness: 0.68,
    anisotropy: 0.0,
    crystalTransmission: 0.6,
    grainWearIntensity: 1.1,
  },
  arcane_crystal: {
    label: 'Cristal Etéreo Arcano',
    description: 'Coraza facetada semitranslúcida con refracción de vacío.',
    primaryColor: '#312e81',
    secondaryColor: '#818cf8',
    underbodyColor: '#111827',
    emissiveColor: '#a855f7',
    emissiveIntensity: 2.2,
    metalness: 0.35,
    roughness: 0.12,
    anisotropy: 0.4,
    crystalTransmission: 0.95,
    grainWearIntensity: 0.7,
  },
  corroded_bronze: {
    label: 'Bronce de Cripta Oxidado',
    description: 'Metal antiguo con pátina verdosa y fuego de forja.',
    primaryColor: '#6b4c35',
    secondaryColor: '#3d6b5e',
    underbodyColor: '#1a1615',
    emissiveColor: '#84cc16',
    emissiveIntensity: 1.7,
    metalness: 0.78,
    roughness: 0.46,
    anisotropy: 0.35,
    crystalTransmission: 0.5,
    grainWearIntensity: 1.2,
  },
};
