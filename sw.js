const VERSION = 'listentoo-v2';
const IMG = 'listentoo-img-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/main.js', 'js/util.js', 'js/api.js', 'js/library.js', 'js/player.js', 'js/ui.js', 'js/views.js',
  'icons/icon.svg', 'icons/cover.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== IMG).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);

  // App shell: network first (so updates land quickly), cache fallback offline.
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(async () => (await caches.match(req, { ignoreSearch: true })) || caches.match('index.html')));
    return;
  }

  // Cover art and fonts: cache first.
  if (req.destination === 'image' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(caches.open(IMG).then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') { cache.put(req, res.clone()); trim(cache, 600); }
        return res;
      } catch { return Response.error(); }
    }));
  }
  // Everything else (catalog API, audio, YouTube): straight to the network.
});
