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
  // "Externa" = cualquier URL que no sea una ruta propia de la app ni apunte a nuestro propio
  // origen. Antes solo se consideraba externo lo que empezaba por http(s)://, así que un enlace
  // con un esquema propio de app (como "playtomic://...") no lo detectaba como externo y, si ya
  // había una pestaña de CTC Padel abierta, el click simplemente la enfocaba en vez de llevar a
  // Playtomic — por eso dejó de "hacer algo" al tocar el aviso de reserva.
  const esRelativaPropia = targetUrl.startsWith('/') || targetUrl.startsWith(self.location.origin);
  const esExterna = !esRelativaPropia;

  event.waitUntil(
    (async () => {
      if (!esExterna) {
        const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            // Si el aviso trae un destino concreto (p.ej. "/?convocatoria=C-001"), llevamos a esa
            // pestaña ya abierta hasta él; con un aviso genérico ("/") solo se enfoca, como antes.
            const traeDestino = targetUrl.indexOf('?') !== -1;
            const enfocada = await client.focus();
            if (traeDestino && enfocada && 'navigate' in enfocada) {
              try { return await enfocada.navigate(targetUrl); } catch (e) { return enfocada; }
            }
            return enfocada;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return;
      }

      // Para enlaces externos con un esquema que no sea http(s) (p.ej. "playtomic://..."),
      // clients.openWindow() no navega de forma fiable: esa API está pensada para abrir pestañas
      // de navegador normales, no para lanzar apps nativas directamente desde el Service Worker.
      // Por eso, en vez de pasarle el esquema propio tal cual, abrimos nuestra propia página
      // "redirect.html" (sí es http/https, así que esto funciona bien) pasándole la URL real como
      // parámetro — es esa página, ya cargada en un contexto de navegador normal, la que hace el
      // salto final con window.location.href, que sí reconoce correctamente el esquema de Android.
      const esHttp = /^https?:\/\//i.test(targetUrl);
      if (self.clients.openWindow) {
        if (esHttp) {
          return self.clients.openWindow(targetUrl);
        }
        const urlPuente = self.location.origin + '/redirect.html?to=' + encodeURIComponent(targetUrl);
        return self.clients.openWindow(urlPuente);
      }
    })()
  );
});
