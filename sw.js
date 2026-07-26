/* Apex Operations - offline support
   Cache-first, refresh-in-background: if a page (the app itself, or any SOP PDF
   that's been opened at least once while online) is already cached, it's served
   instantly and works with zero signal. A fresh copy is still fetched in the
   background whenever there's a connection, so cached content doesn't go stale.
   Nothing is cached until it's actually been opened once while online - there's
   no bulk pre-download of every SOP up front. */

const CACHE_NAME = 'apex-ops-v1';
const CORE_ASSETS = [
  './',
  './apex-operations.html',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {}) // don't block install if one core asset fails to fetch right now
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);

      const networkFetch = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          cache.put(event.request, response.clone());
        }
        return response;
      }).catch(() => null);

      if (cached) {
        // Serve the cached copy immediately; let the network fetch update
        // the cache quietly in the background for next time.
        networkFetch;
        return cached;
      }

      const fresh = await networkFetch;
      return fresh || new Response(
        'Offline and this page has not been opened yet on this device, so nothing is cached for it.',
        { status: 503, headers: { 'Content-Type': 'text/plain' } }
      );
    })
  );
});
