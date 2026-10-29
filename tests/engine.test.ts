import test from "node:test";
import './forest.test';
import './studio-logo.test';
import './book-motion.test';
import './save-storage.test';
import './localization.test';
import assert from "node:assert/strict";
import { playIntro, frameAtTime } from "../src/engine/intro/player";
import { buildIntroSteps } from "../src/engine/intro/steps";
import type { IntroStep } from "../src/engine/intro/types";
import { findWalkPath, findClickPath } from "../src/engine/gameplay/pathfinding";
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
import { decodeFrame3, decodeFrame4, applyWestwoodDelta, readPak } from "../extractor/indexed_resources.mjs";
import pixelFixtures from "./fixtures/intro-pixels.json";
import { RoomScript, type RoomAction } from "../src/engine/gameplay/roomScript";
import { brandonTalkHead, actorScaleAt } from "../src/engine/characters/brandonFrames";
import { parseEmc, runEmc } from "../extractor/emc.mjs";
import { vocDuration } from "../extractor/opening.mjs";
import opening from "../public/assets/packs/opening.json";
import openingPixels from "./fixtures/opening-pixels.json";
import { roomPortals, nearestFloor, type WorldRoom } from "../src/engine/gameplay/world";
import worldData from "../public/assets/world/world.json";
import { portalAtPoint, portalMarker } from "../src/engine/gameplay/navigation";
import { gemCutScene } from "../src/engine/scenes/gemCut";
import { validateWorldSave } from "../src/engine/gameplay/saveStorage";
import { locale, setLocale } from "../src/i18n";

test("skipping a line releases speech waits without skipping movies, walks or decisions", () => {
  const applied: RoomAction[] = [];
  const say: RoomAction = { op: 'say', text: 'First', voiceId: 1, ms: 5000, x: 160, y: 60, color: 1, blocking: true };
  const script = new RoomScript([say, { op: 'movie', clip: 'liftup', x: 0, y: 0, ticks: 6 }, { ...say, text: 'Second' }, { op: 'confirm' }], {
    apply: action => applied.push(action), walking: () => false, frames: () => 3
  });
  script.update(0);
  assert.equal(script.skipLine(), true);
  script.update(0);
  assert.equal(applied.at(-1)?.op, 'frame');
  assert.equal(script.skipLine(), false);
  script.update(299);
  assert.equal(applied.filter(a => a.op === 'say').length, 1);
  script.update(1);
  assert.equal(applied.filter(a => a.op === 'say').length, 2);
  script.skipLine(); script.update(0);
  assert.equal(script.awaiting, true);
  assert.equal(script.skipLine(), false);
  assert.equal(script.done, false);
  script.stop(); assert.equal(script.skipLine(), false);
});

test("skipping a tree line immediately finishes its mouth frames and retains the final pose", () => {
  const applied: RoomAction[] = [];
  const script = new RoomScript([
    { op: 'say', text: 'Tree', voiceId: 1, ms: 5000, x: 160, y: 60, color: 1, blocking: false },
    { op: 'movie', clip: 'face', x: 0, y: 0, ticks: 6 }, { op: 'waitVoice' }, { op: 'message', text: 'Ready' }
  ], { apply: a => applied.push(a), walking: () => false, frames: () => 3 });
  script.update(0); script.skipLine(); script.update(0);
  assert.equal(script.done, true);
  assert.equal(applied.filter(a => a.op === 'frame').length, 3);
});

test('original tree dialogue advances to the next line after skipping its WSA speech', () => {
  const actions = opening.tree as RoomAction[];
  const lines = actions.filter(a=>a.op==='say');
  const seen: RoomAction[]=[];
  const script=new RoomScript(actions,{apply:a=>seen.push(a),walking:()=>false,frames:()=>1});
  let elapsed=0;
  while(!script.done&&elapsed<60000){script.update(50);script.skipLine();elapsed+=50;}
  assert.equal(script.done,true);
  assert.deepEqual(seen.filter(a=>a.op==='say'),lines);
  assert.ok(elapsed<10000,`Skipped dialogue still took ${elapsed} ms`);
});

test("exit markers use actual available portals, including doors and corner precedence", () => {
  for (const room of worldData.rooms as WorldRoom[]) {
    const pack = parseScenePack(gunzipSync(readFileSync(`public/assets/world/${room.id}.kyr.gz`)));
    const clip = new IndexedClip(pack, pack.clips.mask);
    const portals = roomPortals(room, { width: 320, height: 144, pixels: Array.from(clip.frame(0)) });
    for (const portal of portals) {
      const marker = portalMarker(portal);
      assert.ok(marker.x >= 20 && marker.x <= 300 && marker.y >= 20 && marker.y <= 116);
    }
    if (room.id === 7) assert.equal(portals.some(p => p.side === 'west'), false);
    assert.equal(portalAtPoint(portals, {x: 160, y: 170}), undefined);
    assert.equal(portalAtPoint(portals, null), undefined);
  }
});

test("Kallak hand tracks keep original x coordinates and the shared viewport offset", () => {
  const step = buildIntroSteps().find(step => step.id === 'kallak_writing')!;
  assert.deepEqual(step.overlayFrames!.positions!.slice(0, 3), [{x:149,y:24},{x:148,y:19},{x:147,y:12}]);
});

test("Westwood RLE decodes forest literals, short fills and big-endian long fills", () => {
  const bytes = new Uint8Array([3, 1, 2, 3, 253, 9, 0, 1, 0, 7]);
  const decoded = decodeFrame3(bytes, 262);
  assert.deepEqual([...decoded.subarray(0, 6)], [1, 2, 3, 9, 9, 9]);
  assert.ok(decoded.subarray(6).every((v: number) => v === 7));
  assert.throws(() => decodeFrame3(bytes.subarray(0, 9), 262), /Truncated/);
  assert.throws(() => decodeFrame3(bytes, 10), /Invalid/);
  const scale = { fromY: 56, fromScale: 192, toY: 92, toScale: 256 };
  assert.equal(actorScaleAt(40, scale), 0.75); assert.equal(actorScaleAt(100, scale), 1);
  assert.equal(actorScaleAt(74, scale), 224 / 256);
});

test("all forest exits have reachable approaches from every arrival, and the broken bridge stays closed", () => {
  const rooms = worldData.rooms as WorldRoom[];
  for (const room of rooms) {
    const bytes = readFileSync(`public/assets/world/${room.id}.kyr.gz`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), worldData.rooms[room.id].sha256);
    const pack = parseScenePack(gunzipSync(bytes));
    const clip = new IndexedClip(pack, pack.clips.mask);
    const mask = { width: 320, height: 144, pixels: Array.from(clip.frame(0)) };
    const scene = { uiMaskY: 136 } as SceneConfig;
    const portals = roomPortals(room, mask);
    for (const from of portals) for (const to of portals) {
      const arrival = nearestFloor(mask, from.point);
      const path = findWalkPath(arrival, to.point, p => isWalkable(p, scene, mask));
      assert.deepEqual(path.at(-1) ?? arrival, to.point, `${room.id} ${room.name}: ${from.id} -> ${to.id}`);
      assert.ok(rooms.some(r => r.id === to.target));
    }
    if (room.id === 7) {
      assert.equal(portals.some(p => p.side === "west"), false);
      const path = findWalkPath(nearestFloor(mask, { x: 280, y: 116 }), { x: 40, y: 116 }, p => isWalkable(p, scene, mask));
      assert.ok(!path.length || path.at(-1)!.x > 150, "Brandon cannot walk through the broken bridge's gap");
    }
  }
});

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
  const clips: unknown[][] = [];
  const ctx = new Proxy({}, { get: (_, key) => key === "drawImage" ? (...args: unknown[]) => draws.push(args) : key === "fillRect" ? (...args: unknown[]) => rectangles.push(args) : key === 'rect' ? (...args: unknown[]) => clips.push(args) : key === "fillText" ? () => textDraws++ : key === "measureText" ? (s: string) => ({ width: s.length * 6 }) : () => {} });
  const canvas = { getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, draws, rectangles, clips, textDraws: () => textDraws,
    tick(ms: number) { now = ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb(now)); },
    pending: () => frames.size,
    restore() { Object.assign(globalThis, original); }
  };
}
const subtitle = { text: "Hello", startMs: 20, endMs: 80, y: 180 };

test('the Malcolm story uses the selected bitmap, switches language without restarting and keeps its fades', async () => {
  const h = introHarness(), originalImage = globalThis.Image, previousLanguage = locale.value;
  const requested: string[] = [], alphas: number[] = [];
  class FakeImage {
    onload: (() => void) | null = null; onerror: (() => void) | null = null; source = '';
    set src(value: string) { this.source = value; requested.push(value); queueMicrotask(() => this.onload?.()); }
  }
  Object.assign(globalThis, { Image: FakeImage });
  const story = buildIntroSteps().find(step => step.id === 'story_text')!;
  const playback = playIntro(h.canvas, [story], { onSubtitleChange: payload => alphas.push(payload.alpha) });
  try {
    setLocale('ru'); await settleLoads(); h.tick(125);
    assert.deepEqual(requested, [story.bgSrc, story.bgSrcRu]);
    assert.equal((h.draws.at(-1)![0] as FakeImage).source, '/assets/intro/text-ru.png');
    assert.equal(alphas.at(-1), 0.5);
    setLocale('en'); h.tick(250);
    assert.equal((h.draws.at(-1)![0] as FakeImage).source, '/assets/intro/text.png');
    setLocale('ru'); h.tick(story.durationMs - 125);
    assert.equal((h.draws.at(-1)![0] as FakeImage).source, '/assets/intro/text-ru.png');
    assert.equal(alphas.at(-1), 0.5);
    assert.equal(h.textDraws(), 0, 'the translation must be a bitmap, not canvas text');
  } finally { playback.stop(); await settleLoads(); globalThis.Image = originalImage; setLocale(previousLanguage); h.restore(); }
});

test("the Kallak book opens only after its scene is drawn and can resume the original intro", async () => {
  const h = introHarness();
  try {
    const ready: string[] = [];
    const playback = playIntro(h.canvas, [{ id: 'kallak_writing', durationMs: 100, demoLoopRange: { startMs: 0, endMs: 90, resumeMs: 0 } }, { id: 'kallak_malcolm', durationMs: 100 }], {
      onStepChange: id => { if (id === 'kallak_writing') playback.setDemoLoopStep(id); },
      onStepReady: id => { assert.ok(h.rectangles.length); ready.push(id); if (id === 'kallak_writing') playback.setPaused(true); }
    });
    await settleLoads(); h.tick(1);
    assert.deepEqual(ready, ['kallak_writing']); assert.equal(h.pending(), 0);
    h.tick(10000); assert.deepEqual(ready, ['kallak_writing']);
    playback.exitDemoLoop(); playback.setPaused(false); h.tick(10001); h.tick(10102); await settleLoads(); h.tick(10103);
    assert.deepEqual(ready, ['kallak_writing', 'kallak_malcolm']);
    playback.stop(); await playback.done;
  } finally { h.restore(); }
});

test("book pause freezes intro frames and subtitles without consuming elapsed time", async () => {
  const h = introHarness();
  try {
    const events: string[][] = [];
    const playback = playIntro(h.canvas, [{ id: 'talk', durationMs: 200, subtitles: [subtitle] }], { onSubtitleChange: p => events.push(p.lines.map(l => l.text)) });
    await settleLoads(); h.tick(30); await settleLoads();
    assert.deepEqual(events.at(-1), ['Hello']);
    playback.setPaused(true);
    const drawCount = h.draws.length;
    h.tick(10000); playback.skipLine();
    assert.equal(h.pending(), 0);
    assert.equal(h.draws.length, drawCount);
    assert.deepEqual(events.at(-1), ['Hello']);
    playback.setPaused(false); h.tick(10020);
    assert.deepEqual(events.at(-1), ['Hello']);
    h.tick(10060); assert.deepEqual(events.at(-1), []);
    playback.stop(); await playback.done;
    assert.equal(h.pending(), 0);
  } finally { h.restore(); }
});

test("intro click skips the current subtitle but preserves the following scene", async () => {
  const h = introHarness();
  try {
    const events: string[][] = [];
    const playback = playIntro(h.canvas, [{ id: 'talk', durationMs: 500, subtitles: [subtitle, { ...subtitle, text: 'Next', startMs: 100, endMs: 200 }] }], { onSubtitleChange: p => events.push(p.lines.map(l => l.text)) });
    await settleLoads(); h.tick(30); playback.skipLine(); h.tick(31);
    assert.deepEqual(events.at(-1), []);
    h.tick(51); assert.deepEqual(events.at(-1), ['Next']);
    playback.stop(); await playback.done;
  } finally { h.restore(); }
});

test("intro masks sprite overflow from row 136, while full-screen logos remain uncovered", async () => {
  const h = introHarness();
  try {
    for (const id of ["kallak_writing", "kallak_malcolm", "tree_anim_1", "westwood", "akulaflow", "shore_anim"]) {
      h.rectangles.length = 0;
      const playback = playIntro(h.canvas, [{ id, durationMs: 1000 }]);
      await settleLoads(); h.tick(30); await settleLoads();
      const mask = h.rectangles.filter(r => r[1] !== 0);
      assert.deepEqual(mask, ["westwood", "akulaflow", "shore_anim"].includes(id) ? [] : [[0, 136, 320, 64]], id);
      playback.stop(); await playback.done;
    }
  } finally { h.restore(); }
});

test("clicking the AkulaFlow logo advances to the story without skipping the cutscene", async () => {
  const h = introHarness();
  try {
    const visited: string[] = [];
    const playback = playIntro(h.canvas, [{ id: 'akulaflow', durationMs: 12476 }, { id: 'story', durationMs: 500 }], { onStepChange: id => visited.push(id) });
    await settleLoads(); h.tick(30); await settleLoads();
    playback.skipLine(); h.tick(31); await settleLoads();
    assert.deepEqual(visited, ['akulaflow', 'story']);
    assert.equal(h.pending(), 1);
    playback.stop(); await playback.done;
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

test('scenery clicks approach reachable floor around obstacles without crossing isolated islands or thin walls', () => {
  const start = {x:40,y:40}, target = {x:100,y:20};
  const floor = (p:Vec2) => p.x>=20 && p.x<=120 && p.y>=20 && p.y<=80 && !(p.x>=60 && p.x<=80 && p.y<60) && !(p.x>88 && p.y<32);
  const route = findClickPath(start,target,floor);
  assert.deepEqual(route.at(-1), {x:100,y:32});
  assert.ok(route.some(p=>p.y>=60), 'walk around the wall instead of stopping on its near side');
  assert.ok(route.every(floor));
  const islands = (p:Vec2) => p.y>=20 && p.y<=60 && ((p.x>=20&&p.x<=60)||(p.x>=100&&p.x<=120));
  assert.deepEqual(findClickPath(start,{x:104,y:40},islands).at(-1),{x:60,y:40});
  const thinWall = (p:Vec2) => p.x>=20&&p.x<=60&&p.y>=20&&p.y<=60&&p.y!==41;
  assert.deepEqual(findClickPath(start,{x:40,y:50},thinWall),[]);
  let improved=0;
  for(const room of worldData.rooms as WorldRoom[]) {
    const pack=parseScenePack(gunzipSync(readFileSync(`public/assets/world/${room.id}.kyr.gz`)));
    const clip=new IndexedClip(pack,pack.clips.mask),mask={width:clip.info.width,height:clip.info.height,pixels:Array.from(clip.frame(0))};
    const from=nearestFloor(mask,room.entrances.south),passable=(p:Vec2)=>isWalkable(p,{...scene,uiMaskY:136},mask);
    for(const point of [{x:40,y:30},{x:160,y:40},{x:280,y:60}]) {
      const path=findClickPath(from,point,passable),old=findWalkPath(from,point,passable);
      assert.ok(path.every(passable),room.name);
      const end=path.at(-1)??from,previous=old.at(-1)??from;
      const distance=(p:Vec2)=>Math.hypot(p.x-point.x,p.y-point.y);
      assert.ok(distance(end)<=distance(previous)+0.001,room.name);
      if(distance(end)<distance(previous))improved++;
    }
  }
  assert.ok(improved>0,'real off-path clicks must improve');
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

test("repeated movement clicks preserve pace and inventory cancels a pending exit", async () => {
  const h = introHarness(), original = { Image: globalThis.Image, fetch: globalThis.fetch };
  class FakeImage {
    onload = () => {}; width = 320; height = 200;
    set src(_: string) { queueMicrotask(() => this.onload()); }
  }
  Object.assign(globalThis, { Image: FakeImage, fetch: async () => ({ ok: true, json: async () => ({}) }) });
  try {
    const positions: Vec2[] = [];
    for (const repeated of [false, true]) {
      const game = await startGame(h.canvas, { scene });
      const start = performance.now();
      game.setTarget({ x: 40, y: 120 });
      for (let i = 1; i <= 60; i++) {
        if (repeated && !game.handleClick({ x: 40, y: 120 })) game.setTarget({ x: 40, y: 120 });
        h.tick(start + i * 1000 / 60);
      }
      positions.push(game.getSnapshot().pos); game.stop();
    }
    assert.deepEqual(positions[1], positions[0], "clicking every frame must not accelerate Brandon");
    let exits = 0;
    const portal = { id: 'east', side: 'east' as const, target: 1, point: { x: 168, y: 120 }, rect: { x: 300, y: 8, w: 20, h: 128 } };
    const game = await startGame(h.canvas, { scene, portals: [portal], onExit: () => exits++ });
    const start = performance.now();
    game.handleClick({ x: 310, y: 120 }); h.tick(start + 1);
    assert.equal(game.getSnapshot().pos.x, 164);
    game.handleClick({ x: 100, y: 165 }); h.tick(start + 2);
    assert.equal(exits, 0, "an inventory click cancels the exit even one step from its point");
    game.stop();
  } finally { Object.assign(globalThis, original); h.restore(); }
});

test("the original falling leaf has the same entry animation at 30, 60 and 144 Hz", async () => {
  const forest = JSON.parse(gunzipSync(readFileSync('public/assets/forest/forest.json.gz')).toString());
  const poses: unknown[][] = [];
  for (const hz of [30, 60, 144]) {
    const h = introHarness(), original = { Image: globalThis.Image, fetch: globalThis.fetch };
    class FakeImage {
      onload = () => {}; width = 320; height = 200; source = '';
      set src(value: string) { this.source = value; queueMicrotask(() => this.onload()); }
    }
    Object.assign(globalThis, { Image: FakeImage, fetch: async () => ({ ok: true, json: async () => ({}) }) });
    try {
      const game = await startGame(h.canvas, { scene: { ...scene, meta: forest.rooms.FORESTA }, entryActions: [{ op: 'ambientRun', index: 0 }] });
      for (let i = 1; i <= hz * 4; i++) h.tick(i * 1000 / hz);
      const leaf = h.draws.filter(a => (a[0] as FakeImage).source === 'background' && a.length === 9).at(-1);
      assert.ok(leaf); poses.push(leaf.slice(1)); game.stop();
    } finally { Object.assign(globalThis, original); h.restore(); }
  }
  assert.deepEqual(poses[0], poses[1]); assert.deepEqual(poses[1], poses[2]);
});

test("loading or cancelling the next room leaves the current canvas intact", async () => {
  const h = introHarness(), original = { Image: globalThis.Image, fetch: globalThis.fetch };
  let resized = 0;
  Object.defineProperties(h.canvas, { width: { set: () => resized++ }, height: { set: () => resized++ } });
  const images: { onload: () => void }[] = [];
  class FakeImage {
    onload = () => {};
    set src(_: string) { images.push(this); }
  }
  Object.assign(globalThis, { Image: FakeImage, fetch: async () => ({ ok: true, json: async () => ({}) }) });
  try {
    const controller = new AbortController();
    const loading = startGame(h.canvas, { scene, signal: controller.signal });
    await settleLoads();
    const beforeCancel = resized;
    controller.abort(); images.forEach(image => image.onload());
    await assert.rejects(loading, { name: 'AbortError' });
    assert.equal(beforeCancel, 0, "resizing clears the old scene before new assets are ready");
    assert.equal(resized, 0); assert.equal(h.pending(), 0);
  } finally { Object.assign(globalThis, original); h.restore(); }
});

test('pausing freezes movement, ambient animation, script waits and input without a resume time jump', async () => {
  const h = introHarness(), original = { Image: globalThis.Image, fetch: globalThis.fetch };
  class FakeImage {
    onload = () => {}; width = 320; height = 200;
    set src(_: string) { queueMicrotask(() => this.onload()); }
  }
  Object.assign(globalThis, { Image: FakeImage, fetch: async () => ({ ok: true, json: async () => ({}) }) });
  try {
    const game = await startGame(h.canvas, { scene: { ...scene, meta: worldData.rooms[0] }, paused: true });
    assert.ok(h.draws.length, 'the paused first frame is drawn before startGame resolves');
    assert.equal(h.pending(), 0);
    game.setTarget({ x: 40, y: 120 });
    h.tick(20000);
    assert.deepEqual(game.getSnapshot().pos, { x: 160, y: 120 }, 'paused input cannot move Brandon');
    game.setPaused(false);
    game.setTarget({ x: 40, y: 120 });
    h.tick(20100);
    game.setPaused(true);
    const before = game.getSnapshot(), draws = h.draws.length;
    h.tick(90000); game.handleClick({ x: 100, y: 165 });
    assert.deepEqual(game.getSnapshot(), before);
    assert.equal(h.draws.length, draws, 'a paused game does not keep rendering');
    game.setPaused(false); h.tick(90010);
    assert.equal(game.getSnapshot().runtime!.clockMs, before.runtime!.clockMs + 10);
    assert.deepEqual(game.getSnapshot().pos, before.pos, 'the menu duration cannot become movement time');
    game.runSequence([{ op: 'wait', ms: 500 }, { op: 'actor', x: 88, y: 120, facing: 5, visible: true }]);
    h.tick(90110); game.setPaused(true);
    assert.equal(game.getSaveSnapshot(), null, 'a transient script cannot be saved, even while paused');
    const duringScript = game.getSnapshot();
    h.tick(190000); assert.deepEqual(game.getSnapshot(), duringScript);
    game.setPaused(false); h.tick(190010);
    assert.notEqual(game.getSnapshot().pos.x, 88, 'the script wait survives the pause');
    for (let i = 1; i <= 4; i++) h.tick(190010 + i * 100);
    assert.equal(game.getSnapshot().pos.x, 88);
    assert.ok(game.getSaveSnapshot());
    const detached = game.getSnapshot(); detached.pos.x = 0; detached.runtime!.sceneAnims[0].sprite = 65000;
    assert.equal(game.getSnapshot().pos.x, 88);
    assert.notEqual(game.getSnapshot().runtime!.sceneAnims[0].sprite, 65000);
    game.stop();
  } finally { Object.assign(globalThis, original); h.restore(); }
});

test('world saves restore visited props, quest files, NPCs and inventory without replay; failed loading preserves the old game', async () => {
  const h = introHarness(), original = { Image: globalThis.Image, fetch: globalThis.fetch, document: globalThis.document };
  let now = 0, blockedPath = '', location = -1, sequence = false;
  const requests: { url: string; signal?: AbortSignal | null }[] = [];
  class FakeImage {
    onload = () => {}; width = 320; height = 200;
    set src(_: string) { queueMicrotask(() => this.onload()); }
  }
  function internalCanvas() {
    const context = new Proxy({}, { get: (_, key) => key === 'createImageData' || key === 'getImageData'
      ? (...args: number[]) => ({ data: new Uint8ClampedArray((args.length === 2 ? args[0] * args[1] : args[2] * args[3]) * 4) })
      : key === 'measureText' ? (value: string) => ({ width: value.length * 6 }) : () => {} });
    return { width: 320, height: 200, addEventListener() {}, removeEventListener() {}, getContext: (kind: string) => kind === '2d' ? context : null };
  }
  Object.assign(globalThis, { Image: FakeImage, document: { createElement: internalCanvas }, fetch: async (url: string, options?: RequestInit) => {
    options?.signal?.throwIfAborted();
    requests.push({ url, signal: options?.signal });
    if (blockedPath && url.includes(blockedPath)) throw new Error('Simulated network failure');
    return new Response(new Uint8Array(readFileSync(`public/${url.replace(/^\//, '')}`)));
  } });
  const tick = () => h.tick(now += 100);
  async function until(check: () => boolean, message: string) {
    for (let i = 0; i < 1000; i++) { await settleLoads(); tick(); if (check()) return; }
    assert.fail(message);
  }
  const config = { scene: gemCutScene, world: '/assets/world/world.json', playOpening: false,
    onLocationChange: (_: string, id?: number) => { location = id!; }, onSequenceChange: (value: boolean) => { sequence = value; } };
  const games: Awaited<ReturnType<typeof startGame>>[] = [];
  try {
    for (const x of [8, 24, 160, 296, 311]) {
      const firstExit = await startGame(h.canvas, config); games.push(firstExit);
      firstExit.setWalkSpeed('fastest');
      firstExit.runSequence([{ op: 'hand', item: 'letter' }]); tick();
      firstExit.handleClick({ x, y: 134 });
      assert.equal(sequence, true, `the first exit at x=${x} must start the tree, even with an item in hand`);
      assert.equal(location, 0);
      assert.equal(firstExit.getSnapshot().treeSpoken, false, 'the quest flag commits only after the conversation completes');
      assert.equal(firstExit.getSaveState(), null);
      firstExit.stop();
    }
    const game = await startGame(h.canvas, config); games.push(game);
    game.handleClick({ x: 248, y: 82 }); game.handleClick({ x: 100, y: 165 });
    assert.equal(game.getSnapshot().inventorySlots[0], 'ruby');
    game.handleClick({ x: 150, y: 50 });
    await until(() => { if (sequence) game.handleClick({ x: 160, y: 100 }); return !sequence; }, 'tree conversation did not finish');
    assert.equal(game.getSnapshot().treeSpoken, true);
    game.runSequence([
      { op: 'flag', flag: 53, value: true }, { op: 'flag', flag: 45, value: true }, { op: 'vase', item: 42 },
      { op: 'sceneFile', room: 7, name: 'BRIDGE' }, { op: 'sceneFile', room: 13, name: 'XEDGEC' },
      { op: 'npc', character: 2, room: 7, x: 224, y: 94, facing: 5, shape: 87, visible: false },
      { op: 'npc', character: 1, room: 10, x: 40, y: 110, facing: 3, shape: 41, visible: false },
    ]); tick();
    game.setAtmosphere(false); game.setWalkSpeed('slow'); game.setAnimStepInterval(3);
    game.runSequence([{ op: 'exit', target: 7, entry: { x: 280, y: 110 } }]);
    await until(() => location === 7 && !sequence && !!game.getSaveState(), 'bridge did not become ready');
    game.runSequence([{ op: 'hand', item: 'marble' }, { op: 'item', item: 'saw', x: 270, y: 115 }]); tick();
    game.setPaused(true);
    const saved = validateWorldSave(game.getSaveState());
    assert.deepEqual(Object.keys(saved.rooms), ['0', '7']);
    assert.equal(saved.rooms[0].treeSpoken, true);
    assert.ok(!saved.rooms[0].sceneItems.some(item => item.id === 'ruby'));
    assert.equal(saved.rooms[7].inventorySlots[0], 'ruby'); assert.equal(saved.rooms[7].itemInHand, 'marble');
    assert.equal(saved.quest.vase, 42); assert.equal(saved.quest.files[7], 'BRIDGE'); assert.equal(saved.quest.files[13], 'XEDGEC');
    assert.ok(saved.quest.flags.includes(45));
    assert.deepEqual(saved.settings, { atmosphere: false, walkSpeed: 'slow', animStepInterval: 3 });
    const detached = game.getSaveState()!; detached.quest.flags.length = 0; detached.rooms[0].sceneItems.push({ id: 'ruby', x: 0, y: 0 });
    assert.deepEqual(game.getSaveState(), saved, 'saving returns isolated room and quest data');

    const events: string[] = [], navigationErrors: string[] = [], firstFrameDraws = h.draws.length;
    const loaded = await startGame(h.canvas, { ...config, saveState: saved, paused: true,
      onNavigationError: error => { if (error) navigationErrors.push(error); },
      onSequenceChange: active => { if (active) events.push('sequence'); }, onSubtitleChange: lines => { if (lines.length) events.push('dialogue'); } });
    games.push(loaded);
    const loadedSignal = requests.filter(request => request.url === config.world).at(-1)!.signal;
    const requestCount = (url: string) => requests.filter(request => request.signal === loadedSignal && request.url === url).length;
    assert.equal(requestCount('/assets/world/9.kyr.gz'), 1, 'the neighbouring forest prepares while the restored bridge is still paused');
    assert.equal(requestCount('/assets/forest/caveb.kyr.gz'), 1, 'the repaired bridge prepares its actual west exit');
    assert.ok(h.draws.length > firstFrameDraws, 'the restored first frame is ready before returning');
    assert.deepEqual(events, [], 'loading runs no opening or entry dialogue');
    assert.deepEqual(loaded.getSaveState(), saved);
    assert.equal(new Set(loaded.getSnapshot().runtime!.npcs.map(npc => npc.character)).size, loaded.getSnapshot().runtime!.npcs.length, 'each NPC has one draw state');
    const oldState = game.getSaveState(), oldDraws = h.draws.length;
    blockedPath = '/assets/forest/bridge.kyr.gz';
    await assert.rejects(startGame(h.canvas, { ...config, saveState: saved, paused: true }), /Simulated network failure/);
    blockedPath = '';
    const incompatible = structuredClone(saved);
    incompatible.rooms[7].runtime!.sceneAnims.push(structuredClone(saved.rooms[0].runtime!.sceneAnims[0]));
    await assert.rejects(startGame(h.canvas, { ...config, saveState: incompatible, paused: true }), /room's animations/);
    assert.deepEqual(game.getSaveState(), oldState); assert.equal(h.draws.length, oldDraws, 'failed loading leaves the paused scene intact');
    blockedPath = '/assets/world/1.kyr.gz';
    loaded.setPaused(false);
    loaded.runSequence([{ op: 'exit', target: 0, entry: { x: 160, y: 120 } }]);
    await until(() => location === 0 && !!loaded.getSaveState(), 'return to the saved home did not finish');
    assert.equal(loaded.getSnapshot().treeSpoken, true);
    assert.ok(!loaded.getSnapshot().sceneItems.some(item => item.id === 'ruby'), 'collected props cannot respawn across a save/load and return');
    assert.equal(loaded.getSnapshot().inventorySlots[0], 'ruby');
    assert.equal(loaded.getSnapshot().itemInHand, 'marble');
    await settleLoads();
    assert.equal(requestCount('/assets/world/1.kyr.gz'), 1, 'home prepares its exit before the player asks to leave');
    assert.deepEqual(navigationErrors, [], 'a speculative loading failure must not interrupt the current scene');
    blockedPath = '';
    loaded.runSequence([{ op: 'exit', target: 1, entry: { x: 208, y: 110 } }]);
    await until(() => location === 1 && !!loaded.getSaveState(), 'entrance must retry the failed neighbour prefetch');
    assert.equal(requestCount('/assets/world/1.kyr.gz'), 2);
    loaded.runSequence([{ op: 'exit', target: 0, entry: { x: 160, y: 120 } }]);
    await until(() => location === 0 && !!loaded.getSaveState(), 'cached home did not become ready');
    assert.equal(requestCount('/assets/forest/gemcut.kyr.gz'), 1, 'returning reuses the decoded room, including an in-flight neighbour request');
    assert.equal(requestCount('/assets/world/1.kyr.gz'), 2, 'a successful cached neighbour is not fetched again');

    // Self-use follows the original _NPC.EMC branches, in any room.
    const heard: string[] = [], notes: boolean[] = [];
    const letterGame = await startGame(h.canvas, { ...config, saveState: saved, paused: false,
      onSubtitleChange: lines => heard.push(...lines.map(line => line.text)), onNoteChange: visible => notes.push(visible) });
    games.push(letterGame);
    letterGame.runSequence([{ op: 'actor', x: 280, y: 110, facing: 5, visible: true }, { op: 'hand', item: 'letter' }]); tick();
    letterGame.handleClick({ x: 280, y: 80 });
    await until(() => { if (sequence) letterGame.handleClick({ x: 280, y: 80 }); return !sequence; }, 'sealed letter speech did not finish');
    assert.deepEqual(heard, ["Hmm?  Blank, except it has Brynn's name on it!", "I'd better go to the temple.", 'Brynn will know what to do!']);
    assert.equal(letterGame.getSnapshot().itemInHand, 'letter');
    letterGame.runSequence([{ op: 'flag', flag: 129, value: true }]); tick();
    letterGame.handleClick({ x: 280, y: 80 }); tick();
    assert.equal(notes.at(-1), true); assert.equal(letterGame.getSnapshot().itemInHand, null);
    for (let i=0;i<50;i++) tick();
    assert.equal(sequence, true, 'the readable note waits for a click');
    letterGame.handleClick({ x: 280, y: 80 }); tick();
    assert.equal(notes.at(-1), false); assert.equal(letterGame.getSnapshot().itemInHand, 'letter');

    letterGame.runSequence([{ op: 'npc', character: 1, room: 7, x: 60, y: 100, shape: 41, facing: 5, visible: true }]);
    h.clips.length = 0; tick();
    assert.ok(h.clips.some(rect => rect[0] === 48 && rect[1] === 52 && rect[2] === 24 && rect[3] === 48), 'Merith restores foreground only over his own sprite, independently of Brandon');
  } finally { for (const game of games) game.stop(); Object.assign(globalThis, original); h.restore(); }
});
