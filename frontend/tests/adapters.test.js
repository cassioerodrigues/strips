const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "scripts", "adapters.js"),
  "utf8",
);

const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context, { filename: "adapters.js" });

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const person = context.window.adapters.adaptPerson({
  id: "person-1",
  first_name: "Maria",
  middle_names: "das Dores",
  last_name: "Silva",
  maiden_name: "Costa",
  sex: "F",
  is_living: false,
  birth_year: 1941,
  birth_month: 7,
  birth_day: 12,
  birth_place: "Curitiba",
  death_year: 2020,
  death_month: 3,
  death_day: 8,
  death_place: "Sao Paulo",
  death_cause: "natural",
  tags: ["familia"],
  external_ids: { generation: "3", birth_note: "Registro civil", birth_source: "Cartorio A" },
  created_at: "2026-05-10T12:00:00Z",
  updated_at: "2026-05-12T12:00:00Z",
});

assert.equal(person.maiden, "Costa");
assert.equal(person.maidenName, "Costa");
assert.equal(person.middle, "das Dores");
assert.equal(person.middleNames, "das Dores");
assert.equal(person.generation, 3);
assert.equal(person.createdAt, "2026-05-10T12:00:00Z");
assert.equal(person.updatedAt, "2026-05-12T12:00:00Z");
assert.deepEqual(plain(person.externalIds), { generation: "3", birth_note: "Registro civil", birth_source: "Cartorio A" });
assert.deepEqual(plain(person.birth), {
  year: 1941,
  month: 7,
  day: 12,
  place: "Curitiba",
  note: "Registro civil",
  source: "Cartorio A",
});
assert.deepEqual(plain(person.death), {
  year: 2020,
  month: 3,
  day: 8,
  place: "Sao Paulo",
  cause: "natural",
});

assert.deepEqual(plain(context.window.adapters.adaptMedia({
  id: "media-1",
  tree_id: "tree-1",
  kind: "photo",
  storage_path: "tree_tree-1/person/person-1/file.jpg",
  mime_type: "image/jpeg",
  size_bytes: 1234,
  title: "Retrato",
  uploaded_by: "user-1",
  download_url: null,
})), {
  id: "media-1",
  treeId: "tree-1",
  kind: "photo",
  storagePath: "tree_tree-1/person/person-1/file.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 1234,
  title: "Retrato",
  description: "",
  takenYear: null,
  takenMonth: null,
  takenDay: null,
  takenPlace: "",
  uploadedBy: "user-1",
  uploadedAt: null,
  downloadUrl: null,
});

assert.deepEqual(plain(context.window.adapters.adaptEvent({
  id: "event-1",
  tree_id: "tree-1",
  person_id: "person-1",
  union_id: null,
  related_person_ids: ["person-2", "person-3"],
  type: "residence",
  year: 1999,
  place: "Sao Paulo",
})), {
  id: "event-1",
  treeId: "tree-1",
  personId: "person-1",
  unionId: null,
  relatedPersonIds: ["person-2", "person-3"],
  type: "residence",
  customLabel: null,
  year: 1999,
  month: null,
  day: null,
  title: "Mudança",
  place: "Sao Paulo",
  description: "",
});

assert.deepEqual(plain(context.window.adapters.adaptDashboardActivity({
  id: "activity-1",
  kind: "person_created",
  person_id: "person-1",
  title: "Ana Souza foi adicionada",
  subtitle: "Perfil criado",
  actor_name: "Helena",
  occurred_at: "2026-05-14T10:00:00Z",
})), {
  id: "activity-1",
  kind: "person_created",
  personId: "person-1",
  title: "Ana Souza foi adicionada",
  subtitle: "Perfil criado",
  actorName: "Helena",
  occurredAt: "2026-05-14T10:00:00Z",
});

assert.deepEqual(plain(context.window.adapters.adaptExternalRecordSuggestion({
  id: "suggestion-1",
  source: "familysearch",
  title: "Registro de batismo",
  subtitle: "Olinda, 1884",
  confidence: 88,
  person_id: "person-1",
  source_url: "https://example.test/record",
})), {
  id: "suggestion-1",
  source: "familysearch",
  title: "Registro de batismo",
  subtitle: "Olinda, 1884",
  confidence: 88,
  personId: "person-1",
  sourceUrl: "https://example.test/record",
});
