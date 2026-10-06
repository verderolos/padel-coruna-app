// Función serverless de Vercel: envía notificaciones push de verdad (con cifrado
// y firma VAPID) a los dispositivos suscritos. Google Apps Script no puede hacer este
// cifrado por sí solo, por eso esta pieza vive en Vercel, junto al resto del frontend.
//
// Ruta del archivo en el proyecto: /api/send-push.js
// Vercel la publica automáticamente en: https://tu-dominio.vercel.app/api/send-push
//
// Nota: usamos sintaxis de módulos ES (import/export) porque el package.json del
// proyecto tiene "type": "module" — con require()/module.exports aquí, Vercel falla
// al ejecutar la función.

import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:tu-email@ejemplo.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  // CORS: permitimos que la app (servida desde el mismo dominio de Vercel, pero por
  // si acaso) pueda llamar a esta función sin problemas.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const { subscriptions, title, body, url } = req.body;

    if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
      return res.status(400).json({ ok: false, error: 'Faltan subscriptions' });
    }

    const payload = JSON.stringify({
      title: title || 'Pádel CTC',
      body: body || '',
      url: url || '/'
    });

    // "urgency: high" le pide al servicio de push (FCM, en el caso de Chrome/Android) que entregue
    // el aviso cuanto antes incluso si el móvil lleva un rato en reposo (Doze/App Standby), en vez
    // de dejarlo esperando a la siguiente ventana de mantenimiento del sistema. Sin esto, por
    // defecto se envía con urgencia "normal", que es precisamente el caso que puede explicar que
    // una alerta tarde en llegar o solo aparezca al abrir la app manualmente.
    const opcionesEnvio = { urgency: 'high' };

    const resultados = await Promise.allSettled(
      subscriptions.map((sub) => webpush.sendNotification(sub, payload, opcionesEnvio))
    );

    const enviados = resultados.filter((r) => r.status === 'fulfilled').length;
    const fallidos = resultados
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.status === 'rejected')
      .map((x) => ({
        endpoint: subscriptions[x.i].endpoint,
        error: x.r.reason && x.r.reason.message
      }));

    return res.status(200).json({ ok: true, enviados, fallidos });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
