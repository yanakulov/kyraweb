// Kyrandia's Miles MT-32 controllers, based on ScummVM audio/miles_midi.cpp.
// SPDX-License-Identifier: GPL-3.0-or-later
export function rolandWrite(address: number, data: number[]) {
  const body = [address >> 14 & 127, address >> 7 & 127, address & 127, ...data];
  return [0xf0, 0x41, 0x10, 0x16, 0x12, ...body, (128 - body.reduce((sum, b) => sum + b, 0) % 128) & 127, 0xf7];
}

export class MilesMt32 {
  private programs = [0, 0, 1, 2, 4, 3, 5, 6, 7, 0, 0, 0, 0, 0, 0, 0];
  private queues = Array.from({ length: 3 }, () => ({ address: 0, data: [] as number[] }));
  constructor(private short: (message: number) => void, private sysex: (bytes: number[]) => void) {}
  init() {
    this.sysex(rolandWrite((0x10 << 14) + 0x0d, [1, 2, 3, 4, 5, 6, 7, 8, 9]));
    this.sysex(rolandWrite((0x10 << 14) + 4, [3, 4, 3, 4, 3, 4, 3, 4, 4]));
    this.sysex(rolandWrite((0x10 << 14) + 1, [0, 3, 2]));
    this.resetControllers();
  }
  resetControllers() {
    for (let channel = 0; channel < 16; channel++) {
      this.short(0xb0 | channel | 64 << 8); // release sustain before all notes off
      this.short(0xb0 | channel | 123 << 8);
      this.short(0xe0 | channel | 64 << 16); // Kyra tracks do not all reset pitch bend
    }
  }
  loadPatchEvent = (status: number, data: number[]) => {
    // INTRO 0 ends with test notes. Keep its patch writes and timing without arming the reverb tail.
    if (status >> 4 !== 8 && status >> 4 !== 9) this.send(status, data);
  };
  send = (status: number, data: number[]) => {
    const kind = status >> 4, channel = status & 15, [a, b] = data;
    if (status === 0xf0) { this.sysex([status, ...data]); return; }
    if (kind === 12) this.programs[channel] = a;
    if (kind === 11) {
      if (a >= 32 && a <= 46) {
        const command = (a - 32) % 5, q = this.queues[Math.floor((a - 32) / 5)];
        if (command < 3) {
          const shift = (2 - command) * 7;
          q.address = q.address & ~(127 << shift) | b << shift;
        } else {
          q.data.push(b);
          if (command === 4 || q.data.length === 32) {
            this.sysex(rolandWrite(q.address, q.data));
            // Final-data advances by dataPos, excluding its own final byte.
            q.address += q.data.length - (command === 4 ? 1 : 0); q.data = [];
          }
        }
        return;
      }
      if (a === 59 || a === 60) {
        this.sysex(rolandWrite((5 << 14) + this.programs[channel] * 8 + (a === 59 ? 6 : 4), [b]));
        this.short(0xc0 | channel | this.programs[channel] << 8); return;
      }
      if (a >= 61 && a <= 63) { this.sysex(rolandWrite((0x10 << 14) + a - 60, [b])); return; }
      // No external SAMPLE.MT bank is used by Kyra 1; INTRO track 0 installs its patches.
      if (a === 58 || a >= 110 && a <= 120 || a === 123) return;
    }
    this.short(status | (a ?? 0) << 8 | (b ?? 0) << 16);
  };
}
