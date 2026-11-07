import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { MusicPlayer } from '../src/engine/audio/music';

/** Controller-only tests: the actual WASM output has a separate integration check. */
function environment(saved: string | null, delayed = false, host = 'localhost') {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const contexts: FakeContext[] = [];
  let release!: () => void;
  const gate = delayed ? new Promise<void>(resolve => { release = resolve; }) : Promise.resolve();
  class FakeContext {
    state = 'running'; currentTime = 0; destination = {}; audioWorklet = { addModule: async () => {} };
    constructor() { contexts.push(this); }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
    async suspend() { this.state = 'suspended'; }
    createGain() { return { gain: { value: 0, setTargetAtTime() {} }, connect() { return this; }, disconnect() {} }; }
  }
  class FakeNode {
    onprocessorerror = null;
    port = { onmessage: null as ((event: { data: { type: string } }) => void) | null, close() {}, postMessage: (data: { type: string }) => { if (data.type === 'init') queueMicrotask(() => this.port.onmessage?.({ data: { type: 'ready' } })); } };
    connect(target: unknown) { return target; } disconnect() {}
  }
  const values: Record<string, unknown> = {
    location: { hostname: host }, indexedDB: undefined, AudioContext: FakeContext, AudioWorkletNode: FakeNode,
    localStorage: { getItem: (key: string) => key === 'kyrandia.music' ? saved : null, setItem() {} },
    fetch: async (url: string) => {
      if (url.endsWith('pair.json')) { await gate; return Response.json({ available: true }); }
      if (url.endsWith('/soundfonts/list.json')) return Response.json(['GeneralUser-GS.sf2']);
      if (url.endsWith('GeneralUser-GS.sf2')) return new Response(readFileSync('tests/fixtures/tiny.sf2'));
      if (url.endsWith('MT32_CONTROL.ROM')) return new Response(new Uint8Array(65536));
      if (url.endsWith('MT32_PCM.ROM')) return new Response(new Uint8Array(524288));
      if (url.endsWith('intro.xmi.gz')) return new Response(gunzipSync(readFileSync('public/assets/music/intro.xmi.gz')));
      if (url.endsWith('mt32emu.wasm')) return new Response(new Uint8Array());
      if (url.endsWith('tsf.wasm')) return new Response(new Uint8Array());
      throw new Error(`Unexpected fetch: ${url}`);
    }
  };
  for (const [key, value] of Object.entries(values)) { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); }
  return { contexts, release: () => release(), restore: () => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } } };
}
test('local ROMs auto-enable without an import, but audio starts only after a gesture', async () => {
  const env = environment(null); let ready!: () => void;
  const done = new Promise<void>(resolve => { ready = resolve; });
  const player = new MusicPlayer(state => { if (state.ready) ready(); });
  try {
    await player.restore(); assert.equal(player.state.source, 'local'); assert.equal(player.state.enabled, true); assert.equal(env.contexts.length, 0);
    player.unlock(); await done; assert.equal(player.state.ready, true); assert.equal(env.contexts.length, 1);
  } finally { player.dispose(); assert.ok(env.contexts.every(c => c.state === 'closed')); env.restore(); }
});
test('an early opening click warms one context and starts when ROM discovery completes', async () => {
  const env = environment(null, true); let ready!: () => void;
  const done = new Promise<void>(resolve => { ready = resolve; });
  const player = new MusicPlayer(state => { if (state.ready) ready(); });
  try {
    const loading = player.restore(); player.unlock(); assert.equal(env.contexts.length, 1);
    env.release(); await loading; await done; assert.equal(env.contexts.length, 1); assert.equal(player.state.ready, true);
  } finally { player.dispose(); env.restore(); }
});
test('explicit music-off remains off even when a local ROM pair is available', async () => {
  const env = environment('0'); let ready!: () => void;
  const done = new Promise<void>(resolve => { ready = resolve; });
  const player = new MusicPlayer(state => { if (state.ready) ready(); });
  try { await player.restore(); player.unlock(); await done; assert.equal(player.state.available, true); assert.equal(player.state.enabled, false); assert.equal(player.state.sfxEnabled, true); assert.equal(env.contexts.length, 1); }
  finally { player.dispose(); env.restore(); }
});
test('renderer changes use a different bank and invalid SF2 imports preserve the working device', async () => {
  const env = environment(null), player = new MusicPlayer(() => {});
  try {
    await player.restore(); assert.ok(player.state.banks.some(bank => bank.name === 'GeneralUser-GS'));
    await player.selectRenderer('sf2:local:GeneralUser-GS.sf2');
    assert.equal(player.state.renderer, 'sf2:local:GeneralUser-GS.sf2'); assert.equal(player.state.ready, true);
    const current = env.contexts.at(-1)!;
    await player.importSoundFont(new File(['not a bank'], 'bad.sf2'));
    assert.equal(player.state.renderer, 'sf2:local:GeneralUser-GS.sf2'); assert.equal(current.state, 'running'); assert.equal(player.state.ready, true);
    await player.selectRenderer('mt32'); assert.equal(player.state.renderer, 'mt32'); assert.equal(current.state, 'closed'); assert.equal(player.state.ready, true);
  } finally { player.dispose(); env.restore(); }
});
