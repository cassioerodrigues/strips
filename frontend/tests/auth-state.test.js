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
