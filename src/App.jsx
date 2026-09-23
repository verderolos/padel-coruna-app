import React, { useState, useEffect, useMemo } from 'react';
import { 
  Trophy, CalendarPlus, MapPin, ExternalLink, X, 
  MessageCircle, Home, PiggyBank, UserPlus, Trash2, 
  RefreshCw, Settings, AlertTriangle, Check, CheckCircle2,
  Calendar, Clock, Users, ChevronRight, Award, Plus, Sparkles, Filter, ArrowLeftRight, UserCheck
} from 'lucide-react';

const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbxkd-BmLpYxmLtev5wcxwsyda94bG1mFW9gtDpEAgsmhV1HCfDwn2-syPDEvBUPwiiiGw/exec";

// Función auxiliar para limpiar nombres de Playtomic (ej. "Marcos (1,8)" -> "Marcos")
const cleanPlayerName = (raw) => {
  if (!raw) return '';
  return raw
    .replace('✅', '')
    .replace(/\s*\([\d,\.]+\)/g, '')
    .trim();
};

// Comprobación ESTRICTA de identidad: solo son el mismo si el ID coincide exactamente
const isSamePlayer = (player, user) => {
  if (!player || !user) return false;
  if (player.id && user.id && String(player.id).trim() === String(user.id).trim()) return true;
  return false;
};

// Comprobación de sugerencia: detecta si un jugador sin vincular tiene nombre parecido al usuario
const isPotentialMatch = (player, user, allUsers = []) => {
  if (!player || !user) return false;
  if (isSamePlayer(player, user)) return false;

  // Si este jugador ya está vinculado con un ID oficial de otro usuario registrado, no sugerir
  const isLinkedToOther = allUsers.some(u => u.id !== user.id && String(u.id).trim() === String(player.id).trim());
  if (isLinkedToOther) return false;

  const pName = cleanPlayerName(player.name || player.id || '').toLowerCase();
  const uName = cleanPlayerName(user.name || '').toLowerCase();
  if (!pName || !uName) return false;

  return pName === uName || pName.includes(uName) || uName.includes(pName);
};

// Datos de demostración y respaldo inmediato
const FALLBACK_USERS = [
  { id: 'u1', name: 'Bruno Otero', group: 'chicos', pJ: 15, pG: 12, cSi: 14, cNo: 1, ptsDeportivo: 66, ptsBarandas: 255, hibrido: 321, titulo: "Leyenda del 3º Tiempo 🍻", deuda: 4 },
  { id: 'u2', name: 'Alberto Casado', group: 'chicos', pJ: 12, pG: 8, cSi: 10, cNo: 2, ptsDeportivo: 48, ptsBarandas: 186, hibrido: 234, titulo: "Leyenda del 3º Tiempo 🍻", deuda: 6 },
  { id: 'u3', name: 'Borja Padel', group: 'chicos', pJ: 8, pG: 3, cSi: 2, cNo: 5, ptsDeportivo: 25, ptsBarandas: 54, hibrido: 79, titulo: "Deportista de Postureo 🥦", deuda: 10 },
  { id: 'u4', name: 'Edu Cutino', group: 'chicos', pJ: 10, pG: 6, cSi: 9, cNo: 1, ptsDeportivo: 38, ptsBarandas: 165, hibrido: 203, titulo: "Gastrónomo con Pala 🍔", deuda: 5 },
  { id: 'u5', name: 'Gus', group: 'chicos', pJ: 11, pG: 7, cSi: 8, cNo: 2, ptsDeportivo: 43, ptsBarandas: 153, hibrido: 196, titulo: "Jugador Promedio 🎾", deuda: 6 },
  { id: 'u6', name: 'Marcos', group: 'chicos', pJ: 1, pG: 1, cSi: 1, cNo: 0, ptsDeportivo: 5, ptsBarandas: 18, hibrido: 23, titulo: "Fichaje Estrella ⭐", deuda: 0 }
];

const FALLBACK_MATCHES = [
  {
    id: 'P-101',
    date: 'Jueves 21:00',
    dayOfWeek: 'Jueves',
    location: 'Pista 2 - Club Tenis La Coruña',
    url: 'https://app.playtomic.com/',
    grupo: 'chicos',
    status: 'PROGRAMADO',
    score: '',
    week: 'actual',
    players: [
      { id: 'u1', name: 'Bruno Otero', dinner: 'SI', won: 'PENDIENTE', team: 1 },
      { id: 'u2', name: 'Alberto Casado', dinner: 'PENDIENTE', won: 'PENDIENTE', team: 1 },
      { id: 'u3', name: 'Borja Padel', dinner: 'NO', won: 'PENDIENTE', team: 2 },
      { id: 'u4', name: 'Edu Cutino', dinner: 'SI', won: 'PENDIENTE', team: 2 }
    ],
    guests: [
      { id: 'inv-1', name: 'Lucía (Acompañante)' }
    ]
  },
  {
    id: 'P-102',
    date: 'Jueves 21:00',
    dayOfWeek: 'Jueves',
    location: 'Pista 4 - Club Tenis La Coruña',
    url: 'https://app.playtomic.com/',
    grupo: 'chicos',
    status: 'PROGRAMADO',
    score: '',
    week: 'actual',
    players: [
      { id: 'u5', name: 'Gus', dinner: 'SI', won: 'PENDIENTE', team: 1 },
      { id: 'u6', name: 'Marcos', dinner: 'SI', won: 'PENDIENTE', team: 1 }
    ],
    guests: []
  }
];

export default function App() {
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('padel_api_url') || DEFAULT_API_URL);
  const [apiUrlInput, setApiUrlInput] = useState(apiUrl);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('partidos'); // 'partidos', 'rankings', 'bote'
  const [rankingType, setRankingType] = useState('hibrido');
  const [dateFilter, setDateFilter] = useState('semana'); // 'semana', 'proximos', 'todos'

  // Perfil guardado del usuario en su teléfono
  const [myProfile, setMyProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('padel_my_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Registro de sugerencias descartadas por el usuario para no insistir
  const [dismissedLinks, setDismissedLinks] = useState(() => {
    try {
      const saved = localStorage.getItem('padel_dismissed_links');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Datos de la aplicación
  const [allUsers, setAllUsers] = useState(FALLBACK_USERS);
  const [matches, setMatches] = useState(FALLBACK_MATCHES);
  const [selectedMatchId, setSelectedMatchId] = useState(null);

  // Estados de formularios y modales
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserGroup, setNewUserGroup] = useState('chicos');
  const [newUserPlaytomic, setNewUserPlaytomic] = useState('');

  const [showNewMatch, setShowNewMatch] = useState(false);
  const [rawText, setRawText] = useState('');
  const [matchGroup, setMatchGroup] = useState('chicos');

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [matchToCancel, setMatchToCancel] = useState(null);

  const [showResultModal, setShowResultModal] = useState(false);
  const [matchToResult, setMatchToResult] = useState(null);
  const [resultScore, setResultScore] = useState('6-4, 6-3');
  const [winningTeam, setWinningTeam] = useState(1); // 1 o 2

  const [guestInput, setGuestInput] = useState('');
  const [notification, setNotification] = useState(null);

  const triggerNotice = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const fetchData = async (customUrl = apiUrl) => {
    try {
      setSyncing(true);
      const res = await fetch(customUrl, { method: 'GET', redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();

      if (json.ok) {
        if (json.jugadores && json.jugadores.length > 0) {
          setAllUsers(json.jugadores);
          if (myProfile) {
            const fresh = json.jugadores.find(u => u.id === myProfile.id || u.name.toLowerCase() === myProfile.name.toLowerCase());
            if (fresh) {
              setMyProfile(fresh);
              localStorage.setItem('padel_my_user', JSON.stringify(fresh));
            }
          }
        }

        // Si el backend devuelve array de partidos lo tomamos, o mapeamos el partido único
        if (json.partidos && json.partidos.length > 0) {
          setMatches(json.partidos);
        } else if (json.partido) {
          setMatches([{
            ...json.partido,
            players: json.asistentes || [],
            guests: json.invitados || [],
            status: json.partido.status || 'PROGRAMADO'
          }]);
        }
      }
    } catch (e) {
      console.warn("Conexión remota temporalmente usando fallback:", e);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchData(apiUrl);
  }, [apiUrl]);

  const selectMyUser = (user) => {
    setMyProfile(user);
    localStorage.setItem('padel_my_user', JSON.stringify(user));
    // NO vinculamos automáticamente a la fuerza: preguntamos explícitamente en el partido
    triggerNotice(`¡Bienvenido, ${user.name}!`);
  };

  const handleRegisterNewUser = async (e) => {
    e.preventDefault();
    if (!newUserName.trim()) return;

    const cleanName = newUserName.trim();
    const tempId = 'u-' + Date.now().toString().slice(-4);
    const newUserObj = {
      id: tempId,
      name: cleanName,
      group: newUserGroup,
      playtomic: newUserPlaytomic.trim(),
      pJ: 0, pG: 0, cSi: 0, cNo: 0,
      ptsDeportivo: 0, ptsBarandas: 0, hibrido: 0,
      titulo: "Fichaje Nuevo ⭐",
      deuda: 0
    };

    // Actualización local inmediata y auto-enlace en partidos cargados
    setAllUsers(prev => [newUserObj, ...prev]);
    selectMyUser(newUserObj);
    setShowRegisterModal(false);
    setNewUserName('');
    setNewUserPlaytomic('');

    // Guardado en Sheets
    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'REGISTRAR_JUGADOR',
          nombre: cleanName,
          grupo: newUserGroup,
          playtomic: newUserPlaytomic.trim()
        }),
        redirect: 'follow'
      });
      triggerNotice("¡Registrado con éxito!");
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateMatch = async (e) => {
    e.preventDefault();
    if (!rawText.trim()) return;

    let parsedDate = 'Jueves 21:00';
    let parsedLoc = 'Club de Tenis La Coruña';
    let parsedUrl = 'https://app.playtomic.com/';

    const dateMatch = rawText.match(/📅\s*([^\n]+)/);
    if (dateMatch) parsedDate = dateMatch[1].replace(/\s*\(\d+min\)/, '').trim();

    const locMatch = rawText.match(/📍\s*([^\n]+)/);
    if (locMatch) parsedLoc = locMatch[1].trim();

    const urlMatch = rawText.match(/(https:\/\/app\.playtomic\.com[^\s]+)/);
    if (urlMatch) parsedUrl = urlMatch[1];

    // Extraer jugadores marcados con check y limpiar niveles
    const playerLines = rawText.match(/✅\s*([^\n\(]+)/g) || [];
    const extractedPlayers = playerLines.map((line, idx) => {
      const clean = cleanPlayerName(line);
      const matchInDb = allUsers.find(u => isSamePlayer({ name: clean }, u)) || 
                        (myProfile && isSamePlayer({ name: clean }, myProfile) ? myProfile : null);

      return {
        id: matchInDb ? matchInDb.id : `ext-${idx}`,
        name: matchInDb ? matchInDb.name : clean,
        dinner: 'PENDIENTE',
        won: 'PENDIENTE',
        team: idx < 2 ? 1 : 2
      };
    });

    const newMatch = {
      id: 'P-' + Date.now().toString().slice(-4),
      date: parsedDate,
      dayOfWeek: parsedDate.toLowerCase().includes('mar') ? 'Martes' : 'Jueves',
      location: parsedLoc,
      url: parsedUrl,
      grupo: matchGroup,
      status: 'PROGRAMADO',
      score: '',
      week: 'actual',
      players: extractedPlayers.length > 0 ? extractedPlayers : [
        { id: myProfile.id, name: myProfile.name, dinner: 'PENDIENTE', won: 'PENDIENTE', team: 1 }
      ],
      guests: []
    };

    setMatches(prev => [newMatch, ...prev]);
    setSelectedMatchId(newMatch.id);
    setShowNewMatch(false);
    setRawText('');
    triggerNotice("Partido creado con éxito");

    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'CREAR_PARTIDO', rawText, grupo: matchGroup }),
        redirect: 'follow'
      });
      setTimeout(() => fetchData(), 1500);
    } catch (err) {
      console.error(err);
    }
  };

  // Cambiar manualmente a un jugador de equipo (Pareja 1 <-> Pareja 2)
  const handleTogglePlayerTeam = (matchId, playerId) => {
    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;
      return {
        ...m,
        players: m.players.map(p => {
          if (p.id === playerId) {
            return { ...p, team: p.team === 1 ? 2 : 1 };
          }
          return p;
        })
      };
    }));
    triggerNotice("Equipo actualizado");
  };

  // Confirmar explícitamente la vinculación de un jugador del partido con mi usuario
  const handleConfirmLink = async (matchId, playerToClaim) => {
    if (!myProfile) return;

    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;
      return {
        ...m,
        // Asignamos el ID y nombre oficial a este jugador en pista
        players: m.players.map(p => p.id === playerToClaim.id ? { ...p, id: myProfile.id, name: myProfile.name } : p),
        // Si previamente se había colado como invitado por error, lo eliminamos de acompañantes
        guests: m.guests.filter(g => !isSamePlayer(g, myProfile) && g.id !== myProfile.id)
      };
    }));

    triggerNotice(`¡Vinculado como ${myProfile.name} en este partido!`);

    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'VINCULAR_JUGADOR',
          idPartido: matchId,
          idJugador: myProfile.id,
          nombreJugador: myProfile.name,
          nombreOriginal: playerToClaim.name
        }),
        redirect: 'follow'
      });
    } catch (err) {
      console.error("Error guardando vinculación:", err);
    }
  };

  // Descartar sugerencia de vinculación (no es el usuario)
  const handleDismissLink = (matchId, playerId) => {
    const key = `${matchId}_${playerId}`;
    const updated = [...dismissedLinks, key];
    setDismissedLinks(updated);
    localStorage.setItem('padel_dismissed_links', JSON.stringify(updated));
    triggerNotice("Sugerencia descartada");
  };

  const handleUpdatePlayerDinner = async (matchId, player, targetStatus) => {
    // Si ya tiene el estado pulsado, se vuelve a poner en PENDIENTE
    const finalStatus = player.dinner === targetStatus ? 'PENDIENTE' : targetStatus;

    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;
      return {
        ...m,
        players: m.players.map(p => (p.id === player.id || p.name === player.name) ? { ...p, dinner: finalStatus } : p)
      };
    }));

    const firstName = cleanPlayerName(player.name).split(' ')[0] || player.name;
    const msg = finalStatus === 'SI' 
      ? `¡${firstName} se queda a cenar! 🍻` 
      : finalStatus === 'NO' 
      ? `${firstName} no cena 🏃‍♂️` 
      : `Cena de ${firstName} en pendiente ⏳`;
    triggerNotice(msg);

    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'ACTUALIZAR_CENA',
          idPartido: matchId,
          idJugador: player.id,
          nombreJugador: player.name,
          estado: finalStatus
        }),
        redirect: 'follow'
      });
    } catch (err) {
      console.error("Error al actualizar cena del jugador:", err);
    }
  };

  const handleVoteDinner = async (matchId, status) => {
    if (!myProfile) return;

    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;

      // Comprobar si el usuario actual es uno de los jugadores convocados en pista
      const isPlayer = m.players.some(p => isSamePlayer(p, myProfile));

      if (isPlayer) {
        return {
          ...m,
          // Actualizar en jugadores y eliminar de invitados en caso de que estuviera por error
          players: m.players.map(p => isSamePlayer(p, myProfile) ? { ...p, id: myProfile.id, name: myProfile.name, dinner: status } : p),
          guests: m.guests.filter(g => !isSamePlayer(g, myProfile))
        };
      } else {
        // Si no juega en pista y solo se une al tercer tiempo
        if (status === 'SI') {
          const alreadyGuest = m.guests.some(g => isSamePlayer(g, myProfile));
          return alreadyGuest ? m : { ...m, guests: [...m.guests, { id: myProfile.id, name: myProfile.name + " (Solo cena)" }] };
        } else {
          return { ...m, guests: m.guests.filter(g => !isSamePlayer(g, myProfile)) };
        }
      }
    }));

    triggerNotice(status === 'SI' ? "¡Apuntado a la cena! 🍻" : "Te echaremos de menos 🏃‍♂️");

    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'ACTUALIZAR_CENA',
          idPartido: matchId,
          idJugador: myProfile.id,
          nombreJugador: myProfile.name,
          estado: status
        }),
        redirect: 'follow'
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddGuest = async (e, matchId) => {
    e.preventDefault();
    if (!guestInput.trim()) return;

    const nombre = guestInput.trim();
    const tempId = 'inv-' + Date.now();

    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, guests: [...m.guests, { id: tempId, name: nombre }] } : m));
    setGuestInput('');
    triggerNotice(`Acompañante ${nombre} añadido`);

    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ANADIR_INVITADO', idPartido: matchId, nombre }),
        redirect: 'follow'
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveGuest = async (matchId, guestId) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, guests: m.guests.filter(g => g.id !== guestId) } : m));
    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ELIMINAR_INVITADO', idInvitado: guestId }),
        redirect: 'follow'
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelMatch = async () => {
    if (!matchToCancel) return;
    const matchId = matchToCancel.id;

    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'CANCELADO' } : m));
    setShowCancelModal(false);
    setSelectedMatchId(null);
    triggerNotice("Partido cancelado correctamente");

    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'CANCELAR_PARTIDO', idPartido: matchId }),
        redirect: 'follow'
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveResult = async (e) => {
    e.preventDefault();
    if (!matchToResult) return;
    const matchId = matchToResult.id;

    const winningPlayerIds = matchToResult.players
      .filter(p => p.team === winningTeam)
      .map(p => p.id || p.name);

    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;
      return {
        ...m,
        status: 'FINALIZADO',
        score: resultScore,
        players: m.players.map(p => ({
          ...p,
          won: p.team === winningTeam ? 'SI' : 'NO'
        }))
      };
    }));

    setShowResultModal(false);
    triggerNotice("Resultado y ganadores guardados 🏆");

    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'GUARDAR_RESULTADO',
          idPartido: matchId,
          marcador: resultScore,
          equipoGanador: winningTeam,
          ganadores: winningPlayerIds
        }),
        redirect: 'follow'
      });
      setTimeout(() => fetchData(), 1200);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredMatches = useMemo(() => {
    return matches.filter(m => {
      if (dateFilter === 'semana') return m.status !== 'CANCELADO' && (m.week === 'actual' || !m.week);
      if (dateFilter === 'proximos') return m.status === 'PROGRAMADO';
      return true; // 'todos'
    });
  }, [matches, dateFilter]);

  const activeMatch = matches.find(m => m.id === selectedMatchId) || null;
  const activeGroupUsers = allUsers.filter(u => (u.group || 'chicos') === (myProfile?.group || 'chicos'));

  if (!myProfile) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 font-sans text-white">
        {/* Banner flotante de aviso */}
        {notification && (
          <div className="fixed top-4 bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 animate-bounce flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> {notification}
          </div>
        )}

        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
          <div className="text-center mb-6">
            <div className="inline-flex p-3 bg-blue-600/20 text-blue-400 rounded-2xl mb-3 border border-blue-500/30">
              <Trophy className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black tracking-tight">Pádel CTC</h1>
            <p className="text-xs text-slate-400 mt-1">Club de Tenis de La Coruña · El 3º Tiempo</p>
          </div>

          <div className="space-y-3 mb-6">
            <button
              onClick={() => setShowRegisterModal(true)}
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all"
            >
              <UserPlus className="w-4 h-4" /> Soy Nuevo · Darme de Alta
            </button>
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-3 text-[11px] font-bold text-slate-500 uppercase">o elige tu perfil existente</span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {allUsers.map(u => (
              <button
                key={u.id}
                onClick={() => selectMyUser(u)}
                className="w-full text-left p-3 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 rounded-xl font-bold flex justify-between items-center text-xs transition-all"
              >
                <span>{u.name}</span>
                <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded font-mono uppercase">
                  {u.group || 'chicos'}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-800/80 flex justify-between items-center text-[11px] text-slate-500">
            <button onClick={() => setShowConfigModal(true)} className="hover:text-slate-300 flex items-center gap-1">
              <Settings className="w-3.5 h-3.5" /> Servidor Apps Script
            </button>
            <span>v2.0 PWA</span>
          </div>
        </div>

        {/* Modal de Registro de Nuevo Jugador */}
        {showRegisterModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-sm text-white">Alta de Jugador</h3>
                <button onClick={() => setShowRegisterModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRegisterNewUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Nombre y Apellidos</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Marcos"
                    value={newUserName}
                    onChange={e => setNewUserName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Grupo habitual</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewUserGroup('chicos')}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                        newUserGroup === 'chicos' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      Chicos (Jueves)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewUserGroup('chicas')}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                        newUserGroup === 'chicas' ? 'bg-pink-600 border-pink-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      Chicas (Martes)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Usuario Playtomic (Opcional)</label>
                  <input
                    type="text"
                    placeholder="marcos_padel"
                    value={newUserPlaytomic}
                    onChange={e => setNewUserPlaytomic(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-lg transition-all"
                >
                  Confirmar y Entrar
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans selection:bg-blue-200">
      <div className="max-w-md mx-auto bg-white min-h-screen relative shadow-2xl flex flex-col pb-24">

        {/* Notificación Toast Flotante */}
        {notification && (
          <div className="fixed top-3 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-2xl z-50 flex items-center gap-2 animate-fade-in border border-gray-700">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
            {notification}
          </div>
        )}

        {/* Cabecera Principal */}
        <header className="bg-white px-5 py-3.5 flex items-center justify-between border-b border-gray-100 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-2xl text-white shadow-sm">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-black text-gray-900 leading-none">Pádel CTC</h1>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                {myProfile.name} · {myProfile.group || 'chicos'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                localStorage.removeItem('padel_my_user');
                setMyProfile(null);
              }}
              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-bold text-gray-600 rounded-lg"
              title="Cambiar de jugador"
            >
              Salir
            </button>
            <button
              onClick={() => fetchData()}
              disabled={syncing}
              className="p-2 text-gray-400 hover:text-blue-600 rounded-xl hover:bg-gray-50"
              title="Sincronizar"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </header>

        {/* PESTAÑA: PARTIDOS */}
        {activeTab === 'partidos' && (
          <main className="p-4 flex-1">
            {/* Si no hay partido seleccionado, mostramos la cartelera de la semana */}
            {!selectedMatchId ? (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <h2 className="text-xl font-black text-gray-900">Partidos</h2>
                    <p className="text-xs text-gray-400 font-medium">Resumen y cartelera</p>
                  </div>
                  <button
                    onClick={() => setShowNewMatch(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-2xl font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-blue-500/20 transition-all"
                  >
                    <Plus className="w-4 h-4" /> Nuevo Partido
                  </button>
                </div>

                {/* Filtro de Fechas / Semana */}
                <div className="flex bg-gray-100 p-1 rounded-2xl mb-4 text-xs font-bold text-gray-500">
                  <button
                    onClick={() => setDateFilter('semana')}
                    className={`flex-1 py-1.5 rounded-xl transition-all ${
                      dateFilter === 'semana' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-700'
                    }`}
                  >
                    Esta Semana
                  </button>
                  <button
                    onClick={() => setDateFilter('proximos')}
                    className={`flex-1 py-1.5 rounded-xl transition-all ${
                      dateFilter === 'proximos' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-700'
                    }`}
                  >
                    Próximos
                  </button>
                  <button
                    onClick={() => setDateFilter('todos')}
                    className={`flex-1 py-1.5 rounded-xl transition-all ${
                      dateFilter === 'todos' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-700'
                    }`}
                  >
                    Todos
                  </button>
                </div>

                {/* Lista de Partidos (Permite ver varios partidos del mismo día) */}
                <div className="space-y-3">
                  {filteredMatches.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-3xl border border-dashed border-gray-200 p-6">
                      <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-gray-600">No hay partidos para este filtro</p>
                      <p className="text-[11px] text-gray-400 mt-1">Pulsa en "Nuevo Partido" para pegar el texto de Playtomic.</p>
                    </div>
                  ) : (
                    filteredMatches.map(m => {
                      const totalCena = (m.players?.filter(p => p.dinner === 'SI').length || 0) + (m.guests?.length || 0);
                      const myStatus = m.players?.find(p => p.id === myProfile.id || p.name === myProfile.name)?.dinner;
                      const isCancelled = m.status === 'CANCELADO';
                      const isFinished = m.status === 'FINALIZADO';

                      return (
                        <div
                          key={m.id}
                          onClick={() => setSelectedMatchId(m.id)}
                          className={`p-4 rounded-3xl border transition-all cursor-pointer shadow-sm relative ${
                            isCancelled 
                              ? 'bg-gray-50 border-gray-200 opacity-60' 
                              : isFinished
                              ? 'bg-purple-50/40 border-purple-100 hover:border-purple-300'
                              : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-md'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider ${
                                isCancelled 
                                  ? 'bg-red-100 text-red-600' 
                                  : isFinished
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-blue-50 text-blue-600'
                              }`}>
                                {isCancelled ? 'CANCELADO' : isFinished ? 'FINALIZADO' : m.dayOfWeek || 'Jueves'}
                              </span>
                              <span className="text-[11px] font-bold text-gray-700">{m.date}</span>
                            </div>
                            <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/60 px-2 py-0.5 rounded-full">
                              🍻 {totalCena} a cenar
                            </span>
                          </div>

                          <div className="text-xs font-bold text-gray-800 flex items-center gap-1 mb-2">
                            <MapPin className="w-3.5 h-3.5 text-gray-400" />
                            <span className="truncate">{m.location}</span>
                          </div>

                          {/* Jugadores convocados en miniatura */}
                          <div className="flex flex-wrap gap-1 mb-3">
                            {m.players && m.players.map((p, idx) => (
                              <span key={idx} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg font-medium">
                                {p.name.split(' ')[0]}
                              </span>
                            ))}
                          </div>

                          {/* Estado de mi cena en este partido */}
                          <div className="flex justify-between items-center pt-2 border-t border-gray-100 text-[11px]">
                            <span className="text-gray-400">Tu cena:</span>
                            <span className={`font-bold ${
                              myStatus === 'SI' ? 'text-emerald-600' : myStatus === 'NO' ? 'text-red-500' : 'text-amber-500'
                            }`}>
                              {myStatus === 'SI' ? 'Confirmado SÍ 🍻' : myStatus === 'NO' ? 'No vas 🏃‍♂️' : 'Pendiente ⏳'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              /* DETALLE DEL PARTIDO SELECCIONADO */
              activeMatch && (
                <div>
                  <button
                    onClick={() => setSelectedMatchId(null)}
                    className="mb-4 text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    ← Volver a la lista de partidos
                  </button>

                  <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-6">
                    <div className="p-5 border-b border-gray-100">
                      <div className="flex justify-between items-start mb-1">
                        <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase ${
                          activeMatch.status === 'CANCELADO' ? 'bg-red-100 text-red-600' :
                          activeMatch.status === 'FINALIZADO' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {activeMatch.status}
                        </span>

                        <div className="flex gap-2">
                          {activeMatch.status !== 'CANCELADO' && (
                            <button
                              onClick={() => {
                                setMatchToCancel(activeMatch);
                                setShowCancelModal(true);
                              }}
                              className="text-[11px] text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg font-bold"
                            >
                              Cancelar
                            </button>
                          )}
                          {activeMatch.status !== 'CANCELADO' && (
                            <button
                              onClick={() => {
                                setMatchToResult(activeMatch);
                                setShowResultModal(true);
                              }}
                              className="text-[11px] text-purple-600 hover:bg-purple-50 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 border border-purple-200"
                            >
                              <Award className="w-3.5 h-3.5" /> Marcador
                            </button>
                          )}
                        </div>
                      </div>

                      <h3 className="text-xl font-black text-gray-900 mt-2">{activeMatch.date}</h3>
                      <p className="text-gray-500 flex items-center gap-1 text-xs mt-1 mb-4">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" /> {activeMatch.location}
                      </p>

                      {activeMatch.score && (
                        <div className="bg-purple-50 p-2.5 rounded-2xl mb-4 text-center">
                          <span className="text-[10px] font-bold text-purple-600 uppercase">Resultado Oficial</span>
                          <p className="text-base font-black text-purple-950">{activeMatch.score}</p>
                        </div>
                      )}

                      <a
                        href={activeMatch.url}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full bg-blue-50 text-blue-600 font-bold py-2.5 rounded-2xl flex items-center justify-center gap-2 text-xs border border-blue-100 hover:bg-blue-100 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" /> Abrir en Playtomic
                      </a>
                    </div>

                    {/* Votación personal de la cena */}
                    {activeMatch.status !== 'CANCELADO' && (
                      <div className="p-4 bg-gray-50 border-b border-gray-100">
                        <p className="text-xs font-black text-gray-700 mb-2 text-center uppercase tracking-wider">
                          ¿Te quedas al 3º Tiempo?
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleVoteDinner(activeMatch.id, 'SI')}
                            className={`py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-1.5 ${
                              activeMatch.players?.find(p => isSamePlayer(p, myProfile))?.dinner === 'SI' ||
                              activeMatch.guests?.some(g => isSamePlayer(g, myProfile))
                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            <Check className="w-4 h-4" /> ¡SÍ, CLARO! 🍻
                          </button>

                          <button
                            onClick={() => handleVoteDinner(activeMatch.id, 'NO')}
                            className={`py-3 rounded-2xl font-black text-xs transition-all ${
                              activeMatch.players?.find(p => isSamePlayer(p, myProfile))?.dinner === 'NO'
                                ? 'bg-red-500 text-white shadow-md shadow-red-500/20'
                                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            ME RAJO 🏃‍♂️
                          </button>
                        </div>
                      </div>
                    )}

                    {/* BANNER DE PREGUNTA EXPLICITA: ¿Eres tú este jugador? */}
                    {(() => {
                      const isUserAlreadyInMatch = activeMatch.players?.some(p => isSamePlayer(p, myProfile));
                      if (isUserAlreadyInMatch) return null;

                      // Buscar si hay algún jugador sin vincular con nombre similar que no hayamos descartado
                      const candidate = activeMatch.players?.find(p => 
                        !dismissedLinks.includes(`${activeMatch.id}_${p.id}`) &&
                        isPotentialMatch(p, myProfile, allUsers)
                      );

                      if (!candidate) return null;

                      return (
                        <div className="p-4 bg-amber-50 border-b border-amber-200/80 flex flex-col gap-2.5">
                          <div className="flex items-start gap-2.5">
                            <div className="p-2 bg-amber-200 text-amber-900 rounded-xl">
                              <UserCheck className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black text-amber-950">¿Eres tú "{cleanPlayerName(candidate.name)}"?</h4>
                              <p className="text-[11px] text-amber-800 mt-0.5">
                                Hay una plaza convocada en pista con tu nombre que aún no está enlazada con tu perfil.
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-2 mt-1">
                            <button
                              onClick={() => handleConfirmLink(activeMatch.id, candidate)}
                              className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" /> Sí, soy yo (Vincularme)
                            </button>
                            <button
                              onClick={() => handleDismissLink(activeMatch.id, candidate.id)}
                              className="py-2 px-3 bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 rounded-xl font-bold text-xs transition-colors"
                            >
                              No soy yo
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Jugadores convocados divididos por Parejas / Equipos */}
                    <div className="p-4">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider">Parejas & Convocatoria</h4>
                        <span className="text-[10px] text-gray-400 font-medium">Toca P1/P2 o confirma cenas</span>
                      </div>

                      {/* Pareja 1 */}
                      <div className="mb-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                          <span className="text-[11px] font-black uppercase text-blue-700">Pareja 1</span>
                        </div>
                        <div className="space-y-1.5">
                          {}
                          {activeMatch.players?.filter(p => (p.team || 1) === 1).map((p, idx) => {
                            const isMe = isSamePlayer(p, myProfile);
                            const isUnlinked = !allUsers.some(u => u.id === p.id);
                            const canClaim = !activeMatch.players.some(pl => isSamePlayer(pl, myProfile)) && isUnlinked;

                            return (
                              <div key={idx} className={`flex justify-between items-center p-2.5 rounded-2xl text-xs border ${
                                isMe ? 'bg-blue-100/70 border-blue-300' : 'bg-blue-50/50 border-blue-100'
                              }`}>
                                <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-2">
                                  <button
                                    onClick={() => handleTogglePlayerTeam(activeMatch.id, p.id)}
                                    className="px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-black text-[10px] flex items-center gap-0.5 shadow-sm shrink-0"
                                    title="Pasar a Pareja 2"
                                  >
                                    P1 <ArrowLeftRight className="w-2.5 h-2.5" />
                                  </button>
                                  <span className="font-bold text-gray-900 truncate">{p.name}</span>
                                  {isMe && <span className="bg-blue-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0">TÚ</span>}
                                  {canClaim && (
                                    <button
                                      onClick={() => handleConfirmLink(activeMatch.id, p)}
                                      className="text-[9px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded-md font-black hover:bg-amber-200 shrink-0"
                                      title="Haz clic si eres tú para vincularte"
                                    >
                                      ¿Eres tú? 🙋‍♂️
                                    </button>
                                  )}
                                  {p.won === 'SI' && <span className="text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded text-[9px] font-black shrink-0">🏆</span>}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => handleUpdatePlayerDinner(activeMatch.id, p, 'SI')}
                                    title="Marcar que sí cena (pulsa de nuevo para poner pendiente)"
                                    className={`px-2 py-1 rounded-xl font-black text-[10px] transition-all flex items-center gap-0.5 border ${
                                      p.dinner === 'SI'
                                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                        : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300 hover:text-emerald-700'
                                    }`}
                                  >
                                    Cena 🍻
                                  </button>
                                  <button
                                    onClick={() => handleUpdatePlayerDinner(activeMatch.id, p, 'NO')}
                                    title="Marcar que no cena (pulsa de nuevo para poner pendiente)"
                                    className={`px-2 py-1 rounded-xl font-black text-[10px] transition-all flex items-center gap-0.5 border ${
                                      p.dinner === 'NO'
                                        ? 'bg-red-500 border-red-500 text-white shadow-sm'
                                        : 'bg-white border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600'
                                    }`}
                                  >
                                    No 🏃‍♂️
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Pareja 2 */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                          <span className="text-[11px] font-black uppercase text-amber-700">Pareja 2</span>
                        </div>
                        <div className="space-y-1.5">
                          {}
                          {activeMatch.players?.filter(p => (p.team || 1) === 2).map((p, idx) => {
                            const isMe = isSamePlayer(p, myProfile);
                            const isUnlinked = !allUsers.some(u => u.id === p.id);
                            const canClaim = !activeMatch.players.some(pl => isSamePlayer(pl, myProfile)) && isUnlinked;

                            return (
                              <div key={idx} className={`flex justify-between items-center p-2.5 rounded-2xl text-xs border ${
                                isMe ? 'bg-amber-100/70 border-amber-300' : 'bg-amber-50/50 border-amber-100'
                              }`}>
                                <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-2">
                                  <button
                                    onClick={() => handleTogglePlayerTeam(activeMatch.id, p.id)}
                                    className="px-1.5 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-black text-[10px] flex items-center gap-0.5 shadow-sm shrink-0"
                                    title="Pasar a Pareja 1"
                                  >
                                    P2 <ArrowLeftRight className="w-2.5 h-2.5" />
                                  </button>
                                  <span className="font-bold text-gray-900 truncate">{p.name}</span>
                                  {isMe && <span className="bg-amber-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0">TÚ</span>}
                                  {canClaim && (
                                    <button
                                      onClick={() => handleConfirmLink(activeMatch.id, p)}
                                      className="text-[9px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded-md font-black hover:bg-amber-200 shrink-0"
                                      title="Haz clic si eres tú para vincularte"
                                    >
                                      ¿Eres tú? 🙋‍♂️
                                    </button>
                                  )}
                                  {p.won === 'SI' && <span className="text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded text-[9px] font-black shrink-0">🏆</span>}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => handleUpdatePlayerDinner(activeMatch.id, p, 'SI')}
                                    title="Marcar que sí cena (pulsa de nuevo para poner pendiente)"
                                    className={`px-2 py-1 rounded-xl font-black text-[10px] transition-all flex items-center gap-0.5 border ${
                                      p.dinner === 'SI'
                                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                        : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300 hover:text-emerald-700'
                                    }`}
                                  >
                                    Cena 🍻
                                  </button>
                                  <button
                                    onClick={() => handleUpdatePlayerDinner(activeMatch.id, p, 'NO')}
                                    title="Marcar que no cena (pulsa de nuevo para poner pendiente)"
                                    className={`px-2 py-1 rounded-xl font-black text-[10px] transition-all flex items-center gap-0.5 border ${
                                      p.dinner === 'NO'
                                        ? 'bg-red-500 border-red-500 text-white shadow-sm'
                                        : 'bg-white border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600'
                                    }`}
                                  >
                                    No 🏃‍♂️
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Acompañantes Solo Cena */}
                    <div className="p-4 border-t border-gray-100">
                      <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider mb-2">Acompañantes 3º Tiempo</h4>
                      <form onSubmit={(e) => handleAddGuest(e, activeMatch.id)} className="flex gap-2 mb-3">
                        <input
                          type="text"
                          value={guestInput}
                          onChange={e => setGuestInput(e.target.value)}
                          placeholder="Nombre acompañante..."
                          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                        />
                        <button type="submit" className="bg-amber-600 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center hover:bg-amber-700">
                          <UserPlus className="w-4 h-4" />
                        </button>
                      </form>

                      <div className="space-y-1.5">
                        {activeMatch.guests?.map(g => (
                          <div key={g.id} className="flex justify-between items-center bg-amber-50/50 border border-amber-100 px-3 py-1.5 rounded-xl text-xs">
                            <span className="font-medium text-amber-950">{g.name}</span>
                            <button onClick={() => handleRemoveGuest(activeMatch.id, g.id)} className="text-amber-400 hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}
          </main>
        )}

        {/* PESTAÑA: RANKINGS */}
        {activeTab === 'rankings' && (
          <main className="p-4 flex-1">
            <h2 className="text-xl font-black text-gray-900 mb-1">Clasificación CTC</h2>
            <p className="text-xs text-gray-400 mb-4">Puntos de pádel y del tercer tiempo</p>

            <div className="flex bg-gray-100 rounded-2xl p-1 mb-4 text-xs font-bold text-gray-500">
              <button
                onClick={() => setRankingType('hibrido')}
                className={`flex-1 py-1.5 rounded-xl transition-all ${rankingType === 'hibrido' ? 'bg-purple-600 text-white shadow-sm' : ''}`}
              >
                Híbrido
              </button>
              <button
                onClick={() => setRankingType('deportivo')}
                className={`flex-1 py-1.5 rounded-xl transition-all ${rankingType === 'deportivo' ? 'bg-emerald-600 text-white shadow-sm' : ''}`}
              >
                Pádel
              </button>
              <button
                onClick={() => setRankingType('barandas')}
                className={`flex-1 py-1.5 rounded-xl transition-all ${rankingType === 'barandas' ? 'bg-amber-600 text-white shadow-sm' : ''}`}
              >
                Barandas
              </button>
            </div>

            <div className="space-y-2">
              {[...activeGroupUsers]
                .sort((a, b) => {
                  if (rankingType === 'hibrido') return (b.hibrido || 0) - (a.hibrido || 0);
                  if (rankingType === 'deportivo') return (b.ptsDeportivo || 0) - (a.ptsDeportivo || 0);
                  return (b.ptsBarandas || 0) - (a.ptsBarandas || 0);
                })
                .map((u, i) => (
                  <div key={u.id} className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs ${
                        i === 0 ? 'bg-yellow-100 text-yellow-700' :
                        i === 1 ? 'bg-gray-100 text-gray-600' :
                        i === 2 ? 'bg-amber-100 text-amber-700' : 'bg-gray-50 text-gray-400'
                      }`}>
                        {i + 1}
                      </span>
                      <div>
                        <h4 className="font-bold text-gray-800 text-xs">{u.name}</h4>
                        <p className="text-[10px] text-gray-400 font-semibold">{u.titulo || "Jugador Promedio 🎾"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-black text-sm text-purple-600">
                        {rankingType === 'hibrido' ? u.hibrido : rankingType === 'deportivo' ? u.ptsDeportivo : u.ptsBarandas}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-1 font-bold">pts</span>
                    </div>
                  </div>
                ))}
            </div>
          </main>
        )}

        {/* PESTAÑA: BOTE */}
        {activeTab === 'bote' && (
          <main className="p-4 flex-1">
            <h2 className="text-xl font-black text-gray-900 mb-1">El Bote Navideño 🐷</h2>
            <p className="text-xs text-gray-400 mb-4">Fondos para la cena de final de año</p>

            <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-3xl p-6 text-white text-center shadow-lg mb-6">
              <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">Recaudación acumulada</span>
              <div className="text-5xl font-black my-2">
                {activeGroupUsers.reduce((sum, u) => sum + (u.deuda || 0), 0)} €
              </div>
              <p className="text-[11px] opacity-90">1 € por derrota + 1 € por rajarte de la cena</p>
            </div>

            <h3 className="font-bold text-xs text-gray-400 uppercase tracking-wider mb-2">Muro de Morosos</h3>
            <div className="space-y-2">
              {activeGroupUsers
                .filter(u => (u.deuda || 0) > 0)
                .sort((a, b) => (b.deuda || 0) - (a.deuda || 0))
                .map(u => (
                  <div key={u.id} className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-gray-800 text-xs">{u.name}</h4>
                      <span className="text-[10px] text-gray-400">
                        {(u.pJ - u.pG) || 0} derrotas · {u.cNo || 0} rajadas
                      </span>
                    </div>
                    <span className="text-base font-black text-rose-500">{u.deuda} €</span>
                  </div>
                ))}
            </div>
          </main>
        )}

        {/* MODAL: REGISTRAR RESULTADO Y GANADORES */}
        {showResultModal && matchToResult && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-black text-gray-800 text-sm">Registrar Resultado y Ganadores</h3>
                <button onClick={() => setShowResultModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveResult} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Marcador (Sets)</label>
                  <input
                    type="text"
                    required
                    value={resultScore}
                    onChange={e => setResultScore(e.target.value)}
                    placeholder="Ej. 6-4, 3-6, 7-5"
                    className="w-full text-xs p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">¿Quién se llevó la victoria?</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setWinningTeam(1)}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        winningTeam === 1 ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-sm ring-2 ring-blue-500/20' : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      <span className="block font-black text-xs text-blue-700">Pareja 1 🏆</span>
                      <div className="text-[10px] text-gray-600 mt-1 space-y-0.5 font-medium">
                        {matchToResult.players?.filter(p => (p.team || 1) === 1).map((p, i) => (
                          <div key={i} className="truncate">• {p.name}</div>
                        ))}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setWinningTeam(2)}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        winningTeam === 2 ? 'border-amber-600 bg-amber-50 text-amber-900 shadow-sm ring-2 ring-amber-500/20' : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      <span className="block font-black text-xs text-amber-700">Pareja 2 🏆</span>
                      <div className="text-[10px] text-gray-600 mt-1 space-y-0.5 font-medium">
                        {matchToResult.players?.filter(p => (p.team || 1) === 2).map((p, i) => (
                          <div key={i} className="truncate">• {p.name}</div>
                        ))}
                      </div>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl text-xs shadow transition-colors"
                >
                  Guardar y Actualizar Bote
                </button>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: CANCELAR PARTIDO */}
        {showCancelModal && matchToCancel && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-5 max-w-xs w-full shadow-2xl text-center">
              <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-2" />
              <h3 className="font-black text-gray-900 text-base mb-1">¿Cancelar este partido?</h3>
              <p className="text-xs text-gray-500 mb-4">El partido del {matchToCancel.date} quedará marcado como cancelado.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="flex-1 py-2.5 bg-gray-100 font-bold rounded-xl text-xs text-gray-700"
                >
                  No, mantener
                </button>
                <button
                  onClick={handleCancelMatch}
                  className="flex-1 py-2.5 bg-red-600 font-bold rounded-xl text-xs text-white shadow-md hover:bg-red-700"
                >
                  Sí, cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: CREAR NUEVO PARTIDO */}
        {showNewMatch && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl relative">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-black text-gray-900 text-sm">Nuevo Partido</h3>
                <button onClick={() => setShowNewMatch(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateMatch} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Pega el texto de Playtomic</label>
                  <textarea
                    rows={4}
                    value={rawText}
                    onChange={e => setRawText(e.target.value)}
                    placeholder="📅 jueves, 24 sept, 21:00...&#10;📍 Club Tenis La Coruña...&#10;✅ Marcos...&#10;✅ Bruno..."
                    className="w-full text-xs p-3 bg-gray-50 border border-gray-200 rounded-xl font-mono focus:outline-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Grupo</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMatchGroup('chicos')}
                      className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                        matchGroup === 'chicos' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      Chicos (Jueves)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatchGroup('chicas')}
                      className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                        matchGroup === 'chicas' ? 'bg-pink-50 border-pink-500 text-pink-700' : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      Chicas (Martes)
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 rounded-xl text-xs shadow mt-2 transition-colors"
                >
                  Guardar Partido
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Barra de Navegación Inferior */}
        <nav className="fixed bottom-0 max-w-md w-full bg-white border-t border-gray-100 flex justify-around py-2.5 z-40 shadow-sm">
          <button
            onClick={() => { setActiveTab('partidos'); setSelectedMatchId(null); }}
            className={`flex flex-col items-center py-1 px-4 text-[10px] font-black ${activeTab === 'partidos' ? 'text-blue-600' : 'text-gray-400'}`}
          >
            <Home className="w-5 h-5 mb-0.5" /> Partidos
          </button>
          <button
            onClick={() => setActiveTab('rankings')}
            className={`flex flex-col items-center py-1 px-4 text-[10px] font-black ${activeTab === 'rankings' ? 'text-purple-600' : 'text-gray-400'}`}
          >
            <Trophy className="w-5 h-5 mb-0.5" /> Rankings
          </button>
          <button
            onClick={() => setActiveTab('bote')}
            className={`flex flex-col items-center py-1 px-4 text-[10px] font-black ${activeTab === 'bote' ? 'text-rose-500' : 'text-gray-400'}`}
          >
            <PiggyBank className="w-5 h-5 mb-0.5" /> Bote
          </button>
        </nav>
      </div>
    </div>
  );
}
