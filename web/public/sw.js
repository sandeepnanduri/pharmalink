// PharmaLink installable PWA shell (product roadmap Phase 1, AGT-009).
// Hand-written, not next-pwa — avoids reconciling a generated worker
// against next.config.ts's existing CSP, which declares no worker-src.
//
// Scope: makes the site installable and resilient to a brief network drop.
// Deliberately NOT an offline data cache — RFQs/quotes/mandates always need
// a live, authenticated read, so caching their HTML would risk serving a
// stale or wrong-user page. Static assets only.

const CACHE_NAME = 'pharmalink-shell-v1';
const CORE_ASSETS = ['/icon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first for everything: never let a stale cached page shadow a real
// (possibly per-user, possibly locale-specific) response. The cache exists
// only as a fallback when the network is briefly unreachable, and only for
// the static core assets above — never for a navigation/HTML request, which
// always needs a live, authenticated render.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!CORE_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
