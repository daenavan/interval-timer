// Offline support. Answers from the cache (so it works offline) and refreshes the cache
// in the background, so the next visit picks up a new release without bumping CACHE.
const CACHE = 'it-v1';
const FILES = ['./', './index.html', './timer.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('it-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request)
      .then((r) => (r.ok && c.put(e.request, r.clone()), r))
      .catch(() => hit);
    if (hit) e.waitUntil(fresh);
    return hit || fresh;
  }));
});
