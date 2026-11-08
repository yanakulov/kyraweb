import { loadAdlib } from './adlib';

declare const sampleRate: number;
declare class AudioWorkletProcessor { port: MessagePort; }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class AdlibProcessor extends AudioWorkletProcessor {
  private synth?: Awaited<ReturnType<typeof loadAdlib>>;
  private playing = false;
  private paused = true;
  private disposed = false;
  private volume = 1;
  private fadeFrames = -1;

  constructor() {
    super();
    this.port.onmessage = async ({ data }) => {
      try {
        if (data.type === 'init') {
          this.synth = await loadAdlib(data.wasm, sampleRate);
          this.port.postMessage({ type: 'ready' });
        } else if (data.type === 'track') {
          this.playing = Boolean(data.bank);
          this.fadeFrames = -1;
          if (data.bank) this.synth?.play(data.bank, data.file, data.track);
        } else if (data.type === 'volumes') this.volume = data.music;
        else if (data.type === 'pause') this.paused = data.value;
        else if (data.type === 'fade') this.fadeFrames = sampleRate;
        else if (data.type === 'stop') this.playing = false;
        else if (data.type === 'dispose') this.disposed = true;
      } catch (error) {
        this.playing = false;
        this.port.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'The AdLib emulator stopped.' });
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    if (this.disposed) return false;
    const [left, right] = outputs[0];
    if (!left || !right || !this.synth || !this.playing || this.paused) return true;
    this.synth.render(left, right);
    for (let i = 0; i < left.length; i++) {
      const gain = this.volume * (this.fadeFrames < 0 ? 1 : this.fadeFrames / sampleRate);
      left[i] *= gain;
      right[i] *= gain;
      if (this.fadeFrames > 0) this.fadeFrames--;
    }
    if (this.fadeFrames === 0) this.playing = false;
    return true;
  }
}

registerProcessor('kyra-adlib', AdlibProcessor);
