import { BRANDON_WALK_DOWN, BRANDON_WALK_SIDE, BRANDON_WALK_UP } from "../characters/brandonFrames";
import type { Vec2 } from "../core/types";

const FACINGS = [7, 0, 1, 6, 4, 2, 5, 4, 3];

export function getSequence(dir: "left" | "right" | "up" | "down") {
  if (dir === "up") return BRANDON_WALK_UP;
  if (dir === "down") return BRANDON_WALK_DOWN;
  return BRANDON_WALK_SIDE;
}

export function getIdleFrame(_dir: "left" | "right" | "up" | "down") {
  return 0; // Original standing shape 7.
}

export function stepFacing(from: Vec2, to: Vec2) {
  const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
  return FACINGS[(dy + 1) * 3 + dx + 1];
}

export function facingDirection(facing: number) {
  return facing === 0 ? "up" : facing === 4 ? "down" : facing < 4 ? "right" : "left";
}
