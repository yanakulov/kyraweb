import { LOGICAL_HEIGHT, LOGICAL_WIDTH, WALK_PAD_X, WALK_PAD_Y } from "../core/constants";
import type { MaskData, SceneConfig, Vec2 } from "../core/types";

export function buildMaskCanvas(mask: MaskData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  const imageData = ctx.createImageData(mask.width, mask.height);
  const data = imageData.data;

  for (let i = 0; i < mask.pixels.length; i++) {
    const value = mask.pixels[i] ?? 0;
    const walkable = (value & 0x80) === 0;
    const idx = i * 4;
    if (walkable) {
      data[idx] = 40;
      data[idx + 1] = 180;
      data[idx + 2] = 80;
      data[idx + 3] = 255;
    } else {
      data[idx] = 220;
      data[idx + 1] = 40;
      data[idx + 2] = 40;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function getMaskValue(mask: MaskData, x: number, y: number) {
  const ix = Math.max(0, Math.min(mask.width - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(mask.height - 1, Math.floor(y)));
  return mask.pixels[iy * mask.width + ix] ?? 0;
}

export function resolveActorLayer(pos: Vec2, drawLayerTable: number[] | null, mask: MaskData | null) {
  if (drawLayerTable && drawLayerTable.length > 0) {
    return getDrawLayerFromTable(pos.y, drawLayerTable);
  }
  if (mask) {
    return getDrawLayer(mask, pos.x, pos.y);
  }
  return 1;
}

export function getDrawLayer(mask: MaskData, x: number, y: number) {
  const baseX = Math.floor(x - 8);
  const baseY = Math.floor(y - 1);
  let layer = 1;
  for (let dx = 0; dx < 16; dx++) {
    const ix = Math.max(0, Math.min(mask.width - 1, baseX + dx));
    const iy = Math.max(0, Math.min(mask.height - 1, baseY));
    const value = mask.pixels[iy * mask.width + ix] ?? 0;
    const cur = value & 0x07;
    if (cur > layer) layer = cur;
    if (layer >= 7) return 7;
  }
  return layer;
}

export function getDrawLayerFromTable(y: number, table: number[]) {
  let returnValue = 0;
  for (let i = 0; i < table.length; i++) {
    const temp = table[i] ?? 0;
    if (temp && temp <= y) returnValue = i;
  }
  if (returnValue <= 0) return 1;
  if (returnValue >= 7) return 6;
  return returnValue;
}

export function buildForegroundFrame(bg: HTMLImageElement, mask: MaskData, actorLayer: number): HTMLCanvasElement {
  const bgData = getImageData(bg);
  const bgPixels = bgData.data;

  const canvas = document.createElement("canvas");
  canvas.width = bg.width;
  canvas.height = bg.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  const imageData = ctx.createImageData(bg.width, bg.height);
  const data = imageData.data;

  const width = Math.min(bg.width, mask.width);
  const height = Math.min(bg.height, mask.height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const maskValue = mask.pixels[y * mask.width + x] ?? 0;
      const layer = maskValue & 0x07;
      const idx = (y * bg.width + x) * 4;
      if (layer > actorLayer) {
        data[idx] = bgPixels[idx];
        data[idx + 1] = bgPixels[idx + 1];
        data[idx + 2] = bgPixels[idx + 2];
        data[idx + 3] = 255;
      } else {
        data[idx + 3] = 0;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function isWalkable(point: Vec2, scene: SceneConfig, mask: MaskData | null) {
  if (point.x < WALK_PAD_X || point.x > LOGICAL_WIDTH - 1 - WALK_PAD_X) return false;
  if (point.y < WALK_PAD_Y || point.y >= scene.uiMaskY - WALK_PAD_Y) return false;
  if (mask) {
    const x = Math.max(WALK_PAD_X, Math.min(mask.width - 1 - WALK_PAD_X, Math.floor(point.x)));
    const y = Math.max(WALK_PAD_Y, Math.min(mask.height - 1 - WALK_PAD_Y, Math.floor(point.y)));
    if (y >= mask.height) return false;
    const value = mask.pixels[y * mask.width + x] ?? 0;
    return (value & 0x80) === 0;
  }
  if (!scene.walkPolygon) return true;
  return pointInPolygon(point, scene.walkPolygon);
}

export function clampTarget(from: Vec2, to: Vec2, scene: SceneConfig, mask: MaskData | null): Vec2 | null {
  const dest = {
    x: Math.max(0, Math.min(LOGICAL_WIDTH - 1, to.x)),
    y: Math.max(0, Math.min(LOGICAL_HEIGHT - 1, to.y))
  };

  if (isWalkable(dest, scene, mask)) return dest;

  const dx = dest.x - from.x;
  const dy = dest.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return null;

  const steps = Math.ceil(dist);
  let last = { ...from };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = { x: from.x + dx * t, y: from.y + dy * t };
    if (isWalkable(p, scene, mask)) {
      last = p;
    } else {
      break;
    }
  }
  return isWalkable(last, scene, mask) ? last : null;
}

function pointInPolygon(point: Vec2, polygon: Vec2[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
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
