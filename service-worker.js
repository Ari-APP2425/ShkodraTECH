// Service worker minimal — kërkohet nga disa shfletues (Chrome/Android)
// që aplikacioni të konsiderohet "i instalueshëm" (PWA).
const CACHE_NAME = 'shkodratech-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Strategji shumë e thjeshtë: provo rrjetin, nëse dështon kthe nga cache (nëse ekziston)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
