import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

async function size(dir) {
  let bytes = 0, files = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { const child = await size(path); bytes += child.bytes; files += child.files; }
    else { bytes += (await stat(path)).size; files++; }
  }
  return { bytes, files };
}
// Regression cap for the intro and first forest quests, including the repaired bridge, including code.
// Expand with measured content additions; this is not a full-game size target.
const budget = 2_700_000;
const result = await size('dist');
console.log(`Production build: ${result.bytes.toLocaleString('en-US')} bytes in ${result.files} files; budget ${budget.toLocaleString('en-US')} bytes.`);
if (result.bytes > budget) throw new Error('Asset budget exceeded. Check duplicate exports and unused public resources before adding content.');
