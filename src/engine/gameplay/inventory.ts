import { INVENTORY_ICON_SIZE, ITEMS_SHEET_COLS } from "../core/constants";
import { getDrawLayer } from "../scene/masks";
import type { InventoryItem, InventoryItemId, InventorySlot, MaskData, SceneItem, Vec2 } from "../core/types";
// Entries follow the DOS CD item order (ScummVM's k1ItemNamesDOSEnglish table).
import itemNames from '../../locales/item-names.json';

const INVENTORY_ITEM_DEFS: Record<InventoryItemId, InventoryItem> = {
  // Tile indices are 0-based, 20 columns per row in items.png.
  letter: { id: "letter", name: "Letter", tileIndex: 42 },
  // Old saves call the garnet "ruby"; its original number and artwork are 0.
  ruby: { id: "ruby", name: "Garnet", tileIndex: 0 },
  saw: { id: "saw", name: "Saw", tileIndex: 44 },
  rose: { id: "rose", name: "Lavender rose", tileIndex: 16 },
  silverRose: { id: "silverRose", name: "Silver rose", tileIndex: 19 },
  marble: { id: "marble", name: "Marble", tileIndex: 43 },
  teardrop: { id: "teardrop", name: "Teardrop", tileIndex: 52 },
  apple: { id: "apple", name: "Apple", tileIndex: 38 },
  appleEaten: { id: "appleEaten", name: "Apple Core", tileIndex: 39 },
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
  const items = new Map<InventoryItemId, InventoryItem>(Object.values(INVENTORY_ITEM_DEFS).map(item => [item.id, { ...item }]));
  for (const [tileIndex, [name]] of itemNames.entries()) {
    const id = `item-${tileIndex}` as InventoryItemId;
    items.set(id, { id, name, tileIndex });
  }
  return items;
}

export function initInventory(): (InventoryItemId | null)[] {
  const slots: (InventoryItemId | null)[] = new Array(INVENTORY_SLOTS.length).fill(null);
  const start: InventoryItemId[] = [];
  for (let i = 0; i < start.length && i < slots.length; i++) {
    slots[i] = start[i];
  }
  return slots;
}

export function inside(point: Vec2, rect: Vec2 & { w: number; h: number }) {
  return point.x >= rect.x && point.x < rect.x + rect.w && point.y >= rect.y && point.y < rect.y + rect.h;
}

export function findInventorySlot(point: Vec2, positions = INVENTORY_SLOTS, size = INVENTORY_ICON_SIZE) {
  return positions.findIndex(slot => inside(point, { ...slot, w: size, h: size }));
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
  return item?.name ?? itemNames[Number(id.slice(5))]?.[0] ?? 'Unknown item';
}
