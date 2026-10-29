import { startGame } from "../../src/engine/gameplay/game";
import { gemCutScene } from "../../src/engine/scenes/gemCut";
import { roomPortals, type WorldRoom } from "../../src/engine/gameplay/world";
import { IndexedClip, loadScenePack } from "../../src/engine/resources/scenePack";

const canvas = document.querySelector("canvas")!, results = document.querySelector("#results")!;
let callbacks: FrameRequestCallback[] = [], now = performance.now(), id = 0, playing = false, loading = false, error = "";
window.requestAnimationFrame = callback => { callbacks.push(callback); return callbacks.length; };
const visited = new Set<number>();
let expectedHeld: "ruby" | null = "ruby";
const originalFetch = window.fetch.bind(window);
// First reject the speculative request, so the entrance can exercise a real retry.
let failNextEntrance = true;
let holdNextEntrance = false, releaseNextEntrance: (() => void) | null = null;
window.fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (failNextEntrance && url.endsWith("/world/1.kyr.gz")) {
    failNextEntrance = false;
    return Promise.resolve(new Response("Deliberate transition failure", { status: 503 }));
  }
  if (holdNextEntrance && url.endsWith("/world/1.kyr.gz")) {
    holdNextEntrance = false;
    return new Promise<Response>((resolve, reject) => { releaseNextEntrance = () => { void originalFetch(input, init).then(resolve, reject); }; });
  }
  return originalFetch(input, init);
};
const game = await startGame(canvas, { scene: gemCutScene, world: "/kyraweb/assets/world/world.json",
  onLocationChange: (name, roomId) => { id = roomId!; document.querySelector("#location")!.textContent = `${id}: ${name}`; },
  onSequenceChange: value => { playing = value; }, onLoadingChange: value => { loading = value; },
  onNavigationError: value => { error = value; },
  onSubtitleChange: lines => { document.querySelector("#line")!.textContent = lines.map(l => l.text).join(" "); }
});
const { rooms } = await fetch("/kyraweb/assets/world/world.json").then(r => r.json()) as { rooms: WorldRoom[] };
const portals = new Map<number, ReturnType<typeof roomPortals>>();
for (const room of rooms) {
  const pack = await loadScenePack(`/kyraweb/assets/world/${room.id}.kyr.gz`), mask = new IndexedClip(pack, pack.clips.mask);
  portals.set(room.id, roomPortals(room, { width: 320, height: 144, pixels: Array.from(mask.frame(0)) }));
}
function advance(ms: number) {
  for (let t = 0; t < ms; t += 50) { now += 50; const batch = callbacks; callbacks = []; batch.forEach(callback => callback(now)); }
}
async function until(check: () => boolean, label: string, allowError = false) {
  for (let i = 0; i < 500; i++) {
    if (error && !allowError) throw new Error(error);
    if (check()) return;
    advance(500); await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error(`Timeout ${label}; current=${id}, playing=${playing}, loading=${loading}`);
}
function capture() {
  if (visited.has(id)) return;
  visited.add(id);
  const figure = document.createElement("figure"), image = document.createElement("img"), caption = document.createElement("figcaption");
  image.src = canvas.toDataURL(); image.alt = rooms[id].name;
  caption.textContent = `${id}: ${rooms[id].title}`; figure.append(image, caption); document.querySelector("#gallery")!.append(figure);
}
async function travel(target: number) {
  const portal = portals.get(id)!.find(p => p.target === target)!;
  if (!portal) throw new Error(`No exit ${id} -> ${target}`);
  game.handleClick({ x: portal.rect.x + portal.rect.w / 2, y: portal.rect.y + portal.rect.h / 2 });
  // The first exit attempt runs the original tree dialogue before allowing departure.
  if (id === 0 && playing) { await until(() => !playing, "tree conversation"); game.handleClick({ x: 160, y: 132 }); }
  await until(() => id === target && !loading && !playing, `walk to ${target}`);
  advance(50); capture();
  if (game.getSnapshot().itemInHand !== expectedHeld) throw new Error("Held item lost at room transition");
  results.textContent += `PASS ${target}: ${rooms[target].title}\n`;
}
document.querySelector("#run")!.addEventListener("click", async () => {
  try {
    await until(() => !playing, "original opening"); capture();
    game.handleClick({ x: 248, y: 80 });
    if (game.getSnapshot().itemInHand !== "ruby") throw new Error("Could not pick up ruby");
    failNextEntrance = true;
    game.handleClick({ x: 160, y: 132 }); await until(() => !playing, "tree conversation");
    game.handleClick({ x: 160, y: 132 }); await until(() => !!error, "failed transition", true);
    if (id !== 0 || game.getSnapshot().itemInHand !== "ruby") throw new Error("Failed transition lost current room or item");
    advance(100); game.handleClick({ x: 160, y: 132 });
    await until(() => id === 1 && !loading && !playing, "transition retry", true);
    if (error) throw new Error("Retry left error message behind");
    await travel(0); results.textContent += "PASS transition failure and retry preserve room and item\n";
    const reached = new Set([0]);
    async function explore(room: number) {
      for (const portal of portals.get(room)!) if (!reached.has(portal.target)) {
        reached.add(portal.target); await travel(portal.target); await explore(portal.target); await travel(room);
      }
    }
    await explore(0);
    if (visited.size !== 17 || id !== 0) throw new Error("Region was not fully traversed and returned home");
    if (!game.getSnapshot().treeSpoken) throw new Error("Tree conversation state lost on return");
    if (portals.get(7)!.some(p => p.target === 24)) throw new Error("Broken bridge is passable");
    game.handleClick({ x: 100, y: 165 }); expectedHeld = null;
    game.handleClick({ x: 215, y: 83 });
    await until(() => !playing, "original note pickup");
    if (game.getSnapshot().itemInHand !== "letter") throw new Error("Could not pick up letter");
    game.handleClick({ x: 120, y: 165 });
    await travel(1); await travel(0);
    if (game.getSnapshot().inventorySlots[0] !== "ruby" || game.getSnapshot().inventorySlots[1] !== "letter") throw new Error("Inventory lost after returning");
    if (game.getSnapshot().overlays.find(o => o.id === "letter")?.pickable) throw new Error("Letter respawned");
    game.handleClick({ x: 100, y: 165 }); game.handleClick({ x: 120, y: 120 }); advance(2000);
    await travel(1); await travel(0);
    if (game.getSnapshot().sceneItems.filter(item => item.id === "ruby").length !== 1) throw new Error("Dropped ruby lost or duplicated");
    // A fresh session has no decoded neighbour yet; hold its prefetch and join it on entry.
    game.stop(); holdNextEntrance = true;
    const pendingGame = await startGame(canvas, { scene: gemCutScene, world: "/kyraweb/assets/world/world.json", playOpening: false,
      onLocationChange: (_, roomId) => { id = roomId!; }, onLoadingChange: value => { loading = value; } });
    pendingGame.runSequence([{ op: 'exit', target: 1, entry: { x: 208, y: 110 } }]);
    await until(() => releaseNextEntrance !== null && loading, "pending transition");
    pendingGame.stop(); const stoppedFrame = canvas.toDataURL();
    releaseNextEntrance!(); await new Promise(resolve => setTimeout(resolve, 30)); advance(1000);
    if (id !== 0 || canvas.toDataURL() !== stoppedFrame) throw new Error("Stopped transition changed room or canvas");
    results.textContent += "ALL PASSED — 17 rooms, round trips, both lift directions, held item, inventory, dropped items, tree state, broken bridge, retry and cancellation";
    document.title = "PASS — world navigation";
  } catch (e) { results.textContent += `FAIL ${e}`; document.title = "FAIL — world navigation"; }
});
advance(50);
