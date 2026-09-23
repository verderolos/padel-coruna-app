import React, { useState, useEffect } from 'react';
import { 
  Trophy, CalendarPlus, MapPin, ExternalLink, X, 
  MessageCircle, Home, PiggyBank, FileText, Wand2, 
  Loader2, UserPlus, Trash2, RefreshCw, Settings, AlertTriangle, Check
} from 'lucide-react';

// URL real desplegada en Google Apps Script
const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbxkd-BmLpYxmLtev5wcxwsyda94bG1mFW9gtDpEAgsmhV1HCfDwn2-syPDEvBUPwiiiGw/exec";

// Datos de respaldo inmediatos por si falla la conexión puntualmente
const FALLBACK_USERS = [
  { id: 'u1', name: 'Bruno Otero', group: 'chicos', pJ: 15, pG: 12, cSi: 14, cNo: 1, ptsDeportivo: 66, ptsBarandas: 255, hibrido: 321, titulo: "Leyenda del 3º Tiempo 🍻", deuda: 4 },
  { id: 'u2', name: 'Alberto Casado', group: 'chicos', pJ: 12, pG: 8, cSi: 10, cNo: 2, ptsDeportivo: 48, ptsBarandas: 186, hibrido: 234, titulo: "Leyenda del 3º Tiempo 🍻", deuda: 6 },
  { id: 'u3', name: 'Borja Padel', group: 'chicos', pJ: 8, pG: 3, cSi: 2, cNo: 5, ptsDeportivo: 25, ptsBarandas: 54, hibrido: 79, titulo: "Deportista de Postureo 🥦", deuda: 10 },
  { id: 'u4', name: 'Edu Cutino', group: 'chicos', pJ: 10, pG: 6, cSi: 9, cNo: 1, ptsDeportivo: 38, ptsBarandas: 165, hibrido: 203, titulo: "Gastrónomo con Pala 🍔", deuda: 5 },
  { id: 'u5', name: 'Gus', group: 'chicos', pJ: 11, pG: 7, cSi: 8, cNo: 2, ptsDeportivo: 43, ptsBarandas: 153, hibrido: 196, titulo: "Jugador Promedio 🎾", deuda: 6 }
];

const FALLBACK_MATCH = {
  id: 'P-001',
  date: 'Jueves 21:00',
  location: 'Club de Tenis de La Coruña',
  url: 'https://app.playtomic.com/',
  grupo: 'chicos'
};

const FALLBACK_ATTENDEES = [
  { id: 'u1', name: 'Bruno Otero', dinner: 'SI', isExternal: false },
  { id: 'u2', name: 'Alberto Casado', dinner: 'PENDIENTE', isExternal: false },
  { id: 'u3', name: 'Borja Padel', dinner: 'NO', isExternal: false },
  { id: 'u4', name: 'Edu Cutino', dinner: 'SI', isExternal: false }
];

export default function App() {
  const [apiUrl, setApiUrl] = useState(() => {
    return localStorage.getItem('padel_api_url') || DEFAULT_API_URL;
  });
  const [apiUrlInput, setApiUrlInput] = useState(apiUrl);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('partidos');
  const [rankingType, setRankingType] = useState('hibrido');
  const [showNewMatch, setShowNewMatch] = useState(false);
  const [guestInput, setGuestInput] = useState('');

  // Perfil de usuario guardado en navegador
  const [myProfile, setMyProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('padel_my_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Datos principales de la aplicación
  const [allUsers, setAllUsers] = useState(FALLBACK_USERS);
  const [matchData, setMatchData] = useState(FALLBACK_MATCH);
  const [players, setPlayers] = useState(FALLBACK_ATTENDEES);
  const [dinnerGuests, setDinnerGuests] = useState([
    { id: 'inv-1', name: 'Lucía (Acompañante)' }
  ]);

  // Formulario de creación de partido
  const [rawText, setRawText] = useState('');
  const [matchGroup, setMatchGroup] = useState('chicos');

  const fetchData = async (customUrl = apiUrl) => {
    try {
      setSyncing(true);
      // Google Apps Script suele redirigir mediante 302; follow asegura seguir la redirección
      const res = await fetch(customUrl, {
        method: 'GET',
        redirect: 'follow'
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      
      const json = await res.json();
      if (json.ok) {
        if (json.jugadores && json.jugadores.length > 0) {
          setAllUsers(json.jugadores);
          // Si el perfil ya seleccionado existe en los nuevos datos, actualizarlo
          if (myProfile) {
            const updatedProfile = json.jugadores.find(u => u.id === myProfile.id);
            if (updatedProfile) {
              setMyProfile(updatedProfile);
              localStorage.setItem('padel_my_user', JSON.stringify(updatedProfile));
            }
          }
        }
        if (json.partido) setMatchData(json.partido);
        if (json.asistentes && json.asistentes.length > 0) setPlayers(json.asistentes);
        if (json.invitados) setDinnerGuests(json.invitados);
        setIsDemoMode(false);
      } else {
        throw new Error(json.error || "Formato devuelto no válido");
      }
    } catch (e) {
      console.warn("Aviso: no se pudo obtener respuesta directa de Google Sheets. Usando datos de respaldo.", e);
      setIsDemoMode(true);
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
  };

  const handleSaveApiUrl = (e) => {
    e.preventDefault();
    const cleanUrl = apiUrlInput.trim();
    setApiUrl(cleanUrl);
    localStorage.setItem('padel_api_url', cleanUrl);
    setShowConfigModal(false);
    setLoading(true);
    fetchData(cleanUrl);
  };

  const sendPostToAppsScript = async (payload) => {
    try {
      // Envío text/plain para evitar bloqueos por Preflight CORS en navegadores
      await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });
      return { ok: true };
    } catch (err) {
      console.warn("Error al enviar acción a Apps Script:", err);
      return { ok: false };
    }
  };

  const handleVoteDinner = async (status) => {
    if (!myProfile || !matchData) return;
    
    // Optimistic UI: actualización instantánea en pantalla
    setPlayers(prev => prev.map(p => p.id === myProfile.id ? { ...p, dinner: status } : p));

    await sendPostToAppsScript({
      action: 'ACTUALIZAR_CENA',
      idPartido: matchData.id,
      idJugador: myProfile.id,
      estado: status
    });
  };

  const handleAddGuest = async (e) => {
    e.preventDefault();
    if (!guestInput.trim() || !matchData) return;

    const nombre = guestInput.trim();
    const tempId = 'temp-' + Date.now();
    setDinnerGuests(prev => [...prev, { id: tempId, name: nombre }]);
    setGuestInput('');

    await sendPostToAppsScript({
      action: 'ANADIR_INVITADO',
      idPartido: matchData.id,
      nombre: nombre
    });
  };

  const handleRemoveGuest = async (idInvitado) => {
    setDinnerGuests(prev => prev.filter(g => g.id !== idInvitado));
    await sendPostToAppsScript({
      action: 'ELIMINAR_INVITADO',
      idInvitado: idInvitado
    });
  };

  const handleCreateMatch = async (e) => {
    e.preventDefault();
    if (!rawText.trim()) return;
    
    setLoading(true);

    let parsedDate = 'Próximo partido';
    let parsedLoc = 'Club de Tenis de La Coruña';
    let parsedUrl = 'https://app.playtomic.com/';

    const dateMatch = rawText.match(/📅\s*([^\n]+)/);
    if (dateMatch) parsedDate = dateMatch[1].replace(/\s*\(\d+min\)/, '').trim();

    const locMatch = rawText.match(/📍\s*([^\n]+)/);
    if (locMatch) parsedLoc = locMatch[1].trim();

    const urlMatch = rawText.match(/(https:\/\/app\.playtomic\.com[^\s]+)/);
    if (urlMatch) parsedUrl = urlMatch[1];

    const nuevoPartidoLocal = {
      id: 'P-' + Date.now().toString().slice(-4),
      date: parsedDate,
      location: parsedLoc,
      url: parsedUrl,
      grupo: matchGroup
    };

    setMatchData(nuevoPartidoLocal);

    await sendPostToAppsScript({
      action: 'CREAR_PARTIDO',
      rawText: rawText,
      grupo: matchGroup
    });

    setShowNewMatch(false);
    setRawText('');
    setLoading(false);
    // Recargar datos para traer la asignación generada en Google Sheets
    setTimeout(() => fetchData(), 1200);
  };

  if (!myProfile) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans text-white">
        <div className="max-w-md w-full bg-slate-800 rounded-3xl p-6 border border-slate-700 shadow-2xl">
          <div className="text-center mb-6">
            <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-2" />
            <h1 className="text-2xl font-black">¿Quién eres?</h1>
            <p className="text-xs text-slate-400 mt-1">Elige tu nombre para acceder a tu sesión en este dispositivo</p>
          </div>

          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1 mb-4">
              {allUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => selectMyUser(u)}
                  className="w-full text-left p-3.5 bg-slate-700 hover:bg-blue-600 rounded-xl font-bold flex justify-between items-center transition-all"
                >
                  <span>{u.name}</span>
                  <span className="text-[10px] text-slate-300 uppercase px-2 py-0.5 rounded bg-slate-800 font-semibold">{u.group || 'chicos'}</span>
                </button>
              ))}
            </div>
          )}

          <div className="pt-3 border-t border-slate-700/60 flex justify-between items-center text-xs">
            <button 
              onClick={() => setShowConfigModal(true)} 
              className="text-slate-400 hover:text-blue-400 flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" /> Servidor Apps Script
            </button>
          </div>
        </div>

        {/* Modal de configuración de la URL */}
        {showConfigModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl max-w-sm w-full">
              <h3 className="text-sm font-bold mb-2">URL Web App Google Apps Script</h3>
              <p className="text-xs text-slate-400 mb-3">Dirección del endpoint final terminada en <code className="text-blue-400">/exec</code>.</p>
              <form onSubmit={handleSaveApiUrl}>
                <input 
                  type="text"
                  value={apiUrlInput}
                  onChange={e => setApiUrlInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white mb-3"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowConfigModal(false)} className="flex-1 py-2 bg-slate-700 rounded-lg text-xs">Cancelar</button>
                  <button type="submit" className="flex-1 py-2 bg-blue-600 font-bold rounded-lg text-xs">Guardar</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  const activeGroupUsers = allUsers.filter(u => (u.group || 'chicos') === (myProfile.group || 'chicos'));
  const totalCenas = players.filter(p => p.dinner === 'SI').length + dinnerGuests.length;
  const whatsappMsg = encodeURIComponent(`Hola, somos el grupo de pádel. Hoy seremos ${totalCenas} personas para cenar.`);

  return (
    <div className="min-h-screen bg-gray-100 font-sans selection:bg-blue-200">
      <div className="max-w-md mx-auto bg-gray-50 min-h-screen relative shadow-2xl flex flex-col pb-20">
        
        {/* Cabecera */}
        <header className="bg-white px-5 py-4 flex items-center justify-between shadow-sm sticky top-0 z-30 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-sm"><Trophy className="w-5 h-5" /></div>
            <div>
              <h1 className="font-black text-gray-900 leading-tight">Pádel CTC</h1>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                {myProfile.name} ({myProfile.group || 'chicos'})
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setShowConfigModal(true)} 
              className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100"
              title="Ajustes de conexión"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button 
              onClick={() => fetchData()} 
              disabled={syncing}
              className="p-2 text-gray-500 hover:text-blue-600 rounded-xl hover:bg-gray-100"
              title="Sincronizar ahora"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </header>

        {/* PESTAÑA: PARTIDOS */}
        {activeTab === 'partidos' && (
          <main className="p-4 flex-1">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black text-gray-800">Próximo Partido</h2>
              <button 
                onClick={() => setShowNewMatch(true)} 
                className="bg-gray-900 text-white px-3 py-1.5 rounded-full font-bold text-xs flex items-center gap-1.5 shadow hover:bg-gray-800 transition-all"
              >
                <CalendarPlus className="w-4 h-4" /> Nuevo
              </button>
            </div>

            {matchData ? (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-6">
                <div className="p-5 border-b border-gray-100">
                  <h3 className="text-xl font-black text-gray-800">{matchData.date}</h3>
                  <p className="text-gray-500 flex items-center gap-1 text-xs mt-1 mb-4">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" /> {matchData.location}
                  </p>
                  <a 
                    href={matchData.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="w-full bg-blue-50 text-blue-600 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs border border-blue-100 hover:bg-blue-100 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> Abrir en Playtomic
                  </a>
                </div>

                {/* Votación personal de cena */}
                <div className="p-4 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-black text-gray-600 mb-2 text-center uppercase tracking-wider">¿Te quedas al 3º Tiempo?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => handleVoteDinner('SI')}
                      className={`py-3 rounded-xl font-black text-xs transition-all ${
                        players.find(p => p.id === myProfile.id)?.dinner === 'SI' 
                          ? 'bg-green-600 text-white shadow-md' 
                          : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      ¡SÍ, CLARO! 🍻
                    </button>
                    <button 
                      onClick={() => handleVoteDinner('NO')}
                      className={`py-3 rounded-xl font-black text-xs transition-all ${
                        players.find(p => p.id === myProfile.id)?.dinner === 'NO' 
                          ? 'bg-red-500 text-white shadow-md' 
                          : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      ME RAJO 🏃‍♂️
                    </button>
                  </div>
                </div>

                {/* Botón WhatsApp Restaurante */}
                <div className="p-4 bg-orange-50 flex items-center justify-between gap-3">
                  <div>
                    <span className="block font-black text-orange-950 text-sm">Reserva Restaurante</span>
                    <span className="text-[11px] text-orange-800 font-medium">{totalCenas} personas confirmadas</span>
                  </div>
                  <a 
                    href={`https://wa.me/?text=${whatsappMsg}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="bg-[#25D366] hover:bg-[#1fb355] text-white font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all"
                  >
                    <MessageCircle className="w-4 h-4" /> Avisar Club
                  </a>
                </div>

                {/* Jugadores convocados */}
                <div className="p-4">
                  <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider mb-2">Convocatoria</h4>
                  <div className="space-y-2">
                    {players.map(p => (
                      <div key={p.id} className="flex justify-between items-center bg-gray-50 p-2.5 rounded-xl text-xs">
                        <span className="font-bold text-gray-800">{p.name}</span>
                        <span className={`px-2 py-1 rounded-md font-black text-[10px] ${
                          p.dinner === 'SI' ? 'bg-green-100 text-green-700' :
                          p.dinner === 'NO' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {p.dinner === 'SI' ? 'CENA SÍ' : p.dinner === 'NO' ? 'NO CENA' : 'PENDIENTE'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Acompañantes solo cena */}
                <div className="p-4 border-t border-gray-100">
                  <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider mb-2">Acompañantes 3º Tiempo</h4>
                  <form onSubmit={handleAddGuest} className="flex gap-2 mb-3">
                    <input 
                      type="text" 
                      value={guestInput} 
                      onChange={e => setGuestInput(e.target.value)} 
                      placeholder="Nombre del acompañante..."
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                    />
                    <button type="submit" className="bg-orange-600 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center hover:bg-orange-700">
                      <UserPlus className="w-4 h-4" />
                    </button>
                  </form>
                  <div className="space-y-1.5">
                    {dinnerGuests.map(g => (
                      <div key={g.id} className="flex justify-between items-center bg-orange-50/60 border border-orange-100 px-3 py-2 rounded-xl text-xs">
                        <span className="font-medium text-orange-950">{g.name}</span>
                        <button onClick={() => handleRemoveGuest(g.id)} className="text-orange-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400 text-xs">No hay partidos activos en este momento.</div>
            )}
          </main>
        )}

        {/* PESTAÑA: RANKINGS */}
        {activeTab === 'rankings' && (
          <main className="p-4 flex-1">
            <h2 className="text-xl font-black text-gray-800 mb-4">Clasificación CTC</h2>
            <div className="flex bg-white rounded-xl p-1 mb-4 shadow-sm border border-gray-100">
              <button 
                onClick={() => setRankingType('hibrido')} 
                className={`flex-1 text-xs font-black py-2 rounded-lg transition-all ${rankingType === 'hibrido' ? 'bg-purple-600 text-white shadow' : 'text-gray-500'}`}
              >
                Híbrido
              </button>
              <button 
                onClick={() => setRankingType('deportivo')} 
                className={`flex-1 text-xs font-black py-2 rounded-lg transition-all ${rankingType === 'deportivo' ? 'bg-green-600 text-white shadow' : 'text-gray-500'}`}
              >
                Pádel
              </button>
              <button 
                onClick={() => setRankingType('barandas')} 
                className={`flex-1 text-xs font-black py-2 rounded-lg transition-all ${rankingType === 'barandas' ? 'bg-orange-500 text-white shadow' : 'text-gray-500'}`}
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
                  <div key={u.id} className="bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs ${
                        i === 0 ? 'bg-yellow-100 text-yellow-700' :
                        i === 1 ? 'bg-gray-100 text-gray-600' :
                        i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-400'
                      }`}>
                        {i + 1}
                      </span>
                      <div>
                        <h4 className="font-bold text-gray-800 text-xs">{u.name}</h4>
                        <p className="text-[10px] text-gray-400 uppercase font-semibold">{u.titulo || "Jugador Promedio 🎾"}</p>
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
            <h2 className="text-xl font-black text-gray-800 mb-4">El Bote Navideño 🐷</h2>
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
                  <div key={u.id} className="bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 flex justify-between items-center">
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

        {/* Modal Crear Partido */}
        {showNewMatch && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl relative">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-black text-gray-800 text-base">Nuevo Partido</h3>
                <button onClick={() => setShowNewMatch(false)} className="p-1 text-gray-400 hover:text-gray-600">
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
                    placeholder="📅 jueves, 24 sept...&#10;📍 Club de Tenis...&#10;✅ Jugador 1..."
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
                      className={`py-2 rounded-xl text-xs font-bold border transition-colors ${matchGroup === 'chicos' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-gray-200 text-gray-600'}`}
                    >
                      Chicos (Jueves)
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setMatchGroup('chicas')}
                      className={`py-2 rounded-xl text-xs font-bold border transition-colors ${matchGroup === 'chicas' ? 'bg-pink-50 border-pink-500 text-pink-700' : 'border-gray-200 text-gray-600'}`}
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

        {/* Modal de Configuración */}
        {showConfigModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl relative">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-black text-gray-800 text-base">Conexión a Google Sheets</h3>
                <button onClick={() => setShowConfigModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveApiUrl} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">URL Web App (/exec)</label>
                  <input 
                    type="url"
                    value={apiUrlInput}
                    onChange={e => setApiUrlInput(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full text-xs p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-blue-500"
                    required
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Conectado con tu Apps Script oficial.</p>
                </div>

                <div className="pt-2 flex gap-2">
                  <button 
                    type="button" 
                    onClick={() => {
                      localStorage.removeItem('padel_my_user');
                      setMyProfile(null);
                      setShowConfigModal(false);
                    }} 
                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors"
                  >
                    Cambiar Usuario
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs shadow transition-colors"
                  >
                    Guardar y Conectar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Barra de Navegación Inferior */}
        <nav className="fixed bottom-0 max-w-md w-full bg-white border-t border-gray-100 flex justify-around py-2 z-40 shadow-sm">
          <button 
            onClick={() => setActiveTab('partidos')} 
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
