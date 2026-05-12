// Main app — routes between dashboard, tree, profile, search, documents, mobile

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "olive_petrol_beige",
  "density": "comfortable",
  "fontPair": "inter_fraunces",
  "showMiniHelena": true
}/*EDITMODE-END*/;

function App() {
  const t = window.useTweaks ? window.useTweaks(TWEAK_DEFAULTS) : { ...TWEAK_DEFAULTS };
  const [route, setRoute] = React.useState("tree"); // landing on tree per priority
  const [personId, setPersonId] = React.useState("p_giuseppe");
  const [cmdkOpen, setCmdkOpen] = React.useState(false);

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

  function navigate(r) {
    if (r === "settings" || r === "help") {
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

  const breadcrumbs = (() => {
    const map = {
      dashboard: ["Stirps", "Início"],
      tree: ["Stirps", "Árvore genealógica"],
      profile: ["Stirps", "Pessoas", `${window.FAMILY.people[personId]?.first} ${window.FAMILY.people[personId]?.last}`],
      search: ["Stirps", "Pesquisa histórica"],
      documents: ["Stirps", "Documentos"],
      people: ["Stirps", "Pessoas"],
      timeline: ["Stirps", "Linha do tempo"],
      mobile: ["Stirps", "Mobile companion"],
    };
    return map[route] || ["Stirps"];
  })();

  return (
    <div className="app">
      <Sidebar current={route === "profile" || route === "people" ? "people" : route} onNavigate={navigate}/>
      <main className="main">
        <TopBar
          breadcrumbs={breadcrumbs}
          onSearchOpen={() => setCmdkOpen(true)}
          rightSlot={
            <button className="btn btn-ghost btn-sm" onClick={() => setRoute("mobile")}>
              <Icon name="globe" size={14}/>Mobile
            </button>
          }
        />
        {route === "dashboard" && <Dashboard onNavigate={navigate} onPersonClick={openPerson}/>}
        {route === "tree" && <FamilyTree onPersonClick={openPerson} density={t.density}/>}
        {route === "profile" && <Profile personId={personId} onBack={() => setRoute("tree")} onPersonClick={openPerson}/>}
        {route === "search" && <SearchPage onPersonClick={openPerson}/>}
        {route === "documents" && <DocumentsPage/>}
        {route === "people" && <PeoplePage onPersonClick={openPerson}/>}
        {route === "timeline" && <TimelinePage/>}
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
