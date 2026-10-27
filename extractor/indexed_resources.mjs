// Westwood decoding follows ScummVM's engines/kyra/graphics/screen.cpp and
// wsamovie.cpp. SPDX-License-Identifier: GPL-3.0-or-later (see LICENSES/).
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export function decodeFrame4(src, size) {
  const out = new Uint8Array(size);
  let p = 0, d = 0;
  const byte = () => { if (p >= src.length) throw new Error('Truncated frame4'); return src[p++]; };
  const word = () => byte() | byte() << 8;
  while (d < size) {
    const code = byte();
    if (code === 0x80) break;
    let count, from;
    if (!(code & 0x80)) { count = (code >> 4) + 3; from = d - ((code & 15) << 8 | byte()); }
    else if (!(code & 0x40)) {
      count = code & 63;
      if (d + count > size || p + count > src.length) throw new Error('Invalid literal run');
      out.set(src.subarray(p, p + count), d); p += count; d += count; continue;
    } else if (code === 0xfe) {
      count = word(); const value = byte();
      if (d + count > size) throw new Error('Invalid fill run');
      out.fill(value, d, d + count); d += count; continue;
    } else { count = code === 0xff ? word() : (code & 63) + 3; from = word(); }
    if (from < 0 || from >= d || d + count > size) throw new Error('Invalid frame4 reference');
    for (let i = 0; i < count; i++) out[d++] = out[from++];
  }
  return out;
}

export function applyWestwoodDelta(dst, src) {
  let p = 0, d = 0;
  const byte = () => { if (p >= src.length) throw new Error('Truncated WSA delta'); return src[p++]; };
  const word = () => byte() | byte() << 8;
  while (p < src.length) {
    const code = byte();
    let count, fill = false, skip = false;
    if (code === 0) { count = byte(); fill = true; }
    else if (code < 0x80) count = code;
    else if (code !== 0x80) { count = code & 127; skip = true; }
    else {
      const op = word(); if (!op) return;
      count = op & 0x7fff;
      if (!(op & 0x8000)) skip = true;
      else if (op & 0x4000) { count &= 0x3fff; fill = true; }
    }
    if (d + count > dst.length) throw new Error('WSA delta exceeds image');
    if (skip) d += count;
    else if (fill) { const value = byte(); for (let i = 0; i < count; i++) dst[d++] ^= value; }
    else for (let i = 0; i < count; i++) dst[d++] ^= byte();
  }
}

export function decodeCps(data, externalPalette) {
  if (data.length < 10) throw new Error('Truncated CPS');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const size = view.getUint32(4, true), paletteSize = view.getUint16(8, true);
  if (size !== 64000 || ![0, 4].includes(view.getUint16(2, true))) throw new Error('Expected VGA 320x200 CPS (raw or LCW)');
  const source = data.subarray(10 + paletteSize);
  const pixels = data[2] === 4 ? decodeFrame4(source, size) : source.slice(0, size);
  const palette = paletteSize ? data.slice(10, 10 + paletteSize) : externalPalette;
  if (pixels.length !== size || palette?.length !== 768) throw new Error('CPS pixels/palette missing');
  return { width: 320, height: 200, pixels, palette: expandVgaPalette(palette) };
}

export function expandVgaPalette(bytes) {
  if (bytes.length !== 768 || bytes.some(v => v > 63)) throw new Error('Expected VGA 6-bit palette');
  // Preserve the conversion used by the existing exports; no lossy quantization.
  return Array.from(bytes, value => value * 4);
}

export function decodeWsa(data) {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 16) throw new Error('Truncated WSA');
  const count = v.getUint16(0, true), width = v.getUint16(2, true), height = v.getUint16(4, true), deltaSize = v.getUint16(6, true);
  if (!count || count > 4096 || !width || !height || width * height > 64000 || !deltaSize) throw new Error('Invalid WSA dimensions');
  // Kyrandia 1 has both eight- and ten-byte headers. Validate the entire table.
  let offsets;
  for (const header of [8, 10]) {
    const end = header + (count + 2) * 4;
    if (end > data.length) continue;
    const candidate = Array.from({ length: count + 2 }, (_, i) => v.getUint32(header + i * 4, true));
    const first = candidate.find(Boolean);
    if (first !== end && first !== end + 768) continue;
    if (candidate.some(x => x && (x < first || x > data.length))) continue;
    if (candidate.filter(Boolean).some((x, i, a) => i && x < a[i - 1])) continue;
    offsets = candidate; break;
  }
  if (!offsets || !offsets[0]) throw new Error('Unsupported WSA header or missing first frame');
  const pixels = new Uint8Array(width * height), frames = [];
  for (let i = 0; i < count; i++) {
    if (offsets[i]) {
      const end = offsets.slice(i + 1).find(Boolean) ?? data.length;
      applyWestwoodDelta(pixels, decodeFrame4(data.subarray(offsets[i], end), deltaSize));
    }
    frames.push(pixels.slice());
  }
  return { width, height, frames };
}

export function readPak(data) {
  if (data.length < 5) throw new Error('Truncated PAK');
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const first = v.getUint32(0, true), entries = [];
  if (first > data.length || first < 5) throw new Error('Invalid PAK directory');
  let p = 0;
  while (p + 4 <= first) {
    const offset = v.getUint32(p, true); p += 4;
    const end = data.indexOf(0, p);
    if (end < p || end >= first) throw new Error('Invalid PAK name');
    const name = new TextDecoder().decode(data.subarray(p, end)).toUpperCase(); p = end + 1;
    if (!name) break;
    if (offset < first || offset > data.length) throw new Error('Invalid PAK offset');
    entries.push({ name, offset });
  }
  return new Map(entries.map((e, i) => {
    const end = entries[i + 1]?.offset ?? data.length;
    if (end < e.offset) throw new Error('Unordered PAK offsets');
    return [e.name, data.subarray(e.offset, end)];
  }));
}

export async function readGameResources(root, requested) {
  const wanted = new Set(requested.map(x => x.toUpperCase())), result = new Map();
  // Only this installation, never launcher databases or credentials.
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(path); continue; }
      const name = entry.name.toUpperCase();
      if (wanted.has(name)) result.set(name, new Uint8Array(await readFile(path)));
      if (name.endsWith('.PAK') || name.endsWith('.APK')) {
        const pak = readPak(new Uint8Array(await readFile(path)));
        for (const key of wanted) if (pak.has(key) && !result.has(key)) result.set(key, pak.get(key));
      }
    }
  }
  await walk(root);
  return result;
}
