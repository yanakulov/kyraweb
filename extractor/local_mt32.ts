import { readFile, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/** Development/preview only. Firmware must never enter public/, dist/ or Git. */
export function localRomMiddleware(root: string, base: string) {
  const prefix = `${base.replace(/\/$/, '')}/__local/mt32/`;
  const sfPrefix = `${base.replace(/\/$/, '')}/__local/soundfonts/`;
  const files = ['MT32_CONTROL.ROM', 'MT32_PCM.ROM'];
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = request.url?.split('?')[0] ?? '';
    const soundfont = path.startsWith(sfPrefix);
    if (!soundfont && !path.startsWith(prefix)) { next(); return; }
    let name: string;
    try { name = decodeURIComponent(path.slice(soundfont ? sfPrefix.length : prefix.length)); } catch { response.statusCode = 404; response.end(); return; }
    const address = request.socket.remoteAddress;
    const origin = request.headers.origin;
    let localHost = false;
    try { localHost = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${request.headers.host}`).hostname); } catch { /* Reject malformed hosts. */ }
    // Do not expose private firmware to LAN clients or cross-origin requests.
    if (!localHost || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '') ||
      request.headers['sec-fetch-site'] === 'cross-site' ||
      origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}` ||
      !['GET', 'HEAD'].includes(request.method ?? '') || (soundfont ? name !== 'list.json' && !/^[\w .+-]{1,120}\.sf2$/i.test(name) : !['pair.json', ...files].includes(name))) {
      response.statusCode = 404; response.end(); return;
    }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    try {
      if (soundfont) {
        const directory = join(root, '.local', 'soundfonts');
        const names = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile() && /^[\w .+-]{1,120}\.sf2$/i.test(entry.name)).slice(0, 32).map(entry => entry.name);
        if (name !== 'list.json' && !names.includes(name)) throw new Error('Unknown bank');
        if (name !== 'list.json' && (await lstat(join(directory, name))).size > 64 * 1024 * 1024) throw new Error('Bank too large');
        const body = name === 'list.json' ? Buffer.from(JSON.stringify(names)) : await readFile(join(directory, name));
        response.setHeader('Content-Type', name === 'list.json' ? 'application/json' : 'application/octet-stream');
        response.setHeader('Content-Length', body.length); response.end(request.method === 'HEAD' ? undefined : body); return;
      }
      const pair = await Promise.all(files.map(file => readFile(join(root, '.local', 'mt32', file))));
      if (![65536, 131072].includes(pair[0].length) || ![524288, 1048576].includes(pair[1].length)) throw new Error('Invalid local ROM sizes');
      const body = name === 'pair.json' ? Buffer.from(JSON.stringify({ available: true })) : pair[files.indexOf(name)];
      response.setHeader('Content-Type', name === 'pair.json' ? 'application/json' : 'application/octet-stream');
      response.setHeader('Content-Length', body.length);
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.statusCode = 404; response.end();
    }
  };
}

export function localMt32Plugin(): Plugin {
  return {
    name: 'private-local-mt32',
    configureServer(server) { server.middlewares.use(localRomMiddleware(server.config.root, server.config.base)); },
    configurePreviewServer(server) { server.middlewares.use(localRomMiddleware(server.config.root, server.config.base)); }
  };
}
