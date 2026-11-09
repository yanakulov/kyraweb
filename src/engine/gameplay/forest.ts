// Original EMC host operations and palette data follow ScummVM's Kyra LoK engine.
// SPDX-License-Identifier: GPL-3.0-or-later
import { findWalkPath, pathDirection } from "./pathfinding";
import specialPalettes from "../resources/specialPalettes.json";
import { runEmc, type EmcProgram } from "../../../extractor/emc.mjs";
import type { RoomAction } from "./roomScript";
import type { RoomSnapshot, Vec2, InventoryItemId, SceneItem } from "../core/types";
import type { CursorTrack, WorldRoom } from "./world";
import { actorScaleAt } from '../characters/brandonFrames';
import { BLUE_JEWEL_FLAG, BLUE_JEWEL_POS, INVISIBILITY_MS, isCatacombRoom, isCastleRoom, isWorldRoomId, isShadowrealmRoom, PURPLE_JEWEL_FLAG, PURPLE_JEWEL_POS, RED_JEWEL_FLAG, RED_JEWEL_POS, YELLOW_JEWEL_FLAG, YELLOW_JEWEL_POS } from '../core/constants';

export type ForestRoom = WorldRoom & {
  program: EmcProgram;
  durations: Record<number, number>;
  clipFrames: Record<string, number>;
  npcFrames: Record<number, { xOffset: number; yOffset: number }>;
};
export type ForestData = { rooms: Record<string, ForestRoom>; letter: { sealed: RoomAction[]; readable: RoomAction[] };
  self: Record<number, RoomAction[]>; caveSelf: RoomAction[]; flute: Pick<ForestRoom, 'program' | 'durations'> };
export async function loadForestData(
  src: string,
  signal?: AbortSignal,
): Promise<ForestData> {
  const response = await fetch(src, { signal });
  if (!response.ok)
    throw new Error(`Failed to load forest (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const decoded =
    bytes[0] === 0x1f && bytes[1] === 0x8b
      ? await new Response(
          new Blob([bytes])
            .stream()
            .pipeThrough(new DecompressionStream("gzip")),
        ).text()
      : new TextDecoder().decode(bytes);
  signal?.throwIfAborted();
  return JSON.parse(decoded);
}
export type ForestState = {
  flags: Set<number>;
  files: Record<number, string>;
  phasing: boolean;
  vase: number;
  birthstones: number[];
  scatteredGems: Record<number, number[]>;
  poison: number;
  cauldron: number;
  crystals: [number, number];
  pendingItems: Record<number, SceneItem[]>;
  merith: { x: number; y: number; facing: number; shape: number; room: number };
  herman: { x: number; y: number; facing: number; shape: number; room: number };
};
export function createForestState(): ForestState {
  const state: ForestState = {
    flags: new Set([0, 1, 2, 3, 4, 55, 57, 72, 73, 74, 75, 172, 243, 253,
      ...Array.from({ length: 17 }, (_, i) => 17 + i)]),
    files: {},
    phasing: false,
    vase: 38, // _STARTUP.EMC puts an apple in the marble vase.
    birthstones: [12, Math.floor(Math.random() * 4), 7 + Math.floor(Math.random() * 5), 6],
    scatteredGems: {},
    poison: 0,
    cauldron: 0,
    crystals: [-1, -1],
    pendingItems: {},
    merith: { x: -16, y: 126, facing: 3, shape: 41, room: -1 },
    herman: { x: 224, y: 94, facing: 5, shape: 88, room: 7 },
  };
  const region = Math.floor(Math.random() * 2);
  for (const item of [8, 1]) applyForestState(state, scatterGem(item, region, 0));
  return state;
}
export const groveGems = [0, 3, 5, 7, 9, 10, 11, 2];
// The original generic placement only uses eligible, connected rooms in the region.
const gemRooms = [
  [9, 10, 11, 12, 13, 14, 15],
  [17, 18, 19, 20, 21, 22, 23, 24, 28, 30, 32, 33, 34],
  [],
  [43, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 73, 75,
    ...Array.from({ length: 28 }, (_, index) => 81 + index)],
];
export const canScatterGemsIn = (room: number) => gemRooms.some(region => region.includes(room));
export function scatterGem(item: number, region: number, currentRoom: number): Extract<RoomAction, { op: 'scatterGem' }> {
  const rooms = (gemRooms[region] ?? gemRooms[0]).filter(id => id !== currentRoom);
  return { op: 'scatterGem', item, room: rooms[Math.floor(Math.random() * rooms.length)] };
}

const waitTicks = (ticks: number): RoomAction => ({ op: 'wait', ms: ticks * 1000 / 60 });
const heroFrames = (clip: string, indices: number[], ticks: number): RoomAction[] =>
  indices.flatMap(index => [{ op: 'heroFrame', clip, index }, waitTicks(ticks)]);
const indices = (start: number, length: number) => Array.from({ length }, (_, i) => start + i);
export function heroLine(text: string, voiceId: number, pos: Vec2, durations: ForestRoom['durations']): RoomAction {
  return { op: 'say', text, voiceId, voiceBank: 'CHAPTER1', ms: durations[voiceId] ?? 2000,
    x: pos.x, y: pos.y - 56, speaker: 0, color: 15, blocking: true };
}
export function poisonArrival(crossings: number, pos: Vec2, durations: ForestRoom['durations']): RoomAction[] {
  const line = (text: string, voice: number) => heroLine(text, voice, pos, durations);
  if (crossings > 1) return [{ op: 'poison', crossings: 1 },
    line("I don't feel so good...", 7002), line('That snake must be poisonous!', 7004)];
  return [{ op: 'music', command: 1, restart: true }, line('The poison...', 7000), line("I can't breathe...", 7001),
    ...heroFrames('poison', [1, 0], 30), ...heroFrames('poison', indices(2, 15), 8), waitTicks(60),
    ...heroFrames('poison', [17, 18, 19], 8), waitTicks(60), { op: 'death' }];
}
export function curePoison(pos: Vec2, durations: ForestRoom['durations']): RoomAction[] {
  return [{ op: 'poison', crossings: 0 }, { op: 'sfx', track: 0x50 },
    ...heroFrames('cure', indices(0, 30), 8), { op: 'heroFrame' },
    heroLine('Amazing!', 2010, pos, durations), heroLine('The effects of the poison are gone!', 2011, pos, durations)];
}
const items: Record<number, InventoryItemId> = {
  0: "ruby",
  16: "rose",
  19: "silverRose",
  38: "apple",
  39: "appleEaten",
  42: "letter",
  43: "marble",
  44: "saw",
  52: "teardrop",
};
export const originalItem = (id: InventoryItemId | null) =>
  id === null
    ? -1
    : Number(
        Object.entries(items).find(([, value]) => value === id)?.[0] ??
          id.replace("item-", ""),
      );
export const itemFromOriginal = (id: number): InventoryItemId | null =>
  id < 0 || id === 255 ? null : (items[id] ?? `item-${id}`);

export const fireberryBush = (room: number) => room >= 187 && room <= 198 || [133, 137, 165, 173].includes(room);

export function ageFireberry(item: InventoryItemId | null): InventoryItemId | null {
  const id = originalItem(item);
  return id >= 29 && id <= 32 ? id === 32 ? null : itemFromOriginal(id + 1) : item;
}

export function transformWisp(room: number, active: boolean): RoomAction[] {
  const cave = isShadowrealmRoom(room);
  const actions: RoomAction[] = [];
  if (active && cave) actions.push({ op: 'music', command: 1, restart: false });
  actions.push({ op: 'sfx', track: 0x6c }, { op: 'wisp', ms: 0 });
  for (let index = 0; index < 16; index++) actions.push(
    { op: 'heroFrame', clip: 'wisp', index: active ? index : 15 - index }, { op: 'wait', ms: 8000 / 60 });
  actions.push({ op: 'heroFrame' }, { op: 'face', shape: 7, facing: 5 });
  if (active) actions.push({ op: 'wisp', ms: cave ? 300_000 : 120_000 }, { op: 'flag', flag: 158, value: true });
  if (room >= 118 && room <= 186) actions.push({ op: 'palette', start: 228, colors: specialPalettes[14].slice(0, 45), ms: 1200 });
  if (isCatacombRoom(room)) actions.push({ op: 'palette', start: 234, colors: specialPalettes[active ? 30 : 31].slice(0, 39), ms: 1200 });
  if (active && cave) actions.push({ op: 'music', command: 17, restart: false });
  return actions;
}

export function changeInvisibility(active: boolean): RoomAction[] {
  const actions: RoomAction[] = [{ op: 'sfx', track: 0x77 }];
  for (let step = 0; step <= 16; step++) {
    actions.push({ op: 'invisibility', level: (active ? step : 16 - step) * 16 }, waitTicks(10));
  }
  actions.push({ op: 'invisibility', level: active ? 256 : 0, ms: active ? INVISIBILITY_MS - 170 * 1000 / 60 : 0 });
  return actions;
}

export function dispelMagic(room: number, activeWisp: boolean): RoomAction[] {
  return [
    ...(activeWisp ? transformWisp(room, false) : []),
    { op: 'flag', flag: 238, value: true },
    { op: 'sfx', track: 0x15 },
    ...heroFrames('dispel', [0, 1, 2, 3, 4], 8), waitTicks(120),
    ...heroFrames('dispel', [4, 3, 2, 1, 0], 10), { op: 'heroFrame' },
  ];
}

/** Execute original conditionals against a copy, then play the resulting actions.
 * State changes are applied by the same clock as dialogue, never on an interrupted trace. */
export function traceForest(
  room: ForestRoom,
  fn: number,
  state: ForestState,
  snapshot: RoomSnapshot,
  point: Vec2 = snapshot.pos,
  walkable: (p: Vec2) => boolean = () => true,
  confirmations: Vec2[] = [],
  mouseState = originalItem(snapshot.itemInHand),
  jewel = 1,
): { actions: RoomAction[]; handled: boolean; cursorTrack?: CursorTrack } {
  const initialState = {
    ...state,
    flags: new Set(state.flags),
    files: { ...state.files },
    merith: { ...state.merith },
    herman: { ...state.herman },
  };
  const paused = {};
  let confirmation = 0,
    vase = state.vase,
    entry: Vec2 | undefined;
  let cursorTrack: CursorTrack | undefined;
  const flags = new Set(state.flags),
    npcs = { 1: { ...state.merith }, 2: { ...state.herman } } as Record<
      number,
      typeof state.herman
    >,
    actions: RoomAction[] = [];
  let npc = npcs[2],
    character = 2,
    phasing = state.phasing;
  let actor = { ...snapshot.pos, facing: snapshot.facing ?? 5 },
    voiceMs = 0,
    voiceElapsed = 0,
    hand = originalItem(snapshot.itemInHand);
  let poison = state.poison, wisp = !!snapshot.wispMs, invisible = !!snapshot.invisibleMs, cauldron = state.cauldron;
  const crystals = [...state.crystals];
  const scaleOverrides = new Map<number, number>();
  const delays: Record<number, number> = { 0: snapshot.walkDelayTicks ?? 6, 1: 7, 2: 8 };
  const slots = new Map<number, string>();
  let fireplaceFrame: Extract<RoomAction, { op: 'frame' }> | undefined;
  let fireplacePage = false;
  const emit = (action: RoomAction) => actions.push(action);
  const wait = (ms: number) => {
    if (ms > 0) {
      emit({ op: "wait", ms });
      voiceElapsed += ms;
    }
  };
  const frame = (
    clip: string,
    index: number,
    x: number,
    y: number,
    ms: number,
    permanent = false,
  ) => {
    // WSA displayFrame ignores out-of-range requests (AGILE's script asks for 17).
    if (room.clipFrames[clip] === undefined)
      throw Error("Missing forest clip " + clip);
    if (index < 0 || index >= room.clipFrames[clip]) {
      wait(ms);
      return;
    }
    emit({ op: "frame", clip, index, x, y, ms, permanent });
    voiceElapsed += ms;
  };
  const npcAction = () =>
    emit({ op: "npc", character, ...npc, visible: npc.room === room.id && npc.shape !== 88 });
  const animateTalk = (idle: number, speech: number, talking: boolean) => {
    for (const [index, enabled] of [[idle, !talking], [speech, talking]] as const) {
      emit({ op: "ambient", index, enabled, internal: false });
      emit({ op: "ambient", index, enabled, internal: true });
    }
  };
  const setFlag = (flag: number, value: boolean) => {
    if (value) flags.add(flag);
    else flags.delete(flag);
    emit({ op: "flag", flag, value });
    return +value;
  };
  try {
    const result = runEmc(
      room.program,
      fn,
      (id, a, text, registers) => {
        character = a[0];
        npc = npcs[character] ?? npcs[2];
        switch (id) {
          case 0x67:
            return vase;
          case 0x68:
            vase = a[0];
            emit({ op: "vase", item: vase });
            return 0;
          case 0x69:
            return 0; // Stub in the DOS engine as well.
          case 0x76:
            return hand;
          case 0x2e:
            entry = a[0] < 0 || a[1] < 0 ? undefined : { x: a[0], y: a[1] };
            return 0;
          case 0x2d:
            if (room.id === 117 && a[0] === 117 && flags.has(179)) return 0; // The scroll already changed the river in place.
            const side = room.id === 206 ? (["north", "east", "south", "west"] as const)[a[1] / 2] : undefined;
            emit({ op: "exit", target: a[0], entry, side });
            return 0;
          case 0x1d:
            return a[0] === room.id ? room.exits[a[1] / 2] ?? -1 : -1;
          case 0x27:
            if (poison) actions.push(...poisonArrival(1, actor, room.durations));
            return 0;
          case 0x5f:
            emit({ op: "death" });
            return 0;
          case 0x5d: {
            if (fireberryBush(room.id)) return 29;
            const lights = [hand, ...snapshot.inventorySlots.map(originalItem), ...snapshot.sceneItems.map(item => originalItem(item.id))]
              .filter(item => item >= 28 && item <= 32);
            return lights.length ? Math.min(...lights) : -1;
          }
          case 0x5e: {
            const palette = wisp && !fireberryBush(room.id) ? 14 : a[0] < 0 ? 12 : Math.max(8, Math.min(12, a[0] - 21));
            emit({ op: 'palette', start: 228, colors: specialPalettes[palette].slice(0, 45), ms: 0 });
            return 0;
          }
          case 0x7d:
            emit({ op: 'blackout', active: !!a[0] });
            return 0;
          case 0x20:
            return 0; // Darkness hides Brandon through 0x7d until the death sequence completes.
          case 0x64: {
            const answer = confirmations[confirmation++];
            if (answer) {
              registers[1] = answer.x | 0;
              registers[2] = answer.y | 0;
              actions.length = 0;
              return 0;
            }
            emit({
              op: "choice",
              resume: (answer) =>
                traceForest(room, fn, initialState, snapshot, point, walkable, [
                  ...confirmations,
                  answer,
                ], mouseState, jewel).actions,
            });
            throw paused;
          }
          case 4:
            return +flags.has(a[0]);
          case 5:
            return setFlag(a[0], true);
          case 6:
            return setFlag(a[0], false);
          case 0x38:
            return a[0] > 0 ? npc.x : actor.x;
          case 0x39:
            return a[0] > 0 ? npc.y : actor.y;
          case 0x5a:
            return a[0] > 0 ? npc.facing : actor.facing;
          case 0x22:
            return a[0] > 0 ? npc.room : room.id;
          case 0x70:
            return delays[a[0]] ?? 6;
          case 0x59:
            delays[a[0]] = a[1];
            if (a[0] === 0) emit({ op: "walkDelay", ticks: a[1] });
            return 0;
          case 0x3d:
            return Math.floor((a[0] + a[1]) / 2);
          case 0x12:
            return 0;
          case 0x13:
            return +(hand === -1);
          case 0x72:
            return +((poison > 0 && !!(a[0] & 1)) || (wisp && !!(a[0] & 2)) || (invisible && !!(a[0] & 0x20)));
          case 0x74:
            if (![41, 117].includes(room.id) || !a[0]) throw new Error('Unsupported winter scroll sequence');
            for (let index = 0; index < 29; index++) {
              if (index === 7) emit({ op: 'sfx', track: 0x20 });
              if (index === 20 && room.id === 41 && !flags.has(162)) {
                emit({ op: 'sfx', track: 0x20 });
                for (const internal of [false, true]) {
                  emit({ op: 'ambient', index: 0, enabled: false, internal });
                  emit({ op: 'ambient', index: 1, enabled: true, internal });
                }
                setFlag(162, true);
              }
              if (index === 25 && room.id === 117 && !flags.has(179)) {
                for (let slot = 0; slot < 8; slot++) {
                  emit({ op: 'ambient', index: slot, enabled: false });
                  emit({ op: 'ambient', index: slot, enabled: false, internal: true });
                }
                emit({ op: 'palette', start: 228, colors: specialPalettes[29].slice(0, 60), ms: 1200 });
                wait(1200);
              } else if (index === 25) wait(2000);
              emit({ op: 'heroFrame', clip: 'winter', index });
              wait(8000 / 60);
            }
            emit({ op: 'heroFrame' });
            return 0;
          case 0x7a:
            return mouseState;
          case 0x71:
            return state.birthstones[a[0]] ?? 0;
          case 0x1f:
            emit(scatterGem(a[0], a[1], room.id));
            return 0;
          case 0x6d:
            emit({ op: 'ambientPosition', index: a[0], x: a[1], y: a[2] });
            return 0;
          case 0x6e:
            poison = 2;
            emit({ op: 'poison', crossings: poison });
            return 0;
          case 0x73: {
            const shatter = flags.has(133);
            const practiced = flags.has(134);
            emit({ op: 'visible', visible: true });
            actions.push(...heroFrames('flute', indices(0, 8), 2));
            emit({ op: 'sfx', track: shatter ? 0x63 : practiced ? 0x62 : 0x61 });
            if (!shatter && !practiced) setFlag(134, true);
            actions.push(...heroFrames('flute', [...indices(8, 28), 3, 2, 1, 0], shatter ? 9 : 2));
            emit({ op: 'heroFrame' });
            if (!shatter) emit(heroLine(practiced ? 'That last note sure was high!' : 'Not very impressive sounding.', practiced ? 1001 : 1000, actor, room.durations));
            return 0;
          }
          case 0x58:
            emit({ op: "ambientWait", index: a[0] });
            return 0;
          case 0x45:
            return 1;
          case 0x77:
            return snapshot.sceneItems.length;
          case 0x7f:
            return +(a[0] === room.id && snapshot.sceneItems.some(item => originalItem(item.id) === a[1]));
          case 0x80:
            return cauldron;
          case 0x81:
            cauldron = a[0];
            emit({ op: 'cauldron', state: cauldron });
            return cauldron;
          case 0x82:
            return crystals[a[0]] ?? -1;
          case 0x83:
            if (a[0] === 0 || a[0] === 1) {
              crystals[a[0]] = a[1];
              emit({ op: 'crystal', slot: a[0], item: a[1] });
            }
            return a[1];
          case 0x8c: {
            const scale = actorScaleAt(actor.y, room.actorScale);
            if (a[0] >= actor.x - 12 * scale && a[0] <= actor.x + 12 * scale && a[1] >= actor.y - 48 * scale && a[1] <= actor.y) return 0;
            return Number(
              Object.entries(npcs).find(
                ([, n]) =>
                  n.room === room.id &&
                  Math.abs(a[0] - n.x) <= 12 &&
                  a[1] >= n.y - 48 &&
                  a[1] <= n.y,
              )?.[0] ?? -1,
            );
          }
          case 0x0b:
            actor.x = a[0] & ~3;
            actor.y = a[1] & ~1;
            emit({ op: "walk", x: actor.x, y: actor.y });
            return 0;
          case 0x30:
            actor = { x: a[0] & ~3, y: a[1] & ~1, facing: a[2] };
            emit({ op: "actor", ...actor, visible: true });
            if (scaleOverrides.has(actor.y)) emit({ op: 'heroScale', value: scaleOverrides.get(actor.y)! / 256 });
            return 0;
          case 0x3a:
            if (a[0] > 0) {
              npc.facing = a[1];
              if (a[2] >= 0) npc.shape = a[2];
              npcAction();
            } else {
              if (a[1] >= 0) actor.facing = a[1];
              emit({ op: "face", facing: actor.facing, shape: a[2] });
            }
            return 0;
          case 0x41:
            if (a[0] > 0) {
              npc.shape = a[1];
              if (a[2] >= 0) npc.facing = a[2];
              npcAction();
            } else {
              if (a[2] >= 0) actor.facing = a[2];
              emit({ op: "visible", visible: true });
              emit({ op: "face", facing: actor.facing, shape: a[1] });
            }
            return 0;
          case 0x63:
            if (a[0] > 0) {
              npc.shape = a[1];
              npcAction();
            } else emit({ op: 'face', facing: actor.facing, shape: a[1] });
            return 0;
          case 0x50:
            if (a[0] > 0) {
              npc.room = a[1];
              npcAction();
            }
            return 0;
          case 0x43:
            if (a[0] > 0) {
              npc.x = a[1] & ~3;
              npc.y = a[2] & ~1;
              npcAction();
            } else {
              actor.x = a[1] & ~3;
              actor.y = a[2] & ~1;
              emit({ op: "actor", ...actor, visible: a[1] >= 0 && a[2] >= 0 });
            }
            return 0;
          case 0x49:
          case 0x4c:
            if (a[0] > 0) {
              npc.room = a[1];
              npc.x = (id === 0x49 ? a[2] : a[4]) & ~3;
              npc.y = (id === 0x49 ? a[3] : a[5]) & ~1;
              npc.facing = id === 0x49 ? a[4] : a[3];
              npc.shape = id === 0x49 ? a[5] : a[2];
              npcAction();
            }
            return 0;
          case 0x51: {
            if (a[0] === 0) {
              actor.x = a[1] & ~3;
              actor.y = a[2] & ~1;
              emit({ op: 'walk', x: actor.x, y: actor.y });
              return 0;
            }
            if (!npcs[a[0]])
              throw new Error("Unsupported forest walking actor");
            const x = a[1] & ~3,
              y = a[2] & ~1;
            const base = character === 1 ? 41 : 77;
            const path = findWalkPath(
              npc,
              { x, y },
              (p) =>
                p.x <= 8 ||
                p.x >= 312 ||
                p.y < room.northHeight ||
                p.y > 135 ||
                walkable(p),
            );
            for (const next of path) {
              npc.facing = [2, 1, 0, 7, 6, 5, 4, 3][pathDirection(npc, next)];
              npc.x = next.x;
              npc.y = next.y;
              npc.shape++;
              if (npc.facing === 0) {
                if (npc.shape < base + 30 || npc.shape > base + 35)
                  npc.shape = base + 30;
              } else if (npc.facing === 4) {
                if (npc.shape < base + 24 || npc.shape > base + 29)
                  npc.shape = base + 24;
              } else {
                if (npc.shape > base + 24) npc.shape = base + 35;
                if (npc.shape === base + 8) npc.shape = base + 1;
                if (npc.shape > base + 8) npc.shape = base + 3;
              }
              npcAction();
              emit({ op: "wait", ms: (delays[character] * 1000) / 60, movement: true });
              voiceElapsed += (delays[character] * 1000) / 60;
            }
            return 0;
          }
          case 0x29: {
            const clip = text[a[0]].slice(0, -4).toLowerCase();
            slots.set(a[1], clip);
            if (['pegasus', 'lep_in', 'lepclimb', 'ridge', 'ridge2', 'acidgate', 'slide1'].includes(clip))
              emit({ op: 'visible', visible: false });
            return 0;
          }
          case 0x2a:
            if (slots.has(a[0])) {
              const clip = slots.get(a[0])!;
              emit({ op: "close", clip });
              if (clip === 'sngspell') frame('songbird-rest', 0, 184, 38, 0);
            }
            slots.delete(a[0]);
            return 0;
          case 0x2b:
            emit({
              op: "movie",
              clip: slots.get(a[3])!,
              x: a[0],
              y: a[1],
              ticks: a[2],
            });
            return 0;
          case 0x2c:
          case 0x3f:
            if (fireplacePage && id === 0x3f) {
              fireplaceFrame = { op: 'frame', clip: slots.get(a[4])!, index: a[0], x: a[1], y: a[2], ms: 0, shapes: [] };
              return 0;
            }
            frame(
              slots.get(a[4])!,
              a[0],
              a[1],
              a[2],
              (a[3] * 1000) / 60,
              id === 0x3f,
            );
            return 0;
          case 0x40: {
            const count = Math.abs(a[1] - a[0]) + 1,
              repeat = Math.max(1, a[6]);
            const time =
              (voiceMs * Math.abs(a[7])) / 100 -
              (a[7] < 0 ? voiceElapsed : 0);
            const ticks = a[7] && voiceElapsed < voiceMs
              ? Math.floor(Math.max(0, time) / (count * repeat) / (1000 / 60))
              : a[4];
            for (let r = 0; r < repeat; r++)
              for (let i = 0; i < count; i++)
                frame(
                  slots.get(a[5])!,
                  a[0] + i * Math.sign(a[1] - a[0]),
                  a[2],
                  a[3],
                  (ticks * 1000) / 60,
                );
            return 0;
          }
          case 1:
          case 0x34: {
            const voiceId = a[0];
            voiceMs = room.durations[voiceId] ?? 2000;
            voiceElapsed = 0;
            const custom = id === 0x34;
            // SPELL's shared WSA uses different anchors for Darm and Brandywine.
            const speaker = custom ? (room.name === 'SPELL' ? (a[3] === 36 ? 8 : 'brandywine') : undefined) : a[2];
            const darm = room.name === 'SPELL' && speaker === 8;
            const faun = room.name === 'LEPHOLE' && speaker === 10;
            const partner = typeof speaker === 'number' ? npcs[speaker] : undefined;
            const anchor = custom ? { x: a[2], y: a[3] }
              : partner ? { x: partner.x, y: partner.y - 56 }
              : darm ? { x: 140, y: 36 }
              : faun ? { x: 66, y: 62 }
              : speaker === 5 ? { x: 44, y: 44 }
              : { x: actor.x, y: actor.y - 56 };
            if (darm && !custom) {
              emit({ op: "waitVoice" });
              animateTalk(5, 6, true);
            }
            if (faun) animateTalk(6, 7, true);
            emit({
              op: "say",
              text: text[a[1]],
              voiceId,
              ms: voiceMs,
              speaker,
              ...anchor,
              color: custom
                ? a[4]
                : darm ? 85 : faun ? 0x3a : speaker === 2
                  ? 201
                  : speaker === 1
                    ? 144
                    : speaker === 5
                      ? 129
                      : 15,
              blocking: !custom,
            });
            if (!custom) {
              voiceElapsed = voiceMs;
              if (darm) animateTalk(5, 6, false);
              if (faun) animateTalk(6, 7, false);
            }
            return 0;
          }
          case 0x35:
            emit({ op: "clearText" });
            return 0;
          case 2:
            wait((a[0] * 1000) / 60);
            return 0;
          case 0x21:
            if (a[0] < 0) wait((-a[0] * 1000) / 60);
            else if (a[0] === 0) {
              emit({ op: "waitVoice" });
              voiceElapsed = Math.max(voiceElapsed, voiceMs);
            }
            return 0;
          case 0x10:
          case 0x11:
          case 0x25:
          case 0x42:
            emit({
              op: "ambient",
              index: a[0],
              enabled: id === 0x10 || id === 0x25,
              internal: id === 0x25 || id === 0x42,
            });
            return 0;
          case 3:
          case 0x0d:
            const shape = { shape: a[0], x: a[1], y: a[2], flags: a[3] };
            if (fireplaceFrame) fireplaceFrame.shapes!.push(shape);
            else emit({ op: "shape", ...shape });
            return 0;
          case 9:
          case 10:
            emit({
              op: "mask",
              x: a[0],
              y: a[1],
              w: a[2] - a[0] + 1,
              h: a[3] - a[1] + 1,
              blocked: id === 10,
            });
            return 0;
          case 0x97:
            emit({ op: 'mask', x: a[1], y: a[2], w: a[3] + 1, h: a[4] + 1, blocked: false });
            return 0;
          case 0x8f:
            emit({ op: "noDrop", x: a[0], y: a[1], w: a[2], h: a[3] });
            return 0;
          case 0x00:
            hand = a[1];
            emit({ op: 'sfx', track: a[0] === 2 ? 0x5e : 0x37 });
            emit({ op: 'hand', item: itemFromOriginal(hand) });
            return 0;
          case 0x0e:
            hand = a[0];
            emit({ op: "hand", item: itemFromOriginal(hand) });
            return 0;
          case 0x14:
          case 0x24:
          case 0x48:
            hand = -1;
            emit({ op: "hand", item: null });
            return 0;
          case 0x0c:
          case 0x7c:
          case 0x47:
            if (id === 0x47 && a[3] !== room.id) {
              if (isWorldRoomId(a[3])) emit({ op: 'offsceneItem', room: a[3], item: { id: itemFromOriginal(a[0])!, x: a[1], y: a[2] } });
              return 0;
            }
            emit({
              op: "item",
              item: itemFromOriginal(a[0])!,
              x: a[1],
              y: a[2],
            });
            if (id === 0x47 && room.id === 39 && hand === a[0]) {
              hand = -1;
              emit({ op: 'hand', item: null });
            }
            return 0;
          case 0x52:
            frame("note", 0, 63, 8, 0);
            return 0;
          case 0x53:
            emit({ op: "close", clip: "note" });
            return 0;
          case 0x4a:
            emit({ op: "confirm" });
            return 0;
          case 0x61: {
            for (const index of [
              0, 1, 2, 1, 3, 4, 3, 1, 2, 3, 4, 5, 6, 5, 4, 5, 7, 8, 7, 8, 9, 8,
              9, 7, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
              22,
            ])
              frame("amulet", index, 224, 152, (5 * 1000) / 60);
            setFlag(45, true);
            return 0;
          }
          case 0x6b:
            for (let i = 0; i < a[0]; i++) {
              emit({ op: 'shake', ms: 32 });
              wait(32);
            }
            wait((a[0] * a[1] * 1000) / 60);
            return 0;
          case 0x6c: {
            const jewel = a[0] === 1 ? { name: 'yellow-jewel', flag: YELLOW_JEWEL_FLAG, pos: YELLOW_JEWEL_POS }
              : a[0] === 2 ? { name: 'red-jewel', flag: RED_JEWEL_FLAG, pos: RED_JEWEL_POS }
              : a[0] === 3 ? { name: 'purple-jewel', flag: PURPLE_JEWEL_FLAG, pos: PURPLE_JEWEL_POS }
              : a[0] === 4 ? { name: 'blue-jewel', flag: BLUE_JEWEL_FLAG, pos: BLUE_JEWEL_POS } : undefined;
            if (!jewel) throw new Error('Unsupported amulet jewel');
            emit({ op: 'sfx', track: 0x5f });
            for (let index = 0; index <= 10; index++) emit({ op: 'frame', clip: jewel.name, index,
              ...jewel.pos, ms: 3 * 1000 / 60 });
            setFlag(jewel.flag, true);
            emit({ op: 'close', clip: jewel.name });
            return 0;
          }
          case 0x60: {
            if (wisp) {
              wisp = false;
              actions.push(...transformWisp(room.id, false));
            }
            emit({ op: 'face', facing: 5, shape: 7 });
            const tint = ({
              60: [63, 6, 6], 61: [63, 6, 6], 62: [0, 0, 67], 63: [0, 0, 67],
              64: [84, 78, 14], 65: [84, 78, 14], 66: [0, 48, 0], 67: [100, 48, 23],
              68: [73, 0, 89], 69: [73, 73, 86],
            } as Record<number, number[]>)[a[0]] ?? [33, 66, 100];
            emit({ op: 'palette', start: 254, colors: tint.map(value => Math.floor(value * 63 / 100) * 4), ms: 0 });
            actions.push(...heroFrames('drink', indices(0, 9), 5));
            emit({ op: 'sfx', track: 0x34 });
            actions.push(...heroFrames('drink', [7, 8, 7, 8], 7));
            emit({ op: 'palette', start: 254, colors: [120, 120, 120], ms: 0 });
            actions.push(...heroFrames('drink', indices(0, 9).reverse(), 5), { op: 'heroFrame' });
            return 0;
          }
          case 0x5c:
          case 0x6a:
            actions.push(...dispelMagic(room.id, wisp));
            wisp = false;
            flags.add(238);
            return 0;
          case 0x6f: {
            const [item, type] = a;
            const full = item >= 60 && item <= 77;
            if (!full && item !== 78 && item !== 79) return 0;
            const voiceId = full ? 8006 : [8000, 8001, 8002, 8005][type];
            if (voiceId === undefined) return 0;
            if (!full) {
              hand = 70 + type * 2 + (item - 78);
              emit({ op: 'hand', item: itemFromOriginal(hand) });
            }
            const line = full ? 'This flask is already full.' : [
              'The flask is now filled with fresh, sparkling water.', 'The flask is now filled with salt water.',
              'The flask is now filled with mineral water.', 'Magic water.',
            ][type];
            emit({ op: 'say', text: line, voiceId, voiceBank: 'CHAPTER1', x: actor.x, y: actor.y - 56, speaker: 0,
              color: 15, blocking: true, ms: room.durations[voiceId] ?? 2000 });
            return 0;
          }
          case 0x7e:
            if (a[0] === 0) {
              emit({ op: 'palette', start: 0, colors: Array(768).fill(0), ms: a[1] * 1000 / 60 });
              emit({ op: 'blackout', active: true });
            }
            if (a[0] === 2) emit({ op: 'fadeIn', ms: a[1] * 1000 / 60 });
            return 0;
          case 0x66:
            emit({
              op: "sceneFile",
              room: a[0],
              name:
                a[1] === 42 ? "BRIDGE" : a[1] === 83 ? "XEDGEC" : String(a[1]),
            });
            return 0;
          case 0x1a:
          case 0x1b:
            phasing = id === 0x1a;
            emit({ op: "phase", active: phasing });
            return +phasing;
          case 0x1c:
            return +phasing;
          case 0x19: {
            const name = ({ 21: 'WILLOW', 28: 'FOUNTN', 40: 'ALGAE' } as Record<number, string>)[a[1]];
            if (!name) throw new Error("Unsupported forest scene transformation");
            emit({ op: "sceneFile", room: a[0], name });
            return 0;
          }
          case 0x85:
          case 0x86: {
            const normal = Math.round(actorScaleAt(actor.y, room.actorScale) * 256);
            const half = normal >> 1;
            const direction = id === 0x85 ? -1 : 1;
            for (let scale = direction < 0 ? normal : half; scale >= half && scale <= normal; scale += direction) {
              emit({ op: 'heroScale', value: scale / 256 });
              wait(1000 / 60);
            }
            if (id === 0x85) wait(a[0] * 1000 / 60);
            emit({ op: 'heroScale' });
            return 0;
          }
          case 0x89:
            return scaleOverrides.get(a[0]) ?? Math.round(actorScaleAt(a[0], room.actorScale) * 256);
          case 0x8a:
            scaleOverrides.set(a[0], a[1]);
            return a[1];
          case 0x8b:
            emit({ op: "message", text: text[a[1]] });
            return 0;
          case 0x18:
            emit({ op: "music", command: a[0], restart: !!a[1] });
            return 0;
          case 0x17:
            emit({ op: "sfx", track: a[0] });
            return 0;
          case 0x26:
            if (invisible) {
              invisible = false;
              actions.push(...changeInvisibility(false));
            }
            if (wisp) {
              wisp = false;
              actions.push(...transformWisp(room.id, false));
            }
            return 0;
          case 0x91:
            return 1; // ScummVM's original passive-protection check is a constant.
          case 0x93:
            actions.push(...heroFrames('stone', indices(0, 14), 8));
            return 0;
          case 0x96:
            if (isCastleRoom(room.id)) wait(a[0] * 1000);
            return 0;
          case 0x28:
            if (room.id === 203 && fn === 1 && a[1] === a[3]) emit({ op: 'heroScale', value: a[1] / 256 });
            return 0;
          case 0x0f:
            if (room.id === 207) fireplacePage = true;
            return 0;
          case 0x33:
            fireplacePage = false;
            return 0;
          case 0x3b:
            if (fireplaceFrame) {
              if (fn === 1 && fireplaceFrame.shapes?.some(shape => shape.shape === 0)) {
                emit({ op: 'visible', visible: false });
              }
              emit(fireplaceFrame);
              fireplaceFrame = undefined;
            }
            return 0;
          case 0x99:
            emit({ op: 'fill', x: a[1], y: a[2], w: a[3] - a[1] + 1, h: a[4] - a[2] + 1, color: a[5] });
            return 0;
          // Engine configuration. Audio follows the original EMC calls.
          case 8:
          case 0x31:
          case 0x36:
          case 0x37:
          case 0x44:
          case 0x46:
          case 0x54:
          case 0x55: // LAVA prints a blank line over its death movie.
          case 0x56:
          case 0x57:
          case 0x78:
          case 0x79:
          case 0x92:
          case 0x95:
          case 0x98:
          case 0x9a:
          case 0x9b:
            return 0;
          case 0x7b: {
            const [x, y, w, h, facing] = a;
            const side = (["north", "east", "south", "west"] as const)[facing / 2];
            if (side && w > 0 && h > 0) cursorTrack = { side, rect: { x, y, w, h } };
            return 0;
          }
          case 0x16:
            emit({
              op: "palette",
              start: a[1],
              colors: specialPalettes[a[0]].slice(0, a[2] * 3),
              ms: ((a[3] * 18) & 0x7f) * 1000 / 60, // DOS fade delay uses a 15-bit fixed-point accumulator.
            });
            return 0;
          case 0x32:
            emit({ op: 'palette', start: a[1], colors: specialPalettes[a[0]].slice(0, a[2] * 3), ms: 0 });
            return 0;
          case 0x5b:
            return 0; // Column restoration is losslessly baked by the importer.
          case 0x15:
            emit({ op: "ambientRun", index: a[0] });
            return 0;
          default:
            throw new Error(
              `Unsupported ${room.name} syscall 0x${id.toString(16)}`,
            );
        }
      },
      { 0: room.id, 1: point.x | 0, 2: point.y | 0, 3: 0, 4: hand, 6: fn === 4 ? jewel : 0, 7: 0 },
    );
    // The fire movie covers only part of the conversation frame. Closing the
    // WSA leaves its pixels in place until the next movie draws over them.
    const playback = room.name === 'SPELL' ? actions.filter((action, i) => {
      if (action.op !== 'close') return true;
      const nextFrame = actions[i + 1];
      if (action.clip === 'brandyw2' && nextFrame?.op === 'frame' && nextFrame.clip === 'brandyw3') return false;
      return action.clip !== 'brandyw3';
    }) : actions;
    return { actions: playback, handled: result.regs[3] !== 0 || playback.some(action => action.op === 'exit'), cursorTrack };
  } catch (error) {
    if (error !== paused) throw error;
    return { actions, handled: true };
  }
}

export function applyForestState(state: ForestState, action: RoomAction) {
  if (action.op === 'poison') state.poison = action.crossings;
  if (action.op === 'cauldron') state.cauldron = action.state;
  if (action.op === 'crystal') state.crystals[action.slot] = action.item;
  if (action.op === 'offsceneItem') (state.pendingItems[action.room] ??= []).push(action.item);
  if (action.op === 'scatterGem') (state.scatteredGems[action.room] ??= []).push(action.item);
  if (action.op === "vase") state.vase = action.item;
  if (action.op === "flag") {
    if (action.value) state.flags.add(action.flag);
    else state.flags.delete(action.flag);
  }
  if (action.op === "sceneFile") state.files[action.room] = action.name;
  if (action.op === "phase") state.phasing = action.active;
  if (action.op === "npc")
    state[action.character === 1 ? "merith" : "herman"] = {
      x: action.x,
      y: action.y,
      facing: action.facing,
      shape: action.shape,
      room: action.room,
    };
}
