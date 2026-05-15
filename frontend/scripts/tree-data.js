// tree-data.js — store + hooks que carregam a árvore ativa via API real.
//
// Carrega APÓS:
//   - scripts/config.js       (window.STIRPS_CONFIG)
//   - scripts/auth.js         (window.useAuth / window.__stirpsAuth)
//   - scripts/api.js          (window.api.fetch)
//   - scripts/adapters.js     (window.adapters)
//
// Expõe:
//   - window.useTree()                 hook React (snapshot da árvore ativa)
//   - window.useTree.refetch()         força nova carga
//   - window.usePerson(personId)       hook React (snapshot de uma pessoa + relações)
//
// Status possíveis em window.useTree():
//   - "idle"         pré-bootstrap (auth ainda carregando)
//   - "loading"      requisições em andamento
//   - "ready"        dados carregados (people/stats/timeline/activity/suggestions)
//   - "empty"        usuário autenticado mas sem trees (auth.trees vazio)
//   - "unavailable"  apiBaseUrl vazio OU sem supabaseClient OU misconfigured
//   - "error"        falha em uma ou mais chamadas (dados parciais podem
//                    estar disponíveis em snapshot.people/etc.)
(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Store
  // ---------------------------------------------------------------------
  const state = {
    status: "idle",
    treeId: null,
    tree: null,
    role: null,
    canEdit: false,
    myPersonId: null,
    people: [],
    peopleById: {},
    unions: [],
    relationsByChild: {},
    stats: null,
    timeline: [],
    activity: [],
    suggestions: [],
    error: null,
  };

  const listeners = new Set();
  // Snapshot é imutável e tem identidade estável entre updates — requisito
  // do useSyncExternalStore. Veja o mesmo pattern em scripts/auth.js.
  let snapshot = Object.assign({}, state);

  function setState(patch) {
    Object.assign(state, patch);
    snapshot = Object.assign({}, state);
    listeners.forEach(function (fn) {
      try {
        fn(snapshot);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[stirps] tree-data listener error", e);
      }
    });
  }

  function getSnapshot() {
    return snapshot;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function hasApi() {
    const cfg = window.STIRPS_CONFIG || {};
    const base = (cfg.apiBaseUrl || "").trim();
    if (!base) return false;
    if (!window.supabaseClient) return false;
    if (!window.api || typeof window.api.fetch !== "function") return false;
    return true;
  }

  function isMockId(id) {
    return typeof id === "string" && id.indexOf("p_") === 0;
  }

  // ---------------------------------------------------------------------
  // Loader
  // ---------------------------------------------------------------------
  // Deduplica por (treeId, accessToken). Sem isso, cada onAuthStateChange
  // (SIGNED_IN + INITIAL_SESSION + TOKEN_REFRESHED) dispararia uma nova
  // bateria de requests do dashboard/árvore.
  let loadKey = null;
  let loadInFlight = false;

  function authSnapshot() {
    if (window.__stirpsAuth && typeof window.__stirpsAuth.getState === "function") {
      return window.__stirpsAuth.getState();
    }
    return null;
  }

  function activeTreeId(auth) {
    if (!auth || !Array.isArray(auth.trees) || auth.trees.length === 0) return null;
    const first = auth.trees[0];
    if (!first) return null;
    if (first.tree && first.tree.id) return first.tree.id;
    if (first.id) return first.id; // defesa: se vier achatado
    return null;
  }

  function activeMembership(auth) {
    if (!auth || !Array.isArray(auth.trees) || auth.trees.length === 0) return null;
    return auth.trees[0] || null;
  }

  function myPersonIdFromAuth(auth) {
    var membership = activeMembership(auth);
    return membership && membership.person_id ? membership.person_id : null;
  }

  function roleFromAuth(auth) {
    const membership = activeMembership(auth);
    return membership && membership.role ? membership.role : null;
  }

  function canEditRole(role) {
    return role === "owner" || role === "editor";
  }

  function tokenKey(auth) {
    return auth && auth.session && auth.session.access_token
      ? auth.session.access_token
      : null;
  }

  async function loadTree(treeId, force) {
    const auth = authSnapshot();
    const key = treeId + "::" + (tokenKey(auth) || "");
    if (!force && loadKey === key) return; // mesma combo: skip
    if (loadInFlight && loadKey === key) return;

    loadKey = key;
    loadInFlight = true;
    const role = roleFromAuth(auth);
    const myPid = myPersonIdFromAuth(auth);
    setState({ status: "loading", treeId: treeId, role: role, canEdit: canEditRole(role), myPersonId: myPid, error: null });

    const adapt = window.adapters || {};
    const api = window.api;

    // Roda em paralelo — falha de um endpoint não derruba os outros.
    const [peopleRes, unionsRes, statsRes, timelineRes, activityRes, suggestionsRes] = await Promise.allSettled([
      api.fetch("/trees/" + treeId + "/people"),
      api.fetch("/trees/" + treeId + "/unions"),
      api.fetch("/trees/" + treeId + "/stats"),
      api.fetch("/trees/" + treeId + "/timeline"),
      api.fetch("/trees/" + treeId + "/dashboard-activity?limit=6"),
      api.fetch("/trees/" + treeId + "/external-records?status=suggested&limit=3"),
    ]);

    const errors = [];

    let people = [];
    let peopleById = {};
    if (peopleRes.status === "fulfilled") {
      const list = Array.isArray(peopleRes.value) ? peopleRes.value : [];
      people = list.map(adapt.adaptPerson).filter(Boolean);
      people.forEach(function (p) {
        peopleById[p.id] = p;
      });
    } else {
      errors.push("pessoas: " + (peopleRes.reason && peopleRes.reason.message));
    }

    const relationsByChild = {};
    if (people.length > 0) {
      const relationResults = await Promise.allSettled(
        people.map(function (person) {
          return api.fetch("/people/" + person.id + "/relations");
        }),
      );
      relationResults.forEach(function (res, index) {
        if (res.status !== "fulfilled") {
          errors.push("relações: " + (res.reason && res.reason.message));
          return;
        }
        const parents = res.value && Array.isArray(res.value.parents) ? res.value.parents : [];
        relationsByChild[people[index].id] = parents.map(function (parent) {
          return parent.id;
        }).filter(Boolean);
      });
    }

    let unions = [];
    if (unionsRes.status === "fulfilled") {
      unions = Array.isArray(unionsRes.value) ? unionsRes.value : [];
    } else {
      errors.push("uniões: " + (unionsRes.reason && unionsRes.reason.message));
    }

    let stats = null;
    if (statsRes.status === "fulfilled") {
      stats = adapt.adaptStats ? adapt.adaptStats(statsRes.value) : statsRes.value;
    } else {
      errors.push("stats: " + (statsRes.reason && statsRes.reason.message));
    }

    let timeline = [];
    if (timelineRes.status === "fulfilled") {
      const list = Array.isArray(timelineRes.value) ? timelineRes.value : [];
      timeline = list.map(adapt.adaptTimelineItem).filter(Boolean);
    } else {
      errors.push("timeline: " + (timelineRes.reason && timelineRes.reason.message));
    }

    let activity = [];
    if (activityRes.status === "fulfilled") {
      const list = Array.isArray(activityRes.value) ? activityRes.value : [];
      activity = list.map(adapt.adaptDashboardActivity || function (x) { return x; }).filter(Boolean);
    } else {
      errors.push("atividade: " + (activityRes.reason && activityRes.reason.message));
    }

    let suggestions = [];
    if (suggestionsRes.status === "fulfilled") {
      const list = Array.isArray(suggestionsRes.value) ? suggestionsRes.value : [];
      suggestions = list.map(adapt.adaptExternalRecordSuggestion || function (x) { return x; }).filter(Boolean);
    } else {
      errors.push("sugestões: " + (suggestionsRes.reason && suggestionsRes.reason.message));
    }

    loadInFlight = false;
    if (errors.length > 0) {
      setState({
        status: "error",
        people: people,
        peopleById: peopleById,
        unions: unions,
        relationsByChild: relationsByChild,
        stats: stats,
        timeline: timeline,
        activity: activity,
        suggestions: suggestions,
        error: errors.join(" · "),
      });
    } else {
      setState({
        status: "ready",
        people: people,
        peopleById: peopleById,
        unions: unions,
        relationsByChild: relationsByChild,
        stats: stats,
        timeline: timeline,
        activity: activity,
        suggestions: suggestions,
        error: null,
      });
    }
  }

  function refetch() {
    // invalida o dedup e re-tenta com o tree atual (ou o derivado de auth).
    loadKey = null;
    const auth = authSnapshot();
    const tid = state.treeId || activeTreeId(auth);
    if (!tid) return;
    return loadTree(tid, true);
  }

  // ---------------------------------------------------------------------
  // Auto-loader: assina o store de auth (não usa React effect — este
  // módulo é plain JS, sem componentes).
  // ---------------------------------------------------------------------
  function reactToAuth(auth) {
    if (!hasApi()) {
      // Sem config / SDK / api → componentes caem no FAMILY mock.
      setState({
        status: "unavailable",
        treeId: null,
        tree: null,
        role: null,
        canEdit: false,
        myPersonId: null,
        people: [],
        peopleById: {},
        unions: [],
        relationsByChild: {},
        stats: null,
        timeline: [],
        activity: [],
        suggestions: [],
        error: null,
      });
      loadKey = null;
      return;
    }
    if (!auth) return;
    if (auth.status === "loading") {
      // mantém idle até auth resolver
      if (state.status !== "loading") setState({ status: "idle", error: null });
      return;
    }
    if (auth.status !== "authenticated") {
      // unauthenticated / misconfigured / error → trata como indisponível.
      setState({
        status: "unavailable",
        treeId: null,
        tree: null,
        role: null,
        canEdit: false,
        myPersonId: null,
        people: [],
        peopleById: {},
        unions: [],
        relationsByChild: {},
        stats: null,
        timeline: [],
        activity: [],
        suggestions: [],
        error: null,
      });
      loadKey = null;
      return;
    }
    const tid = activeTreeId(auth);
    if (!tid) {
      setState({
        status: "empty",
        treeId: null,
        tree: null,
        role: roleFromAuth(auth),
        canEdit: canEditRole(roleFromAuth(auth)),
        myPersonId: myPersonIdFromAuth(auth),
        people: [],
        peopleById: {},
        unions: [],
        relationsByChild: {},
        stats: null,
        timeline: [],
        activity: [],
        suggestions: [],
        error: null,
      });
      loadKey = null;
      return;
    }
    // Tem tree e token — dispara load (dedup interno cuida das repetições).
    loadTree(tid, false);
  }

  // Subscribe via polling do __stirpsAuth.getState? Não — auth.js já mantém
  // listeners; só preciso me inscrever. Mas auth.js não expõe subscribe()
  // diretamente. Faço um wrapper que confia em useSyncExternalStore + polling
  // de fallback: como auth.js NÃO expõe subscribe, observo via window event
  // não disponível. Solução: poll curto até que useAuth esteja disponível,
  // e disparamos uma checagem inicial; updates subsequentes vêm de hook
  // usado pelos componentes (que naturalmente re-renderizam). Para garantir
  // que o load dispara mesmo se nenhum componente chamou useTree() ainda,
  // observamos via setInterval curto durante o bootstrap.
  //
  // Solução prática e robusta: ao montar, fazemos polling rápido (a cada
  // 200ms, por no máximo ~30s) do snapshot de auth até atingir um estado
  // estável (authenticated/empty/unavailable), e a partir daí ficamos
  // re-checando a cada 2s. Isso é trivial e idempotente — reactToAuth() é
  // no-op quando o estado não mudou.
  let lastAuthSig = null;
  function pollAuthOnce() {
    const auth = authSnapshot();
    const sig = auth
      ? auth.status + "::" + ((auth.trees && auth.trees[0] && auth.trees[0].tree && auth.trees[0].tree.id) || "") + "::" + (tokenKey(auth) || "")
      : "null";
    if (sig !== lastAuthSig) {
      lastAuthSig = sig;
      reactToAuth(auth);
    }
  }

  // Primeira execução: assim que tree-data.js carrega, dispara um check.
  // Em seguida, observa a cada 1s — barato e suficiente para refletir
  // login/logout/troca de tree sem nenhuma integração mais funda com auth.js.
  setTimeout(pollAuthOnce, 0);
  setInterval(pollAuthOnce, 1000);

  // ---------------------------------------------------------------------
  // useTree hook
  // ---------------------------------------------------------------------
  function useTree() {
    const React = window.React;
    if (!React || typeof React.useSyncExternalStore !== "function") {
      throw new Error("[stirps] useTree requer React 18+ (useSyncExternalStore)");
    }
    return React.useSyncExternalStore(subscribe, getSnapshot);
  }

  useTree.refetch = refetch;
  useTree.actions = { refetch: refetch };

  // ---------------------------------------------------------------------
  // usePerson hook (cache por id)
  // ---------------------------------------------------------------------
  // Mantém um cache simples por sessão. Não tenta invalidar — pequenas
  // árvores e perfis raramente mudam em tempo real; refetch manual via
  // useTree.refetch() ainda re-popula o snapshot principal.
  const personCache = new Map(); // id → { status, person, relations, events, error }
  const personListeners = new Map(); // id → Set<listener>

  function getPersonSnap(id) {
    return personCache.get(id) || { status: "idle", person: null, relations: null, events: [], error: null };
  }

  function setPersonSnap(id, patch) {
    const prev = getPersonSnap(id);
    const next = Object.assign({}, prev, patch);
    personCache.set(id, next);
    const ls = personListeners.get(id);
    if (ls) {
      ls.forEach(function (fn) {
        try {
          fn(next);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("[stirps] usePerson listener error", e);
        }
      });
    }
  }

  function subscribePerson(id, listener) {
    if (!personListeners.has(id)) personListeners.set(id, new Set());
    personListeners.get(id).add(listener);
    return function unsub() {
      const ls = personListeners.get(id);
      if (ls) ls.delete(listener);
    };
  }

  async function loadPerson(id) {
    const adapt = window.adapters || {};
    setPersonSnap(id, { status: "loading", error: null });
    try {
      // Pessoa + relações em paralelo. Se a pessoa não existir, falha vem
      // pelo primeiro (404) e propagamos como erro.
      const [personRaw, relationsRaw, eventsRaw] = await Promise.all([
        window.api.fetch("/people/" + id),
        window.api.fetch("/people/" + id + "/relations"),
        window.api.fetch("/people/" + id + "/events"),
      ]);
      setPersonSnap(id, {
        status: "ready",
        person: adapt.adaptPerson ? adapt.adaptPerson(personRaw) : personRaw,
        relations: adapt.adaptRelations ? adapt.adaptRelations(relationsRaw) : relationsRaw,
        events: Array.isArray(eventsRaw)
          ? eventsRaw.map(adapt.adaptEvent || function (x) { return x; }).filter(Boolean)
          : [],
        error: null,
      });
    } catch (e) {
      const status = e && e.status === 404 ? "empty" : "error";
      setPersonSnap(id, {
        status: status,
        person: null,
        relations: null,
        events: [],
        error: (e && e.message) || "Falha ao carregar pessoa.",
      });
    }
  }

  function usePerson(personId) {
    const React = window.React;
    if (!React || typeof React.useSyncExternalStore !== "function") {
      throw new Error("[stirps] usePerson requer React 18+ (useSyncExternalStore)");
    }

    // Pre-condições que substituem o store por um snapshot sintético. Importa
    // que a ORDEM e a QUANTIDADE de hooks chamados não dependa destes valores
    // — sempre chamamos useSyncExternalStore + useEffect para satisfazer as
    // rules-of-hooks. Por isso assumimos um id "vazio" especial quando o
    // input é mock/null/sem API, e os subscribers desse id ficam ociosos.
    const mock = isMockId(personId);
    const noApi = !hasApi();
    const skip = !personId || mock || noApi;
    const effectiveId = skip ? "__stirps_noop__" : personId;

    const subscribeFn = React.useCallback(
      function (cb) {
        return subscribePerson(effectiveId, cb);
      },
      [effectiveId],
    );
    const getSnap = React.useCallback(function () {
      return getPersonSnap(effectiveId);
    }, [effectiveId]);

    const liveSnap = React.useSyncExternalStore(subscribeFn, getSnap);

    React.useEffect(
      function () {
        if (skip) return undefined;
        const cur = getPersonSnap(effectiveId);
        if (cur.status === "idle" || cur.status === "error") {
          loadPerson(effectiveId);
        }
        return undefined;
      },
      [effectiveId, skip, liveSnap.status],
    );

    if (mock) return { status: "fallback", person: null, relations: null, error: null };
    if (!personId) return { status: "idle", person: null, relations: null, events: [], error: null };
    if (noApi) return { status: "unavailable", person: null, relations: null, events: [], error: null };
    return liveSnap;
  }

  function invalidatePerson(personId) {
    if (!personId) return;
    personCache.delete(personId);
    const ls = personListeners.get(personId);
    if (ls) {
      const next = getPersonSnap(personId);
      ls.forEach(function (fn) { fn(next); });
    }
  }

  function invalidateAllPersons() {
    Array.from(personCache.keys()).forEach(invalidatePerson);
  }

  function normalizeAffectedPersonIds(ids) {
    if (!ids) return [];
    const raw = Array.isArray(ids) ? ids : [ids];
    return raw.filter(Boolean).filter(function (id, index, arr) {
      return arr.indexOf(id) === index;
    });
  }

  function unionPersonIds(unionId) {
    const union = (state.unions || []).find(function (u) {
      return u && u.id === unionId;
    });
    return union ? [union.partner_a_id, union.partner_b_id] : [];
  }

  function uniqueIds(ids) {
    return (Array.isArray(ids) ? ids : [])
      .filter(Boolean)
      .filter(function (id, index, arr) {
        return arr.indexOf(id) === index;
      });
  }

  function relationshipAffectedIds(personId, form) {
    return uniqueIds([personId]
      .concat(form && form.parentIds)
      .concat(form && form.childIds)
      .concat(form && form.spouseIds)
      .concat(form && form.siblingIds)
      .concat([form && form.relTo, form && form.spouseId]));
  }

  function hasUnionBetween(a, b) {
    return (state.unions || []).some(function (u) {
      return u && (
        (u.partner_a_id === a && u.partner_b_id === b) ||
        (u.partner_a_id === b && u.partner_b_id === a)
      );
    });
  }

  function filterExistingSpouseLinks(personId, form) {
    const next = Object.assign({}, form || {});
    next.spouseIds = uniqueIds(next.spouseIds).filter(function (spouseId) {
      return spouseId !== personId && !hasUnionBetween(personId, spouseId);
    });
    return next;
  }

  async function mutateAndRefresh(mutation, affectedPersonIds) {
    if (!state.canEdit) {
      throw new Error("Visualizadores não podem editar esta árvore.");
    }
    const result = await mutation();
    normalizeAffectedPersonIds(affectedPersonIds).forEach(invalidatePerson);
    await refetch();
    invalidateAllPersons();
    return result;
  }

  const actions = {
    createPerson: function (form) {
      return mutateAndRefresh(function () {
        return window.genealogyApi.createPersonWithRelation(state.treeId, form);
      }, relationshipAffectedIds(null, form));
    },
    updatePerson: function (personId, form) {
      return mutateAndRefresh(function () {
        return window.genealogyApi.updatePerson(personId, form);
      }, personId);
    },
    deletePerson: function (personId) {
      return mutateAndRefresh(function () {
        return window.genealogyApi.deletePerson(personId);
      }, personId);
    },
    removeParent: function (childId, parentId) {
      return mutateAndRefresh(function () {
        return window.genealogyApi.removeParent(childId, parentId);
      }, [childId, parentId]);
    },
    addRelationships: function (personId, form) {
      const relationshipForm = filterExistingSpouseLinks(personId, form);
      return mutateAndRefresh(function () {
        return window.genealogyApi.createRelationshipLinks(state.treeId, personId, relationshipForm);
      }, relationshipAffectedIds(personId, relationshipForm));
    },
    addEvent: function (personId, form) {
      return mutateAndRefresh(function () {
        if (form && form.type === "marriage" && form.marriageWith) {
          return window.genealogyApi.createUnion(
            state.treeId,
            window.genealogyApi.unionPayloadFromForm(form, personId),
          );
        }
        return window.genealogyApi.createEvent(
          state.treeId,
          window.genealogyApi.eventPayloadFromForm(form, personId, null),
        );
      }, [personId, form && form.marriageWith]);
    },
    updateEvent: function (personId, eventId, form) {
      return mutateAndRefresh(function () {
        return window.genealogyApi.updateEvent(eventId, window.genealogyApi.eventPayloadFromForm(form, null, null));
      }, personId);
    },
    updateUnion: function (personId, unionId, payload) {
      return mutateAndRefresh(function () {
        return window.genealogyApi.updateUnion(unionId, payload);
      }, [personId].concat(unionPersonIds(unionId)));
    },
    deleteEvent: function (personId, eventId) {
      return mutateAndRefresh(function () {
        return window.genealogyApi.deleteEvent(eventId);
      }, personId);
    },
    deleteUnion: function (personId, unionId) {
      return mutateAndRefresh(function () {
        return window.genealogyApi.deleteUnion(unionId);
      }, [personId].concat(unionPersonIds(unionId)));
    },
  };

  window.useTree = useTree;
  useTree.actions = Object.assign(useTree.actions || {}, actions);
  window.usePerson = usePerson;

  // Handle de debug.
  window.__stirpsTreeData = {
    getState: getSnapshot,
    refetch: refetch,
    getPersonCache: function () {
      return Array.from(personCache.entries());
    },
  };
})();
