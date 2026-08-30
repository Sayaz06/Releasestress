// Service Worker — Network First strategy
// App sentiasa cuba ambil versi terbaru dari server.
// Tukar VERSI setiap kali update kod supaya
// cache lama dibuang dan app di-refresh automatik.

const VERSI = 'v78'; // ← TUKAR NOMBOR INI SETIAP KALI UPDATE
const CACHE_NAME = `istigfar-${VERSI}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// Install — cache assets asas
self.addEventListener('install', event => {
  console.log(`[SW] Install ${CACHE_NAME}`);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate — buang cache lama
self.addEventListener('activate', event => {
  console.log(`[SW] Aktif ${CACHE_NAME}`);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log(`[SW] Buang cache lama: ${key}`);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch — Network First, fallback ke cache
self.addEventListener('fetch', event => {
  // Abaikan request bukan HTTP (chrome-extension dll)
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Simpan response baru ke cache
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline — guna cache
        return caches.match(event.request).then(cached => {
          return cached || caches.match('./index.html');
        });
      })
  );
});
