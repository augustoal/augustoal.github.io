const CACHE_NAME = 'acadcal-v3';

// These files are fetched fresh from the network on every load (network-first).
// Cache is only used as offline fallback — so deployments are picked up automatically.
const NETWORK_FIRST = [
  '/academic-calendar/',
  '/academic-calendar/index.html',
  '/academic-calendar/calendar.js',
  '/academic-calendar/manifest.json',
];

self.addEventListener('install', (event) => {
  // Pre-cache so the app works offline from the first visit
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(NETWORK_FIRST))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isAppFile = NETWORK_FIRST.some((path) => url.pathname === path || url.pathname === path + 'index.html');

  if (isAppFile) {
    // Network-first: always try to get fresh version, fall back to cache if offline
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
  // All other requests (cross-origin, etc.) go straight to network
});
