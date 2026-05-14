const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "components", "other-pages.jsx"),
  "utf8",
);
const profileSource = fs.readFileSync(
  path.resolve(__dirname, "..", "components", "profile.jsx"),
  "utf8",
);
const modalsSource = fs.readFileSync(
  path.resolve(__dirname, "..", "components", "modals.jsx"),
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

assert.match(
  profileSource,
  /Excluir \$\{name\} da .+rvore\? Esta a.+o n.+o pode ser desfeita\./,
  "Profile delete should confirm before deleting a person",
);
assert.match(
  profileSource,
  /btn btn-ghost btn-danger-soft[^>]+onClick=\{\(\) => deletePerson\(\)\}/,
  "Profile should expose a direct delete action",
);
assert.match(
  profileSource,
  /onDelete=\{\(\) => deletePerson\(\{ skipConfirm: true \}\)\}/,
  "EditPersonModal should rely on its own confirmation and avoid a second prompt",
);

assert.doesNotMatch(
  profileSource,
  /Marcar encerrada|Marcar ativa|Remover união/,
  "Spouse cards should not expose separate union action buttons",
);
assert.match(
  profileSource,
  /onPersonClick=\{canEdit && spouseUnion\s+\? \(\) => openUnionEditor\(spouseUnion\)\s+: onPersonClick\}/,
  "Clicking an editable spouse card should open the union editor",
);
assert.match(
  modalsSource,
  /function EditUnionModal\(\{[^}]+onDelete/,
  "EditUnionModal should receive a delete callback",
);
assert.match(
  modalsSource,
  /Excluir união/,
  "EditUnionModal should expose union deletion inside the modal",
);
