import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { MidiSources } from '../src/engine/audio/midiSources';
import { MidiPlayback } from '../src/engine/audio/midiPlayback';
import { IntroEffects } from '../src/engine/intro/effects';
import { buildIntroSteps } from '../src/engine/intro/steps';
import { buildSceneAnimStates, updateSceneAnims } from '../src/engine/scene/sceneAnims';
import { buildDropPath, updateDrops } from '../src/engine/gameplay/drops';
import { traceForest, createForestState, type ForestData } from '../src/engine/gameplay/forest';
import { RoomScript, type RoomAction } from '../src/engine/gameplay/roomScript';
import type { DropAnim, SceneItem } from '../src/engine/core/types';
import type { MidiTrack } from '../src/engine/audio/xmidi';
import opening from '../public/assets/packs/opening.json';
import recordedCues from '../src/engine/audio/effects.json';

const effect: MidiTrack = [
  { delta: 0, status: 0xba, data: [110, 127] },
  { delta: 0, status: 0xca, data: [56] },
  { delta: 1, status: 0x9a, data: [60, 110], duration: 2 },
  { delta: 3, status: 0xff, data: [47] }
];
test('Miles locks unused XMIDI effect channels onto MT-32 parts and restores music state', () => {
  const sent: { status: number; data: number[] }[] = [];
  const sources = new MidiSources({ send: (status, data) => sent.push({ status, data: [...data] }) });
  sources.begin(0); sources.send(0, 0xc8, [42]); sources.send(0, 0x98, [64, 100]);
  for (let channel = 1; channel < 8; channel++) sources.send(0, 0xb0 | channel, [111, 127]);
  sources.begin(1); sources.send(1, 0xba, [110, 127]); sources.send(1, 0xca, [56]); sources.send(1, 0x9a, [60, 100]);
  assert.ok(sent.some(e => e.status === 0x98 && e.data[0] === 60));
  assert.ok(!sent.some(e => e.status === 0x9a));
  const at = sent.length;
  sources.send(0, 0xc8, [43]); sources.send(0, 0x88, [64, 0]);
  assert.equal(sent.length, at, 'updates to a borrowed music part must not reach the SFX part');
  sources.release(1);
  assert.ok(sent.slice(at).some(e => e.status === 0xc8 && e.data[0] === 43));
  sources.send(0, 0x98, [67, 100]); assert.equal(sent.at(-1)?.status, 0x98);
});
test('Miles honors channel protection and gives simultaneous effects different physical parts', () => {
  const sent: { status: number; data: number[] }[] = [];
  const sources = new MidiSources({ send: (status, data) => sent.push({ status, data }) });
  sources.begin(0); sources.send(0, 0xb8, [111, 127]);
  for (const source of [1, 2, 3]) { sources.begin(source); sources.send(source, 0xba, [110, 127]); sources.send(source, 0x9a, [60 + source, 100]); }
  assert.deepEqual(sent.filter(e => e.status >> 4 === 9).map(e => e.status & 15), [7, 6, 5]);
  sources.release(2);
  assert.ok(!sent.some(e => e.status === 0x87 && e.data[0] === 61), 'releasing one source must not stop a different effect');
});
test('four XMIDI clocks merge in sample order and render each output sample only once', () => {
  let frame = 0;
  const sent: { frame: number; status: number; data: number[] }[] = [];
  const synth = { miles: { send: (status: number, data: number[]) => sent.push({ frame, status, data }) }, render(_left: Float32Array, _right: Float32Array, _offset: number, count: number) { frame += count; } };
  const playback = new MidiPlayback(synth as ConstructorParameters<typeof MidiPlayback>[0], 1200);
  playback.music([{ delta: 2, status: 0x91, data: [70, 100], duration: 2 }, { delta: 5, status: 0xff, data: [47] }]);
  assert.equal(playback.effect(effect), true); assert.equal(playback.effect(effect), true); assert.equal(playback.effect(effect), true); assert.equal(playback.effect(effect), false);
  playback.render(new Float32Array(128), new Float32Array(128));
  assert.equal(frame, 128);
  assert.deepEqual(sent.filter(e => e.status >> 4 === 9).map(e => [e.frame, e.data[0]]), [[10, 60], [10, 60], [10, 60], [20, 70]]);
  assert.equal(playback.effect(effect), true, 'completed effects release a slot');
});
test('music fading and mute do not mute or cancel a live effect', () => {
  const sent: { status: number; data: number[] }[] = [];
  const playback = new MidiPlayback({ miles: { send: (status: number, data: number[]) => sent.push({ status, data }) }, render() {} } as unknown as ConstructorParameters<typeof MidiPlayback>[0], 1200);
  playback.volumes(1, .5);
  playback.music([{ delta: 0, status: 0x91, data: [70, 100], duration: 1000 }, { delta: 1000, status: 0xff, data: [47] }]);
  playback.effect(effect.map(event => event.duration ? { ...event, duration: 1000 } : event));
  playback.render(new Float32Array(128), new Float32Array(128)); playback.fade();
  for (let i = 0; i < 12; i++) playback.render(new Float32Array(128), new Float32Array(128));
  assert.ok(!sent.some(e => e.status === 0x88 && e.data[0] === 60));
  assert.ok(sent.filter(e => e.status === 0xb8 && e.data[0] === 7).every(e => e.data[1] > 0));
  playback.volumes(0, .5); playback.stopEffects();
  assert.ok(sent.some(e => e.status === 0x88 && e.data[0] === 60));
});
test('DAT sound operands advance with or without audio and random effects honor their percentage', () => {
  const make = () => buildSceneAnimStates([{ sprite: 0, defaultX: 0, defaultY: 0, flipX: false, play: true, disable: false, drawY: 0, script: [0xffb0, 74, 0xffb4, 53, 30, 0xff90, 4, 0xff87] }]);
  const sounds: number[] = [], anim = make();
  for (let i = 0; i < 5; i++) updateSceneAnims(anim, i * 17, undefined, n => sounds.push(n), () => .99);
  assert.deepEqual(sounds, [74]); assert.equal(anim[0].sprite, 4);
  const silent = make(); for (let i = 0; i < 5; i++) updateSceneAnims(silent, i * 17); assert.equal(silent[0].sprite, 4);
});
test('drop bounce and landing effects are emitted once at every display refresh rate', () => {
  for (const hz of [30, 60, 144]) {
    const sounds: number[] = [], items: SceneItem[] = [];
    const drops: DropAnim[] = [{ id: 'ruby', x: 80, y: 40, destX: 90, destY: 120, path: buildDropPath({ x: 80, y: 40 }, { x: 90, y: 120 }), elapsedMs: 0 }];
    for (let i = 0; i < hz * 2; i++) updateDrops(drops, items, 1000 / hz, n => sounds.push(n));
    assert.deepEqual(sounds, [71, 50]);
  }
});
test('intro effects are single-shot, paused by their clock, muted in the menu and not burst after a seek', () => {
  const clock = new IntroEffects(), sent: number[] = [], cues = [{ atMs: 10, track: 29 }, { atMs: 100, track: 30 }, { atMs: 1000, track: 31 }];
  clock.update('writing', cues, 20, false, n => sent.push(n)); clock.update('writing', cues, 20, false, n => sent.push(n));
  clock.update('writing', cues, 110, false, n => sent.push(n)); clock.update('writing', cues, 5000, false, n => sent.push(n));
  assert.deepEqual(sent, [29, 30]);
  clock.update('menu', cues, 20, true, n => sent.push(n)); assert.deepEqual(sent, [29, 30]);
  const writing = buildIntroSteps().find(step => step.id === 'kallak_writing')!;
  assert.equal(writing.effects?.[0].track, 29); assert.ok(writing.effects!.length > 20);
  const shore = buildIntroSteps().find(step => step.id === 'shore_destruct')!;
  assert.deepEqual(shore.effects?.map(cue => cue.track), [22, 37, 23, 37, 24, 37]);
  assert.ok(buildIntroSteps().find(step => step.id === 'tree_anim_1')!.effects?.some(cue => cue.track === 25));
});
test('opening, tree and forest EMC retain real SFX instructions in the script clock', () => {
  assert.deepEqual(opening.opening.filter(a => a.op === 'sfx').map(a => a.track), [72, 62, 63, 64]);
  assert.ok(opening.tree.some(a => a.op === 'sfx' && a.track === 105));
  const forest = JSON.parse(gunzipSync(readFileSync('public/assets/forest/forest.json.gz')).toString()) as ForestData;
  const snapshot = { pos: { x: 160, y: 110 }, inventorySlots: [], itemInHand: null, sceneItems: [], overlays: [], treeSpoken: false };
  assert.ok(traceForest(forest.rooms.BROKEN, 0, createForestState(), snapshot).actions.some(a => a.op === 'sfx' && a.track === 74));
  for (const id of [11, 12, 13, 14]) {
    const [start, duration] = (recordedCues as Record<string, number[]>)[`finale:${id}`];
    assert.ok(start > 0 && duration > 0);
  }
  const sent: number[] = [];
  const sequence = new RoomScript([{ op: 'wait', ms: 100 }, { op: 'sfx', track: 53 }], { apply: a => { if (a.op === 'sfx') sent.push(a.track); }, walking: () => false, frames: () => 0 });
  sequence.update(99); assert.equal(sent.length, 0); sequence.update(1); assert.deepEqual(sent, [53]); sequence.stop(); sequence.update(100); assert.deepEqual(sent, [53]);
});
