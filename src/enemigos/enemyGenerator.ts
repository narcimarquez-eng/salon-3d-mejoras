import {
  ARCHETYPE_PRESETS,
  RACE_CATEGORY_LABELS,
  OPTIMIZATION_TIERS,
  type ArchetypeId,
  type EnemyConfig,
  type MeshDensity,
  type RaceCategory,
  type TexturePatternId,
  type ArchetypeAnatomyCategory,
} from './vendor/types/enemy';
import {
  createProceduralTextureSet,
  type ProceduralTextureSet,
} from './vendor/three/proceduralTextures';
import { buildProceduralEnemy } from './vendor/three/enemyBuilder';
import { serializeEnemyToGLBData } from './vendor/three/exporters';
import versionData from './vendor/version.json';

export type MonsterTier = MeshDensity;

export interface MonsterInfo {
  key: string;
  name: string;
  title: string;
  categoryLabel: string;
  raceCategory?: RaceCategory;
  rpgTier: string;
  element: string;
  polycount: number;
  texturePattern?: TexturePatternId;
  anatomyCategory?: ArchetypeAnatomyCategory;
}

export const MONSTER_TIERS: { id: MonsterTier; label: string }[] = OPTIMIZATION_TIERS.map((t) => ({
  id: t.id,
  label: t.label,
}));

export const MONSTER_LIST: MonsterInfo[] = (
  Object.entries(ARCHETYPE_PRESETS) as [ArchetypeId, EnemyConfig][]
).map(([key, cfg]) => ({
  key,
  name: cfg.name,
  title: cfg.title,
  categoryLabel: RACE_CATEGORY_LABELS[cfg.raceCategory] || cfg.raceCategory,
  raceCategory: cfg.raceCategory,
  rpgTier: `${cfg.stats.tier} (Nv.${cfg.stats.level})`,
  element: cfg.stats.element,
  polycount: 24000,
  texturePattern: cfg.materials.texturePattern,
  anatomyCategory: cfg.morphology.anatomyCategory,
}));

let sharedTextureSet: ProceduralTextureSet | null = null;

function getSharedTextureSet(): ProceduralTextureSet {
  if (!sharedTextureSet) {
    sharedTextureSet = createProceduralTextureSet(4);
  }
  return sharedTextureSet;
}

export async function listMonsters(): Promise<MonsterInfo[]> {
  return MONSTER_LIST;
}

export async function getEnemigoVersion(): Promise<{ commit: string; date: string }> {
  return {
    commit: versionData.commit || 'f53a67e',
    date: versionData.date || '2026-11-03',
  };
}

export async function generateMonsterGlb(
  key: string,
  tier: MonsterTier
): Promise<{
  bytes: Uint8Array<ArrayBuffer>;
  filename: string;
  info: MonsterInfo;
  triangles: number;
}> {
  const preset =
    ARCHETYPE_PRESETS[key as ArchetypeId] || ARCHETYPE_PRESETS.elder_dragon;
  const info =
    MONSTER_LIST.find((m) => m.key === key) || MONSTER_LIST[0];

  const config: EnemyConfig = {
    ...preset,
    morphology: {
      ...preset.morphology,
      meshDensity: tier,
    },
    materials: {
      ...preset.materials,
    },
    stats: {
      ...preset.stats,
    },
  };

  const textures = getSharedTextureSet();
  const rig = buildProceduralEnemy(config, textures, false, false);
  rig.exportableGroup.userData.optimizationTier = tier;

  const glbBuffer = (await serializeEnemyToGLBData(
    rig,
    'arcane_sparks',
    true
  )) as ArrayBuffer;

  const bytes = new Uint8Array(glbBuffer);
  const safeKey = key.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const filename = `${safeKey}_${tier}.glb`;

  return {
    bytes,
    filename,
    info,
    triangles: (rig as { totalTriangles?: number }).totalTriangles || info.polycount,
  };
}
