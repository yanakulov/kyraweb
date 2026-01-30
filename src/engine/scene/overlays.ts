import type { SceneOverlayConfig, SceneOverlayState, SceneSpriteDef } from "../core/types";

export function initSceneOverlays(overlays?: SceneOverlayConfig[]): SceneOverlayState[] {
  if (!overlays || !overlays.length) return [];
  return overlays.map((overlay) => ({
    id: overlay.id,
    shape: overlay.shape,
    x: overlay.x,
    y: overlay.y,
    flags: overlay.flags ?? 0,
    offsetX: overlay.offsetX ?? 0,
    offsetY: overlay.offsetY ?? 0,
    replaceShape: overlay.replaceShape,
    replaceX: overlay.replaceX,
    replaceY: overlay.replaceY,
    active: true,
    pickable: true
  }));
}

export function filterSceneAnimShapes(shapes: { shape: number; x: number; y: number }[], overlays: SceneOverlayState[]) {
  if (!overlays.length) return shapes;
  return shapes.filter(
    (shape) =>
      !overlays.some((overlay) => overlay.shape === shape.shape && overlay.x === shape.x && overlay.y === shape.y)
  );
}

export function findOverlayAt(
  point: { x: number; y: number },
  overlays: SceneOverlayState[],
  spriteDefMap: Map<number, SceneSpriteDef> | null
) {
  if (!spriteDefMap) return null;
  for (let i = overlays.length - 1; i >= 0; i--) {
    const overlay = overlays[i];
    if (!overlay.pickable) continue;
    const def = spriteDefMap.get(overlay.shape);
    if (!def) continue;
    const ox = overlay.x + overlay.offsetX;
    const oy = overlay.y + overlay.offsetY;
    if (point.x >= ox && point.x <= ox + def.w && point.y >= oy && point.y <= oy + def.h) {
      return overlay;
    }
  }
  return null;
}

export function drawSceneOverlays(
  ctx: CanvasRenderingContext2D,
  bg: CanvasImageSource,
  spriteDefMap: Map<number, SceneSpriteDef>,
  overlays: SceneOverlayState[]
) {
  for (const overlay of overlays) {
    if (!overlay.active) continue;
    const def = spriteDefMap.get(overlay.shape);
    if (!def) continue;
    const x = overlay.x + overlay.offsetX;
    const y = overlay.y + overlay.offsetY;
    const flip = overlay.flags !== 0;
    if (flip) {
      ctx.save();
      ctx.translate(x + def.w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(bg, def.x, def.y, def.w, def.h, 0, y, def.w, def.h);
      ctx.restore();
    } else {
      ctx.drawImage(bg, def.x, def.y, def.w, def.h, x, y, def.w, def.h);
    }
  }
}
