import React, { useState, useEffect, useMemo, useRef } from 'react';

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

function extractCleanDate(dateStr) {
  if (!dateStr) return 'Sin fecha';
  return String(dateStr)
    .toLowerCase()
    .replace(/★.*$/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b\d{1,2}:\d{2}\b/g, '')
    .replace(/[📅🗓️📍,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeName(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
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
    const d = parseMatchDateObject(m.date);
    return d ? d.getDay() === 4 : false;
  } else if (group === 'chicas') {
    if (combined.includes('mar')) return true;
    const d = parseMatchDateObject(m.date);
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

function parseMatchDateObject(dateStr) {
  if (!dateStr) return null;
  const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})/);
  const hours = timeMatch ? parseInt(timeMatch[1], 10) : 21;
  const minutes = timeMatch ? parseInt(timeMatch[2], 10) : 0;

  const matchDate = new Date();
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
      matchDate.setMonth(meses[foundMonth]);
      matchDate.setDate(day);
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

  const matchDate = parseMatchDateObject(m.date);
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
function esCenaComputable(dateStr) {
  const fechaBase = parseMatchDateObject(dateStr);
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

  (matches || []).forEach(m => {
    if (m.status !== 'FINALIZADO') return;
    const mySlot = (m.players || []).find(p => p.id === currentUser.id || normalizeName(p.name) === normUserName);
    if (!mySlot) return;
    const fecha = parseMatchDateObject(m.date);
    if (!fecha) return;
    eventosPartido.push({ fecha, ganado: mySlot.won === 'SI' });
    if (mySlot.dinner === 'SI' && esCenaComputable(m.date) && fecha.getDay() === diaCenaEsperado) {
      eventosCena.push({ fecha });
    }
  });

  (allDinnerGuests || []).forEach(g => {
    if (g.id === currentUser.id || normalizeName(g.name) === normUserName) {
      const cleanDate = extractCleanDate(g.target || g.cleanTarget);
      if (!esCenaComputable(cleanDate)) return;
      const fecha = parseMatchDateObject(cleanDate);
      if (fecha && fecha.getDay() === diaCenaEsperado) eventosCena.push({ fecha });
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

  const victorias = eventosPartido.filter(e => e.ganado);
  const derrotas = eventosPartido.filter(e => !e.ganado);
  const fechaUltimoPartido = masReciente(eventosPartido);
  const fechaUltimaVictoria = masReciente(victorias);
  const fechaUltimaDerrota = masReciente(derrotas);
  const fechaUltimaCena = masReciente(eventosCena);

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
    semanasSinGanar: semanasDesde(fechaUltimaVictoria),
    semanasSinPerder: semanasDesde(fechaUltimaDerrota),
    semanasSinCena: semanasDesde(fechaUltimaCena),
    ultimoResultado,
    tieneHistorial: eventosPartido.length > 0
  };
}

function parseMatchTiming(dateStr) {
  const matchDate = parseMatchDateObject(dateStr);
  if (!matchDate) return { canReport: true, shouldPrompt: false };

  const now = new Date();
  const diffHours = (now - matchDate) / (1000 * 60 * 60);
  return {
    canReport: diffHours >= 0,
    shouldPrompt: diffHours >= 2.0
  };
}

function isCurrentWeek(dateStr) {
  const matchDate = parseMatchDateObject(dateStr);
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

function isUpcoming(dateStr) {
  const matchDate = parseMatchDateObject(dateStr);
  if (!matchDate) return true;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return matchDate >= startOfToday;
}

// NUEVO (tema visual): icono propio de "2 palas de padel" cruzadas, para sustituir el emoji
// ⚔️ (dos espadas) que usábamos para todo lo relacionado con Torneos — no existe un emoji
// estándar de palas de padel, así que a petición de Marcos se dibuja como SVG propio. Usa
// currentColor para heredar el color del texto donde se coloque (igual de versátil que un
// emoji tanto en botones claros como oscuros) y "1em" de tamaño por defecto para poder
// colocarlo igual que un emoji dentro de cualquier texto/span (hereda el font-size de alrededor).
function PadelRacketsIcon({ className = '', size = '1em' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`inline-block align-[-0.15em] shrink-0 ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g transform="rotate(45 12 12)">
        <path d="M12 2.6c-2.5 0-4.4 2-4.4 4.6 0 2.8 2 4.9 4.4 4.9s4.4-2.1 4.4-4.9c0-2.6-1.9-4.6-4.4-4.6z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.22"/>
        <circle cx="10.5" cy="6.2" r="0.5" fill="currentColor"/>
        <circle cx="13.5" cy="6.2" r="0.5" fill="currentColor"/>
        <circle cx="12" cy="8.3" r="0.5" fill="currentColor"/>
        <circle cx="10.5" cy="10.4" r="0.5" fill="currentColor"/>
        <circle cx="13.5" cy="10.4" r="0.5" fill="currentColor"/>
        <line x1="12" y1="12.1" x2="12" y2="21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </g>
      <g transform="rotate(-45 12 12)">
        <path d="M12 2.6c-2.5 0-4.4 2-4.4 4.6 0 2.8 2 4.9 4.4 4.9s4.4-2.1 4.4-4.9c0-2.6-1.9-4.6-4.4-4.6z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.22"/>
        <circle cx="10.5" cy="6.2" r="0.5" fill="currentColor"/>
        <circle cx="13.5" cy="6.2" r="0.5" fill="currentColor"/>
        <circle cx="12" cy="8.3" r="0.5" fill="currentColor"/>
        <circle cx="10.5" cy="10.4" r="0.5" fill="currentColor"/>
        <circle cx="13.5" cy="10.4" r="0.5" fill="currentColor"/>
        <line x1="12" y1="12.1" x2="12" y2="21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </g>
    </svg>
  );
}

// NUEVO (tema visual, fondo general de la app): pista de padel de muro en tono tierra batida.
// A propósito NO es una foto real — eso añadiría una dependencia externa (enlace que se puede
// caer, dudas de licencia de uso) para un detalle puramente decorativo — sino una ilustración
// generada en SVG/CSS: base en gradiente tierra batida + un patrón repetido en crema muy tenue
// con la malla/valla superior ("muro") y las líneas típicas de una pista (límite, línea
// central, líneas de servicio). Se calcula una sola vez (constante de módulo) porque no
// depende de ningún dato de la app. Los colores de las tarjetas no cambian: todas siguen con
// fondo blanco/stone sólido, así que este fondo solo se ve en los huecos entre tarjetas.
const FONDO_PISTA_PADEL_SVG = (() => {
  const mallaVerticales = Array.from({ length: 31 }, (_, i) => `<line x1="${i * 20}" y1="0" x2="${i * 20}" y2="40"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">`
    + `<g stroke="#fdf6ec" stroke-width="2" opacity="0.32"><line x1="0" y1="40" x2="600" y2="40"/>${mallaVerticales}</g>`
    + `<g stroke="#fdf6ec" stroke-width="3" fill="none" opacity="0.26">`
    + `<rect x="60" y="110" width="480" height="430" rx="10"/>`
    + `<line x1="300" y1="110" x2="300" y2="540"/>`
    + `<line x1="60" y1="222" x2="540" y2="222"/>`
    + `<line x1="60" y1="428" x2="540" y2="428"/>`
    + `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

const ESTILO_FONDO_PISTA_PADEL = {
  backgroundColor: '#c97b4a',
  backgroundImage: `${FONDO_PISTA_PADEL_SVG}, linear-gradient(160deg, #e2975f 0%, #c97b4a 55%, #b5693f 100%)`,
  backgroundRepeat: 'repeat, no-repeat',
  backgroundSize: '600px 600px, auto',
  backgroundAttachment: 'fixed, fixed'
};

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
            <li><strong>🎾 Partidos:</strong> pulsa "Añadir Partido (Pegar desde Playtomic)" y pega el texto que Playtomic genera al compartir el partido (con los jugadores marcados con ✅). Si solo pegas el enlace, sin ese texto, la app te pedirá la fecha/hora y al menos 2 jugadores a mano antes de crearlo.</li>
            <li><strong>🍻 Cena &amp; Club:</strong> confirma si te quedas a cenar. En los torneos puedes ver, por nombre, quién cena, quién está pendiente de confirmar y quién se raja.</li>
            <li><strong>🏆 Rankings:</strong> toca el perfil de cualquier jugador para ver sus estadísticas: partidos jugados, % de victorias, cenas, rajadas, historial de puntos y desglose del bote.</li>
            <li><strong>💶 Bote:</strong> lo que cada uno debe aportar, según las reglas de abajo.</li>
            <li><strong className="inline-flex items-center gap-1"><PadelRacketsIcon /> Torneos:</strong> 4 formatos distintos para organizar — ver detalle más abajo.</li>
            <li><strong>🔔 Avisos:</strong> desde el icono de la campana configuras qué avisos quieres recibir — el recordatorio de los lunes (si para esa semana no hay partido subido) y los avisos de apertura de reserva en Playtomic, por día y hora (puedes tener varios).</li>
            <li><strong>🔔 Notificaciones en el móvil:</strong> en iPhone solo funcionan si añades la app a la pantalla de inicio desde Safari (compartir → "Añadir a pantalla de inicio") y la abres desde ahí; en Android/ordenador puedes activarlas directamente desde "Avisos".</li>
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
            <li><strong>Rajarse de la cena:</strong> +1 € de bote.</li>
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

  return (
    <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xl shrink-0">{status === 'on' ? '🔔' : '🔕'}</span>
        <div className="flex-1 min-w-0">
          <span className="font-black text-stone-900 text-xs block">Notificaciones en este dispositivo</span>
          <span className="text-[10px] text-stone-500 block">
            {status === 'on'
              ? 'Activadas — te avisaremos aquí de lo importante, aunque tengas la app cerrada.'
              : status === 'denied'
                ? 'Las bloqueaste en el navegador; actívalas desde los ajustes del sitio para volver a usarlas.'
                : 'Actívalas para enterarte de lo importante sin tener que abrir la app.'}
          </span>
        </div>
      </div>
      {status !== 'denied' && (
        <div className="flex gap-2">
          {status !== 'on' ? (
            <button onClick={handleEnable} disabled={busy} className="flex-1 py-2 bg-[#d9b97c] hover:bg-[#6b4d1c] text-white font-bold rounded-xl text-[11px] disabled:opacity-50 transition">
              {busy ? 'Activando...' : '🔔 Activar notificaciones'}
            </button>
          ) : (
            <button onClick={handleTestPush} disabled={busy} className="flex-1 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl text-[11px] disabled:opacity-50 transition">
              {busy ? 'Enviando...' : '🧪 Enviar notificación de prueba'}
            </button>
          )}
        </div>
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
      console.error('Error guardando preferencia de avisos:', e);
      alert('No se ha podido guardar el cambio. Revisa tu conexión e inténtalo de nuevo.');
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
    <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xl shrink-0">⚙️</span>
        <span className="font-black text-stone-900 text-xs">Qué avisos quieres recibir</span>
      </div>

      <div className="flex items-center justify-between gap-2 bg-stone-50 rounded-xl p-2.5">
        <div className="min-w-0">
          <span className="font-bold text-stone-800 text-[11px] block">📋 Aviso de los lunes</span>
          <span className="text-[10px] text-stone-500 block">Si para esta semana no te localizamos en ningún partido subido a la app</span>
        </div>
        <button
          onClick={handleToggleLunes}
          disabled={busy}
          className={`shrink-0 w-11 h-6 rounded-full transition relative disabled:opacity-50 ${lunesActivo ? 'bg-[#a9c4ad]' : 'bg-stone-300'}`}
        >
          <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition" style={{ left: lunesActivo ? '22px' : '2px' }} />
        </button>
      </div>

      <div className="bg-stone-50 rounded-xl p-2.5 space-y-2">
        <span className="font-bold text-stone-800 text-[11px] block">🎾 Avisos de reserva en Playtomic</span>
        <span className="text-[10px] text-stone-500 block">
          Te avisamos unos minutos antes de que se abra la reserva (se abre una semana antes, al mismo día y hora que configures aquí)
        </span>

        {misReservas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {misReservas.map(r => (
              <span key={r.id} className="inline-flex items-center gap-1 bg-[#faf3e7] text-[#6b4d1c] text-[10px] font-bold px-2 py-1 rounded-full">
                {(DIAS_SEMANA_ALERTAS.find(d => d.v === Number(r.diaSemana)) || {}).l || r.diaSemana} {r.hora}
                <button onClick={() => handleDeleteReserva(r.id)} disabled={busy} className="text-[#6b4d1c] hover:text-[#6b4d1c] font-black disabled:opacity-50">✕</button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-1.5 items-center">
          <select value={diaNuevo} onChange={(e) => setDiaNuevo(e.target.value)} className="flex-1 text-[11px] border border-stone-300 rounded-lg px-2 py-1.5 bg-white">
            {DIAS_SEMANA_ALERTAS.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}
          </select>
          <div className="flex items-center gap-1 shrink-0">
            <select
              value={horaSelActual}
              onChange={(e) => setHoraNueva(`${e.target.value}:${minSelActual}`)}
              className="text-[11px] border border-stone-300 rounded-lg pl-1.5 pr-0.5 py-1.5 bg-white"
            >
              {HORAS_SELECTOR_ALERTA.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="text-[11px] text-stone-400 font-bold">:</span>
            <select
              value={minSelActual}
              onChange={(e) => setHoraNueva(`${horaSelActual}:${e.target.value}`)}
              className="text-[11px] border border-stone-300 rounded-lg pl-1.5 pr-0.5 py-1.5 bg-white"
            >
              {MINUTOS_SELECTOR_ALERTA.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <button onClick={handleAddReserva} disabled={busy} className="shrink-0 px-3 py-1.5 bg-[#d9b97c] hover:bg-[#6b4d1c] text-white font-bold rounded-lg text-[11px] disabled:opacity-50 transition">
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
        const maxSize = 1600;
        let width = img.width;
        let height = img.height;
        if (width > height) { if (width > maxSize) { height *= maxSize / width; width = maxSize; } }
        else { if (height > maxSize) { width *= maxSize / height; height = maxSize; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
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
      setModo('revisando');
    } catch (err) {
      console.error(err);
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
          <p className="text-[10px] text-[#6b4d1c] bg-[#faf3e7] border border-[#efd9a9] rounded-xl p-2">
            No se ha podido leer el ticket automáticamente. Añade las líneas a mano.
          </p>
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
function HomeScreen({ currentUser, matches, activeTournaments, allDinnerGuests, pendingAlerts, onNavigate, onOpenMatch }) {
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
      .map(m => ({ m, fecha: parseMatchDateObject(m.date) }))
      .filter(x => x.fecha && x.fecha >= ahora && x.fecha <= finSemana)
      .sort((a, b) => a.fecha - b.fecha)
      .map(x => {
        const jugadores = x.m.players || [];
        const cenaSi = jugadores.filter(p => String(p.dinner || '').toUpperCase() === 'SI').length;
        const cenaPendiente = jugadores.filter(p => String(p.dinner || '').toUpperCase() === 'PENDIENTE').length;
        return { match: x.m, cenaSi, cenaPendiente, totalJugadores: jugadores.length };
      });

    const myNameNorm = normalizeName(currentUser?.name || '');
    const misTorneos = (activeTournaments || []).filter(t => (
      (t.participants || []).some(p => p.id === currentUser?.id || normalizeName(p.name) === myNameNorm) ||
      t.creatorId === currentUser?.id ||
      (t.coOrganizerIds || []).includes(currentUser?.id)
    ));

    return { partidosSemana, misTorneos };
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
          <div className="bg-[#faf3e7] border border-[#efd9a9] rounded-xl p-3 text-center space-y-1.5">
            <span className="text-[11px] font-bold text-[#6b4d1c] block">Todavía no hay partido subido para esta semana</span>
            <button onClick={() => onNavigate('partidos')} className="text-[10px] font-black text-[#6b4d1c] underline">Subir partido</button>
          </div>
        ) : (
          resumen.partidosSemana.map(({ match, cenaSi, cenaPendiente, totalJugadores }) => (
            <button
              key={match.id}
              onClick={() => onOpenMatch(match.id)}
              className="w-full text-left bg-stone-50 hover:bg-stone-100 transition rounded-xl p-2.5 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <span className="font-bold text-stone-800 text-[11px] block truncate">{match.date}</span>
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
            <button onClick={() => onNavigate('torneos')} className="text-[10px] font-bold text-[#4a3350] hover:underline">Ver todo →</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {resumen.misTorneos.map(t => (
              <span key={t.id} className="bg-[#f2eef2] text-[#4a3350] text-[10px] font-bold px-2 py-1 rounded-full">{t.name}</span>
            ))}
          </div>
        </div>
      )}

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
        <button onClick={() => onNavigate('torneos')} className="bg-[#4a3350] text-white rounded-2xl p-3 text-center hover:bg-[#4a3350] transition">
          <span className="text-xl block mb-0.5"><PadelRacketsIcon /></span>
          <span className="text-[11px] font-bold">Torneos</span>
        </button>
      </div>
    </div>
  );
}

// NUEVO: pantalla de administración, solo visible para ADMIN_PLAYER_ID — reúne las dos tareas
// de control que pidió Marcos: (1) validar altas nuevas de Chicos/Chicas antes de que entren a
// la app, y (2) subir a un invitado de torneo al grupo real cuando corresponda, sin dejar que
// esa decisión dependa del propio invitado.
function AdminScreen({ onBack, pendingPlayers, promotableGroups, onApprove, onReject, onPromote }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-stone-800">🛡️ Administración</h2>
        <button onClick={onBack} className="text-xs font-bold text-[#2c4a66] hover:underline">← Volver</button>
      </div>

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
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs font-bold text-[#2c4a66] hover:underline flex items-center gap-1">
        ← Volver
      </button>

      <div className="bg-gradient-to-r from-[#d9b97c] to-[#6b4d1c] rounded-3xl p-5 text-white shadow-md">
        <div className="flex items-center gap-2.5">
          <span className="text-3xl">🔔</span>
          <div>
            <h2 className="text-xl font-black">Tus pendientes</h2>
            <p className="text-[11px] opacity-90 font-semibold">
              {alerts.length === 0
                ? 'No tienes nada pendiente ahora mismo 🎉'
                : `${alerts.length} ${alerts.length === 1 ? 'cosa pendiente' : 'cosas pendientes'}`}
            </p>
          </div>
        </div>
      </div>

      {currentUser && <PushNotificationsCard currentUser={currentUser} apiUrl={apiUrl} />}

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

      {alerts.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-stone-200">
          <p className="text-3xl mb-1">✅</p>
          <p className="text-sm font-bold text-stone-700">¡Estás al día! No tienes ninguna acción pendiente.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map(a => (
            <button
              key={a.id}
              onClick={a.action}
              className="w-full text-left bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs hover:border-[#d9b97c] transition flex items-center gap-3"
            >
              <span className="text-2xl shrink-0">{a.icon}</span>
              <div className="min-w-0 flex-1">
                <span className="font-black text-stone-900 text-xs block truncate">{a.title}</span>
                <span className="text-[11px] text-stone-500 truncate block">{a.description}</span>
              </div>
              <span className="text-stone-300 text-lg shrink-0">→</span>
            </button>
          ))}
        </div>
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
            headToHead.recent.push({ date: m.date, tipo: 'pareja', ganaron: mySlot.won === 'SI' });
          } else {
            headToHead.rivalPlayed++;
            if (mySlot.won === 'SI') headToHead.profileWonVsViewer++; else headToHead.viewerWonVsProfile++;
            headToHead.recent.push({ date: m.date, tipo: 'rival', ganaProfile: mySlot.won === 'SI' });
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
          id: m.id, date: m.date, location: m.location || 'Club', score: m.score || 'Finalizado',
          myTeam: mySlot.team, won: mySlot.won === 'SI', dinner: mySlot.dinner, partner, rivals, esAmistoso: true
        };
        friendliesList.push(friendlyDetail);
        if (friendlyDetail.won) friendliesWonList.push(friendlyDetail); else friendliesLostList.push(friendlyDetail);
        puntosDetalle.push({ date: m.date, title: `Partido vs ${rivals} (amistoso)`, pts: 0, desc: 'Amistoso — no computa para la liga' });
        boteDetalle.push({ date: m.date, title: `Partido vs ${rivals} (amistoso)`, bote: 0, desc: 'Amistoso — no computa para la liga' });
        return;
      }

      const matchDetail = {
        id: m.id, date: m.date, location: m.location || 'Club', score: m.score || 'Finalizado',
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
      const cenaDeEstePartidoComputable = esCenaComputable(m.date);
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
      } else if (mySlot.dinner === 'PENDIENTE') {
        breakdownPts.push('Cena Pendiente (0)');
      }

      puntosDetalle.push({ date: m.date, title: `Partido vs ${rivals}`, pts: matchPts, desc: breakdownPts.join(' | ') });
      if (matchBote > 0) {
        boteDetalle.push({ date: m.date, title: `Partido vs ${rivals}`, bote: matchBote, desc: breakdownBote.join(' | ') });
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
        if (!esCenaComputable(cleanDate)) return;

        // Evitar duplicar si ya se ha sumado una cena ese mismo día por partido
        const yaTieneCenaEseDia = dinnerYesList.some(d => d.date === cleanDate);

        if (!yaTieneCenaEseDia) {
          dinnerYesList.push({
            date: cleanDate, partner: 'Solo Cena', rivals: '-', score: '-', dinner: 'SI', won: false
          });
          puntosDetalle.push({
            date: cleanDate, title: 'Asistencia 3º Tiempo (Sin jugar)', pts: 5, desc: 'Solo Cena (+5)'
          });
        }
      }
    });

    // ORDENACIÓN CRONOLÓGICA (Reemplazamos el puntosDetalle.reverse() estático)
    const sortByDate = (a, b) => {
      const dateA = parseMatchDateObject(a.date) || new Date(0);
      const dateB = parseMatchDateObject(b.date) || new Date(0);
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

    // Partidos y victorias por mes (últimos 6 meses), combinando Liga regular + Torneos
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
      const d = parseMatchDateObject(m.date);
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
    const fechaDeItem = (item) => (item.fecha !== undefined ? item.fecha : parseMatchDateObject(item.date));
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
                      <span className="text-stone-500">{r.date}</span>
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
                          <span>📅 {item.date}</span>
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
                          <span>📅 {item.date}{item.esAmistoso && <span className="text-stone-500 font-semibold"> · 🤝 Amistoso</span>}</span>
                          {item.partner !== 'Solo Cena' && (
                            <span className={item.won ? 'text-[#a9c4ad]' : 'text-[#d9a582]'}>{item.won ? 'Victoria 🏆' : 'Derrota ❌'}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-stone-100 font-semibold truncate">
                          {item.partner === 'Solo Cena' ? 'Sin partido jugado' : <>Pareja con <strong>{item.partner}</strong> vs <span>{item.rivals}</span></>}
                        </p>
                        <p className="text-[9px] text-stone-400">
                          {item.partner !== 'Solo Cena' && `Marcador: ${item.score} · `} Cena: {item.dinner === 'SI' ? '🍻 Sí' : item.dinner === 'NO' ? '🏃‍♂️ No' : '🟡 Pendiente'}
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
              📊 Partidos y victorias (últimos 6 meses) · Liga + Torneos
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
        id: 'guest_' + Date.now(),
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
      id: 'TORNEO_' + Date.now(),
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

function AddPlaytomicMatchModal({ isOpen, onClose, onAddMatch, syncing }) {
  const [playtomicText, setPlaytomicText] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualLocation, setManualLocation] = useState('Real Club de Tenis de La Coruña');
  const [manualP1, setManualP1] = useState('');
  const [manualP2, setManualP2] = useState('');
  const [manualP3, setManualP3] = useState('');
  const [manualP4, setManualP4] = useState('');
  const [formError, setFormError] = useState('');

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
      setPlaytomicText(''); setManualDate(''); setManualP1(''); setManualP2(''); setManualP3(''); setManualP4(''); setFormError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Cuántos de los 4 huecos de jugador manual se han rellenado.
  const jugadoresManualesRellenos = [manualP1, manualP2, manualP3, manualP4].filter(p => p.trim()).length;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!playtomicText.trim()) return;

    // Si solo se ha pegado el enlace (sin el texto plano con fecha/jugadores de Playtomic),
    // antes creábamos igualmente el partido con una fecha de relleno ("Jueves 21:00") y sin
    // jugadores en cuanto se pulsaba "Crear Partido", aunque el usuario no hubiera rellenado
    // nada en el bloque de "Datos adicionales requeridos". Ahora lo bloqueamos: si faltan la
    // fecha/hora o al menos 2 jugadores, no se envía nada y se explica qué falta.
    if (isOnlyPlaytomicLink) {
      if (!manualDate.trim()) {
        setFormError('Indica la fecha y hora del partido (el enlace que has pegado no las trae).');
        return;
      }
      if (jugadoresManualesRellenos < 2) {
        setFormError('Añade al menos 2 jugadores (el enlace que has pegado no los trae).');
        return;
      }
    }

    setFormError('');
    onAddMatch({ playtomicText, isOnlyPlaytomicLink, manualDate, manualLocation, manualP1, manualP2, manualP3, manualP4 });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-3">
        <h3 className="text-base font-black text-stone-900">Añadir Partido Playtomic</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea rows={4} required value={playtomicText} onChange={e => { setPlaytomicText(e.target.value); setFormError(''); }} placeholder="Pega el texto copiado de Playtomic o el enlace..." className="w-full border rounded-xl p-2.5 text-xs font-semibold" />
          {isOnlyPlaytomicLink && (
            <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200 space-y-2">
              <span className="text-[10px] font-black uppercase text-[#2c4a66] block">Datos adicionales requeridos</span>
              <span className="text-[10px] text-stone-500 block -mt-1">
                Has pegado solo un enlace, sin los detalles del partido. Rellena esto a mano o no se creará el partido.
              </span>
              <input type="text" value={manualDate} onChange={e => { setManualDate(e.target.value); setFormError(''); }} placeholder="Fecha y Hora (Ej: Jueves 21:00)" className="w-full border rounded-lg p-1.5 text-xs font-semibold" />
              <div className="grid grid-cols-2 gap-1.5">
                <input type="text" value={manualP1} onChange={e => { setManualP1(e.target.value); setFormError(''); }} placeholder="Jugador 1" className="border rounded-lg p-1.5 text-xs" />
                <input type="text" value={manualP2} onChange={e => { setManualP2(e.target.value); setFormError(''); }} placeholder="Jugador 2" className="border rounded-lg p-1.5 text-xs" />
                <input type="text" value={manualP3} onChange={e => { setManualP3(e.target.value); setFormError(''); }} placeholder="Jugador 3" className="border rounded-lg p-1.5 text-xs" />
                <input type="text" value={manualP4} onChange={e => { setManualP4(e.target.value); setFormError(''); }} placeholder="Jugador 4" className="border rounded-lg p-1.5 text-xs" />
              </div>
            </div>
          )}
          {formError && (
            <div className="bg-[#f6ede6] border border-[#ead3bf] text-[#6b3f29] text-[11px] font-bold rounded-xl p-2">
              ⚠️ {formError}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 bg-stone-100 font-bold text-xs rounded-xl">Cancelar</button>
            <button type="submit" disabled={syncing} className="flex-1 py-2 bg-[#2c4a66] text-white font-bold text-xs rounded-xl shadow-xs">Crear Partido</button>
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
// APLICACIÓN PRINCIPAL COMPLETA
export default function App() {
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
  const [inspectedUser, setInspectedUser] = useState(null);

  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('padel_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [filterTime, setFilterTime] = useState('semana');
  const [targetPinUser, setTargetPinUser] = useState(null);

  const [showRegisterForm, setShowRegisterForm] = useState(false);


  const [showAddModal, setShowAddModal] = useState(false);
  

  const [showReloadPlaytomicModal, setShowReloadPlaytomicModal] = useState(false);
  const [reloadPlaytomicText, setReloadPlaytomicText] = useState('');

  const [showEditPlayersModal, setShowEditPlayersModal] = useState(false);
  const [editPlayerSlots, setEditPlayerSlots] = useState(['', '', '', '']);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const torneoParam = params.get('torneo');
    const playerParam = params.get('p');

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

  const fetchData = async (silent = false) => {
    try {
      if (!silent) setSyncing(true);
      const urlConBypass = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}nocache=${Date.now()}`;
      const res = await fetch(urlConBypass, { method: 'GET', redirect: 'follow' });
      const json = await res.json();
      if (json.ok) {
        if (json.jugadores) {
          setPlayers(json.jugadores);
          localStorage.setItem('padel_cached_players', JSON.stringify(json.jugadores));
          if (currentUser) {
            const fresh = json.jugadores.find(u => u.id === currentUser.id);
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
        const newUserId = json.id || 'u_' + Date.now();
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
      } else {
        alert('No se pudo registrar: ' + (json.error || 'Error en el servidor de Google Sheets.'));
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


  const handleAddPlaytomicMatch = async (data) => {
    let payloadText = data.playtomicText.trim();

    if (data.isOnlyPlaytomicLink) {
      // El modal ya valida que manualDate y al menos 2 jugadores estén rellenos antes de
      // llegar aquí, así que ya no hace falta (ni conviene) un valor de relleno tipo
      // "Jueves 21:00" que antes se colaba en silencio cuando el usuario dejaba esto vacío.
      const d = data.manualDate.trim();
      const loc = data.manualLocation.trim() || 'Real Club de Tenis de La Coruña';
      const p1 = data.manualP1.trim() ? `✅ ${data.manualP1.trim()}` : '';
      const p2 = data.manualP2.trim() ? `✅ ${data.manualP2.trim()}` : '';
      const p3 = data.manualP3.trim() ? `✅ ${data.manualP3.trim()}` : '';
      const p4 = data.manualP4.trim() ? `✅ ${data.manualP4.trim()}` : '';

      payloadText = `📅 ${d}\n📍 ${loc}\n${data.playtomicText.trim()}\n${p1}\n${p2}\n${p3}\n${p4}`.trim();
    }

    setSyncing(true);
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'CREAR_PARTIDO_PLAYTOMIC', textoCrudo: payloadText, grupo: myGroup })
      });
      const responseData = await res.json();
      if (responseData.ok) {
        setShowAddModal(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };
  const handleReloadPlaytomic = async (e) => {
    e.preventDefault();
    if (!reloadPlaytomicText.trim() || !selectedMatchId) return;

    setSyncing(true);
    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ACTUALIZAR_PLAYTOMIC_PARTIDO', idPartido: selectedMatchId, textoCrudo: reloadPlaytomicText })
      });
      setShowReloadPlaytomicModal(false);
      setReloadPlaytomicText('');
      fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveManualPlayers = async (e) => {
    e.preventDefault();
    if (!selectedMatchId) return;

    setSyncing(true);
    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'MODIFICAR_JUGADORES_MANUAL', idPartido: selectedMatchId, jugadores: editPlayerSlots })
      });
      setShowEditPlayersModal(false);
      fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
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
      const matchDateClean = extractCleanDate(m.date);
      if (matchDateClean !== cleanDate) return false;
      return (m.players || []).some(p => p.id === currentUser.id || normalizeName(p.name) === normMe);
    });

    if (userMatchToday) {
      const mySlot = userMatchToday.players.find(p => p.id === currentUser.id || normalizeName(p.name) === normMe);
      if (mySlot) {
        await handleUpdateDinner(userMatchToday.id, mySlot.id, mySlot.name, newState);
        alert(`¡Entendido ${currentUser.name}! Como juegas partido el ${cleanDate}, hemos confirmado tu cena directamente en tu partido.`);
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
      console.error('Fallo de red al actualizar cena. Revirtiendo...', e);
      setMatches(previousMatches);
      
      if (e.name === 'AbortError') {
        alert('⏳ La conexión va muy lenta. No se ha podido confirmar tu asistencia a la cena. Revisa tu cobertura e inténtalo de nuevo.');
      } else {
        alert('❌ Error de conexión: No se ha podido guardar en el servidor. Inténtalo de nuevo.');
      }
    } finally {
      setLoadingDinnerId(null);
    }
  };

  // NUEVA LÓGICA: Ejecutar el cambio/intercambio en el estado y llamar al Backend
  const handleConfirmSwap = async (matchId, sourcePlayerId, targetPlayerId) => {
    const match = matches.find(m => m.id === matchId);
    const sourcePlayer = match.players.find(p => p.id === sourcePlayerId);
    const sourceTeam = Number(sourcePlayer.team || 1);
    const targetTeam = sourceTeam === 1 ? 2 : 1;

    if (!targetPlayerId) {
      // Movimiento directo a hueco libre
      setMatches(prev => prev.map(m => {
        if (m.id !== matchId) return m;
        return {
          ...m,
          players: m.players.map(p => p.id === sourcePlayerId ? { ...p, team: targetTeam } : p)
        };
      }));

      try {
        fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'CAMBIAR_PAREJA_JUGADOR',
            idPartido: matchId,
            idJugador: sourcePlayerId,
            team: targetTeam
          })
        });
      } catch (e) {
        console.warn('Error moviendo jugador:', e);
      }
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

      try {
        // Solicitud 1: Mover P1 al equipo 2
        fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'CAMBIAR_PAREJA_JUGADOR',
            idPartido: matchId,
            idJugador: sourcePlayerId,
            team: targetTeam
          })
        });
        // Solicitud 2: Mover P2 al equipo 1
        fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'CAMBIAR_PAREJA_JUGADOR',
            idPartido: matchId,
            idJugador: targetPlayerId,
            team: sourceTeam
          })
        });
      } catch (e) {
        console.warn('Error intercambiando jugadores:', e);
      }
    }
    
    // Cierra el modal de Swap
    setSwapModalData(null);
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
      console.error('Fallo de red al guardar resultado. Revirtiendo...', e);
      setMatches(previousMatches);
      
      if (e.name === 'AbortError') {
        alert('⏳ La conexión va muy lenta. El resultado NO se ha guardado. Inténtalo de nuevo cuando tengas mejor cobertura.');
      } else {
        alert('❌ Error de conexión: No se ha podido guardar el resultado en el servidor.');
      }
    }
  };

  const handleResetMatchScore = async (matchId) => {
    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;
      return {
        ...m,
        status: 'PROGRAMADO',
        score: '',
        players: m.players.map(p => ({ ...p, won: 'PENDIENTE' }))
      };
    }));

    try {
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'GUARDAR_RESULTADO',
          idPartido: matchId,
          marcador: '',
          ganadorIds: [],
          ganadorNombres: [],
          reiniciar: true
        })
      });
    } catch (e) {
      console.error(e);
      fetchData();
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

  const filteredMatches = useMemo(() => {
    return matches.filter(m => {
      if ((m.grupo || 'chicos').toLowerCase() !== myGroup) return false;
      if (filterTime === 'todos') return true;
      if (filterTime === 'semana') return isCurrentWeek(m.date);
      if (filterTime === 'proximos') return isUpcoming(m.date);
      return true;
    });
  }, [matches, myGroup, filterTime]);

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
          description: `${m.date} · ¿Te quedas al 3º tiempo?`,
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
          description: `${m.date} · Pon el marcador`,
          action: () => { setActiveTab('partidos'); setSelectedMatchId(m.id); }
        });
      }
    });

    // 4b. DESACTIVADA A PETICIÓN DEL USUARIO: la alerta de "falta el resultado de un
    // partido de torneo" resultaba demasiado intrusiva (se dispara por cada partido de cada
    // ronda, en torneos de varias rondas puede ser muchas veces seguidas). El aviso
    // equivalente para la liga regular de los jueves (bloque 4a, arriba) se mantiene, ya que
    // ahí es un único partido a la semana.

    return alerts;
  }, [matches, activeTournaments, currentUser]);

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
      const cleanKey = extractCleanDate(m.date);
      if (cleanKey && cleanKey !== 'sin fecha') {
        if (!datesMap.has(cleanKey)) {
          const niceLabel = cleanKey.charAt(0).toUpperCase() + cleanKey.slice(1);
          const dateObj = parseMatchDateObject(m.date) || new Date();
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
    return groupMatches.filter(m => extractCleanDate(m.date) === activeDinnerKey);
  }, [groupMatches, activeDinnerKey]);

  // Aquí faltaba la apertura del useMemo y la inicialización de los Map
  const { dinnerYes, dinnerNo, dinnerPending, dinnerGuests } = useMemo(() => {
    const yesMap = new Map();
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
        } else if (p.dinner === 'NO') {
          noMap.set(groupKey, playerObj);
          pendingMap.delete(groupKey);
          yesMap.delete(groupKey);
        } else {
          if (!yesMap.has(groupKey) && !noMap.has(groupKey)) {
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
      const isDateMatch = (
        gTargetClean === targetDateClean ||
        gTargetClean.includes(targetDateClean) ||
        targetDateClean.includes(gTargetClean)
      );

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
              <span className="text-4xl mb-1 flex justify-center"><PadelRacketsIcon /></span>
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
    <div className="min-h-screen text-stone-900 pb-16" style={ESTILO_FONDO_PISTA_PADEL}>
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
        ) : activeTab === 'inicio' && isThursdayMember ? (
          <HomeScreen
            currentUser={currentUser}
            matches={matches}
            activeTournaments={activeTournaments}
            allDinnerGuests={allDinnerGuests}
            pendingAlerts={pendingAlerts}
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenMatch={(id) => { setActiveTab('partidos'); setSelectedMatchId(id); }}
          />
        ) : selectedMatchId && currentMatch && isThursdayMember ? (
          /* DETALLE DEL PARTIDO REGULAR */
          <div className="space-y-4">
            <button
              onClick={() => setSelectedMatchId(null)}
              className="text-xs font-bold text-[#2c4a66] hover:underline flex items-center gap-1"
            >
              ← Volver a la lista de partidos
            </button>

            {/* BANNER CUANDO EL PARTIDO ESTÁ LISTO PARA ANOTAR */}
            {(() => {
              const dynamicStatus = computeMatchStatus(currentMatch);
              const { canReport } = parseMatchTiming(currentMatch.date);
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

              <h2 className="text-xl font-black text-stone-900 mt-1">{currentMatch.date}</h2>
              <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                📍 {currentMatch.location}
              </p>

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
                  onClick={() => setShowReloadPlaytomicModal(true)}
                  className="py-2 px-2 bg-[#eef2f6] hover:bg-[#eef2f6] text-[#2c4a66] text-[11px] font-bold rounded-xl border border-[#c3d3e0] transition flex items-center justify-center gap-1"
                >
                  🔄 Recargar Playtomic
                </button>
                <button
                  onClick={() => {
                    const currentNames = (currentMatch.players || []).map(p => p.name);
                    setEditPlayerSlots([currentNames[0] || '', currentNames[1] || '', currentNames[2] || '', currentNames[3] || '']);
                    setShowEditPlayersModal(true);
                  }}
                  className="py-2 px-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-[11px] font-bold rounded-xl border border-stone-200 transition flex items-center justify-center gap-1"
                >
                  ✏️ Cambiar Suplentes
                </button>
              </div>

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
                                    {p.dinner === 'SI' ? '🍻 Cena confirmada' : p.dinner === 'NO' ? '🏃‍♂️ Se raja' : '🟡 Cena pendiente'}
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
                    <div className="flex gap-2.5">
                      <button
                        disabled={isProcessing}
                        onClick={() => handleUpdateDinner(currentMatch.id, mySlot.id, mySlot.name, 'SI')}
                        className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs transition border ${
                          mySlot.dinner === 'SI'
                            ? 'bg-[#2f5d50] text-white border-[#2f5d50] shadow-md'
                            : 'bg-white text-stone-700 border-stone-200 hover:bg-[#eef4f0]'
                        } ${isProcessing ? 'opacity-60 cursor-wait' : ''}`}
                      >
                        ✓ ¡SÍ, CLARO! 🍻
                      </button>
                      <button
                        disabled={isProcessing}
                        onClick={() => handleUpdateDinner(currentMatch.id, mySlot.id, mySlot.name, 'NO')}
                        className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs transition border ${
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
                  { key: 'torneos', label: 'Torneos', icon: <PadelRacketsIcon />, active: 'bg-[#4a3350] shadow-xs text-white' }
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
              <div className="bg-[#f2eef2] border border-[#ddc9de] text-[#4a3350] rounded-2xl p-3 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl"><PadelRacketsIcon /></span>
                  <div>
                    <span className="font-black text-xs block">Acceso Exclusivo de Torneos CTC</span>
                    <span className="text-[10px] text-[#4a3350] font-medium">Visualizas únicamente los eventos a los que estás convocado</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-[#f2eef2] text-[#4a3350] px-2 py-0.5 rounded-md">
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

                {filteredMatches.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 text-center border border-stone-200">
                    <p className="text-2xl mb-1">🎾</p>
                    <p className="text-sm font-bold text-stone-700">No hay partidos de {currentUser.group} en esta vista</p>
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
                            <h3 className="text-base font-black text-stone-900 mt-1">{m.date}</h3>
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

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-[#eef4f0] border border-[#c7ddc9] rounded-2xl p-2.5">
                      <span className="text-base font-black text-[#2f5d50] block">{dinnerYes.length + dinnerGuests.length}</span>
                      <span className="text-[10px] font-bold text-[#2f5d50] uppercase">Cenan SÍ</span>
                    </div>
                    <div className="bg-[#f6ede6] border border-[#ead3bf] rounded-2xl p-2.5">
                      <span className="text-base font-black text-[#6b3f29] block">{dinnerNo.length}</span>
                      <span className="text-[10px] font-bold text-[#6b3f29] uppercase">Se Rajan</span>
                    </div>
                    <div className="bg-[#faf3e7] border border-[#efd9a9] rounded-2xl p-2.5">
                      <span className="text-base font-black text-[#6b4d1c] block">{dinnerPending.length}</span>
                      <span className="text-[10px] font-bold text-[#6b4d1c] uppercase">Pendientes</span>
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
                <div className="bg-gradient-to-r from-[#4a3350] to-[#2c4a66] rounded-3xl p-5 text-white shadow-md">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-[10px] uppercase font-black bg-white/20 px-2 py-0.5 rounded-md tracking-wider">
                        Modo Torneo Aislado
                      </span>
                      <h2 className="text-xl font-black mt-1">Torneos Especiales CTC</h2>
                    </div>
                    <span className="text-3xl"><PadelRacketsIcon /></span>
                  </div>
                  <button
                    onClick={() => { setTournamentWizardKey(k => k + 1); setShowTournamentWizard(true); }}
                    className="w-full mt-3 py-2.5 bg-white text-[#4a3350] hover:bg-[#f2eef2] font-black rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-1.5"
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
        syncing={syncing} 
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
                placeholder="Pega el mensaje copiado de Playtomic..."
                className="w-full border rounded-xl p-2.5 text-xs font-semibold"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowReloadPlaytomicModal(false)} className="flex-1 py-2 bg-stone-100 font-bold text-xs rounded-xl">Cancelar</button>
                <button type="submit" disabled={syncing} className="flex-1 py-2 bg-[#2c4a66] text-white font-bold text-xs rounded-xl">Actualizar</button>
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
                  onChange={e => {
                    const updated = [...editPlayerSlots];
                    updated[idx] = e.target.value;
                    setEditPlayerSlots(updated);
                  }}
                  className="w-full border rounded-xl p-2 text-xs font-semibold"
                />
              ))}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowEditPlayersModal(false)} className="flex-1 py-2 bg-stone-100 font-bold text-xs rounded-xl">Cancelar</button>
                <button type="submit" disabled={syncing} className="flex-1 py-2 bg-[#2c4a66] text-white font-bold text-xs rounded-xl">Guardar</button>
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
    </div>
  );
}
