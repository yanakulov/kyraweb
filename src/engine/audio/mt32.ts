// @ts-expect-error The pinned Emscripten loader is distributed with its complete source.
import createModule from '../../../public/assets/audio/mt32emu.js';
import { MilesMt32 } from './miles';

export type Mt32Module = {
  HEAPU8: Uint8Array; HEAPF32: Float32Array;
  _mt32_create(): number;
  _mt32_free(synth: number): void;
  _mt32_malloc(size: number): number;
  _mt32_free_buf(pointer: number): void;
  _mt32_add_rom_data(synth: number, pointer: number, size: number, type: number): number;
  _mt32_open(synth: number): number;
  _mt32_set_samplerate(synth: number, rate: number): void;
  _mt32_play_msg(synth: number, message: number): number;
  _mt32_play_sysex(synth: number, pointer: number, size: number): number;
  _mt32_render_float(synth: number, pointer: number, frames: number): void;
};

/** No fallback oscillators or GM remapping: synthesis is performed by real libmt32emu. */
export class Mt32Synth {
  private handle: number;
  private buffer: number;
  private sysexBuffer: number;
  readonly miles: MilesMt32;
  constructor(private module: Mt32Module, control: Uint8Array, pcm: Uint8Array, rate: number) {
    this.handle = module._mt32_create(); this.buffer = 0; this.sysexBuffer = 0;
    if (!this.handle) throw new Error('MT-32 could not allocate memory.');
    try {
      for (const [type, data] of [control, pcm].entries()) {
        const pointer = this.allocate(data.length);
        try {
          module.HEAPU8.set(data, pointer);
          if (module._mt32_add_rom_data(this.handle, pointer, data.length, type) !== type + 1) throw new Error('The Control and PCM ROMs are not a recognized matching pair.');
        } finally { module._mt32_free_buf(pointer); }
      }
      module._mt32_set_samplerate(this.handle, rate);
      if (module._mt32_open(this.handle) !== 0) throw new Error('The Control and PCM ROMs are not a recognized matching pair.');
      this.buffer = this.allocate(128 * 2 * 4);
      this.sysexBuffer = this.allocate(65538);
    } catch (error) { this.dispose(); throw error; }
    this.miles = new MilesMt32(message => {
      if (module._mt32_play_msg(this.handle, message) < 0) throw new Error('MT-32 MIDI queue overflow.');
    }, bytes => {
      if (bytes.length > 65538) throw new Error('MT-32 SysEx is too large.');
      module.HEAPU8.set(bytes, this.sysexBuffer);
      if (module._mt32_play_sysex(this.handle, this.sysexBuffer, bytes.length) < 0) throw new Error('MT-32 MIDI queue overflow.');
    });
  }
  private allocate(size: number) { const p = this.module._mt32_malloc(size); if (!p) throw new Error('MT-32 could not allocate memory.'); return p; }
  render(left: Float32Array, right: Float32Array, offset: number, frames: number) {
    // Every AudioWorklet render quantum is at most 128 samples in current browsers.
    for (let done = 0; done < frames;) {
      const count = Math.min(128, frames - done);
      this.module._mt32_render_float(this.handle, this.buffer, count);
      const data = this.module.HEAPF32, start = this.buffer / 4;
      for (let i = 0; i < count; i++) { left[offset + done + i] = data[start + i * 2]; right[offset + done + i] = data[start + i * 2 + 1]; }
      done += count;
    }
  }
  dispose() {
    if (this.handle) this.module._mt32_free(this.handle);
    if (this.buffer) this.module._mt32_free_buf(this.buffer);
    if (this.sysexBuffer) this.module._mt32_free_buf(this.sysexBuffer);
    this.handle = this.buffer = this.sysexBuffer = 0;
  }
}
export async function loadMt32(wasmBinary: ArrayBuffer): Promise<Mt32Module> {
  return createModule({ wasmBinary, print: () => {}, printErr: () => {} });
}
