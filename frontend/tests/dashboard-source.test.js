const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dashboardSource = fs.readFileSync(
  path.resolve(__dirname, "..", "components", "dashboard.jsx"),
  "utf8",
);
const treeDataSource = fs.readFileSync(
  path.resolve(__dirname, "..", "scripts", "tree-data.js"),
  "utf8",
);

assert.match(
  treeDataSource,
  /\/trees\/" \+ treeId \+ "\/dashboard-activity/,
  "tree-data should request dashboard activity",
);
assert.match(
  treeDataSource,
  /\/trees\/" \+ treeId \+ "\/external-records\?status=suggested&limit=3/,
  "tree-data should request suggested external records",
);

assert.doesNotMatch(
  dashboardSource,
  /F\.activity\.map/,
  "Dashboard must not render static activity when API data is ready",
);
assert.doesNotMatch(
  dashboardSource,
  /F\.suggestions\.map/,
  "Dashboard must not render static suggestions when API data is ready",
);
assert.match(
  dashboardSource,
  /tree\.activity/,
  "Dashboard should read activity from useTree",
);
assert.match(
  dashboardSource,
  /tree\.suggestions/,
  "Dashboard should read suggestions from useTree",
);
