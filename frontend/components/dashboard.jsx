// Dashboard page

function dashboardDisplayName(auth) {
  const name = auth && auth.profile && auth.profile.display_name ? auth.profile.display_name : "Helena";
  return String(name).trim() || "Helena";
}

function dashboardFirstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "Helena";
}

function dashboardYearsDocumented(people, timeline) {
  const years = [];
  (people || []).forEach(function (p) {
    if (p && p.birth && p.birth.year) years.push(p.birth.year);
    if (p && p.death && p.death.year) years.push(p.death.year);
  });
  (timeline || []).forEach(function (item) {
    if (item && item.year) years.push(item.year);
  });
  if (years.length === 0) return null;
  const min = Math.min.apply(null, years);
  const max = Math.max.apply(null, years.concat([new Date().getFullYear()]));
  return Math.max(0, max - min);
}

function dashboardRelativeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const future = diffMs < 0;
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const unit = absMs >= month
    ? [Math.round(absMs / month), "mês", "meses"]
    : absMs >= day
      ? [Math.round(absMs / day), "dia", "dias"]
      : absMs >= hour
        ? [Math.round(absMs / hour), "hora", "horas"]
        : [Math.max(1, Math.round(absMs / minute)), "minuto", "minutos"];
  const label = unit[0] === 1 ? unit[1] : unit[2];
  return future ? `em ${unit[0]} ${label}` : `há ${unit[0]} ${label}`;
}

function dashboardSortRecentPeople(people) {
  return [...(people || [])]
    .sort(function (a, b) {
      const bTime = b && b.createdAt ? new Date(b.createdAt).getTime() : 0;
      const aTime = a && a.createdAt ? new Date(a.createdAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 5);
}

function dashboardMockActivity(F) {
  return (F.activity || []).map(function (a) {
    const p = F.people[a.who];
    const verb = {
      added: "adicionou",
      photo: "digitalizou fotos de",
      document: "anexou documento a",
      match: "encontramos registros para",
      edited: "editou perfil de",
    }[a.type];
    return {
      id: a.id,
      personId: a.who,
      person: p,
      title: `${a.actor || "Stirps"} ${verb} ${p.first} ${p.last}`,
      subtitle: a.note || "",
      actorName: a.actor || "Stirps",
      when: a.when,
    };
  });
}

function Dashboard({ onNavigate, onPersonClick }) {
  const F = window.FAMILY;
  const auth = window.useAuth ? window.useAuth() : { profile: null };
  // Mock só quando a API está indisponível; com API ativa, vazio é vazio.
  const tree = window.useTree ? window.useTree() : { status: "unavailable", stats: null, people: [], timeline: [], activity: [], suggestions: [] };
  const useMockFallback = tree.status === "unavailable";
  const apiReady = !useMockFallback && !!tree.stats;
  const apiHasData = !useMockFallback && (tree.status === "ready" || tree.status === "error" || tree.status === "empty");
  const apiLoading = tree.status === "loading" || tree.status === "idle";
  const apiError = tree.status === "error";
  const displayName = useMockFallback ? "Helena" : dashboardDisplayName(auth);
  const firstName = dashboardFirstName(displayName);
  const yearsDocumented = useMockFallback ? 145 : dashboardYearsDocumented(tree.people, tree.timeline);
  const peopleTotal = useMockFallback ? Object.keys(F.people).length : (apiReady ? tree.stats.totalPeople : (tree.people || []).length);
  const heroSuggestion = useMockFallback ? F.suggestions[0] : (tree.suggestions || [])[0];
  const timelineItems = useMockFallback ? F.timeline : (tree.timeline || []);
  const recentPeople = useMockFallback
    ? ["p_giuseppe", "p_assunta", "p_carmela", "p_lorenzo", "p_alice"].map(id => F.people[id]).filter(Boolean)
    : dashboardSortRecentPeople(tree.people);
  const activityItems = useMockFallback ? dashboardMockActivity(F) : (tree.activity || []);
  const suggestionItems = useMockFallback ? F.suggestions : (tree.suggestions || []);

  const stats = apiReady
    ? [
        { label: "Pessoas", value: tree.stats.totalPeople, delta: `${tree.people.length} no acervo` },
        { label: "Gerações documentadas", value: tree.stats.generations, delta: "via /stats" },
        { label: "Países de origem", value: tree.stats.countries, delta: "lugares distintos" },
        { label: "Mídias arquivadas", value: tree.stats.mediaCount, delta: `${tree.stats.unionsCount} uniões` },
      ]
    : [
        { label: "Pessoas", value: useMockFallback ? Object.keys(F.people).length : 0, delta: useMockFallback ? "+3 este mês" : "nenhuma pessoa ainda" },
        { label: "Gerações documentadas", value: useMockFallback ? 5 : 0, delta: useMockFallback ? "1881 → hoje" : "sem dados" },
        { label: "Países de origem", value: useMockFallback ? 3 : 0, delta: useMockFallback ? "Itália, Portugal, Brasil" : "sem lugares" },
        { label: "Mídias arquivadas", value: useMockFallback ? 47 : 0, delta: useMockFallback ? "+12 esta semana" : "nenhuma mídia" },
      ];

  return (
    <div className="page page-dashboard">
      <div className="dash-hero">
        <div className="dash-hero-left">
          <div className="eyebrow">Bem-vinda de volta, {firstName}</div>
          <h1 className="dash-greet">
            {apiLoading
              ? <>Carregando sua<br/>história familiar.</>
              : apiHasData && peopleTotal === 0
              ? <>Sua árvore está pronta<br/>para receber as primeiras histórias.</>
              : <>Sua família tem <em>{peopleTotal} pessoas</em><br/>e <em>{yearsDocumented == null ? "alguns" : yearsDocumented} anos</em> de história documentada.</>}
          </h1>
          <p className="dash-sub">
            {timelineItems.length > 0
              ? <>A linha do tempo reúne {timelineItems.length} marcos familiares. <button className="link" onClick={() => onNavigate && onNavigate("timeline")}>Ver linha do tempo familiar →</button></>
              : "Adicione pessoas, datas e eventos para construir a linha do tempo familiar."}
          </p>
        </div>
        <div className="dash-hero-right">
          <div className="hero-card">
            <div className="hero-card-eyebrow"><Icon name="sparkle" size={14}/> Sugestão de hoje</div>
            {heroSuggestion ? (
              <>
                <div className="hero-card-title">{heroSuggestion.title}</div>
                <div className="hero-card-sub">
                  {heroSuggestion.subtitle || "Sugestão pendente para revisão."}
                  {heroSuggestion.confidence != null ? ` Compatibilidade ${heroSuggestion.confidence}%.` : ""}
                </div>
                <div className="hero-card-actions">
                  <button className="btn btn-primary">Revisar conexão</button>
                  <button className="btn btn-ghost">Mais tarde</button>
                </div>
              </>
            ) : (
              <>
                <div className="hero-card-title">Nenhuma sugestão pendente</div>
                <div className="hero-card-sub">Quando novos registros externos forem encontrados, eles aparecem aqui.</div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="stat-row">
        {stats.map(s => (
          <div key={s.label} className="stat">
            <div className={"stat-value " + (apiLoading ? "api-loading-shimmer" : "")}>
              {apiLoading ? "—" : s.value}
            </div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-delta">{s.delta}</div>
          </div>
        ))}
      </div>
      {apiError && (
        <div className="api-error" role="alert">
          Não foi possível atualizar os contadores agora. <button className="link" onClick={() => window.useTree && window.useTree.refetch && window.useTree.refetch()}>Tentar novamente</button>
        </div>
      )}

      <div className="dash-grid">
        {/* Recent activity */}
        <Card padding={0} className="col-span-7">
          <div className="card-head">
            <h3>Atividade recente</h3>
            <button className="link">Ver tudo</button>
          </div>
          <div className="activity">
            {activityItems.length === 0 && (
              <div className="api-empty">Nenhuma atividade recente ainda.</div>
            )}
            {activityItems.map((a) => {
              const p = a.person || (tree.peopleById && tree.peopleById[a.personId]) || null;
              return (
                <button key={a.id} className="activity-row" onClick={() => a.personId && onPersonClick(a.personId)}>
                  <Avatar person={p} size={36}/>
                  <div className="activity-text">
                    <div className="activity-line">
                      {a.actorName && <><strong>{a.actorName}</strong> · </>}
                      <strong>{a.title}</strong>
                    </div>
                    {a.subtitle && <div className="activity-note">{a.subtitle}</div>}
                  </div>
                  <div className="activity-when">{a.when || dashboardRelativeTime(a.occurredAt)}</div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Suggestions */}
        <Card padding={0} className="col-span-5">
          <div className="card-head">
            <h3>Sugestões inteligentes</h3>
            <Pill tone="olive">{suggestionItems.length} novas</Pill>
          </div>
          <div className="suggestions">
            {suggestionItems.length === 0 && (
              <div className="api-empty">Nenhuma sugestão pendente no momento.</div>
            )}
            {suggestionItems.map(s => (
              <div key={s.id} className="sug">
                <div className="sug-head">
                  <Icon name="sparkle" size={14}/>
                  <span className="sug-conf">{s.confidence == null ? "confiança não informada" : `${s.confidence}% provável`}</span>
                </div>
                <div className="sug-title">{s.title}</div>
                <div className="sug-sub">{s.subtitle}</div>
                <div className="sug-source">Fonte: {s.source}</div>
                <div className="sug-actions">
                  <button className="btn btn-sm btn-primary">Revisar</button>
                  <button className="btn btn-sm btn-ghost">Dispensar</button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Timeline */}
        <Card padding={0} className="col-span-7">
          <div className="card-head">
            <h3>Linha do tempo da família</h3>
            <div className="seg">
              <button className="seg-on">Tudo</button>
              <button>1900s</button>
              <button>1950s</button>
              <button>2000s</button>
            </div>
          </div>
          <div className="timeline">
            <div className="timeline-inner">
              <div className="timeline-track"/>
              {timelineItems.length === 0 && (
                <div className="api-empty">Nenhum marco na linha do tempo ainda.</div>
              )}
              {timelineItems.map((t, i, arr) => (
                <div key={i} className="tl-event" style={{ left: `calc(70px + ${arr.length > 1 ? i / (arr.length - 1) : 0.5} * (100% - 140px))` }}>
                  <div className="tl-dot"/>
                  <div className="tl-card">
                    <div className="tl-year">{t.year}</div>
                    <div className="tl-label">{t.label}</div>
                    <div className="tl-place">{t.place}</div>
                  </div>
                </div>
              ))}
              <div className="timeline-axis">
                <span>{timelineItems[0]?.year || ""}</span>
                <span>{timelineItems[timelineItems.length - 1]?.year || ""}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Recently added */}
        <Card padding={0} className="col-span-5">
          <div className="card-head">
            <h3>Pessoas adicionadas recentemente</h3>
            <button className="link">Pessoas</button>
          </div>
          <div className="recent-people">
            {recentPeople.length === 0 && (
              <div className="api-empty">Nenhuma pessoa adicionada ainda.</div>
            )}
            {recentPeople.map(p => {
              return (
                <button key={p.id} className="recent-row" onClick={() => onPersonClick(p.id)}>
                  <Avatar person={p} size={40}/>
                  <div className="recent-text">
                    <div className="recent-name">{p.first} {p.last}</div>
                    <div className="recent-meta">{fmtLifespan(p)} · {p.birth?.place}</div>
                  </div>
                  <Icon name="chev-right" size={14}/>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

window.Dashboard = Dashboard;
