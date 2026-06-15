self.addEventListener('push', function(event) {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch(e) { data = { titulo: 'AutoImport', cuerpo: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.titulo || 'AutoImport', {
      body: data.cuerpo || '',
      icon: '/logo.webp',
      badge: '/logo.webp',
      vibrate: [200, 100, 200],
      data: data,
      requireInteraction: false,
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      if (cs.length) return cs[0].focus();
      return clients.openWindow('/app.html');
    })
  );
});
