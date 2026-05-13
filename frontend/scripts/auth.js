// auth.js — Supabase auth state + useAuth() hook (plain JS, sem JSX).
//
// Carrega APÓS:
//   - scripts/config.js        (define window.STIRPS_CONFIG)
//   - Supabase UMD              (define window.supabase com createClient)
//   - React UMD                 (define window.React — usamos useState/useEffect)
//
// Responsabilidades:
//   - Inicializa o client Supabase usando STIRPS_CONFIG.supabaseUrl / supabaseAnonKey.
//   - Mantém um store global { status, session, profile, trees, error } com
//     subscription pattern (cada componente que chama useAuth() registra um
//     listener via React.useState/useEffect).
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

  function setState(patch) {
    Object.assign(state, patch);
    // copia rasa para que React detecte mudança de referência
    const snapshot = Object.assign({}, state);
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
    return Object.assign({}, state);
  }

  // ------------------------------------------------------------------
  // Supabase client init
  // ------------------------------------------------------------------
  const config = window.STIRPS_CONFIG || {};
  const supabaseUrl = (config.supabaseUrl || "").trim();
  const supabaseAnonKey = (config.supabaseAnonKey || "").trim();

  let supabaseClient = null;

  if (!supabaseUrl || !supabaseAnonKey) {
    state.status = "misconfigured";
    state.error =
      "STIRPS_SUPABASE_URL e STIRPS_SUPABASE_ANON_KEY precisam estar definidos em scripts/config.js.";
    // eslint-disable-next-line no-console
    console.warn("[stirps] auth desabilitado — config Supabase ausente");
  } else if (!window.supabase || typeof window.supabase.createClient !== "function") {
    state.status = "error";
    state.error = "Supabase SDK não disponível (window.supabase.createClient ausente).";
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
      state.status = "error";
      state.error = "Falha ao inicializar Supabase: " + (e && e.message ? e.message : String(e));
      // eslint-disable-next-line no-console
      console.error("[stirps] createClient falhou", e);
    }
  }

  // ------------------------------------------------------------------
  // /api/me fetch após autenticar
  // ------------------------------------------------------------------
  async function fetchMe() {
    if (!window.api || typeof window.api.me !== "function") {
      // api.js ainda não carregou — adia
      // eslint-disable-next-line no-console
      console.warn("[stirps] window.api.me ausente, pulando refreshMe");
      return;
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
        setState({
          status: "unauthenticated",
          session: null,
          profile: null,
          trees: [],
          error: "Sua sessão expirou. Faça login novamente.",
        });
        return;
      }
      // outros erros: mantém autenticado, mas registra o erro
      setState({
        error:
          (e && e.message) ||
          "Não foi possível carregar /api/me. Verifique a conexão e tente novamente.",
      });
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
          fetchMe();
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
        setState({
          status: "unauthenticated",
          session: null,
          profile: null,
          trees: [],
        });
        return;
      }
      // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION com sessão
      const wasAuthenticated = state.status === "authenticated";
      setState({ status: "authenticated", session: session, error: null });
      // Só re-buscamos /me em eventos "humanos" — não a cada refresh de token,
      // que dispara em background a cada hora e não muda profile/trees.
      if (!wasAuthenticated || event === "SIGNED_IN" || event === "USER_UPDATED") {
        fetchMe();
      }
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
    await fetchMe();
  }

  // ------------------------------------------------------------------
  // useAuth hook
  // ------------------------------------------------------------------
  window.useAuth = function useAuth() {
    if (!window.React || !window.React.useState || !window.React.useEffect) {
      throw new Error("[stirps] useAuth requer React carregado antes de auth.js");
    }
    const React = window.React;
    const setter = React.useState(getSnapshot())[1];

    React.useEffect(function () {
      function listener(snapshot) {
        setter(snapshot);
      }
      listeners.add(listener);
      // sincroniza com o estado atual (pode ter mudado entre render e effect)
      setter(getSnapshot());
      return function () {
        listeners.delete(listener);
      };
    }, []);

    const snap = getSnapshot();
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

  // Expor para debug e para api.js poder pegar o token.
  window.__stirpsAuth = {
    getState: getSnapshot,
    signOut: signOut,
  };
})();
