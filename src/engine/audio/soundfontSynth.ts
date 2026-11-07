// @ts-expect-error Pinned Emscripten loader; corresponding source ships with the emulator archive.
import factory from '../../../public/assets/audio/tsf.js';
import { MT32_TO_GM } from './gmMapping';
import { validateSoundFont } from './soundfonts';
export type TsfModule = {
  HEAPU8: Uint8Array; HEAPF32: Float32Array;
  _tsf_wasm_malloc(size: number): number; _tsf_wasm_free_buf(p: number): void;
  _tsf_wasm_load(p: number, size: number): number; _tsf_wasm_close(h: number): void;
  _tsf_wasm_set_output(h: number, rate: number, gain: number): void;
  _tsf_wasm_set_max_voices(h: number, voices: number): number;
  _tsf_wasm_channel_setup(h: number, channels: number): void;
  _tsf_wasm_channel_note_on(h: number, channel: number, note: number, velocity: number): number;
  _tsf_wasm_channel_note_off(h: number, channel: number, note: number): void;
  _tsf_wasm_channel_midi_control(h: number, channel: number, controller: number, value: number): number;
  _tsf_wasm_channel_set_pitchwheel(h: number, channel: number, pitch: number): number;
  _tsf_wasm_channel_set_presetnumber(h: number, channel: number, program: number, drums: number): number;
  _tsf_wasm_render_float(h: number, p: number, count: number, mix: number): void;
  _tsf_wasm_get_presetcount(h: number): number;
};
export async function loadTsf(wasmBinary: ArrayBuffer): Promise<TsfModule> { return factory({ wasmBinary, print: () => {}, printErr: () => {} }); }
export class SoundFontSynth {
  private handle = 0; private buffer = 0;
  readonly miles = { send: (status: number, data: number[]) => this.send(status, data) };
  constructor(private module: TsfModule, bytes: ArrayBuffer, rate: number) {
    validateSoundFont(bytes);
    const p = module._tsf_wasm_malloc(bytes.byteLength);
    if (!p) throw new Error('Not enough memory for this SoundFont.');
    try { module.HEAPU8.set(new Uint8Array(bytes), p); this.handle = module._tsf_wasm_load(p, bytes.byteLength); }
    finally { module._tsf_wasm_free_buf(p); }
    try {
      if (!this.handle || module._tsf_wasm_get_presetcount(this.handle) < 1) throw new Error('SoundFont presets could not be loaded.');
      module._tsf_wasm_set_output(this.handle, rate, -8);
      if (!module._tsf_wasm_set_max_voices(this.handle, 128)) throw new Error('Not enough memory for this SoundFont.');
      module._tsf_wasm_channel_setup(this.handle, 16);
      this.buffer = module._tsf_wasm_malloc(128 * 2 * 4);
      if (!this.buffer) throw new Error('Not enough memory for this SoundFont.');
    } catch (error) { this.dispose(); throw error; }
  }
  private send(status: number, data: number[]) {
    if (status >= 0xf0) return; // Roland SysEx is not a GM/XG SoundFont command.
    const m = this.module, h = this.handle, ch = status & 15, kind = status >> 4, [a, b] = data;
    if (kind === 9 && b) m._tsf_wasm_channel_note_on(h, ch, a, b / 127);
    else if (kind === 8 || kind === 9) m._tsf_wasm_channel_note_off(h, ch, a);
    else if (kind === 12) {
      const program = ch === 9 ? a : MT32_TO_GM[a];
      if (!m._tsf_wasm_channel_set_presetnumber(h, ch, program, +(ch === 9))) m._tsf_wasm_channel_set_presetnumber(h, ch, 0, 0);
    } else if (kind === 14) m._tsf_wasm_channel_set_pitchwheel(h, ch, a | b << 7);
    else if (kind === 11 && !(a >= 32 && a <= 46 || a >= 58 && a <= 63 || a >= 110 && a <= 120 || a === 123)) m._tsf_wasm_channel_midi_control(h, ch, a, b);
  }
  render(left: Float32Array, right: Float32Array, offset: number, frames: number) {
    for (let done = 0; done < frames;) {
      const count = Math.min(128, frames - done);
      this.module._tsf_wasm_render_float(this.handle, this.buffer, count, 0);
      const data = this.module.HEAPF32, p = this.buffer / 4;
      for (let i = 0; i < count; i++) { left[offset + done + i] = data[p + i * 2]; right[offset + done + i] = data[p + i * 2 + 1]; }
      done += count;
    }
  }
  dispose() { if (this.handle) this.module._tsf_wasm_close(this.handle); if (this.buffer) this.module._tsf_wasm_free_buf(this.buffer); this.handle = this.buffer = 0; }
}
