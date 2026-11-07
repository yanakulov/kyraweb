// Bundle with esbuild --platform=node --format=esm before running.
// Usage: node render_sfx.mjs <CM-32L control ROM> <CM-32L PCM ROM> <ffmpeg>
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { loadMt32, Mt32Synth } from '../src/engine/audio/mt32';
import { MidiPlayback } from '../src/engine/audio/midiPlayback';
import { parseXmidi, XmidiSequencer, type MidiTrack } from '../src/engine/audio/xmidi';

const [controlPath, pcmPath, ffmpeg] = process.argv.slice(2);
const readBank = (name: string) => parseXmidi(gunzipSync(readFileSync(`public/assets/music/${name}.xmi.gz`)));
const intro = readBank('intro'), rooms = readBank('kyra1b');
const control = readFileSync(controlPath), pcm = readFileSync(pcmPath);
const rate = 24_000, left = new Float32Array(128), right = new Float32Array(128);
const module = await loadMt32(Uint8Array.from(readFileSync('public/assets/audio/mt32emu.wasm')).buffer);
const cues: Record<string, [start: number, duration: number]> = {};
const buffers: Buffer[] = [Buffer.alloc(rate / 5 * 2)];
let start = rate / 5;

function record(track: MidiTrack) {
  const synth = new Mt32Synth(module, control, pcm, rate);
  try {
    const init = new XmidiSequencer(intro[0], rate, synth.miles.loadPatchEvent);
    synth.miles.init();
    while (!init.done) init.render(left.length, (offset, count) => synth.render(left, right, offset, count));
    const playback = new MidiPlayback(synth, rate);
    const ticks = track.reduce((sum, event) => sum + event.delta, 0);
    const frames = Math.ceil((ticks / 120 + 1) * rate / left.length) * left.length;
    const wave = Buffer.alloc(frames * 2);
    let lastSignal = 0;
    playback.effect(track);
    for (let i = 0; i < frames; i += left.length) {
      playback.render(left, right);
      for (let j = 0; j < left.length; j++) {
        const sample = Math.round(Math.max(-1, Math.min(1, (left[j] + right[j]) / 2)) * 32767);
        wave.writeInt16LE(sample, (i + j) * 2);
        if (Math.abs(sample) > 18) lastSignal = i + j;
      }
    }
    return lastSignal ? wave.subarray(0, Math.min(frames, lastSignal + 600) * 2) : undefined;
  } finally { synth.dispose(); }
}

const seen = new Map<string, [number, number]>();
for (const [bank, tracks] of [['intro', intro], ['rooms', rooms]] as const) {
  for (const [id, track] of tracks.entries()) {
    if (id < 22 || !track.some(event => event.status >> 4 === 9) || bank === 'rooms' && id === 92) continue;
    const key = JSON.stringify(track);
    const existing = seen.get(key);
    if (existing) { cues[`${bank}:${id}`] = existing; continue; }
    const wave = record(track);
    if (!wave) continue;
    const cue: [number, number] = [start / rate, wave.length / 2 / rate];
    seen.set(key, cue); cues[`${bank}:${id}`] = cue;
    const padding = Buffer.alloc(2400 * 2);
    buffers.push(wave, padding);
    start += (wave.length + padding.length) / 2;
  }
}
const encoded = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-q:a', '7', '-y', 'public/assets/audio/effects.mp3'], { input: Buffer.concat(buffers), stdio: ['pipe', 'inherit', 'inherit'] });
if (encoded.error || encoded.status !== 0) throw encoded.error ?? new Error('ffmpeg could not encode the effects');
writeFileSync('src/engine/audio/effects.json', JSON.stringify(cues, null, 0) + '\n');
