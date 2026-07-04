/* =====================================================================
   Meongdex — game/sw.js
   Service worker Fase 1: cache shell aplikasi (app shell) supaya
   Meongdex & beranda tetap bisa dibuka tanpa internet setelah kunjungan
   pertama. Strategi: cache-first untuk app shell, network-first untuk
   CDN library (dengan fallback cache), dan no-cache untuk geo/kamera.
   ===================================================================== */
const CACHE_VERSION = 'meongdex-v14';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  '../assets/mascot/si-oren.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // cache tiap aset individually, abaikan yang gagal (mis. font CDN)
      Promise.allSettled(APP_SHELL.map((u) => cache.add(u)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // CDN library (tensorflow, idb, fonts): network-first, fallback cache
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // app shell: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          // fallback ke index.html untuk navigasi
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504 });
        });
    })
  );
});
