import type { MonsterInfo, MonsterTier } from './enemyGenerator';
import type { GlbZone, ZonePlan } from '../utils/glbZoneOptimizer';
import { suggestZoneChoice } from '../utils/glbZoneOptimizer';
import type { TexturePatternType } from '../utils/proceduralTextures';

export type MonsterSurfaceKey =
  | 'dragon_scales'
  | 'beast_hide'
  | 'animal_fur'
  | 'feathers'
  | 'stone_ashlar'
  | 'bone_ivory'
  | 'damascus_steel'
  | 'chitin_carapace'
  | 'tree_bark';

export const SURFACE_LABELS: Record<MonsterSurfaceKey, string> = {
  dragon_scales: 'Escamas de Dragón',
  beast_hide: 'Piel de Bestia',
  animal_fur: 'Pelaje Denso',
  feathers: 'Plumaje',
  stone_ashlar: 'Piedra / Obsidiana',
  bone_ivory: 'Hueso y Marfil',
  damascus_steel: 'Acero de Damasco',
  chitin_carapace: 'Caparazón de Quitina',
  tree_bark: 'Corteza Ancestral',
};

export function monsterSurface(info: MonsterInfo | string): MonsterSurfaceKey {
  const key = (typeof info === 'string' ? info : `${info.key} ${info.name}`).toLowerCase();
  const anatomy = typeof info === 'string' ? undefined : info.anatomyCategory;
  const pattern = typeof info === 'string' ? undefined : info.texturePattern;

  if (anatomy === 'Undead' || /(skeleton|lich|bone|skull|ossuary|mummy|zombie|necro|undead)/.test(key)) {
    return 'bone_ivory';
  }
  if ( /(treant|spriggan|bark|briar|wood)/.test(key)) {
    return 'tree_bark';
  }
  if ( /(phoenix|griffin|harpy|hawk|raptor|owl|crow|raven|valkyrie)/.test(key)) {
    return 'feathers';
  }
  if (anatomy === 'Chitin' || pattern === 'chitin_fur' || /(spider|scorpion|chitin|beetle|mantid|qiraji|silithid|crab|arachnid)/.test(key)) {
    return 'chitin_carapace';
  }
  if (anatomy === 'Scaled' || pattern === 'scales' || /(dragon|wyrm|drake|hydra|naga|serpent|viper|lizard|croc|turtle|toad|newt|kraken|leviathan)/.test(key)) {
    return 'dragon_scales';
  }
  if (anatomy === 'Elemental' || pattern === 'runic_obsidian' || /(golem|elemental|obsidian|crystal|iceberg|infernal|stone)/.test(key)) {
    return 'stone_ashlar';
  }
  if (pattern === 'wolf_fur' || /(wolf|warg|bear|boar|stag|panther|tiger|lion|fox|hyena|ram|badger|rat|bat|lynx|ape|mandrill|leopard|moose|wolverine|bison|rhino|mammoth|minotaur|centaur|cerberus|jackal|gnoll|kobold|furbolg|worgen|pandaren|tauren)/.test(key)) {
    return 'animal_fur';
  }
  return 'beast_hide';
}

const SURFACE_TO_PATTERN: Record<MonsterSurfaceKey, TexturePatternType> = {
  dragon_scales: 'dragon_scales',
  beast_hide: 'beast_hide',
  animal_fur: 'animal_fur',
  feathers: 'feathers',
  stone_ashlar: 'stone_ashlar',
  bone_ivory: 'travertine_roman',
  damascus_steel: 'damascus_steel',
  chitin_carapace: 'biomech_plates',
  tree_bark: 'tree_bark',
};

const TIER_MAX_TEX_SIZE: Record<MonsterTier, number> = {
  completo: 512,
  high: 384,
  medium: 256,
  low: 128,
  minimum: 64,
};

export function recommendMonsterPlans(
  info: MonsterInfo,
  tier: MonsterTier,
  zones: GlbZone[] | unknown
): Record<string, string> {
  const surface = monsterSurface(info);
  const mainPattern = SURFACE_TO_PATTERN[surface];
  const maxSize = TIER_MAX_TEX_SIZE[tier] ?? 256;
  const out: Record<string, string> = {
    __tier: tier,
    __maxSize: String(maxSize),
    __surface: mainPattern,
  };

  if (Array.isArray(zones)) {
    for (const z of zones as GlbZone[]) {
      const nameLower = (z.name || '').toLowerCase();
      if (z.effect || /(rune|emiss|glow|aura|trail|breath|crystal|core)/.test(nameLower)) {
        out[z.name] = 'keep';
      } else if (/(primary|body|armor|torso|skin)/.test(nameLower)) {
        out[z.name] = mainPattern;
      } else if (/(secondary|trim|pauldron|helm)/.test(nameLower)) {
        out[z.name] = surface === 'bone_ivory' ? 'travertine_roman' : 'damascus_steel';
      } else if (/(hair|fur|mane)/.test(nameLower)) {
        out[z.name] = 'animal_fur';
      } else {
        const sug = suggestZoneChoice(z, true);
        out[z.name] = sug.kind === 'pattern' ? sug.pattern : 'keep';
      }
    }
  }
  return out;
}
