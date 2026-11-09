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
test('a falling Sorrow drop holds its last visible position until the splash frame', () => {
  const anims = buildSceneAnimStates(data.rooms.SORROW.anims.slice(0, 1));
  const [drop] = anims;
  for (let ms = 1; ms < 4000 && drop.y !== 114; ms += 17) updateSceneAnims(anims, ms);
  assert.equal(drop.y, 114, 'the last Y increment updates only the DAT cursor');
  assert.equal(drop.renderY, 106, 'the last visible drop does not overshoot its splash');
  assert.equal(drop.sprite, 3);
});
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
        readFileSync(name === 'GEM' ? 'public/assets/world/1.kyr.gz' : `public/assets/forest/${name.toLowerCase()}.kyr.gz`),
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

test('Darm and Brandywine use separate dialogue anchors and the original Darm talk animation', () => {
  const q = quest();
  q.enter('SPELL');
  const first = q.run('SPELL', 1, 130, 76).actions;
  const lines = first.flatMap(action => action.op === 'say' ? [[action.voiceId, action.speaker, action.x, action.y]] : []);
  assert.deepEqual(lines[0].slice(0, 2), [42, 0]);
  assert.deepEqual(lines.slice(1, 3), [[43, 'brandywine', 140, 52], [44, 8, 140, 36]]);
  assert.ok(first.some(action => action.op === 'frame' && action.clip === 'brandyw3' && action.index === 19));
  const repeat = q.run('SPELL', 1, 130, 76).actions;
  const delivered: RoomAction[] = [];
  const script = new RoomScript(repeat, { apply: action => delivered.push(action), walking: () => false, frames: () => 0 });
  while (!delivered.some(action => action.op === 'say') && !script.done) script.update(50);
  const line = delivered.find(action => action.op === 'say')!;
  assert.equal(line.voiceId, 71);
  assert.equal(line.speaker, 8);
  assert.deepEqual([line.x, line.y, line.color], [140, 36, 85]);
  const visible = (index: number) => delivered.filter(action => action.op === 'ambient' && action.internal && action.index === index)
    .map(action => action.op === 'ambient' && action.enabled);
  assert.deepEqual(visible(5), [false]);
  assert.deepEqual(visible(6), [true]);
  assert.equal(script.skipLine(), true);
  script.update(0);
  assert.deepEqual(visible(5).slice(0, 2), [false, true]);
  assert.deepEqual(visible(6).slice(0, 2), [true, false]);
});

test('the original grotto script branches at the knife and the flute reopens the cave', () => {
  const { state, snapshot } = quest();
  const dragon = data.rooms.DRAGON;
  const door = { x: 256, y: 90 };
  const scene = traceForest(dragon, 1, state, snapshot, door, () => true, [], -5);
  const choice = scene.actions.find(action => action.op === 'choice');
  assert.ok(choice && scene.handled);
  assert.ok(choice.resume({ x: 160, y: 94 }).some(action => action.op === 'death'));
  const survived = choice.resume({ x: 42, y: 80 });
  assert.ok(!survived.some(action => action.op === 'death'));
  for (const action of survived) applyForestState(state, action);
  assert.ok(state.flags.has(71) && state.flags.has(82));

  snapshot.itemInHand = 'item-55';
  const flute = traceForest({ ...dragon, ...data.flute }, 0, state, snapshot);
  assert.ok(flute.actions.some(action => action.op === 'heroFrame' && action.clip === 'flute'));
  assert.ok(flute.actions.some(action => action.op === 'frame' && action.clip === 'shatter' && action.permanent));
  for (const action of flute.actions) applyForestState(state, action);
  assert.ok(!state.flags.has(82));
});

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
  q.run("GEMCUT", 1, 40, 100);
  assert.equal(q.snapshot.itemInHand, "apple");
  assert.equal(q.state.vase, -1);
  assert.ok(q.all.some(a => a.op === 'say' && a.voiceId === 43));
  assert.ok(data.self[38].some(a => a.op === 'hand' && a.item === 'appleEaten'));
  q.snapshot.itemInHand = null;
  q.run("GEMCUT", 1, 40, 100);
  assert.equal(q.snapshot.itemInHand, null, "the vase starts with only one apple");
  q.snapshot.itemInHand = "letter";
  q.run("GEMCUT", 1, 40, 100);
  assert.equal(q.snapshot.itemInHand, null);
  assert.equal(q.state.vase, 42);
  q.run("GEMCUT", 1, 40, 100);
  assert.equal(q.snapshot.itemInHand, "letter");
  assert.equal(q.state.vase, -1);
});

test('the treehouse platform runs its original hotspots and lift sound cues', () => {
  const q = quest();
  const lamp = q.run('GEM', 1, 244, 41);
  assert.equal(lamp.handled, true);
  assert.deepEqual(lamp.actions.flatMap(a => a.op === 'say' ? [a.voiceId] : []), [5, 6]);
  q.state.flags.add(52);
  const arrival = q.run('GEM', 2).actions;
  assert.deepEqual(arrival.flatMap(a => a.op === 'sfx' ? [a.track] : a.op === 'movie' ? [a.clip] : []),
    [72, 'liftup', 62, 63, 64]);
  assert.equal(q.state.flags.has(52), false);
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
    if (name === 'GEM') continue; // Covered by the existing world pack audit.
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

test('Faeriewood uses fresh blueberries, the hidden cellar and the original potion recipes', () => {
  const q = quest();
  for (const flag of [159, 161, 165, 166, 169, 171]) q.state.flags.add(flag);
  assert.equal(q.run('FALLS', 1, 248, 60).handled, true);
  assert.equal(q.snapshot.itemInHand, 'item-40');
  assert.ok(q.state.flags.has(189));
  assert.ok(!q.state.flags.has(172));
  assert.ok(q.run('POTION', 3).actions.some(action => action.op === 'say' && action.text === 'Zanthia?'));
  q.run('POTION', 1, 188, 76);
  assert.equal(q.state.cauldron, 2);
  assert.equal(q.snapshot.itemInHand, null);
  q.run('POTION', 1, 236, 112);
  assert.ok(q.state.flags.has(194));
  assert.ok(q.run('POTION', 1, 252, 114).actions.some(action => action.op === 'exit' && action.target === 80));
  assert.ok(q.run('STUMP', 2).actions.some(action => action.op === 'frame' && action.clip === 'ctrap2'));
  assert.ok(q.run('STUMP', 1, 184, 108).actions.some(action => action.op === 'exit' && action.target === 45));

  q.run('LAGOON', 1, 80, 100);
  assert.equal(q.snapshot.itemInHand, 'item-18');
  q.snapshot.itemInHand = null;
  q.run('SPRING', 1, 264, 86);
  assert.equal(q.snapshot.itemInHand, 'item-17');

  for (const [first, second, state, potion] of [
    ['item-40', 'item-8', 3, 'item-62'],
    ['item-18', 'item-6', 6, 'item-60'],
    ['item-17', 'item-4', 9, 'item-64'],
  ] as const) {
    q.snapshot.itemInHand = first;
    q.run('POTION', 1, 188, 76);
    q.snapshot.itemInHand = second;
    q.run('POTION', 1, 188, 76);
    assert.equal(q.state.cauldron, state);
    const initial = q.run('POTION', 0).actions;
    assert.ok(initial.some(action => action.op === 'palette' && action.start === 241));
    q.snapshot.itemInHand = 'item-78';
    q.run('POTION', 1, 188, 76);
    assert.equal(q.snapshot.itemInHand, potion);
  }
});

test('the Crystals of Alchemy retain the first ingredient and clear both after a reaction', () => {
  for (const [left, right, result] of [
    ['item-60', 'item-62', 'item-68'],
    ['item-60', 'item-64', 'item-67'],
    ['item-62', 'item-64', 'item-66'],
  ] as const) {
    const q = quest();
    q.snapshot.itemInHand = left;
    q.run('MIX', 1, 146, 80);
    assert.equal(q.snapshot.itemInHand, null);
    assert.deepEqual(q.state.crystals, [Number(left.slice(5)), -1]);
    assert.ok(q.run('MIX', 0).actions.some(action => action.op === 'shape'));
    q.snapshot.itemInHand = right;
    const mixing = q.run('MIX', 1, 180, 80).actions;
    assert.ok(mixing.some(action => action.op === 'frame' && action.clip === 'mixrox'));
    assert.equal(q.snapshot.itemInHand, result);
    assert.deepEqual(q.state.crystals, [-1, -1]);
  }
});

test('the original amulet, Faun and Pegasus scripts connect Faeriewood to the castle island', () => {
  const q = quest();
  const snapshot = q.snapshot;
  const chalice = traceForest({ ...data.rooms.FORESTA, id: 46 }, 4, q.state, snapshot, snapshot.pos, () => true, [], -1, 4);
  assert.equal(chalice.handled, true);
  assert.ok(chalice.actions.some(action => action.op === 'frame' && action.clip === 'steal1'));
  for (const action of chalice.actions) applyForestState(q.state, action);
  assert.ok(q.state.flags.has(188));

  const use = (name: string) => traceForest({ ...data.rooms[name], ...data.flute }, 0, q.state, snapshot).actions;
  snapshot.itemInHand = 'item-68';
  const shrink = use('GLADE');
  assert.ok(shrink.some(action => action.op === 'heroScale' && action.value === 0.5));
  assert.ok(shrink.some(action => action.op === 'exit' && action.target === 48));
  for (const action of shrink) applyForestState(q.state, action);
  const greeting = q.run('LEPHOLE', 2).actions;
  assert.ok(greeting.some(action => action.op === 'say' && action.speaker === 10));
  assert.deepEqual(q.state.pendingItems[102], [{ id: 'apple', x: 160, y: 134 }]);

  snapshot.itemInHand = 'apple';
  q.run('LEPHOLE', 1, 75, 99);
  assert.equal(snapshot.itemInHand, null);
  assert.deepEqual(q.state.pendingItems[47], [{ id: 'item-24', x: 290, y: 90 }]);
  assert.ok(q.run('LEPHOLE', 1, 270, 50).actions.some(action => action.op === 'exit' && action.target === 47));

  snapshot.itemInHand = 'item-67';
  const flight = use('LAGOON');
  assert.ok(flight.some(action => action.op === 'frame' && action.clip === 'pegasus' && action.index === 112));
  assert.ok(flight.some(action => action.op === 'music' && action.command === 34));
  assert.ok(flight.some(action => action.op === 'exit' && action.target === 199));
  for (const action of flight) applyForestState(q.state, action);
  const landing = q.run('LANDING', 2).actions;
  assert.ok(landing.some(action => action.op === 'movie' && action.clip === 'landing'));
  assert.ok(landing.some(action => action.op === 'music' && action.command === 31));
  assert.ok(!q.state.flags.has(201));
});
