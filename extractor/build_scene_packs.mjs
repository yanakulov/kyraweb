import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { decodeCps, decodeWsa, expandVgaPalette, readGameResources } from './indexed_resources.mjs';
import { encodeScenePack } from './scene_pack.mjs';

export async function buildScenePacks(gameDir, outputDir) {
  const movies = {
    writing: ['KALLAK.WSA', 'KALLAK.COL'], westwood: ['WESTWOOD.WSA', 'WW.COL'],
    shore: ['SHORE.WSA', 'WW.COL'], destruct: ['DESTRUCT.WSA', 'WW.COL'],
    tree1: ['TREE1.WSA', 'TREE_EXP.COL'], tree2: ['TREE2.WSA', 'TREE_EXP.COL'],
    'mal-kal': ['MAL-KAL.WSA', 'MAL-KAL.COL']
  };
  const names = [...new Set(['GEMCUT.CPS', 'GEMCUT.DAT', 'MAIN_ENG.CPS', 'PALETTE.COL', ...Object.values(movies).flat()])];
  const resources = await readGameResources(gameDir, names);
  const get = name => { const data = resources.get(name); if (!data) throw new Error(`Missing original resource: ${name}`); return data; };
  const room = decodeCps(get('GEMCUT.CPS'), get('PALETTE.COL'));
  // ScummVM Sprites::loadDat: scene-local colors 228..247 are stored at 0x17.
  const dat = get('GEMCUT.DAT');
  if (dat.length < 0x17 + 60) throw new Error('Truncated GEMCUT.DAT palette');
  room.palette.splice(228 * 3, 60, ...Array.from(dat.subarray(0x17, 0x17 + 60), x => x * 4));
  const hud = decodeCps(get('MAIN_ENG.CPS'), get('PALETTE.COL'));
  const packs = {
    'kallak-room.kyr.gz': encodeScenePack({
      room: { ...room, frames: [room.pixels], transparentIndex: -1 },
      hud: { ...hud, frames: [hud.pixels], transparentIndex: 0 }
    })
  };
  const clips = {};
  for (const [name, [wsa, col]] of Object.entries(movies)) {
    const movie = decodeWsa(get(wsa));
    movie.palette = expandVgaPalette(get(col));
    packs[`${name === 'writing' ? 'kallak-writing' : name}.kyr.gz`] = encodeScenePack({ [name]: { ...movie, transparentIndex: 0 } });
    clips[name] = { frames: movie.frames.length, width: movie.width, height: movie.height, currentFrameBytes: movie.width * movie.height };
  }
  await mkdir(outputDir, { recursive: true });
  for (const [name, bytes] of Object.entries(packs)) await writeFile(join(outputDir, name), bytes);
  const report = {
    format: 'KYR1', keyframeInterval: 64,
    sources: Object.fromEntries(names.map(name => [name, { bytes: get(name).length, sha256: createHash('sha256').update(get(name)).digest('hex') }])),
    packs: Object.fromEntries(Object.entries(packs).map(([name, bytes]) => [name, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }])),
    clips
  };
  await writeFile(join(outputDir, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const gameDir = process.argv[2];
  if (!gameDir) throw new Error('Usage: npm run assets:build -- "path/to/Kyrandia/DAT" [output-directory]');
  console.log(JSON.stringify(await buildScenePacks(gameDir, process.argv[3] ?? 'public/assets/packs'), null, 2));
}
