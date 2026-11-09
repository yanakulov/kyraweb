import { startGame } from "../../src/engine/gameplay/game";
import { gemCutScene } from "../../src/engine/scenes/gemCut";
import { validateWorldSave } from '../../src/engine/gameplay/saveStorage';
import type { GameConfig } from '../../src/engine/core/types';
import { getInventorySlotPositions } from '../../src/engine/gameplay/inventory';
import { itemFromOriginal } from '../../src/engine/gameplay/forest';
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
  onLocationChange: (name, room) => {
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
