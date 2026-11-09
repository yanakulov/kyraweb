import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { MusicPlayer } from '../src/engine/audio/music';
import { loadAdlib } from '../src/engine/audio/adlib';

/** Controller-only tests: the actual WASM output has a separate integration check. */
function environment(saved: string | null, delayed = false, host = 'localhost', voices = false, renderer: string | null = host === 'localhost' ? 'mt32' : null) {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const contexts: FakeContext[] = [];
  const audio = { workletEffects: [] as number[][], clips: [] as number[][], stopped: 0, banks: [] as string[], adlibTracks: [] as [string, number][], requests: [] as string[] };
  let release!: () => void;
  const gate = delayed ? new Promise<void>(resolve => { release = resolve; }) : Promise.resolve();
  class FakeContext {
    state = 'running'; currentTime = 0; destination = {}; audioWorklet = { addModule: async () => {} };
    constructor() { contexts.push(this); }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
    async suspend() { this.state = 'suspended'; }
    createGain() { return { gain: { value: 0, setTargetAtTime() {} }, connect() { return this; }, disconnect() {} }; }
    async decodeAudioData() { this.currentTime += .6; return { duration: 3 }; }
    createBufferSource() { return { connect() {}, disconnect() {}, stop() { audio.stopped++; }, start: (...args: number[]) => audio.clips.push(args) }; }
  }
  class FakeNode {
    onprocessorerror = null;
    port = { onmessage: null as ((event: { data: { type: string } }) => void) | null, close() {}, postMessage: (data: { type: string; file: string; bank?: ArrayBuffer; track?: number | { status: number; data: number[] }[] }) => {
      if (data.type === 'init') queueMicrotask(() => this.port.onmessage?.({ data: { type: 'ready' } }));
      if (data.type === 'effect' && Array.isArray(data.track)) audio.workletEffects.push(data.track.filter(event => event.status >> 4 === 12).flatMap(event => event.data));
      if (data.type === 'track' && data.bank && typeof data.track === 'number') audio.adlibTracks.push([data.file, data.track]);
    } };
    connect(target: unknown) { return target; } disconnect() {}
  }
  const values: Record<string, unknown> = {
    location: { hostname: host }, indexedDB: undefined, AudioContext: FakeContext, AudioWorkletNode: FakeNode,
    localStorage: { getItem: (key: string) => key === 'kyrandia.music' ? saved : key === 'kyrandia.renderer' ? renderer : key === 'kyrandia.voice' && !voices ? '0' : null, setItem() {} },
    fetch: async (url: string) => {
      audio.requests.push(url);
      if (url.endsWith('pair.json')) { await gate; return Response.json({ available: true }); }
      if (url.endsWith('/soundfonts/list.json')) return Response.json(['GeneralUser-GS.sf2']);
      if (url.endsWith('GeneralUser-GS.sf2')) return new Response(readFileSync('tests/fixtures/tiny.sf2'));
      if (url.endsWith('MT32_CONTROL.ROM')) return new Response(new Uint8Array(65536));
      if (url.endsWith('MT32_PCM.ROM')) return new Response(new Uint8Array(524288));
      if (url.endsWith('intro.xmi.gz')) return new Response(gunzipSync(readFileSync('public/assets/music/intro.xmi.gz')));
      if (url.endsWith('.adl.gz')) return new Response(readFileSync(`public/assets/music/${url.split('/').at(-1)}`));
      if (url.endsWith('adlib.wasm')) return new Response(new Uint8Array());
      if (url.endsWith('mt32emu.wasm')) return new Response(new Uint8Array());
      if (url.endsWith('tsf.wasm')) return new Response(new Uint8Array());
      if (url.endsWith('effects.mp3')) return new Response(new Uint8Array());
      if (url.endsWith('.mp3bank')) { audio.banks.push(url); return new Response(readFileSync(`public/assets/voices/${url.split('/').at(-1)}`)); }
      throw new Error(`Unexpected fetch: ${url}`);
    }
  };
  for (const [key, value] of Object.entries(values)) { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); }
  return { contexts, audio, release: () => release(), restore: () => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } } };
}
test('a saved Roland device discovers the local pair and starts after a gesture', async () => {
  const env = environment(null); let ready!: () => void;
  const done = new Promise<void>(resolve => { ready = resolve; });
  const player = new MusicPlayer(state => { if (state.ready) ready(); });
  try {
    await player.restore(); assert.equal(player.state.source, 'local'); assert.equal(player.state.enabled, true); assert.equal(env.contexts.length, 0);
    player.unlock(); await done; assert.equal(player.state.ready, true); assert.equal(env.contexts.length, 1);
  } finally { player.dispose(); assert.ok(env.contexts.every(c => c.state === 'closed')); env.restore(); }
});

test('CD speech starts separately from music and effects and a skip cancels pending and playing lines', async () => {
  const env = environment('0', false, 'yanakulov.github.io', true), player = new MusicPlayer(() => {});
  const settle = () => new Promise(resolve => setImmediate(resolve));
  try {
    player.setSfxEnabled(false);
    player.unlock(); player.setPaused(false);
    player.speak('INTRO', 0); player.stopSpeech();
    await settle();
    assert.equal(env.audio.clips.length, 0);
    player.speak('INTRO', 1); await settle();
    assert.deepEqual(env.audio.clips, [[0, 0]]);
    assert.equal(env.audio.banks.length, 1);
    player.setPaused(true); assert.equal(env.contexts[0].state, 'suspended');
    player.setPaused(false); assert.equal(env.contexts[0].state, 'running');
    player.setVoiceEnabled(false); assert.equal(env.audio.stopped, 1);
    player.speak('SPELL', 42); await settle();
    assert.equal(env.audio.clips.length, 1);
    assert.equal(env.audio.banks.length, 1);
  } finally { player.dispose(); env.restore(); }
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

test('the tree explosion uses original MT-32 patch 55 before and after switching through SF2', async () => {
  const env = environment(null); let ready!: () => void;
  const done = new Promise<void>(resolve => { ready = resolve; });
  const player = new MusicPlayer(state => { if (state.ready) ready(); });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  try {
    await player.restore(); player.unlock(); await done;
    player.setPaused(false); player.setEnabled(false);
    player.effect(25); await settle();
    assert.deepEqual(env.audio.workletEffects, [[55]]);
    await player.selectRenderer('sf2:local:GeneralUser-GS.sf2');
    await settle();
    player.setEnabled(false); player.effect(25);
    assert.equal(env.audio.clips.length, 1, 'recorded explosion plays with the SF2 music muted');
    assert.deepEqual(env.audio.workletEffects, [[55]], 'the GM device never receives the explosion as MIDI notes');
    await player.selectRenderer('mt32'); player.setEnabled(false);
    player.effect(25); await settle();
    assert.deepEqual(env.audio.workletEffects, [[55], [55]]);
  } finally { player.dispose(); env.restore(); }
});

test('a fresh browser plays AdLib music and intro effects without ROMs or SF2', async () => {
  const env = environment(null, false, 'yanakulov.github.io'), player = new MusicPlayer(() => {});
  try {
    await player.restore(); player.unlock(); player.setPaused(false);
    player.intro('westwood');
    for (let i = 0; i < 20 && !env.audio.adlibTracks.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(player.state.renderer, 'adlib');
    assert.equal(player.state.enabled, true);
    assert.equal(player.state.ready, true);
    assert.deepEqual([player.state.volume, player.state.sfxVolume, player.state.voiceVolume], [.5, .25, .6]);
    assert.deepEqual(env.audio.adlibTracks, [['INTRO', 2]]);
    player.wander(2); player.wander(5);
    for (let i = 0; i < 20 && env.audio.adlibTracks.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(env.audio.adlibTracks.at(-1), ['KYRA1B', 2]);
    assert.equal(env.audio.adlibTracks.length, 2, 'superseded cue never reaches the worklet');
    player.restoreRoom(8);
    for (let i = 0; i < 20 && env.audio.adlibTracks.length < 3; i++) await new Promise(resolve => setTimeout(resolve, 5));
    player.restoreRoom(10);
    for (let i = 0; i < 20 && env.audio.adlibTracks.length < 4; i++) await new Promise(resolve => setTimeout(resolve, 5));
    player.fade(); player.wander(2);
    for (let i = 0; i < 20 && env.audio.adlibTracks.length < 5; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(env.audio.adlibTracks.slice(2), [['KYRA1B', 4], ['KYRA1A', 3], ['KYRA1A', 3]]);
    assert.ok(env.audio.requests.every(url => !/\.ROM|\.sf2|\.xmi\./i.test(url)), 'AdLib only needs its own banks');
    player.intro('westwood'); player.setEnabled(false);
    player.effect(25);
    assert.equal(env.audio.clips.length, 1);
    assert.deepEqual(env.audio.workletEffects, []);
  } finally { player.dispose(); env.restore(); }
});

test('missing saved Roland ROMs fall back to AdLib without overriding a saved mute', async () => {
  const env = environment('0', false, 'yanakulov.github.io', false, 'mt32'), player = new MusicPlayer(() => {});
  try {
    await player.restore();
    assert.equal(player.state.renderer, 'adlib');
    player.unlock();
    assert.equal(player.state.enabled, false);
    assert.ok(env.audio.requests.every(url => !url.endsWith('.wasm')));
  } finally { player.dispose(); env.restore(); }
});

test('the real AdLib WASM plays the title, forest and Timbermist score changes', async () => {
  const synth = await loadAdlib(Uint8Array.from(readFileSync('public/assets/audio/adlib.wasm')).buffer, 48000);
  const left = new Float32Array(48000), right = new Float32Array(48000);
  function signal(file: string, track: number) {
    const bank = Uint8Array.from(gunzipSync(readFileSync(`public/assets/music/${file.toLowerCase()}.adl.gz`))).buffer;
    synth.play(bank, file, track);
    for (let i = 0; i < 4; i++) synth.render(left, right);
    return Math.sqrt(left.reduce((sum, sample) => sum + sample * sample, 0) / left.length);
  }
  const title = signal('INTRO', 2), forest = signal('KYRA1A', 3);
  assert.ok(title > .002 && forest > .002 && title !== forest);
  const timbermist = [2, 3, 4, 6, 7, 2].map(track => signal('KYRA2A', track));
  assert.ok(timbermist.every(rms => rms > .002), 'the forest, Darm, songbird and Malcolm cues all reach the synth');
  assert.equal(new Set(timbermist.slice(0, -1)).size, 5, 'each command changes the audible score');
  assert.equal(timbermist.at(-1), timbermist[0], 'returning to the forest restarts its theme');
  assert.equal(signal('KYRA1B', 0), 0, 'the stop command renders silence');
});
