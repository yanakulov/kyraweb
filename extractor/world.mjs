import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readGameResources, decodeCps, decodeFrame4, decodeWsa } from './indexed_resources.mjs';
import { encodeScenePack } from './scene_pack.mjs';
import { parseEmc, runEmc } from './emc.mjs';

// DOS room IDs and N/E/S/W connections, ScummVM devtools/create_kyradat/resources/lok_dos.h.
// BROKEN's west exit (24) is deliberately unavailable while the bridge is broken.
export const REGION = [
  ['GEMCUT', null, null, 1, null], ['GEM', null, null, 5, null],
  ['HEALER', null, 3, null, null], ['EXTHEAL', null, null, 14, null],
  ['SICKWIL', null, 5, null, 14], ['TRUNK', null, 10, null, 4],
  ['ALTAR', null, 15, null, 11], ['BROKEN', null, 9, null, null],
  ['SORROW', null, 12, null, 10], ['CAVE', 13, null, null, 7],
  ['XEDGEC', null, 8, null, 5], ['FORESTB', null, 6, 12, 16],
  ['FORESTA', 11, 13, null, 8], ['XEDGE', 12, null, 9, null],
  ['ZROCK', 3, 4, null, null], ['NWCLIFB', null, null, null, 6],
  ['FSOUTH', null, 11, null, null]
];

export function decodeMask(bytes) {
  const b = Buffer.from(bytes), size = b.readUInt32LE(4), type = b.readUInt16LE(2), start = 10 + b.readUInt16LE(8);
  if (size !== 320 * 144 || ![0, 4].includes(type)) throw new Error('Expected DOS MSC mask');
  const pixels = type === 4 ? decodeFrame4(b.subarray(start), size) : b.subarray(start, start + size);
  if (pixels.length !== size) throw new Error('Truncated mask');
  return { width: 320, height: 144, pixels };
}

export function decodeDat(bytes) {
  const b = Buffer.from(bytes), word = p => b.readUInt16LE(p);
  const spriteDefs = [], anims = [];
  let p = 0x6d;
  const end = p + word(0x6b);
  while (p + 2 <= Math.min(end, b.length - 12)) {
    const op = word(p); p += 2;
    if (op === 0xff83) break;
    if (op === 0xff84) {
      while (word(p) !== 0xff85) {
        spriteDefs.push({ id: word(p), x: word(p + 2) * 8, y: word(p + 4), w: word(p + 6) * 8, h: word(p + 8) }); p += 10;
      }
      p += 2;
    } else if (op === 0xff86) {
      p += 2;
      const padded = () => { const v = word(p); p += 4; return v; };
      const disable = !!padded(); padded(); const drawY = padded(); padded();
      const defaultX = padded(), defaultY = padded(); padded(); padded();
      const sprite = padded(), flipX = !!padded(); padded(); padded(); padded();
      const play = !!word(p); p += 2;
      const script = [];
      do { script.push(word(p)); p += 2; } while (script.at(-1) !== 0xff87);
      anims.push({ disable, drawY, defaultX, defaultY, sprite, flipX, play, script });
    }
  }
  const entrances = {};
  for (const [i, side] of ['north', 'east', 'south', 'west'].entries()) {
    const at = b.length - 12 + i * 3;
    entrances[side] = { x: word(at) & ~3, y: b[at + 2] & ~1 };
  }
  return { drawLayerTable: [...b.subarray(13, 21)], spriteDefs, anims, entrances,
    northHeight: (word(21) + (word(21) & 1)) & 255, southHeight: word(21) >> 8 };
}

export async function buildWorld(gameDir, outputDir = 'public/assets/world') {
  const files = REGION.flatMap(([n]) => ['CPS', 'MSC', 'DAT', 'EMC'].map(ext => `${n}.${ext}`));
  files.push('PALETTE.COL', 'DROPUP.WSA', 'DROPDOWN.WSA', 'LIFTUP.WSA', 'LIFTDOWN.WSA');
  const resources = await readGameResources(gameDir, files);
  const get = n => { const b = resources.get(n); if (!b) throw new Error(`Missing ${n}`); return b; };
  const rooms = [], slots = new Map(), staticFrames = [];
  for (const [id, [name, ...exits]] of REGION.entries()) {
    const dat = decodeDat(get(`${name}.DAT`)), program = parseEmc(get(`${name}.EMC`));
    const shapes = [], regions = [], portals = [];
    let title = name;
    const host = (op, a, text) => {
      if (op === 0x28) dat.actorScale = { fromY: a[0], fromScale: a[1], toY: a[2], toScale: a[3] };
      if (op === 4) return +[55, 57, 172, 243, 253].includes(a[0]);
      if (op === 0x3d) return Math.floor((a[0] + a[1]) / 2);
      if (op === 3) shapes.push({ shape: a[0], x: a[1], y: a[2], flags: a[3], page: a[4] });
      if (op === 9 || op === 10) regions.push({ blocked: op === 10, x: a[0], y: a[1], w: a[2] - a[0] + 1, h: a[3] - a[1] + 1 });
      if (op === 0x10 || op === 0x11) { if (dat.anims[a[0]]) dat.anims[a[0]].play = op === 0x10; }
      if (op === 0x29) slots.set(a[1], text[a[0]]);
      if (op === 0x3f) staticFrames.push({ room: id, file: slots.get(a[4]), index: a[0], x: a[1], y: a[2] });
      if (op === 0x8b) title = text[a[1]];
      if (op === 8 && a[0] !== -1) portals.push({ rect: { x: a[0], y: a[1], w: a[2] - a[0] + 1, h: a[3] - a[1] + 1 }, target: a[5], side: ['north','east','south','west'][a[4] / 2], entry: a[6] >= 0 && a[7] >= 0 ? { x: a[6], y: a[7] } : null });
      return 0;
    };
    runEmc(program, 0, host, { 0: id, 7: 0 });
    runEmc(program, 2, host, { 0: id, 7: 0 });
    const image = decodeCps(get(`${name}.CPS`), get('PALETTE.COL'));
    image.palette.splice(228 * 3, 60, ...Array.from(get(`${name}.DAT`).subarray(0x17, 0x17 + 60), x => x * 4));
    const mask = decodeMask(get(`${name}.MSC`));
    for (const r of regions) for (let y = Math.max(0, r.y); y < Math.min(mask.height, r.y + r.h); y++) for (let x = Math.max(0, r.x); x < Math.min(320, r.x + r.w); x++) {
      if (r.blocked) mask.pixels[y * 320 + x] |= 128; else mask.pixels[y * 320 + x] &= 127;
    }
    rooms.push({ id, name, title, exits, ...dat, shapes, portals, image, mask });
  }
  const more = await readGameResources(gameDir, staticFrames.map(f => f.file));
  for (const f of staticFrames) {
    const room = rooms[f.room], movie = decodeWsa(more.get(f.file)), pixels = movie.frames[f.index];
    for (let y = 0; y < movie.height; y++) for (let x = 0; x < movie.width; x++) room.image.pixels[(f.y + y) * 320 + f.x + x] = pixels[y * movie.width + x];
  }
  await mkdir(outputDir, { recursive: true });
  const manifest = [];
  for (const room of rooms) {
    const { image, mask, ...meta } = room;
    const clips = { room: { ...image, frames: [image.pixels], transparentIndex: -1 },
      mask: { width: 320, height: 144, palette: new Array(768).fill(0), frames: [mask.pixels], transparentIndex: -1 } };
    for (const n of room.name === 'TRUNK' ? ['DROPUP', 'DROPDOWN'] : room.name === 'GEM' ? ['LIFTUP', 'LIFTDOWN'] : []) {
      clips[n.toLowerCase()] = { ...decodeWsa(get(`${n}.WSA`)), palette: image.palette, transparentIndex: -1 };
    }
    const pack = encodeScenePack(clips);
    await writeFile(join(outputDir, `${room.id}.kyr.gz`), pack);
    manifest.push({ ...meta, bytes: pack.length, sha256: createHash('sha256').update(pack).digest('hex') });
  }
  const sources = Object.fromEntries([...resources, ...more].map(([name, data]) => [name, {
    bytes: data.length, sha256: createHash('sha256').update(data).digest('hex')
  }]));
  await writeFile(join(outputDir, 'world.json'), JSON.stringify({ rooms: manifest, sources }) + '\n');
  return { rooms: rooms.length, bytes: manifest.reduce((sum, r) => sum + r.bytes, 0), staticFrames };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(await buildWorld(process.argv[2], process.argv[3]));
