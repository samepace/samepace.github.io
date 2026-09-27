// SAMEPACE push service worker - only shows notifications, caches nothing
// (so it can never serve an outdated app).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const scope = self.registration.scope;
  event.waitUntil(
    self.registration.showNotification(data.title || 'SAMEPACE', {
      body: data.body || '',
      icon: scope + 'icons/Icon-192.png',
      badge: scope + 'icons/Icon-192.png',
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: new URL(data.url || '', scope).href },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) ||
    self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    for (const client of windows) {
      if (client.url.startsWith(self.registration.scope)) {
        await client.focus();
        if ('navigate' in client) {
          try {
            await client.navigate(url);
          } catch (_) {}
        }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
