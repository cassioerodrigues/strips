const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "components", "other-pages.jsx"),
  "utf8",
);

const peoplePageStart = source.indexOf("function PeoplePage");
const timelinePageStart = source.indexOf("function TimelinePage");
assert.ok(peoplePageStart >= 0, "PeoplePage should exist");
assert.ok(timelinePageStart > peoplePageStart, "TimelinePage should follow PeoplePage");

const peoplePage = source.slice(peoplePageStart, timelinePageStart);

assert.match(
  peoplePage,
  /Adicionar pessoa/,
  "PeoplePage should expose an Add person action",
);
assert.match(
  peoplePage,
  /AddPersonModal/,
  "PeoplePage should open AddPersonModal",
);
assert.match(
  peoplePage,
  /Editar pessoa/,
  "PeoplePage should expose an Edit person action for existing people",
);
assert.match(
  peoplePage,
  /EditPersonModal/,
  "PeoplePage should open EditPersonModal",
);
