// ════════════════════════════════════════
// SERVICE WORKER — Istigfar App
// Tukar VERSI setiap kali update kod supaya
// Android ambil fail terbaru dari network
// ════════════════════════════════════════

const VERSI = 'v10'; // ← TUKAR NOMBOR INI SETIAP KALI UPDATE
const CACHE_NAME = `istigfar-${VERSI}`;

// Fail yang nak dicache untuk offline
const FAIL_STATIK = [
  './',
  './index.html',
  './manifest.webmanifest',
  './backgroundmusic.mp3',
  './SuperSayaz.mp3',
];

// ── INSTALL: Cache fail statik ──
self.addEventListener('install', event => {
  console.log(`[SW] Install ${CACHE_NAME}`);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FAIL_STATIK.map(url => new Request(url, { cache: 'reload' })));
    }).catch(err => console.log('[SW] Cache gagal:', err))
  );
  // Paksa SW baru ambil alih terus tanpa tunggu tab tutup
  self.skipWaiting();
});

// ── ACTIVATE: Buang cache lama ──
self.addEventListener('activate', event => {
  console.log(`[SW] Aktif ${CACHE_NAME}`);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Buang cache lama:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH: Network-first strategy ──
// Cuba ambil dari network dulu.
// Kalau network gagal (offline), baru guna cache.
self.addEventListener('fetch', event => {
  // Abaikan request bukan GET
  if (event.request.method !== 'GET') return;

  // Abaikan Firebase, YouTube, dan external API
  const url = new URL(event.request.url);
  const isExternal = !url.hostname.includes('github.io') &&
                     !url.hostname.includes('localhost') &&
                     !url.hostname.includes('127.0.0.1') &&
                     url.protocol !== 'chrome-extension:';

  if (isExternal) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Simpan salinan response ke cache
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network gagal — guna cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Kalau tiada dalam cache langsung, return halaman utama
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
