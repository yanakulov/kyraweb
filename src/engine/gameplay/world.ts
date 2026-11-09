import { startRoom, type RoomGame } from "./game";
import { loadImage, withBase } from "../core/assets";
import { IndexedClip, loadScenePack, type ScenePack } from "../resources/scenePack";
import { isWalkable } from "../scene/masks";
import type { GameConfig, MaskData, RoomPortal, RoomSnapshot, SceneItem, SceneMeta, Vec2, WorldSave } from "../core/types";
import { isShadowrealmRoom, isWorldRoomId, PURPLE_JEWEL_FLAG, PURPLE_JEWEL_POS, YELLOW_JEWEL_FLAG, YELLOW_JEWEL_POS } from '../core/constants';
import type { RoomAction } from "./roomScript";
import { createForestState, traceForest, applyForestState, loadForestData, originalItem, itemFromOriginal,
  ageFireberry, curePoison, poisonArrival, scatterGem, groveGems, transformWisp } from './forest';
import { validateWorldSave } from './saveStorage';
import { findDropDestination } from './drops';

export const SIDES = ["north", "east", "south", "west"] as const;
const EXIT_FACING = { north: 0, east: 2, south: 4, west: 6 };
export type CursorTrack = Pick<RoomPortal, "side" | "rect">;
export type WorldRoom = SceneMeta & { id: number; name: string; title: string; exits: (number | null)[];
  entryMusic?: Extract<RoomAction, { op: 'music' }>[];
  cursorTrack?: CursorTrack;
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

export function roomPortals(room: WorldRoom, mask: MaskData, track = room.cursorTrack): RoomPortal[] {
  const portals: RoomPortal[] = room.portals.map((p, i) => ({ ...p, id: `door-${i}`,
    target: p.target === 65535 || p.target === -1 ? room.exits[SIDES.indexOf(p.side)]! : p.target,
    point: nearestFloor(mask, { x: p.rect.x + p.rect.w / 2, y: p.rect.y + p.rect.h }) }));
  // Side exits take precedence at corners. The south edge includes the status strip.
  for (const side of ["west", "east", "south", "north"] as const) {
    const target = room.exits[SIDES.indexOf(side)];
    if (target === null) continue;
    const origin = room.entrances[side];
    const point = nearestFloor(mask, side === "north" ? { x: origin.x, y: room.northHeight + 4 } :
      side === "south" ? { x: origin.x, y: 132 } : { x: side === "east" ? 304 : 16, y: origin.y });
    const rect = side === "north" ? { x: 0, y: 0, w: 320, h: 12 } :
      side === "south" ? { x: 0, y: 128, w: 320, h: 31 } : { x: side === "east" ? 308 : 0, y: 0, w: 12, h: 159 };
    portals.push({ id: side, target, side, point, rect });
  }
  if (room.id === 5) portals.unshift({ id: "lift", target: 1, side: "north", rect: { x: 235, y: 8, w: 66, h: 107 }, point: nearestFloor(mask, { x: 264, y: 108 }) });
  if (room.id === 1) portals.unshift({ id: "lift", target: 5, side: "south", rect: { x: 232, y: 96, w: 40, h: 40 }, point: nearestFloor(mask, { x: 216, y: 106 }) });
  // EMC describes the visible entrance separately from the strip Brandon has to cross.
  const tracked = track && portals.find(portal => portal.side === track.side);
  if (tracked) portals.unshift({ ...tracked, rect: track.rect });
  return portals.filter(p => isWorldRoomId(p.target));
}

// Fixed floor items from the CD's _STARTUP.EMC. Visited rooms use their saved items.
const startingItems: Record<number, SceneItem[]> = {
  17: [{ id: 'item-25', x: 115, y: 115 }],
  30: [{ id: 'item-27', x: 128, y: 128 }],
  37: [{ id: 'apple', x: 82, y: 134 }],
  110: [{ id: 'item-22', x: 120, y: 102 }, { id: 'item-102', x: 301, y: 111 }],
  113: [{ id: 'item-4', x: 78, y: 58 }, { id: 'item-4', x: 216, y: 104 }],
  129: [{ id: 'item-102', x: 158, y: 92 }],
  153: [{ id: 'item-102', x: 158, y: 92 }],
  161: [{ id: 'item-102', x: 158, y: 92 }],
  184: [{ id: 'item-102', x: 159, y: 92 }],
  198: [{ id: 'item-57', x: 200, y: 78 }],
};

const lift = (clip: string, x: number, y: number, ticks: number): RoomAction[] => [
  { op: "visible", visible: false }, { op: "movie", clip, x, y, ticks }, { op: "close", clip }
];

export async function startWorldGame(canvas: HTMLCanvasElement, config: GameConfig): Promise<RoomGame> {
  const restored = config.saveState ? validateWorldSave(config.saveState) : null;
  const controller = new AbortController(), external = config.signal;
  const abort = () => controller.abort(external?.reason);
  external?.throwIfAborted();
  external?.addEventListener("abort", abort, { once: true });
  config = { ...config, signal: controller.signal };
  try {
  const response = await fetch(config.world!, { signal: config.signal });
  if (!response.ok) throw new Error(`Failed to load world (${response.status})`);
  const { rooms } = await response.json() as { rooms: WorldRoom[] };
  const [forest, locationSign] = await Promise.all([
    loadForestData(withBase('assets/forest/forest.json.gz'), config.signal),
    loadImage(withBase('assets/interface/location-sign.png'), config.signal).catch(() => undefined),
  ]);
  const initialQuest = createForestState();
  const quest=restored ? { ...initialQuest, ...restored.quest, flags: new Set(restored.quest.flags) } : initialQuest;
  if (restored && !restored.quest.vaseInitialized && quest.vase === -1) quest.vase = initialQuest.vase;
  if (restored && !restored.quest.birthstones) {
    for (let flag = 17; flag <= 33; flag++) quest.flags.add(flag);
    if (quest.flags.has(78)) for (const item of groveGems) applyForestState(quest, scatterGem(item, 0, 36));
  }
  // Saves from before Timbermist have not initialized the four unpicked acorns.
  if (restored && !restored.rooms[31]) for (const flag of [72, 73, 74, 75]) quest.flags.add(flag);
  let active = true, busy = false, paused = config.paused ?? false, currentId = restored?.currentRoom ?? 0, current: RoomGame;
  let tokenCounter = 0, callbackOwner = 0;
  const saved = new Map<number, RoomSnapshot>(restored ? Object.entries(restored.rooms).map(([id, room]) => [Number(id), room]) : []);
  const settings = { atmosphere: restored?.settings.atmosphere ?? true, walkSpeed: restored?.settings.walkSpeed ?? "fast", interval: restored?.settings.animStepInterval ?? 1,
    debug: {} as Parameters<RoomGame["setDebug"]>[0] };
  const packs = new Map<string, Promise<ScenePack>>();
  controller.signal.addEventListener('abort', () => packs.clear(), { once: true });
  function roomSource(id: number) {
    const original = rooms.find(r => r.id === id);
    const script = forest.rooms[quest.files[id] ?? original?.name ?? ''];
    const questRoom = script && original && script.id !== id ? { ...script, id, title: original.title, exits: original.exits } : script;
    return { meta: questRoom ?? original, questRoom,
      src: withBase(questRoom && id !== 1 ? `assets/forest/${questRoom.name.toLowerCase()}.kyr.gz` : `assets/world/${id}.kyr.gz`) };
  }
  function prepare(src: string) {
    let pending = packs.get(src);
    if (!pending) {
      pending = loadScenePack(src, config.signal).catch(error => { packs.delete(src); throw error; });
      packs.set(src, pending);
    }
    return pending;
  }
  function prepareNeighbours(portals: RoomPortal[]) {
    for (const id of new Set(portals.map(portal => portal.target))) {
      const { meta, src } = roomSource(id);
      // A failed speculative request is retried by the real entrance, with its normal error UI.
      if (meta) void prepare(src).catch(() => {});
    }
  }

  async function load(id: number, from?: RoomPortal, previous?: number, restoring = false) {
    const { meta, questRoom, src } = roomSource(id);
    if (!meta) throw new Error(`Unknown room ${id}`);
    const pack = await prepare(src);
    config.signal?.throwIfAborted();
    const clip = new IndexedClip(pack, pack.clips.mask);
    const mask = { width: clip.info.width, height: clip.info.height, pixels: Array.from(clip.frame(0)) };
    function changeMask(action: { x: number; y: number; w: number; h: number; blocked: boolean }) {
      for(let y=Math.max(0,action.y);y<Math.min(mask.height,action.y+action.h);y++)for(let x=Math.max(0,action.x);x<Math.min(mask.width,action.x+action.w);x++){
        const i=y*mask.width+x;mask.pixels[i]=action.blocked?mask.pixels[i]|128:mask.pixels[i]&127;
      }
    }
    const opposite = from ? SIDES[(SIDES.indexOf(from.side) + 2) % 4] : "south";
    let arrival = nearestFloor(mask, from?.entry ?? meta.entrances[opposite]);
    const state = saved.get(id), shared = current?.getSnapshot();
    const resume = state ?? { pos: arrival, inventorySlots: [], itemInHand: null, sceneItems: startingItems[id] ?? [], overlays: [], treeSpoken: false };
    const additions = quest.scatteredGems[id] ?? [];
    if (restoring && !state?.runtime) throw new Error("This saved room is incomplete. Choose another saved game.");
    if (restoring) for (const change of state!.runtime!.masks) changeMask(change);
    const planned = structuredClone(quest);
    let setupActions:RoomAction[]=!questRoom && !restoring ? meta.entryMusic ?? [] : [];
    const facing=restoring ? state!.facing ?? 5 : from?({north:0,east:3,south:4,west:5}[from.side]):5;
    if (restoring) arrival = { ...state!.pos };
    const carried = shared ?? resume;
    const ageBerries = from && from.id !== 'phase' && previous !== id;
    const snapshot={...resume, inventorySlots: ageBerries ? carried.inventorySlots.map(ageFireberry) : carried.inventorySlots,
      itemInHand: ageBerries ? ageFireberry(carried.itemInHand) : carried.itemInHand,
      wispMs: carried.wispMs,
      sceneItems: resume.sceneItems.map(item => ({ ...item })), pos:arrival,facing,walkDelayTicks:({slowest:11,slow:9,fast:6,fastest:3})[settings.walkSpeed]};
    let cursorTrack = meta.cursorTrack;
    if (questRoom) {
      const setup = traceForest(questRoom, 0, planned, snapshot);
      cursorTrack = setup.cursorTrack ?? cursorTrack;
      if (!restoring) setupActions = setup.actions;
    }
    if(questRoom && !restoring){
      for(const action of setupActions){
        applyForestState(planned,action);
        if(action.op==='mask')changeMask(action);
      }
      arrival=nearestFloor(mask,from?.entry??meta.entrances[opposite]);snapshot.pos=arrival;
      setupActions.unshift({op:'npc',character:2,...quest.herman,visible:quest.herman.room===id},{op:'npc',character:1,...quest.merith,visible:quest.merith.room===id});
    }
    for (const [index, gem] of additions.entries()) {
      const preferred = { x: 46 + (id * 29 + gem * 37 + index * 17) % 222, y: Math.max(meta.northHeight, 94 + gem % 4 * 6) };
      const floor = findDropDestination(preferred, config.scene, mask, snapshot.sceneItems) ?? nearestFloor(mask, preferred);
      snapshot.sceneItems.push({ id: itemFromOriginal(gem)!, ...floor });
    }
    let entryActions: RoomAction[] | undefined;
    if (!restoring && previous === 1 && id === 5) entryActions = [...lift("dropdown", 232, 8, 6), { op: "actor", x: 280, y: 116, facing: 3, visible: true }];
    if (!restoring && previous === 5 && id === 1) {
      planned.flags.add(52);
      setupActions.push({ op: 'visible', visible: false });
    }
    if(questRoom && (id!==0 || from) && !restoring){
      const announce=traceForest(questRoom,2,planned,snapshot,snapshot.pos,p=>isWalkable(p,{uiMaskY:136} as GameConfig['scene'],mask)).actions;
      for(const action of announce)applyForestState(planned,action);
      entryActions=[...(entryActions??[]),...announce,...traceForest(questRoom,3,planned,snapshot,snapshot.pos,p=>isWalkable(p,{uiMaskY:136} as GameConfig['scene'],mask)).actions];
    }
    if (from && from.id !== 'phase' && meta.title && ![...setupActions, ...(entryActions ?? [])].some(action =>
      action.op === 'message' && action.text.trim() === meta.title.trim())) {
      entryActions = [{ op: 'message', text: meta.title }, ...(entryActions ?? [])];
    }
    if (from && from.id !== 'phase' && quest.poison) {
      entryActions = [...(entryActions ?? []), ...poisonArrival(quest.poison, snapshot.pos, forest.flute.durations)];
    }
    // A destination cue wins. Otherwise use the departing room's EMC score or the shared forest theme.
    if (from && from.id !== 'phase' && previous !== undefined &&
        ![...setupActions, ...(entryActions ?? [])].some(action => action.op === 'music' && action.command !== 1)) {
      const departing = roomSource(previous).questRoom;
      const leaving = departing && shared && traceForest(departing, 5, quest, { ...shared, facing: EXIT_FACING[from.side] });
      const score = leaving && leaving.actions.filter(action => action.op === 'music' && action.command !== 1).at(-1);
      setupActions.push(score || { op: 'music',
        command: id === 38 ? 21 : isShadowrealmRoom(id) ? snapshot.wispMs ? 17 : 3 : id >= 17 ? 11 : 2, restart: false });
    }
    const token = ++tokenCounter, oldOwner = callbackOwner;
    callbackOwner = token;
    let game: RoomGame;
    let transitionImage: HTMLCanvasElement | undefined;
    if (from?.id === 'phase') {
      transitionImage = document.createElement('canvas');
      transitionImage.width = 320; transitionImage.height = 200;
      transitionImage.getContext('2d')!.drawImage(canvas, 0, 0);
    }
    const portals = roomPortals(meta, mask, cursorTrack);
    try { game = await startRoom(canvas, { ...config, world: undefined, saveState: undefined, paused, locationSign, roomResource: meta.name, backgroundPack: pack, transitionImage,
      scene: { ...config.scene, name: meta.title, indexedBackground: { src, clip: "room" }, maskClip: "mask",
        indexedUi: { src: withBase("assets/packs/kallak-room.kyr.gz"), clip: "hud" }, meta, emc: { sceneAnimShapes: meta.shapes }, actorScale: meta.actorScale,
        opening: id === 0 ? config.scene.opening : undefined, items: id === 0 ? config.scene.items : [],
        overlays: id === 0 && !questRoom ? config.scene.overlays : [], sceneMetaSrc: undefined, sceneEmcSrc: undefined, maskSrc: undefined },
      resume: state || shared || additions.length ? { ...snapshot, runtime: restoring ? snapshot.runtime : undefined } : undefined,
      entry: from || restoring ? { ...arrival, facing } : undefined,
      playOpening: !restoring && !from && config.playOpening !== false, entryActions, setupActions, amulet:quest.flags.has(45), npcFrames:questRoom?.npcFrames, portals,
      yellowJewel: quest.flags.has(YELLOW_JEWEL_FLAG),
      purpleJewel: quest.flags.has(PURPLE_JEWEL_FLAG),
      onWispExpire: () => transformWisp(id, false),
      poisoned: quest.poison > 0,
      heroActions: quest.poison > 0 || quest.flags.has(PURPLE_JEWEL_FLAG) || [25, 29, 35, 111, 117].includes(id) || snapshot.itemInHand === 'item-55' ||
        snapshot.inventorySlots.includes('item-55') || snapshot.sceneItems.some(item => item.id === 'item-55'),
      onPortalInteract: questRoom ? (portal, point, snapshot) => {
        const grotto = id === 25 && portal.target === 109 && (!quest.flags.has(71) || quest.flags.has(82));
        const closingGate = id === 115 && !quest.flags.has(116) && !quest.flags.has(117);
        const chasm = id === 114 && (portal.target === 120 && !quest.flags.has(113) || portal.target === 121 && quest.flags.has(113));
        const lava = id === 117 && portal.target === 198 && !quest.flags.has(179);
        if (!grotto && !closingGate && !chasm && !lava) return null;
        const trigger = closingGate ? { x: 165, y: 100 } : chasm ? { x: 180, y: portal.target === 120 ? 52 : 108 } : lava ? { x: 8, y: 8 } : point;
        return traceForest(questRoom, 1, quest, snapshot, trigger,
          p => isWalkable(p, { uiMaskY: 136 } as GameConfig['scene'], mask), [], grotto ? -5 : originalItem(snapshot.itemInHand)).actions;
      } : undefined,
      portalOpen: id === 115 ? portal => portal.target !== 197 || !quest.flags.has(116) || quest.flags.has(117) : undefined,
      onAmuletInteract: (snapshot, jewel) => {
        const say = (text: string, voiceId: number, ms: number): RoomAction => ({ op: 'say', text, voiceId, voiceBank: 'CHAPTER1', ms,
          x: snapshot.pos.x, y: snapshot.pos.y - 56, speaker: 0, color: 15, blocking: true });
        if (snapshot.itemInHand) return [say("Maybe I'd better put this down first.", 2000, 2019)];
        if (jewel === 'purple') {
          if (!quest.flags.has(PURPLE_JEWEL_FLAG)) return [say("It's a jewel, but why is it black?", 2002, 2234)];
          const pressed: RoomAction[] = [{ op: 'sfx', track: 0x45 },
            { op: 'frame', clip: 'purple-jewel', index: 11, ...PURPLE_JEWEL_POS, ms: 100 },
            { op: 'close', clip: 'purple-jewel' }];
          if (quest.poison) return [...pressed, say("I can't do that while I'm poisoned.", 2004, 1900)];
          return [...pressed, ...transformWisp(id, !snapshot.wispMs)];
        }
        if (!quest.flags.has(YELLOW_JEWEL_FLAG)) return [say("It's a jewel, but why is it black?", 2002, 2234)];
        const pressed: RoomAction[] = [{ op: 'sfx', track: 0x45 },
          { op: 'frame', clip: 'yellow-jewel', index: 11, ...YELLOW_JEWEL_POS, ms: 100 },
          { op: 'close', clip: 'yellow-jewel' }];
        if (quest.poison) return [...pressed, ...curePoison(snapshot.pos, forest.flute.durations)];
        const healing = questRoom && traceForest(questRoom, 4, quest, snapshot);
        return [...pressed, ...(healing && healing.handled ? healing.actions : [say('Gee, this could come in handy if I get hurt.', 2003, 1810)])];
      },
      onScriptAction: action=>{applyForestState(quest,action);if(action.op==='mask')changeMask(action);if(active&&callbackOwner===token)config.onScriptAction?.(action.op === 'say' && !action.voiceBank ? { ...action, voiceBank: meta.name } : action);},
      onActorInteract: snapshot => {
        const { itemInHand, pos } = snapshot;
        if (itemInHand === 'item-55' || id === 117 && itemInHand === 'item-80') {
          return traceForest({ ...meta, clipFrames: questRoom?.clipFrames ?? {}, npcFrames: {}, ...forest.flute },
            0, quest, snapshot).actions;
        }
        const actions = itemInHand === 'letter' ? forest.letter[quest.flags.has(129) ? 'readable' : 'sealed']
          : id === 24 && !itemInHand ? forest.caveSelf : forest.self?.[originalItem(itemInHand)];
        return actions?.map(action => action.op === 'say' ? { ...action, voiceBank: 'CHAPTER1', x: pos.x, y: pos.y - 56 } : action) ?? null;
      },
      onInteract: questRoom?(point,snapshot)=>{
        if(snapshot.treeSpoken)quest.flags.add(53);
        const result=traceForest(questRoom,1,quest,snapshot,point,p=>isWalkable(p,{uiMaskY:136} as GameConfig['scene'],mask));
        return result.handled?result.actions:null;
      }:undefined,
      onDeath:()=>{if(active&&callbackOwner===token)config.onDeath?.();},
      onCheckpoint: () => { if (active && callbackOwner === token) config.onCheckpoint?.(); },
      onContinueChange:value=>{if(active&&callbackOwner===token)config.onContinueChange?.(value);},
      onNoteChange:value=>{if(active&&callbackOwner===token)config.onNoteChange?.(value);},
      onExit: portal => void exit(portal),
      onSequenceChange: value => { if (active && callbackOwner === token) {
        config.onSequenceChange?.(value);
        if(!value && current && quest.files[id] && quest.files[id]!==meta.name) {
          const pos=current.getSnapshot().pos;
          queueMicrotask(()=>{if(active&&!busy)exit({id:'phase',target:id,side:'south',rect:{x:0,y:0,w:0,h:0},point:pos,entry:pos});});
        }
      } },
      onSubtitleChange: lines => { if (active && callbackOwner === token) config.onSubtitleChange?.(lines); }
    }); } catch (error) { callbackOwner = oldOwner; throw error; }
    game.setAtmosphere(settings.atmosphere); game.setWalkSpeed(settings.walkSpeed);
    game.setAnimStepInterval(settings.interval); game.setDebug(settings.debug);
    if (additions.length) delete quest.scatteredGems[id];
    return { game, meta, portals };
  }

  async function navigate(portal: RoomPortal) {
    try {
      config.onLoadingChange?.(true);
      saved.set(currentId, current.getSnapshot());
      const next = await load(portal.target, portal, currentId);
      if (!active) { next.game.stop(); return; }
      current.stop(); current = next.game; currentId = portal.target;
      config.onLocationChange?.(next.meta.title, currentId, next.meta.name);
      config.onNavigationError?.("");
      prepareNeighbours(next.portals);
    } catch (error) {
      if (active) {
        current.runSequence([{ op: "visible", visible: true }]);
        config.onNavigationError?.("The next scene could not be loaded. Tap the exit to try again.");
        console.warn("Room transition failed", error);
      }
    } finally { busy = false; if (active) config.onLoadingChange?.(false); }
  }
  function exit(portal: RoomPortal) {
    if (busy || paused || !active) return;
    busy = true;
    if(portal.id==='script')void navigate(portal);
    else if (currentId === 1 && portal.target === 5) current.runSequence(lift("liftdown", 192, 56, 5), () => void navigate(portal));
    else if (currentId === 5 && portal.target === 1) current.runSequence(lift("dropup", 232, 8, 6), () => void navigate(portal));
    else void navigate(portal);
  }
  const first = await load(currentId, undefined, undefined, !!restored); current = first.game;
  config.onLocationChange?.(first.meta.title, currentId, first.meta.name);
  prepareNeighbours(first.portals);
  return {
    setTarget: point => { if (!busy && !paused) current.setTarget(point); },
    handleClick: point => busy || paused || current.handleClick(point),
    setPointer: point => current.setPointer(point),
    setControlMode: mode => { config.controlMode = mode; current.setControlMode(mode); },
    setInventoryOpen: value => !busy && current.setInventoryOpen(value),
    getInventoryOpen: () => current.getInventoryOpen(),
    skipOpening: () => !busy && current.skipOpening(),
    setAtmosphere: enabled => { settings.atmosphere = enabled; current.setAtmosphere(enabled); },
    setWalkSpeed: speed => { settings.walkSpeed = speed; current.setWalkSpeed(speed); current.setAnimStepInterval(settings.interval); },
    setAnimStepInterval: interval => { settings.interval = interval; current.setAnimStepInterval(interval); },
    setDebug: debug => { settings.debug = debug; current.setDebug(debug); },
    runSequence: (actions, done) => current.runSequence(actions, done),
    getSnapshot: () => current.getSnapshot(),
    getSaveSnapshot: () => active && !busy ? current.getSaveSnapshot() : null,
    getSaveState: (): WorldSave | null => {
      const room = active && !busy ? current.getSaveSnapshot() : null;
      if (!room) return null;
      return structuredClone({ version: 1, currentRoom: currentId,
        rooms: { ...Object.fromEntries(saved), [currentId]: room },
        quest: { ...quest, flags: [...quest.flags], vaseInitialized: true },
        settings: { atmosphere: settings.atmosphere, walkSpeed: settings.walkSpeed, animStepInterval: settings.interval } });
    },
    setPaused: value => { paused = value; current.setPaused(value); },
    getPortals: () => busy || paused ? [] : current.getPortals(),
    stop: () => { active = false; external?.removeEventListener("abort", abort); controller.abort(); current.stop(); }
  };
  } catch (error) {
    external?.removeEventListener("abort", abort); controller.abort(); throw error;
  }
}
