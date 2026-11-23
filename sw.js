// Listentoo was taken down. This worker replaces the app's one on every device that had it:
// it deletes all cached files, unregisters itself and reloads open windows (which now get a 404).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));
