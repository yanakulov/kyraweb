import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { localRomMiddleware } from '../extractor/local_mt32';
import { readLocalRoms, isLocalMusicHost } from '../src/engine/audio/localRoms';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kyra-local-rom-test-'));
  const dir = join(root, '.local', 'mt32'); await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'MT32_CONTROL.ROM'), new Uint8Array(65536));
  await writeFile(join(dir, 'MT32_PCM.ROM'), new Uint8Array(524288));
  return root;
}
async function invoke(root: string, path: string, options: { address?: string; method?: string; headers?: Record<string, string> } = {}) {
  const result = { status: 200, headers: {} as Record<string, string | number>, body: undefined as Buffer | undefined, next: false };
  const request = { url: path, method: options.method ?? 'GET', socket: { remoteAddress: options.address ?? '127.0.0.1' }, headers: { host: 'localhost:5173', ...options.headers } } as unknown as IncomingMessage;
  const response = { set statusCode(value: number) { result.status = value; }, setHeader(key: string, value: string | number) { result.headers[key] = value; }, end(body?: Buffer) { result.body = body; } } as unknown as ServerResponse;
  await localRomMiddleware(root, '/kyraweb/')(request, response, () => { result.next = true; });
  return result;
}
test('local ROM middleware serves a private bounded pair only through its fixed endpoint', async () => {
  const root = await fixture();
  try {
    const manifest = await invoke(root, '/kyraweb/__local/mt32/pair.json');
    assert.deepEqual(JSON.parse(manifest.body!.toString()), { available: true });
    assert.equal(manifest.headers['Cache-Control'], 'no-store');
    assert.equal(manifest.headers['Cross-Origin-Resource-Policy'], 'same-origin');
    assert.equal((await invoke(root, '/kyraweb/__local/mt32/MT32_CONTROL.ROM')).body?.length, 65536);
    assert.equal((await invoke(root, '/kyraweb/__local/mt32/MT32_PCM.ROM', { method: 'HEAD' })).body, undefined);
    assert.equal((await invoke(root, '/kyraweb/assets/music/intro.xmi.gz')).next, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('ROM middleware rejects remote clients, cross-origin access, traversal and writes', async () => {
  const root = await fixture();
  try {
    const url = '/kyraweb/__local/mt32/MT32_CONTROL.ROM';
    for (const options of [{ address: '192.168.1.12' }, { headers: { host: 'other.example', origin: 'http://other.example' } }, { headers: { origin: 'https://other.example' } }, { headers: { 'sec-fetch-site': 'cross-site' } }, { method: 'POST' }]) {
      const response = await invoke(root, url, options); assert.equal(response.status, 404); assert.equal(response.body, undefined);
    }
    assert.equal((await invoke(root, '/kyraweb/__local/mt32/../../package.json')).status, 404);
    assert.equal((await invoke(root, '/kyraweb/__local/mt32/%2e%2e%2fpackage.json')).status, 404);
    assert.equal((await invoke(root, url, { address: '::1', headers: { origin: 'http://localhost:5173' } })).body?.length, 65536);
    await rm(join(root, '.local', 'mt32', 'MT32_PCM.ROM'));
    assert.equal((await invoke(root, url)).status, 404);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('local ROM discovery never downloads from public hosts and tolerates ordinary static hosting', async () => {
  const calls: string[] = [];
  const request = (async (url: string) => {
    calls.push(url);
    if (url.endsWith('pair.json')) return Response.json({ available: true });
    return new Response(new Uint8Array(url.endsWith('MT32_CONTROL.ROM') ? 65536 : 524288));
  }) as typeof fetch;
  assert.equal(isLocalMusicHost('example.com'), false); assert.equal(isLocalMusicHost('127.0.0.1'), true);
  assert.equal(await readLocalRoms('example.com', request), undefined); assert.equal(calls.length, 0);
  const roms = await readLocalRoms('localhost', request);
  assert.equal(roms?.control.byteLength, 65536); assert.equal(roms?.pcm.byteLength, 524288); assert.equal(calls.length, 3);
  assert.ok(calls.every(url => url.startsWith('/__local/mt32/')));
  assert.equal(await readLocalRoms('localhost', (async () => new Response('', { status: 404 })) as typeof fetch), undefined);
  assert.equal(await readLocalRoms('localhost', (async () => new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } })) as typeof fetch), undefined);
});
test('local SoundFont catalogue serves fixed local SF2 files, not arbitrary paths or firmware', async () => {
  const root = await fixture();
  try {
    const dir = join(root, '.local', 'soundfonts'); await mkdir(dir);
    await writeFile(join(dir, 'test+bank.sf2'), new Uint8Array(128));
    await writeFile(join(dir, 'private.txt'), 'not a soundfont');
    const list = await invoke(root, '/kyraweb/__local/soundfonts/list.json');
    assert.deepEqual(JSON.parse(list.body!.toString()), ['test+bank.sf2']);
    assert.equal((await invoke(root, '/kyraweb/__local/soundfonts/test%2Bbank.sf2')).body?.length, 128);
    assert.equal((await invoke(root, '/kyraweb/__local/soundfonts/private.txt')).status, 404);
    assert.equal((await invoke(root, '/kyraweb/__local/soundfonts/../mt32/MT32_CONTROL.ROM')).status, 404);
    assert.equal((await invoke(root, '/kyraweb/__local/soundfonts/test%2Bbank.sf2', { address: '192.168.1.12' })).status, 404);
  } finally { await rm(root, { recursive: true, force: true }); }
});
