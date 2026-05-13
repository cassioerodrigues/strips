// Settings page

const SETTINGS_NAV = [
  { id: "account", label: "Conta", icon: "user" },
  { id: "family", label: "Família & colaboradores", icon: "people" },
  { id: "privacy", label: "Privacidade", icon: "heart" },
  { id: "notifications", label: "Notificações", icon: "clock" },
  { id: "search", label: "Pesquisa & arquivos", icon: "search" },
  { id: "appearance", label: "Aparência & idioma", icon: "sparkle" },
  { id: "data", label: "Dados & exportação", icon: "doc" },
  { id: "plan", label: "Plano & cobrança", icon: "star" },
];

function SettingsPage({ onPersonClick }) {
  const [section, setSection] = React.useState("account");
  return (
    <div className="page page-settings">
      <div className="settings-head">
        <div className="eyebrow">Configurações</div>
        <h1>Ajuste a Stirps ao jeito da sua família.</h1>
      </div>
      <div className="settings-grid">
        <aside className="settings-nav">
          {SETTINGS_NAV.map(item => (
            <button
              key={item.id}
              className={"settings-nav-item " + (section === item.id ? "settings-nav-item-on" : "")}
              onClick={() => setSection(item.id)}
            >
              <Icon name={item.icon} size={15}/>
              <span>{item.label}</span>
              {section === item.id && <Icon name="chev-right" size={14}/>}
            </button>
          ))}
        </aside>
        <div className="settings-content">
          {section === "account" && <AccountSection/>}
          {section === "family" && <FamilySection/>}
          {section === "privacy" && <PrivacySection/>}
          {section === "notifications" && <NotificationsSection/>}
          {section === "search" && <SearchArchivesSection/>}
          {section === "appearance" && <AppearanceSection/>}
          {section === "data" && <DataSection/>}
          {section === "plan" && <PlanSection/>}
        </div>
      </div>
    </div>
  );
}

function SettingsCard({ title, desc, children, action }) {
  return (
    <div className="settings-card">
      <div className="settings-card-head">
        <div>
          <h3 className="settings-card-title">{title}</h3>
          {desc && <p className="settings-card-desc">{desc}</p>}
        </div>
        {action}
      </div>
      {children && <div className="settings-card-body">{children}</div>}
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button type="button" className={"toggle " + (checked ? "toggle-on" : "")} onClick={() => onChange(!checked)} aria-pressed={checked}>
      <span className="toggle-knob"/>
    </button>
  );
}

function Row({ label, desc, control }) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <div className="settings-row-label">{label}</div>
        {desc && <div className="settings-row-desc">{desc}</div>}
      </div>
      <div className="settings-row-control">{control}</div>
    </div>
  );
}

// ====================== ACCOUNT ======================
function AccountSection() {
  const F = window.FAMILY;
  const me = F.people.p_helena;
  return (
    <>
      <SettingsCard title="Sua conta" desc="Isso aparece como autor das contribuições e é vinculado ao seu perfil Helena na árvore.">
        <div className="account-head">
          <div className="account-avatar-wrap">
            <Avatar person={me} size={92}/>
            <button className="account-avatar-edit"><Icon name="edit" size={13}/></button>
          </div>
          <div style={{flex: 1}}>
            <div className="form-grid">
              <Field label="Nome de exibição" span={2}>
                <TextInput value="Helena Bertolini Albuquerque" onChange={() => {}}/>
              </Field>
              <Field label="E-mail" span={2}>
                <TextInput value="helena.bertolini@stirps.com" onChange={() => {}} type="email"/>
              </Field>
              <Field label="Telefone" span={2} hint="usado só para login em 2 etapas">
                <TextInput value="+55 11 98... 4291" onChange={() => {}}/>
              </Field>
              <Field label="Senha" span={2}>
                <div className="password-row">
                  <TextInput value="••••••••••" onChange={() => {}}/>
                  <button className="btn btn-ghost btn-sm">Alterar</button>
                </div>
              </Field>
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Vínculo com a árvore" desc="Cada conta Stirps está vinculada a uma pessoa da árvore.">
        <Row
          label="Você é Helena Bertolini Albuquerque"
          desc="Quando você edita a árvore, suas contribuições aparecem como 'Helena adicionou…'"
          control={<button className="btn btn-ghost btn-sm">Trocar vínculo</button>}
        />
      </SettingsCard>

      <SettingsCard title="Verificação em duas etapas" desc="Aumente a segurança da sua árvore familiar com um código por SMS ou app autenticador.">
        <Row
          label="Autenticação por aplicativo"
          desc="Recomendado · Use Google Authenticator, 1Password ou similar."
          control={<Toggle checked={true} onChange={() => {}}/>}
        />
        <Row
          label="Código por SMS"
          desc="Enviado para +55 11 98... 4291"
          control={<Toggle checked={false} onChange={() => {}}/>}
        />
      </SettingsCard>
    </>
  );
}

// ====================== FAMILY ======================
function FamilySection() {
  const F = window.FAMILY;
  const collabs = [
    { person: F.people.p_ricardo, role: "Editor", joined: "há 4 meses", contribs: 38 },
    { person: F.people.p_clarice, role: "Editor", joined: "há 4 meses", contribs: 22 },
    { person: F.people.p_lucia, role: "Visualizador", joined: "há 2 meses", contribs: 0 },
    { person: F.people.p_rafael, role: "Editor", joined: "há 1 mês", contribs: 7 },
  ];
  return (
    <>
      <SettingsCard
        title="Colaboradores"
        desc="Pessoas que podem acessar e editar a árvore Bertolini-Albuquerque junto com você."
        action={<button className="btn btn-primary btn-sm"><Icon name="plus" size={13}/>Convidar familiar</button>}
      >
        <div className="collab-list">
          {collabs.map((c, i) => (
            <div key={i} className="collab-row">
              <Avatar person={c.person} size={40}/>
              <div className="collab-text">
                <div className="collab-name">{c.person.first} {c.person.last}</div>
                <div className="collab-meta">Entrou {c.joined} · {c.contribs} contribuições</div>
              </div>
              <SelectInput
                value={c.role.toLowerCase()}
                onChange={() => {}}
                options={[["editor", "Editor"], ["viewer", "Visualizador"], ["admin", "Administrador"]]}
              />
              <button className="iconbtn-sm" title="Mais"><Icon name="more" size={14}/></button>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Permissões padrão" desc="Define o nível de acesso para novas pessoas convidadas.">
        <Row
          label="Editores podem adicionar pessoas"
          desc="Se desativado, só administradores podem expandir a árvore."
          control={<Toggle checked={true} onChange={() => {}}/>}
        />
        <Row
          label="Editores podem excluir pessoas"
          desc="Recomendamos manter desativado para evitar perdas acidentais."
          control={<Toggle checked={false} onChange={() => {}}/>}
        />
        <Row
          label="Visualizadores podem baixar documentos"
          desc="Permite que parentes salvem cópias das fotos e certidões."
          control={<Toggle checked={true} onChange={() => {}}/>}
        />
      </SettingsCard>

      <SettingsCard title="Convites pendentes" desc="Pessoas que receberam convite mas ainda não aceitaram.">
        <div className="pending-row">
          <div className="pending-info">
            <strong>tio.marcos@gmail.com</strong>
            <span>Convidado há 3 dias · papel: Editor</span>
          </div>
          <button className="btn btn-ghost btn-sm">Reenviar</button>
          <button className="iconbtn-sm btn-danger-soft" title="Cancelar"><Icon name="x" size={14}/></button>
        </div>
        <div className="pending-row">
          <div className="pending-info">
            <strong>prima.julia@hotmail.com</strong>
            <span>Convidado há 1 semana · papel: Visualizador</span>
          </div>
          <button className="btn btn-ghost btn-sm">Reenviar</button>
          <button className="iconbtn-sm btn-danger-soft" title="Cancelar"><Icon name="x" size={14}/></button>
        </div>
      </SettingsCard>
    </>
  );
}

// ====================== PRIVACY ======================
function PrivacySection() {
  return (
    <>
      <SettingsCard title="Quem pode ver sua árvore" desc="Controle quem encontra a Bertolini-Albuquerque na Stirps.">
        <div className="visibility-options">
          {[
            { v: "private", l: "Privado", d: "Só você e quem você convidar." },
            { v: "family", l: "Família", d: "Pessoas que aceitaram seus convites. Recomendado.", selected: true },
            { v: "public", l: "Público", d: "Qualquer pessoa na Stirps pode encontrar e ver pessoas falecidas." },
          ].map(o => (
            <button key={o.v} className={"vis-option " + (o.selected ? "vis-option-on" : "")}>
              <div className="vis-radio">{o.selected && <span/>}</div>
              <div>
                <div className="vis-label">{o.l}</div>
                <div className="vis-desc">{o.d}</div>
              </div>
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Pessoas vivas" desc="Informações de parentes vivos são sempre mais sensíveis.">
        <Row
          label="Esconder datas de nascimento de pessoas vivas"
          desc="Mostra apenas o ano. Recomendado para árvores compartilhadas."
          control={<Toggle checked={true} onChange={() => {}}/>}
        />
        <Row
          label="Esconder localizações exatas"
          desc="Mostra cidade mas oculta endereços específicos."
          control={<Toggle checked={true} onChange={() => {}}/>}
        />
        <Row
          label="Esconder pessoas vivas de visitantes públicos"
          desc="Só aparecem para colaboradores convidados."
          control={<Toggle checked={true} onChange={() => {}}/>}
        />
      </SettingsCard>

      <SettingsCard title="DNA & origem" desc="Como dados estimados de origem são exibidos.">
        <Row
          label="Mostrar percentuais de origem nos perfis"
          desc="Aparece no painel lateral de cada pessoa."
          control={<Toggle checked={true} onChange={() => {}}/>}
        />
        <Row
          label="Comparar com outras árvores na Stirps"
          desc="Encontra primos distantes que compartilham origens."
          control={<Toggle checked={false} onChange={() => {}}/>}
        />
      </SettingsCard>
    </>
  );
}

// ====================== NOTIFICATIONS ======================
function NotificationsSection() {
  return (
    <>
      <SettingsCard title="E-mail" desc="Resumos enviados para helena.bertolini@stirps.com.">
        <Row label="Resumo semanal" desc="O que aconteceu na família esta semana." control={<Toggle checked={true} onChange={() => {}}/>}/>
        <Row label="Novos registros encontrados" desc="Quando achamos certidões, fotos ou conexões." control={<Toggle checked={true} onChange={() => {}}/>}/>
        <Row label="Contribuições de outros colaboradores" desc="Quando alguém da família edita ou adiciona algo." control={<Toggle checked={true} onChange={() => {}}/>}/>
        <Row label="Dicas para expandir a árvore" desc="Sugestões mensais sobre lacunas que você poderia preencher." control={<Toggle checked={false} onChange={() => {}}/>}/>
      </SettingsCard>

      <SettingsCard title="Push & app" desc="Notificações no celular e no navegador.">
        <Row label="Novas mensagens de família" control={<Toggle checked={true} onChange={() => {}}/>}/>
        <Row label="Conexões sugeridas com alta confiança (>85%)" control={<Toggle checked={true} onChange={() => {}}/>}/>
        <Row label="Aniversários e datas marcantes" desc="Centenários, datas redondas de casamento, falecimento." control={<Toggle checked={true} onChange={() => {}}/>}/>
      </SettingsCard>
    </>
  );
}

// ====================== SEARCH ARCHIVES ======================
function SearchArchivesSection() {
  const archives = [
    { name: "Arquivo Hospedaria de Imigrantes", country: "Brasil", count: "12.4M", on: true, free: true },
    { name: "Archivio di Stato di Treviso", country: "Itália", count: "880K", on: true, free: false },
    { name: "Cartórios brasileiros", country: "Brasil", count: "47M", on: true, free: true },
    { name: "Hemeroteca Digital", country: "Brasil", count: "210M páginas", on: true, free: true },
    { name: "FamilySearch", country: "Mundial", count: "Bilhões", on: true, free: true },
    { name: "Arquivo Nacional Torre do Tombo", country: "Portugal", count: "8M", on: false, free: false },
    { name: "Ellis Island Foundation", country: "EUA", count: "65M", on: false, free: false },
    { name: "Ancestry.com", country: "Mundial", count: "30 bi", on: false, free: false },
  ];
  return (
    <>
      <SettingsCard title="Acervos consultados" desc="Selecione quais bases a Stirps deve pesquisar quando você procurar registros.">
        <div className="archive-toggle-list">
          {archives.map((a, i) => (
            <div key={i} className="archive-toggle-row">
              <div>
                <div className="archive-toggle-name">{a.name} {!a.free && <Pill tone="beige">Premium</Pill>}</div>
                <div className="archive-toggle-meta">{a.country} · {a.count} registros</div>
              </div>
              <Toggle checked={a.on} onChange={() => {}}/>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Idiomas dos documentos" desc="Quais idiomas a Stirps deve reconhecer ao ler manuscritos e fotos.">
        <div className="lang-chips">
          {["Português", "Italiano", "Espanhol", "Latim", "Alemão", "Francês", "Inglês"].map((l, i) => (
            <button key={i} className={"prec-chip " + (i < 4 ? "prec-chip-on" : "")}>
              {l}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Confiança mínima para sugerir" desc="Conexões abaixo desse nível ficam ocultas. Mais alto = menos sugestões, mais precisão.">
        <div className="threshold-row">
          <span className="threshold-val">75%</span>
          <input type="range" min="50" max="99" defaultValue="75" className="threshold-slider"/>
          <span className="threshold-hint">recomendado: 70-80%</span>
        </div>
      </SettingsCard>
    </>
  );
}

// ====================== APPEARANCE ======================
function AppearanceSection() {
  const [lang, setLang] = React.useState("pt-BR");
  const [theme, setTheme] = React.useState("light");
  const [layout, setLayout] = React.useState("comfortable");
  return (
    <>
      <SettingsCard title="Idioma e região">
        <Row
          label="Idioma da interface"
          control={
            <SelectInput value={lang} onChange={setLang} options={[
              ["pt-BR", "Português (Brasil)"],
              ["pt-PT", "Português (Portugal)"],
              ["en-US", "English (US)"],
              ["it", "Italiano"],
              ["es", "Español"],
            ]}/>
          }
        />
        <Row
          label="Formato de data"
          desc="Como datas aparecem na árvore e nos documentos."
          control={
            <SelectInput value="dd/mm/yyyy" onChange={() => {}} options={[
              ["dd/mm/yyyy", "DD/MM/AAAA"],
              ["mm/dd/yyyy", "MM/DD/AAAA"],
              ["yyyy-mm-dd", "AAAA-MM-DD"],
            ]}/>
          }
        />
        <Row
          label="Fuso horário"
          control={
            <SelectInput value="brt" onChange={() => {}} options={[
              ["brt", "America/São_Paulo · UTC-3"],
              ["wet", "Europe/Lisbon · UTC+0"],
              ["cet", "Europe/Rome · UTC+1"],
            ]}/>
          }
        />
      </SettingsCard>

      <SettingsCard title="Tema e densidade">
        <Row
          label="Tema"
          desc="Stirps respeita seu sistema operacional por padrão."
          control={
            <div className="theme-options">
              {[["light", "Claro"], ["dark", "Escuro"], ["auto", "Automático"]].map(([v, l]) => (
                <button key={v} className={"theme-opt " + (theme === v ? "theme-opt-on" : "")} onClick={() => setTheme(v)}>
                  <div className={"theme-prev theme-prev-" + v}/>
                  <span>{l}</span>
                </button>
              ))}
            </div>
          }
        />
        <Row
          label="Densidade"
          desc="Quanto espaço entre os elementos."
          control={
            <SegmentedRadio
              value={layout}
              onChange={setLayout}
              options={[["comfortable", "Confortável"], ["compact", "Compacto"]]}
            />
          }
        />
      </SettingsCard>

      <SettingsCard title="Acessibilidade">
        <Row label="Tamanho de texto maior" desc="Aumenta o corpo em 15%." control={<Toggle checked={false} onChange={() => {}}/>}/>
        <Row label="Reduzir animações" desc="Útil para sensibilidade a movimento." control={<Toggle checked={false} onChange={() => {}}/>}/>
        <Row label="Maior contraste" control={<Toggle checked={false} onChange={() => {}}/>}/>
      </SettingsCard>
    </>
  );
}

// ====================== DATA ======================
function DataSection() {
  return (
    <>
      <SettingsCard title="Exportar sua árvore" desc="Baixe seus dados em formatos abertos. Você é dono(a) do seu acervo.">
        <div className="export-grid">
          <button className="export-card">
            <div className="export-ic"><Icon name="doc" size={20}/></div>
            <div className="export-text">
              <div className="export-title">GEDCOM 5.5.1</div>
              <div className="export-desc">Padrão universal de genealogia · compatível com qualquer software</div>
            </div>
            <Icon name="upload" size={14}/>
          </button>
          <button className="export-card">
            <div className="export-ic"><Icon name="doc" size={20}/></div>
            <div className="export-text">
              <div className="export-title">PDF · Livro da família</div>
              <div className="export-desc">Layout impresso, gerações intercaladas com biografias</div>
            </div>
            <Icon name="upload" size={14}/>
          </button>
          <button className="export-card">
            <div className="export-ic"><Icon name="map" size={20}/></div>
            <div className="export-text">
              <div className="export-title">Cartaz da árvore</div>
              <div className="export-desc">PDF ou PNG em alta resolução para impressão A2/A1</div>
            </div>
            <Icon name="upload" size={14}/>
          </button>
          <button className="export-card">
            <div className="export-ic"><Icon name="upload" size={20}/></div>
            <div className="export-text">
              <div className="export-title">Backup completo</div>
              <div className="export-desc">ZIP com fotos originais, documentos e estrutura JSON</div>
            </div>
            <Icon name="upload" size={14}/>
          </button>
        </div>
      </SettingsCard>

      <SettingsCard title="Armazenamento" desc="Plano Família · 50 GB inclusos.">
        <div className="storage-bar">
          <div className="storage-fill" style={{width: "16%"}}/>
        </div>
        <div className="storage-legend">
          <span><strong>8.2 GB</strong> de 50 GB · 16% usado</span>
          <button className="link">Detalhes do uso →</button>
        </div>
      </SettingsCard>

      <SettingsCard title="Zona de perigo" desc="Ações irreversíveis. Pense duas vezes antes de seguir.">
        <Row
          label="Arquivar árvore"
          desc="Coloca a árvore em modo somente-leitura. Você pode reativar a qualquer momento."
          control={<button className="btn btn-ghost btn-sm">Arquivar</button>}
        />
        <Row
          label="Excluir todos os dados de DNA"
          desc="Remove estimativas de origem de todos os perfis."
          control={<button className="btn btn-ghost btn-sm btn-danger-soft">Excluir</button>}
        />
        <Row
          label="Excluir a conta"
          desc="Apaga sua conta e remove você como colaborador. A árvore permanece com os outros administradores."
          control={<button className="btn btn-ghost btn-sm btn-danger-soft">Excluir conta</button>}
        />
      </SettingsCard>
    </>
  );
}

// ====================== PLAN ======================
function PlanSection() {
  return (
    <>
      <div className="plan-hero">
        <div>
          <Pill tone="olive">Plano atual</Pill>
          <h2 className="plan-name">Família</h2>
          <div className="plan-price"><span className="plan-amt">R$ 39</span><span className="plan-per">/mês</span></div>
          <div className="plan-renew">Renova em 14 de junho de 2026</div>
        </div>
        <div className="plan-feats">
          <div className="plan-feat"><Icon name="check" size={14}/>Até 8 colaboradores</div>
          <div className="plan-feat"><Icon name="check" size={14}/>50 GB de armazenamento</div>
          <div className="plan-feat"><Icon name="check" size={14}/>Pesquisa em todos os acervos premium</div>
          <div className="plan-feat"><Icon name="check" size={14}/>Restauração de fotos antigas (até 200/mês)</div>
          <div className="plan-feat"><Icon name="check" size={14}/>Suporte por e-mail em 24h</div>
        </div>
      </div>

      <SettingsCard title="Comparar planos" desc="Veja o que muda em cada nível.">
        <div className="plan-compare">
          {[
            { name: "Pessoal", price: "Grátis", desc: "Até 100 pessoas · 1 GB", btn: "Fazer downgrade", muted: true },
            { name: "Família", price: "R$ 39/mês", desc: "Até 8 colaboradores · 50 GB", btn: "Plano atual", current: true },
            { name: "Patrimônio", price: "R$ 119/mês", desc: "Colaboradores ilimitados · 500 GB · API", btn: "Fazer upgrade", highlight: true },
          ].map((p, i) => (
            <div key={i} className={"plan-col " + (p.current ? "plan-col-current " : "") + (p.highlight ? "plan-col-highlight" : "")}>
              <div className="plan-col-name">{p.name}</div>
              <div className="plan-col-price">{p.price}</div>
              <div className="plan-col-desc">{p.desc}</div>
              <button className={"btn btn-sm " + (p.highlight ? "btn-primary" : "btn-ghost")} disabled={p.current}>
                {p.btn}
              </button>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Forma de pagamento">
        <Row
          label="Visa terminado em 4291"
          desc="Próxima cobrança · 14 de junho de 2026 · R$ 39,00"
          control={<button className="btn btn-ghost btn-sm">Trocar cartão</button>}
        />
      </SettingsCard>

      <SettingsCard title="Histórico de cobrança">
        <div className="invoice-list">
          {["Maio 2026", "Abril 2026", "Março 2026", "Fevereiro 2026"].map((m, i) => (
            <div key={i} className="invoice-row">
              <div>
                <div className="invoice-month">{m}</div>
                <div className="invoice-meta">Plano Família · R$ 39,00 · Visa 4291</div>
              </div>
              <Pill tone="olive">Pago</Pill>
              <button className="btn btn-ghost btn-sm">Recibo</button>
            </div>
          ))}
        </div>
      </SettingsCard>
    </>
  );
}

window.SettingsPage = SettingsPage;
