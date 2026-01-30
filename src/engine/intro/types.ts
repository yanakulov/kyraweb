import type { Vec2 } from "../core/types";

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
  frames?: {
    src: string[];
    frameDurationMs: number;
    loop?: boolean;
    pos?: Vec2;
  };
  bgFrames?: {
    src: string[];
    frameDurationMs: number;
    loop?: boolean;
    pos?: Vec2;
  };
  overlayFrames?: {
    src: string[];
    frameDurationMs: number;
    loop?: boolean;
    pos?: Vec2;
    holdLast?: boolean;
    oscillateX?: { amplitude: number; periodMs: number };
  };
  sceneAnim?: {
    metaSrc: string;
    shapesSrc: string;
    animIndices?: number[];
  };
  demoLoopRange?: {
    start: number;
    end: number;
    resumeIndex: number;
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
  skip: () => void;
  stop: () => void;
  setDemoLoopStep: (id: string | null) => void;
  exitDemoLoop: () => void;
  done: Promise<void>;
};
