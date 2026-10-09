import React, { useState, useEffect, useMemo, useRef } from 'react';

// NUEVO (trazabilidad: quién hace qué): a toda petición POST de la app a Apps Script (cuerpo JSON con
// "action") se le añade automáticamente el usuario que la hace (actorId / actorName), leído en ese
// momento de la sesión guardada. El backend lo usa para anotar "creado por / última modificación
// por" en cada partido y para llevar el registro de la hoja "Auditoria". Se hace aquí, en un único
// sitio, para no tener que tocar los más de cincuenta fetch repartidos por la app. No toca ninguna
// otra petición (p.ej. la de /api/send-push no lleva "action").
(function instalarActorEnPeticiones() {
  if (typeof window === 'undefined' || window.__ctcActorInstalado) return;
  window.__ctcActorInstalado = true;
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      if (init && String(init.method || '').toUpperCase() === 'POST' && typeof init.body === 'string' && init.body.charAt(0) === '{') {
        const cuerpo = JSON.parse(init.body);
        if (cuerpo && typeof cuerpo.action === 'string' && !cuerpo.actorId) {
          const u = JSON.parse(localStorage.getItem('padel_current_user') || 'null');
          if (u && u.id) {
            cuerpo.actorId = u.id;
            cuerpo.actorName = u.name || '';
            init = { ...init, body: JSON.stringify(cuerpo) };
          }
        }
      }
    } catch (e) { /* si algo falla, la petición sale tal cual */ }
    return fetchOriginal(input, init);
  };
})();

// ============================================================================
// INDICADOR GLOBAL DE ACTIVIDAD
// Toda petición POST de la app a Apps Script pasa por aquí (mismo punto que el de arriba), así
// cualquier acción —presente o futura— enseña lo que está pasando sin tocar cada pantalla:
//  · barra de progreso arriba + aviso "Guardando…" mientras el servidor trabaja;
//  · "Sigue guardando…" si tarda más de lo normal, y un aviso si parece que no responde;
//  · "✓ Guardado" al terminar;
//  · si falla (sin conexión, o el servidor responde ok:false), aviso rojo y recarga automática de
//    los datos del servidor, para que la pantalla no se quede mostrando un cambio que no se guardó.
// Las acciones que ya enseñan su propio error (formularios, modales…) no duplican el aviso rojo.
// ============================================================================
const ETIQUETAS_ACCION = {
  ACTUALIZAR_NIVEL_JUGADOR: ['Guardando el nivel', 'el nivel'],
  REGISTRAR_JUGADOR: ['Creando tu cuenta', 'el alta'],
  APROBAR_JUGADOR: ['Aprobando el alta', 'la aprobación del alta'],
  RECHAZAR_JUGADOR: ['Rechazando el alta', 'el rechazo del alta'],
  PROMOVER_JUGADOR_GRUPO: ['Cambiando de grupo', 'el cambio de grupo'],
  ACTUALIZAR_DATOS_PERFIL: ['Guardando tu perfil', 'tu perfil'],
  SUBIR_FOTO: ['Subiendo la foto', 'la foto'],
  ELIMINAR_PARTIDO: ['Eliminando el partido', 'la eliminación del partido'],
  CREAR_PARTIDO_PLAYTOMIC: ['Creando el partido', 'el partido'],
  ACTUALIZAR_PLAYTOMIC_PARTIDO: ['Actualizando el partido', 'la actualización del partido'],
  MODIFICAR_JUGADORES_MANUAL: ['Guardando los jugadores', 'el cambio de jugadores'],
  VINCULAR_JUGADOR: ['Vinculando al jugador', 'la vinculación del jugador'],
  APUNTARSE_SOLO_CENA: ['Guardando tu cena', 'tu cena'],
  ACTUALIZAR_CENA: ['Guardando la cena', 'la cena'],
  CAMBIAR_PAREJA_JUGADOR: ['Guardando el cambio de pareja', 'el cambio de pareja'],
  GUARDAR_RESULTADO: ['Guardando el resultado', 'el resultado'],
  GUARDAR_TORNEO: ['Guardando el torneo', 'el torneo'],
  ELIMINAR_TORNEO: ['Eliminando el torneo', 'la eliminación del torneo'],
  ACTUALIZAR_CENA_TORNEO: ['Guardando la cena del torneo', 'la cena del torneo'],
  SOLICITAR_UNION_CLUB: ['Enviando la solicitud', 'la solicitud'],
  VALIDAR_SOLICITUD_CLUB: ['Guardando la validación', 'la validación'],
  ACTUALIZAR_EQUIPO_JUGADOR: ['Guardando el equipo', 'el equipo'],
  ACTUALIZAR_EQUIPOS_MASIVO: ['Guardando los equipos', 'los equipos'],
  VALIDAR_CAPITAN: ['Guardando tu visto bueno', 'tu visto bueno'],
  APROBAR_EQUIPOS: ['Aprobando los equipos', 'la aprobación de los equipos'],
  GUARDAR_PREFERENCIA_LUNES: ['Guardando tus avisos', 'tus avisos'],
  GUARDAR_PREFERENCIA_CONVOCATORIAS: ['Guardando tus avisos', 'tus avisos'],
  GUARDAR_ALERTA_RESERVA: ['Guardando el aviso de reserva', 'el aviso de reserva'],
  ELIMINAR_ALERTA_RESERVA: ['Quitando el aviso de reserva', 'el borrado del aviso'],
  GUARDAR_TICKET_CENA: ['Guardando el ticket', 'el ticket'],
  OCR_TICKET_CENA: ['Leyendo el ticket', 'la lectura del ticket'],
  CREAR_CONVOCATORIA: ['Enviando la propuesta', 'la propuesta'],
  RESPONDER_CONVOCATORIA: ['Enviando tu respuesta', 'tu respuesta'],
  ASIGNAR_CONVOCATORIA: ['Asignando la plaza', 'la plaza'],
  CANCELAR_CONVOCATORIA: ['Cancelando la propuesta', 'la cancelación'],
  CONVERTIR_CONVOCATORIA: ['Enlazando el partido', 'el enlace con el partido'],
  GUARDAR_DISPONIBILIDAD: ['Publicando tu disponibilidad', 'tu disponibilidad'],
  ELIMINAR_DISPONIBILIDAD: ['Retirando tu disponibilidad', 'la retirada de tu disponibilidad']
};
// Acciones de fondo que no merecen ningún aviso.
const ACCIONES_SILENCIOSAS = {
  VERIFICAR_PIN: 1, OBTENER_SUSCRIPCIONES_PUSH: 1, GUARDAR_SUSCRIPCION_PUSH: 1, MARCAR_VISTO_TORNEO: 1
};
// Acciones cuyo código ya enseña su propio error (y deshace el cambio): aquí solo se muestra el progreso.
const ACCIONES_CON_AVISO_PROPIO = {
  REGISTRAR_JUGADOR: 1, CREAR_PIN_JUGADOR: 1, OCR_TICKET_CENA: 1, GUARDAR_TICKET_CENA: 1,
  CREAR_PARTIDO_PLAYTOMIC: 1, ACTUALIZAR_PLAYTOMIC_PARTIDO: 1, MODIFICAR_JUGADORES_MANUAL: 1,
  CREAR_CONVOCATORIA: 1, RESPONDER_CONVOCATORIA: 1,
  ASIGNAR_CONVOCATORIA: 1, CANCELAR_CONVOCATORIA: 1, CONVERTIR_CONVOCATORIA: 1,
  GUARDAR_DISPONIBILIDAD: 1
};
// Torneos: si falla el guardado NO se recarga solo (la recarga machacaría lo que el usuario acaba de
// montar en pantalla); se avisa y se deja la pantalla como está para poder repetirlo.
const ACCIONES_SIN_RESINCRONIZAR = {
  GUARDAR_TORNEO: 1, ELIMINAR_TORNEO: 1, ACTUALIZAR_CENA_TORNEO: 1, SOLICITAR_UNION_CLUB: 1,
  VALIDAR_SOLICITUD_CLUB: 1, ACTUALIZAR_EQUIPO_JUGADOR: 1, ACTUALIZAR_EQUIPOS_MASIVO: 1,
  VALIDAR_CAPITAN: 1, APROBAR_EQUIPOS: 1
};
const UMBRAL_MOSTRAR_MS = 300;      // por debajo, la acción es tan rápida que un aviso solo parpadearía
const UMBRAL_LENTO_MS = 6000;       // "tarda más de lo normal"
const UMBRAL_SIN_RESPUESTA_MS = 30000;

const actividadRed = (() => {
  let ops = [];
  let mensaje = null;
  let contador = 0;
  let inicios = 0;
  let temporizadorMensaje = null;
  const oyentes = new Set();
  const avisar = () => oyentes.forEach(f => { try { f(); } catch { /* un oyente roto no afecta al resto */ } });
  const poner = (m, ms) => {
    mensaje = m;
    if (temporizadorMensaje) clearTimeout(temporizadorMensaje);
    temporizadorMensaje = ms ? setTimeout(() => { mensaje = null; avisar(); }, ms) : null;
    avisar();
  };
  return {
    suscribir(f) { oyentes.add(f); return () => oyentes.delete(f); },
    leer: () => ({ ops, mensaje }),
    // Para saber si una recarga de datos pudo quedarse "vieja": había cambios en curso al pedirla,
    // se lanzó alguno mientras volvía, o siguen en curso al recibirla.
    marca: () => inicios,
    hayCambiosEnCurso: () => ops.some(o => !o.silenciosa),
    huboInicioDesde: (m) => inicios !== m,
    iniciar(accion) {
      const [gerundio, sustantivo] = ETIQUETAS_ACCION[accion] || ['Guardando el cambio', 'el cambio'];
      const op = {
        id: ++contador, accion, gerundio, sustantivo, inicio: Date.now(),
        silenciosa: Boolean(ACCIONES_SILENCIOSAS[accion]), propia: Boolean(ACCIONES_CON_AVISO_PROPIO[accion])
      };
      ops = [...ops, op];
      inicios++;
      avisar();
      return op;
    },
    terminar(op, ok, detalle) {
      if (!ops.some(o => o.id === op.id)) return;
      ops = ops.filter(o => o.id !== op.id);
      if (op.silenciosa) { avisar(); return; }
      const duro = Date.now() - op.inicio;
      if (!ok) {
        if (op.propia) { avisar(); return; }
        if (ACCIONES_SIN_RESINCRONIZAR[op.accion]) {
          poner({
            tipo: 'error',
            texto: `No se ha podido guardar ${op.sustantivo} en el servidor${detalle ? ` (${String(detalle).slice(0, 90)})` : ''}. En tu pantalla se queda como lo has dejado: revisa la conexión y repite el cambio, o es posible que no aparezca a los demás.`
          }, 12000);
        } else {
          poner({
            tipo: 'error',
            texto: `No se ha podido guardar ${op.sustantivo}${detalle ? ` (${String(detalle).slice(0, 90)})` : ''}. He vuelto a cargar los datos del servidor para que veas cómo han quedado.`
          }, 9000);
          try { window.dispatchEvent(new Event('ctc:resincronizar')); } catch { /* sin window */ }
        }
        return;
      }
      if (duro >= UMBRAL_MOSTRAR_MS && !ops.some(o => !o.silenciosa)) poner({ tipo: 'ok', texto: '✓ Guardado' }, 1600);
      else avisar();
    },
    descartar() { poner(null, 0); }
  };
})();

(function instalarSeguimientoDeActividad() {
  if (typeof window === 'undefined' || window.__ctcActividadInstalada) return;
  window.__ctcActividadInstalada = true;
  const fetchPrevio = window.fetch.bind(window);
  window.fetch = (input, init) => {
    let accion = '';
    try {
      if (init && String(init.method || '').toUpperCase() === 'POST' && typeof init.body === 'string' && init.body.charAt(0) === '{') {
        const cuerpo = JSON.parse(init.body);
        if (cuerpo && typeof cuerpo.action === 'string') accion = cuerpo.action;
      }
    } catch { /* sin seguimiento */ }
    if (!accion) return fetchPrevio(input, init);
    const op = actividadRed.iniciar(accion);
    const promesa = fetchPrevio(input, init);
    promesa.then(async (resp) => {
      let ok = resp.ok;
      let detalle = ok ? '' : `error ${resp.status}`;
      try {
        const json = await resp.clone().json();
        if (json && json.ok === false) { ok = false; detalle = json.error || detalle; }
      } catch { /* respuesta que no es JSON: nos fiamos del código HTTP */ }
      actividadRed.terminar(op, ok, detalle);
    }, (err) => {
      actividadRed.terminar(op, false, err && err.name === 'AbortError' ? 'se canceló por tardar demasiado' : 'sin conexión');
    });
    return promesa;
  };
})();

function IndicadorActividad() {
  const [estado, setEstado] = useState(() => actividadRed.leer());
  const [, setTick] = useState(0);
  useEffect(() => actividadRed.suscribir(() => setEstado(actividadRed.leer())), []);

  const pendientes = estado.ops.filter(o => !o.silenciosa);
  const hayPendientes = pendientes.length > 0;

  // Refresco periódico solo mientras hay algo en curso (para el "tarda más de lo normal").
  useEffect(() => {
    if (!hayPendientes) return undefined;
    const iv = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(iv);
  }, [hayPendientes]);

  // Si se intenta cerrar la pestaña con algo todavía guardándose, el navegador avisa.
  useEffect(() => {
    if (!hayPendientes) return undefined;
    const aviso = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [hayPendientes]);

  const ahora = Date.now();
  const visibles = pendientes.filter(o => ahora - o.inicio >= UMBRAL_MOSTRAR_MS);
  const masAntigua = visibles.reduce((max, o) => Math.max(max, ahora - o.inicio), 0);
  const lento = masAntigua >= UMBRAL_LENTO_MS;
  const sinRespuesta = masAntigua >= UMBRAL_SIN_RESPUESTA_MS;

  let texto = '';
  if (visibles.length === 1) texto = `${visibles[0].gerundio}…`;
  else if (visibles.length > 1) {
    // Varias peticiones de lo mismo (p.ej. un intercambio de pareja son dos) se cuentan como una sola cosa.
    const mismaAccion = visibles.every(o => o.accion === visibles[0].accion);
    texto = mismaAccion ? `${visibles[0].gerundio}…` : `Guardando ${visibles.length} cambios…`;
  }
  if (sinRespuesta) texto = 'El servidor no responde. Puede que el cambio no se haya guardado: no cierres la app todavía.';
  else if (lento) texto = `${texto} Está tardando más de lo normal, sigue en marcha.`;

  const mensaje = !visibles.length ? estado.mensaje : null;
  if (!visibles.length && !mensaje) return null;

  return (
    <>
      <style>{'@keyframes ctc-barra-actividad{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}'}</style>
      {visibles.length > 0 && (
        <div className="fixed top-0 left-0 right-0 h-1 z-[90] overflow-hidden bg-[#efd9a9]/40" aria-hidden="true">
          <div className="h-full w-2/5 bg-[#2c4a66]" style={{ animation: 'ctc-barra-actividad 1.1s ease-in-out infinite' }} />
        </div>
      )}
      <div className="fixed bottom-4 left-0 right-0 z-[90] flex justify-center px-4 pointer-events-none" role="status" aria-live="polite">
        {visibles.length > 0 ? (
          <div className={`pointer-events-auto max-w-sm w-full rounded-2xl shadow-lg border px-3.5 py-2.5 flex items-center gap-2.5 text-[12px] font-bold ${sinRespuesta ? 'bg-[#f6ede6] border-[#ead3bf] text-[#6b3f29]' : lento ? 'bg-[#faf3e7] border-[#efd9a9] text-[#6b4d1c]' : 'bg-white border-stone-200 text-stone-700'}`}>
            <span className="inline-block w-4 h-4 rounded-full border-2 border-stone-300 border-t-[#2c4a66] animate-spin shrink-0" />
            <span className="min-w-0">{texto}</span>
          </div>
        ) : mensaje && (
          <div className={`pointer-events-auto max-w-sm w-full rounded-2xl shadow-lg border px-3.5 py-2.5 flex items-start gap-2 text-[12px] font-bold ${mensaje.tipo === 'error' ? 'bg-[#f6ede6] border-[#ead3bf] text-[#6b3f29]' : 'bg-[#eef4f0] border-[#c7ddc9] text-[#2f5d50]'}`}>
            <span className="min-w-0 flex-1">{mensaje.tipo === 'error' ? '⚠️ ' : ''}{mensaje.texto}</span>
            {mensaje.tipo === 'error' && <button onClick={() => actividadRed.descartar()} className="shrink-0 font-black" aria-label="Cerrar aviso">✕</button>}
          </div>
        )}
      </div>
    </>
  );
}

// URL REAL DE TU BACKEND
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxkd-BmLpYxmLtev5wcxwsyda94bG1mFW9gtDpEAgsmhV1HCfDwn2-syPDEvBUPwiiiGw/exec';

// NUEVO: notificaciones push (Web Push). La clave pública VAPID es segura de tener aquí,
// en el propio código del navegador — identifica a esta app ante los servicios de
// notificaciones (Google/Apple/Mozilla), no permite enviar nada por sí sola. La clave
// PRIVADA (la que sí firma los envíos) vive solo como variable de entorno en Vercel,
// dentro de la función /api/send-push — nunca aquí.
const VAPID_PUBLIC_KEY = 'BI0T3sC418hVf-mhKf9bE9dVxl39r-0y4G19UadW50HGC10GFyc9kXHxvTJ2YRPV2cU9OOB0Jlul2w1TI6pqARg';

// Conversión estándar de la clave VAPID (texto base64url) al formato de bytes que pide
// PushManager.subscribe(). Es el mismo snippet que usa la documentación oficial de Web Push.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

const FALLBACK_USERS = [];
const FALLBACK_MATCHES = [];

// NUEVO (control de acceso del administrador): id de jugador (columna A de "Jugadores", tal
// cual lo guarda REGISTRAR_JUGADOR) fijado en el código como administrador — decisión
// explícita de Marcos ("tu id de jugador, fijo en el código"), en vez de un rol almacenado
// en la hoja. Es "u12", confirmado por Marcos.
const ADMIN_PLAYER_ID = 'u12';

// REGLAS OFICIALES DETALLADAS POR MODALIDAD PARA EL MOTOR DE GEMINI
const OFFICIAL_TOURNAMENT_RULES = {
  pozo: `REGLAS OFICIALES: POZO CONTINUO (SUBE Y BAJA)
1. Estructura de Pistas:
   - Pista 1 (Pista Reina/Corona): máxima categoría.
   - Pistas descendentes (Pista 2, 3... N): donde N es la pista de fondo/pozo.
2. Siembra Inicial:
   - Ordenación por ranking/estrellas: las parejas con mayor valoración arrancan en Pista 1, descendiendo sucesivamente hasta la Pista N.
3. Formato de Juego y Tiempo:
   - Turnos de duración prefijada cronometrada.
   - Fin de turno por bocina: si la bocina suena durante un punto en juego, este se finaliza.
   - En caso de empate en juegos al sonar la bocina (o al terminar el punto en disputa), se juega un único 'Punto de Oro' con saque neutral/sorteado para definir al ganador de la pista.
4. Mecánica de Ascensos y Descensos:
   - Ganadores: suben una pista hacia Pista 1 (los ganadores de Pista 1 defienden posición y permanecen en ella).
   - Perdedores: bajan una pista hacia Pista N (los perdedores de Pista N permanecen en ella).
5. Determinación del Campeón:
   - La pareja que finalice el último turno como ganadora en la Pista 1 (o la que acumule más minutos/turnos defendiendo la Pista Reina, según configuración del evento).
6. Cuadro de partidos a generar:
   - Solo debes generar el cuadro de la primera ronda y que el resto de rondas se vayan completando al alimentar los resultados de la ronda anterior.`,

  americano: `REGLAS OFICIALES: TORNEO AMERICANO INDIVIDUAL
1. Formato y Rotación:
   - Inscripción individual con rotación automática de compañeros y rivales en cada ronda.
   - En grupos fijos o dinámicos de 4 jugadores: cada jugador disputa 3 rondas enfrentándose a todos y jugando una ronda con cada uno.
2. Sistema de Puntuación:
   - Partidos disputados a un número fijo de juegos (ej. 24, 32 puntos totales) o por tiempo límite.
   - Puntuación acumulativa individual: cada juego/punto que gana la pareja en pista suma íntegramente (+1) al casillero individual de ambos jugadores en la tabla general.
3. Balanceo y Algoritmo de Emparejamiento:
   - Generación de emparejamientos calculada para igualar el diferencial de ranking combinado (Jugador Top + Jugador en Desarrollo vs. Pareja de Nivel Medio).
4. Criterios de Clasificación y Desempate:
   - 1º: Mayor número total de puntos/juegos a favor.
   - 2º: Mayor diferencia neta de puntos (+/-).
   - 3º: Resultado directo en los enfrentamientos mutuos (Head-to-Head).
   - 4º: Menor cantidad de puntos/juegos concedidos.`,

  eliminatorio: `REGLAS OFICIALES: FASE DE GRUPOS + CUADRO FINAL
1. Configuración de Parejas y Siembra:
   - Parejas fijas durante todo el torneo, clasificadas según el promedio ponderado de nivel de sus dos integrantes.
   - Distribución de cabezas de serie protegidos en cada grupo para impedir cruces directos en fase regular.
2. Fase Clasificatoria (Grupos):
   - Sistema de liguilla (Round Robin) dentro de cada grupo.
   - Criterios de desempate en fase de grupos: 1º Puntos obtenidos, 2º Diferencia de sets/juegos, 3º Duelo directo, 4º Mayor número de juegos ganados.
3. Cuadros Finales:
   - Cuadro Principal (Oro): acceden las dos mejores parejas de cada grupo (1º del Grupo A vs 2º del Grupo B, etc.).
   - Cuadro de Consolación (Plata/Bronce, si aplica): asignación directa para 3º y 4º de grupo.
4. Cruces y Podio:
   - Semifinales a eliminación directa.
   - Los ganadores avanzan a la Gran Final por el título de Campeón 🏆.
   - Los perdedores de semifinales juegan la final de consolación por el 3º Puesto 🥉.`,

  equipos: `REGLAS OFICIALES: FORMATO RYDER CUP
1. Estructura de Equipos:
   - Enfrentamiento directo entre dos escuadras (Equipo Azul 🔵 vs. Equipo Rojo 🔴) lideradas por un Capitán.
2. Líneas de Juego y Enfrentamientos:
   - Cada ronda se compone de cruces simultáneos por pistas.
   - Los capitanes presentan su alineación ordenada por nivel competitivo: Pareja 1 (Titulares/Top) vs. Pareja 1 rival, escalonando equitativamente hasta la última pista.
3. Puntuación y Marcador Global:
   - Victoria por pista: otorga 1 punto neto al marcador global del equipo.
   - Empate por pista (si el formato de tiempo lo permite sin punto de oro): otorga 0.5 puntos a cada escuadra.
   - Derrota: 0 puntos.
4. Resolución del Torneo:
   - Se proclama Campeón el equipo que alcance la mayoría absoluta de los puntos en juego (Umbral de Victoria = [Total Pistas × Rondas / 2] + 0.5).
   - En caso de empate al finalizar todas las rondas: se disputa un super tie-break a 10 puntos en Pista Central con la pareja designada por cada capitán.`
};

// CLAVE DE DÍA "AAAA-MM-DD" — identifica un día en cenas, invitados, tickets, etc. Antes era un
// texto sin año ("jueves 08 oct") que se repite cada año; ahora todas las fechas del sistema
// llevan año, mes y día.
//  - Si se conoce la fecha completa del partido (fechaISO) se usa esa.
//  - Si el texto ya es AAAA-MM-DD, se devuelve tal cual.
//  - Si es un texto antiguo sin año ("jueves, 08 oct, 19:00") se usa el año actual.
//  - Si no hay día/mes reconocibles devuelve 'sin fecha'.
function extractCleanDate(dateStr, fechaISO) {
  if (fechaISO && /^\d{4}-\d{2}-\d{2}/.test(String(fechaISO))) return String(fechaISO).slice(0, 10);
  if (!dateStr) return 'sin fecha';
  const t = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const conAnio = t.match(/(\d{1,2})\s+([a-zA-ZáéíóúÁÉÍÓÚ]+)\.?,?\s+(20\d{2})/);
  const meses = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };
  const sinAnio = t.match(/(\d{1,2})\s+([a-zA-ZáéíóúÁÉÍÓÚ]+)/);
  const m = conAnio || sinAnio;
  if (!m) return 'sin fecha';
  const mes = meses[m[2].toLowerCase().slice(0, 3)];
  if (mes === undefined) return 'sin fecha';
  const anio = conAnio ? parseInt(m[3], 10) : new Date().getFullYear();
  const d = new Date(anio, mes, parseInt(m[1], 10));
  if (d.getMonth() !== mes) return 'sin fecha';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "2026-10-08" → "Jueves, 08 oct 2026" (etiqueta visible de un día de cena).
function etiquetaFechaDia(claveISO) {
  const m = String(claveISO || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(claveISO || '');
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${dias[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${meses[d.getMonth()]} ${d.getFullYear()}`;
}

// Texto de fecha SIEMPRE con año para mostrar en pantalla. Si el texto ya trae año se deja tal cual;
// si no, se inserta el año de fechaISO justo detrás del "dd mes" ("jueves, 08 oct 2026, 19:00").
function fechaCompleta(dateStr, fechaISO) {
  const t = String(dateStr || '').trim();
  if (!t) return t;
  if (/\b20\d{2}\b/.test(t)) return t;
  const anio = (String(fechaISO || '').match(/^(20\d{2})-\d{2}-\d{2}/) || [])[1];
  if (!anio) return t;
  const conAnio = t.replace(/(\d{1,2}\s+(?:de\s+)?[a-zA-ZáéíóúÁÉÍÓÚ]+\.?)(?=[,\s]|$)/, `$1 ${anio}`);
  return conAnio !== t ? conAnio : `${t} · ${anio}`;
}

// Sufijo aleatorio corto para ids generados en el navegador: evita que dos ids creados en el mismo
// milisegundo (o por dos personas a la vez) coincidan.
function sufijoAleatorioId() {
  try {
    if (window.crypto && window.crypto.getRandomValues) {
      const b = new Uint8Array(4);
      window.crypto.getRandomValues(b);
      return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* usa el respaldo */ }
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
}

function normalizeName(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

// NUEVO (control anti-duplicados al crear partidos): misma lógica que el backend
// (normalizarLinkPartido / esLinkGenericoPlaytomic en el Apps Script). Dos enlaces se
// consideran el mismo aunque cambien http/https, "www.", la barra final, el #hash o los
// parámetros de seguimiento (utm_*, fbclid, gclid, ref).
function normalizarLinkPartido(link) {
  if (!link) return '';
  const l = String(link).trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('#')[0];
  const partes = l.split('?');
  const base = partes[0].replace(/\/+$/, '');
  const query = (partes[1] || '').split('&').filter(q => q && !/^(utm_|fbclid|gclid|ref=)/.test(q)).sort().join('&');
  return query ? `${base}?${query}` : base;
}

// El enlace genérico de reserva/login de Playtomic (o solo el dominio) no identifica ningún
// partido concreto: nunca se usa para decidir si algo está duplicado.
function esLinkGenericoPlaytomic(linkNormalizado) {
  if (!linkNormalizado) return true;
  if (linkNormalizado.includes('/api/web-app/login')) return true;
  return !linkNormalizado.includes('/');
}

// NUEVO (trazabilidad): "Marcos (u24)" + "2026-10-08 10:15:00" → "Marcos · 08/10/2026 10:15".
// Devuelve '' si no hay dato (partidos anteriores a esta función).
function formatearAutoria(porTxt, enTxt) {
  const quien = String(porTxt || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!quien) return '';
  const m = String(enTxt || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${quien} · ${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : quien;
}

function extraerLinkDeTexto(texto) {
  const m = String(texto || '').match(/https?:\/\/\S+/i);
  return m ? m[0] : '';
}

// Busca entre los partidos ya cargados en la app uno con el mismo enlace de Playtomic (sin
// contar los cancelados). Es la comprobación "instantánea" en el móvil; el backend repite
// esta comprobación (y otra por fecha+jugadores) por si la lista local está desactualizada.
function buscarPartidoConMismoLink(matches, texto) {
  const linkNorm = normalizarLinkPartido(extraerLinkDeTexto(texto));
  if (esLinkGenericoPlaytomic(linkNorm)) return null;
  return (matches || []).find(m =>
    String(m.status || '').toUpperCase() !== 'CANCELADO' && normalizarLinkPartido(m.url) === linkNorm
  ) || null;
}

// Rota un array un n\u00famero de posiciones (m\u00e9todo del "c\u00edrculo" usado para generar
// enfrentamientos de round-robin sin repetir siempre el mismo grupo).
function rotateArray(arr, offset) {
  const n = arr.length;
  if (n === 0) return [...arr];
  const off = ((offset % n) + n) % n;
  return [...arr.slice(off), ...arr.slice(0, off)];
}

// Calcula cu\u00e1ntas rondas hay por delante en un cuadro de eliminaci\u00f3n directa para
// poner una etiqueta legible ("Final", "Semifinales", "Cuartos de Final"...).
function eliminationRoundLabel(matchesInRound) {
  if (matchesInRound === 1) return 'Final';
  if (matchesInRound === 2) return 'Semifinales';
  if (matchesInRound === 4) return 'Cuartos de Final';
  if (matchesInRound === 8) return 'Octavos de Final';
  return `Ronda de ${matchesInRound * 2}`;
}

// Reparte 4 jugadores en 2 parejas equilibradas evitando que dos zurdos compartan pareja
// cuando sea posible. Versión "de módulo" (fuera del asistente de creación de torneo) para
// poder reutilizarla al calcular sobre la marcha la siguiente ronda del Pozo Continuo.
function pairFourPlayersBalanced(pool4) {
  const lefties = pool4.filter(p => p.isLeftHanded);
  const righties = pool4.filter(p => !p.isLeftHanded);
  if (lefties.length === 2 && righties.length === 2) {
    return { pair1: [lefties[0], righties[0]], pair2: [lefties[1], righties[1]] };
  }
  const sorted = [...pool4].sort((a, b) => (b.level || 3.5) - (a.level || 3.5));
  return { pair1: [sorted[0], sorted[3]], pair2: [sorted[1], sorted[2]] };
}

// NUEVO (Pozo Continuo en formato escalera): calcula la ronda siguiente a partir de los
// resultados de la ronda que se acaba de completar. Regla "sube/baja": en cada pista, los
// dos ganadores suben una pista (los de la Pista 1 se quedan en la Pista 1, no hay más
// arriba) y los dos perdedores bajan una pista (los de la última pista se quedan ahí, no
// hay más abajo). Se recalculan parejas nuevas en cada pista con pairFourPlayersBalanced.
function computeNextPozoRound(t, updatedRounds, nextRoundNum) {
  const lastRound = updatedRounds.find(r => r.round === nextRoundNum - 1);
  if (!lastRound) return null;

  const fixedPairs = Boolean(t.pozoEscalera && t.pozoEscalera.fixedPairs);

  // MODO "PAREJAS FIJAS": la pareja entera sube o baja de pista junta, sin recombinar
  // jugadores — simplemente movemos las dos parejas de cada pista a su pista nueva y las
  // enfrentamos directamente entre sí, conservando quién jugaba con quién.
  if (fixedPairs) {
    const winnerCoupleByCourt = {};
    const loserCoupleByCourt = {};
    (lastRound.matches || []).forEach(m => {
      if (!m.courtNum || m.winner == null) return;
      winnerCoupleByCourt[m.courtNum] = {
        ids: (m.winner === 1 ? m.team1Ids : m.team2Ids) || [],
        name: m.winner === 1 ? m.team1 : m.team2
      };
      loserCoupleByCourt[m.courtNum] = {
        ids: (m.winner === 1 ? m.team2Ids : m.team1Ids) || [],
        name: m.winner === 1 ? m.team2 : m.team1
      };
    });

    const courtsJugadasFijas = Object.keys(winnerCoupleByCourt).map(Number);
    if (!courtsJugadasFijas.length) return null;
    const maxCourtFijas = Math.max(...courtsJugadasFijas);

    const nextCourtCouples = {};
    for (let c = 1; c <= maxCourtFijas; c++) nextCourtCouples[c] = [];
    for (let c = 1; c <= maxCourtFijas; c++) {
      const w = winnerCoupleByCourt[c];
      const l = loserCoupleByCourt[c];
      const pistaSubida = c === 1 ? 1 : c - 1;
      const pistaBajada = c === maxCourtFijas ? maxCourtFijas : c + 1;
      if (w) nextCourtCouples[pistaSubida].push(w);
      if (l) nextCourtCouples[pistaBajada].push(l);
    }

    const matchesListFijas = [];
    for (let c = 1; c <= maxCourtFijas; c++) {
      const couples = (nextCourtCouples[c] || []).slice(0, 2);
      if (couples.length < 2) continue;
      matchesListFijas.push({
        id: `POZO_R${nextRoundNum}_P${c}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        court: c === 1 ? 'Pista 1 👑 (Pista Reina)' : `Pista ${c}`,
        team1: couples[0].name, team2: couples[1].name,
        team1Ids: couples[0].ids || [], team2Ids: couples[1].ids || [],
        courtNum: c,
        score: '', winner: null, status: 'PENDIENTE'
      });
    }
    if (!matchesListFijas.length) return null;
    return { round: nextRoundNum, timeLabel: `Ronda ${nextRoundNum}`, matches: matchesListFijas };
  }

  // MODO "PAREJAS ROTATIVAS" (por defecto): cada ronda se recombinan los 4 jugadores que
  // coinciden en cada pista en 2 parejas nuevas y equilibradas.
  const byId = {};
  (t.participants || []).forEach(p => { byId[p.id] = p; });

  const winnersByCourt = {};
  const losersByCourt = {};
  (lastRound.matches || []).forEach(m => {
    if (!m.courtNum || m.winner == null) return;
    winnersByCourt[m.courtNum] = (m.winner === 1 ? m.team1Ids : m.team2Ids) || [];
    losersByCourt[m.courtNum] = (m.winner === 1 ? m.team2Ids : m.team1Ids) || [];
  });

  const courtsJugadas = Object.keys(winnersByCourt).map(Number);
  if (!courtsJugadas.length) return null;
  const maxCourt = Math.max(...courtsJugadas);

  const nextCourtPlayers = {};
  for (let c = 1; c <= maxCourt; c++) nextCourtPlayers[c] = [];
  for (let c = 1; c <= maxCourt; c++) {
    const winners = winnersByCourt[c] || [];
    const losers = losersByCourt[c] || [];
    const pistaSubida = c === 1 ? 1 : c - 1;
    const pistaBajada = c === maxCourt ? maxCourt : c + 1;
    nextCourtPlayers[pistaSubida] = nextCourtPlayers[pistaSubida].concat(winners);
    nextCourtPlayers[pistaBajada] = nextCourtPlayers[pistaBajada].concat(losers);
  }

  const matchesList = [];
  for (let c = 1; c <= maxCourt; c++) {
    const idsInCourt = (nextCourtPlayers[c] || []).slice(0, 4);
    if (idsInCourt.length < 4) continue;
    const playersInCourt = idsInCourt.map(id => byId[id]).filter(Boolean);
    if (playersInCourt.length < 4) continue;
    const paired = pairFourPlayersBalanced(playersInCourt);
    matchesList.push({
      id: `POZO_R${nextRoundNum}_P${c}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      court: c === 1 ? 'Pista 1 👑 (Pista Reina)' : `Pista ${c}`,
      team1: `${paired.pair1[0].name.split(' ')[0]} & ${paired.pair1[1].name.split(' ')[0]}`,
      team2: `${paired.pair2[0].name.split(' ')[0]} & ${paired.pair2[1].name.split(' ')[0]}`,
      team1Ids: [paired.pair1[0].id, paired.pair1[1].id],
      team2Ids: [paired.pair2[0].id, paired.pair2[1].id],
      courtNum: c,
      score: '', winner: null, status: 'PENDIENTE'
    });
  }
  if (!matchesList.length) return null;
  return { round: nextRoundNum, timeLabel: `Ronda ${nextRoundNum}`, matches: matchesList };
}

// NUEVO (Pozo Continuo): clasificación final una vez jugada la última ronda. Orden:
// 1) pista final (más baja gana), 2) puestos netos subidos desde la pista de inicio
// (corrige a quien empezó abajo y ha ido escalando, frente a quien arrancó ya en la
// Pista 1 y simplemente se mantuvo), 3) partidos ganados en todo el torneo, como último
// desempate.
function computePozoStandings(t) {
  if (!t || t.mode !== 'pozo' || !t.pozoEscalera) return [];
  const startCourts = t.pozoEscalera.startCourts || {};
  const byId = {};
  (t.participants || []).forEach(p => { byId[p.id] = { ...p, finalCourt: startCourts[p.id] || 999, wins: 0 }; });

  (t.rounds || []).forEach(r => {
    (r.matches || []).forEach(m => {
      if (m.winner == null || !m.courtNum) return;
      const winnerIds = (m.winner === 1 ? m.team1Ids : m.team2Ids) || [];
      const loserIds = (m.winner === 1 ? m.team2Ids : m.team1Ids) || [];
      winnerIds.forEach(id => {
        if (byId[id]) { byId[id].finalCourt = Math.max(1, m.courtNum - 1); byId[id].wins += 1; }
      });
      loserIds.forEach(id => {
        if (byId[id]) { byId[id].finalCourt = m.courtNum + 1; }
      });
    });
  });

  return Object.values(byId)
    .map(p => ({ ...p, subidos: (startCourts[p.id] || 999) - p.finalCourt }))
    .sort((a, b) => (a.finalCourt - b.finalCourt) || (b.subidos - a.subidos) || (b.wins - a.wins));
}

function isMatchOfficial(m) {
  if (!m) return false;
  if (m.isOfficial !== undefined) return Boolean(m.isOfficial);

  const group = String(m.grupo || 'chicos').toLowerCase();
  const combined = `${m.date || ''} ${m.rawText || ''}`.toLowerCase();

  if (group === 'chicos') {
    if (combined.includes('jue')) return true;
    const d = parseMatchDateObject(m.date, m.fechaISO);
    return d ? d.getDay() === 4 : false;
  } else if (group === 'chicas') {
    if (combined.includes('mar')) return true;
    const d = parseMatchDateObject(m.date, m.fechaISO);
    return d ? d.getDay() === 2 : false;
  }
  return false;
}

function extractMatchDurationMinutes(dateStr, rawText) {
  const combined = `${dateStr || ''} ${rawText || ''}`;
  const durMatch = combined.match(/\((\d+)\s*min\)/i) || combined.match(/(\d+)\s*min/i);
  if (durMatch) {
    return parseInt(durMatch[1], 10);
  }
  return 90;
}

// Fecha de un partido como objeto Date. Si se conoce la fecha completa con año ("AAAA-MM-DD HH:mm",
// columna FechaISO del Sheet, que llega como fechaISO) se usa esa: es la única fiable entre
// años. Si no (partidos antiguos sin migrar, o textos sin día/mes como "Jueves 21:00"), se
// mantiene el comportamiento de siempre: se interpreta el texto con el AÑO ACTUAL.
function parseMatchDateObject(dateStr, fechaISO) {
  if (fechaISO) {
    const iso = String(fechaISO).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5], 0, 0);
  }
  if (!dateStr) return null;
  // Fecha ISO sin hora (clave de día "2026-10-08"): se interpreta con su año.
  const soloDia = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (soloDia) return new Date(+soloDia[1], +soloDia[2] - 1, +soloDia[3], soloDia[4] ? +soloDia[4] : 21, soloDia[5] ? +soloDia[5] : 0, 0, 0);
  const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})/);
  const hours = timeMatch ? parseInt(timeMatch[1], 10) : 21;
  const minutes = timeMatch ? parseInt(timeMatch[2], 10) : 0;

  const hoy = new Date();
  let matchDate = new Date(hoy.getTime());
  const meses = {
    ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
    jul: 6, ago: 7, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11
  };

  const dayMonthMatch = dateStr.match(/(\d{1,2})\s+([a-zA-ZáéíóúÁÉÍÓÚ]+)/);
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1], 10);
    const monthKey = dayMonthMatch[2].toLowerCase().slice(0, 4);
    const foundMonth = Object.keys(meses).find(k => monthKey.startsWith(k));
    if (foundMonth !== undefined) {
      // Se construye con (año, mes, día) de una vez: encadenar setMonth() y setDate() sobre "hoy"
      // se desbordaba a veces (p.ej. el día 31 + mes de 30 días saltaba al mes siguiente).
      const anioTexto = dateStr.match(/\b(20\d{2})\b/);
      matchDate = new Date(anioTexto ? parseInt(anioTexto[1], 10) : hoy.getFullYear(), meses[foundMonth], day);
    }
  }
  matchDate.setHours(hours, minutes, 0, 0);
  return matchDate;
}

function computeMatchStatus(m) {
  const baseStatus = String(m.status || '').toUpperCase();
  if (baseStatus === 'FINALIZADO' || baseStatus === 'CANCELADO') {
    return baseStatus;
  }

  const matchDate = parseMatchDateObject(m.date, m.fechaISO);
  if (!matchDate) return 'PROGRAMADO';

  const now = new Date();
  const durationMin = extractMatchDurationMinutes(m.date, m.rawText);
  const endTime = new Date(matchDate.getTime() + durationMin * 60 * 1000);

  if (now < matchDate) {
    return 'PROGRAMADO';
  } else if (now >= matchDate && now <= endTime) {
    return 'EN JUEGO';
  } else {
    return 'SIN RESULTADO';
  }
}

// Misma regla que ya aplica el backend (doGet, al calcular cSi/cNo para los rankings) para
// decidir si una cena "cuenta" de verdad: se computa a partir de las 09:00 del día SIGUIENTE a
// la cena, nunca antes. Antes esta regla solo vivía en el backend — el detalle de "Cenas" y
// "Historial de Puntos" del propio perfil (más abajo, en statsCalculated) sumaba la cena en
// cuanto el jugador marcaba "Sí" o en cuanto se apuntaba a una cena sin partido, aunque esa
// cena fuera esta misma noche o incluso un día futuro, dando una sensación de puntos/cenas ya
// "ganados" que en realidad el ranking todavía no contaba hasta pasado ese corte.
function esCenaComputable(dateStr, fechaISO) {
  const fechaBase = parseMatchDateObject(dateStr, fechaISO);
  if (!fechaBase) return false;
  const limite = new Date(fechaBase.getTime());
  limite.setDate(limite.getDate() + 1);
  limite.setHours(9, 0, 0, 0);
  return new Date() >= limite;
}

// NUEVO (Home · "Estadísticas individuales"): cuántas semanas llevas sin jugar / sin ganar /
// sin perder / sin quedarte a cenar. A petición explícita de Marcos, el alcance es "Todo" —
// Liga regular + Amistosos + Torneos — así que un partido o cena de cualquier tipo cuenta para
// romper la racha correspondiente, no solo los oficiales de Jueves/Martes. Vive fuera de los
// componentes (función pura) porque la necesitan tanto HomeScreen como, más adelante, cualquier
// otra pantalla, sin duplicar la lógica de recorrido de partidos/torneos.
function calcularRachasSemanales(currentUser, matches, tournaments, allDinnerGuests) {
  if (!currentUser) return null;
  const normUserName = normalizeName(currentUser.name || '');
  const ahora = new Date();

  // NUEVO: a petición de Marcos, "semanas sin cena" solo mira las cenas del día de liga de tu
  // grupo — jueves para Chicos, martes para Chicas — aunque la cena venga de un amistoso, una
  // cena suelta o un torneo (no solo de un partido oficial). Así que aquí NO se restringe por
  // "es oficial o no", sino por el día de la semana en que cae la cena. Nota: "Jugar"/"Ganar"/
  // "Perder" siguen con alcance "Todo" (cualquier día), que es lo que se pidió para esos tres.
  const diaCenaEsperado = (currentUser.group || '').toLowerCase() === 'chicas' ? 2 : 4; // 2=martes, 4=jueves

  const eventosPartido = []; // { fecha: Date, ganado: boolean } — liga, amistosos y torneos
  const eventosCena = [];    // { fecha: Date } — solo cenas confirmadas ("SI") en el día de liga del grupo

  // CRITERIO DE LAS CENAS EN ESTA RACHA (distinto al de los PUNTOS, a propósito): los puntos y el
  // bote de una cena solo se computan a las 09:00 del día siguiente (esCenaComputable), pero la
  // racha "semanas sin cena" es informativa y no puede decirte que no has ido a una cena que
  // acabas de tener. Por eso una cena confirmada ("SI") cuenta para la racha en cuanto ha
  // empezado el evento (fecha <= ahora), sin esperar al corte de las 09:00. Una cena futura
  // todavía no cuenta (si no, taparía la racha antes de que ocurra).
  (matches || []).forEach(m => {
    if (String(m.status || '').toUpperCase() === 'CANCELADO') return;
    const mySlot = (m.players || []).find(p => p.id === currentUser.id || normalizeName(p.name) === normUserName);
    if (!mySlot) return;
    const fecha = parseMatchDateObject(m.date, m.fechaISO);
    if (!fecha) return;
    if (m.status === 'FINALIZADO') {
      eventosPartido.push({ fecha, ganado: mySlot.won === 'SI' });
    }
    // La cena no depende de que ya se haya anotado el resultado del partido.
    if (String(mySlot.dinner || '').toUpperCase() === 'SI' && fecha <= ahora && fecha.getDay() === diaCenaEsperado) {
      eventosCena.push({ fecha });
    }
  });

  (allDinnerGuests || []).forEach(g => {
    if (g.id === currentUser.id || normalizeName(g.name) === normUserName) {
      const cleanDate = extractCleanDate(g.target || g.cleanTarget);
      if (cleanDate === 'sin fecha') return;
      const fecha = parseMatchDateObject(cleanDate);
      if (fecha && fecha <= ahora && fecha.getDay() === diaCenaEsperado) eventosCena.push({ fecha });
    }
  });

  (tournaments || []).forEach(t => {
    const participante = (t.participants || []).find(p => p.id === currentUser.id || normalizeName(p.name) === normUserName);
    if (!participante) return;
    // Los torneos no guardan la fecha de cada partido suelto, solo la fecha de inicio del
    // torneo — misma aproximación que ya usa streakAndTrend más abajo para el gráfico mensual.
    const tFecha = t.startDate ? new Date(`${t.startDate}T${t.startTime || '00:00'}`) : null;
    const tFechaValida = tFecha && !isNaN(tFecha.getTime()) ? tFecha : null;

    (t.rounds || []).forEach(r => {
      (r.matches || []).forEach(m => {
        if (m.status !== 'FINALIZADO' || !tFechaValida) return;
        let inT1, inT2;
        if ((m.team1Ids && m.team1Ids.length) || (m.team2Ids && m.team2Ids.length)) {
          inT1 = (m.team1Ids || []).includes(currentUser.id);
          inT2 = (m.team2Ids || []).includes(currentUser.id);
        } else {
          const myFirstName = normUserName.split(' ')[0];
          inT1 = myFirstName && normalizeName(m.team1 || '').split(' ').includes(myFirstName);
          inT2 = myFirstName && normalizeName(m.team2 || '').split(' ').includes(myFirstName);
        }
        if (!inT1 && !inT2) return;
        const ganado = (inT1 && m.winner === 1) || (inT2 && m.winner === 2);
        eventosPartido.push({ fecha: tFechaValida, ganado });
      });
    });

    if (participante.cena === 'SI' && tFechaValida && tFechaValida.getDay() === diaCenaEsperado) {
      eventosCena.push({ fecha: tFechaValida });
    }
  });

  const masReciente = (lista) => lista.length
    ? lista.reduce((max, e) => (e.fecha > max ? e.fecha : max), lista[0].fecha)
    : null;

  const semanasDesde = (fecha) => {
    if (!fecha) return null; // nunca — sin historial
    const diffMs = ahora.getTime() - fecha.getTime();
    if (diffMs < 0) return 0;
    return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  };

  // Semanas NATURALES (lunes-domingo) entre la semana de una fecha y la semana actual. Solo se
  // usa cuando "nunca ha pasado" lo que se cuenta (nunca has perdido / nunca has ganado): ahí no
  // hay una "última vez" desde la que contar, así que (a petición de Marcos) se cuenta desde la
  // semana de tu primer partido en la app — antes salía una raya "–" en ese caso.
  const inicioSemana = (d) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // retrocede hasta el lunes
    return x;
  };
  const semanasNaturalesDesde = (fecha) => {
    if (!fecha) return null;
    return Math.max(0, Math.round((inicioSemana(ahora) - inicioSemana(fecha)) / (7 * 24 * 60 * 60 * 1000)));
  };

  const victorias = eventosPartido.filter(e => e.ganado);
  const derrotas = eventosPartido.filter(e => !e.ganado);
  const fechaUltimoPartido = masReciente(eventosPartido);
  const fechaUltimaVictoria = masReciente(victorias);
  const fechaUltimaDerrota = masReciente(derrotas);
  const fechaUltimaCena = masReciente(eventosCena);
  const fechaPrimerPartido = eventosPartido.length
    ? eventosPartido.reduce((min, e) => (e.fecha < min ? e.fecha : min), eventosPartido[0].fecha)
    : null;

  // Hueco compartido "sin ganar / sin perder" en el Home: se decide según tu último resultado
  // (si lo último que jugaste fue una derrota, te interesa más ver cuánto llevas sin ganar, y
  // viceversa) — mismo criterio que ya usa la racha de victorias del modal de perfil.
  let ultimoResultado = null;
  if (fechaUltimaVictoria && (!fechaUltimaDerrota || fechaUltimaVictoria >= fechaUltimaDerrota)) {
    ultimoResultado = 'victoria';
  } else if (fechaUltimaDerrota) {
    ultimoResultado = 'derrota';
  }

  return {
    semanasSinJugar: semanasDesde(fechaUltimoPartido),
    // Si nunca has ganado / nunca has perdido, se cuenta desde la semana de tu primer partido
    // (en vez de mostrar "–"). Si ya hay una última victoria/derrota, se sigue contando desde ella.
    semanasSinGanar: fechaUltimaVictoria ? semanasDesde(fechaUltimaVictoria) : semanasNaturalesDesde(fechaPrimerPartido),
    semanasSinPerder: fechaUltimaDerrota ? semanasDesde(fechaUltimaDerrota) : semanasNaturalesDesde(fechaPrimerPartido),
    semanasSinCena: semanasDesde(fechaUltimaCena),
    ultimoResultado,
    tieneHistorial: eventosPartido.length > 0
  };
}

function parseMatchTiming(dateStr, fechaISO) {
  const matchDate = parseMatchDateObject(dateStr, fechaISO);
  if (!matchDate) return { canReport: true, shouldPrompt: false };

  const now = new Date();
  const diffHours = (now - matchDate) / (1000 * 60 * 60);
  return {
    canReport: diffHours >= 0,
    shouldPrompt: diffHours >= 2.0
  };
}

function isCurrentWeek(dateStr, fechaISO) {
  const matchDate = parseMatchDateObject(dateStr, fechaISO);
  if (!matchDate) return true;

  const now = new Date();
  const currentDay = now.getDay();
  const distanceToMonday = (currentDay + 6) % 7;

  const monday = new Date(now);
  monday.setDate(now.getDate() - distanceToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return matchDate >= monday && matchDate <= sunday;
}

function isUpcoming(dateStr, fechaISO) {
  const matchDate = parseMatchDateObject(dateStr, fechaISO);
  if (!matchDate) return true;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return matchDate >= startOfToday;
}

// NUEVO (tema visual): icono de "2 palas de padel" cruzadas (amarillas) para sustituir el emoji
// ⚔️ que se usaba para todo lo relacionado con Torneos — no existe un emoji estándar de palas de
// padel. Imagen PNG/WebP con fondo transparente (128 px, ~7 KB) incrustada en el archivo: se ve
// bien tanto en botones claros como oscuros. Tamaño "1em" por defecto para colocarlo igual que
// un emoji dentro de cualquier texto/span (hereda el font-size de alrededor).
const ICONO_PALAS_SRC = 'data:image/webp;base64,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';

function PadelRacketsIcon({ className = '', size = '1em' }) {
  return (
    <img
      src={ICONO_PALAS_SRC}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      style={{ width: size, height: size }}
      className={`inline-block align-[-0.15em] shrink-0 object-contain ${className}`}
    />
  );
}

// NUEVO (tema visual, fondo general de la app): pista de pádel vista desde arriba, en vertical.
// A propósito NO es una foto real (evita dependencias externas y dudas de licencia): es una
// ilustración SVG con las proporciones reales de una pista (10 x 20 m): suelo de tierra batida
// con grano, líneas blancas de límite, líneas de servicio a 6,95 m de la red, línea central entre
// ellas, red con sus postes en medio y el cristal/muro perimetral. Se pinta en una capa fija a
// pantalla completa, centrada y ajustada al alto (contain); el color de fondo coincide con el
// "suelo exterior" del SVG para que no se vea ningún corte. Las tarjetas siguen siendo blancas,
// así que la pista solo se ve en los huecos entre tarjetas.
const FONDO_PISTA_PADEL_SVG = (() => {
  const px = 48; // píxeles del dibujo por metro de pista (480 x 960 para 10 x 20 m)
  const x0 = 60, x1 = 540, y0 = 120, y1 = 1080, yRed = 600;
  const ySrv1 = yRed - 6.95 * px, ySrv2 = yRed + 6.95 * px;
  const postesCristal = Array.from({ length: 11 }, (_, i) => {
    const y = 96 + i * 100.8;
    return `<line x1="36" y1="${y}" x2="${x0}" y2="${y}"/><line x1="${x1}" y1="${y}" x2="564" y2="${y}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1200" viewBox="0 0 600 1200">`
    + `<defs>`
    + `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9814f"/><stop offset="0.5" stop-color="#cf7746"/><stop offset="1" stop-color="#c06a3c"/></linearGradient>`
    + `<filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.15  0 0 0 0 0.05  0 0 0 0.55 -0.12"/></filter>`
    + `</defs>`
    // suelo exterior (zona de cristal y fuera de pista)
    + `<rect width="600" height="1200" fill="#a95a3a"/>`
    // superficie de juego + grano
    + `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="url(#s)"/>`
    + `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" filter="url(#g)" opacity="0.5"/>`
    // cristal / muro perimetral
    + `<rect x="36" y="96" width="528" height="1008" rx="6" fill="none" stroke="#d9eef2" stroke-opacity="0.55" stroke-width="10"/>`
    + `<g stroke="#e8f5f7" stroke-opacity="0.55" stroke-width="3">${postesCristal}</g>`
    // líneas blancas
    + `<g stroke="#ffffff" stroke-width="6" fill="none" stroke-linecap="square" opacity="0.95">`
    + `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>`
    + `<line x1="${x0}" y1="${ySrv1}" x2="${x1}" y2="${ySrv1}"/>`
    + `<line x1="${x0}" y1="${ySrv2}" x2="${x1}" y2="${ySrv2}"/>`
    + `<line x1="300" y1="${ySrv1}" x2="300" y2="${ySrv2}"/>`
    + `</g>`
    // red: banda de malla con su sombra y los dos postes
    + `<rect x="${x0 - 14}" y="${yRed - 4}" width="${x1 - x0 + 28}" height="14" fill="#000" opacity="0.18"/>`
    + `<rect x="${x0 - 14}" y="${yRed - 7}" width="${x1 - x0 + 28}" height="8" fill="#2f3b46"/>`
    + `<line x1="${x0 - 14}" y1="${yRed - 3}" x2="${x1 + 14}" y2="${yRed - 3}" stroke="#f1f5f7" stroke-width="2"/>`
    + `<circle cx="${x0 - 14}" cy="${yRed - 3}" r="9" fill="#46515c" stroke="#f1f5f7" stroke-width="2"/>`
    + `<circle cx="${x1 + 14}" cy="${yRed - 3}" r="9" fill="#46515c" stroke="#f1f5f7" stroke-width="2"/>`
    + `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

// Capa fija a pantalla completa (se pinta detrás de todo el contenido de la app).
const ESTILO_FONDO_PISTA_PADEL = {
  backgroundColor: '#a95a3a',
  backgroundImage: FONDO_PISTA_PADEL_SVG,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'center',
  backgroundSize: 'contain'
};

// NUEVO: logo oficial de los torneos CTC (trofeo con corona + 2 palas + laureles). Imagen
// incrustada (WebP ~28 KB, recortada) para no depender de ningún enlace externo. Como el dibujo
// es azul marino sobre fondo blanco, se muestra siempre dentro de una insignia blanca redondeada
// para que se vea bien tanto sobre los banners azules como sobre las pantallas oscuras.
const LOGO_TORNEO_SRC = 'data:image/webp;base64,UklGRhhtAABXRUJQVlA4IAxtAABQTQGdASoIArUBPj0cjEQiIaETqK18IAPEsbd+E/YBDNmFv0Aa7rk2+KYxmUP8r+6dsjIPj39f/fPSG4z6zfZX2//Ef8z2YdZnXXnC+c/uH/j/zX4/fNL/Jfst7kf0v/8vcK/Xn/s/5T/Mfs/8c3qY/eP1Ift3+2nu/f9z9vffN/efUN/q3+o/+fZC+hf+8Hq7/+391Ph+/rH/X/cz/6+9b/+v3/7urpB+un9s/IT3z+Cf3f+5f4z/Rf3TyQfRP2n8lf7P/3/qs/PP9PxUdY/8/0J/j32G/Af2f/J/7r+8/uR96v7D/o+E/x//zv8h7Av4j/Jf7t/a/23/v/7UcjVt/+3/7XqC+1v0b/W/3r/N/8v/FfHv85/sfQn7Kf7b7n/sB/oH9Q/1v90/eL/C///3z/BT/D/8j9lfgA/n/9q/1f+W/yX7OfTj/Rf9n/Lf6r9yvbX+hf4P/sf5X/Wftn9hP8u/qv+1/vP+Y/9n+l////9+8f/0+4P9tf/l7p369f/syvWuOGi+zFu5Zy2jWn4N9zwU9a44aL7MW8kxT1rjhovofasJliPNPd/hXR+X6D9MXjUfjIDy0sXQkmKetccNF9mLeSYp5Oi/4eD4foBx/NjU9vN9h6DFSYHfKk3Rr6L7MW8kxT1rjhovsxG3VWOmtJ+39Id8ELuKJv34jRVvsLPWuOGi+zFvJMU9awUFQv2iDjcEXTqQ9JRGatA9fYYLfB2y0+XayDX3iD/zEtnBovsxbyTFPWuN4AS0kZ78mQBeU+huodb/pqNH0Xv45FI4uv9y0jLXK05DxhF2cHuU6qoLOlOeZ4RzeSYp61xw0X2YchpPKwwrNZuG7IZh4LJBoiZq/Nc8OpgF0c9p7l9X3zUugmXt1hYXVfkaQGO1O8kxT1rjhovsw3N9eQuDQ/u32DUG/pcZC7BnXVm5P5AimrVn4O8lfUGbhj1uxOJEs84CvWLFvYkpu/sxbyTFPHpqbx5MmHt7TPgzpX0opqFPoPKkj/S+0Csp+snxR7Ay6l6jC276OJaC4Wm0w5CzjRnrPHfZiqT3r8mElxEpHCz2cTvzKW/voTBfIwRdQPdCSYp6yuPlsE9IsT2G0wKpRJGgG2J5HyQQStSYnIV+fDsfjjOPIq0PBbeTjM7h/lxrEEDEWH/bO8lOyIsu73kS147/YjedP+wQ/YVn1Z8/Zl1uFR91tr6L7MW7iJxUdCgRsL5K5jATKAvhbgsEKQewUs7B+IEgMGnRbjrTonefrYNBoF+9NVb4Rd7/9G8xSlyL72ovjJvPAkRaPB4ELl5pWPFob+Zi3kmKeTzfO/7/Uo8+f/zexM/MdG123gdG4/PxA33rPOkfDTHNJE3oqWgw0DstFLxwpIuuu9otxxIn7I30hqHq4hpqSmh+71o3IVgo19F9mLQ299+Kr2O0LaI0vDbJ8f/wieeE/1MTQc9igc3HOPPDyvkVgS/xcIq3Eh7mrzopJysiXdRQcNF9mG6C5k9tRuxbimW7Svs4b0v3Lw1+6ZGy8+/kJ2nDnpmgH1srTtN9rcUHu9an9hG0D6Fp7QEHoM6e4uUXAWvNpY0zJLLpJV8lGwzFfcEctLPRBiHpmWHTkYGALzZ9wc1UMG8qkmudP9midZfSeAcMGt3e/zEnuw8kv6QdH6hQzSU1WI1bG8pIHq36obaizeLYOPhhiAN3p/1Q8305KG5GHfi4/PG9qJfvvHEOKOarH7frvh0y5j5CgtRDWUcPzWd0MjFovsw7FAbVK7RFoI0k6Ls6PGttvF+Oq+vilh37O86jeZ/clY5WV9Z5uhCGuSrbPNraoYfejhJBZTlJ2abkVnHNh6owLFsxpp+FU20hdknjLQOKVZtkKL7ZbC04LoxiSw30OCKIeRjQn1ZQtBzxu/F/A8fJK0ogkIPuK6j7wQRS9lCRYiTphe9hog+gTicYRysA/8OAyqXR7gsDeeApLBeH3J+h8TNElCh55uGXwnqD9LKlGs6diomHpXCoN2rys7L07KQ4bNCDFhADW5Rj/PV3pEUPeRSXMT/7Rsh2seLv7crUhjx5ijaCuYmZouT9H+7x/7WrmA0n07lzz8ybjVcJXWQCu1pK0El0kiBGb+MBD8zQHAfYa80ep2L2I1yUe7b0/q0lTNcUrjbntPu8Y5kiziEdu0j6BoYCpA9u+lESgNPSlFhh9sSpowM+2Xh1pKA7gZVE5hTqpfB9jpnCHmu9Gpz3YnqFSZn8QHQAvtxJOoHHF1A+t5Oykvy4XBPuyb8MC8uEODRvh+UUIyGkiS76YMuTBlpvdXsgoCvR0ZV8udp71ULcjxp0UfSIYTzeF4lF4geryXEEYyAh8U6W3YRgDSJ1/yp0hbAWtt66p/fJuCh8Yf+4acaAxx00M/6OtQvRZvZeff+CP45lh5mIv6BmlEumIZ+y/+wpw9ear7F3SzKbxYdufCMz7hSaiTooNnsXfe6kk82FXYe2PY4wCyUs5Twq8zf1FUVqV+XvPmDwND1dbk63MwjRgp5obBF7WRNcb+GXGELcmpZiY1bX5RneLqCAcl7bnqhKYW5HU9aH+f6JNluxxbhTjlRd6RXQWJK99P3uS1iDdbmQzirFqAOl/uArBRMwspQyLqBe1fp1CYiYgdxfJlTrj0lBebElXtk2k/OUM8+5C1bdK014Hfj53gOlBHIbFT11HRnZAImIikEzpW4d0cmxuurpChXE5/gIWn85Tso7jz/Z19dR+j1olEysT1s7JS+0T7jVyp3hjt5RemaJLsCHlaV/mtGgHvnVxQVgouyfNsrLYqo9SU/s0/RSN6+VQTU04z79wS+UxwHB/GGofOSk9h8SbgN1aLHVv69KbWPobyV9xYbOUrsHrMKolmcoe49/3+Z9eFMB/vQyOzgz78d6LE9O03QVx8X89sD06c6hmC3ItoubHczSM47rHwptbTwaFcS/XyQspkuFM1deLvFKr6NaDVUXdwuO+UTrlMyoB3smWpiaU/S7WHYEmR8Y43fIrZkRPYXx4lsiFoiZ7f/xn3OC8mNU/v6dDbd0WzDeyAVm8kB2vqVWjnyB3Bf+AnoW2BgnAnv8oljO2oT19T/Cz057BgYoeJQjoB9OdYwZv5tUE/dB+hM4WTNgIt55+sZ42iljwPGP2XNBJAjCg4ZzutfUwyUvY3a/3addpxQzftc1vM7GXfBSuqaZz3UBiRNPeRQPa548TAkPGWLPSAo665w4kFOohSRY17tzhsxptK8OftuWGR8PU1NhA0nRN70P8NF9kpjCPO5/rFqsNUePVdACvBKaH0/yMqqJv+phxBsG8VjR9Lns2ALD9LuqzaSUYrtTPBSUUyKJ/gIsI9XiP9wnP+XowsQWRANuIxB2RPH+nUUPpxGancHmrQiFj9fKsW1l16o3lSvLfdXrqu+UWc3ad8U9a44XhgY19GCUzZgBFK00mc5AgAzufR4QCaAzweSIm64wjxEZA7bWLrQ1CrDXHOsNa3DZQwbty2hQviRdv00YKYGAL0JJinrXHAR9zMtB0GxpU0MSFGkPOBhKKbduCjBvsDAF6EkxT1rjhovsxbyTFPWuOGi+zFusAAD+/QZQAn2thpKLcYZw6z7GKtc0+5KuSGf+kFElUHZzUkJts7npn3wj7jfgtrBxUChcNhlbu8AAABY37ux0/C8qd6Eb3r3E9aBoiZ99CuZS0AC7d0rTGFw/w8fe0ayFi+E31hjfZQrB7AqRr0BtBlNjdF6rZ17J6R7kYhO0+T1Pa9A10T518eXQA3hfJBwkNKQlXW7wDgdeUipwfc05b42keD8VWsrGaBja8JSo0yQz39NPlI0uFTvXxDL8LYX+kZmhsNxvRtC0EAiCdPY/LqXJENoN9wFFiYUe5xLFZj0F3Ygz4oN/AvVgp4Iw25kPaO626fLQps1p5VbEapZn9GBb0jKy/qkID+B1NEb6TRQvyax7/fpIYLKPfYAAAB1pPqSlyFoSI2Hg7Y5wAvqjJ/mYnRcgNQVk8MHu1Am1pnHLoz8C3izUk8ORa+Km02C1v922e7BWvRf7nFHq0aVTqo+7sMDrxHtiHA+EjPIe75M/NGhSvWHxE996XKqCj2d+9Dv/d64REpgU6yFvpJAvyWGWYZwy7DqawsX7Z2T/OWfse3dvzilcGzYTILXGDpDaSIQ2wGaknJj1EK1SGKQGJEkHxqSaczOHIAc/QVBGTIpg6dCK3UseDu00eAAlIz/1hJTuMNb/g0cBMal7PYQ8bFLYjm92n9/rxB0Pr6xO5wifRtRY/VZBgcKFfVxD0qdAqIok1qwAAAAM6ufZ/MG3j10oWDJVKR297U1Sd7a8jynsuOgK3Ww410+X07J1CKlYN0SqgG2GsjVowmNs/wPjsm9dhsi8QFfRCAQZkBLJpWY4Q/324/CgN+azvIcs+d667X8gvy/AeD0Z2w3r/EUXaDncYV0i0bSJdupCS6mXejdwDgT1+MSSkxVth4bcm96d2nyHMk9efPmwMANu5F2AGV4lDlE5IBVHT0oovirgpsVa1Cx8USqO3iRK9wIzxMIp67CVkrj9Y72CVvKlQG3QcdqCNSn4ZxP6AVVxTYAAAUf0a1miAqA31sE2YakjtvTl9tbBVKCoCxk+HeRPHqwL0L+PNjVHLdPYmsmZIytede4XxqzWD31/JHY4ZF+QcHlIzQp11edejKV2S4AW528D6O4oG7Q7Mt1xkdVP75kfpNQuQ1Ze+gMlJMKF+GwfEHDY1Ke2MfhCrWPsfrO4aFUVsnTETYt73CSNyOjc2IH4Q1zantMbi9Oj/E365ktvQP1l1QBNjejTTpHEcZHN4ZtlngE6QBfgkjm0Fo/TVSTUAdnzScJnqxvdNhVHAw5GcH6gHDmI0ocDGpjq2JKElORP+EK/QCI34ve+nr6oOZXlpMu9MO1I9mTCPQfSajEzyKXkZuC+qeUQw38WQiiTdrgAzqvOa7J/+nRrVP89ZIzJtotYB64NocERCKn9oWhqR4WivQZ64RMxYclqX59qXcRqpgAyYcFV1oGH+YqTR6Zv+1E9bzr1zQz71HwAAMvza+alVmOpjyNajEXifW1z4Viyl3YblhdAl024/3CN2q2J9exBY+Xzk0E67wvowZkywFi6qvUWFhJOljzI44MqzDZaCsVrzRx26Cjp9z62BQhcxXg32L1b68XL0eIg0VL67GblGgny2zMhjPX1ZIg6Zpqb5Zt4gFkiM5D9bEbaKOf2bglscoFLfiCrJ3dPKkXLFDnTqIa2bTT+sBy3rGaTM05gomiMzGOq+ZumvaPI/fFmvxDrM4K+wa633kZ+10vXMgzC/hrZ6JhxIFricWgBWSmjIkt6aIvBTMUSEDMFWc3kUD3++9hMJgVeWTNdEMIYKlXwhLiwRLPIV722pzVmme2VuNQU0Ni/UKu93QJhd+T+2s+s1V3hmR22vVVGoe5k4CXW6xhmN0Ezo8kbXJBVIDBtfVRHWEakHXO0frKuB19btgDegO8ckQb/C16je1X2mGXH06rHGzF8wl0YTyiC7qcO3L9F6FJugoWihH3/L7g0puvSNsfgsT3Sn+wySrJf5psg7TxVHjXYxvAhZFUPZRu3rinGijbEMVFyqyX+IdZmlZ0v1f+wXmpAEuDSsXPsNT+8rOzIoiqj9v0rdiY6PI3LWFvQqT9kn27ZzBbS94JIC0290z7XnjKzOR/Tf+V3Zq4vrIc5TE7nJS85JAFlIE1dXQakiFpiZgNjZ33mWiZgGHP9at0Tzg/RBx++z/90szt8AAFoYPdahkgmOJFlYj9vQzAa7H5s0jqmf8xx1JuZqwuLuRK381t3ZHQZ5HvrCPnldpcfqtkarZrgQRElV4LjLSsA6HHGpABynXsZ7GlO544gPFya4D2h4Z8wfKjQ9wCJXcRrQGuVXGiHpwph1f1OHUaUBKZ39pzUiILsOr/mrRX92psg32rjjMVBGcneIxXL6z4fc4DG6JNJnF8ecmGHfvzI9OUUJYZAISgARONf3dPP8ZAX9cm9Yf6oXNJPZAw4fCYHNbvhB7m7l8Rn5GpI2yomona8EuK7OrVtyRP0VizHMLVnVf7OsFwPlpZDgivYJKCA1yH7yiaII5UadfQeLp21+vUoFkc/a/1SCwxGz/Q11FXzuILHgQOL2ZgP2X4KNU/EOkHPf04QvPabmGYVl+Tbg8MDxwaC2Kii8B4OCkWLSFIpkFPZw983hynF1silhd/NjOeBb8j+i9Gdmr1SpE4KYhAA3UAY92Jpg8kxCLu5zGMvM7NDVNXhF393GwPLZOAFztYI1dtvRmXOULouHOPh5ndFBkXWB1t0X2+XjfgQe6ueLvoDcFYk6MIyh04zERovQUnqWcuOwlBOgVMNZxmgR6iZdafJqa6Mqxdgws1pyUB89czzGiB13nRzfKA+58InKtJ/dGGheIlOA4Ga6Av18YYjKYIhpg8xY+zfw7xdUEQiFVgDuGYqbwdgGd2O9QpkJ1eAaJqZfDRgDvzWm0BO3KxiFexAABQio2fDCDRTz6QeN5/xwGjYMaWkiQTWStxPL9IOOJDwwq+vvKN4Nv4kKWkZUbZuMrTtqWwfZVi9oPlpBt52tPUSCpYm3ysCa1sZb3NwUY1oR+nP3EQ+Ylovopmm12RTO9Wer2Y7zeUOov4+n+PmUfbNIXwTcvT5L0yOejMggocZDySC9CE1dH4FbCfDschpIQF8LqbLhQn9hZtgUHzgOA4KXqdkEHWQGocmDIE82cKJD8cLTnc8i4Nh9y+Nx4lYOl8fcxkjiKQl9Avi0pJKEdrjF/DHN6E6Jcx9cPQ57ZsysDCPkneJ1AXOeDZaIrCbT6aZ1Twxzzr/ASNA32V38/IJXSvgqkV/vnNpmAOQ5kz5Vajg49Mq5UvrkrvrHh7S4BJTsKeE5hiwo5hOq6QqehiB9Cr6betEnsZgAQrZD6J9nI3/zOTfVWqDxJMNhhdRYXH8wS1xbHz4GvNsWea0pYz8nCjB0uP2HBdWM+m774Rzpb36Cur4k+QbKoq5LCpxRZTU0go091cTkL/iliq+CVtYeVWUjSuEuiu0wJqy5Ycan1Mv0yOEB9Xh/7s0Mjiz20ZRNWv8xf72qKuPhK4vMp+TxUdCK4c4rA0H46PB1XmNJPxKIbKxfObPaC9dq1f+ewiheVmm23hRBeIGdI3BOXLlPPulKac6xj2IQrNnzPL29hs+Kb93E9hqTn+byjrfF9yZ1a/LmsNt5luiReZ7JRJZeHkYhGhwZBdAfSxwLUHeqj2q3AWxP3crnzN4Zg0vODa34G1Y28AFv1mdyafwHGowzPKVm0LYhbh+53+9Ix4VagjfLAKIl3hbpjPo40daRU/EA29lOXSw9l04TmwudpnfQvs/k+wnhZLJ5zH4OsK4GMZncX/4fcl7f+A06hYUA9C7yGbetcEF7cNiu3cbc2eQVDZHk5SAyQO1Q5sdVwE/xS44hiKtWHKViFLJyCT/4L+tmOY4L4DJD44HDercL9tyQPu9D4r0CPNzi2ELDult2dYXvTYitfotUvKF5/PTYBi/q3CUU9mgoWIm8AODfHzcWH4vGKtY3EtRpvqUgao7lDsvTKIj3DY5KQbYMmiHIjTL1Bh/6xNCuoP8vTWsE83bgq8/emJcAY6XaXyVPfxZSjA33OAcKkGBE01aq1jkAgVsQANqdJNQFr1024KZVT9FIbA1jiGyBFICqxqHwr3uy5HnfBULeyW5GwA2DbCE3+7vgNYcuyWbUHkP6erWgzNcAKuRm3ymN4hVvSBcn7Kl6+dPVl8DDKM6aDt9LEBfqkh/mvOWHUw4CSkexh1osF9tKdshKjFr24ctepxnGK7YpB8fTiAG/qhV6LsZ6kbEfZ7dubM6MojpM+tZuDRfqGJEdACtiYsLT9B1xsEuyyF1udh5KFrBw4LdOboQOzU3tjLL8kh3IEkDhyyD48SVce1MrcNvFOtRljBbX5t8lULD5PMiA7TQAtLUq6PtTAdEU5hxtglV06pE72x8M0O0XySvyD3EUza5ZgLQobKO0sdc1bnEwR7dMy8KaVRvM/qehMgshtlxdKVa+d9SJZwoAl/BcI+cVJf5gspdxfSFZyWOlEYCsYNZC5zzG6O0eWU8bdH6bvzfRqsW/6MmEKUCRER7Pt5AuTunGUTzZaA4LqrLOn4EZkhP4tIVVPGR7xKqaKQLwSw9y/TK3GG4Rly2vJkWLo/Zi2ZAk6AChoJsMOFOlMFityB6q0TypF4isA8e0QHLczbNeug+tT2bjaWPKE4aOv0rvlJydDNY1JwkYfIb1881dTtKQHWjBtM3QZyHRtUyTymh0CIz6Jk9W58qYH8Ws2mwZHS3izY63WN01z6QyIjweqCIoG5lzKvlPDVBVpjaFcFnetZC7aPb8jMDDz50AIWq3KRnTUTx3abMppk0n4V++XvcUZ+79IUszR6e8F9eSWkjjPmF9yIeYFY93Ovu/QafqBYCi8tcfLNHGZsAHtvPdcCVKDBr56pcZmsgIPJ01DhC41mRWE0Ch6UqVRnU6MF5zJa/sIOKt9wlTtcqtULsiSGZx/ZhqfQGfqehALkTs5YgJp5/HCHyHghX3rPpeUWXErtmu0OlQuDYldsKKSN1ekeZmWRprliLfxFexQrg57itfomnNVkl+5qpiO9pcNcUdO+wLLGLuyKqJz9W6MaPg0wmmOTixhHWVid3x1X8ZpwBOuKlQEqgosmEU8TuCRAlhYIqRuloUNA/tEv1Y8G1mwf0+NHvnVkZz3z6p5my6HsQ+juVZFES2UNi3gdLI92Sfo9z6yZ/mgcKP3rsHZIL+q0SLDyx6ZIBTx2OXp4J01DdoesfrmkS2M66/IYnMcppEhWPyJprHn0ArKy0m+PR8wHE1PAGokJZtwdkq5rBEsCdXiPpSrCiYNlZoDFGEdAP6YIpJPZdueXSpGLrG/5NWDJuSqqMqt6FDvmG4HRUu8ml+WnHRpWQvy/LX5xXU30r5TViBMJ4fZSEcd5jG+mOTZtwxnXIM5EvbWXVv+jHnBBCpRrc9X+vmFm4K+zplFQRwAvhuQMMLklRo7WTuLA2dCQYwvgoM71E80CDHN0Rr7+xa+8TPLZTP1VM4SgVFKKS+uiPhB9hdyEpTDEnBwYyn+BJjj7kMMeYYExNutaMGC8b/IMyaPMO6A7vajCIaY7asbNsExdy8NZAZlXQpOXHt8uK3CxsIUsk87M8JgA++QMGopUk1WDnL/K6WprESHGH/KxhRPVRXs6fwHsnBkSI5nYmZsuo6s2HCVO4xuil3roAgObTqaYmNRXPfmzca4uiIQKfXryeu/9XsBcLn2+xHXCIdes4vxt8MFY9JbUuGA7LtZrpNc+zm6K6QO16tx2Ofo3AT44jn9lltS1Axj+s8KhytzLL232hdNSHFl6PGdFiLqfoGhb9Vq0z4PfTORwL+clOD7C1394SkZ1Pbd596e1KiGRgfC1QSBJhZresYX7d+wC3YoeLB9hXs50uzDRUpEWGzZcJWnPntwhOo0t+oy/7MwBpcfdsRHrAfjFByNE+iSJ2Xg1EQ4ADdpBiVNcWev60J+56gRsiz3s/h2ufqqLJwYJ9fl8AqA37Osob/maY/padGPxz7dAGTIgE4QZP2wp8rBiE4KqcxbgndKfma7yEk75efgnckI1FNDZsLBG5g6AS127PB6kI67+NO1NhFLDBGvj0Q/ly+GhB+0xUwDC6+B436x0Om4v9Ox5AfeyTVEQJDRB3ldYdb67zuLWbB1D0UK1//e040HCatrpW7mXjPy6UTrE87Cm4972RVIGzDSyqZ3QYFqbLMLL9/ByZW7A2mf7/0xHe06hJrsMStvis4Sp6y67nP7sNdReVLMX3NcE8GPbyRRaT1iNwnhhezeltK6HxaRGpdwVgb+StlpzPz8alQrS/XnPODW1/6dMsxPoyLASFu0p5D6vkuOPK9j8NSWgpaezhf+IBCrS95j2nMX0V97Nbme97/d2VRCkxlz1oitopNX38FeTrOX8nkqDSXkCz91XTSYScv1dlwbAB8wwWTa9/CaTKae4cFI6ASbcThaLqeXTlw9t71ESW0KqgrZKj6UEUGQQnfQzcgD2G7RmgtYZDlXO4hEEFW53pZdMS6CTgL0vZ/0iWfH0nseWhUFIx7LjF7mZw84p8Nj9MAyWC9xp9k4OeeKmxogob+unD2NjlfImjTFCO1I2oCjj++0TGNJfz9u6cWb2Km6rnB6/aDf8GXder8LXsTOyjpf9LxYt94w86zhK4Evwfiw39KrmF+6I0b8BdtCCBN3l6SWH2fQQCl+7Lp2xrZzrD2uvzt6npaJhy+axhn76nBkw+twJ31ObONaqzku0ZAKs+KYj2jT3/1enh8uCtsEGjpcy180vr4sT55001twE99Efr55+zzSTdP4lZAdSH8j8QuSI03h/NwB/XfXpxME4lb/48skccUjUhUh4fIc/fXiU0uTy7MQCz4HRtEp63AH9h9ac4xGtINPDvMWIxSM49K/wxe12clX03OGhWGFB41rdfsTUrBZTi5P8fzTBvelNXAR8wTNH15BhjQzdxbFois4y2PljzRU/6Xfqp8w0GgjmMDn6bqvV472m2xgkLWlc0fSaZk4poYDZJ0S1H1ARFzNyUITX1gWc/puLjRq5AEbJse6TtXwANIcXDyL6kKpRzX7oAp0+WVNSKb4KVMcydSU6tFQPU+q5XZojEPh9N19zaSzREd05X8nH3ntCjht7TOe8gZ7aGfLiAOGSNdQikd0AGhGyob2/SOhh0qPafTRIqaeRtRnQYAAAE5ZyYTb2FIM9s7mSxjeNc1YYRnSZRTwWi4XNSh8FVoXEk4piPVLrbmxqnOjHyYEowu24PNry0lEFdj3VPvya6wq8Wis+rVdpHMAbv5K7mYENNTnFHLkHUkwZ1tqnUogKS4Q4jwOLgGaVCrtSg9Zt5HAuFYbv+5wGYDX6Z0GpJqF13HS0JLh26zQ4V3Dl6V3IpILxM/4J4ubiuaaNxy9KP+hyUwcsivOc8B0HW6x0s6uHJMTdvQccN06uWe4cLjCel0e9FFKH9clnmemWwSvIbrTV3aMMT8d98g5CZPMXJHlBSYCJEec8Kx8er5Yw3EcTR0livFv159dwigXE0986/6ixq3qyh9XYjPxpJvMsG0UOLmSzB4j+CFGfogGGJADFMVE+VhZYw5ak81HMecKk5WnKkGx2lVjvlJ+BHg/MDLeW5pG7ducGpPE5SXFYgEWx8u3y22V5fUBBrBRmSYGdyQgH5njyBoB8WSFWAOTWn+5cJ4wXtWkW6CA8b2a27YdDxvbC7+2HhJP//Nu4Z3430zBx2A/EMaEWw4WYAAAEplzsGl/lq/pXe13Tv3IY7h5Ps1xmbgc8p3ju+ZkLXQhi41l87GlpBdAQuTVrsUrSye32YhWn+NOWuBRkmjFZUiLqkv4QJWl3x4YeFV0UiQl7pLW0EyNdLyOnLjk3CL5NSJiwKi36MyWCyYwYSj4NJUC6qL58VU/UkT+3p/TqVR0774N/WkKPIpLoxvxQe+lg8dkKy2T/cBGYENTUVBvmYBDEwnzvoQV8u1kFi7XB8OqE4Bbqu/+E+6Y35zczN9b9/xcd5NqGM3puMakjoW0JruTqxmy2dB2zIo/OzuUA+U2DqHKLv9anX+ThTwh45OIAWWRlikmZrxEObsU5+fLNE/0S07B6L0cZRFTcbyopl5P4DGKY08kmlqOBcqcDGkwOv8f1qlH9HwncrQo6cDRAGP1l4EwZBviPYRQs/nEN/q3wMfp1SNjHtWy6J1HxeFaauA70dWi37+DeCnrBA6Vr5qCBC63wesdLZhx5gYaWC1/BlBHopl8GygyTT3rCjDBOuYkSvD/PxYKw4e4oRdZXueOdMEABCqj/lrm6xUwMIqwUKm027V7dAcIj9BR8jqgjFlYw6UjX+iIkqnZJbBpPyI+Asj9sSvtZifbnEtFwS1IGOx1fhw3ibVz/CVZscPXaZeUDibV6UxFR83E/qzfpRFQzcX7TQAAg7g8sV3cN/VBSswn1Mbi6PPvy00sxx9UcJCiZOfz3cw6tHKf/ETm2ZZU3Haq2GqCDiaNf3Ze6UFrMbn9OO6FmTy7y5jZF7OpWvwKLQ9Nr4UWoFe6pBiTZauyyMtyXKHB9mBcuFEUbSjiWIr9GLGLOd4MFSe5ndPMeAc4ECjITUa39yYZcYHC8JdBuyP8LQszO7brtSKapRvdhVIa6nV/bQmQ0Df8asIRJD9md1i5iBy+YCChmpjZvxaRRRkHB9z6oYLXe/G1zUoWhYwarxjbIlK2Z7CB0q/OlELD8PWlUYVuZhQ7TJRgXflAlF1J4FIgw7Qti0JmA706IX2G2zBXcTlhAsI4gs3uYbRNzGQ9HIMBhgXRcBPEdJ4U5v3wm3jTyZkkGlPVUn/jWU5RJgacKaLwvIptjlXSBs7qKN1brrofesgWvhLOAUpGl3X44CQleRkmDuJbOy2u/9bSoTOPiTxvRfLsmOloi1HZRR6ab00fMpORbvWLszy9Lyhc8veIB4XTOuiZJmVyE5O+LEw/6cS+44c0r4MdHt73YcEX2J9f53CNdNv4kXKBuA91m/IgbntbyiRDfO5THkBm1zJKCl0e0PVAIiLvCb5VWxRjDEEzde2eLwBNgBwoNMaULhVuIK5D6gxbc+GuQJRxOVwlIDiP+JRVGiO69llo2lTADW+fLPqdwBRX0EhUIw7NQU2HXECX9LO6QWI/0WzPwbWggj0SNzCEuVECOQAHh6B7zVkuCMmfyJE1G9jdz4bTYNYHtE68sEMoJ3BsV9KhQKg9fothBa+XLqAeoPUhFgIZ5/Y/eXuX+JxUOQOhU7CHngzKDAAq7ByO8frDcI39GAxLk8+yw3O3so5juXs97fMWg6G00eoMgg+qh+bAi0V6PEOkU11FLTqEwvlXtK/KIGKe1Ff8XPanfm2QWwXh0pXSc/xNvRVcvOd7S7Mtx6xcvGBQ1x7Wapr2YfK5Wy85WAgKlMqRDpyy8cPsyjwWiW5PLrzQMg1Us7tzVip725PwhGTdrATAkTu0X2WFKuLCivfphQR2BhNSzo2sjpOXj0q1L/fwKjCn1hl7zgWbmQ0fdQKmthlfYmpoh3g9cwM8e9M8OBCJa2H7VtCtzmlAuJsiLSCHJOsYSMKWWCBntgglAvWGUjIAJN7eJYAWh6tthKUhkBnZk3Tyyxb5yVqop0G3nEWqdv3HiTIqYozP3iWtdPuqMtj4CvmK+dwmznQ2+73gRmMKcI1HLTOuXBv3jg0BxCv85x3hiPUjQq/suNRXYF7jp5tYFW6O6HrW6KvTcocSc1zQ901WHFO5Cn55u3ueEoIS1zfdE6GHEPBHhQFNiHEf+8zpDDZq/PUn2XuT3MWPphq76zCrhYcVZoPXmG2V5J5jigp2aPvQSGSVhyRLKbicO2Bt5GGl9h0DKSHOvIHNh2nfGepCj3UT5DhX95RkOKxFCJ3C+phSs+fYzWGK2/aob6XfaWp9sNw6F01EkpUUnncl6JT2evXQMGqHbhGRYQHl2aaq9zSXhLzYF/B/M/6X4AeuqW+xQGj6FB5ja1EGhWuQEyWjS3qdaticezx0Fbu0gJbkUGM0CrsXmx1Qk6Zrl85jsxT0Hw7DUhhK756Gt6kDM9jBKS3WtSTJvGrjq5jE6DjVI6k/wIS/E/wy0IJkghIdoVw4mnxnfN5GP50ATUSaDEp9b0epBJyayAg2tn8/mPhEG6bKDypMkyL9s+HLL2T/qtGfYKcnuFgZqjtSY+E3tP9f6PNdLduWmdKn7357q4Ej9JUqem5Eoj6QlPoBiEmkjwSLndy92Jq1+vAMSVArJ0q6E8EXjwJwGlanbhm0YJbYBOtyFfWBR3KxsJIbE8wu01N5xkil0PDpn1IZHjFfh96V2HIQ8GC+a21Pfbifzqa0VqGL/0iOpV0saUCrFCm7Q9/5m/enw5iYD4NYWQnW1wO8on/IaE1P8GaxnzgcmyzO74+SR0fAHxy/2GGj8njVZPmwHNFVCFZloHeUtiux/wcjjTQH+J2BfBw7shaaGEFkH9QZ382nSDPB66W/dKOIMqTXkOsB7Gn8ejL/2QgHNW+QoCQMbS2P0Rd9fQ8V32BSOSvvYh4X6ChHGSKpZ4iUDUxRCXNyu/8lQsg2G+qgQThU1509GAy+GKsnnSI7KG6w8/QWWjZDCJYuXg1S/vywjroJB7z2qrMDoB8swxXz7TBdxGp1bdMXe1Gt93n178wtkCy30gJt52ov/AUOhJYziaGpK6lUV2jlaOIGewrkaDRfuxLrm1j8SqEvqb8dHcdTXagMpJuAAYXFkfdSSIgt7Fqku6jfM4CHwDcPFacqT//cCiBlZxzGDpdgCbip1LouAJ2kQETccpuyAXbBxPpha4CzKN90Ckdw00nctTOhxSzjFMmmlPPkJBuWlUqNcYSOcG2Ps4YEIMeUxGGwn+RHOdmgn+JglwCUJjcmNLPE1URB2C395/E9v7q0eALt8FUo5DYx/nnQujElY8IOSxyThkrM8YGQMWcglJmUKnJjoPyH5ytrc0TsiBfoHK6C6PIGVpuwX9oLMhk4I/JYhZH9DfKSg2CHW+jpxpT91qQUhPaPPnP0iwMtjnm5GHGPF9eFy1GCUnA9LmXugRVtIuSV9QOrGcPwdmo3tznd8qZMTBTZTPzo1fnq3+abDPnAMY/+HGpA1QHbmv6pO+Cqocv6qZVMKyLyeARfOdbVR396r0/yHhzB6BUkD3I3pQlzpLnIDW+zMrTPsqi0G/uxCUnr0jQ+Cqw7V/bhcwqQ8ILnjEEd9cYfhahCJ/QRNV0qdumqBGr8+Tm4ZRKS2J02gxgzpsuWv/tSXCTa/XWG+GNLVorwBk+PEUiLdjDVphUcnYMeJPmZ2JxphPhIHl4J2apX8dG8xsXoEGTlTcO2FEK0Qh4lDZOU4Wds20lzon0ZRfNhdeBzu+dvybi5HT2aasj1PrmTJfQcivZqZreOYOkEX8hSeWGfDOtnqGFqv984ejg0K2bqmv7zYucKVpZqsv1b3k26uo9Jzj0DaA2fGRk/x+koVg3znLJfZO6vtYCJ1LhonEwN9VWLt98WoN3n9dDNumPrsn7CnjoFmfX0mZD8styl9dwT3pJHakDW047SmsqNEuDYkAsNlYWj20HrHCU6DE/RrOR4HJ1kb+aUkhUvPzoxzLGCOZDyG1HHxHcOOuzcsqNJbMMRoOlqj1951bdGZBRQ9VFkaHbWEpJef2adloXAqt6FJLBwV8ddHqLqkCNfuLGoxF3ssacM+q4j1Yu2scIkTKs+PTX3IvP3VseXr82rmXSpsruUYCgx9GYgcsbYXw9EQeaMeE5y3fL25mHn2GNnUhspeQGoN7ZtGSuJrAl/Ov0Bx+RS8J9sWRlPoAukqXhMYmpSr3PMKUm5PZTScNdSFcsM2fB3izEkxAw6bGR+aJpIiuX1Iqmyoto6vXffkslBT+6aXSR5tfIjhWUu8UBH89nzucEks4m5tATPswVjWHzoQUZ/w8ATxUXmABI7Bdjr1y2tu8vZb18FpphnToNmq57PWis79fV8Z76CYxMo2Px0x4PZvrmVridI9V+szyU30vjk/7xr68h2gt+tPA2aE7v+VWjIzHKQO3RCh2Aid4BoARbuohbWSWiFECmG+W1QJ81scRgdnbICihXAESdskBd8trKRXmtwuUqxi7j6d3uksKYAAeiUvvWSxIf5m9u62/E2HWH6iYTLw5bvTEbTQqvENa9jxYLXB7ZI2oxVxh++mNAu+CQ6jyvcVXM04XEiXcFnDw/7/QMgVhFbRxhT3FMs52/lE4xR24AVbYmjgtrE/7fry0ABios0qinVvOrMLTNr1OVrOfWJuxQUKXTyWOj6cGfNWgyrec+ht0p6fHs4E/MpybfuNjaeRB5kRQ6dhFCJr+eSLoJ+vFuMMoDq++ZdIxIpdkhsGJZvBEC2/IbMx9vaHnI3enz2WQCY1FMUIogk5U8BX5Z0oTN9VlTjCbDDYD7AUwOtKOFr+6D7Ga85M52L+rCLpbbB2QepMCRsWxiSpLd5Iy4a4kgnwnsdzMGrwQ9JucLwmY3k0KqVuBBP2oTdDIO5ARM5kKhamOPtH2SyQVjU73AnlFdIgHU6RBm5GqR8/tmbqDUPazszlHjBSpsRqZpBaEP6QpjV7FxBWnxJ1oJUseSNc+69zKy9+pmX3TKNopcfE9kqQKR6l7f8SbV1vKP9V8zSstRpfOrNXEP1VL0EoIMrSbQzYnwIL5iNMtntLdEY3k02LgPG2U+wIAsQHLm+/kKcr52It/ODa77xZTrkczcxjEsrr07L/Xgl/IdBMeWESNj5w0fJRMtJID2M692Ig2wEKfoDdH9CWlu96Z+tHklWUtrJX5DdRe+kDipXv0eauVIvilKUuNDBfNeudJbdXd6eYE+4zX+DtVTadS6xRUySbWXJmBEm6gvMcGm4Z7CzyHiXtqd4af4KdoXKRLNW+4sO7CZhDwmqP/wrV3ltMnWOgKaReLWJ2D7Q9Qp3lQoUoC2erUMi3SNohFcehVSPNaTJq5UP/9P42Iz3YA0Md1qzK9c5WIfH4ZUhtXhUcKX9quqnx/5YG8O7xykEoEx8e6C44jVyK8cZv112oG6X5Kh370WOpSFBNVBc+EmW8TUzTxv8fQoijIbWMrjhBukAuCdT0LZYFDI3pz/Lpg9+MtFKf9PYyxUpl0nV9Ta9vjhk/OiKMJKRbkczgdYIF/nS4jNTTUjCY5mZbwnEjgOOBvkC0JUUkKEZ2tmbG4MNpf3LP89eOC0GcxQYEokjS4rfAkjtNj+lPUt70Z5V57G4Uoji/5Da7vmquN8mmApxmumwbfgeI4euiw02hdNpsn1mpRDA+erPDZvatcYGtbGU0KxjWAO1ydQAt3ljWo8Q7qN+iZekk6Mf4IeE3FiqtWga+zfvhXM30zwCgCAJdC/nB4X81aJszjIiy3+uqwg3WgcgOfJou+oP2y1w5djGmt1mUWh9/ScYQx/GtBuOlPCjDLq8LnRNm+s6QoTYXQqSffmEcnL8zddm/zUZsUqXBqrOjKrNPiPFjG++AILRbKPmC7vjMp716ajYY3Yc4rfhFQEQ3uWX6jDxjq0EMrQSuPsZMjg2ez9tD/gLTQoBC3O3jH2W0JGF1vihbkbJj7TvGwxPJrDoZW+cLNV1OhJU9x1Jx3ye2KccKdAACw+sdR4xUPrh89rp0OyP8+qQUqOqO620JW49A2/2SGnm1Umut3wNjN5c7wv5tp7M5NyZpRS18X8srUe+WdbKsp0PxhlSogJcMNdSDhcOeYsNfmdMQTaPKBw6b++/0TorLFHCtyJV9y+CbvgQVzLHk2piARUFrAopSbvwfk3XYCwCuuto77f2B7aoxgM5MBqdMYlx2zzvp0VpI+x61VnTjtbV0zWJFIronzSV3ZXArqn25iRKXo5axbCCkkxiZEb6yGO34Cdz+0HJ6saZRIlInefFJB7s4bzEX7EY6YW8Q4a7642H5GoZz2h9CgrY+TiM5dtuJrLHT4Omugr+NhPSmsPiJPJNe881vRFPjJq6Wupz4M958eCRdPXqLJsrmR8s6ihPs+mvbaZYRBrmzzI2dwE+qW3EdbMtqvdUThend/Iz6At5tLigMU7KL4SfXSsIX4OfsGJDwKVSzlMy7YMR3XEjPSUZupIc5V1ybHvT2QG5xikYKgtlf9Y/h3YAItDYot80VuADABFdCrS4MrS4BR3f62FWzipymyr0eEBM27XBCba5DLroNv0TqpPz+8JcZH4dVpcru9hWjaWVXaxwzYv+xLNEQyVWuqQDj9OzGnIso6TQc3zze9ytL/bWiB0N1pQIG2KkX3TMsBG7CgOnHCBP0V9Rx+AB2+smk9tD85DZNdbG3ij1rO+JpYoZMXXO270Egyi+auwM0ITckPdL6ZM6pI27UzEdvQpeVqLYA1xDeO1ccGvSzxKN2UY9v6Lq4VvE8+t1KOtAj6RZkPedDW+oZ3CSCQaAk42dEPTaTKIW/47i2W9B31aXps6LDObfXDeLJoSc7gZrF9qsJ5fdYSAq4YJklB/0giZvilz3pMY1g+SfAQkv7EML63WFYp/rVOLfbWpdgvCWDR+GBuY6FjniTZNPi8k39zEztCoquGJ3LT2YEHF3DjbrA35i2xuS7w1scqG4WymIw3SbJ+uPJSIi0fIByGtMmDxgvhS74A/00/KFiRI6smXh5Zh17wLtG16AJC0530lnuH1BQ/SBYJh6l/Iz5WRS/dWTH25Ii85B+l7U8QH1M0ChBJyu1oDfXxpwbV7YeYMMmeljruUImAVjlrXQhmrLZuU6HNgNbOBaGBarmO61rBxJZNytX0/n5+f4J00M9rM55tC90TEB01zO9t26ZN1JXR3pWrkIrq1Z2lTOhvLCwXpj5Pgb9MLjwPL8wCESinfc11yQQxyw4MC28S6mLr03CFEYEiddluHf0Uj7CyFLD2v4O8FWREcssFP4GYDcLDQ+6cIVFcvxiyoMEHEGdO3F8CBZZ2ikP9NTgQgenerFDG3Sd27+VTe613FlHa6d3srt6Ip55Gh/hz6OWu7iEkmyF6ievqjzqk3Y2q2eYt9wKCvzYvTEB7C5GoWtCkXKgHTbx+BDAXcpNtTEjoENChBaHUGgsBzsBdpfYRn6GU5XAAOnj9Xw5yP9bBjmQODnxxRPiLjYh4pi31pRMaGvE9k3wMVu5TXnijzE7WnodypMBUOAZDndhQIc2R6ZryyPmrnqCTCCOUhQo5cbWFDYzOTyNZw1zluDNveUjSt9l5f88JTZdSDRgznI8r1sC7CxnVksP4UJ4w8IKo811lp+mMiSjGaiMP4jwW5/UI73EvqhqAi94UhEBi3Vajo8r0LSFBeX5SKzikZ1Y5ebj0ecuSs4EOSaNgIm0Pj+WAkLyuV+mFH/YWK5hDUw1+ROPZzqefxt71Fz0sRDraq3q35LJ9CbcDIuLYirhucHQMZ08aRc9kkRfiX1/mw/La891D7O7wdOEZ1BvvYJUjjnsjxst/lggOIM2h1T9w4v0l5ByRfKesq1jadfMmept2bimRzJehP/sSMAma4ZJGd+qao+24lg9tlhXwCcWmJELQBYi2Wyj7/8aRYKVeCAmB0egKFtE9EHGtK83AcdFuCI+S/6Pv9tOhPJCNXcf/9BSwCI5iQw1XwxNoEmBxd6p4j+jnJ+fq9ecdKIm8cLDbdx0VCZjIjbRZwbLH7R9vfFXxEuvnxru4XUtcuNoekBO3LJwYQlUhRHYY12ej8kIqxA+DjZIhviLKxzRoXAG3bzfELoy5qGZJBMNCTIvIPjNwZFAoHxMH4f9Dy3Uo5Ysl+V18Y8VVfuyVeuvOzm0ipGYhP0jkerkuIsCPfn56zL4klIMucdJCpbvG338PzgfBB2MwWraasdK5T9NsALFntJaMfNpTaehbOxIp00beBFXdUfZ88Ucg7IhQoX6j7Ljho5aoNIYw3kJrM/L1K3phSKUNCAjpVPyIEbMf/y4ZNKBfm/kQQbUvq4Wwv2VsBqMzTO7T70sJMWBsuZzAB6m2f/Jp52eUvo61dloXzgkrf0Fe6SM7PnDNzIl/Snsw8SdjSK8KYAkLG4FLwaJYuIMvIPLpI/tMI3FnpJqTVCdUbhqR7T7xzZ2auvqlc/chshbiBBNBtc/5aKP3k+djWVujx3+Qx0hOI79NzkgEiDl90kAu2noC5OKexPYnjT4H4asQ4yq6UvC3aebiwbBLIZaDLTnXT720+UDi/pqzUF6F9iE0sDPtGn9zxDd4LKctx0KaaOBfjdMMBZXH9Ye0MlWPKRYBYuMhj8Mq8TZhqoAY0usFcE1F63r0LAJ42I8qDW5AHhEpe/8bchEqPXfYWOSHz3DIno+430A9JC2EGQVMuctuh33tbujojC9kZfn0arg2yRGEg19waXbQRLIOi5nUAfeHshPkL4a/EnRB+4UQNk+is5H2iHqP/kZwmLVeHyt+v4+BIY6hpHPRqadaexje9S5gPSgC99jYXIybebD2ZxUHrYdYdrnvYdGvIOeat6Sj6If/1XARZdep7/YdOY7lvCKJCG/G2Ek7iiygZJD4HObvpzpd2cN5J8dj1W0hokmXcYHfK1zP1OD6k8278JUu+o/HL5HXmn6tEPMF3vKyPTT8NzLnJCIah2k2vKRCqVy2i72A9fbahi0CF+/gTay6iQUtYgUJXNu809bGU2JaN0Rlpft1i6mqeHK2VPIK9jXNg1TIeXxCbX92tDElMN/jT6Dmm4J/3cf8u60aQLOdlxoGu0Rx7o+J4XmOkBpuPKChOuaD3Ekb8S8iTCNfPhluPxPj/+zHVEUOXO4UGRjp+fK5zCDwoNYMr3qv2qun/zRbrJhpegFQF1NXAvgi5eFq9AHg8n8QuetP538K5bleZReIttZ/BBqLu16SM0ZfFJw81v/CrWO/hwgiA/wPu9arOBKmi0xwlbp0dvguBCjdnnzdGMoBkBHCuXqZ5/p5U+O2PGpPeLgeYa6nCPr6a/XVjX6kLEjDbSugvBOuPMU7p3qYHfmwrJY6SLJlBKLF+REZ3/jqpWspFqMK/mYauBwln+U0ACFo+kLV1d/g005ebzM3aSeoWSCQsD/FtWxfis/2/ukXGJ2tuO6XaKoIGCOGqWlIpEK9caWxYlLyCWS0Q54D9BEL3qcRZ5n3QseB1oL7eP80dt7G+AgVKjC7OIFU4NkVcV09J2GjVfGmMbulZX5yO6l0n8bovDyk6hg9OenamiB+kPc4qMLUsJfiyVJ22PP1PLqc7p6ej/triOZG1Tl0eLSC0kKC9lcVfWWmw2dDJrM4aK9DI1rjwkUE+fP+LyBofwchzblHaohjQgeVn14Qx9zoj++3YZP7XiDwgd+CpmmqXXwknQBo6NLH4naeYTQQawjFs0AOqjNTzzrfaUcqMUtQEe1dlEUvOKMRk5Jy9Ya9Nsgfi0U+b83MinddGthzgF27GaZAFWYZSr2xT60BTljUY1pqXpZyRqZRIaRMFrW+uajpxefg9RayDuEg53jqayE3NxS0AUpIXI6k0JIjbGSAlV9OXMV6jI8qxObDMKJ4RxMiTilzdisTHw8UqE5Weed/rRtLDA51ylC8ewcwQw98+BQ9wQQHvch6rQOWtkB/reCEz7kqNaq2pK6Vs0Ch/Z1BRfc4fpErq5yPMoKF5gDwYnCP/C+sM9gL5lTr03fDkSaksD5fmBB5gADTToIuHosJNQ/rkGkW44ZphybehuN25utyYQQjE/apmlwUbCsaz6Jzg1L8SGcVCRyiRDKyTiXYdgPx6KnhdCXDFxJBJP0mpvXYPoeFYLN6ZbbfD/gpKrT3wtNdMs7kUgJODodVzuX/kanEEozPZkfTQMs38k6VOOxoWVudT3Smk797VE/2ZtaqhLqSF+laS0zUATIBUDBv1uMtqY5MT1rO1heyjz+pk3uqNyCGvYAYJSqfdJ5uCTfIXTyALkST5uCESJv/taU8uIweEybi7mmta6ECnzlIf540WUIiukLNrkcWaMImoMVqluuMEWAdt1Kd/ms+op1Cn2obXiU5d6R4yV9d/cSHD997gu1QEzUhFKsJkenpGFBGvl4drTSR3mk4G4lR9qLVATrmdvlzvpDYxwCrheqrvXrEcJbATojVBlfW4J50KD91QAbWiKkqAOBxYBYwoN7FQyyVJzerQ5YLLuIDqfAag74vavVzU/R8i0ODsJGUIIgYwvh95xUfhPYtiG3Tz0NF01nkrVa5MNB9LTG2uPuRyD9d5gkabmVybIhg62UmKuP9HFoa61m53po0qxl7XFzAeK12EekPdn5EESJmhon0PcmyskGxA206kBgUjsKZfw6Cvrew4Td54fRoCfXmIhItf67LS9qa1Wg5FXVBiGth6h6/XCfoTAKkcyU/bIqsMBXsCeKDrWsjd6rh+K83l6PErmioJ7QYIGonCtato1FQW4yyFCe7Yry73wWHPCqXgz5Iz1GAq5hYwwRKIvYtsZU0bQIjQWUcp/lt8FK7BOoa2cd3BimIPWFmQNm8MsTcW6syj8r4yPc2dvxcTfLsk0r1IJxMpG5wc5DjDgRoYL/w0Hmit8q4YyfpK5QejxUSciGkmAbSX8VZti39AQNnOxnjk3QaN2VOOX7LDR4L4g2i/P4uN8BXclVM3EkWj7Ol2sL+mYM38r7AaaoJccAYw5RCl6nqHrkLmWYuYElhVckoo2cvsGONJ06x70kLzA6qJUv+n0aoOnPpP12XmElH6dWAkkqHytq73jB/p29b8qHgpritlajSj2oMJo/vSUXOx4euFdDroElmvSWkShPZFXowK6rHI0bRFniTaJI5xaLadh8gedojhyudELs+g/TC/XKTBSzRjwCkhDkq9sN9xGKd5ABzk+jcda+JCoUq9VQW334qCI0e0dzrSVoXk/b/s/DjJOoov6tpa2l/7pzVwy94F4k+d1M9rkWfg8s8Vk2Yl8algqYMpESN2UH/DI93ix3HEI5Y590HN1hASCKFwF6fIUZMgsofIZgL8ZSQp9rg2A5Yfy13khJRMR8/niS8DTQOvJvPLkPOBWKCjkpryt7VZRpMIYUy/Wnxgsps6vbub2WoNtN6WOBGkc9rC+Ufx7Vaem7MLLQaW5iwAkEI+Mqy8ZE1meelPrfVxkh+NT7GaNoZyy/wQUBvrNllH0QqB3HRRipF8v6j1zuOyW/7jaZnelf/sHsaBeWWu/MmAWI8agljgwFmak/uRk1QUuSQtmOAHI1Y3Oi4b1Cw+EOZSS7BInpEb3F1elXvEgbBrhGAks82+PboZXviw7DivAE9JrEScNUhma0sGdzZOV5zzdp4C/6tRRtA9MS1cy6g0g56TpSdnk3TpoW4CLwsN8xvKhblL5olVTx2QXJEYshdry6zsEY8DQfqpwzXj7JpeffSc8uFb0moqHWYigKcSfhsEEGI7E6DLrl428CitOkB4qjiLaFEjL43o1WB5zph3S1y2H4P4oB1cn4f9OejYD8s212J7cz/BoA0e14fDPWvIlpNvuBQpZfySmgid/sL3XDVaslxNzDxXUF9WnLkPPt+xT4lorSTGPhZyJI00b1jP7nD/M6BRe2sJG+N3BRAuY7TLhxSGwGod3gstFyZkowXMTp5GJie1w+z/WbbEtIYXgzO/qVU9ivRiYiQEqKanBH2pxui1J8hCWc4UgayjRvfkC4/opfiEw+Og6xYQp6OvnkJUBp03z/9MOC3+34InmWPVUH2fKO85+l/zhk15yM3Gmah1uKB06q5RTFr9AxiGjmqxpls34utRn/RgKkmDTYSZI2T1VJbj/mDMSdcO2Qk+eav0w+qBQ3mHdj3J2IBy/ZYBR5d+09TzJejbTveSMMgjGuD+Ph5BlLuyeHt11N8dgO2MIDn+H2sBpAoc7psrcVsWclMSMYqd0oxxZVY3wEAsxeMyFCq7Y6e3eyO34U2th48V9QwqsjsJ1NtwQLQoK7VHVgm4ksEXMbh1p5idT0As7Cp3M0F8w8rXdyMzXdbO3CfPPeDkVfMauRHzz/KveTBE/IXkDlIxN6h9m4Gy0sljhbnU3+G1eJR/NVgPU+3ex+yuy039IVniRYKGDweP9WNb291DBWz2lJDz/UjhF7jhJtgpod8IaaCrmnw/hTens4FLy/kNPJR36UddVRPkKnUYcCsbkpgftPIMmD8BBbX0O7TfVhMo1GdFc/MwnUZL9zDV/Tq9jTwGFlybMX6ciJeIHrWkCvaDdWLyh9SCsMr6yfO4h2z11fHvnUNQPwW5IaremxXUeELw0VGZz7OT2iE0ddc/pkqERSJ4m9q/Fhcf79din7v+6GOmb2HWXv9KlxZ6qeExso9MiX9q133yjdVHgLOga0ZB7cQT2m9Xf5KsLTgRm+DgaIzzKPmKNrgnydSIGiOkZWKXheBdhOcXVFCgqu28T/a9PGtEF7fzvDE5YWl0Z+1QTVlI5RViqMzb8//yVCgguFG3xDyv845yHxDgVmBTKQHW7nSWs4y6kfbQV93oQ+InDXCgM/77O/uiD+qpR/abH15g5Wa3CV+x4pyapMjCE+p5JcV8hX7aoDM+++Z/LXHplW49/X4vYD5kp4m3GeLfSoijFx2ZLBsV/4kusyLqcVYeJCgtgvDRrZf2T9utdRYkWFHjeBy9te6KhJ1JFnXbMceG3JKw4Fjf1Qa9f8vIM/lz4rOAzsImr5ec6pUo3vadcGKwdX3Fx6+GUH2L75Evgmnzstfl0DTrNxSxchiXTdt4LJ7wZFS3EuUVZuLQFRxuzCzj7SCeOC6GEBOHLh2TBsi/UrN6aU7IPyDClPKHTlCMJRnzY/sNsWceSI90Cdj19vjJSPO1ekwPgT87l+fTmVmeL3JYJf/OfWq+aEQFDsO3ualIbDyOFFjpB7Go6eOlOehz46/mH9bkObLt93gVeSw75Fehv0x0M9NyKYThPl8JSOFSVGBkev5qpHsu7g2qo+G9gUEO9f4jXuGtjK0J6J4TL9ZG8Hthzs6nwSBUq9JOYgd2fQAIyHCAdJr2jODxw+55GwNYuFM1rWkNpNbHicH7cm/ho8LTIMBKf5QIV2S/PxeiV2jVilPsA1aMUJJInHCUNJt+ahoLLo2aamMOy4AVq8Wec0WgWGW/EwvIO5t+bnDpggqHMYdVaxmzeFwcj+LJLlsuKjL93XBTTqzz1zwfbp3ex4y7gCdC7uxYlYVkyRy8RsI5T1516I/MJ+6E2W5B+MHNRv59tULvAt/4jkA3ZjeGT6P24orHOpqX1FYrr25IHkDrw7OTw5AQyKoKVhhYfBrhKnSDWL5cKVq5WtpM8JE7Jll3RYM+y5NZXoTEdur+tZwmn1EwBQMHZL+0yDS+V2WHBtKswNiQ3Sjqsq3LZ8vPnT54B8ED47ktljbRIMq63NzLqBLpBzsvJF0GP5+xxAzuPkaNRJsSGufDqqo7x4HeDxaFFa0GhRTl1nKOwkkRYwSqerjQxwzPOhIPQyQxReaA71zgjMwyL38iBYCFKCgulcKSpVWmqSsZjZ/64PGJ+7S3Ad+HYLZFyY1Ccy81tmFvPoNhgSlcuTIUUSpmPfZyNnZqFTw5k5w6gXSK0kJso1z0x9afiCf2puMZDdk3w0oF5wznMY9AUHnBrwJjeK+M2bYtA5Iwizlf1g9BFBTV9u4gjg161/AdIi7CBFEwTbQJ4IjaKLUSjbU1H/FukdJqoIGrzSMxeznc/0nBZPyvz6lswhhd+g1pPI/ic7Wey7u6HWt0LCiwXHzjP+LlJxGozpK6lReWviojz/Qzj2l1zFPxCaf6n3eVHbDfvEes/entTs1vvtkVhUZ7O9x5u1MS5dfYDYiP0htA0hAnAGc9rwtYwz1XWwKuHJkMjqTFPl7LQx458lqKx5xM5vdWS7PHfIotE8iqUgWlD0hNlF5cSUMqCN5F5OAjwha7cDNFBM56dcIHEJqisB4Pqez+lN6rxvhdsl+ADOq2IMQwsCrKr72nq2lBjciqebJhhX6J1504EgV34e7Fjr+78C/ZPW4WPx+aTUc3XdVtjKR/nn6Qgbail/pkItlaWQIsvmMPTa2Lnr60c5n+YhwsCEO2QCIVeXWZWFONzXs5DTZCAjfaytvUfrRta+ZYk3aCIxQA6o4/73oyj/noTbWGxBjCOfTd1Mmbew1ffh8EfKd8/fiRvq3MmfjyzgqJAmHdniqp3XXflz7xvBiz0b4LKp0IfnxOpAyL3Ls25SQijM38HfIirAwk09ZYJSnvXUPrBi/V9pCztCYGQvQNSuoRBhD8/tiZFxsF8+9XLLtdf3OiKMeXwOb9EfSMa8fl2+TT5CSpBX1+FW4Hq18T1ydyJP21vH0XKh4LgRfNx1m89/O09G5Yb+BG3J7IkxUnz2/wdVCzr5BFXbk9zsSswwkwzFJFJ90EvuDgj9EpHjF2flKC+ytcPhkUn58e5hlxkbNZ4geS/5NZVUvcRrfax41l8L48Kjwq82TtDux4NwFs557Fmw6dvZ3t+44AOaBtz+yDi2Lbin0ioFxIvIkf6hsxpDpPkpkU+QADElSZhWAKG+KtHjU616Cp6NifM9m8/VHwlFrpIcldAmo/NLSYgXtuR0zsskVvFVdy1wYaXJnXO+ZuxU5jANKMP/8G9eTb7hm7vfLa8DSzHRNSSMOITFHWrdi8b5PRBuMbdWZgXVb2KY5iRvQ7TRt1T6aKZZfa8Bj+AU8H4rY+tnLlYNmFig3YFccld7796bEYomWJTi1E8pq7E3vJlyQg37RK1p4MWm4P0VC+UvWiKKG7j7vZikgxqbhOo6SD2lXIaHinh7Pm6uOPuzm43m4j3jFCXDTJPS/VAa4wn4UUiWJrUEHCDmxoEknulF7dSzrJxnjofR0zyEASwZSqsUzmyzfEjwofCe1NOY9oAo0Wp9Zt0MGRPDrWhtQOYamQez/g0hUX3o3e7n1rU4pCe81lCEq/Q2R2K6AzLdNUqOniK6yYX0PCq1U3dZtDj8/SyUyKHPmg73pXtyfbZcvh+ewrCgA6NJfQfxyrZ2YgyK5qu46wOLRV8Lv+MPhwALeF1Z0MEVgMLUWmxbz/LysoTtZCWxr4hUmTDuqWh6OWqi3lz6ZqIlMMJT2PweAzv8k/Wn0B+CfkWWMP3tTdQfJZyzwArB92b2EkBf9sscU2zBsAYhT1GdSuIu09i4MWfI7exZ6Cte+cK0mkCyyeDhz2EWXK2Jsh9H3meZyj0jOZWeJAbRMW9yQdJqkQOmtVA4vxxPJ7c2pfAckE6mNskQ04rOl7UXeXDIizPAMoQkPjbXtu5no0d1qHxMZdcaV2ci1ilRJ6giHTzZlLkeS86Tu4AOxd7AXRoBBGzgEmbMbRmazAszIIPXCijyjMvrnU7xhi7U7DUDfOaF8o4r835DWz07k49UkLl+NHOtQPRI6F0ZtmgoRu/hy+iZXZ7lf02RVJsIQrYjw8mDDPEyJ3zlHo9FPicNT/H23QALerqVhPeOszQl+Z5FdqToaToRTO+iWdiSwKOA/2lNAN7DQ9utY5aGRz9uShMs8kqKJtPS3ZJnksSat33FSOs/r4OIrslFMqS4fjnD5r2YULNE6AFeMCnTQS2sMgeyz/BtK20QtHPG4vw9Eu/QAdOraXBOopnfloOGYPD0iXBFBQF6y+yZZOh/gAfuWDPvhgEbbo9OXH70DxogmvxlGAcEr9L1phdgUw+EAGauMJGl/+eNVbhswuJQ23GPeisizWlxixA1NiU+uN+J7CGyDyKn7+A1Yvzt3On1neAtijEKHjzay9GSNgtH2lyDqIaX9E5UbN2fbrpbgfSNTuZDu2QDgHTU2y4FQj1/fM8bxNC8GdHir96ozWTSavxYMGqPPxBQv0oqUgvAWmNIP82no5Dwo21xtux/Jub/tyZBZO16RojV1AkcjgyHHKJ6ELyMa0qTEmXwmcfDcIIo2Ay+mVR3HBYjhRL04BIDQeYhtJdpKYLitSjkrvQkDl1jCWl2eWdIWcjRlDqmiT/58SDzBt/ZMWWDw8QSu97yVyFncjB0gHGN+hBLoBk09mMxKDc8zAylmyXJENcPjIYikym2Yam2cprrTCHMefAtzIdAETD3GbKdLF7bP9CJWw/BpMrdsatG5nNF9z3RrUtUuqpXxBpBc8P7H2dAmYwjDhuhwNeZKxg6WUDDTBwCx4356LpqcWOca1Smb+mWazkUWdXH6OL/dCoh1mhAVLFQdgTrg0DLWBY+XT/Q8c00oPe1CJMVZmk9VlIv+vlH5jiYR4yg9f1f+QmFQLg5KW1p/eGEQwAsaQQpVdJyNaw4frx+UTEB0tYtuAQLNPiJa/++V1K2g1g/yH/IMoWA69paqQPdo3uEDASrl0YVkWoNLLEe2nkZIaDyu+WQdifHgJLRQ5SgGjmXpo9moa+x0dNtJWXcZHS4AdvfOv4ALZ3gwtjEkEnxhQOAGgRtY7zXrrWqB3OPmQ1CmlShsscyv69WiwX6lN8RY5bJQ9SJZ+55pVqzk1xyEynQkQDaka9V2fos07806VafAmf6rOXP2Zl/UvYO2fwNFD5ZOhSsbDpkp985Ccq7uIk9QyYlyDMu2yD0HZQ7SEWJxbr8K9lyl4wQPU1zgD6arWoKP2Qo146h3SwAvTB7+YcsEqwvllzbVGP6q1w1+lsi6KrzVl/TeX/CZ4znoR+cBm/hWhyjGRp88a7RDUTPl5D8NQRiLVzbWxgvfgPnw4CwoNXfJWF5GSeUpps5noGSeASvwcFRp0yi1ZEuhPQ8K4YTyX98sJwAwQuKeimnoQVUwXFcTU1CfZmwtLeIyjpvcEzoCgpysShihVGSE565+QBOGIPzE6BNJcAXnkI78UZGh7FEi6/jh/5SVqoP2iz5UGOLxlqRd5zPFgPOVIItRxXF5Q/DP6P+hNVMAJwFI5oin+lZ9JLwZ1YlqhrpPyKOlBGk1b2emhv5PUtS1Cbx5iqKlKUluYWhjBXoDzojWZmiMZm5ooOO1nqiKHUNXrFfP+o+piJbPSXfk5zChA8Gm45Uee8p0lsfiDX/f6UjnVN7b+llSB3v1gHeJzqky3E9+P4g4BgBTSPB71VK3mIkZpIhG8wXhBzy76i+tKJ+w/DyYcFVFlnvPSS4Oe7AyDido3sWoGZBpt/p1OGCXKdFIbp1JDoT9L2IXMHBcwTNjwd0GOYBJVpZogPI1ZyExyn2Q2cyRi2sF7LDUa+U8QiKwhu852roZZ2S86rXZOpzbMQPewStZAazWUsAqH7BbqEMQLZtbWEoR5LK2oXb8AjY/rcuDzkESHcuFiEOcn2L3AFaLuu02YK0qporf+OaDvDU5CWpvJQnf956+O7rLqrjyMfBWzxH2c1AE+ErfO4OnldzhBE+0mP9FZijTH/qMp709WNWBxWSZXFzorHh/ERPnraLynhfcO36ocPfR+xvmaylCCeeyfpCrD7tsilPxgtLT9WULqPRfbCfRqPKCYCg9cwDjAQC39vrhHWMfbEjo0pnYuY4MH11dFUoe8h8B26su0LEtKHD76+SIvqFa0+O4YRVVkJz8Yt/iMOFY3Ya+vKPASvIBKkrytcng6P8xnQ91PAHBNdDbLDPvNYvqVwio13o33kNoSAeJVT83+QJMI46ki08RfHmHPAki9IRdDWThMCxqucplST4v7XDgvkaJPSbH3Vx8ooE8pcoShV0VoMs0GrayxypIa8WbMNZuzPfaVg9C8ZuAsBAlnwwezdrzQ2M18S8lCex/Pg/nG7OQKgJiAUwrodwD8saxE4np+yEgq1J/14uYnW8xwb8TyP9X79zGIpt16PKP3Vfb7mJRhAYaJw93+ui5uKh4+KuH7M6iULK7YoT+jWT+SaXD570Jjsrq8h6nZJWA0F9XrnCk8E9C6wQ2zaSowdLQjXUFVp5BH9jZoQQjthlgtt5llnqaOC2jcAjO8KXAmeL6Epj0xhQn16XS0blz4Nw4T9Bg5wbqhgvP6AbY84Xg1i1mIb7JSa/0qIjtfqYGjl8DQXcwPNs1wPFMowMTIE/PG4JQsEN/U/31CHBZd5x0re/56qAgWFZuds0cgt79S5MYQmwNrXUdgleHrxCjLzlUW6Ve2ZQTO6/HnXJ4pePGccNs2RG7/C7JF39wo4xOr5NKw2farAwSopE8dA+Jo70HB5DVCt95Zh1eNoeR0ydb02T5LX5dpHFw/axMRJVaT1aThdLqloqXhh6KEcb6v+sXetzdodKgbX+Jba2hDJ0BhCHuu8Wqa2UnzD9vFcbbtKeN5w+s1v8QoBeqNQY0e+FaN5/8+zunry2r4scFa09mcV3kSo9g+uC7DpfRB9NeeJq+D2WOu3TzLijktZxkIstbXcRUb4iR2zvxRjDjoHnW8sny1ITBGvcTz8NLtvQFb90jZzr0KL73EVFSaHvymGMH6CECG4qyK07jTJnAkUA+BTJajoSCP2nzBXPvBl7IewUoYj4eQMn+BxHwOLAf4CnIQ2WIvpG06WsaVslrbYPfdLJFsRjMdKwFLCUcRuPbQU+HezcyQEYdUJmS11OtaSvYyf2nJE0Ffj+uYZ3VBhDzcc+/pL8lQpp+JjYV+7QluU3snPdJz0UH8N2C530CyHJzMQe00kweh/67ZzmAOWszdFjSU6N7I5aoAzX8en/0Qtb/14MJ1pJCoDfTl/gEzWY81UUn23vdpgNFO0cSQz0IjLkp58cmY9kQXJWIFBjbF+4zC+jWktzlS5MC0lU7RPXZIBgiv3YaNgM//5PpfJyzl4CExE3O10aZfbjPZkRuq3m+u4YmAfhSUCovH9emGnA3WtKkCTy2F+ZxElbJkiUkLOjvonOkJLl/pgt2hrJmk9onx8AfhWcBYcpAejERJGWg1fNh9O1/6/NSoqfKhKGXzNXE4aJR2KF+0qGVZ6loJr3KpRn5uTRhw6U22uLAMaQ3l+Arl6m4OjtdXKJQ1UNyNclRfcr/NVnUXSy2+v96SQzothIReSPtsVdTIka91O3gkI9Eg5OHWgSQxiYyYoRG8WvHAsqvCXAuYqbzQX9Ld14JIl1EabTB2YqG+uHf43gWoRLbjDfoepiR/Um2wDBZoXJwLO29PEW+l7e+nmjbiq8fddCz5apyuGf5VMP3eT5I0LC0/5wDdI6Zm0fFBwwtsxYZF22GaqK9nb2NfblZR13o2mdsiu2Sqohn/z8XGThDykjqrkxIvUei9hMtMnz9jlfldV/JPHFz+eIrzi/kY3LXZd9iImPNuSA+MHovl28HJ3WWxisYNlMDzznXe8+aUwHdaPA1AkbX+xyILEZqxWh9ZisQALKRBQSlOB0FHQFIZu0+UCBn0XxJuF/NqWOsqfjP+R3464IV6ESjGspZOXuOELiv6pEBR9pejl0/EPjbMj33eQOt5UYDl5Q/WbXtYiLBJ+Dh6ixAzpVeN7JQnXkJUZkYEa3glRAcLnNRxPHUT5CKxG8dU7t0ywPKLQ2Kb0uNtby/bWaLG6b+9IrfHtBVWbUfdUwlQmgYnAtUsyezeqrULsAlQu0RO7OWAly8NEWZeGdKtKDsKXeUSOtra8fEebHTS7dzzb4fASy5nxJOBlTA7IAc25EwmHKnfct2vA5Pb2YyWNoEMOGR0ZHBV+SgtZOZgi5hE08o2gzpAv3rB7DR9aqvUWy2Y/7eOtEP85O8nb+SKcnWAI42iiWurrlmMj5kSqonpAH+3Gs95UAS4XahInLnrvOsQI9PhEhdQChjg3qBUhV85XkE7ryAakVv5qwrCo5KpsLw7zekLvthpH3nemwKMREkLCQE1eMwYrWk4UW/c5cx1R5PQEk5NlFwN8jgwON+9guxsyfYSgL6pi34jNCUAQvCyEE0Q9aPfU4R1ax+6ql16Em2uOuUGyT7Oanvm/eqksXZZOx31nfw+xYBo+B5EXDfEul4M+pKFi7avz2yFZd5xyseeUPwHwIzNnjkpqu90i5HvMXHABXQR5kvKrab1Tm3gwLVr8ZVRX3hZPP/rVD+thGBbrXwmEs7qtAjt/WkPJdKZc5cYwQiLdVIWZKn0tZWguY45R4gcQXh8cw2m0HCsDiD1tKSyw4EhPHLLqurIc7pv+DyR/vJUYGKEupXIeWGpkOTZ0w7uLtEz0HzBum3UaqIpYJFUloBbNqqYGSKRSX+N3gm6sbV69H5ozMZfq9kDZxs9WGQyo0Nk1So0r61VsLNee5TOetH36ZucWczndEBszxK8EetXCN2MXmDcn8kFchbFghum4/0fs08Dix0gg+AEsu5zO3jyByn/LwJ16bGMMfX7In8rUJ9E4GokXBKuxWrHSn7XUnyBjln44wlT5WnHq9CuRCip9li17EWsPZIW5uhEQGo6uZazXQV5nHTcJPVKwa96XLBcXDEWEdKsc+MqwuoQY6Rwt6BcuXwaBpSPjg32uPtEeY+pZECHMUurot8P49VGW4geEJFqbOlFWq3+fgV4wRKWdH3VTqGI7Rf4w+u53E+Uon2CQPEoQCFsfpLoQoLQNVpVBYxT3nbgOz0eiUfFnCR5/IxQGuwgADsZoWxhfzgRqnl9sRu+2bw7Sy+NBzKFDDVx9vBpXVSjzLPJTD1kobUIaC1RymylD1sH52DUbKHk2CI9mNLWQdIHgCX1AQ+Yn/RVEiehAL65iEqgoBeOsiJUmlEu4aWHYQ0dcIUktzKQlfhyEDRbJBMvdzRUqoCGOnFFktHFrne6E5eCHIxCpBjiAlDXwXe0B6Fid5BdlkPpSNi0uS03aQDuNmd8ESqU6mdbdr1rcx7Ku7LypLIVgAJa5CiG5pzyvY8Jbiw+9wD1IKjNlQZ+9HBMQ99mSIq08j7MtOmCiWvuC7wLfSNMGJCcIWj5xcFwwE6dzoNIfO5hPmq7N5UqJ2fqfIpO1Ny0XYlAmC4NXfLcaY/uBulqyMde+XYLM30JtXe5lMutSb14LwkwZ0xdSJHp0doHbzDV+riYjtXuONmWt4LiebeT+xlfQ9J3IrTHlWekDVFz0+kivNX2VFc63n02X16JBKwEXIVq9aZOS3th9GPbgYbhwl5SHvFVNF72wGnY06IGNsUoEDfgznEp8LV9uQdyfn58VyMKICE/oJpZtIpzoDbWiZX72ZKpY3S9tpgGhRe/6MdrcPISXyMgJTFer8rBT4fo6DyfkhA61MrHng1Oc+Qm59bEba3apqointBzaf0DiTmEl7NkrbC1cmBQ+EfW/nAInwfu5BRzHaF/5Wjjh5SsViuprcmI1nT9ToqcI2MgOKrvXKJY5wXxjRwHAAdE+A294Yh/lBEXC/SEVyVIXyySJv9+IW1DjJAxApPmRAO9HZO50yiam3BUAmYBz3BSlXUit0ybF2mo8w0Lc01pWxFxCXo6V6/DfR1uAa3QTTZjyhC1wN44uc2U8pYLK1aprtaySTxBQk+UTgX9ye/n0gtXe8XtEdsmgWesereSJDuXELm7gK+/clvMaIgDSJG1lwIaI/x8l3H5kto3T4GmjoK00DR6gbv9mf1/EUTPM5kLKuH4yQWuzHZyd2zeAI+4fKAIHg+bgGywoA26Ng0XqW5ngn0Npv5UgtXhMIDGnJMYc+wEqyIpF0O0Wh1/nqU/P0k8hFRvbMS2r6lJAZ9aEe/fgJYs/IlHR1n3B/ygohHynivJ3YKZHTRGt2oLmcucXDJnOSFNSPspH/ofsOC97jPWlZR9Pq27uickOJdBZVfORAH10R16sIGYf/ZaPxmxCq9SXedFWrMBLSaEDLfYgieWLIOX9DryzyeRZ36Iih4sHQApdx6S91dsMtKE/u96UkOegR6+LtQDr/+j0+pcxEjGluverNaWWnzTN8jrfVdbG3Onv3dmSo6VI0rjK78Ln1X9urY2JkCYZx6G00R/rIKPJuqdrLgzeieWYseN0bLkEbwTclO9yFmmsTCWl32I3fW6v+VxveDMFibwJfISqfQ5pSDoA2uKKHjuoNFIoD1Zc/Labl8hs7b8glTDJRjlq2ytGHG+v/vdxrCZ/9BXdM0B+SU8NO3dYMHP2D+Y/JnwhUdAxB/n6Z2Us6leJB7k0tQcTRH49ychuC9SAdsEG1PDo9yPGJJBGelZrmUUp/zJ+jY0Un1LwVEDsk7y/N5MW91pWK8Z4IjV8ilZy2z7hd6Fgz8IXRwyAf4U7FVx28T9WSguy7d9X+lTlpYyOYrM1JMoOdlGsvYml3bO0fIMzA/ByANWAoaAyAlMmhh4AIvRxa44E9JmZQPTsK74hwAqRZnvp/llFUHChMJbxz8al9BXMi0Me1z4UmtbTo0GYlG6ntkRrcbIEcu7EdtjKYs75AAYFyf/Q8hZvfS6mBEYhD88sdZcTapmXUsj051Rt+heu9DRUL5b6vpkTKEJTwmL/3TvV/vZVa6EFvloVjkzOm2hWjlZPj9+hfsofrNGRF4zlQBbO8dhpopSZLB3lulB99pI2onqH6LnK2GGNbMPnIBKBFFLy/s/+lgCiEIfyzR+2Y/FrvUeHPwS/Ui2UrmxrmP6wgxFAdBPn5IFFSGIcK7DAkyPJLZKEsYXI+tsJZ8JcHfGHf21aZSN++kqHJ9dbm+sZsWNNKUlSXzvxoD9GvpWwZD9RQtc34aN4M76vsoENgbl4olTsdgoWltbuSyglaVbxEKEQ9DPRIMkfvwZbAkayNGmFndpOyl9/5FE0g0QCWk5X7oFgTPOwdf/0fnXbr2TnNmgTPwBBKfyzuH79pftwLfqwKf/ICDjSO9sGBknT4anKuK1hHftLV9UVbYdDA8BJGGqZ5oTD2h8HoEmiBlbLcAl2jyDnTXzIQFfFPTcBX5SJgAIGeV1CMJzKKNEUPqOLYJWhOSPsMg2uTBbiXpoP9td6bIVugqErIzjYlfEGrq6S17YT16V3XayZo8UzOdJW1H/z9YeSAvVKZak9719WopQFtNb5ZnPhc43Kg3WM0tBL8/n8Ez9S8POLc7ikaNRzJ9ZNVcKTwb5arPBziZ3zD9OCc39hfqQGHOZTDhpMGUJ4VvG5G9jcOJZQHqTMA0f5rGujeaVyUyRr5TLXZHrJlOLbZPcwsapDCngvFV0DZPTH1rZvzWnGsTLDl5GUVv4b0Jy+lHU42BrcqEL50IZgYM7TYmIwpdV6a3nxGmndrxN7jalHjL/E8C05q9L+FJzBR7kvXPA6mnSaeDHSeYNfyRrauvyupWgKRf7mRNblGVpqPRUNSaZoXHd/HRP+1X2I1adTVTEwMK3dtGKdo91fLxFnTks1cz5ibyQNDNAbTvKyja9rzK6mcbdI6Fqd34/RzavHwlcP6y8kxMLcPhqLQePIfyqrzZ8bgGvHH6pEpFY+uKh3+vgzyBVU0c+gz2f/aXbQ5C/cxfkRam29BUGXejfA/YYBejTOLPr20bw/sqclSL0wY5D8I15Gtt7gMxr6tfUoWZJBanKnwwnccFCd4kXs2NFqgpxmUNe7aLOBdkIBcUjeMsWSPKF+vV/HsHJXhHwvcfY9jePgeI6t+htsFSUDBYF78jzjKF2hxDeDHYzfaodi9blITMj8RWUKCwzgcEcdRrtNWsTnx9QGcMPm4aPdW9GRQK9viWwqzg+xDGfvBzJZ5uw/5Bc0ukpYd8lbQFEliBsfdPISaChAH/c7N/u4HcxsiK6gTxicqbEyRt7cgN6yG3LeL4DSO57LKBsZuw5v4MbAJAJIB5J/8ocjxWP+3OJspim+wOQT382Qhb/fCWaY6BV/Y/PfxPnQvCBqBWiNv5ZdAV541GiPS2hJJBoa3FPQ69cqan3K7JpJyxW7TlkUmQtZBDLCMr9sxm8k36pJxIhqrHYx9iIonh8DEcw9lKD2oKF63t7tnD4tRt1pHdHSp/31nzfgFzLdI1OVCgcUAiEQOdO6IMcZODr+BeoXZATVqqmt2lmMwG5UiGT+oaAmQjtSOLV9xG4xfKun3vLa2CTdWp1FZZM0zxfJqgKnlFoa+uix8ax4QmarpvbTKZfwS5KliH9qT0iU6/i+FKwATEuw2OhhxMo95xecOH89iSIz1H0wZDddoEnr0xjIxBrXODrw0fUHoEu8KvattZ7oe6y7/1Npg1tJVY+QbzW+8O6TlQ/p7U9CbMrFaOt037nkUbWmBbFEc02IxuZmSuHvsvKtXs2iJsCF/UMB5rz+2l382qUlZBViemZ+6mDr1mhOXNi6TVL7vVT0FUGZRaOcretekRF8J4COrSukfgPwhSfI0/MKVWhGnt3FqiUtKfRGBgdGaVN64syLG1I1a3OLvl0W5Vaz0GTmNjJluGbfAsxlOKWLal729nmTfIHefGRhi3Bi/S3OnEE+35hsAdnHmwE7U0v/kFb/t0/u1coQYrKoXYDMwRCKU07IyvGRvMZyv/4hXMmvIMYR6IU58cRdn5DEOrRGlKTNRrIxCvmuxL0XZSBz+cD3VdKWZughdEAE7dFdf1sBa8+2bVTplVfhSuB17OAClX8cc0g+kC2kVjoL99LkzZerUqh0Dz0DwNBqN5SYhk4azsaWWFRFDSwF67ncNZ9eh09rFpfdaODxU04+hnpE8q7dPZgV+PBNceUV/ci64Eb5emqpGOb4eH21I+8ReZGfh2nRADXXJZeQUX9UpcQKEMfpB5BuYTZNoouT/P8aGPtVF08w+aZtN/+Apaesmm0H9bcC/ZO6F6dxjsAoSlwAAAmP9U8xDVE7YjABQ4Yyzgf5gLf+FAfU1CAnP5AtQ5WIO39edfVnArlGFrrmzmzAzqZvjkf8BJWwlEpCHq2BZSdg1lXNHlnQvykrtT2GgokRxXhVlrSLcBWkpi9NIePm6Wr6OxMU9n/R8787SdyiKmKK3y6BUZYTBtS0lz/WGIkLadN867yrmQTtq/xHeEl9FGhQPkuyjy58IrhjMaeEe1r9J1F22GaV6BmigBaCfWmOEcNweh9PqQhgcZnW/BQriFBw97GSrzCEE7EneiiTKRI0ZdQITIfyjDLWnaxqJBo1r/fYOJ01WfJSNPSlSf64A6Y1hY9LSfgGIZbk4Ean06RhBTKEYyOQQjDTfXe6O/LYTqXRLYRMttV6S1R33SY9lf3rjCtD6eEMElzldfQk8Jf3EA0Nde31E83qT2cST1xD+99xFaIEXCBjO8L4Zikwb4gqShuclGJ8WkMv8w2xiE6AESXUq96Ybvar9f5uDzbeZmSAyNZXj57xf9xQvTA3F3IaXqwzYUB7aujkwcusW7b7hAhlhzpSBySBoOEVinpS0dXUqol8eW5lvNBjg1B3QOok8CczijsrkeRe87gIpGDUNXJlvpu+Ns4oXXtlVMMRll7RNxBNjvbgn5s5N7vQ/7fgBSOuTB8B6to/vBxO75bdlDutLOyQ5lMGYGB53kbjwNwE6dKN8Dhmakun8760t9SRr6boqMhLRnhDPn7JLiKruJd6F0QeycGkPKheIF1ZNhKyftcMMMtirMga2XJiR+T82XKhHWS8DsRYrAgMlay3nPQklaoLSTCyCgrGKzACBB9zISw2UeoEPjfKujPrVSUe+hGk9+Ona83LdGnhSvk0m7hZbebTsOcWnIxf7vouDCUuLwm/oqy+XXuSAYAAAAABSIW6EFNBr74MpdZViMCbAoic7QOSkdrH/K58b6x04+ZB9O08G5AHN3hQH88+EyYOK4EWvaAh3H6lLgG4Omp5LbYC1fsDaj1LhrttmsYmhxiTGshp+cWZaAD5wA0kFnxVU58RZsGwkjEVvMcez2NWq9YApSzlAc7RPZWqurNYRIqBALxXOUE97wu08/Ay0qLv4JmRuXNOGc/zA9lMHuJGefrTPC84JhPwc4wsuy2k2UMJTmW2220K99CwV9sLQeCPt4if0nb9+QjlSG06NPzBmg2s2NU1g7JapZBDDk+q1EIa4bIIZjdbNBL8DAAAAAAAAAAAAAAAAA';

function LogoTorneo({ className = '', plano = false }) {
  return (
    <span className={`inline-block ${plano ? '' : 'bg-white rounded-2xl p-1.5 shadow-sm'} ${className}`}>
      <img src={LOGO_TORNEO_SRC} alt="Logo Torneos CTC" className="block w-full h-auto" draggable={false} />
    </span>
  );
}

function UserAvatar({ name, photo, size = 'md', className = '' }) {
  const sizeClasses = {
    xs: 'w-6 h-6 text-[9px]',
    sm: 'w-7 h-7 text-[10px]',
    md: 'w-9 h-9 text-xs',
    lg: 'w-14 h-14 text-lg font-black',
    xl: 'w-20 h-20 text-2xl font-black'
  };

  const initials = useMemo(() => {
    if (!name) return '🎾';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [name]);

  if (photo && photo.trim().length > 10) {
    return (
      <img
        src={photo}
        alt={name}
        className={`${sizeClasses[size]} rounded-full object-cover border border-stone-200 shadow-xs shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-[#2c4a66] to-[#2c4a66] text-white font-black flex items-center justify-center border border-white/50 shadow-xs shrink-0 ${className}`}
    >
      {initials}
    </div>
  );
}

// NUEVO: Mini gráfico de barras en SVG puro (sin librerías externas) para mostrar la
// evolución de puntos día a día. Cada barra es un día del mes con el total de puntos
// sumados ese día (puede ser negativo, p.ej. por una rajada de cena).
function MiniBarChart({ data, height = 90 }) {
  if (!data || data.length === 0 || data.every(d => d.played === 0)) {
    return (
      <div className="text-center py-4 text-[10px] text-stone-400 italic">
        Todavía no hay partidos registrados en los últimos meses.
      </div>
    );
  }

  const width = Math.max(240, data.length * 40);
  const maxVal = Math.max(1, ...data.map(d => d.played));
  const slot = width / data.length;
  const barWidth = Math.min(26, slot - 10);

  return (
    <div>
      <div className="flex items-center gap-3 text-[9px] font-bold text-stone-500 mb-1.5">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#a9c4ad] inline-block" /> Victorias
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#d9a582] inline-block" /> Derrotas
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height + 18}`} width="100%" height={height + 18} role="img" aria-label="Partidos y victorias por mes">
        <line x1="0" y1={height} x2={width} y2={height} stroke="#e2e8f0" strokeWidth="1" />
        {data.map((d, idx) => {
          const x = idx * slot + (slot - barWidth) / 2;
          const totalH = d.played > 0 ? Math.max(4, (d.played / maxVal) * (height - 14)) : 0;
          const wonH = d.played > 0 ? (d.won / d.played) * totalH : 0;
          const lostH = totalH - wonH;
          const yWon = height - wonH;
          const yLost = yWon - lostH;
          return (
            <g key={d.key}>
              {d.played > 0 && lostH > 0 && (
                <rect x={x} y={yLost} width={barWidth} height={lostH} rx="2" fill="#f43f5e" />
              )}
              {d.played > 0 && wonH > 0 && (
                <rect x={x} y={yWon} width={barWidth} height={wonH} rx="2" fill="#10b981" />
              )}
              {d.played > 0 && (
                <text x={x + barWidth / 2} y={height - totalH - 4} textAnchor="middle" fontSize="8" fill="#475569" fontWeight="800">
                  {d.played}
                </text>
              )}
              <text x={x + barWidth / 2} y={height + 14} textAnchor="middle" fontSize="8" fill="#94a3b8" fontWeight="700">
                {d.month}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function StarRating({ value, onChange }) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className="flex items-center gap-1">
      {stars.map(s => {
        const active = s <= Math.round(value);
        return (
          <button
            type="button"
            key={s}
            onClick={() => onChange(s)}
            className={`text-xl leading-none transition-transform active:scale-125 ${
              active ? 'text-[#d9b97c] drop-shadow-xs' : 'text-stone-200'
            }`}
            title={`Nivel ${s}`}
          >
            ★
          </button>
        );
      })}
      <span className="text-[11px] font-black text-stone-700 ml-1.5 w-6 text-right">
        {Number(value).toFixed(1)}
      </span>
    </div>
  );
}

function calculateTournamentSuggestedLevel(user, tournaments) {
  let baseLevel = Number(user.level) || 3.5;
  // IMPORTANTE: m.team1/m.team2 solo guardan el PRIMER nombre de cada jugador (p.ej. "Bruno & Berto"),
  // así que comparar contra el nombre completo del usuario casi nunca coincidía para nadie con nombre
  // compuesto. Usamos los IDs cuando el partido los tiene (torneos nuevos) y, si no (torneos antiguos
  // generados antes de este cambio), comparamos solo el primer nombre como aproximación razonable.
  const myFirstName = normalizeName(user.name || '').split(' ')[0];

  let tourMatches = 0;
  let tourWon = 0;
  (tournaments || []).forEach(t => {
    (t.rounds || []).forEach(r => {
      (r.matches || []).forEach(m => {
        if (m.status !== 'FINALIZADO') return;

        let inT1, inT2;
        if ((m.team1Ids && m.team1Ids.length) || (m.team2Ids && m.team2Ids.length)) {
          inT1 = (m.team1Ids || []).includes(user.id);
          inT2 = (m.team2Ids || []).includes(user.id);
        } else {
          inT1 = myFirstName && normalizeName(m.team1 || '').split(' ').includes(myFirstName);
          inT2 = myFirstName && normalizeName(m.team2 || '').split(' ').includes(myFirstName);
        }

        if (inT1 || inT2) {
          tourMatches++;
          if (inT1 && m.winner === 1) tourWon++;
          if (inT2 && m.winner === 2) tourWon++;
        }
      });
    });
  });

  if (tourMatches === 0) {
    return {
      suggestedLevel: baseLevel,
      trend: 'ESTABLE',
      diff: 0,
      reason: 'Sin torneos previos para calibrar',
      winRate: 0,
      tourMatches: 0
    };
  }

  const winRate = (tourWon / tourMatches) * 100;
  let modifier = 0;
  if (winRate >= 75) modifier = +0.4;
  else if (winRate >= 65) modifier = +0.2;
  else if (winRate <= 25) modifier = -0.4;
  else if (winRate <= 35) modifier = -0.2;

  let calculated = Math.min(5.0, Math.max(1.5, baseLevel + modifier));
  calculated = Math.round(calculated * 10) / 10;
  const diff = Math.round((calculated - baseLevel) * 10) / 10;
  const trend = diff > 0 ? 'SUBE' : diff < 0 ? 'BAJA' : 'ESTABLE';

  return {
    suggestedLevel: calculated,
    trend,
    diff,
    winRate: winRate.toFixed(0),
    tourMatches,
    tourWon
  };
}

// ============================================================================
// NOVEDADES: ventana que se muestra UNA vez por versión de novedades, la primera vez que alguien
// entra (ya identificado) tras una actualización. Para anunciar algo nuevo basta con cambiar
// VERSION_NOVEDADES y la lista NOVEDADES; quien ya la vio no la vuelve a ver.
// ============================================================================
const VERSION_NOVEDADES = '2026-10-pachanga-v2';
const CLAVE_NOVEDADES_VISTAS = 'padel_novedades_vistas';
const NOVEDADES = [
  { icono: '🙌', titulo: 'Proponer un partido', texto: 'Un único botón para cuando falta gente: indicas día, hora y cuántos buscas, avisamos a quien esté libre y quien pueda te responde "Puedo jugar". Tú decides quién entra.' },
  { icono: '🆘', titulo: 'Se cae alguien de un partido', texto: 'Desde el partido, "Ha fallado alguien · ofrecer su plaza" lanza una propuesta solo para esa plaza y quien elijas entra directo en el partido con "Añadir al partido".' },
  { icono: '🕒', titulo: 'Disponibles y vetos', texto: 'Marca cuándo estás libre y propón partido solo a quien esté disponible. Al proponer puedes vetar a quien no quieras que la vea.' },
  { icono: '🔔', titulo: 'Más avisos', texto: 'Si alguien confirmado se baja de un partido, el organizador recibe un aviso. Y cuando la app está guardando algo, lo verás indicado arriba.' },
  { icono: '🎾', titulo: 'Inicio más claro', texto: 'Si ya se han jugado los partidos de la semana, Inicio lo dice y muestra quién jugó contra quién y el resultado.' }
];

function leerNovedadesVistas() {
  try { return localStorage.getItem(CLAVE_NOVEDADES_VISTAS); } catch { return null; }
}
function marcarNovedadesVistas() {
  try { localStorage.setItem(CLAVE_NOVEDADES_VISTAS, VERSION_NOVEDADES); } catch { /* sin almacenamiento: se volverá a mostrar */ }
}

function NovedadesModal({ isOpen, onClose, onVerGuia }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Novedades">
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl p-5 text-left space-y-3">
        <div className="text-center">
          <div className="text-3xl">🆕</div>
          <h3 className="text-lg font-black text-stone-900">¡Hay novedades en CTC Padel!</h3>
          <p className="text-[11px] text-stone-500 mt-0.5">La app se ha actualizado a una versión nueva. Esto es lo que ha cambiado:</p>
        </div>
        <ul className="space-y-2">
          {NOVEDADES.map(n => (
            <li key={n.titulo} className="flex gap-2.5 bg-stone-50 border border-stone-200 rounded-2xl p-2.5">
              <span className="text-xl leading-none mt-0.5">{n.icono}</span>
              <span className="min-w-0">
                <span className="block text-xs font-black text-stone-800">{n.titulo}</span>
                <span className="block text-[11px] text-stone-600">{n.texto}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-stone-400 text-center">Tienes todo explicado en la guía (el icono ℹ️). Cuando salga otra versión, la app se recargará sola y te lo avisará.</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onVerGuia} className="py-2.5 bg-stone-100 text-stone-700 font-bold text-xs rounded-xl">📖 Ver la guía</button>
          <button onClick={onClose} className="py-2.5 bg-[#2c4a66] text-white font-bold text-xs rounded-xl">Entendido</button>
        </div>
      </div>
    </div>
  );
}

function CriteriosModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 text-left space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
            ℹ️ Guía y Sistema Oficial de CTC Padel
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-2xl font-bold leading-none">&times;</button>
        </div>

        <section className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-2">
          <h4 className="font-extrabold text-stone-700 text-xs uppercase tracking-wide">📱 Cómo se usa la app</h4>
          <ul className="text-xs text-stone-600 space-y-1.5 list-disc list-inside">
            <li><strong>🏠 Inicio:</strong> lo primero que ves al entrar — el próximo partido de la semana, si falta gente por confirmar cena y tus torneos activos, con accesos directos al resto de secciones.</li>
            <li><strong>🎾 Partidos:</strong> pulsa "Añadir Partido (Pegar desde Playtomic)" y pega el texto que Playtomic genera al compartir el partido (con los jugadores marcados con ✅). Si solo pegas el enlace, sin ese texto, la app te pedirá la fecha/hora y al menos 2 jugadores a mano antes de crearlo. Si ese partido ya está en la app (mismo enlace de Playtomic) no se crea otro: te lo avisa y te lleva al existente. Para encontrar un partido usa el buscador: por jugador, estado o fecha exacta.</li>
            <li><strong>🙌 Pachanga:</strong> proponer partidos cuando falta gente, ver quién está disponible y ofrecer plazas — mira la sección "Pachanga" más abajo. Cuando guardas un cambio y la app tarda, verás un aviso "Guardando…" arriba: espera a que desaparezca.</li>
            <li><strong>🍻 Cena &amp; Club:</strong> confirma si te quedas a cenar. En los torneos puedes ver, por nombre, quién cena, quién está pendiente de confirmar y quién se raja.</li>
            <li><strong>🏆 Rankings:</strong> toca el perfil de cualquier jugador para ver sus estadísticas: partidos jugados, % de victorias, cenas, rajadas, historial de puntos y desglose del bote.</li>
            <li><strong>💶 Bote:</strong> lo que cada uno debe aportar, según las reglas de abajo.</li>
            <li><strong className="inline-flex items-center gap-1"><PadelRacketsIcon /> Torneos:</strong> 4 formatos distintos para organizar — ver detalle más abajo.</li>
            <li><strong>🔔 Avisos:</strong> desde el icono de la campana configuras qué avisos quieres recibir — el recordatorio de los lunes (si para esa semana no hay partido subido) y los avisos de apertura de reserva en Playtomic, por día y hora (puedes tener varios).</li>
            <li><strong>🔔 Notificaciones en el móvil:</strong> en iPhone solo funcionan si añades la app a la pantalla de inicio desde Safari (compartir → "Añadir a pantalla de inicio") y la abres desde ahí; en Android/ordenador puedes activarlas directamente desde "Avisos".</li>
          </ul>
        </section>

        <section className="bg-[#eef4f0] border border-[#c7ddc9] rounded-2xl p-4 space-y-2">
          <h4 className="font-extrabold text-[#2f5d50] text-xs uppercase tracking-wide">🔁 Suplentes y cambio de parejas</h4>
          <ul className="text-xs text-[#2f5d50] space-y-1.5 list-disc list-inside">
            <li><strong>Cambiar suplentes:</strong> dentro de un partido, pulsa "✏️ Cambiar Suplentes". Verás los 4 nombres de la pista: sustituye el de quien no puede jugar por el de quien entra y guarda. Si el nombre coincide con un jugador de la app queda enlazado a su perfil; si no, aparecerá un aviso "⚠️ Vincular" junto a ese nombre para asociarlo a su perfil (así le cuentan puntos y cena).</li>
            <li><strong>Cambiar de pareja:</strong> en "Convocatoria y Parejas", cada jugador tiene un botón "P1 ⇄" o "P2 ⇄". Púlsalo para elegir con quién intercambiarlo, o para moverlo a un hueco libre de la otra pareja. El cambio se guarda al momento y se ve en todos los móviles.</li>
            <li><strong>Ojo:</strong> solo se pueden cambiar suplentes y parejas mientras el partido no esté finalizado; con el resultado ya cerrado las parejas quedan bloqueadas (🔒).</li>
            <li><strong>Recargar Playtomic:</strong> si el partido ha cambiado en Playtomic, "🔄 Recargar Playtomic" vuelve a leer el texto compartido y actualiza jugadores y datos.</li>
          </ul>
        </section>

        <section className="bg-[#faf3e7] border border-[#efd9a9] rounded-2xl p-4 space-y-2">
          <h4 className="font-extrabold text-[#6b4d1c] text-xs uppercase tracking-wide">🙌 Pachanga: proponer partidos</h4>
          <ul className="text-xs text-[#6b4d1c] space-y-1.5 list-disc list-inside">
            <li><strong>Proponer un partido:</strong> desde Inicio o desde Pachanga, pulsa "🙌 Proponer un partido". Indica día, hora, cuántos jugadores buscas (1 a 3), el sitio (opcional), si ya tienes la pista reservada y, si quieres, el enlace de la reserva y una nota.</li>
            <li><strong>A quién le llega:</strong> avisamos a los del grupo que no tengan ya partido ese día. Quien pueda pulsa "🙋 Puedo jugar" (o "No puedo"); tú recibes los avisos solo de quienes pueden.</li>
            <li><strong>Tú decides quién entra:</strong> decir "puedo" no resta plaza. En tu propuesta ves "Quién puede" y pulsas "Confirmar" a quien quieras (puedes quitar la confirmación). Después, "🎾 Crear partido" (o "Crear con los confirmados" si aún faltan) lo convierte en partido. Si ya estás confirmado/a y te echas atrás, se avisa al organizador.</li>
            <li><strong>Vetar a alguien:</strong> en la propuesta, "🚫 Vetar a alguien" oculta la propuesta a quien marques: no la ve, no recibe avisos y no sabe que lo has vetado.</li>
            <li><strong>🕒 Disponibles:</strong> en la pestaña "Disponibles" de Pachanga marca cuándo estás libre (día y franja). Quien busque gente ve quién está disponible cada día, marca a quien quiera y pulsa "💌 Proponer partido a…": la propuesta solo les llega a ellos.</li>
          </ul>
        </section>

        <section className="bg-[#f6ede6] border border-[#ead3bf] rounded-2xl p-4 space-y-2">
          <h4 className="font-extrabold text-[#6b3f29] text-xs uppercase tracking-wide">🆘 Se cae un jugador de un partido ya montado</h4>
          <ul className="text-xs text-[#6b3f29] space-y-1.5 list-disc list-inside">
            <li><strong>Ofrecer su plaza:</strong> en el detalle del partido (si aún no ha empezado) pulsa "🆘 Ha fallado alguien · ofrecer su plaza". Marca quién ha fallado (no hace falta si ya había un hueco libre) y se lanza una propuesta de las plazas que faltan, con el mismo día, hora y sitio del partido.</li>
            <li><strong>Después:</strong> quien pueda te lo dice con "Puedo jugar"; tú confirmas a quien quieras y pulsas "➕ Añadir al partido": entra directamente en ese partido, sin crear otro. Mientras la propuesta esté abierta, el partido muestra "Ya hay una propuesta abierta · Ver".</li>
            <li><strong>Quién puede ofrecerla:</strong> cualquiera de los que juegan ese partido (o el administrador). Si no queda ningún hueco libre al añadir, la app te lo dice: quita antes al jugador desde "Cambiar Suplentes".</li>
          </ul>
        </section>

        <section className="bg-[#eef2f6] border border-[#c3d3e0] rounded-2xl p-4 space-y-2">
          <h4 className="font-extrabold text-[#2c4a66] text-xs uppercase tracking-wide flex items-center gap-1"><PadelRacketsIcon /> Formatos de Torneo</h4>
          <ul className="text-xs text-[#2c4a66] space-y-1.5 list-disc list-inside">
            <li><strong>🔄 Pozo Continuo:</strong> pistas ordenadas por nivel; quien gana sube de pista, quien pierde baja. Gana el torneo quien acabe dominando la Pista 1.</li>
            <li><strong>🇺🇸 Americano:</strong> inscripción individual, rotando de compañero y rival en cada ronda; los puntos se suman a tu casillero personal, no al de tu pareja de turno.</li>
            <li><strong>🥇 Fases Finales:</strong> parejas fijas, primero una liguilla por grupos y después cuadro final (oro/plata) a eliminación directa.</li>
            <li><strong>🛡️ Por Equipos (Ryder):</strong> dos equipos enfrentados pista a pista; gana el equipo que sume más puntos en el cómputo global.</li>
          </ul>
        </section>

        <section className="bg-[#eef2f6] border border-[#c3d3e0] rounded-2xl p-4 space-y-2">
          <h4 className="font-extrabold text-[#2c4a66] text-xs uppercase tracking-wide">🏆 1. Ranking Deportivo</h4>
          <ul className="text-xs text-[#2c4a66] space-y-1 list-disc list-inside">
            <li><strong>Victoria:</strong> +5 puntos.</li>
            <li><strong>Derrota:</strong> 0 puntos.</li>
          </ul>
        </section>

        <section className="bg-[#eef4f0] border border-[#c7ddc9] rounded-2xl p-4 space-y-2">
          <h4 className="font-extrabold text-[#2f5d50] text-xs uppercase tracking-wide">🍻 2. Ranking Barandas (3º Tiempo)</h4>
          <ul className="text-xs text-[#2f5d50] space-y-1 list-disc list-inside">
            <li><strong>Quedarse a la cena:</strong> +5 puntos (computables tras las 09:00 AM del día siguiente).</li>
            <li><strong>Jugar el partido:</strong> +1 punto (por compromiso y asistencia).</li>
            <li><strong>Tomarte una (sin quedarte a cenar):</strong> 0 puntos y sin bote. No resta ni suma, no cuenta para la racha de cenas ni para el reparto del ticket.</li>
            <li><strong>Rajarse de la cena habiendo jugado:</strong> -1 punto de penalización.</li>
          </ul>
        </section>

        <section className="bg-[#f2eef2] border border-[#ddc9de] rounded-2xl p-4 space-y-1.5">
          <h4 className="font-extrabold text-[#4a3350] text-xs uppercase tracking-wide">⚡ 3. Ranking Híbrido (Corona General)</h4>
          <p className="text-xs text-[#4a3350]">Suma directa del <strong>Ranking Deportivo + Ranking Barandas</strong>.</p>
        </section>

        <section className="bg-[#faf3e7] border border-[#efd9a9] rounded-2xl p-4 space-y-1.5">
          <h4 className="font-extrabold text-[#6b4d1c] text-xs uppercase tracking-wide">💶 4. El Bote</h4>
          <ul className="text-xs text-[#6b4d1c] space-y-1 list-disc list-inside">
            <li><strong>Derrota en pista:</strong> +1 € de bote.</li>
            <li><strong>Rajarse de la cena:</strong> +1 € de bote (tomarte una no genera bote).</li>
            <li><strong>Victoria:</strong> 0 € (el ganador no paga bote).</li>
          </ul>
        </section>

        <button onClick={onClose} className="w-full mt-2 bg-stone-900 text-white font-bold py-2.5 rounded-xl text-xs">
          Cerrar
        </button>
      </div>
    </div>
  );
}

function PinModal({ isOpen, onClose, targetUser, onPinSuccess, apiUrl }) {
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // MODO CREAR vs VERIFICAR: si el jugador todavía no tiene ningún PIN guardado (campo
  // "pin" vacío) le toca ELEGIR uno nuevo, en vez de que le pidamos "adivinar" uno que nunca
  // llegó a existir. Esto cubre dos casos reales: (1) un invitado de torneo que entra por
  // primera vez por su enlace personalizado y todavía no tiene fila en "Jugadores" — antes
  // esto dejaba a cualquier invitado nuevo completamente bloqueado, porque VERIFICAR_PIN
  // nunca encuentra su ficha y el formulario solo sabía "verificar", nunca "crear"; y (2) un
  // jugador al que el administrador acaba de promover de invitado a Chicos/Chicas, a quien le
  // vaciamos el PIN a propósito para que confirme el cambio eligiendo uno nuevo.
  const modoCrearPin = !targetUser || !targetUser.pin;

  useEffect(() => {
    setPin('');
    setPinConfirm('');
    setError('');
  }, [isOpen, targetUser]);

  if (!isOpen || !targetUser) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pin.length !== 4) {
      setError('El PIN debe tener 4 dígitos');
      return;
    }
    if (modoCrearPin && pin !== pinConfirm) {
      setError('Los dos PIN no coinciden');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(
          modoCrearPin
            ? { action: 'CREAR_PIN_JUGADOR', idJugador: targetUser.id, nombre: targetUser.name, grupo: targetUser.group || 'torneo', pin }
            : { action: 'VERIFICAR_PIN', idJugador: targetUser.id, pin }
        )
      });
      const data = await res.json();
      if (data.ok) {
        onPinSuccess(data.jugador || { ...targetUser, pin });
      } else {
        setError(data.error || 'PIN incorrecto');
      }
    } catch (err) {
      if (!modoCrearPin && targetUser.pin && targetUser.pin === pin) {
        onPinSuccess(targetUser);
      } else {
        setError(modoCrearPin ? 'Error al crear el PIN' : 'Error al verificar PIN');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-stone-800 rounded-3xl max-w-xs w-full p-6 text-white border border-stone-700 shadow-2xl text-center space-y-4">
        <UserAvatar name={targetUser.name} photo={targetUser.photo} size="lg" className="mx-auto" />
        <div>
          <h3 className="text-base font-black">{targetUser.name}</h3>
          <p className="text-xs text-stone-400">
            {modoCrearPin ? 'Todavía no tienes PIN: crea uno de 4 dígitos' : 'Introduce tu PIN de 4 dígitos'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            maxLength={4}
            autoFocus
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            className="w-full bg-stone-900 border border-stone-700 rounded-2xl py-3 text-center text-2xl tracking-[0.5em] font-black text-white focus:outline-none focus:border-[#9fb4c7]"
          />

          {modoCrearPin && (
            <input
              type="password"
              maxLength={4}
              value={pinConfirm}
              onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ''))}
              placeholder="Repite el PIN"
              className="w-full bg-stone-900 border border-stone-700 rounded-2xl py-3 text-center text-2xl tracking-[0.5em] font-black text-white focus:outline-none focus:border-[#9fb4c7]"
            />
          )}

          {error && <p className="text-xs text-[#d9a582] font-bold">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-stone-700 text-stone-300 rounded-xl text-xs font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-[#2c4a66] hover:bg-[#9fb4c7] text-white rounded-xl text-xs font-bold shadow-lg"
            >
              {loading ? 'Entrando...' : (modoCrearPin ? 'Crear PIN y entrar' : 'Entrar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// NUEVO: PANTALLA DE AVISOS / PENDIENTES DEL JUGADOR
// NUEVO: tarjeta de notificaciones push. Vive aparte de AlertsScreen porque tiene su
// propio estado (si están activadas en ESTE dispositivo concreto) y su propia lógica de
// red, que no tiene nada que ver con la lista de avisos pendientes.
function PushNotificationsCard({ currentUser, apiUrl }) {
  const [status, setStatus] = useState('checking'); // checking | unsupported | denied | off | on
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    navigator.serviceWorker.getRegistration()
      .then(reg => {
        if (!reg) { setStatus('off'); return; }
        return reg.pushManager.getSubscription().then(sub => setStatus(sub ? 'on' : 'off'));
      })
      .catch(() => setStatus('off'));
  }, []);

  const handleEnable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      }
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'GUARDAR_SUSCRIPCION_PUSH', idJugador: currentUser.id, subscription: subscription.toJSON() })
      });
      setStatus('on');
    } catch (e) {
      console.error('Error activando notificaciones push:', e);
      alert('No se han podido activar las notificaciones en este dispositivo.');
    } finally {
      setBusy(false);
    }
  };

  const handleTestPush = async () => {
    setBusy(true);
    try {
      const resSubs = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'OBTENER_SUSCRIPCIONES_PUSH', idsJugadores: [currentUser.id] })
      });
      const dataSubs = await resSubs.json();
      if (!dataSubs.ok || !(dataSubs.suscripciones || []).length) {
        alert('Todavía no hay ninguna suscripción guardada para este dispositivo. Pulsa primero "Activar notificaciones".');
        return;
      }
      const resSend = await fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptions: dataSubs.suscripciones.map(s => ({ endpoint: s.endpoint, keys: s.keys })),
          title: 'Pádel CTC 🎾',
          body: `¡Hola ${currentUser.name}! Así se verá un aviso cuando te toque confirmar algo.`,
          url: '/'
        })
      });
      const dataSend = await resSend.json();
      if (dataSend.ok && dataSend.enviados > 0) {
        alert('✅ Notificación de prueba enviada. Debería llegarte en unos segundos.');
      } else {
        console.log('Respuesta de /api/send-push:', dataSend);
        alert('No se ha podido enviar la notificación de prueba. Mira la consola para más detalle.');
      }
    } catch (e) {
      console.error(e);
      alert('Error al enviar la notificación de prueba (¿está desplegada la función /api/send-push en Vercel?).');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'unsupported') {
    return (
      <div className="bg-stone-100 rounded-2xl p-3.5 border border-stone-200 text-[11px] text-stone-500">
        🔕 Este navegador no soporta notificaciones push. En iPhone: añade la app a la pantalla de inicio desde Safari (compartir → "Añadir a pantalla de inicio") y ábrela desde ahí para poder activarlas.
      </div>
    );
  }

  // Fila compacta (una sola línea de título + subtítulo corto + botón pequeño a la derecha) en
  // vez de la tarjeta grande de antes, para que arriba quepa lo importante: los pendientes y la
  // configuración de avisos.
  return (
    <div className="bg-white rounded-2xl px-3 py-2 border border-stone-200 shadow-xs flex items-center gap-2.5">
      <span className="text-lg shrink-0">{status === 'on' ? '🔔' : '🔕'}</span>
      <div className="flex-1 min-w-0">
        <span className="font-black text-stone-900 text-[11px] block leading-tight">
          {status === 'on' ? 'Notificaciones activadas' : status === 'denied' ? 'Notificaciones bloqueadas' : 'Notificaciones desactivadas'}
        </span>
        <span className="text-[10px] text-stone-500 block leading-tight">
          {status === 'on'
            ? 'En este dispositivo, aunque tengas la app cerrada.'
            : status === 'denied'
              ? 'Actívalas desde los ajustes del sitio en el navegador.'
              : 'Actívalas para enterarte sin abrir la app.'}
        </span>
      </div>
      {status !== 'denied' && (
        status !== 'on' ? (
          <button onClick={handleEnable} disabled={busy} className="shrink-0 px-3 py-1.5 bg-[#d9b97c] hover:bg-[#6b4d1c] text-white font-bold rounded-lg text-[11px] disabled:opacity-50 transition">
            {busy ? 'Activando...' : 'Activar'}
          </button>
        ) : (
          <button onClick={handleTestPush} disabled={busy} className="shrink-0 px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-lg text-[10px] disabled:opacity-50 transition">
            {busy ? 'Enviando...' : '🧪 Probar'}
          </button>
        )
      )}
    </div>
  );
}

// NUEVO: configuración personal de avisos push "programados" — el recordatorio de los
// lunes (opt-in, por eso tiene su propio interruptor) y las combinaciones día+hora para
// las alertas de reserva en Playtomic (puede haber varias por jugador: p.ej. martes 20h
// y jueves 21h). El envío real de estos avisos lo hace un trigger de Apps Script que
// corre cada 5 minutos en el servidor — este componente solo guarda la configuración.
const DIAS_SEMANA_ALERTAS = [
  { v: 1, l: 'Lunes' }, { v: 2, l: 'Martes' }, { v: 3, l: 'Miércoles' },
  { v: 4, l: 'Jueves' }, { v: 5, l: 'Viernes' }, { v: 6, l: 'Sábado' }, { v: 7, l: 'Domingo' }
];

// Horas del selector de la alerta de reserva, en formato 24h (00-23). Usamos dos <select>
// propios en vez de <input type="time"> porque ese input nativo muestra AM/PM o 24h según el
// idioma/región del dispositivo (en iPhone, por ejemplo, lo decide el ajuste regional del
// sistema, no la propia página), así que no hay forma fiable de forzar 24h ahí. Con <select>
// el formato queda fijo siempre, y de paso limitamos los minutos a horas en punto o y media.
const HORAS_SELECTOR_ALERTA = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTOS_SELECTOR_ALERTA = ['00', '30'];

function PushPreferencesCard({ currentUser, apiUrl, alertPreferences, reservationAlerts, onRefresh, onUpdateAlertPreferences, onUpdateReservationAlerts }) {
  const [busy, setBusy] = useState(false);
  const [diaNuevo, setDiaNuevo] = useState(4);
  const [horaNueva, setHoraNueva] = useState('21:00');

  const miPref = (alertPreferences || []).find(p => p.idJugador === currentUser.id);
  const lunesActivo = miPref ? String(miPref.avisoLunesPartido).toUpperCase() === 'SI' : false;
  // Avisos de propuestas de partido: activados por defecto (solo se apagan si se pone NO).
  const convActivo = miPref ? String(miPref.avisoConvocatorias || 'SI').toUpperCase() !== 'NO' : true;
  const misReservas = (reservationAlerts || []).filter(r => r.idJugador === currentUser.id);

  // horaNueva se guarda siempre como "HH:mm" (igual que antes); aquí solo la partimos para
  // pintar los dos selectores de hora/minuto en formato 24h.
  const [horaSelActual, minSelActual] = horaNueva.split(':');

  // ANTES, cada acción de aquí (activar/desactivar el aviso de lunes, añadir o borrar una
  // alerta de reserva) esperaba, antes de "soltar" el botón, a un refresco COMPLETO de todos
  // los datos de la app (jugadores, partidos, torneos, invitados...) — ver fetchData() más
  // abajo en el componente principal. Esa recarga completa es lo más pesado que hace el
  // backend, así que por una simple preferencia de notificaciones la pantalla se quedaba
  // "colgada" varios segundos, dando la sensación de que no había pasado nada (y a veces
  // invitando a volver a pulsar, generando duplicados).
  //
  // Ahora aplicamos el cambio en pantalla al instante (actualización optimista, vía los
  // setters que nos pasa el componente principal) en cuanto el POST responde, sin esperar a
  // la recarga completa. Esa recarga se sigue lanzando después, pero en segundo plano y sin
  // bloquear nada — solo sirve para que, con el tiempo, la pantalla quede perfectamente
  // sincronizada con la hoja, no para que el usuario tenga que esperarla.
  const postAccion = async (payload) => {
    setBusy(true);
    let json = null;
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      json = await res.json().catch(() => ({ ok: true }));
    } catch (e) {
      // El aviso rojo ("No se ha podido guardar tus avisos…") lo enseña el indicador global de actividad.
      console.error('Error guardando preferencia de avisos:', e);
      json = null;
    } finally {
      setBusy(false);
    }
    // Sincronización de fondo: no se espera (sin await) para no retrasar la respuesta al
    // usuario, esté esta acción como esté.
    onRefresh();
    return json;
  };

  const handleToggleLunes = async () => {
    const nuevoValor = lunesActivo ? 'NO' : 'SI';
    onUpdateAlertPreferences(prev => {
      const lista = prev || [];
      const yaExiste = lista.some(p => p.idJugador === currentUser.id);
      if (yaExiste) {
        return lista.map(p => p.idJugador === currentUser.id ? { ...p, avisoLunesPartido: nuevoValor } : p);
      }
      return [...lista, { idJugador: currentUser.id, avisoLunesPartido: nuevoValor }];
    });
    const json = await postAccion({ action: 'GUARDAR_PREFERENCIA_LUNES', idJugador: currentUser.id, activo: nuevoValor });
    if (!json || json.ok === false) {
      // Si de verdad falló, deshacemos el cambio optimista.
      onUpdateAlertPreferences(prev => (prev || []).map(p => p.idJugador === currentUser.id ? { ...p, avisoLunesPartido: lunesActivo ? 'SI' : 'NO' } : p));
    }
  };

  const handleToggleConvocatorias = async () => {
    const nuevoValor = convActivo ? 'NO' : 'SI';
    onUpdateAlertPreferences(prev => {
      const lista = prev || [];
      if (lista.some(p => p.idJugador === currentUser.id)) {
        return lista.map(p => p.idJugador === currentUser.id ? { ...p, avisoConvocatorias: nuevoValor } : p);
      }
      return [...lista, { idJugador: currentUser.id, avisoLunesPartido: 'NO', avisoConvocatorias: nuevoValor }];
    });
    const json = await postAccion({ action: 'GUARDAR_PREFERENCIA_CONVOCATORIAS', idJugador: currentUser.id, activo: nuevoValor });
    if (!json || json.ok === false) {
      onUpdateAlertPreferences(prev => (prev || []).map(p => p.idJugador === currentUser.id ? { ...p, avisoConvocatorias: convActivo ? 'SI' : 'NO' } : p));
    }
  };

  const handleAddReserva = async () => {
    if (misReservas.some(r => Number(r.diaSemana) === Number(diaNuevo) && r.hora === horaNueva)) {
      alert('Ya tienes un aviso configurado para ese día y esa hora.');
      return;
    }
    const idTemporal = 'tmp-' + Date.now();
    onUpdateReservationAlerts(prev => [...(prev || []), { id: idTemporal, idJugador: currentUser.id, diaSemana: Number(diaNuevo), hora: horaNueva }]);
    const json = await postAccion({ action: 'GUARDAR_ALERTA_RESERVA', idJugador: currentUser.id, diaSemana: Number(diaNuevo), hora: horaNueva });
    if (json && json.ok && json.id) {
      // Sustituimos el id temporal por el id real asignado por el servidor, para que un
      // borrado inmediato después de crearla apunte a la fila correcta.
      onUpdateReservationAlerts(prev => (prev || []).map(r => r.id === idTemporal ? { ...r, id: json.id } : r));
    } else {
      // No se pudo guardar de verdad: quitamos la entrada optimista.
      onUpdateReservationAlerts(prev => (prev || []).filter(r => r.id !== idTemporal));
    }
  };

  const handleDeleteReserva = async (id) => {
    const alertaBorrada = misReservas.find(r => r.id === id);
    onUpdateReservationAlerts(prev => (prev || []).filter(r => r.id !== id));
    const json = await postAccion({ action: 'ELIMINAR_ALERTA_RESERVA', id });
    if ((!json || json.ok === false) && alertaBorrada) {
      // Si de verdad falló, la devolvemos a la lista.
      onUpdateReservationAlerts(prev => [...(prev || []), alertaBorrada]);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs space-y-3.5">
      <div className="flex items-center gap-2">
        <span className="text-2xl shrink-0">⚙️</span>
        <span className="font-black text-stone-900 text-sm">Qué avisos quieres recibir</span>
      </div>

      <div className="flex items-center justify-between gap-2 bg-stone-50 rounded-xl p-3">
        <div className="min-w-0">
          <span className="font-bold text-stone-800 text-xs block">📋 Aviso de los lunes</span>
          <span className="text-[11px] text-stone-500 block mt-0.5">Si para esta semana no te localizamos en ningún partido subido a la app</span>
        </div>
        <button
          onClick={handleToggleLunes}
          disabled={busy}
          className={`shrink-0 w-11 h-6 rounded-full transition relative disabled:opacity-50 ${lunesActivo ? 'bg-[#a9c4ad]' : 'bg-stone-300'}`}
        >
          <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition" style={{ left: lunesActivo ? '22px' : '2px' }} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 bg-stone-50 rounded-xl p-3">
        <div className="min-w-0">
          <span className="font-bold text-stone-800 text-xs block">🙌 Propuestas de partido</span>
          <span className="text-[11px] text-stone-500 block mt-0.5">Cuando alguien propone un partido y ese día no tienes ninguno. Si es una invitación para ti, te llega siempre.</span>
        </div>
        <button
          onClick={handleToggleConvocatorias}
          disabled={busy}
          className={`shrink-0 w-11 h-6 rounded-full transition relative disabled:opacity-50 ${convActivo ? 'bg-[#a9c4ad]' : 'bg-stone-300'}`}
        >
          <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition" style={{ left: convActivo ? '22px' : '2px' }} />
        </button>
      </div>

      <div className="bg-stone-50 rounded-xl p-3 space-y-2.5">
        <span className="font-bold text-stone-800 text-xs block">🎾 Avisos de reserva en Playtomic</span>
        <span className="text-[11px] text-stone-500 block">
          Te avisamos unos minutos antes de que se abra la reserva (se abre una semana antes, al mismo día y hora que configures aquí)
        </span>

        {misReservas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {misReservas.map(r => (
              <span key={r.id} className="inline-flex items-center gap-1 bg-[#faf3e7] text-[#6b4d1c] text-[11px] font-bold px-2.5 py-1 rounded-full">
                {(DIAS_SEMANA_ALERTAS.find(d => d.v === Number(r.diaSemana)) || {}).l || r.diaSemana} {r.hora}
                <button onClick={() => handleDeleteReserva(r.id)} disabled={busy} className="text-[#6b4d1c] hover:text-[#6b4d1c] font-black disabled:opacity-50">✕</button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-1.5 items-center">
          <select value={diaNuevo} onChange={(e) => setDiaNuevo(e.target.value)} className="flex-1 text-xs border border-stone-300 rounded-lg px-2 py-2 bg-white">
            {DIAS_SEMANA_ALERTAS.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}
          </select>
          <div className="flex items-center gap-1 shrink-0">
            <select
              value={horaSelActual}
              onChange={(e) => setHoraNueva(`${e.target.value}:${minSelActual}`)}
              className="text-xs border border-stone-300 rounded-lg pl-1.5 pr-0.5 py-2 bg-white"
            >
              {HORAS_SELECTOR_ALERTA.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="text-[11px] text-stone-400 font-bold">:</span>
            <select
              value={minSelActual}
              onChange={(e) => setHoraNueva(`${horaSelActual}:${e.target.value}`)}
              className="text-xs border border-stone-300 rounded-lg pl-1.5 pr-0.5 py-2 bg-white"
            >
              {MINUTOS_SELECTOR_ALERTA.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <button onClick={handleAddReserva} disabled={busy} className="shrink-0 px-3 py-2 bg-[#d9b97c] hover:bg-[#6b4d1c] text-white font-bold rounded-lg text-xs disabled:opacity-50 transition">
            + Añadir
          </button>
        </div>
      </div>
    </div>
  );
}

// NUEVO (control de gasto de cena): comprime la foto del ticket antes de mandarla al backend.
// Usa más resolución que la del avatar de perfil (1600px vs 200px) porque aquí lo que importa
// es que el texto del ticket se pueda leer, tanto a simple vista como por el OCR.
function comprimirFotoTicket(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Un ticket es largo y estrecho: con un tope bajo la letra queda diminuta y el OCR no la lee.
        const maxSize = 2600;
        let width = img.width;
        let height = img.height;
        if (width > height) { if (width > maxSize) { height *= maxSize / width; width = maxSize; } }
        else { if (height > maxSize) { width *= maxSize / height; height = maxSize; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = reject;
      img.src = readerEvent.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// NUEVO (control de gasto de cena): tarjeta de "Ticket de la cena" dentro de Cena & Club, a
// petición de Marcos ("subir una foto del ticket y leer con OCR las bebidas... llevar un
// control de importe por jueves y por persona... saber cuánto de esa cuenta es alcohol").
// Un ticket por cena (clave: grupo + fechaClave). El reparto por persona es a partes iguales
// (total ÷ comensales confirmados esa noche) y la categoría es solo Alcohol / Sin alcohol —
// ambas decisiones confirmadas explícitamente por Marcos. El OCR es un best-effort: SIEMPRE se
// enseña para revisar/corregir antes de guardar, nunca se guarda directo.
function TicketCenaCard({ grupo, fechaClave, fechaLabel, numPersonasActuales, currentUser, apiUrl, ticketExistente, onSaved }) {
  const [modo, setModo] = useState('resumen'); // 'resumen' | 'revisando'
  const [cargandoOcr, setCargandoOcr] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [itemsRevision, setItemsRevision] = useState([]);
  const [fotoUrlPendiente, setFotoUrlPendiente] = useState('');
  const [avisoSinOcr, setAvisoSinOcr] = useState(false);
  // Por qué no se ha leído el ticket (error del servidor) y el texto bruto que sí reconoció Google, si lo hubo.
  const [detalleOcr, setDetalleOcr] = useState({ motivo: '', texto: '' });
  const fileInputRef = useRef(null);

  const totales = (() => {
    const total = itemsRevision.reduce((acc, it) => acc + (Number(it.precio) || 0), 0);
    const alcohol = itemsRevision.filter(it => it.esAlcohol).reduce((acc, it) => acc + (Number(it.precio) || 0), 0);
    const sinAlcohol = total - alcohol;
    const personas = Math.max(1, Number(numPersonasActuales) || 1);
    return { total, alcohol, sinAlcohol, porPersona: total / personas };
  })();

  const handleFileSelected = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setErrorMsg('');
    setCargandoOcr(true);
    try {
      const fotoBase64 = await comprimirFotoTicket(file);
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'OCR_TICKET_CENA', fotoBase64 })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se ha podido leer el ticket.');
      setFotoUrlPendiente(data.fotoUrl || '');
      setItemsRevision((data.items && data.items.length > 0) ? data.items : [{ desc: '', precio: '', esAlcohol: false }]);
      setAvisoSinOcr(!data.items || data.items.length === 0);
      setDetalleOcr({ motivo: data.errorOcr || '', texto: data.textoDetectado || '' });
      setModo('revisando');
    } catch (err) {
      console.error(err);
      setDetalleOcr({ motivo: err && err.message ? String(err.message) : '', texto: '' });
      setErrorMsg('No se ha podido leer el ticket. Puedes añadir las líneas a mano, o inténtalo de nuevo.');
      setItemsRevision([{ desc: '', precio: '', esAlcohol: false }]);
      setFotoUrlPendiente('');
      setAvisoSinOcr(true);
      setModo('revisando');
    } finally {
      setCargandoOcr(false);
    }
  };

  const handleEditarExistente = () => {
    setItemsRevision((ticketExistente?.items && ticketExistente.items.length > 0)
      ? ticketExistente.items.map(it => ({ ...it }))
      : [{ desc: '', precio: '', esAlcohol: false }]);
    setFotoUrlPendiente(ticketExistente?.fotoUrl || '');
    setAvisoSinOcr(false);
    setDetalleOcr({ motivo: '', texto: '' });
    setErrorMsg('');
    setModo('revisando');
  };

  const actualizarLinea = (idx, campo, valor) => {
    setItemsRevision(prev => prev.map((it, i) => i === idx ? { ...it, [campo]: valor } : it));
  };

  const eliminarLinea = (idx) => {
    setItemsRevision(prev => prev.filter((_, i) => i !== idx));
  };

  const handleGuardar = async () => {
    const itemsValidos = itemsRevision
      .map(it => ({ desc: String(it.desc || '').trim(), precio: parseFloat(String(it.precio).replace(',', '.')) || 0, esAlcohol: Boolean(it.esAlcohol) }))
      .filter(it => it.desc && it.precio > 0);

    if (itemsValidos.length === 0) {
      setErrorMsg('Añade al menos una línea con descripción y precio antes de guardar.');
      return;
    }

    setGuardando(true);
    setErrorMsg('');
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'GUARDAR_TICKET_CENA',
          grupo, fechaClave, fechaLabel,
          items: itemsValidos,
          numPersonas: numPersonasActuales,
          subidoPorId: currentUser?.id,
          subidoPorNombre: currentUser?.name,
          fotoUrl: fotoUrlPendiente || ticketExistente?.fotoUrl || ''
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se ha podido guardar el ticket.');
      onSaved(data.ticket);
      setModo('resumen');
    } catch (err) {
      console.error(err);
      setErrorMsg('No se ha podido guardar el ticket. Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  if (modo === 'revisando') {
    return (
      <div className="bg-white rounded-3xl p-4 border border-stone-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-stone-900">🧾 Revisar ticket</h3>
          <button onClick={() => setModo('resumen')} className="text-[11px] font-bold text-stone-400 hover:text-stone-600">Cancelar</button>
        </div>

        {avisoSinOcr && (
          <div className="text-[10px] text-[#6b4d1c] bg-[#faf3e7] border border-[#efd9a9] rounded-xl p-2 space-y-1">
            <p>
              {detalleOcr.texto && !detalleOcr.motivo
                ? 'Se ha leído texto del ticket, pero no he sabido separar las líneas con su precio. Añádelas a mano.'
                : 'No se ha podido leer el ticket automáticamente. Añade las líneas a mano.'}
            </p>
            {detalleOcr.motivo && <p className="font-bold">Motivo: {detalleOcr.motivo}</p>}
            {detalleOcr.texto && (
              <details>
                <summary className="cursor-pointer font-bold">Ver el texto que ha leído</summary>
                <pre className="whitespace-pre-wrap break-words mt-1 text-[10px] font-mono text-stone-600 max-h-40 overflow-y-auto">{detalleOcr.texto}</pre>
              </details>
            )}
          </div>
        )}
        {errorMsg && <p className="text-[10px] text-[#6b3f29] bg-[#f6ede6] border border-[#ead3bf] rounded-xl p-2">{errorMsg}</p>}

        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {itemsRevision.map((it, idx) => (
            <div key={idx} className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-xl p-1.5">
              <input
                type="text"
                value={it.desc}
                onChange={e => actualizarLinea(idx, 'desc', e.target.value)}
                placeholder="Bebida"
                className="flex-1 min-w-0 bg-white border border-stone-300 rounded-lg px-2 py-1 text-[11px] font-semibold"
              />
              <input
                type="text"
                inputMode="decimal"
                value={it.precio}
                onChange={e => actualizarLinea(idx, 'precio', e.target.value)}
                placeholder="€"
                className="w-14 bg-white border border-stone-300 rounded-lg px-2 py-1 text-[11px] font-semibold text-right"
              />
              <label className="flex items-center gap-1 text-[9px] font-bold text-stone-600 shrink-0">
                <input
                  type="checkbox"
                  checked={Boolean(it.esAlcohol)}
                  onChange={e => actualizarLinea(idx, 'esAlcohol', e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#6b3f29]"
                />
                🍷
              </label>
              <button onClick={() => eliminarLinea(idx)} className="text-stone-300 hover:text-[#6b3f29] font-black text-sm shrink-0 px-1">✕</button>
            </div>
          ))}
        </div>

        <button
          onClick={() => setItemsRevision(prev => [...prev, { desc: '', precio: '', esAlcohol: false }])}
          className="w-full py-1.5 border border-dashed border-stone-300 rounded-xl text-[11px] font-bold text-stone-500 hover:bg-stone-50"
        >
          + Añadir línea
        </button>

        <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-stone-100">
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-2">
            <span className="text-sm font-black text-stone-800 block">{totales.total.toFixed(2)}€</span>
            <span className="text-[8.5px] font-bold text-stone-500 uppercase">Total</span>
          </div>
          <div className="bg-[#f6ede6] border border-[#ead3bf] rounded-xl p-2">
            <span className="text-sm font-black text-[#6b3f29] block">{totales.alcohol.toFixed(2)}€</span>
            <span className="text-[8.5px] font-bold text-[#6b3f29] uppercase">Alcohol</span>
          </div>
          <div className="bg-[#eef2f6] border border-[#c3d3e0] rounded-xl p-2">
            <span className="text-sm font-black text-[#2c4a66] block">{totales.porPersona.toFixed(2)}€</span>
            <span className="text-[8.5px] font-bold text-[#2c4a66] uppercase">Por persona</span>
          </div>
        </div>

        <button
          onClick={handleGuardar}
          disabled={guardando}
          className="w-full py-2.5 bg-[#2f5d50] text-white rounded-2xl font-bold text-xs shadow-xs"
        >
          {guardando ? 'Guardando...' : '✓ Confirmar y guardar'}
        </button>
      </div>
    );
  }

  // Modo resumen
  return (
    <div className="bg-white rounded-3xl p-4 border border-stone-200 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-stone-900">🧾 Ticket de la cena</h3>
        {cargandoOcr && <span className="text-[10px] font-bold text-stone-400">Leyendo ticket...</span>}
      </div>

      {errorMsg && <p className="text-[10px] text-[#6b3f29] bg-[#f6ede6] border border-[#ead3bf] rounded-xl p-2">{errorMsg}</p>}

      {!ticketExistente ? (
        <div className="text-center space-y-2 py-2">
          <p className="text-[11px] text-stone-500">Todavía no hay ticket subido para esta cena.</p>
          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={cargandoOcr}
            className="px-4 py-2 bg-[#2c4a66] text-white rounded-xl text-xs font-bold shadow-xs"
          >
            {cargandoOcr ? 'Leyendo...' : '📸 Subir foto del ticket'}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-2">
              <span className="text-sm font-black text-stone-800 block">{ticketExistente.totalTicket.toFixed(2)}€</span>
              <span className="text-[8.5px] font-bold text-stone-500 uppercase">Total</span>
            </div>
            <div className="bg-[#f6ede6] border border-[#ead3bf] rounded-xl p-2">
              <span className="text-sm font-black text-[#6b3f29] block">{ticketExistente.totalAlcohol.toFixed(2)}€</span>
              <span className="text-[8.5px] font-bold text-[#6b3f29] uppercase">Alcohol</span>
            </div>
            <div className="bg-[#eef2f6] border border-[#c3d3e0] rounded-xl p-2">
              <span className="text-sm font-black text-[#2c4a66] block">{ticketExistente.importePorPersona.toFixed(2)}€</span>
              <span className="text-[8.5px] font-bold text-[#2c4a66] uppercase">Por persona ({ticketExistente.numPersonas})</span>
            </div>
          </div>

          <p className="text-[10px] text-stone-400 text-center">
            Subido por {ticketExistente.subidoPorNombre || 'alguien'}
            {ticketExistente.fotoUrl && (
              <> · <a href={ticketExistente.fotoUrl} target="_blank" rel="noreferrer" className="underline font-bold text-[#2c4a66]">Ver foto</a></>
            )}
          </p>

          <div className="flex gap-2">
            <button onClick={handleEditarExistente} className="flex-1 py-1.5 bg-stone-100 text-stone-700 rounded-xl text-[11px] font-bold">
              ✏️ Editar líneas
            </button>
            <button
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              disabled={cargandoOcr}
              className="flex-1 py-1.5 bg-stone-100 text-stone-700 rounded-xl text-[11px] font-bold"
            >
              {cargandoOcr ? 'Leyendo...' : '📸 Repetir foto'}
            </button>
          </div>
        </>
      )}

      <input type="file" ref={fileInputRef} accept="image/*" capture="environment" className="hidden" onChange={handleFileSelected} />
    </div>
  );
}

// NUEVO: pantalla de "Inicio" — lo primero que se ve al entrar en la app (antes se caía
// directo en la lista de Partidos). Da un vistazo rápido a lo importante de la semana (si ya
// hay partido subido, cuánta gente ha confirmado cena o se está haciendo la remolona), a los
// torneos activos, y accesos directos al resto de secciones.
function HomeScreen({ currentUser, matches, activeTournaments, allDinnerGuests, pendingAlerts, convocatoriasAbiertas = 0, onNavigate, onOpenMatch, onProponer }) {
  // NUEVO: "Estadísticas individuales" del Home — semanas sin jugar / sin ganar-perder / sin
  // cena, calculadas sobre Liga + Amistosos + Torneos (alcance "Todo", a petición de Marcos).
  const rachas = useMemo(
    () => calcularRachasSemanales(currentUser, matches, activeTournaments, allDinnerGuests),
    [currentUser, matches, activeTournaments, allDinnerGuests]
  );

  const resumen = useMemo(() => {
    const ahora = new Date();
    const finSemana = new Date(ahora.getTime());
    finSemana.setDate(finSemana.getDate() + 6);
    finSemana.setHours(23, 59, 59, 999);

    const partidosSemana = (matches || [])
      .filter(m => isMatchOfficial(m) && m.status !== 'CANCELADO')
      .map(m => ({ m, fecha: parseMatchDateObject(m.date, m.fechaISO), estado: computeMatchStatus(m) }))
      // Antes solo entraban los partidos que todavía no habían empezado (fecha >= ahora), así que
      // un partido en juego desaparecía del Home justo al empezar. Ahora entran los programados
      // de los próximos 7 días Y los que están en juego en este momento.
      .filter(x => x.fecha && (
        x.estado === 'EN JUEGO' ||
        (x.estado === 'PROGRAMADO' && x.fecha >= ahora && x.fecha <= finSemana)
      ))
      .sort((a, b) => a.fecha - b.fecha)
      .map(x => {
        const jugadores = x.m.players || [];
        const cenaSi = jugadores.filter(p => String(p.dinner || '').toUpperCase() === 'SI').length;
        const cenaPendiente = jugadores.filter(p => String(p.dinner || '').toUpperCase() === 'PENDIENTE').length;
        return { match: x.m, estado: x.estado, cenaSi, cenaPendiente, totalJugadores: jugadores.length };
      });

    // Partidos de esta semana (lunes a domingo) que ya se han jugado: para que, si no queda ninguno por
    // delante, se vea que la semana ya tuvo partido y no que "no hubo".
    const lunes = new Date(ahora.getTime());
    lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
    lunes.setHours(0, 0, 0, 0);
    const jugadosSemana = (matches || [])
      .filter(m => isMatchOfficial(m) && m.status !== 'CANCELADO')
      .map(m => ({ m, fecha: parseMatchDateObject(m.date, m.fechaISO), estado: computeMatchStatus(m) }))
      .filter(x => x.fecha && x.fecha >= lunes && x.fecha < ahora && (x.estado === 'FINALIZADO' || x.estado === 'SIN RESULTADO'))
      .sort((a, b) => a.fecha - b.fecha)
      .map(x => ({ match: x.m, estado: x.estado }));

    const myNameNorm = normalizeName(currentUser?.name || '');
    const misTorneos = (activeTournaments || []).filter(t => (
      (t.participants || []).some(p => p.id === currentUser?.id || normalizeName(p.name) === myNameNorm) ||
      t.creatorId === currentUser?.id ||
      (t.coOrganizerIds || []).includes(currentUser?.id)
    ));

    return { partidosSemana, jugadosSemana, misTorneos };
  }, [matches, activeTournaments, currentUser]);

  const saludo = (() => {
    const h = new Date().getHours();
    if (h < 13) return 'Buenos días';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  })();

  return (
    <div className="space-y-3">
      <div className="bg-gradient-to-r from-[#2c4a66] to-[#2c4a66] rounded-3xl p-5 text-white shadow-md">
        <p className="text-xs font-bold opacity-80">{saludo},</p>
        <h2 className="text-xl font-black">{(currentUser?.name || 'Jugador').split(' ')[0]} 👋</h2>
      </div>

      <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-black text-stone-900 text-xs">🎾 Esta semana</span>
          <button onClick={() => onNavigate('partidos')} className="text-[10px] font-bold text-[#2c4a66] hover:underline">Ver todo →</button>
        </div>

        {resumen.partidosSemana.length === 0 ? (
          resumen.jugadosSemana.length > 0 ? (
            <div className="space-y-2">
              <div className="bg-[#eef4f0] border border-[#c7ddc9] rounded-xl p-3 space-y-1">
                <span className="text-[11px] font-black text-[#2f5d50] block">
                  ✅ {resumen.jugadosSemana.length} {resumen.jugadosSemana.length === 1 ? 'partido jugado' : 'partidos jugados'} esta semana
                </span>
                <span className="text-[11px] font-semibold text-[#2f5d50] block">Sin más partidos planificados para el resto de la semana.</span>
              </div>
              {resumen.jugadosSemana.map(({ match, estado }) => (
                <button
                  key={match.id}
                  onClick={() => onOpenMatch(match.id)}
                  className="w-full text-left bg-stone-50 hover:bg-stone-100 transition rounded-xl p-2.5 flex items-center justify-between gap-2"
                >
                  {(() => {
                    // Resumen simple: quién jugó con quién y cómo quedó. Los ganadores van en negrita.
                    const nombre = (p) => String(p.name || '').trim().split(' ')[0];
                    const jug = match.players || [];
                    const eq1 = jug.filter(p => Number(p.team || 1) === 1);
                    const eq2 = jug.filter(p => Number(p.team || 1) === 2);
                    const unir = (arr) => arr.map(nombre).join(' y ');
                    const gana1 = estado === 'FINALIZADO' && eq1.length > 0 && eq1.some(p => String(p.won).toUpperCase() === 'SI');
                    const gana2 = estado === 'FINALIZADO' && eq2.length > 0 && eq2.some(p => String(p.won).toUpperCase() === 'SI');
                    return (
                      <span className="min-w-0">
                        <span className="font-bold text-stone-800 text-[11px] block truncate">{fechaCompleta(match.date, match.fechaISO)}</span>
                        {eq1.length > 0 && eq2.length > 0 ? (
                          <span className="text-[11px] text-stone-600 block">
                            <span className={gana1 ? 'font-black text-[#2f5d50]' : ''}>{gana1 ? '🏆 ' : ''}{unir(eq1)}</span>
                            {' vs '}
                            <span className={gana2 ? 'font-black text-[#2f5d50]' : ''}>{gana2 ? '🏆 ' : ''}{unir(eq2)}</span>
                          </span>
                        ) : jug.length > 0 ? (
                          <span className="text-[11px] text-stone-600 block">{jug.map(nombre).join(', ')}</span>
                        ) : null}
                        <span className="text-[10px] text-stone-500 block">{estado === 'FINALIZADO' ? (match.score ? `Resultado: ${match.score}` : 'Finalizado') : 'Jugado · sin resultado anotado'}</span>
                      </span>
                    );
                  })()}
                  <span className="text-stone-400 text-xs shrink-0">→</span>
                </button>
              ))}
              <button onClick={() => onNavigate('partidos')} className="text-[10px] font-black text-[#2c4a66] underline block mx-auto">Subir otro partido</button>
            </div>
          ) : (
            <div className="bg-[#faf3e7] border border-[#efd9a9] rounded-xl p-3 text-center space-y-1.5">
              <span className="text-[11px] font-bold text-[#6b4d1c] block">Todavía no hay partido subido para esta semana</span>
              <button onClick={() => onNavigate('partidos')} className="text-[10px] font-black text-[#6b4d1c] underline">Subir partido</button>
            </div>
          )
        ) : (
          [
            resumen.jugadosSemana.length > 0 && (
              <span key="jugados" className="text-[10px] font-bold text-[#2f5d50] block">
                ✅ {resumen.jugadosSemana.length} {resumen.jugadosSemana.length === 1 ? 'partido ya jugado' : 'partidos ya jugados'} esta semana
              </span>
            ),
            ...resumen.partidosSemana.map(({ match, estado, cenaSi, cenaPendiente, totalJugadores }) => (
            <button
              key={match.id}
              onClick={() => onOpenMatch(match.id)}
              className="w-full text-left bg-stone-50 hover:bg-stone-100 transition rounded-xl p-2.5 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <span className="font-bold text-stone-800 text-[11px] block truncate">
                  {estado === 'EN JUEGO' && (
                    <span className="inline-flex items-center gap-1 mr-1.5 px-1.5 py-0.5 rounded-full bg-[#fbeee6] text-[#6b3f29] text-[9px] font-black align-middle">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#b5532a] animate-pulse" /> EN JUEGO
                    </span>
                  )}
                  {fechaCompleta(match.date, match.fechaISO)}
                </span>
                <span className="text-[10px] text-stone-500">
                  {totalJugadores}/4 apuntados
                  {cenaPendiente > 0
                    ? ` · 🍻 ${cenaPendiente} sin confirmar cena (gente remolona 🐌)`
                    : (cenaSi > 0 ? ` · 🍻 ${cenaSi} confirmados para cenar` : '')}
                </span>
              </div>
              <span className="text-stone-400 text-xs shrink-0">→</span>
            </button>
            ))
          ]
        )}
      </div>

      {/* NUEVO: "Estadísticas individuales" — pensado para rellenar un Home que se veía un poco
          vacío, con 3 datos "de racha" sobre Liga + Amistosos + Torneos juntos (alcance "Todo").
          El hueco central es compartido: muestra "sin ganar" si tu último resultado fue una
          derrota (para animarte) o "sin perder" si fue una victoria (para presumir de racha) —
          nunca los dos a la vez. */}
      {rachas && rachas.tieneHistorial && (
        <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs space-y-2.5">
          <span className="font-black text-stone-900 text-xs block">📊 Estadísticas individuales</span>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-2.5">
              <span className="text-lg font-black text-stone-800 block">{rachas.semanasSinJugar}</span>
              <span className="text-[9px] font-bold text-stone-500 uppercase leading-tight block">
                {rachas.semanasSinJugar === 1 ? 'Semana sin jugar' : 'Semanas sin jugar'}
              </span>
            </div>

            {rachas.ultimoResultado === 'derrota' ? (
              <div className="bg-[#faf3e7] border border-[#efd9a9] rounded-xl p-2.5">
                <span className="text-lg font-black text-[#6b4d1c] block">
                  {rachas.semanasSinGanar === null ? '–' : rachas.semanasSinGanar}
                </span>
                <span className="text-[9px] font-bold text-[#6b4d1c] uppercase leading-tight block">
                  {rachas.semanasSinGanar === 1 ? 'Semana sin ganar' : 'Semanas sin ganar'}
                </span>
              </div>
            ) : (
              <div className="bg-[#eef4f0] border border-[#c7ddc9] rounded-xl p-2.5">
                <span className="text-lg font-black text-[#2f5d50] block">
                  {rachas.semanasSinPerder === null ? '–' : rachas.semanasSinPerder}
                </span>
                <span className="text-[9px] font-bold text-[#2f5d50] uppercase leading-tight block">
                  {rachas.semanasSinPerder === 1 ? 'Semana sin perder' : 'Semanas sin perder'}
                </span>
              </div>
            )}

            <div className="bg-[#f2eef2] border border-[#ddc9de] rounded-xl p-2.5">
              <span className="text-lg font-black text-[#4a3350] block">
                {rachas.semanasSinCena === null ? '–' : rachas.semanasSinCena}
              </span>
              <span className="text-[9px] font-bold text-[#4a3350] uppercase leading-tight block">
                {rachas.semanasSinCena === 1 ? 'Semana sin cena' : 'Semanas sin cena'}
              </span>
            </div>
          </div>
        </div>
      )}

      {resumen.misTorneos.length > 0 && (
        <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-black text-stone-900 text-xs flex items-center gap-1"><PadelRacketsIcon /> Tus torneos activos</span>
            <button onClick={() => onNavigate('torneos')} className="text-[10px] font-bold text-[#2c4a66] hover:underline">Ver todo →</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {resumen.misTorneos.map(t => (
              <span key={t.id} className="bg-[#eef2f6] text-[#2c4a66] text-[10px] font-bold px-2 py-1 rounded-full">{t.name}</span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-black text-stone-900 text-xs">🙌 Pachanga</span>
          <button onClick={() => onNavigate('pachanga')} className="text-[10px] font-bold text-[#2c4a66] hover:underline">Ver propuestas →</button>
        </div>
        <span className="text-[11px] text-stone-600 font-medium block">
          {convocatoriasAbiertas > 0
            ? `Hay ${convocatoriasAbiertas} ${convocatoriasAbiertas === 1 ? 'propuesta de partido abierta' : 'propuestas de partido abiertas'}.`
            : '¿Te falta gente para un partido? Propónlo y avisamos al resto.'}
        </span>
        <button onClick={() => onProponer()} className="w-full bg-[#2c4a66] text-white font-bold text-[11px] rounded-xl py-2">🙌 Proponer un partido</button>
      </div>

      {pendingAlerts.length > 0 && (
        <button
          onClick={() => onNavigate('avisos')}
          className="w-full bg-[#faf3e7] border border-[#efd9a9] text-[#6b4d1c] rounded-2xl p-3 flex items-center justify-between gap-2"
        >
          <span className="text-xs font-bold">🔔 Tienes {pendingAlerts.length} {pendingAlerts.length === 1 ? 'aviso pendiente' : 'avisos pendientes'}</span>
          <span className="text-[#d9b97c]">→</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onNavigate('cenas')} className="bg-white border border-stone-200 rounded-2xl p-3 text-center hover:bg-stone-50 transition">
          <span className="text-xl block mb-0.5">🍻</span>
          <span className="text-[11px] font-bold text-stone-700">Cena & Club</span>
        </button>
        <button onClick={() => onNavigate('rankings')} className="bg-white border border-stone-200 rounded-2xl p-3 text-center hover:bg-stone-50 transition">
          <span className="text-xl block mb-0.5">🏆</span>
          <span className="text-[11px] font-bold text-stone-700">Rankings</span>
        </button>
        <button onClick={() => onNavigate('bote')} className="bg-white border border-stone-200 rounded-2xl p-3 text-center hover:bg-stone-50 transition">
          <span className="text-xl block mb-0.5">💶</span>
          <span className="text-[11px] font-bold text-stone-700">Bote</span>
        </button>
        <button onClick={() => onNavigate('torneos')} className="bg-white border border-stone-200 rounded-2xl p-3 text-center hover:bg-stone-50 transition">
          <span className="text-xl block mb-0.5"><PadelRacketsIcon size="1.25em" /></span>
          <span className="text-[11px] font-bold text-stone-700">Torneos</span>
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// PACHANGA · CONVOCATORIAS DE PARTIDO
// Alguien propone un partido ("me faltan jugadores" / "tengo este hueco libre") y el resto responde
// Sí o No. Solo los "Sí" avisan a quien organiza; las propuestas nuevas avisan a quien no tiene
// partido ese día (todo eso lo hace el backend). El partido real se crea desde aquí con el mismo
// proceso de siempre, así que sigue valiendo la regla general: jueves (Chicos) / martes (Chicas)
// cuentan para la liga y cualquier otro día es amistoso.
// ============================================================================
function fechaDeConvocatoria(c) {
  const m = String((c && c.fechaISO) || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}

// "Jueves, 15 oct 2026 · 21:00"
function etiquetaConvocatoria(c) {
  const iso = String((c && c.fechaISO) || '');
  const hora = (iso.match(/[ T](\d{2}:\d{2})/) || [])[1] || '';
  return `${etiquetaFechaDia(iso.slice(0, 10))}${hora ? ` · ${hora}` : ''}`;
}

// Quién puede ver una propuesta: quien la organiza, a quien va dirigida o, si es abierta, su grupo.
function convocatoriaVisiblePara(c, user) {
  if (!c || !user) return false;
  if (c.creadorId === user.id) return true;
  if ((c.destinatarios || []).length) return c.destinatarios.includes(user.id);
  return String(c.grupo || '').toLowerCase() === String(user.group || '').toLowerCase();
}

function respuestaDe(c, userId) {
  return ((c && c.respuestas) || []).find(r => r.idJugador === userId) || null;
}

// ¿Tiene ya este jugador un partido (no cancelado) en ese día "AAAA-MM-DD"?
function tienePartidoEseDia(matches, user, claveDia) {
  const miNombre = normalizeName(user.name || '');
  return (matches || []).some(m => {
    if (m.status === 'CANCELADO') return false;
    if (extractCleanDate(m.date, m.fechaISO) !== claveDia) return false;
    return (m.players || []).some(p => p.id === user.id || normalizeName(p.name) === miNombre);
  });
}

// Texto con el mismo formato que el alta manual de un partido (📅 / 📍 / enlace / ✅ jugadores).
function textoPartidoDesdeConvocatoria(c, players) {
  const dObj = fechaDeConvocatoria(c);
  const diasTxt = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const mesesTxt = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const hhmm = `${String(dObj.getHours()).padStart(2, '0')}:${String(dObj.getMinutes()).padStart(2, '0')}`;
  const d = `${diasTxt[dObj.getDay()]}, ${String(dObj.getDate()).padStart(2, '0')} ${mesesTxt[dObj.getMonth()]} ${dObj.getFullYear()}, ${hhmm}`;
  const nombreDe = (id, respaldo) => ((players || []).find(p => p.id === id) || {}).name || respaldo || '';
  const nombres = [nombreDe(c.creadorId, c.creadorNombre)]
    .concat((c.respuestas || []).filter(r => r.respuesta === 'SI' && r.asignado).map(r => nombreDe(r.idJugador, r.nombre)))
    .filter(Boolean)
    .slice(0, 4);
  const lineas = [`📅 ${d}`, `📍 ${c.lugar || 'Real Club de Tenis de La Coruña'}`];
  if (/^https?:\/\//i.test(c.link || '')) lineas.push(c.link);
  nombres.forEach(n => lineas.push(`✅ ${n}`));
  return lineas.join('\n');
}

// "partido" (opcional): si se abre desde un partido ya creado, la propuesta ofrece plazas de ESE partido
// (día, hora y sitio son los suyos). Forma: { id, dia:'AAAA-MM-DD', hora:'HH:MM', lugar, url, jugadores:[{id,name}] }.
function NuevaConvocatoriaModal({ isOpen, onClose, onSubmit, destinatarios = [], fechaInicial = '', horaInicial = '', players = [], currentUser = null, partido = null }) {
  const dirigida = destinatarios.length > 0;
  const deUnPartido = Boolean(partido && partido.id);
  const [retirados, setRetirados] = useState([]);
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('21:00');
  const [plazas, setPlazas] = useState(1);
  const [lugar, setLugar] = useState('');
  const [vetados, setVetados] = useState([]);
  const [pista, setPista] = useState(false);
  const [link, setLink] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPlazas(dirigida ? Math.min(3, Math.max(1, destinatarios.length)) : 1);
      setFecha(deUnPartido ? partido.dia : (fechaInicial || '')); setHora(deUnPartido ? partido.hora : (horaInicial || '21:00'));
      setLugar(deUnPartido ? (partido.lugar || '') : '');
      setVetados([]); setRetirados([]);
      setPista(deUnPartido); setLink(''); setNota(''); setError(''); setEnviando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, partido && partido.id]);

  if (!isOpen) return null;

  const hoyISO = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();

  // Con un partido de por medio, las plazas son las que ya estaban libres más las de quienes se han caído.
  const jugadoresPartido = deUnPartido ? (partido.jugadores || []) : [];
  const libresPartido = deUnPartido ? Math.max(0, 4 - jugadoresPartido.length) : 0;
  const plazasPartido = deUnPartido ? Math.min(3, libresPartido + retirados.length) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (enviando) return;
    if (deUnPartido && plazasPartido < 1) { setError('Marca quién ha fallado en el partido.'); return; }
    if (!fecha || !hora) { setError('Indica el día y la hora.'); return; }
    const cuando = new Date(`${fecha}T${hora}`);
    if (isNaN(cuando.getTime()) || cuando.getTime() <= Date.now()) { setError('Esa fecha y hora ya han pasado.'); return; }
    if (link.trim() && !/^https?:\/\//i.test(link.trim())) { setError('El enlace debe empezar por http:// o https://'); return; }
    setError('');
    setEnviando(true);
    let res;
    try {
      res = await onSubmit({
        tipo: dirigida ? 'DIRIGIDA' : 'FALTAN', fechaISO: `${fecha} ${hora}`,
        plazas: deUnPartido ? plazasPartido : plazas, lugar: lugar.trim(), pistaReservada: pista,
        link: deUnPartido ? (/^https?:\/\//i.test(partido.url || '') ? partido.url : '') : link.trim(),
        nota: nota.trim(), destinatarios: destinatarios.map(d => d.id), vetados: dirigida ? [] : vetados,
        ...(deUnPartido ? { partidoId: partido.id, retirados } : {})
      });
    } finally {
      setEnviando(false);
    }
    if (res && res.ok === false) setError(res.error || 'No se ha podido crear la propuesta.');
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-3 max-h-[92vh] overflow-y-auto">
        <h3 className="text-base font-black text-stone-900">
          {deUnPartido ? '🆘 Ofrecer plaza en este partido' : (dirigida ? '💌 Proponer partido' : '🙌 Proponer partido')}
        </h3>

        {dirigida && (
          <div className="bg-[#eef2f6] border border-[#c3d3e0] rounded-xl p-2.5 text-[11px] font-bold text-[#2c4a66]">
            Para: {destinatarios.map(d => d.name).join(', ')}. Solo les llegará a ellos.
          </div>
        )}

        {deUnPartido ? (
          <>
            <div className="bg-[#eef2f6] border border-[#c3d3e0] rounded-xl p-2.5 text-[11px] font-bold text-[#2c4a66] space-y-0.5">
              <span className="block">📅 {etiquetaFechaDia(fecha)} · {hora}</span>
              {lugar && <span className="block">📍 {lugar}</span>}
              <span className="block font-semibold text-stone-600">Avisamos a quien no tenga partido ese día. Quien pueda te lo dice, tú confirmas a quién y entra directamente en este partido.</span>
            </div>
            <div className="block">
              <span className="text-[10px] font-black uppercase text-stone-500">¿Quién ha fallado?{libresPartido > 0 ? ' (si ya hay hueco libre, no hace falta)' : ''}</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {jugadoresPartido.map(j => {
                  const marcado = retirados.includes(j.id);
                  return (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => { setRetirados(prev => prev.includes(j.id) ? prev.filter(x => x !== j.id) : [...prev, j.id]); setError(''); }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${marcado ? 'bg-[#6b3f29] text-white border-[#6b3f29]' : 'bg-white text-stone-600 border-stone-200'}`}
                    >
                      {marcado ? '✗ ' : ''}{j.name}{currentUser && j.id === currentUser.id ? ' (tú)' : ''}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] font-black text-[#2c4a66] block mt-1.5">
                {plazasPartido > 0 ? `Buscas ${plazasPartido} ${plazasPartido === 1 ? 'jugador' : 'jugadores'}.` : 'Marca a quien no va a poder jugar.'}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="block">
                <span className="text-[10px] font-black uppercase text-stone-500">Día</span>
                <input type="date" required min={hoyISO} value={fecha} onChange={e => { setFecha(e.target.value); setError(''); }} className="w-full border rounded-lg p-1.5 text-xs font-semibold" />
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase text-stone-500">Hora</span>
                <input type="time" required value={hora} onChange={e => { setHora(e.target.value); setError(''); }} className="w-full border rounded-lg p-1.5 text-xs font-semibold" />
              </label>
            </div>

            <label className="block">
              <span className="text-[10px] font-black uppercase text-stone-500">¿Cuántos jugadores buscas?</span>
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {[1, 2, 3].map(n => (
                  <button key={n} type="button" onClick={() => setPlazas(n)} className={`py-1.5 rounded-lg text-xs font-black border transition ${plazas === n ? 'bg-[#2c4a66] text-white border-[#2c4a66]' : 'bg-white text-stone-600 border-stone-200'}`}>{n}</button>
                ))}
              </div>
            </label>

            <label className="block">
              <span className="text-[10px] font-black uppercase text-stone-500">Sitio <span className="normal-case font-bold text-stone-400">(opcional)</span></span>
              <input
                type="text"
                maxLength={120}
                value={lugar}
                onChange={e => setLugar(e.target.value)}
                placeholder="Club, pista…"
                className="w-full border rounded-lg p-1.5 text-xs font-semibold"
                autoComplete="off"
              />
            </label>

            <label className="flex items-center gap-2 text-xs font-bold text-stone-700">
              <input type="checkbox" checked={pista} onChange={e => setPista(e.target.checked)} className="w-4 h-4" />
              Ya tengo la pista reservada
            </label>
          </>
        )}

        {!dirigida && (() => {
          const candidatos = (players || [])
            .filter(p => currentUser && p.id !== currentUser.id &&
              String(p.group || '').toLowerCase() === String(currentUser.group || '').toLowerCase() &&
              (p.estadoAprobacion || 'APROBADO') === 'APROBADO')
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));
          if (!candidatos.length) return null;
          return (
            <details className="bg-stone-50 rounded-xl p-2.5">
              <summary className="text-[11px] font-black text-stone-700 cursor-pointer">
                🚫 Vetar a alguien{vetados.length > 0 ? ` (${vetados.length})` : ''}
              </summary>
              <p className="text-[10px] text-stone-500 mt-1.5 mb-2">
                Quien marques no verá esta propuesta ni recibirá avisos de ella, y no se entera de que lo has vetado.
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {candidatos.map(p => {
                  const marcado = vetados.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setVetados(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${marcado ? 'bg-[#6b3f29] text-white border-[#6b3f29]' : 'bg-white text-stone-600 border-stone-200'}`}
                    >
                      {marcado ? '🚫 ' : ''}{p.name}
                    </button>
                  );
                })}
              </div>
            </details>
          );
        })()}

        {!deUnPartido && (
          <label className="block">
            <span className="text-[10px] font-black uppercase text-stone-500">Enlace de la reserva (opcional)</span>
            <input type="url" value={link} onChange={e => { setLink(e.target.value); setError(''); }} placeholder="https://…" className="w-full border rounded-lg p-1.5 text-xs font-semibold" />
          </label>
        )}

        <label className="block">
          <span className="text-[10px] font-black uppercase text-stone-500">Nota (opcional)</span>
          <input type="text" maxLength={300} value={nota} onChange={e => setNota(e.target.value)} placeholder="Nivel, ambiente, lo que quieras contar…" className="w-full border rounded-lg p-1.5 text-xs font-semibold" />
        </label>

        {error && (
          <div className="bg-[#f6ede6] border border-[#ead3bf] text-[#6b3f29] text-[11px] font-bold rounded-xl p-2">⚠️ {error}</div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={enviando} className="flex-1 py-2 bg-stone-100 font-bold text-xs rounded-xl disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={enviando} className="flex-1 py-2 bg-[#2c4a66] text-white font-bold text-xs rounded-xl shadow-xs disabled:opacity-50">{enviando ? 'Enviando…' : 'Proponer'}</button>
        </div>
      </form>
    </div>
  );
}

// Panel "Disponibles": quien tiene un hueco lo publica; quien necesita gente ve quién está libre y
// les propone un partido (propuesta dirigida: solo les llega a ellos).
function DisponiblesPanel({ currentUser, players, matches, disponibilidades, onGuardar, onEliminar, onContactar }) {
  const hoyISO = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();
  const [dia, setDia] = useState('');
  const [desde, setDesde] = useState('19:00');
  const [hasta, setHasta] = useState('22:00');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [seleccion, setSeleccion] = useState({ dia: '', ids: [] });

  const mias = useMemo(
    () => (disponibilidades || []).filter(d => d.idJugador === currentUser.id).sort((a, b) => (a.dia + a.desde).localeCompare(b.dia + b.desde)),
    [disponibilidades, currentUser]
  );

  // Las de los demás del mismo grupo, agrupadas por día.
  const porDia = useMemo(() => {
    const mapa = {};
    (disponibilidades || []).forEach(d => {
      if (d.idJugador === currentUser.id) return;
      if (String(d.grupo || '').toLowerCase() !== String(currentUser.group || '').toLowerCase()) return;
      (mapa[d.dia] = mapa[d.dia] || []).push(d);
    });
    return Object.keys(mapa).sort().map(k => ({ dia: k, lista: mapa[k].sort((a, b) => a.desde.localeCompare(b.desde)) }));
  }, [disponibilidades, currentUser]);

  const fotoDe = (id) => (players.find(p => p.id === id) || {}).photo || '';

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    if (!dia) { setError('Elige el día.'); return; }
    if (hasta <= desde) { setError('La hora final debe ser posterior a la inicial.'); return; }
    const fin = new Date(`${dia}T${hasta}`);
    if (isNaN(fin.getTime()) || fin.getTime() <= Date.now()) { setError('Esa franja ya ha pasado.'); return; }
    setError('');
    setEnviando(true);
    let res;
    try {
      res = await onGuardar({ dia, desde, hasta, nota: nota.trim() });
    } finally {
      setEnviando(false);
    }
    if (res && res.ok === false) setError(res.error || 'No se ha podido guardar.');
    else { setNota(''); }
  };

  const alternar = (d) => {
    setSeleccion(prev => {
      if (prev.dia !== d.dia) return { dia: d.dia, ids: [d.idJugador] };
      return prev.ids.includes(d.idJugador)
        ? { dia: prev.dia, ids: prev.ids.filter(x => x !== d.idJugador) }
        : { dia: prev.dia, ids: [...prev.ids, d.idJugador] };
    });
  };

  const contactar = (grupoDia) => {
    const elegidas = grupoDia.lista.filter(d => seleccion.ids.includes(d.idJugador));
    if (!elegidas.length) return;
    // Hora propuesta: la más tardía de las "desde" para que todos estén ya libres.
    const hora = elegidas.map(d => d.desde).sort().slice(-1)[0];
    const vistos = new Set();
    const jugadores = elegidas.filter(d => !vistos.has(d.idJugador) && vistos.add(d.idJugador)).map(d => ({ id: d.idJugador, name: d.nombre }));
    onContactar({ dia: grupoDia.dia, hora, jugadores });
    setSeleccion({ dia: '', ids: [] });
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleGuardar} className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs space-y-2.5">
        <span className="font-black text-stone-900 text-xs block">🕒 Marca cuándo estás libre</span>
        <div className="grid grid-cols-3 gap-1.5">
          <label className="block col-span-3 sm:col-span-1">
            <span className="text-[10px] font-black uppercase text-stone-500">Día</span>
            <input type="date" min={hoyISO} value={dia} onChange={e => { setDia(e.target.value); setError(''); }} className="w-full border rounded-lg p-1.5 text-xs font-semibold" />
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase text-stone-500">Desde</span>
            <input type="time" value={desde} onChange={e => { setDesde(e.target.value); setError(''); }} className="w-full border rounded-lg p-1.5 text-xs font-semibold" />
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase text-stone-500">Hasta</span>
            <input type="time" value={hasta} onChange={e => { setHasta(e.target.value); setError(''); }} className="w-full border rounded-lg p-1.5 text-xs font-semibold" />
          </label>
        </div>
        <input type="text" maxLength={200} value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (opcional): sitios, nivel…" className="w-full border rounded-lg p-1.5 text-xs font-semibold" />
        {error && <div className="bg-[#f6ede6] border border-[#ead3bf] text-[#6b3f29] text-[11px] font-bold rounded-xl p-2">⚠️ {error}</div>}
        <button type="submit" disabled={enviando} className="w-full py-2 bg-[#2c4a66] text-white font-bold text-xs rounded-xl shadow-xs disabled:opacity-50">{enviando ? 'Guardando…' : 'Publicar mi disponibilidad'}</button>

        {mias.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {mias.map(d => (
              <span key={d.id} className="inline-flex items-center gap-1 bg-[#eef4f0] text-[#2f5d50] text-[11px] font-bold px-2.5 py-1 rounded-full">
                {etiquetaFechaDia(d.dia).replace(/ 20\d{2}$/, '')} · {d.desde}–{d.hasta}
                <button type="button" onClick={() => onEliminar(d)} className="font-black" aria-label="Retirar disponibilidad">✕</button>
              </span>
            ))}
          </div>
        )}
      </form>

      <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs space-y-3">
        <div>
          <span className="font-black text-stone-900 text-xs block">🙋 Quién está disponible</span>
          <span className="text-[11px] text-stone-500 block">Marca a quien quieras y propónle un partido: solo les llegará a ellos.</span>
        </div>

        {porDia.length === 0 ? (
          <div className="bg-[#faf3e7] border border-[#efd9a9] rounded-xl p-3 text-center text-[11px] font-bold text-[#6b4d1c]">
            Nadie ha publicado todavía una franja libre.
          </div>
        ) : porDia.map(g => {
          const elegidosAqui = seleccion.dia === g.dia ? g.lista.filter(d => seleccion.ids.includes(d.idJugador)) : [];
          return (
            <div key={g.dia} className="space-y-1.5">
              <span className="text-[11px] font-black text-[#2c4a66] block">{etiquetaFechaDia(g.dia)}</span>
              {g.lista.map(d => {
                const marcado = seleccion.dia === g.dia && seleccion.ids.includes(d.idJugador);
                const ocupado = tienePartidoEseDia(matches, { id: d.idJugador, name: d.nombre }, d.dia);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => alternar(d)}
                    className={`w-full text-left rounded-xl p-2.5 flex items-center gap-2.5 border transition ${marcado ? 'bg-[#eef2f6] border-[#9fb4c7]' : 'bg-stone-50 border-transparent hover:bg-stone-100'}`}
                  >
                    <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-[11px] font-black shrink-0 ${marcado ? 'bg-[#2c4a66] border-[#2c4a66] text-white' : 'border-stone-300 text-transparent'}`}>✓</span>
                    <UserAvatar name={d.nombre} photo={fotoDe(d.idJugador)} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="font-bold text-stone-800 text-[12px] block truncate">{d.nombre}</span>
                      <span className="text-[10px] text-stone-500 block truncate">
                        {d.desde}–{d.hasta}{d.nota ? ` · ${d.nota}` : ''}{ocupado ? ' · ya tiene partido ese día' : ''}
                      </span>
                    </span>
                  </button>
                );
              })}
              {elegidosAqui.length > 0 && (
                <button type="button" onClick={() => contactar(g)} className="w-full py-2 bg-[#2c4a66] text-white font-bold text-xs rounded-xl shadow-xs">
                  💌 Proponer partido a {elegidosAqui.map(d => d.nombre.split(' ')[0]).join(', ')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PachangaScreen({ currentUser, players, matches, convocatorias, disponibilidades, resaltarId, trabajando, onBack, onNueva, onResponder, onAsignar, onCancelar, onConvertir, onAnadirAPartido, onAbrirPartido, onGuardarDisp, onEliminarDisp, onContactar }) {
  const [vista, setVista] = useState('propuestas');
  const visibles = useMemo(() => {
    const ahora = Date.now();
    return (convocatorias || [])
      .filter(c => c.estado !== 'CANCELADA' && convocatoriaVisiblePara(c, currentUser))
      .map(c => ({ c, fecha: fechaDeConvocatoria(c) }))
      .filter(x => x.fecha && x.fecha.getTime() >= ahora)
      .sort((a, b) => a.fecha - b.fecha)
      .map(x => x.c);
  }, [convocatorias, currentUser]);

  useEffect(() => {
    if (!resaltarId) return;
    const el = document.getElementById(`conv-${resaltarId}`);
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [resaltarId, visibles.length]);

  const fotoDe = (id) => (players.find(p => p.id === id) || {}).photo || '';

  return (
    <div className="space-y-3">
      <CabeceraPantalla onBack={onBack} titulo="🙌 Pachanga" tituloAtras="Volver al inicio" />

      <div className="flex bg-white p-1 rounded-2xl border border-stone-200 shadow-xs text-[11px] font-bold">
        {[{ key: 'propuestas', label: '🎾 Propuestas' }, { key: 'disponibles', label: '🕒 Disponibles' }].map(t => (
          <button
            key={t.key}
            onClick={() => setVista(t.key)}
            className={`flex-1 py-1.5 rounded-xl transition ${vista === t.key ? 'bg-[#2c4a66] text-white shadow-xs' : 'text-stone-600 hover:text-stone-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {vista === 'disponibles' ? (
        <DisponiblesPanel
          currentUser={currentUser}
          players={players}
          matches={matches}
          disponibilidades={disponibilidades}
          onGuardar={onGuardarDisp}
          onEliminar={onEliminarDisp}
          onContactar={onContactar}
        />
      ) : (<>
      <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs space-y-2.5">
        <p className="text-[11px] text-stone-600 font-medium">
          Propón un partido y avisamos a quien no tenga nada ese día. Quien pueda te lo dice (te llegan solo los avisos de quienes pueden) y tú decides quién entra.
        </p>
        <button onClick={() => onNueva()} className="w-full bg-[#2c4a66] text-white font-bold text-xs rounded-xl py-2.5 shadow-xs">🙌 Proponer un partido</button>
      </div>

      {visibles.length === 0 ? (
        <div className="bg-[#faf3e7] border border-[#efd9a9] rounded-2xl p-4 text-center">
          <span className="text-xs font-bold text-[#6b4d1c] block">No hay propuestas abiertas ahora mismo</span>
          <span className="text-[11px] text-[#6b4d1c]">Si te falta gente para un partido, proponlo arriba.</span>
        </div>
      ) : visibles.map(c => {
        const esMia = c.creadorId === currentUser.id;
        const todas = c.respuestas || [];
        const asignados = todas.filter(r => r.asignado);
        const quienesPueden = todas.filter(r => r.respuesta === 'SI').sort((a, b) => Number(b.asignado) - Number(a.asignado));
        const nos = todas.filter(r => r.respuesta === 'NO');
        const mia = respuestaDe(c, currentUser.id);
        const miAsignado = Boolean(mia && mia.asignado);
        const totalDisp = typeof c.totalDisponibles === 'number' ? c.totalDisponibles : todas.filter(r => r.respuesta === 'SI').length;
        const completa = asignados.length >= c.plazas;
        const ocupado = Boolean(trabajando && trabajando[c.id]);
        const convertida = c.estado === 'CONVERTIDA';
        const deUnPartido = Boolean(c.partidoId) && !convertida;
        const badge = c.tipo === 'DIRIGIDA' ? '💌 Invitación' : deUnPartido ? '🔁 Plaza en un partido' : '🙌 Busca jugadores';
        const resaltada = resaltarId === c.id;
        return (
          <div
            key={c.id}
            id={`conv-${c.id}`}
            className={`bg-white rounded-2xl p-3.5 border shadow-xs space-y-2.5 ${resaltada ? 'border-[#d9b97c] ring-2 ring-[#efd9a9]' : 'border-stone-200'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase bg-[#eef2f6] text-[#2c4a66] px-2 py-0.5 rounded-full">{badge}</span>
                <span className="font-black text-stone-900 text-sm block mt-1.5">{etiquetaConvocatoria(c)}</span>
                {(c.lugar || c.pistaReservada) && (
                  <span className="text-[11px] text-stone-600 font-semibold block">{c.lugar ? `📍 ${c.lugar}` : ''}{c.lugar && c.pistaReservada ? ' · ' : ''}{c.pistaReservada ? '🔒 pista reservada' : ''}</span>
                )}
              </div>
              <div className="shrink-0 text-right">
                <span className="text-[10px] font-bold text-stone-500 block">{esMia ? 'Organizas tú' : 'Organiza'}</span>
                {!esMia && <span className="text-[11px] font-black text-stone-800 block">{c.creadorNombre}</span>}
              </div>
            </div>

            {c.nota && <p className="text-[11px] text-stone-600 bg-stone-50 rounded-lg p-2">“{c.nota}”</p>}
            {deUnPartido && esMia && (c.retirados || []).length > 0 && (
              <span className="text-[10px] text-stone-400 block">Se ha caído: {(c.retirados || []).map(id => ((players.find(p => p.id === id) || {}).name || id).split(' ')[0]).join(', ')}</span>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {deUnPartido && (
                <button type="button" onClick={() => onAbrirPartido(c.partidoId)} className="text-[11px] font-bold text-[#2c4a66] underline">🎾 Ver el partido</button>
              )}
              {c.link && (
                <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-[#2c4a66] underline truncate">🔗 Ver reserva</a>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {Array.from({ length: c.plazas }).map((_, i) => {
                const r = asignados[i];
                return r ? (
                  <span key={i} className="inline-flex items-center gap-1 bg-[#eef4f0] border border-[#c7ddc9] rounded-full pr-2">
                    <UserAvatar name={r.nombre} photo={fotoDe(r.idJugador)} size="xs" />
                    <span className="text-[10px] font-bold text-[#2f5d50]">{(r.nombre || '').split(' ')[0]}</span>
                  </span>
                ) : (
                  <span key={i} className="w-7 h-7 rounded-full border-2 border-dashed border-stone-300 text-stone-300 text-[10px] font-black flex items-center justify-center">?</span>
                );
              })}
              <span className="text-[10px] font-black text-stone-500 ml-1">{asignados.length}/{c.plazas} confirmados</span>
              {totalDisp > 0 && <span className="text-[10px] font-bold text-stone-400">· {totalDisp} {totalDisp === 1 ? 'puede' : 'pueden'}</span>}
            </div>

            {convertida ? (
              <button onClick={() => onAbrirPartido(c.partidoId)} className="w-full py-2 bg-[#2f5d50] text-white font-bold text-xs rounded-xl">✅ Partido listo · Ver partido</button>
            ) : esMia ? (
              <div className="space-y-2">
                <div className="bg-stone-50 rounded-xl p-2.5 space-y-1.5">
                  <span className="text-[10px] font-black uppercase text-stone-500 block">Quién puede ({quienesPueden.length}) · tú decides quién entra</span>
                  {quienesPueden.length === 0 ? (
                    <span className="text-[11px] text-stone-400 block">Todavía nadie ha dicho que puede.</span>
                  ) : quienesPueden.map(r => (
                    <div key={r.idJugador} className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <UserAvatar name={r.nombre} photo={fotoDe(r.idJugador)} size="xs" />
                        <span className="text-[12px] font-bold text-stone-800 truncate">{r.nombre}</span>
                      </span>
                      <button
                        onClick={() => onAsignar(c, r.idJugador, !r.asignado)}
                        disabled={ocupado || (!r.asignado && completa)}
                        className={`shrink-0 px-3 py-1 rounded-lg text-[11px] font-black disabled:opacity-40 ${r.asignado ? 'bg-[#2f5d50] text-white' : 'bg-white border border-[#c7ddc9] text-[#2f5d50]'}`}
                      >
                        {r.asignado ? '✓ Confirmado · Quitar' : 'Confirmar'}
                      </button>
                    </div>
                  ))}
                  {nos.length > 0 && (
                    <span className="text-[10px] text-stone-400 block pt-0.5">No pueden: {nos.map(r => (r.nombre || '').split(' ')[0]).join(', ')}</span>
                  )}
                  {(c.vetados || []).length > 0 && (
                    <span className="text-[10px] text-stone-400 block">🚫 Vetados (no la ven): {(c.vetados || []).map(id => ((players.find(p => p.id === id) || {}).name || id).split(' ')[0]).join(', ')}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => onCancelar(c)} disabled={ocupado} className="py-2 bg-white border border-[#ead3bf] text-[#6b3f29] font-bold text-xs rounded-xl disabled:opacity-50">Cancelar propuesta</button>
                  <button onClick={() => (deUnPartido ? onAnadirAPartido(c) : onConvertir(c))} disabled={ocupado || asignados.length === 0} className="py-2 bg-[#2c4a66] text-white font-bold text-xs rounded-xl disabled:opacity-40">
                    {ocupado ? (deUnPartido ? 'Añadiendo…' : 'Creando…') : deUnPartido ? '➕ Añadir al partido' : (completa ? '🎾 Crear partido' : 'Crear con los confirmados')}
                  </button>
                </div>
                {asignados.length === 0 && <span className="text-[10px] text-stone-400 block">{deUnPartido ? 'Confirma al menos a una persona para poder añadirla al partido.' : 'Confirma al menos a una persona para poder crear el partido.'}</span>}
              </div>
            ) : (
              <div className="space-y-1.5">
                {miAsignado ? (
                  <div className="bg-[#eef4f0] border border-[#c7ddc9] text-[#2f5d50] rounded-xl p-2 text-[11px] font-black text-center">✅ {c.creadorNombre.split(' ')[0]} te ha confirmado</div>
                ) : mia && mia.respuesta === 'SI' ? (
                  <div className="bg-[#faf3e7] border border-[#efd9a9] text-[#6b4d1c] rounded-xl p-2 text-[11px] font-bold text-center">
                    Has dicho que puedes · {c.creadorNombre.split(' ')[0]} decidirá quién entra
                  </div>
                ) : completa && (
                  <div className="text-[10px] text-stone-400 text-center">Las plazas ya están asignadas, pero puedes quedar en reserva.</div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onResponder(c, 'SI')}
                    disabled={ocupado}
                    className={`py-2 font-bold text-xs rounded-xl transition disabled:opacity-40 ${mia && mia.respuesta === 'SI' ? 'bg-[#2f5d50] text-white' : 'bg-white border border-[#c7ddc9] text-[#2f5d50]'}`}
                  >
                    {mia && mia.respuesta === 'SI' ? '🙋 Puedo ✓' : '🙋 Puedo jugar'}
                  </button>
                  <button
                    onClick={() => onResponder(c, 'NO')}
                    disabled={ocupado}
                    className={`py-2 font-bold text-xs rounded-xl transition disabled:opacity-40 ${mia && mia.respuesta === 'NO' ? 'bg-stone-700 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}
                  >
                    {mia && mia.respuesta === 'NO' ? 'No puedo ✓' : 'No puedo'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      </>)}
    </div>
  );
}

// Botón estándar de "atrás": círculo blanco con chevron, legible sobre cualquier fondo (incluida la
// tierra batida). Se usa SIEMPRE en la misma posición (arriba a la izquierda) en todas las pantallas.
function BotonAtras({ onClick, titulo = 'Volver' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={titulo}
      title={titulo}
      className="w-10 h-10 shrink-0 rounded-full bg-white border border-stone-200 shadow-md text-[#2c4a66] hover:bg-[#eef2f6] active:scale-95 transition flex items-center justify-center"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="15 5 8 12 15 19" />
      </svg>
    </button>
  );
}

// Cabecera común de las pantallas secundarias: [← atrás] + título en una píldora legible.
function CabeceraPantalla({ onBack, titulo, tituloAtras }) {
  return (
    <div className="flex items-center gap-3">
      <BotonAtras onClick={onBack} titulo={tituloAtras} />
      <h2 className="text-sm font-black text-stone-800 bg-white/90 border border-stone-200 shadow-sm rounded-full px-3.5 py-1.5 min-w-0 truncate">
        {titulo}
      </h2>
    </div>
  );
}

// ============================================================================
// BOTÓN / GESTO "ATRÁS" DEL MÓVIL
// En vez de dejar que el atrás del móvil saque al usuario de la app, se mantiene una entrada de
// historial "centinela": cada vez que se pulsa atrás se intenta primero cerrar lo que haya encima
// (ventana, detalle de partido, pestaña secundaria → inicio). Solo en la pantalla raíz el primer
// atrás avisa ("Pulsa atrás otra vez para salir") y el segundo, en menos de 2 s, sale.
// manejadorAtrasRef lo rellena la app principal en cada render (devuelve true si cerró algo).
// ============================================================================
const manejadorAtrasRef = { current: null };

function GestorAtras() {
  const [aviso, setAviso] = useState(false);

  useEffect(() => {
    let armado = false;     // ya se avisó de "pulsa otra vez para salir"
    let saliendo = false;
    let timer = null;
    let oyentesActivos = false;

    const estaArmada = () => window.history.state && window.history.state.ctc === 'app';

    // Chrome salta las entradas de historial creadas sin interacción del usuario, así que el
    // centinela se crea en la primera pulsación/toque, no al cargar.
    const armarCentinela = () => {
      if (estaArmada()) return;
      try {
        window.history.replaceState({ ctc: 'raiz' }, '');
        window.history.pushState({ ctc: 'app' }, '');
      } catch { /* entornos sin History API */ }
    };

    const alInteractuar = () => {
      armarCentinela();
      quitarOyentesInteraccion();
    };
    const quitarOyentesInteraccion = () => {
      if (!oyentesActivos) return;
      oyentesActivos = false;
      window.removeEventListener('pointerdown', alInteractuar, true);
      window.removeEventListener('touchstart', alInteractuar, true);
      window.removeEventListener('keydown', alInteractuar, true);
    };

    if (estaArmada() || (navigator.userActivation && navigator.userActivation.hasBeenActive)) {
      armarCentinela();
    } else {
      oyentesActivos = true;
      window.addEventListener('pointerdown', alInteractuar, true);
      window.addEventListener('touchstart', alInteractuar, true);
      window.addEventListener('keydown', alInteractuar, true);
    }

    const alPop = () => {
      if (saliendo) return;
      if (estaArmada()) return; // movimiento hacia delante: se ignora
      if (!window.history.state || window.history.state.ctc !== 'raiz') return; // no es nuestra entrada

      let cerrado = false;
      try { cerrado = Boolean(manejadorAtrasRef.current && manejadorAtrasRef.current()); } catch { cerrado = false; }
      if (cerrado) {
        window.history.pushState({ ctc: 'app' }, '');
        return;
      }
      if (armado) {
        saliendo = true;
        clearTimeout(timer);
        setAviso(false);
        window.history.back(); // sale de la app (PWA) o vuelve a la página anterior del navegador
        return;
      }
      armado = true;
      setAviso(true);
      window.history.pushState({ ctc: 'app' }, '');
      timer = setTimeout(() => { armado = false; setAviso(false); }, 2000);
    };

    window.addEventListener('popstate', alPop);
    return () => {
      window.removeEventListener('popstate', alPop);
      quitarOyentesInteraccion();
      clearTimeout(timer);
    };
  }, []);

  if (!aviso) return null;
  return (
    <div className="fixed left-0 right-0 bottom-20 z-[9998] flex justify-center px-6 pointer-events-none" role="status" aria-live="polite">
      <div className="bg-stone-900/90 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-xl">
        Pulsa atrás otra vez para salir
      </div>
    </div>
  );
}

// NUEVO: pantalla de administración, solo visible para ADMIN_PLAYER_ID — reúne las dos tareas
// de control que pidió Marcos: (1) validar altas nuevas de Chicos/Chicas antes de que entren a
// la app, y (2) subir a un invitado de torneo al grupo real cuando corresponda, sin dejar que
// esa decisión dependa del propio invitado.
function AdminScreen({ onBack, pendingPlayers, promotableGroups, onApprove, onReject, onPromote, idsDuplicados = [] }) {
  return (
    <div className="space-y-5">
      <CabeceraPantalla onBack={onBack} titulo="🛡️ Administración" tituloAtras="Volver al inicio" />

      {idsDuplicados.length > 0 && (
        <div className="bg-[#fbf1e8] rounded-2xl border border-[#e3b894] p-4 space-y-2">
          <h3 className="text-sm font-black text-[#6b3f29]">⚠️ Ids repetidos en el Sheet</h3>
          <p className="text-[11px] text-[#6b3f29]">
            Hay registros distintos con el mismo id. Mientras no se corrija, una persona puede ver o modificar datos de otra. Revísalo en la hoja indicada (no se repara solo).
          </p>
          <ul className="text-[11px] text-stone-700 space-y-1">
            {idsDuplicados.slice(0, 12).map((d, i) => (
              <li key={`${d.hoja}-${d.id}-${i}`} className="bg-white rounded-lg border border-[#ead3bf] px-2.5 py-1.5">
                <span className="font-black">{d.hoja}</span> · id <span className="font-mono">{d.id}</span> · filas {Array.isArray(d.filas) ? d.filas.join(', ') : ''}
              </li>
            ))}
          </ul>
          {idsDuplicados.length > 12 && <p className="text-[10px] text-stone-500">…y {idsDuplicados.length - 12} más (ejecuta previsualizarIdsDuplicados en Apps Script).</p>}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
        <h3 className="text-sm font-black text-stone-800">Altas pendientes de validar</h3>
        {pendingPlayers.length === 0 ? (
          <p className="text-xs text-stone-400">No hay altas esperando validación.</p>
        ) : (
          <div className="space-y-2">
            {pendingPlayers.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 bg-stone-50 rounded-xl p-2.5 border border-stone-200">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-stone-800 truncate">{p.name}</p>
                  <p className="text-[10px] text-stone-500 uppercase font-bold">{p.group} {p.phone ? `· ${p.phone}` : ''}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => onApprove(p.id)} className="px-2.5 py-1.5 bg-[#2f5d50] text-white rounded-lg text-[11px] font-bold">Aprobar</button>
                  <button onClick={() => onReject(p.id)} className="px-2.5 py-1.5 bg-stone-200 text-stone-700 rounded-lg text-[11px] font-bold">Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
        <h3 className="text-sm font-black text-stone-800">Invitados de torneo → subir a Chicos/Chicas</h3>
        {promotableGroups.length === 0 ? (
          <p className="text-xs text-stone-400">No hay invitados de torneo pendientes de ascender.</p>
        ) : (
          <div className="space-y-4">
            {promotableGroups.map(g => (
              <div key={g.tournamentId}>
                <p className="text-[11px] font-black text-stone-500 uppercase mb-1.5">{g.tournamentName}</p>
                <div className="space-y-2">
                  {g.guests.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-2 bg-stone-50 rounded-xl p-2.5 border border-stone-200">
                      <p className="text-sm font-bold text-stone-800 truncate">{p.name}</p>
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => onPromote(p.id, p.name, 'chicos')} className="px-2.5 py-1.5 bg-[#2c4a66] text-white rounded-lg text-[11px] font-bold">A Chicos</button>
                        <button onClick={() => onPromote(p.id, p.name, 'chicas')} className="px-2.5 py-1.5 bg-[#4a3350] text-white rounded-lg text-[11px] font-bold">A Chicas</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AlertsScreen({ alerts, onBack, currentUser, apiUrl, alertPreferences, reservationAlerts, onRefreshAlertPrefs, onUpdateAlertPreferences, onUpdateReservationAlerts }) {
  // Orden pensado para dar protagonismo a lo importante: cabecera y estado de notificaciones en
  // dos filas compactas arriba; después tus pendientes por leer/hacer y, debajo, la
  // configuración de avisos del usuario, ambas con más aire que antes.
  return (
    <div className="space-y-3">
      <CabeceraPantalla onBack={onBack} titulo="🔔 Avisos" tituloAtras="Volver al inicio" />

      <div className="bg-gradient-to-r from-[#d9b97c] to-[#6b4d1c] rounded-2xl px-4 py-2.5 text-white shadow-sm flex items-center gap-2.5">
        <span className="text-xl shrink-0">🔔</span>
        <h2 className="text-base font-black flex-1 min-w-0">Tus pendientes</h2>
        <span className="text-[11px] font-black bg-white/25 px-2.5 py-1 rounded-full shrink-0">
          {alerts.length === 0 ? 'Todo al día 🎉' : `${alerts.length} ${alerts.length === 1 ? 'pendiente' : 'pendientes'}`}
        </span>
      </div>

      {currentUser && <PushNotificationsCard currentUser={currentUser} apiUrl={apiUrl} />}

      {alerts.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 text-center border border-stone-200">
          <p className="text-3xl mb-1">✅</p>
          <p className="text-sm font-bold text-stone-700">¡Estás al día! No tienes ninguna acción pendiente.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {alerts.map(a => (
            <button
              key={a.id}
              onClick={a.action}
              className="w-full text-left bg-white rounded-2xl p-4 border border-stone-200 shadow-xs hover:border-[#d9b97c] transition flex items-center gap-3"
            >
              <span className="text-3xl shrink-0">{a.icon}</span>
              <div className="min-w-0 flex-1">
                <span className="font-black text-stone-900 text-sm block">{a.title}</span>
                <span className="text-xs text-stone-500 block mt-0.5">{a.description}</span>
              </div>
              <span className="text-stone-300 text-xl shrink-0">→</span>
            </button>
          ))}
        </div>
      )}

      {currentUser && (
        <PushPreferencesCard
          currentUser={currentUser}
          apiUrl={apiUrl}
          alertPreferences={alertPreferences}
          reservationAlerts={reservationAlerts}
          onRefresh={onRefreshAlertPrefs}
          onUpdateAlertPreferences={onUpdateAlertPreferences}
          onUpdateReservationAlerts={onUpdateReservationAlerts}
        />
      )}
    </div>
  );
}

// MODAL DE PERFIL DE JUGADOR CON SUBPANEL INTERACTIVO Y DETALLE DE BOTE/PUNTOS
function UserProfileModal({ isOpen, onClose, user, matches, tournaments, allDinnerGuests, onPhotoUploaded, onUpdateUserData, isCurrentUser, isThursdayMember, viewerUser, onRequestClubJoin, onValidateClubRequest }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedStatCategory, setSelectedStatCategory] = useState(null);
  // NUEVO: qué "vista" de Partidos/Victorias/Derrotas/Éxito se muestra — Liga regular (el dato
  // de siempre, intacto), Amistosos y Torneos, o Todo combinado. Por defecto se queda en "liga"
  // para que a nadie le cambien los números que ya conocía al abrir el perfil.
  const [vistaPJ, setVistaPJ] = useState('liga');

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPlaytomic, setEditPlaytomic] = useState('');
  const [editIsLeftHanded, setEditIsLeftHanded] = useState(false);
  const [savingData, setSavingData] = useState(false);

  useEffect(() => {
    if (user) {
      setEditName(user.name || '');
      setEditPhone(user.phone || '');
      setEditPlaytomic(user.playtomic || '');
      setEditIsLeftHanded(Boolean(user.isLeftHanded));
      setEditing(false);
      setSelectedStatCategory(null);
      setVistaPJ('liga');
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const normUserName = normalizeName(user.name);

  // NUEVO (control de acceso del administrador): en qué torneos activos participa este
  // perfil, junto con su propia ficha de participante (que trae "solicitudClub" — ver
  // SOLICITAR_UNION_CLUB / VALIDAR_SOLICITUD_CLUB). Se usa para dos cosas distintas: que el
  // propio invitado pueda pedir pasar al club desde su perfil, y que el organizador de ESE
  // torneo (no el administrador) vea y valide esa petición cuando mire el perfil del invitado.
  const participacionesTorneo = (tournaments || [])
    .map(t => {
      const participante = (t.participants || []).find(p => p.id === user.id || normalizeName(p.name) === normUserName);
      return participante ? { tournament: t, participante } : null;
    })
    .filter(Boolean);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 200;
        let width = img.width;
        let height = img.height;
        if (width > height) { if (width > maxSize) { height *= maxSize / width; width = maxSize; } } 
        else { if (height > maxSize) { width *= maxSize / height; height = maxSize; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        onPhotoUploaded(user.id, canvas.toDataURL('image/jpeg', 0.82));
        setUploading(false);
      };
      img.src = readerEvent.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfileData = async (e) => {
    e.preventDefault();
    setSavingData(true);
    await onUpdateUserData(user.id, { nombre: editName, telefono: editPhone, playtomic: editPlaytomic, isLeftHanded: editIsLeftHanded });
    setSavingData(false);
    setEditing(false);
  };

  const statsCalculated = (() => {
    let playedList = [], wonList = [], lostList = [], dinnerYesList = [], dinnerNoList = [];
    // NUEVO (vistas Todo/Liga/Amistosos+Torneos): los amistosos antes no se listaban en ningún
    // sitio salvo a 0 puntos — ahora además se guardan en su propia lista, con la misma forma
    // que playedList/wonList/lostList, para poder sumarlos en la vista "Amistosos y Torneos"
    // sin tocar en absoluto playedList/wonList/lostList (que siguen siendo solo Liga regular,
    // exactamente igual que antes — "no debe modificar el dato actual").
    let friendliesList = [], friendliesWonList = [], friendliesLostList = [];
    let puntosDetalle = [], boteDetalle = [];
    const partnerStats = {}, rivalStats = {};

    // "química" cara a cara entre quien consulta (viewerUser) y el perfil que está viendo
    // (user) — solo tiene sentido cuando son dos personas distintas. A diferencia del resto
    // de estadísticas de liga, esta SÍ se calcula sobre partidos oficiales Y amistosos (ver
    // acumularQuimica más abajo).
    const normViewerName = viewerUser ? normalizeName(viewerUser.name) : null;
    const headToHead = (viewerUser && viewerUser.id !== user.id)
      ? { partnerPlayed: 0, partnerWon: 0, partnerLost: 0, rivalPlayed: 0, profileWonVsViewer: 0, viewerWonVsProfile: 0, recent: [] }
      : null;

    // Acumula química de parejas/rivales y el cara a cara entre quien consulta y el perfil.
    // A propósito se llama tanto para partidos oficiales como amistosos (a diferencia de
    // playedList/puntosDetalle/boteDetalle, que siguen siendo solo liga oficial): esto habla
    // de con quién/contra quién rindes jugando, no de la clasificación de la liga, así que
    // cuantos más partidos entren, más fiable es el dato — no hay razón para descartar un
    // amistoso aquí solo porque no puntúe.
    const acumularQuimica = (m, mySlot) => {
      const playersArr = m.players || [];
      // Si el partido es antiguo y no tiene 'team', deduce que los 2 primeros son el equipo 1
      const myTeam = mySlot.team !== undefined ? Number(mySlot.team) : (playersArr.indexOf(mySlot) < 2 ? 1 : 2);

      playersArr.forEach((p, idx) => {
        if (normalizeName(p.name) === normUserName) return;
        const pTeam = p.team !== undefined ? Number(p.team) : (idx < 2 ? 1 : 2);

        if (pTeam === myTeam) {
          if (!partnerStats[p.name]) partnerStats[p.name] = { played: 0, won: 0, lost: 0 };
          partnerStats[p.name].played++;
          if (mySlot.won === 'SI') partnerStats[p.name].won++; else partnerStats[p.name].lost++;
        } else {
          if (!rivalStats[p.name]) rivalStats[p.name] = { played: 0, wonAgainst: 0, lostAgainst: 0 };
          rivalStats[p.name].played++;
          if (mySlot.won === 'SI') rivalStats[p.name].wonAgainst++; else rivalStats[p.name].lostAgainst++;
        }

        // Si este compañero/rival de la pista es justo quien está consultando el perfil,
        // acumulamos también el cara a cara específico entre los dos.
        if (headToHead && (p.id === viewerUser.id || normalizeName(p.name) === normViewerName)) {
          if (pTeam === myTeam) {
            headToHead.partnerPlayed++;
            if (mySlot.won === 'SI') headToHead.partnerWon++; else headToHead.partnerLost++;
            headToHead.recent.push({ date: m.date, fechaISO: m.fechaISO, tipo: 'pareja', ganaron: mySlot.won === 'SI' });
          } else {
            headToHead.rivalPlayed++;
            if (mySlot.won === 'SI') headToHead.profileWonVsViewer++; else headToHead.viewerWonVsProfile++;
            headToHead.recent.push({ date: m.date, fechaISO: m.fechaISO, tipo: 'rival', ganaProfile: mySlot.won === 'SI' });
          }
        }
      });
    };

    matches.forEach(m => {
      if (m.status !== 'FINALIZADO') return;

      const mySlot = (m.players || []).find(p => p.id === user.id || normalizeName(p.name) === normUserName);
      if (!mySlot) return;

      const partner = (m.players || []).find(p => p.team === mySlot.team && normalizeName(p.name) !== normUserName)?.name || 'Compañero';
      const rivals = (m.players || []).filter(p => p.team !== mySlot.team).map(p => p.name).join(' & ') || 'Rivales';

      if (!isMatchOfficial(m)) {
        // Los amistosos no cuentan para PJ/liga ni puntúan (eso sigue igual: puntosDetalle y
        // boteDetalle se quedan a 0, no computan para el bote ni los puntos híbridos), pero sí
        // entran en la química de parejas/rivales de arriba Y ahora también en friendliesList,
        // para que la vista "Amistosos y Torneos" pueda mostrar sus propios PJ/V/D.
        acumularQuimica(m, mySlot);
        const friendlyDetail = {
          id: m.id, date: m.date, fechaISO: m.fechaISO, location: m.location || 'Club', score: m.score || 'Finalizado',
          myTeam: mySlot.team, won: mySlot.won === 'SI', dinner: mySlot.dinner, partner, rivals, esAmistoso: true
        };
        friendliesList.push(friendlyDetail);
        if (friendlyDetail.won) friendliesWonList.push(friendlyDetail); else friendliesLostList.push(friendlyDetail);
        puntosDetalle.push({ date: m.date, fechaISO: m.fechaISO, title: `Partido vs ${rivals} (amistoso)`, pts: 0, desc: 'Amistoso — no computa para la liga' });
        boteDetalle.push({ date: m.date, fechaISO: m.fechaISO, title: `Partido vs ${rivals} (amistoso)`, bote: 0, desc: 'Amistoso — no computa para la liga' });
        return;
      }

      const matchDetail = {
        id: m.id, date: m.date, fechaISO: m.fechaISO, location: m.location || 'Club', score: m.score || 'Finalizado',
        myTeam: mySlot.team, won: mySlot.won === 'SI', dinner: mySlot.dinner, partner, rivals
      };

      playedList.push(matchDetail);
      if (mySlot.won === 'SI') wonList.push(matchDetail); else lostList.push(matchDetail);

      let matchPts = 0, matchBote = 0;
      let breakdownPts = [], breakdownBote = [];

      // Deportivo
      if (mySlot.won === 'SI') {
        matchPts += 5; breakdownPts.push('Victoria (+5)');
      } else {
        matchBote += 1; breakdownBote.push('Derrota (+1€)');
      }

      // Jugar (Barandas)
      matchPts += 1; breakdownPts.push('Jugar (+1)');

      // Cena (Barandas) — igual que en el backend (doGet), una cena solo "cuenta" de verdad a
      // partir de las 09:00 del día siguiente. Antes de ese corte, aunque ya hayas marcado si
      // te quedas o no, no se suma ni a la lista de Cenas/Rajadas ni a los puntos — así el
      // detalle de tu perfil no te da ya por "ganados" puntos que el ranking todavía no cuenta.
      const cenaDeEstePartidoComputable = esCenaComputable(m.date, m.fechaISO);
      if (mySlot.dinner === 'SI') {
        if (cenaDeEstePartidoComputable) {
          dinnerYesList.push(matchDetail);
          matchPts += 5; breakdownPts.push('Cena (+5)');
        } else {
          breakdownPts.push('Cena (aún no computa)');
        }
      } else if (mySlot.dinner === 'NO') {
        if (cenaDeEstePartidoComputable) {
          dinnerNoList.push(matchDetail);
          matchPts -= 1; breakdownPts.push('Rajada (-1)');
          matchBote += 1; breakdownBote.push('Rajada (+1€)');
        } else {
          breakdownPts.push('Rajada (aún no computa)');
        }
      } else if (mySlot.dinner === 'UNA') {
        // "Me tomo una": ni suma ni resta puntos, ni genera bote, y no es una rajada.
        breakdownPts.push('Te tomas una (0)');
      } else if (mySlot.dinner === 'PENDIENTE') {
        breakdownPts.push('Cena Pendiente (0)');
      }

      puntosDetalle.push({ date: m.date, fechaISO: m.fechaISO, title: `Partido vs ${rivals}`, pts: matchPts, desc: breakdownPts.join(' | ') });
      if (matchBote > 0) {
        boteDetalle.push({ date: m.date, fechaISO: m.fechaISO, title: `Partido vs ${rivals}`, bote: matchBote, desc: breakdownBote.join(' | ') });
      }

      acumularQuimica(m, mySlot);
    });

    // Añadir las cenas sin partido al listado visual y al historial de puntos — con la misma
    // regla de las 09:00 del día siguiente: una cena sin partido futura (o de esta misma noche,
    // antes de esa hora) a la que ya estés apuntado no debe aparecer todavía como "ganada".
    (allDinnerGuests || []).forEach(g => {
      // COMPROBAMOS TAMBIÉN POR ID
      if (g.id === user.id || normalizeName(g.name) === normUserName) {
        const cleanDate = extractCleanDate(g.target || g.cleanTarget);
        if (cleanDate === 'sin fecha' || !esCenaComputable(cleanDate)) return;

        // Evitar duplicar si ya se ha sumado una cena ese mismo día por partido
        const yaTieneCenaEseDia = dinnerYesList.some(d => extractCleanDate(d.date, d.fechaISO) === cleanDate);

        if (!yaTieneCenaEseDia) {
          dinnerYesList.push({
            date: etiquetaFechaDia(cleanDate), fechaISO: cleanDate, partner: 'Solo Cena', rivals: '-', score: '-', dinner: 'SI', won: false
          });
          puntosDetalle.push({
            date: etiquetaFechaDia(cleanDate), fechaISO: cleanDate, title: 'Asistencia 3º Tiempo (Sin jugar)', pts: 5, desc: 'Solo Cena (+5)'
          });
        }
      }
    });

    // ORDENACIÓN CRONOLÓGICA (Reemplazamos el puntosDetalle.reverse() estático)
    const sortByDate = (a, b) => {
      const dateA = parseMatchDateObject(a.date, a.fechaISO) || new Date(0);
      const dateB = parseMatchDateObject(b.date, b.fechaISO) || new Date(0);
      return dateB - dateA; // Más recientes primero
    };
    
    puntosDetalle.sort(sortByDate);
    boteDetalle.sort(sortByDate);
    playedList.sort(sortByDate);
    friendliesList.sort(sortByDate);

// Análisis de química
    let bestPartner = null, worstPartner = null;
    let easiestRival = null, hardestRival = null;

    Object.entries(partnerStats).forEach(([name, st]) => {
      if (st.played >= 1) {
        const winRate = (st.won / st.played) * 100;
        const lossRate = (st.lost / st.played) * 100;
        
        // Solo asigna mejor pareja si hay al menos 1 victoria
        if (st.won > 0 && (!bestPartner || winRate > bestPartner.winRate)) {
          bestPartner = { name, winRate, pct: winRate.toFixed(0), ...st };
        }
        // Solo asigna pareja complicada si hay al menos 1 derrota
        if (st.lost > 0 && (!worstPartner || lossRate > worstPartner.lossRate)) {
          worstPartner = { name, lossRate, pct: lossRate.toFixed(0), ...st };
        }
      }
    });

    Object.entries(rivalStats).forEach(([name, st]) => {
      if (st.played >= 1) {
        const winRate = (st.wonAgainst / st.played) * 100;
        const lossRate = (st.lostAgainst / st.played) * 100;
        
        // Solo asigna rival fetiche si hay al menos 1 victoria contra él
        if (st.wonAgainst > 0 && (!easiestRival || winRate > easiestRival.winRate)) {
          easiestRival = { name, winRate, pct: winRate.toFixed(0), ...st };
        }
        // Solo asigna rival duro si hay al menos 1 derrota contra él
        if (st.lostAgainst > 0 && (!hardestRival || lossRate > hardestRival.lossRate)) {
          hardestRival = { name, lossRate, pct: lossRate.toFixed(0), ...st };
        }
      }
    });

    return {
      playedList, wonList, lostList, dinnerYesList, dinnerNoList, puntosDetalle, boteDetalle,
      friendliesList, friendliesWonList, friendliesLostList,
      played: playedList.length,
      won: wonList.length,
      lost: lostList.length,
      winRate: playedList.length > 0 ? ((wonList.length / playedList.length) * 100).toFixed(0) : 0,
      bestPartner, worstPartner, easiestRival, hardestRival,
      headToHead
    };
  })();

  // NUEVO: Racha de victorias actual + partidos y victorias por mes (Paso 4).
  const streakAndTrend = (() => {
    // Racha: partidos oficiales consecutivos ganados, empezando por el más reciente.
    // playedList ya viene ordenado de más reciente a más antiguo.
    let winStreak = 0;
    for (const m of statsCalculated.playedList) {
      if (m.partner === 'Solo Cena') continue; // las cenas sueltas no cuentan como partido
      if (m.won) winStreak++;
      else break;
    }

    // Partidos y victorias por mes (últimos 6 meses), combinando Liga regular + Amistosos + Torneos
    // (a petición explícita: "más que en puntos lo enfocaría a victorias y partidos por mes" +
    // "Liga + torneos"). Cada "cubo" de mes cuenta partidos jugados y ganados.
    const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const now = new Date();
    const monthKeyOf = (y, m) => `${y}-${m}`;
    const monthMap = {};
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKeyOf(d.getFullYear(), d.getMonth());
      const bucket = { key, month: MESES_CORTOS[d.getMonth()], played: 0, won: 0 };
      monthMap[key] = bucket;
      monthlyTrend.push(bucket);
    }

    // Liga regular: cada partido jugado (playedList) trae su resultado y fecha en texto
    // (formato "15 oct", parseado por parseMatchDateObject).
    statsCalculated.playedList.forEach(m => {
      if (m.partner === 'Solo Cena') return; // las cenas sueltas no cuentan como partido
      const d = parseMatchDateObject(m.date, m.fechaISO);
      if (!d) return;
      const bucket = monthMap[monthKeyOf(d.getFullYear(), d.getMonth())];
      if (!bucket) return;
      bucket.played++;
      if (m.won) bucket.won++;
    });

    // Amistosos: también cuentan en el gráfico (partidos y victorias, no puntos de liga).
    statsCalculated.friendliesList.forEach(m => {
      const d = parseMatchDateObject(m.date, m.fechaISO);
      if (!d) return;
      const bucket = monthMap[monthKeyOf(d.getFullYear(), d.getMonth())];
      if (!bucket) return;
      bucket.played++;
      if (m.won) bucket.won++;
    });

    // Torneos: recorremos los partidos FINALIZADO de los torneos en los que participa el jugador.
    // Las fechas de los partidos de torneo no se guardan individualmente, así que usamos la fecha
    // de inicio del torneo (t.startDate, formato ISO de <input type="date">) para ubicar el mes.
    (tournaments || []).forEach(t => {
      const isParticipant = (t.participants || []).some(
        p => p.id === user.id || normalizeName(p.name) === normUserName
      );
      if (!isParticipant) return;

      const tDateObj = t.startDate ? new Date(`${t.startDate}T${t.startTime || '00:00'}`) : null;
      if (!tDateObj || isNaN(tDateObj.getTime())) return;
      const bucket = monthMap[monthKeyOf(tDateObj.getFullYear(), tDateObj.getMonth())];
      if (!bucket) return;

      (t.rounds || []).forEach(r => {
        (r.matches || []).forEach(m => {
          if (m.status !== 'FINALIZADO') return;
          let inT1, inT2;
          if ((m.team1Ids && m.team1Ids.length) || (m.team2Ids && m.team2Ids.length)) {
            inT1 = (m.team1Ids || []).includes(user.id);
            inT2 = (m.team2Ids || []).includes(user.id);
          } else {
            const myFirstName = normUserName.split(' ')[0];
            inT1 = myFirstName && normalizeName(m.team1 || '').split(' ').includes(myFirstName);
            inT2 = myFirstName && normalizeName(m.team2 || '').split(' ').includes(myFirstName);
          }
          if (!inT1 && !inT2) return;
          const won = (inT1 && m.winner === 1) || (inT2 && m.winner === 2);
          bucket.played++;
          if (won) bucket.won++;
        });
      });
    });

    return { winStreak, monthlyTrend };
  })();

  const tournamentStats = (() => {
    let tList = [];
    const modeStats = {
      pozo: { played: 0, won: 0, name: 'Pozo Continuo' },
      americano: { played: 0, won: 0, name: 'Americano' },
      eliminatorio: { played: 0, won: 0, name: 'Fase de Grupos + Elim' },
      equipos: { played: 0, won: 0, name: 'Ryder Cup por Equipos' }
    };

    (tournaments || []).forEach(t => {
      const isParticipant = (t.participants || []).some(
        p => p.id === user.id || normalizeName(p.name) === normUserName
      );
      if (!isParticipant) return;

      const tMode = (t.mode || 'pozo').toLowerCase();
      // Los torneos no guardan la fecha de cada partido suelto, solo la fecha de inicio del
      // torneo — misma aproximación que ya usa streakAndTrend más abajo para el gráfico mensual.
      // Se usa aquí solo para poder ordenar cronológicamente al mezclar con amistosos en la
      // vista "Amistosos y Torneos".
      const tFechaObj = t.startDate ? new Date(`${t.startDate}T${t.startTime || '00:00'}`) : null;
      const tFecha = tFechaObj && !isNaN(tFechaObj.getTime()) ? tFechaObj : null;

      (t.rounds || []).forEach(r => {
        (r.matches || []).forEach(m => {
          if (m.status !== 'FINALIZADO') return;
          // m.team1/m.team2 solo llevan el primer nombre de cada jugador; comparar contra el
          // nombre completo casi nunca coincidía. Usamos IDs si el partido los tiene, y si no
          // (torneos antiguos) comparamos por primer nombre como aproximación.
          let inT1, inT2;
          if ((m.team1Ids && m.team1Ids.length) || (m.team2Ids && m.team2Ids.length)) {
            inT1 = (m.team1Ids || []).includes(user.id);
            inT2 = (m.team2Ids || []).includes(user.id);
          } else {
            const myFirstName = normUserName.split(' ')[0];
            inT1 = myFirstName && normalizeName(m.team1 || '').split(' ').includes(myFirstName);
            inT2 = myFirstName && normalizeName(m.team2 || '').split(' ').includes(myFirstName);
          }
          if (inT1 || inT2) {
            const won = (inT1 && m.winner === 1) || (inT2 && m.winner === 2);
            tList.push({
              tournamentName: t.name,
              court: m.court,
              team1: m.team1,
              team2: m.team2,
              score: m.score || 'Finalizado',
              won,
              fecha: tFecha
            });

            if (modeStats[tMode]) {
              modeStats[tMode].played++;
              if (won) modeStats[tMode].won++;
            }
          }
        });
      });
    });

    let bestMode = null, bestWinRate = -1;
    let worstMode = null, worstWinRate = 101;

    Object.entries(modeStats).forEach(([key, st]) => {
      if (st.played > 0) {
        const rate = (st.won / st.played) * 100;
        if (rate > bestWinRate) {
          bestWinRate = rate;
          bestMode = { key, ...st, winRate: rate.toFixed(0) };
        }
        if (rate < worstWinRate) {
          worstWinRate = rate;
          worstMode = { key, ...st, winRate: rate.toFixed(0) };
        }
      }
    });

    return {
      tList,
      tPlayed: tList.length,
      tWon: tList.filter(x => x.won).length,
      tLost: tList.filter(x => !x.won).length,
      bestMode,
      worstMode
    };
  })();

  // NUEVO: las 3 vistas del bloque Partidos/Victorias/Derrotas/Éxito que pidió Marcos. "Liga"
  // es exactamente statsCalculated de siempre (sin tocar). "Amistosos" suma amistosos + partidos
  // de torneo. "Todo" es la suma de las dos. Cada vista lleva también su propia lista ordenada
  // cronológicamente para el subpanel de detalle (mezclando partidos de liga/amistoso, que
  // llevan fecha en texto, con partidos de torneo, que llevan "fecha" como objeto Date).
  const vistasPJ = (() => {
    const fechaDeItem = (item) => (item.fecha !== undefined ? item.fecha : parseMatchDateObject(item.date, item.fechaISO));
    const mergeOrdenado = (...listas) => [].concat(...listas).sort((a, b) => {
      const da = fechaDeItem(a) || new Date(0);
      const db = fechaDeItem(b) || new Date(0);
      return db - da;
    });

    const liga = {
      played: statsCalculated.played, won: statsCalculated.won, lost: statsCalculated.lost,
      winRate: statsCalculated.winRate,
      playedList: statsCalculated.playedList, wonList: statsCalculated.wonList, lostList: statsCalculated.lostList
    };

    const amistososTorneos = (() => {
      const played = statsCalculated.friendliesList.length + tournamentStats.tPlayed;
      const won = statsCalculated.friendliesWonList.length + tournamentStats.tWon;
      const lost = statsCalculated.friendliesLostList.length + tournamentStats.tLost;
      return {
        played, won, lost,
        winRate: played > 0 ? ((won / played) * 100).toFixed(0) : 0,
        playedList: mergeOrdenado(statsCalculated.friendliesList, tournamentStats.tList),
        wonList: mergeOrdenado(statsCalculated.friendliesWonList, tournamentStats.tList.filter(x => x.won)),
        lostList: mergeOrdenado(statsCalculated.friendliesLostList, tournamentStats.tList.filter(x => !x.won))
      };
    })();

    const todo = {
      played: liga.played + amistososTorneos.played,
      won: liga.won + amistososTorneos.won,
      lost: liga.lost + amistososTorneos.lost,
      winRate: (liga.played + amistososTorneos.played) > 0
        ? (((liga.won + amistososTorneos.won) / (liga.played + amistososTorneos.played)) * 100).toFixed(0)
        : 0,
      playedList: mergeOrdenado(liga.playedList, amistososTorneos.playedList),
      wonList: mergeOrdenado(liga.wonList, amistososTorneos.wonList),
      lostList: mergeOrdenado(liga.lostList, amistososTorneos.lostList)
    };

    return { liga, amistosos: amistososTorneos, todo };
  })();

  const vistaPJActual = vistasPJ[vistaPJ === 'amistosos' ? 'amistosos' : vistaPJ === 'todo' ? 'todo' : 'liga'];
  const etiquetaVistaPJ = vistaPJ === 'amistosos' ? ' (Amistosos y Torneos)' : vistaPJ === 'todo' ? ' (Todo)' : ' (Liga)';

  const getDetailTitle = () => {
    switch(selectedStatCategory) {
      case 'pj': return `Partidos Jugados${etiquetaVistaPJ}`;
      case 'victorias': return `Victorias${etiquetaVistaPJ}`;
      case 'derrotas': return `Derrotas${etiquetaVistaPJ}`;
      case 'cenas': return 'Cenas Asistidas 🍻';
      case 'rajadas': return 'Rajadas de Cena 🏃‍♂️';
      case 'torneos': return 'Partidos en Torneos';
      case 'puntos': return 'Historial de Puntos Híbridos 🏅';
      case 'bote': return 'Desglose del Bote 💶';
      default: return '';
    }
  };

  const getDetailItems = () => {
    switch(selectedStatCategory) {
      case 'pj': return vistaPJActual.playedList;
      case 'victorias': return vistaPJActual.wonList;
      case 'derrotas': return vistaPJActual.lostList;
      case 'cenas': return statsCalculated.dinnerYesList;
      case 'rajadas': return statsCalculated.dinnerNoList;
      case 'torneos': return tournamentStats.tList;
      case 'puntos': return statsCalculated.puntosDetalle;
      case 'bote': return statsCalculated.boteDetalle;
      default: return [];
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full max-h-[90vh] overflow-y-auto p-5 shadow-2xl text-left space-y-4">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <div className={`relative ${isCurrentUser ? 'group cursor-pointer' : ''}`} onClick={() => isCurrentUser && fileInputRef.current && fileInputRef.current.click()}>
              <UserAvatar name={user.name} photo={user.photo} size="lg" />
              {isCurrentUser && (
                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-white text-xs font-bold">
                  📷
                </div>
              )}
              {isCurrentUser && <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileChange} />}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-base font-black text-stone-900">{user.name}</h3>
                {user.isLeftHanded && (
                  <span className="text-[9px] bg-[#eef2f6] text-[#2c4a66] font-extrabold px-1.5 py-0.5 rounded-full border border-[#9fb4c7]">
                    👈 Zurdo
                  </span>
                )}
              </div>
              <p className="text-xs text-[#2c4a66] font-bold">{user.titulo}</p>
              {isCurrentUser && (
                <div className="flex gap-2 mt-0.5">
                  <button
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    disabled={uploading}
                    className="text-[10px] text-stone-500 underline font-semibold hover:text-[#2c4a66]"
                  >
                    {uploading ? 'Guardando foto...' : 'Cambiar foto'}
                  </button>
                  <button
                    onClick={() => setEditing(!editing)}
                    className="text-[10px] text-[#2c4a66] underline font-semibold"
                  >
                    {editing ? 'Cancelar edición' : '✏️ Editar mis datos'}
                  </button>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-2xl font-bold">&times;</button>
        </div>

        {isCurrentUser && editing && (
          <form onSubmit={handleSaveProfileData} className="bg-stone-50 p-3 rounded-2xl border border-stone-200 space-y-2 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-stone-600 mb-0.5">Nombre completo</label>
              <input
                type="text"
                required
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full bg-white border border-stone-300 rounded-xl p-2 font-semibold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-600 mb-0.5">Teléfono móvil (WhatsApp)</label>
              <input
                type="tel"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                placeholder="Ej: 600123456"
                className="w-full bg-white border border-stone-300 rounded-xl p-2 font-semibold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-600 mb-0.5">Mano de Juego</label>
              <label className="flex items-center gap-2 bg-white border border-stone-300 rounded-xl p-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editIsLeftHanded}
                  onChange={e => setEditIsLeftHanded(e.target.checked)}
                  className="w-4 h-4 text-[#2c4a66] rounded accent-[#2c4a66]"
                />
                <span className="font-bold text-xs text-stone-800">Soy jugador Zurdo 👈</span>
              </label>
            </div>
            {/* BUG CORREGIDO (control de acceso del administrador): este selector dejaba que
                cualquiera, incluido un invitado de torneo, se cambiara a sí mismo a "Chicos"
                con efecto inmediato y sin que nadie lo validara — justo la "decisión abierta"
                que Marcos pidió eliminar. El grupo ya no se edita aquí nunca: solo se muestra
                (debajo, fuera de este formulario) y solo cambia por la vía que corresponda —
                aprobación del administrador o ascenso desde el torneo. */}
            <div>
              <label className="block text-[10px] font-bold text-stone-600 mb-0.5">Usuario de Playtomic</label>
              <input
                type="text"
                value={editPlaytomic}
                onChange={e => setEditPlaytomic(e.target.value)}
                placeholder="Ej: marcos-padel"
                className="w-full bg-white border border-stone-300 rounded-xl p-2 font-semibold"
              />
            </div>
            <button
              type="submit"
              disabled={savingData}
              className="w-full py-2 bg-[#2c4a66] text-white rounded-xl font-bold shadow-xs transition"
            >
              {savingData ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </form>
        )}

        {/* NUEVO (control de acceso del administrador): aquí vive TODO lo relacionado con pasar
            de invitado de torneo al grupo real — nunca como una elección libre del invitado.
            Dos vistas distintas del mismo dato (participante.solicitudClub), según quién mira
            este perfil:
            1. El propio invitado (isCurrentUser, grupo 'torneo'): puede solicitarlo, y ve el
               estado de su solicitud en cada torneo donde participa.
            2. El organizador de ESE torneo (viewerUser.id === creatorId o co-organizador),
               mirando el perfil de un invitado con una solicitud pendiente: la valida o la
               rechaza. Solo entonces (y solo después) le llega el aviso al administrador para
               que la ejecute de verdad — ver PROMOVER_JUGADOR_GRUPO en el menú de Administración. */}
        {isCurrentUser && user.group === 'torneo' && participacionesTorneo.length > 0 && (
          <div className="bg-[#f2eef2] border border-[#b893ba]/40 rounded-2xl p-3 space-y-2">
            <p className="text-[11px] font-black text-[#4a3350] uppercase tracking-wide">Unirme al club</p>
            {participacionesTorneo.map(({ tournament, participante }) => (
              <div key={tournament.id} className="flex items-center justify-between gap-2">
                <p className="text-xs text-stone-700 flex-1">
                  {participante.solicitudClub === 'VALIDADO'
                    ? `✅ Validado por el organizador de "${tournament.name}" — el administrador confirmará tu alta en breve.`
                    : participante.solicitudClub === 'SOLICITADO'
                    ? `⏳ Solicitud enviada en "${tournament.name}", pendiente de que el organizador la valide.`
                    : `¿Quieres entrar en Chicos/Chicas? Pídelo desde "${tournament.name}".`}
                </p>
                {!participante.solicitudClub && onRequestClubJoin && (
                  <button
                    onClick={() => onRequestClubJoin(tournament.id, user.id)}
                    className="shrink-0 px-2.5 py-1.5 bg-[#4a3350] text-white rounded-lg text-[11px] font-bold"
                  >
                    Solicitar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {viewerUser && onValidateClubRequest && participacionesTorneo.some(({ tournament, participante }) =>
          participante.solicitudClub === 'SOLICITADO' &&
          (tournament.creatorId === viewerUser.id || (tournament.coOrganizerIds || []).includes(viewerUser.id))
        ) && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 space-y-2">
            <p className="text-[11px] font-black text-amber-800 uppercase tracking-wide">Solicitud para unirse al club</p>
            {participacionesTorneo
              .filter(({ tournament, participante }) =>
                participante.solicitudClub === 'SOLICITADO' &&
                (tournament.creatorId === viewerUser.id || (tournament.coOrganizerIds || []).includes(viewerUser.id))
              )
              .map(({ tournament }) => (
                <div key={tournament.id} className="space-y-1.5">
                  <p className="text-xs text-stone-700">
                    {user.name} quiere unirse a Chicos/Chicas · Torneo "{tournament.name}"
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onValidateClubRequest(tournament.id, user.id, true)}
                      className="flex-1 py-1.5 bg-[#2f5d50] text-white rounded-lg text-[11px] font-bold"
                    >
                      Validar
                    </button>
                    <button
                      onClick={() => onValidateClubRequest(tournament.id, user.id, false)}
                      className="flex-1 py-1.5 bg-stone-200 text-stone-700 rounded-lg text-[11px] font-bold"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {isThursdayMember && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black text-stone-400 uppercase tracking-wider block">
                Partidos, Victorias y Derrotas
              </span>
            </div>

            {/* NUEVO: selector de vista — Liga regular es el dato de siempre, sin tocar; las
                otras dos suman amistosos y/o torneos, a petición de Marcos ("una visión de
                todo, una visión de liga regular y una visión de amistosos y torneos"). */}
            <div className="flex bg-stone-100 p-0.5 rounded-xl text-[9.5px] font-bold">
              {[
                { key: 'liga', label: 'Liga regular' },
                { key: 'amistosos', label: 'Amistosos y Torneos' },
                { key: 'todo', label: 'Todo' }
              ].map(v => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => { setVistaPJ(v.key); setSelectedStatCategory(null); }}
                  className={`flex-1 py-1.5 rounded-lg transition ${vistaPJ === v.key ? 'bg-white shadow-xs text-stone-900' : 'text-stone-500 hover:text-stone-700'}`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <button
                type="button"
                onClick={() => setSelectedStatCategory(selectedStatCategory === 'pj' ? null : 'pj')}
                className={`border rounded-xl p-2 transition ${selectedStatCategory === 'pj' ? 'bg-[#2c4a66] text-white border-[#2c4a66]' : 'bg-stone-50 border-stone-200 hover:bg-stone-100'}`}
              >
                <span className="text-base font-black block">{vistaPJActual.played}</span>
                <span className="text-[9px] uppercase font-bold opacity-80">PJ</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedStatCategory(selectedStatCategory === 'victorias' ? null : 'victorias')}
                className={`border rounded-xl p-2 transition ${selectedStatCategory === 'victorias' ? 'bg-[#2f5d50] text-white border-[#2f5d50]' : 'bg-[#eef4f0] border-[#c7ddc9] text-[#2f5d50] hover:bg-[#eef4f0]'}`}
              >
                <span className="text-base font-black block">{vistaPJActual.won}</span>
                <span className="text-[9px] uppercase font-bold opacity-80">Ganados</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedStatCategory(selectedStatCategory === 'derrotas' ? null : 'derrotas')}
                className={`border rounded-xl p-2 transition ${selectedStatCategory === 'derrotas' ? 'bg-[#6b3f29] text-white border-[#6b3f29]' : 'bg-[#f6ede6] border-[#ead3bf] text-[#6b3f29] hover:bg-[#f6ede6]'}`}
              >
                <span className="text-base font-black block">{vistaPJActual.lost}</span>
                <span className="text-[9px] uppercase font-bold opacity-80">Perdidos</span>
              </button>

              <div className="bg-[#eef2f6] border border-[#c3d3e0] rounded-xl p-2 text-[#2c4a66]">
                <span className="text-base font-black block">{vistaPJActual.winRate}%</span>
                <span className="text-[9px] uppercase font-bold opacity-80">% Éxito</span>
              </div>
            </div>

            <span className="text-[10px] font-black text-stone-400 uppercase tracking-wider block pt-1">
              Cenas y Rajadas (Liga Regular)
            </span>
            <div className="grid grid-cols-2 gap-2 text-center pt-1">
              <button
                type="button"
                onClick={() => setSelectedStatCategory(selectedStatCategory === 'cenas' ? null : 'cenas')}
                className={`border rounded-xl p-2.5 transition ${selectedStatCategory === 'cenas' ? 'bg-[#6b4d1c] text-white border-[#6b4d1c]' : 'bg-[#faf3e7] border-[#efd9a9] text-[#6b4d1c] hover:bg-[#faf3e7]'}`}
              >
                <span className="text-base font-black block">{statsCalculated.dinnerYesList.length}</span>
                <span className="text-[10px] font-bold uppercase">Cenas 🍻</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedStatCategory(selectedStatCategory === 'rajadas' ? null : 'rajadas')}
                className={`border rounded-xl p-2.5 transition ${selectedStatCategory === 'rajadas' ? 'bg-[#4a3350] text-white border-[#4a3350]' : 'bg-[#f2eef2] border-[#ddc9de] text-[#4a3350] hover:bg-[#f2eef2]'}`}
              >
                <span className="text-base font-black block">{statsCalculated.dinnerNoList.length}</span>
                <span className="text-[10px] font-bold uppercase">Rajadas 🏃‍♂️</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center pt-2">
              <button onClick={() => setSelectedStatCategory(selectedStatCategory === 'puntos' ? null : 'puntos')} className={`border rounded-xl p-2.5 transition flex flex-col items-center justify-center ${selectedStatCategory === 'puntos' ? 'bg-[#2c4a66] text-white border-[#2c4a66]' : 'bg-stone-900 text-white border-stone-700 hover:bg-stone-800'}`}>
                <span className="text-lg font-black block text-[#9fb4c7]">{user.hibrido || 0} pts</span>
                <span className="text-[10px] font-bold uppercase">Historial Puntos 🏅</span>
              </button>
              <button onClick={() => setSelectedStatCategory(selectedStatCategory === 'bote' ? null : 'bote')} className={`border rounded-xl p-2.5 transition flex flex-col items-center justify-center ${selectedStatCategory === 'bote' ? 'bg-[#6b3f29] text-white border-[#6b3f29]' : 'bg-stone-900 text-white border-stone-700 hover:bg-stone-800'}`}>
                <span className="text-lg font-black block text-[#d9a582]">{user.deuda || 0} €</span>
                <span className="text-[10px] font-bold uppercase">Desglose Bote 💶</span>
              </button>
            </div>
          </div>
        )}

        {/* ANÁLISIS DE PAREJAS Y RIVALES */}
        {isThursdayMember && (
          <div className="space-y-2 pt-2 border-t border-stone-100 text-xs">
            <span className="text-[10px] font-black text-stone-400 uppercase tracking-wider block">
              🤝 Química de Parejas & Rivales
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#eef4f0]/80 border border-[#c7ddc9] p-2.5 rounded-2xl">
                <span className="text-[9px] font-black text-[#2f5d50] uppercase block mb-1">👑 Mejor Compañero</span>
                {statsCalculated.bestPartner ? (
                  <div>
                    <span className="font-extrabold text-stone-900 block truncate">{statsCalculated.bestPartner.name}</span>
                    <span className="text-[10px] font-bold text-[#2f5d50]">
                      {statsCalculated.bestPartner.pct}% Victorias ({statsCalculated.bestPartner.won}/{statsCalculated.bestPartner.played})
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-stone-400 italic">Sin registros</span>
                )}
              </div>

              <div className="bg-[#f6ede6]/80 border border-[#ead3bf] p-2.5 rounded-2xl">
                <span className="text-[9px] font-black text-[#6b3f29] uppercase block mb-1">💀 Bestia Negra</span>
                {statsCalculated.hardestRival ? (
                  <div>
                    <span className="font-extrabold text-stone-900 block truncate">{statsCalculated.hardestRival.name}</span>
                    <span className="text-[10px] font-bold text-[#6b3f29]">
                      {statsCalculated.hardestRival.pct}% Derrotas ({statsCalculated.hardestRival.lostAgainst}/{statsCalculated.hardestRival.played})
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-stone-400 italic">Sin registros</span>
                )}
              </div>

              <div className="bg-[#eef2f6]/80 border border-[#c3d3e0] p-2.5 rounded-2xl">
                <span className="text-[9px] font-black text-[#2c4a66] uppercase block mb-1">🎯 Rival Fetiche</span>
                {statsCalculated.easiestRival ? (
                  <div>
                    <span className="font-extrabold text-stone-900 block truncate">{statsCalculated.easiestRival.name}</span>
                    <span className="text-[10px] font-bold text-[#2c4a66]">
                      {statsCalculated.easiestRival.pct}% Ganados ({statsCalculated.easiestRival.wonAgainst}/{statsCalculated.easiestRival.played})
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-stone-400 italic">Sin registros</span>
                )}
              </div>

              <div className="bg-[#faf3e7]/80 border border-[#efd9a9] p-2.5 rounded-2xl">
                <span className="text-[9px] font-black text-[#6b4d1c] uppercase block mb-1">⚠️ Pareja Gafe</span>
                {statsCalculated.worstPartner ? (
                  <div>
                    <span className="font-extrabold text-stone-900 block truncate">{statsCalculated.worstPartner.name}</span>
                    <span className="text-[10px] font-bold text-[#6b4d1c]">
                      {statsCalculated.worstPartner.pct}% Derrotas ({statsCalculated.worstPartner.lost}/{statsCalculated.worstPartner.played})
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-stone-400 italic">Sin registros</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ESTADÍSTICAS DE CRUCE (TÚ vs EL JUGADOR CONSULTADO) */}
        {statsCalculated.headToHead && (() => {
          const hh = statsCalculated.headToHead;
          const totalJuntos = hh.partnerPlayed;
          const totalRivales = hh.rivalPlayed;
          const sinDatos = totalJuntos === 0 && totalRivales === 0;
          return (
            <div className="space-y-2 pt-2 border-t border-stone-100 text-xs">
              <span className="text-[10px] font-black text-stone-400 uppercase tracking-wider block">
                🔗 Tu Cruce con {user.name}
              </span>

              {sinDatos ? (
                <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3 text-center">
                  <span className="text-[11px] text-stone-400 italic">
                    Todavía no habéis coincidido en ningún partido (ni oficial ni amistoso).
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#eef2f6]/80 border border-[#c3d3e0] p-2.5 rounded-2xl">
                    <span className="text-[9px] font-black text-[#2c4a66] uppercase block mb-1">🤝 Como Pareja</span>
                    {totalJuntos > 0 ? (
                      <div>
                        <span className="font-extrabold text-stone-900 block">
                          {hh.partnerWon}V - {hh.partnerLost}D
                        </span>
                        <span className="text-[10px] font-bold text-[#2c4a66]">
                          {totalJuntos} {totalJuntos === 1 ? 'partido jugado' : 'partidos jugados'} juntos
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-stone-400 italic">Nunca habéis sido pareja</span>
                    )}
                  </div>

                  <div className="bg-[#faf3e7]/80 border border-[#efd9a9] p-2.5 rounded-2xl">
                    <span className="text-[9px] font-black text-[#6b4d1c] uppercase mb-1 flex items-center gap-1"><PadelRacketsIcon /> Como Rivales</span>
                    {totalRivales > 0 ? (
                      <div>
                        <span className="font-extrabold text-stone-900 block">
                          Tú {hh.viewerWonVsProfile} - {hh.profileWonVsViewer} {user.name?.split(' ')[0] || 'Él/Ella'}
                        </span>
                        <span className="text-[10px] font-bold text-[#6b4d1c]">
                          {totalRivales} {totalRivales === 1 ? 'enfrentamiento' : 'enfrentamientos'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-stone-400 italic">Nunca os habéis enfrentado</span>
                    )}
                  </div>
                </div>
              )}

              {hh.recent.length > 0 && (
                <div className="bg-stone-50 border border-stone-200 rounded-2xl p-2.5 space-y-1 mt-1">
                  <span className="text-[9px] font-black text-stone-500 uppercase block mb-1">🕑 Últimos cruces</span>
                  {[...hh.recent].reverse().slice(0, 5).map((r, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[10px] border-b border-stone-200/70 last:border-0 pb-1 last:pb-0">
                      <span className="text-stone-500">{fechaCompleta(r.date, r.fechaISO)}</span>
                      {r.tipo === 'pareja' ? (
                        <span className={`font-bold ${r.ganaron ? 'text-[#2f5d50]' : 'text-[#6b3f29]'}`}>
                          🤝 Pareja · {r.ganaron ? 'Victoria' : 'Derrota'}
                        </span>
                      ) : (
                        <span className={`font-bold inline-flex items-center gap-1 ${r.ganaProfile ? 'text-[#6b3f29]' : 'text-[#2f5d50]'}`}>
                          <PadelRacketsIcon /> Rival · {r.ganaProfile ? `Ganó ${user.name?.split(' ')[0] || 'él/ella'}` : 'Ganaste tú'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* SUBPANEL DE DETALLE DE ESTADÍSTICAS */}
        {selectedStatCategory && (
          <div className="bg-stone-900 text-white rounded-2xl p-3 space-y-2 border border-stone-700 animate-fadeIn text-xs">
            <div className="flex justify-between items-center border-b border-stone-800 pb-1.5">
              <span className="font-black text-[#9fb4c7] text-[11px] uppercase tracking-wide">
                📋 {getDetailTitle()} ({getDetailItems().length})
              </span>
              <button
                type="button"
                onClick={() => setSelectedStatCategory(null)}
                className="text-stone-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {getDetailItems().length === 0 ? (
                <p className="text-stone-400 italic text-[10px] text-center py-2">Sin registros en este apartado</p>
              ) : (
                getDetailItems().map((item, idx) => (
                  <div key={idx} className="bg-stone-800 p-2 rounded-xl border border-stone-700/80 space-y-0.5">
                    {'pts' in item || 'bote' in item ? (
                      <>
                        <div className="flex justify-between text-[10px] font-bold text-stone-300">
                          <span>📅 {fechaCompleta(item.date, item.fechaISO)}</span>
                          <span className={'pts' in item ? 'text-[#9fb4c7]' : 'text-[#d9a582]'}>
                            {'pts' in item ? `Suma: ${item.pts > 0 ? '+'+item.pts : item.pts} pts` : `Añade: +${item.bote} €`}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-100 font-semibold truncate">{item.title}</p>
                        <p className="text-[9px] text-stone-400 font-mono mt-0.5">{item.desc}</p>
                      </>
                    ) : 'date' in item ? (
                      <>
                        <div className="flex justify-between text-[10px] font-bold text-stone-300">
                          <span>📅 {fechaCompleta(item.date, item.fechaISO)}{item.esAmistoso && <span className="text-stone-500 font-semibold"> · 🤝 Amistoso</span>}</span>
                          {item.partner !== 'Solo Cena' && (
                            <span className={item.won ? 'text-[#a9c4ad]' : 'text-[#d9a582]'}>{item.won ? 'Victoria 🏆' : 'Derrota ❌'}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-stone-100 font-semibold truncate">
                          {item.partner === 'Solo Cena' ? 'Sin partido jugado' : <>Pareja con <strong>{item.partner}</strong> vs <span>{item.rivals}</span></>}
                        </p>
                        <p className="text-[9px] text-stone-400">
                          {item.partner !== 'Solo Cena' && `Marcador: ${item.score} · `} Cena: {item.dinner === 'SI' ? '🍻 Sí' : item.dinner === 'UNA' ? '🍺 Una' : item.dinner === 'NO' ? '🏃‍♂️ No' : '🟡 Pendiente'}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between text-[10px] font-bold text-stone-300">
                          <span>🏆 {item.tournamentName}</span>
                          <span className={item.won ? 'text-[#a9c4ad]' : 'text-[#d9a582]'}>
                            {item.won ? 'Ganado' : 'Perdido'}
                          </span>
                        </div>
                        <p className="text-[10px] text-stone-200">
                          {item.court}: {item.team1} vs {item.team2} ({item.score})
                        </p>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* NUEVO (Paso 4): RACHA DE VICTORIAS Y EVOLUCIÓN DE PUNTOS DEL MES */}
        <div className="space-y-2 pt-1 border-t border-stone-100">
          <div className="flex items-center justify-between gap-2">
            <div className={`flex-1 rounded-2xl p-3 border ${streakAndTrend.winStreak >= 2 ? 'bg-gradient-to-br from-[#faf3e7] to-[#faf3e7] border-[#d9b97c]' : 'bg-stone-50 border-stone-200'}`}>
              <span className="text-[9px] font-black text-stone-500 uppercase tracking-wide block">Racha actual</span>
              <span className="text-xl font-black text-stone-900 block mt-0.5">
                {streakAndTrend.winStreak >= 2 ? `🔥 Racha: ${streakAndTrend.winStreak}` : streakAndTrend.winStreak === 1 ? '✅ 1 victoria seguida' : '—'}
              </span>
              {streakAndTrend.winStreak < 1 && (
                <span className="text-[10px] text-stone-400">Gana tu próximo partido para empezar racha</span>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-3 border border-stone-200">
            <span className="text-[10px] font-black text-stone-600 uppercase tracking-wide block mb-1">
              📊 Partidos y victorias (últimos 6 meses) · Liga + Amistosos + Torneos
            </span>
            <MiniBarChart data={streakAndTrend.monthlyTrend} />
          </div>
        </div>

        {/* RENDIMIENTO Y MODALIDAD EN TORNEOS */}
        <div className="space-y-2 pt-1 border-t border-stone-100">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-[#4a3350] uppercase tracking-wider flex items-center gap-1">
              <PadelRacketsIcon /> Rendimiento en Torneos
            </span>
            <button
              type="button"
              onClick={() => setSelectedStatCategory(selectedStatCategory === 'torneos' ? null : 'torneos')}
              className="text-[10px] font-bold text-[#4a3350] bg-[#f2eef2] hover:bg-[#f2eef2] px-2 py-0.5 rounded-md transition"
            >
              {tournamentStats.tPlayed} partidos (Ver todo)
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-[#f2eef2]/80 border border-[#ddc9de] p-2.5 rounded-2xl">
              <span className="text-[9px] font-black text-[#4a3350] uppercase block mb-1">🥇 Mejor Modalidad</span>
              {tournamentStats.bestMode ? (
                <div>
                  <span className="font-extrabold text-stone-900 block truncate">{tournamentStats.bestMode.name}</span>
                  <span className="text-[10px] font-bold text-[#4a3350]">
                    {tournamentStats.bestMode.winRate}% Éxito ({tournamentStats.bestMode.won}/{tournamentStats.bestMode.played})
                  </span>
                </div>
              ) : (
                <span className="text-[10px] text-stone-400 italic">Sin datos suficientes</span>
              )}
            </div>

            <div className="bg-[#faf3e7]/80 border border-[#efd9a9] p-2.5 rounded-2xl">
              <span className="text-[9px] font-black text-[#6b4d1c] uppercase block mb-1">📉 Peor Modalidad</span>
              {tournamentStats.worstMode ? (
                <div>
                  <span className="font-extrabold text-stone-900 block truncate">{tournamentStats.worstMode.name}</span>
                  <span className="text-[10px] font-bold text-[#6b4d1c]">
                    {tournamentStats.worstMode.winRate}% Éxito ({tournamentStats.worstMode.won}/{tournamentStats.worstMode.played})
                  </span>
                </div>
              ) : (
                <span className="text-[10px] text-stone-400 italic">Sin datos suficientes</span>
              )}
            </div>
          </div>
        </div>

        <button onClick={onClose} className="w-full py-2.5 bg-stone-900 text-white font-bold rounded-xl text-xs">Cerrar</button>
      </div>
    </div>
  );
}
function TournamentCreatorModal({ isOpen, onClose, allPlayers, tournaments, onTournamentCreated, currentUserId, onSaveLevel }) {
  const [step, setStep] = useState(1);
  const [tName, setTName] = useState('Torneo CTC Fin de Semana');
  const [tournamentMode, setTournamentMode] = useState('equipos');
  // NUEVO: en el Pozo Continuo (formato escalera), el organizador decide si las parejas son
  // fijas durante todo el torneo (la pareja sube/baja de pista junta) o rotativas (cada ronda
  // se reparten de nuevo los 4 jugadores de cada pista en parejas nuevas).
  const [pozoFixedPairs, setPozoFixedPairs] = useState(false);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [tDate, setTDate] = useState(todayStr);
  const [tStartTime, setTStartTime] = useState('10:00');

  const [tCourts, setTCourts] = useState(3);
  const [targetPlayers, setTargetPlayers] = useState(12);
  const [hasManuallyEditedTarget, setHasManuallyEditedTarget] = useState(false);

  const [tDuration, setTDuration] = useState(120);
  const [tMatchTime, setTMatchTime] = useState(20);
  const [coOrganizerIds, setCoOrganizerIds] = useState([]);

  // NUEVO: Buscador de jugadores
  const [playerSearch, setPlayerSearch] = useState('');
  // NUEVO: Validación de capitanes
  const [captainsValidated, setCaptainsValidated] = useState(false);
  // NUEVO: Estado para editar partidos individualmente en el cuadro final
  const [editingMatchInfo, setEditingMatchInfo] = useState(null);

  const handleCourtsChange = (newCourts) => {
    const val = Math.min(12, Math.max(1, newCourts));
    setTCourts(val);
    if (!hasManuallyEditedTarget) {
      setTargetPlayers(val * 4);
    }
  };

  const [participants, setParticipants] = useState(() => {
    return (allPlayers || []).map(p => {
      const calc = typeof calculateTournamentSuggestedLevel === 'function' 
        ? calculateTournamentSuggestedLevel(p, tournaments)
        : { suggestedLevel: p.level || 3.5, diff: 0, trend: 'ESTABLE' };
      return {
        id: p.id,
        name: p.name,
        photo: p.photo,
        level: calc.suggestedLevel,
        originalLevel: p.level || 3.5,
        diff: calc.diff,
        trend: calc.trend,
        selected: false, // Ahora vienen TODOS desmarcados por defecto
        isGuest: false,
        isLeftHanded: Boolean(p.isLeftHanded),
        // NUEVO: empieza "pendiente" (igual que en los partidos de liga) para que cada
        // jugador tenga que confirmar expresamente si se queda al 3º tiempo del torneo,
        // en vez de darlo por hecho como "SI" desde el principio.
        dinner: 'PENDIENTE',
        assignedTeam: 1
      };
    });
  });

  const [captain1Id, setCaptain1Id] = useState('');
  const [captain2Id, setCaptain2Id] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestLevel, setGuestLevel] = useState(3.0);
  const [guestIsLeftHanded, setGuestIsLeftHanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customGeminiRules, setCustomGeminiRules] = useState('');

  const [generatedFixture, setGeneratedFixture] = useState([]);
  const [generatedTeams, setGeneratedTeams] = useState([]);
  // NUEVO (Pozo Continuo en formato escalera): guarda, solo para el modo 'pozo', cuántas
  // rondas en total va a tener el torneo (para saber cuándo parar de generar rondas nuevas)
  // y en qué pista empezó cada jugador (para la corrección del ranking final, que premia
  // a quien sube más puestos y no solo a quien termina en la Pista 1).
  const [pozoMeta, setPozoMeta] = useState(null);

  useEffect(() => {
    const selected = participants.filter(p => p.selected);
    if (selected.length >= 2) {
      if (!captain1Id || !selected.some(s => s.id === captain1Id)) setCaptain1Id(selected[0].id);
      if (!captain2Id || !selected.some(s => s.id === captain2Id)) {
        const other = selected.find(s => s.id !== selected[0].id);
        if (other) setCaptain2Id(other.id);
      }
    }
  }, [participants, captain1Id, captain2Id]);

  useEffect(() => {
    if (captain1Id) {
      setParticipants(prev => prev.map(p => p.id === captain1Id ? { ...p, assignedTeam: 1 } : p));
    }
    if (captain2Id) {
      setParticipants(prev => prev.map(p => p.id === captain2Id ? { ...p, assignedTeam: 2 } : p));
    }
  }, [captain1Id, captain2Id]);

  useEffect(() => {
    if (typeof OFFICIAL_TOURNAMENT_RULES !== 'undefined') {
      setCustomGeminiRules(OFFICIAL_TOURNAMENT_RULES[tournamentMode] || '');
    }
  }, [tournamentMode]);

  if (!isOpen) return null;

  const handleTogglePlayer = (id) => {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, selected: !p.selected } : p));
  };

  const handleToggleLeftHanded = (id) => {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, isLeftHanded: !p.isLeftHanded } : p));
  };

  const handleLevelChange = (id, newLvl) => {
    const parsed = parseFloat(newLvl);
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, level: parsed } : p));
    if (typeof onSaveLevel === 'function') {
      onSaveLevel(id, parsed);
    }
  };

  const handleTeamToggle = (id, teamNum) => {
    if (id === captain1Id || id === captain2Id) return;
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, assignedTeam: teamNum } : p));
  };

  const handleToggleCoOrganizer = (id) => {
    setCoOrganizerIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleAutoBalanceTeams = () => {
    const selected = participants.filter(p => p.selected);
    if (selected.length < 2) return;

    const cap1 = selected.find(p => p.id === captain1Id);
    const cap2 = selected.find(p => p.id === captain2Id);
    
    const rest = selected
      .filter(p => p.id !== captain1Id && p.id !== captain2Id)
      .sort((a, b) => b.level - a.level);

    let team1 = cap1 ? [cap1] : [];
    let team2 = cap2 ? [cap2] : [];

    // Repartimos primero igualando el NÚMERO de jugadores por equipo (indispensable),
    // y solo usamos el nivel como criterio de desempate cuando ambos equipos están igualados en tamaño.
    rest.forEach(p => {
      if (team1.length < team2.length) {
        team1.push(p);
      } else if (team2.length < team1.length) {
        team2.push(p);
      } else {
        const sum1 = team1.reduce((acc, item) => acc + item.level, 0);
        const sum2 = team2.reduce((acc, item) => acc + item.level, 0);
        if (sum1 <= sum2) team1.push(p);
        else team2.push(p);
      }
    });

    const team1Ids = new Set(team1.map(p => p.id));
    setParticipants(prev => prev.map(p => {
      if (!p.selected) return p;
      return { ...p, assignedTeam: team1Ids.has(p.id) ? 1 : 2 };
    }));
  };

  const handleAddGuest = (e) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    setParticipants(prev => [
      {
        id: 'guest_' + Date.now() + '_' + sufijoAleatorioId(),
        name: guestName.trim() + ' (Invitado)',
        photo: '',
        level: parseFloat(guestLevel),
        diff: 0,
        trend: 'ESTABLE',
        selected: true,
        isGuest: true,
        isLeftHanded: guestIsLeftHanded,
        dinner: 'SI',
        assignedTeam: 1
      },
      ...prev
    ]);
    setGuestName('');
    setGuestIsLeftHanded(false);
  };

  const selectedPlayers = participants.filter(p => p.selected);
  const selectedCount = selectedPlayers.length;
  const neededForCourts = (Number(tCourts) || 1) * 4;

  const filteredParticipants = participants.filter(p => 
    normalizeName(p.name).includes(normalizeName(playerSearch))
  );

  const teamStats = (() => {
    const team1Players = selectedPlayers.filter(p => p.assignedTeam === 1);
    const team2Players = selectedPlayers.filter(p => p.assignedTeam === 2);

    const avgT1 = team1Players.length > 0 ? (team1Players.reduce((acc, p) => acc + p.level, 0) / team1Players.length).toFixed(2) : '0.00';
    const avgT2 = team2Players.length > 0 ? (team2Players.reduce((acc, p) => acc + p.level, 0) / team2Players.length).toFixed(2) : '0.00';

    const delta = Math.abs(parseFloat(avgT1) - parseFloat(avgT2)).toFixed(2);
    const isBalanced = parseFloat(delta) <= 0.2;

    return { team1Players, team2Players, avgT1, avgT2, delta, isBalanced };
  })();

  const pairFourPlayersAvoidingDoubleLefties = (pool4) => {
    const lefties = pool4.filter(p => p.isLeftHanded);
    const righties = pool4.filter(p => !p.isLeftHanded);

    if (lefties.length === 2 && righties.length === 2) {
      return { pair1: [lefties[0], righties[0]], pair2: [lefties[1], righties[1]] };
    }
    const sorted = [...pool4].sort((a, b) => b.level - a.level);
    return { pair1: [sorted[0], sorted[3]], pair2: [sorted[1], sorted[2]] };
  };

  const handleGenerateWithGemini = () => {
    if (selectedPlayers.length < 4) return;
    setIsGenerating(true);

    setTimeout(() => {
      const sorted = [...selectedPlayers].sort((a, b) => b.level - a.level);
      const totalRounds = Math.max(1, Math.floor(tDuration / tMatchTime));
      const rounds = [];

      if (tournamentMode === 'pozo') {
        // REDISEÑO "ESCALERA": ya no se generan todas las rondas de golpe con una rotación
        // fija. Solo se arma la Ronda 1 (seedeada por nivel: los de nivel más alto empiezan
        // en la Pista 1, bajando por orden), y a partir de ahí cada ronda se calcula sobre la
        // marcha en handleSaveTournamentScore en cuanto se reportan los 4 resultados de la
        // ronda anterior: quien gana sube una pista, quien pierde baja una (con tope en la
        // Pista 1 y en la última pista). Guardamos en qué pista empezó cada jugador
        // (pozoMeta.startCourts) para poder corregir el ranking final: subir desde abajo vale
        // más que quedarte quieto en la Pista 1 desde el principio.
        const startCourts = {};
        const matchesList = [];
        const roundPool = [...sorted];
        for (let c = 1; c <= (Number(tCourts) || 1); c++) {
          if (roundPool.length >= 4) {
            const p1 = roundPool.shift(); const p2 = roundPool.shift(); const p3 = roundPool.shift(); const p4 = roundPool.shift();
            [p1, p2, p3, p4].forEach(p => { startCourts[p.id] = c; });
            const paired = pairFourPlayersAvoidingDoubleLefties([p1, p2, p3, p4]);
            matchesList.push({
              id: `POZO_R1_P${c}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              court: c === 1 ? 'Pista 1 👑 (Pista Reina)' : `Pista ${c}`,
              team1: `${paired.pair1[0].name.split(' ')[0]} & ${paired.pair1[1].name.split(' ')[0]}`,
              team2: `${paired.pair2[0].name.split(' ')[0]} & ${paired.pair2[1].name.split(' ')[0]}`,
              team1Ids: [paired.pair1[0].id, paired.pair1[1].id],
              team2Ids: [paired.pair2[0].id, paired.pair2[1].id],
              courtNum: c,
              score: '', winner: null, status: 'PENDIENTE'
            });
          }
        }
        rounds.push({ round: 1, timeLabel: 'Ronda 1', matches: matchesList });
        setPozoMeta({ startCourts, totalRounds, totalCourts: Number(tCourts) || 1, fixedPairs: pozoFixedPairs });
      } else if (tournamentMode === 'americano') {
        for (let r = 1; r <= totalRounds; r++) {
          const matchesList = [];
          const activePool = [...sorted].sort(() => Math.random() - 0.5);
          for (let c = 1; c <= (Number(tCourts) || 1); c++) {
            if (activePool.length >= 4) {
              const p1 = activePool.pop(); const p2 = activePool.pop(); const p3 = activePool.pop(); const p4 = activePool.pop();
              const paired = pairFourPlayersAvoidingDoubleLefties([p1, p2, p3, p4]);
              matchesList.push({
                id: `AMER_R${r}_P${c}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                court: `Pista ${c}`,
                team1: `${paired.pair1[0].name.split(' ')[0]} & ${paired.pair1[1].name.split(' ')[0]}`,
                team2: `${paired.pair2[0].name.split(' ')[0]} & ${paired.pair2[1].name.split(' ')[0]}`,
                team1Ids: [paired.pair1[0].id, paired.pair1[1].id],
                team2Ids: [paired.pair2[0].id, paired.pair2[1].id],
                score: '', winner: null, status: 'PENDIENTE'
              });
            }
          }
          rounds.push({ round: r, timeLabel: `Ronda ${r}`, matches: matchesList });
        }
      } else if (tournamentMode === 'eliminatorio') {
        // CUADRO GENERALIZADO DE ELIMINACIÓN DIRECTA.
        // El código anterior solo funcionaba de verdad con exactamente 8 jugadores (4 parejas):
        // generaba la ronda de semis con texto fijo ("1º Grupo A"...) que nunca se sustituía por
        // el ganador real de la fase de grupos, y con cualquier otro número de parejas el cuadro
        // quedaba incompleto o roto. Ahora se construye un cuadro de eliminación directa de
        // cualquier tamaño (con "byes" para las parejas mejor clasificadas si no se llega a una
        // potencia de 2), y cada partido sabe de qué partido anterior depende su team1/team2
        // (team1Source/team2Source) para que handleSaveTournamentScore pueda ir propagando
        // ganadores automáticamente ronda a ronda, sea cual sea el tamaño del cuadro.
        const couples = [];
        for (let i = 0; i < sorted.length; i += 2) {
          if (sorted[i + 1]) {
            couples.push({
              name: `${sorted[i].name.split(' ')[0]} & ${sorted[i + 1].name.split(' ')[0]}`,
              ids: [sorted[i].id, sorted[i + 1].id]
            });
          }
        }

        if (couples.length < 2) {
          // No hay parejas suficientes para montar un cuadro (hacen falta al menos 2 parejas, 4 jugadores).
        } else {
          let bracketSize = 2;
          while (bracketSize < couples.length) bracketSize *= 2;

          // Las mejor clasificadas (couples ya viene ordenado por nivel) reciben los "byes" si sobran huecos.
          let currentSlots = [...couples];
          while (currentSlots.length < bracketSize) currentSlots.push(null);

          let roundNum = 1;
          let semifinalMatchIds = [];
          let round1MatchIds = [];

          while (currentSlots.length > 1) {
            const matchesThisRound = currentSlots.length / 2;
            const label = eliminationRoundLabel(matchesThisRound);
            const matchesList = [];
            const nextSlots = [];

            for (let i = 0; i < currentSlots.length; i += 2) {
              const a = currentSlots[i];
              const b = currentSlots[i + 1];
              const matchId = `ELIM_R${roundNum}_M${i / 2}`;

              if (a && b) {
                matchesList.push({
                  id: matchId,
                  court: `Pista ${((i / 2) % (Number(tCourts) || 1)) + 1}`,
                  team1: a.name, team2: b.name,
                  team1Ids: a.ids || [], team2Ids: b.ids || [],
                  // Si el hueco venía de un partido anterior (no es una pareja real todavía
                  // conocida), anotamos de qué partido depende para poder propagar el ganador.
                  team1Source: a.pendingFrom || null,
                  team2Source: b.pendingFrom || null,
                  score: '', winner: null, status: 'PENDIENTE'
                });
                // Slot pendiente: se rellenará con el ganador real de este partido en cuanto se reporte.
                nextSlots.push({ name: `Ganador (${label})`, ids: [], pendingFrom: matchId });
              } else {
                // Bye: la única pareja real de este cruce pasa directa, sin partido que jugar.
                nextSlots.push(a || b || null);
              }
            }

            if (roundNum === 1) {
              round1MatchIds = matchesList.map(m => m.id);
            }
            if (matchesThisRound === 2) {
              semifinalMatchIds = matchesList.map(m => m.id);
            }

            if (matchesList.length > 0) {
              rounds.push({ round: roundNum, timeLabel: label, matches: matchesList });
            }
            currentSlots = nextSlots;
            roundNum++;
          }

          // Final de consolación (3º y 4º puesto) entre los dos perdedores de semifinales.
          if (bracketSize >= 4 && semifinalMatchIds.length === 2) {
            rounds.push({
              round: roundNum,
              timeLabel: 'Final de Consolación (3º y 4º puesto)',
              matches: [{
                id: 'ELIM_CONSOLACION',
                court: `Pista ${(Number(tCourts) || 1) > 1 ? 2 : 1}`,
                team1: 'Perdedor Semifinal 1', team2: 'Perdedor Semifinal 2',
                team1Ids: [], team2Ids: [],
                team1LoserFrom: semifinalMatchIds[0],
                team2LoserFrom: semifinalMatchIds[1],
                score: '', winner: null, status: 'PENDIENTE'
              }]
            });
          }

          // NUEVO: cuadro de consolación completo para quienes pierden en la Ronda 1 — así
          // casi todo el mundo juega al menos 2 partidos aunque pierda el primero. Reutiliza
          // el mismo mecanismo de "huecos pendientes" del cuadro principal (team1Source /
          // team1LoserFrom), que handleSaveTournamentScore ya sabe resolver de forma genérica
          // en cuanto se reporta el resultado del partido del que depende cada hueco — no hace
          // falta tocar esa función para que este cuadro se vaya rellenando solo.
          if (round1MatchIds.length >= 2) {
            let consolSlots = round1MatchIds.map(mid => ({ name: 'Perdedor Ronda 1', ids: [], pendingLoserFrom: mid }));
            let consolBracketSize = 2;
            while (consolBracketSize < consolSlots.length) consolBracketSize *= 2;
            while (consolSlots.length < consolBracketSize) consolSlots.push(null);

            let consolRoundNum = 1;
            while (consolSlots.length > 1) {
              const matchesThisConsolRound = consolSlots.length / 2;
              const consolLabel = matchesThisConsolRound === 1
                ? '🥈 Final de Consolación'
                : `🥈 Consolación (${eliminationRoundLabel(matchesThisConsolRound)})`;
              const matchesList = [];
              const nextConsolSlots = [];

              for (let i = 0; i < consolSlots.length; i += 2) {
                const a = consolSlots[i];
                const b = consolSlots[i + 1];
                const matchId = `CONSOL_R${consolRoundNum}_M${i / 2}`;

                if (a && b) {
                  matchesList.push({
                    id: matchId,
                    court: `Pista ${((i / 2) % (Number(tCourts) || 1)) + 1}`,
                    team1: a.name, team2: b.name,
                    team1Ids: a.ids || [], team2Ids: b.ids || [],
                    team1Source: a.pendingFrom || null,
                    team2Source: b.pendingFrom || null,
                    team1LoserFrom: a.pendingLoserFrom || null,
                    team2LoserFrom: b.pendingLoserFrom || null,
                    score: '', winner: null, status: 'PENDIENTE'
                  });
                  nextConsolSlots.push({ name: `Ganador (${consolLabel})`, ids: [], pendingFrom: matchId });
                } else {
                  nextConsolSlots.push(a || b || null);
                }
              }

              if (matchesList.length > 0) {
                rounds.push({ round: 100 + consolRoundNum, timeLabel: consolLabel, matches: matchesList, isConsolation: true });
              }
              consolSlots = nextConsolSlots;
              consolRoundNum++;
            }
          }
        }
      } else if (tournamentMode === 'equipos') {
        const teamA = teamStats.team1Players;
        const teamB = teamStats.team2Players;
        const cap1 = selectedPlayers.find(p => p.id === captain1Id);
        const cap2 = selectedPlayers.find(p => p.id === captain2Id);

        setGeneratedTeams([
          { name: `Equipo Azul 🔵 (Cap: ${cap1 ? cap1.name.split(' ')[0] : 'Capitán 1'})`, players: teamA, score: 0 },
          { name: `Equipo Rojo 🔴 (Cap: ${cap2 ? cap2.name.split(' ')[0] : 'Capitán 2'})`, players: teamB, score: 0 }
        ]);

        for (let r = 1; r <= totalRounds; r++) {
          const matchesList = [];
          const poolA = [...teamA].sort(() => Math.random() - 0.5);
          const poolB = [...teamB].sort(() => Math.random() - 0.5);

          for (let c = 1; c <= (Number(tCourts) || 1); c++) {
            if (poolA.length >= 2 && poolB.length >= 2) {
              const a1 = poolA.pop(); const a2 = poolA.pop();
              const b1 = poolB.pop(); const b2 = poolB.pop();

              // SOLUCIÓN AL BUG "f2/f4": Simplemente emparejamos a los dos extraídos de cada equipo.
              matchesList.push({
                id: `RYDER_R${r}_P${c}_${Date.now()}`,
                court: `Pista ${c}`,
                team1: `${a1.name.split(' ')[0]} & ${a2.name.split(' ')[0]} (Azul)`,
                team2: `${b1.name.split(' ')[0]} & ${b2.name.split(' ')[0]} (Rojo)`,
                team1Ids: [a1.id, a2.id],
                team2Ids: [b1.id, b2.id],
                score: '',
                winner: null,
                status: 'PENDIENTE'
              });
            }
          }
          rounds.push({ round: r, timeLabel: `Cruce Ryder - Ronda ${r}`, matches: matchesList });
        }
      }

      setGeneratedFixture(rounds);
      setIsGenerating(false);
      setStep(5); // Saltamos al paso final
    }, 900);
  };

  const handleSaveInlineMatchEdit = () => {
    if (!editingMatchInfo) return;
    const { rIdx, mIdx, court, team1, team2 } = editingMatchInfo;
    
    const newFixture = [...generatedFixture];
    newFixture[rIdx].matches[mIdx] = {
      ...newFixture[rIdx].matches[mIdx],
      court, team1, team2
    };
    
    setGeneratedFixture(newFixture);
    setEditingMatchInfo(null);
  };

  const handleLaunchTournament = (statusOverwrite) => {
    // Si recibe un texto (ej: 'BOCETO_EQUIPOS') usa ese. Si no, o si recibe el evento del click, usa 'ACTIVO'
    const finalStatus = typeof statusOverwrite === 'string' ? statusOverwrite : 'ACTIVO';
    
    onTournamentCreated({
      id: 'TORNEO_' + Date.now() + '_' + sufijoAleatorioId(),
      name: tName,
      mode: tournamentMode,
      startDate: tDate,
      startTime: tStartTime,
      date: `${tDate} ${tStartTime}`,
      courts: Number(tCourts) || 1,
      targetPlayers: Number(targetPlayers) || ((Number(tCourts) || 1) * 4),
      duration: tDuration,
      creatorId: currentUserId,
      coOrganizerIds: coOrganizerIds,
      participants: selectedPlayers,
      rounds: generatedFixture,
      teams: generatedTeams,
      status: finalStatus,
      captain1Id: captain1Id || null,
      captain2Id: captain2Id || null,
      // NUEVO: metadatos del formato escalera del Pozo Continuo (ver comentario en
      // handleGenerateWithGemini). Solo se rellena cuando tournamentMode === 'pozo'.
      pozoEscalera: tournamentMode === 'pozo' ? pozoMeta : null
    });
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-3 text-left">
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[92vh] overflow-y-auto p-5 shadow-2xl flex flex-col space-y-4">
        <div className="flex justify-between items-center border-b pb-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base">🏆</span>
              <h3 className="text-base font-black text-stone-900">Modo Torneo CTC</h3>
            </div>
            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wide">
              Paso {step} de {tournamentMode === 'equipos' ? 5 : 4} · Aislado de liga regular
            </p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-2xl font-bold">&times;</button>
        </div>

        {/* PASO 1: CONFIGURACIÓN BÁSICA */}
        {step === 1 && (
          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-stone-600 mb-1">Nombre del Torneo</label>
              <input type="text" value={tName} onChange={e => setTName(e.target.value)} className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 font-bold text-stone-900" />
            </div>

            <div className="grid grid-cols-2 gap-2 bg-[#f2eef2]/70 p-3 rounded-2xl border border-[#ddc9de]">
              <div>
                <label className="block text-[10px] font-black text-[#4a3350] uppercase tracking-wide mb-1">📅 Fecha Inicio *</label>
                <input type="date" required value={tDate} onChange={e => setTDate(e.target.value)} className="w-full bg-white border border-[#b893ba] rounded-xl p-2 font-bold text-stone-800 text-xs" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-[#4a3350] uppercase tracking-wide mb-1">⏰ Hora Inicio *</label>
                <input type="time" required value={tStartTime} onChange={e => setTStartTime(e.target.value)} className="w-full bg-white border border-[#b893ba] rounded-xl p-2 font-bold text-stone-800 text-xs" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-stone-600 mb-1.5">Formato de Competición</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setTournamentMode('pozo')} className={`p-3 rounded-2xl border text-left transition ${tournamentMode === 'pozo' ? 'bg-[#eef2f6] border-[#2c4a66] text-[#2c4a66] ring-2 ring-[#9fb4c7]' : 'bg-stone-50 border-stone-200 text-stone-600'}`}>
                  <span className="font-black block text-xs">🔄 Pozo Continuo</span>
                </button>
                <button type="button" onClick={() => setTournamentMode('americano')} className={`p-3 rounded-2xl border text-left transition ${tournamentMode === 'americano' ? 'bg-[#eef2f6] border-[#2c4a66] text-[#2c4a66] ring-2 ring-[#9fb4c7]' : 'bg-stone-50 border-stone-200 text-stone-600'}`}>
                  <span className="font-black block text-xs">🇺🇸 Americano</span>
                </button>
                <button type="button" onClick={() => setTournamentMode('eliminatorio')} className={`p-3 rounded-2xl border text-left transition ${tournamentMode === 'eliminatorio' ? 'bg-[#eef2f6] border-[#2c4a66] text-[#2c4a66] ring-2 ring-[#9fb4c7]' : 'bg-stone-50 border-stone-200 text-stone-600'}`}>
                  <span className="font-black block text-xs">🥇 Fases Finales</span>
                </button>
                <button type="button" onClick={() => setTournamentMode('equipos')} className={`p-3 rounded-2xl border text-left transition ${tournamentMode === 'equipos' ? 'bg-[#2c4a66] text-white border-[#2c4a66] ring-2 ring-[#9fb4c7]' : 'bg-stone-50 border-stone-200 text-stone-600'}`}>
                  <span className="font-black block text-xs">🛡️ Por Equipos (Ryder)</span>
                </button>
              </div>
            </div>

            {tournamentMode === 'pozo' && (
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1.5">¿Parejas fijas o rotativas?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPozoFixedPairs(false)}
                    className={`p-2.5 rounded-2xl border text-left transition ${!pozoFixedPairs ? 'bg-[#eef2f6] border-[#2c4a66] text-[#2c4a66] ring-2 ring-[#9fb4c7]' : 'bg-stone-50 border-stone-200 text-stone-600'}`}
                  >
                    <span className="font-black block text-xs">🔀 Rotativas</span>
                    <span className="text-[9px] opacity-80 block">Cada ronda se forman parejas nuevas en cada pista</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPozoFixedPairs(true)}
                    className={`p-2.5 rounded-2xl border text-left transition ${pozoFixedPairs ? 'bg-[#eef2f6] border-[#2c4a66] text-[#2c4a66] ring-2 ring-[#9fb4c7]' : 'bg-stone-50 border-stone-200 text-stone-600'}`}
                  >
                    <span className="font-black block text-xs">🤝 Fijas</span>
                    <span className="text-[9px] opacity-80 block">La misma pareja sube o baja de pista junta todo el torneo</span>
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200">
                <label className="block text-[10px] font-bold text-stone-500 mb-1">Pistas CTC</label>
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  <button type="button" onClick={() => handleCourtsChange((Number(tCourts) || 1) - 1)} className="w-7 h-7 bg-white border border-stone-300 hover:bg-stone-100 rounded-lg font-black text-stone-700 flex items-center justify-center">-</button>
                  <input type="text" inputMode="numeric" value={tCourts} onChange={e => { const val = e.target.value.replace(/\D/g, ''); handleCourtsChange(val === '' ? '' : parseInt(val, 10)); }} className="w-12 bg-white border border-stone-300 rounded-lg p-1 font-black text-center text-sm" />
                  <button type="button" onClick={() => handleCourtsChange((Number(tCourts) || 1) + 1)} className="w-7 h-7 bg-white border border-stone-300 hover:bg-stone-100 rounded-lg font-black text-stone-700 flex items-center justify-center">+</button>
                </div>
              </div>
              <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200">
                <label className="block text-[10px] font-bold text-stone-500 mb-1">Jugadores Esperados</label>
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  <button type="button" onClick={() => { setHasManuallyEditedTarget(true); setTargetPlayers(prev => Math.max(4, (Number(prev) || 4) - 1)); }} className="w-7 h-7 bg-white border border-stone-300 hover:bg-stone-100 rounded-lg font-black text-stone-700 flex items-center justify-center">-</button>
                  <input type="text" inputMode="numeric" value={targetPlayers} onChange={e => { setHasManuallyEditedTarget(true); const val = e.target.value.replace(/\D/g, ''); setTargetPlayers(val === '' ? '' : Math.max(4, parseInt(val, 10))); }} className="w-12 bg-white border border-stone-300 rounded-lg p-1 font-black text-center text-sm" />
                  <button type="button" onClick={() => { setHasManuallyEditedTarget(true); setTargetPlayers(prev => Math.min(64, (Number(prev) || 4) + 1)); }} className="w-7 h-7 bg-white border border-stone-300 hover:bg-stone-100 rounded-lg font-black text-stone-700 flex items-center justify-center">+</button>
                </div>
              </div>
            </div>

            <button onClick={() => setStep(2)} className="w-full py-2.5 bg-[#2c4a66] hover:bg-[#2c4a66] text-white font-bold rounded-xl shadow-xs transition mt-2">
              Siguiente: Convocatoria →
            </button>
          </div>
        )}

        {/* PASO 2: CONVOCATORIA DE JUGADORES Y VALORACIÓN (SIN EQUIPOS) */}
        {step === 2 && (
          <div className="space-y-3.5 text-xs">
            <div className={`p-3 rounded-2xl border text-center transition flex justify-between items-center ${selectedCount < neededForCourts ? 'bg-[#faf3e7] border-[#d9b97c] text-[#6b4d1c]' : 'bg-[#eef4f0] border-[#a9c4ad] text-[#2f5d50]'}`}>
              <div className="text-left">
                <span className="font-black text-sm block">{selectedCount} / {targetPlayers} convocados</span>
                <span className="text-[10px] font-semibold opacity-85">
                  {selectedCount < neededForCourts ? `⚠️ Faltan ${neededForCourts - selectedCount} para completar las ${tCourts} pistas` : '✓ Cupo suficiente'}
                </span>
              </div>
              <span className="text-2xl">{selectedCount >= neededForCourts ? '🎾' : '⏳'}</span>
            </div>

            <form onSubmit={handleAddGuest} className="bg-[#eef2f6]/80 p-3 rounded-2xl border border-[#c3d3e0] space-y-2">
              <label className="font-extrabold text-[#2c4a66] block text-[11px]">➕ Añadir Participante Invitado</label>
              <div className="flex items-center gap-2">
                <input type="text" placeholder="Nombre" value={guestName} onChange={e => setGuestName(e.target.value)} className="flex-1 bg-white border border-[#9fb4c7] rounded-xl p-2 text-xs font-semibold" />
                <label className="flex items-center gap-1 cursor-pointer bg-white border border-[#9fb4c7] px-2 py-1 rounded-xl">
                  <input type="checkbox" checked={guestIsLeftHanded} onChange={e => setGuestIsLeftHanded(e.target.checked)} className="w-3.5 h-3.5 text-[#2c4a66] accent-[#2c4a66]" />
                  <span className="text-[10px] font-bold text-[#2c4a66]">👈 Zurdo</span>
                </label>
                <button type="submit" className="bg-[#2c4a66] text-white font-bold px-3 py-2 rounded-xl text-xs">Añadir</button>
              </div>
            </form>

            <div className="relative">
              <span className="absolute left-3 top-2.5 text-stone-400">🔍</span>
              <input 
                type="text" 
                placeholder="Buscar jugador por nombre..." 
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                className="w-full bg-white border border-stone-300 rounded-xl py-2 pl-8 pr-3 font-semibold text-xs" 
              />
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {filteredParticipants.map(p => (
                <div key={p.id} className={`p-2 rounded-xl border flex items-center justify-between transition ${p.selected ? 'bg-white border-[#9fb4c7] ring-1 ring-[#c3d3e0]' : 'bg-stone-50 border-stone-200 opacity-70'}`}>
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <input type="checkbox" checked={p.selected} onChange={() => handleTogglePlayer(p.id)} className="w-4 h-4 rounded text-[#2c4a66] accent-[#2c4a66] cursor-pointer shrink-0" />
                    <UserAvatar name={p.name} photo={p.photo} size="xs" />
                    <span className="font-bold text-stone-800 text-[11px] truncate block">{p.name}</span>
                  </div>
                  {p.selected && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => handleToggleLeftHanded(p.id)} className={`text-[9px] px-1.5 py-0.5 rounded-md font-extrabold border transition ${p.isLeftHanded ? 'bg-[#eef2f6] text-[#2c4a66] border-[#9fb4c7]' : 'bg-stone-100 text-stone-400 border-stone-200'}`}>
                        👈 {p.isLeftHanded ? 'Zurdo' : 'Diestro'}
                      </button>
                      <StarRating value={p.level} onChange={(lvl) => handleLevelChange(p.id, lvl)} />
                    </div>
                  )}
                </div>
              ))}
              {filteredParticipants.length === 0 && (
                <p className="text-center text-stone-400 py-4 text-[10px]">No se encontraron jugadores.</p>
              )}
            </div>

            {/* NUEVO: Selección rápida de capitanes y guardado de borrador si es Ryder */}
            {tournamentMode === 'equipos' && selectedCount >= 4 && (
              <div className="bg-stone-900 text-white p-3 rounded-2xl border border-stone-700 mt-4 space-y-3">
                <span className="text-[10px] font-black text-[#9fb4c7] uppercase block">Delegar en Capitanes</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-stone-400 mb-1">Capitán Azul 🔵</label>
                    <select value={captain1Id} onChange={e => setCaptain1Id(e.target.value)} className="w-full bg-stone-800 border border-stone-600 rounded-lg p-1.5 text-xs">
                      <option value="">Seleccionar...</option>
                      {selectedPlayers.map(p => <option key={p.id} value={p.id} disabled={p.id === captain2Id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-stone-400 mb-1">Capitán Rojo 🔴</label>
                    <select value={captain2Id} onChange={e => setCaptain2Id(e.target.value)} className="w-full bg-stone-800 border border-stone-600 rounded-lg p-1.5 text-xs">
                      <option value="">Seleccionar...</option>
                      {selectedPlayers.map(p => <option key={p.id} value={p.id} disabled={p.id === captain1Id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep(1)} className="flex-1 py-2 bg-stone-100 text-stone-600 font-bold rounded-xl shadow-sm">← Volver</button>
              
              {tournamentMode === 'equipos' ? (
                <button 
                  onClick={() => handleLaunchTournament('BOCETO_EQUIPOS')} 
                  disabled={selectedCount < 4 || !captain1Id || !captain2Id} 
                  className="flex-1 py-2 bg-gradient-to-r from-[#2c4a66] to-[#2c4a66] text-white font-bold rounded-xl shadow-xs disabled:opacity-50"
                >
                  Guardar y Avisar Capitanes
                </button>
              ) : (
                <button onClick={() => setStep(4)} disabled={selectedCount < 4} className="flex-1 py-2 bg-[#2c4a66] text-white font-bold rounded-xl shadow-xs disabled:opacity-50">
                  Siguiente →
                </button>
              )}
            </div>
          </div>
        )}

        {/* PASO 3: CONFIGURACIÓN DE EQUIPOS (SOLO RYDER) */}
        {step === 3 && tournamentMode === 'equipos' && (
          <div className="space-y-3.5 text-xs">
            <div className="bg-stone-900 text-white rounded-2xl p-3.5 space-y-3 border border-stone-700 shadow-sm">
              <div className="flex justify-between items-center border-b border-stone-800 pb-2">
                <span className="font-black text-xs text-[#9fb4c7] uppercase tracking-wide">🛡️ Configuración Ryder</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${teamStats.isBalanced ? 'bg-[#a9c4ad]/20 text-[#a9c4ad] border border-[#a9c4ad]/40' : 'bg-[#d9b97c]/20 text-[#d9b97c] border border-[#d9b97c]/40'}`}>
                  {teamStats.isBalanced ? '✓ Equilibrado' : '⚠️ Desnivelado'} (Δ {teamStats.delta})
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-stone-800/80 p-2 rounded-xl border border-[#9fb4c7]/40">
                  <label className="block text-[10px] font-black text-[#9fb4c7] uppercase tracking-wider mb-1">Capitán Azul 🔵</label>
                  <select value={captain1Id} onChange={e => setCaptain1Id(e.target.value)} className="w-full bg-stone-900 border border-stone-700 rounded-lg p-1.5 font-bold text-white text-xs truncate">
                    {selectedPlayers.map(p => <option key={p.id} value={p.id} disabled={p.id === captain2Id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="bg-stone-800/80 p-2 rounded-xl border border-[#d9a582]/40">
                  <label className="block text-[10px] font-black text-[#d9a582] uppercase tracking-wider mb-1">Capitán Rojo 🔴</label>
                  <select value={captain2Id} onChange={e => setCaptain2Id(e.target.value)} className="w-full bg-stone-900 border border-stone-700 rounded-lg p-1.5 font-bold text-white text-xs truncate">
                    {selectedPlayers.map(p => <option key={p.id} value={p.id} disabled={p.id === captain1Id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              <button type="button" onClick={handleAutoBalanceTeams} className="w-full py-2 bg-gradient-to-r from-[#2c4a66] to-[#6b3f29] hover:from-[#9fb4c7] text-white font-black rounded-xl text-xs shadow-md transition">
                ⚡ Auto-Equilibrar Escuadras
              </button>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {selectedPlayers.map(p => (
                <div key={p.id} className="p-2 rounded-xl border bg-white flex items-center justify-between">
                  <div className="flex items-center gap-2 truncate">
                    <UserAvatar name={p.name} photo={p.photo} size="xs" />
                    <span className="font-bold text-stone-800 text-[11px] truncate">{p.name}</span>
                  </div>
                  <div className="flex bg-stone-100 p-0.5 rounded-lg border border-stone-200 shrink-0">
                    <button type="button" disabled={p.id === captain1Id || p.id === captain2Id} onClick={() => handleTeamToggle(p.id, 1)} className={`px-2 py-0.5 rounded-md text-[10px] font-black transition ${p.assignedTeam === 1 ? 'bg-[#2c4a66] text-white shadow-xs' : 'text-stone-400'}`}>
                      🔵 Azul
                    </button>
                    <button type="button" disabled={p.id === captain1Id || p.id === captain2Id} onClick={() => handleTeamToggle(p.id, 2)} className={`px-2 py-0.5 rounded-md text-[10px] font-black transition ${p.assignedTeam === 2 ? 'bg-[#6b3f29] text-white shadow-xs' : 'text-stone-400'}`}>
                      🔴 Rojo
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-[#eef4f0] border border-[#c7ddc9] p-3 rounded-2xl flex items-center gap-2 cursor-pointer" onClick={() => setCaptainsValidated(!captainsValidated)}>
               <input type="checkbox" checked={captainsValidated} onChange={() => setCaptainsValidated(!captainsValidated)} className="w-4 h-4 text-[#2f5d50] accent-[#2f5d50]" />
               <span className="font-bold text-[#2f5d50] text-[11px]">Los capitanes validan que los equipos están correctos y equilibrados.</span>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep(2)} className="flex-1 py-2 bg-stone-100 text-stone-600 font-bold rounded-xl">← Volver</button>
              <button onClick={() => setStep(4)} disabled={!captainsValidated} className="flex-1 py-2 bg-[#2c4a66] text-white font-bold rounded-xl shadow-xs disabled:opacity-50">Configurar Motor →</button>
            </div>
          </div>
        )}

        {/* PASO 4: REGLAS DEL ALGORITMO (GEMINI) */}
        {step === 4 && (
          <div className="space-y-3.5 text-xs">
            <div className="bg-[#f2eef2] border border-[#ddc9de] rounded-2xl p-3.5 space-y-2">
              <h4 className="font-black text-[#4a3350] text-xs flex items-center gap-1"><span>✨</span> Motor de Cruces Inteligente</h4>
              <p className="text-[11px] text-[#4a3350]">Se procesarán las reglas del formato <strong>{tournamentMode.toUpperCase()}</strong> asegurando que no haya choques de zurdos en la misma pareja y equilibrando el rating.</p>
            </div>
            
            <textarea rows={6} value={customGeminiRules} onChange={e => setCustomGeminiRules(e.target.value)} className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 text-[10px] font-mono leading-tight text-stone-800" />

            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep(tournamentMode === 'equipos' ? 3 : 2)} className="flex-1 py-2 bg-stone-100 text-stone-600 font-bold rounded-xl">← Volver</button>
              <button onClick={handleGenerateWithGemini} disabled={isGenerating} className="flex-1 py-2 bg-gradient-to-r from-[#4a3350] to-[#2c4a66] text-white font-bold rounded-xl shadow-xs flex items-center justify-center gap-1.5">
                {isGenerating ? '🔄 Calculando...' : '✨ Generar Cuadro'}
              </button>
            </div>
          </div>
        )}

        {/* PASO 5: VALIDACIÓN FINAL Y EDICIÓN DEL CUADRANTE */}
        {step === 5 && (
          <div className="space-y-3.5 text-xs">
            <div className="bg-[#eef4f0] border border-[#c7ddc9] p-2.5 rounded-xl flex items-center justify-between">
              <div>
                <span className="font-black text-[#2f5d50] text-xs block">✅ Cuadrante Listo ({tournamentMode.toUpperCase()})</span>
                <span className="text-[10px] text-[#2f5d50]">Puedes editar los cruces manualmente antes de iniciar.</span>
              </div>
              <button onClick={() => setStep(4)} className="text-[10px] bg-white border border-[#a9c4ad] text-[#2f5d50] font-bold px-2 py-0.5 rounded-md">
                Re-calcular
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {generatedFixture.map((r, rIdx) => (
                <div key={r.round} className="bg-stone-50 p-2 rounded-xl border border-stone-200 space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-stone-500 mb-1">
                    <span className="uppercase text-stone-900">{r.phase || `Ronda ${r.round}`}</span>
                    <span>⏱️ {r.timeLabel}</span>
                  </div>
                  {(r.matches || []).map((m, mIdx) => (
                    <div key={m.id || mIdx} className="bg-white p-1.5 rounded-lg border border-stone-200 text-[10px]">
                      {editingMatchInfo?.id === m.id ? (
                        <div className="space-y-1.5 p-1">
                          <input type="text" value={editingMatchInfo.court} onChange={e => setEditingMatchInfo({...editingMatchInfo, court: e.target.value})} className="w-full border rounded p-1 font-bold bg-stone-50" placeholder="Pista"/>
                          <input type="text" value={editingMatchInfo.team1} onChange={e => setEditingMatchInfo({...editingMatchInfo, team1: e.target.value})} className="w-full border rounded p-1 font-semibold" placeholder="Pareja 1"/>
                          <input type="text" value={editingMatchInfo.team2} onChange={e => setEditingMatchInfo({...editingMatchInfo, team2: e.target.value})} className="w-full border rounded p-1 font-semibold" placeholder="Pareja 2"/>
                          <div className="flex gap-1 pt-1">
                             <button onClick={() => setEditingMatchInfo(null)} className="flex-1 bg-stone-100 text-stone-600 py-1 rounded font-bold">Cancelar</button>
                             <button onClick={handleSaveInlineMatchEdit} className="flex-1 bg-[#2f5d50] text-white py-1 rounded font-bold">Guardar Cambios</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center group">
                          <span className="bg-[#f2eef2] text-[#4a3350] font-bold px-1.5 py-0.5 rounded truncate max-w-[60px]">{m.court}</span>
                          <div className="flex items-center gap-1 overflow-hidden mx-1 flex-1 justify-center">
                            <span className="truncate font-semibold">{m.team1}</span>
                            <span className="text-stone-400 font-bold text-[9px]">vs</span>
                            <span className="truncate font-semibold">{m.team2}</span>
                          </div>
                          <button onClick={() => setEditingMatchInfo({...m, rIdx, mIdx})} className="text-[10px] text-stone-400 hover:text-[#2c4a66] px-1 font-bold opacity-50 group-hover:opacity-100" title="Editar este partido">
                            ✏️
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <button onClick={handleLaunchTournament} className="w-full py-2.5 bg-[#2f5d50] hover:bg-[#2f5d50] text-white font-bold rounded-xl shadow-xs mt-2 text-sm">
              🚀 Iniciar Torneo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
function MatchVisualScoreModal({ isOpen, onClose, title, subtitle, team1Name, team2Name, p1Players = [], p2Players = [], onSaveScore }) {
  const [winnerTeam, setWinnerTeam] = useState(null);

  const [sets, setSets] = useState([
    { t1: 0, t2: 0 },
    { t1: 0, t2: 0 },
    { t1: 0, t2: 0 }
  ]);
  
  if (!isOpen) return null;

  const handleScoreChange = (setIndex, teamKey, delta) => {
    setSets(prev => {
      const updated = [...prev];
      const curVal = updated[setIndex][teamKey];
      const nextVal = Math.max(0, Math.min(12, curVal + delta));
      updated[setIndex] = { ...updated[setIndex], [teamKey]: nextVal };
      return updated;
    });
  };

  const handleAddSet = () => {
    if (sets.length < 5) {
      setSets(prev => [...prev, { t1: 0, t2: 0 }]);
    }
  };

  const handleRemoveSet = () => {
    if (sets.length > 2) {
      setSets(prev => prev.slice(0, -1));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!winnerTeam) {
      alert('Por favor, selecciona expresamente cuál es la Pareja Ganadora (Pareja 1 o Pareja 2).');
      return;
    }

    let setsT1 = 0;
    let setsT2 = 0;
    const playedSets = sets.filter(s => s.t1 > 0 || s.t2 > 0);

    playedSets.forEach(s => {
      if (s.t1 > s.t2) setsT1++;
      if (s.t2 > s.t1) setsT2++;
    });

    if (playedSets.length > 0) {
      if (winnerTeam === 1 && setsT2 > setsT1) {
        alert('⚠️ Incongruencia detectada: Has seleccionado la Pareja 1 como ganadora, pero los sets introducidos dan como ganador a la Pareja 2. Corrige los sets o la pareja seleccionada.');
        return;
      }
      if (winnerTeam === 2 && setsT1 > setsT2) {
        alert('⚠️ Incongruencia detectada: Has seleccionado la Pareja 2 como ganadora, pero los sets introducidos dan como ganador a la Pareja 1. Corrige los sets o la pareja seleccionada.');
        return;
      }
    }

    let composedScore = '';
    if (playedSets.length > 0) {
      composedScore = playedSets.map(s => `${s.t1}-${s.t2}`).join(', ');
    } else {
      composedScore = `Ganador Pareja ${winnerTeam}`;
    }

    onSaveScore(winnerTeam, composedScore);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 text-left">
      <div className="bg-white rounded-3xl max-w-sm w-full max-h-[92vh] overflow-y-auto p-5 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b pb-2">
          <div>
            <h3 className="text-sm font-black uppercase text-[#4a3350]">{title}</h3>
            <p className="text-[10px] text-stone-400 font-bold">{subtitle || 'Marcador Oficial'}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-xl font-bold">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="font-black text-stone-800 block mb-1.5 text-[11px] uppercase tracking-wide">
              1. Pareja Ganadora (Obligatorio seleccionar una) *
            </label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setWinnerTeam(1)}
                className={`w-full p-2.5 rounded-2xl border text-left transition flex flex-col gap-1 ${
                  winnerTeam === 1
                    ? 'bg-[#eef2f6]/90 border-[#2c4a66] ring-2 ring-[#9fb4c7] text-[#2c4a66] shadow-xs'
                    : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                    winnerTeam === 1 ? 'bg-[#2c4a66] text-white' : 'bg-stone-200 text-stone-700'
                  }`}>
                    Pareja 1
                  </span>
                  {winnerTeam === 1 && <span className="text-[10px] font-black text-[#2c4a66]">🏆 GANADORES SELECCIONADOS</span>}
                </div>

                <div className="flex items-center gap-2">
                  {p1Players.length > 0 ? (
                    p1Players.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 flex-1 min-w-0">
                        <UserAvatar name={p.name} photo={p.photo} size="xs" />
                        <span className="font-bold text-xs truncate">{p.name}</span>
                      </div>
                    ))
                  ) : (
                    <span className="font-bold text-xs truncate">{team1Name}</span>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setWinnerTeam(2)}
                className={`w-full p-2.5 rounded-2xl border text-left transition flex flex-col gap-1 ${
                  winnerTeam === 2
                    ? 'bg-[#faf3e7]/90 border-[#6b4d1c] ring-2 ring-[#d9b97c] text-[#6b4d1c] shadow-xs'
                    : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                    winnerTeam === 2 ? 'bg-[#6b4d1c] text-white' : 'bg-stone-200 text-stone-700'
                  }`}>
                    Pareja 2
                  </span>
                  {winnerTeam === 2 && <span className="text-[10px] font-black text-[#6b4d1c]">🏆 GANADORES SELECCIONADOS</span>}
                </div>

                <div className="flex items-center gap-2">
                  {p2Players.length > 0 ? (
                    p2Players.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 flex-1 min-w-0">
                        <UserAvatar name={p.name} photo={p.photo} size="xs" />
                        <span className="font-bold text-xs truncate">{p.name}</span>
                      </div>
                    ))
                  ) : (
                    <span className="font-bold text-xs truncate">{team2Name}</span>
                  )}
                </div>
              </button>
            </div>
          </div>

          <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200 space-y-2.5">
            <div className="flex justify-between items-center">
              <div>
                <label className="font-extrabold text-stone-800 text-[10px] uppercase block">
                  2. Tanteo por Sets (Opcional)
                </label>
                <span className="text-[9px] text-stone-400">Juegos de cada manga (2 a 5 sets)</span>
              </div>
              <div className="flex gap-1">
                {sets.length < 5 && (
                  <button
                    type="button"
                    onClick={handleAddSet}
                    className="px-2 py-0.5 bg-[#2c4a66] hover:bg-[#2c4a66] text-white rounded-md text-[10px] font-bold"
                  >
                    + Set {sets.length + 1}
                  </button>
                )}
                {sets.length > 2 && (
                  <button
                    type="button"
                    onClick={handleRemoveSet}
                    className="px-1.5 py-0.5 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-md text-[10px] font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              {sets.map((setVal, idx) => (
                <div key={idx} className="bg-white p-2 rounded-xl border border-stone-200 flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase text-stone-500 w-14">
                    {idx === 2 ? 'Set 3 (Tie)' : `Set ${idx + 1}`}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleScoreChange(idx, 't1', -1)}
                      className="w-5 h-5 rounded bg-stone-100 font-bold text-xs flex items-center justify-center hover:bg-stone-200"
                    >
                      -
                    </button>
                    <span className="font-black text-stone-900 w-4 text-center text-sm">{setVal.t1}</span>
                    <button
                      type="button"
                      onClick={() => handleScoreChange(idx, 't1', 1)}
                      className="w-5 h-5 rounded bg-stone-100 font-bold text-xs flex items-center justify-center hover:bg-stone-200"
                    >
                      +
                    </button>
                  </div>

                  <span className="font-black text-stone-300 text-xs">/</span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleScoreChange(idx, 't2', -1)}
                      className="w-5 h-5 rounded bg-stone-100 font-bold text-xs flex items-center justify-center hover:bg-stone-200"
                    >
                      -
                    </button>
                    <span className="font-black text-stone-900 w-4 text-center text-sm">{setVal.t2}</span>
                    <button
                      type="button"
                      onClick={() => handleScoreChange(idx, 't2', 1)}
                      className="w-5 h-5 rounded bg-stone-100 font-bold text-xs flex items-center justify-center hover:bg-stone-200"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 bg-stone-100 text-stone-600 font-bold rounded-xl">
              Cancelar
            </button>
            <button type="submit" className="flex-1 py-2 bg-[#4a3350] hover:bg-[#4a3350] text-white font-bold rounded-xl shadow-xs">
              Confirmar Marcador
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LinkPlayerSlotModal({ isOpen, onClose, slotName, allRegisteredPlayers, onConfirmLink, matchId }) {
  const [selectedUserId, setSelectedUserId] = useState('');

  if (!isOpen) return null;

  const handleLink = (e) => {
    e.preventDefault();
    if (!selectedUserId) return;
    const targetUser = allRegisteredPlayers.find(p => p.id === selectedUserId);
    if (!targetUser) return;
    onConfirmLink(matchId, selectedUserId, slotName, targetUser.name);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-left">
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-3">
        <div className="border-b pb-2">
          <h3 className="text-sm font-black text-stone-900">🔗 Vincular Jugador Huérfano</h3>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Enlaza el texto <strong>"{slotName}"</strong> con su perfil oficial para que sus victorias se computen.
          </p>
        </div>

        <form onSubmit={handleLink} className="space-y-3 text-xs">
          <div>
            <label className="block text-[10px] font-bold text-stone-600 mb-1">
              Selecciona el perfil registrado oficial:
            </label>
            <select
              required
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2 font-bold text-stone-800 text-xs"
            >
              <option value="">-- Elige un jugador del club --</option>
              {allRegisteredPlayers.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.group})</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 bg-stone-100 text-stone-600 font-bold rounded-xl">
              Cancelar
            </button>
            <button type="submit" className="flex-1 py-2 bg-[#2c4a66] hover:bg-[#2c4a66] text-white font-bold rounded-xl shadow-xs">
              Vincular Perfil
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// NUEVO MODAL: Permite el intercambio seguro ("swap") entre jugadores de equipos llenos
function SwapPlayerModal({ isOpen, onClose, match, sourcePlayerId, onConfirmSwap }) {
  if (!isOpen || !match || !sourcePlayerId) return null;

  const sourcePlayer = match.players.find(p => p.id === sourcePlayerId);
  if (!sourcePlayer) return null;

  const sourceTeam = Number(sourcePlayer.team || 1);
  const targetTeam = sourceTeam === 1 ? 2 : 1;
  const targetPlayers = match.players.filter(p => Number(p.team || 1) === targetTeam);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-left">
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4">
        <div className="border-b pb-3 flex justify-between items-center">
          <h3 className="text-base font-black text-stone-900">🔄 Intercambio de Jugador</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-xl font-bold">&times;</button>
        </div>
        
        <div className="space-y-3 text-xs">
          <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200 text-center">
            <span className="text-[10px] font-black uppercase text-stone-500 block mb-1">Vas a mover a</span>
            <div className="flex items-center justify-center gap-2">
              <UserAvatar name={sourcePlayer.name} photo={sourcePlayer.photo} size="sm" />
              <span className="font-bold text-sm">{sourcePlayer.name}</span>
            </div>
          </div>

          <div>
            <span className="font-black text-stone-800 text-[11px] uppercase tracking-wide block mb-2">
              Selecciona la acción:
            </span>
            <div className="space-y-2">
              {targetPlayers.map(targetP => (
                <button
                  key={targetP.id}
                  onClick={() => onConfirmSwap(match.id, sourcePlayer.id, targetP.id)}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl border border-stone-200 bg-white hover:bg-[#eef2f6] hover:border-[#9fb4c7] transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl text-[#9fb4c7]">⇄</span>
                    <div className="text-left">
                      <span className="block text-[10px] font-black text-[#2c4a66] uppercase">Intercambiar por</span>
                      <span className="block font-bold text-sm text-stone-900">{targetP.name}</span>
                    </div>
                  </div>
                  <UserAvatar name={targetP.name} photo={targetP.photo} size="xs" />
                </button>
              ))}

              {/* Si hay hueco en la otra pareja, damos la opción de moverlo directamente sin intercambiar con nadie */}
              {targetPlayers.length < 2 && (
                <button
                  onClick={() => onConfirmSwap(match.id, sourcePlayer.id, null)}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-[#a9c4ad] bg-[#eef4f0] text-[#2f5d50] hover:bg-[#eef4f0] transition font-bold"
                >
                  <span className="text-xl">➡️</span> 
                  <span>Mover a hueco libre en Pareja {targetTeam}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function RegisterPlayerForm({ onCancel, onRegister, syncing }) {
  const [newUserName, setNewUserName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserGroup, setNewUserGroup] = useState('Chicos');
  const [newUserPlaytomic, setNewUserPlaytomic] = useState('');
  const [newUserPin, setNewUserPin] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newUserName.trim()) {
      alert('Por favor, introduce tu nombre y apellido.');
      return;
    }
    if (newUserPin.trim().length !== 4) {
      alert('El PIN debe tener exactamente 4 dígitos.');
      return;
    }
    onRegister({
      nombre: newUserName.trim(),
      telefono: newUserPhone.trim(),
      grupo: newUserGroup,
      playtomic: newUserPlaytomic.trim(),
      pin: newUserPin.trim()
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-bold text-stone-300 mb-1">Nombre y Apellido *</label>
        <input type="text" required value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="Ej: Marcos Iglesias" className="w-full bg-stone-700 border border-stone-600 rounded-xl p-2.5 text-xs text-white placeholder-stone-400 focus:outline-none focus:border-[#9fb4c7] font-semibold" />
      </div>
      <div>
        <label className="block text-xs font-bold text-stone-300 mb-1">Teléfono Móvil (WhatsApp) *</label>
        <input type="tel" required value={newUserPhone} onChange={(e) => setNewUserPhone(e.target.value)} placeholder="Ej: 600123456" className="w-full bg-stone-700 border border-stone-600 rounded-xl p-2.5 text-xs text-white placeholder-stone-400 focus:outline-none focus:border-[#9fb4c7] font-semibold" />
      </div>
      <div>
        <label className="block text-xs font-bold text-stone-300 mb-1">¿A qué grupo perteneces? (orientativo)</label>
        <div className="flex gap-2">
          {[{ key: 'Chicos', label: 'Chicos (Jueves)' }, { key: 'Chicas', label: 'Chicas (Martes)' }].map(g => (
            <button type="button" key={g.key} onClick={() => setNewUserGroup(g.key)} className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${newUserGroup === g.key ? 'bg-[#2c4a66] text-white border-[#2c4a66]' : 'bg-stone-700 text-stone-300 border-stone-600'}`}>
              {g.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-stone-400 mt-1">
          Es solo orientativo: el administrador revisará y confirmará tu alta antes de que puedas entrar.
        </p>
      </div>
      <div>
        <label className="block text-xs font-bold text-stone-300 mb-1">Crea tu PIN de 4 cifras (seguridad) *</label>
        <input type="password" maxLength={4} required value={newUserPin} onChange={(e) => setNewUserPin(e.target.value.replace(/\D/g, ''))} placeholder="Ej: 1234" className="w-full bg-stone-700 border border-stone-600 rounded-xl p-2.5 text-xs text-white placeholder-stone-400 focus:outline-none focus:border-[#9fb4c7] font-bold tracking-widest text-center" />
      </div>
      <div>
        <label className="block text-xs font-bold text-stone-300 mb-1">Usuario de Playtomic (opcional)</label>
        <input type="text" value={newUserPlaytomic} onChange={(e) => setNewUserPlaytomic(e.target.value)} placeholder="Ej: marcos-padel" className="w-full bg-stone-700 border border-stone-600 rounded-xl p-2.5 text-xs text-white placeholder-stone-400 focus:outline-none focus:border-[#9fb4c7]" />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-xl text-xs font-bold transition">Volver</button>
        <button type="submit" disabled={syncing} className="flex-1 py-2.5 bg-[#2c4a66] hover:bg-[#9fb4c7] text-white rounded-xl text-xs font-bold shadow-lg transition">{syncing ? 'Guardando...' : 'Crear y Entrar'}</button>
      </div>
    </form>
  );
}

function AddPlaytomicMatchModal({ isOpen, onClose, onAddMatch, onOpenExisting, syncing }) {
  const [playtomicText, setPlaytomicText] = useState('');
  const [manualDate, setManualDate] = useState('');   // AAAA-MM-DD (selector de fecha)
  const [manualTime, setManualTime] = useState('21:00'); // HH:mm
  const [manualLocation, setManualLocation] = useState('Real Club de Tenis de La Coruña');
  const [manualP1, setManualP1] = useState('');
  const [manualP2, setManualP2] = useState('');
  const [manualP3, setManualP3] = useState('');
  const [manualP4, setManualP4] = useState('');
  const [formError, setFormError] = useState('');
  // NUEVO: estado de "enviando" propio del modal + aviso de resultado (duplicado / tardanza / error).
  // Antes, mientras el servidor tardaba, el modal parecía no hacer nada (el botón no cambiaba y
  // no había ningún mensaje), así que se volvía a pegar el mismo partido.
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null);

const isOnlyPlaytomicLink = useMemo(() => {
    const trimmed = playtomicText.trim();
    if (!trimmed) return false;
    const isUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://');
    const hasPlayerCheckmarks = trimmed.includes('✅');
    const hasDateIcons = trimmed.includes('📅') || trimmed.includes('🗓️') || trimmed.toLowerCase().includes('jueves') || trimmed.toLowerCase().includes('martes');
    return isUrl && !hasPlayerCheckmarks && !hasDateIcons;
  }, [playtomicText]);

  useEffect(() => {
    if (!isOpen) {
      setPlaytomicText(''); setManualDate(''); setManualTime('21:00'); setManualP1(''); setManualP2(''); setManualP3(''); setManualP4(''); setFormError('');
      setEnviando(false); setAviso(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Cuántos de los 4 huecos de jugador manual se han rellenado.
  const jugadoresManualesRellenos = [manualP1, manualP2, manualP3, manualP4].filter(p => p.trim()).length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (enviando) return; // protección contra doble toque
    if (!playtomicText.trim()) return;

    // Si solo se ha pegado el enlace (sin el texto plano con fecha/jugadores de Playtomic),
    // antes creábamos igualmente el partido con una fecha de relleno ("Jueves 21:00") y sin
    // jugadores en cuanto se pulsaba "Crear Partido", aunque el usuario no hubiera rellenado
    // nada en el bloque de "Datos adicionales requeridos". Ahora lo bloqueamos: si faltan la
    // fecha/hora o al menos 2 jugadores, no se envía nada y se explica qué falta.
    if (isOnlyPlaytomicLink) {
      if (!manualDate || !manualTime) {
        setFormError('Indica el día y la hora del partido (el enlace que has pegado no los trae).');
        return;
      }
      if (jugadoresManualesRellenos < 2) {
        setFormError('Añade al menos 2 jugadores (el enlace que has pegado no los trae).');
        return;
      }
    }

    setFormError('');
    setAviso(null);
    setEnviando(true);
    let resultado;
    try {
      resultado = await onAddMatch({ playtomicText, isOnlyPlaytomicLink, manualDate, manualTime, manualLocation, manualP1, manualP2, manualP3, manualP4 });
    } finally {
      setEnviando(false);
    }
    // Si se creó bien, el componente principal cierra el modal (y el efecto de arriba lo limpia).
    if (resultado && resultado.status !== 'ok') setAviso(resultado);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-3">
        <h3 className="text-base font-black text-stone-900">Añadir Partido Playtomic</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea rows={4} required disabled={enviando} value={playtomicText} onChange={e => { setPlaytomicText(e.target.value); setFormError(''); setAviso(null); }} placeholder="Pega el texto copiado de Playtomic o el enlace..." className="w-full border rounded-xl p-2.5 text-xs font-semibold disabled:bg-stone-50 disabled:text-stone-500" />
          {isOnlyPlaytomicLink && (
            <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200 space-y-2">
              <span className="text-[10px] font-black uppercase text-[#2c4a66] block">Datos adicionales requeridos</span>
              <span className="text-[10px] text-stone-500 block -mt-1">
                Has pegado solo un enlace, sin los detalles del partido. Rellena esto a mano o no se creará el partido.
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <input type="date" disabled={enviando} value={manualDate} onChange={e => { setManualDate(e.target.value); setFormError(''); }} className="w-full border rounded-lg p-1.5 text-xs font-semibold" aria-label="Día del partido" />
                <input type="time" disabled={enviando} value={manualTime} onChange={e => { setManualTime(e.target.value); setFormError(''); }} className="w-full border rounded-lg p-1.5 text-xs font-semibold" aria-label="Hora del partido" />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input type="text" disabled={enviando} value={manualP1} onChange={e => { setManualP1(e.target.value); setFormError(''); }} placeholder="Jugador 1" className="border rounded-lg p-1.5 text-xs" />
                <input type="text" disabled={enviando} value={manualP2} onChange={e => { setManualP2(e.target.value); setFormError(''); }} placeholder="Jugador 2" className="border rounded-lg p-1.5 text-xs" />
                <input type="text" disabled={enviando} value={manualP3} onChange={e => { setManualP3(e.target.value); setFormError(''); }} placeholder="Jugador 3" className="border rounded-lg p-1.5 text-xs" />
                <input type="text" disabled={enviando} value={manualP4} onChange={e => { setManualP4(e.target.value); setFormError(''); }} placeholder="Jugador 4" className="border rounded-lg p-1.5 text-xs" />
              </div>
            </div>
          )}
          {formError && (
            <div className="bg-[#f6ede6] border border-[#ead3bf] text-[#6b3f29] text-[11px] font-bold rounded-xl p-2">
              ⚠️ {formError}
            </div>
          )}
          {enviando && (
            <div className="bg-[#eef2f6] border border-[#c3d3e0] text-[#2c4a66] text-[11px] font-bold rounded-xl p-2.5">
              ⏳ Creando el partido… puede tardar unos segundos. Por favor, no lo vuelvas a pegar: aparecerá en la lista en cuanto termine.
            </div>
          )}
          {aviso && aviso.status === 'duplicado' && (
            <div className="bg-[#faf3e7] border border-[#d9b97c] text-[#6b4d1c] rounded-xl p-3 space-y-2">
              <p className="text-xs font-black">✋ Este partido ya está en la app{aviso.fecha ? ` (${aviso.fecha})` : ''}.</p>
              <p className="text-[11px] font-medium">
                No se ha creado otro. Si necesitas actualizar algo (jugadores, fecha, hora…), hazlo desde dentro de ese partido con «🔄 Recargar Playtomic» o editando los jugadores.
              </p>
              {aviso.id && (
                <button type="button" onClick={() => onOpenExisting(aviso.id)} className="w-full py-2 bg-[#2c4a66] text-white font-bold text-xs rounded-xl">
                  Ver ese partido
                </button>
              )}
            </div>
          )}
          {aviso && aviso.status === 'timeout' && (
            <div className="bg-[#faf3e7] border border-[#d9b97c] text-[#6b4d1c] text-[11px] font-bold rounded-xl p-2.5">
              ⏱️ El servidor está tardando más de lo normal. Es posible que el partido SÍ se haya creado: cierra esta ventana y mira la lista antes de volver a pegarlo (si lo pegas otra vez y ya existe, la app te avisará y no lo duplicará).
            </div>
          )}
          {aviso && aviso.status === 'error' && (
            <div className="bg-[#f6ede6] border border-[#ead3bf] text-[#6b3f29] text-[11px] font-bold rounded-xl p-2.5">
              ⚠️ {aviso.message || 'No se ha podido crear el partido. Revisa tu conexión e inténtalo de nuevo.'}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={enviando} className="flex-1 py-2 bg-stone-100 font-bold text-xs rounded-xl disabled:opacity-50">{aviso ? 'Cerrar' : 'Cancelar'}</button>
            <button type="submit" disabled={syncing || enviando || (aviso && aviso.status === 'duplicado')} className="flex-1 py-2 bg-[#2c4a66] text-white font-bold text-xs rounded-xl shadow-xs disabled:opacity-50">{enviando ? 'Creando…' : 'Crear Partido'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
// CUSTOM HOOK: Gestiona las llamadas a Google Sheets de forma centralizada y con timeout
function usePadelApi(apiUrl) {
  const [syncing, setSyncing] = useState(false);

  const fetchWithTimeout = async (payload, timeoutMs = 12000) => {
    setSyncing(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'Error en el servidor');
      return data;
      
    } catch (error) {
      clearTimeout(timeoutId);
      // Lanzamos el error hacia arriba para que la función principal haga el Rollback
      throw error; 
    } finally {
      setSyncing(false);
    }
  };

  return { syncing, setSyncing, fetchWithTimeout };
}
// ============================================================================
// ACTUALIZACIÓN FORZADA DE VERSIÓN
// Cuando se despliega una versión nueva en Vercel, el HTML apunta a un bundle con otro hash
// (/assets/index-XXXX.js). Comparamos el bundle que está corriendo con el que sirve ahora el
// servidor y, si difieren, bloqueamos la pantalla y recargamos para que nadie siga trabajando
// con una versión vieja. En desarrollo (sin hash en el script) no hace nada.
// ============================================================================
const CLAVE_RECARGA_VERSION = 'padel_recarga_version_intentada';
const INTERVALO_COMPROBAR_VERSION_MS = 5 * 60 * 1000;

function bundleEnEjecucion() {
  try {
    const scripts = Array.from(document.querySelectorAll('script[type="module"][src]'));
    const s = scripts.map(x => x.getAttribute('src') || '').find(src => /\/assets\/[^"']+\.js/.test(src));
    return s ? s.replace(/^https?:\/\/[^/]+/, '') : null;
  } catch {
    return null;
  }
}

async function bundlePublicado() {
  const resp = await fetch(`/?v=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
  if (!resp.ok) return null;
  const html = await resp.text();
  const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+\.js)"/i)
        || html.match(/<script[^>]+src="([^"]*\/assets\/[^"]+\.js)"[^>]+type="module"/i);
  return m ? m[1].replace(/^https?:\/\/[^/]+/, '') : null;
}

async function recargarConVersionNueva() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.update().catch(() => {})));
    }
    if (window.caches?.keys) {
      const claves = await caches.keys();
      await Promise.all(claves.map(k => caches.delete(k)));
    }
  } catch { /* si falla la limpieza igualmente recargamos */ }
  window.location.reload();
}

function ActualizadorVersion() {
  const [versionNueva, setVersionNueva] = useState(null); // ruta del bundle nuevo
  const [segundos, setSegundos] = useState(5);
  const [atascado, setAtascado] = useState(false);
  const comprobando = useRef(false);

  useEffect(() => {
    const actual = bundleEnEjecucion();
    if (!actual) return undefined; // desarrollo o entorno sin hash: no se comprueba

    const comprobar = async () => {
      if (comprobando.current) return;
      comprobando.current = true;
      try {
        const publicado = await bundlePublicado();
        if (publicado && publicado !== actual) {
          setVersionNueva(publicado);
        }
      } catch { /* sin red: se reintenta en la próxima ocasión */ }
      finally { comprobando.current = false; }
    };

    const t0 = setTimeout(comprobar, 4000);
    const iv = setInterval(comprobar, INTERVALO_COMPROBAR_VERSION_MS);
    const alVolver = () => { if (document.visibilityState === 'visible') comprobar(); };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('online', comprobar);
    window.addEventListener('focus', comprobar);
    return () => {
      clearTimeout(t0);
      clearInterval(iv);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('online', comprobar);
      window.removeEventListener('focus', comprobar);
    };
  }, []);

  // Cuenta atrás + recarga. Antes de recargar se comprueba que no se haya intentado ya recargar
  // por esta misma versión (evita bucles si el navegador/Service Worker sigue sirviendo la vieja).
  useEffect(() => {
    if (!versionNueva) return undefined;
    let yaIntentada = null;
    try { yaIntentada = sessionStorage.getItem(CLAVE_RECARGA_VERSION); } catch { /* ignore */ }
    if (yaIntentada === versionNueva) {
      setAtascado(true);
      return undefined;
    }
    setSegundos(5);
    const iv = setInterval(() => {
      setSegundos(s => {
        if (s <= 1) {
          clearInterval(iv);
          try { sessionStorage.setItem(CLAVE_RECARGA_VERSION, versionNueva); } catch { /* ignore */ }
          recargarConVersionNueva();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [versionNueva]);

  if (!versionNueva) return null;

  const actualizarAhora = () => {
    try { sessionStorage.setItem(CLAVE_RECARGA_VERSION, versionNueva); } catch { /* ignore */ }
    recargarConVersionNueva();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-stone-900/80 backdrop-blur-sm p-6" role="alertdialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
        <div className="text-4xl mb-2">🔄</div>
        <h2 className="text-lg font-black text-stone-900">Hay una versión nueva de la app</h2>
        {atascado ? (
          <p className="text-sm text-stone-600 mt-2">
            Tu navegador sigue mostrando la versión anterior. Pulsa el botón para forzar la actualización; si persiste, cierra y vuelve a abrir la app.
          </p>
        ) : (
          <p className="text-sm text-stone-600 mt-2">
            Para evitar que trabajes con una versión antigua, la app se recargará automáticamente en {segundos} s. Al volver te contaremos qué hay de nuevo.
          </p>
        )}
        <button
          onClick={actualizarAhora}
          className="mt-4 w-full py-3 bg-[#2c4a66] hover:bg-[#9fb4c7] text-white rounded-xl text-sm font-bold shadow transition"
        >
          Actualizar ahora
        </button>
      </div>
    </div>
  );
}

// Envoltorio: el actualizador vive fuera de la app para funcionar también en login / pantallas de espera.
export default function App() {
  return (
    <>
      <ActualizadorVersion />
      <GestorAtras />
      <AppPrincipal />
      <IndicadorActividad />
    </>
  );
}

// APLICACIÓN PRINCIPAL COMPLETA
function AppPrincipal() {
  const [apiUrl] = useState(() => localStorage.getItem('padel_api_url') || DEFAULT_API_URL);
  const { syncing, setSyncing, fetchWithTimeout } = usePadelApi(apiUrl);
  // NUEVO: la app arranca en la pantalla de "Inicio" (resumen + accesos directos) en vez de
  // caer directo en la lista de Partidos sin contexto.
  const [activeTab, setActiveTab] = useState('inicio');
  const [rankingType, setRankingType] = useState('hibrido');

  const [players, setPlayers] = useState(() => {
    try {
      const cached = localStorage.getItem('padel_cached_players');
      return cached ? JSON.parse(cached) : FALLBACK_USERS;
    } catch {
      return FALLBACK_USERS;
    }
  });

  const [matches, setMatches] = useState(() => {
    try {
      const cached = localStorage.getItem('padel_cached_matches');
      return cached ? JSON.parse(cached) : FALLBACK_MATCHES;
    } catch {
      return FALLBACK_MATCHES;
    }
  });

  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [selectedDinnerDate, setSelectedDinnerDate] = useState('');
  const [showDinnerHistory, setShowDinnerHistory] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  // Novedades: pendientes si esta versión de novedades aún no la ha visto este navegador.
  const [novedadesPendientes, setNovedadesPendientes] = useState(() => leerNovedadesVistas() !== VERSION_NOVEDADES);
  const [inspectedUser, setInspectedUser] = useState(null);

  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('padel_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [filterTime, setFilterTime] = useState('semana');
  // NUEVO: buscador de la pantalla de Partidos — por jugador(es), estado y fecha exacta.
  const [searchPlayer, setSearchPlayer] = useState('');
  const [searchStatus, setSearchStatus] = useState('todos');
  const [searchDate, setSearchDate] = useState('');
  const [targetPinUser, setTargetPinUser] = useState(null);

  const [showRegisterForm, setShowRegisterForm] = useState(false);


  const [showAddModal, setShowAddModal] = useState(false);
  

  const [showReloadPlaytomicModal, setShowReloadPlaytomicModal] = useState(false);
  const [reloadPlaytomicText, setReloadPlaytomicText] = useState('');

  const [showEditPlayersModal, setShowEditPlayersModal] = useState(false);
  const [editPlayerSlots, setEditPlayerSlots] = useState(['', '', '', '']);
  // Estado de los dos formularios "pesados" de un partido (recargar Playtomic / cambiar suplentes):
  // 'guardando' = esperando al servidor, 'actualizando' = guardado, trayendo los datos nuevos.
  const [modalTrabajando, setModalTrabajando] = useState('');
  const [modalError, setModalError] = useState('');

  const [showScoreModal, setShowScoreModal] = useState(false);
  const [linkingSlot, setLinkingSlot] = useState(null);
  const [swapModalData, setSwapModalData] = useState(null); // NUEVO ESTADO PARA EL MODAL DE INTERCAMBIO
  const [allDinnerGuests, setAllDinnerGuests] = useState(() => {
    try {
      const cached = localStorage.getItem('padel_cached_dinners');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [loadingDinnerId, setLoadingDinnerId] = useState(null);

  // NUEVO (control de gasto de cena): un ticket (foto + líneas OCR revisadas) por cada cena de
  // jueves/martes — ver GUARDAR_TICKET_CENA/OCR_TICKET_CENA en el backend.
  const [dinnerTickets, setDinnerTickets] = useState(() => {
    try {
      const cached = localStorage.getItem('padel_cached_dinner_tickets');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [showTournamentWizard, setShowTournamentWizard] = useState(false);
  // NUEVO: el modal de creación de torneo permanece siempre montado (solo hace
  // "return null" internamente cuando isOpen=false), así que sus useState
  // (nombre, jugadores seleccionados, cuadro generado...) conservaban los
  // valores del torneo anterior cada vez que se volvía a abrir. Cambiando esta
  // "key" cada vez que se abre, forzamos a React a desmontar y montar una
  // instancia nueva del modal, con todos sus campos limpios desde cero.
  const [tournamentWizardKey, setTournamentWizardKey] = useState(0);
  const [activeTournaments, setActiveTournaments] = useState(() => {
    const saved = localStorage.getItem('padel_ctc_tournaments');
    return saved ? JSON.parse(saved) : [];
  });

  const [reportingTournamentMatch, setReportingTournamentMatch] = useState(null);
  const [activeTournamentId, setActiveTournamentId] = useState(null);
  const [tournamentSubTab, setTournamentSubTab] = useState({});

  const [inviteTournamentId, setInviteTournamentId] = useState(null);
  const [invitePlayerId, setInvitePlayerId] = useState(null);

  // NUEVO: preferencias de avisos push personalizables por usuario — el aviso de los
  // lunes (opt-in) y las combinaciones día+hora para los avisos de reserva en Playtomic.
  // Ids repetidos detectados por el backend en hojas clave (se avisa al administrador).
  const [idsDuplicados, setIdsDuplicados] = useState([]);
  const [alertPreferences, setAlertPreferences] = useState(() => {
    try {
      const cached = localStorage.getItem('padel_cached_alert_prefs');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [reservationAlerts, setReservationAlerts] = useState(() => {
    try {
      const cached = localStorage.getItem('padel_cached_reservation_alerts');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  // PACHANGA: propuestas de partido (convocatorias) y su interfaz.
  const [convocatorias, setConvocatorias] = useState(() => {
    try {
      const cached = localStorage.getItem('padel_cached_convocatorias');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [disponibilidades, setDisponibilidades] = useState(() => {
    try {
      const cached = localStorage.getItem('padel_cached_disponibilidades');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  // Datos con los que se abre el modal cuando se propone un partido a gente concreta (desde Disponibles).
  const [contactoPre, setContactoPre] = useState(null);
  const [showConvModal, setShowConvModal] = useState(false);
  const [partidoOferta, setPartidoOferta] = useState(null); // partido desde el que se ofrece plaza
  const [convResaltada, setConvResaltada] = useState(null);
  const [convTrabajando, setConvTrabajando] = useState({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const torneoParam = params.get('torneo');
    const playerParam = params.get('p');
    const convocatoriaParam = params.get('convocatoria');
    if (convocatoriaParam) {
      // Enlace de un aviso de "nueva propuesta de partido": abre Pachanga resaltando esa propuesta.
      setConvResaltada(convocatoriaParam);
      setActiveTab('pachanga');
    }

    if (torneoParam) {
      setInviteTournamentId(torneoParam);
      setActiveTab('torneos');
      setActiveTournamentId(torneoParam);
    }
    if (playerParam) {
      setInvitePlayerId(playerParam);
    }
  }, []);

  const isTournamentGuestSession = useMemo(() => {
    if (inviteTournamentId) return true;
    if (currentUser && (currentUser.group || '').toLowerCase() === 'torneo') return true;
    return false;
  }, [inviteTournamentId, currentUser]);

  // BUG CORREGIDO: a pesar del nombre (heredado de cuando solo existía el grupo de los jueves),
  // esta variable es la que da acceso a toda la app aislada de un grupo — Partidos, Cenas,
  // Rankings, Bote e Inicio — para CUALQUIER grupo de club real, no solo "Chicos". Solo
  // comprobaba 'chicos', así que cualquier jugador con grupo 'chicas' quedaba tratado exactamente
  // igual que un invitado de torneo sin acceso a nada más: perdían toda su app aislada de los
  // martes. El resto del código (myGroup, groupMatches, etc.) ya filtraba correctamente por el
  // grupo real de cada uno; el único punto que lo cortaba en seco era este.
  const isThursdayMember = useMemo(() => {
    if (isTournamentGuestSession) return false;
    if (!currentUser) return false;
    const g = (currentUser.group || '').toLowerCase();
    return g === 'chicos' || g === 'chicas';
  }, [currentUser, isTournamentGuestSession]);

  // NUEVO: quién es el administrador (ver ADMIN_PLAYER_ID) — decide si se ve el menú de
  // administración (altas pendientes + ascender invitados de torneo a Chicos/Chicas).
  const isAdmin = Boolean(currentUser && currentUser.id === ADMIN_PLAYER_ID);

  // Qué hace el "atrás" del móvil: cierra lo que haya encima, de arriba abajo. Devuelve true si
  // cerró algo; false si ya estamos en la pantalla raíz (entonces GestorAtras gestiona la salida).
  manejadorAtrasRef.current = () => {
    // Pantalla de acceso (sin usuario)
    if (!currentUser) {
      if (targetPinUser) { setTargetPinUser(null); return true; }
      if (showRegisterForm) { setShowRegisterForm(false); return true; }
      return false;
    }
    // Ventanas / modales, el último abierto primero
    if (novedadesPendientes) { marcarNovedadesVistas(); setNovedadesPendientes(false); return true; }
    if (swapModalData) { setSwapModalData(null); return true; }
    if (linkingSlot) { setLinkingSlot(null); return true; }
    if (showScoreModal) { setShowScoreModal(false); return true; }
    if (showEditPlayersModal) { if (!modalTrabajando) setShowEditPlayersModal(false); return true; }
    if (showReloadPlaytomicModal) { if (!modalTrabajando) setShowReloadPlaytomicModal(false); return true; }
    if (showConvModal) { setShowConvModal(false); return true; }
    if (showAddModal) { setShowAddModal(false); return true; }
    if (reportingTournamentMatch) { setReportingTournamentMatch(null); return true; }
    if (showTournamentWizard) { setShowTournamentWizard(false); return true; }
    if (showRulesModal) { setShowRulesModal(false); return true; }
    if (inspectedUser) { setInspectedUser(null); return true; }
    // Detalle de partido → lista
    if (selectedMatchId && activeTab === 'partidos') { setSelectedMatchId(null); return true; }
    // Cualquier otra pestaña → pantalla raíz
    const pestanaRaiz = isThursdayMember ? 'inicio' : 'torneos';
    if (activeTab !== pestanaRaiz) { setActiveTab(pestanaRaiz); return true; }
    return false;
  };

  // NUEVO: altas (autorregistros de Chicos/Chicas) esperando a que el administrador las
  // valide — usado tanto para el contador en la campanita de administración como dentro de
  // la propia pantalla de administración.
  const pendingApprovalPlayers = useMemo(
    () => players.filter(p => p.estadoAprobacion === 'PENDIENTE'),
    [players]
  );
  const pendingApprovalCount = pendingApprovalPlayers.length;

  // NUEVO: invitados de torneo (participantes que no son ya socios de Chicos/Chicas)
  // agrupados por torneo, para que el administrador pueda "subirlos" al grupo real desde su
  // menú — sin tocar la pantalla de cada torneo, que ya es bastante compleja de por sí.
  const promotableTournamentGuests = useMemo(() => {
    const porTorneo = [];
    activeTournaments.forEach(t => {
      const candidatos = (t.participants || []).filter(p => {
        const clubUser = players.find(u => u.id === p.id || normalizeName(u.name) === normalizeName(p.name));
        const grupoActual = (clubUser ? clubUser.group : 'torneo') || 'torneo';
        if (grupoActual === 'chicos' || grupoActual === 'chicas') return false;
        // NUEVO: el administrador solo ve aquí a quien el organizador del torneo ya ha
        // validado (ver handleValidateClubRequest) — nunca a todos los invitados sin más.
        return p.solicitudClub === 'VALIDADO';
      });
      if (candidatos.length) {
        porTorneo.push({ tournamentId: t.id, tournamentName: t.name || 'Torneo CTC', guests: candidatos });
      }
    });
    return porTorneo;
  }, [activeTournaments, players]);

  // NUEVO: la campanita de Administración suma altas pendientes + invitados ya validados por
  // su organizador — así el administrador ve de un vistazo que hay algo esperando en
  // cualquiera de las dos listas, sin tener que entrar a comprobarlo.
  const pendingAdminCount = pendingApprovalCount + promotableTournamentGuests.reduce((acc, g) => acc + g.guests.length, 0);

  // NUEVO (control de altas): un alta de Chicos/Chicas que todavía no ha sido validada por el
  // administrador no debe entrar a la app — solo a torneos/invitados no les afecta este
  // control, porque a ellos no los valida nadie por aquí (los invita el propio administrador
  // a mano, uno a uno, con el enlace personalizado).
  const accesoBloqueadoPorAprobacion = Boolean(
    currentUser &&
    currentUser.group !== 'torneo' &&
    (currentUser.estadoAprobacion === 'PENDIENTE' || currentUser.estadoAprobacion === 'RECHAZADO')
  );

  useEffect(() => {
    if (currentUser && !isThursdayMember && !accesoBloqueadoPorAprobacion) {
      setActiveTab('torneos');
    }
  }, [currentUser, isThursdayMember, accesoBloqueadoPorAprobacion]);

  // "reintento" cuenta las veces seguidas que se ha descartado la respuesta por llegar "vieja".
  const fetchData = async (silent = false, reintento = 0) => {
    // Si mientras esperamos estos datos se guarda algo (o ya había algo guardándose), la respuesta
    // puede no incluir ese cambio y, al pintarla, haría "desaparecer" lo que el usuario acaba de ver.
    // En ese caso se descarta y se vuelve a pedir un instante después (como máximo 2 veces).
    const marcaActividad = actividadRed.marca();
    const habiaCambiosEnCurso = actividadRed.hayCambiosEnCurso();
    try {
      if (!silent) setSyncing(true);
      // "jugador" permite al servidor filtrar las propuestas para quien pregunta (vetos, invitaciones).
      const urlConBypass = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}nocache=${Date.now()}${currentUser ? `&jugador=${encodeURIComponent(currentUser.id)}` : ''}`;
      const res = await fetch(urlConBypass, { method: 'GET', redirect: 'follow' });
      const json = await res.json();
      const puedeEstarVieja = habiaCambiosEnCurso || actividadRed.huboInicioDesde(marcaActividad) || actividadRed.hayCambiosEnCurso();
      if (json.ok && puedeEstarVieja && reintento < 2) {
        setTimeout(() => fetchData(true, reintento + 1), 1500);
        return;
      }
      if (json.ok) {
        if (json.jugadores) {
          setPlayers(json.jugadores);
          localStorage.setItem('padel_cached_players', JSON.stringify(json.jugadores));
          if (currentUser) {
            // Si por un error de datos hubiera dos jugadores con el mismo id, no nos quedamos a
            // ciegas con el primero (así una persona acababa viendo el perfil de otra): nos
            // quedamos con el que coincide en nombre; si ninguno coincide, con el primero.
            const mismasId = json.jugadores.filter(u => u.id === currentUser.id);
            const fresh = mismasId.length > 1
              ? (mismasId.find(u => normalizeName(u.name) === normalizeName(currentUser.name)) || mismasId[0])
              : mismasId[0];
            if (fresh) {
              setCurrentUser(fresh);
              localStorage.setItem('padel_current_user', JSON.stringify(fresh));
            }
          }
        }
        if (json.partidos) {
          setMatches(json.partidos);
          localStorage.setItem('padel_cached_matches', JSON.stringify(json.partidos));
        }
        if (json.torneos) {
          // BLINDAJE: si por cualquier motivo el Sheet llegara a tener dos filas
          // con el mismo id de torneo (p.ej. por una condición de carrera antigua
          // al crearlo), nos quedamos solo con una entrada por id en el frontend
          // para que nunca se vea duplicado en la app, aunque el Sheet no esté limpio.
          const torneosSinDuplicados = [];
          const idsVistos = new Set();
          json.torneos.forEach(t => {
            if (!t || !t.id || idsVistos.has(t.id)) return;
            idsVistos.add(t.id);
            torneosSinDuplicados.push(t);
          });
          setActiveTournaments(torneosSinDuplicados);
          localStorage.setItem('padel_ctc_tournaments', JSON.stringify(torneosSinDuplicados));
        }
        if (json.invitadosCena) {
          setAllDinnerGuests(json.invitadosCena);
          localStorage.setItem('padel_cached_dinners', JSON.stringify(json.invitadosCena));
        }
        if (json.preferenciasAlertas) {
          setAlertPreferences(json.preferenciasAlertas);
          localStorage.setItem('padel_cached_alert_prefs', JSON.stringify(json.preferenciasAlertas));
        }
        if (json.alertasReserva) {
          setReservationAlerts(json.alertasReserva);
          localStorage.setItem('padel_cached_reservation_alerts', JSON.stringify(json.alertasReserva));
        }
        if (Array.isArray(json.disponibilidades)) {
          setDisponibilidades(json.disponibilidades);
          localStorage.setItem('padel_cached_disponibilidades', JSON.stringify(json.disponibilidades));
        }
        if (Array.isArray(json.convocatorias)) {
          setConvocatorias(json.convocatorias);
          localStorage.setItem('padel_cached_convocatorias', JSON.stringify(json.convocatorias));
        }
        setIdsDuplicados(Array.isArray(json.idsDuplicados) ? json.idsDuplicados : []);
        if (json.ticketsCena) {
          setDinnerTickets(json.ticketsCena);
          localStorage.setItem('padel_cached_dinner_tickets', JSON.stringify(json.ticketsCena));
        }
      }
    } catch (e) {
      console.warn('Sync error:', e);
    } finally {
      if (!silent) setSyncing(false);
    }
  };

  // NUEVO: Cola de sincronización serializada para los torneos.
  // Antes, cada acción (crear, marcar visto, validar capitán, confirmar cena,
  // mover de equipo, etc.) lanzaba su propio fetch POST de forma independiente.
  // Si dos de esas acciones ocurrían casi a la vez para el mismo torneo recién
  // creado (típicamente: crear torneo + el aviso automático de "marcar como
  // visto" que salta justo al entrar en la pestaña Torneos), ambas peticiones
  // podían llegar al backend casi en paralelo; como GUARDAR_TORNEO busca la
  // fila existente por id antes de decidir si actualiza o añade una fila nueva,
  // si ninguna de las dos ve todavía la fila de la otra, las dos acaban
  // añadiendo una fila nueva con el mismo id → torneo duplicado en el Sheet.
  // Forzando aquí que todas las escrituras de torneo se ejecuten en fila (una
  // detrás de otra, nunca en paralelo) eliminamos esa condición de carrera
  // desde el propio frontend, sin depender de cómo responda el backend.
  const tournamentSyncQueueRef = useRef(Promise.resolve());
  const syncTorneoToCloud = (payload) => {
    const run = () => fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).catch(e => console.error('Error al sincronizar torneo en la nube:', e));

    const next = tournamentSyncQueueRef.current.then(run, run);
    tournamentSyncQueueRef.current = next;
    return next;
  };

  useEffect(() => {
    fetchData(true);
  }, [apiUrl]);

  // Al iniciar sesión (o cambiar de usuario) se vuelven a pedir los datos: el servidor filtra las
  // propuestas de Pachanga según quién pregunta (vetos e invitaciones).
  const idUsuarioActual = currentUser ? currentUser.id : '';
  useEffect(() => {
    if (idUsuarioActual) fetchData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idUsuarioActual]);

  // Cuando una acción falla (ver el indicador de actividad de arriba), la pantalla vuelve a cargar los
  // datos del servidor para no quedarse mostrando un cambio que no se guardó.
  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;
  useEffect(() => {
    const alResincronizar = () => { fetchDataRef.current(true); };
    window.addEventListener('ctc:resincronizar', alResincronizar);
    return () => window.removeEventListener('ctc:resincronizar', alResincronizar);
  }, []);

  const handleUserClick = (user) => setTargetPinUser(user);

  const handlePinSuccess = (validatedUser) => {
    setTargetPinUser(null);
    setCurrentUser(validatedUser);
    localStorage.setItem('padel_current_user', JSON.stringify(validatedUser));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('padel_current_user');
    setSelectedMatchId(null);
  };

  const handleSaveLevel = async (idJugador, newLevel) => {
    setPlayers(prev => prev.map(p => p.id === idJugador ? { ...p, level: newLevel } : p));
    if (currentUser && currentUser.id === idJugador) {
      setCurrentUser(prev => ({ ...prev, level: newLevel }));
    }

    try {
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ACTUALIZAR_NIVEL_JUGADOR', idJugador, nivel: newLevel })
      });
    } catch (e) {
      console.warn('Error guardando nivel:', e);
    }
  };

  const handleRegisterUser = async (userData) => {
    setSyncing(true);
    // "Solo Torneo" ya no es una opción de este formulario (ese acceso solo se concede por
    // invitación personalizada, nunca se autoelige) — aquí solo cabe Chicos o Chicas, y ambas
    // son orientativas: el administrador tiene que validar el alta de todas formas.
    const assignedGroup = String(userData.grupo || '').trim().toLowerCase() === 'chicas' ? 'chicas' : 'chicos';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'REGISTRAR_JUGADOR',
          nombre: userData.nombre,
          telefono: userData.telefono,
          grupo: assignedGroup,
          playtomic: userData.playtomic,
          pin: userData.pin
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const json = await response.json();

      if (json && json.ok) {
        const newUserId = json.id || 'u_' + Date.now() + '_' + sufijoAleatorioId();
        const createdUser = {
          id: newUserId,
          name: userData.nombre,
          phone: userData.telefono,
          group: assignedGroup,
          photo: '',
          level: 3.5,
          isLeftHanded: false,
          pJ: 0, pG: 0, cSi: 0, cNo: 0,
          ptsDeportivo: 0, ptsBarandas: 0, hibrido: 0,
          titulo: 'Fichaje Estrella ⭐',
          deuda: 0,
          pin: userData.pin,
          // NUEVO (control de altas): toda alta nueva por este formulario queda pendiente de
          // que el administrador la valide desde su menú — por eso, aunque aquí mismo guardamos
          // la sesión, la pantalla principal no se mostrará todavía (ver el control de
          // "estadoAprobacion" justo antes del render de la app).
          estadoAprobacion: 'PENDIENTE'
        };

        handlePinSuccess(createdUser);
        setShowRegisterForm(false);
        fetchData(true);
      } else if (json && json.codigo === 'TELEFONO_DUPLICADO') {
        // Ese teléfono ya pertenece a otra persona registrada: no se entra con su id.
        alert('⚠️ ' + (json.error || 'Este teléfono ya está registrado con otro nombre.'));
      } else {
        alert('No se pudo registrar: ' + ((json && json.error) || 'Error en el servidor de Google Sheets.'));
      }
    } catch (err) {
      console.error('Error en registro:', err);
      if (err.name === 'AbortError') {
        alert('La conexión con el servidor ha tardado demasiado. Comprueba tu conexión e inténtalo de nuevo.');
      } else {
        alert('Ocurrió un error al enviar el registro. Por favor, vuelve a intentarlo.');
      }
    } finally {
      setSyncing(false);
    }
  };

  // NUEVO (control de altas por el administrador): aprobar o rechazar una alta pendiente.
  // Actualización optimista local (igual que el resto de acciones de esta pantalla) y
  // sincronización en segundo plano, para que el administrador vea el efecto al instante.
  const handleApprovePlayer = (idJugador) => {
    setPlayers(prev => prev.map(p => p.id === idJugador ? { ...p, estadoAprobacion: 'APROBADO' } : p));
    fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'APROBAR_JUGADOR', idJugador })
    }).catch(e => console.warn('Error aprobando jugador:', e));
  };

  const handleRejectPlayer = (idJugador) => {
    setPlayers(prev => prev.map(p => p.id === idJugador ? { ...p, estadoAprobacion: 'RECHAZADO' } : p));
    fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'RECHAZAR_JUGADOR', idJugador })
    }).catch(e => console.warn('Error rechazando jugador:', e));
  };

  // NUEVO (control de acceso del administrador): sube a un invitado de torneo al grupo real
  // de Chicos o Chicas. Le vaciamos el PIN local a propósito (igual que hace el backend), para
  // que la próxima vez que ese jugador entre, PinModal lo detecte sin PIN y le toque crear uno
  // nuevo — ver CREAR_PIN_JUGADOR y el "modoCrearPin" de PinModal.
  const handlePromoteGuestToGroup = (idJugador, nombre, grupo) => {
    setPlayers(prev => {
      const existe = prev.some(p => p.id === idJugador);
      if (existe) {
        return prev.map(p => p.id === idJugador ? { ...p, group: grupo, pin: '', estadoAprobacion: 'APROBADO' } : p);
      }
      return [...prev, {
        id: idJugador, name: nombre, group: grupo, photo: '', level: 3.5, isLeftHanded: false,
        pJ: 0, pG: 0, cSi: 0, cNo: 0, ptsDeportivo: 0, ptsBarandas: 0, hibrido: 0,
        titulo: 'Fichaje Estrella ⭐', deuda: 0, pin: '', estadoAprobacion: 'APROBADO'
      }];
    });
    fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'PROMOVER_JUGADOR_GRUPO', idJugador, nombre, grupo })
    }).catch(e => console.warn('Error promocionando jugador:', e))
      .finally(() => fetchData(true));
  };

  const handleUpdateUserData = async (idJugador, payload) => {
    setCurrentUser(prev => ({ ...prev, ...payload }));
    setPlayers(prev => prev.map(p => p.id === idJugador ? { ...p, ...payload } : p));
    localStorage.setItem('padel_current_user', JSON.stringify({ ...currentUser, ...payload }));

    try {
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ACTUALIZAR_DATOS_PERFIL', idJugador, ...payload })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handlePhotoUploaded = async (idJugador, photoBase64) => {
    setCurrentUser(prev => ({ ...prev, photo: photoBase64 }));
    setPlayers(prev => prev.map(p => p.id === idJugador ? { ...p, photo: photoBase64 } : p));
    localStorage.setItem('padel_current_user', JSON.stringify({ ...currentUser, photo: photoBase64 }));

    try {
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'SUBIR_FOTO', idJugador, photoBase64 })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteMatchComplete = async (matchId) => {
    setMatches(prev => prev.filter(m => m.id !== matchId));
    setSelectedMatchId(null);

    try {
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ELIMINAR_PARTIDO', idPartido: matchId })
      });
    } catch (e) {
      console.error(e);
      fetchData();
    }
  };


  // Candado contra envíos dobles: mientras una creación está en curso, cualquier otro intento
  // (doble toque, o volver a pegar el mismo partido porque tarda) se ignora.
  const creandoPartidoRef = useRef(false);

  // Devuelve { status: 'ok' | 'duplicado' | 'timeout' | 'error' | 'ocupado', ... } para que el
  // modal enseñe qué ha pasado en vez de quedarse "mudo".
  const handleAddPlaytomicMatch = async (data) => {
    if (creandoPartidoRef.current) return { status: 'ocupado' };

    let payloadText = data.playtomicText.trim();

    if (data.isOnlyPlaytomicLink) {
      // El modal ya valida que manualDate y al menos 2 jugadores estén rellenos antes de
      // llegar aquí, así que ya no hace falta (ni conviene) un valor de relleno tipo
      // "Jueves 21:00" que antes se colaba en silencio cuando el usuario dejaba esto vacío.
      // Se manda con día, mes y AÑO completos: p.ej. "jueves, 08 oct 2026, 21:00".
      const dObj = parseMatchDateObject(`${data.manualDate} ${data.manualTime || '21:00'}`);
      const diasTxt = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      const mesesTxt = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      const hhmm = `${String(dObj.getHours()).padStart(2, '0')}:${String(dObj.getMinutes()).padStart(2, '0')}`;
      const d = `${diasTxt[dObj.getDay()]}, ${String(dObj.getDate()).padStart(2, '0')} ${mesesTxt[dObj.getMonth()]} ${dObj.getFullYear()}, ${hhmm}`;
      const loc = data.manualLocation.trim() || 'Real Club de Tenis de La Coruña';
      const p1 = data.manualP1.trim() ? `✅ ${data.manualP1.trim()}` : '';
      const p2 = data.manualP2.trim() ? `✅ ${data.manualP2.trim()}` : '';
      const p3 = data.manualP3.trim() ? `✅ ${data.manualP3.trim()}` : '';
      const p4 = data.manualP4.trim() ? `✅ ${data.manualP4.trim()}` : '';

      payloadText = `📅 ${d}\n📍 ${loc}\n${data.playtomicText.trim()}\n${p1}\n${p2}\n${p3}\n${p4}`.trim();
    }

    // CONTROL ANTI-DUPLICADOS (1/2): comprobación inmediata con los partidos ya cargados en la
    // app — mismo enlace de Playtomic que uno existente (no cancelado). Sin llamar al servidor.
    const yaExiste = buscarPartidoConMismoLink(matches, payloadText);
    if (yaExiste) return { status: 'duplicado', id: yaExiste.id, fecha: yaExiste.date };

    creandoPartidoRef.current = true;
    setSyncing(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'CREAR_PARTIDO_PLAYTOMIC', textoCrudo: payloadText, grupo: myGroup }),
        signal: controller.signal
      });
      const responseData = await res.json();
      // CONTROL ANTI-DUPLICADOS (2/2): el backend (con candado, así que ve también lo que otra
      // persona acaba de subir) también comprueba enlace y, sin enlace, fecha+jugadores.
      if (responseData.ok && responseData.duplicado) {
        fetchData(true);
        return { status: 'duplicado', id: responseData.idExistente, fecha: responseData.fechaExistente };
      }
      if (responseData.ok) {
        setShowAddModal(false);
        fetchData();
        return { status: 'ok' };
      }
      return { status: 'error', message: responseData.error || 'El servidor no ha podido crear el partido.' };
    } catch (err) {
      console.error(err);
      if (err && err.name === 'AbortError') {
        // Puede que el servidor sí lo haya creado aunque no nos haya dado tiempo a verlo.
        setTimeout(() => fetchData(true), 4000);
        return { status: 'timeout' };
      }
      return { status: 'error', message: 'No se ha podido conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.' };
    } finally {
      clearTimeout(timeoutId);
      creandoPartidoRef.current = false;
      setSyncing(false);
    }
  };

  // Abre el detalle de un partido ya existente (desde el aviso de "ya está en la app").
  const handleOpenExistingMatch = (id) => {
    setShowAddModal(false);
    setActiveTab('partidos');
    setSelectedMatchId(id);
  };

  // ---------------------------------------------------------------------------
  // PACHANGA (convocatorias de partido)
  // ---------------------------------------------------------------------------
  const postConvocatoria = async (payload, timeoutMs = 45000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      return await res.json();
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return { ok: false, timeout: true, error: 'El servidor está tardando más de lo normal. Mira la lista dentro de unos segundos antes de repetirlo.' };
      }
      return { ok: false, error: 'No se ha podido conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.' };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const marcarConvTrabajando = (id, valor) => setConvTrabajando(prev => ({ ...prev, [id]: valor }));

  const abrirNuevaConvocatoria = () => {
    setContactoPre(null);
    setPartidoOferta(null);
    setShowConvModal(true);
  };

  // Desde un partido ya creado: "ha fallado alguien, ofrezco su plaza".
  const abrirOfertaPlaza = (m) => {
    const d = parseMatchDateObject(m.date, m.fechaISO);
    if (!d) { alert('No he podido leer la fecha de este partido.'); return; }
    const dos = (n) => String(n).padStart(2, '0');
    setContactoPre(null);
    setPartidoOferta({
      id: m.id,
      dia: `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`,
      hora: `${dos(d.getHours())}:${dos(d.getMinutes())}`,
      lugar: m.location || '',
      url: m.url || '',
      jugadores: (m.players || []).map(p => ({ id: p.id, name: p.name }))
    });
    setShowConvModal(true);
  };

  // Desde "Disponibles": propuesta dirigida a las personas marcadas, con día y hora ya rellenos.
  const abrirContactoDisponibles = ({ dia, hora, jugadores }) => {
    setContactoPre({ dia, hora, jugadores });
    setPartidoOferta(null);
    setShowConvModal(true);
  };

  const handleGuardarDisponibilidad = async (data) => {
    const res = await postConvocatoria({ action: 'GUARDAR_DISPONIBILIDAD', idJugador: currentUser.id, ...data }, 30000);
    if (res.ok) {
      fetchData(true);
      if (res.duplicado) return { ok: false, error: 'Ya tenías publicada esa misma franja.' };
      return { ok: true };
    }
    return { ok: false, error: res.error || 'No se ha podido guardar tu disponibilidad.' };
  };

  const handleEliminarDisponibilidad = async (d) => {
    setDisponibilidades(prev => (prev || []).filter(x => x.id !== d.id));
    // Si falla, el indicador global enseña el aviso y recarga los datos (la franja vuelve a la lista).
    await postConvocatoria({ action: 'ELIMINAR_DISPONIBILIDAD', idDisponibilidad: d.id, idJugador: currentUser.id }, 30000);
    fetchData(true);
  };

  const handleCrearConvocatoria = async (data) => {
    const res = await postConvocatoria({ action: 'CREAR_CONVOCATORIA', idJugador: currentUser.id, grupo: myGroup, ...data });
    if (res.ok && res.duplicado) return { ok: false, error: 'Ya tienes una propuesta igual para ese día y esa hora.' };
    if (res.ok) {
      setShowConvModal(false);
      setConvResaltada(res.id || null);
      setActiveTab('pachanga');
      fetchData(true);
      return { ok: true };
    }
    return { ok: false, error: res.error || 'No se ha podido crear la propuesta.' };
  };

  const handleResponderConvocatoria = async (c, respuesta) => {
    if (convTrabajando[c.id]) return;
    // Si quien organiza ya te había confirmado, bajarte libera tu plaza y se le avisa: se pide confirmación.
    const respuestaPrevia = (c.respuestas || []).find(r => r.idJugador === currentUser.id);
    if (respuesta === 'NO' && respuestaPrevia && respuestaPrevia.asignado) {
      if (!window.confirm(`${c.creadorNombre} ya te había confirmado para este partido. Si dices que no puedes, se libera tu plaza y se le avisará. ¿Seguro?`)) return;
    }
    const antes = convocatorias;
    marcarConvTrabajando(c.id, true);
    // Cambio al instante en pantalla; el servidor tiene la última palabra. Decir "puedo" NO ocupa
    // plaza: las plazas las asigna quien organiza. Decir "no puedo" retira una confirmación previa.
    setConvocatorias(prev => (prev || []).map(x => {
      if (x.id !== c.id) return x;
      const previa = (x.respuestas || []).find(r => r.idJugador === currentUser.id);
      const nueva = { idJugador: currentUser.id, nombre: currentUser.name, respuesta, fecha: '', asignado: respuesta === 'SI' && Boolean(previa && previa.asignado) };
      const respuestas = [...(x.respuestas || []).filter(r => r.idJugador !== currentUser.id), nueva];
      const base = typeof x.totalDisponibles === 'number' ? x.totalDisponibles - (previa && previa.respuesta === 'SI' ? 1 : 0) : 0;
      return {
        ...x,
        respuestas,
        totalDisponibles: base + (respuesta === 'SI' ? 1 : 0),
        estado: respuestas.filter(r => r.asignado).length >= x.plazas ? 'COMPLETA' : 'ABIERTA'
      };
    }));
    const res = await postConvocatoria({ action: 'RESPONDER_CONVOCATORIA', idConvocatoria: c.id, idJugador: currentUser.id, respuesta }, 30000);
    marcarConvTrabajando(c.id, false);
    if (!res.ok) {
      setConvocatorias(antes);
      alert(res.error || 'No se ha podido guardar tu respuesta.');
    }
    fetchData(true);
  };

  // Quien organiza confirma (o quita) a alguien de entre quienes han dicho que pueden.
  const handleAsignarConvocatoria = async (c, idElegido, asignar) => {
    if (convTrabajando[c.id]) return;
    const antes = convocatorias;
    marcarConvTrabajando(c.id, true);
    setConvocatorias(prev => (prev || []).map(x => {
      if (x.id !== c.id) return x;
      const respuestas = (x.respuestas || []).map(r => r.idJugador === idElegido ? { ...r, asignado: asignar } : r);
      return { ...x, respuestas, estado: respuestas.filter(r => r.asignado).length >= x.plazas ? 'COMPLETA' : 'ABIERTA' };
    }));
    const res = await postConvocatoria({ action: 'ASIGNAR_CONVOCATORIA', idConvocatoria: c.id, idJugador: currentUser.id, idElegido, asignar }, 30000);
    marcarConvTrabajando(c.id, false);
    if (!res.ok) {
      setConvocatorias(antes);
      alert(res.error || 'No se ha podido asignar la plaza.');
    }
    fetchData(true);
  };

  const handleCancelarConvocatoria = async (c) => {
    if (convTrabajando[c.id]) return;
    if (!window.confirm('¿Cancelar esta propuesta? Se avisará a quienes ya se habían apuntado.')) return;
    marcarConvTrabajando(c.id, true);
    const res = await postConvocatoria({ action: 'CANCELAR_CONVOCATORIA', idConvocatoria: c.id, idJugador: currentUser.id }, 30000);
    marcarConvTrabajando(c.id, false);
    if (res.ok) {
      setConvocatorias(prev => (prev || []).filter(x => x.id !== c.id));
    } else {
      alert(res.error || 'No se ha podido cancelar la propuesta.');
    }
    fetchData(true);
  };

  // Crea el partido real con los apuntados (mismo proceso que "Añadir partido") y enlaza la propuesta.
  // Oficial o amistoso lo decide la regla general de siempre (jueves Chicos / martes Chicas = liga).
  const handleConvertirConvocatoria = async (c) => {
    if (convTrabajando[c.id]) return;
    const apuntados = (c.respuestas || []).filter(r => r.respuesta === 'SI' && r.asignado).length;
    if (apuntados === 0) return;
    const total = apuntados + 1;
    if (!window.confirm(`Se creará el partido con ${total} ${total === 1 ? 'jugador' : 'jugadores'} (tú y quienes has confirmado). ¿Continuar?`)) return;
    marcarConvTrabajando(c.id, true);
    try {
      const crear = await postConvocatoria({ action: 'CREAR_PARTIDO_PLAYTOMIC', textoCrudo: textoPartidoDesdeConvocatoria(c, players), grupo: c.grupo });
      let idPartido = null;
      if (crear.ok && crear.duplicado) idPartido = crear.idExistente || null;
      else if (crear.ok) idPartido = crear.id || null;
      if (!idPartido) {
        if (crear.timeout) setTimeout(() => fetchData(true), 4000);
        alert(crear.timeout
          ? 'El servidor tarda más de lo normal. Puede que el partido sí se haya creado: mira la lista de Partidos antes de repetirlo.'
          : (crear.error || 'No se ha podido crear el partido.'));
        return;
      }
      const enlazar = await postConvocatoria({ action: 'CONVERTIR_CONVOCATORIA', idConvocatoria: c.id, idJugador: currentUser.id, idPartido }, 30000);
      if (!enlazar.ok) {
        alert('El partido se ha creado, pero no he podido marcar la propuesta como convertida: ' + (enlazar.error || 'inténtalo de nuevo desde Pachanga.'));
      }
      if (crear.duplicado) alert('Ese partido ya estaba en la app, así que te llevo a él en vez de crear otro.');
      await fetchData(true);
      setActiveTab('partidos');
      setSelectedMatchId(idPartido);
    } finally {
      marcarConvTrabajando(c.id, false);
    }
  };

  // Propuesta que ofrece plaza en un partido YA creado: quien organiza añade a los confirmados al partido,
  // cada uno en el hueco de quien se cayó (así conservan el equipo), y la propuesta se cierra.
  const handleAnadirAPartido = async (c) => {
    if (convTrabajando[c.id]) return;
    const partido = matches.find(m => m.id === c.partidoId);
    if (!partido) { alert('No encuentro ese partido: puede que lo hayan borrado.'); return; }
    const actuales = partido.players || [];
    const confirmados = (c.respuestas || [])
      .filter(r => r.respuesta === 'SI' && r.asignado)
      .map(r => ({ id: r.idJugador, name: (players.find(p => p.id === r.idJugador) || {}).name || r.nombre }));
    const yaDentro = (n) => actuales.some(p => p.id === n.id || normalizeName(p.name) === normalizeName(n.name));
    const porAnadir = confirmados.filter(n => !yaDentro(n));

    // Cuatro huecos fijos: 0-1 pareja 1, 2-3 pareja 2.
    const huecos = [null, null, null, null];
    const sobrantes = [];
    [1, 2].forEach(t => {
      actuales.filter(p => Number(p.team || 1) === t).forEach((p, i) => {
        if (i < 2) huecos[(t - 1) * 2 + i] = p; else sobrantes.push(p);
      });
    });
    sobrantes.forEach(p => { const k = huecos.indexOf(null); if (k >= 0) huecos[k] = p; });
    const retirados = c.retirados || [];
    const liberados = [];
    const salen = [];
    huecos.forEach((p, i) => { if (p && retirados.includes(p.id)) { salen.push(p.name); huecos[i] = null; liberados.push(i); } });
    const libres = [...liberados, ...huecos.map((p, i) => (p === null && !liberados.includes(i) ? i : -1)).filter(i => i >= 0)];
    const entran = porAnadir.slice(0, libres.length);
    const sinSitio = porAnadir.slice(libres.length);
    if (entran.length === 0) {
      alert(porAnadir.length === 0
        ? 'Quienes has confirmado ya están en el partido.'
        : 'No queda ningún hueco libre en el partido. Si alguien se ha caído, quítalo antes desde «Cambiar Suplentes».');
      return;
    }
    const lista = entran.map(n => n.name.split(' ')[0]).join(', ');
    const aviso = `Se añadirá a ${lista} al partido${salen.length ? ` (en el hueco de ${salen.map(n => n.split(' ')[0]).join(', ')})` : ''} y la propuesta se cerrará.`
      + (sinSitio.length ? `\n\nSin sitio para: ${sinSitio.map(n => n.name.split(' ')[0]).join(', ')}.` : '');
    if (!window.confirm(`${aviso}\n\n¿Continuar?`)) return;

    const nombres = huecos.map(p => (p ? p.name : ''));
    entran.forEach((n, i) => { nombres[libres[i]] = n.name; });
    marcarConvTrabajando(c.id, true);
    try {
      const res = await postConvocatoria({ action: 'MODIFICAR_JUGADORES_MANUAL', idPartido: partido.id, jugadores: nombres }, 60000);
      if (!res.ok) {
        if (res.timeout) setTimeout(() => fetchData(true), 4000);
        alert(res.timeout
          ? 'El servidor tarda más de lo normal. Puede que ya se haya añadido: mira el partido antes de repetirlo.'
          : (res.error || 'No se ha podido añadir al partido.'));
        return;
      }
      const cerrar = await postConvocatoria({ action: 'CONVERTIR_CONVOCATORIA', idConvocatoria: c.id, idJugador: currentUser.id, idPartido: partido.id }, 30000);
      if (!cerrar.ok) alert('Se ha añadido al partido, pero no he podido cerrar la propuesta: ' + (cerrar.error || 'ciérrala desde Pachanga.'));
      await fetchData(true);
      setActiveTab('partidos');
      setSelectedMatchId(partido.id);
    } finally {
      marcarConvTrabajando(c.id, false);
    }
  };

  // Recargar un partido desde el texto de Playtomic. El formulario se queda abierto y bloqueado mientras
  // el servidor trabaja (con "Guardando…"), y solo se cierra cuando ya se ven los datos nuevos. Si
  // falla, se queda abierto con el motivo y el texto pegado intacto para poder reintentarlo.
  const handleReloadPlaytomic = async (e) => {
    e.preventDefault();
    if (!reloadPlaytomicText.trim() || !selectedMatchId || modalTrabajando) return;

    setModalError('');
    setModalTrabajando('guardando');
    const res = await postConvocatoria({ action: 'ACTUALIZAR_PLAYTOMIC_PARTIDO', idPartido: selectedMatchId, textoCrudo: reloadPlaytomicText }, 60000);
    if (!res.ok) {
      setModalTrabajando('');
      if (res.timeout) {
        setTimeout(() => fetchData(true), 4000);
        setModalError('El servidor está tardando más de lo normal. Puede que sí se haya actualizado: cierra esto y mira el partido antes de repetirlo.');
      } else {
        setModalError(res.error || 'No se ha podido actualizar el partido.');
      }
      return;
    }
    setModalTrabajando('actualizando');
    await fetchData(true);
    setModalTrabajando('');
    setShowReloadPlaytomicModal(false);
    setReloadPlaytomicText('');
  };

  // Cambiar a los 4 jugadores de un partido. El cambio se ve al instante detrás del formulario; el
  // formulario se queda bloqueado ("Guardando…") hasta que el servidor confirma. Si falla, se deshace
  // el cambio en pantalla y el formulario sigue abierto con el motivo.
  const handleSaveManualPlayers = async (e) => {
    e.preventDefault();
    if (!selectedMatchId || modalTrabajando) return;

    const antes = matches;
    const nombres = editPlayerSlots.map(n => String(n || '').trim());
    setModalError('');
    setModalTrabajando('guardando');
    setMatches(prev => prev.map(m => {
      if (m.id !== selectedMatchId) return m;
      const actuales = m.players || [];
      return {
        ...m,
        players: nombres.map((nombre, idx) => {
          if (!nombre) return null; // el servidor también ignora los huecos vacíos
          const team = idx < 2 ? 1 : 2;
          const clave = normalizeName(nombre);
          const yaEstaba = actuales.find(p => normalizeName(p.name) === clave);
          if (yaEstaba) return { ...yaEstaba, team };
          const oficial = players.find(u => normalizeName(u.name) === clave);
          return {
            id: oficial ? oficial.id : nombre,
            name: oficial ? oficial.name : nombre,
            photo: oficial ? (oficial.photo || '') : '',
            phone: oficial ? (oficial.phone || '') : '',
            dinner: 'PENDIENTE', won: 'PENDIENTE', team
          };
        }).filter(Boolean)
      };
    }));

    const res = await postConvocatoria({ action: 'MODIFICAR_JUGADORES_MANUAL', idPartido: selectedMatchId, jugadores: editPlayerSlots }, 60000);
    setModalTrabajando('');
    if (!res.ok) {
      if (res.timeout) {
        // No sabemos si llegó a guardarse: no se deshace a ciegas, se pide el estado real.
        setTimeout(() => fetchData(true), 4000);
        setModalError('El servidor está tardando más de lo normal. Puede que sí se haya guardado: cierra esto y comprueba los jugadores antes de repetirlo.');
      } else {
        setMatches(antes);
        setModalError(res.error || 'No se han podido guardar los jugadores. No se ha cambiado nada.');
      }
      return;
    }
    setShowEditPlayersModal(false);
    fetchData(true);
  };

  const handleConfirmLinkSlot = async (matchId, officialId, rawSlotName, officialName) => {
    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;
      return {
        ...m,
        players: (m.players || []).map(p => {
          if (p.name === rawSlotName) {
            return { ...p, id: officialId, name: officialName };
          }
          return p;
        })
      };
    }));

    try {
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'VINCULAR_JUGADOR',
          idPartido: matchId,
          idJugador: officialId,
          nombreOriginal: rawSlotName
        })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleSoloCena = async (rawDateStr, newState) => {
    if (!currentUser || !rawDateStr) return;
    const cleanDate = extractCleanDate(rawDateStr);
    const normMe = normalizeName(currentUser.name);

    const userMatchToday = groupMatches.find(m => {
      const matchDateClean = extractCleanDate(m.date, m.fechaISO);
      if (matchDateClean !== cleanDate) return false;
      return (m.players || []).some(p => p.id === currentUser.id || normalizeName(p.name) === normMe);
    });

    if (userMatchToday) {
      const mySlot = userMatchToday.players.find(p => p.id === currentUser.id || normalizeName(p.name) === normMe);
      if (mySlot) {
        await handleUpdateDinner(userMatchToday.id, mySlot.id, mySlot.name, newState);
        alert(`¡Entendido ${currentUser.name}! Como juegas partido el ${etiquetaFechaDia(cleanDate)}, hemos confirmado tu cena directamente en tu partido.`);
        return;
      }
    }

    setAllDinnerGuests(prev => {
      const filtered = prev.filter(g => {
        const guestNameNorm = normalizeName(g.name);
        const guestDate = extractCleanDate(g.target || g.cleanTarget);
        return !(guestNameNorm === normMe && guestDate === cleanDate);
      });

      if (newState === 'SI') {
        filtered.push({
          id: currentUser.id,
          name: currentUser.name,
          target: cleanDate,
          cleanTarget: cleanDate,
          group: myGroup,
          photo: currentUser.photo || '',
          phone: currentUser.phone || '',
          isClubPlayer: true
        });
      }
      return filtered;
    });

    try {
      setSyncing(true);
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ 
          action: 'APUNTARSE_SOLO_CENA', 
          fecha: cleanDate, 
          nombreJugador: currentUser.name, 
          estado: newState,
          idJugador: currentUser.id,
          grupo: myGroup 
        })
      });
      const data = await res.json();
      if (data.ok) {
        await fetchData(true);
      }
    } catch (e) {
      console.error('Error al actualizar cena sin partido:', e);
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdateDinner = async (matchId, targetId, targetName, newStatus) => {
    setLoadingDinnerId(targetId || targetName);
    
    // 1. BACKUP: Guardamos el estado exacto de los partidos antes del cambio
    const previousMatches = [...matches];

    // 2. ACTUALIZACIÓN OPTIMISTA: Cambiamos la interfaz al instante para que sea súper rápida
    setMatches(prevMatches => prevMatches.map(m => {
      if (m.id !== matchId) return m;
      return {
        ...m,
        players: (m.players || []).map(p => {
          if (p.id === targetId || normalizeName(p.name) === normalizeName(targetName)) {
            return { ...p, dinner: newStatus };
          }
          return p;
        })
      };
    }));

    // 3. LLAMADA A LA API CON EL NUEVO HOOK
    try {
      await fetchWithTimeout({ 
        action: 'ACTUALIZAR_CENA', 
        idPartido: matchId, 
        idJugador: targetId, 
        nombreJugador: targetName, 
        estado: newStatus 
      });
    } catch (e) {
      // 4. ROLLBACK: Si falla (no hay internet o tarda más de 12s), restauramos el backup
      // El aviso ("No se ha podido guardar la cena…") lo enseña el indicador global de actividad.
      console.error('Fallo al actualizar la cena. Revirtiendo...', e);
      setMatches(previousMatches);
    } finally {
      setLoadingDinnerId(null);
    }
  };

  // NUEVA LÓGICA: Ejecutar el cambio/intercambio en el estado y llamar al Backend.
  // El cambio se ve al instante; las peticiones se esperan (antes salían "al aire" y, si fallaban, la
  // pantalla se quedaba mostrando un cambio que no existía). Si alguna falla se deshace en pantalla y
  // el indicador global enseña el aviso.
  const handleConfirmSwap = async (matchId, sourcePlayerId, targetPlayerId) => {
    const match = matches.find(m => m.id === matchId);
    const sourcePlayer = match.players.find(p => p.id === sourcePlayerId);
    const sourceTeam = Number(sourcePlayer.team || 1);
    const targetTeam = sourceTeam === 1 ? 2 : 1;
    const antes = matches;

    // Cierra el modal de Swap
    setSwapModalData(null);

    if (!targetPlayerId) {
      // Movimiento directo a hueco libre
      setMatches(prev => prev.map(m => {
        if (m.id !== matchId) return m;
        return {
          ...m,
          players: m.players.map(p => p.id === sourcePlayerId ? { ...p, team: targetTeam } : p)
        };
      }));
      const res = await postConvocatoria({ action: 'CAMBIAR_PAREJA_JUGADOR', idPartido: matchId, idJugador: sourcePlayerId, team: targetTeam }, 30000);
      if (!res.ok) setMatches(antes);
    } else {
      // Intercambio ("Swap") de posiciones entre dos jugadores
      setMatches(prev => prev.map(m => {
        if (m.id !== matchId) return m;
        return {
          ...m,
          players: m.players.map(p => {
            if (p.id === sourcePlayerId) return { ...p, team: targetTeam };
            if (p.id === targetPlayerId) return { ...p, team: sourceTeam };
            return p;
          })
        };
      }));
      // Las dos peticiones salen a la vez (mover a P1 al otro equipo y a P2 al suyo) y se espera a ambas.
      const resultados = await Promise.all([
        postConvocatoria({ action: 'CAMBIAR_PAREJA_JUGADOR', idPartido: matchId, idJugador: sourcePlayerId, team: targetTeam }, 30000),
        postConvocatoria({ action: 'CAMBIAR_PAREJA_JUGADOR', idPartido: matchId, idJugador: targetPlayerId, team: sourceTeam }, 30000)
      ]);
      // Si solo una de las dos se guardó, el estado real del servidor es mixto: se muestra tal cual está.
      if (resultados.some(r => !r.ok)) {
        setMatches(antes);
        fetchData(true);
      }
    }
  };

 const handleSaveRegularMatchScore = async (winningTeamNum, composedScoreText) => {
    if (!currentMatch) return;

    const winningPlayers = currentMatch.players.filter(p => Number(p.team || 1) === Number(winningTeamNum));
    const ganadorIds = winningPlayers.map(p => p.id);
    const ganadorNombres = winningPlayers.map(p => p.name);

    const parejasMap = {};
    (currentMatch.players || []).forEach(p => {
      parejasMap[p.id] = p.team || 1;
      parejasMap[p.name] = p.team || 1;
    });

    // 1. BACKUP: Guardamos el estado exacto de los partidos
    const previousMatches = [...matches];

    // 2. ACTUALIZACIÓN OPTIMISTA: Cambiamos la interfaz al instante y cerramos el modal
    setMatches(prev => prev.map(m => {
      if (m.id !== currentMatch.id) return m;
      return {
        ...m,
        status: 'FINALIZADO',
        score: composedScoreText,
        players: m.players.map(p => ({
          ...p,
          won: Number(p.team || 1) === Number(winningTeamNum) ? 'SI' : 'NO'
        }))
      };
    }));
    setShowScoreModal(false);

    // 3. LLAMADA A LA API CON EL NUEVO HOOK ANTI-FALLOS
    try {
      await fetchWithTimeout({
        action: 'GUARDAR_RESULTADO',
        idPartido: currentMatch.id,
        marcador: composedScoreText,
        ganadorIds: ganadorIds,
        ganadorNombres: ganadorNombres,
        parejas: parejasMap,
        reiniciar: false
      });
    } catch (e) {
      // 4. ROLLBACK: Si falla, restauramos la interfaz y avisamos al usuario
      // El aviso ("No se ha podido guardar el resultado…") lo enseña el indicador global de actividad.
      console.error('Fallo al guardar el resultado. Revirtiendo...', e);
      setMatches(previousMatches);
    }
  };

  const handleResetMatchScore = async (matchId) => {
    const previousMatches = [...matches];
    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;
      return {
        ...m,
        status: 'PROGRAMADO',
        score: '',
        players: m.players.map(p => ({ ...p, won: 'PENDIENTE' }))
      };
    }));

    // Se espera al servidor; si falla se deshace el cambio (el aviso lo enseña el indicador global).
    try {
      await fetchWithTimeout({
        action: 'GUARDAR_RESULTADO',
        idPartido: matchId,
        marcador: '',
        ganadorIds: [],
        ganadorNombres: [],
        reiniciar: true
      });
    } catch (e) {
      console.error('Fallo al reiniciar el partido. Revirtiendo...', e);
      setMatches(previousMatches);
    }
  };

  const handleNotifyPendingWhatsApp = (playerItem, dateLabel) => {
    const appUrl = window.location.origin;
    const phoneClean = (playerItem.phone || '').replace(/\D/g, '');
    const cleanPhoneTarget = phoneClean.length === 9 ? '34' + phoneClean : phoneClean;

    const msg = `🎾 *Pádel CTC - Confirmación de Cena*\n\n¡Hola ${playerItem.name}! Tienes pendiente confirmar si te quedas a cenar para la jornada del *${dateLabel}*.\n\n👉 Confirma tu asistencia aquí: ${appUrl}`;
    
    if (cleanPhoneTarget) {
      window.open(`https://api.whatsapp.com/send?phone=${cleanPhoneTarget}&text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
    }
  };

  const handleShareClubWhatsapp = (dateTarget, yesList, guestsList) => {
    const totalCount = yesList.length + guestsList.length;
    const msg = `Hola, para cenar este ${dateTarget} seremos un total de ${totalCount} personas. Muchas gracias.`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURI(msg)}`, '_blank');
  };

  const handleTournamentCreated = async (newT) => {
    // Evitamos duplicar localmente si por lo que sea ya existiera un torneo con ese id.
    const updated = [newT, ...activeTournaments.filter(t => t.id !== newT.id)];
    setActiveTournaments(updated);
    localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updated));

    // IMPORTANTE: esperamos a que termine de guardarse en la nube ANTES de cambiar
    // a la pestaña "torneos". Si cambiábamos de pestaña antes, el efecto que marca
    // el torneo como "visto" saltaba casi al instante y lanzaba su propia escritura
    // GUARDAR_TORNEO para el mismo id mientras esta primera creación todavía estaba
    // en curso: las dos peticiones podían no verse la una a la otra en el Sheet y
    // acababan creando dos filas con el mismo id (torneo duplicado).
    await syncTorneoToCloud({ action: 'GUARDAR_TORNEO', torneo: newT });
    setActiveTab('torneos');
    fetchData(true);
  };

  const handleDeleteTournament = async (tId) => {
    const updated = activeTournaments.filter(t => t.id !== tId);
    setActiveTournaments(updated);
    localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updated));

    await syncTorneoToCloud({ action: 'ELIMINAR_TORNEO', idTorneo: tId });
    fetchData(true);
  };

  const handleSharePlayerPersonalLink = (tournamentItem, playerItem) => {
    const link = `${window.location.origin}${window.location.pathname}?torneo=${tournamentItem.id}&p=${playerItem.id}`;
    const cleanPhone = (playerItem.phone || '').replace(/\D/g, '');
    const phoneTarget = cleanPhone.length === 9 ? '34' + cleanPhone : cleanPhone;

    const msg = `🎾 *Torneo CTC - Convocatoria Oficial*\n\n¡Hola ${playerItem.name}! Has sido convocado para jugar el *${tournamentItem.name}*.\n\n👉 Entra directamente con tu acceso personal aquí:\n${link}`;

    if (phoneTarget) {
      window.open(`https://api.whatsapp.com/send?phone=${phoneTarget}&text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
    }
  };

  const handleSaveTournamentScore = async (winningTeamNum, composedScoreText) => {
    if (!activeTournamentId || !reportingTournamentMatch) return;
    const matchId = reportingTournamentMatch.id;

    let tournamentToSync = null;

    const updatedTournaments = activeTournaments.map(t => {
      if (t.id !== activeTournamentId) return t;

      let winningTeamName = '';
      let losingTeamName = '';
      let winningTeamIds = [];
      let losingTeamIds = [];

      const updatedRounds = (t.rounds || []).map(r => ({
        ...r,
        matches: (r.matches || []).map(m => {
          if (m.id === matchId) {
            winningTeamName = winningTeamNum === 1 ? m.team1 : m.team2;
            losingTeamName = winningTeamNum === 1 ? m.team2 : m.team1;
            winningTeamIds = winningTeamNum === 1 ? (m.team1Ids || []) : (m.team2Ids || []);
            losingTeamIds = winningTeamNum === 1 ? (m.team2Ids || []) : (m.team1Ids || []);
            return {
              ...m,
              score: composedScoreText,
              winner: winningTeamNum,
              status: 'FINALIZADO'
            };
          }
          return m;
        })
      }));

      // PROPAGACIÓN GENÉRICA PARA EL CUADRO DE ELIMINACIÓN DIRECTA: cada partido de una ronda
      // posterior sabe (team1Source/team2Source) de qué partido depende su hueco, así que en
      // cuanto ese partido de origen se finaliza, rellenamos el nombre real del ganador. Esto
      // funciona para cualquier tamaño de cuadro, no solo para el caso fijo de 8 jugadores.
      if (t.mode === 'eliminatorio' && winningTeamName) {
        updatedRounds.forEach(r => {
          r.matches.forEach(m => {
            if (m.team1Source === matchId) {
              m.team1 = winningTeamName;
              m.team1Ids = winningTeamIds;
              delete m.team1Source;
            }
            if (m.team2Source === matchId) {
              m.team2 = winningTeamName;
              m.team2Ids = winningTeamIds;
              delete m.team2Source;
            }
            if (m.team1LoserFrom === matchId) {
              m.team1 = losingTeamName;
              m.team1Ids = losingTeamIds;
              delete m.team1LoserFrom;
            }
            if (m.team2LoserFrom === matchId) {
              m.team2 = losingTeamName;
              m.team2Ids = losingTeamIds;
              delete m.team2LoserFrom;
            }
          });
        });
      }

      let updatedTeams = t.teams || [];
      if (t.mode === 'equipos' && updatedTeams.length === 2) {
        let scoreA = 0;
        let scoreB = 0;
        updatedRounds.forEach(r => {
          r.matches.forEach(m => {
            if (m.winner === 1) scoreA++;
            if (m.winner === 2) scoreB++;
          });
        });
        updatedTeams = [
          { ...updatedTeams[0], score: scoreA },
          { ...updatedTeams[1], score: scoreB }
        ];
      }

      // NUEVO (Pozo Continuo en formato escalera): en cuanto los 4 partidos de una ronda
      // tienen ya resultado, calculamos y añadimos la ronda siguiente (quién sube, quién
      // baja de pista), en vez de tenerlas todas generadas desde el principio.
      let finalRounds = updatedRounds;
      if (t.mode === 'pozo' && t.pozoEscalera) {
        const matchRound = updatedRounds.find(r => (r.matches || []).some(m => m.id === matchId));
        if (matchRound) {
          const allDone = (matchRound.matches || []).length > 0 && (matchRound.matches || []).every(m => m.status !== 'PENDIENTE');
          const nextRoundNum = matchRound.round + 1;
          const yaExisteSiguiente = updatedRounds.some(r => r.round === nextRoundNum);
          const totalRounds = t.pozoEscalera.totalRounds || updatedRounds.length;
          if (allDone && !yaExisteSiguiente && matchRound.round < totalRounds) {
            const nuevaRonda = computeNextPozoRound(t, updatedRounds, nextRoundNum);
            if (nuevaRonda) {
              finalRounds = [...updatedRounds, nuevaRonda];
            }
          }
        }
      }

      tournamentToSync = {
        ...t,
        rounds: finalRounds,
        teams: updatedTeams
      };

      return tournamentToSync;
    });

    setActiveTournaments(updatedTournaments);
    localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updatedTournaments));
    setReportingTournamentMatch(null);

    if (tournamentToSync) {
      await syncTorneoToCloud({ action: 'GUARDAR_TORNEO', torneo: tournamentToSync });
      fetchData(true);
    }
  };

  const handleUpdateTournamentDinner = async (tId, participantId, newDinnerStatus) => {
    let tournamentToSync = null;

    const updatedTournaments = activeTournaments.map(t => {
      if (t.id !== tId) return t;
      tournamentToSync = {
        ...t,
        participants: (t.participants || []).map(p => {
          if (p.id === participantId) {
            return { ...p, dinner: newDinnerStatus };
          }
          return p;
        })
      };
      return tournamentToSync;
    });

    setActiveTournaments(updatedTournaments);
    localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updatedTournaments));

    // REDISEÑO MULTIUSUARIO: en vez de reenviar el torneo entero (lo que podía pisar el
    // equipo o la validación que otro jugador acababa de cambiar), tocamos solo la cena
    // de ESTE participante en la hoja dedicada "Torneo_Jugadores".
    if (tournamentToSync) {
      await syncTorneoToCloud({ action: 'ACTUALIZAR_CENA_TORNEO', idTorneo: tId, idJugador: participantId, cena: newDinnerStatus });
    }
  };

  // NUEVO (control de acceso del administrador): un invitado de torneo pide pasar al grupo
  // real de Chicos/Chicas. Esto NO lo mueve de grupo — solo avisa al organizador DE ESE
  // TORNEO (no al administrador) para que valide que de verdad conoce a esta persona. El
  // administrador solo se entera, y solo entonces, si el organizador valida la solicitud (ver
  // handleValidateClubRequest) — así el aviso y la primera validación quedan en manos de quien
  // conoce al invitado, y el administrador solo ejecuta el cambio de grupo final.
  const handleRequestClubJoin = async (tId, idJugador) => {
    const updatedTournaments = activeTournaments.map(t => {
      if (t.id !== tId) return t;
      return {
        ...t,
        participants: (t.participants || []).map(p => p.id === idJugador ? { ...p, solicitudClub: 'SOLICITADO' } : p)
      };
    });
    setActiveTournaments(updatedTournaments);
    localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updatedTournaments));
    await syncTorneoToCloud({ action: 'SOLICITAR_UNION_CLUB', idTorneo: tId, idJugador });
  };

  // NUEVO: el organizador del torneo valida (o rechaza) la solicitud de un invitado suyo.
  // Si la valida, el backend avisa al administrador para que la ejecute desde su menú de
  // Administración — el organizador nunca puede mover a nadie de grupo por sí mismo.
  const handleValidateClubRequest = async (tId, idJugador, aprobado) => {
    const nuevoEstado = aprobado ? 'VALIDADO' : '';
    const updatedTournaments = activeTournaments.map(t => {
      if (t.id !== tId) return t;
      return {
        ...t,
        participants: (t.participants || []).map(p => p.id === idJugador ? { ...p, solicitudClub: nuevoEstado } : p)
      };
    });
    setActiveTournaments(updatedTournaments);
    localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updatedTournaments));
    await syncTorneoToCloud({ action: 'VALIDAR_SOLICITUD_CLUB', idTorneo: tId, idJugador, aprobado });
  };

  const handleShareTournamentDinnerWhatsapp = (tournamentItem) => {
    const attendingCount = (tournamentItem.participants || []).filter(p => p.dinner === 'SI').length;
    const msg = `Hola, para cenar tras el ${tournamentItem.name} seremos un total de ${attendingCount} personas. Muchas gracias.`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURI(msg)}`, '_blank');
  };
  const handleShareTournamentImage = async (tournamentId, tournamentName) => {
    const element = document.getElementById(`tournament-fixture-${tournamentId}`);
    const btn = document.getElementById(`share-btn-${tournamentId}`);
    if (!element || !btn) return;

    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Generando imagen...';
    btn.disabled = true;

    try {
      // Cargamos la librería mágica sin instalar nada en Vercel
      if (!window.html2canvas) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      // Hacemos la "foto" en alta calidad (scale: 2)
      const canvas = await window.html2canvas(element, { 
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true
      });
      
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `Cuadrante_${tournamentName.replace(/\s+/g, '_')}.png`, { type: 'image/png' });
        
        // Si el móvil soporta compartir archivos nativamente (iOS/Android modernos)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: tournamentName,
            text: `🏆 Cuadrante Oficial: ${tournamentName}`,
            files: [file]
          });
        } else {
          // Si es PC o no lo soporta, descargamos la imagen
          const link = document.createElement('a');
          link.download = file.name;
          link.href = URL.createObjectURL(blob);
          link.click();
          alert('✅ Imagen descargada. Ya puedes adjuntarla en WhatsApp Web.');
        }
        btn.innerHTML = originalText;
        btn.disabled = false;
      });
    } catch (error) {
      console.error('Error generando imagen:', error);
      alert('Hubo un error al generar la imagen.');
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  };
  const handleUpdateDraftTeam = async (tId, playerId, teamNum) => {
    let tournamentToSync = null;
    const updatedTournaments = activeTournaments.map(t => {
      if (t.id !== tId) return t;
      tournamentToSync = {
        ...t,
        participants: (t.participants || []).map(p => 
          p.id === playerId ? { ...p, assignedTeam: teamNum } : p
        )
      };
      return tournamentToSync;
    });

    setActiveTournaments(updatedTournaments);
    localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updatedTournaments));

    // REDISEÑO MULTIUSUARIO: tocamos solo el equipo de ESTE jugador en "Torneo_Jugadores",
    // en vez de reenviar el torneo completo (que podía pisar lo que otro capitán u
    // organizador estuviera cambiando en ese mismo instante sobre el mismo torneo).
    if (tournamentToSync) {
      syncTorneoToCloud({ action: 'ACTUALIZAR_EQUIPO_JUGADOR', idTorneo: tId, idJugador: playerId, equipo: teamNum });
    }
  };

  // NUEVO: Validación de capitanes persistida en el propio torneo (y por tanto en Sheets),
  // para que el visto bueno de cada capitán se vea aunque cada uno entre desde su propio móvil.
  // Comprobamos aquí también (no solo en el "disabled" del checkbox) que quien marca la casilla
  // es realmente el capitán designado para ese equipo: ni el organizador ni ningún otro jugador
  // pueden validar en nombre de un capitán.
  const handleSetCaptainValidation = async (tId, captainNum, value) => {
    let tournamentToSync = null;
    let allowed = false;
    const updatedTournaments = activeTournaments.map(t => {
      if (t.id !== tId) return t;

      const isRealCaptain1 = captainNum === 1 && currentUser?.id === t.captain1Id;
      const isRealCaptain2 = captainNum === 2 && currentUser?.id === t.captain2Id;
      allowed = isRealCaptain1 || isRealCaptain2;
      if (!allowed) return t;

      tournamentToSync = {
        ...t,
        captain1Validated: captainNum === 1 ? value : Boolean(t.captain1Validated),
        captain2Validated: captainNum === 2 ? value : Boolean(t.captain2Validated)
      };
      return tournamentToSync;
    });

    if (!allowed) return;

    setActiveTournaments(updatedTournaments);
    localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updatedTournaments));

    // REDISEÑO MULTIUSUARIO: el visto bueno de este capitán ahora es su propia celda en
    // "Torneos" (columna F o G), así el otro capitán, el organizador, o un cambio de equipo
    // de un jugador no pueden pisarlo al guardar algo distinto sobre el mismo torneo.
    if (tournamentToSync) {
      await syncTorneoToCloud({ action: 'VALIDAR_CAPITAN', idTorneo: tId, captainNum, value });
    }
  };

  const handleApproveDraftTeams = async (tId) => {
    let tournamentToSync = null;
    const updatedTournaments = activeTournaments.map(t => {
      if (t.id !== tId) return t;
      // Pasamos el borrador a la fase final
      tournamentToSync = { ...t, status: 'BOCETO_CUADRO' };
      return tournamentToSync;
    });

    setActiveTournaments(updatedTournaments);
    localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updatedTournaments));

    if (tournamentToSync) {
      syncTorneoToCloud({ action: 'APROBAR_EQUIPOS', idTorneo: tId });
    }
  };

  // NUEVO: Marca el torneo como "visto" por el jugador actual (persistido),
  // para que el aviso de "te han convocado a un torneo" desaparezca una vez que ha entrado a verlo.
  const handleMarkTournamentSeen = async (tId) => {
    if (!currentUser) return;
    let tournamentToSync = null;
    const updatedTournaments = activeTournaments.map(t => {
      if (t.id !== tId) return t;
      const seenBy = t.seenBy || [];
      if (seenBy.includes(currentUser.id)) return t;
      tournamentToSync = { ...t, seenBy: [...seenBy, currentUser.id] };
      return tournamentToSync;
    });

    if (!tournamentToSync) return;

    setActiveTournaments(updatedTournaments);
    localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updatedTournaments));

    // REDISEÑO MULTIUSUARIO: "visto por" vive ahora en su propia columna (H), que el
    // backend actualiza sumando un id a la lista en vez de recibir el torneo entero.
    await syncTorneoToCloud({ action: 'MARCAR_VISTO_TORNEO', idTorneo: tId, idUsuario: currentUser.id });
  };

  const currentMatch = matches.find(m => m.id === selectedMatchId);
  const myGroup = (currentUser?.group || 'chicos').toLowerCase();

  // Buscador: cuando hay algún filtro activo (jugador, estado o fecha) se busca en TODO el
  // histórico y se ignoran las pestañas "Esta semana / Próximos" — si no, buscar a alguien o una
  // fecha concreta daría "sin resultados" solo por estar fuera de la pestaña elegida.
  const hayBusquedaPartidos = searchPlayer.trim() !== '' || searchStatus !== 'todos' || searchDate !== '';

  const filteredMatches = useMemo(() => {
    // "marcos juan" → hace falta que cada palabra aparezca en el nombre de algún jugador del
    // partido (sin tildes ni mayúsculas), p.ej. para encontrar los partidos de dos personas.
    const tokens = normalizeName(searchPlayer).split(/[\s,]+/).filter(Boolean);
    return matches.filter(m => {
      if ((m.grupo || 'chicos').toLowerCase() !== myGroup) return false;

      if (hayBusquedaPartidos) {
        if (tokens.length > 0) {
          const nombres = (m.players || []).map(p => normalizeName(p.name));
          if (!tokens.every(t => nombres.some(n => n.includes(t)))) return false;
        }
        if (searchStatus !== 'todos' && computeMatchStatus(m) !== searchStatus) return false;
        if (searchDate) {
          const d = parseMatchDateObject(m.date, m.fechaISO);
          if (!d) return false;
          const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if (clave !== searchDate) return false;
        }
        return true;
      }

      if (filterTime === 'todos') return true;
      if (filterTime === 'semana') return isCurrentWeek(m.date, m.fechaISO);
      if (filterTime === 'proximos') return isUpcoming(m.date, m.fechaISO);
      return true;
    });
  }, [matches, myGroup, filterTime, searchPlayer, searchStatus, searchDate, hayBusquedaPartidos]);

  const groupPlayers = useMemo(() => {
    return players.filter(p => (p.group || 'chicos').toLowerCase() === myGroup);
  }, [players, myGroup]);

  const sortedGroupPlayers = useMemo(() => {
    return [...groupPlayers].sort((a, b) => {
      const aHibrido = Number(a.hibrido) || 0;
      const bHibrido = Number(b.hibrido) || 0;
      const aDep = Number(a.ptsDeportivo) || 0;
      const bDep = Number(b.ptsDeportivo) || 0;
      const aBar = Number(a.ptsBarandas) || 0;
      const bBar = Number(b.ptsBarandas) || 0;
      const aPG = Number(a.pG) || 0;
      const bPG = Number(b.pG) || 0;
      const aPJ = Number(a.pJ) || 0;
      const bPJ = Number(b.pJ) || 0;
      const aCSi = Number(a.cSi) || 0;
      const bCSi = Number(b.cSi) || 0;
      const aCNo = Number(a.cNo) || 0;
      const bCNo = Number(b.cNo) || 0;
      const aDeuda = Number(a.deuda) || 0;
      const bDeuda = Number(b.deuda) || 0;
      const aWinRate = aPJ > 0 ? (aPG / aPJ) : 0;
      const bWinRate = bPJ > 0 ? (bPG / bPJ) : 0;

      if (rankingType === 'deportivo') {
        if (bDep !== aDep) return bDep - aDep;
        if (bPG !== aPG) return bPG - aPG;
        if (bWinRate !== aWinRate) return bWinRate - aWinRate;
        if (bPJ !== aPJ) return bPJ - aPJ;
        return a.name.localeCompare(b.name);
      } else if (rankingType === 'barandas') {
        if (bBar !== aBar) return bBar - aBar;
        if (bCSi !== aCSi) return bCSi - aCSi;
        if (aCNo !== bCNo) return aCNo - bCNo;
        if (bPJ !== aPJ) return bPJ - aPJ;
        return a.name.localeCompare(b.name);
      } else {
        if (bHibrido !== aHibrido) return bHibrido - aHibrido;
        if (bDep !== aDep) return bDep - aDep;
        if (bPG !== aPG) return bPG - aPG;
        if (bCSi !== aCSi) return bCSi - aCSi;
        if (aDeuda !== bDeuda) return aDeuda - bDeuda;
        return a.name.localeCompare(b.name);
      }
    });
  }, [groupPlayers, rankingType]);

  const visibleTournaments = useMemo(() => {
    if (!currentUser) return [];
    return activeTournaments.filter(t => {
      const isParticipant = (t.participants || []).some(
        p => p.id === currentUser.id || normalizeName(p.name) === normalizeName(currentUser.name)
      );
      const isCreator = t.creatorId === currentUser.id;
      const isCoOrg = (t.coOrganizerIds || []).includes(currentUser.id);
      return isParticipant || isCreator || isCoOrg;
    });
  }, [activeTournaments, currentUser]);

  // NUEVO: Cuando el jugador entra a la pestaña Torneos, marcamos como "visto" cualquier
  // torneo en el que participe y que todavía no hubiera abierto, para que su aviso desaparezca.
  useEffect(() => {
    if (activeTab !== 'torneos' || !currentUser) return;
    visibleTournaments.forEach(t => {
      if (!(t.seenBy || []).includes(currentUser.id)) {
        handleMarkTournamentSeen(t.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, visibleTournaments, currentUser]);

  // NUEVO: Lista unificada de "pendientes" del jugador actual, para la pantalla de Avisos.
  const pendingAlerts = useMemo(() => {
    if (!currentUser) return [];
    const alerts = [];
    const myNameNorm = normalizeName(currentUser.name || '');
    const myFirstName = myNameNorm.split(' ')[0];

    // 1. Cena sin confirmar en un partido oficial
    (matches || []).forEach(m => {
      if (!isMatchOfficial(m) || m.status === 'CANCELADO') return;
      const mySlot = (m.players || []).find(p => p.id === currentUser.id || normalizeName(p.name) === myNameNorm);
      if (mySlot && String(mySlot.dinner || '').toUpperCase() === 'PENDIENTE') {
        alerts.push({
          id: `cena-${m.id}`,
          icon: '🍻',
          title: 'Falta por confirmar la cena',
          description: `${fechaCompleta(m.date, m.fechaISO)} · ¿Te quedas al 3º tiempo?`,
          action: () => { setActiveTab('partidos'); setSelectedMatchId(m.id); }
        });
      }
    });

    // 1b. Cena de un torneo (3º Tiempo) sin confirmar
    (activeTournaments || []).forEach(t => {
      if (t.status !== 'ACTIVO' && t.status !== 'BOCETO_EQUIPOS' && t.status !== 'BOCETO_CUADRO') return;
      const myParticipant = (t.participants || []).find(
        p => p.id === currentUser.id || normalizeName(p.name) === myNameNorm
      );
      if (myParticipant && myParticipant.dinner !== 'SI' && myParticipant.dinner !== 'NO') {
        alerts.push({
          id: `cena-torneo-${t.id}`,
          icon: '🍻',
          title: 'Falta por confirmar la cena del torneo',
          description: `${t.name} · ¿Te quedas al 3º tiempo?`,
          action: () => { setActiveTab('torneos'); setTournamentSubTab(prev => ({ ...prev, [t.id]: 'cena' })); }
        });
      }
    });

    // 2. Equipo pendiente de revisar como capitán
    (activeTournaments || []).forEach(t => {
      if (t.status !== 'BOCETO_EQUIPOS') return;
      if (t.captain1Id === currentUser.id && !t.captain1Validated) {
        alerts.push({
          id: `capitan-${t.id}-1`,
          icon: '🛡️',
          title: 'Revisa tu equipo de torneo',
          description: `${t.name} · Eres el Capitán Azul y falta tu visto bueno`,
          action: () => setActiveTab('torneos')
        });
      }
      if (t.captain2Id === currentUser.id && !t.captain2Validated) {
        alerts.push({
          id: `capitan-${t.id}-2`,
          icon: '🛡️',
          title: 'Revisa tu equipo de torneo',
          description: `${t.name} · Eres el Capitán Rojo y falta tu visto bueno`,
          action: () => setActiveTab('torneos')
        });
      }
    });

    // 3. Convocatoria a torneo todavía no vista
    (activeTournaments || []).forEach(t => {
      const isParticipant = (t.participants || []).some(
        p => p.id === currentUser.id || normalizeName(p.name) === myNameNorm
      );
      const alreadySeen = (t.seenBy || []).includes(currentUser.id);
      if (isParticipant && !alreadySeen) {
        alerts.push({
          id: `invite-${t.id}`,
          icon: '📣',
          title: 'Te han convocado a un torneo',
          description: t.name,
          action: () => setActiveTab('torneos')
        });
      }
    });

    // 4a. Partido de liga regular ya jugado sin resultado
    (matches || []).forEach(m => {
      if (m.status === 'CANCELADO') return;
      const mySlot = (m.players || []).find(p => p.id === currentUser.id || normalizeName(p.name) === myNameNorm);
      if (mySlot && computeMatchStatus(m) === 'SIN RESULTADO') {
        alerts.push({
          id: `resultado-${m.id}`,
          icon: '✍️',
          title: 'Falta el resultado de un partido',
          description: `${fechaCompleta(m.date, m.fechaISO)} · Pon el marcador`,
          action: () => { setActiveTab('partidos'); setSelectedMatchId(m.id); }
        });
      }
    });

    // 5. Pachanga: propuestas de partido
    const ahoraConv = Date.now();
    (convocatorias || []).forEach(c => {
      const fechaC = fechaDeConvocatoria(c);
      if (!fechaC || fechaC.getTime() < ahoraConv || !convocatoriaVisiblePara(c, currentUser)) return;
      const abrir = () => { setConvResaltada(c.id); setActiveTab('pachanga'); };
      if (c.creadorId === currentUser.id) {
        const sinDecidir = (c.respuestas || []).filter(r => r.respuesta === 'SI' && !r.asignado).length;
        if (c.estado === 'COMPLETA') {
          alerts.push({
            id: `conv-completa-${c.id}`,
            icon: '✅',
            title: 'Tus plazas están asignadas',
            description: `${etiquetaConvocatoria(c)} · Ya puedes crear el partido`,
            action: abrir
          });
        } else if (sinDecidir > 0) {
          alerts.push({
            id: `conv-candidatos-${c.id}`,
            icon: '🙋',
            title: `${sinDecidir} ${sinDecidir === 1 ? 'persona puede' : 'personas pueden'} jugar tu propuesta`,
            description: `${etiquetaConvocatoria(c)} · Decide quién entra`,
            action: abrir
          });
        }
        return;
      }
      if (c.estado !== 'ABIERTA' || respuestaDe(c, currentUser.id)) return;
      if (tienePartidoEseDia(matches, currentUser, String(c.fechaISO).slice(0, 10))) return;
      alerts.push({
        id: `conv-${c.id}`,
        icon: '🙌',
        title: c.tipo === 'DIRIGIDA' ? `${c.creadorNombre} te propone un partido` : 'Nueva propuesta de partido',
        description: `${c.creadorNombre} · ${etiquetaConvocatoria(c)} · ¿Te apuntas?`,
        action: abrir
      });
    });

    // 4b. DESACTIVADA A PETICIÓN DEL USUARIO: la alerta de "falta el resultado de un
    // partido de torneo" resultaba demasiado intrusiva (se dispara por cada partido de cada
    // ronda, en torneos de varias rondas puede ser muchas veces seguidas). El aviso
    // equivalente para la liga regular de los jueves (bloque 4a, arriba) se mantiene, ya que
    // ahí es un único partido a la semana.

    return alerts;
  }, [matches, activeTournaments, currentUser, convocatorias]);

  // Propuestas de partido vivas que veo yo (para el contador del Inicio).
  const convocatoriasAbiertas = useMemo(() => {
    if (!currentUser) return 0;
    const ahora = Date.now();
    return (convocatorias || []).filter(c => {
      const f = fechaDeConvocatoria(c);
      return f && f.getTime() >= ahora && c.estado !== 'CANCELADA' && c.estado !== 'CONVERTIDA' && convocatoriaVisiblePara(c, currentUser);
    }).length;
  }, [convocatorias, currentUser]);

  const groupMatches = useMemo(() => {
    return matches.filter(m => {
      const g = (m.grupo || 'chicos').toLowerCase();
      if (g !== myGroup) return false;
      return isMatchOfficial(m);
    });
  }, [matches, myGroup]);

  const { availableDinnerDates, upcomingDinnerDates, pastDinnerDates, defaultSmartDinnerKey } = useMemo(() => {
    const datesMap = new Map();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    groupMatches.forEach(m => {
      const cleanKey = extractCleanDate(m.date, m.fechaISO);
      if (cleanKey && cleanKey !== 'sin fecha') {
        if (!datesMap.has(cleanKey)) {
          const niceLabel = etiquetaFechaDia(cleanKey);
          const dateObj = parseMatchDateObject(m.date, m.fechaISO) || new Date();
          datesMap.set(cleanKey, { key: cleanKey, label: niceLabel, dateObj });
        }
      }
    });

    const allDates = Array.from(datesMap.values()).sort((a, b) => b.dateObj - a.dateObj);
    const upcoming = [];
    const past = [];
    let todayKey = null;

    allDates.forEach(d => {
      if (d.dateObj >= startOfToday && d.dateObj <= endOfToday) {
        todayKey = d.key;
        upcoming.push(d);
      } else if (d.dateObj > endOfToday) {
        upcoming.push(d);
      } else {
        past.push(d);
      }
    });

    upcoming.sort((a, b) => a.dateObj - b.dateObj);

    let bestDefaultKey = '';
    if (todayKey) {
      bestDefaultKey = todayKey;
    } else if (upcoming.length > 0) {
      bestDefaultKey = upcoming[0].key;
    } else if (allDates.length > 0) {
      bestDefaultKey = allDates[0].key;
    }

    return {
      availableDinnerDates: allDates,
      upcomingDinnerDates: upcoming,
      pastDinnerDates: past,
      defaultSmartDinnerKey: bestDefaultKey
    };
  }, [groupMatches]);
// AÑADE ESTA LÍNEA AQUÍ
  const activeDinnerKey = selectedDinnerDate || defaultSmartDinnerKey;
  const matchesForDinner = useMemo(() => {
    if (!activeDinnerKey) return [];
    return groupMatches.filter(m => extractCleanDate(m.date, m.fechaISO) === activeDinnerKey);
  }, [groupMatches, activeDinnerKey]);

  // Aquí faltaba la apertura del useMemo y la inicialización de los Map
  const { dinnerYes, dinnerUna, dinnerNo, dinnerPending, dinnerGuests } = useMemo(() => {
    const yesMap = new Map();
    const unaMap = new Map(); // "me tomo una": ni cena ni rajada
    const noMap = new Map();
    const pendingMap = new Map();
    const guestMap = new Map();
    const targetDateClean = activeDinnerKey;

    matchesForDinner.forEach(m => {
      (m.players || []).forEach(p => {
        // BUSCAMOS EL PERFIL OFICIAL PRIORIZANDO EL ID
        const official = players.find(reg => 
          (p.id && reg.id === p.id) || normalizeName(reg.name) === normalizeName(p.name)
        );
        
        // USAMOS EL ID COMO CLAVE ÚNICA SI EXISTE, SINO EL NOMBRE
        const finalId = official ? official.id : p.id;
        const groupKey = finalId || normalizeName(p.name); 
        
        const playerObj = official 
          ? { name: official.name, photo: official.photo, phone: official.phone, id: official.id }
          : { name: p.name, photo: p.photo, phone: p.phone, id: p.id };

        if (p.dinner === 'SI') {
          yesMap.set(groupKey, playerObj);
          pendingMap.delete(groupKey);
          noMap.delete(groupKey);
          unaMap.delete(groupKey);
        } else if (p.dinner === 'UNA') {
          unaMap.set(groupKey, playerObj);
          pendingMap.delete(groupKey);
          noMap.delete(groupKey);
          yesMap.delete(groupKey);
        } else if (p.dinner === 'NO') {
          noMap.set(groupKey, playerObj);
          pendingMap.delete(groupKey);
          yesMap.delete(groupKey);
          unaMap.delete(groupKey);
        } else {
          if (!yesMap.has(groupKey) && !noMap.has(groupKey) && !unaMap.has(groupKey)) {
            pendingMap.set(groupKey, playerObj);
          }
        }
      });
    
      (m.guests || []).forEach(g => {
        const normG = normalizeName(g.name);
        if (!guestMap.has(normG)) {
          guestMap.set(normG, g);
        }
      });
    });

    (allDinnerGuests || []).forEach(g => {
      const gTargetClean = extractCleanDate(g.target || g.cleanTarget);
      // Comparación exacta de día (AAAA-MM-DD).
      const isDateMatch = gTargetClean !== 'sin fecha' && gTargetClean === targetDateClean;

      const isGroupMatch = (g.group || 'chicos').toLowerCase() === myGroup;

      if (isDateMatch && isGroupMatch) {
        const normG = normalizeName(g.name);
        if (!guestMap.has(normG) && !yesMap.has(normG)) {
          guestMap.set(normG, g);
          pendingMap.delete(normG);
        }
      }
    });

    return {
      dinnerYes: Array.from(yesMap.values()),
      dinnerUna: Array.from(unaMap.values()),
      dinnerNo: Array.from(noMap.values()),
      dinnerPending: Array.from(pendingMap.values()),
      dinnerGuests: Array.from(guestMap.values())
    };
  }, [matchesForDinner, allDinnerGuests, activeDinnerKey, myGroup]);

  const isUserInDinner = useMemo(() => {
    if (!currentUser) return false;
    const normMe = normalizeName(currentUser.name);
    return dinnerYes.some(item => normalizeName(item.name) === normMe) ||
           dinnerGuests.some(item => normalizeName(item.name) === normMe);
  }, [dinnerYes, dinnerGuests, currentUser]);

  const currentVisualDinnerLabel = useMemo(() => {
    const found = availableDinnerDates.find(d => d.key === activeDinnerKey);
    return found ? found.label : (activeDinnerKey || 'Jornada seleccionada');
  }, [availableDinnerDates, activeDinnerKey]);

  // NUEVO (control de gasto de cena): ticket ya guardado para la cena que se está viendo ahora
  // mismo (si lo hay) — clave (grupo, fechaClave), igual que en el backend.
  const ticketCenaActual = useMemo(() => {
    return (dinnerTickets || []).find(t => t.grupo === myGroup && t.fechaClave === activeDinnerKey) || null;
  }, [dinnerTickets, myGroup, activeDinnerKey]);

  const allSelectableUsers = useMemo(() => {
    const list = [...players];
    activeTournaments.forEach(t => {
      (t.participants || []).forEach(p => {
        const exists = list.some(u => u.id === p.id || normalizeName(u.name) === normalizeName(p.name));
        if (!exists) {
          list.push({
            id: p.id,
            name: p.name,
            group: 'torneo',
            photo: p.photo || '',
            level: p.level || 3.0,
            titulo: 'Jugador de Torneo',
            pin: '',
            pJ: 0, pG: 0, cSi: 0, cNo: 0,
            ptsDeportivo: 0, ptsBarandas: 0, hibrido: 0, deuda: 0
          });
        }
      });
    });
    return list;
  }, [players, activeTournaments]);

  const invitedTournament = useMemo(() => {
    if (!inviteTournamentId) return null;
    return activeTournaments.find(t => t.id === inviteTournamentId) || null;
  }, [inviteTournamentId, activeTournaments]);

  const invitedPlayerSlot = useMemo(() => {
    if (!invitedTournament || !invitePlayerId) return null;
    return (invitedTournament.participants || []).find(p => p.id === invitePlayerId) || null;
  }, [invitedTournament, invitePlayerId]);

  if (!currentUser) {
    if (invitedTournament && invitedPlayerSlot) {
      const clubUser = players.find(u => u.id === invitedPlayerSlot.id || normalizeName(u.name) === normalizeName(invitedPlayerSlot.name));
      const targetUser = clubUser || {
        id: invitedPlayerSlot.id,
        name: invitedPlayerSlot.name,
        photo: invitedPlayerSlot.photo || '',
        pin: '',
        group: 'torneo',
        titulo: 'Invitado al Torneo',
        level: invitedPlayerSlot.level || 3.0
      };

      return (
        <div className="min-h-screen bg-stone-900 text-white flex flex-col justify-center items-center p-4 text-left">
          <div className="max-w-xs w-full bg-stone-800 rounded-3xl p-6 border border-[#b893ba]/50 shadow-2xl text-center space-y-4">
            <UserAvatar name={targetUser.name} photo={targetUser.photo} size="lg" className="mx-auto" />
            <div>
              <span className="text-[10px] uppercase font-black bg-[#4a3350]/60 text-[#b893ba] px-2.5 py-0.5 rounded-full">
                Acceso Personal
              </span>
              <h2 className="text-lg font-black mt-2 text-white">{targetUser.name}</h2>
              <p className="text-xs text-[#f2eef2] mt-0.5">
                Convocado al <strong>{invitedTournament.name}</strong>
              </p>
            </div>

            <p className="text-xs text-stone-400">
              Pulsa continuar para verificar o crear tu PIN de 4 cifras y acceder a tus partidos:
            </p>

            <button
              onClick={() => handleUserClick(targetUser)}
              className="w-full py-3 bg-[#4a3350] hover:bg-[#b893ba] text-white font-black rounded-xl text-xs shadow-md transition"
            >
              Entrar al Torneo →
            </button>
          </div>

          <PinModal
            isOpen={Boolean(targetPinUser)}
            onClose={() => setTargetPinUser(null)}
            targetUser={targetPinUser}
            onPinSuccess={handlePinSuccess}
            apiUrl={apiUrl}
          />
        </div>
      );
    }

    if (invitedTournament) {
      return (
        <div className="min-h-screen bg-stone-900 text-white flex flex-col justify-center items-center p-4 text-left">
          <div className="max-w-md w-full bg-stone-800 rounded-3xl p-6 border border-[#b893ba]/40 shadow-2xl space-y-4">
            <div className="text-center">
              <LogoTorneo className="w-32 mb-2" />
              <span className="text-[10px] font-black uppercase tracking-wider bg-[#b893ba]/20 text-[#b893ba] px-2.5 py-0.5 rounded-full">
                Invitación a Torneo Privado
              </span>
              <h2 className="text-xl font-black mt-2 text-white">{invitedTournament.name}</h2>
              <p className="text-xs text-stone-400 mt-1">
                ¿Quién eres en este torneo? Selecciona tu nombre para entrar:
              </p>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {(invitedTournament.participants || []).map(p => {
                const clubUser = players.find(u => u.id === p.id || normalizeName(u.name) === normalizeName(p.name));
                const targetObj = clubUser || {
                  id: p.id,
                  name: p.name,
                  photo: p.photo || '',
                  pin: '',
                  group: 'torneo',
                  titulo: 'Invitado al Torneo',
                  level: p.level || 3.0
                };

                return (
                  <button
                    key={p.id}
                    onClick={() => handleUserClick(targetObj)}
                    className="w-full text-left bg-stone-700/60 hover:bg-[#4a3350] p-3 rounded-2xl flex items-center justify-between transition group border border-stone-600/40"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar name={p.name} photo={p.photo} size="sm" />
                      <span className="font-semibold text-sm group-hover:text-white">{p.name}</span>
                    </div>
                    <span className="text-xs text-[#b893ba] group-hover:text-white font-bold">Entrar →</span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-stone-700 text-center">
              <button
                onClick={() => setInviteTournamentId(null)}
                className="text-xs text-stone-400 hover:text-white font-semibold underline"
              >
                Soy socio del club (Ir al acceso general)
              </button>
            </div>
          </div>

          <PinModal
            isOpen={Boolean(targetPinUser)}
            onClose={() => setTargetPinUser(null)}
            targetUser={targetPinUser}
            onPinSuccess={handlePinSuccess}
            apiUrl={apiUrl}
          />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-stone-900 text-white flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-stone-800 rounded-3xl p-6 border border-stone-700 shadow-2xl">
          <div className="w-16 h-16 bg-[#2c4a66] rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">
            🎾
          </div>
          <h1 className="text-2xl font-black text-center mb-1">Pádel CTC</h1>
          <p className="text-stone-400 text-xs text-center mb-5">
            {showRegisterForm ? 'Regístrate para entrar al club' : 'Elige tu perfil de jugador (protegido por PIN)'}
          </p>

          {!showRegisterForm ? (
            <>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1 mb-4">
                {allSelectableUsers.length === 0 ? (
                  <p className="text-center text-stone-400 text-xs py-4">Cargando jugadores desde Google Sheets...</p>
                ) : (
                  allSelectableUsers.map(u => (
                    <button
                      key={u.id}
                      onClick={() => handleUserClick(u)}
                      className="w-full text-left bg-stone-700/60 hover:bg-[#2c4a66] p-3 rounded-2xl flex items-center justify-between transition group border border-stone-600/40"
                    >
                      <div className="flex items-center gap-3">
                        <UserAvatar name={u.name} photo={u.photo} size="sm" />
                        <div>
                          <span className="font-semibold text-sm group-hover:text-white block">{u.name}</span>
                          {u.group === 'torneo' && (
                            <span className="text-[9px] bg-[#4a3350]/60 text-[#b893ba] px-1.5 py-0.2 rounded font-bold">
                              Torneo
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-stone-400 group-hover:text-[#eef2f6]">{u.titulo}</span>
                    </button>
                  ))
                )}
              </div>

              <button
                onClick={() => setShowRegisterForm(true)}
                className="w-full py-3 bg-stone-700 hover:bg-stone-600 text-[#9fb4c7] hover:text-white rounded-2xl text-xs font-bold transition border border-dashed border-stone-500 flex items-center justify-center gap-1.5"
              >
                <span>➕</span> ¿No estás en la lista? Añadir nuevo jugador
              </button>
            </>
          ) : (
            <RegisterPlayerForm 
              onCancel={() => setShowRegisterForm(false)} 
              onRegister={handleRegisterUser} 
              syncing={syncing} 
            />
          )}
        </div>

        <PinModal
          isOpen={Boolean(targetPinUser)}
          onClose={() => setTargetPinUser(null)}
          targetUser={targetPinUser}
          onPinSuccess={handlePinSuccess}
          apiUrl={apiUrl}
        />
      </div>
    );
  }

  // NUEVO (control de altas): un alta de Chicos/Chicas pendiente (o rechazada) de validar por
  // el administrador no llega a ver la app — se queda en esta pantalla intermedia. En cuanto
  // el administrador la apruebe, la próxima sincronización (al pulsar "Comprobar de nuevo" o
  // al reabrir la app) refresca currentUser con el estado nuevo y deja pasar automáticamente.
  if (accesoBloqueadoPorAprobacion) {
    const rechazado = currentUser.estadoAprobacion === 'RECHAZADO';
    return (
      <div className="min-h-screen bg-stone-900 text-white flex flex-col justify-center items-center p-4 text-center">
        <div className="max-w-xs w-full bg-stone-800 rounded-3xl p-6 border border-stone-700 shadow-2xl space-y-4">
          <span className="text-4xl block">{rechazado ? '🚫' : '⏳'}</span>
          <div>
            <h2 className="text-lg font-black">{currentUser.name}</h2>
            <p className="text-xs text-stone-400 mt-1">
              {rechazado
                ? 'Tu alta no ha sido validada por el administrador. Si crees que es un error, habla con él.'
                : 'Tu alta está pendiente de validación por el administrador. En cuanto te confirme podrás entrar.'}
            </p>
          </div>
          {!rechazado && (
            <button
              onClick={() => fetchData(false)}
              disabled={syncing}
              className="w-full py-2.5 bg-[#2c4a66] hover:bg-[#9fb4c7] text-white rounded-xl text-xs font-bold shadow-lg transition"
            >
              {syncing ? 'Comprobando...' : 'Comprobar de nuevo'}
            </button>
          )}
          <button
            onClick={handleLogout}
            className="w-full py-2.5 bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-xl text-xs font-bold transition"
          >
            Salir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-screen text-stone-900 pb-16">
      <div aria-hidden="true" className="fixed inset-0 -z-10 pointer-events-none" style={ESTILO_FONDO_PISTA_PADEL} />
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div
            onClick={() => setInspectedUser(currentUser)}
            className="flex items-center gap-2.5 cursor-pointer group min-w-0"
            title="Ver mis estadísticas y editar perfil"
          >
            <UserAvatar name={currentUser.name} photo={currentUser.photo} size="md" className="ring-2 ring-stone-100 group-hover:ring-[#9fb4c7] transition" />
            <div className="min-w-0">
              <h1 className="text-[15px] font-black leading-tight truncate group-hover:text-[#2c4a66] transition">
                {currentUser.name}
              </h1>
              <p className="text-[11px] text-stone-500 font-bold uppercase tracking-wider truncate">
                {isThursdayMember ? `${currentUser.group} · ${currentUser.titulo}` : 'Invitado a Torneos CTC'}
              </p>
            </div>
          </div>

          {/* Iconos de utilidad agrupados en una sola píldora, todos del mismo tamaño — antes
              estaban sueltos y con tamaños distintos (algunos con texto, otros sin él). */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-stone-100 rounded-xl p-0.5 gap-0.5">
              {isThursdayMember && (
                <button
                  onClick={() => setActiveTab('inicio')}
                  className={`w-9 h-9 flex items-center justify-center text-base rounded-lg transition ${activeTab === 'inicio' ? 'bg-[#2c4a66] text-white shadow-xs' : 'text-stone-600 hover:bg-white hover:shadow-xs'}`}
                  title="Inicio"
                >
                  🏠
                </button>
              )}
              <button
                onClick={() => setActiveTab('avisos')}
                className={`relative w-9 h-9 flex items-center justify-center text-base rounded-lg transition ${activeTab === 'avisos' ? 'bg-[#d9b97c] text-white shadow-xs' : 'text-stone-600 hover:bg-white hover:shadow-xs'}`}
                title="Tus pendientes"
              >
                🔔
                {pendingAlerts.length > 0 && (
                  <span className="absolute top-0.5 right-0.5 bg-[#6b3f29] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                    {pendingAlerts.length > 9 ? '9+' : pendingAlerts.length}
                  </span>
                )}
              </button>
              {isThursdayMember && (
                <button
                  onClick={() => setShowRulesModal(true)}
                  className="w-9 h-9 flex items-center justify-center text-stone-600 hover:bg-white hover:shadow-xs rounded-lg transition"
                  title="Reglas"
                >
                  <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px] font-black leading-none">i</span>
                </button>
              )}
              <button
                onClick={() => fetchData(false)}
                disabled={syncing}
                className={`w-9 h-9 flex items-center justify-center text-base text-stone-600 hover:bg-white hover:shadow-xs rounded-lg transition ${syncing ? 'animate-spin' : ''}`}
                title="Sincronizar ahora"
              >
                🔄
              </button>
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`relative w-9 h-9 flex items-center justify-center text-base rounded-lg transition ${activeTab === 'admin' ? 'bg-[#2c4a66] text-white shadow-xs' : 'text-stone-600 hover:bg-white hover:shadow-xs'}`}
                  title="Administración"
                >
                  🛡️
                  {pendingAdminCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 bg-[#6b3f29] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                      {pendingAdminCount > 9 ? '9+' : pendingAdminCount}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* "Salir" se deja fuera de la píldora y con su texto, a propósito: es la única
                acción de la cabecera con consecuencias (cerrar sesión), así que conviene que
                destaque y no se pueda tocar sin querer igual que un icono más. */}
            <button
              onClick={handleLogout}
              className="px-2.5 h-9 text-xs font-semibold bg-stone-100 hover:bg-red-50 hover:text-red-600 text-stone-600 rounded-lg transition"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-4">
        {activeTab === 'admin' && isAdmin ? (
          <AdminScreen
            onBack={() => setActiveTab(isThursdayMember ? 'inicio' : 'torneos')}
            pendingPlayers={pendingApprovalPlayers}
            promotableGroups={promotableTournamentGuests}
            onApprove={handleApprovePlayer}
            onReject={handleRejectPlayer}
            onPromote={handlePromoteGuestToGroup}
            idsDuplicados={idsDuplicados}
          />
        ) : activeTab === 'avisos' ? (
          <AlertsScreen
            alerts={pendingAlerts}
            onBack={() => setActiveTab(isThursdayMember ? 'inicio' : 'torneos')}
            currentUser={currentUser}
            apiUrl={apiUrl}
            alertPreferences={alertPreferences}
            reservationAlerts={reservationAlerts}
            onRefreshAlertPrefs={() => fetchData(true)}
            onUpdateAlertPreferences={setAlertPreferences}
            onUpdateReservationAlerts={setReservationAlerts}
          />
        ) : activeTab === 'pachanga' && isThursdayMember ? (
          <PachangaScreen
            currentUser={currentUser}
            players={players}
            matches={matches}
            convocatorias={convocatorias}
            disponibilidades={disponibilidades}
            onGuardarDisp={handleGuardarDisponibilidad}
            onEliminarDisp={handleEliminarDisponibilidad}
            onContactar={abrirContactoDisponibles}
            resaltarId={convResaltada}
            trabajando={convTrabajando}
            onBack={() => setActiveTab('inicio')}
            onNueva={abrirNuevaConvocatoria}
            onResponder={handleResponderConvocatoria}
            onAsignar={handleAsignarConvocatoria}
            onCancelar={handleCancelarConvocatoria}
            onConvertir={handleConvertirConvocatoria}
            onAnadirAPartido={handleAnadirAPartido}
            onAbrirPartido={(id) => { setActiveTab('partidos'); setSelectedMatchId(id); }}
          />
        ) : activeTab === 'inicio' && isThursdayMember ? (
          <HomeScreen
            currentUser={currentUser}
            matches={matches}
            activeTournaments={activeTournaments}
            allDinnerGuests={allDinnerGuests}
            pendingAlerts={pendingAlerts}
            convocatoriasAbiertas={convocatoriasAbiertas}
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenMatch={(id) => { setActiveTab('partidos'); setSelectedMatchId(id); }}
            onProponer={abrirNuevaConvocatoria}
          />
        ) : selectedMatchId && currentMatch && isThursdayMember ? (
          /* DETALLE DEL PARTIDO REGULAR */
          <div className="space-y-4">
            <CabeceraPantalla onBack={() => setSelectedMatchId(null)} titulo="🎾 Partidos" tituloAtras="Volver a la lista de partidos" />

            {/* BANNER CUANDO EL PARTIDO ESTÁ LISTO PARA ANOTAR */}
            {(() => {
              const dynamicStatus = computeMatchStatus(currentMatch);
              const { canReport } = parseMatchTiming(currentMatch.date, currentMatch.fechaISO);
              const isMatchReady = (dynamicStatus === 'EN JUEGO' || dynamicStatus === 'SIN RESULTADO' || canReport) && currentMatch.status !== 'CANCELADO';

              if (isMatchReady && currentMatch.status !== 'FINALIZADO') {
                return (
                  <div
                    onClick={() => setShowScoreModal(true)}
                    className="bg-gradient-to-r from-[#4a3350] via-[#2c4a66] to-[#4a3350] text-white rounded-3xl p-4 shadow-lg border-2 border-[#d9b97c] cursor-pointer animate-pulse hover:animate-none transition transform active:scale-98 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#d9b97c] text-stone-950 font-black text-2xl flex items-center justify-center shrink-0 shadow-md">
                        🏆
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-[#d9b97c] text-stone-950 px-2 py-0.5 rounded-full">
                          Partido Listo para Anotar
                        </span>
                        <h3 className="text-base font-black mt-0.5">¡Registra el Resultado Oficial!</h3>
                        <p className="text-[11px] text-[#f2eef2]">Toca aquí para indicar el marcador y la pareja ganadora</p>
                      </div>
                    </div>
                    <span className="text-xl font-black bg-white text-[#4a3350] px-3 py-1.5 rounded-2xl shadow-md">
                      Anotar →
                    </span>
                  </div>
                );
              }
              return null;
            })()}

            <div className="bg-white rounded-3xl p-5 shadow-sm border border-stone-200">
              <div className="flex justify-between items-center mb-2">
                {(() => {
                  const dynamicStatus = computeMatchStatus(currentMatch);
                  const badgeColors = {
                    'PROGRAMADO': 'bg-[#eef2f6] text-[#2c4a66] border-[#c3d3e0]',
                    'EN JUEGO': 'bg-[#faf3e7] text-[#6b4d1c] border-[#d9b97c] animate-pulse font-black',
                    'SIN RESULTADO': 'bg-[#faf3e7] text-[#6b4d1c] border-[#d9b97c] font-black',
                    'FINALIZADO': 'bg-[#f2eef2] text-[#4a3350] border-[#ddc9de]',
                    'CANCELADO': 'bg-[#f6ede6] text-[#6b3f29] border-[#ead3bf]'
                  };

                  const isOfficial = isMatchOfficial(currentMatch);

                  return (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full border border-stone-200">
                        {currentMatch.grupo}
                      </span>
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${badgeColors[dynamicStatus] || badgeColors['PROGRAMADO']}`}>
                        {dynamicStatus === 'EN JUEGO' ? '🎾 EN JUEGO' : dynamicStatus}
                      </span>
                      {!isOfficial && (
                        <span className="text-[10px] font-extrabold uppercase tracking-wide bg-[#faf3e7] text-[#6b4d1c] border border-[#d9b97c] px-2 py-0.5 rounded-full">
                          Amistoso (No computable)
                        </span>
                      )}
                    </div>
                  );
                })()}

                <div className="flex items-center gap-2">
                  {computeMatchStatus(currentMatch) === 'PROGRAMADO' && (
                    <button
                      onClick={() => handleDeleteMatchComplete(currentMatch.id)}
                      className="text-xs font-bold text-[#6b3f29] hover:bg-[#f6ede6] px-2.5 py-1 rounded-lg border border-[#ead3bf] transition"
                    >
                      🗑️ Borrar Partido
                    </button>
                  )}
                </div>
              </div>

              <h2 className="text-xl font-black text-stone-900 mt-1">
                {fechaCompleta(currentMatch.date, currentMatch.fechaISO)}
              </h2>
              <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                📍 {currentMatch.location}
              </p>
              {(currentMatch.creadoPor || currentMatch.modificadoPor) && (
                <div className="mt-1.5 text-[10px] text-stone-400 leading-snug">
                  {currentMatch.creadoPor && <p>🆕 Subido por {formatearAutoria(currentMatch.creadoPor, currentMatch.creadoEn)}</p>}
                  {currentMatch.modificadoPor && <p>✏️ Última modificación: {formatearAutoria(currentMatch.modificadoPor, currentMatch.modificadoEn)}</p>}
                </div>
              )}

              {/* BLOQUE DE MARCADOR FINAL */}
              {currentMatch.status === 'FINALIZADO' && (
                <div className="bg-[#f2eef2] border border-[#ddc9de] rounded-2xl p-4 text-center my-3.5 space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#4a3350] block">
                    MARCADOR FINAL OFICIAL
                  </span>
                  
                  <div className="inline-block bg-[#4a3350] text-white font-mono font-black text-base px-4 py-1.5 rounded-xl shadow-xs">
                    {currentMatch.score || 'Ganador Registrado'}
                  </div>

                  <div className="flex justify-center gap-2 pt-1">
                    <button
                      onClick={() => setShowScoreModal(true)}
                      className="px-3 py-1.5 bg-[#4a3350] text-white font-bold text-xs rounded-xl hover:bg-[#4a3350] transition"
                    >
                      ✏️ Editar Resultado
                    </button>
                    <button
                      onClick={() => handleResetMatchScore(currentMatch.id)}
                      className="px-3 py-1.5 bg-[#f6ede6] text-[#6b3f29] font-bold text-xs rounded-xl hover:bg-[#f6ede6] transition"
                    >
                      🔄 Reiniciar Partido
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-stone-100">
                <button
                  onClick={() => { setModalError(''); setShowReloadPlaytomicModal(true); }}
                  className="py-2 px-2 bg-[#eef2f6] hover:bg-[#eef2f6] text-[#2c4a66] text-[11px] font-bold rounded-xl border border-[#c3d3e0] transition flex items-center justify-center gap-1"
                >
                  🔄 Recargar Playtomic
                </button>
                <button
                  onClick={() => {
                    const currentNames = (currentMatch.players || []).map(p => p.name);
                    setEditPlayerSlots([currentNames[0] || '', currentNames[1] || '', currentNames[2] || '', currentNames[3] || '']);
                    setModalError('');
                    setShowEditPlayersModal(true);
                  }}
                  className="py-2 px-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-[11px] font-bold rounded-xl border border-stone-200 transition flex items-center justify-center gap-1"
                >
                  ✏️ Cambiar Suplentes
                </button>
              </div>

              {(() => {
                // Ofrecer plaza: solo en partidos que aún no han empezado, y a quien juega el partido (o al administrador).
                if (computeMatchStatus(currentMatch) !== 'PROGRAMADO') return null;
                const juegaAqui = (currentMatch.players || []).some(p => p.id === currentUser.id || normalizeName(p.name) === normalizeName(currentUser.name));
                if (!juegaAqui && currentUser.id !== ADMIN_PLAYER_ID) return null;
                const abierta = (convocatorias || []).find(c => c.partidoId === currentMatch.id && (c.estado === 'ABIERTA' || c.estado === 'COMPLETA'));
                return abierta ? (
                  <button
                    onClick={() => { setConvResaltada(abierta.id); setActiveTab('pachanga'); }}
                    className="w-full mt-2 py-2 px-2 bg-[#faf3e7] text-[#6b4d1c] text-[11px] font-bold rounded-xl border border-[#efd9a9] transition"
                  >
                    🙌 Ya hay una propuesta abierta para este partido · Ver
                  </button>
                ) : (
                  <button
                    onClick={() => abrirOfertaPlaza(currentMatch)}
                    className="w-full mt-2 py-2 px-2 bg-[#faf3e7] hover:bg-[#f5ead2] text-[#6b4d1c] text-[11px] font-bold rounded-xl border border-[#efd9a9] transition"
                  >
                    🆘 Ha fallado alguien · ofrecer su plaza
                  </button>
                );
              })()}

              {/* CONVOCATORIA Y PAREJAS */}
              <div className="mt-5 space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="text-xs font-black text-stone-800 uppercase tracking-wider">
                    Convocatoria y Parejas
                  </h3>
                  <span className="text-[10px] text-stone-500 font-bold">
                    {(currentMatch.players || []).length} / 4 en pista
                  </span>
                </div>

                {[1, 2].map(teamNum => {
                  const teamPlayers = (currentMatch.players || []).filter(p => Number(p.team || 1) === teamNum);
                  const isP1 = teamNum === 1;
                  const isFinalizado = currentMatch.status === 'FINALIZADO';
                  
                  const isWinningTeam = isFinalizado && teamPlayers.some(p => String(p.won).toUpperCase() === 'SI');

                  return (
                    <div
                      key={teamNum}
                      className={`border rounded-2xl p-3.5 transition-all ${
                        isWinningTeam
                          ? 'bg-[#eef4f0]/70 border-[#a9c4ad] ring-1 ring-[#a9c4ad] shadow-xs'
                          : isP1
                          ? 'bg-[#eef2f6]/40 border-[#c3d3e0]'
                          : 'bg-[#faf3e7]/40 border-[#efd9a9]'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md ${
                            isWinningTeam
                              ? 'bg-[#2f5d50] text-white shadow-2xs'
                              : isP1
                              ? 'bg-[#2c4a66] text-white'
                              : 'bg-[#6b4d1c] text-white'
                          }`}>
                            Pareja {teamNum}
                          </span>
                          {isWinningTeam && (
                            <span className="text-[10px] font-black uppercase tracking-wide text-[#2f5d50] bg-[#eef4f0]/90 px-2 py-0.5 rounded-md flex items-center gap-1">
                              👑 Ganadores
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-stone-400 font-medium">
                          {isFinalizado ? '🔒 Parejas bloqueadas' : 'P1 ⇄ / P2 ⇄ para intercambiar'}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {teamPlayers.map(p => {
                          const isMe = p.id === currentUser.id || normalizeName(p.name) === normalizeName(currentUser.name);
                          const isProcessing = loadingDinnerId === (p.id || p.name);
                          const isUnlinked = !players.some(reg => reg.id === p.id || normalizeName(reg.name) === normalizeName(p.name));

                          return (
                            <div
                              key={p.id || p.name}
                              className={`rounded-2xl p-2.5 flex items-center justify-between border shadow-xs ${
                                isWinningTeam ? 'bg-white border-[#c7ddc9]' : 'bg-white border-stone-200'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                {/* NUEVO EVENTO DE BOTÓN: Activa el modal SwapModalData */}
                                <button
                                  disabled={isFinalizado}
                                  onClick={() => setSwapModalData({ matchId: currentMatch.id, playerId: p.id })}
                                  className={`text-[10px] font-black px-2 py-0.5 rounded transition ${
                                    isFinalizado 
                                      ? 'bg-stone-100 text-stone-300 cursor-not-allowed' 
                                      : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                                  }`}
                                  title={isFinalizado ? 'No se pueden cambiar parejas de un partido finalizado' : 'Mover o intercambiar jugador'}
                                >
                                  P{p.team || 1} ⇄
                                </button>
                                <div onClick={() => {
                                  const fullU = players.find(u => u.id === p.id || normalizeName(u.name) === normalizeName(p.name));
                                  setInspectedUser(fullU || p);
                                }} className="cursor-pointer">
                                  <UserAvatar name={p.name} photo={p.photo} size="sm" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-xs font-bold block ${isMe ? 'text-[#2c4a66] font-black' : 'text-stone-800'}`}>
                                      {p.name} {isMe && '(Tú)'}
                                    </span>
                                    {isUnlinked && (
                                      <button
                                        onClick={() => setLinkingSlot({ matchId: currentMatch.id, name: p.name })}
                                        className="text-[9px] bg-[#faf3e7] hover:bg-[#faf3e7] text-[#6b4d1c] font-extrabold px-1.5 py-0.5 rounded flex items-center gap-0.5"
                                        title="Este jugador no tiene perfil oficial enlazado. Clic para asociarlo."
                                      >
                                        ⚠️ Vincular
                                      </button>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-stone-400">
                                    {p.dinner === 'SI' ? '🍻 Cena confirmada' : p.dinner === 'UNA' ? '🍺 Se toma una' : p.dinner === 'NO' ? '🏃‍♂️ Se raja' : '🟡 Cena pendiente'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  disabled={isProcessing}
                                  onClick={() => handleUpdateDinner(currentMatch.id, p.id, p.name, p.dinner === 'SI' ? 'PENDIENTE' : 'SI')}
                                  className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition ${
                                    p.dinner === 'SI' ? 'bg-[#2f5d50] text-white shadow-xs' : 'bg-stone-100 text-stone-600'
                                  } ${isProcessing ? 'opacity-50 cursor-wait' : ''}`}
                                >
                                  Cena 🍻
                                </button>
                                <button
                                  disabled={isProcessing}
                                  onClick={() => handleUpdateDinner(currentMatch.id, p.id, p.name, p.dinner === 'UNA' ? 'PENDIENTE' : 'UNA')}
                                  className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition ${
                                    p.dinner === 'UNA' ? 'bg-[#4a3350] text-white shadow-xs' : 'bg-stone-100 text-stone-600'
                                  } ${isProcessing ? 'opacity-50 cursor-wait' : ''}`}
                                >
                                  Una 🍺
                                </button>
                                <button
                                  disabled={isProcessing}
                                  onClick={() => handleUpdateDinner(currentMatch.id, p.id, p.name, p.dinner === 'NO' ? 'PENDIENTE' : 'NO')}
                                  className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition ${
                                    p.dinner === 'NO' ? 'bg-[#6b3f29] text-white shadow-xs' : 'bg-stone-100 text-stone-600'
                                  } ${isProcessing ? 'opacity-50 cursor-wait' : ''}`}
                                >
                                  No 🏃‍♂️
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* PREGUNTA DE CENA EN PARTIDO REGULAR */}
              {(() => {
                const isOfficial = isMatchOfficial(currentMatch);
                const mySlot = (currentMatch.players || []).find(p => p.id === currentUser.id || normalizeName(p.name) === normalizeName(currentUser.name));
                if (!mySlot) return null;
                const isProcessing = loadingDinnerId === (mySlot.id || mySlot.name);

                if (!isOfficial) {
                  return (
                    <div className="mt-5 pt-3 border-t border-stone-100 text-center">
                      <span className="text-[11px] text-stone-500 font-semibold italic block">
                        ℹ️ Este partido es amistoso: no suma puntos ni bote (eso solo cuenta los Jueves), aunque sí entra en tu química de parejas y rivales.
                      </span>
                    </div>
                  );
                }

                return (
                  <div className="mt-5 pt-4 border-t border-stone-100 text-center">
                    <p className="text-xs font-black text-stone-800 uppercase tracking-wide mb-2.5">
                      ¿Te quedas al 3º tiempo?
                    </p>
                    <div className="flex gap-2">
                      <button
                        disabled={isProcessing}
                        onClick={() => handleUpdateDinner(currentMatch.id, mySlot.id, mySlot.name, 'SI')}
                        className={`flex-1 py-2.5 rounded-xl font-extrabold text-[11px] leading-tight transition border ${
                          mySlot.dinner === 'SI'
                            ? 'bg-[#2f5d50] text-white border-[#2f5d50] shadow-md'
                            : 'bg-white text-stone-700 border-stone-200 hover:bg-[#eef4f0]'
                        } ${isProcessing ? 'opacity-60 cursor-wait' : ''}`}
                      >
                        ✓ ME QUEDO A CENAR 🍻
                      </button>
                      <button
                        disabled={isProcessing}
                        onClick={() => handleUpdateDinner(currentMatch.id, mySlot.id, mySlot.name, 'UNA')}
                        className={`flex-1 py-2.5 rounded-xl font-extrabold text-[11px] leading-tight transition border ${
                          mySlot.dinner === 'UNA'
                            ? 'bg-[#4a3350] text-white border-[#4a3350] shadow-md'
                            : 'bg-white text-stone-700 border-stone-200 hover:bg-[#f2eef2]'
                        } ${isProcessing ? 'opacity-60 cursor-wait' : ''}`}
                      >
                        ME TOMO UNA 🍺
                      </button>
                      <button
                        disabled={isProcessing}
                        onClick={() => handleUpdateDinner(currentMatch.id, mySlot.id, mySlot.name, 'NO')}
                        className={`flex-1 py-2.5 rounded-xl font-extrabold text-[11px] leading-tight transition border ${
                          mySlot.dinner === 'NO'
                            ? 'bg-[#6b3f29] text-white border-[#6b3f29] shadow-md'
                            : 'bg-white text-stone-700 border-stone-200 hover:bg-[#f6ede6]'
                        } ${isProcessing ? 'opacity-60 cursor-wait' : ''}`}
                      >
                        ME RAJO 🏃‍♂️
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (
          /* PESTAÑAS PRINCIPALES */
          <div className="space-y-4">
            {isThursdayMember ? (
              // Pestañas principales: mismo patrón de seleccionado/no-seleccionado para las 5
              // (antes "Torneos" se salía de la norma — se veía en morado incluso sin estar
              // activa — y la sombra del activo no era la misma que en el resto de la app:
              // "shadow" a secas en vez de "shadow-xs", que es la que se usa en todas partes).
              // Cada pestaña conserva su color de acento solo cuando está activa, para
              // orientarte de un vistazo a qué sección perteneces.
              <div className="flex bg-stone-100 p-1 rounded-2xl text-[11px] font-black gap-0.5">
                {[
                  { key: 'partidos', label: 'Partidos', icon: '🎾', active: 'bg-white shadow-xs text-stone-900' },
                  { key: 'cenas', label: 'Cena', icon: '🍻', active: 'bg-white shadow-xs text-[#2f5d50]' },
                  { key: 'rankings', label: 'Rankings', icon: '🏆', active: 'bg-white shadow-xs text-stone-900' },
                  { key: 'bote', label: 'Bote', icon: '💶', active: 'bg-white shadow-xs text-stone-900' },
                  { key: 'torneos', label: 'Torneos', icon: <PadelRacketsIcon />, active: 'bg-white shadow-xs text-[#2c4a66]' }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition ${
                      activeTab === tab.key ? tab.active : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    <span className="text-sm leading-none">{tab.icon}</span>
                    <span className="text-[9.5px] leading-none">{tab.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="bg-[#eef2f6] border border-[#c3d3e0] text-[#2c4a66] rounded-2xl p-3 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl"><PadelRacketsIcon /></span>
                  <div>
                    <span className="font-black text-xs block">Acceso Exclusivo de Torneos CTC</span>
                    <span className="text-[10px] text-[#2c4a66] font-medium">Visualizas únicamente los eventos a los que estás convocado</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-[#dbe6ef] text-[#2c4a66] px-2 py-0.5 rounded-md">
                  Modo Torneo
                </span>
              </div>
            )}

            {/* TAB 1: PARTIDOS REGULARES */}
            {isThursdayMember && activeTab === 'partidos' && (
              <div className="space-y-3">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="w-full bg-[#2c4a66] hover:bg-[#2c4a66] text-white font-bold py-2.5 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <span>➕</span> Añadir Partido (Pegar desde Playtomic)
                </button>

                <div className="flex bg-white p-1 rounded-2xl border border-stone-200 shadow-xs text-[11px] font-bold">
                  {[
                    { key: 'semana', label: '📅 Esta semana' },
                    { key: 'proximos', label: '⏳ Próximos' },
                    { key: 'todos', label: '📁 Todo el histórico' }
                  ].map(t => (
                    <button
                      key={t.key}
                      onClick={() => setFilterTime(t.key)}
                      className={`flex-1 py-1.5 rounded-xl transition ${filterTime === t.key ? 'bg-[#2c4a66] text-white shadow-xs' : 'text-stone-600 hover:text-stone-900'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* BUSCADOR DE PARTIDOS: jugador(es) + estado + fecha exacta */}
                <div className="bg-white rounded-2xl p-3 border border-stone-200 shadow-xs space-y-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">🔍</span>
                    <input
                      type="search"
                      value={searchPlayer}
                      onChange={e => setSearchPlayer(e.target.value)}
                      placeholder="Buscar por jugador (ej: marcos o marcos juan)"
                      className="w-full border border-stone-200 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold bg-stone-50 focus:outline-none focus:border-[#9fb4c7]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={searchStatus}
                      onChange={e => setSearchStatus(e.target.value)}
                      className="border border-stone-200 rounded-xl px-2 py-2 text-xs font-semibold bg-stone-50 focus:outline-none focus:border-[#9fb4c7]"
                      aria-label="Filtrar por estado del partido"
                    >
                      <option value="todos">Todos los estados</option>
                      <option value="PROGRAMADO">Programado</option>
                      <option value="EN JUEGO">En juego</option>
                      <option value="SIN RESULTADO">Sin resultado</option>
                      <option value="FINALIZADO">Finalizado</option>
                      <option value="CANCELADO">Cancelado</option>
                    </select>
                    <input
                      type="date"
                      value={searchDate}
                      onChange={e => setSearchDate(e.target.value)}
                      className="border border-stone-200 rounded-xl px-2 py-2 text-xs font-semibold bg-stone-50 focus:outline-none focus:border-[#9fb4c7]"
                      aria-label="Filtrar por fecha exacta"
                    />
                  </div>
                  {hayBusquedaPartidos && (
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-stone-500 font-semibold">
                        {filteredMatches.length} {filteredMatches.length === 1 ? 'partido' : 'partidos'} · buscando en todo el histórico
                      </span>
                      <button
                        type="button"
                        onClick={() => { setSearchPlayer(''); setSearchStatus('todos'); setSearchDate(''); }}
                        className="font-bold text-[#2c4a66] hover:underline shrink-0"
                      >
                        ✕ Limpiar filtros
                      </button>
                    </div>
                  )}
                </div>

                {!hayBusquedaPartidos && filterTime === 'semana' && filteredMatches.length > 0 && filteredMatches.every(m => ['FINALIZADO', 'SIN RESULTADO', 'CANCELADO'].includes(computeMatchStatus(m))) && (() => {
                  const jugados = filteredMatches.filter(m => computeMatchStatus(m) !== 'CANCELADO').length;
                  return jugados > 0 ? (
                    <div className="bg-[#eef4f0] border border-[#c7ddc9] rounded-2xl p-3">
                      <span className="text-[11px] font-black text-[#2f5d50] block">✅ {jugados} {jugados === 1 ? 'partido jugado' : 'partidos jugados'} esta semana</span>
                      <span className="text-[11px] font-semibold text-[#2f5d50] block">Sin más partidos planificados para el resto de la semana.</span>
                    </div>
                  ) : null;
                })()}

                {filteredMatches.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 text-center border border-stone-200">
                    <p className="text-2xl mb-1">{hayBusquedaPartidos ? '🔍' : '🎾'}</p>
                    <p className="text-sm font-bold text-stone-700">
                      {hayBusquedaPartidos
                        ? 'Ningún partido coincide con esa búsqueda'
                        : filterTime === 'semana'
                          ? 'Todavía no hay ningún partido subido para esta semana'
                          : `No hay partidos de ${currentUser.group} en esta vista`}
                    </p>
                  </div>
                ) : (
                  filteredMatches.map(m => {
                    const p1 = (m.players || []).filter(p => (p.team || 1) === 1);
                    const p2 = (m.players || []).filter(p => (p.team || 1) === 2);
                    const dynamicStatus = computeMatchStatus(m);
                    const isFinalizado = dynamicStatus === 'FINALIZADO';
                    const p1Won = isFinalizado && p1.some(p => p.won === 'SI');
                    const p2Won = isFinalizado && p2.some(p => p.won === 'SI');
                    const isOfficial = isMatchOfficial(m);

                    const badgeColors = {
                      'PROGRAMADO': 'bg-[#eef2f6] text-[#2c4a66] border-[#c3d3e0]',
                      'EN JUEGO': 'bg-[#faf3e7] text-[#6b4d1c] border-[#d9b97c] animate-pulse font-black',
                      'SIN RESULTADO': 'bg-[#faf3e7] text-[#6b4d1c] border-[#d9b97c] font-black',
                      'FINALIZADO': 'bg-[#f2eef2] text-[#4a3350] border-[#ddc9de]',
                      'CANCELADO': 'bg-[#f6ede6] text-[#6b3f29] border-[#ead3bf]'
                    };

                    return (
                      <div
                        key={m.id}
                        onClick={() => setSelectedMatchId(m.id)}
                        className={`bg-white rounded-2xl p-4 border shadow-xs hover:border-[#9fb4c7] cursor-pointer transition ${
                          isFinalizado ? 'border-[#ddc9de]' : 'border-stone-200'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-black uppercase tracking-wider bg-stone-100 text-stone-600 px-2 py-0.5 rounded">
                                {m.grupo}
                              </span>
                              {!isOfficial && (
                                <span className="text-[9px] font-extrabold uppercase bg-[#faf3e7] text-[#6b4d1c] border border-[#d9b97c] px-1.5 py-0.2 rounded">
                                  Amistoso
                                </span>
                              )}
                            </div>
                            <h3 className="text-base font-black text-stone-900 mt-1">{fechaCompleta(m.date, m.fechaISO)}</h3>
                            <p className="text-xs text-stone-500 mt-0.5">📍 {m.location}</p>
                          </div>
                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${badgeColors[dynamicStatus] || badgeColors['PROGRAMADO']}`}>
                            {dynamicStatus === 'EN JUEGO' ? '🎾 EN JUEGO' : dynamicStatus}
                          </span>
                        </div>

                        <div className="mt-3 pt-3 border-t border-stone-100">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <div className={`flex items-center gap-1.5 flex-1 min-w-0 p-1.5 rounded-xl transition ${
                              p1Won
                                ? 'bg-[#eef4f0] border border-[#a9c4ad] text-[#2f5d50] font-black'
                                : isFinalizado
                                ? 'opacity-60 text-stone-600'
                                : 'bg-stone-50/70 text-stone-700'
                            }`}>
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                                p1Won ? 'bg-[#2f5d50] text-white' : 'bg-[#eef2f6] text-[#2c4a66]'
                              }`}>
                                {p1Won ? '👑 P1' : 'P1'}
                              </span>
                              <div className="flex items-center gap-1.5 truncate">
                                {p1.map((p, idx) => (
                                  <div key={idx} className="flex items-center gap-1 truncate" title={p.name}>
                                    <UserAvatar name={p.name} photo={p.photo} size="xs" />
                                    <span className="truncate text-xs font-semibold">{p.name.split(' ')[0]}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <span className="font-black text-stone-300 text-[10px] px-1 shrink-0">VS</span>

                            <div className={`flex items-center justify-end gap-1.5 flex-1 min-w-0 p-1.5 rounded-xl transition ${
                              p2Won
                                ? 'bg-[#eef4f0] border border-[#a9c4ad] text-[#2f5d50] font-black'
                                : isFinalizado
                                ? 'opacity-60 text-stone-600'
                                : 'bg-stone-50/70 text-stone-700'
                            }`}>
                              <div className="flex items-center gap-1.5 truncate justify-end">
                                {p2.map((p, idx) => (
                                  <div key={idx} className="flex items-center gap-1 truncate" title={p.name}>
                                    <UserAvatar name={p.name} photo={p.photo} size="xs" />
                                    <span className="truncate text-xs font-semibold">{p.name.split(' ')[0]}</span>
                                  </div>
                                ))}
                              </div>
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                                p2Won ? 'bg-[#2f5d50] text-white' : 'bg-[#faf3e7] text-[#6b4d1c]'
                              }`}>
                                {p2Won ? '👑 P2' : 'P2'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 2: CENA & CLUB UNIFICADA */}
            {isThursdayMember && activeTab === 'cenas' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide">
                      Jornada de Cena:
                    </label>
                    <button
                      onClick={() => setShowDinnerHistory(!showDinnerHistory)}
                      className="text-[11px] font-bold text-[#2c4a66] hover:text-[#2c4a66] underline"
                    >
                      {showDinnerHistory ? '📅 Ver Próximas Cenas' : '📜 Ver Histórico de Cenas'}
                    </button>
                  </div>

                  <select
                    value={activeDinnerKey}
                    onChange={(e) => setSelectedDinnerDate(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 text-xs font-bold text-stone-800"
                  >
                    {(showDinnerHistory ? pastDinnerDates : upcomingDinnerDates).map(d => (
                      <option key={d.key} value={d.key}>
                        {d.label} {d.key === defaultSmartDinnerKey ? '★ (Siguiente recomendada)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-[#eef2f6] border border-[#c3d3e0] rounded-2xl p-4 text-center">
                  <p className="text-xs font-black text-[#2c4a66] mb-2">
                    ¿Te vienes a la cena este {currentVisualDinnerLabel}? 🍻
                  </p>
                  <button
                    onClick={() => handleToggleSoloCena(activeDinnerKey, isUserInDinner ? 'NO' : 'SI')}
                    className={`py-2 px-4 rounded-xl text-xs font-bold transition shadow-xs ${
                      isUserInDinner
                        ? 'bg-[#6b3f29] hover:bg-[#6b3f29] text-white'
                        : 'bg-[#2f5d50] hover:bg-[#2f5d50] text-white'
                    }`}
                  >
                    {isUserInDinner ? '✓ Apuntado a la cena (Clic para borrarte)' : '+ ¡Me apunto a cenar!'}
                  </button>
                </div>

                <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-stone-100">
                    <div>
                      <h3 className="text-sm font-black text-stone-900">Mesa Unificada</h3>
                      <p className="text-xs text-stone-500 font-bold capitalize">{currentVisualDinnerLabel}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black text-[#2f5d50]">
                        {dinnerYes.length + dinnerGuests.length}
                      </span>
                      <span className="text-[10px] text-stone-400 block font-bold">MESA PARA</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div className="bg-[#eef4f0] border border-[#c7ddc9] rounded-2xl p-2">
                      <span className="text-base font-black text-[#2f5d50] block">{dinnerYes.length + dinnerGuests.length}</span>
                      <span className="text-[9px] font-bold text-[#2f5d50] uppercase">Cenan</span>
                    </div>
                    <div className="bg-[#f2eef2] border border-[#ddc9de] rounded-2xl p-2">
                      <span className="text-base font-black text-[#4a3350] block">{dinnerUna.length}</span>
                      <span className="text-[9px] font-bold text-[#4a3350] uppercase">Una 🍺</span>
                    </div>
                    <div className="bg-[#f6ede6] border border-[#ead3bf] rounded-2xl p-2">
                      <span className="text-base font-black text-[#6b3f29] block">{dinnerNo.length}</span>
                      <span className="text-[9px] font-bold text-[#6b3f29] uppercase">Rajan</span>
                    </div>
                    <div className="bg-[#faf3e7] border border-[#efd9a9] rounded-2xl p-2">
                      <span className="text-base font-black text-[#6b4d1c] block">{dinnerPending.length}</span>
                      <span className="text-[9px] font-bold text-[#6b4d1c] uppercase">Pendientes</span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 text-xs">
                    <div>
                      <span className="font-extrabold text-[#2f5d50] block mb-2">
                        🟢 Confirmados ({dinnerYes.length + dinnerGuests.length}):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {dinnerYes.concat(dinnerGuests).map((item, i) => (
                          <div
                            key={i}
                            onClick={() => {
                              const found = players.find(u => normalizeName(u.name) === normalizeName(item.name));
                              setInspectedUser(found || item);
                            }}
                            className="flex items-center gap-1.5 bg-[#eef4f0] border border-[#c7ddc9] text-[#2f5d50] px-2.5 py-1 rounded-xl font-bold text-xs shadow-2xs cursor-pointer hover:bg-[#eef4f0] transition"
                          >
                            <UserAvatar name={item.name} photo={item.photo} size="sm" />
                            <span>{item.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {dinnerUna.length > 0 && (
                      <div className="pt-2 border-t border-stone-100">
                        <span className="font-extrabold text-[#4a3350] block mb-2">
                          🍺 Se toman una ({dinnerUna.length}) · no cenan, sin bote ni penalización:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {dinnerUna.map((item, i) => (
                            <div
                              key={i}
                              onClick={() => {
                                const found = players.find(u => normalizeName(u.name) === normalizeName(item.name));
                                setInspectedUser(found || item);
                              }}
                              className="flex items-center gap-1.5 bg-[#f2eef2] border border-[#ddc9de] text-[#4a3350] px-2.5 py-1 rounded-xl font-bold text-xs cursor-pointer transition"
                            >
                              <UserAvatar name={item.name} photo={item.photo} size="sm" />
                              <span>{item.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {dinnerNo.length > 0 && (
                      <div className="pt-2 border-t border-stone-100">
                        <span className="font-extrabold text-[#6b3f29] block mb-2">
                          🔴 Se Rajan ({dinnerNo.length}):
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {dinnerNo.map((item, i) => (
                            <div
                              key={i}
                              onClick={() => {
                                const found = players.find(u => normalizeName(u.name) === normalizeName(item.name));
                                setInspectedUser(found || item);
                              }}
                              className="flex items-center gap-1.5 bg-[#f6ede6] border border-[#ead3bf] text-[#6b3f29] px-2.5 py-1 rounded-xl font-bold text-xs cursor-pointer hover:bg-[#f6ede6] transition"
                            >
                              <UserAvatar name={item.name} photo={item.photo} size="sm" />
                              <span>{item.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {dinnerPending.length > 0 && (
                      <div className="pt-2 border-t border-stone-100">
                        <span className="font-extrabold text-[#6b4d1c] block mb-2">
                          🟡 Pendientes de Confirmar ({dinnerPending.length}):
                        </span>
                        <div className="space-y-1.5">
                          {dinnerPending.map((item, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between bg-[#faf3e7]/80 border border-[#efd9a9] p-2 rounded-xl text-[#6b4d1c]"
                            >
                              <div
                                onClick={() => {
                                  const found = players.find(u => normalizeName(u.name) === normalizeName(item.name));
                                  setInspectedUser(found || item);
                                }}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <UserAvatar name={item.name} photo={item.photo} size="sm" />
                                <span className="font-bold">{item.name}</span>
                              </div>

                              <button
                                onClick={() => handleNotifyPendingWhatsApp(item, currentVisualDinnerLabel)}
                                className="px-2.5 py-1 bg-[#6b4d1c] hover:bg-[#6b4d1c] text-white font-extrabold text-[10px] rounded-lg transition flex items-center gap-1 shadow-2xs"
                                title="Avisar por WhatsApp para que confirme cena"
                              >
                                💬 Avisar por WhatsApp
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-stone-100">
                    <button
                      onClick={() => handleShareClubWhatsapp(currentVisualDinnerLabel, dinnerYes, dinnerGuests)}
                      className="w-full bg-[#2f5d50] hover:bg-[#2f5d50] text-white font-bold py-2.5 rounded-2xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
                    >
                      📲 Enviar Reserva al Club / Restaurante por WhatsApp ({dinnerYes.length + dinnerGuests.length} comensales)
                    </button>
                  </div>
                </div>

                {/* NUEVO (control de gasto de cena): foto del ticket + OCR, importe por
                    jueves/martes y por persona, y cuánto de la cuenta es alcohol. */}
                <TicketCenaCard
                  grupo={myGroup}
                  fechaClave={activeDinnerKey}
                  fechaLabel={currentVisualDinnerLabel}
                  numPersonasActuales={dinnerYes.length + dinnerGuests.length}
                  currentUser={currentUser}
                  apiUrl={apiUrl}
                  ticketExistente={ticketCenaActual}
                  onSaved={(ticket) => {
                    setDinnerTickets(prev => {
                      const sinEsteGrupoYFecha = prev.filter(t => !(t.grupo === ticket.grupo && t.fechaClave === ticket.fechaClave));
                      return [...sinEsteGrupoYFecha, ticket];
                    });
                    fetchData(true);
                  }}
                />
              </div>
            )}

            {/* TAB 3: RANKINGS REGULARES */}
            {isThursdayMember && activeTab === 'rankings' && (
              <div className="bg-white rounded-2xl p-4 border border-stone-200">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-[#eef2f6] text-[#2c4a66] px-2.5 py-1 rounded-lg border border-[#c3d3e0]">
                    Ranking {currentUser.group}
                  </span>
                  <span className="text-[10px] text-stone-400 font-semibold">{sortedGroupPlayers.length} jugadores</span>
                </div>

                <div className="flex gap-1.5 mb-4">
                  {['hibrido', 'deportivo', 'barandas'].map(type => (
                    <button
                      key={type}
                      onClick={() => setRankingType(type)}
                      className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg capitalize transition ${
                        rankingType === type ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {sortedGroupPlayers.map((p, idx) => (
                    <div
                      key={p.id}
                      onClick={() => setInspectedUser(p)}
                      className="flex items-center justify-between p-2 rounded-2xl bg-stone-50 text-xs hover:bg-[#eef2f6]/60 cursor-pointer transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-black w-6 text-center text-sm text-stone-400">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                        </span>
                        <UserAvatar name={p.name} photo={p.photo} size="md" />
                        <div>
                          <p className="font-bold text-stone-900">{p.name}</p>
                          <p className="text-[10px] text-stone-500">{p.titulo}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-[#2c4a66] text-sm">
                          {rankingType === 'deportivo' ? p.ptsDeportivo : rankingType === 'barandas' ? p.ptsBarandas : p.hibrido}
                        </span>
                        <span className="text-[10px] text-stone-400 block">pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: BOTE REGULAR */}
            {isThursdayMember && activeTab === 'bote' && (
              <div className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
                <div className="bg-[#faf3e7] border border-[#efd9a9] rounded-xl p-3 text-xs text-[#6b4d1c]">
                  <div className="flex justify-between items-center mb-1">
                    <p className="font-bold">💶 Bote {currentUser.group}</p>
                    <span className="text-[10px] font-black uppercase bg-[#faf3e7] text-[#6b4d1c] px-2 py-0.5 rounded">
                      Total: {groupPlayers.reduce((acc, curr) => acc + (curr.deuda || 0), 0)} €
                    </span>
                  </div>
                  <p className="text-[11px]">1€ por derrota jugada · 1€ por rajarse de la cena.</p>
                </div>

                <div className="space-y-2">
                  {[...groupPlayers]
                    .sort((a, b) => b.deuda - a.deuda)
                    .map(p => (
                      <div
                        key={p.id}
                        onClick={() => setInspectedUser(p)}
                        className="flex items-center justify-between p-2.5 rounded-2xl bg-stone-50 text-xs hover:bg-[#faf3e7]/60 cursor-pointer transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={p.name} photo={p.photo} size="md" />
                          <div>
                            <p className="font-bold text-stone-900">{p.name}</p>
                            <p className="text-[10px] text-stone-500">{p.pJ} partidos · {p.cSi} cenas</p>
                          </div>
                        </div>
                        <span className={`font-black text-sm px-2.5 py-1 rounded-xl ${
                          p.deuda > 0 ? 'bg-[#f6ede6] text-[#6b3f29]' : 'bg-[#eef4f0] text-[#2f5d50]'
                        }`}>
                          {p.deuda} €
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* TAB 5: MÓDULO TORNEOS CTC */}
            {activeTab === 'torneos' && (
              <div className="space-y-3">
                <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-xs">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-[10px] uppercase font-black bg-[#eef2f6] text-[#2c4a66] px-2 py-0.5 rounded-md tracking-wider">
                        Modo Torneo Aislado
                      </span>
                      <h2 className="text-xl font-black mt-1 text-stone-900">Torneos Especiales CTC</h2>
                    </div>
                    <LogoTorneo plano className="w-24 shrink-0" />
                  </div>
                  <button
                    onClick={() => { setTournamentWizardKey(k => k + 1); setShowTournamentWizard(true); }}
                    className="w-full mt-3 py-2.5 bg-[#2c4a66] text-white hover:bg-[#244058] font-black rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <span>✨</span> Crear Nuevo Torneo con Gemini
                  </button>
                </div>

                <div className="space-y-3">
                  {visibleTournaments.map(t => {
                    const curSubTab = tournamentSubTab[t.id] || 'partidos';
                    const isCreatorOrCoOrg = t.creatorId === currentUser?.id || (t.coOrganizerIds || []).includes(currentUser?.id);
                    
                    // NUEVO: Verificación de permisos de borrador
                    const isCaptain = t.captain1Id === currentUser?.id || t.captain2Id === currentUser?.id;
                    const canEditDraft = isCreatorOrCoOrg || isCaptain;

                   // NUEVA VISTA 1: BORRADOR DE EQUIPOS (FASE 2)
                    if (t.status === 'BOCETO_EQUIPOS') {
                      const cap1 = (t.participants || []).find(p => p.id === t.captain1Id);
                      const cap2 = (t.participants || []).find(p => p.id === t.captain2Id);
                      
                      const isMeCaptain1 = currentUser?.id === t.captain1Id;
                      const isMeCaptain2 = currentUser?.id === t.captain2Id;
                      const bothValidated = Boolean(t.captain1Validated) && Boolean(t.captain2Validated);

                      // RECUPERADO: Cálculo de estadísticas y equilibrio de equipos en tiempo real
                      const team1Players = (t.participants || []).filter(p => Number(p.assignedTeam || 1) === 1);
                      const team2Players = (t.participants || []).filter(p => Number(p.assignedTeam || 1) === 2);
                      const avgT1 = team1Players.length > 0 ? (team1Players.reduce((acc, p) => acc + (p.level || 3.5), 0) / team1Players.length).toFixed(2) : '0.00';
                      const avgT2 = team2Players.length > 0 ? (team2Players.reduce((acc, p) => acc + (p.level || 3.5), 0) / team2Players.length).toFixed(2) : '0.00';
                      const delta = Math.abs(parseFloat(avgT1) - parseFloat(avgT2)).toFixed(2);
                      const isBalanced = parseFloat(delta) <= 0.2;

                      // RECUPERADO: Función de Auto-Equilibrado para el borrador
                      const handleAutoBalanceDraft = () => {
                        const participantsList = t.participants || [];
                        const captain1Obj = participantsList.find(p => p.id === t.captain1Id);
                        const captain2Obj = participantsList.find(p => p.id === t.captain2Id);
                        
                        const rest = participantsList
                          .filter(p => p.id !== t.captain1Id && p.id !== t.captain2Id)
                          .sort((a, b) => (b.level || 3.5) - (a.level || 3.5));

                        let team1Arr = captain1Obj ? [captain1Obj] : [];
                        let team2Arr = captain2Obj ? [captain2Obj] : [];

                        // Igualamos primero el NÚMERO de jugadores por equipo (indispensable),
                        // y el nivel solo desempata cuando ambos equipos ya tienen el mismo tamaño.
                        rest.forEach(p => {
                          if (team1Arr.length < team2Arr.length) {
                            team1Arr.push(p);
                          } else if (team2Arr.length < team1Arr.length) {
                            team2Arr.push(p);
                          } else {
                            const sum1 = team1Arr.reduce((acc, item) => acc + (item.level || 3.5), 0);
                            const sum2 = team2Arr.reduce((acc, item) => acc + (item.level || 3.5), 0);
                            if (sum1 <= sum2) team1Arr.push(p);
                            else team2Arr.push(p);
                          }
                        });

                        const team1Ids = new Set(team1Arr.map(p => p.id));

                        let updatedSync = null;
                        const updatedTournaments = activeTournaments.map(item => {
                          if (item.id === t.id) {
                            updatedSync = {
                              ...item,
                              participants: participantsList.map(p => ({
                                ...p,
                                assignedTeam: team1Ids.has(p.id) ? 1 : 2
                              }))
                            };
                            return updatedSync;
                          }
                          return item;
                        });

                        setActiveTournaments(updatedTournaments);
                        localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updatedTournaments));

                        // REDISEÑO MULTIUSUARIO: mandamos solo la lista de asignaciones de
                        // equipo (id de jugador + equipo), no el torneo entero, para no pisar
                        // la cena o la validación de un capitán que otra persona esté tocando
                        // a la vez sobre este mismo torneo.
                        if (updatedSync) {
                          syncTorneoToCloud({
                            action: 'ACTUALIZAR_EQUIPOS_MASIVO',
                            idTorneo: t.id,
                            asignaciones: participantsList.map(p => ({ idJugador: p.id, equipo: team1Ids.has(p.id) ? 1 : 2 }))
                          });
                        }
                      };

                      return (
                        <div key={t.id} className="bg-stone-900 rounded-3xl p-4 border border-[#9fb4c7]/30 shadow-lg text-white space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-wider bg-[#d9b97c] text-[#6b4d1c] px-2 py-0.5 rounded-md">
                                Draft Ryder (Capitanes)
                              </span>
                              <h3 className="text-base font-black mt-1">{t.name}</h3>
                            </div>
                            {isCreatorOrCoOrg && (
                              <button onClick={() => handleDeleteTournament(t.id)} className="text-[11px] font-bold text-[#d9a582]">🗑️ Borrar</button>
                            )}
                          </div>

                          {canEditDraft ? (
                            <div className="space-y-3.5 mt-2">
                              <div className="bg-stone-800 p-3 rounded-2xl border border-stone-700 space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black uppercase text-[#9fb4c7]">📊 Balance de Escuadras</span>
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${isBalanced ? 'bg-[#a9c4ad]/20 text-[#a9c4ad] border border-[#a9c4ad]/40' : 'bg-[#d9b97c]/20 text-[#d9b97c] border border-[#d9b97c]/40'}`}>
                                    {isBalanced ? '✓ Equilibrado' : '⚠️ Desnivelado'} (Δ {delta})
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                                  <div className="bg-[#2c4a66]/60 p-2 rounded-xl border border-[#9fb4c7]/30">
                                    <span className="text-[9px] text-[#9fb4c7] font-bold block">Equipo Azul 🔵</span>
                                    <span className="text-sm font-black text-white">{avgT1} <span className="text-[10px] font-normal text-stone-400">({team1Players.length} jugs)</span></span>
                                  </div>
                                  <div className="bg-[#6b3f29]/60 p-2 rounded-xl border border-[#d9a582]/30">
                                    <span className="text-[9px] text-[#d9a582] font-bold block">Equipo Rojo 🔴</span>
                                    <span className="text-sm font-black text-white">{avgT2} <span className="text-[10px] font-normal text-stone-400">({team2Players.length} jugs)</span></span>
                                  </div>
                                </div>

                                <button 
                                  type="button" 
                                  onClick={handleAutoBalanceDraft} 
                                  className="w-full py-2 bg-gradient-to-r from-[#2c4a66] to-[#6b3f29] hover:from-[#9fb4c7] text-white font-black rounded-xl text-xs shadow-md transition"
                                >
                                  ⚡ Auto-Equilibrar Escuadras por Rating
                                </button>
                              </div>
                              
                              <div className="max-h-52 overflow-y-auto pr-1 space-y-1.5">
                                {(t.participants || []).map(p => (
                                  <div key={p.id} className="p-2 rounded-xl border border-stone-700 bg-stone-800 flex items-center justify-between">
                                    <div className="flex items-center gap-2 truncate">
                                      <UserAvatar name={p.name} photo={p.photo} size="xs" />
                                      <span className="font-bold text-stone-200 text-xs truncate">{p.name} <span className="text-[10px] text-[#d9b97c]">★{p.level || 3.5}</span></span>
                                    </div>
                                    <div className="flex bg-stone-900 p-0.5 rounded-lg border border-stone-700 shrink-0">
                                      <button 
                                        disabled={p.id === t.captain1Id || p.id === t.captain2Id}
                                        onClick={() => handleUpdateDraftTeam(t.id, p.id, 1)} 
                                        className={`px-2 py-1 rounded-md text-[10px] font-black transition ${p.assignedTeam === 1 ? 'bg-[#2c4a66] text-white' : 'text-stone-500'}`}
                                      >
                                        🔵 Azul
                                      </button>
                                      <button 
                                        disabled={p.id === t.captain1Id || p.id === t.captain2Id}
                                        onClick={() => handleUpdateDraftTeam(t.id, p.id, 2)} 
                                        className={`px-2 py-1 rounded-md text-[10px] font-black transition ${p.assignedTeam === 2 ? 'bg-[#6b3f29] text-white' : 'text-stone-500'}`}
                                      >
                                        🔴 Rojo
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="bg-stone-800 p-3 rounded-2xl border border-stone-700 space-y-2 text-xs">
                                <span className="text-[10px] font-black text-[#9fb4c7] uppercase block">Validación de Equipos</span>
                                
                                <label className="flex items-center gap-2 cursor-pointer bg-stone-900/60 p-2 rounded-xl border border-stone-700">
                                  <input
                                    type="checkbox"
                                    disabled={!isMeCaptain1}
                                    title={!isMeCaptain1 ? 'Solo el Capitán Azul puede marcar esta casilla' : ''}
                                    checked={Boolean(t.captain1Validated)}
                                    onChange={e => handleSetCaptainValidation(t.id, 1, e.target.checked)}
                                    className="w-4 h-4 text-[#2c4a66] accent-[#2c4a66] disabled:opacity-40 disabled:cursor-not-allowed"
                                  />
                                  <span className="font-bold text-stone-200">Capitán Azul ({cap1?.name || 'Por asignar'}) da el visto bueno</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer bg-stone-900/60 p-2 rounded-xl border border-stone-700">
                                  <input
                                    type="checkbox"
                                    disabled={!isMeCaptain2}
                                    title={!isMeCaptain2 ? 'Solo el Capitán Rojo puede marcar esta casilla' : ''}
                                    checked={Boolean(t.captain2Validated)}
                                    onChange={e => handleSetCaptainValidation(t.id, 2, e.target.checked)}
                                    className="w-4 h-4 text-[#6b3f29] accent-[#6b3f29] disabled:opacity-40 disabled:cursor-not-allowed"
                                  />
                                  <span className="font-bold text-stone-200">Capitán Rojo ({cap2?.name || 'Por asignar'}) da el visto bueno</span>
                                </label>
                                {!isMeCaptain1 && !isMeCaptain2 && (
                                  <p className="text-[10px] text-stone-400 italic pt-0.5">
                                    👀 Solo {cap1?.name || 'el Capitán Azul'} y {cap2?.name || 'el Capitán Rojo'} pueden dar el visto bueno a su equipo. Como organizador puedes ver el estado, pero no validar en su nombre.
                                  </p>
                                )}
                              </div>
                              
                              <button 
                                onClick={() => handleApproveDraftTeams(t.id)} 
                                disabled={!bothValidated}
                                className="w-full py-2.5 bg-[#2f5d50] hover:bg-[#a9c4ad] disabled:opacity-40 text-white font-black rounded-xl text-xs mt-2 transition shadow-md"
                              >
                                {bothValidated ? '✅ Equipos Validados por ambos Capitanes' : '⏳ Esperando doble validación...'}
                              </button>
                            </div>
                          ) : (
                            <div className="p-4 text-center bg-stone-800 rounded-2xl border border-stone-700 mt-2">
                              <span className="text-3xl block mb-2">🛡️</span>
                              <p className="text-xs text-stone-300">Los capitanes <strong>{cap1?.name?.split(' ')[0] || 'Azul'}</strong> y <strong>{cap2?.name?.split(' ')[0] || 'Rojo'}</strong> están confeccionando los equipos.<br/><br/>Recibirás una alerta cuando el cuadrante esté listo.</p>
                            </div>
                          )}
                        </div>
                      );
                    }
                    // NUEVA VISTA 2: GENERACIÓN DE CUADRO (FASE 3)
                    if (t.status === 'BOCETO_CUADRO') {
                      const handleGenerateFixtureForDraft = async () => {
                        // Generamos los cruces automáticos de equipo
                        const teamA = (t.participants || []).filter(p => p.assignedTeam === 1);
                        const teamB = (t.participants || []).filter(p => p.assignedTeam === 2);
                        const totalRounds = Math.max(1, Math.floor((t.duration || 120) / 20));
                        const rounds = [];

                        let generatedTeams = [
                          { name: `Equipo Azul 🔵`, players: teamA, score: 0 },
                          { name: `Equipo Rojo 🔴`, players: teamB, score: 0 }
                        ];

                        for (let r = 1; r <= totalRounds; r++) {
                          const matchesList = [];
                          const poolA = [...teamA].sort(() => Math.random() - 0.5);
                          const poolB = [...teamB].sort(() => Math.random() - 0.5);

                          for (let c = 1; c <= (Number(t.courts) || 1); c++) {
                            if (poolA.length >= 2 && poolB.length >= 2) {
                              const a1 = poolA.pop(); const a2 = poolA.pop();
                              const b1 = poolB.pop(); const b2 = poolB.pop();

                              matchesList.push({
                                id: `RYDER_R${r}_P${c}_${Date.now()}`,
                                court: `Pista ${c}`,
                                team1: `${a1.name.split(' ')[0]} & ${a2.name.split(' ')[0]} (Azul)`,
                                team2: `${b1.name.split(' ')[0]} & ${b2.name.split(' ')[0]} (Rojo)`,
                                team1Ids: [a1.id, a2.id],
                                team2Ids: [b1.id, b2.id],
                                score: '',
                                winner: null,
                                status: 'PENDIENTE'
                              });
                            }
                          }
                          rounds.push({ round: r, timeLabel: `Cruce Ryder - Ronda ${r}`, matches: matchesList });
                        }

                        // Actualizamos el torneo a estado ACTIVO con los cruces listos
                        let updatedSync = null;
                        const updatedTournaments = activeTournaments.map(item => {
                          if (item.id === t.id) {
                            updatedSync = { ...item, status: 'ACTIVO', rounds, teams: generatedTeams };
                            return updatedSync;
                          }
                          return item;
                        });

                        setActiveTournaments(updatedTournaments);
                        localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updatedTournaments));

                        if (updatedSync) {
                          await syncTorneoToCloud({ action: 'GUARDAR_TORNEO', torneo: updatedSync });
                        }
                      };

                      return (
                        <div key={t.id} className="bg-[#4a3350] rounded-3xl p-4 border border-[#b893ba]/30 shadow-lg text-white space-y-3 text-center">
                          <span className="text-3xl block mb-1">✨</span>
                          <h3 className="text-base font-black">¡Equipos Validados por los Capitanes!</h3>
                          <p className="text-xs text-[#f2eef2]">Ambos capitanes han dado su conformidad. Pulsa para generar los cruces definitivos.</p>
                          {isCreatorOrCoOrg && (
                            <button onClick={handleGenerateFixtureForDraft} className="w-full py-2.5 bg-[#2f5d50] hover:bg-[#a9c4ad] text-white font-black rounded-xl text-xs mt-2 transition shadow-md">
                              🚀 Generar Cuadrante Definitivo
                            </button>
                          )}
                        </div>
                      );
                    }

                    // VISTA NORMAL (Torneo ACTIVO)
                    return (
                      <div key={t.id} className="bg-white rounded-3xl p-4 border border-stone-200 shadow-xs space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-black uppercase tracking-wider bg-[#f2eef2] text-[#4a3350] px-2.5 py-0.5 rounded-lg border border-[#ddc9de]">
                                {t.mode}
                              </span>
                              {isCreatorOrCoOrg && (
                                <span className="text-[9px] bg-[#eef4f0] text-[#2f5d50] font-extrabold px-1.5 py-0.2 rounded border border-[#a9c4ad]">
                                  👑 Organizador
                                </span>
                              )}
                            </div>
                            <h3 className="text-base font-black text-stone-900 mt-1">{t.name}</h3>
                          </div>
                          {isCreatorOrCoOrg && (
                            <button
                              onClick={() => handleDeleteTournament(t.id)}
                              className="text-[11px] font-bold text-[#d9a582] hover:text-[#6b3f29] p-1 rounded-lg"
                              title="Eliminar torneo"
                            >
                              🗑️
                            </button>
                          )}
                        </div>

                        <div className="flex bg-stone-100 p-1 rounded-xl text-[11px] font-bold">
                          <button
                            onClick={() => setTournamentSubTab(prev => ({ ...prev, [t.id]: 'partidos' }))}
                            className={`flex-1 py-1.5 rounded-lg transition inline-flex items-center justify-center gap-1 ${curSubTab === 'partidos' ? 'bg-white shadow text-[#4a3350]' : 'text-stone-600'}`}
                          >
                            <PadelRacketsIcon /> Partidos
                          </button>
                          <button
                            onClick={() => setTournamentSubTab(prev => ({ ...prev, [t.id]: 'jugadores' }))}
                            className={`flex-1 py-1.5 rounded-lg transition ${curSubTab === 'jugadores' ? 'bg-white shadow text-[#2c4a66]' : 'text-stone-600'}`}
                          >
                            📲 Invitar
                          </button>
                          <button
                            onClick={() => setTournamentSubTab(prev => ({ ...prev, [t.id]: 'cena' }))}
                            className={`flex-1 py-1.5 rounded-lg transition ${curSubTab === 'cena' ? 'bg-white shadow text-[#6b4d1c]' : 'text-stone-600'}`}
                          >
                            🍻 3º Tiempo
                          </button>
                        </div>

                        {curSubTab === 'partidos' && (
                          <div className="space-y-2">
                            {t.mode === 'pozo' && t.pozoEscalera && (() => {
                              const standings = computePozoStandings(t);
                              if (!standings.length) return null;
                              return (
                                <div className="bg-white rounded-2xl border border-stone-200 p-3 space-y-1.5">
                                  <span className="font-black text-stone-800 text-xs block mb-1">🪜 Clasificación en vivo</span>
                                  {standings.map((p, idx) => (
                                    <div key={p.id} className="flex items-center justify-between text-[11px] py-1 border-b border-stone-50 last:border-0">
                                      <span className="font-bold text-stone-700">{idx + 1}. {p.name}</span>
                                      <span className="text-stone-500">
                                        Pista {p.finalCourt === 999 ? '–' : p.finalCourt}
                                        {p.subidos > 0 && <span className="text-[#2f5d50] font-bold"> ▲{p.subidos}</span>}
                                        {p.subidos < 0 && <span className="text-[#d9a582] font-bold"> ▼{Math.abs(p.subidos)}</span>}
                                      </span>
                                    </div>
                                  ))}
                                  <span className="text-[9px] text-stone-400 block pt-0.5">Quien termina en la Pista 1 gana; a igualdad de pista, decide cuánto has subido desde donde empezaste.</span>
                                </div>
                              );
                            })()}
                            <button
                              id={`share-btn-${t.id}`}
                              onClick={() => handleShareTournamentImage(t.id, t.name)}
                              className="w-full mb-1 py-2 bg-[#2f5d50] hover:bg-[#2f5d50] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
                            >
                              <span>📷</span> Compartir Cuadrante por WhatsApp
                            </button>

                            {/* Contenedor invisible para nosotros pero que será el lienzo de la foto */}
                            <div id={`tournament-fixture-${t.id}`} className="space-y-2 bg-white p-2 rounded-xl">
                              
                              {/* Título interno para que la foto se vea profesional */}
                              <div className="text-center pb-2 pt-1 border-b border-stone-100 mb-2">
                                <span className="font-black text-stone-800 text-sm block">{t.name}</span>
                                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">Cuadrante Oficial</span>
                              </div>

                              {(t.rounds || []).map(r => (
                                <div key={r.round} className="bg-stone-50 p-2.5 rounded-2xl border border-stone-200 space-y-1">
                                  <div className="text-center mb-1.5">
                                    <span className="text-[9px] font-black uppercase text-[#4a3350] bg-[#f2eef2] px-2 py-0.5 rounded-md">
                                      {r.timeLabel || `Ronda ${r.round}`}
                                    </span>
                                  </div>
                                  {(r.matches || []).map((m, mIdx) => (
                                    <div
                                      key={m.id || mIdx}
                                      onClick={() => {
                                        setActiveTournamentId(t.id);
                                        setReportingTournamentMatch(m);
                                      }}
                                      className="bg-white p-2.5 rounded-xl border border-stone-200 flex items-center justify-between text-xs cursor-pointer hover:border-[#b893ba]"
                                    >
                                      <span className="font-bold text-stone-800">{m.court}</span>
                                      <span className="font-semibold text-stone-600">{m.team1} vs {m.team2}</span>
                                      <span className="text-[#4a3350] font-black">{m.score || 'Anotar ✍️'}</span>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {curSubTab === 'jugadores' && (
                          <div className="space-y-1.5 max-h-56 overflow-y-auto">
                            {(t.participants || []).map(p => (
                              <div key={p.id} className="p-2 rounded-xl border bg-white flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <UserAvatar name={p.name} photo={p.photo} size="xs" />
                                  <span className="font-bold text-stone-800">{p.name}</span>
                                </div>
                                <button
                                  onClick={() => handleSharePlayerPersonalLink(t, p)}
                                  className="px-2 py-1 bg-[#2f5d50] text-white font-bold text-[10px] rounded-lg"
                                >
                                  📲 Enviar Link
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {curSubTab === 'cena' && (() => {
                          const myParticipant = (t.participants || []).find(
                            p => p.id === currentUser?.id || normalizeName(p.name) === normalizeName(currentUser?.name || '')
                          );
                          const siList = (t.participants || []).filter(p => p.dinner === 'SI');
                          const noList = (t.participants || []).filter(p => p.dinner === 'NO');
                          const pendList = (t.participants || []).filter(p => p.dinner !== 'SI' && p.dinner !== 'NO');

                          return (
                            <div className="space-y-2.5 text-xs">
                              {/* NUEVO: el propio jugador confirma aquí si se queda al 3º tiempo de ESTE torneo */}
                              {myParticipant && (
                                <div className="bg-[#faf3e7] border border-[#efd9a9] rounded-2xl p-3 space-y-2">
                                  <p className="font-bold text-[#6b4d1c]">¿Te quedas a la cena de este torneo?</p>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleUpdateTournamentDinner(t.id, myParticipant.id, 'SI')}
                                      className={`flex-1 py-2 rounded-xl font-black transition ${myParticipant.dinner === 'SI' ? 'bg-[#2f5d50] text-white shadow-xs' : 'bg-white text-stone-600 border border-stone-200'}`}
                                    >
                                      🍻 Sí, me quedo
                                    </button>
                                    <button
                                      onClick={() => handleUpdateTournamentDinner(t.id, myParticipant.id, 'NO')}
                                      className={`flex-1 py-2 rounded-xl font-black transition ${myParticipant.dinner === 'NO' ? 'bg-[#6b3f29] text-white shadow-xs' : 'bg-white text-stone-600 border border-stone-200'}`}
                                    >
                                      🏃‍♂️ No me quedo
                                    </button>
                                  </div>
                                </div>
                              )}

                              <div className="grid grid-cols-3 gap-1.5 text-center">
                                <div className="bg-[#eef4f0] border border-[#c7ddc9] rounded-xl p-2">
                                  <span className="block font-black text-[#2f5d50]">{siList.length}</span>
                                  <span className="text-[9px] font-bold text-[#2f5d50] uppercase">Cenan</span>
                                </div>
                                <div className="bg-[#faf3e7] border border-[#efd9a9] rounded-xl p-2">
                                  <span className="block font-black text-[#6b4d1c]">{pendList.length}</span>
                                  <span className="text-[9px] font-bold text-[#6b4d1c] uppercase">Pendientes</span>
                                </div>
                                <div className="bg-[#f6ede6] border border-[#ead3bf] rounded-xl p-2">
                                  <span className="block font-black text-[#6b3f29]">{noList.length}</span>
                                  <span className="text-[9px] font-bold text-[#6b3f29] uppercase">Se rajan</span>
                                </div>
                              </div>

                              {/* NUEVO: desglose por nombre — antes solo se veían los contadores y no
                                  había forma de saber QUIÉN faltaba por confirmar o quién se rajaba. */}
                              <div className="space-y-2">
                                {siList.length > 0 && (
                                  <div>
                                    <span className="text-[9px] font-black text-[#2f5d50] uppercase block mb-1">🍻 Cenan</span>
                                    <div className="flex flex-wrap gap-1">
                                      {siList.map(p => (
                                        <span key={p.id} className="bg-[#eef4f0] text-[#2f5d50] text-[10px] font-bold px-2 py-0.5 rounded-full">{p.name}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {pendList.length > 0 && (
                                  <div>
                                    <span className="text-[9px] font-black text-[#6b4d1c] uppercase block mb-1">⏳ Pendientes de confirmar</span>
                                    <div className="flex flex-wrap gap-1">
                                      {pendList.map(p => (
                                        <span key={p.id} className="bg-[#faf3e7] text-[#6b4d1c] text-[10px] font-bold px-2 py-0.5 rounded-full">{p.name}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {noList.length > 0 && (
                                  <div>
                                    <span className="text-[9px] font-black text-[#6b3f29] uppercase block mb-1">🏃‍♂️ Se rajan</span>
                                    <div className="flex flex-wrap gap-1">
                                      {noList.map(p => (
                                        <span key={p.id} className="bg-[#f6ede6] text-[#6b3f29] text-[10px] font-bold px-2 py-0.5 rounded-full">{p.name}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              <button
                                onClick={() => handleShareTournamentDinnerWhatsapp(t)}
                                className="w-full py-2 bg-[#2f5d50] text-white font-bold rounded-xl"
                              >
                                📲 Avisar al Restaurante por WhatsApp
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

     {/* MODAL: AÑADIR PARTIDO PLAYTOMIC */}
      <AddPlaytomicMatchModal 
        isOpen={showAddModal} 
        onClose={() => setShowAddModal(false)} 
        onAddMatch={handleAddPlaytomicMatch} 
        onOpenExisting={handleOpenExistingMatch}
        syncing={syncing} 
      />

      {/* MODAL: NUEVA PROPUESTA DE PARTIDO (PACHANGA) */}
      <NuevaConvocatoriaModal
        isOpen={showConvModal}
        onClose={() => setShowConvModal(false)}
        onSubmit={handleCrearConvocatoria}
        partido={partidoOferta}
        players={players}
        currentUser={currentUser}
        destinatarios={contactoPre ? contactoPre.jugadores : []}
        fechaInicial={contactoPre ? contactoPre.dia : ''}
        horaInicial={contactoPre ? contactoPre.hora : ''}
      />

      {/* MODAL: RECARGAR PLAYTOMIC */}
      {showReloadPlaytomicModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl">
            <h3 className="text-base font-black text-stone-900 mb-2">Recargar desde Playtomic</h3>
            <form onSubmit={handleReloadPlaytomic} className="space-y-3">
              <textarea
                rows={5}
                required
                value={reloadPlaytomicText}
                onChange={e => setReloadPlaytomicText(e.target.value)}
                disabled={Boolean(modalTrabajando)}
                placeholder="Pega el mensaje copiado de Playtomic..."
                className="w-full border rounded-xl p-2.5 text-xs font-semibold disabled:opacity-60"
              />
              {modalError && <p role="alert" className="text-[11px] font-bold text-[#6b3f29] bg-[#f6ede6] border border-[#ead3bf] rounded-xl p-2.5">⚠️ {modalError}</p>}
              <div className="flex gap-2">
                <button type="button" disabled={Boolean(modalTrabajando)} onClick={() => setShowReloadPlaytomicModal(false)} className="flex-1 py-2 bg-stone-100 font-bold text-xs rounded-xl disabled:opacity-50">{modalError ? 'Cerrar' : 'Cancelar'}</button>
                <button type="submit" disabled={Boolean(modalTrabajando)} className="flex-1 py-2 bg-[#2c4a66] text-white font-bold text-xs rounded-xl disabled:opacity-70 flex items-center justify-center gap-2">
                  {modalTrabajando && <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                  {modalTrabajando === 'guardando' ? 'Guardando…' : modalTrabajando === 'actualizando' ? 'Actualizando…' : modalError ? 'Reintentar' : 'Actualizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CAMBIAR SUPLENTES */}
      {showEditPlayersModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl">
            <h3 className="text-base font-black text-stone-900 mb-2">Cambiar Suplentes</h3>
            <form onSubmit={handleSaveManualPlayers} className="space-y-2">
              {[0, 1, 2, 3].map(idx => (
                <input
                  key={idx}
                  type="text"
                  required
                  value={editPlayerSlots[idx]}
                  disabled={Boolean(modalTrabajando)}
                  onChange={e => {
                    const updated = [...editPlayerSlots];
                    updated[idx] = e.target.value;
                    setEditPlayerSlots(updated);
                  }}
                  className="w-full border rounded-xl p-2 text-xs font-semibold disabled:opacity-60"
                />
              ))}
              {modalError && <p role="alert" className="text-[11px] font-bold text-[#6b3f29] bg-[#f6ede6] border border-[#ead3bf] rounded-xl p-2.5">⚠️ {modalError}</p>}
              <div className="flex gap-2 pt-2">
                <button type="button" disabled={Boolean(modalTrabajando)} onClick={() => setShowEditPlayersModal(false)} className="flex-1 py-2 bg-stone-100 font-bold text-xs rounded-xl disabled:opacity-50">{modalError ? 'Cerrar' : 'Cancelar'}</button>
                <button type="submit" disabled={Boolean(modalTrabajando)} className="flex-1 py-2 bg-[#2c4a66] text-white font-bold text-xs rounded-xl disabled:opacity-70 flex items-center justify-center gap-2">
                  {modalTrabajando && <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                  {modalTrabajando ? 'Guardando…' : modalError ? 'Reintentar' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NUEVO: INTERCAMBIO DIRECTO ("SWAP") DE JUGADORES */}
      <SwapPlayerModal
        isOpen={Boolean(swapModalData)}
        onClose={() => setSwapModalData(null)}
        match={currentMatch}
        sourcePlayerId={swapModalData?.playerId}
        onConfirmSwap={handleConfirmSwap}
      />

      {/* MODAL: MARCADOR REGULAR */}
      <MatchVisualScoreModal
        isOpen={showScoreModal}
        onClose={() => setShowScoreModal(false)}
        title="Resultado Liga Regular"
        subtitle={currentMatch?.date}
        team1Name="Pareja 1"
        team2Name="Pareja 2"
        p1Players={(currentMatch?.players || []).filter(p => Number(p.team || 1) === 1)}
        p2Players={(currentMatch?.players || []).filter(p => Number(p.team || 1) === 2)}
        onSaveScore={handleSaveRegularMatchScore}
      />

      {/* MODAL: MARCADOR TORNEO */}
      <MatchVisualScoreModal
        isOpen={Boolean(reportingTournamentMatch)}
        onClose={() => setReportingTournamentMatch(null)}
        title="Resultado de Torneo"
        subtitle={reportingTournamentMatch?.court}
        team1Name={reportingTournamentMatch?.team1}
        team2Name={reportingTournamentMatch?.team2}
        onSaveScore={handleSaveTournamentScore}
      />

      {/* MODAL: VINCULAR JUGADOR */}
      <LinkPlayerSlotModal
        isOpen={Boolean(linkingSlot)}
        onClose={() => setLinkingSlot(null)}
        slotName={linkingSlot?.name}
        matchId={linkingSlot?.matchId}
        allRegisteredPlayers={players}
        onConfirmLink={handleConfirmLinkSlot}
      />

      {/* MODAL: CREAR TORNEO */}
      <TournamentCreatorModal
        key={tournamentWizardKey}
        isOpen={showTournamentWizard}
        onClose={() => setShowTournamentWizard(false)}
        allPlayers={players}
        tournaments={activeTournaments}
        onTournamentCreated={handleTournamentCreated}
        currentUserId={currentUser?.id}
        onSaveLevel={handleSaveLevel}
      />

      {/* MODAL: INSPECCIONAR PERFIL */}
      <UserProfileModal
        isOpen={Boolean(inspectedUser)}
        onClose={() => setInspectedUser(null)}
        user={inspectedUser}
        matches={matches}
        tournaments={activeTournaments}
        allDinnerGuests={allDinnerGuests}
        onPhotoUploaded={handlePhotoUploaded}
        onUpdateUserData={handleUpdateUserData}
        isCurrentUser={inspectedUser?.id === currentUser?.id}
        isThursdayMember={isThursdayMember}
        viewerUser={currentUser}
        onRequestClubJoin={handleRequestClubJoin}
        onValidateClubRequest={handleValidateClubRequest}
      />

      {/* MODAL: REGLAS OFICIALES */}
      <CriteriosModal
        isOpen={showRulesModal}
        onClose={() => setShowRulesModal(false)}
      />

      {/* MODAL: NOVEDADES (una vez por versión, solo con sesión iniciada) */}
      <NovedadesModal
        isOpen={novedadesPendientes}
        onClose={() => { marcarNovedadesVistas(); setNovedadesPendientes(false); }}
        onVerGuia={() => { marcarNovedadesVistas(); setNovedadesPendientes(false); setShowRulesModal(true); }}
      />
    </div>
  );
}
