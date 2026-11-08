type Opl = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  adl_bank(): number;
  adl_output(): number;
  adl_play(size: number, track: number, rate: number, syncMask: number): void;
  adl_render(frames: number): void;
};

// Leave room for the louder CD effects and voices while lifting the quiet OPL mix.
const sampleGain = 3 / 32768;

export async function loadAdlib(wasm: ArrayBuffer, rate: number) {
  const { instance } = await WebAssembly.instantiate(wasm);
  return new AdlibSynth(instance.exports as Opl, rate);
}

class AdlibSynth {
  private bank: Uint8Array;
  private output: Int16Array;

  constructor(private opl: Opl, private rate: number) {
    this.bank = new Uint8Array(opl.memory.buffer, opl.adl_bank(), 32768);
    this.output = new Int16Array(opl.memory.buffer, opl.adl_output(), 256);
  }

  play(bank: ArrayBuffer, file: string, track: number) {
    if (bank.byteLength < 1120 || bank.byteLength > this.bank.length) throw new Error('Original AdLib bank is invalid.');
    this.bank.set(new Uint8Array(bank));
    // Keep the four looping channels in Pool of Sorrow in sync, as in ScummVM.
    this.opl.adl_play(bank.byteLength, track, this.rate, file === 'KYRA1B' && track === 4 ? 15 : 0);
  }

  render(left: Float32Array, right: Float32Array) {
    for (let offset = 0; offset < left.length; offset += 128) {
      const frames = Math.min(128, left.length - offset);
      this.opl.adl_render(frames);
      for (let i = 0; i < frames; i++) {
        left[offset + i] = this.output[i * 2] * sampleGain;
        right[offset + i] = this.output[i * 2 + 1] * sampleGain;
      }
    }
  }
}
