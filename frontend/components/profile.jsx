// Person profile page

function Profile({ personId, onBack, onPersonClick }) {
  const F = window.FAMILY;
  const tree = window.useTree ? window.useTree() : { status: "unavailable", people: [], canEdit: false };
  // usePerson() retorna { status, person, relations, error }. Casos:
  //   - "fallback"     : personId é mock (p_*) → usa FAMILY direto
  //   - "unavailable"  : sem API configurada → usa FAMILY direto
  //   - "loading"/"idle": render skeleton (early return)
  //   - "ready"        : usa person/relations da API
  //   - "empty"/"error": render mensagem (early return)
  const personHook = window.usePerson ? window.usePerson(personId) : { status: "unavailable" };
  const [tab, setTab] = React.useState("bio");
  const [editOpen, setEditOpen] = React.useState(false);
  const [eventOpen, setEventOpen] = React.useState(false);
  const [eventEditOpen, setEventEditOpen] = React.useState(false);
  const [eventToEdit, setEventToEdit] = React.useState(null);
  const [relationOpen, setRelationOpen] = React.useState(false);
  const [unionEditOpen, setUnionEditOpen] = React.useState(false);
  const [unionToEdit, setUnionToEdit] = React.useState(null);
  const [mutation, setMutation] = React.useState({ saving: false, error: null });
  const [mediaState, setMediaState] = React.useState({ loading: false, items: [], error: null, action: null });
  const photoInputRef = React.useRef(null);
  const docInputRef = React.useRef(null);

  const useApi = personHook.status === "ready";
  const mediaPersonId = useApi && personHook.person ? personHook.person.id : null;
  const useFamily =
    personHook.status === "fallback" ||
    personHook.status === "unavailable" ||
    (personHook.status === "idle" && (!personId || (typeof personId === "string" && personId.indexOf("p_") === 0)));

  async function refreshPersonMedia() {
    if (!mediaPersonId || !window.genealogyApi) return;
    const adapt = window.adapters || {};
    setMediaState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const raw = await window.genealogyApi.listPersonMedia(mediaPersonId);
      const items = (Array.isArray(raw) ? raw : [])
        .map(adapt.adaptMedia || (x => x))
        .filter(Boolean);
      const signedItems = await Promise.all(items.map(async item => {
        try {
          const signed = await window.genealogyApi.getMediaDownloadUrl(item.id);
          return { ...item, downloadUrl: signed && signed.url ? signed.url : null, downloadError: null };
        } catch (e) {
          return { ...item, downloadUrl: null, downloadError: (e && e.message) || "Falha ao assinar download." };
        }
      }));
      const signErrors = signedItems.filter(item => item.downloadError).length;
      setMediaState(prev => ({
        ...prev,
        loading: false,
        items: signedItems,
        error: signErrors ? "Algumas midias foram carregadas, mas nao puderam gerar URL de download." : null,
      }));
    } catch (e) {
      setMediaState(prev => ({
        ...prev,
        loading: false,
        items: [],
        error: (e && e.message) || "Nao foi possivel carregar as midias desta pessoa.",
      }));
    }
  }

  React.useEffect(() => {
    if (!mediaPersonId) {
      setMediaState({ loading: false, items: [], error: null, action: null });
      return undefined;
    }
    refreshPersonMedia();
    return undefined;
  }, [mediaPersonId]);

  if (personHook.status === "loading" || (personHook.status === "idle" && !useFamily)) {
    return (
      <div className="page page-profile">
        <div className="api-loading">Carregando perfil…</div>
      </div>
    );
  }
  if (personHook.status === "empty") {
    return (
      <div className="page page-profile">
        <div className="api-empty">
          Pessoa não encontrada.
          <button className="link" onClick={onBack}>Voltar</button>
        </div>
      </div>
    );
  }
  if (personHook.status === "error") {
    return (
      <div className="page page-profile">
        <div className="api-error" role="alert">
          Não foi possível carregar este perfil. {personHook.error}
          <button className="link" onClick={onBack}>Voltar</button>
        </div>
      </div>
    );
  }

  // Resolve `p` a partir da API (adaptado) ou do FAMILY mock.
  const p = useApi ? personHook.person : (F.people[personId] || null);
  if (!p) return null;

  // Find relations
  let parents, spouse, spouseUnion, children, siblings;
  if (useApi && personHook.relations) {
    parents = personHook.relations.parents || [];
    spouse = (personHook.relations.partners && personHook.relations.partners[0]) || null;
    spouseUnion = spouse
      ? (tree.unions || []).find(u =>
          (u.partner_a_id === p.id && u.partner_b_id === spouse.id) ||
          (u.partner_b_id === p.id && u.partner_a_id === spouse.id)
        )
      : null;
    children = personHook.relations.children || [];
    siblings = personHook.relations.siblings || [];
  } else {
    parents = (p.parents || []).map(id => F.people[id]).filter(Boolean);
    spouseUnion = F.unions.find(u => u.partners.includes(p.id));
    spouse = spouseUnion ? F.people[spouseUnion.partners.find(x => x !== p.id)] : null;
    children = Object.values(F.people).filter(x => (x.parents||[]).includes(p.id));
    siblings = Object.values(F.people).filter(x =>
      x.id !== p.id && x.parents && p.parents &&
      x.parents.some(pp => p.parents.includes(pp))
    );
  }

  const accentColor = p.sex === "F" ? "#a85d3a" : p.sex === "M" ? "#2c4a59" : "#a08658";

  const mediaItems = mediaState.items || [];
  const photoMedia = mediaItems.filter(item =>
    item.kind === "photo" || (item.mimeType && item.mimeType.indexOf("image/") === 0)
  );
  const documentMedia = mediaItems.filter(item =>
    item.kind !== "photo" && !(item.mimeType && item.mimeType.indexOf("image/") === 0)
  );
  const birthDocuments = mediaItems.filter(isBirthMedia);
  const events = useApi
    ? buildPersonEventsFromApi(p, children, personHook.events || [], birthDocuments, tree.unions || [], tree.peopleById || {})
    : buildPersonEvents(p, F);
  const canEdit = useApi ? !!tree.canEdit : true;
  const readOnlyReason = tree.role === "viewer"
    ? "Visualizadores não podem editar esta árvore."
    : "Somente leitura.";

  function friendlyError(e) {
    if (e && e.status === 403) return "Você não tem permissão para alterar esta árvore.";
    if (e && e.status === 422) return "Alguns campos não foram aceitos pela API. Revise os dados e tente novamente.";
    return (e && e.message) || "Não foi possível salvar a alteração.";
  }

  async function uploadMediaFile(file, preferredKind, options) {
    if (!file || !mediaPersonId || !tree.treeId || !window.genealogyApi) return;
    setMediaState(prev => ({ ...prev, action: "upload", error: null }));
    try {
      await window.genealogyApi.uploadPersonMedia(tree.treeId, mediaPersonId, file, {
        kind: preferredKind || window.genealogyApi.mediaKindFromFile(file),
        ...((options && typeof options === "object") ? options : {}),
      });
      await refreshPersonMedia();
      if (window.useTree && window.useTree.refetch) window.useTree.refetch();
      setMediaState(prev => ({ ...prev, action: null, error: null }));
    } catch (e) {
      setMediaState(prev => ({
        ...prev,
        action: null,
        error: (e && e.message) || "Nao foi possivel enviar a midia.",
      }));
    }
  }

  async function deleteMediaItem(media) {
    if (!media || !media.id || !window.genealogyApi) return;
    if (!window.confirm("Remover esta midia do acervo?")) return;
    setMediaState(prev => ({ ...prev, action: "delete:" + media.id, error: null }));
    try {
      await window.genealogyApi.deleteMedia(media.id);
      setMediaState(prev => ({
        ...prev,
        action: null,
        items: prev.items.filter(item => item.id !== media.id),
        error: null,
      }));
      if (window.useTree && window.useTree.refetch) window.useTree.refetch();
    } catch (e) {
      setMediaState(prev => ({
        ...prev,
        action: null,
        error: (e && e.message) || "Nao foi possivel remover a midia.",
      }));
    }
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

  function savePerson(form) {
    return runMutation(() => window.useTree.actions.updatePerson(p.id, form));
  }

  function uploadBirthDocument(file) {
    return uploadMediaFile(file, file && file.type && file.type.indexOf("image/") === 0 ? "photo" : "document", {
      title: file && file.name ? file.name.replace(/\.[^.]+$/, "") : "Documento de nascimento",
      description: "Documento vinculado ao evento de nascimento",
    });
  }

  function deletePerson(options) {
    const opts = options || {};
    if (!opts.skipConfirm) {
      const name = [p.first, p.last].filter(Boolean).join(" ") || "esta pessoa";
      if (!window.confirm(`Excluir ${name} da árvore? Esta ação não pode ser desfeita.`)) return Promise.resolve();
    }
    return runMutation(() => window.useTree.actions.deletePerson(p.id)).then(() => {
      setEditOpen(false);
      onBack();
    });
  }

  function saveEvent(form) {
    return runMutation(() => window.useTree.actions.addEvent(p.id, form));
  }

  function saveEditedEvent(form) {
    if (!eventToEdit) return Promise.resolve();
    return runMutation(() => window.useTree.actions.updateEvent(p.id, eventToEdit.id, form));
  }

  function saveRelation(form) {
    const ids = form && Array.isArray(form.targetIds) ? form.targetIds : [];
    const relationForm = {
      parentIds: form && form.relationType === "parent" ? ids : [],
      childIds: form && form.relationType === "child" ? ids : [],
      spouseIds: form && form.relationType === "spouse" ? ids : [],
      siblingIds: form && form.relationType === "sibling" ? ids : [],
    };
    return runMutation(() => window.useTree.actions.addRelationships(p.id, relationForm));
  }

  function deleteEvent(eventId) {
    if (!window.confirm("Remover este evento da linha do tempo?")) return;
    return runMutation(() => window.useTree.actions.deleteEvent(p.id, eventId));
  }

  function removeParentLink(parentId) {
    if (!window.confirm("Remover este vínculo de filiação?")) return;
    return runMutation(() => window.useTree.actions.removeParent(p.id, parentId));
  }

  function editEvent(event) {
    setEventToEdit(event);
    setEventEditOpen(true);
  }

  function openUnionEditor(union) {
    setUnionToEdit(union);
    setUnionEditOpen(true);
  }

  function closeUnionEditor() {
    setUnionEditOpen(false);
    setUnionToEdit(null);
  }

  function cleanUnionInt(value, label) {
    if (value == null || value === "") return null;
    const text = String(value).trim();
    if (!text) return null;
    const n = Number.parseInt(text, 10);
    if (!Number.isFinite(n) || !/^\d+$/.test(text)) {
      throw new Error(label + " invalido.");
    }
    return n;
  }

  function saveUnionDetails(form) {
    let payload;
    try {
      payload = {
        start_year: cleanUnionInt(form && form.year, "Ano do casamento"),
        start_month: cleanUnionInt(form && form.month, "Mes do casamento"),
        start_day: cleanUnionInt(form && form.day, "Dia do casamento"),
        start_place: String((form && form.place) || "").trim() || null,
        notes: String((form && form.description) || "").trim() || null,
      };
      if (form && form.status) payload.status = form.status;
    } catch (e) {
      setMutation({ saving: false, error: e.message || "Dados do casamento invalidos." });
      return Promise.reject(e);
    }

    return runMutation(() => window.useTree.actions.updateUnion(p.id, form.unionId, payload));
  }

  function deleteUnion(union) {
    if (!window.confirm("Remover esta união da árvore?")) return;
    return runMutation(() => window.useTree.actions.deleteUnion(p.id, union.id)).then(() => {
      closeUnionEditor();
    });
  }

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
          {canEdit && <button className="profile-photo-edit"><Icon name="edit" size={14}/></button>}
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
          {canEdit && <button className="btn btn-ghost" onClick={() => setEditOpen(true)}><Icon name="edit" size={14}/>Editar</button>}
          {canEdit && <button className="btn btn-primary" onClick={() => setEventOpen(true)}><Icon name="plus" size={14}/>Adicionar evento</button>}
          {canEdit && <button className="btn btn-ghost btn-danger-soft" onClick={() => deletePerson()} disabled={mutation.saving}>
            <Icon name="trash" size={14}/>{mutation.saving ? "Excluindo..." : "Excluir"}
          </button>}
          {window.EditPersonModal && <window.EditPersonModal
            open={editOpen}
            person={p}
            people={useApi ? tree.people : Object.values(F.people)}
            unions={useApi ? tree.unions : F.unions}
            timeline={useApi ? tree.timeline : F.timeline}
            onClose={() => setEditOpen(false)}
            onSave={savePerson}
            onDelete={() => deletePerson({ skipConfirm: true })}
            onUploadBirthDocument={uploadBirthDocument}
            birthDocuments={birthDocuments.length > 0 ? birthDocuments : documentMedia}
            uploadingBirthDocument={mediaState.action === "upload"}
            saving={mutation.saving}
            error={mutation.error}
            readOnly={!canEdit}
            readOnlyReason={readOnlyReason}
          />}
          {window.AddEventModal && <window.AddEventModal
            open={eventOpen}
            person={p}
            people={useApi ? tree.people : Object.values(F.people)}
            unions={useApi ? tree.unions : F.unions}
            timeline={useApi ? tree.timeline : F.timeline}
            onClose={() => setEventOpen(false)}
            onSave={saveEvent}
            saving={mutation.saving}
            error={mutation.error}
            readOnly={!canEdit}
            readOnlyReason={readOnlyReason}
          />}
          {window.AddEventModal && <window.AddEventModal
            open={eventEditOpen}
            person={p}
            people={useApi ? tree.people : Object.values(F.people)}
            unions={useApi ? tree.unions : F.unions}
            timeline={useApi ? tree.timeline : F.timeline}
            event={eventToEdit}
            onClose={() => { setEventEditOpen(false); setEventToEdit(null); }}
            onSave={saveEditedEvent}
            saving={mutation.saving}
            error={mutation.error}
            readOnly={!canEdit}
            readOnlyReason={readOnlyReason}
          />}
          {window.LinkPersonRelationModal && <window.LinkPersonRelationModal
            open={relationOpen}
            person={p}
            people={useApi ? tree.people : Object.values(F.people)}
            onClose={() => setRelationOpen(false)}
            onSave={saveRelation}
            saving={mutation.saving}
            error={mutation.error}
            readOnly={!canEdit}
            readOnlyReason={readOnlyReason}
          />}
          {window.EditUnionModal && <window.EditUnionModal
            open={unionEditOpen}
            person={p}
            partner={spouse}
            union={unionToEdit}
            people={useApi ? tree.people : Object.values(F.people)}
            unions={useApi ? tree.unions : F.unions}
            timeline={useApi ? tree.timeline : F.timeline}
            onClose={closeUnionEditor}
            onSave={saveUnionDetails}
            onDelete={deleteUnion}
            saving={mutation.saving}
            error={mutation.error}
            readOnly={!canEdit}
            readOnlyReason={readOnlyReason}
          />}
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
                {p.generation && (
                  <div><div className="bio-k">Geração</div><div className="bio-v">G{p.generation} · {gen_label(p.generation)}</div></div>
                )}
              </div>
            </Card>
          )}

          {tab === "family" && (
            <Card padding={28}>
              <div className="media-panel-head">
                <div className="eyebrow">Relacionamentos familiares</div>
                {canEdit && useApi && (
                  <button className="btn btn-sm btn-primary" onClick={() => setRelationOpen(true)} disabled={mutation.saving}>
                    <Icon name="plus" size={13}/>Vincular familiar
                  </button>
                )}
              </div>
              <RelationGroup
                label="Pais"
                people={parents}
                onPersonClick={onPersonClick}
                action={canEdit ? parent => (
                  <button className="link" onClick={(e) => { e.stopPropagation(); removeParentLink(parent.id); }}>
                    Remover vínculo
                  </button>
                ) : null}
              />
              {spouse && (
                <>
                  <RelationGroup
                    label={spouseUnion
                      ? `Cônjuge · ${spouseUnion.start_year || "sem data"}${spouseUnion.start_place ? ", " + spouseUnion.start_place : ""}`
                      : "Cônjuge"}
                    people={[spouse]}
                    onPersonClick={canEdit && spouseUnion
                      ? () => openUnionEditor(spouseUnion)
                      : onPersonClick}
                  />
                </>
              )}
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
                      {e.source && <div className="ptl-source"><Icon name="book" size={12}/>Fonte: {e.source}</div>}
                      {e.documents && e.documents.length > 0 && (
                        <div className="ptl-docs">
                          {e.documents.slice(0, 3).map(item => (
                            <button
                              key={item.id}
                              className="ptl-doc-chip"
                              disabled={!item.downloadUrl}
                              onClick={() => item.downloadUrl && window.open(item.downloadUrl, "_blank", "noopener")}
                              title={item.downloadError || "Abrir documento"}
                            >
                              <Icon name="doc" size={12}/>
                              <span>{item.title || "Documento"}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {canEdit && e.id && (
                        <div className="meta-row" style={{marginTop: 8}}>
                          <button className="link" onClick={() => editEvent(e)}>Editar evento</button>
                          <button className="link" onClick={() => deleteEvent(e.id)}>Remover evento</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === "docs" && (
            <Card padding={28}>
              {useApi ? (
                <>
                  <MediaPanelHeader
                    title="Documentos arquivados"
                    canEdit={canEdit}
                    loading={mediaState.loading || mediaState.action === "upload"}
                    onUpload={() => docInputRef.current && docInputRef.current.click()}
                  />
                  <input
                    ref={docInputRef}
                    type="file"
                    className="media-hidden-input"
                    onChange={e => {
                      const file = e.target.files && e.target.files[0];
                      e.target.value = "";
                      uploadMediaFile(file, file && file.type && file.type.indexOf("image/") === 0 ? "photo" : "document");
                    }}
                  />
                  <MediaStatus state={mediaState}/>
                  <div className="docgrid media-docgrid">
                    {documentMedia.length === 0 && !mediaState.loading && (
                      <div className="media-empty">Nenhum documento vinculado a este perfil.</div>
                    )}
                    {documentMedia.map(item => (
                      <div key={item.id} className="doc-card media-card">
                        <button
                          className="doc-thumb doc-thumb-beige media-doc-open"
                          disabled={!item.downloadUrl}
                          onClick={() => item.downloadUrl && window.open(item.downloadUrl, "_blank", "noopener")}
                          title={item.downloadError || "Abrir documento"}
                        >
                          <Icon name="doc" size={22}/>
                        </button>
                        <div className="doc-meta">
                          <div className="doc-title">{item.title || "Documento"}</div>
                          <div className="doc-sub">{mediaKindLabel(item)} · {formatFileSize(item.sizeBytes)}</div>
                          <MediaCardActions
                            item={item}
                            canEdit={canEdit}
                            deleting={mediaState.action === "delete:" + item.id}
                            onDelete={deleteMediaItem}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}
            </Card>
          )}

          {tab === "photos" && (
            <Card padding={28}>
              {useApi ? (
                <>
                  <MediaPanelHeader
                    title="Galeria de fotos antigas"
                    canEdit={canEdit}
                    loading={mediaState.loading || mediaState.action === "upload"}
                    onUpload={() => photoInputRef.current && photoInputRef.current.click()}
                  />
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="media-hidden-input"
                    onChange={e => {
                      const file = e.target.files && e.target.files[0];
                      e.target.value = "";
                      uploadMediaFile(file, "photo");
                    }}
                  />
                  <MediaStatus state={mediaState}/>
                  <div className="photogrid">
                    {photoMedia.length === 0 && !mediaState.loading && (
                      <div className="media-empty media-empty-wide">Nenhuma foto vinculada a este perfil.</div>
                    )}
                    {photoMedia.map(item => (
                      <div key={item.id} className="photo-tile media-photo-tile">
                        {item.downloadUrl ? (
                          <img src={item.downloadUrl} alt={item.title || "Foto do perfil"}/>
                        ) : (
                          <div className="media-photo-unavailable"><Icon name="doc" size={20}/></div>
                        )}
                        <div className="photo-cap">{item.takenYear || item.title || "Foto"}</div>
                        <MediaCardActions
                          item={item}
                          canEdit={canEdit}
                          deleting={mediaState.action === "delete:" + item.id}
                          onDelete={deleteMediaItem}
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
              <div className="eyebrow">Galeria de fotos antigas</div>
              <div className="photogrid">
                {Array.from({length: 8}).map((_, i) => (
                  <div key={i} className={"photo-tile photo-tile-" + (["sepia","silver","cream","sepia2"][i%4])}>
                    <div className="photo-cap">{1900 + i*8}</div>
                  </div>
                ))}
              </div>
                </>
              )}
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

function RelationGroup({ label, people, onPersonClick, action = null }) {
  if (!people || people.length === 0) return null;
  return (
    <div className="rel-group">
      <div className="rel-label">{label}</div>
      <div className="rel-list">
        {people.map(p => (
          <div
            key={p.id}
            className="rel-card"
            role="button"
            tabIndex={0}
            onClick={() => onPersonClick(p.id)}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onPersonClick(p.id); }}
          >
            <Avatar person={p} size={44}/>
            <div className="rel-text">
              <div className="rel-name">{p.first} {p.last}</div>
              <div className="rel-meta">{fmtLifespan(p)} · {p.occupation}</div>
              {action && action(p)}
            </div>
            <Icon name="chev-right" size={14}/>
          </div>
        ))}
      </div>
    </div>
  );
}

function MediaPanelHeader({ title, canEdit, loading, onUpload }) {
  return (
    <div className="media-panel-head">
      <div className="eyebrow">{title}</div>
      {canEdit && (
        <button className="btn btn-sm btn-primary" onClick={onUpload} disabled={loading}>
          <Icon name="upload" size={13}/>{loading ? "Enviando..." : "Enviar arquivo"}
        </button>
      )}
    </div>
  );
}

function MediaStatus({ state }) {
  if (!state || (!state.loading && !state.error)) return null;
  return (
    <div className={state.error ? "media-status media-status-error" : "media-status"}>
      {state.error || "Carregando midias..."}
    </div>
  );
}

function MediaCardActions({ item, canEdit, deleting, onDelete }) {
  return (
    <div className="media-card-actions">
      {item.downloadUrl ? (
        <button className="link" onClick={() => window.open(item.downloadUrl, "_blank", "noopener")}>
          Abrir
        </button>
      ) : (
        <span className="media-card-error">{item.downloadError || "Download indisponivel"}</span>
      )}
      {canEdit && (
        <button className="link media-delete" onClick={() => onDelete(item)} disabled={deleting}>
          {deleting ? "Removendo..." : "Remover"}
        </button>
      )}
    </div>
  );
}

function mediaKindLabel(item) {
  if (!item) return "Midia";
  if (item.kind === "photo") return "Foto";
  if (item.kind === "document") return "Documento";
  if (item.kind === "audio") return "Audio";
  if (item.kind === "video") return "Video";
  return "Arquivo";
}

function isBirthMedia(item) {
  if (!item) return false;
  const text = [
    item.title,
    item.description,
  ].filter(Boolean).join(" ").toLowerCase();
  return text.includes("nascimento") || text.includes("certidao") || text.includes("certidão") || text.includes("batismo");
}

function formatFileSize(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return "tamanho desconhecido";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return (n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1) + " MB";
}

function buildPersonEvents(p, F) {
  const events = [];
  if (p.birth?.year) {
    events.push({
      year: p.birth.year,
      title: "Nascimento",
      place: p.birth.place,
      color: "#5b6e4f",
      note: p.birth.note,
      source: p.birth.source,
    });
  }
  (F.unions || []).filter(u => unionHasPerson(u, p.id)).forEach(union => {
    const partner = F.people[getUnionPartnerId(union, p.id)];
    events.push({
      year: getUnionStartYear(union),
      title: `${unionTypeLabel(union.type)} com ${partnerName(partner)}`,
      place: getUnionStartPlace(union),
      color: "#3a5b6b",
      note: union.notes || "",
      unionId: union.id || null,
      kind: "union",
    });
  });
  // Children births
  Object.values(F.people).forEach(c => {
    if ((c.parents||[]).includes(p.id) && c.birth?.year) {
      events.push({
        year: c.birth.year,
        title: `Nascimento de ${c.first}`,
        place: c.birth.place,
        color: "#a08658",
        note: c.birth.note || `${c.first} ${c.last}`.trim(),
        source: c.birth.source,
      });
    }
  });
  if (p.death?.year) events.push({ year: p.death.year, title: "Falecimento", place: p.death.place, color: "#7a6b52" });
  events.sort((a,b) => a.year - b.year);
  return events;
}

// Eventos da API entram junto com nascimento + uniões + filhos + morte derivados.
function buildPersonEventsFromApi(p, children, apiEvents, birthDocuments, unions, peopleById) {
  const events = (apiEvents || []).map(e => ({
    id: e.id,
    type: e.type,
    year: e.year,
    month: e.month,
    day: e.day,
    title: personEventTimelineTitle(e, p, peopleById),
    place: e.place,
    color: "#3a5b6b",
    note: e.description,
  }));
  (unions || []).filter(u => unionHasPerson(u, p.id)).forEach(union => {
    const partner = peopleById && peopleById[getUnionPartnerId(union, p.id)];
    events.push({
      year: getUnionStartYear(union),
      month: union.start_month || null,
      day: union.start_day || null,
      title: `${unionTypeLabel(union.type)} com ${partnerName(partner)}`,
      place: getUnionStartPlace(union),
      color: "#3a5b6b",
      note: union.notes || "",
      unionId: union.id || null,
      kind: "union",
    });
  });
  if (p.birth?.year) {
    events.push({
      year: p.birth.year,
      title: "Nascimento",
      place: p.birth.place,
      color: "#5b6e4f",
      note: p.birth.note,
      source: p.birth.source,
      documents: birthDocuments || [],
    });
  }
  (children || []).forEach(c => {
    if (c.birth?.year) {
      events.push({
        year: c.birth.year,
        title: `Nascimento de ${c.first}`,
        place: c.birth.place,
        color: "#a08658",
        note: c.birth.note,
        source: c.birth.source,
      });
    }
  });
  if (p.death?.year) events.push({ year: p.death.year, title: "Falecimento", place: p.death.place, color: "#7a6b52" });
  events.sort((a,b) => (a.year||0) - (b.year||0));
  return events;
}

function unionHasPerson(union, personId) {
  if (!union || !personId) return false;
  if (Array.isArray(union.partners)) return union.partners.includes(personId);
  return union.partner_a_id === personId || union.partner_b_id === personId;
}

function getUnionPartnerId(union, personId) {
  if (!union) return null;
  if (Array.isArray(union.partners)) return union.partners.find(id => id !== personId) || null;
  if (union.partner_a_id === personId) return union.partner_b_id || null;
  if (union.partner_b_id === personId) return union.partner_a_id || null;
  return null;
}

function getUnionStartYear(union) {
  return union ? (union.start_year || union.year || null) : null;
}

function getUnionStartPlace(union) {
  return union ? (union.start_place || union.place || "") : "";
}

function unionTypeLabel(type) {
  const labels = {
    marriage: "Casamento",
    civil_union: "União civil",
    partnership: "União estável",
    engagement: "Noivado",
    other: "União",
  };
  return labels[type] || "Casamento";
}

function personEventTimelineTitle(event, currentPerson, peopleById) {
  const base = eventTypeLabel(event);
  const isRelatedEvent = event && currentPerson && event.personId && event.personId !== currentPerson.id;
  if (!isRelatedEvent) return base;
  const primaryPerson = peopleById && peopleById[event.personId];
  return `${base} - ${personFullName(primaryPerson)}`;
}

function eventTypeLabel(event) {
  if (!event) return "Evento";
  if (event.customLabel) return event.customLabel;
  const labels = {
    baptism: "Batismo",
    christening: "Batismo cristão",
    confirmation: "Crisma",
    first_communion: "Primeira comunhão",
    bar_mitzvah: "Bar Mitzvá",
    bat_mitzvah: "Bat Mitzvá",
    ordination: "Ordenação",
    blessing: "Benção",
    adoption: "Adoção",
    engagement: "Noivado",
    graduation: "Formatura",
    retirement: "Aposentadoria",
    occupation: "Carreira",
    education: "Formação",
    military: "Serviço militar",
    residence: "Mudança",
    immigration: "Imigração",
    emigration: "Emigração",
    naturalization: "Naturalização",
    census: "Censo",
    will: "Testamento",
    probate: "Inventário",
    obituary: "Obituário",
    burial: "Sepultamento",
    cremation: "Cremação",
    religion: "Religião",
    custom: "Evento",
  };
  return labels[event.type] || event.title || "Evento";
}

function personFullName(person) {
  if (!person) return "pessoa desconhecida";
  return person.displayName || [person.first, person.last].filter(Boolean).join(" ").trim() || "pessoa desconhecida";
}

function partnerName(person) {
  if (!person) return "—";
  return person.first || person.displayName || [person.first_name, person.last_name].filter(Boolean).join(" ") || "—";
}

window.Profile = Profile;
