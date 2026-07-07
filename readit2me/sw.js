/* Service worker: app-shell precache only.
 *
 * Audio is deliberately NOT cached here — <audio> issues Range requests that
 * the Cache API mishandles (especially Safari). Audio blobs live in IndexedDB
 * (see js/audio-cache.js) and play via object URLs. Firestore handles its own
 * offline persistence. Firebase SDK/network requests pass straight through.
 */

const CACHE = 'r2m-shell-v1';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/player.css',
  'js/app.js',
  'js/firebase.js',
  'js/store.js',
  'js/capture.js',
  'js/ocr.js',
  'js/stitch.js',
  'js/tts.js',
  'js/audio-cache.js',
  'js/player.js',
  'js/library.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // The Firebase SDK modules from gstatic are needed at boot (top-level
  // imports in js/firebase.js) — cache-first so the app still opens offline
  // even after the browser evicts its HTTP cache. Versioned URLs, immutable.
  if (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(
      caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })),
    );
    return;
  }

  // Only handle same-origin GETs inside our scope; everything else (Firestore,
  // Storage downloads, callable functions) goes to the network untouched.
  if (url.origin !== location.origin) return;
  if (!url.pathname.startsWith(new URL('./', location).pathname)) return;

  // Network-first for the shell so deploys show up promptly; cache fallback
  // keeps the app opening offline. Never cache error responses — a cached
  // 404/500 would pin a broken shell.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })
        .then((hit) => hit || caches.match('index.html'))),
  );
});
