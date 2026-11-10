const offlinePage = '/offline.html';
const title = '/assets/interface/kyrandia-title.webp';
const cacheName = 'kyrandia-offline-v2';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([offlinePage, title])));
});

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match(offlinePage, { cacheName })) ?? Response.error()));
  } else if (event.request.url === self.location.origin + title) {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match(title, { cacheName })) ?? Response.error()));
  }
});
