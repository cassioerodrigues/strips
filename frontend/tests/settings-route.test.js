const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const frontendRoot = path.resolve(__dirname, "..");

function readFrontend(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), "utf8");
}

const html = readFrontend("Stirps.html");
const appSource = readFrontend(path.join("components", "app.jsx"));
const componentsSource = readFrontend(path.join("components", "components.jsx"));
const settingsSource = readFrontend(path.join("components", "settings.jsx"));
const styles = readFrontend(path.join("stylesheets", "styles.css"));

const settingsScriptIndex = html.indexOf('src="components/settings.jsx"');
const appScriptIndex = html.indexOf('src="components/app.jsx"');

assert.ok(settingsScriptIndex >= 0, "Stirps.html should load the active Settings component");
assert.ok(appScriptIndex > settingsScriptIndex, "Settings should load before app.jsx mounts routes");

assert.match(
  appSource,
  /settings:\s*\["Stirps",\s*"Configura..es"\]/,
  "App breadcrumbs should know the settings route",
);
assert.match(
  appSource,
  /route === "settings" && window\.SettingsPage && <window\.SettingsPage/,
  "App should render SettingsPage for the settings route",
);

assert.match(
  componentsSource,
  /SIDEBAR_NAV_BOTTOM[\s\S]*id:\s*"settings"/,
  "Sidebar bottom navigation should expose Settings",
);
assert.match(
  componentsSource,
  /SIDEBAR_NAV_BOTTOM\.map[\s\S]*current === item\.id \? "sb-item-active" : ""/,
  "Sidebar bottom navigation should mark Settings active when selected",
);

assert.match(settingsSource, /window\.SettingsPage = SettingsPage;/, "SettingsPage should be exported on window");
assert.match(styles, /\.page-settings\b/, "Active stylesheet should include settings page styles");

for (const [relativePath, source] of [
  ["Stirps.html", html],
  ["components/app.jsx", appSource],
  ["components/components.jsx", componentsSource],
  ["components/settings.jsx", settingsSource],
  ["stylesheets/styles.css", styles],
]) {
  assert.doesNotMatch(
    source,
    /template[\\/]/,
    `${relativePath} should not import runtime assets from template/`,
  );
}
