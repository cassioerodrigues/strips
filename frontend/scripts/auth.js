// auth.js — Supabase auth state + useAuth() hook (plain JS, sem JSX).
//
// Carrega APÓS:
//   - scripts/config.js        (define window.STIRPS_CONFIG)
//   - Supabase UMD              (define window.supabase com createClient)
//   - React UMD                 (define window.React — usamos useSyncExternalStore, React 18+)
//
// Responsabilidades:
//   - Inicializa o client Supabase usando STIRPS_CONFIG.supabaseUrl / supabaseAnonKey.
//   - Mantém um store global { status, session, profile, trees, error } com
//     subscription pattern (useAuth() conecta cada componente via
//     React.useSyncExternalStore).
//   - Expõe window.useAuth() retornando estado + ações
//     (signInWithPassword, signUpWithPassword, signOut, refreshMe).
//   - Após autenticar, busca /api/me uma vez e mescla profile/trees no estado.
//   - Em 401 do /me, faz signOut() automático.
(function () {
  "use strict";

  // ------------------------------------------------------------------
  // Store
  // ------------------------------------------------------------------
  // status: "loading" | "unauthenticated" | "authenticated" | "misconfigured" | "error"
  const state = {
    status: "loading",
    session: null,
    profile: null,
    trees: [],
    error: null,
  };

  const listeners = new Set();

  // Snapshot imutável recriado a cada setState. Ter uma referência estável
  // entre chamadas a getSnapshot() é requisito do useSyncExternalStore: se a
  // referência mudar sem motivo (ex.: nova cópia a cada call), o React
  // dispara um rerender desnecessário a cada render.
  let snapshot = Object.assign({}, state);

  function setState(patch) {
    Object.assign(state, patch);
    snapshot = Object.assign({}, state);
    listeners.forEach(function (fn) {
      try {
        fn(snapshot);
      } catch (e) {
        // listener com erro não deve quebrar os outros
        // eslint-disable-next-line no-console
        console.error("[stirps] auth listener error", e);
      }
    });
  }

  function getSnapshot() {
    return snapshot;
  }

  // ------------------------------------------------------------------
  // Supabase client init
  // ------------------------------------------------------------------
  const config = window.STIRPS_CONFIG || {};
  const supabaseUrl = (config.supabaseUrl || "").trim();
  const supabaseAnonKey = (config.supabaseAnonKey || "").trim();

  let supabaseClient = null;

  if (!supabaseUrl || !supabaseAnonKey) {
    setState({
      status: "misconfigured",
      error:
        "STIRPS_SUPABASE_URL e STIRPS_SUPABASE_ANON_KEY precisam estar definidos em scripts/config.js.",
    });
    // eslint-disable-next-line no-console
    console.warn("[stirps] auth desabilitado — config Supabase ausente");
  } else if (!window.supabase || typeof window.supabase.createClient !== "function") {
    setState({
      status: "error",
      error: "Supabase SDK não disponível (window.supabase.createClient ausente).",
    });
    // eslint-disable-next-line no-console
    console.error("[stirps] window.supabase.createClient ausente");
  } else {
    try {
      supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      window.supabaseClient = supabaseClient;
    } catch (e) {
      setState({
        status: "error",
        error: "Falha ao inicializar Supabase: " + (e && e.message ? e.message : String(e)),
      });
      // eslint-disable-next-line no-console
      console.error("[stirps] createClient falhou", e);
    }
  }

  // ------------------------------------------------------------------
  // /api/me fetch após autenticar
  // ------------------------------------------------------------------
  // Dedup: o bootstrap dispara dois caminhos para a mesma sessão restaurada
  // (getSession().then e onAuthStateChange("INITIAL_SESSION")). Sem esse
  // guarda, ambos chamam fetchMe() em paralelo no primeiro load. A chave é
  // o access_token, que é estável entre os dois eventos para a mesma sessão.
  let meInFlight = false;
  let lastMeAccessToken = null;

  function meKey(session) {
    return session && session.access_token ? session.access_token : null;
  }

  function resetMeDedup() {
    meInFlight = false;
    lastMeAccessToken = null;
  }

  async function fetchMe(sessionForKey) {
    if (!window.api || typeof window.api.me !== "function") {
      // api.js ainda não carregou — adia
      // eslint-disable-next-line no-console
      console.warn("[stirps] window.api.me ausente, pulando refreshMe");
      return;
    }
    // Determina a chave da sessão atual (caller pode passá-la explicitamente
    // para evitar uma corrida entre getSession e setState do listener).
    const key = meKey(sessionForKey) || meKey(state.session);
    if (key) {
      if (meInFlight && lastMeAccessToken === key) return;
      if (!meInFlight && lastMeAccessToken === key) return; // já completou
      meInFlight = true;
      lastMeAccessToken = key;
    }
    try {
      const data = await window.api.me();
      setState({
        profile: (data && data.profile) || null,
        trees: (data && data.trees) || [],
        error: null,
      });
    } catch (e) {
      if (e && e.status === 401) {
        // token inválido / expirado → força signOut e volta pro login
        try {
          if (supabaseClient) await supabaseClient.auth.signOut();
        } catch (_) {
          /* ignore */
        }
        resetMeDedup();
        setState({
          status: "unauthenticated",
          session: null,
          profile: null,
          trees: [],
          error: "Sua sessão expirou. Faça login novamente.",
        });
        return;
      }
      // outros erros: mantém autenticado, mas registra o erro.
      // Limpa o marker para permitir retry via refreshMe().
      if (key && lastMeAccessToken === key) lastMeAccessToken = null;
      setState({
        error:
          (e && e.message) ||
          "Não foi possível carregar /api/me. Verifique a conexão e tente novamente.",
      });
    } finally {
      meInFlight = false;
    }
  }

  // ------------------------------------------------------------------
  // Bootstrap: carrega sessão e assina mudanças
  // ------------------------------------------------------------------
  if (supabaseClient) {
    supabaseClient.auth
      .getSession()
      .then(function (res) {
        const session = res && res.data && res.data.session ? res.data.session : null;
        if (session) {
          setState({ status: "authenticated", session: session, error: null });
          fetchMe(session);
        } else {
          setState({ status: "unauthenticated", session: null });
        }
      })
      .catch(function (e) {
        // eslint-disable-next-line no-console
        console.error("[stirps] getSession() falhou", e);
        setState({
          status: "error",
          error: "Falha ao carregar sessão: " + (e && e.message ? e.message : String(e)),
        });
      });

    supabaseClient.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_OUT" || !session) {
        resetMeDedup();
        setState({
          status: "unauthenticated",
          session: null,
          profile: null,
          trees: [],
        });
        return;
      }
      // TOKEN_REFRESHED: silencioso, a cada ~hora. Não toca status/error/
      // profile/trees — apenas atualiza a session (novo access_token). Isso
      // evita limpar uma mensagem de erro que a UI esteja mostrando.
      if (event === "TOKEN_REFRESHED") {
        setState({ session: session });
        return;
      }
      // SIGNED_IN, USER_UPDATED, INITIAL_SESSION com sessão.
      setState({ status: "authenticated", session: session, error: null });
      // fetchMe() é deduplicado por access_token — se getSession() já
      // disparou para esta mesma sessão restaurada (caso comum no
      // INITIAL_SESSION), a segunda chamada é no-op.
      fetchMe(session);
    });
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------
  async function signInWithPassword(args) {
    const email = (args && args.email) || "";
    const password = (args && args.password) || "";
    if (!supabaseClient) {
      return { error: { message: "Supabase não configurado." } };
    }
    const res = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
    if (res.error) return { error: res.error };
    // onAuthStateChange cuida do setState — só sinaliza sucesso aqui
    return {};
  }

  async function signUpWithPassword(args) {
    const email = (args && args.email) || "";
    const password = (args && args.password) || "";
    if (!supabaseClient) {
      return { error: { message: "Supabase não configurado." } };
    }
    const res = await supabaseClient.auth.signUp({ email: email, password: password });
    if (res.error) return { error: res.error };
    // Se o projeto Supabase exige confirmação de email, session vem null e o
    // usuário precisa abrir o link. Sinaliza isso pra UI.
    const session = res.data && res.data.session;
    const user = res.data && res.data.user;
    if (!session && user) {
      return { needsEmailConfirmation: true };
    }
    return {};
  }

  async function signOut() {
    if (!supabaseClient) return;
    try {
      await supabaseClient.auth.signOut();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[stirps] signOut falhou", e);
    }
    // garante reset mesmo se signOut() falhar — o listener também faria isso,
    // mas idempotência aqui evita estado preso.
    resetMeDedup();
    setState({
      status: "unauthenticated",
      session: null,
      profile: null,
      trees: [],
      error: null,
    });
  }

  async function refreshMe() {
    if (state.status !== "authenticated") return;
    // Chamada explícita do usuário — invalida o marker para forçar refetch.
    lastMeAccessToken = null;
    await fetchMe(state.session);
  }

  // ------------------------------------------------------------------
  // useAuth hook (React 18+ useSyncExternalStore)
  // ------------------------------------------------------------------
  // subscribe/getSnapshot têm identidade estável (escopo de módulo), evitando
  // que useSyncExternalStore re-assine a cada commit. setState garante que a
  // referência de `snapshot` só muda quando o estado realmente mudou — o
  // próprio React então pula rerenders desnecessários.
  function subscribe(listener) {
    listeners.add(listener);
    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  window.useAuth = function useAuth() {
    const React = window.React;
    if (!React || typeof React.useSyncExternalStore !== "function") {
      throw new Error("[stirps] useAuth requer React 18+ (useSyncExternalStore) antes de auth.js");
    }
    const snap = React.useSyncExternalStore(subscribe, getSnapshot);
    return {
      status: snap.status,
      session: snap.session,
      profile: snap.profile,
      trees: snap.trees,
      error: snap.error,
      signInWithPassword: signInWithPassword,
      signUpWithPassword: signUpWithPassword,
      signOut: signOut,
      refreshMe: refreshMe,
    };
  };

  // Handle de debug — leitura/ações via console. NB: api.js NÃO depende
  // deste objeto; ele lê window.supabaseClient direto para obter o token.
  window.__stirpsAuth = {
    getState: getSnapshot,
    signOut: signOut,
  };
})();
