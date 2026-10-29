import { startGame } from "../../src/engine/gameplay/game";
import { gemCutScene } from "../../src/engine/scenes/gemCut";
import { roomPortals, type WorldRoom } from "../../src/engine/gameplay/world";
import {
  IndexedClip,
  loadScenePack,
} from "../../src/engine/resources/scenePack";
import { loadForestData } from "../../src/engine/gameplay/forest";

const canvas = document.querySelector("canvas")!,
  results = document.querySelector("#results")!;
let callbacks: FrameRequestCallback[] = [],
  now = performance.now(),
  id = 0,
  playing = false,
  loading = false,
  confirm = false,
  dead = false,
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
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  try {
    return await realFetch(input, init);
  } catch (e) {
    throw Error("Fetch failed " + String(input) + ": " + e);
  }
};
const game = await startGame(canvas, {
  scene: gemCutScene,
  world: "/kyraweb/assets/world/world.json",
  playOpening: false,
  onDeath: () => {
    dead = true;
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
});
const { rooms } = (await fetch("/kyraweb/assets/world/world.json").then((r) =>
  r.json(),
)) as { rooms: WorldRoom[] };
game.setWalkSpeed('fastest');
const forest = await loadForestData("/kyraweb/assets/forest/forest.json.gz");
let repaired = false;
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
async function travel(target: number) {
  const original = rooms.find((r) => r.id === id);
  const meta =
    id === 24
      ? forest.rooms.CAVEB
      : id === 7 && repaired
        ? forest.rooms.BRIDGE
        : original!;
  const pack = await loadScenePack(
      `/kyraweb/assets/${id === 24 || (id === 7 && repaired) ? "forest/" + meta.name.toLowerCase() : "world/" + id}.kyr.gz`,
    ),
    clip = new IndexedClip(pack, pack.clips.mask);
  const portal = roomPortals(meta, {
    width: clip.info.width,
    height: clip.info.height,
    pixels: Array.from(clip.frame(0)),
  }).find((p) => p.target === target);
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
    repaired = true;
    await route(11, 12, 13, 9, 7);
    capture("Repaired bridge");
    await route(24, 7);
    capture("Returned across the repaired bridge");
    if (!lines.some((t) => t.includes("You can have the marble")))
      throw Error("Merith dialogue missing");
    if (!lines.some((t) => t.includes("That must be the amulet")))
      throw Error("Amulet dialogue missing");
    results.textContent +=
      "ALL PASSED — original note, rose, willow, Merith chase, marble, saw, amulet, bridge and return trip";
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
    game.handleClick({ x: 40, y: 100 });
    advance(60000);
    if (!playing || dead)
      throw Error("Bridge warning did not wait for a decision");
    capture("Herman warns about the rope");
    game.handleClick({ x: 280, y: 110 });
    await settle();
    if (dead) throw Error("Retreat killed Brandon");
    game.handleClick({ x: 40, y: 100 });
    advance(60000);
    game.handleClick({ x: 40, y: 100 });
    await settle();
    if (!dead) throw Error("Fatal crossing did not complete");
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
