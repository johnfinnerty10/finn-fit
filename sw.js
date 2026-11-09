// Finn Fit service worker: network-first for app files, cache fallback offline.
const CACHE = 'finnfit-v4'; // bump when shipping changes
const FILES = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
  'js/app.js', 'js/store.js', 'js/logic.js', 'js/charts.js', 'js/ui.js', 'js/workout.js', 'js/views.js', 'js/legacy.js', 'js/fooddb.js', 'js/food.js', 'js/addfood.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  // Only handle the app's own files; food database, CDN and AI requests go straight to the network.
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }) // revalidate so updates show up straight away
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
