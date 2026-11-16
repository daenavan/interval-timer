// Offline support with "Update available" prompts.
// RELEASE RULE: bump VERSION whenever you ship a change. Phones download the new files in the
// background and the app offers "Update"; without a bump, installed phones keep the old version.
const VERSION = 'v3';
const CACHE = `it-${VERSION}`;
const FILES = ['./', './index.html', './timer.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the HTTP cache, so a release never stores stale copies.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

// A new version waits until the page says the user tapped Update.
self.addEventListener('message', (e) => {
  if (e.data === 'update') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('it-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Serve this version's own files, so a page never mixes old and new versions.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE)
      .then((c) => c.match(e.request, { ignoreSearch: true }))
      .then((hit) => hit || fetch(e.request)),
  );
});
