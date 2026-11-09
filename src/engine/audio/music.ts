import processorUrl from './mt32-worklet.ts?worker&url';
import adlibUrl from './adlib-worklet.ts?worker&url';
import manifest from '../../../public/assets/music/manifest.json';
import { withBase } from '../core/assets';
import { parseXmidi, type MidiTrack } from './xmidi';
import { readRoms, storeRoms, readRomFiles, type Mt32Roms } from './romStorage';
import { introCue, roomMusicCommand, wanderCue, type MusicCue } from './cues';
import { readLocalRoms } from './localRoms';
import { RecordedEffects } from './recordedEffects';
import type { BookFoley } from './bookFoley';
import { Voices } from './voices';
import { readSoundFonts, storeSoundFont, localSoundFonts, publicSoundFont, soundFontData, validateSoundFont, MAX_SOUNDFONT_BYTES, type SoundFontBank } from './soundfonts';

export type MusicState = { renderer: string; banks: { id: string; name: string }[]; enabled: boolean; volume: number; sfxEnabled: boolean; sfxVolume: number; voiceEnabled: boolean; voiceVolume: number; available: boolean; ready: boolean; busy: boolean; previewing: boolean; message: string; soundFontProgress?: number; romNames: string[]; source: 'none' | 'browser' | 'local' };
type Device = { context: AudioContext; node: AudioWorkletNode; gain: GainNode };
const bookMusic: MusicCue = { file: 'KYRA1B', track: 4 }; // Pool of Sorrow, original wander command 7.
function preference(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function remember(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Session controls still work. */ } }

export class MusicPlayer {
  readonly state: MusicState = { renderer: preference('kyrandia.renderer', 'adlib'), banks: [], enabled: preference('kyrandia.music', '1') === '1', volume: Math.max(0, Math.min(1, Number(preference('kyrandia.musicVolume', '.5')) || 0)), sfxEnabled: preference('kyrandia.sfx', '1') !== '0', sfxVolume: Math.max(0, Math.min(1, Number(preference('kyrandia.sfxVolume', '.25')) || 0)), voiceEnabled: preference('kyrandia.voice', '1') !== '0', voiceVolume: Math.max(0, Math.min(1, Number(preference('kyrandia.voiceVolume', '.6')) || 0)), available: false, ready: false, busy: false, previewing: false, message: '', romNames: [], source: 'none' };
  private roms?: Mt32Roms;
  private banks = new Map<string, SoundFontBank>();
  private selectedBank() { return this.state.renderer.startsWith('sf2:') ? this.banks.get(this.state.renderer.slice(4)) : undefined; }
  private hasResources() { return this.state.renderer === 'adlib' || (this.state.renderer === 'mt32' ? !!this.roms : !!this.selectedBank()); }
  private readyMessage() { return this.state.renderer === 'adlib' ? '' : this.state.renderer === 'mt32' ? 'MT-32 is ready.' : 'SoundFont is ready (GM approximation).'; }
  private updateBanks() { this.state.banks = [...this.banks.values()].map(({ id, name }) => ({ id, name })); this.state.available = this.hasResources(); }
  private device?: Device;
  private starting?: Promise<void>;
  private tracks = new Map<string, Promise<MidiTrack[]>>();
  private adlibBanks = new Map<string, Promise<ArrayBuffer>>();
  private cue: MusicCue = { file: 'INTRO', track: 2 };
  private paused = true;
  private book = false;
  private hidden = false;
  private faded = false;
  private command = -1;
  private request = 0;
  private epoch = 0;
  private disposed = false;
  private failed = false;
  private contexts = new Set<AudioContext>();
  private warmContext?: AudioContext;
  private restoring = false;
  private userActivated = false;
  private effectEpoch = 0;
  private recordedEffects = new RecordedEffects();
  private voices = new Voices();
  private previewMix = false;
  private previewTimer?: ReturnType<typeof setTimeout>;
  private voiceBank = 'INTRO';
  private usesNativeEffects() { return this.state.renderer === 'mt32' && !!this.roms; }
  private prepareRecordedEffects() {
    if (this.disposed || this.restoring && !this.book || !this.userActivated || !this.state.sfxEnabled || this.usesNativeEffects() && !this.book) return;
    this.recordedEffects.setVolume(this.state.sfxVolume);
    this.recordedEffects.prepare();
  }
  private wantsAudio() { return this.state.previewing || this.state.enabled || this.state.sfxEnabled && this.usesNativeEffects(); }
  constructor(private changed: (state: MusicState) => void) {}
  private publish(message?: string) { if (this.disposed) return; if (message !== undefined) this.state.message = message; this.changed({ ...this.state, romNames: [...this.state.romNames] }); }
  async restore() {
    const epoch = this.epoch;
    this.restoring = true;
    let storageError: unknown, localError: unknown;
    try {
      const [stored, local, savedBanks, localBanks] = await Promise.all([
        readRoms().catch(error => { storageError = error; return undefined; }),
        readLocalRoms().catch(error => { localError = error; return undefined; }),
        readSoundFonts().catch(() => []), localSoundFonts().catch(() => [])
      ]);
      if (this.disposed || epoch !== this.epoch || this.roms) return;
      for (const bank of [...savedBanks, ...localBanks, publicSoundFont]) this.banks.set(bank.id, bank);
      const roms = stored ?? local;
      if (roms) {
        if (!(roms.control instanceof ArrayBuffer) || !(roms.pcm instanceof ArrayBuffer) || ![65536, 131072].includes(roms.control.byteLength) || ![524288, 1048576].includes(roms.pcm.byteLength) || !Array.isArray(roms.names) || roms.names.length !== 2 || !roms.names.every(name => typeof name === 'string' && name.length <= 255)) throw new Error('Choose one Control ROM and one PCM ROM.');
        this.roms = roms; this.state.romNames = roms.names; this.state.source = stored ? 'browser' : 'local';
      }
      if (!this.hasResources()) this.state.renderer = 'adlib';
      this.updateBanks();
      this.publish(this.selectedBank() ? 'SoundFont mode uses approximate MT-32 to GM instrument mapping.' : this.state.renderer === 'mt32' && this.state.source === 'local' ? 'Local ROMs loaded automatically.' : !roms && (localError || storageError) ? this.error(localError || storageError) : '');
    } catch (error) {
      if (!this.disposed) { this.state.renderer = 'adlib'; this.updateBanks(); this.publish(this.error(error)); }
    }
    finally {
      this.restoring = false;
      this.prepareRecordedEffects();
      if (this.userActivated && !this.disposed && this.wantsAudio() && !this.failed && !this.device && !this.state.busy) void this.start();
      else if (this.warmContext) { this.closeContext(this.warmContext); this.warmContext = undefined; }
    }
  }
  /** Call synchronously from a user gesture, before awaits, for browser autoplay rules. */
  unlock() {
    this.userActivated = true;
    if (!this.disposed && this.state.voiceEnabled) {
      this.voices.unlock(this.state.voiceVolume);
      this.prepareVoice(this.voiceBank);
    }
    this.prepareRecordedEffects();
    if (!this.disposed && !this.failed && this.restoring && !this.warmContext && (this.wantsAudio() || this.state.renderer === 'mt32' && this.state.sfxEnabled)) {
      try { this.warmContext = this.context(); } catch (error) { this.publish(this.error(error)); }
    }
    if (!this.disposed && !this.failed && !this.restoring && this.wantsAudio() && this.hasResources() && !this.state.busy) {
      if (!this.device) void this.start();
      else if (!this.hidden && this.device.context.state === 'suspended') void this.device.context.resume().catch(() => this.publish('Click Enable music to allow browser audio.'));
    }
  }
  setEnabled(value: boolean) {
    this.failed = false;
    this.state.enabled = value; remember('kyrandia.music', value ? '1' : '0');
    if (value) { this.publish(this.hasResources() ? '' : this.state.renderer === 'mt32' ? 'Import your own MT-32 or CM-32L Control and PCM ROMs.' : 'Import an SF2 SoundFont bank.'); this.applyCue(); this.unlock(); }
    else if (this.state.previewing && !this.previewMix) this.stopPreview();
    else { this.applyCue(); if (!this.wantsAudio()) { this.epoch++; this.destroy(); } this.publish(''); }
    this.syncVolumes();
  }
  setVolume(value: number) {
    if (!Number.isFinite(value)) return;
    this.state.volume = Math.max(0, Math.min(1, value)); remember('kyrandia.musicVolume', String(this.state.volume));
    this.syncVolumes();
    this.publish();
  }
  setSfxEnabled(value: boolean) {
    this.state.sfxEnabled = value; remember('kyrandia.sfx', value ? '1' : '0'); this.failed = false;
    if (!value) this.stopEffects();
    else this.prepareRecordedEffects();
    if (this.wantsAudio()) this.unlock(); else { this.epoch++; this.destroy(); }
    this.syncVolumes(); this.publish();
  }
  setSfxVolume(value: number) {
    if (!Number.isFinite(value)) return;
    this.state.sfxVolume = Math.max(0, Math.min(1, value)); remember('kyrandia.sfxVolume', String(this.state.sfxVolume));
    this.recordedEffects.setVolume(this.state.sfxVolume);
    this.syncVolumes(); this.publish();
  }
  private syncVolumes() { this.device?.node.port.postMessage({ type: 'volumes', music: this.state.enabled || this.state.previewing && !this.previewMix ? this.state.volume : 0, effects: this.state.sfxEnabled ? this.state.sfxVolume : 0 }); }
  effect(track: number, preview = false) {
    if (!this.state.sfxEnabled || this.book && !preview || this.state.previewing !== preview || !Number.isInteger(track) || track < 0 || track > 119) return;
    const device = this.device, epoch = this.effectEpoch, file = preview ? 'INTRO' : this.cue.file;
    if (!this.usesNativeEffects()) { this.recordedEffects.play(file, track); return; }
    if (!device) return; // Never replay stale interactions after ROM initialization.
    void this.load(file).then(tracks => {
      if (this.device !== device || epoch !== this.effectEpoch || (!preview && file !== this.cue.file) || !this.state.sfxEnabled) return;
      if (tracks[track]?.some(event => event.status >> 4 === 9 && event.data[1])) device.node.port.postMessage({ type: 'effect', track: tracks[track] });
    }).catch(error => { if (epoch === this.effectEpoch) this.publish(this.error(error)); });
  }
  stopEffects() { this.effectEpoch++; this.recordedEffects.stop(); this.device?.node.port.postMessage({ type: 'stopEffects' }); }
  prepareVoice(bank: string) {
    this.voiceBank = bank;
    if (!this.disposed && this.userActivated && this.state.voiceEnabled && this.state.voiceVolume > 0) void this.voices.prepare(bank);
  }
  speak(bank: string, id: number) {
    if (!this.disposed && this.userActivated && this.state.voiceEnabled && this.state.voiceVolume > 0) return this.voices.play(bank, id);
  }
  stopSpeech() { this.voices.stop(); }
  setVoiceEnabled(value: boolean) {
    this.state.voiceEnabled = value;
    remember('kyrandia.voice', value ? '1' : '0');
    if (value) this.unlock(); else this.stopSpeech();
    this.publish();
  }
  setVoiceVolume(value: number) {
    this.state.voiceVolume = Math.max(0, Math.min(1, value || 0));
    remember('kyrandia.voiceVolume', String(this.state.voiceVolume));
    this.voices.setVolume(this.state.voiceVolume);
    this.prepareVoice(this.voiceBank);
    this.publish();
  }
  async importRoms(files: File[]) {
    if (this.state.busy || this.disposed) return;
    this.stopPreview();
    // Construct/resume in the file-input gesture, not after asynchronous disk reads.
    let context: AudioContext;
    try { context = this.context(); } catch (error) { this.publish(this.error(error)); return; }
    this.state.busy = true; this.publish('Starting MT-32…');
    const epoch = ++this.epoch;
    let candidate: Device | undefined;
    try {
      const roms = await readRomFiles(files);
      candidate = await this.build(context, 'mt32', roms);
      if (epoch !== this.epoch || this.disposed) { this.close(candidate); return; }
      this.stopEffects(); this.destroy(); this.device = candidate; candidate = undefined;
      this.state.renderer = 'mt32'; remember('kyrandia.renderer', 'mt32');
      this.failed = false; this.roms = roms; this.state.available = this.state.ready = this.state.enabled = true; this.state.source = 'browser';
      this.state.romNames = roms.names; remember('kyrandia.music', '1');
      this.syncPause(); this.syncVolumes(); this.applyCue();
      this.publish('MT-32 is ready.');
      try { await storeRoms(roms); } catch (error) { this.publish(this.error(error)); }
    } catch (error) { this.publish(this.error(error)); }
    finally { if (candidate) this.close(candidate); if (this.device?.context !== context) this.closeContext(context); this.state.busy = false; this.publish(); }
  }
  async forgetRoms() {
    if (this.state.busy) return;
    this.stopPreview();
    this.epoch++;
    if (this.state.renderer === 'mt32') {
      this.destroy(); this.state.renderer = 'adlib'; this.failed = false;
      remember('kyrandia.renderer', 'adlib');
    }
    this.roms = undefined; this.state.romNames = []; this.state.source = 'none'; this.updateBanks();
    this.prepareRecordedEffects();
    this.unlock();
    try { await storeRoms(null); this.publish('ROMs removed from this browser.'); } catch (error) { this.publish(this.error(error)); }
  }
  async selectRenderer(renderer: string) {
    if (this.state.busy || this.disposed || renderer === this.state.renderer) return;
    const bank = renderer.startsWith('sf2:') ? this.banks.get(renderer.slice(4)) : undefined;
    if (renderer !== 'mt32' && renderer !== 'adlib' && !bank) return;
    this.stopPreview();
    if (renderer === 'mt32' && !this.roms) { this.stopEffects(); this.destroy(); this.state.renderer = renderer; this.updateBanks(); this.prepareRecordedEffects(); remember('kyrandia.renderer', renderer); this.publish('Import your own MT-32 or CM-32L Control and PCM ROMs.'); return; }
    await this.changeRenderer(renderer, bank);
  }
  private async changeRenderer(renderer: string, bank?: SoundFontBank, prepared?: AudioContext) {
    let context: AudioContext;
    try { context = prepared ?? this.context(); } catch (error) { this.publish(this.error(error)); return false; }
    const epoch = ++this.epoch; this.state.busy = true; this.publish('Starting audio device…');
    let candidate: Device | undefined;
    try {
      candidate = await this.build(context, renderer, this.roms, bank);
      if (this.disposed || epoch !== this.epoch) return false;
      this.stopEffects(); this.destroy(); this.device = candidate; candidate = undefined;
      this.state.renderer = renderer; this.state.ready = this.state.enabled = true; this.failed = false;
      this.prepareRecordedEffects();
      if (bank) this.banks.set(bank.id, bank);
      this.updateBanks(); remember('kyrandia.renderer', renderer); remember('kyrandia.music', '1');
      this.syncVolumes(); this.syncPause(); this.applyCue(); this.publish(this.readyMessage()); return true;
    } catch (error) { this.publish(this.error(error)); return false; }
    finally { if (candidate) this.close(candidate); if (this.device?.context !== context) this.closeContext(context); this.state.busy = false; this.publish(); }
  }
  async importSoundFont(file: File) {
    if (this.state.busy || this.disposed) return;
    if (file.size > MAX_SOUNDFONT_BYTES) { this.publish('Choose a valid SF2 SoundFont, up to 64 MiB.'); return; }
    let context: AudioContext;
    try { context = this.context(); } catch (error) { this.publish(this.error(error)); return; }
    this.state.busy = true; this.publish('Loading SoundFont…');
    // Read the file before any destructive switch; a bad bank keeps the old device.
    try {
      const bytes = await file.arrayBuffer(); validateSoundFont(bytes);
      if (this.disposed) return;
      const bank: SoundFontBank = { id: `user:${crypto.randomUUID()}`, name: file.name.replace(/\.sf2$/i, '').slice(0, 120), bytes };
      if (await this.changeRenderer(`sf2:${bank.id}`, bank, context)) {
        try { await storeSoundFont(bank); this.banks.set(bank.id, { id: bank.id, name: bank.name, stored: true }); }
        catch { this.publish('SoundFont storage is unavailable. This bank works for this visit only.'); }
      }
    } catch (error) { this.publish(this.error(error)); }
    finally { if (this.device?.context !== context) this.closeContext(context); this.state.busy = false; this.publish(); }
  }
  private context() {
    if (!globalThis.AudioContext || !globalThis.AudioWorkletNode) throw new Error('This browser does not support MT-32 audio.');
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.contexts.add(context);
    void context.resume().catch(() => this.publish('Click Enable music to allow browser audio.'));
    return context;
  }
  private async build(context: AudioContext, renderer: string, roms?: Mt32Roms, bank?: SoundFontBank): Promise<Device> {
    const epoch = this.epoch;
    const adlib = renderer === 'adlib';
    const synth = adlib ? 'adlib' : bank ? 'tsf' : 'mt32emu';
    const failure = adlib ? 'The AdLib emulator could not start.' : 'The MT-32 emulator could not start.';
    let downloading = true;
    const [wasm, intro, font] = await Promise.all([
      fetch(withBase(`assets/audio/${synth}.wasm`)).then(response => { if (!response.ok) throw new Error('The audio synthesizer could not load.'); return response.arrayBuffer(); }),
      renderer === 'mt32' ? this.load('INTRO') : Promise.resolve(undefined),
      bank && soundFontData(bank, percent => {
        if (!downloading || epoch !== this.epoch || this.disposed) return;
        this.state.soundFontProgress = percent;
        this.publish();
      }), context.audioWorklet.addModule(adlib ? adlibUrl : processorUrl)
    ]).finally(() => {
      downloading = false;
      if (this.state.soundFontProgress !== undefined) {
        delete this.state.soundFontProgress;
        this.publish();
      }
    });
    if (font) validateSoundFont(font);
    const node = new AudioWorkletNode(context, adlib ? 'kyra-adlib' : 'kyra-mt32', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    const gain = context.createGain(); gain.gain.value = 0;
    node.connect(gain).connect(context.destination);
    const device = { context, node, gain };
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(failure)), 30000);
        node.onprocessorerror = () => { clearTimeout(timer); reject(new Error(failure)); };
        node.port.onmessage = ({ data }) => {
          if (data.type === 'ready') { clearTimeout(timer); resolve(); }
          if (data.type === 'error') { clearTimeout(timer); reject(new Error(data.message)); }
        };
        if (adlib) node.port.postMessage({ type: 'init', wasm }, [wasm]);
        else if (font) {
          const soundfont = font.slice(0);
          node.port.postMessage({ type: 'init', wasm, soundfont }, [wasm, soundfont]);
        } else {
          if (!roms || !intro) throw new Error('Import your own MT-32 or CM-32L Control and PCM ROMs.');
          const control = roms.control.slice(0), pcm = roms.pcm.slice(0);
          node.port.postMessage({ type: 'init', wasm, control, pcm, initialization: intro[0] }, [wasm, control, pcm]);
        }
      });
      node.port.onmessage = ({ data }) => { if (data.type === 'error' && this.device === device) this.fail(data.message); };
      node.onprocessorerror = () => { if (this.device === device) this.fail(adlib ? 'The AdLib emulator stopped.' : 'The MT-32 emulator stopped. Disable and enable music to retry.'); };
      gain.gain.value = 1; // Per-source CC7 scaling keeps music and SFX independent.
      return device;
    } catch (error) { this.close(device); throw error; }
  }
  private start() {
    if (this.starting) return this.starting;
    const epoch = this.epoch, renderer = this.state.renderer, roms = this.roms, bank = this.selectedBank();
    if (!this.hasResources()) return Promise.resolve();
    let context: AudioContext;
    try { context = this.warmContext ?? this.context(); this.warmContext = undefined; } catch (error) { this.failed = true; this.publish(this.error(error)); return Promise.resolve(); }
    this.state.busy = true; this.publish(renderer === 'mt32' ? 'Starting MT-32…' : 'Starting audio device…');
    this.starting = this.build(context, renderer, roms, bank).then(device => {
      if (epoch !== this.epoch || this.disposed || !this.wantsAudio()) { this.close(device); return; }
      this.device = device; this.state.ready = true; this.syncPause(); this.syncVolumes(); this.applyCue(); this.publish(this.readyMessage());
    }).catch(error => { this.closeContext(context); if (epoch === this.epoch) { this.failed = true; this.publish(this.error(error)); } }).finally(() => {
      this.starting = undefined; this.state.busy = false; this.publish();
    });
    return this.starting;
  }
  private async load(file: string) {
    let pending = this.tracks.get(file);
    if (!pending) {
      const entry = (manifest.files as Record<string, { src: string }>)[file];
      if (!entry) throw new Error('Unknown music resource.');
      pending = this.loadBank(entry.src).then(bytes => parseXmidi(new Uint8Array(bytes)))
        .catch(error => { this.tracks.delete(file); throw error; });
      this.tracks.set(file, pending);
    }
    return pending;
  }
  private async loadBank(src: string) {
    const response = await fetch(withBase(`assets/music/${src}`));
    if (!response.ok) throw new Error('Original music could not load.');
    const buffer = await response.arrayBuffer();
    const header = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 2));
    return header[0] === 0x1f && header[1] === 0x8b
      ? new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      : buffer;
  }
  private async loadAdlibBank(file: string) {
    const entry = (manifest.adlib as Record<string, { src: string }>)[file];
    if (!entry) throw new Error('Unknown music resource.');
    let pending = this.adlibBanks.get(file);
    if (!pending) {
      pending = this.loadBank(entry.src).catch(error => { this.adlibBanks.delete(file); throw error; });
      this.adlibBanks.set(file, pending);
    }
    return pending;
  }
  play(cue: MusicCue, restart = false) {
    if (!restart && !this.faded && cue.file === this.cue.file && cue.track === this.cue.track) return;
    if (this.book) { this.cue = cue; this.faded = false; return; }
    if (cue.file !== this.cue.file) this.stopEffects();
    // Stop the outgoing score while the new bank is loading, as the DOS driver does.
    if (!this.state.previewing) this.device?.node.port.postMessage({ type: 'track', file: cue.file });
    this.cue = cue; this.faded = false; this.applyCue();
  }
  intro(step: string) { const cue = introCue(step); if (cue) { this.command = -1; this.play(cue, true); } }
  beginGame() { this.command = -1; this.play({ file: 'KYRA1B', track: 0 }, true); }
  /** Older saves have no audio position. Restart the room's score, not the intro. */
  restoreRoom(id: number, wisp = false) {
    this.command = -1;
    this.wander(roomMusicCommand(id, wisp), true);
  }
  wander(command: number, restart = false) {
    if (!restart && command === this.command && (command === 1 || !this.faded)) return;
    this.command = command;
    const cue = wanderCue(command, this.cue.file === 'INTRO' ? 'KYRA1B' : this.cue.file);
    if (cue) this.play(cue, true); else this.fade();
  }
  fade() { this.faded = true; if (!this.book && !this.state.previewing) { this.request++; this.device?.node.port.postMessage({ type: 'fade' }); } }
  stop() { this.faded = true; this.command = -1; this.stopEffects(); this.stopSpeech(); if (!this.book && !this.state.previewing) { this.request++; this.device?.node.port.postMessage({ type: 'stop' }); } }
  preview(mix = false) {
    if (this.state.previewing) { this.stopPreview(); return; }
    this.stopEffects(); this.stopSpeech();
    this.state.previewing = true;
    this.previewMix = mix;
    this.applyCue(); this.syncPause(); this.syncVolumes(); this.publish(); this.unlock();
    if (mix) {
      const sample = () => {
        if (!this.previewMix || this.disposed) return;
        if (!this.hidden && (this.device || !this.usesNativeEffects())) {
          if (this.state.voiceEnabled) this.speak('INTRO', 0);
          this.effect(25, true);
        }
        this.previewTimer = setTimeout(sample, this.device || !this.usesNativeEffects() ? 3800 : 350);
      };
      this.previewTimer = setTimeout(sample, 800);
    }
  }
  stopPreview() {
    if (!this.state.previewing) return;
    this.state.previewing = false;
    if (this.previewMix) { this.stopEffects(); this.stopSpeech(); }
    this.previewMix = false;
    clearTimeout(this.previewTimer);
    this.applyCue(); this.syncPause(); this.syncVolumes();
    if (!this.wantsAudio()) { this.epoch++; this.destroy(); }
    this.publish();
  }
  private applyCue() {
    const request = ++this.request, device = this.device;
    if (!device) return;
    if ((!this.state.enabled || this.faded && !this.book) && !this.state.previewing) { device.node.port.postMessage({ type: 'track', file: this.cue.file }); return; }
    const cue = this.state.previewing ? { file: 'INTRO', track: 2 } : this.book ? bookMusic : this.cue;
    const adlib = this.state.renderer === 'adlib';
    const pending = adlib
      ? this.loadAdlibBank(cue.file).then(bank => ({ bank, track: cue.track }))
      : this.load(cue.file).then(tracks => {
          if (!tracks[cue.track]) throw new Error('Original music track is missing.');
          return { track: tracks[cue.track] };
        });
    void pending.then(payload => {
      if (request !== this.request || this.device !== device) return;
      device.node.port.postMessage({ type: 'track', file: cue.file, ...payload });
    }).catch(error => { if (request === this.request) this.fail(this.error(error)); });
  }
  setPaused(value: boolean) { this.paused = value; this.syncPause(); }
  setBook(value: boolean) {
    if (value === this.book) return;
    this.book = value;
    if (value) { this.stopEffects(); this.prepareRecordedEffects(); }
    this.syncPause();
    if (!this.state.previewing) this.applyCue();
  }
  bookSound(cue: BookFoley | 'hover' | 'click') {
    if (this.book && !this.hidden && this.state.sfxEnabled && !this.state.previewing) this.recordedEffects.book(cue);
  }
  setHidden(value: boolean) {
    this.hidden = value; this.syncPause();
    if (this.device) void (value ? this.device.context.suspend() : this.device.context.resume()).catch(() => this.publish('Click Enable music to allow browser audio.'));
  }
  private syncPause() {
    const pauseSamples = this.hidden || !this.previewMix && (this.paused || this.state.previewing);
    this.recordedEffects.setPaused(pauseSamples && !(this.book && !this.hidden && !this.state.previewing));
    this.voices.setPaused(pauseSamples);
    this.device?.node.port.postMessage({ type: 'pause', value: this.hidden || this.paused && !this.book && !this.state.previewing });
  }
  private closeContext(context: AudioContext) { this.contexts.delete(context); void context.close().catch(() => {}); }
  private close(device: Device) { device.node.port.postMessage({ type: 'dispose' }); device.node.disconnect(); device.gain.disconnect(); device.node.port.close(); this.closeContext(device.context); }
  private destroy() { this.request++; this.effectEpoch++; if (this.device) this.close(this.device); this.device = undefined; this.state.ready = false; }
  private error(error: unknown) { return error instanceof Error ? error.message : 'Music could not start.'; }
  private fail(message: string) { this.failed = true; this.destroy(); this.publish(message); }
  dispose() { this.disposed = true; clearTimeout(this.previewTimer); this.epoch++; this.destroy(); this.recordedEffects.dispose(); this.voices.dispose(); for (const context of this.contexts) this.closeContext(context); }
}
