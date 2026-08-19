// Service Worker — Network First strategy
// App sentiasa cuba ambil versi terbaru dari server.
// Tukar VERSI setiap kali update kod supaya
// cache lama dibuang dan app di-refresh automatik.

const VERSI = 'v23'; // ← TUKAR NOMBOR INI SETIAP KALI UPDATE
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
  // Abaikan non-GET dan chrome-extension
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache response yang berjaya
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline — cuba dari cache
        return caches.match(event.request).then(cached => {
          return cached || caches.match('./index.html');
        });
      })
  );
});
