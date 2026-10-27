import data from "../data/brandonShapes.json";

export type Frame = {
  x: number;
  y: number;
  w: number;
  h: number;
  xOffset: number;
  yOffset: number;
  shapeIndex: number;
};

export const BRANDON_FRAMES: Frame[] = data.frames as Frame[];

// LoK shape numbers: side 8..14, north 35..40, south 29..34.
// Resolve through metadata: atlas indices are not original shape numbers.
const walkFrames = (first: number, last: number) =>
  Array.from({ length: last - first + 1 }, (_, i) => {
    const index = BRANDON_FRAMES.findIndex(frame => frame.shapeIndex === first + i);
    if (index < 0) throw new Error(`Missing Brandon shape ${first + i}`);
    return index;
  });
export const BRANDON_WALK_SIDE = walkFrames(8, 14);
export const BRANDON_WALK_UP = walkFrames(35, 40);
export const BRANDON_WALK_DOWN = walkFrames(29, 34);

// ScummVM timerUpdateHeadAnims: the head is a separate layer over body 16.
const TALK_HEADS = [4, 5, 4, 5, 4, 5, 0, 1, 4, 5, 4, 4, 6, 4, 8, 1, 9, 4];
export const brandonTalkHead = (elapsedMs: number) => 17 + TALK_HEADS[Math.floor(elapsedMs / (11 * 1000 / 60)) % TALK_HEADS.length];

export function actorScaleAt(y: number, scale?: { fromY: number; fromScale: number; toY: number; toScale: number }) {
  if (!scale) return 1;
  if (y <= scale.fromY) return scale.fromScale / 256;
  if (y >= scale.toY) return scale.toScale / 256;
  return (Math.trunc((y - scale.fromY) * (scale.toScale - scale.fromScale) / (scale.toY - scale.fromY)) + scale.fromScale) / 256;
}
