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
import { decodeDat, decodeMask, restoreBackgroundColumns } from "./world.mjs";
import { encodeScenePack } from "./scene_pack.mjs";
import { vocDuration } from "./opening.mjs";

// These are the rooms used by the first forest's original quest scripts.
const ROOMS = {
  GEMCUT: 0,
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
};
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
    "AMULET.WSA",
    "DROPUP.WSA",
    "DROPDOWN.WSA",
  ]);
  const get = (n) => {
    const b = resources.get(n);
    if (!b) throw new Error(`Missing ${n}`);
    return b;
  };
  const programs = Object.fromEntries(
    names.map((n) => [n, parseEmc(get(`${n}.EMC`))]),
  );
  const movies = [
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
  await mkdir(out, { recursive: true });
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
    for (const file of program.strings.filter((s) => /\.WSA$/i.test(s)))
      clips[file.slice(0, -4).toLowerCase()] = {
        ...decodeWsa(get(file)),
        palette: image.palette,
        transparentIndex: -1,
      };
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
    for (const [actor, first, defs] of [
      ["HERMAN", 77, HERMAN],
      ["MERITH", 41, MERITH],
    ]) {
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
    if (resources.has(`${name}.VRM`))
      for (const [n, b] of readPak(get(`${name}.VRM`)))
        if (n.endsWith(".VOC")) durations[Number.parseInt(n)] = vocDuration(b);
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
          : name === "CAVEB"
            ? [null, 7, null, null]
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
    gzipSync(JSON.stringify({ rooms: data.rooms }), { level: 9 }),
  );
  await mkdir("tests/fixtures", { recursive: true });
  await writeFile(
    "tests/fixtures/forest-pixels.json.gz",
    gzipSync(JSON.stringify({ sources: data.sources, frames: data.frames }), {
      level: 9,
    }),
  );
  const amulet = decodeWsa(get("AMULET.WSA"));
  await writeFile(
    join(out, "amulet.kyr.gz"),
    encodeScenePack({
      "amulet-rest": {
        ...amulet,
        frames: [amulet.frames.at(-1)],
        palette: decodeCps(get("GEMCUT.CPS"), get("PALETTE.COL")).palette,
        transparentIndex: -1,
      },
    }),
  );
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
