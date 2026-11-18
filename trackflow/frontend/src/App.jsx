import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import L from "leaflet";
import { Geolocation } from "@capacitor/geolocation";

const API = import.meta.env.VITE_API_URL || "http://localhost:3333";

function MapView({ location, sharedLocations }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const sharedMarkersRef = useRef({});

  useEffect(() => {
    if (mapInstance.current || !mapRef.current) return;
    const map = L.map(mapRef.current).setView([-14.235, -51.9253], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  useEffect(() => {
    if (!location || !mapInstance.current) return;
    const point = [location.latitude, location.longitude];
    if (!markerRef.current) {
      markerRef.current = L.marker(point).addTo(mapInstance.current).bindPopup("Minha localização");
    } else {
      markerRef.current.setLatLng(point);
    }
    mapInstance.current.setView(point, 16);
  }, [location]);

  useEffect(() => {
    if (!mapInstance.current) return;
    const activeIds = new Set(sharedLocations.map((item) => item.user_id || item.personId));
    for (const [id, marker] of Object.entries(sharedMarkersRef.current)) {
      if (!activeIds.has(id)) {
        marker.remove();
        delete sharedMarkersRef.current[id];
      }
    }
    sharedLocations.forEach((person) => {
      if (!Number.isFinite(Number(person.latitude)) || !Number.isFinite(Number(person.longitude))) return;
      const id = person.user_id || person.personId;
      const point = [Number(person.latitude), Number(person.longitude)];
      if (!sharedMarkersRef.current[id]) {
        sharedMarkersRef.current[id] = L.circleMarker(point, {
          radius: 9, color: "#ffffff", weight: 2, fillColor: "#16a34a", fillOpacity: 1
        }).addTo(mapInstance.current).bindPopup(person.name || person.personName || "Compartilhamento autorizado");
      } else {
        sharedMarkersRef.current[id].setLatLng(point);
      }
    });
  }, [sharedLocations]);

  return <div ref={mapRef} className="map" />;
}

export default function App() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("trackflow-user") || "null"));
  const [token, setToken] = useState(() => localStorage.getItem("trackflow-token"));
  const [location, setLocation] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState("Aguardando autenticação");
  const [error, setError] = useState("");
  const [shares, setShares] = useState([]);
  const [sharedLocations, setSharedLocations] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const socketRef = useRef(null);
  const watchRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    const socket = io(API, { auth: { token }, transports: ["websocket", "polling"] });
    socket.on("connect", () => setStatus("Conectado ao servidor"));
    socket.on("connect_error", (err) => setStatus(err.message || "Falha na conexão"));
    socket.on("gps:saved", (point) => setLocation(point));
    socket.on("gps:shared-location", (point) => {
      setSharedLocations((current) => {
        const id = point.personId;
        return [...current.filter((item) => (item.user_id || item.personId) !== id), point];
      });
    });
    socket.on("gps:sharing-stopped", ({ personId }) => {
      setSharedLocations((current) => current.filter((item) => (item.user_id || item.personId) !== personId));
    });
    socketRef.current = socket;
    return () => socket.disconnect();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadShares();
    loadSharedLocations();
    const refreshId = setInterval(() => {
      loadShares();
      loadSharedLocations();
    }, 15000);
    return () => clearInterval(refreshId);
  }, [token]);

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
    return data;
  }

  async function loadShares() {
    try { const data = await apiRequest("/api/shares"); setShares(data.shares || []); }
    catch (err) { setError(err.message); }
  }

  async function loadSharedLocations() {
    try { const data = await apiRequest("/api/locations/shared"); setSharedLocations(data.locations || []); }
    catch (err) { setError(err.message); }
  }

  async function requestShare(event) {
    event.preventDefault(); setShareMessage(""); setError("");
    try {
      const data = await apiRequest("/api/shares/request", { method: "POST", body: JSON.stringify({ email: inviteEmail }) });
      setShareMessage(data.message); setInviteEmail(""); loadShares();
    } catch (err) { setError(err.message); }
  }

  async function respondShare(id, decision) {
    try {
      await apiRequest(`/api/shares/${id}/respond`, { method: "PATCH", body: JSON.stringify({ decision }) });
      await loadShares(); await loadSharedLocations();
      setShareMessage(decision === "accepted" ? "Solicitação aceita." : "Solicitação recusada.");
    } catch (err) { setError(err.message); }
  }

  async function revokeShare(id) {
    try {
      await apiRequest(`/api/shares/${id}`, { method: "DELETE" });
      await loadShares(); await loadSharedLocations();
      setShareMessage("Compartilhamento revogado.");
    } catch (err) { setError(err.message); }
  }

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submitAuth(event) {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch(`${API}/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível autenticar.");
      localStorage.setItem("trackflow-token", data.token);
      localStorage.setItem("trackflow-user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  async function startSharing() {
    setError("");
    if (!socketRef.current?.connected) {
      setError("A conexão com o servidor ainda não está pronta.");
      return;
    }

    socketRef.current.emit("gps:start");
    setSharing(true);
    setStatus("Solicitando permissão de localização...");

    try {
      watchRef.current = await Geolocation.watchPosition(
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
      (position, geoError) => {
        if (geoError) {
          setSharing(false);
          setStatus("Localização indisponível");
          setError(geoError.message || "Permissão de localização negada.");
          socketRef.current?.emit("gps:stop");
          return;
        }
        if (!position) return;
        const coords = position.coords;
        const point = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          speed: coords.speed,
          heading: coords.heading
        };
        setLocation(point);
        socketRef.current?.emit("gps:update", point, (ack) => {
          if (!ack?.ok) setError(ack?.error || "Não foi possível enviar a posição.");
          else setStatus("Compartilhando localização");
        });
      }
    );
    } catch (geoError) {
      setSharing(false);
      setStatus("Localização indisponível");
      setError(geoError.message || "Não foi possível iniciar a geolocalização.");
      socketRef.current?.emit("gps:stop");
    }
  }

  async function stopSharing() {
    if (watchRef.current !== null) {
      await Geolocation.clearWatch({ id: watchRef.current });
      watchRef.current = null;
    }
    socketRef.current?.emit("gps:stop");
    setSharing(false);
    setStatus("Compartilhamento encerrado");
  }

  function logout() {
    stopSharing();
    localStorage.removeItem("trackflow-token");
    localStorage.removeItem("trackflow-user");
    socketRef.current?.disconnect();
    setToken(null);
    setUser(null);
    setLocation(null);
  }

  if (!token || !user) {
    return (
      <main className="auth-page">
        <form className="auth-card" onSubmit={submitAuth}>
          <div className="brand-mark">TF</div>
          <p className="eyebrow">LOCALIZAÇÃO COM CONSENTIMENTO</p>
          <h1>TrackFlow</h1>
          <p className="muted">Compartilhe sua localização quando quiser, com controle sobre o início e o fim.</p>
          {mode === "register" && <label>Nome<input name="name" value={form.name} onChange={updateField} required /></label>}
          <label>E-mail<input type="email" name="email" value={form.email} onChange={updateField} required /></label>
          <label>Senha<input type="password" name="password" value={form.password} onChange={updateField} minLength="8" required /></label>
          {error && <p className="error">{error}</p>}
          <button className="primary full" type="submit">{mode === "login" ? "Entrar" : "Criar conta"}</button>
          <button className="link-button" type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
            {mode === "login" ? "Ainda não tenho conta" : "Já tenho conta"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark small">TF</span><strong>TrackFlow</strong></div>
        <div className="side-label">PLATAFORMA</div>
        <div className="nav-item active"> <span>◉</span> Visão geral</div>
        <div className="nav-item"><span>⌖</span> Minha localização</div>
        <div className="nav-item disabled"><span>◷</span> Histórico <small>Em breve</small></div>
        <div className="nav-item"><span>♧</span> Compartilhamentos</div>
        <div className="sidebar-bottom">
          <div className="profile"><div className="avatar">{user.name?.[0]?.toUpperCase()}</div><div><strong>{user.name}</strong><small>{user.email}</small></div></div>
          <button className="logout" onClick={logout}>Sair da conta</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><p className="eyebrow">PAINEL DE CONTROLE</p><h2>Visão geral</h2></div>
          <div className="connection"><span className="pulse" />{status}</div>
        </header>

        <section className="stats-grid">
          <article className="stat-card"><span className="stat-icon blue">⌖</span><div><small>Minha localização</small><strong>{location ? "Disponível" : "Não compartilhada"}</strong></div></article>
          <article className="stat-card"><span className="stat-icon green">◉</span><div><small>Compartilhamento</small><strong>{sharing ? "Ativo" : "Inativo"}</strong></div></article>
          <article className="stat-card"><span className="stat-icon purple">◷</span><div><small>Precisão GPS</small><strong>{location?.accuracy ? `± ${Math.round(location.accuracy)} m` : "—"}</strong></div></article>
        </section>

        <section className="map-panel">
          <div className="panel-heading">
            <div><h3>Mapa de localização</h3><p className="muted">Sua posição aparece aqui após autorizar o GPS.</p></div>
            {!sharing
              ? <button className="primary" onClick={startSharing}>Iniciar compartilhamento</button>
              : <button className="danger" onClick={stopSharing}>Parar compartilhamento</button>}
          </div>
          <MapView location={location} sharedLocations={sharedLocations} />
          {error && <p className="error inline-error">{error}</p>}
          <div className="map-footer"><span><i className={sharing ? "dot online" : "dot"} />{sharing ? "Compartilhamento ativo" : "Compartilhamento desligado"}</span><span>{location ? `Lat. ${Number(location.latitude).toFixed(5)} · Long. ${Number(location.longitude).toFixed(5)}` : "Aguardando coordenadas"}</span></div>
        </section>
        <section className="shares-panel">
          <div className="panel-heading"><div><h3>Compartilhamento entre pessoas</h3><p className="muted">Solicite acesso. A outra pessoa precisa aceitar antes de compartilhar a localização.</p></div></div>
          <form className="invite-form" onSubmit={requestShare}>
            <input type="email" placeholder="E-mail da pessoa" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            <button className="primary" type="submit">Solicitar acesso</button>
          </form>
          {shareMessage && <p className="success-message">{shareMessage}</p>}
          <div className="share-columns">
            <div><h4>Solicitações recebidas</h4>
              {shares.filter((s) => s.owner_id === user.id && s.status === "pending").length === 0 && <p className="muted">Nenhuma solicitação pendente.</p>}
              {shares.filter((s) => s.owner_id === user.id && s.status === "pending").map((s) => <div className="share-row" key={s.id}><div><strong>{s.requester_name}</strong><small>{s.requester_email} deseja ver sua localização</small></div><div className="actions"><button className="mini-accept" onClick={() => respondShare(s.id, "accepted")}>Aceitar</button><button className="mini-reject" onClick={() => respondShare(s.id, "rejected")}>Recusar</button></div></div>)}
            </div>
            <div><h4>Solicitações enviadas</h4>
              {shares.filter((s) => s.requester_id === user.id && s.status === "pending").length === 0 && <p className="muted">Nenhuma solicitação aguardando resposta.</p>}
              {shares.filter((s) => s.requester_id === user.id && s.status === "pending").map((s) => <div className="share-row" key={s.id}><div><strong>{s.owner_name}</strong><small>Aguardando autorização de {s.owner_email}</small></div><span className="pending-pill">Pendente</span></div>)}
            </div>
            <div><h4>Compartilhamentos ativos</h4>
              {shares.filter((s) => s.status === "accepted").length === 0 && <p className="muted">Nenhum compartilhamento ativo.</p>}
              {shares.filter((s) => s.status === "accepted").map((s) => { const isOwner = s.owner_id === user.id; return <div className="share-row" key={s.id}><div><strong>{isOwner ? s.requester_name : s.owner_name}</strong><small>{isOwner ? "Você autorizou esta pessoa a ver sua localização" : "Esta pessoa autorizou você a ver a localização"}</small></div><button className="mini-reject" onClick={() => revokeShare(s.id)}>Revogar</button></div>; })}
            </div>
          </div>
        </section>
        <p className="privacy-note">Sua localização só é transmitida enquanto o compartilhamento estiver ativo. Apenas contas com autorização aceita recebem as atualizações. Você pode interromper o GPS ou revogar o acesso a qualquer momento.</p>
      </main>
    </div>
  );
}
