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
   - La pareja que finalice el último turno como ganadora en la Pista 1 (o la que acumule más minutos/turnos defendiendo la Pista Reina, según configuración del evento).`,

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
    .replace(/\b\d{1,2}:\d{2}\b/g, '')
    .replace(/\(\d+min\)/gi, '')
    .replace(/,\s*$/, '')
    .replace(/[📅🗓️📍]/g, '')
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
      className={`${sizeClasses[size]} rounded-full bg-linear-to-br from-blue-600 to-indigo-700 text-white font-black flex items-center justify-center border border-white/50 shadow-xs shrink-0 ${className}`}
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
            <li><strong>Quedarse a la cena:</strong> +5 puntos.</li>
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

function UserProfileModal({ isOpen, onClose, user, matches, tournaments, onPhotoUploaded, onUpdateUserData, isCurrentUser, isThursdayMember }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editGroup, setEditGroup] = useState('Chicos');
  const [editPlaytomic, setEditPlaytomic] = useState('');
  const [savingData, setSavingData] = useState(false);

  useEffect(() => {
    if (user) {
      setEditName(user.name || '');
      setEditPhone(user.phone || '');
      setEditGroup(user.group === 'torneo' ? 'Solo Torneo' : user.group === 'chicas' ? 'Chicas' : 'Chicos');
      setEditPlaytomic(user.playtomic || '');
      setEditing(false);
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
        if (width > height) {
          if (width > maxSize) { height *= maxSize / width; width = maxSize; }
        } else {
          if (height > maxSize) { width *= maxSize / height; height = maxSize; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
        onPhotoUploaded(user.id, compressedBase64);
        setUploading(false);
      };
      img.src = readerEvent.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfileData = async (e) => {
    e.preventDefault();
    setSavingData(true);
    await onUpdateUserData(user.id, {
      nombre: editName,
      telefono: editPhone,
      grupo: editGroup === 'Solo Torneo' ? 'torneo' : editGroup,
      playtomic: editPlaytomic
    });
    setSavingData(false);
    setEditing(false);
  };

  const stats = (() => {
    let played = 0, won = 0, lost = 0, dinnerYes = 0, dinnerNo = 0;
    const partnerStats = {};
    const rivalStats = {};

    matches.forEach(m => {
      if (m.status !== 'FINALIZADO') return;
      if (!isMatchOfficial(m)) return;

      const mySlot = (m.players || []).find(p => p.id === user.id || normalizeName(p.name) === normUserName);
      if (!mySlot) return;

      played++;
      const didWin = mySlot.won === 'SI';
      if (didWin) won++; else lost++;

      if (mySlot.dinner === 'SI') dinnerYes++;
      if (mySlot.dinner === 'NO') dinnerNo++;

      const myTeam = mySlot.team;
      (m.players || []).forEach(p => {
        if (normalizeName(p.name) === normUserName) return;
        if (p.team === myTeam) {
          if (!partnerStats[p.name]) partnerStats[p.name] = { played: 0, won: 0, lost: 0 };
          partnerStats[p.name].played++;
          if (didWin) partnerStats[p.name].won++; else partnerStats[p.name].lost++;
        } else {
          if (!rivalStats[p.name]) rivalStats[p.name] = { played: 0, wonAgainst: 0, lostAgainst: 0 };
          rivalStats[p.name].played++;
          if (didWin) rivalStats[p.name].wonAgainst++; else rivalStats[p.name].lostAgainst++;
        }
      });
    });

    let bestPartner = null, bestPartnerWinPct = -1;
    let worstPartner = null, worstPartnerLossPct = 0;
    Object.entries(partnerStats).forEach(([name, data]) => {
      const winPct = (data.won / data.played) * 100;
      const lossPct = (data.lost / data.played) * 100;
      if (data.won > 0 && winPct > bestPartnerWinPct) {
        bestPartnerWinPct = winPct;
        bestPartner = { name, ...data, pct: winPct.toFixed(0) };
      }
      if (data.lost > 0 && lossPct >= worstPartnerLossPct) {
        worstPartnerLossPct = lossPct;
        worstPartner = { name, ...data, pct: lossPct.toFixed(0) };
      }
    });

    let easiestRival = null, easiestWinPct = -1;
    let hardestRival = null, hardestLossPct = 0;
    Object.entries(rivalStats).forEach(([name, data]) => {
      const winPct = (data.wonAgainst / data.played) * 100;
      const lossPct = (data.lostAgainst / data.played) * 100;
      if (data.wonAgainst > 0 && winPct > easiestWinPct) {
        easiestWinPct = winPct;
        easiestRival = { name, ...data, pct: winPct.toFixed(0) };
      }
      if (data.lostAgainst > 0 && lossPct >= hardestLossPct) {
        hardestLossPct = lossPct;
        hardestRival = { name, ...data, pct: lossPct.toFixed(0) };
      }
    });

    return {
      played, won, lost,
      winRate: played > 0 ? ((won / played) * 100).toFixed(0) : 0,
      dinnerYes, dinnerNo,
      bestPartner, worstPartner,
      hardestRival, easiestRival
    };
  })();

  const tournamentStats = (() => {
    let tDisputed = 0, tPlayed = 0, tWon = 0, tLost = 0;
    const modePerformance = {
      pozo: { label: 'Pozo Continuo', played: 0, won: 0 },
      americano: { label: 'Americano', played: 0, won: 0 },
      eliminatorio: { label: 'Fases Finales', played: 0, won: 0 },
      equipos: { label: 'Por Equipos (Ryder)', played: 0, won: 0 }
    };
    const podiums = { oro: 0, plata: 0, bronce: 0 };

    (tournaments || []).forEach(t => {
      const isParticipant = (t.participants || []).some(
        p => p.id === user.id || normalizeName(p.name) === normUserName
      );
      if (!isParticipant) return;
      tDisputed++;

      const mMode = t.mode || 'pozo';
      if (!modePerformance[mMode]) modePerformance[mMode] = { label: mMode, played: 0, won: 0 };

      (t.rounds || []).forEach(r => {
        (r.matches || []).forEach(m => {
          if (m.status !== 'FINALIZADO') return;
          const inT1 = normalizeName(m.team1 || '').includes(normUserName);
          const inT2 = normalizeName(m.team2 || '').includes(normUserName);
          if (inT1 || inT2) {
            tPlayed++;
            modePerformance[mMode].played++;
            const won = (inT1 && m.winner === 1) || (inT2 && m.winner === 2);
            if (won) {
              tWon++;
              modePerformance[mMode].won++;
            } else {
              tLost++;
            }
            if (m.id === 'FINAL_ORO') {
              if (won) podiums.oro++; else podiums.plata++;
            } else if (m.id === 'FINAL_CONSOL' && won) {
              podiums.bronce++;
            }
          }
        });
      });
    });

    let bestMode = null, bestModeRate = -1;
    let worstMode = null, worstModeRate = 101;
    Object.entries(modePerformance).forEach(([k, data]) => {
      if (data.played >= 1) {
        const rate = (data.won / data.played) * 100;
        if (rate > bestModeRate) { bestModeRate = rate; bestMode = { ...data, rate: rate.toFixed(0) }; }
        if (rate < worstModeRate) { worstModeRate = rate; worstMode = { ...data, rate: rate.toFixed(0) }; }
      }
    });

    return {
      tDisputed, tPlayed, tWon, tLost,
      winRate: tPlayed > 0 ? ((tWon / tPlayed) * 100).toFixed(0) : 0,
      bestMode, worstMode, podiums
    };
  })();

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
              <h3 className="text-base font-black text-slate-900">{user.name}</h3>
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
              Estadísticas Liga Regular (Jueves)
            </span>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2">
                <span className="text-base font-black text-slate-900 block">{stats.played}</span>
                <span className="text-[9px] uppercase font-bold text-slate-500">PJ</span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2">
                <span className="text-base font-black text-emerald-700 block">{stats.won}</span>
                <span className="text-[9px] uppercase font-bold text-emerald-900">Victorias</span>
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-2">
                <span className="text-base font-black text-rose-700 block">{stats.lost}</span>
                <span className="text-[9px] uppercase font-bold text-rose-900">Derrotas</span>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-2">
                <span className="text-base font-black text-blue-700 block">{stats.winRate}%</span>
                <span className="text-[9px] uppercase font-bold text-blue-900">% Éxito</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center pt-1">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                <span className="text-base font-black text-amber-800 block">{stats.dinnerYes}</span>
                <span className="text-[10px] font-bold text-amber-900 uppercase">Cenas Asistidas 🍻</span>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-2.5">
                <span className="text-base font-black text-purple-800 block">{stats.dinnerNo}</span>
                <span className="text-[10px] font-bold text-purple-900 uppercase">Rajadas 🏃‍♂</span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2 pt-1 border-t border-slate-100">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-purple-900 uppercase tracking-wider block">
              ⚔️ Rendimiento en Torneos
            </span>
            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
              {tournamentStats.tDisputed} eventos
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-2">
              <span className="text-base font-black text-purple-900 block">{tournamentStats.tPlayed}</span>
              <span className="text-[9px] uppercase font-bold text-purple-600">Partidos Torneo</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2">
              <span className="text-base font-black text-emerald-700 block">{tournamentStats.tWon}</span>
              <span className="text-[9px] uppercase font-bold text-emerald-900">Ganados</span>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2">
              <span className="text-base font-black text-blue-700 block">{tournamentStats.winRate}%</span>
              <span className="text-[9px] uppercase font-bold text-blue-900">% Éxito</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-2.5">
              <span className="text-[9px] font-extrabold text-emerald-800 uppercase block">🚀 Formato Estrella</span>
              <p className="font-black text-slate-900 text-xs mt-0.5 truncate">
                {tournamentStats.bestMode ? tournamentStats.bestMode.label : 'Sin torneos'}
              </p>
              {tournamentStats.bestMode && (
                <span className="text-[10px] text-emerald-700 font-bold">{tournamentStats.bestMode.rate}% victorias</span>
              )}
            </div>

            <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-2.5">
              <span className="text-[9px] font-extrabold text-rose-800 uppercase block">📉 Formato a Mejorar</span>
              <p className="font-black text-slate-900 text-xs mt-0.5 truncate">
                {tournamentStats.worstMode ? tournamentStats.worstMode.label : 'Sin torneos'}
              </p>
              {tournamentStats.worstMode && (
                <span className="text-[10px] text-rose-700 font-bold">{tournamentStats.worstMode.rate}% victorias</span>
              )}
            </div>
          </div>

          {(tournamentStats.podiums.oro > 0 || tournamentStats.podiums.plata > 0 || tournamentStats.podiums.bronce > 0) && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 flex justify-around text-center">
              <div>
                <span className="text-base block">🥇</span>
                <span className="font-black text-xs text-amber-600">{tournamentStats.podiums.oro}</span>
                <span className="text-[9px] text-slate-400 block font-bold">Campeón</span>
              </div>
              <div>
                <span className="text-base block">🥈</span>
                <span className="font-black text-xs text-slate-600">{tournamentStats.podiums.plata}</span>
                <span className="text-[9px] text-slate-400 block font-bold">Subcampeón</span>
              </div>
              <div>
                <span className="text-base block">🥉</span>
                <span className="font-black text-xs text-amber-800">{tournamentStats.podiums.bronce}</span>
                <span className="text-[9px] text-slate-400 block font-bold">3º Puesto</span>
              </div>
            </div>
          )}
        </div>

        {isThursdayMember && (
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Compañeros y Rivales (Liga)</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-2.5">
                <span className="text-[10px] font-bold text-emerald-800 block uppercase">🌟 Mejor Pareja</span>
                <p className="font-black text-slate-900 text-xs mt-0.5 truncate">{stats.bestPartner ? stats.bestPartner.name : 'Sin datos'}</p>
                {stats.bestPartner && <span className="text-[10px] text-emerald-700 font-semibold">{stats.bestPartner.pct}% victorias</span>}
              </div>

              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-2.5">
                <span className="text-[10px] font-bold text-rose-800 block uppercase">💔 Pareja Gafe</span>
                <p className="font-black text-slate-900 text-xs mt-0.5 truncate">{stats.worstPartner ? stats.worstPartner.name : 'Sin datos'}</p>
                {stats.worstPartner && <span className="text-[10px] text-rose-700 font-semibold">{stats.worstPartner.pct}% derrotas</span>}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-2.5">
                <span className="text-[10px] font-bold text-amber-800 block uppercase">😈 Bestia Negra</span>
                <p className="font-black text-slate-900 text-xs mt-0.5 truncate">{stats.hardestRival ? stats.hardestRival.name : 'Sin datos'}</p>
                {stats.hardestRival && <span className="text-[10px] text-amber-700 font-semibold">{stats.hardestRival.pct}% derrotas vs él</span>}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-2.5">
                <span className="text-[10px] font-bold text-blue-800 block uppercase">🍰 Rival Favorito</span>
                <p className="font-black text-slate-900 text-xs mt-0.5 truncate">{stats.easiestRival ? stats.easiestRival.name : 'Sin datos'}</p>
                {stats.easiestRival && <span className="text-[10px] text-blue-700 font-semibold">{stats.easiestRival.pct}% victorias vs él</span>}
              </div>
            </div>
          </div>
        )}

        <button onClick={onClose} className="w-full py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs">Cerrar</button>
      </div>
    </div>
  );
}

function PinModal({ isOpen, onClose, targetUser, onPinSuccess, apiUrl }) {
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen || !targetUser) return null;
  const hasPinAlready = Boolean(targetUser.pin && targetUser.pin.trim() !== '');

  const handleNumClick = (num) => {
    if (pinInput.length < 4) { setPinInput(prev => prev + num); setErrorMsg(''); }
  };
  const handleDelete = () => { setPinInput(prev => prev.slice(0, -1)); setErrorMsg(''); };

  const handleSubmit = async () => {
    if (pinInput.length !== 4) { setErrorMsg('El PIN debe tener 4 números'); return; }

    if (hasPinAlready) {
      if (pinInput === targetUser.pin.trim()) { onPinSuccess(targetUser); }
      else { setErrorMsg('PIN incorrecto.'); setPinInput(''); }
    } else {
      setSaving(true);
      try {
        await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'ESTABLECER_PIN', idJugador: targetUser.id, pin: pinInput })
        });
        onPinSuccess({ ...targetUser, pin: pinInput });
      } catch (e) {
        setErrorMsg('Error: ' + e.message);
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 text-white rounded-3xl max-w-xs w-full p-6 text-center shadow-2xl">
        <UserAvatar name={targetUser.name} photo={targetUser.photo} size="lg" className="mx-auto mb-3" />
        <h3 className="text-base font-black mb-1">{hasPinAlready ? `PIN de ${targetUser.name}` : `Crear PIN para ${targetUser.name}`}</h3>
        <p className="text-xs text-slate-400 mb-4">Introduce 4 números</p>

        <div className="flex justify-center gap-3 mb-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${pinInput.length > i ? 'bg-blue-500 border-blue-500 scale-110' : 'border-slate-600'}`} />
          ))}
        </div>

        {errorMsg && <p className="text-rose-400 text-xs font-semibold mb-3">{errorMsg}</p>}

        <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto mb-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button key={num} onClick={() => handleNumClick(String(num))} className="h-11 bg-slate-800 hover:bg-slate-700 rounded-xl text-base font-bold text-white transition border border-slate-700">
              {num}
            </button>
          ))}
          <button onClick={onClose} className="h-11 text-xs font-bold text-slate-400">Cancelar</button>
          <button onClick={() => handleNumClick('0')} className="h-11 bg-slate-800 hover:bg-slate-700 rounded-xl text-base font-bold text-white transition border border-slate-700">0</button>
          <button onClick={handleDelete} className="h-11 text-sm font-bold text-slate-400 flex items-center justify-center">⌫</button>
        </div>

        <button onClick={handleSubmit} disabled={pinInput.length !== 4 || saving} className="w-full py-2.5 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-500 text-white transition">
          {saving ? 'Guardando...' : hasPinAlready ? 'Entrar' : 'Guardar y Entrar'}
        </button>
      </div>
    </div>
  );
}

// Modal Creador de Torneos con Cupo Objetivo de Jugadores y Contador en Vivo
function TournamentCreatorModal({ isOpen, onClose, allPlayers, tournaments, onTournamentCreated, currentUserId, onSaveLevel }) {
  const [step, setStep] = useState(1);
  const [tName, setTName] = useState('Torneo CTC Fin de Semana');
  const [tournamentMode, setTournamentMode] = useState('pozo');

  // Control de pistas
  const [tCourts, setTCourts] = useState(3);

  // Cupo objetivo de jugadores (autocompletado por defecto a Pistas * 4)
  const [targetPlayers, setTargetPlayers] = useState(12);
  const [hasManuallyEditedTarget, setHasManuallyEditedTarget] = useState(false);

  // Control flexible de tiempos
  const [tDuration, setTDuration] = useState(120);
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [customDuration, setCustomDuration] = useState('');

  const [tMatchTime, setTMatchTime] = useState(20);
  const [isCustomMatchTime, setIsCustomMatchTime] = useState(false);
  const [customMatchTime, setCustomMatchTime] = useState('');

  const effectiveDuration = isCustomDuration ? (Number(customDuration) || 120) : Number(tDuration);
  const effectiveMatchTime = isCustomMatchTime ? (Number(customMatchTime) || 20) : Number(tMatchTime);
  const estimatedRounds = Math.max(1, Math.floor(effectiveDuration / effectiveMatchTime));

  // Al cambiar las pistas, autocompletar jugadores si no se ha forzado manualmente
  const handleCourtsChange = (newCourts) => {
    const val = Math.min(12, Math.max(1, newCourts));
    setTCourts(val);
    if (!hasManuallyEditedTarget) {
      setTargetPlayers(val * 4);
    }
  };

  const [participants, setParticipants] = useState(() => {
    return allPlayers.map(p => {
      const calc = calculateTournamentSuggestedLevel(p, tournaments);
      return {
        id: p.id,
        name: p.name,
        photo: p.photo,
        level: calc.suggestedLevel,
        originalLevel: p.level || 3.5,
        diff: calc.diff,
        trend: calc.trend,
        selected: true,
        isGuest: false,
        dinner: 'SI',
        assignedTeam: 1
      };
    });
  });

  const [captain1Id, setCaptain1Id] = useState('');
  const [captain2Id, setCaptain2Id] = useState('');

  const [guestName, setGuestName] = useState('');
  const [guestLevel, setGuestLevel] = useState(3.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customGeminiRules, setCustomGeminiRules] = useState('');

  const [generatedFixture, setGeneratedFixture] = useState([]);
  const [generatedTeams, setGeneratedTeams] = useState([]);

  useEffect(() => {
    const selected = participants.filter(p => p.selected);
    if (selected.length >= 2) {
      if (!captain1Id || !selected.some(s => s.id === captain1Id)) setCaptain1Id(selected[0].id);
      if (!captain2Id || !selected.some(s => s.id === captain2Id)) setCaptain2Id(selected[1].id);
    }
  }, [participants, tournamentMode]);

  useEffect(() => {
    setCustomGeminiRules(OFFICIAL_TOURNAMENT_RULES[tournamentMode] || '');
  }, [tournamentMode]);

  if (!isOpen) return null;

  const handleTogglePlayer = (id) => {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, selected: !p.selected } : p));
  };

  const handleLevelChange = (id, newLvl) => {
    const parsed = parseFloat(newLvl);
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, level: parsed } : p));
    onSaveLevel(id, parsed);
  };

  const handleTeamToggle = (id, teamNum) => {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, assignedTeam: teamNum } : p));
  };

  const handleAddGuest = (e) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    setParticipants(prev => [
      ...prev,
      {
        id: 'guest_' + Date.now(),
        name: guestName.trim() + ' (Invitado)',
        photo: '',
        level: parseFloat(guestLevel),
        diff: 0,
        trend: 'ESTABLE',
        selected: true,
        isGuest: true,
        dinner: 'SI',
        assignedTeam: 1
      }
    ]);
    setGuestName('');
  };

  const selectedPlayers = participants.filter(p => p.selected);
  const selectedCount = selectedPlayers.length;
  const neededForCourts = (Number(tCourts) || 1) * 4;

  const teamStats = (() => {
    const team1Players = selectedPlayers.filter(p => p.assignedTeam === 1);
    const team2Players = selectedPlayers.filter(p => p.assignedTeam === 2);

    const avgT1 = team1Players.length > 0 
      ? (team1Players.reduce((acc, p) => acc + p.level, 0) / team1Players.length).toFixed(2)
      : '0.00';

    const avgT2 = team2Players.length > 0 
      ? (team2Players.reduce((acc, p) => acc + p.level, 0) / team2Players.length).toFixed(2)
      : '0.00';

    const delta = Math.abs(parseFloat(avgT1) - parseFloat(avgT2)).toFixed(2);

    return { team1Players, team2Players, avgT1, avgT2, delta };
  })();

  const handleGenerateWithGemini = () => {
    if (selectedPlayers.length < 4) return;
    setIsGenerating(true);

    setTimeout(() => {
      const sorted = [...selectedPlayers].sort((a, b) => b.level - a.level);
      const totalRounds = Math.max(1, Math.floor(effectiveDuration / effectiveMatchTime));
      const rounds = [];

      if (tournamentMode === 'pozo') {
        for (let r = 1; r <= totalRounds; r++) {
          const matchesList = [];
          const roundPool = [...sorted];

          for (let c = 1; c <= (Number(tCourts) || 1); c++) {
            if (roundPool.length >= 4) {
              const p1 = roundPool.shift();
              const p2 = roundPool.shift();
              const p3 = roundPool.shift();
              const p4 = roundPool.shift();

              matchesList.push({
                id: `POZO_R${r}_P${c}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                court: c === 1 ? 'Pista 1 👑 (Pista Reina)' : `Pista ${c}`,
                team1: `${p1.name.split(' ')[0]} & ${p4.name.split(' ')[0]}`,
                team2: `${p2.name.split(' ')[0]} & ${p3.name.split(' ')[0]}`,
                courtNum: c,
                rule: c === 1 ? 'Ganadores defienden trono · Perdedores bajan a P2' : `Ganadores suben a Pista ${c - 1} · Perdedores bajan a Pista ${Math.min(c + 1, Number(tCourts) || 1)}`,
                score: '',
                winner: null,
                status: 'PENDIENTE'
              });
            }
          }

          const startMin = (r - 1) * effectiveMatchTime;
          const endMin = r * effectiveMatchTime;
          rounds.push({
            round: r,
            timeLabel: `${Math.floor(startMin / 60)}h${String(startMin % 60).padStart(2, '0')} - ${Math.floor(endMin / 60)}h${String(endMin % 60).padStart(2, '0')}`,
            matches: matchesList
          });
        }
      } else if (tournamentMode === 'americano') {
        for (let r = 1; r <= totalRounds; r++) {
          const matchesList = [];
          const activePool = [...sorted].sort(() => Math.random() - 0.5);

          for (let c = 1; c <= (Number(tCourts) || 1); c++) {
            if (activePool.length >= 4) {
              const p1 = activePool.pop();
              const p2 = activePool.pop();
              const p3 = activePool.pop();
              const p4 = activePool.pop();

              matchesList.push({
                id: `AMER_R${r}_P${c}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                court: `Pista ${c}`,
                team1: `${p1.name.split(' ')[0]} & ${p4.name.split(' ')[0]}`,
                team2: `${p2.name.split(' ')[0]} & ${p3.name.split(' ')[0]}`,
                rule: 'Puntuación individual: cada jugador suma sus juegos ganados.',
                score: '',
                winner: null,
                status: 'PENDIENTE'
              });
            }
          }

          const startMin = (r - 1) * effectiveMatchTime;
          const endMin = r * effectiveMatchTime;
          rounds.push({
            round: r,
            timeLabel: `${Math.floor(startMin / 60)}h${String(startMin % 60).padStart(2, '0')} - ${Math.floor(endMin / 60)}h${String(endMin % 60).padStart(2, '0')}`,
            matches: matchesList
          });
        }
      } else if (tournamentMode === 'eliminatorio') {
        const couples = [];
        for (let i = 0; i < sorted.length; i += 2) {
          if (sorted[i + 1]) {
            couples.push({
              name: `${sorted[i].name.split(' ')[0]} & ${sorted[i + 1].name.split(' ')[0]}`,
              avgLvl: ((sorted[i].level + sorted[i + 1].level) / 2).toFixed(1)
            });
          }
        }

        const groupMatches = [];
        for (let i = 0; i < couples.length - 1; i += 2) {
          groupMatches.push({
            id: `ELIM_G_${i}_${Date.now()}`,
            court: `Pista ${(Math.floor(i / 2) % (Number(tCourts) || 1)) + 1}`,
            team1: `${couples[i].name}`,
            team2: `${couples[i + 1].name}`,
            phase: 'Fase de Grupos',
            score: '',
            winner: null,
            status: 'PENDIENTE'
          });
        }

        rounds.push({
          round: 1,
          timeLabel: 'Fase de Grupos Clasificatoria',
          matches: groupMatches
        });

        rounds.push({
          round: 2,
          timeLabel: 'Semifinales (Cuadro Principal)',
          matches: [
            { id: 'SEMIS_1', court: 'Pista 1', team1: '1º Grupo A', team2: '2º Grupo B', phase: 'Semifinal 1', score: '', winner: null, status: 'PENDIENTE' },
            { id: 'SEMIS_2', court: 'Pista 2', team1: '1º Grupo B', team2: '2º Grupo A', phase: 'Semifinal 2', score: '', winner: null, status: 'PENDIENTE' }
          ]
        });

        rounds.push({
          round: 3,
          timeLabel: 'Gran Final CTC & 3º Puesto',
          matches: [
            { id: 'FINAL_ORO', court: 'Pista 1 (Central)', team1: 'Ganador Semifinal 1', team2: 'Ganador Semifinal 2', phase: 'GRAN FINAL 🏆', score: '', winner: null, status: 'PENDIENTE' },
            { id: 'FINAL_CONSOL', court: 'Pista 2', team1: 'Perdedor Semifinal 1', team2: 'Perdedor Semifinal 2', phase: '3º y 4º Puesto 🥉', score: '', winner: null, status: 'PENDIENTE' }
          ]
        });
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
              const a1 = poolA.pop();
              const a2 = poolA.pop();
              const b1 = poolB.pop();
              const b2 = poolB.pop();

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

          const startMin = (r - 1) * effectiveMatchTime;
          const endMin = r * effectiveMatchTime;
          rounds.push({
            round: r,
            timeLabel: `Cruce Ryder - Ronda ${r}`,
            matches: matchesList
          });
        }
      }

      setGeneratedFixture(rounds);
      setIsGenerating(false);
      setStep(4);
    }, 900);
  };

  const handleLaunchTournament = () => {
    onTournamentCreated({
      id: 'TORNEO_' + Date.now(),
      name: tName,
      mode: tournamentMode,
      date: 'Fin de Semana CTC',
      courts: Number(tCourts) || 1,
      targetPlayers: Number(targetPlayers) || ((Number(tCourts) || 1) * 4),
      duration: effectiveDuration,
      creatorId: currentUserId,
      participants: selectedPlayers,
      rounds: generatedFixture,
      teams: generatedTeams
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
              Paso {step} de 4 · Aislado de liga regular
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl font-bold">&times;</button>
        </div>

        {step === 1 && (
          <div className="space-y-3.5 text-xs">
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex items-start gap-2.5">
              <span className="text-xl shrink-0">🔒</span>
              <div>
                <span className="font-extrabold text-amber-950 text-xs block">
                  Aviso de Privacidad Absoluta
                </span>
                <p className="text-[11px] text-amber-900 mt-0.5 leading-relaxed">
                  Este torneo será <strong>completamente privado</strong>. Los jugadores que <strong>no sean convocados</strong> a este evento <strong>NO verán el torneo</strong> en su aplicación para garantizar la máxima discreción.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Nombre del Torneo</label>
              <input
                type="text"
                value={tName}
                onChange={e => setTName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Formato de Competición</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTournamentMode('pozo')}
                  className={`p-3 rounded-2xl border text-left transition ${
                    tournamentMode === 'pozo' ? 'bg-blue-50 border-blue-600 text-blue-950 ring-2 ring-blue-500' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <span className="text-base block mb-0.5">🔄</span>
                  <span className="font-black block text-xs">Pozo Continuo</span>
                  <span className="text-[10px] opacity-75">Sube y baja dinámico. La Pista 1 es la reina.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTournamentMode('americano')}
                  className={`p-3 rounded-2xl border text-left transition ${
                    tournamentMode === 'americano' ? 'bg-blue-50 border-blue-600 text-blue-950 ring-2 ring-blue-500' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <span className="text-base block mb-0.5">🇺🇸</span>
                  <span className="font-black block text-xs">Torneo Americano</span>
                  <span className="text-[10px] opacity-75">Rotación individual y suma de juegos propios.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTournamentMode('eliminatorio')}
                  className={`p-3 rounded-2xl border text-left transition ${
                    tournamentMode === 'eliminatorio' ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-500' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <span className="text-base block mb-0.5">🥇</span>
                  <span className="font-black block text-xs">Fases Finales</span>
                  <span className="text-[10px] opacity-75">Parejas fijas: Grupos + Semis y Gran Final.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTournamentMode('equipos')}
                  className={`p-3 rounded-2xl border text-left transition ${
                    tournamentMode === 'equipos' ? 'bg-blue-50 border-blue-600 text-blue-950 ring-2 ring-blue-500' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <span className="text-base block mb-0.5">🛡️</span>
                  <span className="font-black block text-xs">Por Equipos (Ryder)</span>
                  <span className="text-[10px] opacity-75">2 Capitanes escogen escuadra y nivelan cruces.</span>
                </button>
              </div>
            </div>

            {/* SELECCIÓN DE PISTAS Y CUPO OBJETIVO DE JUGADORES */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Pistas CTC</label>
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  <button
                    type="button"
                    onClick={() => handleCourtsChange((Number(tCourts) || 1) - 1)}
                    className="w-7 h-7 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-black text-slate-700 text-sm flex items-center justify-center shadow-xs transition active:scale-95"
                  >
                    -
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={tCourts}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '');
                      handleCourtsChange(val === '' ? '' : parseInt(val, 10));
                    }}
                    onBlur={() => {
                      if (!tCourts || Number(tCourts) < 1) handleCourtsChange(1);
                    }}
                    className="w-12 bg-white border border-slate-300 rounded-lg p-1 font-black text-center text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleCourtsChange((Number(tCourts) || 1) + 1)}
                    className="w-7 h-7 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-black text-slate-700 text-sm flex items-center justify-center shadow-xs transition active:scale-95"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold text-slate-500">Jugadores Objetivo</label>
                  <span className="text-[9px] text-blue-600 font-bold">({(Number(tCourts) || 1) * 4} llenan pistas)</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setHasManuallyEditedTarget(true);
                      setTargetPlayers(prev => Math.max(4, (Number(prev) || 4) - 1));
                    }}
                    className="w-7 h-7 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-black text-slate-700 text-sm flex items-center justify-center shadow-xs transition active:scale-95"
                  >
                    -
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={targetPlayers}
                    onChange={e => {
                      setHasManuallyEditedTarget(true);
                      const val = e.target.value.replace(/\D/g, '');
                      setTargetPlayers(val === '' ? '' : Math.max(4, parseInt(val, 10)));
                    }}
                    onBlur={() => {
                      if (!targetPlayers || Number(targetPlayers) < 4) setTargetPlayers((Number(tCourts) || 1) * 4);
                    }}
                    className="w-12 bg-white border border-slate-300 rounded-lg p-1 font-black text-center text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setHasManuallyEditedTarget(true);
                      setTargetPlayers(prev => Math.min(64, (Number(prev) || 4) + 1));
                    }}
                    className="w-7 h-7 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-black text-slate-700 text-sm flex items-center justify-center shadow-xs transition active:scale-95"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* PARÁMETROS FLEXIBLES DE TIEMPO */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Tiempo Total</label>
                <select
                  value={isCustomDuration ? 'custom' : tDuration}
                  onChange={e => {
                    if (e.target.value === 'custom') {
                      setIsCustomDuration(true);
                    } else {
                      setIsCustomDuration(false);
                      setTDuration(parseInt(e.target.value, 10));
                    }
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg p-1.5 font-bold text-center"
                >
                  <option value={45}>45 min</option>
                  <option value={60}>1 hora</option>
                  <option value={75}>1h 15m</option>
                  <option value={90}>1h 30m</option>
                  <option value={105}>1h 45m</option>
                  <option value={120}>2 horas</option>
                  <option value={150}>2h 30m</option>
                  <option value={180}>3 horas</option>
                  <option value={210}>3h 30m</option>
                  <option value={240}>4 horas</option>
                  <option value="custom">✏️ Otro...</option>
                </select>
                {isCustomDuration && (
                  <input
                    type="number"
                    min="20"
                    max="480"
                    placeholder="Minutos"
                    value={customDuration}
                    onChange={e => setCustomDuration(e.target.value)}
                    className="w-full mt-1.5 bg-white border border-blue-400 rounded-lg p-1 font-bold text-center text-[11px]"
                  />
                )}
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Min / Partido</label>
                <select
                  value={isCustomMatchTime ? 'custom' : tMatchTime}
                  onChange={e => {
                    if (e.target.value === 'custom') {
                      setIsCustomMatchTime(true);
                    } else {
                      setIsCustomMatchTime(false);
                      setTMatchTime(parseInt(e.target.value, 10));
                    }
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg p-1.5 font-bold text-center"
                >
                  <option value={10}>10 min</option>
                  <option value={12}>12 min</option>
                  <option value={15}>15 min</option>
                  <option value={20}>20 min</option>
                  <option value={25}>25 min</option>
                  <option value={30}>30 min</option>
                  <option value={35}>35 min</option>
                  <option value={40}>40 min</option>
                  <option value={45}>45 min</option>
                  <option value="custom">✏️ Otro...</option>
                </select>
                {isCustomMatchTime && (
                  <input
                    type="number"
                    min="5"
                    max="90"
                    placeholder="Minutos"
                    value={customMatchTime}
                    onChange={e => setCustomMatchTime(e.target.value)}
                    className="w-full mt-1.5 bg-white border border-blue-400 rounded-lg p-1 font-bold text-center text-[11px]"
                  />
                )}
              </div>
            </div>

            <div className="bg-blue-50/70 border border-blue-200 p-2.5 rounded-xl text-center">
              <span className="text-[11px] font-extrabold text-blue-950 block">
                📊 Proyección: ~{estimatedRounds} rondas de juego
              </span>
              <span className="text-[10px] text-blue-800">
                {effectiveDuration} min totales · {effectiveMatchTime} min/partido · {Number(tCourts) || 1} pistas disponibles
              </span>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition mt-2"
            >
              Siguiente: Convocatoria y Nivelación →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3.5 text-xs">
            {/* CONTADOR EN VIVO DE CONVOCADOS VS OBJETIVO */}
            <div className={`p-3 rounded-2xl border text-center transition flex justify-between items-center ${
              selectedCount < neededForCourts
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : selectedCount === Number(targetPlayers)
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-blue-50 border-blue-300 text-blue-950'
            }`}>
              <div className="text-left">
                <span className="font-black text-sm block">
                  {selectedCount} / {targetPlayers} seleccionados
                </span>
                <span className="text-[10px] font-semibold opacity-85">
                  {selectedCount < neededForCourts
                    ? `⚠️ Faltan ${neededForCourts - selectedCount} para completar las ${tCourts} pistas`
                    : selectedCount === Number(targetPlayers)
                    ? '✓ Cupo exacto completado'
                    : selectedCount > neededForCourts
                    ? `✓ ${selectedCount - neededForCourts} jugadores para rotación/descanso`
                    : 'Pistas completas'}
                </span>
              </div>
              <span className="text-2xl">
                {selectedCount >= neededForCourts ? '🎾' : '⏳'}
              </span>
            </div>

            <form onSubmit={handleAddGuest} className="bg-blue-50/80 p-3 rounded-2xl border border-blue-200 space-y-2">
              <label className="font-extrabold text-blue-950 block text-[11px]">
                ➕ Añadir Participante Invitado (Externo)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Nombre y Apellido"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  className="flex-1 bg-white border border-blue-300 rounded-xl p-2 text-xs font-semibold"
                />
                <StarRating value={guestLevel} onChange={setGuestLevel} />
                <button type="submit" className="bg-blue-600 text-white font-bold px-3 py-2 rounded-xl text-xs">
                  Añadir
                </button>
              </div>
            </form>

            {tournamentMode === 'equipos' && (
              <div className="bg-slate-900 text-white p-3.5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase text-amber-400">
                    👑 Selección de Capitanes & Balance
                  </span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    parseFloat(teamStats.delta) <= 0.2 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    Δ {teamStats.delta} {parseFloat(teamStats.delta) <= 0.2 ? '✓ Equilibrado' : '⚠️ Desnivelado'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-slate-800">
                  <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-300 space-y-1">
                    <span className="text-[10px] font-black text-blue-900 uppercase block">Capitán Azul 🔵</span>
                    <select
                      value={captain1Id}
                      onChange={e => setCaptain1Id(e.target.value)}
                      className="w-full bg-white border border-blue-300 rounded-lg p-1 text-[11px] font-bold"
                    >
                      {selectedPlayers.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <div className="flex justify-between items-center text-[10px] font-bold text-blue-950 pt-1">
                      <span>{teamStats.team1Players.length} jugadores</span>
                      <span className="bg-blue-200 px-1.5 py-0.5 rounded text-blue-900">★ {teamStats.avgT1}</span>
                    </div>
                  </div>

                  <div className="bg-red-50 p-2.5 rounded-xl border border-red-300 space-y-1">
                    <span className="text-[10px] font-black text-red-900 uppercase block">Capitán Rojo 🔴</span>
                    <select
                      value={captain2Id}
                      onChange={e => setCaptain2Id(e.target.value)}
                      className="w-full bg-white border border-red-300 rounded-lg p-1 text-[11px] font-bold"
                    >
                      {selectedPlayers.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <div className="flex justify-between items-center text-[10px] font-bold text-red-950 pt-1">
                      <span>{teamStats.team2Players.length} jugadores</span>
                      <span className="bg-red-200 px-1.5 py-0.5 rounded text-red-900">★ {teamStats.avgT2}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-1">
              <div>
                <span className="font-black text-slate-800 uppercase text-[11px] block">
                  Lista de Jugadores
                </span>
                <span className="text-[9px] text-slate-400">Nivel de torneos calibrado (oculto en perfil público)</span>
              </div>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {participants.map(p => (
                <div
                  key={p.id}
                  className={`p-2 rounded-xl border flex flex-col gap-1.5 transition ${
                    p.selected ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={p.selected}
                        onChange={() => handleTogglePlayer(p.id)}
                        className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                      />
                      <UserAvatar name={p.name} photo={p.photo} size="xs" />
                      <div>
                        <span className="font-bold text-slate-800 text-[11px] truncate max-w-[130px] block">{p.name}</span>
                        {p.diff !== 0 && (
                          <span className={`text-[9px] font-bold ${p.diff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {p.diff > 0 ? `▲ +${p.diff} sugerido torneo` : `▼ ${p.diff} sugerido torneo`}
                          </span>
                        )}
                      </div>
                    </div>

                    {p.selected && (
                      <StarRating value={p.level} onChange={(lvl) => handleLevelChange(p.id, lvl)} />
                    )}
                  </div>

                  {tournamentMode === 'equipos' && p.selected && (
                    <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-100">
                      <span className="text-[9px] font-bold text-slate-400">Escuadra:</span>
                      <button
                        type="button"
                        onClick={() => handleTeamToggle(p.id, 1)}
                        className={`px-2 py-0.5 rounded text-[10px] font-black transition ${
                          p.assignedTeam === 1 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        🔵 Azul
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTeamToggle(p.id, 2)}
                        className={`px-2 py-0.5 rounded text-[10px] font-black transition ${
                          p.assignedTeam === 2 ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        🔴 Rojo
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep(1)} className="flex-1 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl">
                ← Volver
              </button>
              <button onClick={() => setStep(3)} className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-xl">
                Configurar con Gemini →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3.5 text-xs">
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3.5 space-y-2">
              <h4 className="font-black text-purple-950 text-xs flex items-center gap-1">
                <span>✨</span> Motor de Cruces Inteligente para {tournamentMode.toUpperCase()}
              </h4>
              <p className="text-[11px] text-purple-900 leading-relaxed">
                Gemini procesará las reglas oficiales del formato, el número de pistas y la nivelación por estrellas de los{' '}
                <strong>{selectedPlayers.length} jugadores</strong> convocados.
              </p>
              <div className="bg-white/80 p-2 rounded-xl text-[10px] font-mono text-purple-900 border border-purple-200">
                Duración total: {effectiveDuration} min | Por partido: {effectiveMatchTime} min | Pistas: {Number(tCourts) || 1} | Rondas estimadas: ~{estimatedRounds}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-bold text-slate-700 text-[11px]">
                  Reglas Oficiales inyectadas en el algoritmo (Editables):
                </label>
                <button
                  type="button"
                  onClick={() => setCustomGeminiRules(OFFICIAL_TOURNAMENT_RULES[tournamentMode] || '')}
                  className="text-[10px] text-purple-700 underline font-semibold"
                >
                  Restablecer
                </button>
              </div>
              <textarea
                rows={6}
                value={customGeminiRules}
                onChange={e => setCustomGeminiRules(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-[11px] font-mono leading-tight text-slate-800"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep(2)} className="flex-1 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl">
                ← Volver
              </button>
              <button
                onClick={handleGenerateWithGemini}
                disabled={isGenerating}
                className="flex-1 py-2 bg-linear-to-r from-purple-600 to-blue-600 text-white font-bold rounded-xl shadow-xs flex items-center justify-center gap-1.5"
              >
                {isGenerating ? (
                  <>
                    <span className="animate-spin text-sm">🔄</span>
                    <span>Calculando cuadrante...</span>
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    <span>Generar Cruces</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3.5 text-xs">
            <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-center justify-between">
              <div>
                <span className="font-black text-emerald-900 text-xs block">
                  ✅ Cuadrante Listo ({tournamentMode.toUpperCase()})
                </span>
                <span className="text-[10px] text-emerald-700">
                  {generatedFixture.length} rondas generadas en {Number(tCourts) || 1} pistas
                </span>
              </div>
              <button onClick={() => setStep(3)} className="text-[10px] bg-white border border-emerald-300 text-emerald-800 font-bold px-2 py-0.5 rounded-md">
                Re-calcular
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {generatedFixture.map(r => (
                <div key={r.round} className="bg-slate-50 p-2 rounded-xl border border-slate-200 space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-slate-500">
                    <span className="uppercase text-slate-900">{r.phase || `Ronda ${r.round}`}</span>
                    <span>⏱️ {r.timeLabel}</span>
                  </div>
                  {r.matches.map((m, mIdx) => (
                    <div key={mIdx} className="bg-white p-1.5 rounded-lg border border-slate-200 flex justify-between items-center text-[10px]">
                      <span className="bg-purple-50 text-purple-700 font-bold px-1.5 py-0.5 rounded">{m.court}</span>
                      <span className="truncate max-w-[110px] font-semibold">{m.team1}</span>
                      <span className="text-slate-400 font-bold">vs</span>
                      <span className="truncate max-w-[110px] font-semibold">{m.team2}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200 flex justify-between items-center">
              <div>
                <span className="font-extrabold text-amber-950 text-xs block">🍻 3º Tiempo del Torneo</span>
                <p className="text-[10px] text-amber-800">Mesa con confirmación individual.</p>
              </div>
              <span className="text-xs bg-amber-100 text-amber-900 font-black px-2 py-0.5 rounded-lg">
                {selectedPlayers.length} a cenar
              </span>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep(1)} className="flex-1 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl">
                Reiniciar
              </button>
              <button
                onClick={handleLaunchTournament}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs"
              >
                🚀 Iniciar Torneo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MatchVisualScoreModal({ isOpen, onClose, title, subtitle, team1Name, team2Name, p1Players = [], p2Players = [], onSaveScore }) {
  const [winnerTeam, setWinnerTeam] = useState(1);

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

      let setsT1 = 0;
      let setsT2 = 0;
      updated.forEach(s => {
        if (s.t1 >= 6 || s.t2 >= 6) {
          if (s.t1 > s.t2) setsT1++;
          if (s.t2 > s.t1) setsT2++;
        }
      });
      if (setsT1 > setsT2) setWinnerTeam(1);
      else if (setsT2 > setsT1) setWinnerTeam(2);

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

    const playedSets = sets.filter(s => s.t1 > 0 || s.t2 > 0);
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
              1. Pareja Ganadora (Obligatorio) *
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
                  {winnerTeam === 1 && <span className="text-[10px] font-black text-blue-600">🏆 GANADORES</span>}
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
                  {winnerTeam === 2 && <span className="text-[10px] font-black text-amber-600">🏆 GANADORES</span>}
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
            Enlaza el texto <strong>"{slotName}"</strong> con su perfil oficial de Google Sheets para que sus victorias y puntos se computen.
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

// ==========================================
// APLICACIÓN PRINCIPAL
// ==========================================
export default function App() {
  const [apiUrl] = useState(() => localStorage.getItem('padel_api_url') || DEFAULT_API_URL);
  const [syncing, setSyncing] = useState(false);
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
  const [newUserName, setNewUserName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserGroup, setNewUserGroup] = useState('Chicos');
  const [newUserPlaytomic, setNewUserPlaytomic] = useState('');
  const [newUserPin, setNewUserPin] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [playtomicText, setPlaytomicText] = useState('');

  const [showReloadPlaytomicModal, setShowReloadPlaytomicModal] = useState(false);
  const [reloadPlaytomicText, setReloadPlaytomicText] = useState('');

  const [showEditPlayersModal, setShowEditPlayersModal] = useState(false);
  const [editPlayerSlots, setEditPlayerSlots] = useState(['', '', '', '']);

  const [showScoreModal, setShowScoreModal] = useState(false);
  const [linkingSlot, setLinkingSlot] = useState(null);
  const [allDinnerGuests, setAllDinnerGuests] = useState([]);

  const [loadingDinnerId, setLoadingDinnerId] = useState(null);

  const [showTournamentWizard, setShowTournamentWizard] = useState(false);
  const [activeTournaments, setActiveTournaments] = useState(() => {
    const saved = localStorage.getItem('padel_ctc_tournaments');
    return saved ? JSON.parse(saved) : [];
  });

  const [reportingTournamentMatch, setReportingTournamentMatch] = useState(null);
  const [activeTournamentId, setActiveTournamentId] = useState(null);
  const [tournamentSubTab, setTournamentSubTab] = useState({});

  // PARÁMETROS URL: ?torneo=ID y ?p=ID_JUGADOR (Acceso personal individual)
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

  const isThursdayMember = useMemo(() => {
    if (!currentUser) return false;
    const g = (currentUser.group || '').toLowerCase();
    return g === 'chicos';
  }, [currentUser]);

  useEffect(() => {
    if (currentUser && !isThursdayMember) {
      setActiveTab('torneos');
    }
  }, [currentUser, isThursdayMember]);

  const fetchData = async (silent = false) => {
    try {
      if (!silent) setSyncing(true);
      const res = await fetch(apiUrl, { method: 'GET', redirect: 'follow' });
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
        if (json.invitadosCena) {
          setAllDinnerGuests(json.invitadosCena);
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

  const handleRegisterUser = async (e) => {
    e.preventDefault();
    if (!newUserName.trim()) return;
    if (newUserPin.trim().length !== 4) return;

    setSyncing(true);
    const assignedGroup = newUserGroup === 'Solo Torneo' ? 'torneo' : newUserGroup;

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'REGISTRAR_JUGADOR',
          nombre: newUserName.trim(),
          telefono: newUserPhone.trim(),
          grupo: assignedGroup,
          playtomic: newUserPlaytomic.trim(),
          pin: newUserPin.trim()
        })
      });
      const json = await res.json();
      if (json.ok) {
        const createdUser = {
          id: json.id || 'u' + (players.length + 1),
          name: newUserName.trim(),
          phone: newUserPhone.trim(),
          group: assignedGroup.toLowerCase(),
          photo: '',
          level: 3.5,
          pJ: 0, pG: 0, cSi: 0, cNo: 0,
          ptsDeportivo: 0, ptsBarandas: 0, hibrido: 0,
          titulo: assignedGroup === 'torneo' ? 'Jugador de Torneo ⚔️' : "Fichaje Estrella ⭐",
          deuda: 0,
          pin: newUserPin.trim()
        };
        handlePinSuccess(createdUser);
        setShowRegisterForm(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
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

  const handleAddPlaytomicMatch = async (e) => {
    e.preventDefault();
    if (!playtomicText.trim()) return;

    setSyncing(true);
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'CREAR_PARTIDO_PLAYTOMIC', textoCrudo: playtomicText, grupo: myGroup })
      });
      const data = await res.json();
      if (data.ok) {
        setShowAddModal(false);
        setPlaytomicText('');
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

  const handleToggleSoloCena = async (dateStr, newState) => {
    if (!currentUser) return;
    const normMe = normalizeName(currentUser.name);

    setAllDinnerGuests(prev => {
      const filtered = prev.filter(g => !(normalizeName(g.name) === normMe && (extractCleanDate(g.target) === dateStr || extractCleanDate(dateStr).includes(extractCleanDate(g.target)))));
      if (newState === 'SI') {
        filtered.push({
          id: currentUser.id || ('INV-' + Date.now()),
          name: currentUser.name,
          target: dateStr,
          cleanTarget: extractCleanDate(dateStr),
          group: myGroup,
          photo: currentUser.photo || '',
          phone: currentUser.phone || '',
          isClubPlayer: true
        });
      }
      return filtered;
    });

    setMatches(prev => prev.map(m => {
      if (extractCleanDate(m.date) !== dateStr) return m;
      const guests = [...(m.guests || [])].filter(g => normalizeName(g.name) !== normMe);
      if (newState === 'SI') {
        guests.push({
          id: currentUser.id || ('INV-' + Date.now()),
          name: currentUser.name,
          photo: currentUser.photo || '',
          phone: currentUser.phone || '',
          isClubPlayer: true
        });
      }
      return { ...m, guests: guests };
    }));

    try {
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ 
          action: 'APUNTARSE_SOLO_CENA', 
          fecha: dateStr, 
          nombreJugador: currentUser.name, 
          estado: newState,
          idJugador: currentUser.id,
          grupo: myGroup 
        })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateDinner = async (matchId, targetId, targetName, newStatus) => {
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

    try {
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ 
          action: 'ACTUALIZAR_CENA', 
          idPartido: matchId, 
          idJugador: targetId, 
          nombreJugador: targetName, 
          estado: newStatus 
        })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleTeam = async (matchId, playerId) => {
    let newTeam = 1;
    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;
      return {
        ...m,
        players: m.players.map(p => {
          if (p.id === playerId) {
            newTeam = p.team === 1 ? 2 : 1;
            return { ...p, team: newTeam };
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
          action: 'CAMBIAR_PAREJA_JUGADOR',
          idPartido: matchId,
          idJugador: playerId,
          team: newTeam
        })
      });
    } catch (e) {
      console.warn('Error sincronizando pareja:', e);
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

    try {
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'GUARDAR_RESULTADO',
          idPartido: currentMatch.id,
          marcador: composedScoreText,
          ganadorIds: ganadorIds,
          ganadorNombres: ganadorNombres,
          parejas: parejasMap,
          reiniciar: false
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

  const handleTournamentCreated = (newT) => {
    const updated = [newT, ...activeTournaments];
    setActiveTournaments(updated);
    localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updated));
    setActiveTab('torneos');
  };

  const handleDeleteTournament = (tId) => {
    const updated = activeTournaments.filter(t => t.id !== tId);
    setActiveTournaments(updated);
    localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updated));
  };

  // GENERAR ENLACE PERSONAL PARA CADA JUGADOR DEL TORNEO (?torneo=ID&p=PLAYER_ID)
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

  const handleShareTournamentLink = (tournamentItem) => {
    const link = `${window.location.origin}${window.location.pathname}?torneo=${tournamentItem.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link);
    } else {
      const msg = `🏆 *Torneo CTC - ${tournamentItem.name}*\nAccede directamente a los cruces y cena aquí: ${link}`;
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
    }
  };

  const handleSaveTournamentScore = (winningTeamNum, composedScoreText) => {
    if (!activeTournamentId || !reportingTournamentMatch) return;
    const matchId = reportingTournamentMatch.id;

    setActiveTournaments(prevTournaments => {
      const updated = prevTournaments.map(t => {
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

        return {
          ...t,
          rounds: updatedRounds,
          teams: updatedTeams
        };
      });

      localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updated));
      return updated;
    });

    setReportingTournamentMatch(null);
  };

  const handleUpdateTournamentDinner = (tId, participantId, newDinnerStatus) => {
    setActiveTournaments(prev => {
      const updated = prev.map(t => {
        if (t.id !== tId) return t;
        return {
          ...t,
          participants: (t.participants || []).map(p => {
            if (p.id === participantId) {
              return { ...p, dinner: newDinnerStatus };
            }
            return p;
          })
        };
      });
      localStorage.setItem('padel_ctc_tournaments', JSON.stringify(updated));
      return updated;
    });
  };

  const handleShareTournamentDinnerWhatsapp = (tournamentItem) => {
    const attendingCount = (tournamentItem.participants || []).filter(p => p.dinner === 'SI').length;
    const msg = `Hola, para cenar tras el ${tournamentItem.name} seremos un total de ${attendingCount} personas. Muchas gracias.`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURI(msg)}`, '_blank');
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
      return isParticipant || isCreator;
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

  const activeDinnerKey = selectedDinnerDate || defaultSmartDinnerKey;

  const matchesForDinner = useMemo(() => {
    if (!activeDinnerKey) return [];
    return groupMatches.filter(m => extractCleanDate(m.date) === activeDinnerKey);
  }, [groupMatches, activeDinnerKey]);

  const { dinnerYes, dinnerNo, dinnerPending, dinnerGuests } = useMemo(() => {
    const yesMap = new Map();
    const noMap = new Map();
    const pendingMap = new Map();
    const guestMap = new Map();

    matchesForDinner.forEach(m => {
      (m.players || []).forEach(p => {
        const normKey = normalizeName(p.name);
        const playerObj = { name: p.name, photo: p.photo, phone: p.phone, id: p.id };

        if (p.dinner === 'SI') {
          yesMap.set(normKey, playerObj);
          pendingMap.delete(normKey);
          noMap.delete(normKey);
        } else if (p.dinner === 'NO') {
          noMap.set(normKey, playerObj);
          pendingMap.delete(normKey);
          yesMap.delete(normKey);
        } else {
          if (!yesMap.has(normKey) && !noMap.has(normKey)) {
            pendingMap.set(normKey, playerObj);
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
      const isDateMatch = extractCleanDate(g.target) === activeDinnerKey || 
                          extractCleanDate(g.cleanTarget) === activeDinnerKey ||
                          activeDinnerKey.includes(extractCleanDate(g.target));
      const isGroupMatch = (g.group || 'chicos').toLowerCase() === myGroup;
      if (isDateMatch && isGroupMatch) {
        const normG = normalizeName(g.name);
        if (!guestMap.has(normG)) {
          guestMap.set(normG, g);
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

  // ONBOARDING DE INVITADO DIRECTO (?torneo=ID&p=PLAYER_ID o ?torneo=ID)
  const invitedTournament = useMemo(() => {
    if (!inviteTournamentId) return null;
    return activeTournaments.find(t => t.id === inviteTournamentId) || null;
  }, [inviteTournamentId, activeTournaments]);

  const invitedPlayerSlot = useMemo(() => {
    if (!invitedTournament || !invitePlayerId) return null;
    return (invitedTournament.participants || []).find(p => p.id === invitePlayerId) || null;
  }, [invitedTournament, invitePlayerId]);

  if (!currentUser) {
    // 1. Acceso con enlace personal individual (?torneo=ID&p=PLAYER_ID)
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

    // 2. Acceso con enlace de torneo general (?torneo=ID sin jugador específico)
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

    // 3. Login General del Club
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
            <form onSubmit={handleRegisterUser} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Nombre y Apellido *</label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Ej: Marcos Iglesias"
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl p-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Teléfono Móvil (WhatsApp) *</label>
                <input
                  type="tel"
                  required
                  value={newUserPhone}
                  onChange={(e) => setNewUserPhone(e.target.value)}
                  placeholder="Ej: 600123456"
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl p-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">¿A qué grupo perteneces?</label>
                <div className="flex gap-2">
                  {[
                    { key: 'Chicos', label: 'Chicos (Jueves)' },
                    { key: 'Solo Torneo', label: 'Solo Torneo' }
                  ].map(g => (
                    <button
                      type="button"
                      key={g.key}
                      onClick={() => setNewUserGroup(g.key)}
                      className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${
                        newUserGroup === g.key
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-700 text-slate-300 border-slate-600'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Crea tu PIN de 4 cifras (seguridad) *</label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={newUserPin}
                  onChange={(e) => setNewUserPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ej: 1234"
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl p-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-bold tracking-widest text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Usuario de Playtomic (opcional)</label>
                <input
                  type="text"
                  value={newUserPlaytomic}
                  onChange={(e) => setNewUserPlaytomic(e.target.value)}
                  placeholder="Ej: marcos-padel"
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl p-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterForm(false)}
                  className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs font-bold transition"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={syncing}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg transition"
                >
                  {syncing ? 'Guardando...' : 'Crear y Entrar'}
                </button>
              </div>
            </form>
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
          /* DETALLE DEL PARTIDO REGULAR (JUEVES) */
          <div className="space-y-4">
            <button
              onClick={() => setSelectedMatchId(null)}
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
            >
              ← Volver a la lista de partidos
            </button>

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

                  {(() => {
                    const { canReport } = parseMatchTiming(currentMatch.date);
                    return (
                      <button
                        disabled={!canReport || currentMatch.status === 'CANCELADO'}
                        onClick={() => setShowScoreModal(true)}
                        className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1 border transition ${
                          !canReport || currentMatch.status === 'CANCELADO'
                            ? 'opacity-40 bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                            : 'border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100'
                        }`}
                      >
                        🏆 Marcador
                      </button>
                    );
                  })()}
                </div>
              </div>

              <h2 className="text-xl font-black text-slate-900 mt-1">{currentMatch.date}</h2>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                📍 {currentMatch.location}
              </p>

              {currentMatch.status === 'FINALIZADO' && (
                <div className="bg-purple-50/80 border border-purple-200 rounded-2xl p-3.5 text-center my-3.5 space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 block">
                    Marcador Final Oficial
                  </span>
                  <div className="inline-block bg-purple-900 text-white font-mono font-black text-sm px-3.5 py-1 rounded-xl shadow-xs">
                    {currentMatch.score || 'Finalizado'}
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

              {/* CONVOCATORIA DE PAREJAS */}
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
                  const teamPlayers = (currentMatch.players || []).filter(p => (p.team || 1) === teamNum);
                  const isP1 = teamNum === 1;
                  const isFinalizado = currentMatch.status === 'FINALIZADO';
                  const isWinningTeam = isFinalizado && teamPlayers.some(p => p.won === 'SI');

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
                        <span className="text-[10px] text-slate-400 font-medium">Pulsa P1/P2 para mover</span>
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
                                <button
                                  onClick={() => handleToggleTeam(currentMatch.id, p.id)}
                                  className="text-[10px] font-black bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded"
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

              {/* PREGUNTA RÁPIDA DE CENA */}
              {(() => {
                const isOfficial = isMatchOfficial(currentMatch);
                const mySlot = (currentMatch.players || []).find(p => p.id === currentUser.id || normalizeName(p.name) === normalizeName(currentUser.name));
                if (!mySlot) return null;
                const isProcessing = loadingDinnerId === (mySlot.id || mySlot.name);

                if (!isOfficial) {
                  return (
                    <div className="mt-5 pt-3 border-t border-slate-100 text-center">
                      <span className="text-[11px] text-slate-500 font-semibold italic block">
                        ℹ️️ Este partido es amistoso. Las cenas y puntos oficiales se computan exclusivamente los {currentMatch.grupo === 'chicas' ? 'Martes (Chicas)' : 'Jueves (Chicos)'}.
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
                        ME RAJO 🏃‍♂
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
                    <p className="text-xs text-slate-400 mt-1">
                      {filterTime === 'semana'
                        ? 'No hay partidos programados entre este lunes y domingo. Prueba en "⏳ Próximos".'
                        : 'No se encontraron partidos con este filtro.'}
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
                                {p1.length === 0 && <span className="text-slate-400 italic text-[10px]">Sin asignar</span>}
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
                                {p2.length === 0 && <span className="text-slate-400 italic text-[10px]">Sin asignar</span>}
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
                    {pastDinnerDates.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowDinnerHistory(!showDinnerHistory)}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md transition"
                      >
                        {showDinnerHistory ? 'Ocultar pasadas' : `📁 Ver histórico (${pastDinnerDates.length})`}
                      </button>
                    )}
                  </div>

                  <select
                    value={activeDinnerKey}
                    onChange={(e) => setSelectedDinnerDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800"
                  >
                    {upcomingDinnerDates.length > 0 ? (
                      <optgroup label="⚡ Cenas Activas / Próximas">
                        {upcomingDinnerDates.map(d => (
                          <option key={d.key} value={d.key}>
                            {d.label} {d.key === defaultSmartDinnerKey ? '★ (Siguiente recomendada)' : ''}
                          </option>
                        ))}
                      </optgroup>
                    ) : (
                      <optgroup label="⚡ Cenas Activas">
                        <option value="">No hay cenas pendientes programadas</option>
                      </optgroup>
                    )}

                    {(showDinnerHistory || upcomingDinnerDates.length === 0) && pastDinnerDates.length > 0 && (
                      <optgroup label="📁 Histórico de Cenas Pasadas">
                        {pastDinnerDates.map(d => (
                          <option key={d.key} value={d.key}>{d.label} (Pasada)</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
                  <p className="text-xs font-black text-blue-900 mb-2">
                    ¿No juegas hoy pero te vienes a cenar? 🍻
                  </p>
                  <button
                    onClick={() => handleToggleSoloCena(activeDinnerKey, isUserInDinner ? 'NO' : 'SI')}
                    className={`py-2 px-4 rounded-xl text-xs font-bold transition shadow-xs ${
                      isUserInDinner
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {isUserInDinner ? '✓ Apuntado a la cena (Clic para borrarte)' : '+ ¡Me apunto a cenar sin jugar!'}
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
                        {dinnerYes.length === 0 && dinnerGuests.length === 0 && (
                          <span className="text-slate-400 italic text-[11px]">Nadie confirmado aún</span>
                        )}
                      </div>
                    </div>

                    <div>
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
                            className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 text-rose-950 px-2.5 py-1 rounded-xl font-semibold text-xs cursor-pointer hover:bg-rose-100 transition"
                          >
                            <UserAvatar name={item.name} photo={item.photo} size="sm" />
                            <span>{item.name}</span>
                          </div>
                        ))}
                        {dinnerNo.length === 0 && (
                          <span className="text-slate-400 italic text-[11px]">Nadie se ha rajado aún 🎉</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="font-extrabold text-amber-800 block mb-2">
                        🟡 Sin responder ({dinnerPending.length}):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {dinnerPending.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-950 px-2.5 py-1 rounded-xl font-semibold text-xs"
                          >
                            <div onClick={() => {
                              const found = players.find(u => normalizeName(u.name) === normalizeName(item.name));
                              setInspectedUser(found || item);
                            }} className="cursor-pointer">
                              <UserAvatar name={item.name} photo={item.photo} size="sm" />
                            </div>
                            <span>{item.name}</span>
                            <button
                              onClick={() => handleNotifyPendingWhatsApp(item, currentVisualDinnerLabel)}
                              className="ml-1 bg-emerald-600 hover:bg-emerald-700 text-white px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5"
                              title="Avisar por WhatsApp directo"
                            >
                              📲
                            </button>
                          </div>
                        ))}
                        {dinnerPending.length === 0 && (
                          <span className="text-slate-400 italic text-[11px]">¡Todos han respondido!</span>
                        )}
                      </div>
                    </div>
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
                      title="Toca para ver estadísticas"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`font-black w-6 text-center text-sm ${
                          idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-amber-700' : 'text-slate-400 text-xs'
                        }`}>
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
                        title="Toca para ver estadísticas"
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
                <div className="bg-linear-to-r from-purple-700 to-indigo-800 rounded-3xl p-5 text-white shadow-md">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-[10px] uppercase font-black bg-white/20 px-2 py-0.5 rounded-md tracking-wider">
                        Modo Torneo Aislado
                      </span>
                      <h2 className="text-xl font-black mt-1">Torneos Especiales CTC</h2>
                      <p className="text-xs text-purple-200 mt-0.5">
                        Privados para convocados. Sin interferir en rankings ni bote regular.
                      </p>
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
                  <div className="flex justify-between items-center px-1">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                      Tus Torneos Convocados
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">{visibleTournaments.length} eventos</span>
                  </div>

                  {visibleTournaments.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
                      <span className="text-3xl block mb-1">🛡️</span>
                      <p className="text-sm font-bold text-slate-700">No tienes torneos activos</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Solo verás los torneos a los que has sido convocado. Pulsa en "Crear Nuevo Torneo" para convocar uno nuevo.
                      </p>
                    </div>
                  ) : (
                    visibleTournaments.map(t => {
                      const curSubTab = tournamentSubTab[t.id] || 'partidos';
                      const myParticipation = (t.participants || []).find(
                        p => p.id === currentUser?.id || normalizeName(p.name) === normalizeName(currentUser?.name)
                      );
                      const totalDinners = (t.participants || []).filter(p => p.dinner === 'SI').length;

                      return (
                        <div key={t.id} className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-lg border border-purple-200">
                                {t.mode === 'pozo' ? 'Pozo Continuo' : t.mode === 'americano' ? 'Americano' : t.mode === 'eliminatorio' ? 'Fases Finales' : 'Por Equipos (Ryder)'} · {t.courts} pistas
                              </span>
                              <h3 className="text-base font-black text-slate-900 mt-1">{t.name}</h3>
                              <p className="text-xs text-slate-500 font-semibold">
                                👥 {t.participants.length} participantes · ⏰ {t.duration} min · 🍻 {totalDinners} a cenar
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleShareTournamentLink(t)}
                                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200"
                                title="Copiar enlace general para participantes"
                              >
                                🔗 Link General
                              </button>
                              <button
                                onClick={() => handleDeleteTournament(t.id)}
                                className="text-[11px] font-bold text-rose-500 hover:text-rose-700 p-1 rounded-lg hover:bg-rose-50"
                                title="Eliminar torneo"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>

                          <div className="flex bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
                            <button
                              onClick={() => setTournamentSubTab(prev => ({ ...prev, [t.id]: 'partidos' }))}
                              className={`flex-1 py-1.5 rounded-lg transition ${
                                curSubTab === 'partidos' ? 'bg-white shadow text-purple-800' : 'text-slate-600'
                              }`}
                            >
                              ⚔️ Partidos & Marcadores
                            </button>
                            <button
                              onClick={() => setTournamentSubTab(prev => ({ ...prev, [t.id]: 'jugadores' }))}
                              className={`flex-1 py-1.5 rounded-lg transition ${
                                curSubTab === 'jugadores' ? 'bg-white shadow text-blue-800' : 'text-slate-600'
                              }`}
                            >
                              📲 Invitar ({t.participants.length})
                            </button>
                            <button
                              onClick={() => setTournamentSubTab(prev => ({ ...prev, [t.id]: 'cena' }))}
                              className={`flex-1 py-1.5 rounded-lg transition ${
                                curSubTab === 'cena' ? 'bg-white shadow text-amber-900' : 'text-slate-600'
                              }`}
                            >
                              🍻 3º Tiempo ({totalDinners})
                            </button>
                          </div>

                          {/* SUBTAB 1: PARTIDOS & MARCADORES */}
                          {curSubTab === 'partidos' && (
                            <div className="space-y-2.5">
                              {t.mode === 'equipos' && t.teams && t.teams.length === 2 && (
                                <div className="bg-slate-900 text-white rounded-2xl p-3 flex justify-around items-center">
                                  <div className="text-center">
                                    <span className="text-[10px] text-blue-300 font-bold block">{t.teams[0].name}</span>
                                    <span className="text-2xl font-black text-blue-400">{t.teams[0].score || 0}</span>
                                  </div>
                                  <span className="text-xs font-black text-slate-500">VS</span>
                                  <div className="text-center">
                                    <span className="text-[10px] text-red-300 font-bold block">{t.teams[1].name}</span>
                                    <span className="text-2xl font-black text-rose-400">{t.teams[1].score || 0}</span>
                                  </div>
                                </div>
                              )}

                              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                {t.rounds.map(r => (
                                  <div key={r.round} className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200/80 space-y-1.5">
                                    <div className="flex justify-between text-[10px] font-bold text-slate-500 pb-1 border-b border-slate-200/70">
                                      <span className="font-black text-slate-900 uppercase">
                                        {r.phase || `Ronda ${r.round}`}
                                      </span>
                                      <span>⏱️ {r.timeLabel}</span>
                                    </div>

                                    {r.matches.map((m, mIdx) => (
                                      <div
                                        key={m.id || mIdx}
                                        onClick={() => {
                                          setActiveTournamentId(t.id);
                                          setReportingTournamentMatch(m);
                                        }}
                                        className="bg-white p-2.5 rounded-xl border border-slate-200 hover:border-purple-300 cursor-pointer shadow-2xs transition flex flex-col gap-1"
                                      >
                                        <div className="flex items-center justify-between text-[11px] font-bold">
                                          <span className="text-[9px] bg-purple-50 text-purple-700 font-black px-1.5 py-0.5 rounded">
                                            {m.court}
                                          </span>

                                          <div className="flex items-center gap-1.5 truncate">
                                            <span className={`truncate max-w-[95px] ${m.winner === 1 ? 'text-emerald-700 font-black' : 'text-slate-800'}`}>
                                              {m.team1}
                                            </span>
                                            <span className="text-[9px] text-slate-300 font-black">vs</span>
                                            <span className={`truncate max-w-[95px] ${m.winner === 2 ? 'text-emerald-700 font-black' : 'text-slate-800'}`}>
                                              {m.team2}
                                            </span>
                                          </div>

                                          <span className={`text-[10px] px-2 py-0.5 rounded font-black ${
                                            m.status === 'FINALIZADO'
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : 'bg-slate-100 text-slate-500 hover:bg-purple-100 hover:text-purple-800'
                                          }`}>
                                            {m.status === 'FINALIZADO' ? (m.score || '✓ Fin') : 'Poner resultado ✍️'}
                                          </span>
                                        </div>
                                        {m.rule && <span className="text-[9px] text-slate-400 italic block">{m.rule}</span>}
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* SUBTAB 2: LISTA DE JUGADORES Y ENVÍO DE ENLACES INDIVIDUALES */}
                          {curSubTab === 'jugadores' && (
                            <div className="space-y-2 pt-1 text-xs">
                              <p className="text-[11px] text-slate-500 leading-tight">
                                Envía a cada jugador su <strong>enlace personal intransferible</strong> para que acceda directamente, cree su PIN y quede enlazado a su rating y asistencia:
                              </p>

                              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                                {(t.participants || []).map(p => (
                                  <div key={p.id} className="p-2 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <UserAvatar name={p.name} photo={p.photo} size="xs" />
                                      <div>
                                        <span className="font-bold text-slate-800 text-[11px] block">{p.name}</span>
                                        <span className="text-[9px] text-slate-400">
                                          Nivel: ★ {Number(p.level).toFixed(1)} · {p.isGuest ? 'Invitado' : 'Club'}
                                        </span>
                                      </div>
                                    </div>

                                    <button
                                      onClick={() => handleSharePlayerPersonalLink(t, p)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] rounded-lg shadow-xs flex items-center gap-1 transition"
                                      title="Enviar enlace por WhatsApp"
                                    >
                                      <span>📲</span> Enviar Link
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* SUBTAB 3: CENA DEL TORNEO */}
                          {curSubTab === 'cena' && (
                            <div className="space-y-3 pt-1">
                              {myParticipation && (
                                <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 text-center space-y-1.5">
                                  <p className="text-xs font-black text-amber-950">
                                    ¿Te quedas al 3º Tiempo del {t.name}?
                                  </p>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleUpdateTournamentDinner(t.id, myParticipation.id, 'SI')}
                                      className={`flex-1 py-1.5 rounded-xl font-black text-xs transition ${
                                        myParticipation.dinner === 'SI'
                                          ? 'bg-emerald-600 text-white shadow-xs'
                                          : 'bg-white text-slate-700 border border-slate-200'
                                      }`}
                                    >
                                      ✓ Sí, me quedo 🍻
                                    </button>
                                    <button
                                      onClick={() => handleUpdateTournamentDinner(t.id, myParticipation.id, 'NO')}
                                      className={`flex-1 py-1.5 rounded-xl font-black text-xs transition ${
                                        myParticipation.dinner === 'NO'
                                          ? 'bg-rose-600 text-white shadow-xs'
                                          : 'bg-white text-slate-700 border border-slate-200'
                                      }`}
                                    >
                                      Me rajo 🏃‍♂️
                                    </button>
                                  </div>
                                </div>
                              )}

                              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2">
                                  <span className="text-sm font-black text-emerald-700 block">{totalDinners}</span>
                                  <span className="text-[9px] uppercase font-bold text-emerald-900">Cenan SÍ</span>
                                </div>
                                <div className="bg-rose-50 border border-rose-200 rounded-xl p-2">
                                  <span className="text-sm font-black text-rose-700 block">
                                    {(t.participants || []).filter(p => p.dinner === 'NO').length}
                                  </span>
                                  <span className="text-[9px] uppercase font-bold text-rose-900">Se Rajan</span>
                                </div>
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2">
                                  <span className="text-sm font-black text-amber-700 block">
                                    {(t.participants || []).filter(p => p.dinner !== 'SI' && p.dinner !== 'NO').length}
                                  </span>
                                  <span className="text-[9px] uppercase font-bold text-amber-900">Pendientes</span>
                                </div>
                              </div>

                              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                                {(t.participants || []).map(p => (
                                  <div key={p.id} className="p-2 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                      <UserAvatar name={p.name} photo={p.photo} size="xs" />
                                      <div>
                                        <span className="font-bold text-slate-800 text-[11px] block">{p.name}</span>
                                        <span className="text-[9px] text-slate-400">
                                          {p.dinner === 'SI' ? '🟢 Cena confirmada' : p.dinner === 'NO' ? '🔴 Se raja' : '🟡 Pendiente'}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex gap-1">
                                      <button
                                        onClick={() => handleUpdateTournamentDinner(t.id, p.id, p.dinner === 'SI' ? 'PENDIENTE' : 'SI')}
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                          p.dinner === 'SI' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                                        }`}
                                      >
                                        Cena 🍻
                                      </button>
                                      <button
                                        onClick={() => handleUpdateTournamentDinner(t.id, p.id, p.dinner === 'NO' ? 'PENDIENTE' : 'NO')}
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                          p.dinner === 'NO' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'
                                        }`}
                                      >
                                        No 🏃‍♂️
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <button
                                onClick={() => handleShareTournamentDinnerWhatsapp(t)}
                                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition"
                              >
                                📲 Avisar al Restaurante por WhatsApp ({totalDinners} comensales)
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL RECARGAR PLAYTOMIC */}
      {showReloadPlaytomicModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl">
            <h3 className="text-base font-black text-slate-900 mb-2">Recargar desde Playtomic</h3>
            <p className="text-xs text-slate-500 mb-3">Pega el nuevo texto si hubo cambios de hora, pista o jugadores:</p>
            <form onSubmit={handleReloadPlaytomic} className="space-y-3">
              <textarea
                rows={5}
                required
                value={reloadPlaytomicText}
                onChange={e => setReloadPlaytomicText(e.target.value)}
                placeholder="Pega el mensaje copiado de Playtomic..."
                className="w-full border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-mono"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowReloadPlaytomicModal(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold">Cancelar</button>
                <button type="submit" disabled={syncing} className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">Actualizar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CAMBIAR SUPLENTES */}
      {showEditPlayersModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl">
            <h3 className="text-base font-black text-slate-900 mb-2">Cambiar Suplentes</h3>
            <p className="text-xs text-slate-500 mb-3">Edita el nombre de cualquier jugador que vaya a jugar:</p>
            <form onSubmit={handleSaveManualPlayers} className="space-y-2.5">
              {[0, 1, 2, 3].map(idx => (
                <div key={idx}>
                  <label className="text-[10px] font-bold text-slate-500 block mb-0.5">
                    Jugador {idx + 1} ({idx < 2 ? 'Pareja 1' : 'Pareja 2'})
                  </label>
                  <input
                    type="text"
                    required
                    value={editPlayerSlots[idx]}
                    onChange={e => {
                      const updated = [...editPlayerSlots];
                      updated[idx] = e.target.value;
                      setEditPlayerSlots(updated);
                    }}
                    className="w-full border border-slate-300 rounded-xl p-2 text-xs font-semibold text-slate-800"
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowEditPlayersModal(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold">Cancelar</button>
                <button type="submit" disabled={syncing} className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL AÑADIR PARTIDO REGULAR */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-black text-slate-900">Añadir Partido Playtomic</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
            </div>
            <form onSubmit={handleAddPlaytomicMatch} className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">Grupo asignado:</span>
                <span className="font-black text-blue-700 uppercase bg-blue-100 px-2 py-0.5 rounded-md">
                  {myGroup === 'chicas' ? 'Chicas (Martes)' : 'Chicos (Jueves)'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Texto de Playtomic</label>
                <textarea
                  rows={6}
                  required
                  value={playtomicText}
                  onChange={(e) => setPlaytomicText(e.target.value)}
                  placeholder="Pega aquí el mensaje copiado de Playtomic..."
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-mono"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs">Cancelar</button>
                <button type="submit" disabled={syncing} className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">Crear</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MARCADOR MULTISET (JUEVES) */}
      {showScoreModal && currentMatch && (
        <MatchVisualScoreModal
          isOpen={showScoreModal}
          onClose={() => setShowScoreModal(false)}
          title="Marcador Partido Regular"
          subtitle={currentMatch.date}
          team1Name="Pareja 1"
          team2Name="Pareja 2"
          p1Players={(currentMatch.players || []).filter(p => (p.team || 1) === 1)}
          p2Players={(currentMatch.players || []).filter(p => (p.team || 1) === 2)}
          onSaveScore={handleSaveRegularMatchScore}
        />
      )}

      {/* MODAL MARCADOR DE TORNEO MULTISET */}
      {reportingTournamentMatch && (
        <MatchVisualScoreModal
          isOpen={Boolean(reportingTournamentMatch)}
          onClose={() => setReportingTournamentMatch(null)}
          title={reportingTournamentMatch.court}
          subtitle={reportingTournamentMatch.phase || 'Marcador de Encuentro'}
          team1Name={reportingTournamentMatch.team1}
          team2Name={reportingTournamentMatch.team2}
          onSaveScore={handleSaveTournamentScore}
        />
      )}

      {/* MODAL VINCULACIÓN DIRECTA DE JUGADOR HUÉRFANO */}
      {linkingSlot && (
        <LinkPlayerSlotModal
          isOpen={Boolean(linkingSlot)}
          onClose={() => setLinkingSlot(null)}
          slotName={linkingSlot.name}
          matchId={linkingSlot.matchId}
          allRegisteredPlayers={players}
          onConfirmLink={handleConfirmLinkSlot}
        />
      )}

      {/* MODAL WIZARD TORNEOS CON CAPITANES, DRAFT Y REGLAS GEMINI */}
      <TournamentCreatorModal
        isOpen={showTournamentWizard}
        onClose={() => setShowTournamentWizard(false)}
        allPlayers={players}
        tournaments={activeTournaments}
        onTournamentCreated={handleTournamentCreated}
        currentUserId={currentUser?.id}
        onSaveLevel={handleSaveLevel}
      />

      <CriteriosModal isOpen={showRulesModal} onClose={() => setShowRulesModal(false)} />
      
      <UserProfileModal
        isOpen={Boolean(inspectedUser)}
        onClose={() => setInspectedUser(null)}
        user={inspectedUser}
        matches={matches}
        tournaments={activeTournaments}
        onPhotoUploaded={handlePhotoUploaded}
        onUpdateUserData={handleUpdateUserData}
        isCurrentUser={Boolean(inspectedUser && currentUser && inspectedUser.id === currentUser.id)}
        isThursdayMember={isThursdayMember}
      />
    </div>
  );
}
