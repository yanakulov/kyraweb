// SPDX-License-Identifier: GPL-3.0-or-later
// Falling/bounce trajectory follows ScummVM engines/kyra/engine/items_lok.cpp.
// Copyright ScummVM contributors. See LICENSES/GPL-3.0.txt.
import { LOGICAL_WIDTH, TICK_MS } from "../core/constants";
import { getDrawLayer, getMaskValue, isWalkable } from "../scene/masks";
import { findSceneItemAt, getTileRect } from "./inventory";
import type { DropAnim, InventoryItem, InventoryItemId, MaskData, SceneConfig, SceneItem, Vec2 } from "../core/types";

export function buildDropPath(from: Vec2, dest: Vec2): Vec2[] {
  const path = [{ ...from }];
  let y = from.y, addY = 2;
  if (y <= dest.y) {
    while (y < dest.y) {
      y = Math.min(dest.y, y + addY++);
      path.push({ x: from.x, y });
    }
    // A short vertical drop settles immediately; a longer fall bounces once.
    if (from.x !== dest.x || dest.y - from.y > 16) {
      addY = Math.max(6, addY);
      const xStep = Math.trunc(((dest.x - from.x) * 16) / addY);
      let steps = addY, fixedX = from.x * 16;
      addY = Math.floor(addY / 2);
      if (dest.y - from.y <= 8) addY = Math.floor(addY / 2);
      addY = -addY;
      while (--steps) {
        y = Math.min(dest.y, y + addY++);
        fixedX += xStep;
        path.push({ x: Math.floor(fixedX / 16), y });
      }
    }
  }
  path.push({ ...dest });
  return path;
}

export function dropItemAt(
  point: Vec2,
  itemInHand: InventoryItemId | null,
  drops: DropAnim[],
  items: SceneItem[],
  scene: SceneConfig,
  mask: MaskData | null
) {
  if (!itemInHand || point.y < 0 || point.y >= scene.uiMaskY || point.x < 0 || point.x >= LOGICAL_WIDTH) return false;
  if (items.length + drops.length >= 12) return false;
  const dest = findDropDestination(point, scene, mask, [...items, ...drops.map(d => ({ id: d.id, x: d.destX, y: d.destY }))]);
  if (!dest) return false;
  const from = { x: Math.floor(point.x), y: Math.floor(point.y) };
  drops.push({ id: itemInHand, ...from, destX: dest.x, destY: dest.y, path: buildDropPath(from, dest), elapsedMs: 0 });
  return true;
}

export function updateDrops(drops: DropAnim[], items: SceneItem[], elapsedMs: number) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const drop = drops[i];
    drop.elapsedMs += Math.max(0, elapsedMs);
    const index = Math.floor((drop.elapsedMs + 1e-7) / TICK_MS);
    if (index >= drop.path.length - 1) {
      items.push({ id: drop.id, x: drop.destX, y: drop.destY });
      drops.splice(i, 1);
    } else {
      drop.x = drop.path[index].x;
      drop.y = drop.path[index].y;
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
    ctx.drawImage(itemsSheet, rect.x, rect.y, rect.w, rect.h, drop.x - 8, drop.y - 16, rect.w, rect.h);
  }
}

function canDropAt(point: Vec2, scene: SceneConfig, mask: MaskData | null) {
  if (point.x < 16 || point.x > 304 || point.y < 1 || point.y >= scene.uiMaskY) return false;
  if (!mask) return isWalkable(point, scene, null);
  if (point.x + 7 >= mask.width || point.y >= mask.height) return false;
  for (let x = point.x - 8; x < point.x + 8; x++) {
    if ((getMaskValue(mask, x, point.y - 1) & 0x80) !== 0) return false;
    // Keep the 16px icon out of fully occluding foreground.
    for (let y = Math.max(0, point.y - 17); y < point.y - 1; y++) {
      if ((getMaskValue(mask, x, y) & 7) >= 7) return false;
    }
  }
  return getDrawLayer(mask, point.x, point.y) <= 1;
}

export function findDropDestination(point: Vec2, scene: SceneConfig, mask: MaskData | null, items: SceneItem[]): Vec2 | null {
  const x = Math.max(16, Math.min(304, Math.floor(point.x)));
  const firstY = Math.max(1, Math.floor(point.y));
  // Search down in 2px rows, then outwards on a valid floor row.
  for (let y = firstY; y < scene.uiMaskY; y += 2) {
    if (!canDropAt({ x, y }, scene, mask)) continue;
    for (let distance = 0; distance <= 288; distance += 2) {
      for (const candidateX of distance === 0 ? [x] : [x - distance, x + distance]) {
        const candidate = { x: candidateX, y };
        if (canDropAt(candidate, scene, mask) && findSceneItemAt(candidate, items) === -1) return candidate;
      }
    }
  }
  return null;
}
