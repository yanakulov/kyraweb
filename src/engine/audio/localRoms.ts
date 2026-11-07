import type { Mt32Roms } from './romStorage';
import { withBase } from '../core/assets';

export function isLocalMusicHost(hostname = globalThis.location?.hostname) {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname ?? '');
}

/** This is our loopback-only Vite endpoint, never a third-party firmware download. */
export async function readLocalRoms(hostname = globalThis.location?.hostname, request: typeof fetch = fetch): Promise<Mt32Roms | undefined> {
  if (!isLocalMusicHost(hostname)) return;
  const prefix = withBase('__local/mt32/');
  const status = await request(prefix + 'pair.json', { cache: 'no-store' });
  if (status.status === 404) return;
  if (!status.ok || !status.headers.get('content-type')?.includes('application/json')) return;
  if ((await status.json()).available !== true) return;
  const names = ['MT32_CONTROL.ROM', 'MT32_PCM.ROM'];
  const [control, pcm] = await Promise.all(names.map(async name => {
    const response = await request(prefix + name, { cache: 'no-store' });
    if (!response.ok) throw new Error('The local MT-32 ROM pair could not load.');
    return response.arrayBuffer();
  }));
  if (![65536, 131072].includes(control.byteLength) || ![524288, 1048576].includes(pcm.byteLength)) throw new Error('The local MT-32 ROM pair could not load.');
  return { control, pcm, names };
}
