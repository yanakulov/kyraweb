import type { Vec2 } from "../core/types";

export type IndexedIntroTrack = {
  src: string; clip: string; indices: number[]; frameTimesMs: number[];
  pos: Vec2; loopMs?: number;
};
export type IntroStep = {
  id: string;
  durationMs: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  bgSrc?: string;
  overlaySrc?: string;
  overlayPos?: Vec2;
  textLines?: string[];
  footerText?: string;
  footerTextY?: number;
  subtitles?: IntroSubtitle[];
  frames?: {
    src: string[];
    frameDurationMs: number;
    frameTimesMs?: number[];
    loop?: boolean;
    pos?: Vec2;
  };
  indexedFrames?: IndexedIntroTrack;
  indexedBgFrames?: IndexedIntroTrack;
  bgFrames?: {
    src: string[];
    frameDurationMs: number;
    loop?: boolean;
    pos?: Vec2;
  };
  overlayFrames?: {
    src: string[];
    frameDurationMs: number;
    frameTimesMs?: number[];
    positions?: Vec2[];
    loop?: boolean;
    pos?: Vec2;
    holdLast?: boolean;
    oscillateX?: { amplitude: number; periodMs: number };
  };
  sceneAnim?: {
    metaSrc: string;
    shapesSrc?: string;
    shapesPack?: { src: string; clip: string };
    animIndices?: number[];
  };
  demoLoopRange?: {
    startMs: number;
    endMs: number;
    resumeMs: number;
  };
  scroll?: {
    topSrc: string;
    bottomSrc: string;
    distance: number;
  };
  scrollIntro?: {
    baseSrc: string;
    bottomSrc: string;
    distance: number;
    baseY: number;
    baseHeight: number;
    bottomSrcY: number;
  };
  scrollSlices?: {
    topSrc: string;
    bottomSrc: string;
    topSlice: { x: number; y: number; w: number; h: number };
    bottomSlice: { x: number; y: number; w: number; h: number };
    distance: number;
    baseY: number;
  };
};

export type IntroPlayback = {
  skipLine: () => void;
  skip: () => void;
  stop: () => void;
  setDemoLoopStep: (id: string | null) => void;
  exitDemoLoop: () => void;
  done: Promise<void>;
};

export type IntroSubtitle = {
  startMs: number;
  endMs: number;
  text: string;
  x?: number;
  y: number;
  align?: CanvasTextAlign;
  maxWidth?: number;
  type?: "text" | "talk";
  color?: string;
};
