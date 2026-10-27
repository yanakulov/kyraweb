import { IndexedClip, loadScenePack } from "../../src/engine/resources/scenePack";
import { IndexedRenderer, buildIndexedCanvas } from "../../src/engine/rendering/indexedRenderer";
import { startGame } from "../../src/engine/gameplay/game";
import { gemCutScene } from "../../src/engine/scenes/gemCut";
import { buildIntroSteps, playIntro } from "../../src/engine/intro";

const results = document.querySelector("#results")!;
const lines: string[] = [];
const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); lines.push(`PASS ${message}`); };
function read(canvas: HTMLCanvasElement) {
  const copy = document.createElement("canvas"); copy.width = canvas.width; copy.height = canvas.height;
  const ctx = copy.getContext("2d")!; ctx.drawImage(canvas, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}
function equal(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function run() {
  for (const [file, name] of [["kallak-room", "room"], ["kallak-writing", "writing"], ["tree1", "tree1"], ["mal-kal", "mal-kal"]]) {
    const pack = await loadScenePack(`/kyraweb/assets/packs/${file}.kyr.gz`);
    const clip = new IndexedClip(pack, pack.clips[name]);
    const gpu = new IndexedRenderer(clip.info), cpu = new IndexedRenderer(clip.info, false);
    try {
      assert(gpu.backend === "webgl2", `${name}: actual WebGL2 context`);
      for (const frame of [0, Math.floor(clip.info.frames.length / 2), clip.info.frames.length - 1]) {
        const pixels = clip.frame(frame);
        assert(equal(read(gpu.render(pixels)), read(cpu.render(pixels))), `${name}:${frame}: GPU and Canvas pixels identical`);
      }
      const changed = [...clip.info.palette]; changed[3] = changed[3] ^ 255;
      gpu.setPalette(changed); cpu.setPalette(changed);
      assert(equal(read(gpu.render(clip.frame(0))), read(cpu.render(clip.frame(0)))), `${name}: palette changes agree`);
      const canvas = gpu.render(clip.frame(0));
      const context = canvas.getContext("webgl2")!;
      const lost = new Promise<void>(resolve => canvas.addEventListener("webglcontextlost", () => resolve(), { once: true }));
      context.getExtension("WEBGL_lose_context")!.loseContext(); await lost;
      assert(gpu.backend === "canvas2d" && equal(read(gpu.render(clip.frame(0))), read(cpu.render(clip.frame(0)))), `${name}: context loss recovers with exact 2D pixels`);
    } finally { gpu.dispose(); cpu.dispose(); }
    if (name === "room") {
      const hud = new IndexedClip(pack, pack.clips.hud);
      const pixels = read(buildIndexedCanvas(hud.info, hud.frame(0), true));
      assert(pixels[(60 * 320 + 160) * 4 + 3] === 0, "HUD scene opening is transparent, including black palette index 12");
    }
  }
  // The game must not rely on browser pixel readback for HUD or occlusion.
  const saved = CanvasRenderingContext2D.prototype.getImageData;
  const gameCanvas = document.createElement("canvas"); document.body.append(gameCanvas);
  CanvasRenderingContext2D.prototype.getImageData = () => { throw new Error("Canvas readback forbidden in this regression test"); };
  try {
    const game = await startGame(gameCanvas, { scene: { ...gemCutScene, opening: undefined } });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    game.setTarget({ x: 120, y: 100 });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    game.stop();
    assert(true, "Kallak room renders HUD, foreground, actor and walking without getImageData");
  } finally { CanvasRenderingContext2D.prototype.getImageData = saved; }
  const composite = read(gameCanvas), roomPixel = (60 * 320 + 160) * 4;
  assert(composite[roomPixel] + composite[roomPixel + 1] + composite[roomPixel + 2] > 0,
    "HUD composition leaves room artwork visible");
  const introCanvas = document.createElement("canvas"); document.body.append(introCanvas);
  for (const step of buildIntroSteps()) {
    const scale = 160 / step.durationMs;
    const track = <T extends { frameTimesMs: number[]; loopMs?: number }>(value: T | undefined) => value ? {
      ...value, frameTimesMs: value.frameTimesMs.map(time => time * scale), loopMs: value.loopMs ? value.loopMs * scale : undefined
    } : undefined;
    let entered = false;
    const playback = playIntro(introCanvas, [{ ...step, durationMs: 160, fadeInMs: 0, fadeOutMs: 0,
      indexedFrames: track(step.indexedFrames), indexedBgFrames: track(step.indexedBgFrames) }], {
      onStepChange: id => { entered = id === step.id; }
    });
    await playback.done;
    assert(entered, `${step.id}: real resources loaded and rendered`);
  }
  assert(!performance.getEntriesByType("resource").some(entry => entry.name.includes("/intro/frames/")), "No legacy PNG frame requests");
}
run().then(() => { results.textContent = `${lines.join("\n")}\nALL PASSED`; document.title = "PASS — indexed rendering"; })
  .catch(error => { results.textContent = `${lines.join("\n")}\nFAIL ${error.stack}`; document.title = "FAIL — indexed rendering"; });
