// Service Worker para notificaciones push de Pádel CTC.
// Este archivo debe vivir en la carpeta "public" del proyecto (Vite lo copia tal cual
// a la raíz del build), para que quede accesible en https://tu-dominio/sw.js — la
// propia app lo registra con navigator.serviceWorker.register('/sw.js').

self.addEventListener('install', () => {
  // Activamos esta versión del Service Worker en cuanto esté lista, sin esperar a que
  // se cierren las pestañas antiguas.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Llega cuando el servidor (nuestra función /api/send-push en Vercel) envía una
// notificación push de verdad, incluso con la app cerrada.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Pádel CTC', body: event.data ? event.data.text() : 'Tienes una notificación nueva' };
  }

  const title = data.title || 'Pádel CTC 🎾';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    data: { url: data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Al tocar la notificación, llevamos al usuario a la app (reutilizando una pestaña ya
// abierta si existe, en vez de abrir una nueva cada vez) — EXCEPTO cuando el aviso apunta a
// una web externa (p.ej. el aviso de reserva en Playtomic), en cuyo caso navegamos siempre
// a esa URL. Si no distinguiéramos este caso, un aviso de Playtomic con la app CTC Padel ya
// abierta en segundo plano simplemente traería al frente esa pestaña en vez de llevar a
// Playtomic, que es justo lo que no queremos.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  const esExterna = /^https?:\/\//i.test(targetUrl) && !targetUrl.startsWith(self.location.origin);

  event.waitUntil(
    (async () => {
      if (!esExterna) {
        const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});
