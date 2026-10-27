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
import { loadPackedAnimation } from "../resources/packedAnimation";
import { drawKallakAtmosphere } from "../rendering/kallakAtmosphere";
import { buildIndexedCanvas, IndexedRenderer } from "../rendering/indexedRenderer";
import { IndexedClip, loadScenePack } from "../resources/scenePack";
import { RoomScript, type OpeningScript, type RoomAction } from "./roomScript";
import { brandonTalkHead } from "../characters/brandonFrames";
import type { DropAnim, GameConfig, InventoryItemId, SceneItem, SceneOverlayState, Vec2 } from "../core/types";

export async function startGame(canvas: HTMLCanvasElement, config: GameConfig) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context not available");
  const ctx = context;

  canvas.width = LOGICAL_WIDTH;
  canvas.height = LOGICAL_HEIGHT;

  const scene = config.scene;

  const packedBackground = scene.indexedBackground
    ? await loadPackedAnimation(scene.indexedBackground.src, scene.indexedBackground.clip)
    : null;
  const scriptRenderers = new Map<string, { clip: IndexedClip; renderer: IndexedRenderer }>();
  // Keep an exact, unmodified source for foreground occlusion masks.
  try {
    const packedBase = packedBackground ? buildIndexedCanvas(packedBackground.clip.info, packedBackground.clip.frame(0)) : null;
    const hudInfo = packedBackground?.clip.pack.clips.hud;
    const packedHud = packedBackground && hudInfo ? new IndexedClip(packedBackground.clip.pack, hudInfo) : null;
    const [bg, br, ui, mask, itemsSheet, npcText] = await Promise.all([
      packedBase ? Promise.resolve(packedBase) : loadImage(scene.bgSrc),
      loadImage(scene.brSrc),
      !packedHud && scene.uiOverlaySrc ? loadImage(scene.uiOverlaySrc) : Promise.resolve(null),
      scene.maskSrc ? loadMask(scene.maskSrc) : Promise.resolve(null),
      loadImage(withBase("assets/inventory/items.png")),
      loadNpcTextJson(withBase("assets/text/npc_text.json")).catch(() => null)
    ]);
    const sceneMeta = scene.sceneMetaSrc ? await loadSceneMeta(scene.sceneMetaSrc) : null;
    const sceneEmc = scene.sceneEmcSrc ? await loadSceneEmc(scene.sceneEmcSrc) : null;
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
    const sceneOverlays = initSceneOverlays(scene.overlays);
    const filteredSceneAnimShapes = sceneOverlays.length
      ? filterSceneAnimShapes(sceneAnimShapes, sceneOverlays)
      : sceneAnimShapes;
    const sceneShapesCanvas = packedBackground ? buildSceneShapesCanvas({
      width: packedBackground.clip.info.width, height: packedBackground.clip.info.height,
      palette: packedBackground.clip.info.palette, rawBase64: "",
    }, packedBackground.clip.frame(0)) : sceneShapesData ? buildSceneShapesCanvas(sceneShapesData) : null;
    const sceneShapesImage = sceneShapesCanvas ?? bg;
    const [openingPack, openingScript] = scene.opening ? await Promise.all([
      loadScenePack(scene.opening.pack),
      fetch(scene.opening.script).then(async response => {
        if (!response.ok) throw new Error(`Failed to load opening script (${response.status})`);
        return await response.json() as OpeningScript;
      })
    ]) : [null, null];
    if (openingPack) for (const [name, info] of Object.entries(openingPack.clips)) {
      scriptRenderers.set(name, { clip: new IndexedClip(openingPack, info), renderer: new IndexedRenderer(info, false) });
    }
    const scriptLayers = new Map<string, { image: HTMLCanvasElement; x: number; y: number }>();
    let backgroundName = "room";
    let actorVisible = true;
    let actorShape: number | null = null;
    let speechRemaining = 0;
    let speechAge = 0;
    let sequence: RoomScript | null = null;
    let treeSpoken = false;
    const debug = {
      showMask: false,
      maskOpacity: 0.35,
      showLayerInfo: false
    };

    const state = {
      pos: { x: 160, y: 120 } as Vec2,
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
      inventorySlots: initInventory(),
      itemInHand: null as InventoryItemId | null,
      sceneItems: initSceneItems(scene),
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
      speechRemaining = Math.max(0, speechRemaining - dt * 1000);
      if (speechRemaining > 0) speechAge += dt * 1000;
      if (state.statusMessage && nowMs >= state.statusMessageUntil) {
        state.statusMessage = null;
      }
      if (sceneAnims.length) {
        updateSceneAnims(sceneAnims, nowMs);
      }
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
      sequence?.update(dt * 1000);
      if (sequence?.done) {
        sequence = null;
        config.onSubtitleChange?.([]);
        config.onSequenceChange?.(false);
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
      if (backgroundName === "room" && spriteDefMap && sceneAnims.length) {
        drawSceneAnims(ctx, sceneShapesImage, spriteDefMap, sceneAnims);
      }
      const actorLayerPre = mask ? resolveActorLayer(state.pos, drawLayerTable, mask) : 1;
      if (backgroundName === "room") drawSceneItems(ctx, itemsSheet, inventoryItems, state.sceneItems, mask, actorLayerPre, "behind");
      if (state.drops.length) {
        drawDropAnims(ctx, itemsSheet, inventoryItems, state.drops);
      }

      const sequence = getSequence(state.dir);
      const talkingFrame = speechRemaining > 0 ? frames.findIndex(frame => frame.shapeIndex === 16) : -1;
      const frameIndex = state.moving ? sequence[state.frame] : talkingFrame >= 0 ? talkingFrame : actorShape !== null ? frames.findIndex(frame => frame.shapeIndex === actorShape) : getIdleFrame(state.dir);
      const frame = frames[Math.min(frames.length - 1, frameIndex)];
      if (!frame) {
        ctx.restore();
        return;
      }
      const drawX = Math.round(state.pos.x + frame.xOffset);
      const drawY = Math.round(state.pos.y + frame.yOffset);

      if (actorVisible && talkingFrame >= 0) {
        const head = frames.find(frame => frame.shapeIndex === brandonTalkHead(speechAge));
        if (head) {
          const headX = drawX + (state.dir === "right" ? 2 : 6);
          if (state.dir === "right") {
            ctx.save(); ctx.translate(headX + head.w, 0); ctx.scale(-1, 1);
            ctx.drawImage(br, head.x, head.y, head.w, head.h, 0, drawY, head.w, head.h); ctx.restore();
          } else ctx.drawImage(br, head.x, head.y, head.w, head.h, headX, drawY, head.w, head.h);
        }
      }

      if (actorVisible && state.dir === "right") {
        ctx.save();
        ctx.translate(drawX + frame.w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(br, frame.x, frame.y, frame.w, frame.h, 0, drawY, frame.w, frame.h);
        ctx.restore();
      } else if (actorVisible) {
        ctx.drawImage(br, frame.x, frame.y, frame.w, frame.h, drawX, drawY, frame.w, frame.h);
      }

      let actorLayer = 1;
      if (backgroundName === "room" && mask) {
        actorLayer = resolveActorLayer(state.pos, drawLayerTable, mask);
        let fg = foregroundFrames.get(actorLayer);
        if (!fg) {
          fg = buildForegroundFrame(bg, mask, actorLayer, packedBackground ? {
            pixels: packedBackground.clip.frame(0), palette: packedBackground.clip.info.palette
          } : undefined);
          foregroundFrames.set(actorLayer, fg);
        }
        if (fg) ctx.drawImage(fg, 0, 0);
      }
      if (backgroundName === "room") drawSceneItems(ctx, itemsSheet, inventoryItems, state.sceneItems, mask, actorLayer, "front");
      for (const layer of scriptLayers.values()) ctx.drawImage(layer.image, layer.x, layer.y);

      if (backgroundName === "room" && packedBackground && atmosphere && !reducedMotion?.matches) drawKallakAtmosphere(ctx, lastTime);
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
      if (sequence || point.y >= scene.uiMaskY || state.drops.length) return;
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
      cancelAnimationFrame(animationFrame);
      sequence?.stop();
      config.onSequenceChange?.(false);
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

    function handleClick(point: Vec2) {
      if (sequence) return true;
      if (state.drops.length) return true;
      // The original first conversation intercepts the south exit. Also let a
      // direct click on the trunk initiate it, which works well with touch input.
      if (openingScript && !treeSpoken && !state.itemInHand &&
          ((point.x >= 104 && point.x < 192 && point.y >= 32 && point.y < 68) ||
           (point.x >= 144 && point.x <= 176 && point.y >= 128 && point.y < scene.uiMaskY))) {
        treeSpoken = true;
        playScript(openingScript.tree);
        return true;
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
      const drawX = Math.round(state.pos.x + frame.xOffset);
      const drawY = Math.round(state.pos.y + frame.yOffset);
      return (
        point.x >= drawX &&
        point.x <= drawX + frame.w &&
        point.y >= drawY &&
        point.y <= drawY + frame.h
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
      switch (action.op) {
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
        case "face": face(action.facing); actorShape = action.shape < 0 ? null : action.shape; break;
        case "frame": {
          const animation = scriptRenderers.get(action.clip);
          if (!animation) throw new Error(`Missing script animation ${action.clip}`);
          scriptLayers.delete(action.clip);
          scriptLayers.set(action.clip, { image: animation.renderer.render(animation.clip.frame(action.index)), x: action.x, y: action.y });
          if (["brantree", "touch"].includes(action.clip)) actorVisible = false;
          break;
        }
        case "close":
          scriptLayers.delete(action.clip);
          if (["brantree", "touch"].includes(action.clip)) actorVisible = true;
          break;
        case "say": {
          const palette = packedBackground?.clip.info.palette;
          const color = palette ? `rgb(${palette.slice(action.color * 3, action.color * 3 + 3).join(",")})` : "#f2f2f2";
          config.onSubtitleChange?.([{ startMs: 0, endMs: action.ms, text: action.text, x: action.x, y: action.y,
            type: "talk", align: "center", maxWidth: 220, color }]);
          speechRemaining = action.blocking ? action.ms : 0;
          speechAge = 0;
          break;
        }
        case "clearText": config.onSubtitleChange?.([]); speechRemaining = 0; break;
        case "ambient": if (sceneAnims[action.index]) sceneAnims[action.index].play = action.enabled; break;
        case "message": setStatusMessage(action.text); break;
      }
    }

    function playScript(actions: RoomAction[]) {
      stopWalking();
      config.onSequenceChange?.(true);
      sequence = new RoomScript(actions, { apply: applyScript, walking: () => state.moving,
        frames: name => scriptRenderers.get(name)?.clip.info.frames.length ?? 0 });
      sequence.update(0);
    }

    if (openingScript) playScript(openingScript.opening);

    return { setTarget, stop, setDebug, setPointer, setWalkSpeed, setAnimStepInterval, handleClick,
      setAtmosphere: (enabled: boolean) => { atmosphere = enabled; } };
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
