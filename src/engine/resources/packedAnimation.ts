import { IndexedClip, loadScenePack } from "./scenePack";
import { IndexedRenderer } from "../rendering/indexedRenderer";

export async function loadPackedAnimation(src: string, name: string, signal?: AbortSignal) {
  const pack = await loadScenePack(src, signal);
  signal?.throwIfAborted();
  const info = pack.clips[name];
  if (!info) throw new Error(`Scene pack has no clip: ${name}`);
  const clip = new IndexedClip(pack, info);
  const renderer = new IndexedRenderer(info);
  return {
    clip, renderer,
    render: (frame: number) => renderer.render(clip.frame(frame)),
    dispose: () => renderer.dispose()
  };
}
export type PackedAnimation = Awaited<ReturnType<typeof loadPackedAnimation>>;
