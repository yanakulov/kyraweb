export type Mt32Roms = { control: ArrayBuffer; pcm: ArrayBuffer; names: string[] };

export async function readRomFiles(files: File[]): Promise<Mt32Roms> {
  if (files.length !== 2) throw new Error('Choose one Control ROM and one PCM ROM.');
  const control = files.find(file => [65536, 131072].includes(file.size));
  const pcm = files.find(file => [524288, 1048576].includes(file.size));
  if (!control || !pcm) throw new Error('Choose one Control ROM and one PCM ROM.');
  return { control: await control.arrayBuffer(), pcm: await pcm.arrayBuffer(), names: [control.name, pcm.name] };
}

/** Browser imports remain on this device; they are never uploaded or placed in public/. */
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('kyrandia-mt32', 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore('roms');
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(new Error('ROM storage is unavailable. Music works for this visit only.'));
    request.onblocked = () => { blocked = true; reject(new Error('Close other Kyrandia tabs to use ROM storage.')); };
  });
}
export async function readRoms(): Promise<Mt32Roms | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('roms', 'readonly');
      const request = transaction.objectStore('roms').get('pair');
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(new Error('ROM storage is unavailable. Music works for this visit only.'));
    });
  } finally { db.close(); }
}
export async function storeRoms(roms: Mt32Roms | null) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('roms', 'readwrite'), store = transaction.objectStore('roms');
      if (roms) store.put(roms, 'pair'); else store.delete('pair');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(new Error('ROM storage is unavailable. Music works for this visit only.'));
    });
  } finally { db.close(); }
}
