import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  createForestState,
  traceForest,
  applyForestState,
  type ForestData,
} from "../src/engine/gameplay/forest";
import { IndexedClip, parseScenePack } from "../src/engine/resources/scenePack";
import {
  buildSceneAnimStates,
  updateSceneAnims,
} from "../src/engine/scene/sceneAnims";
import { RoomScript, type RoomAction } from "../src/engine/gameplay/roomScript";
import { shufflePixels } from "../src/engine/gameplay/sceneShuffle";
import type { RoomSnapshot, SceneAnimDef } from "../src/engine/core/types";

const data = JSON.parse(
  gunzipSync(readFileSync("public/assets/forest/forest.json.gz")).toString(),
) as ForestData;
test('scene shuffle replaces every pixel exactly once in 128 DOS ticks', () => {
  const passes = shufflePixels(304, 128, () => 0.37);
  assert.equal(passes.length, 128);
  assert.ok(passes.every(pass => pass.length === 304));
  assert.equal(new Set(passes.flat().map(p => p.y * 304 + p.x)).size, 304 * 128);
});
test('fastest accelerates NPC steps while preserving dialogue and movie timing', () => {
  for (const tempo of [0.5, 1, 11 / 6]) {
    const applied: RoomAction[] = [];
    const script = new RoomScript([
      { op: 'wait', ms: 100, movement: true },
      { op: 'flag', flag: 1, value: true },
      { op: 'wait', ms: 200 },
      { op: 'flag', flag: 2, value: true },
    ], { apply: a => applied.push(a), walking: () => false, frames: () => 0, movementTempo: () => tempo });
    script.update(100 * tempo - 1);
    assert.equal(applied.length, 0);
    script.update(1);
    assert.equal(applied.length, 1);
    script.update(199);
    assert.equal(applied.length, 1);
    script.update(1);
    assert.equal(applied.length, 2);
  }
});

test('Herman hidden frames never create a second actor', () => {
  const q = quest();
  q.enter('BROKEN');
  const hidden = q.all.filter(a => a.op === 'npc' && a.shape === 88);
  assert.ok(hidden.length);
  assert.ok(hidden.every(a => a.op === 'npc' && !a.visible));
});
function quest() {
  const state = createForestState(),
    snapshot: RoomSnapshot = {
      pos: { x: 164, y: 118 },
      facing: 3,
      itemInHand: null,
      inventorySlots: [],
      sceneItems: [],
      overlays: [],
      treeSpoken: true,
    };
  const all: RoomAction[] = [];
  function run(name: string, fn: number, x = 50, y = 90) {
    const result = traceForest(data.rooms[name], fn, state, snapshot, { x, y });
    for (const a of result.actions) {
      applyForestState(state, a);
      if (a.op === "hand") snapshot.itemInHand = a.item;
      if (a.op === "item")
        snapshot.sceneItems.push({ id: a.item, x: a.x, y: a.y });
      if (a.op === "walk" || a.op === "actor")
        snapshot.pos = { x: a.x, y: a.y };
    }
    const pack = parseScenePack(
      gunzipSync(
        readFileSync(`public/assets/forest/${name.toLowerCase()}.kyr.gz`),
      ),
    );
    for (const a of result.actions)
      if (a.op === "frame" || a.op === "movie") {
        assert.ok(pack.clips[a.clip], `${name}: missing ${a.clip}`);
        if (a.op === "frame")
          assert.ok(
            a.index >= 0 && a.index < pack.clips[a.clip].frames.length,
            `${name}: ${a.clip} frame ${a.index}`,
          );
      }
    all.push(...result.actions);
    return result;
  }
  function enter(name: string) {
    snapshot.sceneItems = [];
    for (const fn of [0, 2, 3]) run(name, fn);
  }
  return { state, snapshot, run, enter, all };
}

test("original forest quest reaches the amulet and bridge through actual EMC branches", () => {
  const q = quest();
  q.state.flags.add(53);
  q.run("GEMCUT", 1, 216, 84);
  assert.equal(q.snapshot.itemInHand, "letter");
  assert.ok(q.state.flags.has(242));
  q.enter("HEALER");
  q.run("HEALER", 1);
  q.run("HEALER", 1);
  assert.ok(q.state.flags.has(129));
  assert.ok(q.all.some((a) => a.op === "confirm"));
  q.snapshot.itemInHand = null;
  q.enter("SORROW");
  q.run("SORROW", 1, 180, 40);
  assert.equal(q.snapshot.itemInHand, "teardrop");
  q.enter("SICKWIL");
  q.run("SICKWIL", 1, 152, 76);
  assert.equal(q.snapshot.itemInHand, null);
  assert.equal(q.state.files[4], "WILLOW");
  q.enter("WILLOW");
  assert.ok(q.state.flags.has(138));
  assert.ok(q.state.flags.has(66));
  for (const name of ["TRUNK", "FNORTH", "SORROW", "FORESTA", "FORESTB"])
    q.enter(name);
  assert.equal(
    q.snapshot.sceneItems.filter((i) => i.id === "marble").length,
    1,
  );
  assert.ok(!q.state.flags.has(65));
  q.enter("FORESTB");
  assert.ok(
    !q.snapshot.sceneItems.some((i) => i.id === "marble"),
    "entry cannot create a second marble",
  );
  q.enter("ALTAR");
  q.run("ALTAR", 1, 200, 56);
  assert.equal(q.snapshot.itemInHand, "rose");
  q.enter("HEALER");
  q.run("HEALER", 1);
  assert.equal(q.snapshot.itemInHand, "silverRose");
  q.snapshot.itemInHand = null;
  q.enter("BROKEN");
  q.run("BROKEN", 1, 220, 80);
  q.snapshot.itemInHand = "saw";
  q.run("BROKEN", 1, 220, 80);
  assert.equal(q.snapshot.itemInHand, null);
  assert.ok(q.state.flags.has(56));
  assert.equal(
    q.state.files[7],
    undefined,
    "saw alone cannot repair the bridge",
  );
  q.enter("XEDGE");
  assert.ok(q.state.flags.has(8));
  q.enter("ALTAR");
  q.snapshot.itemInHand = "marble";
  q.run("ALTAR", 1, 152, 32);
  assert.equal(q.snapshot.itemInHand, null);
  q.snapshot.itemInHand = "silverRose";
  q.run("ALTAR", 1, 120, 52);
  assert.equal(q.snapshot.itemInHand, null);
  assert.ok(q.state.flags.has(45));
  assert.equal(q.state.files[7], "BRIDGE");
  assert.equal(q.state.files[13], "XEDGEC");
  assert.ok(q.state.flags.has(7));
  q.enter("BRIDGE");
  q.enter("CAVEB");
  assert.ok(
    q.all.some((a) => a.op === "say" && a.text === "You can have the marble!"),
  );
  assert.ok(
    q.all.some((a) => a.op === "say" && a.text === "That must be the amulet!"),
  );
  const before = q.state.flags.size;
  const traced = traceForest(
    data.rooms.BROKEN,
    1,
    createForestState(),
    q.snapshot,
    { x: 220, y: 80 },
  );
  assert.ok(traced.actions.length);
  assert.equal(q.state.flags.size, before, "tracing is isolated from playback");
});

test("bridge repair also works when the amulet is obtained before handing over the saw", () => {
  const q = quest();
  q.state.flags.add(45);
  q.enter("BROKEN");
  q.run("BROKEN", 1, 220, 80);
  q.snapshot.itemInHand = "saw";
  q.run("BROKEN", 1, 220, 80);
  assert.equal(q.state.files[7], undefined);
  q.enter("XEDGE");
  q.enter("FORESTA");
  assert.equal(q.state.files[7], "BRIDGE");
  assert.equal(q.state.files[13], "XEDGEC");
});

test("the broken bridge waits for the actual click before committing to the fatal crossing", () => {
  const q = quest();
  q.enter("BROKEN");
  const result = q.run("BROKEN", 1, 40, 100);
  const choice = result.actions.find((a) => a.op === "choice");
  assert.ok(choice && choice.op === "choice");
  assert.ok(!result.actions.some((a) => a.op === "death"));
  const retreat = choice.resume({ x: 280, y: 110 });
  assert.ok(!retreat.some((a) => a.op === "death"));
  const fall = choice.resume({ x: 40, y: 100 });
  assert.ok(fall.some((a) => a.op === "death"));
  const pack = parseScenePack(
    gunzipSync(readFileSync("public/assets/forest/broken.kyr.gz")),
  );
  for (const a of fall)
    if (a.op === "frame") assert.ok(pack.clips[a.clip]?.frames[a.index]);
});

test("the original vase can store and return a quest item without duplication", () => {
  const q = quest();
  q.snapshot.itemInHand = "letter";
  q.run("GEMCUT", 1, 40, 100);
  assert.equal(q.snapshot.itemInHand, null);
  assert.equal(q.state.vase, 42);
  q.run("GEMCUT", 1, 40, 100);
  assert.equal(q.snapshot.itemInHand, "letter");
  assert.equal(q.state.vase, -1);
});

test("ordinary forest hotspot and held-item combinations do not invoke unimplemented operations", () => {
  for (const room of Object.values(data.rooms))
    for (const item of [
      null,
      "letter",
      "rose",
      "silverRose",
      "marble",
      "saw",
      "teardrop",
      "ruby",
    ] as const) {
      const q = quest();
      q.state.flags.add(53);
      q.snapshot.itemInHand = item;
      for (let y = 16; y < 136; y += 16)
        for (let x = 16; x < 312; x += 24)
          assert.doesNotThrow(
            () => traceForest(room, 1, q.state, q.snapshot, { x, y }),
            `${room.name}: ${item} at ${x},${y}`,
          );
    }
});

test("every packed forest frame and palette matches the imported source fixture", () => {
  const audit = JSON.parse(
    gunzipSync(readFileSync("tests/fixtures/forest-pixels.json.gz")).toString(),
  );
  let count = 0;
  for (const name of Object.keys(data.rooms)) {
    const pack = parseScenePack(
      gunzipSync(
        readFileSync(`public/assets/forest/${name.toLowerCase()}.kyr.gz`),
      ),
    );
    for (const [key, info] of Object.entries(pack.clips)) {
      const expected = audit.frames[`${name}:${key}`],
        clip = new IndexedClip(pack, info);
      assert.equal(info.frames.length, expected.count);
      for (let i = 0; i < expected.count; i++) {
        assert.equal(
          createHash("sha256")
            .update(clip.frame(i))
            .update(Uint8Array.from(info.palette))
            .digest("hex"),
          expected.hashes[i],
          `${name}:${key}:${i}`,
        );
        count++;
      }
    }
  }
  assert.ok(count > 1000);
});

test("DAT loops preserve operands, coordinates and the last visible sprite after stopping", () => {
  const anim = buildSceneAnimStates([
    {
      sprite: 0,
      defaultX: 8,
      defaultY: 8,
      flipX: false,
      play: true,
      disable: false,
      drawY: 0,
      script: [
        0xff97, 20, 0xff98, 30, 0xff8e, 2, 0xff90, 4, 0xff92, 2, 0xff8f, 0xff87,
      ],
    },
  ]);
  for (let n = 0; n < 20; n++) updateSceneAnims(anim, n * 17);
  assert.equal(anim[0].x, 26);
  assert.equal(anim[0].y, 30);
  assert.equal(anim[0].sprite, 4);
  assert.equal(anim[0].play, false);
  assert.equal(anim[0].visible, true);
  const herman = buildSceneAnimStates(data.rooms.XEDGE.anims as SceneAnimDef[]);
  herman.forEach((a) => {
    a.play = true;
    a.visible = true;
  });
  for (let n = 0; n < 100; n++) updateSceneAnims(herman, n * 17);
  assert.ok(herman[0].play);
  assert.ok(herman[1].visible);
  assert.ok(herman[1].sprite >= 4);
});

test("the note confirmation blocks later quest changes and cancellation cannot resume them", () => {
  const applied: RoomAction[] = [];
  const script = new RoomScript(
    [{ op: "confirm" }, { op: "flag", flag: 129, value: true }],
    { apply: (a) => applied.push(a), walking: () => false, frames: () => 0 },
  );
  script.update(10000);
  assert.ok(script.awaiting);
  assert.ok(!script.done);
  assert.equal(applied.length, 1);
  script.stop();
  script.confirm();
  script.update(10000);
  assert.ok(!applied.some((a) => a.op === "flag"));
});
