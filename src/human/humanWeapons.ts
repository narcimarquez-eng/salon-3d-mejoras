import type { Object3D } from 'three';
import type { HumanRig } from './humanRig';

export type HumanWeaponId = 'none' | 'sword' | 'axe' | 'staff' | 'bow' | 'dagger';
export type HumanOffhandId = 'none' | 'shield' | 'torch' | 'spellbook' | 'buckler';

export const HUMAN_WEAPONS: { id: HumanWeaponId; label: string }[] = [
  { id: 'none', label: 'Ninguna' },
  { id: 'sword', label: 'Espada de Acero' },
  { id: 'axe', label: 'Hacha de Combate' },
  { id: 'staff', label: 'Báculo de Mago' },
  { id: 'bow', label: 'Arco Largo' },
  { id: 'dagger', label: 'Daga Sombría' },
];

export const HUMAN_OFFHANDS: { id: HumanOffhandId; label: string }[] = [
  { id: 'none', label: 'Ninguno' },
  { id: 'shield', label: 'Escudo de Roble' },
  { id: 'torch', label: 'Antorcha Encendida' },
  { id: 'spellbook', label: 'Grimorio Arcano' },
  { id: 'buckler', label: 'Rodela Metálica' },
];

export function attachHumanEquipment(
  _rootOrSkinned: Object3D,
  _rig?: HumanRig | null,
  _weapon: HumanWeaponId = 'none',
  _offhand: HumanOffhandId = 'none'
): { tris: number; verts: number } {
  return { tris: 0, verts: 0 };
}


