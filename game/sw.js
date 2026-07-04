/* =====================================================================
   Meongdex — game/sw.js
   Service worker Fase 1+: cache shell aplikasi (app shell) supaya
   Meongdex & beranda tetap bisa dibuka tanpa internet setelah kunjungan
   pertama. Strategi (diperbarui di batch 22 / Bagian D1 addendum):
     - CDN library (tensorflow, idb, fonts): network-first, fallback cache
     - Aset satu origin yang sering berubah (app.js, style.css, index.html):
       stale-while-revalidate — balas dari cache instan, TAPI sekalgus fetch
       versi network di background dan timpa cache untuk kunjungan
       berikutnya. Kalau konten beda dari cache, panggil showUpdateToast
       lewat postMessage ke client. Dengan pola ini, pemain yang sudah
       install PWA tetap menerima update tanpa perlu menunggu CACHE_VERSION
       dinaikkan tiap batch.
     - Aset satu origin yang jarang berubah (icons, manifest, mascot svg):
       cache-first murni (lebih hemat bandwidth).
     - Navigasi: fallback ke index.html cached untuk offline.
   ===================================================================== */
const CACHE_VERSION = 'meongdex-v16';
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

// Aset yang sering berubah — pakai stale-while-revalidate.
// Update otomatis mengalir ke pemain tanpa perlu bump CACHE_VERSION tiap batch.
const SWR_ASSETS = new Set([
  './app.js',
  './style.css',
  './index.html',
  './',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
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

/**
 * Bandingkan dua response body (cache vs network) lewat byte-length sederhana
 * + ETag/Last-Modified header kalau ada. Cukup akurat untuk deteksi "ada
 * perubahan" tanpa harus baca full body (hemat CPU).
 */
function responsesDiffer(cached, fresh){
  if(!cached || !fresh) return true;
  // bandingkan header cache validator yang paling umum
  const cachedEtag = cached.headers.get('etag');
  const freshEtag = fresh.headers.get('etag');
  if(cachedEtag && freshEtag) return cachedEtag !== freshEtag;
  const cachedLM = cached.headers.get('last-modified');
  const freshLM = fresh.headers.get('last-modified');
  if(cachedLM && freshLM) return cachedLM !== freshLM;
  // fallback: bandingkan content-length
  return cached.headers.get('content-length') !== fresh.headers.get('content-length');
}

/**
 * Stale-while-revalidate: balas cached instan, fetch fresh di background,
 * update cache + notify client kalau isinya berubah.
 */
function staleWhileRevalidate(req){
  return caches.open(CACHE_VERSION).then((cache) =>
    cache.match(req).then((cached) => {
      // network fetch di background (selalu dijalankan, tidak menunggu)
      const networkFetch = fetch(req).then((res) => {
        if(res && res.ok){
          const copy = res.clone();
          // cek apakah konten berubah sebelum notify client
          if(responsesDiffer(cached, res)){
            cache.put(req, copy).then(() => {
              // beri tahu client bahwa ada update tersedia
              self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
                clients.forEach((c) => c.postMessage({ type: 'meongdex-content-updated', url: req.url }));
              });
            });
          } else {
            // tetap update cache (supaya ETag/LM terbaru tersimpan) tanpa notify
            cache.put(req, copy);
          }
        }
        return res;
      }).catch(() => null); // ignore network error di background
      // balas cached kalau ada, kalau tidak tunggu network
      return cached || networkFetch || new Response('', { status: 504 });
    })
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);

  // CDN library (tensorflow, idb, fonts): network-first, fallback cache
  if(url.origin !== self.location.origin){
    event.respondWith(
      fetch(req)
        .then((res) => {
          if(res && res.ok){
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Aset satu origin yang sering berubah: stale-while-revalidate
  // (path relatif terhadap scope SW yang berada di /game/)
  const pathname = url.pathname;
  const isSwrAsset = (
    SWR_ASSETS.has(pathname) ||
    SWR_ASSETS.has('./' + pathname.split('/').pop()) ||
    pathname.endsWith('/app.js') ||
    pathname.endsWith('/style.css') ||
    pathname.endsWith('/index.html') ||
    pathname.endsWith('/game/') ||
    pathname.endsWith('/game')
  );
  if(isSwrAsset){
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Aset satu origin lainnya (icons, mascot, screenshots, og-image, dll):
  // cache-first murni (jarang berubah, hemat bandwidth)
  event.respondWith(
    caches.match(req).then((cached) => {
      if(cached) return cached;
      return fetch(req)
        .then((res) => {
          if(res && res.ok){
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          if(req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504 });
        });
    })
  );
});
