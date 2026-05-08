// Person profile page

function Profile({ personId, onBack, onPersonClick }) {
  const F = window.FAMILY;
  const p = F.people[personId];
  const [tab, setTab] = React.useState("bio");
  if (!p) return null;

  // Find relations
  const parents = (p.parents || []).map(id => F.people[id]).filter(Boolean);
  const spouseUnion = F.unions.find(u => u.partners.includes(p.id));
  const spouse = spouseUnion ? F.people[spouseUnion.partners.find(x => x !== p.id)] : null;
  const children = Object.values(F.people).filter(x => (x.parents||[]).includes(p.id));
  const siblings = Object.values(F.people).filter(x =>
    x.id !== p.id && x.parents && p.parents &&
    x.parents.some(pp => p.parents.includes(pp))
  );

  const accentColor = p.sex === "F" ? "#a85d3a" : p.sex === "M" ? "#2c4a59" : "#a08658";

  const events = buildPersonEvents(p, F);

  return (
    <div className="page page-profile">
      {/* Banner */}
      <div className="profile-banner" style={{
        background: `linear-gradient(135deg, ${accentColor}22 0%, #f1ebde 70%)`,
      }}>
        <div className="profile-banner-pattern"/>
      </div>

      <div className="profile-head">
        <div className="profile-avatar-wrap">
          <Avatar person={p} size={132}/>
          <button className="profile-photo-edit"><Icon name="edit" size={14}/></button>
        </div>
        <div className="profile-titles">
          <div className="profile-eyebrow">
            {p.tags?.map(t => <Pill key={t} tone="neutral">{t}</Pill>)}
            {!p.death && <Pill tone="olive">Vivendo</Pill>}
          </div>
          <h1 className="profile-name">{p.first} <span>{p.last}</span></h1>
          <div className="profile-meta">
            <span><Icon name="calendar" size={14}/> {fmtLifespan(p)}{p.death ? ` · ${ageOrLived(p)} anos` : ` · ${ageOrLived(p)} anos`}</span>
            <span><Icon name="pin" size={14}/> {p.birth?.place}</span>
            <span><Icon name="heart" size={14}/> {p.occupation}</span>
          </div>
        </div>
        <div className="profile-actions">
          <button className="btn btn-ghost"><Icon name="share" size={14}/>Compartilhar</button>
          <button className="btn btn-ghost"><Icon name="edit" size={14}/>Editar</button>
          <button className="btn btn-primary"><Icon name="plus" size={14}/>Adicionar evento</button>
        </div>
      </div>

      <div className="profile-tabs">
        {[
          ["bio", "Biografia"],
          ["family", "Família"],
          ["timeline", "Linha do tempo"],
          ["docs", "Documentos"],
          ["photos", "Galeria"],
          ["places", "Locais"],
        ].map(([id, label]) => (
          <button key={id} className={"ptab " + (tab === id ? "ptab-on" : "")} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div className="profile-body">
        <div className="profile-main">
          {tab === "bio" && (
            <Card padding={28}>
              <div className="eyebrow">Biografia</div>
              <p className="profile-bio">{p.bio}</p>
              <div className="profile-callout">
                <Icon name="sparkle" size={14}/>
                <div>
                  <strong>Lacuna sugerida.</strong> Você ainda não registrou onde {p.first} morou entre {(p.birth?.year||0)+18} e {(p.birth?.year||0)+30}. <a href="#">Adicionar período →</a>
                </div>
              </div>
              <h3 className="prof-h3">Em poucas palavras</h3>
              <div className="bio-grid">
                <div><div className="bio-k">Nascimento</div><div className="bio-v">{p.birth?.year} · {p.birth?.place}</div></div>
                {p.death && <div><div className="bio-k">Falecimento</div><div className="bio-v">{p.death.year} · {p.death.place}</div></div>}
                <div><div className="bio-k">Ocupação</div><div className="bio-v">{p.occupation}</div></div>
                <div><div className="bio-k">Geração</div><div className="bio-v">G{p.generation} · {gen_label(p.generation)}</div></div>
              </div>
            </Card>
          )}

          {tab === "family" && (
            <Card padding={28}>
              <div className="eyebrow">Relacionamentos familiares</div>
              <RelationGroup label="Pais" people={parents} onPersonClick={onPersonClick}/>
              {spouse && <RelationGroup label={`Cônjuge · desde ${spouseUnion.year}, ${spouseUnion.place}`} people={[spouse]} onPersonClick={onPersonClick}/>}
              <RelationGroup label="Irmãos" people={siblings} onPersonClick={onPersonClick}/>
              <RelationGroup label="Filhos" people={children} onPersonClick={onPersonClick}/>
            </Card>
          )}

          {tab === "timeline" && (
            <Card padding={28}>
              <div className="eyebrow">Linha do tempo</div>
              <div className="ptl">
                {events.map((e, i) => (
                  <div key={i} className="ptl-row">
                    <div className="ptl-year">{e.year}</div>
                    <div className="ptl-line">
                      <div className="ptl-dot" style={{background: e.color}}/>
                    </div>
                    <div className="ptl-card">
                      <div className="ptl-title">{e.title}</div>
                      <div className="ptl-place">{e.place}</div>
                      {e.note && <div className="ptl-note">{e.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === "docs" && (
            <Card padding={28}>
              <div className="eyebrow">Documentos arquivados</div>
              <div className="docgrid">
                {[
                  { title: "Certidão de nascimento", year: p.birth?.year, kind: "Certidão", tone: "beige" },
                  { title: "Lista de chegada — Hospedaria", year: 1903, kind: "Imigração", tone: "olive" },
                  { title: "Carta a Carmela", year: 1908, kind: "Carta manuscrita", tone: "petrol" },
                  { title: "Foto do casamento", year: 1905, kind: "Fotografia", tone: "beige" },
                ].map((d, i) => (
                  <div key={i} className="doc-card">
                    <div className={"doc-thumb doc-thumb-" + d.tone}/>
                    <div className="doc-meta">
                      <div className="doc-title">{d.title}</div>
                      <div className="doc-sub">{d.kind} · {d.year}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === "photos" && (
            <Card padding={28}>
              <div className="eyebrow">Galeria de fotos antigas</div>
              <div className="photogrid">
                {Array.from({length: 8}).map((_, i) => (
                  <div key={i} className={"photo-tile photo-tile-" + (["sepia","silver","cream","sepia2"][i%4])}>
                    <div className="photo-cap">{1900 + i*8}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === "places" && (
            <Card padding={0}>
              <div className="card-head"><h3>Locais importantes da vida</h3></div>
              <div className="places-map">
                <MiniMap/>
                <div className="places-list">
                  {[
                    { y: p.birth?.year, label: `Nasceu em ${p.birth?.place}`, color: "#5b6e4f" },
                    { y: (p.birth?.year||0) + 22, label: "Mudou-se para São Paulo", color: "#3a5b6b" },
                    p.death && { y: p.death.year, label: `Faleceu em ${p.death.place}`, color: "#a08658" },
                  ].filter(Boolean).map((pl, i) => (
                    <div key={i} className="place-row">
                      <span className="place-dot" style={{background: pl.color}}/>
                      <div className="place-year">{pl.y}</div>
                      <div className="place-label">{pl.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>

        <aside className="profile-side">
          <Card padding={20}>
            <div className="side-head">
              <span className="eyebrow">Posição na árvore</span>
              <button className="link">Ver na árvore →</button>
            </div>
            <div className="mini-tree">
              {parents.length > 0 && (
                <div className="mini-tree-row">
                  {parents.map(par => (
                    <button key={par.id} className="mini-pill" onClick={() => onPersonClick(par.id)}>
                      <Avatar person={par} size={26}/>
                      <span>{par.first}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="mini-tree-row mini-tree-row-self">
                <div className="mini-pill mini-pill-self">
                  <Avatar person={p} size={32}/>
                  <span>{p.first}</span>
                </div>
                {spouse && (
                  <>
                    <span className="mini-tree-amp">&</span>
                    <button className="mini-pill" onClick={() => onPersonClick(spouse.id)}>
                      <Avatar person={spouse} size={26}/>
                      <span>{spouse.first}</span>
                    </button>
                  </>
                )}
              </div>
              {children.length > 0 && (
                <div className="mini-tree-row">
                  {children.map(c => (
                    <button key={c.id} className="mini-pill" onClick={() => onPersonClick(c.id)}>
                      <Avatar person={c} size={26}/>
                      <span>{c.first}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card padding={20}>
            <div className="eyebrow">DNA & origem</div>
            <div className="origin-bars">
              <div className="origin-row">
                <span className="origin-label">Norte da Itália</span>
                <div className="origin-bar"><div className="origin-fill" style={{width: "48%", background: "#5b6e4f"}}/></div>
                <span className="origin-pct">48%</span>
              </div>
              <div className="origin-row">
                <span className="origin-label">Portugal</span>
                <div className="origin-bar"><div className="origin-fill" style={{width: "27%", background: "#3a5b6b"}}/></div>
                <span className="origin-pct">27%</span>
              </div>
              <div className="origin-row">
                <span className="origin-label">Brasil indígena</span>
                <div className="origin-bar"><div className="origin-fill" style={{width: "15%", background: "#a08658"}}/></div>
                <span className="origin-pct">15%</span>
              </div>
              <div className="origin-row">
                <span className="origin-label">Outros</span>
                <div className="origin-bar"><div className="origin-fill" style={{width: "10%", background: "#cabba0"}}/></div>
                <span className="origin-pct">10%</span>
              </div>
            </div>
            <div className="origin-note">Estimativa baseada em registros familiares</div>
          </Card>

          <Card padding={20}>
            <div className="eyebrow">Sugestões para este perfil</div>
            <div className="side-sug">
              <Icon name="sparkle" size={14}/>
              <div>Encontramos um possível registro de batismo de {p.first} em arquivos paroquiais. <a href="#">Revisar</a></div>
            </div>
            <div className="side-sug">
              <Icon name="sparkle" size={14}/>
              <div>3 fotos sem identificação podem ser de {p.first} — <a href="#">conferir</a></div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function RelationGroup({ label, people, onPersonClick }) {
  if (!people || people.length === 0) return null;
  return (
    <div className="rel-group">
      <div className="rel-label">{label}</div>
      <div className="rel-list">
        {people.map(p => (
          <button key={p.id} className="rel-card" onClick={() => onPersonClick(p.id)}>
            <Avatar person={p} size={44}/>
            <div className="rel-text">
              <div className="rel-name">{p.first} {p.last}</div>
              <div className="rel-meta">{fmtLifespan(p)} · {p.occupation}</div>
            </div>
            <Icon name="chev-right" size={14}/>
          </button>
        ))}
      </div>
    </div>
  );
}

function buildPersonEvents(p, F) {
  const events = [];
  if (p.birth?.year) events.push({ year: p.birth.year, title: "Nascimento", place: p.birth.place, color: "#5b6e4f" });
  const union = F.unions.find(u => u.partners.includes(p.id));
  if (union) {
    const partner = F.people[union.partners.find(x => x !== p.id)];
    events.push({ year: union.year, title: `Casamento com ${partner?.first || "—"}`, place: union.place, color: "#3a5b6b" });
  }
  // Children births
  Object.values(F.people).forEach(c => {
    if ((c.parents||[]).includes(p.id) && c.birth?.year) {
      events.push({ year: c.birth.year, title: `Nascimento de ${c.first}`, place: c.birth.place, color: "#a08658", note: `${c.first} {${c.last}}` });
    }
  });
  if (p.death?.year) events.push({ year: p.death.year, title: "Falecimento", place: p.death.place, color: "#7a6b52" });
  events.sort((a,b) => a.year - b.year);
  return events;
}

window.Profile = Profile;
