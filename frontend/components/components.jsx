// Shared components: Sidebar, Header, Avatar, Badge, etc.

const SIDEBAR_NAV = [
  { id: "dashboard", label: "Início", icon: "home" },
  { id: "tree", label: "Árvore", icon: "tree" },
  { id: "people", label: "Pessoas", icon: "people" },
  { id: "search", label: "Pesquisa histórica", icon: "search" },
  { id: "documents", label: "Documentos", icon: "doc" },
  { id: "timeline", label: "Linha do tempo", icon: "clock" },
];

const SIDEBAR_NAV_BOTTOM = [
  { id: "settings", label: "Configurações", icon: "gear" },
  { id: "help", label: "Ajuda & comunidade", icon: "help" },
];

function Icon({ name, size = 18 }) {
  const s = size;
  const stroke = "currentColor";
  const sw = 1.6;
  const common = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "home": return <svg {...common}><path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/></svg>;
    case "tree": return <svg {...common}><circle cx="12" cy="5" r="2.2"/><circle cx="6" cy="13" r="2.2"/><circle cx="18" cy="13" r="2.2"/><circle cx="6" cy="20" r="1.8"/><circle cx="12" cy="20" r="1.8"/><path d="M12 7.2v3.6M12 10.8L6 13M12 10.8L18 13M6 15.2V18M9 20H8.5"/></svg>;
    case "people": return <svg {...common}><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.5" r="2.4"/><path d="M3 19c.6-3.4 3.1-5.2 6-5.2s5.4 1.8 6 5.2"/><path d="M15 19c.5-2.4 2-3.8 4-3.8"/></svg>;
    case "search": return <svg {...common}><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>;
    case "doc": return <svg {...common}><path d="M14 3H6.5A1.5 1.5 0 005 4.5v15A1.5 1.5 0 006.5 21h11a1.5 1.5 0 001.5-1.5V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h5"/></svg>;
    case "clock": return <svg {...common}><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/></svg>;
    case "gear": return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>;
    case "help": return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.5-2.5 1.7-2.5 3.5"/><path d="M12 17h0"/></svg>;
    case "plus": return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case "chev-right": return <svg {...common}><path d="M9 6l6 6-6 6"/></svg>;
    case "chev-down": return <svg {...common}><path d="M6 9l6 6 6-6"/></svg>;
    case "chev-left": return <svg {...common}><path d="M15 6l-6 6 6 6"/></svg>;
    case "filter": return <svg {...common}><path d="M4 5h16M7 12h10M10 19h4"/></svg>;
    case "upload": return <svg {...common}><path d="M12 16V4M12 4l-4 4M12 4l4 4M5 20h14"/></svg>;
    case "map": return <svg {...common}><path d="M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></svg>;
    case "heart": return <svg {...common}><path d="M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z"/></svg>;
    case "sparkle": return <svg {...common}><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"/><path d="M19 17l.7 1.5 1.5.7-1.5.7L19 21.5l-.7-1.5-1.5-.7 1.5-.7z"/></svg>;
    case "edit": return <svg {...common}><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/></svg>;
    case "share": return <svg {...common}><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/></svg>;
    case "more": return <svg {...common}><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>;
    case "pin": return <svg {...common}><path d="M12 21s-6-5.3-6-10a6 6 0 1112 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/></svg>;
    case "check": return <svg {...common}><path d="M5 12.5l4.5 4.5L19 7"/></svg>;
    case "x": return <svg {...common}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case "zoom-in": return <svg {...common}><circle cx="11" cy="11" r="6"/><path d="M11 8v6M8 11h6M20 20l-4.5-4.5"/></svg>;
    case "zoom-out": return <svg {...common}><circle cx="11" cy="11" r="6"/><path d="M8 11h6M20 20l-4.5-4.5"/></svg>;
    case "fit": return <svg {...common}><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/></svg>;
    case "minus": return <svg {...common}><path d="M5 12h14"/></svg>;
    case "calendar": return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>;
    case "globe": return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>;
    case "arrow-left": return <svg {...common}><path d="M19 12H5M5 12l6-6M5 12l6 6"/></svg>;
    case "arrow-right": return <svg {...common}><path d="M5 12h14M14 6l6 6M14 18l6-6"/></svg>;
    case "trash": return <svg {...common}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>;
    case "user": return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/></svg>;
    case "book": return <svg {...common}><path d="M5 4h10a4 4 0 014 4v12H9a4 4 0 01-4-4z"/><path d="M5 16a4 4 0 014-4h10"/></svg>;
    case "settings": return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>;
    case "briefcase": return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18"/></svg>;
    case "star": return <svg {...common}><path d="M12 3l2.6 5.6 6.1.7-4.6 4.2 1.3 6L12 16.8 6.6 19.5 7.9 13.5 3.3 9.3l6.1-.7z"/></svg>;
    case "moon": return <svg {...common}><path d="M20 14.5A8 8 0 119.5 4a6.5 6.5 0 0010.5 10.5z"/></svg>;
    case "link": return <svg {...common}><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/></svg>;
    default: return null;
  }
}

// Avatar — circular bordered photo placeholder with monogram
function Avatar({ person, size = 40, showRing = false, ringColor }) {
  // Sex-based palette: clearly distinguishable
  // Men → deep petrol blue; Women → warm terracotta/rose; unknown → sand
  const sexTones = {
    M: { bg: "#c2d4dc", fg: "#1f3e4d" },   // petrol blue
    F: { bg: "#f0d4c8", fg: "#8a3f2a" },   // terracotta rose
    U: { bg: "#e8dec6", fg: "#7a5d36" },   // sand
  };
  const t = sexTones[person?.sex] || sexTones.U;
  const initials = person ? `${(person.first||"")[0]||""}${(person.last||"").split(" ").slice(-1)[0]?.[0]||""}` : "?";
  const imageUrl = person && (person.avatarUrl || person.photoUrl || person.imageUrl);
  return (
    <div className="avatar-wrap" style={{ width: size, height: size, position: "relative" }}>
      {showRing && (
        <div style={{
          position: "absolute", inset: -3,
          borderRadius: "50%",
          border: `1.5px solid ${ringColor || "#5b6e4f"}`,
          opacity: 0.55,
        }}/>
      )}
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: t.bg, color: t.fg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 500, fontSize: size * 0.36,
        letterSpacing: "0.02em",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)",
        overflow: "hidden",
        position: "relative",
      }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }}
          />
        ) : (
          <>
        {/* faux-photo gradient */}
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse at 30% 25%, rgba(255,255,255,0.45), transparent 55%), linear-gradient(155deg, ${t.bg} 0%, ${shade(t.bg, -8)} 100%)`,
        }}/>
        <span style={{ position: "relative", zIndex: 1 }}>{initials}</span>
          </>
        )}
      </div>
    </div>
  );
}

function shade(hex, percent) {
  // simple hex tweaker
  const h = hex.replace("#","");
  const r = parseInt(h.substr(0,2),16);
  const g = parseInt(h.substr(2,2),16);
  const b = parseInt(h.substr(4,2),16);
  const f = (1 + percent/100);
  const cl = (n) => Math.max(0, Math.min(255, Math.round(n*f)));
  return "#"+[cl(r),cl(g),cl(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}

function sidebarAdaptAuthPerson(person) {
  if (!person) return null;
  const adapt = window.adapters && window.adapters.adaptPerson;
  return adapt ? adapt(person) : person;
}

function sidebarFullName(person, profile) {
  if (person) {
    const full = person.displayName || [person.first, person.last].filter(Boolean).join(" ").trim();
    if (full) return full;
  }
  return (profile && profile.display_name) || "Usuário";
}

function sidebarPlanLabel(auth) {
  const subscription = (auth && auth.subscription) || {};
  const membership = auth && Array.isArray(auth.trees) && auth.trees.length > 0 ? auth.trees[0] : null;
  const planName = subscription.name || "Gratis";
  const collaborators = membership && Number.isFinite(Number(membership.collaborators_count))
    ? Number(membership.collaborators_count)
    : 0;
  const suffix = collaborators === 1 ? "colaborador" : "colaboradores";
  return `Plano ${planName} - ${collaborators} ${suffix}`;
}

// Sidebar
function Sidebar({ current, onNavigate, collapsed }) {
  const auth = window.useAuth ? window.useAuth() : { profile: null, trees: [] };
  const tree = window.useTree ? window.useTree() : { peopleById: {}, myPersonId: null };
  const [avatarUrl, setAvatarUrl] = React.useState(null);

  const membership = auth && Array.isArray(auth.trees) && auth.trees.length > 0 ? auth.trees[0] : null;
  const personId = (tree && tree.myPersonId) || (membership && membership.person_id) || null;
  const authPerson = sidebarAdaptAuthPerson(auth && auth.person);
  const treePerson = personId && tree && tree.peopleById ? tree.peopleById[personId] : null;
  const userPersonBase = treePerson || authPerson || null;

  React.useEffect(() => {
    let cancelled = false;
    setAvatarUrl(null);
    if (!personId || !window.genealogyApi || typeof window.genealogyApi.listPersonMedia !== "function") return undefined;
    if (userPersonBase && userPersonBase.avatarUrl) return undefined;

    window.genealogyApi.listPersonMedia(personId)
      .then(function (items) {
        if (cancelled) return null;
        const media = Array.isArray(items)
          ? items.find(function (item) { return item && (item.kind === "photo" || (item.mime_type || "").indexOf("image/") === 0); })
          : null;
        if (!media || !media.id || !window.genealogyApi.getMediaDownloadUrl) return null;
        return window.genealogyApi.getMediaDownloadUrl(media.id);
      })
      .then(function (signed) {
        if (cancelled || !signed) return;
        setAvatarUrl(signed.url || signed.download_url || null);
      })
      .catch(function () {
        if (!cancelled) setAvatarUrl(null);
      });

    return function () {
      cancelled = true;
    };
  }, [personId, userPersonBase && userPersonBase.avatarUrl]);

  const userPerson = userPersonBase ? Object.assign({}, userPersonBase, { avatarUrl: avatarUrl || userPersonBase.avatarUrl }) : null;
  const userName = sidebarFullName(userPerson, auth && auth.profile);
  const planLabel = sidebarPlanLabel(auth);

  return (
    <aside className={"sb " + (collapsed ? "sb-collapsed" : "")}>
      <div className="sb-brand">
        <div className="sb-brand-mark">
          <svg viewBox="0 0 32 32" width="22" height="22"><path d="M16 4 L16 28 M16 12 L8 18 M16 12 L24 18 M16 20 L11 24 M16 20 L21 24" stroke="#1a1f1a" strokeWidth="1.6" strokeLinecap="round" fill="none"/><circle cx="16" cy="4" r="2" fill="#5b6e4f"/><circle cx="8" cy="18" r="1.6" fill="#3a5b6b"/><circle cx="24" cy="18" r="1.6" fill="#3a5b6b"/><circle cx="11" cy="24" r="1.4" fill="#c9b48a"/><circle cx="21" cy="24" r="1.4" fill="#c9b48a"/></svg>
        </div>
        <div className="sb-brand-text">
          <div className="sb-brand-name">Stirps</div>
          <div className="sb-brand-sub">Família Bertolini-Albuquerque</div>
        </div>
      </div>

      <button className="sb-add">
        <Icon name="plus" size={16} />
        <span>Adicionar pessoa</span>
        <kbd>N</kbd>
      </button>

      <nav className="sb-nav">
        {SIDEBAR_NAV.map(item => (
          <button
            key={item.id}
            className={"sb-item " + (current === item.id ? "sb-item-active" : "")}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} size={17}/>
            <span>{item.label}</span>
            {item.id === "search" && <span className="sb-badge">3</span>}
          </button>
        ))}
      </nav>

      <div className="sb-section-label">Coleções</div>
      <nav className="sb-nav sb-nav-sub">
        <button className="sb-item sb-item-sub">
          <span className="sb-dot" style={{background:"#5b6e4f"}}/>
          <span>Linhagem paterna</span>
          <span className="sb-count">14</span>
        </button>
        <button className="sb-item sb-item-sub">
          <span className="sb-dot" style={{background:"#3a5b6b"}}/>
          <span>Linhagem materna</span>
          <span className="sb-count">9</span>
        </button>
        <button className="sb-item sb-item-sub">
          <span className="sb-dot" style={{background:"#c9b48a"}}/>
          <span>Imigração 1903</span>
          <span className="sb-count">6</span>
        </button>
      </nav>

      <div className="sb-spacer"/>

      <nav className="sb-nav">
        {SIDEBAR_NAV_BOTTOM.map(item => (
          <button
            key={item.id}
            className={"sb-item " + (current === item.id ? "sb-item-active" : "")}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} size={17}/>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sb-user">
        <Avatar person={userPerson} size={32}/>
        <div className="sb-user-text">
          <div className="sb-user-name">{userName}</div>
          <div className="sb-user-plan">{planLabel}</div>
        </div>
        <button className="sb-user-more" onClick={() => onNavigate("settings")} title="Configurações">
          <Icon name="more" size={16}/>
        </button>
      </div>
    </aside>
  );
}

// Top bar / header within content area
function TopBar({ breadcrumbs = [], rightSlot, onSearchOpen }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <nav className="crumbs">
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Icon name="chev-right" size={14}/>}
              <span className={i === breadcrumbs.length - 1 ? "crumb-current" : "crumb"}>{b}</span>
            </React.Fragment>
          ))}
        </nav>
      </div>
      <div className="topbar-search" onClick={onSearchOpen}>
        <Icon name="search" size={15}/>
        <span className="topbar-search-text">Buscar pessoas, lugares, eventos…</span>
        <kbd className="topbar-kbd">⌘K</kbd>
      </div>
      <div className="topbar-right">
        {rightSlot}
        <button className="iconbtn" title="Atividade"><Icon name="clock" size={16}/></button>
        <button className="iconbtn" title="Convidar família"><Icon name="share" size={16}/></button>
      </div>
    </header>
  );
}

// Generic Card
function Card({ children, className = "", padding = 24, ...rest }) {
  return <div className={"card " + className} style={{ padding }} {...rest}>{children}</div>;
}

function SectionTitle({ eyebrow, title, action }) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

// Tag/Pill
function Pill({ children, tone = "neutral" }) {
  return <span className={"pill pill-" + tone}>{children}</span>;
}

// Format helpers
function fmtLifespan(p) {
  const b = p.birth?.year || "?";
  const d = p.death?.year;
  return d ? `${b} – ${d}` : `${b} – `;
}

function ageOrLived(p) {
  const b = p.birth?.year;
  const d = p.death?.year || 2026;
  if (!b) return "—";
  return d - b;
}

// Cmd+K palette
function CommandPalette({ open, onClose, onPersonClick }) {
  const [q, setQ] = React.useState("");
  const inputRef = React.useRef(null);
  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
      setQ("");
    }
  }, [open]);

  const all = Object.values(FAMILY.people);
  const filtered = q
    ? all.filter(p => `${p.first} ${p.last}`.toLowerCase().includes(q.toLowerCase())
        || (p.occupation||"").toLowerCase().includes(q.toLowerCase())
        || (p.birth?.place||"").toLowerCase().includes(q.toLowerCase()))
    : all.slice(0, 6);

  if (!open) return null;
  return (
    <div className="cmdk-backdrop" onClick={onClose}>
      <div className="cmdk" onClick={e => e.stopPropagation()}>
        <div className="cmdk-input">
          <Icon name="search" size={16}/>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar pessoas, lugares, sobrenomes ou anos…"
          />
          <kbd>esc</kbd>
        </div>
        <div className="cmdk-list">
          {!q && <div className="cmdk-section">Sugestões</div>}
          {q && filtered.length === 0 && <div className="cmdk-empty">Nenhum resultado para "{q}"</div>}
          {filtered.map(p => (
            <button key={p.id} className="cmdk-item" onClick={() => { onPersonClick(p.id); onClose(); }}>
              <Avatar person={p} size={32}/>
              <div className="cmdk-item-text">
                <div className="cmdk-item-name">{p.first} {p.last}</div>
                <div className="cmdk-item-meta">{p.occupation} · {fmtLifespan(p)} · {p.birth?.place || ""}</div>
              </div>
              <Icon name="chev-right" size={14}/>
            </button>
          ))}
          {!q && (
            <>
              <div className="cmdk-section">Ações</div>
              <button className="cmdk-item cmdk-action"><Icon name="plus" size={16}/><div className="cmdk-item-text"><div className="cmdk-item-name">Adicionar nova pessoa</div></div><kbd>N</kbd></button>
              <button className="cmdk-item cmdk-action"><Icon name="upload" size={16}/><div className="cmdk-item-text"><div className="cmdk-item-name">Enviar documentos ou fotos</div></div></button>
              <button className="cmdk-item cmdk-action"><Icon name="sparkle" size={16}/><div className="cmdk-item-text"><div className="cmdk-item-name">Buscar registros históricos</div></div></button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Tooltip-style empty/info mini
function MiniMap({ tone = "olive" }) {
  // soft beige map placeholder
  return (
    <div className="minimap" style={{ background: "linear-gradient(135deg, #f1ebde 0%, #e7dfcc 100%)" }}>
      <svg viewBox="0 0 200 120" preserveAspectRatio="none" width="100%" height="100%">
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(90,80,55,0.08)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="200" height="120" fill="url(#grid)"/>
        <path d="M 10 70 Q 60 20 110 50 T 190 60" fill="none" stroke="rgba(58,91,107,0.35)" strokeWidth="1.2" strokeDasharray="2 3"/>
        <circle cx="20" cy="68" r="3.5" fill="#5b6e4f"/>
        <circle cx="60" cy="40" r="3.5" fill="#3a5b6b"/>
        <circle cx="110" cy="50" r="3.5" fill="#3a5b6b"/>
        <circle cx="170" cy="62" r="3.5" fill="#c9b48a"/>
      </svg>
    </div>
  );
}

Object.assign(window, {
  Icon, Avatar, Sidebar, TopBar, Card, SectionTitle, Pill,
  fmtLifespan, ageOrLived, CommandPalette, MiniMap, shade,
  SIDEBAR_NAV, SIDEBAR_NAV_BOTTOM,
});
