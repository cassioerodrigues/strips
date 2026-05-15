const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "scripts", "genealogy-api.js"),
  "utf8",
);

function loadApi() {
  const calls = [];
  const storageCalls = [];
  const context = {
    fetch(url, options) {
      storageCalls.push({ url, options });
      return Promise.resolve({ ok: true, status: 200, statusText: "OK", text: () => Promise.resolve("") });
    },
    window: {
      api: {
        fetch(path, options) {
          calls.push({ path, options });
          if (options && options.method === "POST" && path.endsWith("/people")) {
            return Promise.resolve({ id: "person-new", first_name: "Ana" });
          }
          if (path.endsWith("/media/upload-url")) {
            return Promise.resolve({ url: "https://storage.local/upload-token", storage_path: "tree_tree-1/person/person-1/file.jpg" });
          }
          if (path.endsWith("/media")) {
            return Promise.resolve({ id: "media-1", kind: "photo" });
          }
          return Promise.resolve({ id: "ok" });
        },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "genealogy-api.js" });
  return { api: context.window.genealogyApi, calls, storageCalls };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

(async () => {
  const { api, calls, storageCalls } = loadApi();

  assert.deepEqual(plain(api.personPayloadFromForm({
    first: " Ana ",
    middle: "",
    last: " Souza ",
    maidenName: "",
    sex: "X",
    living: false,
    birthYear: "1980",
    birthMonth: "04",
    birthDay: "",
    birthPlace: " Recife ",
    deathYear: "2020",
    deathPlace: "",
    cause: "natural",
    occupation: "",
    bio: "Bio",
    tags: [" família ", "", "Brasil"],
    externalIds: { generation: "3" },
    birthNote: " Registro civil ",
    birthSource: " Cartorio A ",
  })), {
    first_name: "Ana",
    middle_names: null,
    last_name: "Souza",
    maiden_name: null,
    sex: "U",
    is_living: false,
    birth_year: 1980,
    birth_month: 4,
    birth_day: null,
    birth_place: "Recife",
    death_year: 2020,
    death_month: null,
    death_day: null,
    death_place: null,
    death_cause: "natural",
    occupation: null,
    bio: "Bio",
    tags: ["família", "Brasil"],
    external_ids: { generation: "3", birth_note: "Registro civil", birth_source: "Cartorio A" },
  });

  await api.createPersonWithRelation("tree-1", {
    first: "Ana",
    last: "Souza",
    relType: "child",
    relTo: "parent-a",
    spouseId: "parent-b",
  });

  assert.equal(calls[0].path, "/trees/tree-1/people");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(plain(calls[1]), {
    path: "/people/person-new/parents",
    options: { method: "POST", body: { parent_id: "parent-a", kind: "biological" } },
  });
  assert.deepEqual(plain(calls[2]), {
    path: "/people/person-new/parents",
    options: { method: "POST", body: { parent_id: "parent-b", kind: "biological" } },
  });

  assert.deepEqual(plain(api.eventPayloadFromForm({ type: "move", year: "1999", title: "", place: "SP", description: "" }, "p1")), {
    person_id: "p1",
    union_id: null,
    related_person_ids: [],
    type: "residence",
    custom_label: null,
    year: 1999,
    month: null,
    day: null,
    place: "SP",
    description: null,
  });

  assert.deepEqual(plain(api.eventPayloadFromForm({ type: "death", year: "2001", title: "Falecimento" }, "p1")), {
    person_id: "p1",
    union_id: null,
    related_person_ids: [],
    type: "custom",
    custom_label: "Falecimento",
    year: 2001,
    month: null,
    day: null,
    place: null,
    description: null,
  });

  assert.deepEqual(plain(api.eventPayloadFromForm({
    type: "education",
    relatedPeople: ["p2", "p1", "p2", "", "p3"],
  }, "p1")), {
    person_id: "p1",
    union_id: null,
    related_person_ids: ["p2", "p3"],
    type: "education",
    custom_label: null,
    year: null,
    month: null,
    day: null,
    place: null,
    description: null,
  });

  assert.equal(api.mediaKindFromFile({ type: "image/png" }), "photo");
  assert.equal(api.mediaKindFromFile({ type: "application/pdf" }), "document");

  await api.uploadPersonMedia("tree-1", "person-1", {
    name: "retrato.jpg",
    type: "image/jpeg",
    size: 2048,
  });

  assert.deepEqual(plain(calls.slice(-3)), [
    {
      path: "/trees/tree-1/media/upload-url",
      options: {
        method: "POST",
        body: {
          filename: "retrato.jpg",
          mime_type: "image/jpeg",
          entity_type: "person",
          entity_id: "person-1",
        },
      },
    },
    {
      path: "/trees/tree-1/media",
      options: {
        method: "POST",
        body: {
          tree_id: "tree-1",
          kind: "photo",
          storage_path: "tree_tree-1/person/person-1/file.jpg",
          mime_type: "image/jpeg",
          size_bytes: 2048,
          title: "retrato",
          description: null,
          taken_year: null,
          taken_month: null,
          taken_day: null,
          taken_place: null,
        },
      },
    },
    {
      path: "/people/person-1/media/media-1",
      options: { method: "POST", body: { is_primary: false } },
    },
  ]);
  assert.equal(storageCalls[0].url, "https://storage.local/upload-token");
  assert.equal(storageCalls[0].options.method, "PUT");
  assert.equal(storageCalls[0].options.headers["Content-Type"], "image/jpeg");
})();
