// Main app — routes between dashboard, tree, profile, search, documents, mobile

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "olive_petrol_beige",
  "density": "comfortable",
  "fontPair": "inter_fraunces",
  "showMiniHelena": true
}/*EDITMODE-END*/;

function App() {
  const auth = window.useAuth ? window.useAuth() : { status: "loading" };
  // Hook único no topo — usado pelo breadcrumb p/ resolver UUIDs vindos da API.
  // Em modo FAMILY-only (sem API), retorna status "unavailable" e peopleById vazio.
  const tree = window.useTree ? window.useTree() : { status: "unavailable", peopleById: {} };
  const t = window.useTweaks ? window.useTweaks(TWEAK_DEFAULTS) : { ...TWEAK_DEFAULTS };
  const [route, setRoute] = React.useState("tree"); // landing on tree per priority
  const [personId, setPersonId] = React.useState("p_giuseppe");
  const [treeRootPersonId, setTreeRootPersonId] = React.useState(null);
  const [cmdkOpen, setCmdkOpen] = React.useState(false);
  const [addPersonRequest, setAddPersonRequest] = React.useState(0);

  // apply tweaks via root data attrs
  React.useEffect(() => {
    document.documentElement.dataset.density = t.density || "comfortable";
    document.documentElement.dataset.palette = t.palette || "olive_petrol_beige";
    document.documentElement.dataset.font = t.fontPair || "inter_fraunces";
  }, [t.density, t.palette, t.fontPair]);

  // Cmd+K listener
  React.useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen(o => !o);
      }
      if (e.key === "Escape") setCmdkOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auth gate — antes do shell. AuthScreen e AuthLoading vêm de auth-screen.jsx.
  const AuthLoadingC = window.AuthLoading;
  const AuthScreenC = window.AuthScreen;
  if (auth.status === "loading") {
    return AuthLoadingC ? <AuthLoadingC/> : null;
  }
  if (auth.status === "misconfigured" || auth.status === "unauthenticated" || auth.status === "error") {
    return AuthScreenC ? <AuthScreenC/> : null;
  }

  function navigate(r) {
    if (r === "help") {
      // pretend page
      setRoute("dashboard");
    } else {
      setRoute(r);
    }
  }

  function openPerson(id) {
    setPersonId(id);
    setRoute("profile");
  }

  function openTreeAtPerson(id) {
    if (id) setTreeRootPersonId(id);
    setRoute("tree");
  }

  function openAddPerson() {
    setRoute("tree");
    setAddPersonRequest(n => n + 1);
  }

  // Resolve um person id (UUID da API ou id mock "p_*") consultando primeiro o
  // snapshot do useTree() e caindo no FAMILY mock como fallback.
  function lookupPersonName(id) {
    if (!id) return "Pessoa";
    const fromApi = tree && tree.peopleById ? tree.peopleById[id] : null;
    if (fromApi) {
      return fullPersonName(fromApi, "Pessoa");
    }
    const fromFamily = window.FAMILY && window.FAMILY.people ? window.FAMILY.people[id] : null;
    if (fromFamily) {
      return fullPersonName(fromFamily, "Pessoa");
    }
    return "Pessoa";
  }

  const breadcrumbs = (() => {
    const map = {
      dashboard: ["Stirps", "Início"],
      tree: ["Stirps", "Árvore genealógica"],
      profile: ["Stirps", "Pessoas", lookupPersonName(personId)],
      search: ["Stirps", "Pesquisa histórica"],
      documents: ["Stirps", "Documentos"],
      people: ["Stirps", "Pessoas"],
      timeline: ["Stirps", "Linha do tempo"],
      mobile: ["Stirps", "Mobile companion"],
      settings: ["Stirps", "Configurações"],
    };
    return map[route] || ["Stirps"];
  })();

  return (
    <div className="app">
      <Sidebar current={route === "profile" || route === "people" ? "people" : route} onNavigate={navigate} onAddPerson={openAddPerson}/>
      <main className="main">
        <TopBar
          breadcrumbs={breadcrumbs}
          onSearchOpen={() => setCmdkOpen(true)}
          rightSlot={
            <React.Fragment>
              <button className="btn btn-ghost btn-sm" onClick={() => setRoute("mobile")}>
                <Icon name="globe" size={14}/>Mobile
              </button>
              {auth.profile?.display_name && (
                <span className="topbar-user" title={auth.profile.display_name}>
                  {auth.profile.display_name}
                </span>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => auth.signOut && auth.signOut()}
                title="Encerrar sessão"
              >
                Sair
              </button>
            </React.Fragment>
          }
        />
        {route === "dashboard" && <Dashboard onNavigate={navigate} onPersonClick={openPerson}/>}
        {route === "tree" && <FamilyTree onPersonClick={openPerson} density={t.density} addPersonRequest={addPersonRequest} rootPersonId={treeRootPersonId}/>}
        {route === "profile" && <Profile personId={personId} onBack={() => setRoute("tree")} onPersonClick={openPerson} onViewInTree={openTreeAtPerson}/>}
        {route === "search" && <SearchPage onPersonClick={openPerson}/>}
        {route === "documents" && <DocumentsPage/>}
        {route === "people" && <PeoplePage onPersonClick={openPerson}/>}
        {route === "timeline" && <TimelinePage/>}
        {route === "settings" && window.SettingsPage && <window.SettingsPage onPersonClick={openPerson}/>}
        {route === "mobile" && <MobileShowcase onClose={() => setRoute("dashboard")}/>}
      </main>
      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} onPersonClick={openPerson}/>
      <StirpsTweaks tweaks={t}/>
    </div>
  );
}

function StirpsTweaks({ tweaks }) {
  const setTweak = window.useTweaksSetter || ((k, v) => {});
  if (!window.TweaksPanel) return null;
  const { TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakSelect, TweakToggle } = window;
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="Aparência">
        <TweakRadio
          label="Densidade"
          value={tweaks.density}
          onChange={v => tweaks._set("density", v)}
          options={[["comfortable","Confortável"],["compact","Compacto"]]}
        />
        <TweakSelect
          label="Paleta"
          value={tweaks.palette}
          onChange={v => tweaks._set("palette", v)}
          options={[
            ["olive_petrol_beige","Oliva · Petróleo · Bege"],
            ["terracota","Terracota · Verde · Bege"],
            ["mono","Preto · Oliva · Areia"],
            ["petrol_sand","Petróleo · Areia"],
          ]}
        />
        <TweakRadio
          label="Tipografia"
          value={tweaks.fontPair}
          onChange={v => tweaks._set("fontPair", v)}
          options={[["inter_fraunces","Inter + Fraunces"],["manrope","Manrope"],["geist","Geist + Newsreader"]]}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

// useTweaks helper variant: wrap to expose _set
const _origUseTweaks = window.useTweaks;
window.useTweaks = function(defaults) {
  const [state, setState] = React.useState(defaults);
  const set = React.useCallback((key, value) => {
    setState(s => {
      const next = typeof key === "object" ? { ...s, ...key } : { ...s, [key]: value };
      try {
        window.parent.postMessage({type: "__edit_mode_set_keys", edits: typeof key === "object" ? key : { [key]: value }}, "*");
      } catch {}
      return next;
    });
  }, []);
  return { ...state, _set: set };
};

// Mount
const root = ReactDOM.createRoot(document.getElementById("app-root"));
root.render(<App/>);
