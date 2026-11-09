import { withBase } from '../engine/core/assets';

export const WIDTH = 640, HEIGHT = 360;
export const SPREAD = { x: 42, y: 24, w: 548, h: 310 };
export const COVER = { x: 212, y: 22, w: 216, h: 300 };
export const ILLUSTRATION = { x: 343, y: 103, w: 184, h: 138 };
export const GOLD = '#f0ca82', INK = '#e2c7a4', MUTED = '#ba9774';
export type Rect = { x: number; y: number; w: number; h: number };
export type Art = Record<'desk' | 'spread' | 'cover' | 'miniature' | 'bookmark' | 'title' | 'modern' | 'classic' | 'studio', HTMLImageElement>;
type Point = { x: number; y: number };

export async function loadBookArt(): Promise<Art> {
  const files = {
    desk: 'pixel-book/desk.webp', spread: 'pixel-book/spread.webp', cover: 'pixel-book/cover.webp',
    miniature: 'pixel-book/miniature.webp', bookmark: 'pixel-book/bookmark.webp', title: 'kyrandia-title.webp',
    modern: 'controls-modern.webp', classic: 'controls-classic.webp', studio: 'akulaflow-studio.webp',
  };
  const entries = await Promise.all(Object.entries(files).map(async ([key, file]) => {
    const image = new Image();
    image.src = withBase('assets/interface/' + file);
    await image.decode();
    return [key, image] as const;
  }));
  return Object.fromEntries(entries) as Art;
}

export function surface() {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export function bookmarkPalette(source: HTMLImageElement) {
  const colors = [[159, 63, 59], [156, 115, 55], [64, 114, 82], [55, 104, 121], [111, 72, 123], [142, 85, 54], [66, 83, 134]];
  return colors.map(tint => {
    const tile = document.createElement('canvas');
    tile.width = source.width;
    tile.height = source.height;
    const ctx = tile.getContext('2d')!;
    ctx.drawImage(source, 0, 0);
    const image = ctx.getImageData(0, 0, tile.width, tile.height);
    const rgb = image.data;
    for (let i = 0; i < rgb.length; i += 4) {
      const red = rgb[i], green = rgb[i + 1];
      if (red < 24 || green > red * .63) continue;
      const light = red / 112;
      tint.forEach((value, channel) => rgb[i + channel] = Math.round(value * light * .8 + rgb[i + channel] * .2));
    }
    ctx.putImageData(image, 0, 0);
    return tile;
  });
}

export const clamp = (value: number) => Math.max(0, Math.min(1, value));
export const ease = (t: number) => (1 - Math.cos(Math.PI * clamp(t))) / 2;
export const mix = (from: Rect, to: Rect, t: number): Rect => ({
  x: Math.round(from.x + (to.x - from.x) * t),
  y: Math.round(from.y + (to.y - from.y) * t),
  w: Math.round(from.w + (to.w - from.w) * t),
  h: Math.round(from.h + (to.h - from.h) * t),
});

export function pixels(ctx: CanvasRenderingContext2D, source: CanvasImageSource, r: Rect) {
  ctx.drawImage(source, Math.round(r.x), Math.round(r.y), Math.max(1, Math.round(r.w)), Math.max(1, Math.round(r.h)));
}

export function photo(ctx: CanvasRenderingContext2D, image: HTMLImageElement | HTMLCanvasElement, r: Rect, focus?: Point, contain = false) {
  const width = image.width, height = image.height;
  if (!width || !height) return;
  const scale = (contain ? Math.min : Math.max)(r.w / width, r.h / height);
  const w = width * scale, h = height * scale;
  const x = contain ? (r.w - w) / 2 : Math.max(r.w - w, Math.min(0, r.w / 2 - w * (focus?.x ?? .5)));
  const y = contain ? (r.h - h) / 2 : Math.max(r.h - h, Math.min(0, r.h / 2 - h * (1 - (focus?.y ?? .5))));
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  pixels(ctx, image, { x: r.x + x, y: r.y + y, w, h });
  ctx.restore();
}

export function frame(ctx: CanvasRenderingContext2D, r: Rect, bright = false) {
  ctx.fillStyle = '#130d11';
  ctx.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
  ctx.strokeStyle = bright ? '#e5bd75' : '#937046';
  ctx.strokeRect(r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5);
  for (const x of [r.x - 4, r.x + r.w + 1]) for (const y of [r.y - 4, r.y + r.h + 1]) {
    ctx.fillStyle = '#b98b51';
    ctx.fillRect(x, y, 3, 3);
  }
}

export function text(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, size = 11, color = INK,
  align: CanvasTextAlign = 'left', font = 'Kyrandia, Georgia, serif', width = 200) {
  ctx.font = `${size}px ${font}`;
  const minimum = Math.min(size, 9);
  while (size > minimum && ctx.measureText(label).width > width) ctx.font = `${--size}px ${font}`;
  if (ctx.measureText(label).width > width) {
    let end = label.length - 1;
    while (end > 0 && ctx.measureText(label.slice(0, end) + '…').width > width) end--;
    label = label.slice(0, end) + '…';
  }
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#140b0a';
  ctx.fillText(label, x, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(label, x, y);
}

export function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x - radius, y, radius * 2 + 1, 1);
  ctx.fillRect(x, y - radius, 1, radius * 2 + 1);
  ctx.fillStyle = '#ffebb0';
  ctx.fillRect(x, y, 1, 1);
}

export function desk(ctx: CanvasRenderingContext2D, art: Art, time: number) {
  pixels(ctx, art.desk, { x: 0, y: 0, w: WIDTH, h: HEIGHT });
  const flame = Math.floor(time / 90);
  const flicker = Math.sin(flame * .85) + Math.sin(flame * 1.89);
  const glow = ctx.createRadialGradient(48, 27, 3, 48, 27, 124);
  glow.addColorStop(0, `rgba(255,180,78,${.20 + flicker * .035})`);
  glow.addColorStop(1, '#f0913500');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 177, 152);
  ctx.fillStyle = '#ffdc8b';
  ctx.fillRect(48 + Math.round(flicker), 16 + Math.round(flicker), 2, 9 - Math.round(flicker));
  ctx.fillStyle = '#fff0be';
  ctx.fillRect(48, 23, 2, 5);
  for (let i = 0; i < 5; i++) {
    const phase = ((time / 2800 + i * .183) % 1);
    const x = 43 + i * 11 + Math.round(Math.sin(phase * 7 + i) * 6);
    const y = 24 - Math.round(phase * 26);
    ctx.globalAlpha = Math.sin(phase * Math.PI) * .58;
    ctx.fillStyle = i % 2 ? '#f0bf78' : '#ffdb95';
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
}

export function bookShadow(ctx: CanvasRenderingContext2D, r: Rect) {
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = '#08040926';
    ctx.beginPath();
    ctx.roundRect(r.x - i * 2, r.y + 8 + i, r.w + 2 + i * 4, r.h - 2, 18);
    ctx.fill();
  }
}

// Strip projections keep the previous page's type and illustration attached to the turning leaf.
export function turnLeaf(ctx: CanvasRenderingContext2D, outgoing: HTMLCanvasElement, incoming: HTMLCanvasElement, progress: number, forward: boolean) {
  const hinge = 316, width = 232, top = 47, height = 243;
  const angle = progress * Math.PI, face = Math.cos(angle), arch = Math.sin(angle);
  const side = forward ? 1 : -1;
  const sourceSide = face >= 0 ? side : -side;
  const source = face >= 0 ? outgoing : incoming;
  const direction = face >= 0 ? side : -side;
  ctx.fillStyle = `rgba(10,5,3,${arch * .42})`;
  ctx.fillRect(direction === 1 ? hinge : hinge - width, top, width, height);
  for (let offset = 0; offset < width; offset += 4) {
    const u = offset / width, bend = Math.sin(u * Math.PI) * arch;
    const dest = hinge + direction * Math.round(offset * Math.abs(face) + bend * 9);
    const destWidth = Math.max(2, Math.ceil(4 * Math.abs(face)) + 1);
    const shift = Math.round((bend * 14 + arch * 9) * u);
    const src = sourceSide === 1 ? hinge + offset : hinge - offset - 4;
    const x = direction === 1 ? dest : dest - destWidth;
    ctx.drawImage(source, src, top, 4, height, x, top - shift, destWidth, height + shift * 2);
    ctx.fillStyle = `rgba(250,193,110,${arch * (.06 + u * .16)})`;
    ctx.fillRect(x, top - shift, destWidth, height + shift * 2);
  }
  ctx.fillStyle = '#a37a48';
  ctx.fillRect(hinge + Math.round(direction * width * Math.abs(face)), top - Math.round(arch * 9), 1, height + Math.round(arch * 18));
}
