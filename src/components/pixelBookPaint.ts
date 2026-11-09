import { withBase } from '../engine/core/assets';
import { IndexedClip, loadScenePack } from '../engine/resources/scenePack';
import { buildIndexedCanvas } from '../engine/rendering/indexedRenderer';
import { ROOM_ART } from '../engine/core/constants';

export const WIDTH = 640, HEIGHT = 360;
export const SPREAD = { x: 104, y: 42, w: 432, h: 264 };
export const COVER = { x: 212, y: SPREAD.y, w: SPREAD.w / 2, h: SPREAD.h };
export const ILLUSTRATION = { x: 339, y: 118, w: 165, h: 115 };
export const RUBRIC = '#6b3625', INK = '#2b1b12', MUTED = '#5b4331', FOIL = '#f1d198';
export type Rect = { x: number; y: number; w: number; h: number };
export type Art = Record<'desk' | 'spread' | 'cover' | 'bookmark' | 'modern' | 'classic' | 'studio', HTMLImageElement>;
type Point = { x: number; y: number };

export async function loadBookArt(): Promise<Art> {
  const files = {
    desk: 'pixel-book/desk.webp', spread: 'pixel-book/spread.webp', cover: 'book-cover.webp',
    bookmark: 'pixel-book/bookmark.webp',
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

export function surface(scale: number, canvas = document.createElement('canvas')) {
  canvas.width = Math.round(WIDTH * scale);
  canvas.height = Math.round(HEIGHT * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(canvas.width / WIDTH, canvas.height / HEIGHT);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

const chapterFrames = [
  ['shore', 'shore', 0],
  ['tree2', 'tree2', 5],
  ['kallak-room', 'room', 0],
  ['kallak-writing', 'writing', 14],
] as const;

export async function loadChapterFrame(chapter: number) {
  const [file, name, index] = chapterFrames[chapter];
  const pack = await loadScenePack(withBase('assets/packs/' + file + '.kyr.gz'));
  const clip = pack.clips[name];
  if (!clip) throw new Error('Original chapter artwork is missing');
  const image = buildIndexedCanvas(clip, new IndexedClip(pack, clip).frame(Math.min(index, clip.frames.length - 1)));
  return file === 'kallak-room' ? cropFrame(image, ROOM_ART) : image;
}

export function cropFrame(source: HTMLCanvasElement | HTMLImageElement, bounds: Rect) {
  const image = document.createElement('canvas');
  image.width = bounds.w;
  image.height = bounds.h;
  image.getContext('2d')!.drawImage(source, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
  return image;
}

// Turn the original scene into a four-tone print. In the margins the real paper shows through.
export function printPicture(source: HTMLImageElement | HTMLCanvasElement, width: number, height: number, focus?: Point) {
  const print = document.createElement('canvas');
  print.width = width;
  print.height = height;
  const ctx = print.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  photo(ctx, source, { x: 0, y: 0, w: width, h: height }, focus);
  const image = ctx.getImageData(0, 0, width, height), pixels = image.data;
  const tone = new Uint8Array(width * height);
  let low = 255, high = 0;
  for (let i = 0; i < tone.length; i++) {
    const v = Math.round(pixels[i * 4] * .299 + pixels[i * 4 + 1] * .587 + pixels[i * 4 + 2] * .114);
    tone[i] = v;
    low = Math.min(low, v);
    high = Math.max(high, v);
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, d = i * 4;
    const value = tone[i], normalized = clamp((value - low) / Math.max(80, high - low));
    const edge = Math.abs(value - (tone[i - 1] ?? value)) + Math.abs(value - (tone[i - width] ?? value));
    const wash = Math.round((1 - normalized) * 4) / 4;
    const margin = Math.min(x, y, width - x - 1, height - y - 1);
    const feather = clamp((margin - ((x * 13 + y * 17) % 7) / 4) / 5);
    pixels[d] = 58; pixels[d + 1] = 39; pixels[d + 2] = 28;
    pixels[d + 3] = Math.round((wash * 196 + Math.min(59, edge)) * feather);
  }
  ctx.putImageData(image, 0, 0);
  return print;
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
  align: CanvasTextAlign = 'left', font = 'Georgia, serif', width = 200) {
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
  const glow = ctx.createRadialGradient(61, 73, 3, 61, 73, 112);
  glow.addColorStop(0, `rgba(255,180,78,${.13 + flicker * .026})`);
  glow.addColorStop(1, '#f0913500');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 176, 186);
  ctx.fillStyle = '#ffdc8b';
  ctx.fillRect(61 + Math.round(flicker), 66 + Math.round(flicker), 2, 7 - Math.round(flicker));
  ctx.fillStyle = '#fff0be';
  ctx.fillRect(60, 71, 2, 4);
  for (let i = 0; i < 5; i++) {
    const phase = ((time / 2800 + i * .183) % 1);
    const x = 49 + i * 6 + Math.round(Math.sin(phase * 7 + i) * 6);
    const y = 70 - Math.round(phase * 24);
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
  const hinge = WIDTH / 2, width = 192, top = SPREAD.y + 15, height = SPREAD.h - 31;
  const angle = progress * Math.PI, face = Math.cos(angle), arch = Math.sin(angle);
  const side = forward ? 1 : -1;
  const sourceSide = face >= 0 ? side : -side;
  const source = face >= 0 ? outgoing : incoming;
  const sx = source.width / WIDTH, sy = source.height / HEIGHT;
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
    ctx.drawImage(source, src * sx, top * sy, 4 * sx, height * sy, x, top - shift, destWidth, height + shift * 2);
    ctx.fillStyle = `rgba(250,193,110,${arch * (.06 + u * .16)})`;
    ctx.fillRect(x, top - shift, destWidth, height + shift * 2);
  }
  ctx.fillStyle = '#a37a48';
  ctx.fillRect(hinge + Math.round(direction * width * Math.abs(face)), top - Math.round(arch * 9), 1, height + Math.round(arch * 18));
}
