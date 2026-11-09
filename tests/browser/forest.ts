import { startGame } from "../../src/engine/gameplay/game";
import { gemCutScene } from "../../src/engine/scenes/gemCut";
import { validateWorldSave } from '../../src/engine/gameplay/saveStorage';
import type { GameConfig, InventoryItemId } from '../../src/engine/core/types';
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
let bellChoices = 0;
const royalMovies = new Set<string>();
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
    if (action.op === 'choice' && action.silent) bellChoices++;
    if (action.op === 'frame' && ['upstairs', 'dnstairs', 'hersaw1', 'hersaw2', 'hersaw3', 'punch1', 'punch2', 'punch3'].includes(action.clip))
      royalMovies.add(action.clip);
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
    const supplies = validateWorldSave(game.getSaveState());
    const slots = supplies.rooms[45].inventorySlots;
    // Gems and tulip collected in the earlier chapters.
    for (const item of ['item-8', 'item-6', 'item-4', 'item-17', 'apple'] as const) slots[slots.indexOf(null)] = item;
    game.stop();
    game = await startGame(canvas, { ...config, saveState: supplies });
    game.setWalkSpeed('fastest');
    const equip = (item: Parameters<typeof slots.indexOf>[0]) => slot(game.getSnapshot().inventorySlots.indexOf(item));
    const brew = () => click(188, 76);
    async function spareFlask() {
      const find = () => game.getSnapshot().sceneItems.find(item => item.id === 'item-78');
      if (!find()) await route(44, 45);
      const flask = find();
      if (!flask) throw Error('Zanthia did not leave a spare flask');
      await click(flask.x, flask.y - 4);
      held('item-78');
    }

    await route(44, 43, 42, 53, 39, 55, 46, 64, 63, 62, 59, 58, 57, 54, 40);
    await click(248, 60);
    held('item-40');
    if (!game.getSaveState()?.quest.flags.includes(189)) throw Error('The fresh blueberry did not advance the quest');
    await route(54, 57, 58, 59, 62, 63, 64, 46, 55, 42, 43, 44, 45);
    expectScore(22);
    await brew();
    held(null);
    await equip('item-8');
    await brew();
    held(null);
    await equip('item-78');
    await brew();
    held('item-62');
    await putAway();
    await click(236, 112);
    if (!game.getSaveState()?.quest.flags.includes(194)) throw Error('The rug did not reveal the trapdoor');
    await click(252, 114);
    await until(() => id === 80 && !loading && !playing, 'the stump trapdoor');
    expectScore(21);
    await route(86, 81, 82, 83, 84, 52);
    await click(80, 100);
    held('item-18');
    capture('Orchids at the tropical lagoon');
    await putAway();
    await route(84, 83, 82, 81, 86, 80);
    await click(184, 108);
    await until(() => id === 45 && !loading && !playing, 'return to the lab');
    expectScore(22);
    await equip('item-18');
    await brew();
    await equip('item-6');
    await brew();
    await spareFlask();
    await brew();
    held('item-60');
    await putAway();
    await spareFlask();
    await brew();
    held('item-60');
    await putAway();
    await equip('item-17');
    await brew();
    await equip('item-4');
    await brew();
    await spareFlask();
    await brew();
    held('item-64');
    await putAway();
    capture('The cauldron after brewing');

    await click(252, 114);
    await until(() => id === 80 && !loading && !playing, 'return to the woods');
    await route(94, 97, 98, 102, 106, 105, 49);
    await equip('item-60');
    await click(146, 80);
    held(null);
    const halfMixed = validateWorldSave(game.getSaveState());
    if (halfMixed.quest.crystals?.[0] !== 60 || halfMixed.quest.cauldron !== 9) throw Error('The saved alchemy state is incomplete');
    game.stop();
    game = await startGame(canvas, { ...config, saveState: halfMixed });
    await equip('item-62');
    await click(180, 80);
    held('item-68');
    const mixed = validateWorldSave(game.getSaveState());
    if (mixed.quest.crystals?.some(potion => potion !== -1) || mixed.rooms[49].runtime!.shapes.length)
      throw Error('The mixed crystals did not reset');
    capture('Purple potion from the Crystals of Alchemy');

    await putAway();
    await equip('item-60');
    await click(146, 80);
    await equip('item-64');
    await click(180, 80);
    held('item-67');
    await putAway();

    await route(105, 106, 102, 98, 97, 94, 80);
    await click(184, 108);
    await until(() => id === 45 && !playing && !loading, 'back from the crystals');
    await route(44, 43, 42, 47, 46);
    expectScore(29);
    await click(143, 49);
    if (!lines.some(line => line.includes("It's stuck"))) throw Error('The floating chalice did not react');
    await click(286, 177);
    if (!game.getSaveState()?.quest.flags.includes(188) || !lines.some(line => line.includes('Bring that back')))
      throw Error('The blue jewel did not free the chalice for the Faun to steal');
    await travel(47);
    await equip('item-68');
    await useOnBrandon();
    await until(() => id === 48 && !playing && !loading, 'inside the Faun’s house');
    expectScore(27);
    held('item-79');
    await putAway();
    const faunSave = validateWorldSave(game.getSaveState());
    if (!faunSave.quest.pendingItems?.[102]?.some(item => item.id === 'apple') ||
        !lines.some(line => line.includes('very safe place')))
      throw Error('The Faun did not hide the chalice and spawn the spare apple');
    capture('The Faun inside his home');
    game.stop();
    game = await startGame(canvas, { ...config, saveState: faunSave });
    await equip('apple');
    await click(75, 99);
    held(null);
    const traded = validateWorldSave(game.getSaveState());
    if (!traded.quest.pendingItems?.[47]?.some(item => item.id === 'item-24'))
      throw Error('The Faun did not leave the chalice outside');
    game.stop();
    game = await startGame(canvas, { ...config, saveState: traded });
    await travel(47);
    expectScore(21);
    const cup = game.getSnapshot().sceneItems.find(item => item.id === 'item-24');
    if (!cup) throw Error('The royal chalice is missing after returning outside');
    await click(cup.x, cup.y - 4);
    held('item-24');
    await putAway();
    await route(42, 43, 44, 45);
    await click(252, 114);
    await until(() => id === 80 && !playing && !loading, 'towards the lagoon');
    await route(86, 81, 82, 83, 84, 52);
    await click(80, 100);
    held('item-18');
    await putAway();
    await equip('item-67');
    const hero = game.getSnapshot().pos;
    game.handleClick({ x: hero.x, y: hero.y - 12 });
    await until(() => scores.at(-1) === 34, 'Pegasus takeoff score');
    advance(2500);
    capture('Pegasus transformation at the lagoon');
    await until(() => id === 199 && !playing && !loading, 'arrival on Castle Kyrandia’s island');
    expectScore(31);
    held(null);
    if (!game.getSnapshot().inventorySlots.includes('item-24') || !lines.some(line => line.includes('That was wild')))
      throw Error('The landing sequence did not finish with the chalice');
    capture('Brandon on the castle island');
    const arrived = validateWorldSave(game.getSaveState());
    game.stop();
    game = await startGame(canvas, { ...config, saveState: arrived });
    if (game.getSaveState()?.currentRoom !== 199) throw Error('The island checkpoint did not restore');
    await travel(200);
    expectScore(31);
    await click(144, 44);
    if (!lines.some(line => line.includes('William and Katherine'))) throw Error('The tombstone did not read out the royal names');
    await equip('item-18');
    game.handleClick({ x: 157, y: 70 });
    await until(() => lines.some(line => line.includes("I knew you'd come")), 'Katherine’s apparition');
    capture('Katherine’s ghost at the misty grave');
    await settle();
    held(null);
    const grave = validateWorldSave(game.getSaveState());
    if (!grave.quest.flags.includes(87) || !grave.quest.flags.includes(211) || !scores.includes(30))
      throw Error('Katherine did not awaken the red jewel');
    await route(201, 200, 202, 200, 203, 204);
    capture('The guardian gargoyles at the castle gate');
    if (game.getPortals().some(portal => portal.target === 205)) throw Error('The locked gate exposed its exit');
    const beforeGate = validateWorldSave(game.getSaveState());

    await equip('item-57');
    await click(169, 90);
    if (!dead || !scores.includes(49) || game.getSaveState()) throw Error('The gargoyles did not punish the unprotected attempt');
    game.stop();
    dead = false;
    game = await startGame(canvas, { ...config, saveState: beforeGate });
    await click(241, 177);
    const invisible = validateWorldSave(game.getSaveState());
    if (!(invisible.rooms[204].invisibleMs! > 0)) throw Error('The red jewel did not make Brandon invisible');
    capture('Invisible Brandon before the locked gate');
    game.stop();
    game = await startGame(canvas, { ...config, saveState: invisible });
    await equip('item-57');
    await click(169, 90);
    held(null);
    if (!game.getSaveState()?.quest.flags.includes(219) || !lines.some(line => line.includes('Thanks, Mom')))
      throw Error('The iron key did not open the gate while invisible');
    capture('The unlocked gate of Castle Kyrandia');
    const openGate = validateWorldSave(game.getSaveState());
    game.stop();
    game = await startGame(canvas, { ...config, saveState: openGate });
    const entry = travel(205);
    await until(() => lines.some(line => line.includes('puppies')), 'Malcolm’s greeting');
    capture('Malcolm greets Brandon in the castle entry hall');
    await entry;
    expectScore(39);
    if (!scores.includes(45) || !game.getSaveState()?.quest.flags.includes(213) ||
        !game.getSnapshot().inventorySlots.includes('item-24')) throw Error('The castle introduction did not finish');
    await route(212, 214, 215, 208);
    await click(280, 50);
    held('item-104');
    await putAway();
    await route(215, 206);
    expectScore(39);
    capture('The Great Hall of Castle Kyrandia');
    await click(72, 80);
    await until(() => id === 207 && !playing && !loading, 'the library off the Great Hall');

    await click(286, 76);
    await click(13, 20);
    const openedBooks = validateWorldSave(game.getSaveState());
    if (![226, 233].every(flag => openedBooks.quest.flags.includes(flag))) throw Error('The books did not stay pulled out');
    game.stop();
    game = await startGame(canvas, { ...config, saveState: openedBooks });
    await click(10, 82);
    await click(30, 77);
    held('item-103');
    if (!game.getSaveState()?.quest.flags.includes(224)) throw Error('OPEN did not reveal the crown');
    await putAway();
    capture('The library after the book puzzle');
    await click(149, 81);
    await until(() => id === 245 && !playing && !loading, 'the fireplace ride into the catacombs');
    await route(244, 243, 240, 236, 235, 231, 232);
    expectScore(39);
    await click(156, 6);
    if (id !== 232 || !lines.some(line => line.includes('magical force field'))) throw Error('The force field did not block the passage');
    capture('The force field in the catacombs');
    await click(286, 177);
    if (!game.getSaveState()?.quest.flags.includes(234)) throw Error('The blue jewel did not dispel the force field');
    await click(266, 187);
    await route(230, 229);
    if (!game.getSnapshot().wispMs) throw Error('The wisp did not keep its light through the passages');
    await click(208, 63);
    const uncovered = validateWorldSave(game.getSaveState());
    if (!uncovered.quest.flags.includes(235)) throw Error('The rock did not move');
    game.stop();
    game = await startGame(canvas, { ...config, saveState: uncovered });
    await click(208, 63);
    held('item-105');
    if (!game.getSaveState()?.quest.flags.includes(236)) throw Error('The catacomb key was not collected');
    capture('The gold key beneath the rock');
    await putAway();
    await route(230, 232, 231, 235, 236, 240, 243, 244, 245, 207);
    if (!game.getSnapshot().inventorySlots.includes('item-105')) throw Error('The gold key was lost returning through the fireplace');
    results.textContent += 'ALL PASSED — castle halls, OPEN, fireplace, force field and catacomb key';
    document.title = 'PASS — Castle Kyrandia and catacombs';
  } catch (error) {
    results.textContent += `FAIL ${error}`;
    document.title = 'FAIL — Enchanted Fountain';
  }
});

document.querySelector('#royal')!.addEventListener('click', async () => {
  lockScenario();
  try {
    const start = validateWorldSave(game.getSaveState());
    start.rooms[0].treeSpoken = true;
    start.rooms[0].inventorySlots.splice(0, 4, 'item-105', 'item-104', 'item-103', 'item-24');
    start.quest.flags.push(45, 86, 213, 219, 224, 234, 235, 236);
    async function reload(save = validateWorldSave(game.getSaveState())) {
      game.stop();
      game = await startGame(canvas, { ...config, saveState: save });
      game.setWalkSpeed('fastest');
    }
    const flags = () => game.getSaveState()?.quest.flags ?? [];
    const equip = async (item: InventoryItemId | null) => {
      const index = game.getSnapshot().inventorySlots.indexOf(item);
      const slot = getInventorySlotPositions()[index];
      if (!slot) throw Error(`No slot for ${item}`);
      await click(slot.x + 8, slot.y + 8);
    };
    const choose = async (x: number, y: number) => {
      const next = bellChoices + 1;
      game.handleClick({ x, y });
      await until(() => bellChoices === next || !playing, 'bell input');
    };

    await reload(start);
    game.runSequence([{ op: 'exit', target: 207 }]);
    await until(() => id === 207 && !loading && !playing, 'library after catacombs');
    await travel(206);
    await equip('item-105');
    await click(140, 53);
    held(null);
    await click(140, 53);
    if (!flags().includes(220) || flags().includes(221) || id !== 206) throw Error('The first key opened both locks');
    await click(42, 97);
    await until(() => id === 213 && !loading && !playing, 'Great Hall to west corridor');
    await route(211, 205, 227);
    if (!royalMovies.has('upstairs') || !flags().includes(215)) throw Error('The stairs did not play their original scene');
    capture('Top of the castle stairs');

    await route(217, 219, 225);
    await click(160, 22);
    held('item-45');
    if (!lines.some(line => line.includes("Zanthia's hair"))) throw Error('Zanthia’s hair ring did not trigger the original line');
    await equip(null);
    await route(219, 228);
    capture('The balcony above the Great Hall');
    await click(250, 35);
    await until(() => id === 221 && !loading && !playing, 'east balcony doorway');
    await travel(224);
    await click(223, 65);
    capture('Darm’s bedroom');
    await route(221, 228);
    await click(70, 35);
    await until(() => id === 220 && !loading && !playing, 'west balcony doorway');
    await route(223, 220, 228);
    await click(43, 33);
    await until(() => id === 218 && !loading && !playing, 'hallway with Herman');

    await click(42, 92);
    if (!royalMovies.has('hersaw1') || !flags().includes(255) || !scores.includes(43) ||
        !lines.some(line => line.includes('sharpened it just for you'))) throw Error('Herman did not warn Brandon');
    const warned = validateWorldSave(game.getSaveState());
    capture('Herman threatens Brandon');
    game.handleClick({ x: 42, y: 92 });
    await until(() => dead && !playing, 'fatal approach to Herman');
    if (!royalMovies.has('hersaw2') || game.getSaveState()) throw Error('Herman’s attack failed');
    dead = false;
    await reload(warned);
    await click(266, 158);
    const sleep = game.getSnapshot().runtime?.sceneAnims[4];
    if (!flags().includes(256) || !royalMovies.has('hersaw3') || !sleep?.play || !sleep.visible)
      throw Error('The yellow jewel did not put Herman to sleep');
    capture('Herman asleep beside the Music Room');
    await reload();
    await travel(226);
    await choose(234, 90);
    await choose(186, 85);
    await choose(160, 120);
    await settle();
    if (flags().includes(222)) throw Error('An incorrect bell sequence moved the portrait');
    await choose(234, 90);
    capture('Brandon at the bells', false);
    const firstNote = scores.length;
    for (const [x, y] of [[226, 96], [186, 85], [202, 95], [215, 95]]) await choose(x, y);
    await settle();
    if (!flags().includes(222) || scores.slice(firstNote).join(',') !== '35,38,37,36,46,1,39') throw Error('The bell melody or key reveal did not play');
    capture('The second gold key behind the portrait');
    await reload();
    await click(154, 26);
    held('item-105');
    if (!flags().includes(223)) throw Error('The second key was not collected');
    await equip(null);
    await click(154, 26);
    held(null);
    await route(218, 216, 227, 205);
    if (!royalMovies.has('dnstairs') || !game.getSnapshot().runtime?.actorVisible) throw Error('The stair descent did not finish');
    await route(211, 213, 206);
    await equip('item-105');
    await click(140, 53);
    held(null);
    if (!flags().includes(221)) throw Error('The second key did not unlock the royal doors');
    await click(140, 53);
    await until(() => id === 209 && !loading && !playing, 'Royal Foyer');

    await equip('item-104');
    await click(116, 20);
    await equip('item-24');
    await click(152, 20);
    await equip('item-103');
    await click(188, 20);
    if (!lines.some(line => line.includes('in the correct order'))) throw Error('The incorrect regalia order was accepted');
    await reload();
    await click(152, 20);
    held('item-24');
    await equip(null);
    await click(188, 20);
    held('item-103');
    await click(152, 20);
    await equip('item-24');
    await click(188, 20);
    if (!scores.includes(47) || !scores.includes(48) || !['punch1', 'punch2', 'punch3'].every(clip => royalMovies.has(clip)))
      throw Error('The royal doorway and Malcolm’s cutscene did not play');
    await reload();
    const foyer = validateWorldSave(game.getSaveState());
    if (foyer.quest.foyerItems?.join(',') !== '104,103,24' || !foyer.rooms[209].runtime?.layers.some(layer => layer.clip === 'foyer' && layer.index === 19))
      throw Error('The royal door did not stay open after loading');
    capture('The royal chamber opened');
    results.textContent += 'ALL PASSED — upper castle, Herman, bells, both locks and royal foyer';
  } catch (error) {
    results.textContent += `FAIL ${error}`;
  }
});
