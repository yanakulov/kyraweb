import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { validateMu50RomSet } from './roms.mjs';

const directory = resolve(process.argv[2] ?? '.local/mu50');
const entries = [];
try {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    if (!file.isFile() || !/\.(rom|bin|ic7|ic18|ic19)$/i.test(file.name)) continue;
    const bytes = await readFile(join(directory, file.name));
    entries.push({ name: file.name, size: bytes.length, sha1: createHash('sha1').update(bytes).digest('hex') });
  }
  console.log(JSON.stringify(validateMu50RomSet(entries), null, 2));
} catch (error) {
  console.error(error.code === 'ENOENT' ? `MU50 ROM directory is missing: ${directory}` : error.message);
  console.error('Supply your own BIOS (512 KiB) and two wave ROMs (2 MiB each). No SoundFont or MT-32 ROM can replace these.');
  process.exitCode = 1;
}
