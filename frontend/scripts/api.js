// api.js — fetch wrapper que injeta Authorization: Bearer <token> do Supabase.
//
// Depende de:
//   - window.STIRPS_CONFIG.apiBaseUrl     (string, ex.: "http://localhost:8001/api")
//   - window.supabaseClient                (pode estar ausente em modo "misconfigured")
//
// Exporta:
//   - window.api.fetch(path, options)     fetch genérico
//   - window.api.me()                     conveniência: GET /me
//   - window.ApiError                     subclasse de Error com .status e .body
(function () {
  "use strict";

  class ApiError extends Error {
    constructor(message, status, body) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.body = body;
    }
  }

  function getBaseUrl() {
    const cfg = window.STIRPS_CONFIG || {};
    const base = (cfg.apiBaseUrl || "").trim();
    if (!base) {
      throw new ApiError(
        "apiBaseUrl ausente em window.STIRPS_CONFIG — verifique scripts/config.js.",
        0,
        null,
      );
    }
    return base.replace(/\/+$/, "");
  }

  function joinUrl(base, path) {
    if (!path) return base;
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith("/")) return base + path;
    return base + "/" + path;
  }

  async function currentAccessToken() {
    if (!window.supabaseClient || !window.supabaseClient.auth) return null;
    try {
      const res = await window.supabaseClient.auth.getSession();
      const session = res && res.data && res.data.session;
      return session && session.access_token ? session.access_token : null;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[stirps] getSession() falhou em api.fetch", e);
      return null;
    }
  }

  async function apiFetch(path, options) {
    options = options || {};
    const base = getBaseUrl();
    const url = joinUrl(base, path);

    const method = (options.method || "GET").toUpperCase();
    const headers = Object.assign({}, options.headers || {});

    const token = await currentAccessToken();
    if (token && !headers["Authorization"] && !headers["authorization"]) {
      headers["Authorization"] = "Bearer " + token;
    }

    let body = options.body;
    const isPlainObjectBody =
      body !== undefined &&
      body !== null &&
      typeof body === "object" &&
      !(body instanceof FormData) &&
      !(body instanceof Blob) &&
      !(body instanceof ArrayBuffer) &&
      !(typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams);

    if (method !== "GET" && method !== "HEAD" && isPlainObjectBody) {
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
      body = JSON.stringify(body);
    }

    const init = Object.assign({}, options, {
      method: method,
      headers: headers,
    });
    if (body !== undefined) init.body = body;
    if (!init.credentials) init.credentials = "omit";

    let response;
    try {
      response = await fetch(url, init);
    } catch (e) {
      throw new ApiError(
        "Falha de rede ao chamar " + url + ": " + (e && e.message ? e.message : String(e)),
        0,
        null,
      );
    }

    const contentType = response.headers.get("content-type") || "";
    let parsed = null;
    if (contentType.indexOf("application/json") !== -1) {
      try {
        parsed = await response.json();
      } catch (_) {
        parsed = null;
      }
    } else if (response.status !== 204) {
      try {
        parsed = await response.text();
      } catch (_) {
        parsed = null;
      }
    }

    if (!response.ok) {
      const detail =
        (parsed && typeof parsed === "object" && (parsed.detail || parsed.message)) ||
        (typeof parsed === "string" && parsed) ||
        response.statusText ||
        "HTTP " + response.status;
      throw new ApiError(String(detail), response.status, parsed);
    }

    return parsed;
  }

  window.ApiError = ApiError;
  window.api = {
    fetch: apiFetch,
    me: function me() {
      return apiFetch("/me", { method: "GET" });
    },
  };
})();
