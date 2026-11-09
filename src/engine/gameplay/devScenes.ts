import { BLUE_JEWEL_FLAG, PURPLE_JEWEL_FLAG, RED_JEWEL_FLAG, YELLOW_JEWEL_FLAG } from '../core/constants';
import type { InventoryItemId, RoomPortal } from '../core/types';

export type DevRoom = {
  room: number;
  resource?: 'WILLOW' | 'BRIDGE' | 'XEDGEC' | 'ALGAE';
  flags?: number[];
  jewels?: number[];
  items?: InventoryItemId[];
  via?: [room: number, side: RoomPortal['side']];
  opening?: boolean;
  ending?: 'reunion' | 'credits';
};
export type DevRoomScene = { label: string; room: DevRoom };
type DevIntroScene = { label: string; intro: string };
export type DevScene = DevRoomScene | DevIntroScene;

export const devHighlights: DevRoomScene[] = [
  { label: 'Malcolm’s final battle', room: { room: 210, via: [209, 'east'] } },
  { label: 'Reunion with Kallak', room: { room: 210, ending: 'reunion' } },
  { label: 'Original credits', room: { room: 210, ending: 'credits' } },
  { label: 'Brandon climbs to the house', room: { room: 0, opening: true } },
  { label: 'Conversation with the tree', room: { room: 0 } },
  { label: 'Brynn and the letter', room: { room: 2, items: ['letter', 'rose'] } },
  { label: 'Catching the teardrop', room: { room: 8 } },
  { label: 'Healing the willow', room: { room: 4, items: ['teardrop'] } },
  { label: 'Herman and the broken bridge', room: { room: 7, items: ['saw'] } },
  { label: 'Amulet discovery', room: { room: 6, items: ['marble', 'silverRose'] } },
  { label: 'Darm and Brandywine', room: { room: 27, items: ['item-46'] } },
  { label: 'Healing the songbird', room: { room: 30 } },
  { label: 'Malcolm at the grotto', room: { room: 25, items: ['item-55'] } },
  { label: 'The falling branch', room: { room: 39, via: [53, 'west'] } },
  { label: 'Malcolm ruins the fountain', room: { room: 42, flags: [161], via: [43, 'west'] } },
  { label: 'Brewing potions with Zanthia', room: { room: 45, flags: [161], items: ['item-18', 'item-6', 'item-17', 'item-78'] } },
  { label: 'Mixing potions in the crystal cavern', room: { room: 49, flags: [161], items: ['item-60', 'item-64', 'item-67'] } },
  { label: 'The Faun’s trade', room: { room: 48, items: ['apple'], flags: [188], via: [47, 'east'] } },
  { label: 'Pegasus flight', room: { room: 52, items: ['item-67', 'item-24', 'item-57', 'item-18'] } },
  { label: 'Katherine’s apparition', room: { room: 200, jewels: [YELLOW_JEWEL_FLAG, PURPLE_JEWEL_FLAG, BLUE_JEWEL_FLAG], items: ['item-18'] } },
  { label: 'Malcolm at the castle entrance', room: { room: 205, via: [204, 'north'] } },
  { label: 'The revolving fireplace', room: { room: 207 } },
  { label: 'The catacomb force field', room: { room: 232 } },
  { label: 'Herman in the upper castle', room: { room: 218 } },
  { label: 'The Music Room bells', room: { room: 226 } },
  { label: 'The royal regalia', room: { room: 209, flags: [220, 221], items: ['item-104', 'item-103', 'item-24'] } },
];

export const devVariants: DevRoomScene[] = [
  { label: 'A thriving tree', room: { room: 4, resource: 'WILLOW', flags: [67] } },
  { label: 'A rickety bridge', room: { room: 7, resource: 'BRIDGE' } },
  { label: 'Herman’s work site', room: { room: 13, resource: 'XEDGEC' } },
  { label: 'A ruined fountain', room: { room: 42, resource: 'ALGAE', flags: [161, 163], items: ['item-76'] } },
];

export const devIntroScenes: DevIntroScene[] = [
  { label: 'Westwood logo', intro: 'westwood' },
  { label: 'AkulaFlow logo', intro: 'akulaflow' },
  { label: 'Kyrandia title scroll', intro: 'kyrandia_scroll' },
  { label: 'The story of Malcolm', intro: 'story_text' },
  { label: 'Shore before the attack', intro: 'shore_anim' },
  { label: 'Malcolm attacks the shore', intro: 'shore_destruct' },
  { label: 'Malcolm and the tree', intro: 'tree_anim_1' },
  { label: 'The enchanted tree', intro: 'tree_anim_2' },
  { label: 'Kallak at his desk', intro: 'kallak_writing' },
  { label: 'Malcolm confronts Kallak', intro: 'kallak_malcolm' },
];

export function devRoomFlags({ room, flags = [], jewels }: DevRoom) {
  return [...(room > 0 ? [53] : []),
    ...(room > 16 ? [45] : []),
    ...(jewels ?? [
      ...(room > 16 ? [YELLOW_JEWEL_FLAG] : []),
      ...(room >= 37 ? [PURPLE_JEWEL_FLAG] : []),
      ...(room >= 199 ? [RED_JEWEL_FLAG, BLUE_JEWEL_FLAG] : []),
    ]),
    ...flags];
}
