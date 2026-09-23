import React, { useState, useEffect, useMemo, useRef } from 'react';

// URL REAL DE TU BACKEND
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxkd-BmLpYxmLtev5wcxwsyda94bG1mFW9gtDpEAgsmhV1HCfDwn2-syPDEvBUPwiiiGw/exec';

const FALLBACK_USERS = [];
const FALLBACK_MATCHES = [];

// Limpiar y normalizar fecha (elimina horas, duraciones y espacios extras)
function extractCleanDate(dateStr) {
  if (!dateStr) return 'Sin fecha';
  return dateStr
    .replace(/\b\d{1,2}:\d{2}\b/g, '')
    .replace(/\(\d+min\)/gi, '')
    .replace(/,\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Convertir fecha del partido en objeto Date para horario
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

// Avatar con foto o iniciales
function UserAvatar({ name, photo, size = 'md', className = '' }) {
  const sizeClasses = {
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

// Modal Criterios y Reglas
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
          <p className="text-xs text-blue-900">
            Premia exclusivamente el rendimiento en pista:
          </p>
          <ul className="text-xs text-blue-900 space-y-1 list-disc list-inside">
            <li><strong>Victoria:</strong> +5 puntos.</li>
            <li><strong>Derrota:</strong> 0 puntos.</li>
          </ul>
        </section>

        <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2">
          <h4 className="font-extrabold text-emerald-950 text-xs uppercase tracking-wide">🍻 2. Ranking Barandas (3º Tiempo)</h4>
          <p className="text-xs text-emerald-900">
            Premia la asistencia a cenar tras el partido:
          </p>
          <ul className="text-xs text-emerald-900 space-y-1 list-disc list-inside">
            <li><strong>Quedarse a la cena:</strong> +5 puntos.</li>
            <li><strong>Jugar el partido:</strong> +1 punto (por compromiso y asistencia).</li>
            <li><strong>Rajarse de la cena habiendo jugado:</strong> -1 punto de penalización.</li>
          </ul>
          <p className="text-[11px] text-emerald-700 italic pt-1 border-t border-emerald-200/60 mt-2">
            * Nota: Los puntos de cena se computan al día siguiente del encuentro.
          </p>
        </section>

        <section className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-1.5">
          <h4 className="font-extrabold text-purple-950 text-xs uppercase tracking-wide">⚡ 3. Ranking Híbrido (Corona General)</h4>
          <p className="text-xs text-purple-900">
            Suma directa del <strong>Ranking Deportivo + Ranking Barandas</strong>.
          </p>
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

// Modal Perfil de Usuario con Notificaciones Push y Subida de Foto
function UserProfileModal({ isOpen, onClose, user, matches, onPhotoUploaded, notifEnabled, onToggleNotif }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  if (!isOpen || !user) return null;

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
          if (width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
          }
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

  const stats = (() => {
    let played = 0, won = 0, lost = 0, dinnerYes = 0, dinnerNo = 0;
    const partnerStats = {};
    const rivalStats = {};

    matches.forEach(m => {
      if (m.status !== 'FINALIZADO') return;
      const mySlot = (m.players || []).find(p => p.id === user.id || p.name.toLowerCase() === user.name.toLowerCase());
      if (!mySlot) return;

      played++;
      const didWin = mySlot.won === 'SI';
      if (didWin) won++; else lost++;

      if (mySlot.dinner === 'SI') dinnerYes++;
      if (mySlot.dinner === 'NO') dinnerNo++;

      const myTeam = mySlot.team;

      (m.players || []).forEach(p => {
        if (p.name.toLowerCase() === user.name.toLowerCase()) return;
        if (p.team === myTeam) {
          if (!partnerStats[p.name]) partnerStats[p.name] = { played: 0, won: 0 };
          partnerStats[p.name].played++;
          if (didWin) partnerStats[p.name].won++;
        } else {
          if (!rivalStats[p.name]) rivalStats[p.name] = { played: 0, wonAgainst: 0 };
          rivalStats[p.name].played++;
          if (didWin) rivalStats[p.name].wonAgainst++;
        }
      });
    });

    let bestPartner = null, worstPartner = null, bestPartnerPct = -1, worstPartnerPct = 999;
    Object.entries(partnerStats).forEach(([name, data]) => {
      const pct = (data.won / data.played) * 100;
      if (pct > bestPartnerPct) { bestPartnerPct = pct; bestPartner = { name, ...data, pct: pct.toFixed(0) }; }
      if (pct < worstPartnerPct) { worstPartnerPct = pct; worstPartner = { name, ...data, pct: pct.toFixed(0) }; }
    });

    let hardestRival = null, easiestRival = null, hardestPct = 999, easiestPct = -1;
    Object.entries(rivalStats).forEach(([name, data]) => {
      const pct = (data.wonAgainst / data.played) * 100;
      if (pct < hardestPct) { hardestPct = pct; hardestRival = { name, ...data, pct: pct.toFixed(0) }; }
      if (pct > easiestPct) { easiestPct = pct; easiestRival = { name, ...data, pct: pct.toFixed(0) }; }
    });

    return {
      played, won, lost,
      winRate: played > 0 ? ((won / played) * 100).toFixed(0) : 0,
      dinnerYes, dinnerNo,
      bestPartner, worstPartner,
      hardestRival, easiestRival
    };
  })();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full max-h-[90vh] overflow-y-auto p-5 shadow-2xl text-left space-y-4">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
              <UserAvatar name={user.name} photo={user.photo} size="lg" />
              <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-white text-xs font-bold">
                📷
              </div>
              <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">{user.name}</h3>
              <p className="text-xs text-blue-600 font-bold">{user.titulo}</p>
              <button
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                disabled={uploading}
                className="text-[10px] text-slate-500 underline font-semibold mt-0.5 block hover:text-blue-600"
              >
                {uploading ? 'Guardando...' : 'Cambiar foto de perfil'}
              </button>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl font-bold">&times;</button>
        </div>

        {/* ACTIVACIÓN DE NOTIFICACIONES PUSH */}
        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-800">Avisos de Convocatoria y Cena</p>
            <p className="text-[10px] text-slate-400">Recibir aviso si estás pendiente de responder</p>
          </div>
          <button
            onClick={onToggleNotif}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition ${
              notifEnabled ? 'bg-emerald-600 text-white shadow-xs' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {notifEnabled ? '✓ Activas' : '🔔 Activar'}
          </button>
        </div>

        {/* Marcadores */}
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

        {/* 3º Tiempo */}
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5">
            <span className="text-base font-black text-amber-800 block">{stats.dinnerYes}</span>
            <span className="text-[10px] font-bold text-amber-900 uppercase">Cenas Asistidas 🍻</span>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-2.5">
            <span className="text-base font-black text-purple-800 block">{stats.dinnerNo}</span>
            <span className="text-[10px] font-bold text-purple-900 uppercase">Rajadas 🏃‍♂️</span>
          </div>
        </div>

        {/* Dossier de Compañeros y Rivales */}
        <div className="space-y-2 pt-1">
          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Compañeros y Rivales</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold text-emerald-800 block uppercase">🌟 Mejor Pareja</span>
              <p className="font-black text-slate-900 text-xs mt-0.5 truncate">{stats.bestPartner ? stats.bestPartner.name : 'Sin datos'}</p>
              {stats.bestPartner && <span className="text-[10px] text-emerald-700 font-semibold">{stats.bestPartner.pct}% victorias</span>}
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold text-rose-800 block uppercase">💔 Pareja Gafe</span>
              <p className="font-black text-slate-900 text-xs mt-0.5 truncate">{stats.worstPartner ? stats.worstPartner.name : 'Sin datos'}</p>
              {stats.worstPartner && <span className="text-[10px] text-rose-700 font-semibold">{stats.worstPartner.pct}% victorias</span>}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold text-amber-800 block uppercase">😈 Bestia Negra</span>
              <p className="font-black text-slate-900 text-xs mt-0.5 truncate">{stats.hardestRival ? stats.hardestRival.name : 'Sin datos'}</p>
              {stats.hardestRival && <span className="text-[10px] text-amber-700 font-semibold">{stats.hardestRival.pct}% victorias vs él</span>}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold text-blue-800 block uppercase">🍰 Rival Favorito</span>
              <p className="font-black text-slate-900 text-xs mt-0.5 truncate">{stats.easiestRival ? stats.easiestRival.name : 'Sin datos'}</p>
              {stats.easiestRival && <span className="text-[10px] text-blue-700 font-semibold">{stats.easiestRival.pct}% victorias vs él</span>}
            </div>
          </div>
        </div>

        <button onClick={onClose} className="w-full py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs">Cerrar Perfil</button>
      </div>
    </div>
  );
}

// Modal PIN
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

export default function App() {
  const [apiUrl] = useState(() => localStorage.getItem('padel_api_url') || DEFAULT_API_URL);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('partidos');
  const [rankingType, setRankingType] = useState('hibrido');

  const [players, setPlayers] = useState(FALLBACK_USERS);
  const [matches, setMatches] = useState(FALLBACK_MATCHES);
  const [selectedMatchId, setSelectedMatchId] = useState(null);

  const [selectedDinnerDate, setSelectedDinnerDate] = useState('');
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const [notifEnabled, setNotifEnabled] = useState(() => localStorage.getItem('padel_notif') === 'true');

  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('padel_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [filterTime, setFilterTime] = useState('semana');
  const [targetPinUser, setTargetPinUser] = useState(null);

  // Registro de nuevo usuario en la landing page
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserGroup, setNewUserGroup] = useState('Chicos');
  const [newUserPlaytomic, setNewUserPlaytomic] = useState('');
  const [newUserPin, setNewUserPin] = useState('');

  // Modales
  const [showAddModal, setShowAddModal] = useState(false);
  const [playtomicText, setPlaytomicText] = useState('');
  const [matchGroup, setMatchGroup] = useState('chicos');

  const [showReloadPlaytomicModal, setShowReloadPlaytomicModal] = useState(false);
  const [reloadPlaytomicText, setReloadPlaytomicText] = useState('');

  const [showEditPlayersModal, setShowEditPlayersModal] = useState(false);
  const [editPlayerSlots, setEditPlayerSlots] = useState(['', '', '', '']);

  // Marcador
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [winnerTeam, setWinnerTeam] = useState(1);
  const [scoreText, setScoreText] = useState('6-4, 6-3');

  const fetchData = async () => {
    try {
      setSyncing(true);
      const res = await fetch(apiUrl, { method: 'GET', redirect: 'follow' });
      const json = await res.json();
      if (json.ok) {
        if (json.jugadores) {
          setPlayers(json.jugadores);
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
          if (json.partidos.length > 0 && !selectedDinnerDate) {
            setSelectedDinnerDate(extractCleanDate(json.partidos[0].date));
          }
        }
      }
    } catch (e) {
      console.warn('Sync error:', e);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchData();
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

  // REGISTRO DE NUEVO USUARIO
  const handleRegisterUser = async (e) => {
    e.preventDefault();
    if (!newUserName.trim()) return;
    if (newUserPin.trim().length !== 4) {
      alert('Debes indicar un PIN de 4 números');
      return;
    }

    setSyncing(true);
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'REGISTRAR_JUGADOR',
          nombre: newUserName.trim(),
          grupo: newUserGroup,
          playtomic: newUserPlaytomic.trim(),
          pin: newUserPin.trim()
        })
      });
      const json = await res.json();
      if (json.ok) {
        const createdUser = {
          id: json.id || 'u' + (players.length + 1),
          name: newUserName.trim(),
          group: newUserGroup.toLowerCase(),
          photo: '',
          pJ: 0, pG: 0, cSi: 0, cNo: 0,
          ptsDeportivo: 0, ptsBarandas: 0, hibrido: 0,
          titulo: "Fichaje Estrella ⭐",
          deuda: 0,
          pin: newUserPin.trim()
        };
        handlePinSuccess(createdUser);
        setShowRegisterForm(false);
        fetchData();
      } else {
        alert('Error: ' + (json.error || 'No se pudo registrar'));
      }
    } catch (err) {
      alert('Error de conexión: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleNotif = async () => {
    if (!('Notification' in window)) {
      alert('Tu navegador no soporta notificaciones web.');
      return;
    }

    if (notifEnabled) {
      setNotifEnabled(false);
      localStorage.setItem('padel_notif', 'false');
      alert('Notificaciones desactivadas.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNotifEnabled(true);
      localStorage.setItem('padel_notif', 'true');
      new Notification('Pádel CTC 🎾', {
        body: `¡Hola ${currentUser.name}! Notificaciones activadas con éxito.`,
        icon: 'https://cdn-icons-png.flaticon.com/512/2855/2855613.png'
      });
      alert('¡Notificaciones activadas!');
    } else {
      setNotifEnabled(false);
      localStorage.setItem('padel_notif', 'false');
      alert('No se otorgaron permisos de notificación.');
    }
  };

  // Subir Foto
  const handlePhotoUploaded = async (idJugador, photoBase64) => {
    setSyncing(true);
    setCurrentUser(prev => ({ ...prev, photo: photoBase64 }));
    setPlayers(prev => prev.map(p => p.id === idJugador ? { ...p, photo: photoBase64 } : p));
    localStorage.setItem('padel_current_user', JSON.stringify({ ...currentUser, photo: photoBase64 }));

    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'SUBIR_FOTO', idJugador, photoBase64 })
      });
      fetchData();
    } catch (e) {
      alert('Error guardando foto: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  // Borrar Partido
  const handleDeleteMatchComplete = async (matchId) => {
    if (!confirm('¿Quieres BORRAR POR COMPLETO esta reserva? Se eliminará de la app y de Google Sheets.')) return;
    setSyncing(true);
    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ELIMINAR_PARTIDO', idPartido: matchId })
      });
      setSelectedMatchId(null);
      fetchData();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  // Crear Partido
  const handleAddPlaytomicMatch = async (e) => {
    e.preventDefault();
    if (!playtomicText.trim()) return;

    setSyncing(true);
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'CREAR_PARTIDO_PLAYTOMIC', textoCrudo: playtomicText, grupo: matchGroup })
      });
      const data = await res.json();
      if (data.ok) {
        setShowAddModal(false);
        setPlaytomicText('');
        fetchData();
      } else {
        alert('Error: ' + data.error);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  // Recargar Playtomic
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
      alert('Error: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  // Guardar Suplentes Manuales
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
      alert('Error: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  // Apuntarse solo a cenar
  const handleToggleSoloCena = async (dateStr, newState) => {
    setSyncing(true);
    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'APUNTARSE_SOLO_CENA', fecha: dateStr, nombreJugador: currentUser.name, estado: newState })
      });
      fetchData();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  // Voto cena en partido
  const handleUpdateDinner = async (matchId, targetId, targetName, newStatus) => {
    setSyncing(true);
    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ACTUALIZAR_CENA', idPartido: matchId, idJugador: targetId, nombreJugador: targetName, estado: newStatus })
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
        players: m.players.map(p => p.id === playerId ? { ...p, team: p.team === 1 ? 2 : 1 } : p)
      };
    }));
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
        body: JSON.stringify({ action: 'GUARDAR_RESULTADO', idPartido: matchId, marcador: scoreText, ganadores: ganadoresNombres, reiniciar: false })
      });
      setShowScoreModal(false);
      fetchData();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  // Push a pendientes
  const handleNotifyPending = (pendingList, dateLabel) => {
    if (!pendingList || pendingList.length === 0) {
      alert('¡No hay jugadores pendientes!');
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('📢 Confirmación 3º Tiempo CTC', {
        body: `Hay ${pendingList.length} jugadores pendientes de confirmar cena para ${dateLabel}.`,
        icon: 'https://cdn-icons-png.flaticon.com/512/2855/2855613.png'
      });
      alert(`Aviso enviado para los ${pendingList.length} pendientes.`);
    } else {
      alert('Activa primero las Notificaciones en tu Perfil 👤 pulsando en tu avatar arriba a la izquierda.');
    }
  };

  // WhatsApp
  const handleShareClubWhatsapp = (dateTarget, yesList, guestsList) => {
    const totalCount = yesList.length + guestsList.length;
    let msg = `🎾 *RESERVA 3º TIEMPO - PÁDEL CTC*\n`;
    msg += `📅 *Fecha:* ${dateTarget}\n`;
    msg += `👥 *Total Comensales Confirmados:* ${totalCount} personas\n\n`;
    msg += `*Jugadores:* \n` + (yesList.length ? yesList.map(n => `- ${n.name || n}`).join('\n') : '- Ninguno aún') + '\n';
    if (guestsList.length) {
      msg += `\n*Acompañantes / Sin partido:* \n` + guestsList.map(g => `- ${g.name || g}`).join('\n') + '\n';
    }
    msg += `\nConfirmado vía App Pádel CTC.`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURI(msg)}`, '_blank');
  };

  const currentMatch = matches.find(m => m.id === selectedMatchId);
  const myGroup = (currentUser?.group || 'chicos').toLowerCase();

  const filteredMatches = useMemo(() => {
    return matches.filter(m => {
      if ((m.grupo || 'chicos').toLowerCase() !== myGroup) return false;
      if (filterTime === 'todos') return true;
      if (filterTime === 'semana') return m.week === 'actual' || m.status === 'PROGRAMADO';
      if (filterTime === 'proximos') return m.status === 'PROGRAMADO';
      return true;
    });
  }, [matches, myGroup, filterTime]);

  const groupPlayers = useMemo(() => {
    return players.filter(p => (p.group || 'chicos').toLowerCase() === myGroup);
  }, [players, myGroup]);

  // Lista de fechas únicas para la cena normalizadas
  const availableDinnerDates = useMemo(() => {
    const datesMap = new Map();
    matches.forEach(m => {
      const cleanKey = extractCleanDate(m.date);
      if (cleanKey && cleanKey !== 'sin fecha') {
        if (!datesMap.has(cleanKey)) {
          const niceLabel = cleanKey.charAt(0).toUpperCase() + cleanKey.slice(1);
          datesMap.set(cleanKey, niceLabel);
        }
      }
    });
    return Array.from(datesMap.entries()).map(([key, label]) => ({ key, label }));
  }, [matches]);

  const activeDinnerKey = selectedDinnerDate || (availableDinnerDates.length > 0 ? availableDinnerDates[0].key : '');

  // Partidos del día de la cena
  const matchesForDinner = useMemo(() => {
    if (!activeDinnerKey) return [];
    return matches.filter(m => extractCleanDate(m.date) === activeDinnerKey);
  }, [matches, activeDinnerKey]);

  const { dinnerYes, dinnerNo, dinnerPending, dinnerGuests } = useMemo(() => {
    const yesMap = new Map();
    const noMap = new Map();
    const pendingMap = new Map();
    const guestList = [];

    matchesForDinner.forEach(m => {
      (m.players || []).forEach(p => {
        if (p.dinner === 'SI') {
          yesMap.set(p.name, p.photo);
          pendingMap.delete(p.name);
          noMap.delete(p.name);
        } else if (p.dinner === 'NO') {
          noMap.set(p.name, p.photo);
          pendingMap.delete(p.name);
          yesMap.delete(p.name);
        } else {
          if (!yesMap.has(p.name) && !noMap.has(p.name)) {
            pendingMap.set(p.name, p.photo);
          }
        }
      });
      (m.guests || []).forEach(g => guestList.push(g));
    });

    return {
      dinnerYes: Array.from(yesMap.entries()).map(([name, photo]) => ({ name, photo })),
      dinnerNo: Array.from(noMap.entries()).map(([name, photo]) => ({ name, photo })),
      dinnerPending: Array.from(pendingMap.entries()).map(([name, photo]) => ({ name, photo })),
      dinnerGuests: guestList
    };
  }, [matchesForDinner]);

  const isUserInDinner = dinnerYes.some(item => item.name === currentUser?.name);

  const currentVisualDinnerLabel = useMemo(() => {
    const found = availableDinnerDates.find(d => d.key === activeDinnerKey);
    return found ? found.label : (activeDinnerKey || 'Jornada seleccionada');
  }, [availableDinnerDates, activeDinnerKey]);

  // LANDING PAGE: SELECCIÓN DE USUARIO / REGISTRO
  if (!currentUser) {
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
                {players.length === 0 ? (
                  <p className="text-center text-slate-400 text-xs py-4">Cargando jugadores desde Google Sheets...</p>
                ) : (
                  players.map(u => (
                    <button
                      key={u.id}
                      onClick={() => handleUserClick(u)}
                      className="w-full text-left bg-slate-700/60 hover:bg-blue-600 p-3 rounded-2xl flex items-center justify-between transition group border border-slate-600/40"
                    >
                      <div className="flex items-center gap-3">
                        <UserAvatar name={u.name} photo={u.photo} size="sm" />
                        <span className="font-semibold text-sm group-hover:text-white">{u.name}</span>
                      </div>
                      <span className="text-xs text-slate-400 group-hover:text-blue-100">{u.titulo}</span>
                    </button>
                  ))
                )}
              </div>

              {/* BOTÓN ALTA NUEVO JUGADOR */}
              <button
                onClick={() => setShowRegisterForm(true)}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-blue-300 hover:text-white rounded-2xl text-xs font-bold transition border border-dashed border-slate-500 flex items-center justify-center gap-1.5"
              >
                <span>➕</span> ¿No estás en la lista? Añadir nuevo jugador
              </button>
            </>
          ) : (
            /* FORMULARIO DE ALTA DE NUEVO JUGADOR */
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
      {/* CABECERA */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div
            onClick={() => setShowProfileModal(true)}
            className="flex items-center gap-2.5 cursor-pointer group"
            title="Ver estadísticas y activar notificaciones"
          >
            <UserAvatar name={currentUser.name} photo={currentUser.photo} size="md" className="group-hover:ring-2 group-hover:ring-blue-500 transition" />
            <div>
              <h1 className="text-base font-black leading-tight flex items-center gap-1 group-hover:text-blue-600 transition">
                {currentUser.name} <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md font-bold">Ver perfil</span>
              </h1>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                {currentUser.group} · {currentUser.titulo}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowRulesModal(true)}
              className="px-2.5 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
            >
              📖 Reglas
            </button>
            <button
              onClick={handleLogout}
              className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 rounded-lg transition"
            >
              Salir
            </button>
            <button
              onClick={fetchData}
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
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-200">
                  {currentMatch.grupo}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeleteMatchComplete(currentMatch.id)}
                    className="text-xs font-bold text-rose-600 hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 transition"
                  >
                    🗑️ Borrar Partido
                  </button>

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

                  return (
                    <div
                      key={teamNum}
                      className={`border rounded-2xl p-3.5 ${
                        isP1 ? 'bg-blue-50/40 border-blue-200' : 'bg-amber-50/40 border-amber-200'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-2.5">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md ${
                          isP1 ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'
                        }`}>
                          Pareja {teamNum}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">Pulsa P1/P2 para mover</span>
                      </div>

                      <div className="space-y-2">
                        {teamPlayers.map(p => {
                          const isMe = p.id === currentUser.id || p.name.toLowerCase() === currentUser.name.toLowerCase();
                          return (
                            <div
                              key={p.id || p.name}
                              className="bg-white rounded-2xl p-2.5 flex items-center justify-between border border-slate-200 shadow-xs"
                            >
                              <div className="flex items-center gap-2.5">
                                <button
                                  onClick={() => handleToggleTeam(currentMatch.id, p.id)}
                                  className="text-[10px] font-black bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded"
                                >
                                  P{p.team || 1} ⇄
                                </button>
                                <UserAvatar name={p.name} photo={p.photo} size="sm" />
                                <div>
                                  <span className={`text-xs font-bold block ${isMe ? 'text-blue-600 font-black' : 'text-slate-800'}`}>
                                    {p.name} {isMe && '(Tú)'}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {p.dinner === 'SI' ? '🍻 Cena confirmada' : p.dinner === 'NO' ? '🏃‍♂️ Se raja' : '🟡 Cena pendiente'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleUpdateDinner(currentMatch.id, p.id, p.name, p.dinner === 'SI' ? 'PENDIENTE' : 'SI')}
                                  className={`px-2.5 py-1 rounded-xl text-[10px] font-bold ${
                                    p.dinner === 'SI' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  Cena 🍻
                                </button>
                                <button
                                  onClick={() => handleUpdateDinner(currentMatch.id, p.id, p.name, p.dinner === 'NO' ? 'PENDIENTE' : 'NO')}
                                  className={`px-2.5 py-1 rounded-xl text-[10px] font-bold ${
                                    p.dinner === 'NO' ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600'
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
                  );
                })}
              </div>

              {/* TARJETA RESTAURADA: PREGUNTA RÁPIDA DE CENA AL USUARIO ACTIVO */}
              {(() => {
                const mySlot = (currentMatch.players || []).find(p => p.id === currentUser.id || p.name.toLowerCase() === currentUser.name.toLowerCase());
                if (!mySlot) return null;

                return (
                  <div className="mt-5 pt-4 border-t border-slate-100 text-center">
                    <p className="text-xs font-black text-slate-800 uppercase tracking-wide mb-2.5">
                      ¿Te quedas al 3º tiempo?
                    </p>
                    <div className="flex gap-2.5">
                      <button
                        onClick={() => handleUpdateDinner(currentMatch.id, mySlot.id, mySlot.name, 'SI')}
                        className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs transition border ${
                          mySlot.dinner === 'SI'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50'
                        }`}
                      >
                        ✓ ¡SÍ, CLARO! 🍻
                      </button>
                      <button
                        onClick={() => handleUpdateDinner(currentMatch.id, mySlot.id, mySlot.name, 'NO')}
                        className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs transition border ${
                          mySlot.dinner === 'NO'
                            ? 'bg-rose-600 text-white border-rose-600 shadow-md'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50'
                        }`}
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
            </div>

            {/* TAB 1: PARTIDOS */}
            {activeTab === 'partidos' && (
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
                    <p className="text-sm font-bold text-slate-700">No hay partidos de {currentUser.group}</p>
                  </div>
                ) : (
                  filteredMatches.map(m => (
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
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 2: CENA & CLUB UNIFICADA POR DÍA */}
            {activeTab === 'cenas' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                  <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
                    Jornada de Cena:
                  </label>
                  <select
                    value={activeDinnerKey}
                    onChange={(e) => setSelectedDinnerDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800"
                  >
                    {availableDinnerDates.map(d => (
                      <option key={d.key} value={d.key}>{d.label}</option>
                    ))}
                  </select>
                </div>

                {/* BOTÓN APUNTARSE SIN JUGAR */}
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

                {/* PANEL DE MESA UNIFICADA */}
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

                  {/* 3 CAJAS RESUMEN DE ESTADO */}
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

                  {/* LISTAS DETALLADAS CON AVATARES */}
                  <div className="space-y-3 pt-2 text-xs">
                    <div>
                      <span className="font-extrabold text-emerald-800 block mb-2">
                        🟢 Confirmados ({dinnerYes.length + dinnerGuests.length}):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {dinnerYes.concat(dinnerGuests).map((item, i) => (
                          <div key={i} className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-950 px-2.5 py-1 rounded-xl font-bold text-xs shadow-2xs">
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
                          <div key={i} className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 text-rose-950 px-2.5 py-1 rounded-xl font-semibold text-xs">
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
                          <div key={i} className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-950 px-2.5 py-1 rounded-xl font-semibold text-xs">
                            <UserAvatar name={item.name} photo={item.photo} size="sm" />
                            <span>{item.name}</span>
                          </div>
                        ))}
                        {dinnerPending.length === 0 && (
                          <span className="text-slate-400 italic text-[11px]">¡Todos han respondido!</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* BOTONES DE ACCIÓN: PUSH Y WHATSAPP */}
                  <div className="pt-2 space-y-2 border-t border-slate-100">
                    {dinnerPending.length > 0 && (
                      <button
                        onClick={() => handleNotifyPending(dinnerPending, currentVisualDinnerLabel)}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-2xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
                      >
                        🔔 Enviar Notificación Push a los {dinnerPending.length} Pendientes
                      </button>
                    )}

                    <button
                      onClick={() => handleShareClubWhatsapp(currentVisualDinnerLabel, dinnerYes, dinnerGuests)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-2xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
                    >
                      📲 Avisar al Restaurante / Club por WhatsApp ({dinnerYes.length + dinnerGuests.length} comensales)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: RANKINGS DEL GRUPO */}
            {activeTab === 'rankings' && (
              <div className="bg-white rounded-2xl p-4 border border-slate-200">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200">
                    Ranking {currentUser.group}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold">{groupPlayers.length} jugadores</span>
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
                  {[...groupPlayers]
                    .sort((a, b) => {
                      if (rankingType === 'deportivo') return b.ptsDeportivo - a.ptsDeportivo;
                      if (rankingType === 'barandas') return b.ptsBarandas - a.ptsBarandas;
                      return b.hibrido - a.hibrido;
                    })
                    .map((p, idx) => (
                      <div key={p.id} className="flex items-center justify-between p-2 rounded-2xl bg-slate-50 text-xs">
                        <div className="flex items-center gap-2.5">
                          <span className="font-black text-slate-400 w-4 text-center">{idx + 1}</span>
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

            {/* TAB 4: BOTE */}
            {activeTab === 'bote' && (
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
                      <div key={p.id} className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 text-xs">
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

      {/* MODAL AÑADIR PARTIDO */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-black text-slate-900">Añadir Partido Playtomic</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
            </div>
            <form onSubmit={handleAddPlaytomicMatch} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Grupo</label>
                <div className="flex gap-2">
                  {['chicos', 'chicas'].map(g => (
                    <button
                      type="button"
                      key={g}
                      onClick={() => setMatchGroup(g)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold uppercase transition ${matchGroup === g ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
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

      {/* MODAL MARCADOR */}
      {showScoreModal && currentMatch && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl">
            <h3 className="text-base font-black text-slate-900 mb-3">Reportar Marcador Oficial</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Pareja Ganadora:</label>
                <div className="flex gap-2">
                  {[1, 2].map(num => (
                    <button
                      key={num}
                      onClick={() => setWinnerTeam(num)}
                      className={`flex-1 py-2 font-bold rounded-xl border transition ${winnerTeam === num ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
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
                <button onClick={() => setShowScoreModal(false)} className="flex-1 py-2 font-bold bg-slate-100 text-slate-600 rounded-xl">Cancelar</button>
                <button onClick={() => handleSaveResult(currentMatch.id)} className="flex-1 py-2 font-bold bg-blue-600 text-white rounded-xl">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODALES AUXILIARES */}
      <CriteriosModal isOpen={showRulesModal} onClose={() => setShowRulesModal(false)} />
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={currentUser}
        matches={matches}
        onPhotoUploaded={handlePhotoUploaded}
        notifEnabled={notifEnabled}
        onToggleNotif={handleToggleNotif}
      />
    </div>
  );
}
