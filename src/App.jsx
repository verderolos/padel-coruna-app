import React, { useState, useEffect } from 'react';

// URL de tu Apps Script
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxkd-BmLpYxmLtev5wcxwsyda94bG1mFW9gtDpEAgsmhV1HCfDwn2-syPDEvBUPwiiiGw/exec';

const FALLBACK_USERS = [];
const FALLBACK_MATCHES = [];

function parseMatchTiming(dateStr) {
  if (!dateStr) return { canReport: true, shouldPrompt: false };
  const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})/);
  if (!timeMatch) return { canReport: true, shouldPrompt: false };

  const now = new Date();
  const matchDate = new Date();
  matchDate.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);

  const diffHours = (now - matchDate) / (1000 * 60 * 60);
  return {
    canReport: diffHours >= 0,
    shouldPrompt: diffHours >= 2.0
  };
}

// Modal Criterios y Bote
function CriteriosModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 text-left">
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
            📖 Criterios de Puntos y Bote
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold leading-none">&times;</button>
        </div>

        <section className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3.5">
          <h4 className="font-extrabold text-amber-900 text-xs uppercase tracking-wide mb-1">💶 Bote del 3º Tiempo</h4>
          <p className="text-xs text-amber-950 mb-2">Se calcula automáticamente sobre partidos finalizados:</p>
          <ul className="text-xs text-amber-900 space-y-1 list-disc list-inside">
            <li><strong>Derrota jugada:</strong> +1 € por partido perdido.</li>
            <li><strong>Victoria jugada:</strong> 0 € (el ganador no paga bote).</li>
            <li><strong>Rajarse de la cena:</strong> +1 € por no quedarse habiendo jugado.</li>
          </ul>
        </section>

        <section className="mb-4 space-y-2">
          <h4 className="font-extrabold text-gray-900 text-xs uppercase tracking-wide">🏆 Puntuaciones</h4>
          <div className="border border-blue-100 bg-blue-50/60 rounded-lg p-2.5 text-xs text-blue-900">
            <strong>Puntos Deportivos:</strong> Victoria 5 pts · Derrota 2 pts
          </div>
          <div className="border border-emerald-100 bg-emerald-50/60 rounded-lg p-2.5 text-xs text-emerald-900">
            <strong>Puntos Barandas:</strong> Cena 15 pts · Partido jugado 3 pts
          </div>
          <div className="border border-purple-100 bg-purple-50/60 rounded-lg p-2.5 text-xs text-purple-900">
            <strong>Híbrido:</strong> Suma directa de ambos rankings.
          </div>
        </section>

        <button onClick={onClose} className="w-full mt-4 bg-gray-900 text-white font-bold py-2 rounded-xl text-xs">
          Cerrar
        </button>
      </div>
    </div>
  );
}

// Modal de Configuración y Notificaciones
function SettingsModal({ isOpen, onClose, user, onSaveNotifications, notifEnabled }) {
  if (!isOpen) return null;

  const handleRequestPush = async () => {
    if (!('Notification' in window)) {
      alert('Tu navegador no soporta notificaciones.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      onSaveNotifications(true);
      new Notification('Pádel CTC 🎾', {
        body: `¡Hola ${user.name}! Notificaciones activadas con éxito.`,
        icon: 'https://cdn-icons-png.flaticon.com/512/2855/2855613.png'
      });
    } else {
      onSaveNotifications(false);
      alert('Permiso denegado.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl text-left">
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            ⚙️ Ajustes de Usuario
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold leading-none">&times;</button>
        </div>

        <div className="space-y-4 text-xs">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <p className="font-bold text-slate-800">Jugador Activo:</p>
            <p className="text-slate-600 font-semibold">{user.name} ({user.group})</p>
            <p className="text-[10px] text-slate-400 mt-1">Este dispositivo te recordará automáticamente.</p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="font-bold text-slate-700">Notificaciones Push:</span>
            <button
              onClick={handleRequestPush}
              className={`px-3 py-1.5 rounded-xl font-bold transition text-xs ${
                notifEnabled ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              {notifEnabled ? '✓ Activadas' : 'Activar Avisos'}
            </button>
          </div>
        </div>

        <button onClick={onClose} className="w-full mt-5 bg-slate-900 text-white font-bold py-2 rounded-xl text-xs">
          Cerrar
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('padel_api_url') || DEFAULT_API_URL);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('partidos');
  const [rankingType, setRankingType] = useState('hibrido');

  const [players, setPlayers] = useState(FALLBACK_USERS);
  const [matches, setMatches] = useState(FALLBACK_MATCHES);
  const [selectedMatchId, setSelectedMatchId] = useState(null);

  const [selectedDinnerDate, setSelectedDinnerDate] = useState('');

  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(() => localStorage.getItem('padel_notif') === 'true');

  // Usuario guardado en localStorage para auto-reconocimiento
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('padel_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  // Estado para el formulario de registrar nuevo usuario
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserGroup, setNewUserGroup] = useState('Chicos');
  const [newUserPlaytomic, setNewUserPlaytomic] = useState('');

  const [showScoreModal, setShowScoreModal] = useState(false);
  const [winnerTeam, setWinnerTeam] = useState(1);
  const [scoreText, setScoreText] = useState('6-4, 6-3');
  const [dismissedLinks, setDismissedLinks] = useState({});

  const fetchData = async (customUrl = apiUrl) => {
    try {
      setSyncing(true);
      const res = await fetch(customUrl, { method: 'GET', redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (json.ok) {
        if (json.jugadores) {
          setPlayers(json.jugadores);

          // Auto-reconocimiento mediante URL (?user=marcos) si aún no había usuario guardado
          const urlParams = new URLSearchParams(window.location.search);
          const userParam = urlParams.get('user');
          if (userParam && !currentUser) {
            const matchUser = json.jugadores.find(u => 
              u.name.toLowerCase().includes(userParam.toLowerCase()) || 
              u.id.toLowerCase() === userParam.toLowerCase()
            );
            if (matchUser) {
              handleSelectUser(matchUser);
            }
          }
        }
        if (json.partidos) {
          setMatches(json.partidos);
          if (json.partidos.length > 0 && !selectedDinnerDate) {
            setSelectedDinnerDate(json.partidos[0].date);
          }
        }
      }
    } catch (e) {
      console.warn('Error sincronizando:', e);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [apiUrl]);

  const handleSelectUser = (user) => {
    setCurrentUser(user);
    localStorage.setItem('padel_current_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('padel_current_user');
    setSelectedMatchId(null);
  };

  // Registrar un nuevo usuario en Google Sheets y entrar directamente
  const handleRegisterUser = async (e) => {
    e.preventDefault();
    if (!newUserName.trim()) return;

    setSyncing(true);
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'REGISTRAR_JUGADOR',
          nombre: newUserName.trim(),
          grupo: newUserGroup,
          playtomic: newUserPlaytomic.trim()
        })
      });
      const json = await res.json();
      if (json.ok) {
        const createdUser = {
          id: json.id || 'u' + (players.length + 1),
          name: newUserName.trim(),
          group: newUserGroup.toLowerCase(),
          pJ: 0, pG: 0, cSi: 0, cNo: 0,
          ptsDeportivo: 0, ptsBarandas: 0, hibrido: 0,
          titulo: "Fichaje Estrella ⭐",
          deuda: 0
        };
        handleSelectUser(createdUser);
        setShowRegisterForm(false);
        fetchData();
      } else {
        alert('Error al registrar: ' + (json.error || 'Error desconocido'));
      }
    } catch (err) {
      alert('Error de conexión al registrar: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdateDinner = async (matchId, targetId, targetName, newStatus) => {
    setSyncing(true);
    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;
      return {
        ...m,
        players: m.players.map(p => {
          if (p.id === targetId || p.name.toLowerCase() === targetName.toLowerCase()) {
            return { ...p, dinner: newStatus };
          }
          return p;
        })
      };
    }));

    try {
      await fetch(apiUrl, {
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
      fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleTeam = (matchId, playerId) => {
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
  };

  const handleClaimSlot = async (matchId, slotOriginalName) => {
    if (!currentUser) return;
    setSyncing(true);
    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'VINCULAR_JUGADOR',
          idPartido: matchId,
          idJugador: currentUser.id,
          nombreOriginal: slotOriginalName
        })
      });
      fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveResult = async (matchId) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const winningPlayers = match.players.filter(p => p.team === Number(winnerTeam));
    const ganadoresNombres = winningPlayers.map(p => p.name);

    setSyncing(true);
    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'GUARDAR_RESULTADO',
          idPartido: matchId,
          marcador: scoreText,
          equipoGanador: winnerTeam,
          ganadores: ganadoresNombres,
          reiniciar: false
        })
      });
      setShowScoreModal(false);
      fetchData();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleResetMatch = async (matchId) => {
    if (!confirm('¿Deseas anular el resultado y dejar el partido como pendiente de jugar?')) return;
    setSyncing(true);
    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'GUARDAR_RESULTADO',
          idPartido: matchId,
          reiniciar: true
        })
      });
      fetchData();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleNotifyPending = (pendingList, dateLabel) => {
    if (!pendingList || pendingList.length === 0) {
      alert('¡No hay ningún jugador con estado pendiente!');
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('📢 Confirmación de Cena Requerida', {
        body: `Hay ${pendingList.length} jugadores pendientes de confirmar cena para ${dateLabel}.`,
        icon: 'https://cdn-icons-png.flaticon.com/512/2855/2855613.png'
      });
      alert(`Se ha enviado aviso para los pendientes.`);
    } else {
      alert(`Activa primero las Notificaciones en el engranaje ⚙️.`);
    }
  };

  const handleShareClubGlobalWhatsapp = (dateTarget, yesList, guestsList) => {
    const totalCount = yesList.length + guestsList.length;
    let msg = `🎾 *RESERVA 3º TIEMPO - PÁDEL CTC*\n`;
    msg += `📅 *Fecha:* ${dateTarget}\n`;
    msg += `👥 *Total Comensales Confirmados:* ${totalCount} personas\n\n`;
    msg += `*Jugadores:* \n` + (yesList.length ? yesList.map(n => `- ${n}`).join('\n') : '- Ninguno aún') + '\n';
    if (guestsList.length) {
      msg += `\n*Acompañantes:* \n` + guestsList.map(g => `- ${g}`).join('\n') + '\n';
    }
    msg += `\nConfirmado vía App Pádel CTC.`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURI(msg)}`, '_blank');
  };

  const currentMatch = matches.find(m => m.id === selectedMatchId);
  const availableDates = Array.from(new Set(matches.map(m => m.date)));
  const matchesForDinner = matches.filter(m => m.date === (selectedDinnerDate || (matches[0] && matches[0].date)));
  
  const dinnerYes = [];
  const dinnerNo = [];
  const dinnerPending = [];
  const dinnerGuests = [];

  matchesForDinner.forEach(m => {
    (m.players || []).forEach(p => {
      if (p.dinner === 'SI') dinnerYes.push(p.name);
      else if (p.dinner === 'NO') dinnerNo.push(p.name);
      else dinnerPending.push(p.name);
    });
    (m.guests || []).forEach(g => {
      dinnerGuests.push(g.name);
    });
  });

  // PANTALLA DE ACCESO / REGISTRO
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-slate-800 rounded-3xl p-6 border border-slate-700 shadow-2xl">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg shadow-blue-500/30">
            🎾
          </div>
          <h1 className="text-2xl font-black text-center mb-1">Pádel CTC</h1>
          <p className="text-slate-400 text-xs text-center mb-5">
            {showRegisterForm ? 'Regístrate para entrar al club' : 'Selecciona tu perfil de jugador (te recordaremos)'}
          </p>

          {!showRegisterForm ? (
            /* LISTA DE JUGADORES EXISTENTES */
            <>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1 mb-4">
                {players.length === 0 ? (
                  <p className="text-center text-slate-400 text-xs py-4">Cargando jugadores desde Google Sheets...</p>
                ) : (
                  players.map(u => (
                    <button
                      key={u.id}
                      onClick={() => handleSelectUser(u)}
                      className="w-full text-left bg-slate-700/60 hover:bg-blue-600 p-3 rounded-xl flex items-center justify-between transition group border border-slate-600/40"
                    >
                      <span className="font-semibold text-sm group-hover:text-white">{u.name}</span>
                      <span className="text-xs text-slate-400 group-hover:text-blue-100">{u.titulo}</span>
                    </button>
                  ))
                )}
              </div>

              {/* BOTÓN PARA CREAR NUEVO USUARIO */}
              <button
                onClick={() => setShowRegisterForm(true)}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-blue-300 hover:text-white rounded-xl text-xs font-bold transition border border-dashed border-slate-500 flex items-center justify-center gap-1.5"
              >
                <span>➕</span> ¿No estás en la lista? Añadir nuevo jugador
              </button>
            </>
          ) : (
            /* FORMULARIO DE ALTA DE JUGADOR */
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
                <label className="block text-xs font-bold text-slate-300 mb-1">Grupo</label>
                <div className="flex gap-2">
                  {['Chicos', 'Chicas'].map(g => (
                    <button
                      type="button"
                      key={g}
                      onClick={() => setNewUserGroup(g)}
                      className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${
                        newUserGroup === g
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-700 text-slate-300 border-slate-600'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-16">
      {/* CABECERA */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center text-xl shadow-md shadow-blue-600/20">
              🏆
            </div>
            <div>
              <h1 className="text-base font-black leading-tight">Pádel CTC</h1>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                {currentUser.name} · {currentUser.group}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg text-xs"
              title="Ajustes de Usuario"
            >
              ⚙️
            </button>
            <button
              onClick={() => setShowRulesModal(true)}
              className="px-2.5 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1 transition"
            >
              📖 Reglas
            </button>
            <button
              onClick={handleLogout}
              className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 rounded-lg transition"
            >
              Cambiar de Jugador
            </button>
            <button
              onClick={() => fetchData()}
              disabled={syncing}
              className={`p-1.5 text-slate-500 hover:text-blue-600 transition ${syncing ? 'animate-spin' : ''}`}
            >
              🔄
            </button>
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-xl mx-auto px-4 py-4">
        {selectedMatchId && currentMatch ? (
          /* DETALLE DEL PARTIDO */
          <div className="space-y-4">
            <button
              onClick={() => setSelectedMatchId(null)}
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
            >
              ← Volver a la lista de partidos
            </button>

            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-200">
                  {currentMatch.grupo}
                </span>

                {(() => {
                  const { canReport } = parseMatchTiming(currentMatch.date);
                  return (
                    <button
                      disabled={!canReport}
                      onClick={() => setShowScoreModal(true)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1 border transition ${
                        !canReport
                          ? 'opacity-40 bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                          : 'border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100'
                      }`}
                      title={!canReport ? 'Disponible a partir de la hora de inicio del partido' : ''}
                    >
                      🏆 Marcador
                    </button>
                  );
                })()}
              </div>

              <h2 className="text-xl font-black text-slate-900 mt-1">{currentMatch.date}</h2>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                📍 {currentMatch.location}
              </p>

              {/* BANNER +2H */}
              {currentMatch.status !== 'FINALIZADO' && parseMatchTiming(currentMatch.date).shouldPrompt && (
                <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-3 text-xs font-semibold my-3 flex items-center justify-between">
                  <span>⚠️ Han pasado 2h. Reporta el resultado oficial.</span>
                  <button
                    onClick={() => setShowScoreModal(true)}
                    className="bg-amber-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-amber-700 shrink-0 ml-2"
                  >
                    Reportar
                  </button>
                </div>
              )}

              {/* RESULTADO OFICIAL */}
              {currentMatch.status === 'FINALIZADO' && (
                <div className="bg-purple-50/80 border border-purple-200 rounded-2xl p-4 text-center my-4">
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 block">
                    Resultado Oficial
                  </span>
                  <p className="text-base font-black text-purple-950 mt-1">
                    {(() => {
                      const ganadores = (currentMatch.players || []).filter(p => p.won === 'SI');
                      if (ganadores.length > 0) {
                        return ganadores.map(p => p.name).join(' & ');
                      }
                      return currentMatch.score || 'Finalizado';
                    })()}
                  </p>
                  <p className="text-xs text-purple-700 font-medium mt-0.5">{currentMatch.score}</p>
                  <button
                    onClick={() => handleResetMatch(currentMatch.id)}
                    className="text-[11px] text-red-500 underline mt-2.5 hover:text-red-700 font-semibold block mx-auto"
                  >
                    Restablecer a pendiente de jugar
                  </button>
                </div>
              )}

              {/* ENLACE PLAYTOMIC */}
              {currentMatch.url && (
                <a
                  href={currentMatch.url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full bg-blue-50 text-blue-700 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 hover:bg-blue-100 transition mt-2"
                >
                  🔗 Abrir en Playtomic
                </a>
              )}

              {/* VINCULACIÓN EXPLÍCITA */}
              {(() => {
                const targetSlot = (currentMatch.players || []).find(p =>
                  p.id !== currentUser.id &&
                  p.name.toLowerCase().includes(currentUser.name.toLowerCase())
                );
                if (targetSlot && !dismissedLinks[currentMatch.id]) {
                  return (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 my-3">
                      <p className="text-xs text-blue-900 font-semibold">
                        ¿Eres tú <strong>"{targetSlot.name}"</strong> en la pista?
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleClaimSlot(currentMatch.id, targetSlot.name)}
                          className="bg-blue-600 text-white text-[11px] font-bold px-3 py-1 rounded-lg"
                        >
                          Sí, soy yo (Vincular)
                        </button>
                        <button
                          onClick={() => setDismissedLinks(prev => ({ ...prev, [currentMatch.id]: true }))}
                          className="text-slate-500 text-[11px] font-medium px-2 py-1"
                        >
                          No soy yo
                        </button>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* JUGADORES */}
              <div className="mt-5 space-y-4">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Jugadores Convocados (Parejas y Cenas)
                </h3>

                {[1, 2].map(teamNum => {
                  const teamPlayers = (currentMatch.players || []).filter(p => (p.team || 1) === teamNum);
                  const isP1 = teamNum === 1;

                  return (
                    <div
                      key={teamNum}
                      className={`border rounded-2xl p-3 ${
                        isP1 ? 'bg-blue-50/40 border-blue-200' : 'bg-amber-50/40 border-amber-200'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          isP1 ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'
                        }`}>
                          Pareja {teamNum}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">Pulsa P1/P2 para mover</span>
                      </div>

                      <div className="space-y-2">
                        {teamPlayers.length === 0 ? (
                          <p className="text-[11px] text-slate-400 italic py-1">Sin jugadores asignados</p>
                        ) : (
                          teamPlayers.map(p => {
                            const isMe = p.id === currentUser.id || p.name.toLowerCase() === currentUser.name.toLowerCase();
                            return (
                              <div
                                key={p.id || p.name}
                                className="bg-white rounded-xl p-2.5 flex items-center justify-between border border-slate-200/80 shadow-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleToggleTeam(currentMatch.id, p.id)}
                                    className="text-[10px] font-black bg-slate-100 hover:bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded"
                                  >
                                    P{p.team || 1} ⇄
                                  </button>
                                  <span className={`text-xs font-bold ${isMe ? 'text-blue-600' : 'text-slate-800'}`}>
                                    {p.name} {isMe && '(Tú)'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleUpdateDinner(currentMatch.id, p.id, p.name, p.dinner === 'SI' ? 'PENDIENTE' : 'SI')}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition ${
                                      p.dinner === 'SI'
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-emerald-50'
                                    }`}
                                  >
                                    Cena 🍻
                                  </button>
                                  <button
                                    onClick={() => handleUpdateDinner(currentMatch.id, p.id, p.name, p.dinner === 'NO' ? 'PENDIENTE' : 'NO')}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition ${
                                      p.dinner === 'NO'
                                        ? 'bg-rose-600 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-rose-50'
                                    }`}
                                  >
                                    No 🏃‍♂️
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* PESTAÑAS PRINCIPALES */
          <div className="space-y-4">
            {/* TABS DE NAVEGACIÓN */}
            <div className="flex bg-slate-200/80 p-1 rounded-2xl text-[11px] font-black">
              <button
                onClick={() => setActiveTab('partidos')}
                className={`flex-1 py-2 rounded-xl transition ${
                  activeTab === 'partidos' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
                }`}
              >
                Partidos 🎾
              </button>
              <button
                onClick={() => setActiveTab('cenas')}
                className={`flex-1 py-2 rounded-xl transition ${
                  activeTab === 'cenas' ? 'bg-white shadow text-emerald-800' : 'text-slate-600'
                }`}
              >
                Cena & Club 🍻
              </button>
              <button
                onClick={() => setActiveTab('rankings')}
                className={`flex-1 py-2 rounded-xl transition ${
                  activeTab === 'rankings' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
                }`}
              >
                Rankings 🏆
              </button>
              <button
                onClick={() => setActiveTab('bote')}
                className={`flex-1 py-2 rounded-xl transition ${
                  activeTab === 'bote' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
                }`}
              >
                Bote 💶
              </button>
            </div>

            {/* TAB 1: PARTIDOS */}
            {activeTab === 'partidos' && (
              <div className="space-y-3">
                {matches.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
                    <p className="text-2xl mb-1">🎾</p>
                    <p className="text-sm font-bold text-slate-700">No hay partidos programados</p>
                    <p className="text-xs text-slate-400 mt-1">Añade una fila en la hoja Partidos para que aparezca aquí.</p>
                  </div>
                ) : (
                  matches.map(m => (
                    <div
                      key={m.id}
                      onClick={() => setSelectedMatchId(m.id)}
                      className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:border-blue-400 cursor-pointer transition"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                            {m.grupo}
                          </span>
                          <h3 className="text-base font-black text-slate-900 mt-1">{m.date}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">📍 {m.location}</p>
                        </div>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                          m.status === 'FINALIZADO' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {m.status}
                        </span>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>👥 {(m.players || []).length} jugadores</span>
                        <span className="font-bold text-blue-600">Ver convocatoria →</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 2: CENA & CLUB */}
            {activeTab === 'cenas' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                  <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
                    Seleccionar Jornada de Cena:
                  </label>
                  <select
                    value={selectedDinnerDate}
                    onChange={(e) => setSelectedDinnerDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800"
                  >
                    {availableDates.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">Estado de la Reserva</h3>
                      <p className="text-xs text-slate-500">{selectedDinnerDate}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black text-emerald-600">
                        {dinnerYes.length + dinnerGuests.length}
                      </span>
                      <span className="text-[10px] text-slate-400 block font-bold">MESA PARA</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                      <span className="text-base font-black text-emerald-700 block">{dinnerYes.length + dinnerGuests.length}</span>
                      <span className="text-[10px] font-bold text-emerald-900 uppercase">Cenan SÍ</span>
                    </div>
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                      <span className="text-base font-black text-rose-700 block">{dinnerNo.length}</span>
                      <span className="text-[10px] font-bold text-rose-900 uppercase">Se Rajan</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                      <span className="text-base font-black text-amber-700 block">{dinnerPending.length}</span>
                      <span className="text-[10px] font-bold text-amber-900 uppercase">Pendientes</span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 text-xs">
                    <div>
                      <span className="font-extrabold text-emerald-800 block mb-1">
                        🟢 Confirmados ({dinnerYes.length + dinnerGuests.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {dinnerYes.concat(dinnerGuests).map((name, i) => (
                          <span key={i} className="bg-emerald-100 text-emerald-900 px-2 py-1 rounded-lg font-semibold text-[11px]">
                            {name}
                          </span>
                        ))}
                        {dinnerYes.length === 0 && dinnerGuests.length === 0 && (
                          <span className="text-slate-400 italic text-[11px]">Nadie confirmado aún</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="font-extrabold text-amber-800 block mb-1">
                        🟡 Sin responder ({dinnerPending.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {dinnerPending.map((name, i) => (
                          <span key={i} className="bg-amber-100 text-amber-900 px-2 py-1 rounded-lg font-semibold text-[11px]">
                            {name}
                          </span>
                        ))}
                        {dinnerPending.length === 0 && (
                          <span className="text-slate-400 italic text-[11px]">¡Todos han respondido!</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 space-y-2">
                    {dinnerPending.length > 0 && (
                      <button
                        onClick={() => handleNotifyPending(dinnerPending, selectedDinnerDate)}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
                      >
                        🔔 Enviar Notificación Push a los {dinnerPending.length} Pendientes
                      </button>
                    )}

                    <button
                      onClick={() => handleShareClubGlobalWhatsapp(selectedDinnerDate, dinnerYes, dinnerGuests)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
                    >
                      📲 Avisar al Restaurante / Club por WhatsApp ({dinnerYes.length + dinnerGuests.length} comensales)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: RANKINGS */}
            {activeTab === 'rankings' && (
              <div className="bg-white rounded-2xl p-4 border border-slate-200">
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
                  {[...players]
                    .sort((a, b) => {
                      if (rankingType === 'deportivo') return b.ptsDeportivo - a.ptsDeportivo;
                      if (rankingType === 'barandas') return b.ptsBarandas - a.ptsBarandas;
                      return b.hibrido - a.hibrido;
                    })
                    .map((p, idx) => (
                      <div key={p.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-400 w-4">{idx + 1}</span>
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

            {/* TAB 4: BOTE */}
            {activeTab === 'bote' && (
              <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                  <p className="font-bold">💶 Deuda acumulada del Bote</p>
                  <p className="text-[11px] mt-0.5">Calculada automáticamente sobre partidos disputados y cenas saltadas.</p>
                </div>

                <div className="space-y-2">
                  {[...players]
                    .sort((a, b) => b.deuda - a.deuda)
                    .map(p => (
                      <div key={p.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 text-xs">
                        <div>
                          <p className="font-bold text-slate-900">{p.name}</p>
                          <p className="text-[10px] text-slate-500">{p.pJ} partidos · {p.cSi} cenas</p>
                        </div>
                        <span className={`font-black text-sm px-2 py-0.5 rounded-lg ${
                          p.deuda > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {p.deuda} €
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL RESULTADO */}
      {showScoreModal && currentMatch && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl">
            <h3 className="text-base font-black text-slate-900 mb-3">Reportar Resultado Oficial</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Pareja Ganadora:</label>
                <div className="flex gap-2">
                  {[1, 2].map(num => (
                    <button
                      key={num}
                      onClick={() => setWinnerTeam(num)}
                      className={`flex-1 py-2 font-bold rounded-xl border transition ${
                        winnerTeam === num ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      Pareja {num}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Marcador (Sets):</label>
                <input
                  type="text"
                  value={scoreText}
                  onChange={(e) => setScoreText(e.target.value)}
                  placeholder="ej: 6-4, 6-3"
                  className="w-full border border-slate-300 rounded-xl p-2 font-semibold"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowScoreModal(false)} className="flex-1 py-2 font-bold bg-slate-100 text-slate-600 rounded-xl">
                  Cancelar
                </button>
                <button onClick={() => handleSaveResult(currentMatch.id)} className="flex-1 py-2 font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700">
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODALES AUXILIARES */}
      <CriteriosModal isOpen={showRulesModal} onClose={() => setShowRulesModal(false)} />
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        user={currentUser}
        notifEnabled={notifEnabled}
        onSaveNotifications={(val) => {
          setNotifEnabled(val);
          localStorage.setItem('padel_notif', String(val));
        }}
      />
    </div>
  );
}
