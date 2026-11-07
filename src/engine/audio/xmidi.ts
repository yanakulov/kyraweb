// XMIDI timing/loop semantics follow ScummVM audio/midiparser_xmidi.cpp.
// SPDX-License-Identifier: GPL-3.0-or-later
export type MidiEvent = { delta: number; status: number; data: number[]; duration?: number };
export type MidiTrack = MidiEvent[];

/** Read bounded IFF chunks, not byte-pattern searches (SysEx can contain FourCCs). */
export function parseXmidi(bytes: Uint8Array): MidiTrack[] {
  if (bytes.length > 2_000_000) throw new Error('XMIDI file is too large');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (p: number) => String.fromCharCode(...bytes.subarray(p, p + 4));
  const tracks: MidiTrack[] = [];
  let declared: number | undefined;
  function chunks(start: number, end: number, depth = 0) {
    if (depth > 8) throw new Error('XMIDI nesting is too deep');
    for (let p = start; p < end;) {
      if (p + 8 > end) throw new Error('Truncated XMIDI chunk');
      const id = text(p), size = view.getUint32(p + 4), from = p + 8, to = from + size;
      if (to > end) throw new Error('Truncated XMIDI data');
      if (id === 'FORM' || id === 'CAT ') {
        if (size < 4 || !['XMID', 'XDIR'].includes(text(from))) throw new Error('Invalid XMIDI container');
        chunks(from + 4, to, depth + 1);
      } else if (id === 'INFO') {
        if (size < 2) throw new Error('Invalid XMIDI track count');
        declared = view.getUint16(from, true);
      } else if (id === 'EVNT') tracks.push(parseEvents(bytes.subarray(from, to)));
      else if (!['TIMB', 'RBRN'].includes(id)) throw new Error(`Unsupported XMIDI chunk ${id}`);
      p = to + (size & 1);
      if (p > end) throw new Error('Missing XMIDI padding');
    }
  }
  if (text(0) !== 'FORM') throw new Error('Not an XMIDI file');
  chunks(0, bytes.length);
  if (!tracks.length || tracks.length > 128 || declared !== undefined && declared !== tracks.length) throw new Error('Invalid XMIDI track count');
  return tracks;
}

function parseEvents(bytes: Uint8Array): MidiTrack {
  let p = 0, ended = false;
  const events: MidiTrack = [];
  const byte = () => { if (p >= bytes.length) throw new Error('Truncated XMIDI event'); return bytes[p++]; };
  const dataByte = () => { const b = byte(); if (b > 127) throw new Error('Invalid MIDI data'); return b; };
  const vlq = () => {
    let n = 0;
    for (let i = 0; i < 4; i++) { const b = byte(); n = n * 128 + (b & 127); if (!(b & 128)) return n; }
    throw new Error('Invalid XMIDI variable length');
  };
  while (p < bytes.length && !ended) {
    let delta = 0;
    while (p < bytes.length && bytes[p] < 128) delta += byte(); // additive delays, NOT MIDI VLQ
    const status = byte(), kind = status >> 4;
    let data: number[], duration: number | undefined;
    if (kind >= 8 && kind <= 14) {
      data = [dataByte()];
      if (kind !== 12 && kind !== 13) data.push(dataByte());
      if (kind === 9) duration = Math.max(1, vlq());
    } else if (status === 0xf0 || status === 0xff) {
      const type = status === 0xff ? byte() : undefined, length = vlq();
      if (p + length > bytes.length || length > 65536) throw new Error('Invalid XMIDI extended event');
      data = Array.from(bytes.subarray(p, p + length)); p += length;
      if (type !== undefined) { data.unshift(type); ended = type === 0x2f; }
      else if (data.at(-1) !== 0xf7) throw new Error('Unterminated MIDI SysEx');
    } else throw new Error(`Unsupported XMIDI status ${status}`);
    events.push({ delta, status, data, ...(duration === undefined ? {} : { duration }) });
  }
  if (!ended) throw new Error('Missing XMIDI end of track');
  return events;
}

/** A sample-clock sequencer; frame rendering, menus and timer throttling cannot skew notes. */
export class XmidiSequencer {
  private index = 0;
  private nextTick: number;
  private frame = 0;
  private loops: { index: number; remaining: number }[] = [];
  private notes = new Map<number, number>();
  private ended = false;
  constructor(private track: MidiTrack, private sampleRate: number, private send: (status: number, data: number[]) => void) {
    this.nextTick = track[0]?.delta ?? Infinity;
  }
  get done() { return this.ended && !this.notes.size; }
  stop() {
    for (const key of this.notes.keys()) this.send(0x80 | key >> 7, [key & 127, 0]);
    this.notes.clear(); this.ended = true; this.nextTick = Infinity;
  }
  /** Render exactly up to each event boundary; note durations are 120-Hz XMIDI ticks. */
  render(frames: number, render: (offset: number, count: number) => void) {
    const end = this.frame + frames;
    let offset = 0, budget = 10000;
    while (this.frame < end) {
      if (--budget < 0) { this.stop(); throw new Error('XMIDI loop makes no progress'); }
      let tick = this.nextTick;
      for (const off of this.notes.values()) tick = Math.min(tick, off);
      const target = Math.min(end, Math.max(this.frame, Math.ceil(tick * this.sampleRate / 120)));
      if (target > this.frame) { const count = target - this.frame; render(offset, count); offset += count; this.frame = target; }
      if (target === end) break;
      const now = this.frame * 120 / this.sampleRate + 1e-7;
      for (const [key, off] of this.notes) if (off <= now) { this.send(0x80 | key >> 7, [key & 127, 0]); this.notes.delete(key); }
      if (this.nextTick > now) continue;
      const event = this.track[this.index++], at = this.nextTick;
      const kind = event.status >> 4, [a, b] = event.data;
      if (event.status === 0xff) {
        // XMIDI tempo metadata is fixed at 500000 us / 60 ppqn, i.e. 120 ticks/sec.
        if (a === 0x2f) { this.ended = true; this.nextTick = Infinity; continue; }
      } else if (kind === 11 && a === 116) {
        if (this.loops.length >= 4) throw new Error('Too many XMIDI loops');
        this.loops.push({ index: this.index, remaining: b });
      } else if (kind === 11 && a === 117) {
        const loop = this.loops.at(-1);
        if (loop) {
          if (b < 64 || loop.remaining === 1) this.loops.pop();
          else { if (loop.remaining) loop.remaining--; this.index = loop.index; }
        }
      } else {
        if (kind === 9 && b) {
          const key = (event.status & 15) * 128 + a;
          if (this.notes.has(key)) this.send(0x80 | event.status & 15, [a, 0]);
          this.notes.set(key, at + (event.duration ?? 1));
        }
        this.send(event.status, event.data);
      }
      this.nextTick = this.track[this.index] ? at + this.track[this.index].delta : Infinity;
    }
  }
}
