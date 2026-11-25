/* GRAVEWAVE service worker: network first (so updates arrive immediately), cache as an offline fallback.
   Sound effects (assets/sfx/*.mp3) are fetched by js/audio.js after the first tap and land in the
   cache through the fetch handler below, so a second visit plays them offline too. */
const CACHE = 'gravewave-v8';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest']).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // only same-origin GETs; never the multiplayer signalling socket or other hosts
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/ws')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
