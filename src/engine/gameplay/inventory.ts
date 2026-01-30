import { INVENTORY_ICON_SIZE, ITEMS_SHEET_COLS } from "../core/constants";
import { getDrawLayer } from "../scene/masks";
import type { InventoryItem, InventoryItemId, InventorySlot, MaskData, SceneItem } from "../core/types";

const INVENTORY_ITEM_DEFS: Record<InventoryItemId, InventoryItem> = {
  // Tile indices are 0-based, 20 columns per row in items.png.
  letter: { id: "letter", name: "Letter", statusName: "письмо", tileIndex: 42 },
  ruby: { id: "ruby", name: "Ruby", statusName: "рубин", tileIndex: 0 },
  saw: { id: "saw", name: "Saw", statusName: "пила", tileIndex: 44 },
  apple: { id: "apple", name: "Apple", statusName: "яблоко", tileIndex: 19 },
  appleEaten: { id: "appleEaten", name: "Apple (eaten)", statusName: "огрызок", tileIndex: 20 }
};

const INVENTORY_SLOTS: InventorySlot[] = [
  { x: 95, y: 160 },
  { x: 115, y: 160 },
  { x: 135, y: 160 },
  { x: 155, y: 160 },
  { x: 175, y: 160 },
  { x: 95, y: 181 },
  { x: 115, y: 181 },
  { x: 135, y: 181 },
  { x: 155, y: 181 },
  { x: 175, y: 181 }
];

export function buildInventoryItems(): Map<InventoryItemId, InventoryItem> {
  return new Map<InventoryItemId, InventoryItem>([
    ["letter", { ...INVENTORY_ITEM_DEFS.letter }],
    ["ruby", { ...INVENTORY_ITEM_DEFS.ruby }],
    ["saw", { ...INVENTORY_ITEM_DEFS.saw }]
  ]);
}

export function initInventory(): (InventoryItemId | null)[] {
  const slots: (InventoryItemId | null)[] = new Array(INVENTORY_SLOTS.length).fill(null);
  const start: InventoryItemId[] = [];
  for (let i = 0; i < start.length && i < slots.length; i++) {
    slots[i] = start[i];
  }
  return slots;
}

export function findInventorySlot(point: { x: number; y: number }) {
  for (let i = 0; i < INVENTORY_SLOTS.length; i++) {
    const slot = INVENTORY_SLOTS[i];
    if (
      point.x >= slot.x &&
      point.x < slot.x + INVENTORY_ICON_SIZE &&
      point.y >= slot.y &&
      point.y < slot.y + INVENTORY_ICON_SIZE
    ) {
      return i;
    }
  }
  return -1;
}

export function drawInventory(
  ctx: CanvasRenderingContext2D,
  itemsSheet: HTMLImageElement,
  inventoryItems: Map<InventoryItemId, InventoryItem>,
  slots: (InventoryItemId | null)[]
) {
  for (let i = 0; i < slots.length && i < INVENTORY_SLOTS.length; i++) {
    const id = slots[i];
    if (!id) continue;
    const item = inventoryItems.get(id);
    if (!item) continue;
    const slot = INVENTORY_SLOTS[i];
    const rect = getTileRect(item.tileIndex);
    ctx.drawImage(
      itemsSheet,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      slot.x,
      slot.y,
      INVENTORY_ICON_SIZE,
      INVENTORY_ICON_SIZE
    );
  }
}

export function drawSceneItems(
  ctx: CanvasRenderingContext2D,
  itemsSheet: HTMLImageElement,
  inventoryItems: Map<InventoryItemId, InventoryItem>,
  items: SceneItem[],
  mask: MaskData | null,
  actorLayer: number,
  phase: "behind" | "front"
) {
  for (const item of items) {
    const def = inventoryItems.get(item.id);
    if (!def) continue;
    const itemLayer = mask ? getDrawLayer(mask, item.x, item.y) : 1;
    const isFront = itemLayer > actorLayer;
    if ((phase === "front") !== isFront) continue;
    const rect = getTileRect(def.tileIndex);
    ctx.drawImage(
      itemsSheet,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      Math.round(item.x - 8),
      Math.round(item.y - 16),
      rect.w,
      rect.h
    );
  }
}

export function findSceneItemAt(point: { x: number; y: number }, items: SceneItem[]) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const left = item.x - 8;
    const right = item.x + 8;
    const top = item.y - 16;
    const bottom = item.y;
    if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
      return i;
    }
  }
  return -1;
}

export function getTileRect(tileIndex: number) {
  const col = tileIndex % ITEMS_SHEET_COLS;
  const row = Math.floor(tileIndex / ITEMS_SHEET_COLS);
  return {
    x: col * INVENTORY_ICON_SIZE,
    y: row * INVENTORY_ICON_SIZE,
    w: INVENTORY_ICON_SIZE,
    h: INVENTORY_ICON_SIZE
  };
}

export function getInventorySlotPositions() {
  return INVENTORY_SLOTS;
}

export function getItemStatusName(id: InventoryItemId) {
  const item = INVENTORY_ITEM_DEFS[id];
  if (!item) return id;
  return item.statusName ?? item.name ?? id;
}
