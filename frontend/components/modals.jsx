// Modal components: EditPersonModal + AddEventModal

function ModalShell({ open, onClose, children, size = "md", title, subtitle, icon }) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={"modal modal-" + size} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          {icon && <div className="modal-icon">{icon}</div>}
          <div className="modal-titles">
            <div className="modal-title">{title}</div>
            {subtitle && <div className="modal-subtitle">{subtitle}</div>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={16}/>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, required, children, span = 1, error }) {
  return (
    <label className={"field field-span-" + span + (error ? " field-error" : "")}>
      <span className="field-label">
        {label}
        {required && <span className="field-required">*</span>}
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      {children}
      {error && <span className="field-error-msg">{error}</span>}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, type = "text" }) {
  return (
    <input
      className="input"
      type={type}
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function normalizePlaceText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function addPlaceSuggestion(map, value) {
  const place = normalizePlaceText(value);
  if (!place) return;
  const key = place.toLocaleLowerCase("pt-BR");
  if (!map[key]) map[key] = place;
}

function collectPlaceSuggestions({ people = [], unions = [], timeline = [], extra = [] } = {}) {
  const map = {};
  people.forEach(p => {
    addPlaceSuggestion(map, p?.birth?.place);
    addPlaceSuggestion(map, p?.death?.place);
  });
  unions.forEach(u => addPlaceSuggestion(map, u?.start_place || u?.place));
  timeline.forEach(item => addPlaceSuggestion(map, item?.place));
  extra.forEach(place => addPlaceSuggestion(map, place));
  return Object.values(map).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

function PlaceInput({ value, onChange, placeholder, suggestions = [] }) {
  const listId = React.useMemo(() => "place-suggestions-" + Math.random().toString(36).slice(2), []);
  const options = React.useMemo(() => {
    const map = {};
    suggestions.forEach(place => addPlaceSuggestion(map, place));
    addPlaceSuggestion(map, value);
    return Object.values(map).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  }, [suggestions, value]);

  return (
    <>
      <input
        className="input"
        type="text"
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map(place => <option key={place} value={place}/>)}
      </datalist>
    </>
  );
}

function TextArea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea
      className="input input-area"
      rows={rows}
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function SelectInput({ value, onChange, options }) {
  return (
    <div className="select-wrap">
      <select className="input" value={value || ""} onChange={e => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <Icon name="chev-down" size={14}/>
    </div>
  );
}

function PartialDate({ value, onChange, placeholderYear = "Ano" }) {
  // value: { day, month, year, precision, approx, unknown }
  const v = value || {};
  const precision = v.precision || (v.day ? "full" : v.month ? "month-year" : v.year ? "year" : "full");
  const set = (patch) => onChange({ ...v, ...patch });
  const setPrecision = (p) => {
    const next = { ...v, precision: p };
    if (p === "year") { next.day = ""; next.month = ""; }
    if (p === "month-year") { next.day = ""; }
    if (p === "unknown") { next.day = ""; next.month = ""; next.year = ""; next.approx = false; }
    onChange(next);
  };
  const months = [["", "Mês"], ...["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map((m,i) => [String(i+1), m])];
  return (
    <div className="partial-date">
      <div className="partial-date-prec">
        <button type="button" className={"prec-chip " + (precision === "full" ? "prec-chip-on" : "")} onClick={() => setPrecision("full")}>Dia/mês/ano</button>
        <button type="button" className={"prec-chip " + (precision === "month-year" ? "prec-chip-on" : "")} onClick={() => setPrecision("month-year")}>Só mês/ano</button>
        <button type="button" className={"prec-chip " + (precision === "year" ? "prec-chip-on" : "")} onClick={() => setPrecision("year")}>Só ano</button>
        <button type="button" className={"prec-chip " + (precision === "unknown" ? "prec-chip-on" : "")} onClick={() => setPrecision("unknown")}>Desconhecida</button>
      </div>
      {precision !== "unknown" && (
        <div className={"partial-date-row " + ("prec-" + precision)}>
          {precision === "full" && (
            <input className="input input-sm" placeholder="Dia" maxLength={2} value={v.day || ""} onChange={e => set({ day: e.target.value })}/>
          )}
          {(precision === "full" || precision === "month-year") && (
            <SelectInput value={v.month || ""} onChange={x => set({ month: x })} options={months}/>
          )}
          <input className="input input-sm" placeholder={placeholderYear} maxLength={4} value={v.year || ""} onChange={e => set({ year: e.target.value })}/>
          <label className="approx-toggle">
            <input type="checkbox" checked={!!v.approx} onChange={e => set({ approx: e.target.checked })}/>
            <span>aproximadamente</span>
          </label>
        </div>
      )}
      {precision === "unknown" && (
        <div className="partial-date-unknown">
          <Icon name="sparkle" size={13}/>
          Será exibido como <em>"data desconhecida"</em> na linha do tempo.
        </div>
      )}
    </div>
  );
}

function SegmentedRadio({ value, onChange, options }) {
  return (
    <div className="segmented">
      {options.map(([v, l, ic]) => (
        <button
          type="button"
          key={v}
          className={"segmented-opt " + (value === v ? "segmented-on" : "")}
          onClick={() => onChange(v)}
        >
          {ic && <span className="segmented-ic">{ic}</span>}
          {l}
        </button>
      ))}
    </div>
  );
}

function TagsInput({ value = [], onChange }) {
  const [draft, setDraft] = React.useState("");
  function commit() {
    const t = draft.trim();
    if (!t) return;
    if (!value.includes(t)) onChange([...value, t]);
    setDraft("");
  }
  return (
    <div className="tags-input">
      {value.map(t => (
        <span key={t} className="tag-chip">
          {t}
          <button type="button" onClick={() => onChange(value.filter(x => x !== t))} aria-label={"Remover " + t}>
            <Icon name="x" size={11}/>
          </button>
        </span>
      ))}
      <input
        className="tags-input-text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
          if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={commit}
        placeholder={value.length === 0 ? "ex: imigrante, fundador, militar…" : ""}
      />
    </div>
  );
}

// ============================================================
// EDIT PERSON MODAL
// ============================================================

function EditPersonModal({ open, person, people = null, unions = null, timeline = null, onClose, onSave, onDelete, onUploadBirthDocument, birthDocuments = [], uploadingBirthDocument = false, saving = false, error = null, readOnly = false, readOnlyReason = "" }) {
  const [form, setForm] = React.useState(null);
  const [tab, setTab] = React.useState("identity");
  const [dirty, setDirty] = React.useState(false);
  const birthDocInputRef = React.useRef(null);

  React.useEffect(() => {
    if (open && person) {
      setForm({
        first: person.first || "",
        middle: person.middle || "",
        last: person.last || "",
        maidenName: person.maidenName || "",
        nickname: person.nickname || "",
        sex: person.sex || "M",
        living: !person.death,
        birthYear: person.birth?.year || "",
        birthMonth: person.birth?.month || "",
        birthDay: person.birth?.day || "",
        birthPlace: person.birth?.place || "",
        birthCountry: person.birth?.country || "",
        birthNote: person.birth?.note || person.externalIds?.birth_note || "",
        birthSource: person.birth?.source || person.externalIds?.birth_source || "",
        deathYear: person.death?.year || "",
        deathPlace: person.death?.place || "",
        cause: person.death?.cause || "",
        occupation: person.occupation || "",
        bio: person.bio || "",
        tags: person.tags || [],
        privacy: person.privacy || "family",
        sources: person.sources || "",
        externalIds: person.externalIds || {},
      });
      setTab("identity");
      setDirty(false);
    }
  }, [open, person?.id]);

  if (!form) return null;
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };
  const sourcePeople = people || (person ? [person] : []);
  const placeSuggestions = collectPlaceSuggestions({
    people: sourcePeople,
    unions: unions || (window.FAMILY && window.FAMILY.unions) || [],
    timeline: timeline || (window.FAMILY && window.FAMILY.timeline) || [],
  });

  async function save() {
    if (readOnly || saving) return;
    try {
      await onSave?.(form);
      onClose();
    } catch (_) {
      // O caller mantém a mensagem em `error`.
    }
  }

  async function deletePerson() {
    if (readOnly || saving || !onDelete) return;
    if (!window.confirm("Excluir esta pessoa da árvore? Esta ação não pode ser desfeita.")) return;
    try {
      await onDelete();
      onClose();
    } catch (_) {
      // O caller mantém a mensagem em `error`.
    }
  }

  function tryClose() {
    if (dirty && !window.confirm("Descartar alterações não salvas?")) return;
    onClose();
  }

  return (
    <ModalShell
      open={open}
      onClose={tryClose}
      size="lg"
      icon={<Avatar person={person} size={44}/>}
      title={`Editar ${person?.first} ${person?.last}`}
      subtitle="Atualize dados, datas e biografia. Alterações ficam registradas no histórico."
    >
      <div className="modal-tabs">
        {[
          ["identity", "Identidade", "user"],
          ["life", "Vida", "calendar"],
          ["bio", "Biografia", "book"],
          ["meta", "Fontes", "book"],
        ].map(([id, label, ic]) => (
          <button
            key={id}
            className={"modal-tab " + (tab === id ? "modal-tab-on" : "")}
            onClick={() => setTab(id)}
          >
            <Icon name={ic} size={13}/>{label}
          </button>
        ))}
      </div>

      <div className="modal-body modal-body-scroll">
        {tab === "identity" && (
          <>
            <div className="photo-edit-row">
              <Avatar person={person} size={84}/>
              <div className="photo-edit-actions">
                {!readOnly && <button className="btn btn-sm btn-ghost"><Icon name="upload" size={13}/>Trocar foto</button>}
                {!readOnly && <button className="btn btn-sm btn-ghost btn-danger-soft"><Icon name="trash" size={13}/>Remover</button>}
                <div className="photo-edit-hint">JPG, PNG ou TIFF. Máx 8 MB. Fotos antigas serão restauradas automaticamente.</div>
              </div>
            </div>

            <div className="form-grid">
              <Field label="Primeiro nome" required span={2}>
                <TextInput value={form.first} onChange={v => set("first", v)} placeholder="Helena"/>
              </Field>
              <Field label="Nomes do meio" span={2} hint="opcional">
                <TextInput value={form.middle} onChange={v => set("middle", v)} placeholder="Maria das Dores"/>
              </Field>
              <Field label="Sobrenome" required span={2}>
                <TextInput value={form.last} onChange={v => set("last", v)} placeholder="Bertolini Albuquerque"/>
              </Field>
              <Field label="Nome de solteira" span={2} hint="se aplicável">
                <TextInput value={form.maidenName} onChange={v => set("maidenName", v)} placeholder="Albuquerque"/>
              </Field>
              <Field label="Como era chamado(a)" span={2} hint="apelido familiar">
                <TextInput value={form.nickname} onChange={v => set("nickname", v)} placeholder="Lena"/>
              </Field>
              <Field label="Sexo registrado" span={2}>
                <SegmentedRadio
                  value={form.sex}
                  onChange={v => set("sex", v)}
                  options={[["M", "Masculino"], ["F", "Feminino"], ["X", "Não informado"]]}
                />
              </Field>
              <Field label="Tags" span={4} hint="enter para adicionar">
                <TagsInput value={form.tags} onChange={v => set("tags", v)}/>
              </Field>
            </div>
          </>
        )}

        {tab === "life" && (
          <div className="form-grid">
            <Field label="Nascimento" span={4} hint="se não souber a data exata, pode marcar aproximada ou desconhecida">
              <PartialDate
                value={{
                  day: form.birthDay, month: form.birthMonth, year: form.birthYear,
                  precision: form.birthPrecision, approx: form.birthApprox,
                }}
                onChange={d => setForm(f => ({ ...f,
                  birthDay: d.day || "", birthMonth: d.month || "", birthYear: d.year || "",
                  birthPrecision: d.precision, birthApprox: d.approx,
                }))}
              />
            </Field>
            <Field label="Cidade de nascimento" span={2}>
              <PlaceInput value={form.birthPlace} onChange={v => set("birthPlace", v)} placeholder="Treviso" suggestions={placeSuggestions}/>
            </Field>
            <Field label="País" span={2}>
              <TextInput value={form.birthCountry} onChange={v => set("birthCountry", v)} placeholder="Itália"/>
            </Field>

            <div className="form-divider" data-label="Detalhes do nascimento"/>

            <Field label="Descrição" span={4} hint="contexto do registro, cartório, batismo ou narrativa familiar">
              <TextArea
                rows={4}
                value={form.birthNote}
                onChange={v => set("birthNote", v)}
                placeholder="Registro encontrado em certidão civil, batismo ou relato familiar..."
              />
            </Field>
            <Field label="Anexar documentos ou fotos" span={4}>
              <input
                ref={birthDocInputRef}
                type="file"
                className="media-hidden-input"
                onChange={e => {
                  const file = e.target.files && e.target.files[0];
                  e.target.value = "";
                  if (file) onUploadBirthDocument?.(file);
                }}
              />
              <div className="dropzone-mini">
                <Icon name="upload" size={18}/>
                <div>
                  <strong>{uploadingBirthDocument ? "Enviando arquivo..." : "Documento de nascimento"}</strong>
                  {!readOnly && (
                    <> ou <button type="button" className="link" onClick={() => birthDocInputRef.current && birthDocInputRef.current.click()} disabled={uploadingBirthDocument}>selecionar do computador</button></>
                  )}
                  <div className="dropzone-mini-hint">Certidões, batismos, fotos e PDFs ficam vinculados ao perfil.</div>
                </div>
              </div>
              {birthDocuments.length > 0 && (
                <div className="birth-doc-list">
                  {birthDocuments.slice(0, 3).map(item => (
                    <div key={item.id} className="birth-doc-item">
                      <Icon name="doc" size={13}/>
                      <span>{item.title || "Documento"}</span>
                    </div>
                  ))}
                </div>
              )}
            </Field>
            <Field label="Fonte" span={4} hint="onde essa informação foi encontrada">
              <TextInput
                value={form.birthSource}
                onChange={v => set("birthSource", v)}
                placeholder="Cartório de Caxias do Sul, livro 7, fls. 11"
              />
            </Field>

            <div className="form-divider" data-label="Falecimento"/>

            <Field label="Status" span={4}>
              <SegmentedRadio
                value={form.living ? "living" : "deceased"}
                onChange={v => set("living", v === "living")}
                options={[["living", "Vivo(a)"], ["deceased", "Falecido(a)"]]}
              />
            </Field>
            {!form.living && (
              <>
                <Field label="Data do falecimento" span={4} hint="precisão flexível">
                  <PartialDate
                    value={{
                      day: form.deathDay, month: form.deathMonth, year: form.deathYear,
                      precision: form.deathPrecision, approx: form.deathApprox,
                    }}
                    onChange={d => setForm(f => ({ ...f,
                      deathDay: d.day || "", deathMonth: d.month || "", deathYear: d.year || "",
                      deathPrecision: d.precision, deathApprox: d.approx,
                    }))}
                  />
                </Field>
                <Field label="Local" span={2}>
                  <PlaceInput value={form.deathPlace} onChange={v => set("deathPlace", v)} placeholder="Caxias do Sul, RS" suggestions={placeSuggestions}/>
                </Field>
                <Field label="Causa" span={2} hint="opcional">
                  <TextInput value={form.cause} onChange={v => set("cause", v)} placeholder=""/>
                </Field>
              </>
            )}
          </div>
        )}

        {tab === "bio" && (
          <div className="form-grid">
            <Field label="Profissão / ofício" span={4}>
              <TextInput value={form.occupation} onChange={v => set("occupation", v)} placeholder="Vinicultor"/>
            </Field>
            <Field label="Biografia" span={4} hint="conte a história em primeira ou terceira pessoa">
              <TextArea
                rows={9}
                value={form.bio}
                onChange={v => set("bio", v)}
                placeholder="Helena nasceu em uma manhã fria de junho, na casa amarela da Rua das Flores…"
              />
              <div className="char-count">{(form.bio || "").length} caracteres</div>
            </Field>
            <div className="ai-suggest">
              <Icon name="sparkle" size={14}/>
              <div>
                <strong>Sugestão da Stirps.</strong> Detectamos 3 documentos sem narrativa associada.
                <a href="#"> Gerar parágrafo de rascunho →</a>
              </div>
            </div>
          </div>
        )}

        {tab === "meta" && (
          <div className="form-grid">
            <Field label="Fontes e referências" span={4} hint="cartórios, livros, entrevistas">
              <TextArea
                rows={6}
                value={form.sources}
                onChange={v => set("sources", v)}
                placeholder={"• Certidão de nascimento, Cartório de Caxias, livro 14, fls. 22\n• Entrevista com Maria Bertolini, jul/2024"}
              />
            </Field>
            <div className="meta-row">
              <div className="meta-pill"><Icon name="clock" size={12}/>Última edição há 3 dias por você</div>
              <div className="meta-pill"><Icon name="link" size={12}/>ID: {person?.id}</div>
            </div>
            {!readOnly && <button className="btn btn-ghost btn-danger-soft" style={{marginTop: 6}} onClick={deletePerson} disabled={saving}>
              <Icon name="trash" size={13}/>Excluir esta pessoa do acervo
            </button>}
          </div>
        )}
      </div>

      <div className="modal-foot">
        <div className="modal-foot-hint">
          {error
            ? <span className="auth-error" role="alert">{error}</span>
            : readOnly
            ? <>{readOnlyReason || "Somente leitura"}</>
            : dirty
            ? <><span className="dirty-dot"/>Alterações não salvas</>
            : <>Tudo sincronizado</>}
        </div>
        <div className="modal-foot-actions">
          <button className="btn btn-ghost" onClick={tryClose}>{readOnly ? "Fechar" : "Cancelar"}</button>
          {!readOnly && (
            <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
              <Icon name="check" size={14}/>{saving ? "Salvando..." : "Salvar alterações"}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================
// ADD EVENT MODAL
// ============================================================

const EVENT_TYPES = [
  { id: "birth", label: "Nascimento", icon: "sparkle", tone: "olive" },
  { id: "marriage", label: "Casamento", icon: "heart", tone: "petrol" },
  { id: "move", label: "Mudança", icon: "pin", tone: "beige" },
  { id: "education", label: "Formação", icon: "book", tone: "olive" },
  { id: "career", label: "Carreira", icon: "briefcase", tone: "petrol" },
  { id: "child", label: "Filho(a)", icon: "user", tone: "olive" },
  { id: "honor", label: "Conquista", icon: "star", tone: "beige" },
  { id: "death", label: "Falecimento", icon: "moon", tone: "neutral" },
  { id: "custom", label: "Outro", icon: "plus", tone: "neutral" },
];

function eventTypeToFormType(event) {
  if (!event) return "marriage";
  const map = {
    residence: "move",
    occupation: "career",
    education: "education",
  };
  const type = map[event.type] || event.type || "custom";
  return EVENT_TYPES.some(e => e.id === type) ? type : "custom";
}

function AddEventModal({ open, person, people = null, unions = null, timeline = null, event = null, onClose, onSave, saving = false, error = null, readOnly = false, readOnlyReason = "" }) {
  const [step, setStep] = React.useState(1);
  const [form, setForm] = React.useState({
    type: "marriage",
    title: "",
    year: "",
    month: "",
    day: "",
    approx: false,
    precision: "full",
    place: "",
    country: "",
    description: "",
    relatedPeople: [],
    marriageWith: "",
    otherParent: "",
    sources: "",
    attachments: [],
  });

  React.useEffect(() => {
    if (open) {
      const editingType = eventTypeToFormType(event);
      setStep(event && event.id ? 2 : 1);
      setForm({
        type: editingType,
        title: event ? (event.title || event.customLabel || "") : "",
        year: event && event.year != null ? String(event.year) : "",
        month: event && event.month != null ? String(event.month) : "",
        day: event && event.day != null ? String(event.day) : "",
        approx: false,
        precision: event && event.day ? "full" : event && event.month ? "month-year" : event && event.year ? "year" : "full",
        place: event ? (event.place || "") : "",
        country: "",
        description: event ? (event.note || event.description || "") : "",
        relatedPeople: Array.isArray(event && event.relatedPersonIds) ? event.relatedPersonIds : [],
        marriageWith: "",
        otherParent: "",
        sources: event ? (event.source || "") : "",
        attachments: [],
      });
    }
  }, [open, person?.id, event && event.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const canAdvance = step === 1 ? !!form.type : true;

  async function save() {
    if (readOnly || saving) return;
    try {
      await onSave?.(form);
      onClose();
    } catch (_) {
      // O caller mantém a mensagem em `error`.
    }
  }

  function toggleRelated(id) {
    set("relatedPeople", form.relatedPeople.includes(id)
      ? form.relatedPeople.filter(x => x !== id)
      : [...form.relatedPeople, id]
    );
  }

  const F = window.FAMILY;
  const sourcePeople = people || Object.values(F.people);
  const peopleById = {};
  sourcePeople.forEach(p => { peopleById[p.id] = p; });
  const candidates = person ? sourcePeople.filter(x => x.id !== person.id) : [];
  const placeSuggestions = collectPlaceSuggestions({
    people: sourcePeople,
    unions: unions || F.unions || [],
    timeline: timeline || F.timeline || [],
    extra: [event && event.place],
  });
  const eventDef = EVENT_TYPES.find(e => e.id === form.type);
  const editing = !!(event && event.id);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      size="md"
      icon={<div className="event-modal-ic"><Icon name={eventDef?.icon || "plus"} size={20}/></div>}
      title={editing ? "Editar evento da linha do tempo" : "Adicionar evento à linha do tempo"}
      subtitle={person ? `Para ${person.first} ${person.last}` : "Selecione uma pessoa primeiro"}
    >
      <div className="stepper">
        {["Tipo", "Quando & onde", "Detalhes"].map((label, i) => {
          if (editing && i === 0) return null;
          const displayStep = editing ? i : i + 1;
          return (
          <div key={label} className={"stepper-step " + (step > i+1 ? "stepper-done " : "") + (step === i+1 ? "stepper-active" : "")}>
            <span className="stepper-bullet">{step > i+1 ? <Icon name="check" size={11}/> : displayStep}</span>
            <span className="stepper-label">{label}</span>
            {i < 2 && <span className="stepper-line"/>}
          </div>
          );
        })}
      </div>

      <div className="modal-body modal-body-scroll">
        {step === 1 && (
          <>
            <div className="form-eyebrow">Que tipo de momento foi?</div>
            <div className="event-type-grid">
              {EVENT_TYPES.map(e => (
                <button
                  key={e.id}
                  className={"event-type-card " + (form.type === e.id ? "event-type-on" : "")}
                  onClick={() => set("type", e.id)}
                  data-tone={e.tone}
                >
                  <span className="event-type-ic"><Icon name={e.icon} size={16}/></span>
                  <span className="event-type-label">{e.label}</span>
                </button>
              ))}
            </div>
            <div className="form-grid" style={{marginTop: 18}}>
              <Field label="Título do evento" span={4} hint="aparece na linha do tempo">
                <TextInput
                  value={form.title}
                  onChange={v => set("title", v)}
                  placeholder={
                    form.type === "marriage" ? "Casamento com Carmela Pereira" :
                    form.type === "move" ? "Imigração para Caxias do Sul" :
                    form.type === "education" ? "Formação em Engenharia, UFRGS" :
                    "Descreva em uma frase"
                  }
                />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="form-grid">
            <Field label="Data do evento" span={4} hint="precisão flexível">
              <PartialDate
                value={{
                  day: form.day, month: form.month, year: form.year,
                  precision: form.precision, approx: form.approx,
                }}
                onChange={d => setForm(f => ({ ...f,
                  day: d.day || "", month: d.month || "", year: d.year || "",
                  precision: d.precision, approx: d.approx,
                }))}
              />
            </Field>
            <Field label="Cidade / local" span={2}>
              <PlaceInput value={form.place} onChange={v => set("place", v)} placeholder="Caxias do Sul" suggestions={placeSuggestions}/>
            </Field>
            <Field label="País" span={2}>
              <TextInput value={form.country} onChange={v => set("country", v)} placeholder="Brasil"/>
            </Field>

            {form.type === "marriage" && (
              <Field label="Casamento entre" span={4} required hint="selecione o(a) cônjuge — o outro lado da união">
                <div className="pair-picker">
                  <div className="pair-side">
                    <Avatar person={person} size={48}/>
                    <div className="pair-name">{person?.first} {person?.last}</div>
                    <div className="pair-meta">{person?.birth?.year}{person?.death ? `–${person.death.year}` : ""}</div>
                  </div>
                  <div className="pair-link">
                    <svg width="32" height="14" viewBox="0 0 32 14" fill="none">
                      <line x1="0" y1="7" x2="11" y2="7" stroke="#a08658" strokeWidth="1.6"/>
                      <line x1="21" y1="7" x2="32" y2="7" stroke="#a08658" strokeWidth="1.6"/>
                      <circle cx="13.5" cy="7" r="3.6" stroke="#a08658" strokeWidth="1.4" fill="none"/>
                      <circle cx="18.5" cy="7" r="3.6" stroke="#a08658" strokeWidth="1.4" fill="none"/>
                    </svg>
                  </div>
                  <div className="pair-side pair-side-pick">
                    {form.marriageWith ? (
                      <>
                        <Avatar person={peopleById[form.marriageWith]} size={48}/>
                        <div className="pair-name">{peopleById[form.marriageWith].first} {peopleById[form.marriageWith].last}</div>
                        <div className="pair-meta">{peopleById[form.marriageWith].birth?.year}{peopleById[form.marriageWith].death ? `–${peopleById[form.marriageWith].death.year}` : ""}</div>
                        <button type="button" className="pair-clear" onClick={() => set("marriageWith", "")}>Trocar</button>
                      </>
                    ) : (
                      <>
                        <div className="pair-placeholder">
                          <Icon name="user" size={22}/>
                        </div>
                        <div className="pair-name pair-name-empty">Selecione o cônjuge</div>
                        <div className="pair-meta">já na árvore ou criar novo</div>
                      </>
                    )}
                  </div>
                </div>
                <div className="people-picker" style={{maxHeight: 180, overflowY: "auto", marginTop: 12}}>
                  {candidates.map(c => (
                    <button
                      type="button"
                      key={c.id}
                      className={"person-chip " + (form.marriageWith === c.id ? "person-chip-on" : "")}
                      onClick={() => set("marriageWith", form.marriageWith === c.id ? "" : c.id)}
                    >
                      <Avatar person={c} size={22}/>
                      <span>{c.first} {c.last}</span>
                      {form.marriageWith === c.id && <Icon name="check" size={12}/>}
                    </button>
                  ))}
                  <button type="button" className="person-chip person-chip-new">
                    <span className="person-chip-plus"><Icon name="plus" size={12}/></span>
                    <span>Criar nova pessoa</span>
                  </button>
                </div>
              </Field>
            )}

            {form.type === "child" && (
              <Field label="Outro pai/mãe" span={4} hint="quem é o(a) outro(a) progenitor(a)?">
                <div className="people-picker">
                  {candidates.map(c => (
                    <button
                      type="button"
                      key={c.id}
                      className={"person-chip " + (form.otherParent === c.id ? "person-chip-on" : "")}
                      onClick={() => set("otherParent", form.otherParent === c.id ? "" : c.id)}
                    >
                      <Avatar person={c} size={22}/>
                      <span>{c.first} {c.last}</span>
                      {form.otherParent === c.id && <Icon name="check" size={12}/>}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            {form.type !== "marriage" && form.type !== "child" && candidates.length > 0 && (
              <Field label="Outras pessoas envolvidas" span={4} hint="opcional · podem ser várias">
                <div className="people-picker">
                  {candidates.map(c => (
                    <button
                      type="button"
                      key={c.id}
                      className={"person-chip " + (form.relatedPeople.includes(c.id) ? "person-chip-on" : "")}
                      onClick={() => toggleRelated(c.id)}
                    >
                      <Avatar person={c} size={22}/>
                      <span>{c.first} {c.last}</span>
                      {form.relatedPeople.includes(c.id) && <Icon name="check" size={12}/>}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="form-grid">
            <Field label="Descrição" span={4} hint="conte como foi, quem estava lá, o que se lembra">
              <TextArea
                rows={6}
                value={form.description}
                onChange={v => set("description", v)}
                placeholder="A cerimônia foi celebrada na pequena capela de São Pelegrino, com toda a colônia presente…"
              />
            </Field>
            <Field label="Anexar documentos ou fotos" span={4}>
              <div className="dropzone-mini">
                <Icon name="upload" size={18}/>
                <div>
                  <strong>Arraste arquivos aqui</strong> ou <a href="#">selecione do computador</a>
                  <div className="dropzone-mini-hint">Certidões, fotos, cartas — JPG, PNG, PDF até 25 MB</div>
                </div>
              </div>
            </Field>
            <Field label="Fonte" span={4} hint="onde essa informação foi encontrada">
              <TextInput value={form.sources} onChange={v => set("sources", v)} placeholder="Cartório de Caxias do Sul, livro 7, fls. 11"/>
            </Field>
          </div>
        )}
      </div>

      <div className="modal-foot">
        <div className="modal-foot-hint">
          {error
            ? <span className="auth-error" role="alert">{error}</span>
            : readOnly
            ? <>{readOnlyReason || "Somente leitura"}</>
            : <>Passo {editing ? step - 1 : step} de {editing ? 2 : 3}</>}
        </div>
        <div className="modal-foot-actions">
          {readOnly && <button className="btn btn-ghost" onClick={onClose}>Fechar</button>}
          {!readOnly && step > (editing ? 2 : 1) && <button className="btn btn-ghost" onClick={() => setStep(step - 1)} disabled={saving}><Icon name="arrow-left" size={13}/>Voltar</button>}
          {!readOnly && step < 3 && (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)} disabled={!canAdvance}>
              Continuar<Icon name="arrow-right" size={13}/>
            </button>
          )}
          {!readOnly && step === 3 && (
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              <Icon name="check" size={14}/>{saving ? "Salvando..." : editing ? "Salvar evento" : "Adicionar evento"}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function EditUnionModal({ open, person, partner, union, people = null, unions = null, timeline = null, onClose, onSave, onDelete, saving = false, error = null, readOnly = false, readOnlyReason = "" }) {
  const [form, setForm] = React.useState({
    unionId: "",
    year: "",
    month: "",
    day: "",
    precision: "year",
    approx: false,
    place: "",
    description: "",
    status: "ongoing",
  });

  React.useEffect(() => {
    if (!open || !union) return;
    const year = union.start_year != null ? String(union.start_year) : (union.year != null ? String(union.year) : "");
    const month = union.start_month != null ? String(union.start_month) : "";
    const day = union.start_day != null ? String(union.start_day) : "";
    setForm({
      unionId: union.id || "",
      year: year,
      month: month,
      day: day,
      precision: day ? "full" : month ? "month-year" : year ? "year" : "unknown",
      approx: false,
      place: union.start_place || union.place || "",
      description: union.notes || "",
      status: union.status || "ongoing",
    });
  }, [open, union && union.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const F = window.FAMILY || {};
  const placeSuggestions = collectPlaceSuggestions({
    people: people || [person, partner].filter(Boolean),
    unions: unions || F.unions || [],
    timeline: timeline || F.timeline || [],
    extra: [union && (union.start_place || union.place)],
  });

  async function save() {
    if (readOnly || saving || !union) return;
    try {
      await onSave?.(form);
      onClose();
    } catch (_) {
      // O caller mantem a mensagem em `error`.
    }
  }

  async function deleteUnion() {
    if (readOnly || saving || !union || !onDelete) return;
    try {
      await onDelete(union);
    } catch (_) {
      // O caller mantem a mensagem em `error`.
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      size="md"
      icon={<div className="event-modal-ic"><Icon name="heart" size={20}/></div>}
      title="Editar casamento"
      subtitle={person && partner ? `${person.first} ${person.last} e ${partner.first} ${partner.last}` : "Atualize os dados da uniao"}
    >
      <div className="modal-body modal-body-scroll">
        <div className="form-grid">
          <Field label="Casamento entre" span={4} hint="os conjuges desta uniao">
            <div className="pair-picker">
              <div className="pair-side">
                <Avatar person={person} size={48}/>
                <div className="pair-name">{person?.first} {person?.last}</div>
                <div className="pair-meta">{person?.birth?.year}{person?.death ? `-${person.death.year}` : ""}</div>
              </div>
              <div className="pair-link">
                <svg width="32" height="14" viewBox="0 0 32 14" fill="none">
                  <line x1="0" y1="7" x2="11" y2="7" stroke="#a08658" strokeWidth="1.6"/>
                  <line x1="21" y1="7" x2="32" y2="7" stroke="#a08658" strokeWidth="1.6"/>
                  <circle cx="13.5" cy="7" r="3.6" stroke="#a08658" strokeWidth="1.4" fill="none"/>
                  <circle cx="18.5" cy="7" r="3.6" stroke="#a08658" strokeWidth="1.4" fill="none"/>
                </svg>
              </div>
              <div className="pair-side pair-side-pick">
                <Avatar person={partner} size={48}/>
                <div className="pair-name">{partner?.first} {partner?.last}</div>
                <div className="pair-meta">{partner?.birth?.year}{partner?.death ? `-${partner.death.year}` : ""}</div>
              </div>
            </div>
          </Field>

          <Field label="Data do casamento" span={4} hint="precisao flexivel">
            <PartialDate
              value={{
                day: form.day,
                month: form.month,
                year: form.year,
                precision: form.precision,
                approx: form.approx,
              }}
              onChange={d => setForm(f => ({
                ...f,
                day: d.day || "",
                month: d.month || "",
                year: d.year || "",
                precision: d.precision,
                approx: d.approx,
              }))}
            />
          </Field>

          <Field label="Cidade / local" span={2}>
            <PlaceInput value={form.place} onChange={v => set("place", v)} placeholder="Caxias do Sul" suggestions={placeSuggestions}/>
          </Field>

          <Field label="Status" span={2}>
            <SegmentedRadio
              value={form.status}
              onChange={v => set("status", v)}
              options={[
                ["ongoing", "Ativa", <Icon name="heart" size={13}/>],
                ["ended", "Encerrada", <Icon name="x" size={13}/>],
              ]}
            />
          </Field>

          <Field label="Observacoes" span={4} hint="detalhes, fonte ou contexto">
            <TextArea
              rows={5}
              value={form.description}
              onChange={v => set("description", v)}
              placeholder="Cartorio, igreja, testemunhas, fonte do registro..."
            />
          </Field>
        </div>
      </div>

      <div className="modal-foot">
        <div className="modal-foot-hint">
          {error
            ? <span className="auth-error" role="alert">{error}</span>
            : readOnly
            ? <>{readOnlyReason || "Somente leitura"}</>
            : <>Revise os dados do casamento</>}
        </div>
        <div className="modal-foot-actions">
          {!readOnly && (
            <button className="btn btn-ghost btn-danger-soft" onClick={deleteUnion} disabled={saving || !union}>
              <Icon name="trash" size={14}/>{saving ? "Removendo..." : "Excluir união"}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          {!readOnly && (
            <button className="btn btn-primary" onClick={save} disabled={saving || !union}>
              <Icon name="check" size={14}/>{saving ? "Salvando..." : "Salvar casamento"}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

window.EditPersonModal = EditPersonModal;
window.AddEventModal = AddEventModal;
window.EditUnionModal = EditUnionModal;


// ============================================================
// ADD PERSON MODAL
// ============================================================

function AddPersonModal({ open, people = null, unions = null, timeline = null, onClose, onSave, saving = false, error = null, readOnly = false, readOnlyReason = "" }) {
  const F = window.FAMILY;
  const [form, setForm] = React.useState(null);
  const [tab, setTab] = React.useState("basic");

  React.useEffect(() => {
    if (open) {
      setForm({
        first: "", middle: "", last: "", nickname: "",
        sex: "M", living: true,
        birthYear: "", birthMonth: "", birthDay: "", birthPlace: "", birthCountry: "",
        deathYear: "", deathPlace: "",
        relType: "child", relTo: "",
        spouseId: "", parentIds: [], childIds: [], spouseIds: [], siblingIds: [],
        occupation: "", bio: "", tags: [],
      });
      setTab("basic");
    }
  }, [open]);

  if (!form) return null;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleId = (key, id) => setForm(f => {
    const current = Array.isArray(f[key]) ? f[key] : [];
    return {
      ...f,
      [key]: current.includes(id) ? current.filter(x => x !== id) : current.concat([id]),
    };
  });

  async function save() {
    if (readOnly || saving) return;
    try {
      await onSave?.(form);
      onClose();
    } catch (_) {
      // O caller mantém a mensagem em `error`.
    }
  }

  const sourcePeople = people || Object.values(F.people);
  const peopleById = {};
  sourcePeople.forEach(p => { peopleById[p.id] = p; });
  const peopleArr = sourcePeople.slice().sort((a,b) =>
    (b.birth?.year || 0) - (a.birth?.year || 0)
  );
  const placeSuggestions = collectPlaceSuggestions({
    people: sourcePeople,
    unions: unions || F.unions || [],
    timeline: timeline || F.timeline || [],
  });
  const isFirstPerson = sourcePeople.length === 0;
  const missingRequired = [];
  if (!String(form.first || "").trim()) missingRequired.push("primeiro nome");
  if (!String(form.last || "").trim()) missingRequired.push("sobrenome");
  const relationshipCount = (form.parentIds || []).length +
    (form.childIds || []).length +
    (form.spouseIds || []).length +
    (form.siblingIds || []).length +
    (form.relTo ? 1 : 0);
  if (!isFirstPerson && relationshipCount === 0) missingRequired.push("ao menos um vínculo familiar");
  const canSave = missingRequired.length === 0;
  const requiredHint = missingRequired.length > 0
    ? "Preencha " + missingRequired.join(", ")
    : "";
  const modalSubtitle = isFirstPerson
    ? "Cadastre a primeira pessoa para iniciar esta árvore."
    : "Vincule essa pessoa a algum parente já existente para posicioná-la na árvore.";

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      size="lg"
      icon={<div className="event-modal-ic"><Icon name="user" size={20}/></div>}
      title="Adicionar pessoa à árvore"
      subtitle={modalSubtitle}
    >
      <div className="modal-tabs">
        {[
          ["basic", "Identidade", "user"],
          ["relation", "Vínculo familiar", "tree"],
          ["life", "Vida", "calendar"],
          ["extra", "Detalhes", "book"],
        ].map(([id, label, ic]) => (
          <button
            key={id}
            className={"modal-tab " + (tab === id ? "modal-tab-on" : "")}
            onClick={() => setTab(id)}
          >
            <Icon name={ic} size={13}/>{label}
          </button>
        ))}
      </div>

      <div className="modal-body modal-body-scroll">
        {tab === "basic" && (
          <div className="form-grid">
            <Field label="Primeiro nome" required span={2}>
              <TextInput value={form.first} onChange={v => set("first", v)} placeholder="Maria"/>
            </Field>
            <Field label="Nomes do meio" span={2}>
              <TextInput value={form.middle} onChange={v => set("middle", v)} placeholder=""/>
            </Field>
            <Field label="Sobrenome" required span={2}>
              <TextInput value={form.last} onChange={v => set("last", v)} placeholder="Bertolini"/>
            </Field>
            <Field label="Como era chamado(a)" span={2} hint="apelido familiar">
              <TextInput value={form.nickname} onChange={v => set("nickname", v)} placeholder=""/>
            </Field>
            <Field label="Sexo registrado" span={4}>
              <SegmentedRadio
                value={form.sex}
                onChange={v => set("sex", v)}
                options={[["M", "Masculino"], ["F", "Feminino"], ["X", "Não informado"]]}
              />
            </Field>
          </div>
        )}

        {tab === "relation" && isFirstPerson && (
          <div className="api-empty">
            Esta árvore ainda não tem pessoas. A primeira pessoa não precisa de vínculo familiar.
          </div>
        )}

        {tab === "relation" && !isFirstPerson && (
          <>
            <div className="form-eyebrow">Como essa pessoa se relaciona com a sua árvore?</div>
            <div className="form-grid">
              <Field label="Pais / mães" span={4} required={relationshipCount === 0} hint="selecione uma ou mais pessoas">
                <div className="people-picker" style={{maxHeight: 240, overflowY: "auto"}}>
                  {peopleArr.map(p => (
                    <button
                      type="button"
                      key={p.id}
                      className={"person-chip " + ((form.parentIds || []).includes(p.id) ? "person-chip-on" : "")}
                      onClick={() => toggleId("parentIds", p.id)}
                    >
                      <Avatar person={p} size={22}/>
                      <span>{p.first} {p.last}</span>
                      <span style={{color: "var(--muted-2)", fontSize: 11}}>
                        {p.birth?.year}{p.death ? "–" + p.death.year : ""}
                      </span>
                      {(form.parentIds || []).includes(p.id) && <Icon name="check" size={12}/>}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Filhos(as)" span={4} hint="opcional">
                <div className="people-picker" style={{maxHeight: 180, overflowY: "auto"}}>
                  {peopleArr.map(p => (
                    <button type="button" key={p.id} className={"person-chip " + ((form.childIds || []).includes(p.id) ? "person-chip-on" : "")} onClick={() => toggleId("childIds", p.id)}>
                      <Avatar person={p} size={22}/><span>{p.first} {p.last}</span>
                      {(form.childIds || []).includes(p.id) && <Icon name="check" size={12}/>}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Cônjuges" span={4} hint="opcional">
                <div className="people-picker" style={{maxHeight: 180, overflowY: "auto"}}>
                  {peopleArr.map(p => (
                    <button type="button" key={p.id} className={"person-chip " + ((form.spouseIds || []).includes(p.id) ? "person-chip-on" : "")} onClick={() => toggleId("spouseIds", p.id)}>
                      <Avatar person={p} size={22}/><span>{p.first} {p.last}</span>
                      {(form.spouseIds || []).includes(p.id) && <Icon name="check" size={12}/>}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Irmãos(ãs)" span={4} hint="opcional - copia os pais conhecidos">
                <div className="people-picker" style={{maxHeight: 180, overflowY: "auto"}}>
                  {peopleArr.map(p => (
                    <button type="button" key={p.id} className={"person-chip " + ((form.siblingIds || []).includes(p.id) ? "person-chip-on" : "")} onClick={() => toggleId("siblingIds", p.id)}>
                      <Avatar person={p} size={22}/><span>{p.first} {p.last}</span>
                      {(form.siblingIds || []).includes(p.id) && <Icon name="check" size={12}/>}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            {relationshipCount > 0 && (
              <div className="ai-suggest" style={{marginTop: 16}}>
                <Icon name="sparkle" size={14}/>
                <div>
                  <strong>Pré-visualização:</strong> {form.first || "Nova pessoa"} {form.last} será criada com {relationshipCount} vínculo(s) familiar(es).
                </div>
              </div>
            )}
          </>
        )}

        {tab === "life" && (
          <div className="form-grid">
            <Field label="Nascimento" span={4} hint="se não souber a data exata, marque aproximada ou desconhecida">
              <PartialDate
                value={{
                  day: form.birthDay, month: form.birthMonth, year: form.birthYear,
                  precision: form.birthPrecision, approx: form.birthApprox,
                }}
                onChange={d => setForm(f => ({ ...f,
                  birthDay: d.day || "", birthMonth: d.month || "", birthYear: d.year || "",
                  birthPrecision: d.precision, birthApprox: d.approx,
                }))}
              />
            </Field>
            <Field label="Cidade" span={2}>
              <PlaceInput value={form.birthPlace} onChange={v => set("birthPlace", v)} placeholder="Caxias do Sul" suggestions={placeSuggestions}/>
            </Field>
            <Field label="País" span={2}>
              <TextInput value={form.birthCountry} onChange={v => set("birthCountry", v)} placeholder="Brasil"/>
            </Field>
            <div className="form-divider" data-label="Status"/>
            <Field label="Vivo(a) ou falecido(a)?" span={4}>
              <SegmentedRadio
                value={form.living ? "living" : "deceased"}
                onChange={v => set("living", v === "living")}
                options={[["living", "Vivo(a)"], ["deceased", "Falecido(a)"]]}
              />
            </Field>
            {!form.living && (
              <>
                <Field label="Data do falecimento" span={4}>
                  <PartialDate
                    value={{
                      day: form.deathDay, month: form.deathMonth, year: form.deathYear,
                      precision: form.deathPrecision, approx: form.deathApprox,
                    }}
                    onChange={d => setForm(f => ({ ...f,
                      deathDay: d.day || "", deathMonth: d.month || "", deathYear: d.year || "",
                      deathPrecision: d.precision, deathApprox: d.approx,
                    }))}
                  />
                </Field>
                <Field label="Local" span={4}>
                  <PlaceInput value={form.deathPlace} onChange={v => set("deathPlace", v)} placeholder="" suggestions={placeSuggestions}/>
                </Field>
              </>
            )}
          </div>
        )}

        {tab === "extra" && (
          <div className="form-grid">
            <Field label="Profissão / ofício" span={4}>
              <TextInput value={form.occupation} onChange={v => set("occupation", v)} placeholder="Agricultor"/>
            </Field>
            <Field label="Tags" span={4} hint="enter para adicionar">
              <TagsInput value={form.tags} onChange={v => set("tags", v)}/>
            </Field>
            <Field label="Notas iniciais" span={4} hint="poderá ser expandido depois">
              <TextArea
                rows={5}
                value={form.bio}
                onChange={v => set("bio", v)}
                placeholder="Algo que você queira registrar agora — uma história, uma fonte, um detalhe."
              />
            </Field>
          </div>
        )}
      </div>

      <div className="modal-foot">
        <div className="modal-foot-hint">
          {error
            ? <span className="auth-error" role="alert">{error}</span>
            : readOnly
            ? <>{readOnlyReason || "Somente leitura"}</>
            : !canSave
            ? <><span className="dirty-dot"/>{requiredHint}</>
            : <><Icon name="check" size={12}/>Pronto para adicionar</>}
        </div>
        <div className="modal-foot-actions">
          <button className="btn btn-ghost" onClick={onClose}>{readOnly ? "Fechar" : "Cancelar"}</button>
          {!readOnly && (
            <button className="btn btn-primary" onClick={save} disabled={!canSave || saving}>
              <Icon name="plus" size={14}/>{saving ? "Salvando..." : "Adicionar à árvore"}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function LinkPersonRelationModal({ open, person, people = null, onClose, onSave, saving = false, error = null, readOnly = false, readOnlyReason = "" }) {
  const F = window.FAMILY;
  const [form, setForm] = React.useState({ relationType: "parent", targetIds: [] });

  React.useEffect(() => {
    if (open) setForm({ relationType: "parent", targetIds: [] });
  }, [open]);

  if (!open || !person) return null;

  const sourcePeople = (people || Object.values(F.people)).filter(p => p && p.id !== person.id);
  const peopleArr = sourcePeople.slice().sort((a,b) =>
    (a.first || "").localeCompare(b.first || "")
  );
  const selectedIds = form.targetIds || [];
  const canSave = selectedIds.length > 0;
  const relationLabels = {
    parent: "pais / mães",
    child: "filhos(as)",
    spouse: "cônjuges",
    sibling: "irmãos(ãs)",
  };

  function toggle(id) {
    setForm(f => {
      const ids = f.targetIds || [];
      return {
        ...f,
        targetIds: ids.includes(id) ? ids.filter(x => x !== id) : ids.concat([id]),
      };
    });
  }

  async function save() {
    if (readOnly || saving || !canSave) return;
    try {
      await onSave?.(form);
      onClose();
    } catch (_) {
      // O caller mantém a mensagem em `error`.
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      size="md"
      icon={<div className="event-modal-ic"><Icon name="tree" size={20}/></div>}
      title="Vincular pessoa existente"
      subtitle={`Adicione vínculos familiares para ${person.first} ${person.last || ""}`.trim()}
    >
      <div className="modal-body modal-body-scroll">
        <div className="form-grid">
          <Field label="Tipo de vínculo" span={4} required>
            <SegmentedRadio
              value={form.relationType}
              onChange={v => setForm(f => ({ ...f, relationType: v, targetIds: [] }))}
              options={[
                ["parent", "Pai/Mãe"],
                ["child", "Filho(a)"],
                ["spouse", "Cônjuge"],
                ["sibling", "Irmão/Irmã"],
              ]}
            />
          </Field>
          <Field label="Pessoas" span={4} required error={!canSave ? "Selecione ao menos uma pessoa." : null}>
            <div className="people-picker" style={{maxHeight: 280, overflowY: "auto"}}>
              {peopleArr.map(p => (
                <button
                  type="button"
                  key={p.id}
                  className={"person-chip " + (selectedIds.includes(p.id) ? "person-chip-on" : "")}
                  onClick={() => toggle(p.id)}
                >
                  <Avatar person={p} size={22}/>
                  <span>{p.first} {p.last}</span>
                  <span style={{color: "var(--muted-2)", fontSize: 11}}>
                    {p.birth?.year}{p.death ? "–" + p.death.year : ""}
                  </span>
                  {selectedIds.includes(p.id) && <Icon name="check" size={12}/>}
                </button>
              ))}
            </div>
          </Field>
        </div>
        {canSave && (
          <div className="ai-suggest" style={{marginTop: 16}}>
            <Icon name="sparkle" size={14}/>
            <div>
              <strong>Pré-visualização:</strong> {selectedIds.length} pessoa(s) serão vinculadas como {relationLabels[form.relationType]}.
            </div>
          </div>
        )}
      </div>
      <div className="modal-foot">
        <div className="modal-foot-hint">
          {error
            ? <span className="auth-error" role="alert">{error}</span>
            : readOnly
            ? <>{readOnlyReason || "Somente leitura"}</>
            : !canSave
            ? <><span className="dirty-dot"/>Selecione ao menos uma pessoa</>
            : <><Icon name="check" size={12}/>Pronto para vincular</>}
        </div>
        <div className="modal-foot-actions">
          <button className="btn btn-ghost" onClick={onClose}>{readOnly ? "Fechar" : "Cancelar"}</button>
          {!readOnly && (
            <button className="btn btn-primary" onClick={save} disabled={!canSave || saving}>
              <Icon name="plus" size={14}/>{saving ? "Salvando..." : "Vincular"}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

window.LinkPersonRelationModal = LinkPersonRelationModal;
window.AddPersonModal = AddPersonModal;
