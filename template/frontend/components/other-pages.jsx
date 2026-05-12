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
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("name");
  let list = Object.values(F.people);
  if (q) list = list.filter(p => `${p.first} ${p.last}`.toLowerCase().includes(q.toLowerCase()));
  if (sort === "name") list.sort((a,b) => a.first.localeCompare(b.first));
  if (sort === "year") list.sort((a,b) => (a.birth?.year||0) - (b.birth?.year||0));
  if (sort === "gen") list.sort((a,b) => a.generation - b.generation);

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
        </div>
      </div>

      <div className="people-grid">
        {list.map(p => (
          <button key={p.id} className="person-card" onClick={() => onPersonClick(p.id)}>
            <Avatar person={p} size={56}/>
            <div className="person-card-text">
              <div className="person-card-name">{p.first} {p.last}</div>
              <div className="person-card-meta">{fmtLifespan(p)}</div>
              <div className="person-card-occ">{p.occupation}</div>
            </div>
            <div className="person-card-gen">G{p.generation}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TimelinePage() {
  const F = window.FAMILY;
  // group by decade
  const events = [...F.timeline].sort((a,b)=>a.year-b.year);
  return (
    <div className="page page-timeline">
      <div className="people-head">
        <div>
          <div className="eyebrow">Linha do tempo</div>
          <h1>1881 – 2026 · 145 anos</h1>
          <p className="docs-sub">A história da sua família, geração por geração.</p>
        </div>
      </div>
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
    </div>
  );
}

window.SearchPage = SearchPage;
window.DocumentsPage = DocumentsPage;
window.PeoplePage = PeoplePage;
window.TimelinePage = TimelinePage;
