import { BRANDON_WALK_DOWN, BRANDON_WALK_SIDE, BRANDON_WALK_UP } from "../characters/brandonFrames";

export function getSequence(dir: "left" | "right" | "up" | "down") {
  if (dir === "up") return BRANDON_WALK_UP;
  if (dir === "down") return BRANDON_WALK_DOWN;
  return BRANDON_WALK_SIDE;
}

export function getIdleFrame(_dir: "left" | "right" | "up" | "down") {
  return 0; // Original standing shape 7.
}

export function pickDirection(
  dx: number,
  dy: number,
  prev: "left" | "right" | "up" | "down"
) {
  if (dx !== 0) return dx > 0 ? "right" : "left";
  if (dy !== 0) return dy > 0 ? "down" : "up";
  return prev;
}
