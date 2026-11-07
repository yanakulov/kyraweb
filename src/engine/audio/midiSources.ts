// Miles channel locking follows ScummVM audio/miles_midi.cpp.
// SPDX-License-Identifier: GPL-3.0-or-later
import type { MilesMt32 } from './miles';

type Controls = { program: number; volume: number; pan: number; expression: number; modulation: number; sustain: number; pitch: number };
type Owner = { source: number; logical: number };
type Lock = Owner & { restore: Owner };
const programs = [0, 0, 1, 2, 4, 3, 5, 6, 7, 0, 0, 0, 0, 0, 0, 0];
const defaults = (channel: number, source: number): Controls => ({ program: programs[channel], volume: source ? 127 : 100, pan: [64, 64, 0, 127, 64, 0, 127, 0, 127][channel] ?? 64, expression: 127, modulation: 0, sustain: 0, pitch: 8192 });

/** One music source and three effect sources share the real MT-32's eight parts.
 * SFX use XMIDI channels 10..12: CC110 must map these onto physical parts 1..8.
 * Ignoring this controller makes effects completely silent on a real MT-32.
 */
export class MidiSources {
  private controls = Array.from({ length: 4 }, (_, source) => Array.from({ length: 16 }, (_, channel) => defaults(channel, source)));
  private maps = Array.from({ length: 4 }, () => Array.from({ length: 16 }, (_, channel) => channel));
  private owners: Owner[] = Array.from({ length: 16 }, (_, logical) => ({ source: 0, logical }));
  private locks: (Lock | undefined)[] = Array(16);
  private protectedBy: (number | undefined)[] = Array(16);
  private notes = Array.from({ length: 16 }, () => new Map<number, Owner>());
  private volumes = [1, 1, 1, 1];
  private active = [true, false, false, false];
  constructor(private driver: Pick<MilesMt32, 'send'>) {}
  begin(source: number) {
    this.release(source); this.active[source] = true;
    if (source) this.controls[source] = Array.from({ length: 16 }, (_, channel) => defaults(channel, source));
    else {
      for (const control of this.controls[0]) control.pitch = 8192;
      for (let channel = 1; channel <= 9; channel++) if (!this.locks[channel] && this.owners[channel].source === 0) this.driver.send(0xe0 | channel, [0, 64]);
    }
  }
  setVolume(source: number, value: number) {
    const volume = Math.round(Math.max(0, Math.min(1, value)) * 127) / 127;
    if (this.volumes[source] === volume) return;
    this.volumes[source] = volume;
    for (let channel = 1; channel <= 9; channel++) {
      const owner = this.owners[channel];
      if (owner.source === source) this.volume(channel, owner);
    }
  }
  private volume(channel: number, owner: Owner) {
    this.driver.send(0xb0 | channel, [7, Math.round(this.controls[owner.source][owner.logical].volume * this.volumes[owner.source])]);
  }
  private restore(channel: number, owner: Owner) {
    const state = this.controls[owner.source][owner.logical];
    this.owners[channel] = { ...owner };
    this.driver.send(0xc0 | channel, [state.program]);
    for (const [controller, value] of [[1, state.modulation], [10, state.pan], [11, state.expression], [64, state.sustain]]) this.driver.send(0xb0 | channel, [controller, value]);
    this.driver.send(0xe0 | channel, [state.pitch & 127, state.pitch >> 7]);
    this.volume(channel, owner);
  }
  private clear(channel: number) {
    this.driver.send(0xb0 | channel, [64, 0]);
    for (const note of this.notes[channel].keys()) this.driver.send(0x80 | channel, [note, 0]);
    this.notes[channel].clear();
  }
  private lock(source: number, logical: number) {
    const existing = this.locks[this.maps[source][logical]];
    if (existing?.source === source && existing.logical === logical) return;
    let selected = -1;
    for (const allowProtected of [false, true]) {
      let fewest = Infinity;
      for (let channel = 8; channel >= 1; channel--) {
        if (this.locks[channel] || !allowProtected && this.protectedBy[channel] !== undefined) continue;
        if (this.notes[channel].size < fewest) { selected = channel; fewest = this.notes[channel].size; }
      }
      if (selected !== -1) break;
    }
    if (selected === -1) return;
    const previous = { ...this.owners[selected] };
    this.controls[source][logical] = { ...this.controls[previous.source][previous.logical], volume: 127, sustain: 0, pitch: 8192 };
    this.locks[selected] = { source, logical, restore: previous };
    this.clear(selected); this.maps[source][logical] = selected;
    this.restore(selected, { source, logical });
  }
  private unlock(channel: number) {
    const lock = this.locks[channel];
    if (!lock) return;
    this.clear(channel); this.maps[lock.source][lock.logical] = lock.logical;
    this.locks[channel] = undefined;
    this.restore(channel, this.active[lock.restore.source] ? lock.restore : { source: 0, logical: channel });
  }
  release(source: number) {
    this.active[source] = false;
    for (let channel = 0; channel < 16; channel++) {
      if (this.protectedBy[channel] === source) this.protectedBy[channel] = undefined;
      if (this.locks[channel]?.source === source) this.unlock(channel);
      else if (this.owners[channel].source === source && !this.locks[channel]) {
        this.clear(channel);
        if (source) this.restore(channel, { source: 0, logical: channel });
      }
    }
  }
  send(source: number, status: number, data: number[]) {
    if (status === 0xf0) { this.driver.send(status, data); return; }
    const logical = status & 15, kind = status >> 4, [a, b] = data;
    let channel = this.maps[source][logical];
    if (kind === 11 && a === 110) { if (b >= 64) this.lock(source, logical); else if (this.locks[channel]?.source === source) this.unlock(channel); return; }
    if (kind === 11 && a === 111) { if (!this.locks[channel]) this.protectedBy[channel] = b >= 64 ? source : undefined; return; }
    const state = this.controls[source][logical];
    if (kind === 12) state.program = a;
    if (kind === 14) state.pitch = a | b << 7;
    if (kind === 11) {
      if (a === 7) state.volume = b;
      if (a === 1) state.modulation = b;
      if (a === 10) state.pan = b;
      if (a === 11) state.expression = b;
      if (a === 64) state.sustain = b;
    }
    if (this.locks[channel] && (this.locks[channel]!.source !== source || this.locks[channel]!.logical !== logical)) return;
    if (kind === 8 || kind === 9 && !b) {
      const owner = this.notes[channel].get(a);
      if (owner?.source !== source || owner.logical !== logical) return;
      this.notes[channel].delete(a);
    } else {
      const owner = this.owners[channel];
      if (owner.source !== source || owner.logical !== logical) this.restore(channel, { source, logical });
      if (kind === 9) this.notes[channel].set(a, { source, logical });
    }
    if (kind === 11 && a === 7) this.volume(channel, { source, logical });
    else this.driver.send((status & 0xf0) | channel, data);
  }
}
