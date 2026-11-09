// SPDX-License-Identifier: GPL-3.0-or-later
// Default actor shapes follow ScummVM devtools/create_kyradat/resources/lok_dos.h.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  readGameResources,
  readPak,
  decodeCps,
  decodeWsa,
} from "./indexed_resources.mjs";
import { parseEmc, runEmc } from "./emc.mjs";
import { decodeDat, decodeMask, REGION, restoreBackgroundColumns } from "./world.mjs";
import { encodeScenePack } from "./scene_pack.mjs";
import { vocDuration } from "./opening.mjs";
import { importFinale } from "./finale.mjs";

// These are the rooms used by the first forest's original quest scripts.
const ROOMS = {
  GEMCUT: 0,
  GEM: 1,
  HEALER: 2,
  SICKWIL: 4,
  ALTAR: 6,
  BROKEN: 7,
  BRIDGE: 7,
  SORROW: 8,
  TRUNK: 5,
  FNORTH: 10,
  FGOWEST: 16,
  WILLOW: 4,
  FORESTB: 11,
  FORESTA: 12,
  XEDGE: 13,
  XEDGEC: 13,
  CAVEB: 24,
  NWCLIFB: 15,
  ALGAE: 42,
};
for (const [id, region] of REGION.entries()) {
  if (id >= 17 && region && !(region[0] in ROOMS)) ROOMS[region[0]] = id;
}
// ScummVM k1DefaultShapesDOS, indices 70..105 become shapes 77..112.
const HERMAN = [
  [0, 0, 3, 48, -12, -46],
  [3, 0, 3, 48, -12, -48],
  [6, 0, 3, 48, -12, -48],
  [9, 0, 3, 48, -12, -48],
  [12, 0, 3, 48, -12, -48],
  [15, 0, 3, 48, -12, -48],
  [18, 0, 3, 48, -12, -48],
  [21, 0, 3, 48, -12, -48],
  [24, 0, 3, 48, -12, -48],
  [27, 0, 3, 48, -12, -46],
  [30, 0, 3, 48, -14, -47],
  [39, 199, 1, 1, -12, -48],
  ...Array.from({ length: 12 }, (_, i) => [i * 2, 51, 2, 11, 0, -7]),
  ...[80, 129].flatMap((y) =>
    Array.from({ length: 6 }, (_, i) => [i * 3, y, 3, 48, -12, -48]),
  ),
];
const MERITH = [
  ...Array.from({ length: 10 }, (_, i) => [i * 3, 0, 3, 48, -12, -48]),
  [30, 10, 3, 38, -16, -38],
  [27, 48, 4, 40, -8, -40],
  ...Array.from({ length: 12 }, (_, i) => [i * 2, 51, 2, 11, -4, 0]),
  ...HERMAN.slice(24),
];
export async function buildForest(root, out = "public/assets/forest") {
  const names = Object.keys(ROOMS),
    wanted = names.flatMap((n) =>
      ["EMC", "CPS", "DAT", "MSC", "VRM"].map((ext) => `${n}.${ext}`),
    );
  const resources = await readGameResources(root, [
    ...wanted,
    "PALETTE.COL",
    "HERMAN.CPS",
    "MERITH.CPS",
    "NOTEENG.CPS",
    "_NPC.EMC",
    "CHAPTER1.VRM",
    "AMULET.WSA",
    "JEWELS3.CPS",
    "DROPUP.WSA",
    "DROPDOWN.WSA",
    "FLUTE1.CPS", "FLUTE2.CPS", "HEALBR2.CPS", "POISON.CPS", "SHATTER.WSA",
    "BRANWILL.CPS", "SNOW1A.CPS", "SNOW2A.CPS", "DRINK.CPS", "TELEKIN.CPS", "BRANSTON.CPS",
  ]);
  const get = (n) => {
    const b = resources.get(n);
    if (!b) throw new Error(`Missing ${n}`);
    return b;
  };
  const programs = Object.fromEntries(
    names.map((n) => [n, parseEmc(get(`${n}.EMC`))]),
  );
  const selfMovies = { GLADE: ["LEP_IN.WSA"], LAGOON: ["PEGASUS.WSA"] };
  const movies = [
    ...Object.values(selfMovies).flat(),
    ...new Set(
      Object.values(programs).flatMap((p) =>
        p.strings.filter((s) => /\.WSA$/i.test(s)),
      ),
    ),
  ];
  for (const [n, b] of await readGameResources(root, movies))
    resources.set(n, b);
  const world = JSON.parse(
    await readFile("public/assets/world/world.json", "utf8"),
  );
  const data = { rooms: {}, sources: {}, frames: {} };
  const note = decodeCps(get('NOTEENG.CPS'), get('PALETTE.COL'));
  const notePixels = new Uint8Array(194 * 128);
  for (let y = 0; y < 128; y++) notePixels.set(note.pixels.subarray((y + 8) * 320 + 63, (y + 8) * 320 + 257), y * 194);
  const noteClip = { width: 194, height: 128, frames: [notePixels], palette: note.palette, transparentIndex: -1 };
  const npcProgram = parseEmc(get('_NPC.EMC')), npcVoices = readPak(get('CHAPTER1.VRM'));
  const flute = { program: npcProgram, durations: Object.fromEntries(
    [...npcVoices].filter(([name]) => /^(100[01]|2007|201[01]|700[0124]|800[0-6]|900[0-2]|901[3-9]|902[0-9]|903[0-4]|904[0-9]|9050|9091)\.VOC$/.test(name))
      .map(([name, data]) => [parseInt(name, 10), vocDuration(data)])) };
  function selfActions(item, room = 0, readable = false) {
    const actions = [];
    runEmc(npcProgram, 0, (op, a, strings) => {
      switch (op) {
        case 0x72: return 0;
        case 0x22: return room;
        case 4: return +(readable && a[0] === 129);
        case 1: actions.push({ op: 'say', text: strings[a[1]], voiceId: a[0], ms: vocDuration(npcVoices.get(`${a[0]}.VOC`)), x: 0, y: 0, color: 15, blocking: true }); break;
        case 0x17: actions.push({ op: 'sfx', track: a[0] }); break;
        case 0x21: actions.push({ op: 'wait', ms: -a[0] * 1000 / 60 }); break;
        case 0x14: actions.push({ op: 'hand', item: null }); break;
        case 0x52: actions.push({ op: 'frame', clip: 'note', index: 0, x: 63, y: 8, ms: 0 }); break;
        case 0x4a: actions.push({ op: 'confirm' }); break;
        case 0x53: actions.push({ op: 'close', clip: 'note' }); break;
        case 0x0e: {
          const replacement = { 39: 'appleEaten', 42: 'letter' }[a[0]];
          if (!replacement) throw new Error(`Unsupported self interaction item ${a[0]}`);
          actions.push({ op: 'hand', item: replacement }); break;
        }
        default: throw new Error(`Unsupported self interaction syscall ${op}`);
      }
      return 0;
    }, { 0: room, 4: item, 5: 0 });
    return actions;
  }
  const letter = { sealed: selfActions(42), readable: selfActions(42, 0, true) };
  const self = Object.fromEntries([-1, 0, 16, 19, 38, 39, 43, 44, 52].map(item => [item, selfActions(item)]));
  const caveSelf = selfActions(-1, 24);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'note.kyr.gz'), encodeScenePack({ note: noteClip }));
  for (const name of names) {
    const id = ROOMS[name],
      image = decodeCps(get(`${name}.CPS`), get("PALETTE.COL"));
    image.palette.splice(
      228 * 3,
      60,
      ...Array.from(get(`${name}.DAT`).subarray(0x17, 0x17 + 60), (x) => x * 4),
    );
    const mask = decodeMask(get(`${name}.MSC`)),
      dat = decodeDat(get(`${name}.DAT`));
    const base = world.rooms.find((r) => r.id === id) ?? {
      id,
      title: "A cavernous exit",
      exits: [null, 7, null, null],
      portals: [],
      shapes: [],
    };
    const clips = {
      room: { ...image, frames: [image.pixels], transparentIndex: -1 },
      mask: {
        ...mask,
        frames: [mask.pixels],
        palette: Array(768).fill(0),
        transparentIndex: -1,
      },
    };
    if (name === 'KYRAGEM') {
      const finale = await importFinale(root, image.palette);
      Object.assign(clips, finale.clips);
      data.reunion = finale.reunion;
    }
    const program = programs[name],
      durations = {};
    let title = base.title;
    runEmc(
      program,
      2,
      (op, a, t) => {
        if (op === 0x8b) title = t[a[1]];
        return 0;
      },
      { 0: id },
    );
    if (resources.has(`${name}.VRM`))
      for (const [n, b] of readPak(get(`${name}.VRM`)))
        if (n.endsWith(".VOC")) durations[Number.parseInt(n)] = vocDuration(b);
    // GEM already has its original scenery and lift movies in the world pack.
    if (name === 'GEM') {
      const clipFrames = Object.fromEntries(['liftup', 'liftdown'].map(clip =>
        [clip, decodeWsa(get(`${clip.toUpperCase()}.WSA`)).frames.length]));
      data.rooms[name] = { ...base, title, program, durations, clipFrames, npcFrames: {} };
      continue;
    }
    if (name === "FORESTB") {
      restoreBackgroundColumns(image.pixels, 17);
      restoreBackgroundColumns(mask.pixels, 17, 136);
    }
    if (name === "TRUNK")
      for (const file of ["DROPUP.WSA", "DROPDOWN.WSA"])
        clips[file.slice(0, -4).toLowerCase()] = {
          ...decodeWsa(get(file)),
          palette: image.palette,
          transparentIndex: -1,
        };
    const amulet = decodeWsa(get("AMULET.WSA"));
    clips["amulet-rest"] = {
      ...amulet,
      frames: [amulet.frames.at(-1)],
      palette: image.palette,
      transparentIndex: -1,
    };
    for (const file of [...program.strings.filter((s) => /\.WSA$/i.test(s)), ...(selfMovies[name] ?? [])])
      clips[file.slice(0, -4).toLowerCase()] = {
        ...decodeWsa(get(file)),
        palette: image.palette,
        transparentIndex: -1,
      };
    if (name === 'DRAGON') clips.shatter = {
      ...decodeWsa(get('SHATTER.WSA')), palette: image.palette, transparentIndex: -1,
    };
    if (name === 'SONG') {
      // Keep the healed bird from the last SNGSPELL frame while its feather falls.
      const { width, frames } = clips.sngspell;
      const pixels = Uint8Array.from({ length: 13 * 9 }, (_, i) => frames.at(-1)[(14 + Math.floor(i / 13)) * width + 16 + i % 13]);
      clips['songbird-rest'] = { width: 13, height: 9, frames: [pixels], palette: image.palette, transparentIndex: -1 };
    }
    if (name === "HEALER") {
      const note = decodeCps(get("NOTEENG.CPS"), get("PALETTE.COL"));
      const pixels = new Uint8Array(194 * 128);
      for (let y = 0; y < 128; y++)
        pixels.set(
          note.pixels.subarray((y + 8) * 320 + 63, (y + 8) * 320 + 257),
          y * 194,
        );
      clips.note = {
        width: 194,
        height: 128,
        frames: [pixels],
        palette: image.palette,
        transparentIndex: -1,
      };
    }
    if (name === "ALTAR")
      clips.amulet = {
        ...decodeWsa(get("AMULET.WSA")),
        palette: image.palette,
        transparentIndex: -1,
      };
    const actors = id < 17 ? [
      ["HERMAN", 77, HERMAN],
      ["MERITH", 41, MERITH],
    ] : [];
    for (const [actor, first, defs] of actors) {
      const sheet = decodeCps(get(`${actor}.CPS`), get("PALETTE.COL"));
      for (const [i, [x, y, w, h]] of defs.entries()) {
        const pixels = new Uint8Array(w * 8 * h);
        for (let row = 0; row < h; row++)
          pixels.set(
            sheet.pixels.subarray(
              (y + row) * 320 + x * 8,
              (y + row) * 320 + (x + w) * 8,
            ),
            row * w * 8,
          );
        clips[`npc-${i + first}`] = {
          width: w * 8,
          height: h,
          frames: [pixels],
          palette: image.palette,
          transparentIndex: 0,
        };
      }
    }
    const pack = encodeScenePack(clips);
    await writeFile(join(out, `${name.toLowerCase()}.kyr.gz`), pack);
    data.rooms[name] = {
      ...base,
      ...dat,
      name,
      title,
      program,
      durations,
      clipFrames: Object.fromEntries(
        Object.entries(clips).map(([name, clip]) => [name, clip.frames.length]),
      ),
      shapes: [],
      bytes: pack.length,
      exits:
        name === "BRIDGE"
          ? [null, 9, null, 24]
          : base.exits,
      npcFrames: Object.fromEntries([
        ...MERITH.map((f, i) => [i + 41, { xOffset: f[4], yOffset: f[5] }]),
        ...HERMAN.map((f, i) => [i + 77, { xOffset: f[4], yOffset: f[5] }]),
      ]),
    };
    for (const [n, c] of Object.entries(clips))
      data.frames[`${name}:${n}`] = {
        width: c.width,
        height: c.height,
        count: c.frames.length,
        hashes: c.frames.map((p) =>
          createHash("sha256")
            .update(p)
            .update(Uint8Array.from(c.palette))
            .digest("hex"),
        ),
      };
  }
  for (const [n, b] of resources)
    data.sources[n] = {
      bytes: b.length,
      sha256: createHash("sha256").update(b).digest("hex"),
    };
  await writeFile(
    join(out, "forest.json.gz"),
    gzipSync(JSON.stringify({ rooms: data.rooms, letter, self, caveSelf, flute, reunion: data.reunion }), { level: 9 }),
  );
  await mkdir("tests/fixtures", { recursive: true });
  await writeFile(
    "tests/fixtures/forest-pixels.json.gz",
    gzipSync(JSON.stringify({ sources: data.sources, frames: data.frames }), {
      level: 9,
    }),
  );
  const amulet = decodeWsa(get("AMULET.WSA"));
  // The first frame is the empty stone HUD. Key it out to keep the original
  // metalwork, sparks and timing on the circular inventory's own background.
  const emptyAmulet = amulet.frames[0];
  const usedIndices = new Set();
  for (const frame of amulet.frames) for (let i = 0; i < frame.length; i++)
    if (frame[i] !== emptyAmulet[i]) usedIndices.add(frame[i]);
  const transparentAmulet = Array.from({ length: 256 }, (_, i) => i).find(i => !usedIndices.has(i));
  if (transparentAmulet === undefined) throw new Error('No transparent index for AMULET.WSA');
  const amuletPalette = decodeCps(get("GEMCUT.CPS"), get("PALETTE.COL")).palette;
  const jewels = decodeCps(get("JEWELS3.CPS"), get("PALETTE.COL"));
  // JEWELS3 uses the same 32 × 17 grid for the dormant and active jewels.
  const jewelFrames = (jewel) => [359, 354, 349, 344, 339, 334 + jewel, 339 + jewel,
    344 + jewel, 349 + jewel, 354 + jewel, 323 + jewel, 329 + jewel].map(shape => {
    const row = shape < 330 ? 0 : shape < 335 ? 6 : 1 + Math.floor((shape - 335) / 5);
    const column = shape < 330 ? shape - 324 : shape < 335 ? shape - 330 : (shape - 335) % 5;
    return Uint8Array.from({ length: 32 * 17 }, (_, i) => jewels.pixels[(row * 17 + Math.floor(i / 32)) * 320 + column * 32 + i % 32]);
  });
  await writeFile(
    join(out, "amulet.kyr.gz"),
    encodeScenePack({
      "yellow-jewel": { width: 32, height: 17, frames: jewelFrames(1), palette: jewels.palette, transparentIndex: 0 },
      "red-jewel": { width: 32, height: 17, frames: jewelFrames(2), palette: jewels.palette, transparentIndex: 0 },
      "purple-jewel": { width: 32, height: 17, frames: jewelFrames(3), palette: jewels.palette, transparentIndex: 0 },
      "blue-jewel": { width: 32, height: 17, frames: jewelFrames(4), palette: jewels.palette, transparentIndex: 0 },
      "amulet-rest": {
        ...amulet,
        frames: [amulet.frames.at(-1)],
        palette: amuletPalette,
        transparentIndex: -1,
      },
      "amulet-radial": {
        ...amulet,
        frames: amulet.frames.map(frame => frame.map((value, i) => value === emptyAmulet[i] ? transparentAmulet : value)),
        palette: amuletPalette,
        transparentIndex: transparentAmulet,
      },
    }),
  );
  // Cell positions and order from the original CD character shape tables.
  const hero = {};
  for (const [name, sheets, width, height] of [
    ['flute', [['FLUTE1', 0, 0, 12], ['FLUTE1', 75, 12, 1], ['FLUTE1', 75, 0, 13], ['FLUTE2', 0, 0, 10]], 24, 75],
    ['cure', [['HEALBR2', 0, 0, 12], ['HEALBR2', 48, 0, 12], ['HEALBR2', 96, 0, 6]], 24, 48],
    ['poison', [0, 48, 96, 144].map(y => ['POISON', y, 0, 5]), 64, 48],
    ['wisp', [['BRANWILL', 0, 0, 8], ['BRANWILL', 48, 0, 8]], 40, 48],
    ['wisp-float', [['BRANWILL', 96, 0, 8], ['BRANWILL', 125, 0, 2]], 40, 29],
    ['dispel', [['TELEKIN', 0, 0, 5]], 64, 49],
    ['stone', [['BRANSTON', 0, 0, 8], ['BRANSTON', 51, 0, 6]], 40, 51],
    ['winter', [['SNOW1A', 0, 1, 7],
      ...[['SNOW1A', 66], ['SNOW1A', 132], ['SNOW2A', 0], ['SNOW2A', 66]].flatMap(([sheet, y]) =>
        [0, 2, 4, 6].map(x => [sheet, y, x, 1])),
      ['SNOW2A', 132, 0, 1], ['SNOW2A', 132, 2, 1], ['SNOW2A', 132, 3, 4]], 40, 66],
  ]) {
    const frames = sheets.flatMap(([sheet, y, first, count]) => {
      const { pixels } = decodeCps(get(`${sheet}.CPS`), get('PALETTE.COL'));
      return Array.from({ length: count }, (_, index) => Uint8Array.from({ length: width * height }, (_, i) =>
        pixels[(y + Math.floor(i / width)) * 320 + (first + index) * width + i % width]));
    });
    hero[name] = { width, height, frames, palette: amuletPalette, transparentIndex: 0 };
  }
  const drink = decodeCps(get('DRINK.CPS'), get('PALETTE.COL')).pixels;
  const drinkFrames = Array.from({ length: 9 }, (_, index) => {
    const topRow = index < 6, width = index < 5 ? 32 : 40;
    const x = topRow ? index * 32 : (index - 6) * 40;
    return Uint8Array.from({ length: 40 * 54 }, (_, pixel) => {
      const row = Math.floor(pixel / 40), column = pixel % 40;
      return column >= width || topRow && row < 6 ? 0 : drink[(row + (topRow ? -6 : 48)) * 320 + x + column];
    });
  });
  hero.drink = { width: 40, height: 54, frames: drinkFrames, palette: amuletPalette, transparentIndex: 0 };
  await writeFile(join(out, 'hero-actions.kyr.gz'), encodeScenePack(hero));
  console.log({
    rooms: names.length,
    bytes: Object.values(data.rooms).reduce((n, r) => n + r.bytes, 0),
  });
  return data;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await buildForest(process.argv[2], process.argv[3]);
