const VERSION = 'listentoo-v3';
const IMG = 'listentoo-img-v1';
const LIBS = 'listentoo-libs-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/main.js', 'js/util.js', 'js/api.js', 'js/library.js', 'js/player.js', 'js/ui.js', 'js/views.js', 'js/cloud.js', 'js/config.js', 'js/themes.js',
  'icons/icon.svg', 'icons/cover.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => ![VERSION, IMG, LIBS].includes(k)).map(k => caches.delete(k))))
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

  // App shell: network first so updates land quickly; cache when offline.
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(async () => (await caches.match(req, { ignoreSearch: true })) || caches.match('index.html')));
    return;
  }

  // Versioned libraries (Supabase client) and fonts: cache first.
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(caches.open(LIBS).then(async cache => {
      const hit = await cache.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res;
    }));
    return;
  }

  // Cover art: cache first, bounded.
  if (req.destination === 'image') {
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
  // Catalog API, Supabase, audio and YouTube go straight to the network.
});

// "Now playing" notification buttons -> forward to the open app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const action = e.action;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (action && wins.length) { wins.forEach(w => w.postMessage({ media: action })); return; }
    if (wins.length) return wins[0].focus();
    return self.clients.openWindow('./');
  })());
});
