import { withBase } from '../core/assets';
import cues from './effects.json';
import { makeBookFoley, type BookFoley } from './bookFoley';

const clips: Record<string, number[]> = cues;

/** Original CM-32L renders for browsers that are playing without Roland synthesis. */
export class RecordedEffects {
  private context?: AudioContext;
  private gain?: GainNode;
  private buffer?: AudioBuffer;
  private pending?: Promise<void>;
  private playing = new Set<AudioBufferSourceNode>();
  private paused = true;
  private volume = 0;
  private bookSounds = new Map<BookFoley, AudioBuffer>();

  prepare() {
    if (!globalThis.AudioContext?.prototype.createBufferSource || this.buffer || this.pending) return;
    try {
      const context = this.context ?? new AudioContext({ latencyHint: 'interactive' });
      if (!this.context) {
        this.context = context;
        this.gain = context.createGain();
        this.gain.gain.value = this.volume;
        this.gain.connect(context.destination);
        void context.resume().catch(() => {});
      }
      this.pending = fetch(withBase('assets/audio/effects.mp3')).then(response => {
        if (!response.ok) throw new Error('Original sound effects could not load.');
        return response.arrayBuffer();
      }).then(bytes => context.decodeAudioData(bytes)).then(buffer => {
        if (this.context === context) this.buffer = buffer;
      }).catch(() => { /* Retry on a later audio gesture. */ }).finally(() => { this.pending = undefined; });
    } catch { /* Audio is optional when the browser has no available device. */ }
  }

  play(file: string, track: number) {
    const clip = (file === 'KYRAMISC' ? clips[`finale:${track}`] : undefined)
      ?? clips[`${file === 'INTRO' ? 'intro' : 'rooms'}:${track}`];
    if (clip && this.buffer) this.playBuffer(this.buffer, clip[0], clip[1]);
  }

  book(cue: BookFoley | 'hover' | 'click') {
    if (!this.context || this.paused || !this.volume) return;
    if (cue === 'hover' || cue === 'click') {
      const [offset] = clips[cue === 'hover' ? 'rooms:53' : 'rooms:54'];
      if (this.buffer) this.playBuffer(this.buffer, offset, cue === 'hover' ? .22 : .34, cue === 'hover' ? .35 : .54);
      return;
    }
    let buffer = this.bookSounds.get(cue);
    if (!buffer) {
      buffer = makeBookFoley(this.context, cue);
      this.bookSounds.set(cue, buffer);
    }
    this.playBuffer(buffer, 0, buffer.duration, .8);
  }

  private playBuffer(buffer: AudioBuffer, offset: number, duration: number, volume = 1) {
    if (!this.context || !this.gain || this.paused || !this.volume || this.playing.size >= 3) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const level = volume === 1 ? undefined : this.context.createGain();
    if (level) {
      level.connect(this.gain);
      level.gain.setValueAtTime(volume, this.context.currentTime);
      level.gain.setTargetAtTime(0, this.context.currentTime + duration - .035, .009);
    }
    source.connect(level ?? this.gain);
    source.onended = () => { this.playing.delete(source); source.disconnect(); level?.disconnect(); };
    this.playing.add(source);
    source.start(0, offset, duration);
  }

  setVolume(volume: number) {
    this.volume = volume;
    if (this.gain) this.gain.gain.value = volume;
  }

  setPaused(value: boolean) {
    if (this.paused === value) return;
    this.paused = value;
    if (this.context) void (value ? this.context.suspend() : this.context.resume()).catch(() => {});
  }

  stop() {
    for (const source of this.playing) { source.stop(); source.disconnect(); }
    this.playing.clear();
  }

  dispose() {
    this.stop();
    void this.context?.close().catch(() => {});
    this.context = this.gain = this.buffer = undefined;
    this.bookSounds.clear();
  }
}
