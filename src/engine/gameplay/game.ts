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
import { buildMaskCanvas, buildForegroundFrame, clampTarget, isWalkable, resolveActorLayer } from "../scene/masks";
import { getIdleFrame, getSequence, pickDirection } from "./movement";
import { filterSceneAnimShapes, findOverlayAt, initSceneOverlays, drawSceneOverlays } from "../scene/overlays";
import { buildSceneAnimStates, drawSceneAnims, updateSceneAnims } from "../scene/sceneAnims";
import { buildSceneShapesCanvas, buildSpriteDefMap, drawSceneAnimShapes } from "../scene/sceneShapes";
import { buildUiOverlay, drawLayerDebug, drawStatusLine } from "../core/ui";
import type { DropAnim, GameConfig, InventoryItemId, SceneItem, SceneOverlayState, Vec2 } from "../core/types";

export async function startGame(canvas: HTMLCanvasElement, config: GameConfig) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  canvas.width = LOGICAL_WIDTH;
  canvas.height = LOGICAL_HEIGHT;

  const scene = config.scene;

  const [bg, br, ui, mask, itemsSheet, npcText] = await Promise.all([
    loadImage(scene.bgSrc),
    loadImage(scene.brSrc),
    scene.uiOverlaySrc ? loadImage(scene.uiOverlaySrc) : Promise.resolve(null),
    scene.maskSrc ? loadMask(scene.maskSrc) : Promise.resolve(null),
    loadImage(withBase("assets/inventory/items.png")),
    loadNpcTextJson(withBase("assets/text/npc_text.json")).catch(() => null)
  ]);
  const sceneMeta = scene.sceneMetaSrc ? await loadSceneMeta(scene.sceneMetaSrc) : null;
  const sceneEmc = scene.sceneEmcSrc ? await loadSceneEmc(scene.sceneEmcSrc) : null;
  const sceneShapesData = scene.sceneShapesSrc ? await loadSceneShapes(scene.sceneShapesSrc) : null;
  const inventoryItems = buildInventoryItems();

  const frames = scene.frames;
  const uiOverlay = ui ? buildUiOverlay(ui) : null;
  const maskCanvas = mask ? buildMaskCanvas(mask) : null;
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
  const sceneShapesCanvas = sceneShapesData ? buildSceneShapesCanvas(sceneShapesData) : null;
  const sceneShapesImage = sceneShapesCanvas ?? bg;
  const debug = {
    showMask: false,
    maskOpacity: 0.35,
    showLayerInfo: false
  };

  const state = {
    pos: { x: 160, y: 120 } as Vec2,
    target: null as Vec2 | null,
    pointer: null as Vec2 | null,
    walkDelayTicks: 6,
    stepAccumulatorMs: 0,
    stepIndex: 0,
    animStepInterval: DEFAULT_ANIM_STEP_INTERVAL,
    dir: "right" as "left" | "right" | "up" | "down",
    lockedDir: null as null | "left" | "right" | "up" | "down",
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

  function update(dt: number, nowMs: number) {
    if (state.statusMessage && nowMs >= state.statusMessageUntil) {
      state.statusMessage = null;
    }
    if (sceneAnims.length) {
      updateSceneAnims(sceneAnims, nowMs);
    }
    if (state.drops.length) {
      updateDrops(state.drops, state.sceneItems, scene, mask);
    }

    if (!state.target) {
      state.moving = false;
      state.frame = 0;
      state.stepAccumulatorMs = 0;
      state.stepIndex = 0;
      state.lockedDir = null;
      return;
    }

    const stepInterval = state.walkDelayTicks * TICK_MS;
    state.stepAccumulatorMs += dt * 1000;
    let moved = false;

    while (state.stepAccumulatorMs >= stepInterval) {
      state.stepAccumulatorMs -= stepInterval;

      const dx = state.target.x - state.pos.x;
      const dy = state.target.y - state.pos.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 0.5) {
        state.pos = { ...state.target };
        state.target = null;
        state.moving = false;
        state.frame = 0;
        state.stepIndex = 0;
        state.lockedDir = null;
        return;
      }

      if (!state.lockedDir && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) {
        state.lockedDir = pickDirection(dx, dy, state.dir);
      }
      if (state.lockedDir) state.dir = state.lockedDir;

      const stepX = Math.abs(dx) > 0.5 ? (dx >= 0 ? 4 : -4) : 0;
      const stepY = Math.abs(dy) > 0.5 ? (dy >= 0 ? 2 : -2) : 0;
      const stepLen = Math.hypot(stepX, stepY);
      let nextPos: Vec2;
      if (dist <= stepLen) {
        nextPos = { ...state.target };
      } else {
        nextPos = {
          x: state.pos.x + stepX,
          y: state.pos.y + stepY
        };
      }

      if (!isWalkable(nextPos, scene, mask)) {
        state.target = null;
        state.moving = false;
        state.frame = 0;
        state.stepIndex = 0;
        return;
      }

      state.pos = nextPos;
      moved = true;
      state.stepIndex += 1;
      if (state.stepIndex % state.animStepInterval === 0) {
        state.frame = (state.frame + 1) % getSequence(state.dir).length;
      }
    }

    state.moving = moved;
    if (state.target) {
      state.moving = true;
    }
  }

  function render() {
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    ctx.drawImage(bg, 0, 0);
    if (spriteDefMap && filteredSceneAnimShapes.length) {
      drawSceneAnimShapes(ctx, sceneShapesImage, spriteDefMap, filteredSceneAnimShapes);
    }
    if (spriteDefMap && state.overlays.length) {
      drawSceneOverlays(ctx, sceneShapesImage, spriteDefMap, state.overlays);
    }
    if (spriteDefMap && sceneAnims.length) {
      drawSceneAnims(ctx, sceneShapesImage, spriteDefMap, sceneAnims);
    }
    const actorLayerPre = mask ? resolveActorLayer(state.pos, drawLayerTable, mask) : 1;
    drawSceneItems(ctx, itemsSheet, inventoryItems, state.sceneItems, mask, actorLayerPre, "behind");
    if (state.drops.length) {
      drawDropAnims(ctx, itemsSheet, inventoryItems, state.drops);
    }

    const sequence = getSequence(state.dir);
    const frameIndex = state.moving ? sequence[state.frame] : getIdleFrame(state.dir);
    const frame = frames[Math.min(frames.length - 1, frameIndex)];
    if (!frame) {
      return;
    }
    const drawX = Math.round(state.pos.x + frame.xOffset);
    const drawY = Math.round(state.pos.y + frame.yOffset);

    if (state.dir === "right") {
      ctx.save();
      ctx.translate(drawX + frame.w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(br, frame.x, frame.y, frame.w, frame.h, 0, drawY, frame.w, frame.h);
      ctx.restore();
    } else {
      ctx.drawImage(br, frame.x, frame.y, frame.w, frame.h, drawX, drawY, frame.w, frame.h);
    }

    let actorLayer = 1;
    if (mask) {
      actorLayer = resolveActorLayer(state.pos, drawLayerTable, mask);
      const fg = buildForegroundFrame(bg, mask, actorLayer);
      if (fg) ctx.drawImage(fg, 0, 0);
    }
    drawSceneItems(ctx, itemsSheet, inventoryItems, state.sceneItems, mask, actorLayer, "front");

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
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    update(dt, now);
    render();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  function setTarget(point: Vec2) {
    const clamped = clampTarget(state.pos, point, scene, mask);
    if (!clamped) return;
    state.target = clamped;
    state.lockedDir = null;
    state.frame = 0;
    state.stepIndex = 0;
    const dx = state.target.x - state.pos.x;
    const dy = state.target.y - state.pos.y;
    state.lockedDir = pickDirection(dx, dy, state.dir);
    if (state.lockedDir) state.dir = state.lockedDir;
  }

  function stop() {
    running = false;
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
    if (point.y < scene.uiMaskY && isPointOnBrandon(point)) {
      const line = getNpcTextLine(100, "Why do I have to do everything?");
      setStatusMessage(line);
      return true;
    }
    if (point.y < scene.uiMaskY) {
      const overlay = findOverlayAt(point, state.overlays, spriteDefMap);
      if (overlay && !state.itemInHand) {
        pickOverlayItem(overlay);
        return true;
      }
    }
    const slot = findInventorySlot(point);
    if (slot !== -1) {
      exchangeInventorySlot(slot);
      return true;
    }
    if (state.itemInHand) {
      const droppedItem = state.itemInHand;
      const dropped = dropItemAt(point, state.pos, state.itemInHand, state.drops, scene, mask);
      if (dropped) {
        setStatusMessage(`Положил ${getItemStatusName(droppedItem)}`);
        state.itemInHand = null;
        return true;
      }
    }
    if (point.y < scene.uiMaskY) {
      const itemIndex = findSceneItemAt(point, state.sceneItems);
      if (itemIndex !== -1) {
        const item = state.sceneItems.splice(itemIndex, 1)[0];
        if (item) {
          state.itemInHand = item.id;
          setStatusMessage(`Взял ${getItemStatusName(item.id)}`);
          return true;
        }
      }
    }
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

  return { setTarget, stop, setDebug, setPointer, setWalkSpeed, setAnimStepInterval, handleClick };
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
