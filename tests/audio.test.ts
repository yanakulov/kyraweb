import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parseXmidi, XmidiSequencer, type MidiTrack } from '../src/engine/audio/xmidi';
import { MilesMt32, rolandWrite } from '../src/engine/audio/miles';
import { introCue, wanderCue } from '../src/engine/audio/cues';
import { readRomFiles } from '../src/engine/audio/romStorage';
import { loadMt32, Mt32Synth } from '../src/engine/audio/mt32';
import manifest from '../public/assets/music/manifest.json';
import opening from '../public/assets/packs/opening.json';
import world from '../public/assets/world/world.json';

function container(data: number[]) {
  const bytes = Buffer.alloc(20 + data.length + (data.length & 1));
  bytes.write('FORM'); bytes.writeUInt32BE(bytes.length - 8, 4); bytes.write('XMIDEVNT', 8); bytes.writeUInt32BE(data.length, 16); bytes.set(data, 20);
  return new Uint8Array(bytes);
}
test('XMIDI uses additive delays, VLQ note lengths and forced 120 Hz tempo', () => {
  const [track] = parseXmidi(container([127, 3, 0x91, 60, 100, 0x81, 0x00, 0xff, 0x51, 3, 1, 2, 3, 0xff, 0x2f, 0]));
  assert.equal(track[0].delta, 130); assert.equal(track[0].duration, 128);
  const sent: { frame: number; status: number; data: number[] }[] = [];
  let frame = 0;
  const seq = new XmidiSequencer(track, 48000, (status, data) => sent.push({ frame, status, data }));
  for (; frame < 104000; frame++) seq.render(1, () => {});
  assert.equal(sent[0].frame, 52000); assert.equal(sent[1].frame, 103200); assert.equal(seq.done, true);
});
test('XMIDI zero-length notes, loops, stop and note release cannot hang', () => {
  const track: MidiTrack = [
    { delta: 0, status: 0xb1, data: [116, 2] },
    { delta: 1, status: 0x91, data: [60, 100], duration: 1 },
    { delta: 2, status: 0xb1, data: [117, 127] },
    { delta: 0, status: 0xff, data: [47] }
  ];
  const sent: number[] = [], seq = new XmidiSequencer(track, 48000, status => sent.push(status));
  seq.render(4000, () => {});
  assert.deepEqual(sent, [0x91, 0x81, 0x91, 0x81]); assert.equal(seq.done, true);
  const forever = new XmidiSequencer([{ delta: 0, status: 0xb1, data: [116, 0] }, { delta: 0, status: 0xb1, data: [117, 127] }], 48000, () => {});
  assert.throws(() => forever.render(128, () => {}), /no progress/);
  const [zero] = parseXmidi(container([0x91, 60, 100, 0, 0xff, 47, 0]));
  assert.equal(zero[0].duration, 1);
  const released: number[] = [], active = new XmidiSequencer(zero, 48000, status => released.push(status));
  active.render(1, () => {}); active.stop(); active.stop(); assert.deepEqual(released, [0x91, 0x81]);
});
test('XMIDI rejects truncation, invalid sizes, malformed VLQ and missing EOT', () => {
  for (const bytes of [new Uint8Array(), container([0x91, 60]), container([0x91, 60, 100, 128, 128, 128, 128]), container([0x91, 60, 100, 1]), container([0xf0, 2, 0x41])]) assert.throws(() => parseXmidi(bytes));
  const valid = container([0xff, 47, 0]);
  assert.throws(() => parseXmidi(valid.subarray(0, -1)));
});
test('all ten GOG music resources round-trip their source hashes and parse every track', () => {
  let tracks = 0, sysex = 0;
  for (const file of Object.values(manifest.files)) {
    const bytes = new Uint8Array(gunzipSync(readFileSync(`public/assets/music/${file.src}`)));
    assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    for (const track of parseXmidi(bytes)) {
      tracks++; sysex += track.filter(e => e.status === 0xf0).length;
      const seq = new XmidiSequencer(track, 48000, () => {});
      for (let i = 0; i < 120 && !seq.done; i++) seq.render(4000, () => {});
      seq.stop(); assert.equal(seq.done, true);
    }
  }
  assert.equal(tracks, 1120); assert.ok(sysex > 100);
});
test('Miles builds Roland checksums, translates SysEx controllers and resets pitch bend', () => {
  const short: number[] = [], sysex: number[][] = [];
  const miles = new MilesMt32(msg => short.push(msg), bytes => sysex.push(bytes));
  miles.init(); assert.equal(sysex.length, 3); assert.equal(short.filter(n => (n & 0xf0) === 0xe0).length, 16);
  [5, 0, 8, 2, 3].forEach((value, i) => miles.send(0xb1, [32 + i, value]));
  assert.deepEqual(sysex.at(-1), rolandWrite((5 << 14) + 8, [2, 3]));
  miles.send(0xb1, [36, 4]); assert.deepEqual(sysex.at(-1), rolandWrite((5 << 14) + 9, [4]));
  miles.send(0xc1, [7]); miles.send(0xb1, [60, 12]);
  assert.deepEqual(sysex.at(-1), rolandWrite((5 << 14) + 7 * 8 + 4, [12]));
  const count = short.length; miles.send(0xb1, [110, 127]); miles.send(0xb1, [123, 0]); assert.equal(short.length, count);
  for (const bytes of sysex) assert.equal(bytes.slice(5, -1).reduce((sum, b) => sum + b, 0) % 128, 0);
});
test('music cues retain DOS mappings and original opening/room commands', () => {
  assert.deepEqual(introCue('westwood'), { file: 'INTRO', track: 2 });
  assert.equal(introCue('akulaflow'), undefined); assert.equal(introCue('tree_anim_2'), undefined);
  assert.deepEqual(wanderCue(2), { file: 'KYRA1A', track: 3 });
  assert.deepEqual(wanderCue(41), { file: 'KYRA5A', track: 5 }); assert.equal(wanderCue(1), null);
  assert.throws(() => wanderCue(999));
  // The first lift's flag 52 suppresses GEM's usual forest cue during this opening.
  assert.deepEqual(opening.opening.filter(a => a.op === 'music').map(a => a.command), [1, 41]);
  assert.deepEqual(world.rooms.find(r => r.id === 1)?.entryMusic, [{ op: 'music', command: 2, restart: false }]);
});
test('ROM imports require a bounded pair without relying on filenames', async () => {
  await assert.rejects(readRomFiles([]), /Choose/);
  await assert.rejects(readRomFiles([new File(['bad'], 'MT32_CONTROL.ROM'), new File(['bad'], 'MT32_PCM.ROM')]), /Choose/);
  const pair = await readRomFiles([new File([new Uint8Array(524288)], 'pcm.bin'), new File([new Uint8Array(65536)], 'control.bin')]);
  assert.equal(pair.control.byteLength, 65536); assert.equal(pair.pcm.byteLength, 524288);
});
test('real Munt WASM starts and rejects fabricated ROMs, rather than substituting fake sound', async () => {
  const bytes = readFileSync('public/assets/audio/mt32emu.wasm');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '4cdf73e6bd83a8f4c4e046dbc58903a395acf9dc036217c4f2d370944bb91f10');
  const module = await loadMt32(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  for (let i = 0; i < 3; i++) assert.throws(() => new Mt32Synth(module, new Uint8Array(65536), new Uint8Array(524288), 48000), /recognized matching pair/);
});
