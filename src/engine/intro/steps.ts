import { withBase } from "../core/assets";
import { WESTWOOD_RLE, WESTWOOD_TOTAL_MS, SCROLL_TOTAL_MS } from "./introTiming";
import timeline from "./introTimeline.json";
import type { IntroStep, IndexedIntroTrack } from "./types";
import { timelineSubtitles, sliceSubtitles } from "./subtitles";

export function buildIntroSteps(): IntroStep[] {
  const shoreFrameMs = 120;
  const storyFrameMs = 6000;
  const scrollMs = SCROLL_TOTAL_MS;
  const sequence = (name: string, indices: number[], times: number[], pos = { x: 0, y: 8 }, loopMs?: number): IndexedIntroTrack => ({
    src: withBase(`assets/packs/${name === "writing" ? "kallak-writing" : name}.kyr.gz`),
    clip: name, indices, frameTimesMs: times, pos, loopMs
  });
  const uniform = (name: string, count: number, frameMs: number, pos?: { x: number; y: number }, loopMs?: number) =>
    sequence(name, Array.from({ length: count }, (_, i) => i), Array.from({ length: count }, (_, i) => i * frameMs), pos, loopMs);
  const westwoodIndices = WESTWOOD_RLE.flatMap(([frame, units]) => Array<number>(units).fill(frame % 23));
  const writing = timeline.KallakWriting;
  const tree = timeline.MalcolmTree;
  const conversation = timeline.KallakMalcolm;
  const treeSplitMs = tree.tracks.tree2.startMs;
  const timedFrames = (name: string, track: { frames: number[][] }, offset = 0, pos?: { x: number; y: number }) =>
    sequence(name, track.frames.map(([, frame]) => frame), track.frames.map(([ms]) => ms - offset), pos);
  const writingFrames = timedFrames("writing", writing.tracks.kallak);
  const firstCycleEnd = writing.tracks.kallak.frames.findIndex(([, frame], i) => i > 0 && frame === 1 && writing.tracks.kallak.frames[i - 1][1] === 29);
  const treeSubtitles = timelineSubtitles(tree.subtitles);

  return [
    {
      id: "westwood",
      durationMs: WESTWOOD_TOTAL_MS,
      fadeInMs: 0,
      fadeOutMs: 0,
      bgSrc: withBase("assets/intro/logo_bg.png"),
      indexedFrames: sequence("westwood", westwoodIndices, westwoodIndices.map((_, i) => i * WESTWOOD_TOTAL_MS / westwoodIndices.length), { x: 0, y: 46 })
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
      durationMs: 12 * shoreFrameMs,
      fadeInMs: 0,
      fadeOutMs: 0,
      indexedFrames: uniform("shore", 12, shoreFrameMs, { x: 0, y: 8 }, 12 * shoreFrameMs)
    },
    {
      id: "shore_destruct",
      durationMs: Math.max(
        12 * shoreFrameMs,
        44 * shoreFrameMs * 2
      ),
      fadeInMs: 0,
      fadeOutMs: 0,
      indexedBgFrames: uniform("shore", 12, shoreFrameMs, { x: 0, y: 8 }, 12 * shoreFrameMs),
      indexedFrames: uniform("destruct", 44, shoreFrameMs * 2, { x: 152, y: 56 })
    },
    {
      id: "tree_anim_1",
      durationMs: treeSplitMs,
      fadeInMs: 250,
      fadeOutMs: 0,
      indexedFrames: timedFrames("tree1", tree.tracks.tree1),
      subtitles: sliceSubtitles(treeSubtitles, 0, treeSplitMs)
    },
    {
      id: "tree_anim_2",
      durationMs: tree.durationMs - treeSplitMs,
      fadeInMs: 0,
      fadeOutMs: 0,
      indexedFrames: timedFrames("tree2", tree.tracks.tree2, treeSplitMs),
      subtitles: sliceSubtitles(treeSubtitles, treeSplitMs, tree.durationMs)
    },
    {
      id: "kallak_writing",
      durationMs: writing.durationMs,
      demoLoopRange: { startMs: 0, endMs: writingFrames.frameTimesMs[firstCycleEnd], resumeMs: 0 },
      indexedFrames: writingFrames,
      overlayFrames: {
        src: writing.tracks.kallak.hand.map(([, frame]) => frame < 0 ? "" : withBase(`assets/intro/hand${frame}.png`)),
        frameTimesMs: writing.tracks.kallak.hand.map(([ms]) => ms),
        // Original sequence places the movie at y=16; our intro viewport starts at 8.
        positions: writing.tracks.kallak.hand.map(([, , x, y]) => ({ x, y: y - 8 })),
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
      indexedFrames: timedFrames("mal-kal", conversation.tracks["mal-kal"], 0, { x: 16, y: 58 }),
      subtitles: timelineSubtitles(conversation.subtitles),
      sceneAnim: {
        metaSrc: withBase("assets/scenes/dat/GEMCUT.json"),
        shapesPack: { src: withBase("assets/packs/kallak-room.kyr.gz"), clip: "room" },
        animIndices: [0]
      }
    }
  ];
}
