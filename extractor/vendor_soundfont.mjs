import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const revision = 'f33e5f3045d42737373ddebea2661b56661ebeb9';
const base = `https://raw.githubusercontent.com/not-hanjo-mei/mt32-web/${revision}/`;
async function get(url, path, hash, suffix = '') {
  const response = await fetch(url); if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash && createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== hash) throw new Error(`Integrity check failed: ${path}`);
  await writeFile(path, suffix ? Buffer.concat([bytes, Buffer.from(suffix)]) : bytes);
  console.log(path, bytes.length);
}
await mkdir('public/assets/audio', { recursive: true });
const response = await fetch(base + 'wasm/tsf.js'); if (!response.ok) throw new Error(response.status);
const loader = await response.text(), factory = loader.match(/var (\w+) = \(\(\) =>/)[1];
if (createHash('sha1').update(`blob ${Buffer.byteLength(loader)}\0`).update(loader).digest('hex') !== 'b31bd1c3001852f0f5fd1ed97b208b92071caade') throw new Error('TSF loader integrity failed');
await writeFile('public/assets/audio/tsf.js', loader + `\n// WebKyra ESM export.\nexport default ${factory};\n`);
await get(base + 'wasm/tsf.wasm', 'public/assets/audio/tsf.wasm', 'cf8c489979653cd830e55d1049c6e8998b9131d0');
await get(base + 'vendor/TinySoundFont/LICENSE', 'public/assets/audio/TinySoundFont-LICENSE.txt', '533da73eb51d65d6c34d4baf3420d770c3570a5e');
// The complete source is already distributed in mt32-source.tar.gz from this revision.
if (process.argv.includes('--local-bank')) {
  const directory = '.local/soundfonts'; await mkdir(directory, { recursive: true });
  const path = directory + '/GeneralUser-GS.sf2';
  try { await readFile(path); console.log('Existing local bank retained.'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await get('https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2', path, '298b552d2e9d1307e03e5c5c99d2c046aaed9ec3');
  }
  await get('https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/documentation/LICENSE.txt', directory + '/GeneralUser-GS-LICENSE.txt');
}
