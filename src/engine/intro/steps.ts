import { withBase } from "../core/assets";
import { WESTWOOD_RLE, WESTWOOD_TOTAL_MS, SCROLL_TOTAL_MS } from "./introTiming";
import timeline from "./introTimeline.json";
import type { IntroStep } from "./types";
import { timelineSubtitles, sliceSubtitles } from "./subtitles";

export function buildIntroSteps(): IntroStep[] {
  const shoreFrameMs = 120;
  const storyFrameMs = 6000;
  const scrollMs = SCROLL_TOTAL_MS;
  const westwoodFrames = buildFrameList("assets/intro/frames/westwood", 23);
  const tree1Frames = buildFrameList("assets/intro/frames/tree1", 185);
  const tree2Frames = buildFrameList("assets/intro/frames/tree2", 20);
  const kallakFrames = buildFrameList("assets/intro/frames/kallak", 75);
  const malKalFrames = buildFrameList("assets/intro/frames/mal-kal", 325);
  const shoreFrames = buildFrameList("assets/intro/frames/shore", 12);
  const destructFrames = buildFrameList("assets/intro/frames/destruct", 44);
  const buildSequenceFromRle = (frames: string[], rle: [number, number][]) =>
    rle.flatMap(([frameIndex, units]) => {
      const normalizedIndex = frameIndex % frames.length;
      const src = frames[normalizedIndex] ?? frames[0];
      return Array.from({ length: units }, () => src);
    });
  const rleUnits = (rle: [number, number][]) => rle.reduce((sum, [, units]) => sum + units, 0);
  const rleFrameMs = (totalMs: number, rle: [number, number][]) => totalMs / Math.max(1, rleUnits(rle));
  const writing = timeline.KallakWriting;
  const tree = timeline.MalcolmTree;
  const conversation = timeline.KallakMalcolm;
  const treeSplitMs = tree.tracks.tree2.startMs;
  const timedFrames = (frames: string[], track: { frames: number[][] }, offset = 0) => ({
    src: track.frames.map(([, frame]) => frames[frame]),
    frameTimesMs: track.frames.map(([ms]) => ms - offset),
    frameDurationMs: 1000 / 60,
    pos: { x: 0, y: 8 }
  });
  const writingFrames = timedFrames(kallakFrames, writing.tracks.kallak);
  const firstCycleEnd = writing.tracks.kallak.frames.findIndex(([, frame], i) => i > 0 && frame === 1 && writing.tracks.kallak.frames[i - 1][1] === 29);
  const treeSubtitles = timelineSubtitles(tree.subtitles);

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
    // Kyrandia logo step temporarily disabled.
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
      fadeInMs: 0,
      fadeOutMs: 0,
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
      fadeInMs: 0,
      fadeOutMs: 0,
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
      durationMs: treeSplitMs,
      fadeInMs: 250,
      fadeOutMs: 0,
      frames: timedFrames(tree1Frames, tree.tracks.tree1),
      subtitles: sliceSubtitles(treeSubtitles, 0, treeSplitMs)
    },
    {
      id: "tree_anim_2",
      durationMs: tree.durationMs - treeSplitMs,
      fadeInMs: 0,
      fadeOutMs: 0,
      frames: timedFrames(tree2Frames, tree.tracks.tree2, treeSplitMs),
      subtitles: sliceSubtitles(treeSubtitles, treeSplitMs, tree.durationMs)
    },
    {
      id: "kallak_writing",
      durationMs: writing.durationMs,
      demoLoopRange: { startMs: 0, endMs: writingFrames.frameTimesMs[firstCycleEnd], resumeMs: 0 },
      frames: writingFrames,
      overlayFrames: {
        src: writing.tracks.kallak.hand.map(([, frame]) => frame < 0 ? "" : withBase(`assets/intro/hand${frame}.png`)),
        frameTimesMs: writing.tracks.kallak.hand.map(([ms]) => ms),
        positions: writing.tracks.kallak.hand.map(([, , x, y]) => ({ x: 92 + x - 149, y: 20 + y - 32 })),
        frameDurationMs: 1000 / 60
      },
      subtitles: timelineSubtitles(writing.subtitles)
    },
    {
      id: "kallak_malcolm",
      bgSrc: withBase("assets/intro/gemcuti.png"),
      durationMs: conversation.durationMs,
      fadeInMs: 0,
      fadeOutMs: 0,
      frames: { ...timedFrames(malKalFrames, conversation.tracks["mal-kal"]), pos: { x: 16, y: 58 } },
      subtitles: timelineSubtitles(conversation.subtitles),
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
