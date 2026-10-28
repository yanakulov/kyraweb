import { startGame } from "../../src/engine/gameplay/game";
import { gemCutScene } from "../../src/engine/scenes/gemCut";
import type { OpeningScript } from "../../src/engine/gameplay/roomScript";
import { IndexedClip, loadScenePack } from '../../src/engine/resources/scenePack';

// A visible test fixture controls a real engine clock, without changing production speed.
const canvas = document.querySelector("canvas")!;
const results = document.querySelector("#results")!;
const context = canvas.getContext('2d')!;
const originalDraw = context.drawImage.bind(context);
let drawOrder: string[] = [], treeFramesChecked = 0;
const pack = await loadScenePack('/kyraweb/assets/packs/opening.kyr.gz');
const homePack = await loadScenePack('/kyraweb/assets/forest/gemcut.kyr.gz');
const homeClip = new IndexedClip(homePack, homePack.clips.room);
context.drawImage = (...args: any[]) => {
  const image = args[0];
  if (image instanceof HTMLImageElement && image.src.includes('/brandon/')) drawOrder.push('actor');
  if (image instanceof HTMLCanvasElement && image.width === pack.clips.face.width && image.height === pack.clips.face.height && args[1] === 104 && args[2] === 32) drawOrder.push('tree');
  originalDraw(...args as Parameters<typeof originalDraw>);
};
let nextFrames: FrameRequestCallback[] = [], now = performance.now(), active = false;
let line = "", captureNext = false;
const seen: string[] = [], captures = new Set<string>();
window.requestAnimationFrame = callback => { nextFrames.push(callback); return nextFrames.length; };
const game = await startGame(canvas, { scene: gemCutScene,
  world: '/kyraweb/assets/world/world.json',
  onSequenceChange: value => { active = value; },
  onSubtitleChange: lines => {
    line = lines.map(item => item.text).join(" ");
    document.querySelector("#subtitle")!.textContent = line;
    if (line) { seen.push(line); captureNext = true; }
  }
});
const script: OpeningScript = await fetch("/kyraweb/assets/packs/opening.json").then(r => r.json());
function capture(label: string) {
  if (captures.has(label)) return;
  captures.add(label);
  const figure = document.createElement("figure"), image = document.createElement("img"), caption = document.createElement("figcaption");
  image.src = canvas.toDataURL(); image.alt = label; caption.textContent = label;
  figure.append(image, caption); document.querySelector("#captures")!.append(figure);
}
function advance(ms: number) {
  for (let time = 0; time < ms; time += 50) {
    drawOrder = [];
    now += 50;
    const callbacks = nextFrames; nextFrames = []; callbacks.forEach(callback => callback(now));
    if (drawOrder.includes('tree') && drawOrder.includes('actor')) {
      if (drawOrder.indexOf('tree') > drawOrder.indexOf('actor')) throw Error('Tree movie overpainted Brandon');
      treeFramesChecked++;
    }
    if (captureNext) { capture(line); captureNext = false; }
    if (now % 500 < 50 && captures.size < 3) capture(`Opening ${Math.round(now)}`);
  }
  results.textContent = `${active ? "Sequence playing" : "Ready for input"}\n${seen.join("\n")}`;
}
document.querySelector("#second")!.addEventListener("click", () => advance(1000));
document.querySelector("#ten")!.addEventListener("click", () => advance(10000));
document.querySelector("#tree")!.addEventListener("click", () => { game.handleClick({ x: 150, y: 50 }); advance(100); });
document.querySelector("#all")!.addEventListener("click", () => {
  try {
    // Clicking or attempting to walk while the opening plays cannot replace it.
    game.handleClick({ x: 150, y: 50 }); game.setTarget({ x: 20, y: 120 });
    for (let i = 0; active && i < 60; i++) advance(1000);
    if (active) throw new Error("Opening never completed");
    const homePixels = homeClip.frame(0), homeImage = context.getImageData(0, 0, 320, 200).data;
    for (const shape of [{x:213,y:81,sx:8,sy:137,w:16,h:6},{x:248,y:93,sx:128,sy:136,w:24,h:22}]) {
      for (let y=0;y<shape.h;y++) for(let x=0;x<shape.w;x++) {
        const index=homePixels[(shape.sy+y)*320+shape.sx+x];
        if(!index)continue;
        for(let c=0;c<3;c++) if(homeImage[((shape.y+y)*320+shape.x+x)*4+c]!==homeClip.info.palette[index*3+c]) throw Error(`Home prop missing at ${shape.x+x},${shape.y+y}`);
      }
    }
    const initial = script.opening.filter(a => a.op === "say").map(a => a.op === "say" ? a.text : "");
    if (JSON.stringify(seen) !== JSON.stringify(initial)) throw new Error("Opening dialogue missing or out of order");
    capture("Opening completed: Kallak discovered");
    game.handleClick({ x: 150, y: 50 });
    if (!active) throw new Error("Tree hotspot did not start conversation");
    for (let i = 0; active && i < 240; i++) { game.handleClick({ x: 20, y: 120 }); advance(1000); }
    if (active) throw new Error("Tree conversation never completed");
    if (!treeFramesChecked) throw Error('No tree/actor composition was checked');
    const expected = [...initial, ...script.tree.filter(a => a.op === "say").map(a => a.op === "say" ? a.text : "")];
    if (JSON.stringify(seen) !== JSON.stringify(expected)) throw new Error("Tree dialogue missing or out of order");
    game.handleClick({ x: 150, y: 50 });
    if (active) throw new Error("Completed tree conversation restarted");
    capture("Tree conversation finished: input restored");
    game.setTarget({ x: 120, y: 120 }); advance(1500);
    game.stop(); advance(1000);
    if (line) throw new Error("Stopped game left subtitles behind");
    results.textContent += "\nALL PASSED — full opening, all 29 tree lines, input lock, one-time conversation and cancellation";
    document.title = "PASS — original opening";
  } catch (error) { results.textContent += `\nFAIL ${error}`; document.title = "FAIL — original opening"; }
});
advance(50);
// Home quest shapes must never leak into the lower lift's background.
const trunk = new IndexedClip(pack, pack.clips.trunk), pixels = trunk.frame(0);
const visible = context.getImageData(0, 0, 320, 200).data;
for (const rect of [{x:213,y:81,w:12,h:12},{x:248,y:93,w:16,h:10}]) {
  for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) {
    const index = pixels[y * 320 + x];
    for (let c = 0; c < 3; c++) if (visible[(y * 320 + x) * 4 + c] !== trunk.info.palette[index * 3 + c]) throw Error(`Home item leaked into lift at ${x},${y}`);
  }
}
