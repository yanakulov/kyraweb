import { INVENTORY_ICON_SIZE, LOGICAL_WIDTH, YELLOW_JEWEL_HITBOX, YELLOW_JEWEL_POS } from '../core/constants';
import type { Vec2 } from '../core/types';
import { getInventorySlotPositions, inside } from './inventory';

export const RADIAL_SLOT_SIZE = INVENTORY_ICON_SIZE + 2;
const radius = 36;
const outer = 46;
const amuletScale = .65;

export function radialLayout(height: number, anchor?: Vec2 | null) {
  const x = Math.round(Math.max(outer, Math.min(LOGICAL_WIDTH - 1 - outer, anchor?.x ?? LOGICAL_WIDTH / 2)));
  const y = Math.round(Math.max(outer, Math.min(height - 1 - outer, anchor?.y ?? height / 2)));
  const count = getInventorySlotPositions().length;
  const slots = Array.from({ length: count }, (_, index) => {
    const angle = index * Math.PI * 2 / count;
    return { x: Math.round(x + Math.sin(angle) * radius) - RADIAL_SLOT_SIZE / 2,
      y: Math.round(y - Math.cos(angle) * radius) - RADIAL_SLOT_SIZE / 2 };
  });
  const amulet = { x: x - 26, y: y - 18, w: 52, h: 31 };
  const scale = (value: number) => Math.round(value * amuletScale);
  return { x, y, radius: outer, slots, amulet,
    jewel: { x: amulet.x + scale(YELLOW_JEWEL_POS.x - 224), y: amulet.y + scale(YELLOW_JEWEL_POS.y - 152), w: scale(32), h: scale(17) },
    jewelHit: { x: amulet.x + scale(YELLOW_JEWEL_HITBOX.x - 224), y: amulet.y + scale(YELLOW_JEWEL_HITBOX.y - 152),
      w: scale(YELLOW_JEWEL_HITBOX.w), h: scale(YELLOW_JEWEL_HITBOX.h) },
    options: { x: x - 19, y: y + 15, w: 38, h: 12 } };
}

function disk(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let row = -r; row <= r; row++) {
    const half = Math.floor(Math.sqrt(r * r - row * row));
    ctx.fillRect(x - half, y + row, half * 2 + 1, 1);
  }
}

function bevel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: boolean) {
  ctx.fillStyle = '#100b10'; ctx.fillRect(x + 1, y + 1, w - 1, h - 1);
  ctx.fillStyle = lit ? '#f4d584' : '#aa8251'; ctx.fillRect(x + 1, y, w - 2, h - 1); ctx.fillRect(x, y + 1, w, h - 2);
  ctx.fillStyle = '#5b3f37'; ctx.fillRect(x + 1, y + 2, w - 2, h - 3);
  ctx.fillStyle = lit ? '#354844' : '#151923'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = '#3f4653'; ctx.fillRect(x + 3, y + h - 4, w - 6, 1);
}

let plate: HTMLCanvasElement | undefined;
function radialPlate() {
  if (plate) return plate;
  plate = document.createElement('canvas');
  plate.width = plate.height = 2 * outer + 1;
  const ctx = plate.getContext('2d')!;
  disk(ctx, outer, outer, outer, '#0e0b11');
  disk(ctx, outer, outer, outer - 2, '#694932');
  disk(ctx, outer, outer, outer - 3, '#b18a55');
  disk(ctx, outer, outer, outer - 4, '#343043');
  disk(ctx, outer, outer, outer - 5, '#212530');
  disk(ctx, outer, outer, radius - 8, '#746047');
  disk(ctx, outer, outer, radius - 9, '#171a23');
  for (let y = 9; y < 2 * outer - 9; y += 3) {
    for (let x = 9; x < 2 * outer - 9; x += 3) {
      const d = (x - outer) ** 2 + (y - outer) ** 2;
      if (d > (outer - 7) ** 2 || Math.abs(d - (radius - 9) ** 2) < 80) continue;
      const grain = (x * 37 + y * 79 + x * y * 11) % 29;
      if (grain > 5) continue;
      ctx.fillStyle = grain > 2 ? '#b9a4a00c' : '#00000020';
      ctx.fillRect(x, y, grain % 2 + 1, 1);
    }
  }
  for (let i = 0; i < 10; i++) {
    const angle = (i + .5) * Math.PI / 5;
    const x = outer + Math.round(Math.sin(angle) * radius);
    const y = outer - Math.round(Math.cos(angle) * radius);
    disk(ctx, x, y, 2, '#886643');
    ctx.fillStyle = '#d5ac68'; ctx.fillRect(x, y - 1, 1, 1);
  }
  return plate;
}

export function drawRadialInventory(ctx: CanvasRenderingContext2D, layout: ReturnType<typeof radialLayout>, hoverSlot: number,
  pointer: Vec2 | null, menu: string, sealed: boolean) {
  ctx.drawImage(radialPlate(), layout.x - outer, layout.y - outer);
  layout.slots.forEach(({ x, y }, index) => bevel(ctx, x, y, RADIAL_SLOT_SIZE, RADIAL_SLOT_SIZE, index === hoverSlot));
  const { x, y, w, h } = layout.options;
  const lit = !!pointer && inside(pointer, layout.options);
  bevel(ctx, x, y, w, h, lit);
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '7px Kyrandia, monospace'; ctx.fillStyle = lit ? '#fff1c3' : '#dfc28a';
  ctx.fillText(menu, layout.x, y + h / 2 + 1, w - 6);
  if (sealed) {
    disk(ctx, layout.x, layout.y - 2, 13, '#262534');
    disk(ctx, layout.x, layout.y - 2, 11, '#1b2029');
    ctx.font = '13px Georgia, serif'; ctx.fillStyle = '#a2865c';
    ctx.fillText('✧', layout.x, layout.y - 1);
  }
  ctx.restore();
}
