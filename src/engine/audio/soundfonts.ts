import { withBase } from '../core/assets';
import { isLocalMusicHost } from './localRoms';
export type SoundFontBank = { id: string; name: string; bytes?: ArrayBuffer; src?: string; stored?: boolean };
export const publicSoundFont: SoundFontBank = {
  id: 'public:generaluser-gs',
  name: 'GeneralUser GS 2.0.3 (32 MB)',
  src: withBase('assets/audio/soundfonts/GeneralUser-GS.sf2')
};
export const MAX_SOUNDFONT_BYTES = 64 * 1024 * 1024;
export function validateSoundFont(bytes: ArrayBuffer) {
  const b = new Uint8Array(bytes), v = new DataView(bytes);
  const text = (at: number) => String.fromCharCode(...b.subarray(at, at + 4));
  if (b.length < 64 || b.length > MAX_SOUNDFONT_BYTES || text(0) !== 'RIFF' || text(8) !== 'sfbk' || v.getUint32(4, true) + 8 !== b.length) throw new Error('Choose a valid SF2 SoundFont, up to 64 MiB.');
  let samples = false, presets = false;
  for (let at = 12; at < b.length;) {
    if (at + 8 > b.length) throw new Error('Truncated SoundFont.');
    const end = at + 8 + v.getUint32(at + 4, true);
    if (end > b.length) throw new Error('Truncated SoundFont.');
    if (text(at) === 'LIST') {
      if (end < at + 12) throw new Error('Truncated SoundFont.');
      if (text(at + 8) === 'sdta') samples = true;
      if (text(at + 8) === 'pdta') presets = true;
    }
    const next = end + ((end - at) & 1);
    if (next > b.length) throw new Error('Truncated SoundFont.');
    at = next;
  }
  if (!samples || !presets) throw new Error('SoundFont samples or presets are missing.');
}
async function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('kyrandia-soundfonts', 1);
    let blocked = false;
    r.onupgradeneeded = () => { r.result.createObjectStore('banks', { keyPath: 'id' }); r.result.createObjectStore('metadata', { keyPath: 'id' }); };
    r.onsuccess = () => { if (blocked) r.result.close(); else resolve(r.result); };
    r.onerror = () => reject(new Error('SoundFont storage is unavailable.'));
    r.onblocked = () => { blocked = true; reject(new Error('Close other Kyrandia tabs to use SoundFont storage.')); };
  });
}
export async function readSoundFonts(): Promise<SoundFontBank[]> {
  const database = await db();
  try { return await new Promise((resolve, reject) => {
    const t = database.transaction('metadata', 'readonly'), r = t.objectStore('metadata').getAll();
    t.oncomplete = () => resolve(r.result); t.onabort = () => reject(new Error('SoundFont storage is unavailable.'));
  }); } finally { database.close(); }
}
export async function storeSoundFont(bank: SoundFontBank) {
  const database = await db();
  try { await new Promise<void>((resolve, reject) => {
    const t = database.transaction(['banks', 'metadata'], 'readwrite'); t.objectStore('banks').put(bank);
    t.objectStore('metadata').put({ id: bank.id, name: bank.name, stored: true });
    t.oncomplete = () => resolve(); t.onabort = () => reject(new Error('SoundFont storage is unavailable.'));
  }); } finally { database.close(); }
}
export async function soundFontData(bank: SoundFontBank): Promise<ArrayBuffer> {
  if (bank.bytes) return bank.bytes;
  if (bank.stored) {
    const database = await db();
    try { return await new Promise((resolve, reject) => {
      const t = database.transaction('banks', 'readonly'), r = t.objectStore('banks').get(bank.id);
      t.oncomplete = () => r.result?.bytes instanceof ArrayBuffer ? resolve(r.result.bytes) : reject(new Error('Saved SoundFont is missing.'));
      t.onabort = () => reject(new Error('SoundFont storage is unavailable.'));
    }); } finally { database.close(); }
  }
  if (!bank.src) throw new Error('Saved SoundFont is missing.');
  const response = await fetch(bank.src); if (!response.ok) throw new Error('SoundFont could not load.');
  return response.arrayBuffer();
}
export async function localSoundFonts(): Promise<SoundFontBank[]> {
  if (!isLocalMusicHost()) return [];
  const response = await fetch(withBase('__local/soundfonts/list.json'), { cache: 'no-store' });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return [];
  const entries = await response.json();
  if (!Array.isArray(entries) || entries.length > 32) return [];
  return entries.filter((name: unknown): name is string => typeof name === 'string' && /^[\w .+-]{1,120}\.sf2$/i.test(name)).map(name => ({ id: `local:${name}`, name: name.replace(/\.sf2$/i, ''), src: withBase(`__local/soundfonts/${encodeURIComponent(name)}`) }));
}
