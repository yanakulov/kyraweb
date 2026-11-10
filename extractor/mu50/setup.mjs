// Portable, project-scoped MU50 build environment. No admin/system installation.
// Usage: node extractor/mu50/setup.mjs D:\WebKyra-build
import { mkdir, readFile, writeFile, access, readdir, rename } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join, isAbsolute } from 'node:path';

const root = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !isAbsolute(process.argv[2])) throw new Error('Supply an approved absolute build directory.');
const marker = join(root, 'kyraweb-mu50-environment.json');
async function exists(path) { try { await access(path); return true; } catch { return false; } }
await mkdir(root, { recursive: true });
if (!await exists(marker) && (await readdir(root)).length) throw new Error('Build directory is not empty and is not owned by this setup.');
let record = await exists(marker) ? JSON.parse(await readFile(marker, 'utf8')) : { project: 'kyraweb-mu50', root, stage: 'created' };
if (record.project !== 'kyraweb-mu50') throw new Error('Unrecognized build directory marker.');
async function save(stage, more = {}) { record = { ...record, ...more, stage }; await writeFile(marker, JSON.stringify(record, null, 2) + '\n'); console.log(`MU50 setup: ${stage}`); }
await save('preparing');
const downloads = join(root, 'downloads'), temporary = join(root, 'tmp'), tools = join(root, 'tools');
for (const path of [downloads, temporary, tools]) await mkdir(path, { recursive: true });
const env = { ...process.env, TEMP: temporary, TMP: temporary, EM_CACHE: join(root, 'emscripten-cache'), XDG_CACHE_HOME: join(root, 'cache') };
function run(command, args, cwd = root, extraEnv = {}) {
  console.log(command, ...args);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...env, ...extraEnv }, stdio: 'inherit', shell: false });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
async function download(url, filename, sha256) {
  const path = join(downloads, filename);
  if (!await exists(path)) {
    const response = await fetch(url); if (!response.ok || !response.body) throw new Error(`${response.status}: ${url}`);
    const partial = path + '.part';
    if (await exists(partial)) throw new Error(`A previous partial download exists: ${partial}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { flags: 'wx' }));
    await rename(partial, path);
  }
  if (sha256 && createHash('sha256').update(await readFile(path)).digest('hex') !== sha256) throw new Error(`Checksum mismatch: ${path}`);
  return path;
}
await save('downloading-portable-host-tools');
const seven = await download('https://www.7-zip.org/a/7zr.exe', '7zr.exe');
const w64 = await download('https://github.com/skeeto/w64devkit/releases/download/v2.11.0/w64devkit-x64-2.11.0.7z.exe', 'w64devkit-x64-2.11.0.7z.exe', '54c2bb9962e8a30c8270e34c5efc3d5fee579f53087fa7d435b95fbba2af7b2b');
const pythonArchive = await download('https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip', 'python-3.12.10-embed-amd64.zip');
if (!await exists(join(tools, 'w64devkit', 'bin', 'gcc.exe'))) await run(seven, ['x', w64, `-o${tools}`, '-y']);
const pythonDir = join(tools, 'python'); await mkdir(pythonDir, { recursive: true });
if (!await exists(join(pythonDir, 'python.exe'))) await run('tar.exe', ['-xf', pythonArchive, '-C', pythonDir]);
const python = join(pythonDir, 'python.exe'), hostBin = join(tools, 'w64devkit', 'bin');
env.PATH = `${hostBin};${pythonDir};${process.env.PATH}`;

await save('fetching-emsdk');
const sdk = join(root, 'emsdk');
if (!await exists(join(sdk, '.git'))) await run('git', ['clone', '--depth', '1', 'https://github.com/emscripten-core/emsdk.git', sdk]);
await writeFile(join(pythonDir, 'python312._pth'), `python312.zip\n.\n${sdk}\n${join(root, 'mame', 'scripts', 'build')}\nimport site\n`);
await save('installing-emscripten-6.0.2');
if (!await exists(join(sdk, 'upstream', 'emscripten', 'emcc.py'))) await run(python, [join(sdk, 'emsdk.py'), 'install', '6.0.2'], sdk);
await run(python, [join(sdk, 'emsdk.py'), 'activate', '6.0.2', '--embedded'], sdk);

await save('fetching-mame-mu50-source');
const mame = join(root, 'mame');
if (!await exists(join(mame, '.git'))) await run('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', 'https://github.com/mamedev/mame.git', mame]);
await run('git', ['sparse-checkout', 'set', 'src/emu', 'src/devices', 'src/lib', 'src/osd', 'src/frontend', 'src/tools', 'src/mame/yamaha', 'src/mame/layout', 'src/mame/shared', 'scripts', '3rdparty', 'bgfx'], mame);
await save('host-tools-and-source-ready', { python, hostBin, sdk, mame, emscriptenVersion: '6.0.2' });
await run('git', ['rev-parse', 'HEAD'], mame);
await run(python, [join(sdk, 'upstream', 'emscripten', 'emcc.py'), '--version'], sdk, { EM_CONFIG: join(sdk, '.emscripten') });
console.log('Environment ready. This is not yet a compiled or integrated MU50 emulator.');
