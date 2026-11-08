import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readPak } from './indexed_resources.mjs';

export async function buildMusic(root, out = 'public/assets/music') {
  await mkdir(out, { recursive: true });
  const dir = resolve(root);
  const manifest = { version: 1, source: 'Kyrandia 1 DOS CD XMI.PAK and ADL.PAK', files: {}, adlib: {} };
  for (const [format, files] of [['XMI', manifest.files], ['ADL', manifest.adlib]]) {
    const archive = format + '.PAK';
    let bytes;
    for (const path of [join(dir, 'DAT', archive), join(dir, archive)]) {
      try { bytes = await readFile(path); break; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    if (!bytes) throw new Error(`${archive} not found: supply the GOG installation or its DAT directory`);
    const expected = new RegExp(`^(INTRO|KYRA[1-5][AB]|KYRAMISC)\\.${format}$`);
    for (const [name, data] of readPak(new Uint8Array(bytes))) {
      if (!expected.test(name)) throw new Error(`Unexpected music resource ${name}`);
      const src = name.toLowerCase() + '.gz';
      await writeFile(join(out, src), gzipSync(data, { level: 9 }));
      files[name.slice(0, -4)] = { src, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
    }
  }
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node extractor/music.mjs <GOG installation or DAT directory>');
  console.log(await buildMusic(process.argv[2], process.argv[3]));
}
