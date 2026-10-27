import { gzipSync } from 'node:zlib';

export function encodeScenePack(sources, keyframeInterval = 64) {
  const clips = {}, chunks = []; let offset = 0;
  for (const [name, source] of Object.entries(sources)) {
    const frames = []; let previous;
    for (let i = 0; i < source.frames.length; i++) {
      const pixels = source.frames[i];
      if (pixels.length !== source.width * source.height) throw new Error(`Invalid frame size: ${name}`);
      let key = i % keyframeInterval === 0, bytes = pixels;
      if (!key) {
        const runs = [];
        for (let p = 0; p < pixels.length;) {
          if (pixels[p] === previous[p]) { p++; continue; }
          const start = p++;
          // Short identical gaps cost less than another six-byte run header.
          while (p < pixels.length && p - start < 65535) {
            if (pixels[p] !== previous[p]) { p++; continue; }
            let next = p; while (next < Math.min(p + 6, pixels.length) && pixels[next] === previous[next]) next++;
            if (next === pixels.length || next - p === 6) break;
            p = next;
          }
          const header = Buffer.alloc(6); header.writeUInt32LE(start); header.writeUInt16LE(p - start, 4);
          const delta = new Uint8Array(p - start);
          for (let n = start; n < p; n++) delta[n - start] = pixels[n] ^ previous[n];
          runs.push(header, delta);
        }
        bytes = Buffer.concat(runs);
        if (bytes.length >= pixels.length) { key = true; bytes = pixels; }
      }
      frames.push({ offset, length: bytes.length, key }); chunks.push(bytes); offset += bytes.length; previous = pixels;
    }
    clips[name] = { width: source.width, height: source.height, palette: source.palette, transparentIndex: source.transparentIndex ?? -1, frames };
  }
  const manifest = Buffer.from(JSON.stringify({ version: 1, clips }));
  const header = Buffer.alloc(8); header.write('KYR1'); header.writeUInt32LE(manifest.length, 4);
  return gzipSync(Buffer.concat([header, manifest, ...chunks]), { level: 9 });
}
