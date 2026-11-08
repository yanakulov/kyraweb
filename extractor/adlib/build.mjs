// SPDX-License-Identifier: LGPL-2.1-or-later
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const revision = '3d9457ac91121302a752577b2bf063b4aea202b8';
const source = dirname(fileURLToPath(import.meta.url));
const [checkout, destination = 'public/assets/audio', zig = 'zig'] = process.argv.slice(2);
if (!checkout) throw new Error('Usage: node extractor/adlib/build.mjs <AdPlug checkout> [output directory] [zig executable]');
const upstream = resolve(checkout);
const out = resolve(destination);
const work = await mkdtemp(join(tmpdir(), 'kyra-adlib-'));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: work, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`${command} exited with ${result.status}`);
}

try {
  // The driver is independent of AdPlug's file provider and player database.
  // Kyrandia already knows which bank and raw track number to load.
  const adl = (await readFile(join(upstream, 'src', 'adl.cpp'), 'utf8')).replaceAll('\r\n', '\n');
  const driver = adl.split('// ### End of current scummvm code ###')[0]
    .replace('#include "adl.h"', '#include "opl.h"')
    .replace('#include "debug.h"', '')
    .replace('/*\n\tvoid setSyncJumpMask', 'void setSyncJumpMask')
    .replace('\n\tvoid setMusicVolume(uint8 volume) override;\n\tvoid setSfxVolume(uint8 volume) override;\n\t*/', '');
  await writeFile(join(work, 'adl-driver.inc'), driver);
  const files = ['adl.cpp', 'opl.h', 'nukedopl.c', 'nukedopl.h'];
  await mkdir(join(work, 'src'));
  for (const name of files) await copyFile(join(upstream, 'src', name), join(work, 'src', name));
  await copyFile(join(upstream, 'COPYING'), join(work, 'COPYING'));
  for (const name of ['opl.cpp', 'build.mjs']) await copyFile(join(source, name), join(work, name));
  await mkdir(out, { recursive: true });
  const flags = ['-target', 'wasm32-wasi', '-Oz', '-DNDEBUG', '-fno-stack-protector'];
  run(zig, ['cc', ...flags, '-c', 'src/nukedopl.c', '-o', 'nukedopl.o']);
  run(zig, ['c++', ...flags, '-Isrc', '-fno-exceptions', '-fno-rtti', '-c', 'opl.cpp', '-o', 'opl.o']);
  run(zig, ['cc', ...flags, '-nostdlib', '-Wl,--no-entry',
    ...['adl_bank', 'adl_output', 'adl_play', 'adl_render'].map(name => `-Wl,--export=${name}`),
    'opl.o', 'nukedopl.o', '-o', join(out, 'adlib.wasm')]);
  await writeFile(join(work, 'README.txt'),
    `AdPlug and Nuked OPL3 source from https://github.com/adplug/adplug/tree/${revision}\n` +
    'Kyrandia Web uses the Westwood driver and the OPL2-compatible mode of Nuked OPL3.\n' +
    'To rebuild the extracted source, run: node build.mjs . . /path/to/zig\n');
  run('tar', ['-czf', join(out, 'adlib-source.tar.gz'), 'COPYING', 'README.txt', 'build.mjs', 'opl.cpp', 'src']);
} finally {
  await rm(work, { recursive: true, force: true });
}
