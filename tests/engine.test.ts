import test from "node:test";
import assert from "node:assert/strict";
import { playIntro, frameAtTime } from "../src/engine/intro/player";
import { buildIntroSteps } from "../src/engine/intro/steps";
import type { IntroStep } from "../src/engine/intro/types";

function introHarness() {
  let now = 0, id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const original = { performance: globalThis.performance, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  Object.assign(globalThis, {
    performance: { now: () => now },
    requestAnimationFrame: (cb: FrameRequestCallback) => { frames.set(++id, cb); return id; },
    cancelAnimationFrame: (key: number) => frames.delete(key)
  });
  let textDraws = 0;
  const ctx = new Proxy({}, { get: (_, key) => key === "fillText" ? () => textDraws++ : key === "measureText" ? (s: string) => ({ width: s.length * 6 }) : () => {} });
  const canvas = { getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, textDraws: () => textDraws,
    tick(ms: number) { now = ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb(now)); },
    pending: () => frames.size,
    restore() { Object.assign(globalThis, original); }
  };
}
const subtitle = { text: "Hello", startMs: 20, endMs: 80, y: 180 };

test("intro emits DOM subtitles, clears gaps and cuts, and respects canvas mode", async () => {
  const h = introHarness();
  try {
    const events: string[][] = [];
    const steps: IntroStep[] = [{ id: "talk", durationMs: 100, subtitles: [subtitle] }, { id: "silent", durationMs: 100 }];
    const playback = playIntro(h.canvas, steps, { onSubtitleChange: p => events.push(p.lines.map(l => l.text)) });
    await Promise.resolve();
    h.tick(30); assert.deepEqual(events.at(-1), ["Hello"]); assert.equal(h.textDraws(), 0);
    h.tick(90); assert.deepEqual(events.at(-1), []);
    h.tick(110); assert.deepEqual(events.at(-1), []);
    h.tick(200); await playback.done; assert.equal(h.pending(), 0);
    const canvasPlayback = playIntro(h.canvas, steps, { renderSubtitlesOnCanvas: true });
    await Promise.resolve(); h.tick(230); assert.equal(h.textDraws(), 1); canvasPlayback.stop();
  } finally { h.restore(); }
});

test("stop and skip settle before asset loading and cannot revive playback", async () => {
  const h = introHarness();
  try {
    for (const method of ["stop", "skip"] as const) {
      const playback = playIntro(h.canvas, [{ id: "test", durationMs: 100 }]);
      playback[method](); await playback.done; await Promise.resolve();
      assert.equal(h.pending(), 0);
    }
  } finally { h.restore(); }
});

test("demo exit resumes the script clock and completion carries frame remainder", async () => {
  const h = introHarness();
  try {
    const events: string[][] = [], steps: string[] = [];
    const playback = playIntro(h.canvas, [
      { id: "demo", durationMs: 100, demoLoopRange: { startMs: 0, endMs: 40, resumeMs: 20 }, subtitles: [subtitle] },
      { id: "next", durationMs: 100 }
    ], { onStepChange: id => steps.push(id), onSubtitleChange: p => events.push(p.lines.map(l => l.text)) });
    playback.setDemoLoopStep("demo"); await Promise.resolve();
    h.tick(300); assert.deepEqual(events.at(-1), []);
    playback.exitDemoLoop(); h.tick(310); assert.deepEqual(events.at(-1), ["Hello"]);
    h.tick(399); assert.equal(steps.at(-1), "next");
    h.tick(490); await playback.done; assert.equal(h.pending(), 0);
  } finally { h.restore(); }
});

test("decoded dialogue retains pauses, speakers and variable frame timing", () => {
  const steps = buildIntroSteps();
  const writing = steps.find(s => s.id === "kallak_writing")!;
  const conversation = steps.find(s => s.id === "kallak_malcolm")!;
  assert.ok(writing.demoLoopRange!.endMs > 3000);
  assert.ok(writing.subtitles!.at(-1)!.endMs < writing.durationMs);
  assert.ok(conversation.subtitles![0].startMs > 4000);
  assert.equal(conversation.subtitles!.find(s => s.text === "So, slay me now!")!.x, 240);
  assert.equal(conversation.subtitles!.find(s => s.text.startsWith("I mean to harm"))!.x, 80);
  assert.ok(conversation.durationMs > 60000);
  assert.equal(frameAtTime([0, 100, 400], 399), 1);
  assert.equal(frameAtTime([0, 100, 400], 400), 2);
  for (const step of steps) {
    assert.ok(step.frames?.src.every(Boolean) ?? true);
    for (const line of step.subtitles ?? []) assert.ok(line.startMs >= 0 && line.endMs <= step.durationMs);
  }
});
