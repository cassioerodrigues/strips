// Search (historical records) + Documents pages + Mobile

function SearchPage({ onPersonClick }) {
  const F = window.FAMILY;
  const [q, setQ] = React.useState("Bertolini");
  const [filter, setFilter] = React.useState({ region: "Itália", from: 1880, to: 1920, kind: "Todos" });

  const records = [
    { kind: "Manifesto de imigração", title: "Giuseppe Bertolini, 22a", date: "12 nov 1903", place: "Porto de Santos, BR", source: "Arquivo Hospedaria de Imigrantes", confidence: 96, matched: "p_giuseppe" },
    { kind: "Registro paroquial", title: "Battesimo di Giuseppe Bertolini", date: "04 fev 1881", place: "Treviso, IT", source: "Archivio di Stato di Treviso", confidence: 92, matched: "p_giuseppe" },
    { kind: "Censo", title: "Família Bertolini · Brás", date: "1920", place: "São Paulo, BR", source: "IBGE / FamilySearch", confidence: 88, matched: null },
    { kind: "Lista de embarque", title: "Pietro Bertolini, 24a", date: "08 mar 1903", place: "Porto de Gênova, IT", source: "Ellis & SAS Archives", confidence: 78, matched: null, hint: "Pode ser irmão de Giuseppe" },
    { kind: "Certidão de óbito", title: "Antônio Bertolini", date: "1989", place: "São Paulo, BR", source: "Cartório Sé · 4° subdistrito", confidence: 99, matched: "p_antonio" },
    { kind: "Foto de jornal", title: "Inauguração da farmácia", date: "1937", place: "Brás, SP", source: "Hemeroteca Digital", confidence: 71, matched: null },
  ];

  return (
    <div className="page page-search">
      <div className="search-hero">
        <div className="eyebrow">Pesquisa histórica</div>
        <h1>Encontre quem ainda falta na sua árvore.</h1>
        <p className="search-sub">Buscamos em arquivos paroquiais, censos, manifestos de imigração, cartórios e jornais de mais de 40 países.</p>

        <div className="search-bar">
          <Icon name="search" size={18}/>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Sobrenome, nome ou local…"/>
          <button className="btn btn-primary">Buscar registros</button>
        </div>

        <div className="search-filters">
          <div className="filter">
            <Icon name="globe" size={13}/>
            <select value={filter.region} onChange={e => setFilter({...filter, region: e.target.value})}>
              <option>Itália</option><option>Portugal</option><option>Brasil</option><option>Todos os países</option>
            </select>
          </div>
          <div className="filter">
            <Icon name="calendar" size={13}/>
            <span>{filter.from} – {filter.to}</span>
          </div>
          <div className="filter">
            <Icon name="doc" size={13}/>
            <select value={filter.kind} onChange={e => setFilter({...filter, kind: e.target.value})}>
              <option>Todos</option><option>Certidões</option><option>Censos</option><option>Manifestos</option><option>Jornais</option>
            </select>
          </div>
          <button className="filter-clear">Limpar</button>
        </div>
      </div>

      <div className="search-body">
        <aside className="search-side">
          <div className="ssec">
            <div className="ssec-h">Acervos disponíveis</div>
            {[
              ["Arquivo Hospedaria de Imigrantes", "12.4M registros", "#5b6e4f"],
              ["Archivio di Stato di Treviso", "880K registros", "#3a5b6b"],
              ["Cartórios brasileiros", "47M registros", "#a08658"],
              ["Hemeroteca Digital", "210M páginas", "#7a6b52"],
              ["FamilySearch", "Bilhões de registros", "#5b6e4f"],
            ].map(([name, count, c]) => (
              <div key={name} className="archive-row">
                <span className="archive-dot" style={{background: c}}/>
                <div>
                  <div className="archive-name">{name}</div>
                  <div className="archive-count">{count}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="search-results">
          <div className="search-meta">
            <span><strong>{records.length}</strong> resultados para "<strong>{q}</strong>"</span>
            <div className="seg">
              <button className="seg-on">Relevância</button>
              <button>Data</button>
              <button>Confiança</button>
            </div>
          </div>

          <div className="record-list">
            {records.map((r, i) => (
              <div key={i} className="record">
                <div className="record-kind">
                  <Icon name={r.kind.includes("Foto") ? "doc" : r.kind.includes("Censo") ? "people" : "doc"} size={16}/>
                  <span>{r.kind}</span>
                </div>
                <div className="record-main">
                  <div className="record-title">{r.title}</div>
                  <div className="record-meta">
                    <span><Icon name="calendar" size={12}/>{r.date}</span>
                    <span><Icon name="pin" size={12}/>{r.place}</span>
                    <span className="record-source">{r.source}</span>
                  </div>
                  {r.hint && <div className="record-hint"><Icon name="sparkle" size={12}/>{r.hint}</div>}
                </div>
                <div className="record-conf">
                  <div className="conf-ring" style={{"--p": r.confidence}}>
                    <span>{r.confidence}%</span>
                  </div>
                </div>
                <div className="record-actions">
                  {r.matched ? (
                    <button className="btn btn-sm btn-ghost"><Icon name="check" size={12}/>Vinculado</button>
                  ) : (
                    <button className="btn btn-sm btn-primary">Vincular</button>
                  )}
                  <button className="iconbtn-sm"><Icon name="more" size={14}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentsPage() {
  const docs = [
    { title: "Certidão de chegada — Hospedaria", year: 1903, kind: "Certidão", tone: "olive", tag: "Giuseppe" },
    { title: "Carta de Assunta a Giuseppe", year: 1907, kind: "Manuscrito", tone: "beige", tag: "Assunta" },
    { title: "Foto do casamento", year: 1905, kind: "Fotografia", tone: "petrol", tag: "Giuseppe & Assunta" },
    { title: "Diploma USP", year: 1936, kind: "Diploma", tone: "olive", tag: "Antônio" },
    { title: "Recital Teatro Municipal", year: 1942, kind: "Programa", tone: "beige", tag: "Isabel" },
    { title: "Foto de família", year: 1958, kind: "Fotografia", tone: "petrol", tag: "Família" },
    { title: "Passaporte português", year: 1897, kind: "Passaporte", tone: "olive", tag: "João" },
    { title: "Certidão de óbito", year: 1949, kind: "Certidão", tone: "beige", tag: "João" },
  ];
  const [drag, setDrag] = React.useState(false);

  return (
    <div className="page page-docs">
      <div className="docs-head">
        <div>
          <div className="eyebrow">Documentos</div>
          <h1>Acervo da família</h1>
          <p className="docs-sub">47 documentos · 8.2 GB · organizados automaticamente por pessoa, época e tipo.</p>
        </div>
        <div className="docs-actions">
          <button className="btn btn-ghost"><Icon name="filter" size={14}/>Filtrar</button>
          <button className="btn btn-primary"><Icon name="upload" size={14}/>Enviar arquivos</button>
        </div>
      </div>

      <div
        className={"dropzone " + (drag ? "dropzone-on" : "")}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); }}
      >
        <div className="dropzone-icon">
          <Icon name="upload" size={28}/>
        </div>
        <div className="dropzone-text">
          <strong>Arraste fotos antigas, certidões ou cartas</strong>
          <span>ou <a href="#">selecione do computador</a> · JPG, PNG, PDF, TIFF · até 50 MB cada</span>
        </div>
        <div className="dropzone-tags">
          <Pill tone="olive">Reconhecimento de texto</Pill>
          <Pill tone="petrol">Datação automática</Pill>
          <Pill tone="beige">Identificação de pessoas</Pill>
        </div>
      </div>

      <div className="docs-filterbar">
        <div className="seg">
          <button className="seg-on">Tudo</button>
          <button>Certidões</button>
          <button>Fotografias</button>
          <button>Cartas</button>
          <button>Diplomas</button>
        </div>
        <div className="docs-view">
          <button className="seg-icon seg-on"><Icon name="filter" size={14}/></button>
          <button className="seg-icon"><Icon name="map" size={14}/></button>
        </div>
      </div>

      <div className="docs-grid">
        {docs.map((d, i) => (
          <div key={i} className="doc-tile">
            <div className={"doc-thumb-lg doc-thumb-" + d.tone}>
              <div className="doc-thumb-stamp">{d.kind}</div>
              <div className="doc-thumb-corner"/>
            </div>
            <div className="doc-tile-meta">
              <div className="doc-tile-title">{d.title}</div>
              <div className="doc-tile-sub">{d.year} · {d.tag}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PeoplePage({ onPersonClick }) {
  const F = window.FAMILY;
  const tree = window.useTree ? window.useTree() : { status: "unavailable", people: [] };
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("name");
  const [addOpen, setAddOpen] = React.useState(false);
  const [editPerson, setEditPerson] = React.useState(null);
  const [mutation, setMutation] = React.useState({ saving: false, error: null });

  // Fonte: API quando "ready", senão FAMILY mock.
  const apiList = tree.status === "ready" ? tree.people : null;
  const familyList = Object.values(F.people);
  const source = apiList || familyList;

  let list = source.slice();
  if (q) list = list.filter(p => `${p.first||""} ${p.last||""}`.toLowerCase().includes(q.toLowerCase()));
  if (sort === "name") list.sort((a,b) => (a.first||"").localeCompare(b.first||""));
  if (sort === "year") list.sort((a,b) => (a.birth?.year||0) - (b.birth?.year||0));
  if (sort === "gen") list.sort((a,b) => (a.generation||0) - (b.generation||0));

  const isLoading = tree.status === "loading" || tree.status === "idle";
  const isError = tree.status === "error" && (!apiList || apiList.length === 0);
  const isEmpty = tree.status === "ready" && apiList.length === 0;
  const canEdit = tree.status === "ready" ? !!tree.canEdit : true;
  const readOnlyReason = tree.role === "viewer"
    ? "Visualizadores não podem editar esta árvore."
    : "Somente leitura.";

  function friendlyError(e) {
    if (e && e.status === 403) return "Você não tem permissão para alterar esta árvore.";
    if (e && e.status === 422) return "Alguns campos não foram aceitos pela API. Revise os dados e tente novamente.";
    return (e && e.message) || "Não foi possível salvar a alteração.";
  }

  async function runMutation(fn) {
    setMutation({ saving: true, error: null });
    try {
      await fn();
      setMutation({ saving: false, error: null });
    } catch (e) {
      setMutation({ saving: false, error: friendlyError(e) });
      throw e;
    }
  }

  function saveNewPerson(form) {
    return runMutation(() => {
      if (tree.status !== "ready") return Promise.resolve();
      return window.useTree.actions.createPerson(form);
    });
  }

  function saveEditedPerson(form) {
    if (!editPerson) return Promise.resolve();
    return runMutation(() => {
      if (tree.status !== "ready") return Promise.resolve();
      return window.useTree.actions.updatePerson(editPerson.id, form);
    });
  }

  function deleteEditedPerson() {
    if (!editPerson) return Promise.resolve();
    return runMutation(() => {
      if (tree.status !== "ready") return Promise.resolve();
      return window.useTree.actions.deletePerson(editPerson.id);
    }).then(() => setEditPerson(null));
  }

  return (
    <div className="page page-people">
      <div className="people-head">
        <div>
          <div className="eyebrow">Pessoas</div>
          <h1>Todas as pessoas da família</h1>
        </div>
        <div className="people-tools">
          <div className="people-search">
            <Icon name="search" size={14}/>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome…"/>
          </div>
          <div className="seg">
            <button className={sort==="name"?"seg-on":""} onClick={()=>setSort("name")}>A–Z</button>
            <button className={sort==="year"?"seg-on":""} onClick={()=>setSort("year")}>Ano</button>
            <button className={sort==="gen"?"seg-on":""} onClick={()=>setSort("gen")}>Geração</button>
          </div>
          {canEdit && <button className="btn btn-sm btn-primary" onClick={() => setAddOpen(true)}><Icon name="plus" size={14}/>Adicionar pessoa</button>}
        </div>
      </div>

      {isLoading && <div className="api-loading">Carregando pessoas…</div>}
      {isError && (
        <div className="api-error" role="alert">
          Não foi possível carregar as pessoas. {tree.error}
          <button className="link" onClick={() => window.useTree.refetch && window.useTree.refetch()}>Tentar novamente</button>
        </div>
      )}
      {isEmpty && (
        <div className="api-empty">
          Ainda não há pessoas nesta árvore. Use <strong>Adicionar pessoa</strong> para começar.
        </div>
      )}

      {!isLoading && !isEmpty && (
        <div className="people-grid">
          {list.map(p => (
            <div
              key={p.id}
              className="person-card"
              role="button"
              tabIndex={0}
              onClick={() => onPersonClick(p.id)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onPersonClick(p.id); }}
            >
              <Avatar person={p} size={56}/>
              <div className="person-card-text">
                <div className="person-card-name">{p.first} {p.last}</div>
                <div className="person-card-meta">{fmtLifespan(p)}</div>
                <div className="person-card-occ">{p.occupation}</div>
              </div>
              {p.generation && <div className="person-card-gen">G{p.generation}</div>}
              {canEdit && (
                <button
                  className="person-card-edit"
                  onClick={e => { e.stopPropagation(); setEditPerson(p); }}
                  aria-label={"Editar pessoa " + `${p.first} ${p.last}`.trim()}
                  title="Editar pessoa"
                >
                  <Icon name="edit" size={13}/>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {window.AddPersonModal && <window.AddPersonModal
        open={addOpen}
        people={source}
        unions={tree.status === "ready" ? tree.unions : F.unions}
        timeline={tree.status === "ready" ? tree.timeline : F.timeline}
        onClose={() => setAddOpen(false)}
        onSave={saveNewPerson}
        saving={mutation.saving}
        error={mutation.error}
        readOnly={!canEdit}
        readOnlyReason={readOnlyReason}
      />}
      {window.EditPersonModal && <window.EditPersonModal
        open={!!editPerson}
        person={editPerson}
        people={source}
        unions={tree.status === "ready" ? tree.unions : F.unions}
        timeline={tree.status === "ready" ? tree.timeline : F.timeline}
        onClose={() => setEditPerson(null)}
        onSave={saveEditedPerson}
        onDelete={deleteEditedPerson}
        saving={mutation.saving}
        error={mutation.error}
        readOnly={!canEdit}
        readOnlyReason={readOnlyReason}
      />}
    </div>
  );
}

function TimelinePage() {
  const F = window.FAMILY;
  const tree = window.useTree ? window.useTree() : { status: "unavailable", timeline: [] };

  const apiTimeline = tree.status === "ready" ? tree.timeline : null;
  const sourceTimeline = apiTimeline || F.timeline;
  const events = [...sourceTimeline].sort((a, b) => (a.year || 0) - (b.year || 0));

  const isLoading = tree.status === "loading" || tree.status === "idle";
  const isError = tree.status === "error" && (!apiTimeline || apiTimeline.length === 0);
  const isEmpty = tree.status === "ready" && events.length === 0;

  const firstYear = events.length > 0 ? events[0].year : null;
  const lastYear = events.length > 0 ? events[events.length - 1].year : null;
  const span = firstYear && lastYear ? `${firstYear} – ${lastYear} · ${lastYear - firstYear} anos` : "Linha do tempo da família";

  return (
    <div className="page page-timeline">
      <div className="people-head">
        <div>
          <div className="eyebrow">Linha do tempo</div>
          <h1>{span}</h1>
          <p className="docs-sub">A história da sua família, geração por geração.</p>
        </div>
      </div>
      {isLoading && <div className="api-loading">Carregando linha do tempo…</div>}
      {isError && (
        <div className="api-error" role="alert">
          Não foi possível carregar a linha do tempo. {tree.error}
          <button className="link" onClick={() => window.useTree.refetch && window.useTree.refetch()}>Tentar novamente</button>
        </div>
      )}
      {isEmpty && (
        <div className="api-empty">
          Nenhum evento ainda. Conforme você adiciona pessoas, casamentos e eventos, eles aparecem aqui.
        </div>
      )}
      {!isLoading && !isEmpty && (
        <div className="big-timeline">
          {events.map((e, i) => (
            <div key={i} className="big-tl-row">
              <div className="big-tl-year">{e.year}</div>
              <div className="big-tl-line"><div className="big-tl-dot"/></div>
              <Card padding={20} className="big-tl-card">
                <div className="big-tl-title">{e.label}</div>
                <div className="big-tl-place"><Icon name="pin" size={12}/>{e.place}</div>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

window.SearchPage = SearchPage;
window.DocumentsPage = DocumentsPage;
window.PeoplePage = PeoplePage;
window.TimelinePage = TimelinePage;
