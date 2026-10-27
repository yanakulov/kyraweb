import test from "node:test";
import assert from "node:assert/strict";
import { playIntro, frameAtTime } from "../src/engine/intro/player";
import { buildIntroSteps } from "../src/engine/intro/steps";
import type { IntroStep } from "../src/engine/intro/types";
import { findWalkPath } from "../src/engine/gameplay/pathfinding";
import { getSequence } from "../src/engine/gameplay/movement";
import { BRANDON_FRAMES } from "../src/engine/characters/brandonFrames";
import { isWalkable } from "../src/engine/scene/masks";
import { buildDropPath, dropItemAt, updateDrops, findDropDestination } from "../src/engine/gameplay/drops";
import { startGame } from "../src/engine/gameplay/game";
import type { SceneConfig, MaskData, DropAnim, SceneItem, Vec2 } from "../src/engine/core/types";
import gemcutMask from "../public/assets/masks/GEMCUT.json";

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
  const draws: unknown[][] = [];
  const ctx = new Proxy({}, { get: (_, key) => key === "drawImage" ? (...args: unknown[]) => draws.push(args) : key === "fillText" ? () => textDraws++ : key === "measureText" ? (s: string) => ({ width: s.length * 6 }) : () => {} });
  const canvas = { getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, draws, textDraws: () => textDraws,
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

const scene: SceneConfig = { name: "Test", bgSrc: "background", brSrc: "brandon", uiMaskY: 136, frames: BRANDON_FRAMES };
const openMask = (): MaskData => ({ width: 320, height: 144, pixels: new Array(320 * 144).fill(1) });

test("walking follows LoK octants and snaps fractional clicks to the 4x2 grid", () => {
  const path = findWalkPath({ x: 40, y: 40 }, { x: 83.8, y: 43.9 }, () => true);
  assert.deepEqual(path.at(-1), { x: 80, y: 42 });
  assert.ok(path.slice(0, -1).every(p => p.y === 40));
  assert.deepEqual(findWalkPath({ x: 40, y: 40 }, { x: 43, y: 41 }, () => true), []);
  const diagonal = findWalkPath({ x: 40, y: 40 }, { x: 80, y: 60 }, () => true);
  assert.equal(diagonal.length, 10);
  assert.deepEqual(diagonal[0], { x: 44, y: 42 });
});

test("pathfinder walks around obstacles, respects foot width and stops at blocked targets", () => {
  const mask = openMask();
  for (let y = 34; y <= 46; y++) for (let x = 48; x <= 56; x++) mask.pixels[y * 320 + x] = 0x80;
  const passable = (p: Vec2) => isWalkable(p, scene, mask);
  assert.equal(passable({ x: 47, y: 40 }), false);
  const route = findWalkPath({ x: 40, y: 40 }, { x: 72, y: 40 }, passable);
  assert.deepEqual(route.at(-1), { x: 72, y: 40 });
  assert.ok(route.every(passable));
  assert.ok(route.some(p => p.y < 34 || p.y > 46));
  assert.ok(findWalkPath({ x: 40, y: 40 }, { x: 52, y: 40 }, passable).every(passable));
  assert.deepEqual(findWalkPath({ x: 40, y: 40 }, { x: 72, y: 40 }, () => false), []);
  assert.equal(isWalkable({ x: 40, y: 140 }, { ...scene, uiMaskY: 150 }, { width: 320, height: 100, pixels: [] }), false);
});

test("real GEMCUT routes stay on the grid and never cross the mask", () => {
  const passable = (p: Vec2) => isWalkable(p, scene, gemcutMask);
  let reachable = 0;
  for (let y = 80; y < 136; y += 4) for (let x = 16; x < 304; x += 8) {
    const route = findWalkPath({ x: 160, y: 120 }, { x, y }, passable);
    let previous = { x: 160, y: 120 };
    for (const p of route) {
      assert.ok(passable(p), JSON.stringify(p));
      assert.equal(p.x % 4, 0); assert.equal(p.y % 2, 0);
      assert.ok(Math.abs(p.x - previous.x) <= 4 && Math.abs(p.y - previous.y) <= 2);
      previous = p;
    }
    if (route.at(-1)?.x === x && route.at(-1)?.y === y) reachable++;
  }
  assert.ok(reachable > 100, `Only ${reachable} reachable targets`);
});

test("walk cycles use the original shape ranges, without an idle or missing frame", () => {
  assert.deepEqual(getSequence("left").map(i => BRANDON_FRAMES[i].shapeIndex), [8,9,10,11,12,13,14]);
  assert.deepEqual(getSequence("up").map(i => BRANDON_FRAMES[i].shapeIndex), [35,36,37,38,39,40]);
  assert.deepEqual(getSequence("down").map(i => BRANDON_FRAMES[i].shapeIndex), [29,30,31,32,33,34]);
});

test("drop trajectory has integer acceleration and one bounce, settling at its reserved destination", () => {
  const path = buildDropPath({ x: 80, y: 40 }, { x: 90, y: 80 });
  assert.deepEqual(path.slice(0, 4), [{ x: 80, y: 40 }, { x: 80, y: 42 }, { x: 80, y: 45 }, { x: 80, y: 49 }]);
  assert.deepEqual(path.at(-1), { x: 90, y: 80 });
  const impact = path.findIndex(p => p.y === 80);
  assert.ok(path[impact + 1].y < 80);
  assert.deepEqual(buildDropPath({ x: 80, y: 80 }, { x: 80, y: 80 }), [{ x: 80, y: 80 }, { x: 80, y: 80 }]);
});

test("drops have identical positions and completion at 30, 60 and 144 Hz", () => {
  const simulate = (hz: number) => {
    const drops: DropAnim[] = [{ id: "ruby", x: 80, y: 40, destX: 90, destY: 120, path: buildDropPath({ x: 80, y: 40 }, { x: 90, y: 120 }), elapsedMs: 0 }];
    const items: SceneItem[] = [];
    for (let i = 0; i < hz / 2; i++) updateDrops(drops, items, 1000 / hz);
    const halfway = drops.map(d => ({ x: d.x, y: d.y }));
    for (let i = 0; i < hz * 2; i++) updateDrops(drops, items, 1000 / hz);
    return { halfway, items, remaining: drops.length };
  };
  assert.deepEqual(simulate(30), simulate(60));
  assert.deepEqual(simulate(60), simulate(144));
  assert.deepEqual(simulate(60).items, [{ id: "ruby", x: 90, y: 120 }]);
});

test("drop placement checks icon width, occupied slots, capacity and rejection", () => {
  const mask = openMask(), drops: DropAnim[] = [], items: SceneItem[] = [{ id: "saw", x: 80, y: 80 }];
  assert.notDeepEqual(findDropDestination({ x: 80, y: 80 }, scene, mask, items), { x: 80, y: 80 });
  assert.equal(dropItemAt({ x: 80, y: 160 }, "ruby", drops, items, scene, mask), false);
  assert.equal(dropItemAt({ x: 80, y: 80 }, "ruby", drops, new Array(12).fill(items[0]), scene, mask), false);
  mask.pixels.fill(0x80);
  assert.equal(dropItemAt({ x: 80, y: 80 }, "ruby", drops, items, scene, mask), false);
  assert.equal(drops.length, 0);
  for (let y = 79; y < 136; y++) mask.pixels[y * 320 + 80] = 1;
  assert.equal(findDropDestination({ x: 80, y: 80 }, scene, mask, []), null);
  const realDestination = findDropDestination({ x: 245, y: 85 }, scene, gemcutMask, []);
  assert.ok(realDestination);
  assert.ok(realDestination.y >= 85 && realDestination.y < 136);
});

test("game input preserves held items on failed drops and exchanges scene items", async () => {
  const h = introHarness();
  const original = { Image: globalThis.Image, fetch: globalThis.fetch };
  class FakeImage {
    onload = () => {}; width = 320; height = 200; source = "";
    set src(value: string) { this.source = value; queueMicrotask(() => this.onload()); }
  }
  Object.assign(globalThis, { Image: FakeImage, fetch: async () => ({ ok: true, json: async () => ({}) }) });
  try {
    const game = await startGame(h.canvas, { scene: { ...scene, walkPolygon: [], items: [{ id: "ruby", x: 80, y: 80 }, { id: "saw", x: 120, y: 80 }] } });
    assert.equal(game.handleClick({ x: 80, y: 75 }), true); // Ruby in hand.
    assert.equal(game.handleClick({ x: 200, y: 60 }), true); // Rejected drop is consumed.
    assert.equal(game.handleClick({ x: 120, y: 75 }), true); // Swap ruby for saw.
    assert.equal(game.handleClick({ x: 100, y: 165 }), true); // Store saw.
    h.tick(0);
    const itemDraws = h.draws.filter(args => (args[0] as FakeImage).source.includes("inventory/items.png"));
    assert.ok(itemDraws.some(d => d[1] === 64 && d[2] === 32 && d[5] === 95 && d[6] === 160), "Saw is in the inventory");
    assert.ok(itemDraws.some(d => d[1] === 0 && d[2] === 0 && d[5] === 112 && d[6] === 64), "Ruby replaced the saw in the scene");
    assert.equal(game.handleClick({ x: 120, y: 75 }), true); // Ruby still exists.
    assert.equal(game.handleClick({ x: 200, y: 60 }), true); // Still holding ruby.
    game.stop();
  } finally { Object.assign(globalThis, original); h.restore(); }
});

test("game walking advances equally at different display rates and retargets without oscillating", async () => {
  const simulate = async (hz: number) => {
    const h = introHarness();
    const original = { Image: globalThis.Image, fetch: globalThis.fetch };
    class FakeImage {
      onload = () => {}; width = 320; height = 200; source = "";
      set src(value: string) { this.source = value; queueMicrotask(() => this.onload()); }
    }
    Object.assign(globalThis, { Image: FakeImage, fetch: async () => ({ ok: true, json: async () => ({}) }) });
    const position = () => {
      const draw = h.draws.filter(args => (args[0] as FakeImage).source === "brandon").at(-1)!;
      const frame = BRANDON_FRAMES.find(f => f.x === draw[1] && f.y === draw[2])!;
      return { x: Number(draw[5]) - frame.xOffset, y: Number(draw[6]) - frame.yOffset };
    };
    try {
      const game = await startGame(h.canvas, { scene });
      game.setTarget({ x: 40.8, y: 100.3 });
      for (let i = 1; i <= hz; i++) h.tick(i * 1000 / hz);
      const midpoint = position();
      game.setTarget({ x: 41.9, y: 81.8 });
      for (let i = 1; i <= hz * 4; i++) h.tick(1000 + i * 1000 / hz);
      const endpoint = position();
      game.stop();
      return { midpoint, endpoint };
    } finally { Object.assign(globalThis, original); h.restore(); }
  };
  assert.deepEqual(await simulate(30), await simulate(60));
  assert.deepEqual(await simulate(60), await simulate(144));
  assert.deepEqual((await simulate(60)).endpoint, { x: 40, y: 80 });
});
