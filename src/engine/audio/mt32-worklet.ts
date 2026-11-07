import { loadMt32, Mt32Synth } from './mt32';
import { XmidiSequencer, type MidiTrack } from './xmidi';
import { MidiPlayback } from './midiPlayback';
import { loadTsf, SoundFontSynth } from './soundfontSynth';
declare const sampleRate: number;
declare class AudioWorkletProcessor { port: MessagePort; }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class Mt32Processor extends AudioWorkletProcessor {
  private synth?: Mt32Synth | SoundFontSynth;
  private sequence?: XmidiSequencer;
  private playback?: MidiPlayback;
  private bank?: string;
  private pending?: MidiTrack;
  private initializing = false;
  private paused = true;
  private disposed = false;
  private initRequest?: number;
  constructor() {
    super();
    this.port.onmessage = async ({ data }) => {
      try {
        if (data.type === 'init') {
          if (data.soundfont) {
            const module = await loadTsf(data.wasm);
            if (this.disposed) return;
            this.synth = new SoundFontSynth(module, data.soundfont, sampleRate);
            this.playback = new MidiPlayback(this.synth, sampleRate);
            this.port.postMessage({ type: 'ready', id: data.id }); return;
          }
          const module = await loadMt32(data.wasm);
          if (this.disposed) return;
          const synth = new Mt32Synth(module, new Uint8Array(data.control), new Uint8Array(data.pcm), sampleRate);
          this.synth = synth;
          synth.miles.init();
          this.sequence = new XmidiSequencer(data.initialization, sampleRate, this.synth.miles.send);
          this.initializing = true;
          this.initRequest = data.id;
        } else if (data.type === 'track') {
          if (this.bank !== data.file) { this.playback?.stopEffects(); this.bank = data.file; }
          if (this.initializing) this.pending = data.track;
          else this.playback?.music(data.track);
        } else if (data.type === 'effect') this.playback?.effect(data.track);
        else if (data.type === 'stopEffects') this.playback?.stopEffects();
        else if (data.type === 'volumes') this.playback?.volumes(data.music, data.effects);
        else if (data.type === 'pause') this.paused = data.value;
        else if (data.type === 'fade') this.playback?.fade();
        else if (data.type === 'stop') { this.pending = undefined; this.playback?.stop(); }
        else if (data.type === 'dispose') { this.disposed = true; this.synth?.dispose(); this.synth = undefined; }
      } catch (error) { this.fail(error, data.id); }
    };
  }
  private fail(error: unknown, id?: number) {
    this.paused = true; this.sequence = undefined;
    this.port.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : 'Music could not start.' });
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    if (this.disposed) return false;
    const [left, right] = outputs[0];
    if (!left || !right || !this.synth || this.paused && !this.initializing) return true;
    try {
      const render = (offset: number, frames: number) => this.synth!.render(left, right, offset, frames);
      if (this.initializing) {
        // INTRO 0 takes ~14 virtual seconds. Warm its SysEx state at up to 32x
        // speed instead of making the player wait through fourteen silent seconds.
        for (let i = 0; i < 32 && !this.sequence?.done; i++) this.sequence?.render(left.length, render);
        left.fill(0); right.fill(0);
        if (this.sequence?.done) {
          this.initializing = false; this.playback = new MidiPlayback(this.synth, sampleRate);
          this.playback.music(this.pending); this.pending = undefined;
          this.port.postMessage({ type: 'ready', id: this.initRequest });
        }
        return true;
      }
      this.playback?.render(left, right);
    } catch (error) { left.fill(0); right.fill(0); this.fail(error); }
    return true;
  }
}
registerProcessor('kyra-mt32', Mt32Processor);
