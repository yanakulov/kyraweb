import { BRANDON_FRAMES } from "../brandonFrames";
import type { SceneConfig, Vec2 } from "../types";

// Approximate walkable floor area for Kalak's Place.
// Replace with a real mask from the original .MSC when available.
const WALK_POLYGON: Vec2[] = [
  { x: 16, y: 104 },
  { x: 92, y: 92 },
  { x: 228, y: 92 },
  { x: 304, y: 104 },
  { x: 304, y: 135 },
  { x: 16, y: 135 }
];

export const gemCutScene: SceneConfig = {
  name: "Kalak's Place",
  bgSrc: "/assets/backgrounds/kalaks_place/gemcut.png",
  brSrc: "/assets/characters/brandon/brandon.png",
  uiOverlaySrc: "/assets/interface/HUD/main15.png",
  maskSrc: "/assets/masks/GEMCUT.json",
  sceneMetaSrc: "/assets/scenes/dat/GEMCUT.json",
  sceneEmcSrc: "/assets/scenes/emc/GEMCUT.json",
  sceneShapesSrc: "/assets/scenes/cps/GEMCUT.json",
  uiMaskY: 136,
  walkPolygon: WALK_POLYGON,
  frames: BRANDON_FRAMES,
  debugWalkMask: false,
  overlays: [
    { id: "letter", shape: 10, x: 213, y: 81, replaceShape: 11 },
    { id: "saw", shape: 5, x: 249, y: 93, replaceShape: 6 }
  ],
  items: [{ id: "ruby", x: 245, y: 85 }]
};
