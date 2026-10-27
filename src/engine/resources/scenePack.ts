/** KYR1: a little-endian header, UTF-8 manifest, then lossless indexed frames.
 * Packs are gzip-compressed for distribution; original game formats stay in the importer.
 */
export type PackedFrame = { offset: number; length: number; key: boolean };
export type PackedClip = {
  width: number; height: number; palette: number[]; transparentIndex: number;
  frames: PackedFrame[];
};
export type ScenePack = { clips: Record<string, PackedClip>; payload: Uint8Array };

export function parseScenePack(bytes: Uint8Array): ScenePack {
  const fail = () => { throw new Error("Invalid KYR1 scene pack"); };
  if (bytes.length < 8 || String.fromCharCode(...bytes.subarray(0, 4)) !== "KYR1") return fail();
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  if (size > 1024 * 1024 || size > bytes.length - 8) return fail();
  const manifest = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + size)));
  const payload = bytes.subarray(8 + size);
  if (manifest.version !== 1 || !manifest.clips || Array.isArray(manifest.clips)) return fail();
  const clips = manifest.clips as Record<string, PackedClip>;
  for (const clip of Object.values(clips)) {
    if (!clip || !Number.isInteger(clip.width) || !Number.isInteger(clip.height) ||
        clip.width <= 0 || clip.height <= 0 || clip.width * clip.height > 1024 * 1024 ||
        !Array.isArray(clip.palette) || clip.palette.length !== 768 ||
        clip.palette.some(v => !Number.isInteger(v) || v < 0 || v > 255) ||
        !Number.isInteger(clip.transparentIndex) || clip.transparentIndex < -1 || clip.transparentIndex > 255 ||
        !Array.isArray(clip.frames) || !clip.frames.length || clip.frames.length > 4096 || !clip.frames[0].key) return fail();
    let sinceKey = 0;
    for (const frame of clip.frames) {
      if (!frame || typeof frame.key !== "boolean" || !Number.isInteger(frame.offset) || !Number.isInteger(frame.length) ||
          frame.offset < 0 || frame.length < 0 || frame.offset + frame.length > payload.length ||
          (frame.key && frame.length !== clip.width * clip.height)) return fail();
      sinceKey = frame.key ? 0 : sinceKey + 1;
      if (sinceKey > 63) return fail();
    }
  }
  return { clips, payload };
}

/** One reusable indexed buffer, including backward seeks and loop restarts. */
export class IndexedClip {
  readonly pixels: Uint8Array;
  private currentFrame = -1;
  constructor(readonly pack: ScenePack, readonly info: PackedClip) {
    this.pixels = new Uint8Array(info.width * info.height);
  }
  frame(index: number): Uint8Array {
    if (!Number.isInteger(index) || index < 0 || index >= this.info.frames.length) throw new Error("Frame index out of range");
    if (index === this.currentFrame) return this.pixels;
    let key = index;
    while (!this.info.frames[key].key) key--;
    const start = this.currentFrame >= key && this.currentFrame < index ? this.currentFrame + 1 : key;
    for (let i = start; i <= index; i++) {
      const frame = this.info.frames[i];
      const bytes = this.pack.payload.subarray(frame.offset, frame.offset + frame.length);
      if (frame.key) this.pixels.set(bytes);
      else {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let p = 0, previousEnd = 0;
        while (p < bytes.length) {
          if (p + 6 > bytes.length) throw new Error("Truncated scene delta");
          const offset = view.getUint32(p, true), length = view.getUint16(p + 4, true); p += 6;
          if (!length || offset < previousEnd || offset + length > this.pixels.length || p + length > bytes.length) throw new Error("Invalid scene delta run");
          for (let n = 0; n < length; n++) this.pixels[offset + n] ^= bytes[p + n];
          p += length; previousEnd = offset + length;
        }
      }
    }
    this.currentFrame = index;
    return this.pixels;
  }
}

export async function loadScenePack(src: string, signal?: AbortSignal): Promise<ScenePack> {
  const response = await fetch(src, { signal });
  if (!response.ok) throw new Error(`Failed to load scene pack: ${src} (${response.status})`);
  const compressed = new Uint8Array(await response.arrayBuffer());
  // Some servers transparently decompress gzip; accept both representations.
  if (compressed[0] !== 0x1f || compressed[1] !== 0x8b) return parseScenePack(compressed);
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read(); if (done) break;
      total += value.length;
      if (total > 32 * 1024 * 1024) throw new Error("Scene pack exceeds memory limit");
      chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return parseScenePack(bytes);
}
