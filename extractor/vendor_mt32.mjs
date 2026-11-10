// Pinned, ROM-free LGPL emulator build. Never downloads Roland firmware.
import { mkdir, writeFile, appendFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const revision = 'f33e5f3045d42737373ddebea2661b56661ebeb9';
const base = `https://raw.githubusercontent.com/not-hanjo-mei/mt32-web/${revision}/`;
async function download(url, path, gitHash) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (gitHash && createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== gitHash) throw new Error(`Integrity check failed: ${path}`);
  await writeFile(path, bytes);
  console.log(path, bytes.length, createHash('sha256').update(bytes).digest('hex'));
}
await mkdir('public/assets/audio', { recursive: true });
await download(base + 'wasm/mt32emu.js', 'public/assets/audio/mt32emu.js', 'f779a5857b75f129566bb50cbc1b07d2d8bcbd28');
await appendFile('public/assets/audio/mt32emu.js', '\n// WebKyra: expose the unmodified factory to the AudioWorklet module bundler.\nexport default createMt32EmuModule;\n');
await download(base + 'wasm/mt32emu.wasm', 'public/assets/audio/mt32emu.wasm', 'da3331dfd5d878e418ed997bc68e9715c3fd229f');
// Complete corresponding source, including the bridge, build recipe, Munt and all licenses.
await download(`https://codeload.github.com/not-hanjo-mei/mt32-web/tar.gz/${revision}`, 'public/assets/audio/mt32-source.tar.gz');
await download(base + 'LICENSE', 'public/assets/audio/COPYING.LESSER.txt', '510e99acdb56a9c90ba04568dea7aff8470a3850');
await download(base + 'vendor/munt/mt32emu/COPYING.txt', 'public/assets/audio/COPYING.txt', 'd511905c1647a1e311e8b20d5930a37a9c2531cd');
await writeFile('public/assets/audio/COPYING.GPL3.txt', await readFile('LICENSES/GPL-3.0.txt'));
