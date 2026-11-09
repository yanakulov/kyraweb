import { ROOM_ART } from '../core/constants';
import type { IndexedClip } from '../resources/scenePack';

const sine = Float32Array.from({ length: 256 }, (_, i) => Math.sin(i * Math.PI / 128));
const wave = (phase: number) => sine[phase & 255];

export function createCoastSky(clip: IndexedClip) {
  const source = clip.frame(0), palette = clip.info.palette;
  const { width } = clip.info;
  const sky = new Uint8Array(width * 38), points: number[] = [];
  for (let y = ROOM_ART.y; y < 38; y++) {
    for (let x = ROOM_ART.x; x < ROOM_ART.x + ROOM_ART.w; x++) {
      const at = y * width + x, color = source[at] * 3;
      const r = palette[color], g = palette[color + 1], b = palette[color + 2];
      if (g <= 96 || b <= 96 || g <= r + 48) continue;
      sky[at] = 1;
      points.push(at);
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 38;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(width, 38);
  let rendered = -1;
  return (timeMs: number, colors: readonly number[]) => {
    const tick = Math.floor(timeMs / 100);
    if (tick === rendered) return canvas;
    rendered = tick;
    const shift = Math.round(wave(tick) * 4);
    for (const at of points) {
      const x = at % width, y = Math.floor(at / width);
      const cloud = at + (y >= 22 && y <= 33 ? shift : 0);
      const p = source[sky[cloud] ? cloud : at] * 3, out = at * 4;
      const haze = Math.max(0, wave(x * 2 - tick * 2 + y * 3) * wave(y * 17 + x * 0.7) - 0.27);
      image.data[out] = colors[p] + haze * 21;
      image.data[out + 1] = colors[p + 1] + haze * 14;
      image.data[out + 2] = colors[p + 2] + haze * 15;
      image.data[out + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  };
}
