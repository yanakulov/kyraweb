import { startRoom, type RoomGame } from "./game";
import { withBase } from "../core/assets";
import { IndexedClip, loadScenePack } from "../resources/scenePack";
import { isWalkable } from "../scene/masks";
import type { GameConfig, MaskData, RoomPortal, RoomSnapshot, SceneMeta, Vec2 } from "../core/types";
import type { RoomAction } from "./roomScript";

export const SIDES = ["north", "east", "south", "west"] as const;
export type WorldRoom = SceneMeta & { id: number; name: string; title: string; exits: (number | null)[];
  actorScale?: GameConfig["scene"]["actorScale"];
  entrances: Record<typeof SIDES[number], Vec2>; northHeight: number; southHeight: number;
  shapes: NonNullable<GameConfig["scene"]["emc"]>["sceneAnimShapes"];
  portals: { target: number; side: typeof SIDES[number]; rect: RoomPortal["rect"]; entry?: Vec2 | null }[] };

export function nearestFloor(mask: MaskData, preferred: Vec2) {
  let best: Vec2 | null = null, distance = Infinity;
  for (let y = 8; y < 136; y += 2) for (let x = 12; x <= 304; x += 4) {
    const d = Math.abs(x - preferred.x) + Math.abs(y - preferred.y) * 2;
    if (d < distance && isWalkable({ x, y }, { uiMaskY: 136 } as GameConfig["scene"], mask)) { distance = d; best = { x, y }; }
  }
  if (!best) throw new Error("Scene has no walkable floor");
  return best;
}

export function roomPortals(room: WorldRoom, mask: MaskData): RoomPortal[] {
  const portals: RoomPortal[] = room.portals.map((p, i) => ({ ...p, id: `door-${i}`,
    target: p.target === 65535 || p.target === -1 ? room.exits[SIDES.indexOf(p.side)]! : p.target,
    point: nearestFloor(mask, { x: p.rect.x + p.rect.w / 2, y: p.rect.y + p.rect.h }) }));
  for (const [i, side] of SIDES.entries()) {
    const target = room.exits[i];
    if (target === null || portals.some(p => p.target === target)) continue;
    const origin = room.entrances[side];
    const point = nearestFloor(mask, side === "north" ? { x: origin.x, y: room.northHeight + 4 } :
      side === "south" ? { x: origin.x, y: 132 } : { x: side === "east" ? 304 : 16, y: origin.y });
    const rect = side === "north" ? { x: 8, y: 8, w: 304, h: Math.max(8, room.northHeight - 4) } :
      side === "south" ? { x: 8, y: 128, w: 304, h: 8 } : { x: side === "east" ? 304 : 0, y: 8, w: 16, h: 128 };
    portals.push({ id: side, target, side, point, rect });
  }
  if (room.id === 5) portals.unshift({ id: "lift", target: 1, side: "north", rect: { x: 235, y: 8, w: 66, h: 107 }, point: nearestFloor(mask, { x: 264, y: 108 }) });
  if (room.id === 1) portals.unshift({ id: "lift", target: 5, side: "south", rect: { x: 232, y: 96, w: 40, h: 40 }, point: nearestFloor(mask, { x: 216, y: 106 }) });
  return portals.filter(p => p.target !== null && p.target >= 0 && p.target < 17);
}

const lift = (clip: string, x: number, y: number, ticks: number): RoomAction[] => [
  { op: "visible", visible: false }, { op: "movie", clip, x, y, ticks }, { op: "close", clip }
];

export async function startWorldGame(canvas: HTMLCanvasElement, config: GameConfig): Promise<RoomGame> {
  const controller = new AbortController(), external = config.signal;
  const abort = () => controller.abort(external?.reason);
  external?.throwIfAborted();
  external?.addEventListener("abort", abort, { once: true });
  config = { ...config, signal: controller.signal };
  const response = await fetch(config.world!, { signal: config.signal });
  if (!response.ok) throw new Error(`Failed to load world (${response.status})`);
  const { rooms } = await response.json() as { rooms: WorldRoom[] };
  let active = true, busy = false, currentId = 0, current: RoomGame;
  let tokenCounter = 0, callbackOwner = 0;
  const saved = new Map<number, RoomSnapshot>();
  let settings = { atmosphere: true, walkSpeed: "fast" as "slowest" | "slow" | "fast" | "fastest", interval: 1,
    debug: {} as Parameters<RoomGame["setDebug"]>[0] };

  async function load(id: number, from?: RoomPortal, previous?: number) {
    const meta = rooms.find(r => r.id === id);
    if (!meta) throw new Error(`Unknown room ${id}`);
    const src = withBase(`assets/world/${id}.kyr.gz`), pack = await loadScenePack(src, config.signal);
    config.signal?.throwIfAborted();
    const clip = new IndexedClip(pack, pack.clips.mask);
    const mask = { width: clip.info.width, height: clip.info.height, pixels: Array.from(clip.frame(0)) };
    const opposite = from ? SIDES[(SIDES.indexOf(from.side) + 2) % 4] : "south";
    const arrival = nearestFloor(mask, from?.entry ?? meta.entrances[opposite]);
    const state = saved.get(id), shared = current?.getSnapshot();
    const resume = state ?? { pos: arrival, inventorySlots: [], itemInHand: null, sceneItems: [], overlays: [], treeSpoken: false };
    // Keep room props local, and carry the same inventory and held item through every exit.
    const continued = shared ? { ...resume, inventorySlots: shared.inventorySlots, itemInHand: shared.itemInHand } : state;
    let entryActions: RoomAction[] | undefined;
    if (previous === 1 && id === 5) entryActions = [...lift("dropdown", 232, 8, 6), { op: "actor", x: 280, y: 116, facing: 3, visible: true }];
    if (previous === 5 && id === 1) entryActions = [...lift("liftup", 192, 56, 5), { op: "actor", x: 208, y: 110, facing: 5, visible: true }];
    const token = ++tokenCounter, oldOwner = callbackOwner;
    callbackOwner = token;
    let game: RoomGame;
    try { game = await startRoom(canvas, { ...config, world: undefined, backgroundPack: pack,
      scene: { ...config.scene, name: meta.title, indexedBackground: { src, clip: "room" }, maskClip: "mask",
        indexedUi: { src: withBase("assets/packs/kallak-room.kyr.gz"), clip: "hud" }, meta, emc: { sceneAnimShapes: meta.shapes }, actorScale: meta.actorScale,
        opening: id === 0 ? config.scene.opening : undefined, items: id === 0 ? config.scene.items : [],
        overlays: id === 0 ? config.scene.overlays : [], sceneMetaSrc: undefined, sceneEmcSrc: undefined, maskSrc: undefined },
      resume: continued, entry: from ? { ...arrival, facing: SIDES.indexOf(from.side) * 2 } : undefined,
      playOpening: !from && config.playOpening !== false, entryActions, portals: roomPortals(meta, mask),
      onExit: portal => void exit(portal),
      onSequenceChange: value => { if (active && callbackOwner === token) config.onSequenceChange?.(value); },
      onSubtitleChange: lines => { if (active && callbackOwner === token) config.onSubtitleChange?.(lines); }
    }); } catch (error) { callbackOwner = oldOwner; throw error; }
    game.setAtmosphere(settings.atmosphere); game.setWalkSpeed(settings.walkSpeed);
    game.setAnimStepInterval(settings.interval); game.setDebug(settings.debug);
    return { game, meta };
  }

  async function navigate(portal: RoomPortal) {
    try {
      config.onLoadingChange?.(true);
      saved.set(currentId, current.getSnapshot());
      const next = await load(portal.target, portal, currentId);
      if (!active) { next.game.stop(); return; }
      current.stop(); current = next.game; currentId = portal.target;
      config.onLocationChange?.(next.meta.title, currentId);
      config.onNavigationError?.("");
    } catch (error) {
      if (active) {
        current.runSequence([{ op: "visible", visible: true }]);
        config.onNavigationError?.("The next scene could not be loaded. Tap the exit to try again.");
        console.warn("Room transition failed", error);
      }
    } finally { busy = false; if (active) config.onLoadingChange?.(false); }
  }
  function exit(portal: RoomPortal) {
    if (busy || !active) return;
    busy = true;
    if (currentId === 1 && portal.target === 5) current.runSequence(lift("liftdown", 192, 56, 5), () => void navigate(portal));
    else if (currentId === 5 && portal.target === 1) current.runSequence(lift("dropup", 232, 8, 6), () => void navigate(portal));
    else void navigate(portal);
  }
  const first = await load(0); current = first.game;
  config.onLocationChange?.(first.meta.title, 0);
  return {
    setTarget: point => { if (!busy) current.setTarget(point); },
    handleClick: point => busy || current.handleClick(point),
    setPointer: point => current.setPointer(point),
    setAtmosphere: enabled => { settings.atmosphere = enabled; current.setAtmosphere(enabled); },
    setWalkSpeed: speed => { settings.walkSpeed = speed; current.setWalkSpeed(speed); },
    setAnimStepInterval: interval => { settings.interval = interval; current.setAnimStepInterval(interval); },
    setDebug: debug => { settings.debug = debug; current.setDebug(debug); },
    runSequence: (actions, done) => current.runSequence(actions, done),
    getSnapshot: () => current.getSnapshot(),
    stop: () => { active = false; external?.removeEventListener("abort", abort); controller.abort(); current.stop(); }
  };
}
