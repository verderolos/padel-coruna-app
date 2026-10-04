import React, { useState, useEffect, useMemo, useRef } from 'react';

// URL REAL DE TU BACKEND
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxkd-BmLpYxmLtev5wcxwsyda94bG1mFW9gtDpEAgsmhV1HCfDwn2-syPDEvBUPwiiiGw/exec';

const FALLBACK_USERS = [];
const FALLBACK_MATCHES = [];

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
        className={`${sizeClasses[size]} rounded-full object-cover border border-slate-200 shadow-xs shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black flex items-center justify-center border border-white/50 shadow-xs shrink-0 ${className}`}
    >
      {initials}
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
              active ? 'text-amber-400 drop-shadow-xs' : 'text-slate-200'
            }`}
            title={`Nivel ${s}`}
          >
            ★
          </button>
        );
      })}
      <span className="text-[11px] font-black text-slate-700 ml-1.5 w-6 text-right">
        {Number(value).toFixed(1)}
      </span>
    </div>
  );
}

function calculateTournamentSuggestedLevel(user, tournaments) {
  let baseLevel = Number(user.level) || 3.5;
  const normUserName = normalizeName(user.name);

  let tourMatches = 0;
  let tourWon = 0;
  (tournaments || []).forEach(t => {
    (t.rounds || []).forEach(r => {
      (r.matches || []).forEach(m => {
        if (m.status !== 'FINALIZADO') return;
        const inT1 = normalizeName(m.team1 || '').includes(normUserName);
        const inT2 = normalizeName(m.team2 || '').includes(normUserName);
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
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            📖 Sistema Oficial de Puntuación CTC
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl font-bold leading-none">&times;</button>
        </div>

        <section className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
          <h4 className="font-extrabold text-blue-950 text-xs uppercase tracking-wide">🏆 1. Ranking Deportivo</h4>
          <ul className="text-xs text-blue-900 space-y-1 list-disc list-inside">
            <li><strong>Victoria:</strong> +5 puntos.</li>
            <li><strong>Derrota:</strong> 0 puntos.</li>
          </ul>
        </section>

        <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2">
          <h4 className="font-extrabold text-emerald-950 text-xs uppercase tracking-wide">🍻 2. Ranking Barandas (3º Tiempo)</h4>
          <ul className="text-xs text-emerald-900 space-y-1 list-disc list-inside">
            <li><strong>Quedarse a la cena:</strong> +5 puntos (computables tras las 09:00 AM del día siguiente).</li>
            <li><strong>Jugar el partido:</strong> +1 punto (por compromiso y asistencia).</li>
            <li><strong>Rajarse de la cena habiendo jugado:</strong> -1 punto de penalización.</li>
          </ul>
        </section>

        <section className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-1.5">
          <h4 className="font-extrabold text-purple-950 text-xs uppercase tracking-wide">⚡ 3. Ranking Híbrido (Corona General)</h4>
          <p className="text-xs text-purple-900">Suma directa del <strong>Ranking Deportivo + Ranking Barandas</strong>.</p>
        </section>

        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-1.5">
          <h4 className="font-extrabold text-amber-950 text-xs uppercase tracking-wide">💶 4. El Bote</h4>
          <ul className="text-xs text-amber-900 space-y-1 list-disc list-inside">
            <li><strong>Derrota en pista:</strong> +1 € de bote.</li>
            <li><strong>Rajarse de la cena:</strong> +1 € de bote.</li>
            <li><strong>Victoria:</strong> 0 € (el ganador no paga bote).</li>
          </ul>
        </section>

        <button onClick={onClose} className="w-full mt-2 bg-slate-900 text-white font-bold py-2.5 rounded-xl text-xs">
          Cerrar
        </button>
      </div>
    </div>
  );
}

function PinModal({ isOpen, onClose, targetUser, onPinSuccess, apiUrl }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPin('');
    setError('');
  }, [isOpen, targetUser]);

  if (!isOpen || !targetUser) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pin.length !== 4) {
      setError('El PIN debe tener 4 dígitos');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'VERIFICAR_PIN', idJugador: targetUser.id, pin })
      });
      const data = await res.json();
      if (data.ok) {
        onPinSuccess(data.jugador || targetUser);
      } else {
        setError(data.error || 'PIN incorrecto');
      }
    } catch (err) {
      if (targetUser.pin && targetUser.pin === pin) {
        onPinSuccess(targetUser);
      } else {
        setError('Error al verificar PIN');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-3xl max-w-xs w-full p-6 text-white border border-slate-700 shadow-2xl text-center space-y-4">
        <UserAvatar name={targetUser.name} photo={targetUser.photo} size="lg" className="mx-auto" />
        <div>
          <h3 className="text-base font-black">{targetUser.name}</h3>
          <p className="text-xs text-slate-400">Introduce tu PIN de 4 dígitos</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            maxLength={4}
            autoFocus
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            className="w-full bg-slate-900 border border-slate-700 rounded-2xl py-3 text-center text-2xl tracking-[0.5em] font-black text-white focus:outline-none focus:border-blue-500"
          />

          {error && <p className="text-xs text-rose-400 font-bold">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// MODAL DE PERFIL DE JUGADOR CON SUBPANEL INTERACTIVO Y DETALLE DE BOTE/PUNTOS
function UserProfileModal({ isOpen, onClose, user, matches, tournaments, allDinnerGuests, onPhotoUploaded, onUpdateUserData, isCurrentUser, isThursdayMember }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedStatCategory, setSelectedStatCategory] = useState(null);

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editGroup, setEditGroup] = useState('Chicos');
  const [editPlaytomic, setEditPlaytomic] = useState('');
  const [editIsLeftHanded, setEditIsLeftHanded] = useState(false);
  const [savingData, setSavingData] = useState(false);

  useEffect(() => {
    if (user) {
      setEditName(user.name || '');
      setEditPhone(user.phone || '');
      setEditGroup(user.group === 'torneo' ? 'Solo Torneo' : user.group === 'chicas' ? 'Chicas' : 'Chicos');
      setEditPlaytomic(user.playtomic || '');
      setEditIsLeftHanded(Boolean(user.isLeftHanded));
      setEditing(false);
      setSelectedStatCategory(null);
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const normUserName = normalizeName(user.name);

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
    await onUpdateUserData(user.id, { nombre: editName, telefono: editPhone, grupo: editGroup === 'Solo Torneo' ? 'torneo' : editGroup, playtomic: editPlaytomic, isLeftHanded: editIsLeftHanded });
    setSavingData(false);
    setEditing(false);
  };

  const statsCalculated = (() => {
    let playedList = [], wonList = [], lostList = [], dinnerYesList = [], dinnerNoList = [];
    let puntosDetalle = [], boteDetalle = [];
    const partnerStats = {}, rivalStats = {};

    matches.forEach(m => {
      if (m.status !== 'FINALIZADO') return;
      if (!isMatchOfficial(m)) return;

      const mySlot = (m.players || []).find(p => p.id === user.id || normalizeName(p.name) === normUserName);
      if (!mySlot) return;

      const partner = (m.players || []).find(p => p.team === mySlot.team && normalizeName(p.name) !== normUserName)?.name || 'Compañero';
      const rivals = (m.players || []).filter(p => p.team !== mySlot.team).map(p => p.name).join(' & ') || 'Rivales';

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

      // Cena (Barandas)
      if (mySlot.dinner === 'SI') {
        dinnerYesList.push(matchDetail);
        matchPts += 5; breakdownPts.push('Cena (+5)');
      } else if (mySlot.dinner === 'NO') {
        dinnerNoList.push(matchDetail);
        matchPts -= 1; breakdownPts.push('Rajada (-1)');
        matchBote += 1; breakdownBote.push('Rajada (+1€)');
      } else if (mySlot.dinner === 'PENDIENTE') {
        breakdownPts.push('Cena Pendiente (0)');
      }

      puntosDetalle.push({ date: m.date, title: `Partido vs ${rivals}`, pts: matchPts, desc: breakdownPts.join(' | ') });
      if (matchBote > 0) {
        boteDetalle.push({ date: m.date, title: `Partido vs ${rivals}`, bote: matchBote, desc: breakdownBote.join(' | ') });
      }

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
      });
    });

    // Añadir las cenas sin partido al listado visual y al historial de puntos
    (allDinnerGuests || []).forEach(g => {
      // COMPROBAMOS TAMBIÉN POR ID
      if (g.id === user.id || normalizeName(g.name) === normUserName) {
        const cleanDate = extractCleanDate(g.target || g.cleanTarget);
        
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
      played: playedList.length,
      won: wonList.length,
      lost: lostList.length,
      winRate: playedList.length > 0 ? ((wonList.length / playedList.length) * 100).toFixed(0) : 0,
      bestPartner, worstPartner, easiestRival, hardestRival
    };
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

      (t.rounds || []).forEach(r => {
        (r.matches || []).forEach(m => {
          if (m.status !== 'FINALIZADO') return;
          const inT1 = normalizeName(m.team1 || '').includes(normUserName);
          const inT2 = normalizeName(m.team2 || '').includes(normUserName);
          if (inT1 || inT2) {
            const won = (inT1 && m.winner === 1) || (inT2 && m.winner === 2);
            tList.push({
              tournamentName: t.name,
              court: m.court,
              team1: m.team1,
              team2: m.team2,
              score: m.score || 'Finalizado',
              won
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

  const getDetailTitle = () => {
    switch(selectedStatCategory) {
      case 'pj': return 'Partidos Jugados (Liga)';
      case 'victorias': return 'Victorias (Liga)';
      case 'derrotas': return 'Derrotas (Liga)';
      case 'cenas': return 'Cenas Asistidas 🍻';
      case 'rajadas': return 'Rajadas de Cena 🏃‍♂️';
      case 'torneos': return 'Partidos en Torneos ⚔️';
      case 'puntos': return 'Historial de Puntos Híbridos 🏅';
      case 'bote': return 'Desglose del Bote 💶';
      default: return '';
    }
  };

  const getDetailItems = () => {
    switch(selectedStatCategory) {
      case 'pj': return statsCalculated.playedList;
      case 'victorias': return statsCalculated.wonList;
      case 'derrotas': return statsCalculated.lostList;
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
                <h3 className="text-base font-black text-slate-900">{user.name}</h3>
                {user.isLeftHanded && (
                  <span className="text-[9px] bg-blue-100 text-blue-800 font-extrabold px-1.5 py-0.5 rounded-full border border-blue-300">
                    👈 Zurdo
                  </span>
                )}
              </div>
              <p className="text-xs text-blue-600 font-bold">{user.titulo}</p>
              {isCurrentUser && (
                <div className="flex gap-2 mt-0.5">
                  <button
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    disabled={uploading}
                    className="text-[10px] text-slate-500 underline font-semibold hover:text-blue-600"
                  >
                    {uploading ? 'Guardando foto...' : 'Cambiar foto'}
                  </button>
                  <button
                    onClick={() => setEditing(!editing)}
                    className="text-[10px] text-blue-600 underline font-semibold"
                  >
                    {editing ? 'Cancelar edición' : '✏️ Editar mis datos'}
                  </button>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl font-bold">&times;</button>
        </div>

        {isCurrentUser && editing && (
          <form onSubmit={handleSaveProfileData} className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Nombre completo</label>
              <input
                type="text"
                required
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl p-2 font-semibold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Teléfono móvil (WhatsApp)</label>
              <input
                type="tel"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                placeholder="Ej: 600123456"
                className="w-full bg-white border border-slate-300 rounded-xl p-2 font-semibold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Mano de Juego</label>
              <label className="flex items-center gap-2 bg-white border border-slate-300 rounded-xl p-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editIsLeftHanded}
                  onChange={e => setEditIsLeftHanded(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded accent-blue-600"
                />
                <span className="font-bold text-xs text-slate-800">Soy jugador Zurdo 👈</span>
              </label>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Grupo / Rol</label>
              <div className="flex gap-1.5">
                {['Chicos', 'Solo Torneo'].map(g => (
                  <button
                    type="button"
                    key={g}
                    onClick={() => setEditGroup(g)}
                    className={`flex-1 py-1 rounded-lg font-bold border text-[11px] ${
                      editGroup === g ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Usuario de Playtomic</label>
              <input
                type="text"
                value={editPlaytomic}
                onChange={e => setEditPlaytomic(e.target.value)}
                placeholder="Ej: marcos-padel"
                className="w-full bg-white border border-slate-300 rounded-xl p-2 font-semibold"
              />
            </div>
            <button
              type="submit"
              disabled={savingData}
              className="w-full py-2 bg-blue-600 text-white rounded-xl font-bold shadow-xs transition"
            >
              {savingData ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </form>
        )}

        {isThursdayMember && (
          <div className="space-y-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
              Estadísticas Liga Regular
            </span>
            <div className="grid grid-cols-4 gap-2 text-center">
              <button
                type="button"
                onClick={() => setSelectedStatCategory(selectedStatCategory === 'pj' ? null : 'pj')}
                className={`border rounded-xl p-2 transition ${selectedStatCategory === 'pj' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
              >
                <span className="text-base font-black block">{statsCalculated.played}</span>
                <span className="text-[9px] uppercase font-bold opacity-80">PJ</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedStatCategory(selectedStatCategory === 'victorias' ? null : 'victorias')}
                className={`border rounded-xl p-2 transition ${selectedStatCategory === 'victorias' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100'}`}
              >
                <span className="text-base font-black block">{statsCalculated.won}</span>
                <span className="text-[9px] uppercase font-bold opacity-80">Ganados</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedStatCategory(selectedStatCategory === 'derrotas' ? null : 'derrotas')}
                className={`border rounded-xl p-2 transition ${selectedStatCategory === 'derrotas' ? 'bg-rose-600 text-white border-rose-600' : 'bg-rose-50 border-rose-200 text-rose-900 hover:bg-rose-100'}`}
              >
                <span className="text-base font-black block">{statsCalculated.lost}</span>
                <span className="text-[9px] uppercase font-bold opacity-80">Perdidos</span>
              </button>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-2 text-blue-900">
                <span className="text-base font-black block">{statsCalculated.winRate}%</span>
                <span className="text-[9px] uppercase font-bold opacity-80">% Éxito</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center pt-1">
              <button
                type="button"
                onClick={() => setSelectedStatCategory(selectedStatCategory === 'cenas' ? null : 'cenas')}
                className={`border rounded-xl p-2.5 transition ${selectedStatCategory === 'cenas' ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'}`}
              >
                <span className="text-base font-black block">{statsCalculated.dinnerYesList.length}</span>
                <span className="text-[10px] font-bold uppercase">Cenas 🍻</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedStatCategory(selectedStatCategory === 'rajadas' ? null : 'rajadas')}
                className={`border rounded-xl p-2.5 transition ${selectedStatCategory === 'rajadas' ? 'bg-purple-600 text-white border-purple-600' : 'bg-purple-50 border-purple-200 text-purple-900 hover:bg-purple-100'}`}
              >
                <span className="text-base font-black block">{statsCalculated.dinnerNoList.length}</span>
                <span className="text-[10px] font-bold uppercase">Rajadas 🏃‍♂️</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center pt-2">
              <button onClick={() => setSelectedStatCategory(selectedStatCategory === 'puntos' ? null : 'puntos')} className={`border rounded-xl p-2.5 transition flex flex-col items-center justify-center ${selectedStatCategory === 'puntos' ? 'bg-blue-900 text-white border-blue-900' : 'bg-slate-900 text-white border-slate-700 hover:bg-slate-800'}`}>
                <span className="text-lg font-black block text-blue-400">{user.hibrido || 0} pts</span>
                <span className="text-[10px] font-bold uppercase">Historial Puntos 🏅</span>
              </button>
              <button onClick={() => setSelectedStatCategory(selectedStatCategory === 'bote' ? null : 'bote')} className={`border rounded-xl p-2.5 transition flex flex-col items-center justify-center ${selectedStatCategory === 'bote' ? 'bg-rose-900 text-white border-rose-900' : 'bg-slate-900 text-white border-slate-700 hover:bg-slate-800'}`}>
                <span className="text-lg font-black block text-rose-400">{user.deuda || 0} €</span>
                <span className="text-[10px] font-bold uppercase">Desglose Bote 💶</span>
              </button>
            </div>
          </div>
        )}

        {/* ANÁLISIS DE PAREJAS Y RIVALES */}
        {isThursdayMember && (
          <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
              🤝 Química de Parejas & Rivales
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-emerald-50/80 border border-emerald-200 p-2.5 rounded-2xl">
                <span className="text-[9px] font-black text-emerald-800 uppercase block mb-1">👑 Mejor Compañero</span>
                {statsCalculated.bestPartner ? (
                  <div>
                    <span className="font-extrabold text-slate-900 block truncate">{statsCalculated.bestPartner.name}</span>
                    <span className="text-[10px] font-bold text-emerald-700">
                      {statsCalculated.bestPartner.pct}% Victorias ({statsCalculated.bestPartner.won}/{statsCalculated.bestPartner.played})
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-400 italic">Sin registros</span>
                )}
              </div>

              <div className="bg-rose-50/80 border border-rose-200 p-2.5 rounded-2xl">
                <span className="text-[9px] font-black text-rose-800 uppercase block mb-1">💀 Bestia Negra</span>
                {statsCalculated.hardestRival ? (
                  <div>
                    <span className="font-extrabold text-slate-900 block truncate">{statsCalculated.hardestRival.name}</span>
                    <span className="text-[10px] font-bold text-rose-700">
                      {statsCalculated.hardestRival.pct}% Derrotas ({statsCalculated.hardestRival.lostAgainst}/{statsCalculated.hardestRival.played})
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-400 italic">Sin registros</span>
                )}
              </div>

              <div className="bg-blue-50/80 border border-blue-200 p-2.5 rounded-2xl">
                <span className="text-[9px] font-black text-blue-800 uppercase block mb-1">🎯 Rival Fetiche</span>
                {statsCalculated.easiestRival ? (
                  <div>
                    <span className="font-extrabold text-slate-900 block truncate">{statsCalculated.easiestRival.name}</span>
                    <span className="text-[10px] font-bold text-blue-700">
                      {statsCalculated.easiestRival.pct}% Ganados ({statsCalculated.easiestRival.wonAgainst}/{statsCalculated.easiestRival.played})
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-400 italic">Sin registros</span>
                )}
              </div>

              <div className="bg-amber-50/80 border border-amber-200 p-2.5 rounded-2xl">
                <span className="text-[9px] font-black text-amber-800 uppercase block mb-1">⚠️ Pareja Gafe</span>
                {statsCalculated.worstPartner ? (
                  <div>
                    <span className="font-extrabold text-slate-900 block truncate">{statsCalculated.worstPartner.name}</span>
                    <span className="text-[10px] font-bold text-amber-700">
                      {statsCalculated.worstPartner.pct}% Derrotas ({statsCalculated.worstPartner.lost}/{statsCalculated.worstPartner.played})
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-400 italic">Sin registros</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SUBPANEL DE DETALLE DE ESTADÍSTICAS */}
        {selectedStatCategory && (
          <div className="bg-slate-900 text-white rounded-2xl p-3 space-y-2 border border-slate-700 animate-fadeIn text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
              <span className="font-black text-blue-300 text-[11px] uppercase tracking-wide">
                📋 {getDetailTitle()} ({getDetailItems().length})
              </span>
              <button
                type="button"
                onClick={() => setSelectedStatCategory(null)}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {getDetailItems().length === 0 ? (
                <p className="text-slate-400 italic text-[10px] text-center py-2">Sin registros en este apartado</p>
              ) : (
                getDetailItems().map((item, idx) => (
                  <div key={idx} className="bg-slate-800 p-2 rounded-xl border border-slate-700/80 space-y-0.5">
                    {'pts' in item || 'bote' in item ? (
                      <>
                        <div className="flex justify-between text-[10px] font-bold text-slate-300">
                          <span>📅 {item.date}</span>
                          <span className={'pts' in item ? 'text-blue-400' : 'text-rose-400'}>
                            {'pts' in item ? `Suma: ${item.pts > 0 ? '+'+item.pts : item.pts} pts` : `Añade: +${item.bote} €`}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-100 font-semibold truncate">{item.title}</p>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">{item.desc}</p>
                      </>
                    ) : 'date' in item ? (
                      <>
                        <div className="flex justify-between text-[10px] font-bold text-slate-300">
                          <span>📅 {item.date}</span>
                          {item.partner !== 'Solo Cena' && (
                            <span className={item.won ? 'text-emerald-400' : 'text-rose-400'}>{item.won ? 'Victoria 🏆' : 'Derrota ❌'}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-100 font-semibold truncate">
                          {item.partner === 'Solo Cena' ? 'Sin partido jugado' : <>Pareja con <strong>{item.partner}</strong> vs <span>{item.rivals}</span></>}
                        </p>
                        <p className="text-[9px] text-slate-400">
                          {item.partner !== 'Solo Cena' && `Marcador: ${item.score} · `} Cena: {item.dinner === 'SI' ? '🍻 Sí' : item.dinner === 'NO' ? '🏃‍♂️ No' : '🟡 Pendiente'}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between text-[10px] font-bold text-slate-300">
                          <span>🏆 {item.tournamentName}</span>
                          <span className={item.won ? 'text-emerald-400' : 'text-rose-400'}>
                            {item.won ? 'Ganado' : 'Perdido'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-200">
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

        {/* RENDIMIENTO Y MODALIDAD EN TORNEOS */}
        <div className="space-y-2 pt-1 border-t border-slate-100">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-purple-900 uppercase tracking-wider block">
              ⚔️ Rendimiento en Torneos
            </span>
            <button
              type="button"
              onClick={() => setSelectedStatCategory(selectedStatCategory === 'torneos' ? null : 'torneos')}
              className="text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded-md transition"
            >
              {tournamentStats.tPlayed} partidos (Ver todo)
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-purple-50/80 border border-purple-200 p-2.5 rounded-2xl">
              <span className="text-[9px] font-black text-purple-800 uppercase block mb-1">🥇 Mejor Modalidad</span>
              {tournamentStats.bestMode ? (
                <div>
                  <span className="font-extrabold text-slate-900 block truncate">{tournamentStats.bestMode.name}</span>
                  <span className="text-[10px] font-bold text-purple-700">
                    {tournamentStats.bestMode.winRate}% Éxito ({tournamentStats.bestMode.won}/{tournamentStats.bestMode.played})
                  </span>
                </div>
              ) : (
                <span className="text-[10px] text-slate-400 italic">Sin datos suficientes</span>
              )}
            </div>

            <div className="bg-amber-50/80 border border-amber-200 p-2.5 rounded-2xl">
              <span className="text-[9px] font-black text-amber-800 uppercase block mb-1">📉 Peor Modalidad</span>
              {tournamentStats.worstMode ? (
                <div>
                  <span className="font-extrabold text-slate-900 block truncate">{tournamentStats.worstMode.name}</span>
                  <span className="text-[10px] font-bold text-amber-700">
                    {tournamentStats.worstMode.winRate}% Éxito ({tournamentStats.worstMode.won}/{tournamentStats.worstMode.played})
                  </span>
                </div>
              ) : (
                <span className="text-[10px] text-slate-400 italic">Sin datos suficientes</span>
              )}
            </div>
          </div>
        </div>

        <button onClick={onClose} className="w-full py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs">Cerrar</button>
      </div>
    </div>
  );
}
function TournamentCreatorModal({ isOpen, onClose, allPlayers, tournaments, onTournamentCreated, currentUserId, onSaveLevel }) {
  const [step, setStep] = useState(1);
  const [tName, setTName] = useState('Torneo CTC Fin de Semana');
  const [tournamentMode, setTournamentMode] = useState('equipos');

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
        dinner: 'SI',
        assignedTeam: 1
      };
    });
  });

  const [captain1Id, setCaptain1Id] = useState('');
  const [captain2Id, setCaptain2Id] = useState('');
  // NUEVOS ESTADOS GLOBALES PARA EL BORRADOR DE CAPITANES
  const [draftCap1Validated, setDraftCap1Validated] = useState(false);
  const [draftCap2Validated, setDraftCap2Validated] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestLevel, setGuestLevel] = useState(3.0);
  const [guestIsLeftHanded, setGuestIsLeftHanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customGeminiRules, setCustomGeminiRules] = useState('');

  const [generatedFixture, setGeneratedFixture] = useState([]);
  const [generatedTeams, setGeneratedTeams] = useState([]);

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

    rest.forEach(p => {
      const sum1 = team1.reduce((acc, item) => acc + item.level, 0);
      const sum2 = team2.reduce((acc, item) => acc + item.level, 0);
      if (sum1 <= sum2) team1.push(p);
      else team2.push(p);
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
        for (let r = 1; r <= totalRounds; r++) {
          const matchesList = [];
          const roundPool = [...sorted];
          for (let c = 1; c <= (Number(tCourts) || 1); c++) {
            if (roundPool.length >= 4) {
              const p1 = roundPool.shift(); const p2 = roundPool.shift(); const p3 = roundPool.shift(); const p4 = roundPool.shift();
              const paired = pairFourPlayersAvoidingDoubleLefties([p1, p2, p3, p4]);
              matchesList.push({
                id: `POZO_R${r}_P${c}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                court: c === 1 ? 'Pista 1 👑 (Pista Reina)' : `Pista ${c}`,
                team1: `${paired.pair1[0].name.split(' ')[0]} & ${paired.pair1[1].name.split(' ')[0]}`,
                team2: `${paired.pair2[0].name.split(' ')[0]} & ${paired.pair2[1].name.split(' ')[0]}`,
                courtNum: c,
                score: '', winner: null, status: 'PENDIENTE'
              });
            }
          }
          rounds.push({ round: r, timeLabel: `Ronda ${r}`, matches: matchesList });
        }
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
                score: '', winner: null, status: 'PENDIENTE'
              });
            }
          }
          rounds.push({ round: r, timeLabel: `Ronda ${r}`, matches: matchesList });
        }
      } else if (tournamentMode === 'eliminatorio') {
        const couples = [];
        for (let i = 0; i < sorted.length; i += 2) {
          if (sorted[i + 1]) {
            couples.push({ name: `${sorted[i].name.split(' ')[0]} & ${sorted[i + 1].name.split(' ')[0]}` });
          }
        }
        const groupMatches = [];
        for (let i = 0; i < couples.length - 1; i += 2) {
          groupMatches.push({
            id: `ELIM_G_${i}_${Date.now()}`,
            court: `Pista ${(Math.floor(i / 2) % (Number(tCourts) || 1)) + 1}`,
            team1: `${couples[i].name}`,
            team2: `${couples[i + 1].name}`,
            score: '', winner: null, status: 'PENDIENTE'
          });
        }
        rounds.push({ round: 1, timeLabel: 'Fase de Grupos', matches: groupMatches });
        rounds.push({ round: 2, timeLabel: 'Semifinales', matches: [
            { id: 'SEMIS_1', court: 'Pista 1', team1: '1º Grupo A', team2: '2º Grupo B', score: '', winner: null, status: 'PENDIENTE' },
            { id: 'SEMIS_2', court: 'Pista 2', team1: '1º Grupo B', team2: '2º Grupo A', score: '', winner: null, status: 'PENDIENTE' }
        ]});
        rounds.push({ round: 3, timeLabel: 'Finales', matches: [
            { id: 'FINAL_ORO', court: 'Pista 1 (Central)', team1: 'Ganador Semifinal 1', team2: 'Ganador Semifinal 2', score: '', winner: null, status: 'PENDIENTE' },
            { id: 'FINAL_CONSOL', court: 'Pista 2', team1: 'Perdedor Semifinal 1', team2: 'Perdedor Semifinal 2', score: '', winner: null, status: 'PENDIENTE' }
        ]});
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
      captain2Id: captain2Id || null
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
              <h3 className="text-base font-black text-slate-900">Modo Torneo CTC</h3>
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">
              Paso {step} de {tournamentMode === 'equipos' ? 5 : 4} · Aislado de liga regular
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl font-bold">&times;</button>
        </div>

        {/* PASO 1: CONFIGURACIÓN BÁSICA */}
        {step === 1 && (
          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Nombre del Torneo</label>
              <input type="text" value={tName} onChange={e => setTName(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-slate-900" />
            </div>

            <div className="grid grid-cols-2 gap-2 bg-purple-50/70 p-3 rounded-2xl border border-purple-200">
              <div>
                <label className="block text-[10px] font-black text-purple-950 uppercase tracking-wide mb-1">📅 Fecha Inicio *</label>
                <input type="date" required value={tDate} onChange={e => setTDate(e.target.value)} className="w-full bg-white border border-purple-300 rounded-xl p-2 font-bold text-slate-800 text-xs" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-purple-950 uppercase tracking-wide mb-1">⏰ Hora Inicio *</label>
                <input type="time" required value={tStartTime} onChange={e => setTStartTime(e.target.value)} className="w-full bg-white border border-purple-300 rounded-xl p-2 font-bold text-slate-800 text-xs" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Formato de Competición</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setTournamentMode('pozo')} className={`p-3 rounded-2xl border text-left transition ${tournamentMode === 'pozo' ? 'bg-blue-50 border-blue-600 text-blue-950 ring-2 ring-blue-500' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                  <span className="font-black block text-xs">🔄 Pozo Continuo</span>
                </button>
                <button type="button" onClick={() => setTournamentMode('americano')} className={`p-3 rounded-2xl border text-left transition ${tournamentMode === 'americano' ? 'bg-blue-50 border-blue-600 text-blue-950 ring-2 ring-blue-500' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                  <span className="font-black block text-xs">🇺🇸 Americano</span>
                </button>
                <button type="button" onClick={() => setTournamentMode('eliminatorio')} className={`p-3 rounded-2xl border text-left transition ${tournamentMode === 'eliminatorio' ? 'bg-blue-50 border-blue-600 text-blue-950 ring-2 ring-blue-500' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                  <span className="font-black block text-xs">🥇 Fases Finales</span>
                </button>
                <button type="button" onClick={() => setTournamentMode('equipos')} className={`p-3 rounded-2xl border text-left transition ${tournamentMode === 'equipos' ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-500' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                  <span className="font-black block text-xs">🛡️ Por Equipos (Ryder)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Pistas CTC</label>
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  <button type="button" onClick={() => handleCourtsChange((Number(tCourts) || 1) - 1)} className="w-7 h-7 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-black text-slate-700 flex items-center justify-center">-</button>
                  <input type="text" inputMode="numeric" value={tCourts} onChange={e => { const val = e.target.value.replace(/\D/g, ''); handleCourtsChange(val === '' ? '' : parseInt(val, 10)); }} className="w-12 bg-white border border-slate-300 rounded-lg p-1 font-black text-center text-sm" />
                  <button type="button" onClick={() => handleCourtsChange((Number(tCourts) || 1) + 1)} className="w-7 h-7 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-black text-slate-700 flex items-center justify-center">+</button>
                </div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Jugadores Esperados</label>
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  <button type="button" onClick={() => { setHasManuallyEditedTarget(true); setTargetPlayers(prev => Math.max(4, (Number(prev) || 4) - 1)); }} className="w-7 h-7 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-black text-slate-700 flex items-center justify-center">-</button>
                  <input type="text" inputMode="numeric" value={targetPlayers} onChange={e => { setHasManuallyEditedTarget(true); const val = e.target.value.replace(/\D/g, ''); setTargetPlayers(val === '' ? '' : Math.max(4, parseInt(val, 10))); }} className="w-12 bg-white border border-slate-300 rounded-lg p-1 font-black text-center text-sm" />
                  <button type="button" onClick={() => { setHasManuallyEditedTarget(true); setTargetPlayers(prev => Math.min(64, (Number(prev) || 4) + 1)); }} className="w-7 h-7 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-black text-slate-700 flex items-center justify-center">+</button>
                </div>
              </div>
            </div>

            <button onClick={() => setStep(2)} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition mt-2">
              Siguiente: Convocatoria →
            </button>
          </div>
        )}

        {/* PASO 2: CONVOCATORIA DE JUGADORES Y VALORACIÓN (SIN EQUIPOS) */}
        {step === 2 && (
          <div className="space-y-3.5 text-xs">
            <div className={`p-3 rounded-2xl border text-center transition flex justify-between items-center ${selectedCount < neededForCourts ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-emerald-50 border-emerald-300 text-emerald-950'}`}>
              <div className="text-left">
                <span className="font-black text-sm block">{selectedCount} / {targetPlayers} convocados</span>
                <span className="text-[10px] font-semibold opacity-85">
                  {selectedCount < neededForCourts ? `⚠️ Faltan ${neededForCourts - selectedCount} para completar las ${tCourts} pistas` : '✓ Cupo suficiente'}
                </span>
              </div>
              <span className="text-2xl">{selectedCount >= neededForCourts ? '🎾' : '⏳'}</span>
            </div>

            <form onSubmit={handleAddGuest} className="bg-blue-50/80 p-3 rounded-2xl border border-blue-200 space-y-2">
              <label className="font-extrabold text-blue-950 block text-[11px]">➕ Añadir Participante Invitado</label>
              <div className="flex items-center gap-2">
                <input type="text" placeholder="Nombre" value={guestName} onChange={e => setGuestName(e.target.value)} className="flex-1 bg-white border border-blue-300 rounded-xl p-2 text-xs font-semibold" />
                <label className="flex items-center gap-1 cursor-pointer bg-white border border-blue-300 px-2 py-1 rounded-xl">
                  <input type="checkbox" checked={guestIsLeftHanded} onChange={e => setGuestIsLeftHanded(e.target.checked)} className="w-3.5 h-3.5 text-blue-600 accent-blue-600" />
                  <span className="text-[10px] font-bold text-blue-900">👈 Zurdo</span>
                </label>
                <button type="submit" className="bg-blue-600 text-white font-bold px-3 py-2 rounded-xl text-xs">Añadir</button>
              </div>
            </form>

            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>
              <input 
                type="text" 
                placeholder="Buscar jugador por nombre..." 
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl py-2 pl-8 pr-3 font-semibold text-xs" 
              />
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {filteredParticipants.map(p => (
                <div key={p.id} className={`p-2 rounded-xl border flex items-center justify-between transition ${p.selected ? 'bg-white border-blue-400 ring-1 ring-blue-200' : 'bg-slate-50 border-slate-200 opacity-70'}`}>
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <input type="checkbox" checked={p.selected} onChange={() => handleTogglePlayer(p.id)} className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer shrink-0" />
                    <UserAvatar name={p.name} photo={p.photo} size="xs" />
                    <span className="font-bold text-slate-800 text-[11px] truncate block">{p.name}</span>
                  </div>
                  {p.selected && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => handleToggleLeftHanded(p.id)} className={`text-[9px] px-1.5 py-0.5 rounded-md font-extrabold border transition ${p.isLeftHanded ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                        👈 {p.isLeftHanded ? 'Zurdo' : 'Diestro'}
                      </button>
                      <StarRating value={p.level} onChange={(lvl) => handleLevelChange(p.id, lvl)} />
                    </div>
                  )}
                </div>
              ))}
              {filteredParticipants.length === 0 && (
                <p className="text-center text-slate-400 py-4 text-[10px]">No se encontraron jugadores.</p>
              )}
            </div>

            {/* NUEVO: Selección rápida de capitanes y guardado de borrador si es Ryder */}
            {tournamentMode === 'equipos' && selectedCount >= 4 && (
              <div className="bg-slate-900 text-white p-3 rounded-2xl border border-slate-700 mt-4 space-y-3">
                <span className="text-[10px] font-black text-blue-400 uppercase block">Delegar en Capitanes</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 mb-1">Capitán Azul 🔵</label>
                    <select value={captain1Id} onChange={e => setCaptain1Id(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-lg p-1.5 text-xs">
                      <option value="">Seleccionar...</option>
                      {selectedPlayers.map(p => <option key={p.id} value={p.id} disabled={p.id === captain2Id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 mb-1">Capitán Rojo 🔴</label>
                    <select value={captain2Id} onChange={e => setCaptain2Id(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-lg p-1.5 text-xs">
                      <option value="">Seleccionar...</option>
                      {selectedPlayers.map(p => <option key={p.id} value={p.id} disabled={p.id === captain1Id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep(1)} className="flex-1 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl shadow-sm">← Volver</button>
              
              {tournamentMode === 'equipos' ? (
                <button 
                  onClick={() => handleLaunchTournament('BOCETO_EQUIPOS')} 
                  disabled={selectedCount < 4 || !captain1Id || !captain2Id} 
                  className="flex-1 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-xs disabled:opacity-50"
                >
                  Guardar y Avisar Capitanes
                </button>
              ) : (
                <button onClick={() => setStep(4)} disabled={selectedCount < 4} className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-xs disabled:opacity-50">
                  Siguiente →
                </button>
              )}
            </div>
          </div>
        )}

        {/* PASO 3: CONFIGURACIÓN DE EQUIPOS (SOLO RYDER) */}
        {step === 3 && tournamentMode === 'equipos' && (
          <div className="space-y-3.5 text-xs">
            <div className="bg-slate-900 text-white rounded-2xl p-3.5 space-y-3 border border-slate-700 shadow-sm">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="font-black text-xs text-blue-300 uppercase tracking-wide">🛡️ Configuración Ryder</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${teamStats.isBalanced ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                  {teamStats.isBalanced ? '✓ Equilibrado' : '⚠️ Desnivelado'} (Δ {teamStats.delta})
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800/80 p-2 rounded-xl border border-blue-500/40">
                  <label className="block text-[10px] font-black text-blue-400 uppercase tracking-wider mb-1">Capitán Azul 🔵</label>
                  <select value={captain1Id} onChange={e => setCaptain1Id(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 font-bold text-white text-xs truncate">
                    {selectedPlayers.map(p => <option key={p.id} value={p.id} disabled={p.id === captain2Id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="bg-slate-800/80 p-2 rounded-xl border border-rose-500/40">
                  <label className="block text-[10px] font-black text-rose-400 uppercase tracking-wider mb-1">Capitán Rojo 🔴</label>
                  <select value={captain2Id} onChange={e => setCaptain2Id(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 font-bold text-white text-xs truncate">
                    {selectedPlayers.map(p => <option key={p.id} value={p.id} disabled={p.id === captain1Id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              <button type="button" onClick={handleAutoBalanceTeams} className="w-full py-2 bg-gradient-to-r from-blue-600 to-rose-600 hover:from-blue-500 text-white font-black rounded-xl text-xs shadow-md transition">
                ⚡ Auto-Equilibrar Escuadras
              </button>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {selectedPlayers.map(p => (
                <div key={p.id} className="p-2 rounded-xl border bg-white flex items-center justify-between">
                  <div className="flex items-center gap-2 truncate">
                    <UserAvatar name={p.name} photo={p.photo} size="xs" />
                    <span className="font-bold text-slate-800 text-[11px] truncate">{p.name}</span>
                  </div>
                  <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
                    <button type="button" disabled={p.id === captain1Id || p.id === captain2Id} onClick={() => handleTeamToggle(p.id, 1)} className={`px-2 py-0.5 rounded-md text-[10px] font-black transition ${p.assignedTeam === 1 ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400'}`}>
                      🔵 Azul
                    </button>
                    <button type="button" disabled={p.id === captain1Id || p.id === captain2Id} onClick={() => handleTeamToggle(p.id, 2)} className={`px-2 py-0.5 rounded-md text-[10px] font-black transition ${p.assignedTeam === 2 ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-400'}`}>
                      🔴 Rojo
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl flex items-center gap-2 cursor-pointer" onClick={() => setCaptainsValidated(!captainsValidated)}>
               <input type="checkbox" checked={captainsValidated} onChange={() => setCaptainsValidated(!captainsValidated)} className="w-4 h-4 text-emerald-600 accent-emerald-600" />
               <span className="font-bold text-emerald-900 text-[11px]">Los capitanes validan que los equipos están correctos y equilibrados.</span>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep(2)} className="flex-1 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl">← Volver</button>
              <button onClick={() => setStep(4)} disabled={!captainsValidated} className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-xs disabled:opacity-50">Configurar Motor →</button>
            </div>
          </div>
        )}

        {/* PASO 4: REGLAS DEL ALGORITMO (GEMINI) */}
        {step === 4 && (
          <div className="space-y-3.5 text-xs">
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3.5 space-y-2">
              <h4 className="font-black text-purple-950 text-xs flex items-center gap-1"><span>✨</span> Motor de Cruces Inteligente</h4>
              <p className="text-[11px] text-purple-900">Se procesarán las reglas del formato <strong>{tournamentMode.toUpperCase()}</strong> asegurando que no haya choques de zurdos en la misma pareja y equilibrando el rating.</p>
            </div>
            
            <textarea rows={6} value={customGeminiRules} onChange={e => setCustomGeminiRules(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-[10px] font-mono leading-tight text-slate-800" />

            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep(tournamentMode === 'equipos' ? 3 : 2)} className="flex-1 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl">← Volver</button>
              <button onClick={handleGenerateWithGemini} disabled={isGenerating} className="flex-1 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-xl shadow-xs flex items-center justify-center gap-1.5">
                {isGenerating ? '🔄 Calculando...' : '✨ Generar Cuadro'}
              </button>
            </div>
          </div>
        )}

        {/* PASO 5: VALIDACIÓN FINAL Y EDICIÓN DEL CUADRANTE */}
        {step === 5 && (
          <div className="space-y-3.5 text-xs">
            <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-center justify-between">
              <div>
                <span className="font-black text-emerald-900 text-xs block">✅ Cuadrante Listo ({tournamentMode.toUpperCase()})</span>
                <span className="text-[10px] text-emerald-700">Puedes editar los cruces manualmente antes de iniciar.</span>
              </div>
              <button onClick={() => setStep(4)} className="text-[10px] bg-white border border-emerald-300 text-emerald-800 font-bold px-2 py-0.5 rounded-md">
                Re-calcular
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {generatedFixture.map((r, rIdx) => (
                <div key={r.round} className="bg-slate-50 p-2 rounded-xl border border-slate-200 space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                    <span className="uppercase text-slate-900">{r.phase || `Ronda ${r.round}`}</span>
                    <span>⏱️ {r.timeLabel}</span>
                  </div>
                  {r.matches.map((m, mIdx) => (
                    <div key={m.id || mIdx} className="bg-white p-1.5 rounded-lg border border-slate-200 text-[10px]">
                      {editingMatchInfo?.id === m.id ? (
                        <div className="space-y-1.5 p-1">
                          <input type="text" value={editingMatchInfo.court} onChange={e => setEditingMatchInfo({...editingMatchInfo, court: e.target.value})} className="w-full border rounded p-1 font-bold bg-slate-50" placeholder="Pista"/>
                          <input type="text" value={editingMatchInfo.team1} onChange={e => setEditingMatchInfo({...editingMatchInfo, team1: e.target.value})} className="w-full border rounded p-1 font-semibold" placeholder="Pareja 1"/>
                          <input type="text" value={editingMatchInfo.team2} onChange={e => setEditingMatchInfo({...editingMatchInfo, team2: e.target.value})} className="w-full border rounded p-1 font-semibold" placeholder="Pareja 2"/>
                          <div className="flex gap-1 pt-1">
                             <button onClick={() => setEditingMatchInfo(null)} className="flex-1 bg-slate-100 text-slate-600 py-1 rounded font-bold">Cancelar</button>
                             <button onClick={handleSaveInlineMatchEdit} className="flex-1 bg-emerald-600 text-white py-1 rounded font-bold">Guardar Cambios</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center group">
                          <span className="bg-purple-50 text-purple-700 font-bold px-1.5 py-0.5 rounded truncate max-w-[60px]">{m.court}</span>
                          <div className="flex items-center gap-1 overflow-hidden mx-1 flex-1 justify-center">
                            <span className="truncate font-semibold">{m.team1}</span>
                            <span className="text-slate-400 font-bold text-[9px]">vs</span>
                            <span className="truncate font-semibold">{m.team2}</span>
                          </div>
                          <button onClick={() => setEditingMatchInfo({...m, rIdx, mIdx})} className="text-[10px] text-slate-400 hover:text-blue-600 px-1 font-bold opacity-50 group-hover:opacity-100" title="Editar este partido">
                            ✏️
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <button onClick={handleLaunchTournament} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs mt-2 text-sm">
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
            <h3 className="text-sm font-black uppercase text-purple-700">{title}</h3>
            <p className="text-[10px] text-slate-400 font-bold">{subtitle || 'Marcador Oficial'}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="font-black text-slate-800 block mb-1.5 text-[11px] uppercase tracking-wide">
              1. Pareja Ganadora (Obligatorio seleccionar una) *
            </label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setWinnerTeam(1)}
                className={`w-full p-2.5 rounded-2xl border text-left transition flex flex-col gap-1 ${
                  winnerTeam === 1
                    ? 'bg-blue-50/90 border-blue-600 ring-2 ring-blue-500 text-blue-950 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                    winnerTeam === 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    Pareja 1
                  </span>
                  {winnerTeam === 1 && <span className="text-[10px] font-black text-blue-600">🏆 GANADORES SELECCIONADOS</span>}
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
                    ? 'bg-amber-50/90 border-amber-600 ring-2 ring-amber-500 text-amber-950 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                    winnerTeam === 2 ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    Pareja 2
                  </span>
                  {winnerTeam === 2 && <span className="text-[10px] font-black text-amber-600">🏆 GANADORES SELECCIONADOS</span>}
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

          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2.5">
            <div className="flex justify-between items-center">
              <div>
                <label className="font-extrabold text-slate-800 text-[10px] uppercase block">
                  2. Tanteo por Sets (Opcional)
                </label>
                <span className="text-[9px] text-slate-400">Juegos de cada manga (2 a 5 sets)</span>
              </div>
              <div className="flex gap-1">
                {sets.length < 5 && (
                  <button
                    type="button"
                    onClick={handleAddSet}
                    className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[10px] font-bold"
                  >
                    + Set {sets.length + 1}
                  </button>
                )}
                {sets.length > 2 && (
                  <button
                    type="button"
                    onClick={handleRemoveSet}
                    className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md text-[10px] font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              {sets.map((setVal, idx) => (
                <div key={idx} className="bg-white p-2 rounded-xl border border-slate-200 flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase text-slate-500 w-14">
                    {idx === 2 ? 'Set 3 (Tie)' : `Set ${idx + 1}`}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleScoreChange(idx, 't1', -1)}
                      className="w-5 h-5 rounded bg-slate-100 font-bold text-xs flex items-center justify-center hover:bg-slate-200"
                    >
                      -
                    </button>
                    <span className="font-black text-slate-900 w-4 text-center text-sm">{setVal.t1}</span>
                    <button
                      type="button"
                      onClick={() => handleScoreChange(idx, 't1', 1)}
                      className="w-5 h-5 rounded bg-slate-100 font-bold text-xs flex items-center justify-center hover:bg-slate-200"
                    >
                      +
                    </button>
                  </div>

                  <span className="font-black text-slate-300 text-xs">/</span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleScoreChange(idx, 't2', -1)}
                      className="w-5 h-5 rounded bg-slate-100 font-bold text-xs flex items-center justify-center hover:bg-slate-200"
                    >
                      -
                    </button>
                    <span className="font-black text-slate-900 w-4 text-center text-sm">{setVal.t2}</span>
                    <button
                      type="button"
                      onClick={() => handleScoreChange(idx, 't2', 1)}
                      className="w-5 h-5 rounded bg-slate-100 font-bold text-xs flex items-center justify-center hover:bg-slate-200"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl">
              Cancelar
            </button>
            <button type="submit" className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-xs">
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
          <h3 className="text-sm font-black text-slate-900">🔗 Vincular Jugador Huérfano</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Enlaza el texto <strong>"{slotName}"</strong> con su perfil oficial para que sus victorias se computen.
          </p>
        </div>

        <form onSubmit={handleLink} className="space-y-3 text-xs">
          <div>
            <label className="block text-[10px] font-bold text-slate-600 mb-1">
              Selecciona el perfil registrado oficial:
            </label>
            <select
              required
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-slate-800 text-xs"
            >
              <option value="">-- Elige un jugador del club --</option>
              {allRegisteredPlayers.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.group})</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl">
              Cancelar
            </button>
            <button type="submit" className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs">
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
          <h3 className="text-base font-black text-slate-900">🔄 Intercambio de Jugador</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold">&times;</button>
        </div>
        
        <div className="space-y-3 text-xs">
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-center">
            <span className="text-[10px] font-black uppercase text-slate-500 block mb-1">Vas a mover a</span>
            <div className="flex items-center justify-center gap-2">
              <UserAvatar name={sourcePlayer.name} photo={sourcePlayer.photo} size="sm" />
              <span className="font-bold text-sm">{sourcePlayer.name}</span>
            </div>
          </div>

          <div>
            <span className="font-black text-slate-800 text-[11px] uppercase tracking-wide block mb-2">
              Selecciona la acción:
            </span>
            <div className="space-y-2">
              {targetPlayers.map(targetP => (
                <button
                  key={targetP.id}
                  onClick={() => onConfirmSwap(match.id, sourcePlayer.id, targetP.id)}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl text-blue-500">⇄</span>
                    <div className="text-left">
                      <span className="block text-[10px] font-black text-blue-600 uppercase">Intercambiar por</span>
                      <span className="block font-bold text-sm text-slate-900">{targetP.name}</span>
                    </div>
                  </div>
                  <UserAvatar name={targetP.name} photo={targetP.photo} size="xs" />
                </button>
              ))}

              {/* Si hay hueco en la otra pareja, damos la opción de moverlo directamente sin intercambiar con nadie */}
              {targetPlayers.length < 2 && (
                <button
                  onClick={() => onConfirmSwap(match.id, sourcePlayer.id, null)}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-emerald-400 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition font-bold"
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
        <label className="block text-xs font-bold text-slate-300 mb-1">Nombre y Apellido *</label>
        <input type="text" required value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="Ej: Marcos Iglesias" className="w-full bg-slate-700 border border-slate-600 rounded-xl p-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-semibold" />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1">Teléfono Móvil (WhatsApp) *</label>
        <input type="tel" required value={newUserPhone} onChange={(e) => setNewUserPhone(e.target.value)} placeholder="Ej: 600123456" className="w-full bg-slate-700 border border-slate-600 rounded-xl p-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-semibold" />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1">¿A qué grupo perteneces?</label>
        <div className="flex gap-2">
          {[{ key: 'Chicos', label: 'Chicos (Jueves)' }, { key: 'Solo Torneo', label: 'Solo Torneo' }].map(g => (
            <button type="button" key={g.key} onClick={() => setNewUserGroup(g.key)} className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${newUserGroup === g.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-700 text-slate-300 border-slate-600'}`}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1">Crea tu PIN de 4 cifras (seguridad) *</label>
        <input type="password" maxLength={4} required value={newUserPin} onChange={(e) => setNewUserPin(e.target.value.replace(/\D/g, ''))} placeholder="Ej: 1234" className="w-full bg-slate-700 border border-slate-600 rounded-xl p-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-bold tracking-widest text-center" />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1">Usuario de Playtomic (opcional)</label>
        <input type="text" value={newUserPlaytomic} onChange={(e) => setNewUserPlaytomic(e.target.value)} placeholder="Ej: marcos-padel" className="w-full bg-slate-700 border border-slate-600 rounded-xl p-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500" />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs font-bold transition">Volver</button>
        <button type="submit" disabled={syncing} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg transition">{syncing ? 'Guardando...' : 'Crear y Entrar'}</button>
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
      setPlaytomicText(''); setManualDate(''); setManualP1(''); setManualP2(''); setManualP3(''); setManualP4('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!playtomicText.trim()) return;
    onAddMatch({ playtomicText, isOnlyPlaytomicLink, manualDate, manualLocation, manualP1, manualP2, manualP3, manualP4 });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-3">
        <h3 className="text-base font-black text-slate-900">Añadir Partido Playtomic</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea rows={4} required value={playtomicText} onChange={e => setPlaytomicText(e.target.value)} placeholder="Pega el texto copiado de Playtomic o el enlace..." className="w-full border rounded-xl p-2.5 text-xs font-semibold" />
          {isOnlyPlaytomicLink && (
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-2">
              <span className="text-[10px] font-black uppercase text-blue-600 block">Datos adicionales requeridos</span>
              <input type="text" value={manualDate} onChange={e => setManualDate(e.target.value)} placeholder="Fecha y Hora (Ej: Jueves 21:00)" className="w-full border rounded-lg p-1.5 text-xs font-semibold" />
              <div className="grid grid-cols-2 gap-1.5">
                <input type="text" value={manualP1} onChange={e => setManualP1(e.target.value)} placeholder="Jugador 1" className="border rounded-lg p-1.5 text-xs" />
                <input type="text" value={manualP2} onChange={e => setManualP2(e.target.value)} placeholder="Jugador 2" className="border rounded-lg p-1.5 text-xs" />
                <input type="text" value={manualP3} onChange={e => setManualP3(e.target.value)} placeholder="Jugador 3" className="border rounded-lg p-1.5 text-xs" />
                <input type="text" value={manualP4} onChange={e => setManualP4(e.target.value)} placeholder="Jugador 4" className="border rounded-lg p-1.5 text-xs" />
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 bg-slate-100 font-bold text-xs rounded-xl">Cancelar</button>
            <button type="submit" disabled={syncing} className="flex-1 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-xs">Crear Partido</button>
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
  const [activeTab, setActiveTab] = useState('partidos');
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

  const [showTournamentWizard, setShowTournamentWizard] = useState(false);
  const [activeTournaments, setActiveTournaments] = useState(() => {
    const saved = localStorage.getItem('padel_ctc_tournaments');
    return saved ? JSON.parse(saved) : [];
  });

  const [reportingTournamentMatch, setReportingTournamentMatch] = useState(null);
  const [activeTournamentId, setActiveTournamentId] = useState(null);
  const [tournamentSubTab, setTournamentSubTab] = useState({});

  const [inviteTournamentId, setInviteTournamentId] = useState(null);
  const [invitePlayerId, setInvitePlayerId] = useState(null);

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

  const isThursdayMember = useMemo(() => {
    if (isTournamentGuestSession) return false;
    if (!currentUser) return false;
    const g = (currentUser.group || '').toLowerCase();
    return g === 'chicos';
  }, [currentUser, isTournamentGuestSession]);

  useEffect(() => {
    if (currentUser && !isThursdayMember) {
      setActiveTab('torneos');
    }
  }, [currentUser, isThursdayMember]);

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
          setActiveTournaments(json.torneos);
          localStorage.setItem('padel_ctc_tournaments', JSON.stringify(json.torneos));
        }
        if (json.invitadosCena) {
          setAllDinnerGuests(json.invitadosCena);
          localStorage.setItem('padel_cached_dinners', JSON.stringify(json.invitadosCena));
        }
      }
    } catch (e) {
      console.warn('Sync error:', e);
    } finally {
      if (!silent) setSyncing(false);
    }
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
    const assignedGroup = (userData.grupo === 'Solo Torneo' || userData.grupo === 'torneo') ? 'torneo' : 'chicos';

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
          titulo: assignedGroup === 'torneo' ? 'Jugador de Torneo ⚔️' : 'Fichaje Estrella ⭐',
          deuda: 0,
          pin: userData.pin
        };

        handlePinSuccess(createdUser);
        setShowRegisterForm(false);
        fetchData(true);
        alert('¡Registro completado con éxito!');
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
      const d = data.manualDate.trim() || 'Jueves 21:00';
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
    const updated = [newT, ...activeTournaments];
    setActiveTournaments(updated);
    localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updated));
    setActiveTab('torneos');

    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'GUARDAR_TORNEO', torneo: newT })
      });
      fetchData(true);
    } catch (e) {
      console.error('Error al persistir torneo en la nube:', e);
    }
  };

  const handleDeleteTournament = async (tId) => {
    const updated = activeTournaments.filter(t => t.id !== tId);
    setActiveTournaments(updated);
    localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updated));

    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ELIMINAR_TORNEO', idTorneo: tId })
      });
      fetchData(true);
    } catch (e) {
      console.error('Error al borrar torneo en la nube:', e);
    }
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

      const updatedRounds = t.rounds.map(r => ({
        ...r,
        matches: r.matches.map(m => {
          if (m.id === matchId) {
            winningTeamName = winningTeamNum === 1 ? m.team1 : m.team2;
            losingTeamName = winningTeamNum === 1 ? m.team2 : m.team1;
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

      if (t.mode === 'eliminatorio' && winningTeamName) {
        if (matchId === 'SEMIS_1') {
          updatedRounds.forEach(r => {
            r.matches.forEach(m => {
              if (m.id === 'FINAL_ORO') m.team1 = winningTeamName;
              if (m.id === 'FINAL_CONSOL') m.team1 = losingTeamName;
            });
          });
        } else if (matchId === 'SEMIS_2') {
          updatedRounds.forEach(r => {
            r.matches.forEach(m => {
              if (m.id === 'FINAL_ORO') m.team2 = winningTeamName;
              if (m.id === 'FINAL_CONSOL') m.team2 = losingTeamName;
            });
          });
        }
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

      tournamentToSync = {
        ...t,
        rounds: updatedRounds,
        teams: updatedTeams
      };

      return tournamentToSync;
    });

    setActiveTournaments(updatedTournaments);
    localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updatedTournaments));
    setReportingTournamentMatch(null);

    if (tournamentToSync) {
      try {
        await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'GUARDAR_TORNEO', torneo: tournamentToSync })
        });
        fetchData(true);
      } catch (e) {
        console.error('Error al guardar marcador en la nube:', e);
      }
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

    if (tournamentToSync) {
      try {
        await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'GUARDAR_TORNEO', torneo: tournamentToSync })
        });
        fetchData(true);
      } catch (e) {
        console.error('Error al actualizar cena en la nube:', e);
      }
    }
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

    if (tournamentToSync) {
      try {
        fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'GUARDAR_TORNEO', torneo: tournamentToSync })
        });
      } catch (e) {
        console.error(e);
      }
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
      try {
        fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'GUARDAR_TORNEO', torneo: tournamentToSync })
        });
      } catch (e) {
        console.error(e);
      }
    }
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
            titulo: 'Jugador de Torneo ⚔️',
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
        titulo: 'Invitado al Torneo ⚔️',
        level: invitedPlayerSlot.level || 3.0
      };

      return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-4 text-left">
          <div className="max-w-xs w-full bg-slate-800 rounded-3xl p-6 border border-purple-500/50 shadow-2xl text-center space-y-4">
            <UserAvatar name={targetUser.name} photo={targetUser.photo} size="lg" className="mx-auto" />
            <div>
              <span className="text-[10px] uppercase font-black bg-purple-900/60 text-purple-300 px-2.5 py-0.5 rounded-full">
                Acceso Personal
              </span>
              <h2 className="text-lg font-black mt-2 text-white">{targetUser.name}</h2>
              <p className="text-xs text-purple-200 mt-0.5">
                Convocado al <strong>{invitedTournament.name}</strong>
              </p>
            </div>

            <p className="text-xs text-slate-400">
              Pulsa continuar para verificar o crear tu PIN de 4 cifras y acceder a tus partidos:
            </p>

            <button
              onClick={() => handleUserClick(targetUser)}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-xl text-xs shadow-md transition"
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
        <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-4 text-left">
          <div className="max-w-md w-full bg-slate-800 rounded-3xl p-6 border border-purple-500/40 shadow-2xl space-y-4">
            <div className="text-center">
              <span className="text-4xl block mb-1">⚔️</span>
              <span className="text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 px-2.5 py-0.5 rounded-full">
                Invitación a Torneo Privado
              </span>
              <h2 className="text-xl font-black mt-2 text-white">{invitedTournament.name}</h2>
              <p className="text-xs text-slate-400 mt-1">
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
                  titulo: 'Invitado al Torneo ⚔️',
                  level: p.level || 3.0
                };

                return (
                  <button
                    key={p.id}
                    onClick={() => handleUserClick(targetObj)}
                    className="w-full text-left bg-slate-700/60 hover:bg-purple-600 p-3 rounded-2xl flex items-center justify-between transition group border border-slate-600/40"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar name={p.name} photo={p.photo} size="sm" />
                      <span className="font-semibold text-sm group-hover:text-white">{p.name}</span>
                    </div>
                    <span className="text-xs text-purple-300 group-hover:text-white font-bold">Entrar →</span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-700 text-center">
              <button
                onClick={() => setInviteTournamentId(null)}
                className="text-xs text-slate-400 hover:text-white font-semibold underline"
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
      <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-slate-800 rounded-3xl p-6 border border-slate-700 shadow-2xl">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">
            🎾
          </div>
          <h1 className="text-2xl font-black text-center mb-1">Pádel CTC</h1>
          <p className="text-slate-400 text-xs text-center mb-5">
            {showRegisterForm ? 'Regístrate para entrar al club' : 'Elige tu perfil de jugador (protegido por PIN)'}
          </p>

          {!showRegisterForm ? (
            <>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1 mb-4">
                {allSelectableUsers.length === 0 ? (
                  <p className="text-center text-slate-400 text-xs py-4">Cargando jugadores desde Google Sheets...</p>
                ) : (
                  allSelectableUsers.map(u => (
                    <button
                      key={u.id}
                      onClick={() => handleUserClick(u)}
                      className="w-full text-left bg-slate-700/60 hover:bg-blue-600 p-3 rounded-2xl flex items-center justify-between transition group border border-slate-600/40"
                    >
                      <div className="flex items-center gap-3">
                        <UserAvatar name={u.name} photo={u.photo} size="sm" />
                        <div>
                          <span className="font-semibold text-sm group-hover:text-white block">{u.name}</span>
                          {u.group === 'torneo' && (
                            <span className="text-[9px] bg-purple-900/60 text-purple-300 px-1.5 py-0.2 rounded font-bold">
                              Torneo
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 group-hover:text-blue-100">{u.titulo}</span>
                    </button>
                  ))
                )}
              </div>

              <button
                onClick={() => setShowRegisterForm(true)}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-blue-300 hover:text-white rounded-2xl text-xs font-bold transition border border-dashed border-slate-500 flex items-center justify-center gap-1.5"
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

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-16">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div
            onClick={() => setInspectedUser(currentUser)}
            className="flex items-center gap-2.5 cursor-pointer group"
            title="Ver mis estadísticas y editar perfil"
          >
            <UserAvatar name={currentUser.name} photo={currentUser.photo} size="md" className="group-hover:ring-2 group-hover:ring-blue-500 transition" />
            <div>
              <h1 className="text-base font-black leading-tight flex items-center gap-1 group-hover:text-blue-600 transition">
                {currentUser.name} <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md font-bold">Ver perfil</span>
              </h1>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                {isThursdayMember ? `${currentUser.group} · ${currentUser.titulo}` : 'Invitado a Torneos CTC'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isThursdayMember && (
              <button
                onClick={() => setShowRulesModal(true)}
                className="px-2.5 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
              >
                📖 Reglas
              </button>
            )}
            <button
              onClick={handleLogout}
              className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 rounded-lg transition"
            >
              Salir
            </button>
            <button
              onClick={() => fetchData(false)}
              disabled={syncing}
              className={`p-1.5 text-slate-500 hover:text-blue-600 transition ${syncing ? 'animate-spin' : ''}`}
              title="Sincronizar ahora"
            >
              🔄
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-4">
        {selectedMatchId && currentMatch && isThursdayMember ? (
          /* DETALLE DEL PARTIDO REGULAR */
          <div className="space-y-4">
            <button
              onClick={() => setSelectedMatchId(null)}
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
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
                    className="bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 text-white rounded-3xl p-4 shadow-lg border-2 border-amber-300 cursor-pointer animate-pulse hover:animate-none transition transform active:scale-98 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 font-black text-2xl flex items-center justify-center shrink-0 shadow-md">
                        🏆
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-300 text-slate-950 px-2 py-0.5 rounded-full">
                          Partido Listo para Anotar
                        </span>
                        <h3 className="text-base font-black mt-0.5">¡Registra el Resultado Oficial!</h3>
                        <p className="text-[11px] text-purple-200">Toca aquí para indicar el marcador y la pareja ganadora</p>
                      </div>
                    </div>
                    <span className="text-xl font-black bg-white text-purple-900 px-3 py-1.5 rounded-2xl shadow-md">
                      Anotar →
                    </span>
                  </div>
                );
              }
              return null;
            })()}

            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-2">
                {(() => {
                  const dynamicStatus = computeMatchStatus(currentMatch);
                  const badgeColors = {
                    'PROGRAMADO': 'bg-blue-50 text-blue-700 border-blue-200',
                    'EN JUEGO': 'bg-amber-50 text-amber-700 border-amber-300 animate-pulse font-black',
                    'SIN RESULTADO': 'bg-orange-50 text-orange-700 border-orange-300 font-black',
                    'FINALIZADO': 'bg-purple-50 text-purple-700 border-purple-200',
                    'CANCELADO': 'bg-rose-50 text-rose-700 border-rose-200'
                  };

                  const isOfficial = isMatchOfficial(currentMatch);

                  return (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full border border-slate-200">
                        {currentMatch.grupo}
                      </span>
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${badgeColors[dynamicStatus] || badgeColors['PROGRAMADO']}`}>
                        {dynamicStatus === 'EN JUEGO' ? '🎾 EN JUEGO' : dynamicStatus}
                      </span>
                      {!isOfficial && (
                        <span className="text-[10px] font-extrabold uppercase tracking-wide bg-amber-50 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">
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
                      className="text-xs font-bold text-rose-600 hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 transition"
                    >
                      🗑️ Borrar Partido
                    </button>
                  )}
                </div>
              </div>

              <h2 className="text-xl font-black text-slate-900 mt-1">{currentMatch.date}</h2>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                📍 {currentMatch.location}
              </p>

              {/* BLOQUE DE MARCADOR FINAL */}
              {currentMatch.status === 'FINALIZADO' && (
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-center my-3.5 space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 block">
                    MARCADOR FINAL OFICIAL
                  </span>
                  
                  <div className="inline-block bg-purple-950 text-white font-mono font-black text-base px-4 py-1.5 rounded-xl shadow-xs">
                    {currentMatch.score || 'Ganador Registrado'}
                  </div>

                  <div className="flex justify-center gap-2 pt-1">
                    <button
                      onClick={() => setShowScoreModal(true)}
                      className="px-3 py-1.5 bg-purple-600 text-white font-bold text-xs rounded-xl hover:bg-purple-700 transition"
                    >
                      ✏️ Editar Resultado
                    </button>
                    <button
                      onClick={() => handleResetMatchScore(currentMatch.id)}
                      className="px-3 py-1.5 bg-rose-100 text-rose-700 font-bold text-xs rounded-xl hover:bg-rose-200 transition"
                    >
                      🔄 Reiniciar Partido
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setShowReloadPlaytomicModal(true)}
                  className="py-2 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold rounded-xl border border-blue-200 transition flex items-center justify-center gap-1"
                >
                  🔄 Recargar Playtomic
                </button>
                <button
                  onClick={() => {
                    const currentNames = (currentMatch.players || []).map(p => p.name);
                    setEditPlayerSlots([currentNames[0] || '', currentNames[1] || '', currentNames[2] || '', currentNames[3] || '']);
                    setShowEditPlayersModal(true);
                  }}
                  className="py-2 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-xl border border-slate-200 transition flex items-center justify-center gap-1"
                >
                  ✏️ Cambiar Suplentes
                </button>
              </div>

              {/* CONVOCATORIA Y PAREJAS */}
              <div className="mt-5 space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Convocatoria y Parejas
                  </h3>
                  <span className="text-[10px] text-slate-500 font-bold">
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
                          ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-300 shadow-xs'
                          : isP1
                          ? 'bg-blue-50/40 border-blue-200'
                          : 'bg-amber-50/40 border-amber-200'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md ${
                            isWinningTeam
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : isP1
                              ? 'bg-blue-600 text-white'
                              : 'bg-amber-600 text-white'
                          }`}>
                            Pareja {teamNum}
                          </span>
                          {isWinningTeam && (
                            <span className="text-[10px] font-black uppercase tracking-wide text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-md flex items-center gap-1">
                              👑 Ganadores
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">
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
                                isWinningTeam ? 'bg-white border-emerald-200' : 'bg-white border-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                {/* NUEVO EVENTO DE BOTÓN: Activa el modal SwapModalData */}
                                <button
                                  disabled={isFinalizado}
                                  onClick={() => setSwapModalData({ matchId: currentMatch.id, playerId: p.id })}
                                  className={`text-[10px] font-black px-2 py-0.5 rounded transition ${
                                    isFinalizado 
                                      ? 'bg-slate-100 text-slate-300 cursor-not-allowed' 
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
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
                                    <span className={`text-xs font-bold block ${isMe ? 'text-blue-600 font-black' : 'text-slate-800'}`}>
                                      {p.name} {isMe && '(Tú)'}
                                    </span>
                                    {isUnlinked && (
                                      <button
                                        onClick={() => setLinkingSlot({ matchId: currentMatch.id, name: p.name })}
                                        className="text-[9px] bg-amber-100 hover:bg-amber-200 text-amber-900 font-extrabold px-1.5 py-0.5 rounded flex items-center gap-0.5"
                                        title="Este jugador no tiene perfil oficial enlazado. Clic para asociarlo."
                                      >
                                        ⚠️ Vincular
                                      </button>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-400">
                                    {p.dinner === 'SI' ? '🍻 Cena confirmada' : p.dinner === 'NO' ? '🏃‍♂️ Se raja' : '🟡 Cena pendiente'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  disabled={isProcessing}
                                  onClick={() => handleUpdateDinner(currentMatch.id, p.id, p.name, p.dinner === 'SI' ? 'PENDIENTE' : 'SI')}
                                  className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition ${
                                    p.dinner === 'SI' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600'
                                  } ${isProcessing ? 'opacity-50 cursor-wait' : ''}`}
                                >
                                  Cena 🍻
                                </button>
                                <button
                                  disabled={isProcessing}
                                  onClick={() => handleUpdateDinner(currentMatch.id, p.id, p.name, p.dinner === 'NO' ? 'PENDIENTE' : 'NO')}
                                  className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition ${
                                    p.dinner === 'NO' ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600'
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
                    <div className="mt-5 pt-3 border-t border-slate-100 text-center">
                      <span className="text-[11px] text-slate-500 font-semibold italic block">
                        ℹ️ Este partido es amistoso. Las cenas y puntos oficiales se computan exclusivamente los Jueves.
                      </span>
                    </div>
                  );
                }

                return (
                  <div className="mt-5 pt-4 border-t border-slate-100 text-center">
                    <p className="text-xs font-black text-slate-800 uppercase tracking-wide mb-2.5">
                      ¿Te quedas al 3º tiempo?
                    </p>
                    <div className="flex gap-2.5">
                      <button
                        disabled={isProcessing}
                        onClick={() => handleUpdateDinner(currentMatch.id, mySlot.id, mySlot.name, 'SI')}
                        className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs transition border ${
                          mySlot.dinner === 'SI'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50'
                        } ${isProcessing ? 'opacity-60 cursor-wait' : ''}`}
                      >
                        ✓ ¡SÍ, CLARO! 🍻
                      </button>
                      <button
                        disabled={isProcessing}
                        onClick={() => handleUpdateDinner(currentMatch.id, mySlot.id, mySlot.name, 'NO')}
                        className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs transition border ${
                          mySlot.dinner === 'NO'
                            ? 'bg-rose-600 text-white border-rose-600 shadow-md'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50'
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
              <div className="flex bg-slate-200/80 p-1 rounded-2xl text-[11px] font-black">
                <button
                  onClick={() => setActiveTab('partidos')}
                  className={`flex-1 py-2 rounded-xl transition ${activeTab === 'partidos' ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}
                >
                  Partidos 🎾
                </button>
                <button
                  onClick={() => setActiveTab('cenas')}
                  className={`flex-1 py-2 rounded-xl transition ${activeTab === 'cenas' ? 'bg-white shadow text-emerald-800' : 'text-slate-600'}`}
                >
                  Cena & Club 🍻
                </button>
                <button
                  onClick={() => setActiveTab('rankings')}
                  className={`flex-1 py-2 rounded-xl transition ${activeTab === 'rankings' ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}
                >
                  Rankings 🏆
                </button>
                <button
                  onClick={() => setActiveTab('bote')}
                  className={`flex-1 py-2 rounded-xl transition ${activeTab === 'bote' ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}
                >
                  Bote 💶
                </button>
                <button
                  onClick={() => setActiveTab('torneos')}
                  className={`flex-1 py-2 rounded-xl transition ${activeTab === 'torneos' ? 'bg-purple-600 text-white shadow' : 'text-purple-700 hover:text-purple-900 font-black'}`}
                >
                  Torneos ⚔️
                </button>
              </div>
            ) : (
              <div className="bg-purple-50 border border-purple-200 text-purple-900 rounded-2xl p-3 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">⚔️</span>
                  <div>
                    <span className="font-black text-xs block">Acceso Exclusivo de Torneos CTC</span>
                    <span className="text-[10px] text-purple-700 font-medium">Visualizas únicamente los eventos a los que estás convocado</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-purple-200 text-purple-800 px-2 py-0.5 rounded-md">
                  Modo Torneo
                </span>
              </div>
            )}

            {/* TAB 1: PARTIDOS REGULARES */}
            {isThursdayMember && activeTab === 'partidos' && (
              <div className="space-y-3">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <span>➕</span> Añadir Partido (Pegar desde Playtomic)
                </button>

                <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-xs text-[11px] font-bold">
                  {[
                    { key: 'semana', label: '📅 Esta semana' },
                    { key: 'proximos', label: '⏳ Próximos' },
                    { key: 'todos', label: '📁 Todo el histórico' }
                  ].map(t => (
                    <button
                      key={t.key}
                      onClick={() => setFilterTime(t.key)}
                      className={`flex-1 py-1.5 rounded-xl transition ${filterTime === t.key ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {filteredMatches.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
                    <p className="text-2xl mb-1">🎾</p>
                    <p className="text-sm font-bold text-slate-700">No hay partidos de {currentUser.group} en esta vista</p>
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
                      'PROGRAMADO': 'bg-blue-50 text-blue-700 border-blue-200',
                      'EN JUEGO': 'bg-amber-50 text-amber-700 border-amber-300 animate-pulse font-black',
                      'SIN RESULTADO': 'bg-orange-50 text-orange-700 border-orange-300 font-black',
                      'FINALIZADO': 'bg-purple-100 text-purple-700 border-purple-200',
                      'CANCELADO': 'bg-rose-100 text-rose-700 border-rose-200'
                    };

                    return (
                      <div
                        key={m.id}
                        onClick={() => setSelectedMatchId(m.id)}
                        className={`bg-white rounded-2xl p-4 border shadow-xs hover:border-blue-400 cursor-pointer transition ${
                          isFinalizado ? 'border-purple-200' : 'border-slate-200'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                {m.grupo}
                              </span>
                              {!isOfficial && (
                                <span className="text-[9px] font-extrabold uppercase bg-amber-50 text-amber-800 border border-amber-300 px-1.5 py-0.2 rounded">
                                  Amistoso
                                </span>
                              )}
                            </div>
                            <h3 className="text-base font-black text-slate-900 mt-1">{m.date}</h3>
                            <p className="text-xs text-slate-500 mt-0.5">📍 {m.location}</p>
                          </div>
                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${badgeColors[dynamicStatus] || badgeColors['PROGRAMADO']}`}>
                            {dynamicStatus === 'EN JUEGO' ? '🎾 EN JUEGO' : dynamicStatus}
                          </span>
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <div className={`flex items-center gap-1.5 flex-1 min-w-0 p-1.5 rounded-xl transition ${
                              p1Won
                                ? 'bg-emerald-50 border border-emerald-300 text-emerald-950 font-black'
                                : isFinalizado
                                ? 'opacity-60 text-slate-600'
                                : 'bg-slate-50/70 text-slate-700'
                            }`}>
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                                p1Won ? 'bg-emerald-600 text-white' : 'bg-blue-100 text-blue-800'
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

                            <span className="font-black text-slate-300 text-[10px] px-1 shrink-0">VS</span>

                            <div className={`flex items-center justify-end gap-1.5 flex-1 min-w-0 p-1.5 rounded-xl transition ${
                              p2Won
                                ? 'bg-emerald-50 border border-emerald-300 text-emerald-950 font-black'
                                : isFinalizado
                                ? 'opacity-60 text-slate-600'
                                : 'bg-slate-50/70 text-slate-700'
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
                                p2Won ? 'bg-emerald-600 text-white' : 'bg-amber-100 text-amber-800'
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
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                      Jornada de Cena:
                    </label>
                    <button
                      onClick={() => setShowDinnerHistory(!showDinnerHistory)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 underline"
                    >
                      {showDinnerHistory ? '📅 Ver Próximas Cenas' : '📜 Ver Histórico de Cenas'}
                    </button>
                  </div>

                  <select
                    value={activeDinnerKey}
                    onChange={(e) => setSelectedDinnerDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800"
                  >
                    {(showDinnerHistory ? pastDinnerDates : upcomingDinnerDates).map(d => (
                      <option key={d.key} value={d.key}>
                        {d.label} {d.key === defaultSmartDinnerKey ? '★ (Siguiente recomendada)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
                  <p className="text-xs font-black text-blue-900 mb-2">
                    ¿Te vienes a la cena este {currentVisualDinnerLabel}? 🍻
                  </p>
                  <button
                    onClick={() => handleToggleSoloCena(activeDinnerKey, isUserInDinner ? 'NO' : 'SI')}
                    className={`py-2 px-4 rounded-xl text-xs font-bold transition shadow-xs ${
                      isUserInDinner
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {isUserInDinner ? '✓ Apuntado a la cena (Clic para borrarte)' : '+ ¡Me apunto a cenar!'}
                  </button>
                </div>

                <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">Mesa Unificada</h3>
                      <p className="text-xs text-slate-500 font-bold capitalize">{currentVisualDinnerLabel}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black text-emerald-600">
                        {dinnerYes.length + dinnerGuests.length}
                      </span>
                      <span className="text-[10px] text-slate-400 block font-bold">MESA PARA</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-2.5">
                      <span className="text-base font-black text-emerald-700 block">{dinnerYes.length + dinnerGuests.length}</span>
                      <span className="text-[10px] font-bold text-emerald-900 uppercase">Cenan SÍ</span>
                    </div>
                    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-2.5">
                      <span className="text-base font-black text-rose-700 block">{dinnerNo.length}</span>
                      <span className="text-[10px] font-bold text-rose-900 uppercase">Se Rajan</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-2.5">
                      <span className="text-base font-black text-amber-700 block">{dinnerPending.length}</span>
                      <span className="text-[10px] font-bold text-amber-900 uppercase">Pendientes</span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 text-xs">
                    <div>
                      <span className="font-extrabold text-emerald-800 block mb-2">
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
                            className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-950 px-2.5 py-1 rounded-xl font-bold text-xs shadow-2xs cursor-pointer hover:bg-emerald-100 transition"
                          >
                            <UserAvatar name={item.name} photo={item.photo} size="sm" />
                            <span>{item.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {dinnerNo.length > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <span className="font-extrabold text-rose-800 block mb-2">
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
                              className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 text-rose-950 px-2.5 py-1 rounded-xl font-bold text-xs cursor-pointer hover:bg-rose-100 transition"
                            >
                              <UserAvatar name={item.name} photo={item.photo} size="sm" />
                              <span>{item.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {dinnerPending.length > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <span className="font-extrabold text-amber-800 block mb-2">
                          🟡 Pendientes de Confirmar ({dinnerPending.length}):
                        </span>
                        <div className="space-y-1.5">
                          {dinnerPending.map((item, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between bg-amber-50/80 border border-amber-200 p-2 rounded-xl text-amber-950"
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
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[10px] rounded-lg transition flex items-center gap-1 shadow-2xs"
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

                  <div className="pt-2 border-t border-slate-100">
                    <button
                      onClick={() => handleShareClubWhatsapp(currentVisualDinnerLabel, dinnerYes, dinnerGuests)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-2xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
                    >
                      📲 Enviar Reserva al Club / Restaurante por WhatsApp ({dinnerYes.length + dinnerGuests.length} comensales)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: RANKINGS REGULARES */}
            {isThursdayMember && activeTab === 'rankings' && (
              <div className="bg-white rounded-2xl p-4 border border-slate-200">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200">
                    Ranking {currentUser.group}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold">{sortedGroupPlayers.length} jugadores</span>
                </div>

                <div className="flex gap-1.5 mb-4">
                  {['hibrido', 'deportivo', 'barandas'].map(type => (
                    <button
                      key={type}
                      onClick={() => setRankingType(type)}
                      className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg capitalize transition ${
                        rankingType === type ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
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
                      className="flex items-center justify-between p-2 rounded-2xl bg-slate-50 text-xs hover:bg-blue-50/60 cursor-pointer transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-black w-6 text-center text-sm text-slate-400">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                        </span>
                        <UserAvatar name={p.name} photo={p.photo} size="md" />
                        <div>
                          <p className="font-bold text-slate-900">{p.name}</p>
                          <p className="text-[10px] text-slate-500">{p.titulo}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-blue-600 text-sm">
                          {rankingType === 'deportivo' ? p.ptsDeportivo : rankingType === 'barandas' ? p.ptsBarandas : p.hibrido}
                        </span>
                        <span className="text-[10px] text-slate-400 block">pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: BOTE REGULAR */}
            {isThursdayMember && activeTab === 'bote' && (
              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                  <div className="flex justify-between items-center mb-1">
                    <p className="font-bold">💶 Bote {currentUser.group}</p>
                    <span className="text-[10px] font-black uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
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
                        className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 text-xs hover:bg-amber-50/60 cursor-pointer transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={p.name} photo={p.photo} size="md" />
                          <div>
                            <p className="font-bold text-slate-900">{p.name}</p>
                            <p className="text-[10px] text-slate-500">{p.pJ} partidos · {p.cSi} cenas</p>
                          </div>
                        </div>
                        <span className={`font-black text-sm px-2.5 py-1 rounded-xl ${
                          p.deuda > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
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
                <div className="bg-gradient-to-r from-purple-700 to-indigo-800 rounded-3xl p-5 text-white shadow-md">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-[10px] uppercase font-black bg-white/20 px-2 py-0.5 rounded-md tracking-wider">
                        Modo Torneo Aislado
                      </span>
                      <h2 className="text-xl font-black mt-1">Torneos Especiales CTC</h2>
                    </div>
                    <span className="text-3xl">⚔️</span>
                  </div>
                  <button
                    onClick={() => setShowTournamentWizard(true)}
                    className="w-full mt-3 py-2.5 bg-white text-purple-900 hover:bg-purple-50 font-black rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-1.5"
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
                      const bothValidated = draftCap1Validated && draftCap2Validated;

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

                        rest.forEach(p => {
                          const sum1 = team1Arr.reduce((acc, item) => acc + (item.level || 3.5), 0);
                          const sum2 = team2Arr.reduce((acc, item) => acc + (item.level || 3.5), 0);
                          if (sum1 <= sum2) team1Arr.push(p);
                          else team2Arr.push(p);
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

                        if (updatedSync) {
                          try {
                            fetch(apiUrl, {
                              method: 'POST',
                              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                              body: JSON.stringify({ action: 'GUARDAR_TORNEO', torneo: updatedSync })
                            });
                          } catch (e) {
                            console.error(e);
                          }
                        }
                      };

                      return (
                        <div key={t.id} className="bg-slate-900 rounded-3xl p-4 border border-blue-500/30 shadow-lg text-white space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500 text-amber-950 px-2 py-0.5 rounded-md">
                                Draft Ryder (Capitanes)
                              </span>
                              <h3 className="text-base font-black mt-1">{t.name}</h3>
                            </div>
                            {isCreatorOrCoOrg && (
                              <button onClick={() => handleDeleteTournament(t.id)} className="text-[11px] font-bold text-rose-400">🗑️ Borrar</button>
                            )}
                          </div>

                          {canEditDraft ? (
                            <div className="space-y-3.5 mt-2">
                              <div className="bg-slate-800 p-3 rounded-2xl border border-slate-700 space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black uppercase text-blue-400">📊 Balance de Escuadras</span>
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${isBalanced ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                                    {isBalanced ? '✓ Equilibrado' : '⚠️ Desnivelado'} (Δ {delta})
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                                  <div className="bg-blue-950/60 p-2 rounded-xl border border-blue-500/30">
                                    <span className="text-[9px] text-blue-300 font-bold block">Equipo Azul 🔵</span>
                                    <span className="text-sm font-black text-white">{avgT1} <span className="text-[10px] font-normal text-slate-400">({team1Players.length} jugs)</span></span>
                                  </div>
                                  <div className="bg-rose-950/60 p-2 rounded-xl border border-rose-500/30">
                                    <span className="text-[9px] text-rose-300 font-bold block">Equipo Rojo 🔴</span>
                                    <span className="text-sm font-black text-white">{avgT2} <span className="text-[10px] font-normal text-slate-400">({team2Players.length} jugs)</span></span>
                                  </div>
                                </div>

                                <button 
                                  type="button" 
                                  onClick={handleAutoBalanceDraft} 
                                  className="w-full py-2 bg-gradient-to-r from-blue-600 to-rose-600 hover:from-blue-500 text-white font-black rounded-xl text-xs shadow-md transition"
                                >
                                  ⚡ Auto-Equilibrar Escuadras por Rating
                                </button>
                              </div>
                              
                              <div className="max-h-52 overflow-y-auto pr-1 space-y-1.5">
                                {(t.participants || []).map(p => (
                                  <div key={p.id} className="p-2 rounded-xl border border-slate-700 bg-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-2 truncate">
                                      <UserAvatar name={p.name} photo={p.photo} size="xs" />
                                      <span className="font-bold text-slate-200 text-xs truncate">{p.name} <span className="text-[10px] text-amber-400">★{p.level || 3.5}</span></span>
                                    </div>
                                    <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-700 shrink-0">
                                      <button 
                                        disabled={p.id === t.captain1Id || p.id === t.captain2Id}
                                        onClick={() => handleUpdateDraftTeam(t.id, p.id, 1)} 
                                        className={`px-2 py-1 rounded-md text-[10px] font-black transition ${p.assignedTeam === 1 ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
                                      >
                                        🔵 Azul
                                      </button>
                                      <button 
                                        disabled={p.id === t.captain1Id || p.id === t.captain2Id}
                                        onClick={() => handleUpdateDraftTeam(t.id, p.id, 2)} 
                                        className={`px-2 py-1 rounded-md text-[10px] font-black transition ${p.assignedTeam === 2 ? 'bg-rose-600 text-white' : 'text-slate-500'}`}
                                      >
                                        🔴 Rojo
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="bg-slate-800 p-3 rounded-2xl border border-slate-700 space-y-2 text-xs">
                                <span className="text-[10px] font-black text-blue-400 uppercase block">Validación de Equipos</span>
                                
                                <label className="flex items-center gap-2 cursor-pointer bg-slate-900/60 p-2 rounded-xl border border-slate-700">
                                  <input 
                                    type="checkbox" 
                                    disabled={!isMeCaptain1 && !isCreatorOrCoOrg}
                                    checked={draftCap1Validated} 
                                    onChange={e => setDraftCap1Validated(e.target.checked)} 
                                    className="w-4 h-4 text-blue-600 accent-blue-600" 
                                  />
                                  <span className="font-bold text-slate-200">Capitán Azul ({cap1?.name || 'Por asignar'}) da el visto bueno</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer bg-slate-900/60 p-2 rounded-xl border border-slate-700">
                                  <input 
                                    type="checkbox" 
                                    disabled={!isMeCaptain2 && !isCreatorOrCoOrg}
                                    checked={draftCap2Validated} 
                                    onChange={e => setDraftCap2Validated(e.target.checked)} 
                                    className="w-4 h-4 text-rose-600 accent-rose-600" 
                                  />
                                  <span className="font-bold text-slate-200">Capitán Rojo ({cap2?.name || 'Por asignar'}) da el visto bueno</span>
                                </label>
                              </div>
                              
                              <button 
                                onClick={() => handleApproveDraftTeams(t.id)} 
                                disabled={!bothValidated}
                                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black rounded-xl text-xs mt-2 transition shadow-md"
                              >
                                {bothValidated ? '✅ Equipos Validados por ambos Capitanes' : '⏳ Esperando doble validación...'}
                              </button>
                            </div>
                          ) : (
                            <div className="p-4 text-center bg-slate-800 rounded-2xl border border-slate-700 mt-2">
                              <span className="text-3xl block mb-2">🛡️</span>
                              <p className="text-xs text-slate-300">Los capitanes <strong>{cap1?.name?.split(' ')[0] || 'Azul'}</strong> y <strong>{cap2?.name?.split(' ')[0] || 'Rojo'}</strong> están confeccionando los equipos.<br/><br/>Recibirás una alerta cuando el cuadrante esté listo.</p>
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
                        const teamB = (t.participants || []).filter(p => p.participants || (p.assignedTeam === 2));
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
                          try {
                            await fetch(apiUrl, {
                              method: 'POST',
                              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                              body: JSON.stringify({ action: 'GUARDAR_TORNEO', torneo: updatedSync })
                            });
                          } catch (e) {
                            console.error(e);
                          }
                        }
                      };

                      return (
                        <div key={t.id} className="bg-purple-900 rounded-3xl p-4 border border-purple-500/30 shadow-lg text-white space-y-3 text-center">
                          <span className="text-3xl block mb-1">✨</span>
                          <h3 className="text-base font-black">¡Equipos Validados por los Capitanes!</h3>
                          <p className="text-xs text-purple-200">Ambos capitanes han dado su conformidad. Pulsa para generar los cruces definitivos.</p>
                          {isCreatorOrCoOrg && (
                            <button onClick={handleGenerateFixtureForDraft} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs mt-2 transition shadow-md">
                              🚀 Generar Cuadrante Definitivo
                            </button>
                          )}
                        </div>
                      );
                    }

                    // VISTA NORMAL (Torneo ACTIVO)
                    return (
                      <div key={t.id} className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-lg border border-purple-200">
                                {t.mode}
                              </span>
                              {isCreatorOrCoOrg && (
                                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.2 rounded border border-emerald-300">
                                  👑 Organizador
                                </span>
                              )}
                            </div>
                            <h3 className="text-base font-black text-slate-900 mt-1">{t.name}</h3>
                          </div>
                          {isCreatorOrCoOrg && (
                            <button
                              onClick={() => handleDeleteTournament(t.id)}
                              className="text-[11px] font-bold text-rose-500 hover:text-rose-700 p-1 rounded-lg"
                              title="Eliminar torneo"
                            >
                              🗑️
                            </button>
                          )}
                        </div>

                        <div className="flex bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
                          <button
                            onClick={() => setTournamentSubTab(prev => ({ ...prev, [t.id]: 'partidos' }))}
                            className={`flex-1 py-1.5 rounded-lg transition ${curSubTab === 'partidos' ? 'bg-white shadow text-purple-800' : 'text-slate-600'}`}
                          >
                            ⚔️ Partidos
                          </button>
                          <button
                            onClick={() => setTournamentSubTab(prev => ({ ...prev, [t.id]: 'jugadores' }))}
                            className={`flex-1 py-1.5 rounded-lg transition ${curSubTab === 'jugadores' ? 'bg-white shadow text-blue-800' : 'text-slate-600'}`}
                          >
                            📲 Invitar
                          </button>
                          <button
                            onClick={() => setTournamentSubTab(prev => ({ ...prev, [t.id]: 'cena' }))}
                            className={`flex-1 py-1.5 rounded-lg transition ${curSubTab === 'cena' ? 'bg-white shadow text-amber-900' : 'text-slate-600'}`}
                          >
                            🍻 3º Tiempo
                          </button>
                        </div>

                        {curSubTab === 'partidos' && (
                          <div className="space-y-2">
                            <button
                              id={`share-btn-${t.id}`}
                              onClick={() => handleShareTournamentImage(t.id, t.name)}
                              className="w-full mb-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
                            >
                              <span>📷</span> Compartir Cuadrante por WhatsApp
                            </button>

                            {/* Contenedor invisible para nosotros pero que será el lienzo de la foto */}
                            <div id={`tournament-fixture-${t.id}`} className="space-y-2 bg-white p-2 rounded-xl">
                              
                              {/* Título interno para que la foto se vea profesional */}
                              <div className="text-center pb-2 pt-1 border-b border-slate-100 mb-2">
                                <span className="font-black text-slate-800 text-sm block">{t.name}</span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cuadrante Oficial</span>
                              </div>

                              {t.rounds.map(r => (
                                <div key={r.round} className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 space-y-1">
                                  <div className="text-center mb-1.5">
                                    <span className="text-[9px] font-black uppercase text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">
                                      {r.timeLabel || `Ronda ${r.round}`}
                                    </span>
                                  </div>
                                  {r.matches.map((m, mIdx) => (
                                    <div
                                      key={m.id || mIdx}
                                      onClick={() => {
                                        setActiveTournamentId(t.id);
                                        setReportingTournamentMatch(m);
                                      }}
                                      className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs cursor-pointer hover:border-purple-300"
                                    >
                                      <span className="font-bold text-slate-800">{m.court}</span>
                                      <span className="font-semibold text-slate-600">{m.team1} vs {m.team2}</span>
                                      <span className="text-purple-700 font-black">{m.score || 'Anotar ✍️'}</span>
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
                                  <span className="font-bold text-slate-800">{p.name}</span>
                                </div>
                                <button
                                  onClick={() => handleSharePlayerPersonalLink(t, p)}
                                  className="px-2 py-1 bg-emerald-600 text-white font-bold text-[10px] rounded-lg"
                                >
                                  📲 Enviar Link
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {curSubTab === 'cena' && (
                          <div className="space-y-2 text-xs">
                            <button
                              onClick={() => handleShareTournamentDinnerWhatsapp(t)}
                              className="w-full py-2 bg-emerald-600 text-white font-bold rounded-xl"
                            >
                              📲 Avisar al Restaurante por WhatsApp
                            </button>
                          </div>
                        )}
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
            <h3 className="text-base font-black text-slate-900 mb-2">Recargar desde Playtomic</h3>
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
                <button type="button" onClick={() => setShowReloadPlaytomicModal(false)} className="flex-1 py-2 bg-slate-100 font-bold text-xs rounded-xl">Cancelar</button>
                <button type="submit" disabled={syncing} className="flex-1 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl">Actualizar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CAMBIAR SUPLENTES */}
      {showEditPlayersModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl">
            <h3 className="text-base font-black text-slate-900 mb-2">Cambiar Suplentes</h3>
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
                <button type="button" onClick={() => setShowEditPlayersModal(false)} className="flex-1 py-2 bg-slate-100 font-bold text-xs rounded-xl">Cancelar</button>
                <button type="submit" disabled={syncing} className="flex-1 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl">Guardar</button>
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
      />

      {/* MODAL: REGLAS OFICIALES */}
      <CriteriosModal
        isOpen={showRulesModal}
        onClose={() => setShowRulesModal(false)}
      />
    </div>
  );
}
