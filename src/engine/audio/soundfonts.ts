import { withBase } from '../core/assets';
import { isLocalMusicHost } from './localRoms';
export type SoundFontBank = { id: string; name: string; bytes?: ArrayBuffer; src?: string; stored?: boolean; downloadBytes?: number };
export const publicSoundFont: SoundFontBank = {
  id: 'public:generaluser-gs',
  name: 'GeneralUser GS 2.0.3 (32 MB)',
  src: withBase('assets/audio/soundfonts/GeneralUser-GS.sf2'),
  downloadBytes: 32_319_396
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
async function downloadBank(src: string, size: number, onProgress?: (percent: number) => void) {
  const chunkSize = 2 * 1024 * 1024;
  const abort = new AbortController();
  // Pages can stall on the full bank, but reliably serves bounded byte ranges.
  async function readPart(start: number) {
    const end = Math.min(size, start + chunkSize) - 1;
    for (let attempt = 0; attempt < 2 && !abort.signal.aborted; attempt++) {
      try {
        const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(25_000)]);
        const response = await fetch(src, { headers: { Range: `bytes=${start}-${end}` }, signal });
        const expected = response.status === 200 && start === 0 ? size
          : response.status === 206 && response.headers.get('Content-Range') === `bytes ${start}-${end}/${size}` ? end - start + 1 : 0;
        if (expected) {
          const bytes = await response.arrayBuffer();
          if (bytes.byteLength === expected) return bytes;
        } else await response.body?.cancel();
      } catch { /* Retry a stalled or interrupted range. */ }
    }
    throw new Error('SoundFont could not load.');
  }
  onProgress?.(0);
  try {
    const first = await readPart(0);
    if (first.byteLength === size) { onProgress?.(100); return first; }
    const output = new Uint8Array(size);
    output.set(new Uint8Array(first));
    let loaded = first.byteLength, nextOffset = loaded;
    onProgress?.(Math.floor(loaded * 100 / size));
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (nextOffset < size) {
        const start = nextOffset;
        nextOffset += chunkSize;
        const bytes = await readPart(start);
        output.set(new Uint8Array(bytes), start);
        loaded += bytes.byteLength;
        onProgress?.(Math.floor(loaded * 100 / size));
      }
    }));
    return output.buffer;
  } finally { abort.abort(); }
}
export async function soundFontData(bank: SoundFontBank, onProgress?: (percent: number) => void): Promise<ArrayBuffer> {
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
  if (bank.downloadBytes) return downloadBank(bank.src, bank.downloadBytes, onProgress);
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
