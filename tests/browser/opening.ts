import { startGame } from "../../src/engine/gameplay/game";
import { gemCutScene } from "../../src/engine/scenes/gemCut";
import type { OpeningScript } from "../../src/engine/gameplay/roomScript";

// A visible test fixture controls a real engine clock, without changing production speed.
const canvas = document.querySelector("canvas")!;
const results = document.querySelector("#results")!;
let nextFrames: FrameRequestCallback[] = [], now = performance.now(), active = false;
let line = "", captureNext = false;
const seen: string[] = [], captures = new Set<string>();
window.requestAnimationFrame = callback => { nextFrames.push(callback); return nextFrames.length; };
const game = await startGame(canvas, { scene: gemCutScene,
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
    now += 50;
    const callbacks = nextFrames; nextFrames = []; callbacks.forEach(callback => callback(now));
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
    const initial = script.opening.filter(a => a.op === "say").map(a => a.op === "say" ? a.text : "");
    if (JSON.stringify(seen) !== JSON.stringify(initial)) throw new Error("Opening dialogue missing or out of order");
    capture("Opening completed: Kallak discovered");
    game.handleClick({ x: 150, y: 50 });
    if (!active) throw new Error("Tree hotspot did not start conversation");
    for (let i = 0; active && i < 240; i++) { game.handleClick({ x: 20, y: 120 }); advance(1000); }
    if (active) throw new Error("Tree conversation never completed");
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
