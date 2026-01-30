import { withBase } from "../core/assets";
import { INTRO_TIMING_UNIT_MS, WESTWOOD_RLE, WESTWOOD_TOTAL_MS, KYRANDIA_RLE, KYRANDIA_TOTAL_MS, SCROLL_TOTAL_MS, SHORE_PRE_RLE, SHORE_PRE_TOTAL_MS, SHORE_POST_RLE, SHORE_POST_TOTAL_MS, DESTRUCT_RLE, DESTRUCT_TOTAL_MS, TREE1_RLE, TREE1_TOTAL_MS, TREE2_RLE, TREE2_TOTAL_MS, KALLAK_RLE, KALLAK_TOTAL_MS, HAND_RLE, HAND_TOTAL_MS } from "./introTiming";
import type { IntroStep } from "./types";

export function buildIntroSteps(): IntroStep[] {
  const logoFrameMs = INTRO_TIMING_UNIT_MS;
  const malcolmFrameTicks = 4;
  const shoreFrameMs = 120;
  const treeFrameMs = 120;
  const malcolmFrameMsFixed = 100;
  const storyFrameMs = 6000;
  const scrollMs = SCROLL_TOTAL_MS;
  const westwoodFrames = buildFrameList("assets/intro/frames/westwood", 23);
  const kyrandiaFrames = buildFrameList("assets/intro/frames/kyrandia", 30);
  const tree1Frames = buildFrameList("assets/intro/frames/tree1", 185);
  const tree2Frames = buildFrameList("assets/intro/frames/tree2", 20);
  const kallakFrames = buildFrameList("assets/intro/frames/kallak", 75);
  const malKalFrames = buildFrameList("assets/intro/frames/mal-kal", 325);
  const shoreFrames = buildFrameList("assets/intro/frames/shore", 12);
  const destructFrames = buildFrameList("assets/intro/frames/destruct", 44);
  const handFrames = buildLoopFrames(
    ["assets/intro/hand0.png", "assets/intro/hand1.png", "assets/intro/hand2.png", "assets/intro/hand1.png"],
    30
  );

  const buildSequenceFromRle = (frames: string[], rle: [number, number][]) =>
    rle.flatMap(([frameIndex, units]) => {
      const normalizedIndex = frameIndex % frames.length;
      const src = frames[normalizedIndex] ?? frames[0];
      return Array.from({ length: units }, () => src);
    });
  const rleUnits = (rle: [number, number][]) => rle.reduce((sum, [, units]) => sum + units, 0);
  const rleFrameMs = (totalMs: number, rle: [number, number][]) => totalMs / Math.max(1, rleUnits(rle));
  const malcolmFrameMs = logoFrameMs * malcolmFrameTicks;
  const handStopFrameIndex = 30;
  const frameIndexFromSrc = (src: string) => {
    const match = src.match(/(\d{4})\.png$/i);
    return match ? Number(match[1]) : 0;
  };

  const kallakSequence = buildSequenceFromRle(kallakFrames, KALLAK_RLE);
  const handSequence = buildSequenceFromRle(handFrames, HAND_RLE);
  const kallakHandSequence = kallakSequence.map((kallakSrc, i) => {
    if (frameIndexFromSrc(kallakSrc) >= handStopFrameIndex) return "";
    return handSequence[i % handSequence.length] ?? "";
  });

  return [
    {
      id: "westwood",
      durationMs: WESTWOOD_TOTAL_MS,
      fadeInMs: 0,
      fadeOutMs: 0,
      bgSrc: withBase("assets/intro/logo_bg.png"),
      frames: {
        src: buildSequenceFromRle(westwoodFrames, WESTWOOD_RLE),
        frameDurationMs: rleFrameMs(WESTWOOD_TOTAL_MS, WESTWOOD_RLE),
        loop: false,
        pos: { x: 0, y: 46 }
      }
    },
    {
      id: "kyrandia",
      durationMs: KYRANDIA_TOTAL_MS,
      fadeInMs: 0,
      fadeOutMs: 0,
      bgSrc: withBase("assets/intro/logo_bg.png"),
      footerText: "Copyright (c) 1992 Westwood Studios",
      footerTextY: 179,
      frames: {
        src: buildSequenceFromRle(kyrandiaFrames, KYRANDIA_RLE),
        frameDurationMs: rleFrameMs(KYRANDIA_TOTAL_MS, KYRANDIA_RLE),
        loop: false,
        pos: { x: 0, y: 46 }
      }
    },
    {
      id: "kyrandia_scroll",
      durationMs: scrollMs,
      scrollIntro: {
        baseSrc: withBase("assets/intro/scroll_bg.png"),
        bottomSrc: withBase("assets/intro/bottom.png"),
        distance: 112,
        baseY: 8,
        baseHeight: 168,
        bottomSrcY: 64
      }
    },
    {
      id: "story_text",
      durationMs: storyFrameMs,
      fadeInMs: 250,
      fadeOutMs: 250,
      bgSrc: withBase("assets/intro/text.png")
    },
    {
      id: "shore_anim",
      durationMs: shoreFrames.length * shoreFrameMs,
      fadeInMs: 200,
      fadeOutMs: 200,
      frames: {
        src: shoreFrames,
        frameDurationMs: shoreFrameMs,
        loop: true,
        pos: { x: 0, y: 8 }
      }
    },
    {
      id: "shore_destruct",
      durationMs: Math.max(
        shoreFrames.length * shoreFrameMs,
        destructFrames.length * shoreFrameMs * 2
      ),
      fadeInMs: 200,
      fadeOutMs: 200,
      bgFrames: {
        src: shoreFrames,
        frameDurationMs: shoreFrameMs,
        loop: true,
        pos: { x: 0, y: 8 }
      },
      frames: {
        src: destructFrames,
        frameDurationMs: shoreFrameMs * 2,
        loop: false,
        pos: { x: 152, y: 56 }
      }
    },
    {
      id: "tree_anim_1",
      durationMs: tree1Frames.length * treeFrameMs,
      fadeInMs: 250,
      fadeOutMs: 250,
      frames: {
        src: tree1Frames,
        frameDurationMs: treeFrameMs,
        loop: false,
        pos: { x: 0, y: 8 }
      }
    },
    {
      id: "tree_anim_2",
      durationMs: tree2Frames.length * treeFrameMs,
      fadeInMs: 250,
      fadeOutMs: 250,
      frames: {
        src: tree2Frames,
        frameDurationMs: treeFrameMs,
        loop: false,
        pos: { x: 0, y: 8 }
      }
    },
    {
      id: "kallak_writing",
      durationMs: KALLAK_TOTAL_MS,
      fadeInMs: 250,
      fadeOutMs: 250,
      frames: {
        src: kallakSequence,
        frameDurationMs: rleFrameMs(KALLAK_TOTAL_MS, KALLAK_RLE),
        loop: false,
        pos: { x: 0, y: 8 }
      },
      overlayFrames: {
        src: kallakHandSequence,
        frameDurationMs: rleFrameMs(HAND_TOTAL_MS, HAND_RLE),
        loop: false,
        holdLast: false,
        pos: { x: 92, y: 20 },
        oscillateX: { amplitude: 6, periodMs: 900 }
      }
    },
    {
      id: "kallak_malcolm",
      bgSrc: withBase("assets/intro/gemcuti.png"),
      durationMs: malKalFrames.length * malcolmFrameMsFixed,
      fadeInMs: 250,
      fadeOutMs: 250,
      frames: {
        src: malKalFrames,
        frameDurationMs: malcolmFrameMsFixed,
        loop: false,
        pos: { x: 16, y: 58 }
      },
      sceneAnim: {
        metaSrc: withBase("assets/scenes/dat/GEMCUT.json"),
        shapesSrc: withBase("assets/scenes/cps/GEMCUT.json"),
        animIndices: [0]
      }
    }
  ];
}

function buildFrameList(folder: string, count: number): string[] {
  const items: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const frame = String(i).padStart(4, "0");
    items.push(withBase(`${folder}/${frame}.png`));
  }
  return items;
}

function buildLoopFrames(sources: string[], count: number): string[] {
  const items: string[] = [];
  if (!sources.length) return items;
  for (let i = 0; i < count; i += 1) {
    items.push(withBase(sources[i % sources.length]));
  }
  return items;
}
