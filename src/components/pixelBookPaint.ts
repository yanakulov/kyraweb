import { withBase } from '../engine/core/assets';
import { IndexedClip, loadScenePack } from '../engine/resources/scenePack';
import { buildIndexedCanvas } from '../engine/rendering/indexedRenderer';
import { ROOM_ART } from '../engine/core/constants';

export const WIDTH = 640, HEIGHT = 360;
export const BOOK_RESOLUTION = 1.5;
export const SPREAD = { x: 49, y: 25, w: 542, h: 310 };
export const COVER = { x: 213, y: 13, w: 214, h: 270 };
// Inside the painted vine border on the right leaf.
export const ILLUSTRATION = { x: 341, y: 69, w: 179, h: 199 };
export const CHAPTER_FOCUS = [{ x: .44, y: .5 }, { x: .5, y: .5 }, { x: .54, y: .5 }, { x: .58, y: .5 }];
export const RUBRIC = '#e5b97a', INK = '#e9d0ae', MUTED = '#b79674', FOIL = '#f1d198';
export type Rect = { x: number; y: number; w: number; h: number };
export type Art = Record<'desk' | 'spread' | 'cover' | 'retail' | 'title' | 'bookmark' | 'tabIcons' | 'modern' | 'classic' | 'studio' | 'scroll', HTMLImageElement>;
type Point = { x: number; y: number };

export async function loadBookArt(): Promise<Art> {
  const files = {
    desk: 'pixel-book/desk.webp', spread: 'pixel-book/spread.webp', cover: 'pixel-book/cover.webp', retail: 'book-cover.webp', title: 'kyrandia-title.webp',
    bookmark: 'pixel-book/bookmark.webp', tabIcons: 'pixel-book/bookmark-icons.png', scroll: 'pixel-book/scroll.webp',
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

export function surface(canvas = document.createElement('canvas'), view: Rect = { x: 0, y: 0, w: WIDTH, h: HEIGHT }) {
  canvas.width = Math.round(view.w * BOOK_RESOLUTION);
  canvas.height = Math.round(view.h * BOOK_RESOLUTION);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(BOOK_RESOLUTION, 0, 0, BOOK_RESOLUTION, -view.x * BOOK_RESOLUTION, -view.y * BOOK_RESOLUTION);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export function coverBoard(art: Art) {
  const canvas = document.createElement('canvas');
  canvas.width = art.cover.width;
  canvas.height = art.cover.height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art.cover, 0, 0);
  ctx.drawImage(art.title, 41, 35, 154, 51);
  const panel = { x: 51, y: 100, w: 134, h: 96 };
  // The retail title is on the plate above. Use the illustration below its printed title block.
  frame(ctx, panel, true);
  ctx.drawImage(art.retail, 74, 249, 362, 259, panel.x, panel.y, panel.w, panel.h);
  ctx.fillStyle = '#4b160b18';
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  return canvas;
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

// Ink density follows the original luminance; crossing strokes accumulate in the shadows.
export function printPicture(source: HTMLImageElement | HTMLCanvasElement, width: number, height: number, focus?: Point) {
  const print = document.createElement('canvas');
  print.width = width;
  print.height = height;
  const ctx = print.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  photo(ctx, source, { x: 0, y: 0, w: width, h: height }, focus);
  const image = ctx.getImageData(0, 0, width, height), pixels = image.data;
  const light = new Float32Array(width * height);
  for (let i = 0; i < light.length; i++) {
    light[i] = (pixels[i * 4] * .299 + pixels[i * 4 + 1] * .587 + pixels[i * 4 + 2] * .114) / 255;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, d = i * 4, tone = light[i];
    const edge = Math.abs(tone - light[i + Number(x < width - 1)])
      + Math.abs(tone - light[i + (y < height - 1 ? width : 0)]);
    const hatch = (x + y) % 5 === 0 ? clamp((.82 - tone) * 2) * .13 : 0;
    const cross = (x - y) % 7 === 0 ? clamp((.36 - tone) * 3) * .08 : 0;
    const grain = ((x * 13 + y * 17 + x * y * 3) % 17) - 8;
    const ink = clamp(Math.pow(tone, .68) - hatch - cross - edge * .22 + grain / 450);
    pixels[d] = 48 + ink * 199;
    pixels[d + 1] = 25 + ink * 166;
    pixels[d + 2] = 17 + ink * 117;
    const margin = Math.min(x, y, width - x - 1, height - y - 1);
    pixels[d + 3] *= ease((margin + grain / 2) / 27);
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

// Tile the leather grain instead of stretching the old narrow bookmark sprite.
export function bookmarkRibbon(ctx: CanvasRenderingContext2D, texture: HTMLCanvasElement, r: Rect,
  selected: boolean, hot: boolean, vertical = false) {
  const { x, y, w, h } = r;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  if (vertical) {
    ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w / 2, y + h - 6); ctx.lineTo(x, y + h);
  } else {
    ctx.lineTo(x + w, y); ctx.lineTo(x + w - 5, y + h / 2);
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
  }
  ctx.closePath();
  ctx.shadowColor = '#100807a0'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#30231d'; ctx.fill();
  ctx.shadowBlur = ctx.shadowOffsetY = 0;
  ctx.clip();
  for (let ty = y; ty < y + h; ty += 8) for (let tx = x; tx < x + w; tx += 24) {
    ctx.drawImage(texture, 8, 6, 24, 8, tx, ty, 24, 8);
  }
  ctx.fillStyle = selected ? '#cf9d4930' : hot ? '#e9c89112' : '#130d134c';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = selected || hot ? '#e6c085' : '#987146';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([1, 2]);
  ctx.strokeStyle = selected ? '#e6c0859c' : '#bd975563';
  ctx.strokeRect(x + 3.5, y + 3.5, w - 10, h - 7);
  ctx.restore();
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
  if (!image.width || !image.height) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  pixels(ctx, image, photoBounds(image, r, focus, contain));
  ctx.restore();
}

export function photoBounds(image: { width: number; height: number }, r: Rect, focus?: Point, contain = false): Rect {
  const width = image.width, height = image.height;
  const scale = (contain ? Math.min : Math.max)(r.w / width, r.h / height);
  const w = width * scale, h = height * scale;
  const x = contain ? (r.w - w) / 2 : Math.max(r.w - w, Math.min(0, r.w / 2 - w * (focus?.x ?? .5)));
  const y = contain ? (r.h - h) / 2 : Math.max(r.h - h, Math.min(0, r.h / 2 - h * (1 - (focus?.y ?? .5))));
  return { x: r.x + x, y: r.y + y, w, h };
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
  align: CanvasTextAlign = 'left', font = 'Georgia, serif', width = 200, weight = 400, shadow = '#160e0b') {
  ctx.font = `${weight} ${size}px ${font}`;
  const minimum = Math.min(size, 9);
  while (size > minimum && ctx.measureText(label).width > width) ctx.font = `${weight} ${--size}px ${font}`;
  if (ctx.measureText(label).width > width) {
    let end = label.length - 1;
    while (end > 0 && ctx.measureText(label.slice(0, end) + '…').width > width) end--;
    label = label.slice(0, end) + '…';
  }
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = shadow;
  ctx.fillText(label, x, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(label, x, y);
}

export function unroll(ctx: CanvasRenderingContext2D, sprite: HTMLImageElement, { x, y, w, h }: Rect, progress: number) {
  const roller = Math.round(h * .12);
  const spriteRoller = Math.round(sprite.height * .12);
  const opening = Math.round((h - roller * 2) * progress);
  const top = Math.round(y + (h - opening) / 2), bottom = top + opening;
  if (opening) ctx.drawImage(sprite, 0, spriteRoller, sprite.width, sprite.height - spriteRoller * 2, x, top, w, opening);
  ctx.drawImage(sprite, 0, 0, sprite.width, spriteRoller, x, top - roller, w, roller);
  ctx.drawImage(sprite, 0, sprite.height - spriteRoller, sprite.width, spriteRoller, x, bottom, w, roller);
}

export function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x - radius, y, radius * 2 + 1, 1);
  ctx.fillRect(x, y - radius, 1, radius * 2 + 1);
  ctx.fillStyle = '#ffebb0';
  ctx.fillRect(x, y, 1, 1);
}

export function buttonPlate(ctx: CanvasRenderingContext2D, { x, y, w, h }: Rect, hot: boolean,
  tone: 'green' | 'leather' | 'red', disabled = false) {
  const fill = ctx.createLinearGradient(x, y, x, y + h);
  const colors = disabled ? ['#48382d', '#48382d', '#2c211d']
    : tone === 'green' ? ['#344d42', '#476457', '#202e29']
    : tone === 'red' ? ['#5e3028', '#753e32', '#331d19']
    : ['#48302d', '#584039', '#2c1b1b'];
  fill.addColorStop(0, colors[hot ? 1 : 0]);
  fill.addColorStop(1, colors[2]);
  ctx.fillStyle = '#140909a8';
  ctx.fillRect(x + 3, y + 4, w - 5, h - 1);
  ctx.beginPath();
  ctx.moveTo(x + 5, y + .5);
  ctx.lineTo(x + w - 5, y + .5);
  ctx.lineTo(x + w - .5, y + 5);
  ctx.lineTo(x + w - .5, y + h - 5);
  ctx.lineTo(x + w - 5, y + h - .5);
  ctx.lineTo(x + 5, y + h - .5);
  ctx.lineTo(x + .5, y + h - 5);
  ctx.lineTo(x + .5, y + 5);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = disabled ? '#70553d' : hot ? '#f0ce8b' : '#b88752';
  ctx.stroke();
  ctx.strokeStyle = '#c1945f50';
  ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
}

export function desk(ctx: CanvasRenderingContext2D, art: Art, time: number, view: Rect, open: number) {
  const zoom = 1 + .27 * ease(open);
  // Keep the candle and the corner volumes clear of the opening page block.
  const focusX = WIDTH * .39, focusY = HEIGHT / 2;
  ctx.save();
  ctx.translate(focusX, focusY);
  ctx.scale(zoom, zoom);
  ctx.translate(-focusX, -focusY);
  ctx.drawImage(art.desk, view.x - 1, view.y - 1, view.w + 2, view.h + 2);
  const fx = Math.round(view.x + 34 * view.w / WIDTH), fy = Math.round(view.y + 48 * view.h / HEIGHT);
  const flame = Math.floor(time / 90);
  const flicker = Math.sin(flame * .85) + Math.sin(flame * 1.89);
  const glow = ctx.createRadialGradient(fx, fy, 3, fx, fy, 124);
  glow.addColorStop(0, `rgba(255,180,78,${.13 + flicker * .026})`);
  glow.addColorStop(1, '#f0913500');
  ctx.fillStyle = glow;
  ctx.fillRect(fx - 124, fy - 124, 248, 248);
  ctx.fillStyle = '#ffdc8b';
  ctx.fillRect(fx + Math.round(flicker), fy - 4 + Math.round(flicker), 2, 8 - Math.round(flicker));
  ctx.fillStyle = '#fff0be';
  ctx.fillRect(fx, fy + 2, 2, 4);
  for (let i = 0; i < 5; i++) {
    const phase = ((time / 2800 + i * .183) % 1);
    const x = fx - 7 + i * 7 + Math.round(Math.sin(phase * 7 + i) * 6);
    const y = fy - Math.round(phase * 24);
    ctx.globalAlpha = Math.sin(phase * Math.PI) * .58;
    ctx.fillStyle = i % 2 ? '#f0bf78' : '#ffdb95';
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

export function bookShadow(ctx: CanvasRenderingContext2D, r: Rect) {
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = '#08040926';
    ctx.beginPath();
    ctx.roundRect(r.x - i * 2, r.y + 8 + i, r.w + 2 + i * 4, r.h - 2, 18);
    ctx.fill();
  }
}

export function spreadLight(ctx: CanvasRenderingContext2D, now: number, { x, y, w, h }: Rect) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const light = ctx.createLinearGradient(x, y, x + w, y + h);
  light.addColorStop(0, `rgba(240,149,70,${.14 + .025 * Math.sin(Math.floor(now / 90))})`);
  light.addColorStop(.48, '#ed9b4100');
  light.addColorStop(1, '#12091042');
  ctx.fillStyle = light;
  ctx.fillRect(x, y, w, h);
  const spine = ctx.createLinearGradient(306, 0, 334, 0);
  spine.addColorStop(0, '#170e0a00');
  spine.addColorStop(.5, '#150a0866');
  spine.addColorStop(1, '#170e0a00');
  ctx.fillStyle = spine;
  ctx.fillRect(306, y + 5, 28, h - 14);
  ctx.restore();
}

// Strip projections keep the previous page's type and illustration attached to the turning leaf.
export function turnLeaf(ctx: CanvasRenderingContext2D, outgoing: HTMLCanvasElement, incoming: HTMLCanvasElement,
  progress: number, forward: boolean, book: Rect, view: Rect) {
  const hinge = WIDTH / 2, width = book.w / 2 - 38, top = book.y + book.h * .068, height = book.h * .84;
  const angle = progress * Math.PI, face = Math.cos(angle), arch = Math.sin(angle);
  const side = forward ? 1 : -1;
  const sourceSide = face >= 0 ? side : -side;
  const source = face >= 0 ? outgoing : incoming;
  const sx = source.width / view.w, sy = source.height / view.h;
  const direction = face >= 0 ? side : -side;
  // The old facing page stays down while the new sheet turns over it.
  const restingX = side === 1 ? hinge - width : hinge;
  ctx.drawImage(outgoing, (restingX - view.x) * sx, (top - view.y) * sy, width * sx, height * sy,
    restingX, top, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(hinge - width, top, width * 2, height);
  ctx.clip();
  ctx.fillStyle = `rgba(10,5,3,${arch * .42})`;
  ctx.fillRect(direction === 1 ? hinge : hinge - width, top, width, height);
  for (let offset = 0; offset < width; offset += 4) {
    const strip = Math.min(4, width - offset);
    const u = offset / width, bend = Math.sin(u * Math.PI) * arch;
    const dest = hinge + direction * Math.round(offset * Math.abs(face) + bend * 9);
    const destWidth = Math.max(1, Math.ceil(strip * Math.abs(face)) + 1);
    const shift = Math.round((bend * 14 + arch * 9) * u);
    const src = sourceSide === 1 ? hinge + offset : hinge - offset - strip;
    const x = direction === 1 ? dest : dest - destWidth;
    ctx.drawImage(source, (src - view.x) * sx, (top - view.y) * sy, strip * sx, height * sy, x, top - shift, destWidth, height + shift * 2);
    ctx.fillStyle = `rgba(61,29,16,${arch * (.06 + u * .13)})`;
    ctx.fillRect(x, top - shift, destWidth, height + shift * 2);
  }
  ctx.fillStyle = `rgba(59,31,19,${arch * .65})`;
  ctx.fillRect(hinge + Math.round(direction * width * Math.abs(face)), top - Math.round(arch * 9), 1, height + Math.round(arch * 18));
  ctx.restore();
}
