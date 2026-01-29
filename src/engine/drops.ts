import { LOGICAL_WIDTH } from "./constants";
import { clampTarget, isWalkable } from "./masks";
import { getTileRect } from "./inventory";
import type { DropAnim, InventoryItem, InventoryItemId, MaskData, SceneConfig, SceneItem, Vec2 } from "./types";

export function dropItemAt(
  point: Vec2,
  from: Vec2,
  itemInHand: InventoryItemId | null,
  drops: DropAnim[],
  sceneCfg: SceneConfig,
  maskData: MaskData | null
) {
  if (!itemInHand) return false;
  if (point.y >= sceneCfg.uiMaskY) return false;
  const dest = findDropDestination(point, from, sceneCfg, maskData);
  if (!dest) return false;
  const startX = point.x;
  const startY = Math.max(0, point.y);
  const driftDir = Math.sign(point.x - from.x) || 1;
  drops.push({
    id: itemInHand,
    x: startX,
    y: startY,
    vx: driftDir * 0.6,
    vy: -2.2,
    destX: dest.x,
    destY: dest.y,
    bounces: 0,
    driftDir
  });
  return true;
}

export function updateDrops(
  drops: DropAnim[],
  items: SceneItem[],
  scene: SceneConfig,
  mask: MaskData | null
) {
  const gravity = 0.45;
  for (let i = drops.length - 1; i >= 0; i--) {
    const drop = drops[i];
    drop.vy += gravity;
    drop.vx *= 0.99;
    drop.x += drop.vx;
    drop.y += drop.vy;

    if (drop.x < 0 || drop.x > LOGICAL_WIDTH - 1) {
      drop.x = Math.max(0, Math.min(LOGICAL_WIDTH - 1, drop.x));
      drop.vx *= -0.3;
    }

    if (drop.y >= drop.destY) {
      drop.y = drop.destY;
      drop.vy = -Math.max(0.6, Math.abs(drop.vy) * 0.35);
      if (drop.bounces === 0) {
        drop.vx += drop.driftDir * 0.2;
      }
      drop.vx *= 0.85;
      drop.bounces += 1;
      if (drop.bounces >= 5 || Math.abs(drop.vy) < 0.7) {
        let finalPos = { x: drop.x, y: drop.destY };
        if (mask && !isWalkable(finalPos, scene, mask)) {
          const snapped = findNearestWalkable(finalPos, scene, mask, 24);
          if (snapped) {
            finalPos = snapped;
          } else {
            finalPos = { x: drop.destX, y: drop.destY };
          }
        }
        items.push({ id: drop.id, x: finalPos.x, y: finalPos.y });
        drops.splice(i, 1);
      }
    }
  }
}

export function drawDropAnims(
  ctx: CanvasRenderingContext2D,
  itemsSheet: HTMLImageElement,
  inventoryItems: Map<InventoryItemId, InventoryItem>,
  drops: DropAnim[]
) {
  for (const drop of drops) {
    const def = inventoryItems.get(drop.id);
    if (!def) continue;
    const rect = getTileRect(def.tileIndex);
    ctx.drawImage(
      itemsSheet,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      Math.round(drop.x - 8),
      Math.round(drop.y - 16),
      rect.w,
      rect.h
    );
  }
}

function findDropDestination(
  point: Vec2,
  from: Vec2,
  scene: SceneConfig,
  mask: MaskData | null
): Vec2 | null {
  const x = Math.max(0, Math.min(LOGICAL_WIDTH - 1, point.x));
  const startY = Math.max(0, Math.min(scene.uiMaskY - 1, point.y));
  if (mask) {
    for (let y = Math.floor(startY); y < scene.uiMaskY; y++) {
      if (isWalkable({ x, y }, scene, mask)) {
        return { x, y };
      }
    }
  }
  return clampTarget(from, { x, y: startY }, scene, mask);
}

function findNearestWalkable(point: Vec2, scene: SceneConfig, mask: MaskData, maxRadius: number): Vec2 | null {
  const start = {
    x: Math.max(0, Math.min(LOGICAL_WIDTH - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(scene.uiMaskY - 1, Math.round(point.y)))
  };
  if (isWalkable(start, scene, mask)) return start;
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const p = { x: start.x + dx, y: start.y + dy };
        if (p.x < 0 || p.x >= LOGICAL_WIDTH) continue;
        if (p.y < 0 || p.y >= scene.uiMaskY) continue;
        if (isWalkable(p, scene, mask)) return p;
      }
    }
  }
  return null;
}
