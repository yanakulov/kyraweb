import { loadImage, loadSceneMeta, loadSceneShapes } from "../core/assets";
import { buildSceneShapesCanvas, buildSpriteDefMap } from "../scene/sceneShapes";
import { loadPackedAnimation } from "../resources/packedAnimation";
import type { IntroStep } from "./types";
import { IndexedClip, loadScenePack } from "../resources/scenePack";

export async function loadIntroResources(step: IntroStep, signal: AbortSignal) {
  const paths = new Set<string>();
  const add = (...values: (string | undefined)[]) => values.forEach(value => { if (value) paths.add(value); });
  add(step.bgSrc, step.overlaySrc);
  for (const track of [step.frames, step.bgFrames, step.overlayFrames]) track?.src.forEach(src => add(src));
  add(step.scroll?.topSrc, step.scroll?.bottomSrc, step.scrollSlices?.topSrc, step.scrollSlices?.bottomSrc,
    step.scrollIntro?.baseSrc, step.scrollIntro?.bottomSrc);
  const indexedPromise = step.indexedFrames
    ? loadPackedAnimation(step.indexedFrames.src, step.indexedFrames.clip, signal)
    : Promise.resolve(null);
  const indexedBgPromise = step.indexedBgFrames ? loadPackedAnimation(step.indexedBgFrames.src, step.indexedBgFrames.clip, signal) : Promise.resolve(null);
  const shapesPromise = step.sceneAnim?.shapesPack ? loadScenePack(step.sceneAnim.shapesPack.src, signal).then(pack => {
    const info = pack.clips[step.sceneAnim!.shapesPack!.clip];
    if (!info) throw new Error("Scene shapes missing from pack");
    return buildSceneShapesCanvas({ width: info.width, height: info.height, palette: info.palette, rawBase64: "" }, new IndexedClip(pack, info).frame(0));
  }) : step.sceneAnim?.shapesSrc ? loadSceneShapes(step.sceneAnim.shapesSrc).then(buildSceneShapesCanvas) : null;
  try {
    const [images, meta, shapes, animation, background] = await Promise.all([
      Promise.all([...paths].map(async src => [src, await loadImage(src, signal)] as const)),
      step.sceneAnim ? loadSceneMeta(step.sceneAnim.metaSrc) : null,
      shapesPromise,
      indexedPromise, indexedBgPromise
    ]);
    signal.throwIfAborted();
    return {
      images: new Map(images), indexed: animation, indexedBg: background,
      scene: meta && shapes ? { meta, shapes, sprites: buildSpriteDefMap(meta.spriteDefs) } : null,
      dispose() { animation?.dispose(); background?.dispose(); }
    };
  } catch (error) {
    // A sibling image may fail before the indexed fetch finishes.
    void indexedPromise.then(value => value?.dispose(), () => {});
    void indexedBgPromise.then(value => value?.dispose(), () => {});
    throw error;
  }
}
export type IntroResources = Awaited<ReturnType<typeof loadIntroResources>>;
