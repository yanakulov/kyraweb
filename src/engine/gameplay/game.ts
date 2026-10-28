import { DEFAULT_ANIM_STEP_INTERVAL, INVENTORY_ICON_SIZE, LOGICAL_HEIGHT, LOGICAL_WIDTH, TICK_MS } from "../core/constants";
import { loadImage, loadMask, loadNpcTextJson, loadSceneEmc, loadSceneMeta, loadSceneShapes, withBase } from "../core/assets";
import { dropItemAt, drawDropAnims, updateDrops } from "./drops";
import {
  buildInventoryItems,
  drawInventory,
  drawSceneItems,
  findInventorySlot,
  findSceneItemAt,
  getItemStatusName,
  getTileRect,
  initInventory
} from "./inventory";
import { buildMaskCanvas, buildForegroundFrame, isWalkable, resolveActorLayer } from "../scene/masks";
import { findWalkPath } from "./pathfinding";
import { getIdleFrame, getSequence, pickDirection } from "./movement";
import { filterSceneAnimShapes, findOverlayAt, initSceneOverlays, drawSceneOverlays } from "../scene/overlays";
import { buildSceneAnimStates, drawSceneAnims, updateSceneAnims } from "../scene/sceneAnims";
import { buildSceneShapesCanvas, buildSpriteDefMap, drawSceneAnimShapes } from "../scene/sceneShapes";
import { buildUiOverlay, drawLayerDebug, drawStatusLine } from "../core/ui";
import { loadPackedAnimation, createPackedAnimation } from "../resources/packedAnimation";
import { drawKallakAtmosphere } from "../rendering/kallakAtmosphere";
import { buildIndexedCanvas, IndexedRenderer } from "../rendering/indexedRenderer";
import { IndexedClip, loadScenePack } from "../resources/scenePack";
import { RoomScript, type OpeningScript, type RoomAction } from "./roomScript";
import { brandonTalkHead, actorScaleAt } from "../characters/brandonFrames";
import { startWorldGame } from "./world";
import { portalAtPoint } from "./navigation";
import type { DropAnim, GameConfig, InventoryItemId, SceneItem, SceneOverlayState, Vec2 } from "../core/types";

export type RoomGame = Awaited<ReturnType<typeof startRoom>>;
export async function startGame(canvas: HTMLCanvasElement, config: GameConfig): Promise<RoomGame> {
  return config.world ? startWorldGame(canvas, config) : startRoom(canvas, config);
}

export async function startRoom(canvas: HTMLCanvasElement, config: GameConfig) {
  config.signal?.throwIfAborted();
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context not available");
  const ctx = context;

  canvas.width = LOGICAL_WIDTH;
  canvas.height = LOGICAL_HEIGHT;

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
    const [bg, br, ui, mask, itemsSheet, npcText] = await Promise.all([
      packedBase ? Promise.resolve(packedBase) : loadImage(scene.bgSrc),
      loadImage(scene.brSrc),
      !packedHud && scene.uiOverlaySrc ? loadImage(scene.uiOverlaySrc) : Promise.resolve(null),
      packedMask ? Promise.resolve({ width: packedMask.info.width, height: packedMask.info.height, pixels: Array.from(packedMask.frame(0)) }) : scene.maskSrc ? loadMask(scene.maskSrc) : Promise.resolve(null),
      loadImage(withBase("assets/inventory/items.png")),
      loadNpcTextJson(withBase("assets/text/npc_text.json")).catch(() => null)
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
    const scriptLayers = new Map<string, { image: HTMLCanvasElement; x: number; y: number }>();
    const permanentLayers = new Map<string, { image: HTMLCanvasElement; x: number; y: number }>();
    const questShapes: {shape:number;x:number;y:number;flags:number}[] = [];
    const noDropRegions: {x:number;y:number;w:number;h:number}[] = [];
    const npcs = new Map<number,Extract<RoomAction,{op:'npc'}>>();
    let speaker = 0;
    let hasAmulet=config.amulet??false;
    let dead=false;
    const roomPalette=packedBackground?.clip.info.palette.slice();
    let paletteFade:{from:number[];to:number[];ms:number;age:number;step:number}|null=null;
    function updatePalette(ms:number){
      if(!paletteFade||!roomPalette||!packedBackground)return;
      const fade=paletteFade;fade.age+=ms;
      const max=Math.max(...fade.to.map((v,i)=>Math.abs(v-fade.from[i])));
      const step=fade.ms?Math.min(max,Math.floor(max*Math.min(1,fade.age/fade.ms)/4)*4):max;
      if(step===fade.step)return;fade.step=step;
      for(let i=0;i<roomPalette.length;i++)roomPalette[i]=fade.from[i]+Math.sign(fade.to[i]-fade.from[i])*Math.min(step,Math.abs(fade.to[i]-fade.from[i]));
      packedBackground.renderer.setPalette(roomPalette);
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
    if(config.amulet&&!scriptRenderers.has('amulet-rest')){
      const pack=await loadScenePack(withBase('assets/forest/amulet.kyr.gz'),config.signal),info=pack.clips['amulet-rest'];
      scriptRenderers.set('amulet-rest',{clip:new IndexedClip(pack,info),renderer:new IndexedRenderer(info,false)});
    }
    let backgroundName = "room";
    let actorVisible = true;
    let actorShape: number | null = null;
    let speechRemaining = 0;
    let speechAge = 0;
    let sequence: RoomScript | null = null;
    let treeSpoken = config.resume?.treeSpoken ?? false;
    let pendingPortal: NonNullable<GameConfig["portals"]>[number] | null = null;
    let sequenceDone: (() => void) | null = null;
    const debug = {
      showMask: false,
      maskOpacity: 0.35,
      showLayerInfo: false
    };

    const state = {
      pos: { ...(config.entry ?? config.resume?.pos ?? { x: 160, y: 120 }) } as Vec2,
      target: null as Vec2 | null,
      path: [] as Vec2[],
      pathIndex: 0,
      pointer: null as Vec2 | null,
      walkDelayTicks: 6,
      stepAccumulatorMs: 0,
      stepIndex: 0,
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
      npcText: npcText ?? null
    };

    let lastTime = performance.now();
    let running = true;
    let atmosphere = true;
    const reducedMotion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

    function update(dt: number, nowMs: number) {
      updatePalette(dt*1000);
      speechRemaining = Math.max(0, speechRemaining - dt * 1000);
      if (speechRemaining > 0) speechAge += dt * 1000;
      if (state.statusMessage && nowMs >= state.statusMessageUntil) {
        state.statusMessage = null;
      }
      if (sceneAnims.length) {
        updateSceneAnims(sceneAnims, nowMs,(op,value)=>{
          if(op===0xFFAD)state.pos.x=value;if(op===0xFFAE)state.pos.y=value;
          if(op===0xFFAF)actorShape=value;
        });
      }
      if (ambientWait !== null && !sceneAnims[ambientWait]?.play) ambientWait = null;
      if (state.drops.length) {
        updateDrops(state.drops, state.sceneItems, dt * 1000);
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
        const dir = pickDirection(next.x - state.pos.x, next.y - state.pos.y, state.dir);
        if (dir !== state.dir) {
          state.frame = 0;
          state.stepIndex = 0;
        }
        state.dir = dir;
        state.pos = next;
        if (state.stepIndex++ > 0 && state.stepIndex % state.animStepInterval === 0) {
          state.frame = (state.frame + 1) % getSequence(state.dir).length;
        }
        state.moving = true;
        if (state.pathIndex >= state.path.length) stopWalking();
      }
      if (!state.moving && pendingPortal) {
        const portal = pendingPortal; pendingPortal = null;
        if (Math.abs(state.pos.x - portal.point.x) <= 4 && Math.abs(state.pos.y - portal.point.y) <= 2) config.onExit?.(portal);
      }
      sequence?.update(dt * 1000);
      if (sequence?.done) {
        sequence = null;
        config.onSubtitleChange?.([]);
        config.onSequenceChange?.(false);
        config.onContinueChange?.(false);
        const done = sequenceDone; sequenceDone = null; done?.();
      }
    }

    function stopWalking() {
      state.target = null;
      state.path = [];
      state.pathIndex = 0;
      state.moving = false;
      state.frame = 0;
      state.stepIndex = 0;
      state.stepAccumulatorMs = 0;
    }

    function render() {
      ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      const outside = scriptRenderers.get(backgroundName);
      ctx.drawImage(outside ? outside.renderer.render(outside.clip.frame(0)) : packedBackground ? packedBackground.render(0) : bg, 0, 0);
      ctx.save();
      ctx.beginPath(); ctx.rect(8, 8, 304, scene.uiMaskY - 8); ctx.clip();
      if (backgroundName === "room" && spriteDefMap && filteredSceneAnimShapes.length) {
        drawSceneAnimShapes(ctx, sceneShapesImage, spriteDefMap, filteredSceneAnimShapes);
      }
      if (backgroundName === "room" && spriteDefMap && state.overlays.length) {
        drawSceneOverlays(ctx, sceneShapesImage, spriteDefMap, state.overlays);
      }
      for (const layer of permanentLayers.values()) ctx.drawImage(layer.image,layer.x,layer.y);
      if (backgroundName === "room" && spriteDefMap && sceneAnims.length) {
        drawSceneAnims(ctx, sceneShapesImage, spriteDefMap, sceneAnims);
      }
      if (backgroundName === "room" && spriteDefMap) drawSceneAnimShapes(ctx, sceneShapesImage, spriteDefMap, questShapes);
      // FACE movies contain an opaque rectangle of the room, not just the mouth.
      // Composite them behind Brandon while he approaches the speaking tree.
      for (const [name, layer] of scriptLayers) if (name === "face" || name === "face2") ctx.drawImage(layer.image, layer.x, layer.y);

      for (const npc of npcs.values()) { if (!npc.visible || npc.character===2&&(scriptLayers.has("advice")||scriptLayers.has("balance2"))) continue;
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
        }
      }
      const actorLayerPre = mask ? resolveActorLayer(state.pos, drawLayerTable, mask) : 1;
      if (backgroundName === "room") drawSceneItems(ctx, itemsSheet, inventoryItems, state.sceneItems, mask, actorLayerPre, "behind");
      if (state.drops.length) {
        drawDropAnims(ctx, itemsSheet, inventoryItems, state.drops);
      }

      const sequence = getSequence(state.dir);
      const talkingFrame = speechRemaining > 0 && speaker === 0 ? frames.findIndex(frame => frame.shapeIndex === 16) : -1;
      const frameIndex = state.moving ? sequence[state.frame] : talkingFrame >= 0 ? talkingFrame : actorShape !== null ? frames.findIndex(frame => frame.shapeIndex === actorShape) : getIdleFrame(state.dir);
      const frame = frames[Math.min(frames.length - 1, frameIndex)];
      if (!frame) {
        ctx.restore();
        return;
      }
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

      let actorLayer = 1;
      if (backgroundName === "room" && mask) {
        actorLayer = resolveActorLayer(state.pos, drawLayerTable, mask);
        let fg = foregroundFrames.get(actorLayer);
        if (!fg) {
          fg = buildForegroundFrame(bg, mask, actorLayer, packedBackground ? {
            pixels: packedBackground.clip.frame(0), palette: roomPalette!
          } : undefined);
          // Occlusion restores the current decorated background, not the bare CPS.
          // Otherwise a high-priority table erases the note and saw drawn on it.
          const foregroundContext = fg.getContext('2d')!;
          foregroundContext.globalCompositeOperation = 'source-atop';
          if (spriteDefMap) {
            drawSceneAnimShapes(foregroundContext, sceneShapesImage, spriteDefMap, filteredSceneAnimShapes);
            drawSceneOverlays(foregroundContext, sceneShapesImage, spriteDefMap, state.overlays);
          }
          for (const layer of permanentLayers.values()) foregroundContext.drawImage(layer.image, layer.x, layer.y);
          if (spriteDefMap) drawSceneAnimShapes(foregroundContext, sceneShapesImage, spriteDefMap, questShapes);
          for (const [name, layer] of scriptLayers) if (name === 'face' || name === 'face2') foregroundContext.drawImage(layer.image, layer.x, layer.y);
          foregroundContext.globalCompositeOperation = 'source-over';
          foregroundFrames.set(actorLayer, fg);
        }
        if (fg) ctx.drawImage(fg, 0, 0);
      }
      if (backgroundName === "room") drawSceneItems(ctx, itemsSheet, inventoryItems, state.sceneItems, mask, actorLayer, "front");
      for (const [name, layer] of scriptLayers) if (name !== "face" && name !== "face2") ctx.drawImage(layer.image, layer.x, layer.y);

      if (scene.opening && backgroundName === "room" && packedBackground && atmosphere && !reducedMotion?.matches) drawKallakAtmosphere(ctx, lastTime);
      ctx.restore();

      if (scene.uiMaskY < LOGICAL_HEIGHT) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, scene.uiMaskY, LOGICAL_WIDTH, LOGICAL_HEIGHT - scene.uiMaskY);
      }
      if (state.statusMessage) {
        const statusY = scene.uiMaskY + 8;
        drawStatusLine(ctx, state.statusMessage, statusY, LOGICAL_WIDTH);
      }
      if (uiOverlay) {
        ctx.drawImage(uiOverlay, 0, 0);
      }
      const rest=scriptRenderers.get('amulet-rest');
      if(hasAmulet&&rest)ctx.drawImage(rest.renderer.render(rest.clip.frame(0)),224,152);
      const amulet=scriptLayers.get('amulet');
      if(amulet)ctx.drawImage(amulet.image,amulet.x,amulet.y);
      drawInventory(ctx, itemsSheet, inventoryItems, state.inventorySlots);
      if (state.itemInHand && state.pointer) {
        const item = inventoryItems.get(state.itemInHand);
        if (item) {
          const rect = getTileRect(item.tileIndex);
          ctx.drawImage(
            itemsSheet,
            rect.x,
            rect.y,
            rect.w,
            rect.h,
            Math.round(state.pointer.x - INVENTORY_ICON_SIZE / 2),
            Math.round(state.pointer.y - INVENTORY_ICON_SIZE / 2),
            INVENTORY_ICON_SIZE,
            INVENTORY_ICON_SIZE
          );
        }
      }

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

      if (state.target) {
        ctx.fillStyle = "rgba(255, 220, 160, 0.8)";
        ctx.fillRect(state.target.x - 1, state.target.y - 1, 2, 2);
      }
    }

    function loop(now: number) {
      if (!running) return;
      // A hidden tab must not consume unseen cutscenes on its next animation frame.
      const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      update(dt, now);
      render();
      animationFrame = requestAnimationFrame(loop);
    }

    let animationFrame = requestAnimationFrame(loop);

    function setTarget(point: Vec2) {
      if (dead || sequence || point.y >= scene.uiMaskY || state.drops.length) return;
      pendingPortal = null;
      actorShape = null;
      const path = findWalkPath(state.pos, point, p => isWalkable(p, scene, mask));
      stopWalking();
      if (!path.length) return;
      state.path = path;
      state.target = path[path.length - 1];
      state.moving = true;
      // LoK takes its first step before waiting for timer 5.
      state.stepAccumulatorMs = state.walkDelayTicks * TICK_MS;
    }

    function stop() {
      running = false;
      if (canvas.style) canvas.style.cursor = "";
      cancelAnimationFrame(animationFrame);
      sequence?.stop();
      config.onSequenceChange?.(false);
      config.onContinueChange?.(false);
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
      const portal = !sequence && portalAtPoint(config.portals ?? [], point);
      if (canvas.style) canvas.style.cursor = portal ? "pointer" : "default";
    }

    function handleClick(point: Vec2) {
      if (sequence?.awaiting) { sequence.confirm(point); config.onContinueChange?.(false); return true; }
      if (sequence) { sequence.skipLine(); return true; }
      if (dead) return true;
      if (state.drops.length) return true;
      // The original first conversation intercepts the south exit. Also let a
      // direct click on the trunk initiate it, which works well with touch input.
      if (openingScript && !treeSpoken &&
          ((!state.itemInHand && point.x >= 104 && point.x < 192 && point.y >= 32 && point.y < 68) ||
           (point.x >= 144 && point.x <= 176 && point.y >= 128 && point.y < scene.uiMaskY))) {
        treeSpoken = true;
        playScript(openingScript.tree);
        return true;
      }
      const portal = portalAtPoint(config.portals ?? [], point);
      if (portal) {
        setTarget(portal.point);
        if (state.target || (Math.abs(state.pos.x - portal.point.x) <= 4 && Math.abs(state.pos.y - portal.point.y) <= 2)) pendingPortal = portal;
        return true;
      }
      if (point.y < scene.uiMaskY && findSceneItemAt(point,state.sceneItems) === -1) {
        const actions=config.onInteract?.(point,getSnapshot());
        if(actions){playScript(actions);return true;}
      }
      stopWalking();
      const sceneItemIndex = point.y < scene.uiMaskY ? findSceneItemAt(point, state.sceneItems) : -1;
      if (sceneItemIndex === -1 && !state.itemInHand && point.y < scene.uiMaskY && isPointOnBrandon(point)) {
        const line = getNpcTextLine(100, "Why do I have to do everything?");
        setStatusMessage(line);
        return true;
      }
      if (point.y < scene.uiMaskY) {
        const overlay = findOverlayAt(point, state.overlays, spriteDefMap);
        if (overlay && !state.itemInHand && sceneItemIndex === -1) {
          pickOverlayItem(overlay);
          return true;
        }
      }
      const slot = findInventorySlot(point);
      if (slot !== -1) {
        exchangeInventorySlot(slot);
        return true;
      }
      if (point.y < scene.uiMaskY) {
        const itemIndex = sceneItemIndex;
        if (itemIndex !== -1) {
          const item = state.sceneItems[itemIndex];
          if (state.itemInHand) {
            const heldItem = state.itemInHand;
            state.itemInHand = item.id;
            item.id = heldItem;
          } else {
            state.itemInHand = item.id;
            state.sceneItems.splice(itemIndex, 1);
          }
          setStatusMessage(`Взял ${getItemStatusName(state.itemInHand)}`);
          return true;
        }
      }
      if (state.itemInHand) {
        if(noDropRegions.some(r=>point.x>=r.x&&point.x<r.x+r.w&&point.y>=r.y&&point.y<r.y+r.h))return true;
        const droppedItem = state.itemInHand;
        if (dropItemAt(point, state.itemInHand, state.drops, state.sceneItems, scene, mask)) {
          setStatusMessage(`Положил ${getItemStatusName(droppedItem)}`);
          state.itemInHand = null;
        }
        // A failed drop keeps the item in hand and must not trigger walking/pickup.
        return true;
      }
      if (point.y >= scene.uiMaskY) return true;
      return false;
    }

    function exchangeInventorySlot(slot: number) {
      const slotItem = state.inventorySlots[slot];
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
      setStatusMessage(`Взял ${getItemStatusName(overlay.id)}`);
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

    function getNpcTextLine(id: number, fallback: string) {
      const value = state.npcText?.[id];
      if (value && value.length) return value;
      return fallback;
    }

    function isPointOnBrandon(point: Vec2) {
      const sequence = getSequence(state.dir);
      const frameIndex = state.moving ? sequence[state.frame] : getIdleFrame(state.dir);
      const frame = frames[Math.min(frames.length - 1, frameIndex)];
      if (!frame) return false;
      const scale = actorScaleAt(state.pos.y, scene.actorScale);
      const drawX = state.pos.x + Math.trunc(frame.xOffset * scale);
      const drawY = state.pos.y + Math.trunc(frame.yOffset * scale);
      return (
        point.x >= drawX &&
        point.x <= drawX + Math.trunc(frame.w * scale) &&
        point.y >= drawY &&
        point.y <= drawY + Math.trunc(frame.h * scale)
      );
    }

    function setStatusMessage(text: string) {
      state.statusMessage = text;
      state.statusMessageUntil = performance.now() + 2400;
    }

    function face(facing: number) {
      state.dir = facing >= 1 && facing <= 3 ? "right" : facing >= 5 ? "left" : facing === 0 ? "up" : "down";
    }

    function applyScript(action: RoomAction) {
      config.onScriptAction?.(action);
      switch (action.op) {
        case 'choice':setStatusMessage('Click where you want to go.');break;
        case 'death':dead=true;actorVisible=false;config.onDeath?.();break;
        case 'exit':config.onExit?.({id:'script',target:action.target,side:'north',entry:action.entry,rect:{x:0,y:0,w:0,h:0},point:state.pos});break;
        case 'palette':if(roomPalette){const to=roomPalette.slice();to.splice(action.start*3,action.colors.length,...action.colors);paletteFade={from:roomPalette.slice(),to,ms:action.ms,age:0,step:-1};updatePalette(0);}break;
        case 'flag':if(action.flag===45)hasAmulet=action.value;break;
        case 'ambientWait':if(sceneAnims[action.index]?.play)ambientWait=action.index;break;
        case 'confirm':config.onContinueChange?.(true);break;
        case 'npc':npcs.set(action.character,action);break;
        case 'hand':state.itemInHand=action.item;break;
        case 'item':state.sceneItems.push({id:action.item,x:action.x,y:action.y});break;
        case 'shape':questShapes.push(action);foregroundFrames.clear();break;
        case 'noDrop':noDropRegions.push(action);break;
        case 'mask':
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
          const animation = scriptRenderers.get(action.clip);
          if (!animation) throw new Error(`Missing script animation ${action.clip}`);
          const pixels=animation.clip.frame(action.index);
          if(action.permanent || action.clip === 'face' || action.clip === 'face2') foregroundFrames.clear();
          if(action.permanent)permanentLayers.set(action.clip,{image:buildIndexedCanvas(animation.clip.info,pixels),x:action.x,y:action.y});
          else {scriptLayers.delete(action.clip);scriptLayers.set(action.clip, { image: animation.renderer.render(pixels), x: action.x, y: action.y });}
          if (["brantree", "touch", "brynn1", "brynn2", "brynn3", "raindrop", "wow", "tag", "agile", "balance2"].includes(action.clip)) actorVisible = false;
          break;
        }
        case "close":
          scriptLayers.delete(action.clip);
          if(action.clip === 'face' || action.clip === 'face2') foregroundFrames.clear();
          if (["brantree", "touch", "brynn1", "brynn2", "brynn3", "raindrop", "wow", "tag", "agile", "balance2"].includes(action.clip)) actorVisible = true;
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
      stopWalking();
      pendingPortal = null;
      sequenceDone = done ?? null;
      config.onSequenceChange?.(true);
      sequence = new RoomScript(actions, { apply: applyScript, walking: () => state.moving || ambientWait !== null,
        frames: name => scriptRenderers.get(name)?.clip.info.frames.length ?? 0 });
      sequence.update(0);
    }

    if (config.entry) face(config.entry.facing);
    for(const action of config.setupActions??[])applyScript(action);
    for(const anim of sceneAnims)anim.visible=anim.play;
    if (openingScript && config.playOpening !== false) playScript(openingScript.opening);
    else if (config.entryActions?.length) playScript(config.entryActions);

    function getSnapshot() { return { pos: { ...state.pos }, facing:state.dir==="right"?3:state.dir==="left"?5:state.dir==="up"?0:4, inventorySlots: state.inventorySlots, itemInHand: state.itemInHand,
      sceneItems: state.sceneItems, overlays: state.overlays, treeSpoken }; }
    return { setTarget, stop, setDebug, setPointer, setWalkSpeed, setAnimStepInterval, handleClick,
      setAtmosphere: (enabled: boolean) => { atmosphere = enabled; },
      runSequence: playScript,
      getSnapshot, getPortals: () => !sequence && !dead && backgroundName === "room" ? config.portals ?? [] : [] };
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
