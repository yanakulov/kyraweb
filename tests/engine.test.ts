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
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { IndexedClip, parseScenePack } from "../src/engine/resources/scenePack";
import { expandIndexedPixels } from "../src/engine/rendering/indexedRenderer";
import { encodeScenePack } from "../extractor/scene_pack.mjs";
import { decodeFrame4, applyWestwoodDelta, readPak } from "../extractor/indexed_resources.mjs";
import pixelFixtures from "./fixtures/intro-pixels.json";
import { RoomScript, type RoomAction } from "../src/engine/gameplay/roomScript";
import { brandonTalkHead } from "../src/engine/characters/brandonFrames";
import { parseEmc, runEmc } from "../extractor/emc.mjs";
import { vocDuration } from "../extractor/opening.mjs";
import opening from "../public/assets/packs/opening.json";
import openingPixels from "./fixtures/opening-pixels.json";

test("all 77 opening/tree WSA frames and patched palettes retain the original CD pixels", () => {
  const pack = parseScenePack(gunzipSync(readFileSync("public/assets/packs/opening.kyr.gz")));
  let count = 0;
  for (const [name, fixture] of Object.entries(openingPixels.clips)) {
    const clip = new IndexedClip(pack, pack.clips[name]);
    assert.equal(clip.info.width, fixture.width); assert.equal(clip.info.height, fixture.height);
    assert.equal(clip.info.transparentIndex, -1);
    assert.equal(createHash("sha256").update(new Uint8Array(clip.info.palette)).digest("hex"), fixture.paletteSha256);
    for (let i = 0; i < fixture.hashes.length; i++) {
      assert.equal(createHash("sha256").update(clip.frame(i)).digest("hex"), fixture.hashes[i], `${name}:${i}`); count++;
    }
  }
  assert.equal(count, 77);
});

test("EMC calls return through the frame stack and retain signed 16-bit arithmetic", () => {
  const s = (op: number, value: number) => 0x4000 | op << 8 | value & 255;
  const program = { order: [0], code: [s(2, 1), 0x8008, s(2, 0), s(9, 0), s(8, 1), 0, 0, 0,
    0x2300, 32767, s(4, 1), s(17, 8), s(8, 0), s(8, 1)], strings: [] };
  assert.equal(runEmc(program, 0, () => 0).regs[0], -32768);
  assert.throws(() => runEmc({ order: [0], code: [0x8000], strings: [] }, 0, () => 0, {}, 100), /limit/);
  assert.throws(() => parseEmc(new Uint8Array(12)), /EMC2/);
});

test("CD voice duration includes continuation blocks without exporting audio", () => {
  const bytes = Buffer.alloc(26 + 4 + 102 + 4 + 100 + 1);
  bytes.write("Creative Voice File", 0, "ascii"); bytes.writeUInt16LE(26, 20);
  bytes[26] = 1; bytes.writeUIntLE(102, 27, 3); bytes[30] = 156; // 10,000 Hz, PCM8
  bytes[132] = 2; bytes.writeUIntLE(100, 133, 3);
  assert.equal(vocDuration(bytes), 20);
  assert.throws(() => vocDuration(bytes.subarray(0, 200)), /Truncated/);
});

test("room script shares one clock for voice, frames and walks, and cancellation is final", () => {
  const applied: RoomAction[] = [];
  let walking = false;
  const say: RoomAction = { op: "say", text: "First", ms: 500, voiceId: 8, x: 154, y: 32, color: 34, blocking: false };
  const script = new RoomScript([say, { op: "frame", clip: "face", index: 0, x: 104, y: 32, ms: 100 },
    { ...say, text: "Second", blocking: true }, { op: "walk", x: 96, y: 116 }, { op: "message", text: "Arrived" }], {
    apply: action => { applied.push(action); if (action.op === "walk") walking = true; }, walking: () => walking, frames: () => 1
  });
  script.update(0); script.update(100);
  assert.equal(applied.filter(a => a.op === "say").length, 1);
  script.update(399); assert.equal(applied.filter(a => a.op === "say").length, 1);
  script.update(1); assert.equal(applied.filter(a => a.op === "say").length, 2);
  script.update(500); assert.equal(walking, true); assert.equal(script.done, false);
  script.update(2000); assert.equal(applied.some(a => a.op === "message"), false);
  walking = false; script.update(0); assert.equal(script.done, true);
  script.stop(); const count = applied.length; script.update(100000); assert.equal(applied.length, count);
});

test("original opening visits TRUNK, GEM and GEMCUT, with all 29 tree lines and valid WSA frames", () => {
  const pack = parseScenePack(gunzipSync(readFileSync("public/assets/packs/opening.kyr.gz")));
  const actions = [...opening.opening, ...opening.tree] as RoomAction[];
  assert.deepEqual(actions.filter(a => a.op === "scene").map(a => a.op === "scene" && a.name), ["trunk", "gem", "room"]);
  const lines = opening.tree.filter(a => a.op === "say");
  assert.equal(lines.length, 29);
  assert.equal(lines[0].text, "Brandon?");
  assert.equal(lines.at(-1)!.text, "What happened to my Grandfather?");
  assert.ok(actions.some(a => a.op === "movie" && a.clip === "dropup"));
  assert.ok(actions.some(a => a.op === "movie" && a.clip === "liftup"));
  for (const action of actions) {
    if (action.op === "frame" || action.op === "movie") {
      const clip = pack.clips[action.clip]; assert.ok(clip, action.clip);
      if (action.op === "frame") assert.ok(action.index >= 0 && action.index < clip.frames.length, `${action.clip}:${action.index}`);
    }
  }
  for (const info of Object.values(pack.clips)) {
    const clip = new IndexedClip(pack, info);
    for (let i = 0; i < info.frames.length; i++) assert.equal(clip.frame(i).length, info.width * info.height);
  }
  const body = BRANDON_FRAMES.find(f => f.shapeIndex === 16)!;
  assert.equal(body.h, 48, "talking uses a full body, not a head as a replacement");
  for (const time of [0, 184, 1000, 3400]) {
    const head = BRANDON_FRAMES.find(f => f.shapeIndex === brandonTalkHead(time))!;
    assert.ok(head.h <= 11 && head.w <= body.w);
  }
});

test("all 684 migrated intro frames exactly retain visible PNG pixels, including backwards seeks", () => {
  let count = 0;
  for (const [name, fixture] of Object.entries(pixelFixtures.clips)) {
    const file = name === "writing" ? "kallak-writing" : name;
    const pack = parseScenePack(gunzipSync(readFileSync(`public/assets/packs/${file}.kyr.gz`)));
    const clip = new IndexedClip(pack, pack.clips[name]);
    assert.equal(clip.info.width, fixture.width); assert.equal(clip.info.height, fixture.height);
    assert.equal(clip.info.frames.length, fixture.hashes.length);
    const rgba = new Uint8ClampedArray(clip.pixels.length * 4);
    const check = (i: number) => {
      expandIndexedPixels(clip.frame(i), clip.info.palette, clip.info.transparentIndex, rgba);
      for (let p = 0; p < rgba.length; p += 4) if (!rgba[p + 3]) rgba.fill(0, p, p + 3);
      assert.equal(createHash("sha256").update(rgba).digest("hex"), fixture.hashes[i], `${name}:${i}`);
    };
    for (let i = 0; i < fixture.hashes.length; i++) { check(i); count++; }
    for (const i of [fixture.hashes.length - 1, 0, Math.floor(fixture.hashes.length / 2), 1, 0]) check(i);
  }
  assert.equal(count, 684);
});

test("scene packets round-trip XOR deltas, repeated frames and keyframe crossings", () => {
  const frames = Array.from({ length: 145 }, (_, n) => Uint8Array.from({ length: 120 }, (_, i) => i % 17 === n % 17 ? n % 255 : 0));
  const compressed = encodeScenePack({ test: { width: 12, height: 10, palette: new Array(768).fill(0), frames } });
  const pack = parseScenePack(gunzipSync(compressed));
  const clip = new IndexedClip(pack, pack.clips.test);
  for (const n of [0, 1, 1, 63, 64, 65, 144, 0, 100, 62, 64]) assert.deepEqual(clip.frame(n), frames[n]);
  assert.throws(() => clip.frame(-1)); assert.throws(() => clip.frame(145));
});

test("scene pack parser rejects truncated headers, invalid palettes and out-of-range runs", () => {
  assert.throws(() => parseScenePack(new Uint8Array(8)));
  const frame = new Uint8Array([1, 0, 0, 0]);
  const badRun = parseScenePack(gunzipSync(encodeScenePack({ test: { width: 10, height: 10, palette: new Array(768).fill(0), frames: [new Uint8Array(100), Uint8Array.from({ length: 100 }, (_, i) => i === 0 ? 1 : 0)] } })));
  const delta = badRun.clips.test.frames[1];
  new DataView(badRun.payload.buffer, badRun.payload.byteOffset).setUint32(delta.offset, 100, true);
  assert.throws(() => new IndexedClip(badRun, badRun.clips.test).frame(1), /delta run/);
  const bytes = gunzipSync(encodeScenePack({ test: { width: 2, height: 2, palette: [1], frames: [frame] } }));
  assert.throws(() => parseScenePack(bytes));
  const truncated = gunzipSync(encodeScenePack({ test: { width: 2, height: 2, palette: new Array(768).fill(0), frames: [frame] } }));
  assert.throws(() => parseScenePack(truncated.subarray(0, truncated.length - 1)));
});

test("Westwood decoding handles overlapping references and rejects corrupt inputs", () => {
  assert.deepEqual(decodeFrame4(Uint8Array.from([0x83, 1, 2, 3, 0, 3, 0x80]), 6), Uint8Array.from([1, 2, 3, 1, 2, 3]));
  assert.throws(() => decodeFrame4(Uint8Array.from([0, 5]), 4));
  const pixels = Uint8Array.from([1, 2, 3, 4]);
  applyWestwoodDelta(pixels, Uint8Array.from([0x81, 2, 8, 8, 0x80, 0, 0]));
  assert.deepEqual(pixels, Uint8Array.from([1, 10, 11, 4]));
  assert.throws(() => applyWestwoodDelta(pixels, Uint8Array.from([0x85])));
  assert.throws(() => readPak(Uint8Array.from([255, 255, 255, 255, 0])));
});

const settleLoads = () => new Promise<void>(resolve => setImmediate(resolve));

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
  const rectangles: unknown[][] = [];
  const ctx = new Proxy({}, { get: (_, key) => key === "drawImage" ? (...args: unknown[]) => draws.push(args) : key === "fillRect" ? (...args: unknown[]) => rectangles.push(args) : key === "fillText" ? () => textDraws++ : key === "measureText" ? (s: string) => ({ width: s.length * 6 }) : () => {} });
  const canvas = { getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, draws, rectangles, textDraws: () => textDraws,
    tick(ms: number) { now = ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb(now)); },
    pending: () => frames.size,
    restore() { Object.assign(globalThis, original); }
  };
}
const subtitle = { text: "Hello", startMs: 20, endMs: 80, y: 180 };

test("intro masks sprite overflow from row 136, while full-screen logos remain uncovered", async () => {
  const h = introHarness();
  try {
    for (const id of ["kallak_writing", "kallak_malcolm", "tree_anim_1", "westwood", "shore_anim"]) {
      h.rectangles.length = 0;
      const playback = playIntro(h.canvas, [{ id, durationMs: 1000 }]);
      await settleLoads(); h.tick(30); await settleLoads();
      const mask = h.rectangles.filter(r => r[1] !== 0);
      assert.deepEqual(mask, ["westwood", "shore_anim"].includes(id) ? [] : [[0, 136, 320, 64]], id);
      playback.stop(); await playback.done;
    }
  } finally { h.restore(); }
});

test("intro emits DOM subtitles, clears gaps and cuts, and respects canvas mode", async () => {
  const h = introHarness();
  try {
    const events: string[][] = [];
    const steps: IntroStep[] = [{ id: "talk", durationMs: 100, subtitles: [subtitle] }, { id: "silent", durationMs: 100 }];
    const playback = playIntro(h.canvas, steps, { onSubtitleChange: p => events.push(p.lines.map(l => l.text)) });
    await settleLoads();
    h.tick(30); await settleLoads(); assert.deepEqual(events.at(-1), ["Hello"]); assert.equal(h.textDraws(), 0);
    h.tick(90); await settleLoads(); assert.deepEqual(events.at(-1), []);
    h.tick(110); await settleLoads(); assert.deepEqual(events.at(-1), []);
    h.tick(200); await settleLoads(); await playback.done; assert.equal(h.pending(), 0);
    const canvasPlayback = playIntro(h.canvas, steps, { renderSubtitlesOnCanvas: true });
    await settleLoads(); h.tick(230); await settleLoads(); assert.equal(h.textDraws(), 1); canvasPlayback.stop();
  } finally { h.restore(); }
});

test("stop and skip settle before asset loading and cannot revive playback", async () => {
  const h = introHarness();
  try {
    for (const method of ["stop", "skip"] as const) {
      const playback = playIntro(h.canvas, [{ id: "test", durationMs: 100 }]);
      playback[method](); await playback.done; await settleLoads();
      assert.equal(h.pending(), 0);
    }
  } finally { h.restore(); }
});

test("intro streams current/next scenes, freezes loading time, and cancels pending work", async () => {
  const h = introHarness();
  const originalImage = globalThis.Image;
  const requested: string[] = [], images = new Map<string, { onload: (() => void) | null }>();
  class FakeImage {
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    set src(value: string) { if (value) { requested.push(value); images.set(value, this); } }
  }
  Object.assign(globalThis, { Image: FakeImage });
  let playback: ReturnType<typeof playIntro> | null = null;
  try {
    const subtitles: string[][] = [];
    playback = playIntro(h.canvas, [
      { id: "first", durationMs: 100, bgSrc: "first" },
      { id: "second", durationMs: 100, bgSrc: "second", subtitles: [{ ...subtitle, startMs: 40, endMs: 60 }] },
      { id: "third", durationMs: 100, bgSrc: "third" }
    ], { onSubtitleChange: e => subtitles.push(e.lines.map(l => l.text)) });
    assert.deepEqual(requested, ["first"]);
    images.get("first")!.onload!(); await settleLoads();
    h.tick(0); await settleLoads(); assert.deepEqual(requested, ["first", "second"]);
    h.tick(150); await settleLoads(); // Waiting halfway into scene two.
    images.get("second")!.onload!(); await settleLoads();
    h.tick(1000); await settleLoads();
    assert.deepEqual(subtitles.at(-1), ["Hello"], "850ms spent loading must not advance dialogue");
    assert.deepEqual(requested, ["first", "second", "third"]);
    playback.stop(); await playback.done; await settleLoads();
    assert.equal(images.get("third")!.onload, null);
    assert.equal(h.pending(), 0);
  } finally { playback?.stop(); await settleLoads(); globalThis.Image = originalImage; h.restore(); }
});

test("a looping menu does not preload the following cutscene", async () => {
  const h = introHarness(), originalImage = globalThis.Image;
  const requested: string[] = [];
  class FakeImage {
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    set src(value: string) { if (value) { requested.push(value); queueMicrotask(() => this.onload?.()); } }
  }
  Object.assign(globalThis, { Image: FakeImage });
  const playback = playIntro(h.canvas, [
    { id: "menu", durationMs: 100, demoLoopRange: { startMs: 0, endMs: 40, resumeMs: 0 } },
    { id: "next", durationMs: 100, bgSrc: "next" }
  ]);
  try {
    playback.setDemoLoopStep("menu"); await settleLoads(); h.tick(500); await settleLoads();
    assert.deepEqual(requested, []);
    playback.exitDemoLoop(); h.tick(510); await settleLoads(); assert.deepEqual(requested, ["next"]);
  } finally { playback.stop(); await settleLoads(); globalThis.Image = originalImage; h.restore(); }
});

test("current-scene and successor load failures reject completion instead of starting gameplay", async () => {
  const h = introHarness(), originalImage = globalThis.Image;
  const pending = new Map<string, { onerror: (() => void) | null }>();
  class FakeImage {
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    set src(value: string) { if (value) pending.set(value, this); }
  }
  Object.assign(globalThis, { Image: FakeImage });
  try {
    for (const preload of [false, true]) {
      const steps: IntroStep[] = [{ id: "broken", durationMs: 100, bgSrc: "broken" }];
      if (preload) steps.unshift({ id: "current", durationMs: 100 });
      const playback = playIntro(h.canvas, steps);
      const rejected = assert.rejects(playback.done, /Failed to load image/);
      await settleLoads(); if (preload) { h.tick(0); await settleLoads(); }
      pending.get("broken")!.onerror!();
      await rejected; await settleLoads();
      assert.equal(h.pending(), 0);
    }
  } finally { await settleLoads(); globalThis.Image = originalImage; h.restore(); }
});

test("demo exit resumes the script clock and completion carries frame remainder", async () => {
  const h = introHarness();
  try {
    const events: string[][] = [], steps: string[] = [];
    const playback = playIntro(h.canvas, [
      { id: "demo", durationMs: 100, demoLoopRange: { startMs: 0, endMs: 40, resumeMs: 20 }, subtitles: [subtitle] },
      { id: "next", durationMs: 100 }
    ], { onStepChange: id => steps.push(id), onSubtitleChange: p => events.push(p.lines.map(l => l.text)) });
    playback.setDemoLoopStep("demo"); await settleLoads();
    h.tick(300); await settleLoads(); assert.deepEqual(events.at(-1), []);
    playback.exitDemoLoop(); h.tick(310); await settleLoads(); assert.deepEqual(events.at(-1), ["Hello"]);
    h.tick(399); await settleLoads(); assert.equal(steps.at(-1), "next");
    h.tick(490); await settleLoads(); await playback.done; assert.equal(h.pending(), 0);
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
