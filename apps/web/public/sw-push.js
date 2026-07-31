/* Ellines EIP — minimal Web Push service worker (payload-less wake). */
self.addEventListener('push', (event) => {
  const title = 'Ellines EIP';
  let body = 'You have a new notification.';
  try {
    if (event.data) {
      const text = event.data.text();
      if (text) body = text.slice(0, 200);
    }
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/brand/icon-192.png',
      badge: '/brand/icon-48.png',
      data: { url: '/app/notifications/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/app/notifications/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
      return undefined;
    }),
  );
});
