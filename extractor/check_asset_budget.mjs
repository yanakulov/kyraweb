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
// Intro, forest and Timbermist quests, book renderer, original XMIDI/ADL and audio emulators.
// Expand with measured content additions; this is not a full-game size target.
// The complete LGPL source archive is distributed, but never automatically fetched.
// The optional GeneralUser GS bank has its own limit and loads only when selected.
const budget = 7_630_000, runtimeBudget = 6_680_000;
const result = await size('dist');
const source = (await stat('dist/assets/audio/mt32-source.tar.gz')).size
  + (await stat('dist/assets/audio/adlib-source.tar.gz')).size;
const soundfont = (await stat('dist/assets/audio/soundfonts/GeneralUser-GS.sf2')).size;
const effects = (await stat('dist/assets/audio/effects.mp3')).size;
const voices = (await size('dist/assets/voices')).bytes;
const controlPreviews = (await stat('dist/assets/interface/controls-classic.webp')).size
  + (await stat('dist/assets/interface/controls-modern.webp')).size;
const runtime = result.bytes - source - soundfont - effects - voices - controlPreviews;
const model = (await stat('dist/assets/interface/storybook.glb.gz')).size;
console.log(`Production build: ${result.bytes.toLocaleString('en-US')} bytes in ${result.files} files.`);
console.log(`Runtime: ${runtime.toLocaleString('en-US')} bytes; optional bank: ${soundfont.toLocaleString('en-US')} bytes; CD voices: ${voices.toLocaleString('en-US')} bytes; fallback SFX: ${effects.toLocaleString('en-US')} bytes; source archive: ${source.toLocaleString('en-US')} bytes; book model: ${model.toLocaleString('en-US')} bytes; first-run previews: ${controlPreviews.toLocaleString('en-US')} bytes.`);
if (soundfont !== 32_319_396) throw new Error('Unexpected size for the pinned GeneralUser GS bank.');
if (runtime > runtimeBudget) throw new Error('Runtime asset budget exceeded.');
if (effects > 600_000) throw new Error('Fallback sound effects budget exceeded.');
if (voices > 5_000_000) throw new Error('CD voice asset budget exceeded.');
if (controlPreviews > 60_000) throw new Error('First-run previews budget exceeded.');
if (runtime + source > budget) throw new Error('Asset budget exceeded. Check duplicate exports and unused public resources before adding content.');
