import { BRANDON_WALK_DOWN, BRANDON_WALK_SIDE, BRANDON_WALK_UP } from "./brandonFrames";

export function getSequence(dir: "left" | "right" | "up" | "down") {
  if (dir === "up") return BRANDON_WALK_DOWN;
  if (dir === "down") return BRANDON_WALK_UP;
  return BRANDON_WALK_SIDE;
}

export function getIdleFrame(dir: "left" | "right" | "up" | "down") {
  return BRANDON_WALK_SIDE[0];
}

export function pickDirection(
  dx: number,
  dy: number,
  prev: "left" | "right" | "up" | "down"
) {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const preferHorizontal = prev === "left" || prev === "right";
  const hysteresis = 1;

  if (absX > 0.5 && absY > 0.5) {
    if (preferHorizontal) {
      if (absY > absX + hysteresis) return dy >= 0 ? "down" : "up";
      return dx >= 0 ? "right" : "left";
    }
    if (absX > absY + hysteresis) return dx >= 0 ? "right" : "left";
    return dy >= 0 ? "down" : "up";
  }

  if (absX >= absY) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}
