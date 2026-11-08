import { sceneShuffle } from './sceneShuffle';
import { locale, t, translateGameText } from '../../i18n';
import { DEFAULT_ANIM_STEP_INTERVAL, HUD_OPTIONS_RECT, INVENTORY_ICON_SIZE, LOGICAL_HEIGHT, LOGICAL_WIDTH, ROOM_ART, TICK_MS, YELLOW_JEWEL_FLAG, YELLOW_JEWEL_HITBOX, YELLOW_JEWEL_POS } from "../core/constants";
import { loadImage, loadMask, loadSceneEmc, loadSceneMeta, loadSceneShapes, withBase } from "../core/assets";
import { dropItemAt, drawDropAnims, updateDrops } from "./drops";
import {
  buildInventoryItems,
  drawInventory,
  drawSceneItems,
  findInventorySlot,
  findSceneItemAt,
  getInventorySlotPositions,
  getItemStatusName,
  getTileRect,
  inside,
  initInventory
} from "./inventory";
import { drawRadialInventory, RADIAL_SLOT_SIZE, radialLayout } from "./radialInventory";
import { buildMaskCanvas, buildForegroundFrame, isWalkable, resolveActorLayer } from "../scene/masks";
import { findWalkPath, findClickPath } from "./pathfinding";
import { facingDirection, getIdleFrame, getSequence, stepFacing } from "./movement";
import { filterSceneAnimShapes, findOverlayAt, initSceneOverlays, drawSceneOverlays } from "../scene/overlays";
import { buildSceneAnimStates, drawSceneAnims, updateSceneAnims } from "../scene/sceneAnims";
import { buildSceneShapesCanvas, buildSpriteDefMap, drawSceneAnimShapes } from "../scene/sceneShapes";
import { buildUiOverlay, drawInventoryTooltip, drawLayerDebug, drawStatusLine } from "../core/ui";
import { loadPackedAnimation, createPackedAnimation } from "../resources/packedAnimation";
import { drawKallakAtmosphere } from "../rendering/kallakAtmosphere";
import { buildIndexedCanvas, IndexedRenderer } from "../rendering/indexedRenderer";
import { IndexedClip, loadScenePack } from "../resources/scenePack";
import { RoomScript, type OpeningScript, type RoomAction } from "./roomScript";
import { brandonTalkHead, actorScaleAt } from "../characters/brandonFrames";
import { startWorldGame } from "./world";
import { exitCursor, portalAtPoint, roomViewPortals } from "./navigation";
import type { ControlMode, DropAnim, GameConfig, InventoryItemId, RoomRuntimeSnapshot, RoomSnapshot, SceneItem, SceneOverlayState, Vec2, WorldSave } from "../core/types";

const actorMovies = new Set(['brantree', 'touch', 'brynn1', 'brynn2', 'brynn3', 'raindrop', 'wow', 'tag', 'agile', 'balance2', 'sngspell']);
const behindActors = (clip: string) => clip === 'face' || clip === 'face2' || clip === 'songbird-rest';

export type RoomGame = Awaited<ReturnType<typeof startRoom>>;
export async function startGame(canvas: HTMLCanvasElement, config: GameConfig): Promise<RoomGame> {
  return config.world ? startWorldGame(canvas, config) : startRoom(canvas, config);
}

export async function startRoom(canvas: HTMLCanvasElement, config: GameConfig) {
  config.signal?.throwIfAborted();
  // A loaded room must never mutate a caller's save or a previously visited room.
  if (config.resume) config = { ...config, resume: structuredClone(config.resume) };
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context not available");
  const ctx = context;

  const scene = config.scene;

  const packedBackground = scene.indexedBackground
    ? config.backgroundPack ? createPackedAnimation(config.backgroundPack, scene.indexedBackground.clip) : await loadPackedAnimation(scene.indexedBackground.src, scene.indexedBackground.clip, config.signal)
    : null;
  const scriptRenderers = new Map<string, { clip: IndexedClip; renderer: IndexedRenderer }>();
  // Keep an exact, unmodified source for foreground occlusion masks.
  try {
    const packedBase = packedBackground ? buildIndexedCanvas(packedBackground.clip.info, packedBackground.clip.frame(0)) : null;
    const hudPack = scene.indexedUi ? await loadScenePack(scene.indexedUi.src, config.signal) : packedBackground?.clip.pack;
    const hudInfo = hudPack?.clips[scene.indexedUi?.clip ?? "hud"];
    const packedHud = hudPack && hudInfo ? new IndexedClip(hudPack, hudInfo) : null;
    const maskInfo = scene.maskClip && packedBackground?.clip.pack.clips[scene.maskClip];
    const packedMask = packedBackground && maskInfo ? new IndexedClip(packedBackground.clip.pack, maskInfo) : null;
    const [bg, br, ui, mask, itemsSheet, optionsRu] = await Promise.all([
      packedBase ? Promise.resolve(packedBase) : loadImage(scene.bgSrc),
      loadImage(scene.brSrc),
      !packedHud && scene.uiOverlaySrc ? loadImage(scene.uiOverlaySrc) : Promise.resolve(null),
      packedMask ? Promise.resolve({ width: packedMask.info.width, height: packedMask.info.height, pixels: Array.from(packedMask.frame(0)) }) : scene.maskSrc ? loadMask(scene.maskSrc) : Promise.resolve(null),
      loadImage(withBase("assets/inventory/items.png")),
      packedHud || scene.uiOverlaySrc ? loadImage(withBase("assets/interface/HUD/options-ru.png"), config.signal) : Promise.resolve(null)
    ]);
    const sceneMeta = scene.meta ?? (scene.sceneMetaSrc ? await loadSceneMeta(scene.sceneMetaSrc) : null);
    const sceneEmc = scene.emc ?? (scene.sceneEmcSrc ? await loadSceneEmc(scene.sceneEmcSrc) : null);
    const sceneShapesData = !packedBackground && scene.sceneShapesSrc ? await loadSceneShapes(scene.sceneShapesSrc) : null;
    const inventoryItems = buildInventoryItems();

    const frames = scene.frames;
    const uiOverlay = packedHud ? buildIndexedCanvas(packedHud.info, packedHud.frame(0), true) : ui ? buildUiOverlay(ui) : null;
    const maskCanvas = mask ? buildMaskCanvas(mask) : null;
    const foregroundFrames = new Map<number, HTMLCanvasElement>();
    const drawLayerTable = scene.drawLayerTable ?? sceneMeta?.drawLayerTable ?? null;
    const spriteDefs = sceneMeta?.spriteDefs ?? [];
    const anims = sceneMeta?.anims ?? [];
    const spriteDefMap = spriteDefs.length ? buildSpriteDefMap(spriteDefs) : null;
    const sceneAnims = anims.length ? buildSceneAnimStates(anims) : [];
    const sceneAnimOrder = anims.map(({ drawY }, index) => ({ drawY, index })).sort((a, b) => a.drawY - b.drawY || b.index - a.index);
    let sceneTicks = 0, sceneAccumulatorMs = 0;
    const sceneAnimShapes = sceneEmc?.sceneAnimShapes ?? [];
    const overlayDefinitions = initSceneOverlays(scene.overlays);
    const sceneOverlays = config.resume?.overlays ?? overlayDefinitions;
    const filteredSceneAnimShapes = overlayDefinitions.length
      ? filterSceneAnimShapes(sceneAnimShapes, overlayDefinitions)
      : sceneAnimShapes;
    const sceneShapesCanvas = packedBackground ? buildSceneShapesCanvas({
      width: packedBackground.clip.info.width, height: packedBackground.clip.info.height,
      palette: packedBackground.clip.info.palette, rawBase64: "",
    }, packedBackground.clip.frame(0)) : sceneShapesData ? buildSceneShapesCanvas(sceneShapesData) : null;
    const sceneShapesImage = sceneShapesCanvas ?? bg;
    const [openingPack, openingScript] = scene.opening ? await Promise.all([
      loadScenePack(scene.opening.pack, config.signal),
      fetch(scene.opening.script, { signal: config.signal }).then(async response => {
        if (!response.ok) throw new Error(`Failed to load opening script (${response.status})`);
        return await response.json() as OpeningScript;
      })
    ]) : [null, null];
    config.signal?.throwIfAborted();
    if (openingPack) for (const [name, info] of Object.entries(openingPack.clips)) {
      scriptRenderers.set(name, { clip: new IndexedClip(openingPack, info), renderer: new IndexedRenderer(info, false) });
    }
    const scriptLayers = new Map<string, { image: HTMLCanvasElement; index: number; x: number; y: number }>();
    const permanentLayers = new Map<string, { image: HTMLCanvasElement; index: number; x: number; y: number }>();
    const maskChanges: RoomRuntimeSnapshot["masks"] = [];
    const questShapes: {shape:number;x:number;y:number;flags:number}[] = [];
    const noDropRegions: {x:number;y:number;w:number;h:number}[] = [];
    const npcs = new Map<number,Extract<RoomAction,{op:'npc'}>>();
    const heldNpcPoses = new Map<number,Extract<RoomAction,{op:'npc'}>>();
    let speaker = 0;
    let hasAmulet=config.amulet??false;
    let hasYellowJewel = config.yellowJewel ?? false;
    let shakeUntil = 0;
    const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    let dead=false;
    const roomPalette=packedBackground?.clip.info.palette.slice();
    let paletteFade:{from:number[];to:number[];ms:number;age:number;step:number}|null=null;
    const backdrop = config.backdropCanvas?.getContext('2d');
    let backdropDirty = true;
    let backdropScene = '';
    function updatePalette(ms:number){
      if(!paletteFade||!roomPalette||!packedBackground)return;
      const fade=paletteFade;fade.age+=ms;
      const max=Math.max(...fade.to.map((v,i)=>Math.abs(v-fade.from[i])));
      const step=fade.ms?Math.min(max,Math.floor(max*Math.min(1,fade.age/fade.ms)/4)*4):max;
      if(step===fade.step)return;fade.step=step;
      for(let i=0;i<roomPalette.length;i++)roomPalette[i]=fade.from[i]+Math.sign(fade.to[i]-fade.from[i])*Math.min(step,Math.abs(fade.to[i]-fade.from[i]));
      packedBackground.renderer.setPalette(roomPalette);
      backdropDirty = true;
      if(sceneShapesCanvas){const next=buildSceneShapesCanvas({width:320,height:200,palette:roomPalette,rawBase64:''},packedBackground.clip.frame(0));const context=sceneShapesCanvas.getContext('2d')!;context.clearRect(0,0,320,200);context.drawImage(next,0,0);}
      foregroundFrames.clear();
      for(const [name,animation] of scriptRenderers){animation.renderer.setPalette(roomPalette);if(scriptLayers.has(name))animation.renderer.render(animation.clip.pixels);}
      if(fade.age>=fade.ms)paletteFade=null;
    }
    let ambientWait: number | null = null;
    if (packedBackground) for (const [name, info] of Object.entries(packedBackground.clip.pack.clips)) {
      if (!["room", "mask", "hud"].includes(name)) scriptRenderers.set(name, {
        clip: new IndexedClip(packedBackground.clip.pack, info), renderer: new IndexedRenderer(info, false)
      });
    }
    if (config.amulet || scriptRenderers.has('amulet')) {
      const pack=await loadScenePack(withBase('assets/forest/amulet.kyr.gz'),config.signal);
      for (const [name, info] of Object.entries(pack.clips)) {
        if (!scriptRenderers.has(name)) scriptRenderers.set(name,{clip:new IndexedClip(pack,info),renderer:new IndexedRenderer(info,false)});
      }
    }
    if (config.onActorInteract && !scriptRenderers.has('note')) {
      const pack = await loadScenePack(withBase('assets/forest/note.kyr.gz'), config.signal), info = pack.clips.note;
      scriptRenderers.set('note', { clip: new IndexedClip(pack, info), renderer: new IndexedRenderer(info, false) });
    }
    let backgroundName = "room";
    let actorVisible = true;
    let actorShape: number | null = null;
    let speechRemaining = 0;
    let speechAge = 0;
    let sequence: RoomScript | null = null;
    let openingSequence: RoomScript | null = null;
    let skippingOpening = false;
    let treeSpoken = config.resume?.treeSpoken ?? false;
    let pendingPortal: NonNullable<GameConfig["portals"]>[number] | null = null;
    let sequenceDone: (() => void) | null = null;
    const debug = {
      showMask: false,
      maskOpacity: 0.35,
      showLayerInfo: false
    };

    const state = {
      pos: { x: config.entry?.x ?? config.resume?.pos.x ?? 160, y: config.entry?.y ?? config.resume?.pos.y ?? 120 } as Vec2,
      target: null as Vec2 | null,
      path: [] as Vec2[],
      pathIndex: 0,
      pointer: null as Vec2 | null,
      walkDelayTicks: config.resume?.walkDelayTicks ?? 6,
      stepAccumulatorMs: 0,
      stepIndex: 0,
      facing: 3,
      verticalSteps: 0,
      animStepInterval: DEFAULT_ANIM_STEP_INTERVAL,
      dir: "right" as "left" | "right" | "up" | "down",
      frame: 0,
      moving: false,
      inventorySlots: config.resume?.inventorySlots ?? initInventory(),
      itemInHand: config.resume?.itemInHand ?? null as InventoryItemId | null,
      sceneItems: config.resume?.sceneItems ?? initSceneItems(scene),
      overlays: sceneOverlays,
      drops: [] as DropAnim[],
      statusMessage: null as string | null,
      statusMessageUntil: 0,
    };

    let lastTime = performance.now();
    let clockMs = 0;
    let running = true;
    let paused = config.paused ?? false;
    let modern = config.controlMode === 'modern';
    const classicPortals = config.portals ?? [];
    const modernPortals = roomViewPortals(classicPortals);
    let inventoryOpen = false;
    let amuletMovieActive = false;
    let radial = radialLayout(scene.uiMaskY);
    let radialOpenedAt = 0;
    const radialCanvas = config.inventoryCanvas;
    let radialFootprint = { x: 1, y: 1 };

    function openRadialAt(anchor: Vec2 | null) {
      let scale = 1;
      if (radialCanvas) {
        const rect = canvas.getBoundingClientRect();
        const sx = rect.width / LOGICAL_WIDTH, sy = rect.height / canvas.height;
        if (sx > 0 && sy > 0) {
          scale = Math.min(sx, sy);
          radialFootprint = { x: scale / sx, y: scale / sy };
        }
      }
      radial = radialLayout(scene.uiMaskY, anchor, radialFootprint);
      radialOpenedAt = clockMs;
      if (radialCanvas) {
        const size = radial.radius * 2 + 1;
        radialCanvas.width = radialCanvas.height = size;
        radialCanvas.style.width = radialCanvas.style.height = `${size * scale}px`;
        radialCanvas.style.left = `${radial.x * 100 / LOGICAL_WIDTH}%`;
        radialCanvas.style.top = `${radial.y * 100 / canvas.height}%`;
      }
    }

    function toRadialPoint(point: Vec2) {
      return { x: radial.x + (point.x - radial.x) / radialFootprint.x,
        y: radial.y + (point.y - radial.y) / radialFootprint.y };
    }
    let atmosphere = true;
    const reducedMotion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

    const transition = config.transitionImage ? sceneShuffle(config.transitionImage) : null;
    function update(dt: number, nowMs: number) {
      if (transition?.active) { transition.update(dt * 1000); return; }
      updatePalette(dt*1000);
      speechRemaining = Math.max(0, speechRemaining - dt * 1000);
      if (speechRemaining > 0) speechAge += dt * 1000;
      if (state.statusMessage && nowMs >= state.statusMessageUntil) {
        state.statusMessage = null;
      }
      if (sceneAnims.length) {
        // DAT instructions run on the game clock, independently of display Hz.
        sceneAccumulatorMs += dt * 1000;
        while (sceneAccumulatorMs + 1e-7 >= TICK_MS) {
          sceneAccumulatorMs = Math.max(0, sceneAccumulatorMs - TICK_MS);
          updateSceneAnims(sceneAnims, ++sceneTicks * TICK_MS,(op,value)=>{
            if(op===0xFFAD)state.pos.x=value;if(op===0xFFAE)state.pos.y=value;
            if(op===0xFFAF)actorShape=value;
          }, soundEffect);
        }
      }
      if (ambientWait !== null && !sceneAnims[ambientWait]?.play) ambientWait = null;
      if (state.drops.length) {
        updateDrops(state.drops, state.sceneItems, dt * 1000, soundEffect);
        if (!state.drops.length) config.onCheckpoint?.();
      }

      const stepInterval = state.walkDelayTicks * TICK_MS;
      if (state.target) state.stepAccumulatorMs += dt * 1000;
      while (state.target && state.stepAccumulatorMs + 1e-7 >= stepInterval) {
        state.stepAccumulatorMs = Math.max(0, state.stepAccumulatorMs - stepInterval);
        const next = state.path[state.pathIndex++];
        if (!next || (!sequence && !isWalkable(next, scene, mask))) {
          stopWalking();
          break;
        }
        const facing = stepFacing(state.pos, next);
        const following = state.path[state.pathIndex];
        // Keep the pose through one different step between two matching steps.
        // LoK also keeps the vertical pose for the first diagonal after a long vertical run.
        let pose = state.stepIndex > 0 && following && stepFacing(next, following) === state.facing ? state.facing : facing;
        if (state.verticalSteps > 2 && (state.facing === 0 && (pose === 1 || pose === 7) ||
            state.facing === 4 && (pose === 3 || pose === 5))) pose = state.facing;
        state.verticalSteps = facing === 0 || facing === 4 ? (facing === state.facing ? state.verticalSteps + 1 : 1) : 0;
        state.facing = facing;
        state.dir = facingDirection(pose);
        state.pos = next;
        state.frame = Math.floor(state.stepIndex++ / state.animStepInterval) % getSequence(state.dir).length;
        state.moving = true;
        if (state.pathIndex >= state.path.length) stopWalking();
      }
      if (!state.moving && pendingPortal) {
        const portal = pendingPortal; pendingPortal = null;
        if (Math.abs(state.pos.x - portal.point.x) <= 4 && Math.abs(state.pos.y - portal.point.y) <= 2 && !talkToTree()) config.onExit?.(portal);
      }
      sequence?.update(dt * 1000);
      if (sequence?.done) {
        sequence = null;
        config.onSubtitleChange?.([]);
        config.onSequenceChange?.(false);
        config.onContinueChange?.(false);
        const done = sequenceDone; sequenceDone = null; done?.();
        if (!dead) config.onCheckpoint?.();
      }
    }

    function stopWalking() {
      state.target = null;
      state.path = [];
      state.pathIndex = 0;
      state.moving = false;
      state.frame = 0;
      state.stepIndex = 0;
      state.verticalSteps = 0;
      state.stepAccumulatorMs = 0;
    }

    function restoreForeground(pos: Vec2, x: number, y: number, w: number, h: number) {
      if (backgroundName !== 'room' || !mask) return;
      const layer = resolveActorLayer(pos, drawLayerTable, mask);
      let fg = foregroundFrames.get(layer);
      if (!fg) {
        fg = buildForegroundFrame(bg, mask, layer, packedBackground ? {
          pixels: packedBackground.clip.frame(0), palette: roomPalette!
        } : undefined);
        // Restore the decorated background only over this character's rectangle.
        const foregroundContext = fg.getContext('2d')!;
        foregroundContext.globalCompositeOperation = 'source-atop';
        if (spriteDefMap) {
          drawSceneAnimShapes(foregroundContext, sceneShapesImage, spriteDefMap, filteredSceneAnimShapes);
          drawSceneOverlays(foregroundContext, sceneShapesImage, spriteDefMap, state.overlays);
        }
        for (const layer of permanentLayers.values()) foregroundContext.drawImage(layer.image, layer.x, layer.y);
        if (spriteDefMap) drawSceneAnimShapes(foregroundContext, sceneShapesImage, spriteDefMap, questShapes);
        for (const [name, layer] of scriptLayers) if (behindActors(name)) foregroundContext.drawImage(layer.image, layer.x, layer.y);
        foregroundContext.globalCompositeOperation = 'source-over';
        foregroundFrames.set(layer, fg);
      }
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.drawImage(fg, 0, 0); ctx.restore();
    }

    function drawHeldItem(target: CanvasRenderingContext2D, pointer: Vec2, size: number) {
      const item = state.itemInHand && inventoryItems.get(state.itemInHand);
      if (!item) return;
      const tile = getTileRect(item.tileIndex);
      target.drawImage(itemsSheet, tile.x, tile.y, tile.w, tile.h,
        Math.round(pointer.x - size / 2), Math.round(pointer.y - size / 2), size, size);
    }

    function render() {
      ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const outside = scriptRenderers.get(backgroundName);
      const background = outside ? outside.renderer.render(outside.clip.frame(0)) : packedBackground ? packedBackground.render(0) : bg;
      ctx.drawImage(background, 0, 0);
      if (modern && backdrop && (backdropDirty || backdropScene !== backgroundName)) {
        const { x, y, w, h } = ROOM_ART;
        backdrop.drawImage(background, x, y, w, h, 0, 0, w, h);
        backdropDirty = false;
        backdropScene = backgroundName;
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(8, 8, 304, scene.uiMaskY - 8); ctx.clip();
      if (backgroundName === "room" && spriteDefMap && filteredSceneAnimShapes.length) {
        drawSceneAnimShapes(ctx, sceneShapesImage, spriteDefMap, filteredSceneAnimShapes);
      }
      if (backgroundName === "room" && spriteDefMap && state.overlays.length) {
        drawSceneOverlays(ctx, sceneShapesImage, spriteDefMap, state.overlays);
      }
      for (const layer of permanentLayers.values()) ctx.drawImage(layer.image,layer.x,layer.y);
      const drawAmbient = (front: boolean) => {
        if (backgroundName === 'room' && spriteDefMap) drawSceneAnims(ctx, sceneShapesImage, spriteDefMap,
          sceneAnimOrder.filter(({ drawY }) => (drawY > state.pos.y) === front).map(({ index }) => sceneAnims[index]));
      };
      drawAmbient(false);
      if (backgroundName === "room" && spriteDefMap) drawSceneAnimShapes(ctx, sceneShapesImage, spriteDefMap, questShapes);
      // FACE movies contain an opaque rectangle of the room, not just the mouth.
      // Composite them behind Brandon while he approaches the speaking tree.
      for (const [name, layer] of scriptLayers) if (behindActors(name)) ctx.drawImage(layer.image, layer.x, layer.y);

      const drawNpcs = (front: boolean) => { for (const npc of [...npcs.values()].map(n=>heldNpcPoses.get(n.character)??n).sort((a,b)=>a.y-b.y)) { if ((npc.y > state.pos.y) !== front || npc.shape === 88 || !npc.visible || (npc.character===2 ? ['needsaw1','advice'] : ['tag','tag-0']).some(name=>scriptLayers.has(name))) continue;
        const scale=actorScaleAt(npc.y,scene.actorScale);
        const drawNpc=(shape:number,x:number,y:number,flip:boolean)=>{
          const animation=scriptRenderers.get(`npc-${shape}`),def=config.npcFrames?.[shape];
          if(!animation||!def)return;
          const image=animation.renderer.render(animation.clip.frame(0));
          const w=Math.max(1,Math.trunc(image.width*scale)),h=Math.max(1,Math.trunc(image.height*scale));
          ctx.save();ctx.translate(Math.trunc(x),Math.trunc(y));if(flip){ctx.translate(w,0);ctx.scale(-1,1);}ctx.drawImage(image,0,0,w,h);ctx.restore();
        };
        const talking=speechRemaining>0&&speaker===npc.character,shape=talking?(npc.character===1?50:86):npc.shape,def=config.npcFrames?.[shape];
        if(def){const x=npc.x+Math.trunc(def.xOffset*scale),y=npc.y+Math.trunc(def.yOffset*scale),flip=npc.facing>=1&&npc.facing<=3;
          drawNpc(shape,x,y,flip);
          if(talking)drawNpc((npc.character===1?53:89)+brandonTalkHead(speechAge)-17,x+(npc.character===1?4:flip?0:8)*scale,y+(npc.character===1?8:1)*scale,flip);
          const image = scriptRenderers.get(`npc-${shape}`)?.clip.info;
          if (image) restoreForeground(npc, x, y, Math.max(1,Math.trunc(image.width*scale)), Math.max(1,Math.trunc(image.height*scale)));
        }
      }
      };
      drawNpcs(false);
      const actorLayerPre = mask ? resolveActorLayer(state.pos, drawLayerTable, mask) : 1;
      if (backgroundName === "room") drawSceneItems(ctx, itemsSheet, inventoryItems, state.sceneItems, mask, actorLayerPre, "behind");
      if (state.drops.length) {
        drawDropAnims(ctx, itemsSheet, inventoryItems, state.drops);
      }

      const walkFrames = getSequence(state.dir);
      const talkingFrame = speechRemaining > 0 && speaker === 0 ? frames.findIndex(frame => frame.shapeIndex === 16) : -1;
      const frameIndex = state.moving ? walkFrames[state.frame] : talkingFrame >= 0 ? talkingFrame : actorShape !== null ? frames.findIndex(frame => frame.shapeIndex === actorShape) : getIdleFrame(state.dir);
      // A hidden script pose (shape 88) has no sprite, but the rest of the frame still draws.
      const frame = frames[frameIndex] ?? frames[0];
      const scale = actorScaleAt(state.pos.y, scene.actorScale);
      const drawX = state.pos.x + Math.trunc(frame.xOffset * scale);
      const drawY = state.pos.y + Math.trunc(frame.yOffset * scale);
      const drawW = Math.max(1, Math.trunc(frame.w * scale)), drawH = Math.max(1, Math.trunc(frame.h * scale));
      ctx.imageSmoothingEnabled = false;

      if (actorVisible && talkingFrame >= 0) {
        const head = frames.find(frame => frame.shapeIndex === brandonTalkHead(speechAge));
        if (head) {
          const headX = drawX + Math.trunc((state.dir === "right" ? 2 : 6) * scale);
          const headW = Math.max(1, Math.trunc(head.w * scale)), headH = Math.max(1, Math.trunc(head.h * scale));
          if (state.dir === "right") {
            ctx.save(); ctx.translate(headX + headW, 0); ctx.scale(-1, 1);
            ctx.drawImage(br, head.x, head.y, head.w, head.h, 0, drawY, headW, headH); ctx.restore();
          } else ctx.drawImage(br, head.x, head.y, head.w, head.h, headX, drawY, headW, headH);
        }
      }

      if (actorVisible && state.dir === "right") {
        ctx.save();
        ctx.translate(drawX + drawW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(br, frame.x, frame.y, frame.w, frame.h, 0, drawY, drawW, drawH);
        ctx.restore();
      } else if (actorVisible) {
        ctx.drawImage(br, frame.x, frame.y, frame.w, frame.h, drawX, drawY, drawW, drawH);
      }

      const actorLayer = backgroundName === 'room' && mask ? resolveActorLayer(state.pos, drawLayerTable, mask) : 1;
      if (actorVisible) restoreForeground(state.pos, drawX, drawY, drawW, drawH);
      drawAmbient(true);
      drawNpcs(true);
      if (backgroundName === "room") drawSceneItems(ctx, itemsSheet, inventoryItems, state.sceneItems, mask, actorLayer, "front");
      for (const [name, layer] of scriptLayers) if (!behindActors(name)) ctx.drawImage(layer.image, layer.x, layer.y);

      if (scene.opening && backgroundName === "room" && packedBackground && atmosphere && !reducedMotion?.matches) drawKallakAtmosphere(ctx, clockMs);
      ctx.restore();

      const amulet = scriptLayers.get('amulet');
      const yellow = scriptRenderers.get('yellow-jewel'), yellowAnim = scriptLayers.get('yellow-jewel');
      const showRadial = modern && (inventoryOpen || !!sequence && (amuletMovieActive || !!yellowAnim));
      const radialPointer = inventoryOpen && state.pointer ? toRadialPoint(state.pointer) : null;
      const heldOverRadial = radialCanvas && radialPointer &&
        (radialPointer.x - radial.x) ** 2 + (radialPointer.y - radial.y) ** 2 <= radial.radius ** 2;
      if (radialCanvas) radialCanvas.hidden = !showRadial;
      if (modern) {
        if (showRadial) {
          const uiContext = radialCanvas?.getContext('2d') ?? ctx;
          uiContext.save();
          uiContext.imageSmoothingEnabled = false;
          if (radialCanvas) {
            uiContext.clearRect(0, 0, radialCanvas.width, radialCanvas.height);
            uiContext.translate(radial.radius - radial.x, radial.radius - radial.y);
          }
          const age = reducedMotion?.matches ? Infinity : clockMs - radialOpenedAt;
          drawRadialInventory(uiContext, radial, radialPointer, t('Menu'), !hasAmulet && !amulet, age, (slot, x, y) => {
            const id = state.inventorySlots[slot];
            const item = id && inventoryItems.get(id);
            if (!item) return;
            const tile = getTileRect(item.tileIndex);
            uiContext.drawImage(itemsSheet, tile.x, tile.y, tile.w, tile.h, x, y, RADIAL_SLOT_SIZE - 2, RADIAL_SLOT_SIZE - 2);
          });
          const movie = scriptRenderers.get('amulet-radial');
          if (movie && (hasAmulet || amulet)) {
            const index = amulet?.index ?? movie.clip.info.frames.length - 1;
            uiContext.drawImage(movie.renderer.render(movie.clip.frame(index)), radial.amulet.x, radial.amulet.y, radial.amulet.w, radial.amulet.h);
          }
          if (yellowAnim || hasYellowJewel && yellow) {
            const jewel = yellowAnim?.image ?? yellow!.renderer.render(yellow!.clip.frame(10));
            uiContext.drawImage(jewel, radial.jewel.x, radial.jewel.y, radial.jewel.w, radial.jewel.h);
          }
          if (heldOverRadial && radialPointer) drawHeldItem(uiContext, radialPointer, RADIAL_SLOT_SIZE - 2);
          uiContext.restore();
          const hovered = radialPointer ? findInventorySlot(radialPointer, radial.slots, RADIAL_SLOT_SIZE) : -1;
          const id = state.inventorySlots[hovered];
          if (id && age >= hovered * 17) {
            const halfHeight = radial.radius * radialFootprint.y;
            drawInventoryTooltip(ctx, t(getItemStatusName(id)), {
              x: radial.x, top: radial.y - halfHeight, bottom: radial.y + halfHeight
            }, ROOM_ART);
          }
        } else if (state.statusMessage) {
          drawStatusLine(ctx, translateGameText(state.statusMessage), scene.uiMaskY - 13, ROOM_ART.x + ROOM_ART.w, ROOM_ART.x + 4);
        }
      } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, scene.uiMaskY, LOGICAL_WIDTH, LOGICAL_HEIGHT - scene.uiMaskY);
        if (state.statusMessage) drawStatusLine(ctx, translateGameText(state.statusMessage), scene.uiMaskY + 8, LOGICAL_WIDTH);
        if (uiOverlay) {
          ctx.drawImage(uiOverlay, 0, 0);
          if (locale.value === 'ru' && optionsRu) ctx.drawImage(optionsRu, HUD_OPTIONS_RECT.x, HUD_OPTIONS_RECT.y);
        }
        const rest = scriptRenderers.get('amulet-rest');
        if (hasAmulet && rest) ctx.drawImage(rest.renderer.render(rest.clip.frame(0)), 224, 152);
        if (amulet) ctx.drawImage(amulet.image, amulet.x, amulet.y);
        if (yellowAnim) ctx.drawImage(yellowAnim.image, yellowAnim.x, yellowAnim.y);
        else if (hasYellowJewel && yellow) ctx.drawImage(yellow.renderer.render(yellow.clip.frame(10)), YELLOW_JEWEL_POS.x, YELLOW_JEWEL_POS.y);
        drawInventory(ctx, itemsSheet, inventoryItems, state.inventorySlots);
        const hovered = !sequence && state.pointer ? findInventorySlot(state.pointer) : -1;
        const id = state.inventorySlots[hovered];
        if (id) {
          const slot = getInventorySlotPositions()[hovered];
          drawInventoryTooltip(ctx, t(getItemStatusName(id)), {
            x: slot.x + INVENTORY_ICON_SIZE / 2, top: slot.y, bottom: slot.y + INVENTORY_ICON_SIZE
          }, { x: 0, y: 0, w: LOGICAL_WIDTH, h: LOGICAL_HEIGHT });
        }
      }
      if (!heldOverRadial && state.itemInHand && state.pointer && !exitCursor(availablePortals(), state.pointer))
        drawHeldItem(ctx, state.pointer, INVENTORY_ICON_SIZE);

      if (debug.showMask && maskCanvas) {
        ctx.save();
        ctx.globalAlpha = debug.maskOpacity;
        ctx.drawImage(maskCanvas, 0, 0);
        ctx.restore();
      }

      if (debug.showLayerInfo && state.pointer) {
        drawLayerDebug(ctx, state.pointer, mask, actorLayer);
      }

      if (scene.debugWalkMask && scene.walkPolygon) {
        ctx.strokeStyle = "rgba(120, 200, 120, 0.9)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        scene.walkPolygon.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.stroke();
      }

      if (clockMs < shakeUntil && !reduceMotion?.matches) {
        ctx.drawImage(canvas, 0, 4, LOGICAL_WIDTH, canvas.height - 4, 0, 0, LOGICAL_WIDTH, canvas.height - 4);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, canvas.height - 4, LOGICAL_WIDTH, 4);
      }
    }

    function loop(now: number) {
      if (!running || paused) return;
      // A hidden tab must not consume unseen cutscenes on its next animation frame.
      const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      clockMs += dt * 1000;
      update(dt, clockMs);
      render();
      if (transition?.active) transition.draw(ctx);
      if (dead && !sequence) { config.onDeath?.(); return; }
      if (running && !paused) animationFrame = requestAnimationFrame(loop);
    }

    let animationFrame = 0;

    function setTarget(point: Vec2) {
      if (paused || !running || transition?.active || dead || sequence || inventoryOpen || point.y >= scene.uiMaskY || state.drops.length) return;
      pendingPortal = null;
      actorShape = null;
      const path = findClickPath(state.pos, point, p => isWalkable(p, scene, mask));
      if (!path.length) { stopWalking(); return; }
      // Retargeting a walk must not grant another immediate first step.
      if (!state.moving) state.stepAccumulatorMs = state.walkDelayTicks * TICK_MS;
      state.path = path;
      state.pathIndex = 0;
      state.target = path[path.length - 1];
      state.moving = true;
    }

    function stop() {
      running = false;
      cancelAnimationFrame(animationFrame);
      sequence?.stop();
      config.onSequenceChange?.(false);
      config.onContinueChange?.(false);
      config.onNoteChange?.(false);
      for (const value of scriptRenderers.values()) value.renderer.dispose();
      packedBackground?.dispose();
    }

    function setDebug(options: { showMask?: boolean; maskOpacity?: number; showLayerInfo?: boolean }) {
      if (typeof options.showMask === "boolean") debug.showMask = options.showMask;
      if (typeof options.maskOpacity === "number") debug.maskOpacity = options.maskOpacity;
      if (typeof options.showLayerInfo === "boolean") debug.showLayerInfo = options.showLayerInfo;
    }

    function setWalkSpeed(mode: "slowest" | "slow" | "fast" | "fastest") {
      const table: Record<string, number> = {
        slowest: 11,
        slow: 9,
        fast: 6,
        fastest: 3
      };
      state.walkDelayTicks = table[mode] ?? 6;
      state.animStepInterval = DEFAULT_ANIM_STEP_INTERVAL;
    }

    function setAnimStepInterval(value: number) {
      const clamped = Math.max(1, Math.min(8, Math.round(value)));
      state.animStepInterval = clamped;
    }

    function setPointer(point: Vec2 | null) {
      state.pointer = point;
    }

    function availablePortals() {
      return running && !paused && !sequence && !dead && !inventoryOpen && backgroundName === "room" ? modern ? modernPortals : classicPortals : [];
    }

    function setInventoryOpen(value: boolean) {
      if (value === inventoryOpen || value && (!modern || paused || !running || dead || sequence || transition?.active || state.drops.length)) return false;
      inventoryOpen = value;
      if (value) {
        openRadialAt(state.pointer);
        stopWalking(); pendingPortal = null;
      }
      render();
      return true;
    }

    function selectSlot(slot: number) {
      stopWalking();
      if (!state.inventorySlots[slot] && !state.itemInHand) return;
      exchangeInventorySlot(slot);
      if (state.itemInHand) setInventoryOpen(false);
      config.onCheckpoint?.();
    }

    function handleClick(point: Vec2) {
      if (paused || !running) return true;
      if (transition?.active) return true;
      if (sequence?.awaiting) {
        if (state.statusMessageUntil === Infinity) state.statusMessage = null;
        sequence.confirm(point); config.onContinueChange?.(false); return true;
      }
      if (sequence) { sequence.skipLine(); return true; }
      if (dead) return true;
      if (state.drops.length) return true;
      const radialPoint = inventoryOpen ? toRadialPoint(point) : point;
      if (inventoryOpen && inside(radialPoint, radial.options)) {
        setInventoryOpen(false); config.onOptions?.(); return true;
      }
      if ((!modern || inventoryOpen) && hasAmulet && config.onAmuletInteract && inside(radialPoint, modern ? radial.jewelHit : YELLOW_JEWEL_HITBOX)) {
        setInventoryOpen(false);
        stopWalking();
        playScript(config.onAmuletInteract(getSnapshot()));
        return true;
      }
      if (inventoryOpen) {
        const slot = findInventorySlot(radialPoint, radial.slots, RADIAL_SLOT_SIZE);
        if (slot >= 0) selectSlot(slot);
        else if ((radialPoint.x - radial.x) ** 2 + (radialPoint.y - radial.y) ** 2 > radial.radius ** 2) setInventoryOpen(false);
        return true;
      }
      const portal = portalAtPoint(availablePortals(), point);
      // Every exit hit area must run the original first conversation, including
      // the corners/door rectangle and a click while carrying an item.
      if ((portal || (!state.itemInHand && point.x >= 104 && point.x < 192 && point.y >= 32 && point.y < 68) ||
          (point.x >= 144 && point.x <= 176 && point.y >= 128 && point.y < scene.uiMaskY)) && talkToTree()) return true;
      if (portal) {
        setTarget(portal.point);
        if (state.target || (Math.abs(state.pos.x - portal.point.x) <= 4 && Math.abs(state.pos.y - portal.point.y) <= 2)) pendingPortal = portal;
        return true;
      }
      pendingPortal = null;
      if (point.y < scene.uiMaskY && findSceneItemAt(point,state.sceneItems) === -1) {
        const actions=config.onInteract?.(point,getSnapshot());
        if(actions){playScript(actions);return true;}
      }
      // A blocked edge can still be a scripted hotspot, as on the ruined bridge.
      if (exitCursor(availablePortals(), point) === 'blocked') { stopWalking(); return true; }
      const sceneItemIndex = point.y < scene.uiMaskY ? findSceneItemAt(point, state.sceneItems) : -1;
      if (sceneItemIndex === -1 && point.y < scene.uiMaskY && isPointOnBrandon(point)) {
        const actions = config.onActorInteract?.(getSnapshot());
        if (actions) { playScript(actions); return true; }
      }
      if (point.y < scene.uiMaskY) {
        const overlay = findOverlayAt(point, state.overlays, spriteDefMap);
        if (overlay && !state.itemInHand && sceneItemIndex === -1) {
          stopWalking();
          pickOverlayItem(overlay);
          config.onCheckpoint?.();
          return true;
        }
      }
      const slot = modern ? -1 : findInventorySlot(point);
      if (slot !== -1) {
        selectSlot(slot);
        return true;
      }
      if (point.y < scene.uiMaskY) {
        const itemIndex = sceneItemIndex;
        if (itemIndex !== -1) {
          stopWalking();
          const item = state.sceneItems[itemIndex];
          if (state.itemInHand) {
            const heldItem = state.itemInHand;
            state.itemInHand = item.id;
            item.id = heldItem;
          } else {
            state.itemInHand = item.id;
            state.sceneItems.splice(itemIndex, 1);
          }
          setStatusMessage(`Took ${getItemStatusName(state.itemInHand)}`);
          soundEffect(53);
          config.onCheckpoint?.();
          return true;
        }
      }
      if (state.itemInHand) {
        stopWalking();
        if(noDropRegions.some(r=>point.x>=r.x&&point.x<r.x+r.w&&point.y>=r.y&&point.y<r.y+r.h)){soundEffect(54);return true;}
        const droppedItem = state.itemInHand;
        if (dropItemAt(point, state.itemInHand, state.drops, state.sceneItems, scene, mask)) {
          setStatusMessage(`Placed ${getItemStatusName(droppedItem)}`);
          state.itemInHand = null;
        } else soundEffect(54);
        // A failed drop keeps the item in hand and must not trigger walking/pickup.
        return true;
      }
      if (point.y >= scene.uiMaskY) { stopWalking(); return true; }
      return false;
    }

    function talkToTree() {
      if (!openingScript || treeSpoken || backgroundName !== "room") return false;
      playScript(openingScript.tree, () => {
        treeSpoken = true;
        config.onScriptAction?.({ op: 'flag', flag: 53, value: true });
      });
      return true;
    }

    function exchangeInventorySlot(slot: number) {
      const slotItem = state.inventorySlots[slot];
      if (slotItem || state.itemInHand) soundEffect(slotItem ? 53 : 0x32);
      if (slotItem && !state.itemInHand) {
        state.itemInHand = slotItem;
        state.inventorySlots[slot] = null;
        return;
      }
      if (!slotItem && state.itemInHand) {
        state.inventorySlots[slot] = state.itemInHand;
        state.itemInHand = null;
        return;
      }
      if (slotItem && state.itemInHand) {
        state.inventorySlots[slot] = state.itemInHand;
        state.itemInHand = slotItem;
      }
    }

    function pickOverlayItem(overlay: SceneOverlayState) {
      if (!overlay.active) return;
      foregroundFrames.clear();
      state.itemInHand = overlay.id;
      soundEffect(53);
      setStatusMessage(`Took ${getItemStatusName(overlay.id)}`);
      if (overlay.replaceShape !== undefined) {
        overlay.shape = overlay.replaceShape;
        overlay.x = overlay.replaceX ?? overlay.x;
        overlay.y = overlay.replaceY ?? overlay.y;
        overlay.pickable = false;
      } else {
        overlay.active = false;
        overlay.pickable = false;
      }
    }

    function isPointOnBrandon(point: Vec2) {
      const scale = actorScaleAt(state.pos.y, scene.actorScale);
      return point.x >= state.pos.x - 12 * scale && point.x <= state.pos.x + 12 * scale && point.y >= state.pos.y - 48 * scale && point.y <= state.pos.y;
    }

    function setStatusMessage(text: string) {
      state.statusMessage = text;
      state.statusMessageUntil = clockMs + 2400;
    }

    function face(facing: number) {
      state.facing = facing;
      state.dir = facingDirection(facing);
    }

    function soundEffect(track: number) { if (!skippingOpening) config.onScriptAction?.({ op: 'sfx', track }); }
    function applyScript(action: RoomAction) {
      const openingBank = scene.opening && (backgroundName === 'trunk' || backgroundName === 'gem') ? backgroundName.toUpperCase() : undefined;
      if (skippingOpening && ['sfx', 'say', 'message'].includes(action.op)) return;
      config.onScriptAction?.(action.op === 'say' && !action.voiceBank && openingBank ? { ...action, voiceBank: openingBank } : action);
      switch (action.op) {
        case 'choice':state.statusMessage='Click where you want to go.';state.statusMessageUntil=Infinity;break;
        case 'death':dead=true;actorVisible=false;break;
        case 'shake': shakeUntil = clockMs + action.ms; break;
        case 'exit':config.onExit?.({id:'script',target:action.target,side:'north',entry:action.entry,rect:{x:0,y:0,w:0,h:0},point:state.pos});break;
        case 'palette':if(roomPalette){const to=roomPalette.slice();to.splice(action.start*3,action.colors.length,...action.colors);paletteFade={from:roomPalette.slice(),to,ms:action.ms,age:0,step:-1};updatePalette(0);}break;
        case 'flag':
          if (action.flag === 45) {
            hasAmulet = action.value;
            amuletMovieActive = false;
            scriptLayers.delete('amulet');
          }
          if (action.flag === YELLOW_JEWEL_FLAG) hasYellowJewel = action.value;
          break;
        case 'ambientWait':if(sceneAnims[action.index]?.play)ambientWait=action.index;break;
        case 'confirm':config.onContinueChange?.(true);break;
        case 'walkDelay':state.walkDelayTicks=Math.max(1,action.ticks);break;
        case 'npc':
          // Deactivating an original animator does not erase its already drawn pose.
          // Keep it until the replacement movie draws, avoiding a blank dialogue gap.
          if(!action.visible && action.room===-1 && [51,87].includes(action.shape)) {
            const previous=npcs.get(action.character);
            if(previous?.visible)heldNpcPoses.set(action.character,previous);
          } else heldNpcPoses.delete(action.character);
          npcs.set(action.character,action);
          // Refreshing Herman transfers drawing from the WSA to the walking actor.
          if(action.visible && action.shape!==88)for(const name of action.character===2?['needsaw1','advice']:['tag','tag-0'])scriptLayers.delete(name);
          break;
        case 'hand':state.itemInHand=action.item;break;
        case 'item':state.sceneItems.push({id:action.item,x:action.x,y:action.y});break;
        case 'shape':questShapes.push({ shape: action.shape, x: action.x, y: action.y, flags: action.flags });foregroundFrames.clear();break;
        case 'noDrop':noDropRegions.push({ x: action.x, y: action.y, w: action.w, h: action.h });break;
        case 'mask':
          maskChanges.push({ x: action.x, y: action.y, w: action.w, h: action.h, blocked: action.blocked });
          foregroundFrames.clear();
          if(mask)for(let y=Math.max(0,action.y);y<Math.min(mask.height,action.y+action.h);y++)for(let x=Math.max(0,action.x);x<Math.min(mask.width,action.x+action.w);x++){
            const i=y*mask.width+x;mask.pixels[i]=action.blocked?mask.pixels[i]|128:mask.pixels[i]&127;
          }break;
        case 'ambientRun':
          if(sceneAnims[action.index]){const anim=sceneAnims[action.index];anim.play=true;anim.visible=true;anim.ip=0;anim.nextRun=0;ambientWait=action.index;}break;
        case "scene":
          backgroundName = action.name;
          scriptLayers.clear(); stopWalking();
          state.pos = { x: action.x, y: action.y }; face(action.facing);
          actorVisible = action.visible; actorShape = null; break;
        case "actor":
          state.pos = { x: action.x, y: action.y }; face(action.facing);
          actorVisible = action.visible; actorShape = null; break;
        case "visible": actorVisible = action.visible; break;
        case "walk": {
          actorVisible = true; actorShape = null; speechRemaining = 0;
          for (const name of ["brantree", "touch"]) scriptLayers.delete(name);
          stopWalking();
          // Opening scripts deliberately walk through scene entrances. The
          // regular click pathfinder still uses the room's collision mask.
          state.path = findWalkPath(state.pos, action, p => sequence && backgroundName !== "room" ? true : isWalkable(p, scene, mask));
          state.target = state.path.at(-1) ?? null;
          state.moving = !!state.target;
          state.stepAccumulatorMs = state.walkDelayTicks * TICK_MS;
          break;
        }
        case "face": face(action.facing); actorShape = action.shape < 0 ? null : action.shape;if(action.shape===88)actorVisible=false;break;
        case "frame": {
          if (action.clip === 'note') config.onNoteChange?.(true);
          if (action.clip === 'amulet' && sequence && !amuletMovieActive) {
            openRadialAt(state.pointer ?? state.pos);
            amuletMovieActive = true;
          }
          if (action.clip === 'yellow-jewel' && sequence && !scriptLayers.has(action.clip))
            openRadialAt(state.pointer ?? state.pos);
          if(['needsaw1','advice'].includes(action.clip))heldNpcPoses.delete(2);
          if(['tag','tag-0'].includes(action.clip))heldNpcPoses.delete(1);
          if(action.clip==='tag')scriptLayers.delete('tag-0');
          if (action.clip === 'brandyw2') scriptLayers.delete('brandyw3');
          if (action.clip === 'song1' && scriptLayers.delete('songbird-rest')) foregroundFrames.clear();
          const animation = scriptRenderers.get(action.clip);
          if (!animation) throw new Error(`Missing script animation ${action.clip}`);
          const pixels=animation.clip.frame(action.index);
          if(action.permanent || behindActors(action.clip)) foregroundFrames.clear();
          if(action.permanent){scriptLayers.delete(action.clip);permanentLayers.set(action.clip,{image:buildIndexedCanvas(animation.clip.info,pixels),index:action.index,x:action.x,y:action.y});}
          else {scriptLayers.delete(action.clip);scriptLayers.set(action.clip, { image: animation.renderer.render(pixels), index:action.index, x: action.x, y: action.y });}
          if (actorMovies.has(action.clip)) actorVisible = false;
          break;
        }
        case "close":
          if (action.clip === 'note') config.onNoteChange?.(false);
          // Closing the movie releases its decoder, not its last screen pixels.
          // TAG-0 is the resting boy while Brandon walks to the next TAG movie.
          if(action.clip!=='tag-0')scriptLayers.delete(action.clip);
          if (behindActors(action.clip)) foregroundFrames.clear();
          if (actorMovies.has(action.clip)) actorVisible = true;
          break;
        case "say": {
          speaker=action.speaker??0;
          const palette = packedBackground?.clip.info.palette;
          const color = palette ? `rgb(${palette.slice(action.color * 3, action.color * 3 + 3).join(",")})` : "#f2f2f2";
          config.onSubtitleChange?.(action.text.trim()?[{ startMs: 0, endMs: action.ms, text: action.text, x: action.x, y: action.y,
            type: "talk", align: "center", maxWidth: 220, color }]:[]);
          speechRemaining = action.blocking ? action.ms : 0;
          speechAge = 0;
          break;
        }
        case "clearText": config.onSubtitleChange?.([]); speechRemaining = 0; break;
        case "ambient": if (sceneAnims[action.index]) {
          const anim=sceneAnims[action.index];
          if(action.internal)anim.visible=action.enabled;
          else anim.play=action.enabled;
        } break;
        case "message": setStatusMessage(action.text); break;
      }
    }

    function playScript(actions: RoomAction[], done?: () => void) {
      if (actions.some(action => action.op === 'exit') && talkToTree()) return;
      stopWalking();
      inventoryOpen = false;
      amuletMovieActive = false;
      pendingPortal = null;
      sequenceDone = done ?? null;
      config.onSequenceChange?.(true);
      sequence = new RoomScript(actions, { apply: applyScript, walking: () => state.moving || ambientWait !== null,
        movementTempo: () => state.walkDelayTicks / 6,
        frames: name => scriptRenderers.get(name)?.clip.info.frames.length ?? 0 });
      if (!paused) sequence.update(0);
    }

    function skipOpening() {
      if (paused || !sequence || sequence !== openingSequence) return false;
      applyScript({ op: 'clearText', stopVoice: true });
      skippingOpening = true;
      try {
        // Advance the actual movement and script clocks so the room keeps its
        // final actor pose and music cue. The opening has no player choices.
        for (let tick = 0; sequence === openingSequence && !sequence?.awaiting && tick < 3600; tick++) {
          clockMs += TICK_MS;
          update(TICK_MS / 1000, clockMs);
        }
      } finally { skippingOpening = false; }
      render();
      return true;
    }

    function resizeCanvas() {
      if (canvas.width !== LOGICAL_WIDTH) canvas.width = LOGICAL_WIDTH;
      const height = modern ? scene.uiMaskY : LOGICAL_HEIGHT;
      if (canvas.height !== height) canvas.height = height;
    }

    function setControlMode(mode: ControlMode) {
      modern = mode === 'modern';
      inventoryOpen = false;
      resizeCanvas();
      render();
    }

    if (config.entry || config.resume?.facing !== undefined) face(config.entry?.facing ?? config.resume!.facing!);
    const restored = config.resume?.runtime;
    if (restored) {
      clockMs = restored.clockMs; sceneTicks = restored.sceneTicks; sceneAccumulatorMs = restored.sceneAccumulatorMs;
      if (restored.sceneAnims.length !== sceneAnims.length) throw new Error("This save does not match the room's animations.");
      restored.sceneAnims.forEach((saved, index) => {
        if (saved.ip > sceneAnims[index].script.length) throw new Error("The saved room animation is invalid.");
        Object.assign(sceneAnims[index], saved, { renderX: saved.renderX ?? saved.x, renderY: saved.renderY ?? saved.y });
      });
      for (const change of restored.masks) applyScript({ op: 'mask', ...change });
      questShapes.push(...restored.shapes); noDropRegions.push(...restored.noDrop);
      if (restored.palette) applyScript({ op: 'palette', start: 0, colors: restored.palette, ms: 0 });
      for (const layer of restored.layers) applyScript({ op: 'frame', ...layer, ms: 0 });
      // Reconstructing still frames must not replay actor/NPC script side effects.
      for (const npc of restored.npcs) npcs.set(npc.character, { op: 'npc', ...npc });
      for (const npc of restored.heldNpcPoses) heldNpcPoses.set(npc.character, { op: 'npc', ...npc });
      actorVisible = restored.actorVisible; actorShape = restored.actorShape; hasAmulet = restored.hasAmulet;
    } else {
      for(const action of config.setupActions??[])applyScript(action);
      for(const anim of sceneAnims)anim.visible=anim.play;
      if (openingScript && config.playOpening !== false) { playScript(openingScript.opening); openingSequence = sequence; }
      else if (config.entryActions?.length) playScript(config.entryActions);
    }

    config.signal?.throwIfAborted();
    // Resizing clears the shared canvas; keep the previous room during loading.
    resizeCanvas();
    // The caller can atomically replace an old paused game after this promise resolves.
    render();
    if (transition?.active) transition.draw(ctx);
    if (!paused) animationFrame = requestAnimationFrame(loop);

    function getSnapshot(): RoomSnapshot { return structuredClone({ pos: state.pos, walkDelayTicks: state.walkDelayTicks, facing: state.facing, inventorySlots: state.inventorySlots, itemInHand: state.itemInHand,
      sceneItems: state.sceneItems, overlays: state.overlays, treeSpoken,
      runtime: { clockMs, sceneTicks, sceneAccumulatorMs, actorVisible, actorShape, hasAmulet,
        sceneAnims: sceneAnims.map(({ script, ...anim }) => anim),
        npcs: [...npcs.values()].map(({ op, ...npc }) => npc), heldNpcPoses: [...heldNpcPoses.values()].map(({ op, ...npc }) => npc),
        masks: maskChanges, shapes: questShapes, noDrop: noDropRegions,
        layers: [...scriptLayers].map(([clip, layer]) => ({ clip, index: layer.index, x: layer.x, y: layer.y, permanent: false }))
          .concat([...permanentLayers].map(([clip, layer]) => ({ clip, index: layer.index, x: layer.x, y: layer.y, permanent: true }))),
        ...(roomPalette ? { palette: roomPalette } : {}) }
    }); }
    function getSaveSnapshot() {
      return running && !dead && !sequence && !transition?.active && !state.drops.length && !paletteFade && ambientWait === null && backgroundName === 'room' && actorVisible ? getSnapshot() : null;
    }
    function setPaused(value: boolean) {
      if (!running || paused === value || dead && !value) return;
      paused = value;
      cancelAnimationFrame(animationFrame);
      // Wall time while a menu is open never enters any game, script or scene clock.
      lastTime = performance.now();
      if (!paused) animationFrame = requestAnimationFrame(loop);
    }
    function getSaveState(): WorldSave | null { return null; }
    return { setTarget, stop, setDebug, setPointer, setWalkSpeed, setAnimStepInterval, handleClick,
      setControlMode, setInventoryOpen, getInventoryOpen: () => inventoryOpen, skipOpening,
      setAtmosphere: (enabled: boolean) => { atmosphere = enabled; if (paused) render(); },
      runSequence: playScript,
      getSnapshot, getSaveSnapshot, getSaveState, setPaused, getPortals: availablePortals };
  } catch (error) {
    for (const value of scriptRenderers.values()) value.renderer.dispose();
    packedBackground?.dispose();
    throw error;
  }
}

export function mapPointerToCanvas(canvas: HTMLCanvasElement, clientX: number, clientY: number): Vec2 {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function initSceneItems(scene: GameConfig["scene"]): SceneItem[] {
  if (!scene.items || !scene.items.length) return [];
  return scene.items.map((item) => ({ id: item.id, x: item.x, y: item.y }));
}
