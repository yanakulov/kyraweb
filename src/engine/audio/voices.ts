import { withBase } from '../core/assets';
import availableBanks from '../../../public/assets/voices/manifest.json';

type VoiceBank = { bytes: ArrayBuffer; start: number; index: Record<number, [number, number]> };

export class Voices {
  private context?: AudioContext;
  private gain?: GainNode;
  private source?: AudioBufferSourceNode;
  private banks = new Map<string, Promise<VoiceBank | null>>();
  private request = 0;
  private paused = true;

  unlock(volume: number) {
    if (this.context) {
      if (!this.paused && this.context.state === 'suspended') this.setPaused(false);
      return;
    }
    if (!globalThis.AudioContext?.prototype.decodeAudioData) return;
    try {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.connect(this.context.destination);
      this.setVolume(volume);
      // The first resume must happen in the gesture, even when the book is still open.
      void this.context.resume().then(() => { if (this.paused) this.setPaused(true); }).catch(() => {});
    } catch { /* Subtitles remain available. */ }
  }

  prepare(name: string) {
    const key = name.toLowerCase();
    if (!availableBanks.includes(key)) return Promise.resolve(null);
    let pending = this.banks.get(key);
    if (!pending) {
      pending = fetch(withBase(`assets/voices/${key}.mp3bank`)).then(async response => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Could not load voice bank');
        const bytes = await response.arrayBuffer(), header = new Uint8Array(bytes);
        const end = header.indexOf(10);
        if (end < 0 || end > 32768) throw new Error('Invalid voice bank');
        return { bytes, start: end + 1, index: JSON.parse(new TextDecoder().decode(header.subarray(0, end))) };
      }).catch(() => { this.banks.delete(key); return null; });
      this.banks.set(key, pending);
    }
    return pending;
  }

  async play(bank: string, id: number) {
    this.stop();
    const context = this.context;
    if (!context || !this.gain) return;
    const request = this.request;
    const main = await this.prepare(bank);
    const data = !main?.index[id] && id >= 1000 && bank !== 'CHAPTER1' ? await this.prepare('CHAPTER1') : main;
    const entry = data?.index[id];
    if (!data || !entry || request !== this.request) return;
    const [offset, length] = entry;
    try {
      const clip = await context.decodeAudioData(data.bytes.slice(data.start + offset, data.start + offset + length));
      if (request !== this.request) return;
      const source = context.createBufferSource();
      this.source = source;
      source.buffer = clip;
      source.connect(this.gain);
      source.onended = () => { if (this.source === source) this.source = undefined; source.disconnect(); };
      source.start(0, 0);
    } catch { /* A bad recording cannot interrupt a scene. */ }
  }

  setVolume(volume: number) { if (this.gain) this.gain.gain.value = volume; }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (this.context) void (paused ? this.context.suspend() : this.context.resume()).catch(() => {});
  }
  stop() { this.request++; this.source?.stop(); this.source = undefined; }
  dispose() { this.stop(); void this.context?.close().catch(() => {}); this.context = undefined; this.banks.clear(); }
}
