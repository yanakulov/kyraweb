import type { Frame } from "./brandonFrames";

export type Vec2 = { x: number; y: number };

export type GameConfig = {
  scene: SceneConfig;
};

export type MaskData = {
  width: number;
  height: number;
  pixels: number[];
};

export type SceneSpriteDef = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SceneAnimDef = {
  disable: boolean;
  drawY: number;
  defaultX: number;
  defaultY: number;
  sprite: number;
  flipX: boolean;
  play: boolean;
  script: number[];
};

export type SceneMeta = {
  drawLayerTable: number[];
  spriteDefs: SceneSpriteDef[];
  anims: SceneAnimDef[];
};

export type SceneShapesData = {
  width: number;
  height: number;
  palette: number[];
  rawBase64: string;
};

export type SceneEmc = {
  sceneAnimShapes: SceneAnimShape[];
};

export type SceneAnimShape = {
  shape: number;
  x: number;
  y: number;
  flags: number;
  page: number;
};

export type SceneOverlayConfig = {
  id: InventoryItemId;
  shape: number;
  x: number;
  y: number;
  flags?: number;
  offsetX?: number;
  offsetY?: number;
  replaceShape?: number;
  replaceX?: number;
  replaceY?: number;
};

export type SceneOverlayState = {
  id: InventoryItemId;
  shape: number;
  x: number;
  y: number;
  flags: number;
  offsetX: number;
  offsetY: number;
  replaceShape?: number;
  replaceX?: number;
  replaceY?: number;
  active: boolean;
  pickable: boolean;
};

export type SceneAnimState = {
  sprite: number;
  x: number;
  y: number;
  defaultX: number;
  defaultY: number;
  flipX: boolean;
  play: boolean;
  script: number[];
  ip: number;
  nextRun: number;
};

export type InventoryItemId = "letter" | "ruby" | "saw" | "apple" | "appleEaten";

export type InventoryItem = {
  id: InventoryItemId;
  name: string;
  statusName?: string;
  tileIndex: number;
};

export type InventorySlot = {
  x: number;
  y: number;
};

export type SceneItem = {
  id: InventoryItemId;
  x: number;
  y: number;
};

export type DropAnim = {
  id: InventoryItemId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  destX: number;
  destY: number;
  bounces: number;
  driftDir: number;
};

export type SceneConfig = {
  name: string;
  bgSrc: string;
  brSrc: string;
  uiOverlaySrc?: string;
  maskSrc?: string;
  sceneMetaSrc?: string;
  sceneEmcSrc?: string;
  sceneShapesSrc?: string;
  drawLayerTable?: number[];
  uiMaskY: number;
  walkPolygon?: Vec2[];
  frames: Frame[];
  debugWalkMask?: boolean;
  overlays?: SceneOverlayConfig[];
  items?: SceneItem[];
};
