// Dashboard page

function Dashboard({ onNavigate, onPersonClick }) {
  const F = window.FAMILY;
  const stats = [
    { label: "Pessoas", value: Object.keys(F.people).length, delta: "+3 este mês" },
    { label: "Gerações documentadas", value: 5, delta: "1881 → hoje" },
    { label: "Países de origem", value: 3, delta: "Itália, Portugal, Brasil" },
    { label: "Documentos arquivados", value: 47, delta: "+12 esta semana" },
  ];

  return (
    <div className="page page-dashboard">
      <div className="dash-hero">
        <div className="dash-hero-left">
          <div className="eyebrow">Bem-vinda de volta, Helena</div>
          <h1 className="dash-greet">Sua família tem <em>17 pessoas</em><br/>e <em>145 anos</em> de história documentada.</h1>
          <p className="dash-sub">Você está há 3 dias seguidos contribuindo. <a href="#">Ver linha do tempo familiar →</a></p>
        </div>
        <div className="dash-hero-right">
          <div className="hero-card">
            <div className="hero-card-eyebrow"><Icon name="sparkle" size={14}/> Sugestão de hoje</div>
            <div className="hero-card-title">Pietro Bertolini pode ser irmão de Giuseppe</div>
            <div className="hero-card-sub">Encontrado nos registros do Archivio di Stato di Treviso. Compatibilidade 92%.</div>
            <div className="hero-card-actions">
              <button className="btn btn-primary">Revisar conexão</button>
              <button className="btn btn-ghost">Mais tarde</button>
            </div>
          </div>
        </div>
      </div>

      <div className="stat-row">
        {stats.map(s => (
          <div key={s.label} className="stat">
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-delta">{s.delta}</div>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        {/* Recent activity */}
        <Card padding={0} className="col-span-7">
          <div className="card-head">
            <h3>Atividade recente</h3>
            <button className="link">Ver tudo</button>
          </div>
          <div className="activity">
            {F.activity.map((a, idx) => {
              const p = F.people[a.who];
              const verb = {
                added: "adicionou",
                photo: "digitalizou fotos de",
                document: "anexou documento a",
                match: "encontramos registros para",
                edited: "editou perfil de",
              }[a.type];
              return (
                <button key={a.id} className="activity-row" onClick={() => onPersonClick(a.who)}>
                  <Avatar person={p} size={36}/>
                  <div className="activity-text">
                    <div className="activity-line">
                      <strong>{a.actor || "Stirps"}</strong> {verb} <strong>{p.first} {p.last}</strong>
                    </div>
                    {a.note && <div className="activity-note">{a.note}</div>}
                  </div>
                  <div className="activity-when">{a.when}</div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Suggestions */}
        <Card padding={0} className="col-span-5">
          <div className="card-head">
            <h3>Sugestões inteligentes</h3>
            <Pill tone="olive">3 novas</Pill>
          </div>
          <div className="suggestions">
            {F.suggestions.map(s => (
              <div key={s.id} className="sug">
                <div className="sug-head">
                  <Icon name="sparkle" size={14}/>
                  <span className="sug-conf">{s.confidence}% provável</span>
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
              {F.timeline.map((t, i, arr) => (
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
                <span>{F.timeline[0]?.year}</span>
                <span>{F.timeline[F.timeline.length - 1]?.year}</span>
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
            {["p_giuseppe", "p_assunta", "p_carmela", "p_lorenzo", "p_alice"].map(id => {
              const p = F.people[id];
              return (
                <button key={id} className="recent-row" onClick={() => onPersonClick(id)}>
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
