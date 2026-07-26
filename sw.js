/* Apex Operations - offline support
   Network-first for the app page itself: always tries to fetch the latest
   apex-operations.html first, so updates show up immediately on the next
   load with a connection. Only falls back to the cached copy if the network
   request fails entirely (no signal) - that's what keeps the app usable in
   basements, mechanical rooms, and rural sites with zero bars.

   Cache-first for static library assets (the jsPDF script) that essentially
   never change, so those load instantly and don't waste data every visit.

   Any SOP PDF opened at least once while online gets cached too, so it's
   still available offline after that - nothing is bulk pre-downloaded.
*/

const CACHE_NAME = 'apex-ops-v2';
const CORE_ASSETS = [
  './',
  './apex-operations.html',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// Assets that rarely change - safe to serve from cache first
const STATIC_ASSET_PATTERNS = [
  /cdnjs\.cloudflare\.com/,
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

function isStaticAsset(url) {
  return STATIC_ASSET_PATTERNS.some(pattern => pattern.test(url));
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const isNavigation = event.request.mode === 'navigate'
    || event.request.destination === 'document';
  const isHtmlPage = event.request.url.endsWith('.html') || isNavigation;

  if (isHtmlPage && !isStaticAsset(event.request.url)) {
    // Network-first: always try to get the latest version. Only fall back
    // to cache if the network request fails outright (offline).
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() =>
        caches.open(CACHE_NAME).then(cache => cache.match(event.request)).then(cached =>
          cached || new Response(
            'Offline and this page has not been opened yet on this device, so nothing is cached for it.',
            { status: 503, headers: { 'Content-Type': 'text/plain' } }
          )
        )
      )
    );
    return;
  }

  // Everything else (PDFs, the jsPDF library, etc.): cache-first,
  // refresh-in-background - these don't change on their own and this keeps
  // them instant and available offline once opened once.
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
        networkFetch;
        return cached;
      }

      const fresh = await networkFetch;
      return fresh || new Response(
        'Offline and this file has not been opened yet on this device, so nothing is cached for it.',
        { status: 503, headers: { 'Content-Type': 'text/plain' } }
      );
    })
  );
});
