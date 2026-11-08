import { LOGICAL_WIDTH, ROOM_ART, YELLOW_JEWEL_HITBOX, YELLOW_JEWEL_POS } from '../core/constants';
import type { Vec2 } from '../core/types';
import { getInventorySlotPositions, inside } from './inventory';

export const RADIAL_SLOT_SIZE = 13;
const orbit = 24, outer = 32, amuletScale = .4;
const halfSlot = Math.floor(RADIAL_SLOT_SIZE / 2);

export function radialLayout(height: number, anchor?: Vec2 | null, footprint = { x: 1, y: 1 }) {
  const marginX = Math.ceil(outer * footprint.x), marginY = Math.ceil(outer * footprint.y);
  const x = Math.round(Math.max(ROOM_ART.x + marginX, Math.min(LOGICAL_WIDTH - ROOM_ART.x - 1 - marginX, anchor?.x ?? LOGICAL_WIDTH / 2)));
  const y = Math.round(Math.max(ROOM_ART.y + marginY, Math.min(height - 1 - marginY, anchor?.y ?? height / 2)));
  const count = getInventorySlotPositions().length;
  const slots = Array.from({ length: count }, (_, index) => {
    const angle = index * Math.PI * 2 / count;
    return { x: Math.round(x + Math.sin(angle) * orbit) - halfSlot, y: Math.round(y - Math.cos(angle) * orbit) - halfSlot };
  });
  const amulet = { x: x - 16, y: y - 12, w: 32, h: 19 };
  const scale = (value: number) => Math.round(value * amuletScale);
  return { x, y, radius: outer, slots, amulet,
    jewel: { x: amulet.x + scale(YELLOW_JEWEL_POS.x - 224), y: amulet.y + scale(YELLOW_JEWEL_POS.y - 152), w: scale(32), h: scale(17) },
    jewelHit: { x: amulet.x + scale(YELLOW_JEWEL_HITBOX.x - 224), y: amulet.y + scale(YELLOW_JEWEL_HITBOX.y - 152),
      w: scale(YELLOW_JEWEL_HITBOX.w), h: scale(YELLOW_JEWEL_HITBOX.h) },
    options: { x: x - 10, y: y + 9, w: 21, h: 8 } };
}

function disk(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let row = -r; row <= r; row++) {
    const half = Math.floor(Math.sqrt(r * r - row * row));
    ctx.fillRect(x - half, y + row, half * 2 + 1, 1);
  }
}

function bevel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: boolean) {
  ctx.fillStyle = lit ? '#f6db91' : '#b69260';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = lit ? '#36433c' : '#161a23';
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
}

let plate: HTMLCanvasElement | undefined;
function radialPlate() {
  if (plate) return plate;
  plate = document.createElement('canvas');
  plate.width = plate.height = 2 * outer + 1;
  const ctx = plate.getContext('2d')!;
  disk(ctx, outer, outer, outer, '#100c11');
  disk(ctx, outer, outer, outer - 1, '#c09a62');
  disk(ctx, outer, outer, outer - 2, '#624735');
  ctx.globalCompositeOperation = 'destination-out';
  disk(ctx, outer, outer, orbit - 2, '#fff');
  ctx.globalCompositeOperation = 'source-over';
  disk(ctx, outer, outer, 14, '#8b6844');
  disk(ctx, outer, outer, 13, '#191d27');
  return plate;
}

const menuLetters = {
  M: [5, 7, 7, 5, 5], E: [7, 4, 6, 4, 7], N: [9, 13, 11, 9, 9], U: [5, 5, 5, 5, 7],
  М: [5, 7, 7, 5, 5], Е: [7, 4, 6, 4, 7], Н: [5, 5, 7, 5, 5], Ю: [23, 21, 29, 21, 23]
};
function drawMenuText(ctx: CanvasRenderingContext2D, menu: string, x: number, y: number) {
  const letters = [...menu.toUpperCase()].map(letter => menuLetters[letter as keyof typeof menuLetters]);
  let left = x - 8;
  for (const rows of letters) {
    if (!rows) continue;
    const width = rows[0] > 15 ? 5 : rows[0] > 7 ? 4 : 3;
    rows.forEach((bits, row) => {
      for (let col = 0; col < width; col++) if (bits & (1 << (width - col - 1))) ctx.fillRect(left + col, y + row, 1, 1);
    });
    left += width + 1;
  }
}

export function drawRadialInventory(ctx: CanvasRenderingContext2D, layout: ReturnType<typeof radialLayout>,
  pointer: Vec2 | null, menu: string, sealed: boolean, age: number, drawItem: (index: number, x: number, y: number) => void) {
  ctx.drawImage(radialPlate(), layout.x - outer, layout.y - outer);
  layout.slots.forEach((slot, index) => {
    const progress = Math.max(0, Math.min(1, (age - index * 17) / 75));
    if (progress <= 0) return;
    const easing = 1 - (1 - progress) ** 3;
    const x = slot.x + Math.round((layout.x - slot.x - halfSlot) * .2 * (1 - easing));
    const y = slot.y + Math.round((layout.y - slot.y - halfSlot) * .2 * (1 - easing));
    ctx.save(); ctx.globalAlpha = easing;
    bevel(ctx, x, y, RADIAL_SLOT_SIZE, RADIAL_SLOT_SIZE, !!pointer && inside(pointer, { ...slot, w: RADIAL_SLOT_SIZE, h: RADIAL_SLOT_SIZE }));
    drawItem(index, x + 1, y + 1);
    ctx.restore();
  });
  const { x, y, w, h } = layout.options;
  const lit = !!pointer && inside(pointer, layout.options);
  bevel(ctx, x, y, w, h, lit);
  ctx.fillStyle = lit ? '#fff0bf' : '#ddc18a';
  drawMenuText(ctx, menu, layout.x, y + 2);
  if (sealed) {
    ctx.fillStyle = '#d5ac68';
    ctx.fillRect(layout.x - 2, layout.y - 2, 5, 1);
    ctx.fillRect(layout.x, layout.y - 4, 1, 5);
  }
}
