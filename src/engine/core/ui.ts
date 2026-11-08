import type { MaskData, Vec2 } from "./types";
import { getMaskValue } from "../scene/masks";

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
  ctx.font = "8px \"Kyrandia\", monospace";
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

const statusFont = '8px "Kyrandia", "Segoe UI", sans-serif';
let statusBitmap: { text: string; width: number; image: HTMLCanvasElement } | undefined;

function labelWidth(ctx: CanvasRenderingContext2D, text: string) {
  let width = 0;
  for (const letter of text) width += Math.ceil(ctx.measureText(letter).width) + 1;
  return Math.max(0, width - 1);
}

function paintLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  ctx.save();
  const width = labelWidth(ctx, text);
  ctx.translate(x, y);
  if (width > maxWidth) ctx.scale(maxWidth / width, 1);
  let offset = 0;
  for (const letter of text) {
    ctx.fillText(letter, offset, 0);
    offset += Math.ceil(ctx.measureText(letter).width) + 1;
  }
  ctx.restore();
}

function drawPixelLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number) {
  text = text.normalize('NFC');
  if (typeof document !== 'undefined' && document.fonts?.check(statusFont, text)) {
    if (statusBitmap?.text !== text || statusBitmap.width !== width) {
      const image = document.createElement('canvas');
      image.width = width;
      image.height = 11;
      const pixels = image.getContext('2d')!;
      pixels.font = statusFont;
      pixels.textBaseline = 'top';
      pixels.fillStyle = '#fff';
      paintLabel(pixels, text, 0, 0, width);
      const glyphs = pixels.getImageData(0, 0, image.width, image.height);
      for (let i = 3; i < glyphs.data.length; i += 4) glyphs.data[i] = glyphs.data[i] >= 112 ? 255 : 0;
      pixels.putImageData(glyphs, 0, 0);
      statusBitmap = { text, width, image };
    }
    ctx.save();
    ctx.shadowColor = '#1a1010';
    ctx.shadowOffsetX = ctx.shadowOffsetY = 1;
    ctx.drawImage(statusBitmap.image, x, y);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.font = statusFont;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  paintLabel(ctx, text, x + 1, y + 1, width);
  ctx.fillStyle = "#ffffff";
  paintLabel(ctx, text, x, y, width);
  ctx.restore();
}

export function drawStatusLine(ctx: CanvasRenderingContext2D, text: string, y: number, width: number, x = 8) {
  drawPixelLabel(ctx, text, x, y, width - x - 10);
}

export function drawInventoryTooltip(ctx: CanvasRenderingContext2D, text: string,
  anchor: { x: number; top: number; bottom: number }, bounds: { x: number; y: number; w: number; h: number },
  surface?: HTMLCanvasElement) {
  const font = '6.5px Tahoma, "Segoe UI", sans-serif';
  ctx.save(); ctx.font = font;
  const width = Math.min(bounds.w - 4, Math.ceil(ctx.measureText(text).width) + 8), height = 11;
  ctx.restore();
  const x = Math.round(Math.max(bounds.x + 2, Math.min(anchor.x - width / 2, bounds.x + bounds.w - width - 2)));
  const above = Math.floor(anchor.top - height - 2);
  const y = Math.max(bounds.y + 2, Math.min(bounds.y + bounds.h - height - 2,
    above >= bounds.y + 2 ? above : Math.ceil(anchor.bottom + 2)));
  const overlay = surface?.getContext('2d');
  const target = overlay ?? ctx;
  if (surface && overlay) {
    const rect = ctx.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const sx = rect.width / ctx.canvas.width, sy = rect.height / ctx.canvas.height;
    const pixelWidth = Math.max(1, Math.round(width * sx * dpr));
    const pixelHeight = Math.max(1, Math.round(height * sy * dpr));
    if (surface.width !== pixelWidth) surface.width = pixelWidth;
    if (surface.height !== pixelHeight) surface.height = pixelHeight;
    surface.style.left = `${Math.round((rect.left + x * sx) * dpr) / dpr - rect.left}px`;
    surface.style.top = `${Math.round((rect.top + y * sy) * dpr) / dpr - rect.top}px`;
    surface.style.width = `${pixelWidth / dpr}px`;
    surface.style.height = `${pixelHeight / dpr}px`;
    overlay.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
  }
  target.save();
  if (!overlay) target.translate(x, y);
  target.fillStyle = '#927c57'; target.fillRect(0, 0, width, height);
  target.fillStyle = '#191820'; target.fillRect(1, 1, width - 2, height - 2);
  target.font = font;
  target.textBaseline = 'middle';
  target.textAlign = 'center';
  target.fillStyle = '#f1e4c5';
  target.fillText(text, width / 2, height / 2, width - 6);
  target.restore();
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
