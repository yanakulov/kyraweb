import { startGame } from "../../src/engine/gameplay/game";
import { gemCutScene } from "../../src/engine/scenes/gemCut";
import { validateWorldSave } from '../../src/engine/gameplay/saveStorage';
import type { GameConfig } from '../../src/engine/core/types';
import { getInventorySlotPositions } from '../../src/engine/gameplay/inventory';
import { fireberryBush, itemFromOriginal, originalItem } from '../../src/engine/gameplay/forest';
import {
  IndexedClip,
  loadScenePack,
} from "../../src/engine/resources/scenePack";

const canvas = document.querySelector("canvas")!,
  results = document.querySelector("#results")!;
let callbacks: FrameRequestCallback[] = [],
  now = performance.now(),
  id = 0,
  playing = false,
  loading = false,
  confirm = false,
  dead = false,
  onRope = false,
  error = "";
window.requestAnimationFrame = (callback) => {
  callbacks.push(callback);
  return callbacks.length;
};
window.addEventListener("error", (event) => {
  error = event.error?.stack ?? event.message;
  results.textContent += `\nERROR ${error}`;
});
const lines: string[] = [];
let fireFrame = -1, featherFalling = false;
let knifeChoice = false;
let roomBank = '';
const scores: number[] = [];
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  try {
    return await realFetch(input, init);
  } catch (e) {
    throw Error("Fetch failed " + String(input) + ": " + e);
  }
};
const config: GameConfig = {
  scene: gemCutScene,
  world: "/kyraweb/assets/world/world.json",
  playOpening: false,
  onDeath: () => {
    dead = true;
  },
  onScriptAction: action => {
    if (action.op === 'music') scores.push(action.command);
    if (action.op === 'frame' && action.clip === 'balance2') onRope = true;
    if (action.op === 'frame' && action.clip === 'brandyw3') fireFrame = action.index;
    if (action.op === 'ambientRun' && id === 30) featherFalling = true;
    if (action.op === 'choice' && id === 25) knifeChoice = true;
  },
  onLocationChange: (name, room, bank) => {
    roomBank = bank ?? '';
    id = room!;
    document.querySelector("#location")!.textContent = `${id}: ${name}`;
  },
  onSequenceChange: (value) => (playing = value),
  onLoadingChange: (value) => (loading = value),
  onContinueChange: (value) => (confirm = value),
  onNavigationError: (value) => (error = value),
  onSubtitleChange: (subtitles) => {
    const text = subtitles.map((l) => l.text).join(" ");
    document.querySelector("#line")!.textContent = text;
    if (text) lines.push(text);
  },
};
let game = await startGame(canvas, config);
game.setWalkSpeed('fastest');
function advance(ms: number) {
  for (let t = 0; t < ms; t += 50) {
    now += 50;
    const batch = callbacks;
    callbacks = [];
    batch.forEach((callback) => callback(now));
  }
}
function capture(label: string, advanceClock = true) {
  if (advanceClock) advance(1000);
  const figure = document.createElement("figure"),
    image = document.createElement("img"),
    caption = document.createElement("figcaption");
  image.src = canvas.toDataURL();
  image.alt = label;
  caption.textContent = label;
  figure.append(image, caption);
  document.querySelector("#gallery")!.append(figure);
}
async function until(check: () => boolean, label: string) {
  for (let i = 0; i < 900; i++) {
    if (error) throw Error(error);
    if (check()) return;
    if (confirm) {
      capture("Brynn’s original note");
      game.handleClick({ x: 160, y: 100 });
    }
    advance(500);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw Error(
    `Timeout ${label}: room=${id}, playing=${playing}, loading=${loading}`,
  );
}
async function settle() {
  advance(50);
  await until(() => !playing && !loading, "sequence");
}
async function click(x: number, y: number) {
  game.handleClick({ x, y });
  await settle();
}
function assertScenePixels(clip: IndexedClip, frame: number, x: number, y: number, sx: number, sy: number, width: number, height: number, message: string) {
  const actual = canvas.getContext('2d')!.getImageData(x, y, width, height).data;
  const indices = clip.frame(frame), palette = clip.info.palette;
  if (actual.some((value, i) => i % 4 < 3 && value !== palette[indices[(sy + Math.floor(i / (width * 4))) * clip.info.width + sx + Math.floor(i / 4) % width] * 3 + i % 4])) throw Error(message);
}
async function travel(target: number) {
  const portal = game.getPortals().find((p) => p.target === target);
  if (!portal) throw Error(`Missing exit ${id}->${target}`);
  game.handleClick({
    x: portal.rect.x + portal.rect.w / 2,
    y: portal.rect.y + portal.rect.h / 2,
  });
  if (id === 0 && playing) {
    await settle();
    game.handleClick({ x: 160, y: 132 });
  }
  await until(
    () => id === target && !playing && !loading,
    `travel to ${target}`,
  );
  results.textContent += `Arrived ${target}\n`;
}
async function route(...targets: number[]) {
  for (const target of targets) await travel(target);
}
function expectScore(command: number) {
  const score = scores.at(-1);
  if (score !== command) throw Error(`Room ${id} should play score ${command}, got ${score}`);
}
function held(item: string | null) {
  if (game.getSnapshot().itemInHand !== item)
    throw Error(`Expected ${item}, held ${game.getSnapshot().itemInHand}`);
}
// Each scenario starts with a fresh world; reload to choose another one.
function lockScenario() {
  document.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
}
document.querySelector("#run")!.addEventListener("click", async () => {
  lockScenario();
  try {
    await click(216, 84);
    held("letter");
    await click(100, 165);
    await click(256, 100);
    held("saw");
    await click(120, 165);
    await route(1, 5, 4, 14, 3, 2);
    await click(100, 165);
    held("letter");
    await click(50, 90);
    await click(50, 90);
    capture("Brynn after reading the note");
    held("letter");
    await click(100, 165);
    await route(3, 14, 4, 5, 10, 8);
    await click(180, 40);
    held("teardrop");
    capture("Caught the teardrop");
    await route(10, 5, 4);
    await click(152, 76);
    held(null);
    capture("Willow healed; Merith begins the chase");
    await route(5, 10, 8, 12, 11);
    capture("Merith gives up the marble");
    await click(145, 117);
    held("marble");
    await click(140, 165);
    await route(6);
    await click(200, 56);
    held("rose");
    await click(160, 165);
    await route(11, 12, 8, 10, 5, 4, 14, 3, 2);
    await click(160, 165);
    held("rose");
    await click(50, 90);
    held("silverRose");
    capture("Brynn enchants the rose");
    await click(160, 165);
    await route(3, 14, 4, 5, 10, 8, 12, 13, 9, 7);
    await click(220, 80);
    await click(120, 165);
    held("saw");
    await click(220, 80);
    held(null);
    capture("Herman leaves to cut planks");
    await route(9, 13);
    capture("Herman sawing");
    await route(12, 11, 6);
    await click(140, 165);
    held("marble");
    await click(152, 32);
    held(null);
    await click(160, 165);
    held("silverRose");
    await click(120, 52);
    held(null);
    capture("Original amulet appears");
    await route(11, 12, 13, 9, 7);
    capture("Repaired bridge");
    await route(24, 7);
    capture("Returned across the repaired bridge");
    if (!lines.some((t) => t.includes("You can have the marble")))
      throw Error("Merith dialogue missing");
    if (!lines.some((t) => t.includes("That must be the amulet")))
      throw Error("Amulet dialogue missing");

    const bridgeSave = validateWorldSave(game.getSaveState());
    bridgeSave.quest.flags = bridgeSave.quest.flags.filter(flag => flag < 72 || flag > 75);
    game.stop();
    game = await startGame(canvas, { ...config, saveState: bridgeSave });
    await route(24, 26, 27);
    expectScore(12);
    const spellPack = await loadScenePack('/kyraweb/assets/forest/spell.kyr.gz');
    game.handleClick({ x: 130, y: 76 });
    await until(() => fireFrame >= 4, 'Brandywine breathing fire');
    assertScenePixels(new IndexedClip(spellPack, spellPack.clips.brandyw2), 50, 152, 103, 112, 52, 27, 21, 'The resting dragon head returned beneath the fire clip');
    capture('Brandywine breathing fire', false);
    await settle();
    if (!lines.includes("I'll need a quill.")) throw Error('Darm did not ask for a quill');
    capture('Darm and Brandywine');
    game.handleClick({ x: 130, y: 76 });
    await until(() => document.querySelector('#line')!.textContent === 'Well Branson...', 'Darm’s repeat dialogue');
    const talking = game.getSnapshot().runtime!.sceneAnims;
    if (talking[5].visible || !talking[6].visible || !talking[6].play) throw Error('Darm did not switch from the idle to the talk animation');
    game.handleClick({ x: 130, y: 76 });
    await settle();
    const idle = game.getSnapshot().runtime!.sceneAnims;
    if (!idle[5].visible || idle[6].visible) throw Error('Darm did not restore his idle animation after dialogue');
    await travel(26);
    expectScore(11);
    await route(33, 30);
    await click(128, 125);
    held('item-27');
    await click(120, 165);
    await route(32, 34, 17);
    await click(115, 112);
    held('item-25');
    await click(140, 165);
    await route(22, 31);
    await click(157, 62);
    held('item-26');
    await route(29, 33, 34, 21, 23, 17, 34, 32, 28, 20, 19, 36);
    await click(204, 111);
    held(null);
    await click(120, 165);
    held('item-27');
    await click(204, 111);
    held(null);
    await click(140, 165);
    held('item-25');
    await click(204, 111);
    held(null);
    const groveSave = validateWorldSave(game.getSaveState());
    if (!groveSave.quest.flags.includes(86)) throw Error('The yellow jewel did not awaken');
    capture('The yellow jewel awakens at Deadwood Glade');
    game.stop();
    game = await startGame(canvas, { ...config, saveState: groveSave });
    await route(18, 32, 30);
    const songPack = await loadScenePack('/kyraweb/assets/forest/song.kyr.gz');
    game.handleClick({ x: 263, y: 165 });
    await until(() => featherFalling, 'the feather falling from the nest');
    assertScenePixels(new IndexedClip(songPack, songPack.clips['songbird-rest']), 0, 186, 38, 2, 0, 11, 8, 'The bird disappeared while the feather was falling');
    capture('The healed bird stays in the nest while the feather falls', false);
    await settle();
    expectScore(13);
    if (!lines.some(line => line.includes('heal his wing'))) throw Error('The yellow jewel did not heal the songbird');
    capture('Healed songbird');
    await click(183, 125);
    held('item-46');
    await route(33, 26, 27);
    expectScore(12);
    await click(130, 76);
    held(null);
    await click(153, 78);
    held('item-80');
    const scrollSave = validateWorldSave(game.getSaveState());
    if (!scrollSave.quest.flags.includes(94)) throw Error('Darm’s scroll did not survive as save data');
    capture('Darm’s magic scroll');
    async function putAway() {
      const slot = getInventorySlotPositions()[game.getSnapshot().inventorySlots.indexOf(null)];
      if (!slot) throw Error('The test inventory is full');
      await click(slot.x + 8, slot.y + 8);
    }
    await putAway();
    await click(130, 76);
    if (!game.getSaveState()?.quest.flags.includes(97)) throw Error('Darm did not explain the birthstones');
    await route(26, 33, 34, 32, 28);
    await click(142, 120);
    held('item-12');
    await route(32, 34, 33, 29);
    await click(162, 52);
    held(null);

    const world = await fetch(config.world!).then(response => response.json()) as {
      rooms: { id: number; exits: (number | null)[]; portals: { target: number }[] }[]
    };
    world.rooms.find(room => room.id === 7)!.exits[3] = 24;
    world.rooms.find(room => room.id === 5)!.exits[0] = 1;
    async function visit(target: number) {
      const paths = [[id]], seen = new Set([id]);
      for (const path of paths) {
        const last = path.at(-1)!;
        if (last === target) { await route(...path.slice(1)); return; }
        const room = world.rooms.find(room => room.id === last)!;
        for (const next of [...room.exits, ...room.portals.map(portal => portal.target)]) {
          if (next === null || seen.has(next) || next === 109) continue;
          if (!world.rooms.some(room => room.id === next)) continue;
          seen.add(next); paths.push([...path, next]);
        }
      }
      throw Error(`No route to ${target}`);
    }
    for (const gem of scrollSave.quest.birthstones!.slice(1, 3)) {
      const save = validateWorldSave(game.getSaveState());
      const item = itemFromOriginal(gem)!;
      const carried = game.getSnapshot().inventorySlots.indexOf(item);
      if (carried >= 0) {
        const slot = getInventorySlotPositions()[carried];
        await click(slot.x + 8, slot.y + 8);
      } else {
        const room = world.rooms.find(({ id }) => save.quest.scatteredGems?.[id]?.includes(gem) ||
          save.rooms[id]?.sceneItems.some(entry => entry.id === item));
        if (!room) throw Error(`Birthstone ${gem} is missing`);
        await visit(room.id);
        const floor = game.getSnapshot().sceneItems.find(entry => entry.id === item);
        if (!floor) throw Error(`Birthstone ${gem} did not spawn`);
        await click(floor.x, floor.y - 4);
      }
      held(item);
      await visit(29);
      await click(162, 52);
      held(null);
    }
    await route(31, 35);
    await click(144, 38);
    if (game.getSaveState()?.quest.poison !== 2) throw Error('The ruby tree did not poison Brandon');
    await click(144, 38);
    held('item-6');
    await putAway();
    await travel(31);
    if (game.getSaveState()?.quest.poison !== 1) throw Error('The first poisoned crossing did not warn Brandon');
    await click(263, 165);
    if (game.getSaveState()?.quest.poison !== 0) throw Error('The yellow jewel did not cure the poison');
    const rubySlot = getInventorySlotPositions()[game.getSnapshot().inventorySlots.indexOf('item-6')];
    await click(rubySlot.x + 8, rubySlot.y + 8);
    await travel(29);
    await click(162, 52);
    await click(162, 52);
    held('item-55');
    capture('The golden dish becomes a flute');

    await visit(25);
    const cave = game.getPortals().find(portal => portal.target === 109);
    if (!cave) throw Error('Missing Serpent’s Grotto entrance');
    game.handleClick({ x: cave.rect.x + cave.rect.w / 2, y: cave.rect.y + cave.rect.h / 2 });
    await until(() => knifeChoice, 'Malcolm’s thrown knife');
    expectScore(16);
    if (scores.slice(-3).join() !== '1,15,16') throw Error('The grotto did not fade into both Malcolm cues');
    capture('Malcolm challenges Brandon at the grotto', false);
    await click(42, 80);
    const frozen = validateWorldSave(game.getSaveState());
    if (!frozen.quest.flags.includes(82)) throw Error('Malcolm did not freeze the cave');
    game.stop();
    game = await startGame(canvas, { ...config, saveState: frozen });
    const hero = game.getSnapshot().pos;
    await click(hero.x, hero.y - 16);
    if (game.getSaveState()?.quest.flags.includes(82)) throw Error('The flute did not shatter the ice');
    await travel(109);
    expectScore(3);
    capture('The entrance to Shadowrealm');
    results.textContent += 'ALL PASSED — forest, Timbermist, birthstones, poison cure, flute, Malcolm and Shadowrealm entrance';
    document.title = "PASS — forest quests";
  } catch (e) {
    results.textContent += `FAIL ${e}`;
    document.title = "FAIL — forest quests";
  }
});
advance(50);

document.querySelector('#shadow')!.addEventListener('click', async () => {
  lockScenario();
  try {
    const start = validateWorldSave(game.getSaveState());
    start.rooms[0].treeSpoken = true;
    start.rooms[0].inventorySlots[0] = 'item-80';
    start.quest.flags.push(45, 53, 71);
    async function reload(save: typeof start) {
      game.stop();
      game = await startGame(canvas, { ...config, saveState: save });
      game.setWalkSpeed('fastest');
      dead = false;
      await settle();
    }
    await reload(start);
    game.runSequence([{ op: 'exit', target: 109 }]);
    await until(() => id === 109 && !loading && !playing, 'Shadowrealm checkpoint');
    await route(197, 115);
    await click(165, 100);
    if (game.getPortals().some(portal => portal.target === 197)) throw Error('The grate did not close');
    capture('The locked iron grate');
    await travel(187);
    const beforeDark = validateWorldSave(game.getSaveState());
    await travel(121);
    if (!dead || !lines.includes("I can't see a thing in here!")) throw Error('A dark cave must run the original death');
    await reload(beforeDark);

    async function slot(index: number) {
      const { x, y } = getInventorySlotPositions()[index];
      await click(x + 8, y + 8);
    }
    async function storeItem() {
      await slot(game.getSnapshot().inventorySlots.findIndex(item => item === null));
      held(null);
    }
    async function pick(item: string) {
      const floor = game.getSnapshot().sceneItems.find(entry => entry.id === item);
      if (!floor) throw Error(`Missing ${item} in room ${id}`);
      await click(floor.x, floor.y - 4);
      held(item);
    }
    const { rooms } = await fetch(config.world!).then(response => response.json()) as {
      rooms: { id: number; name: string; exits: (number | null)[] }[];
    };
    async function visit(target: number) {
      const { inventorySlots, wispMs } = game.getSnapshot();
      const light = Math.max(0, ...inventorySlots.map(item => {
        const original = originalItem(item);
        return original >= 29 && original <= 32 ? 33 - original : 0;
      }));
      const pending = [{ room: id, light, path: [] as number[] }];
      const seen = new Set<string>();
      const flags = game.getSaveState()!.quest.flags;
      while (pending.length) {
        const node = pending.shift()!;
        const key = `${node.room}/${node.light}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (node.room === target) {
          for (const next of node.path) {
            if (fireberryBush(id) && !game.getSnapshot().wispMs) {
              await click(155, 88);
              held('item-29');
              await storeItem();
            }
            await travel(next);
            if (dead) throw Error(`Ran out of light in room ${id}`);
          }
          return;
        }
        const from = rooms.find(room => room.id === node.room)!;
        for (const next of from.exits) {
          const room = rooms.find(room => room.id === next);
          if (!room || node.room === 115 && next === 197 && !flags.includes(117) ||
              node.room === 114 && next === 120 && !flags.includes(113) ||
              node.room === 117 && next === 198 && !flags.includes(179)) continue;
          const remaining = Math.max(0, (fireberryBush(node.room) ? 4 : node.light) - 1);
          if (!wispMs && !remaining && !fireberryBush(room.id) && ['GEN_CAV', 'GENCAVB'].includes(room.name)) continue;
          pending.push({ room: room.id, light: remaining, path: [...node.path, room.id] });
        }
      }
      throw Error(`No lit route from ${id} to ${target}`);
    }
    for (const rockRoom of [129, 153, 161, 184, 110]) {
      await visit(rockRoom);
      await pick('item-102');
      await storeItem();
    }
    await pick('item-22');
    await storeItem();
    await visit(115);
    for (let i = 0; i < 5; i++) {
      await slot(game.getSnapshot().inventorySlots.indexOf('item-102'));
      await click(197, 49);
      held(null);
    }
    if (!game.getPortals().some(portal => portal.target === 197)) throw Error('Five rocks did not reopen the grate');
    await route(197, 109, 25);
    await visit(32);
    await slot(game.getSnapshot().inventorySlots.indexOf('item-22'));
    await click(180, 80);
    held('item-13');
    await storeItem();

    await visit(109);
    await visit(111);
    await click(32, 44);
    await slot(game.getSnapshot().inventorySlots.indexOf('item-13'));
    await click(160, 91);
    held(null);
    if (!game.getSaveState()!.quest.flags.includes(88)) throw Error('The altar did not awaken the purple jewel');
    capture('The Pantheon of Moonlight after the offering');
    game.setControlMode('modern');
    game.setPointer({ x: 160, y: 90 });
    game.setInventoryOpen(true);
    await click(160, 92);
    if (!game.getSnapshot().wispMs) throw Error('The radial purple jewel did not transform Brandon');
    game.setControlMode('classic');
    await reload(validateWorldSave(game.getSaveState()));
    if (!game.getSnapshot().wispMs) throw Error('A saved wisp reverted early');

    await visit(113);
    expectScore(18);
    await travel(175);
    expectScore(17);
    await visit(117);
    const beforeLava = validateWorldSave(game.getSaveState());
    await click(160, 6);
    if (!dead || !lines.includes("I'm burning!")) throw Error('An unfrozen river must run the original death');
    await reload(beforeLava);
    await slot(game.getSnapshot().inventorySlots.indexOf('item-80'));
    const hero = game.getSnapshot().pos;
    await click(hero.x, hero.y - 10);
    if (!game.getSaveState()!.quest.flags.includes(179)) throw Error('Darm’s scroll did not freeze the river');
    capture('The frozen volcanic river');
    await storeItem();
    await travel(198);
    await pick('item-57');
    await storeItem();
    await travel(117);
    await click(263, 188);
    await visit(114);
    await click(180, 52);
    if (!game.getSaveState()!.quest.flags.includes(113)) throw Error('The wisp did not cross the chasm');
    await route(120, 37, 38);
    if (game.getSnapshot().wispMs) throw Error('Brandon stayed a wisp at the plateau');
    capture('The scenic plateau');
    results.textContent += 'ALL PASSED — fireberries, darkness, grate, coin, moonstone, wisp, lava, gold key and plateau';
    document.title = 'PASS — Shadowrealm quests';
  } catch (e) {
    results.textContent += `FAIL ${e}`;
    document.title = 'FAIL — Shadowrealm quests';
  }
});

document.querySelector("#fall")!.addEventListener("click", async () => {
  lockScenario();
  try {
    await route(1, 5, 10, 8, 12, 13, 9, 7);
    const context = canvas.getContext('2d')!;
    const hudBefore = context.getImageData(0, 150, 320, 50).data;
    // x=10 belongs to both the broken-bridge script and the blocked west edge.
    game.handleClick({ x: 10, y: 100 });
    advance(60000);
    if (!playing || dead)
      throw Error("Bridge warning did not wait for a decision");
    capture("Herman warns about the rope");
    game.handleClick({ x: 280, y: 110 });
    await settle();
    if (dead) throw Error("Retreat killed Brandon");
    game.handleClick({ x: 10, y: 100 });
    advance(60000);
    game.handleClick({ x: 10, y: 100 });
    await until(() => onRope, 'rope animation');
    const pack = await loadScenePack('/kyraweb/assets/forest/broken.kyr.gz');
    const background = new IndexedClip(pack, pack.clips.room);
    const pixels = background.frame(0), palette = background.info.palette;
    const bank = context.getImageData(232, 66, 32, 45).data;
    if (!bank.some((value, i) => i % 4 < 3 &&
      value !== palette[pixels[(66 + Math.floor(i / 128)) * 320 + 232 + Math.floor(i / 4) % 32] * 3 + i % 4]))
      throw Error('Herman vanished while Brandon was on the rope');
    await settle();
    if (!dead) throw Error("Fatal crossing did not complete");
    if (!context.getImageData(0, 150, 320, 50).data.every((value, i) => value === hudBefore[i]))
      throw Error('The bridge sprite atlas replaced the HUD after death');
    capture("Original bridge fall");
    const pos = JSON.stringify(game.getSnapshot().pos);
    game.setTarget({ x: 300, y: 100 });
    advance(1000);
    if (JSON.stringify(game.getSnapshot().pos) !== pos)
      throw Error("Dead character still moves");
    results.textContent +=
      "ALL PASSED — warning, retreat, deliberate crossing, original fall and stopped input";
    document.title = "PASS — bridge choices";
  } catch (e) {
    results.textContent += "FAIL " + e;
    document.title = "FAIL — bridge choices";
  }
});

document.querySelector('#faeriewood')!.addEventListener('click', async () => {
  lockScenario();
  try {
    const start = validateWorldSave(game.getSaveState());
    start.rooms[0].treeSpoken = true;
    start.rooms[0].inventorySlots[0] = 'item-80';
    start.rooms[0].itemInHand = 'item-57';
    start.quest.flags.push(45, 53, 88);
    game.stop();
    game = await startGame(canvas, { ...config, saveState: start });
    game.setWalkSpeed('fastest');
    game.runSequence([{ op: 'exit', target: 38 }]);
    await until(() => id === 38 && !loading && !playing, 'plateau checkpoint');
    const east = game.getPortals().find(portal => portal.target === 39)!;
    game.handleClick({ x: east.rect.x + east.rect.w / 2, y: east.rect.y + east.rect.h / 2 });
    await until(() => id === 45 && !loading && !playing, 'Zanthia’s laboratory after the branch falls');
    expectScore(22);
    if (![23, 24, 25].every(score => scores.includes(score)) || !lines.some(line => line.includes('fill a flask')))
      throw Error('The original branch and awakening scenes did not complete');
    capture('Zanthia gives Brandon an empty flask');

    async function slot(index: number) {
      const { x, y } = getInventorySlotPositions()[index];
      await click(x + 8, y + 8);
    }
    async function putAway() { await slot(game.getSnapshot().inventorySlots.indexOf(null)); held(null); }
    async function useOnBrandon() {
      const hero = game.getSnapshot().pos;
      await click(hero.x, hero.y - 12);
    }

    held('item-78');
    await putAway();
    await route(44, 43, 42);
    await until(() => roomBank === 'ALGAE' && !loading && !playing, 'Malcolm’s fountain transformation');
    if (!scores.includes(26) || !scores.includes(32) || !lines.some(line => line.includes('fix the fountain')))
      throw Error('Malcolm’s fountain scene did not complete');
    capture('Malcolm ruins the Enchanted Fountain');

    await route(53, 39);
    const key = game.getSnapshot().sceneItems.find(item => item.id === 'item-57');
    if (!key) throw Error('The falling branch did not leave the held key on the ground');
    await click(key.x, key.y - 4);
    held('item-57');
    await putAway();
    await route(53, 42);

    await route(55, 73, 60, 63, 62, 59, 41);
    await slot(game.getSnapshot().inventorySlots.indexOf('item-80'));
    await useOnBrandon();
    if (!game.getSaveState()?.quest.flags.includes(162)) throw Error('Darm’s scroll did not extinguish the tree');
    await putAway();
    await click(87, 66);
    held('item-51');
    capture('The crystal orb recovered from the tree');
    await route(59, 62, 63, 60, 73, 55, 42);
    await click(90, 93);
    await until(() => roomBank === 'FOUNTN' && !loading && !playing, 'fountain restoration');
    if (!game.getSaveState()?.quest.flags.includes(166) || !scores.includes(55)) throw Error('The crystal did not restore the fountain');
    held(null);
    capture('The restored Enchanted Fountain');

    await slot(game.getSnapshot().inventorySlots.indexOf('item-78'));
    await click(163, 90);
    held('item-76');
    await useOnBrandon();
    held('item-78');
    if (!game.getSaveState()?.quest.flags.includes(89)) throw Error('Drinking magic water did not awaken the blue jewel');
    await click(163, 90);
    held('item-76');
    await route(43, 44, 45);
    await click(243, 57);
    held('item-78');
    if (!game.getSaveState()?.quest.flags.includes(171) || !lines.some(line => line.includes('Go get some blueberries')))
      throw Error('Zanthia did not reveal Brandon’s heritage and request blueberries');
    await putAway();
    await click(286, 177);
    if (!lines.some(line => line.includes('That felt strange'))) throw Error('The blue jewel could not cast its spell');
    const ending = validateWorldSave(game.getSaveState());
    game.stop();
    game = await startGame(canvas, { ...config, saveState: ending });
    if (game.getSaveState()?.quest.files[42] !== 'FOUNTN') throw Error('The repaired fountain did not survive a reload');
    results.textContent += 'ALL PASSED — branch, Zanthia, Malcolm, frozen tree, restored fountain, magic water and blue jewel';
    document.title = 'PASS — Enchanted Fountain';
  } catch (error) {
    results.textContent += `FAIL ${error}`;
    document.title = 'FAIL — Enchanted Fountain';
  }
});
