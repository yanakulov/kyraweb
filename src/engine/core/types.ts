import type { Frame } from "../characters/brandonFrames";

export type Vec2 = { x: number; y: number };

export type GameConfig = {
  scene: SceneConfig;
  world?: string;
  signal?: AbortSignal;
  backgroundPack?: import("../resources/scenePack").ScenePack;
  entry?: Vec2 & { facing: number };
  resume?: RoomSnapshot;
  playOpening?: boolean;
  entryActions?: import("../gameplay/roomScript").RoomAction[];
  setupActions?: import("../gameplay/roomScript").RoomAction[];
  onInteract?: (point: Vec2, snapshot: RoomSnapshot) => import("../gameplay/roomScript").RoomAction[] | null;
  onScriptAction?: (action: import("../gameplay/roomScript").RoomAction) => void;
  onDeath?:()=>void;
  onContinueChange?: (waiting: boolean) => void;
  npcFrames?: Record<number, { xOffset: number; yOffset: number }>;
  amulet?: boolean;
  portals?: RoomPortal[];
  onExit?: (portal: RoomPortal) => void;
  onLoadingChange?: (loading: boolean) => void;
  onLocationChange?: (name: string, id?: number) => void;
  onNavigationError?: (message: string) => void;
  onSubtitleChange?: (lines: import("../intro/types").IntroSubtitle[]) => void;
  onSequenceChange?: (active: boolean) => void;
};

export type RoomPortal = { id: string; target: number; side: "north" | "east" | "south" | "west";
  rect: { x: number; y: number; w: number; h: number }; point: Vec2; entry?: Vec2 | null };
export type RoomSnapshot = { pos: Vec2; facing?: number; inventorySlots: (InventoryItemId | null)[]; itemInHand: InventoryItemId | null;
  sceneItems: SceneItem[]; overlays: SceneOverlayState[]; treeSpoken: boolean };

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
  visible: boolean;
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
  lastRefresh: number;
  loopsLeft: number;
  loopStart: number;
};

export type InventoryItemId = "letter" | "ruby" | "saw" | "apple" | "appleEaten" | "rose" | "silverRose" | "marble" | "teardrop" | `item-${number}`;

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
  destX: number;
  destY: number;
  path: Vec2[];
  elapsedMs: number;
};

export type SceneConfig = {
  name: string;
  actorScale?: { fromY: number; fromScale: number; toY: number; toScale: number };
  opening?: { pack: string; script: string };
  indexedBackground?: { src: string; clip: string };
  indexedUi?: { src: string; clip: string };
  maskClip?: string;
  meta?: SceneMeta;
  emc?: SceneEmc;
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
