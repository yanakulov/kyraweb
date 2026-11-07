import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { soundFontData, validateSoundFont, MAX_SOUNDFONT_BYTES } from '../src/engine/audio/soundfonts';
import { loadTsf, SoundFontSynth } from '../src/engine/audio/soundfontSynth';
import { MT32_TO_GM } from '../src/engine/audio/gmMapping';
const array = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
test('SF2 validation rejects invalid, truncated and incorrectly sized banks', () => {
  const valid = array(readFileSync('tests/fixtures/tiny.sf2')); validateSoundFont(valid);
  assert.throws(() => validateSoundFont(new ArrayBuffer(64)), /valid SF2/);
  assert.throws(() => validateSoundFont(valid.slice(0, -1)), /valid SF2/);
  const corrupt = valid.slice(0); new DataView(corrupt).setUint32(16, 0x7fffffff, true);
  assert.throws(() => validateSoundFont(corrupt), /Truncated/);
  assert.equal(MAX_SOUNDFONT_BYTES, 64 * 1024 * 1024);
});
test('MT-32 to GM approximation has 128 bounded program mappings', () => {
  assert.equal(MT32_TO_GM.length, 128); assert.ok(MT32_TO_GM.every(n => Number.isInteger(n) && n >= 0 && n < 128));
  assert.equal(MT32_TO_GM[64], 32); assert.equal(MT32_TO_GM[56], 43);
});
test('bundled SoundFont retries a bad range and reassembles the exact download', async t => {
  const chunk = 2 * 1024 * 1024, source = new Uint8Array(chunk * 2 + 37);
  source.set([1, 2, 3], 0); source.set([4, 5, 6], chunk); source.set([7, 8, 9], chunk * 2);
  let secondRangeRequests = 0;
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    const [, first, last] = /^bytes=(\d+)-(\d+)$/.exec(new Headers(options.headers).get('Range') ?? '')!;
    const start = Number(first), end = Number(last);
    const bytes = source.slice(start, end + 1);
    const truncated = start === chunk && ++secondRangeRequests === 1;
    return new Response(truncated ? bytes.slice(0, -1) : bytes, {
      status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${source.length}` }
    });
  });
  const progress: number[] = [];
  const data = await soundFontData({ id: 'test', name: 'test', src: '/bank.sf2', downloadBytes: source.length }, value => progress.push(value));
  assert.deepEqual(new Uint8Array(data), source);
  assert.equal(secondRangeRequests, 2);
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 100);
});
test('real TinySoundFont WASM renders finite, nonzero PCM from the synthetic fixture', async () => {
  const module = await loadTsf(array(readFileSync('public/assets/audio/tsf.wasm')));
  assert.throws(() => new SoundFontSynth(module, new ArrayBuffer(32), 48000), /valid SF2/);
  const synth = new SoundFontSynth(module, array(readFileSync('tests/fixtures/tiny.sf2')), 48000);
  try {
    synth.miles.send(0xc1, [0]); synth.miles.send(0x91, [60, 100]);
    const left = new Float32Array(128), right = new Float32Array(128); let energy = 0;
    for (let frame = 0; frame < 12000; frame += 128) {
      synth.render(left, right, 0, 128);
      for (const sample of left) { assert.ok(Number.isFinite(sample)); energy += sample * sample; }
    }
    assert.ok(energy > .001, 'real SF2 sample playback must not be silent');
    synth.miles.send(0x81, [60, 0]); synth.miles.send(0xf0, [0x41, 0x10, 0x16]);
  } finally { synth.dispose(); }
});
