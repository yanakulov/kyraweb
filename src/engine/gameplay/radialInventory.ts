import { LOGICAL_WIDTH, ROOM_ART, YELLOW_JEWEL_HITBOX, YELLOW_JEWEL_POS } from '../core/constants';
import type { Vec2 } from '../core/types';
import { getInventorySlotPositions, inside } from './inventory';

export const RADIAL_SLOT_SIZE = 13;
export const RADIAL_RENDER_SCALE = 2;
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
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function bevel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: boolean) {
  ctx.beginPath();
  ctx.roundRect(x + .35, y + .35, w - .7, h - .7, .85);
  ctx.fillStyle = lit ? '#263d3c' : '#12121e';
  ctx.fill();
  ctx.strokeStyle = lit ? '#e2bf85' : '#8b795a';
  ctx.lineWidth = .5;
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = lit ? '#648279' : '#352f43';
  ctx.lineWidth = .5;
  ctx.stroke();
}

let plate: HTMLCanvasElement | undefined;
function radialPlate() {
  if (plate) return plate;
  plate = document.createElement('canvas');
  plate.width = plate.height = (2 * outer + 1) * RADIAL_RENDER_SCALE;
  const ctx = plate.getContext('2d')!;
  ctx.scale(RADIAL_RENDER_SCALE, RADIAL_RENDER_SCALE);
  const center = outer + .5;
  disk(ctx, center, center, outer + .35, '#100e17');
  disk(ctx, center, center, outer - .45, '#a28b63');
  disk(ctx, center, center, outer - 1.15, '#282437');
  disk(ctx, center, center, outer - 2.3, '#453d54');
  disk(ctx, center, center, outer - 3, '#2a2538');
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#88729230';
  for (let y = 3; y < 2 * outer; y++)
    for (let x = 3; x < 2 * outer; x++)
      if (((x * 43 ^ y * 61 ^ x * y) & 31) < 5) ctx.fillRect(x, y, 1, .5);
  ctx.restore();
  disk(ctx, center, center, orbit - 1.1, '#807057');
  ctx.globalCompositeOperation = 'destination-out';
  disk(ctx, center, center, orbit - 1.7, '#fff');
  ctx.globalCompositeOperation = 'source-over';
  disk(ctx, center, center, 14, '#100e17');
  disk(ctx, center, center, 13.4, '#8f7958');
  disk(ctx, center, center, 12.8, '#342d43');
  disk(ctx, center, center, 12, '#1b1928');
  return plate;
}

export function drawRadialInventory(ctx: CanvasRenderingContext2D, layout: ReturnType<typeof radialLayout>,
  pointer: Vec2 | null, menu: string, sealed: boolean, age: number, drawItem: (index: number, x: number, y: number) => void) {
  const diameter = 2 * outer + 1;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(radialPlate(), layout.x - outer, layout.y - outer, diameter, diameter);
  ctx.imageSmoothingEnabled = false;
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
  ctx.font = '600 4.6px Tahoma, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(menu.toUpperCase(), x + w / 2, y + h / 2 + .15, w - 2);
  if (sealed) {
    ctx.save();
    ctx.translate(layout.x + .5, layout.y - .5);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#a28b63';
    ctx.fillRect(-2, -2, 4, 4);
    ctx.fillStyle = '#285450';
    ctx.fillRect(-1.35, -1.35, 2.7, 2.7);
    ctx.restore();
  }
}
