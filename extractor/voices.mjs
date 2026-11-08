import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readGameResources, readPak } from './indexed_resources.mjs';
import { vocDuration } from './opening.mjs';

const [gameDir, ffmpeg = 'ffmpeg'] = process.argv.slice(2);
if (!gameDir) throw new Error('Usage: npm run assets:voices -- <Kyrandia DAT directory> [ffmpeg]');

const world = JSON.parse(await readFile('public/assets/world/world.json', 'utf8'));
const forest = JSON.parse(gunzipSync(await readFile('public/assets/forest/forest.json.gz')));
const names = new Set(['INTRO', 'CHAPTER1', ...world.rooms.map(room => room.name), ...Object.keys(forest.rooms)]);
const archives = await readGameResources(gameDir, [...names].map(name => `${name}.VRM`));
const introIds = new Set([...Array.from({ length: 16 }, (_, id) => id), 19, 20, 21, 22, 23, 25, 27, 28, 43, 44, 45, 46]);
const out = 'public/assets/voices';
await mkdir(out, { recursive: true });
let count = 0, total = 0;
const exported = [];
for (const name of [...names].sort()) {
  const archive = archives.get(`${name}.VRM`);
  if (!archive) continue;
  const index = {}, clips = [];
  let offset = 0;
  for (const [file, voc] of readPak(archive)) {
    if (!/^\d+\.VOC$/.test(file) || !vocDuration(voc)) continue;
    const id = parseInt(file, 10);
    if (name === 'INTRO' && !introIds.has(id)) continue;
    const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'voc', '-i', 'pipe:0', '-ac', '1', '-ar', '16000',
      '-c:a', 'libmp3lame', '-b:a', '24k', '-write_xing', '0', '-id3v2_version', '0', '-f', 'mp3', 'pipe:1'], { input: voc, windowsHide: true });
    if (result.error || result.status !== 0 || !result.stdout.length) throw result.error ?? new Error(`${name}/${file}: ${result.stderr}`);
    clips.push(result.stdout);
    index[id] = [offset, result.stdout.length];
    offset += result.stdout.length;
  }
  if (!clips.length) continue;
  const bank = Buffer.concat([Buffer.from(JSON.stringify(index) + '\n'), ...clips]);
  await writeFile(join(out, `${name.toLowerCase()}.mp3bank`), bank);
  exported.push(name.toLowerCase());
  count += clips.length; total += bank.length;
}
await writeFile(join(out, 'manifest.json'), JSON.stringify(exported) + '\n');
console.log(`${count} CD voice clips in ${total.toLocaleString('en-US')} bytes`);
