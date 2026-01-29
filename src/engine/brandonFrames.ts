import data from "./data/brandonShapes.json";

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

// Basic walk sequences from the sheet
export const BRANDON_WALK_SIDE = [0, 1, 2, 3, 4, 5, 4, 3];
export const BRANDON_WALK_UP = [23, 24, 25, 26, 27, 28, 27, 26];
export const BRANDON_WALK_DOWN = [29, 30, 31, 32, 33, 34, 33, 32];
