import { decodeBase64Bytes } from "./assets";
import type { SceneShapesData, SceneSpriteDef } from "./types";

export function buildSceneShapesCanvas(data: SceneShapesData): HTMLCanvasElement {
  const width = data.width;
  const height = data.height;
  if (!width || !height || !data.rawBase64) {
    throw new Error("Scene shapes data is invalid");
  }
  const pixels = decodeBase64Bytes(data.rawBase64);
  const palette = data.palette;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  const imageData = ctx.createImageData(width, height);
  const dst = imageData.data;

  for (let i = 0; i < width * height; i++) {
    const idx = pixels[i] ?? 0;
    const palIndex = idx * 3;
    const r = palette[palIndex] ?? 0;
    const g = palette[palIndex + 1] ?? 0;
    const b = palette[palIndex + 2] ?? 0;
    const out = i * 4;
    dst[out] = r;
    dst[out + 1] = g;
    dst[out + 2] = b;
    dst[out + 3] = idx === 0 ? 0 : 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function buildSpriteDefMap(defs: SceneSpriteDef[]) {
  const map = new Map<number, SceneSpriteDef>();
  for (const def of defs) {
    map.set(def.id, def);
  }
  return map;
}

export function drawSceneAnimShapes(
  ctx: CanvasRenderingContext2D,
  bg: CanvasImageSource,
  spriteDefMap: Map<number, SceneSpriteDef>,
  shapes: { shape: number; x: number; y: number; flags: number }[]
) {
  for (const shape of shapes) {
    const def = spriteDefMap.get(shape.shape);
    if (!def) continue;
    const flip = shape.flags !== 0;
    if (flip) {
      ctx.save();
      ctx.translate(shape.x + def.w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(bg, def.x, def.y, def.w, def.h, 0, shape.y, def.w, def.h);
      ctx.restore();
    } else {
      ctx.drawImage(bg, def.x, def.y, def.w, def.h, shape.x, shape.y, def.w, def.h);
    }
  }
}
