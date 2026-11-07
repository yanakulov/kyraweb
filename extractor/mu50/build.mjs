// Run after setup.mjs. The user-approved external build directory is the only
// place receiving compilers, MAME patches, caches and large generated objects.
import { readFile, writeFile, mkdir, access, rename, readdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join, isAbsolute } from 'node:path';

if (!process.argv[2] || !isAbsolute(process.argv[2])) throw new Error('Supply the approved absolute MU50 build directory.');
const root = resolve(process.argv[2]);
if (/["\r\n]/.test(root)) throw new Error('Unsupported build path characters.');
const marker = join(root, 'kyraweb-mu50-environment.json');
const state = JSON.parse(await readFile(marker, 'utf8'));
const prepareOnly = process.argv.includes('--prepare-tools');
if (state.project !== 'kyraweb-mu50' || !prepareOnly && !['host-tools-and-source-ready', 'build-failed', 'wasm-built'].includes(state.stage)) throw new Error(`Setup is not complete (stage: ${state.stage}).`);
const temporary = join(root, 'tmp'), downloads = join(root, 'downloads'), tools = join(root, 'tools');
const env = { ...process.env, TEMP: temporary, TMP: temporary, EM_CACHE: join(root, 'emscripten-cache'), XDG_CACHE_HOME: join(root, 'cache') };
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function run(command, args, cwd = root) {
  console.log(command, ...args);
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit', shell: false });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
async function archive(url, filename, sha256) {
  const path = join(downloads, filename);
  if (!await exists(path)) {
    let response, failure;
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`Downloading ${filename}, connection attempt ${attempt}/3`);
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(300000) });
        if (!response.ok || !response.body) throw new Error(`${response.status}: ${url}`);
        break;
      } catch (error) { failure = error; response = undefined; console.warn(error.message); }
    }
    if (!response) throw failure;
    await pipeline(Readable.fromWeb(response.body), createWriteStream(path + '.part', { flags: 'wx' }));
    await rename(path + '.part', path);
  }
  if (createHash('sha256').update(await readFile(path)).digest('hex') !== sha256) throw new Error(`Integrity failure: ${filename}`);
  return path;
}
const cmakeName = 'cmake-4.4.5-windows-x86_64';
if (!await exists(join(tools, cmakeName, 'bin', 'cmake.exe'))) {
  const zip = await archive(`https://github.com/Kitware/CMake/releases/download/v4.4.5/${cmakeName}.zip`, cmakeName + '.zip', '326c826486d46a23cf9d5a1c9ee3a567d427bdd02c4a34071937a2a675cff004');
  await run('tar.exe', ['-xf', zip, '-C', tools]);
}
const ninja = join(tools, 'ninja'); await mkdir(ninja, { recursive: true });
if (!await exists(join(ninja, 'ninja.exe'))) {
  const zip = await archive('https://github.com/ninja-build/ninja/releases/download/v1.13.2/ninja-win.zip', 'ninja-win-1.13.2.zip', '07fc8261b42b20e71d1720b39068c2e14ffcee6396b76fb7a795fb460b78dc65');
  await run('tar.exe', ['-xf', zip, '-C', ninja]);
}
if (prepareOnly) { console.log('Portable CMake and Ninja are ready; source setup may continue independently.'); process.exit(0); }
const bridge = await readFile(new URL('./midi_bridge.cpp', import.meta.url), 'utf8');
await run('git', ['sparse-checkout', 'add', 'artwork/bgfx'], state.mame);
const midiPath = 'src/osd/modules/midi/none.cpp', target = join(state.mame, midiPath);
const current = await readFile(target, 'utf8');
if (current.replace(/\r\n/g, '\n') !== bridge) {
  const original = execFileSync('git', ['show', `HEAD:${midiPath}`], { cwd: state.mame, encoding: 'utf8' });
  const previousBridge = createHash('sha256').update(current.replace(/\r\n/g, '\n')).digest('hex') === state.bridgeSha256;
  if (!previousBridge && current.replace(/\r\n/g, '\n') !== original.replace(/\r\n/g, '\n')) throw new Error('MAME MIDI provider has unrelated changes; refusing to overwrite it.');
  await writeFile(target, bridge);
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: state.mame, encoding: 'utf8' }).trim();
const requestedJobs = Number(process.argv[3] ?? 2);
if (!Number.isInteger(requestedJobs) || requestedJobs < 1 || requestedJobs > 4) throw new Error('Use between one and four compiler jobs.');
const jobs = requestedJobs;
const batch = join(root, 'build-mu50.cmd');
await writeFile(batch, [
  '@echo off',
  `set "TEMP=${temporary}"`, `set "TMP=${temporary}"`, `set "EM_CACHE=${env.EM_CACHE}"`,
  `call "${join(state.sdk, 'emsdk_env.bat')}"`, 'if errorlevel 1 exit /b 1',
  'set "KYRA_PYTHON=%EMSDK_PYTHON:\\=/%"',
  `set "PATH=${join(tools, cmakeName, 'bin')};${ninja};${state.hostBin};%PATH%"`,
  `cd /d "${state.mame}"`,
  'call embuilder.bat build sdl3 sdl3_ttf', 'if errorlevel 1 exit /b 1',
  `call emmake.bat make -j${jobs} SUBTARGET=mu50 SOURCES=src/mame/yamaha/ymmu50.cpp USE_SDL3=1 NOWERROR=1 NO_OPENGL=1 NO_USE_MIDI=1 NO_USE_PORTAUDIO=1 NO_USE_PULSEAUDIO=1 PYTHON_EXECUTABLE=%KYRA_PYTHON%`,
  'exit /b %errorlevel%', ''
].join('\r\n'));
const buildInfo = { ...state, mameRevision: revision, bridgeSha256: createHash('sha256').update(bridge).digest('hex') };
await writeFile(marker, JSON.stringify({ ...buildInfo, stage: 'building' }, null, 2) + '\n');
try {
  await run('cmd.exe', ['/d', '/c', batch]);
  const artifacts = [];
  for (const directory of [state.mame, join(state.mame, 'build', 'asmjs', 'bin')]) {
    if (await exists(directory)) for (const name of await readdir(directory)) if (/mu50.*\.(wasm|js|html)$/i.test(name)) artifacts.push(join(directory, name));
  }
  if (!artifacts.some(name => name.endsWith('.wasm'))) throw new Error('Build command completed without a MU50 WebAssembly artifact.');
  await writeFile(marker, JSON.stringify({ ...buildInfo, stage: 'wasm-built', artifacts }, null, 2) + '\n');
  console.log('MU50 WASM build artifacts:', artifacts);
  console.log('Firmware boot and audio integration still require validation; no renderer is published automatically.');
} catch (error) {
  await writeFile(marker, JSON.stringify({ ...buildInfo, stage: 'build-failed', error: error.message }, null, 2) + '\n');
  throw error;
}
