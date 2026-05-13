const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const authJs = fs.readFileSync(
  path.resolve(__dirname, "..", "scripts", "auth.js"),
  "utf8",
);

function loadAuth(config, supabase) {
  const context = {
    console,
    window: {
      STIRPS_CONFIG: config,
      supabase,
      React: {
        useSyncExternalStore() {},
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(authJs, context, { filename: "auth.js" });
  return context.window.__stirpsAuth.getState();
}

async function loadAuthAsync(config, supabase) {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    window: {
      STIRPS_CONFIG: config,
      supabase,
      React: {
        useSyncExternalStore(subscribe, getSnapshot) {
          return getSnapshot();
        },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(authJs, context, { filename: "auth.js" });
  return context;
}

const missingConfig = loadAuth({ apiBaseUrl: "/api", supabaseUrl: "", supabaseAnonKey: "" });
assert.equal(missingConfig.status, "misconfigured");
assert.match(missingConfig.error, /STIRPS_SUPABASE_URL/);

const missingSdk = loadAuth({
  apiBaseUrl: "/api",
  supabaseUrl: "https://example.supabase.co",
  supabaseAnonKey: "anon",
});
assert.equal(missingSdk.status, "error");
assert.match(missingSdk.error, /Supabase SDK/);

(async () => {
  const session = { access_token: "token-1" };
  let authCallback = null;
  let meCalls = 0;
  const context = await loadAuthAsync({
    apiBaseUrl: "/api",
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon",
  }, {
    createClient() {
      return {
        auth: {
          getSession() {
            return Promise.resolve({ data: { session } });
          },
          onAuthStateChange(cb) {
            authCallback = cb;
          },
          signOut() {
            return Promise.resolve();
          },
        },
      };
    },
  });

  await Promise.resolve();
  authCallback("INITIAL_SESSION", session);
  context.window.api = {
    me() {
      meCalls += 1;
      return Promise.resolve({
        profile: { id: "user-1" },
        trees: [{ role: "owner", tree: { id: "tree-1" } }],
      });
    },
  };

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(meCalls, 1, "auth should retry /api/me after api.js becomes available");
  assert.deepEqual(context.window.__stirpsAuth.getState().trees, [
    { role: "owner", tree: { id: "tree-1" } },
  ]);
})();
