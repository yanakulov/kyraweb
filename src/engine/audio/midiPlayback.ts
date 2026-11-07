import { XmidiSequencer, type MidiTrack } from './xmidi';
import { MidiSources } from './midiSources';
export type MidiSynth = { miles: { send: (status: number, data: number[]) => void }; render: (left: Float32Array, right: Float32Array, offset: number, frames: number) => void };

type Event = { offset: number; source: number; status: number; data: number[]; release?: boolean };
/** Merge four sample-clock sequencers BEFORE rendering; never render the synth
 * four times or let one source's note-off/pitch/program cancel another's notes. */
export class MidiPlayback {
  readonly sources: MidiSources;
  private sequences: (XmidiSequencer | undefined)[] = Array(4);
  private events: Event[] | undefined;
  private offset = 0;
  private fadeFrames = -1;
  private musicVolume = 1;
  constructor(private synth: MidiSynth, private rate: number) { this.sources = new MidiSources(synth.miles); }
  private send(source: number, status: number, data: number[]) {
    if (this.events) this.events.push({ offset: this.offset, source, status, data });
    else this.sources.send(source, status, data);
  }
  private stopSource(source: number) { this.sequences[source]?.stop(); this.sequences[source] = undefined; this.sources.release(source); }
  music(track?: MidiTrack) {
    this.stopSource(0); this.fadeFrames = -1;
    this.sources.setVolume(0, this.musicVolume);
    if (track) { this.sources.begin(0); this.sequences[0] = new XmidiSequencer(track, this.rate, (status, data) => this.send(0, status, data)); }
  }
  effect(track: MidiTrack) {
    const source = [1, 2, 3].find(index => !this.sequences[index]);
    if (source === undefined) return false; // Original engine discards a fourth simultaneous effect.
    this.sources.begin(source);
    this.sequences[source] = new XmidiSequencer(track, this.rate, (status, data) => this.send(source, status, data));
    return true;
  }
  stopEffects() { for (let source = 1; source <= 3; source++) this.stopSource(source); }
  stop() { this.stopEffects(); this.music(); }
  volumes(music: number, effects: number) {
    this.musicVolume = music;
    this.sources.setVolume(0, music * (this.fadeFrames < 0 ? 1 : this.fadeFrames / this.rate));
    for (let source = 1; source <= 3; source++) this.sources.setVolume(source, effects);
  }
  fade() { this.fadeFrames = this.rate; }
  render(left: Float32Array, right: Float32Array) {
    const frames = left.length, events: Event[] = [];
    this.events = events;
    try {
      for (let source = 0; source <= 3; source++) {
        const sequence = this.sequences[source];
        if (!sequence) continue;
        this.offset = 0;
        sequence.render(frames, (offset, count) => { this.offset = offset + count; });
        if (sequence.done) { events.push({ offset: frames, source, status: 0, data: [], release: true }); this.sequences[source] = undefined; }
      }
    } finally { this.events = undefined; }
    events.sort((a, b) => a.offset - b.offset);
    let cursor = 0;
    for (const event of events) {
      if (event.offset > cursor) { this.synth.render(left, right, cursor, event.offset - cursor); cursor = event.offset; }
      if (event.release) this.sources.release(event.source);
      else this.sources.send(event.source, event.status, event.data);
    }
    if (cursor < frames) this.synth.render(left, right, cursor, frames - cursor);
    if (this.fadeFrames >= 0) {
      this.fadeFrames = Math.max(0, this.fadeFrames - frames);
      this.sources.setVolume(0, this.musicVolume * this.fadeFrames / this.rate);
      if (!this.fadeFrames) this.music();
    }
  }
}
