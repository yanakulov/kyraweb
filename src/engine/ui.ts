import type { MaskData, Vec2 } from "./types";
import { getMaskValue } from "./masks";

export function buildUiOverlay(image: HTMLImageElement) {
  const width = image.width;
  const height = image.height;
  const src = getImageData(image);
  const srcPixels = src.data;

  const data = new ImageData(width, height);
  const dstPixels = data.data;

  for (let i = 0; i < srcPixels.length; i += 4) {
    const r = srcPixels[i];
    const g = srcPixels[i + 1];
    const b = srcPixels[i + 2];
    const a = srcPixels[i + 3];
    dstPixels[i] = r;
    dstPixels[i + 1] = g;
    dstPixels[i + 2] = b;
    dstPixels[i + 3] = a;
    if (r === 0 && g === 0 && b === 0 && a === 255) {
      dstPixels[i + 3] = 0;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  ctx.putImageData(data, 0, 0);
  return canvas;
}

export function drawLayerDebug(
  ctx: CanvasRenderingContext2D,
  pointer: Vec2,
  mask: MaskData | null,
  actorLayer: number
) {
  const maskValue = mask ? getMaskValue(mask, pointer.x, pointer.y) : 0;
  const maskLayer = maskValue & 0x07;
  const blocked = (maskValue & 0x80) !== 0;
  const text =
    `x:${Math.round(pointer.x)} y:${Math.round(pointer.y)} ` +
    `mask:${maskValue} layer:${maskLayer} blocked:${blocked ? 1 : 0} actor:${actorLayer}`;

  ctx.save();
  ctx.font = "10px monospace";
  const padding = 4;
  const metrics = ctx.measureText(text);
  const width = Math.ceil(metrics.width) + padding * 2;
  const height = 16;
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(4, 4, width, height);
  ctx.fillStyle = "#f2e7cf";
  ctx.fillText(text, 4 + padding, 4 + height - 4);
  ctx.restore();
}

export function drawStatusLine(ctx: CanvasRenderingContext2D, text: string, y: number, width: number) {
  ctx.save();
  ctx.font = "10px \"Segoe UI\", Tahoma, Geneva, Verdana, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const x = 8;
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function getImageData(image: HTMLImageElement) {
  const temp = document.createElement("canvas");
  temp.width = image.width;
  temp.height = image.height;
  const tctx = temp.getContext("2d");
  if (!tctx) throw new Error("Canvas 2D context not available");
  tctx.drawImage(image, 0, 0);
  return tctx.getImageData(0, 0, image.width, image.height);
}
