// Original EMC host operations and palette data follow ScummVM's Kyra LoK engine.
// SPDX-License-Identifier: GPL-3.0-or-later
import { findWalkPath, pathDirection } from "./pathfinding";
import specialPalettes from "../resources/specialPalettes.json";
import { runEmc, type EmcProgram } from "../../../extractor/emc.mjs";
import type { RoomAction } from "./roomScript";
import type { RoomSnapshot, Vec2, InventoryItemId } from "../core/types";
import type { WorldRoom } from "./world";
import { actorScaleAt } from '../characters/brandonFrames';

export type ForestRoom = WorldRoom & {
  program: EmcProgram;
  durations: Record<number, number>;
  clipFrames: Record<string, number>;
  npcFrames: Record<number, { xOffset: number; yOffset: number }>;
};
export type ForestData = { rooms: Record<string, ForestRoom>; letter: { sealed: RoomAction[]; readable: RoomAction[] } };
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
  merith: { x: number; y: number; facing: number; shape: number; room: number };
  herman: { x: number; y: number; facing: number; shape: number; room: number };
};
export function createForestState(): ForestState {
  return {
    flags: new Set([0, 1, 2, 3, 4, 55, 57, 172, 243, 253]),
    files: {},
    phasing: false,
    vase: -1,
    merith: { x: -16, y: 126, facing: 3, shape: 41, room: -1 },
    herman: { x: 224, y: 94, facing: 5, shape: 88, room: 7 },
  };
}
const items: Record<number, InventoryItemId> = {
  0: "ruby",
  16: "rose",
  19: "silverRose",
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
): { actions: RoomAction[]; handled: boolean } {
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
    voice = 0,
    voiceElapsed = 0,
    hand = originalItem(snapshot.itemInHand);
  const delays: Record<number, number> = { 0: snapshot.walkDelayTicks ?? 6, 1: 7, 2: 8 };
  const slots = new Map<number, string>();
  const emit = (action: RoomAction) => actions.push(action);
  const duration = () => room.durations[voice] ?? 2000;
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
            emit({ op: "exit", target: a[0], entry });
            return 0;
          case 0x5f:
            emit({ op: "death" });
            return 0;
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
                ]).actions,
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
          case 0x7a:
            return 0;
          case 0x58:
            emit({ op: "ambientWait", index: a[0] });
            return 0;
          case 0x45:
            return 1;
          case 0x77:
            return snapshot.sceneItems.length;
          case 0x7f:
            return +snapshot.sceneItems.some(
              (item) => originalItem(item.id) === a[0],
            );
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
            }
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
              emit({ op: "actor", ...actor, visible: true });
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
          case 0x29:
            slots.set(a[1], text[a[0]].slice(0, -4).toLowerCase());
            return 0;
          case 0x2a:
            emit({ op: "close", clip: slots.get(a[0])! });
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
              (duration() * Math.abs(a[7])) / 100 -
              (a[7] < 0 ? voiceElapsed : 0);
            const ticks = a[7]
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
            voice = a[0];
            voiceElapsed = 0;
            const custom = id === 0x34,
              speaker = custom ? (a[4] === 15 ? 0 : 5) : a[2];
            const partner = npcs[speaker];
            emit({
              op: "say",
              text: text[a[1]],
              voiceId: voice,
              ms: duration(),
              speaker,
              x: custom
                ? a[2]
                : partner
                  ? partner.x
                  : speaker === 5
                    ? 44
                    : actor.x,
              y: custom
                ? a[3]
                : partner
                  ? partner.y - 56
                  : speaker === 5
                    ? 44
                    : actor.y - 56,
              color: custom
                ? a[4]
                : speaker === 2
                  ? 201
                  : speaker === 1
                    ? 144
                    : speaker === 5
                      ? 129
                      : 15,
              blocking: !custom,
            });
            if (!custom) voiceElapsed = duration();
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
            else if (a[0] === 0) emit({ op: "waitVoice" });
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
            emit({ op: "shape", shape: a[0], x: a[1], y: a[2], flags: a[3] });
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
          case 0x8f:
            emit({ op: "noDrop", x: a[0], y: a[1], w: a[2], h: a[3] });
            return 0;
          case 0x00:
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
            emit({
              op: "item",
              item: itemFromOriginal(a[0])!,
              x: a[1],
              y: a[2],
            });
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
          case 0x19:
            if (a[1] !== 21)
              throw new Error("Unsupported forest scene transformation");
            emit({ op: "sceneFile", room: a[0], name: "WILLOW" });
            return 0;
          case 0x8b:
            emit({ op: "message", text: text[a[1]] });
            return 0;
          // Engine configuration or audio. Original frame/time instructions above own visuals.
          case 8:
          case 0x0f:
          case 0x17:
          case 0x18:
          case 0x26:
          case 0x28:
          case 0x31:
          case 0x32:
          case 0x33:
          case 0x36:
          case 0x37:
          case 0x3b:
          case 0x44:
          case 0x46:
          case 0x54:
          case 0x56:
          case 0x57:
          case 0x78:
          case 0x79:
          case 0x7b:
          case 0x95:
          case 0x96:
          case 0x98:
            return 0;
          case 0x16:
            emit({
              op: "palette",
              start: a[1],
              colors: specialPalettes[a[0]].slice(0, a[2] * 3),
              ms: a[3] * 300,
            });
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
      { 0: room.id, 1: point.x | 0, 2: point.y | 0, 3: 0, 4: hand, 7: 0 },
    );
    return { actions, handled: result.regs[3] !== 0 };
  } catch (error) {
    if (error !== paused) throw error;
    return { actions, handled: true };
  }
}

export function applyForestState(state: ForestState, action: RoomAction) {
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
