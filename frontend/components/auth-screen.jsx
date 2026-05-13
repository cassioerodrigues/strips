// auth-screen.jsx — gate full-screen de autenticação (login + signup).
//
// Renderizado por App quando auth.status é "loading", "unauthenticated" ou
// "misconfigured". O fluxo é mínimo (email + senha), sem MFA, sem reset, sem
// social login. Erros do Supabase e estado de "confirme seu email" são
// mostrados de forma explícita.

function AuthLoading() {
  return (
    <div className="auth-screen auth-screen-loading">
      <div className="auth-loading-dot" aria-hidden="true"/>
      <div className="auth-loading-text">Carregando…</div>
    </div>
  );
}

function AuthMisconfigured({ message }) {
  return (
    <div className="auth-screen">
      <div className="auth-card auth-card-info">
        <div className="auth-eyebrow">Stirps</div>
        <h1 className="auth-title">Configuração necessária</h1>
        <p className="auth-lede">
          O frontend foi servido sem credenciais do Supabase. Para habilitar o
          login, defina as variáveis <code>STIRPS_SUPABASE_URL</code> e
          {" "}<code>STIRPS_SUPABASE_ANON_KEY</code> (ou edite{" "}
          <code>frontend/scripts/config.js</code> em dev).
        </p>
        {message && <div className="auth-error" role="alert">{message}</div>}
        <p className="auth-foot">
          Veja <code>frontend/README.md</code> para o passo a passo de
          configuração via Docker, EasyPanel ou nginx do host.
        </p>
      </div>
    </div>
  );
}

function AuthScreen() {
  const auth = window.useAuth();
  const [mode, setMode] = React.useState("login"); // "login" | "signup"
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [localError, setLocalError] = React.useState(null);
  const [emailSent, setEmailSent] = React.useState(false);

  if (auth.status === "misconfigured") {
    return <AuthMisconfigured message={auth.error}/>;
  }

  // Reset campos quando alternar entre login/signup
  function switchMode(next) {
    if (next === mode) return;
    setMode(next);
    setLocalError(null);
    setEmailSent(false);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setLocalError(null);
    if (!email || !password) {
      setLocalError("Informe email e senha.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setLocalError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "login") {
        const r = await auth.signInWithPassword({ email, password });
        if (r && r.error) {
          setLocalError(r.error.message || "Não foi possível entrar.");
        }
      } else {
        const r = await auth.signUpWithPassword({ email, password });
        if (r && r.error) {
          setLocalError(r.error.message || "Não foi possível criar a conta.");
        } else if (r && r.needsEmailConfirmation) {
          setEmailSent(true);
        }
      }
    } catch (err) {
      setLocalError((err && err.message) || "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  const headerCopy = mode === "login"
    ? { title: "Entrar", lede: "Acesse sua árvore Stirps." }
    : { title: "Criar conta", lede: "Comece a registrar a história da sua família." };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark" aria-hidden="true">S</div>
          <div className="auth-brand-text">
            <div className="auth-eyebrow">Stirps</div>
            <div className="auth-brand-sub">Árvore genealógica</div>
          </div>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Autenticação">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={"auth-tab " + (mode === "login" ? "auth-tab-on" : "")}
            onClick={() => switchMode("login")}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={"auth-tab " + (mode === "signup" ? "auth-tab-on" : "")}
            onClick={() => switchMode("signup")}
          >
            Criar conta
          </button>
        </div>

        <h1 className="auth-title">{headerCopy.title}</h1>
        <p className="auth-lede">{headerCopy.lede}</p>

        {emailSent ? (
          <div className="auth-success" role="status">
            <strong>Verifique seu email.</strong>
            <div>Enviamos um link de confirmação para <span className="auth-email">{email}</span>. Após confirmar, volte e faça login.</div>
          </div>
        ) : (
          <form className="auth-form" onSubmit={onSubmit} noValidate>
            <label className="auth-label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="input"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              required
            />
            <label className="auth-label" htmlFor="auth-password">Senha</label>
            <input
              id="auth-password"
              className="input"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              minLength={mode === "signup" ? 6 : undefined}
              required
            />
            {mode === "signup" && (
              <div className="auth-hint">Mínimo 6 caracteres.</div>
            )}

            {localError && (
              <div className="auth-error" role="alert">{localError}</div>
            )}
            {!localError && auth.error && auth.status === "unauthenticated" && (
              <div className="auth-error" role="alert">{auth.error}</div>
            )}

            <button
              type="submit"
              className="btn btn-primary auth-submit"
              disabled={submitting}
            >
              {submitting
                ? (mode === "login" ? "Entrando…" : "Criando…")
                : (mode === "login" ? "Entrar" : "Criar conta")}
            </button>
          </form>
        )}

        <p className="auth-foot">
          {mode === "login" ? (
            <>Ainda não tem conta? <button type="button" className="auth-link" onClick={() => switchMode("signup")}>Criar conta</button></>
          ) : (
            <>Já tem conta? <button type="button" className="auth-link" onClick={() => switchMode("login")}>Entrar</button></>
          )}
        </p>
      </div>
    </div>
  );
}

window.AuthScreen = AuthScreen;
window.AuthLoading = AuthLoading;
window.AuthMisconfigured = AuthMisconfigured;
