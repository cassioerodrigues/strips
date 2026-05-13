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
  const context = {
    window: {
      api: {
        fetch(path, options) {
          calls.push({ path, options });
          if (options && options.method === "POST" && path.endsWith("/people")) {
            return Promise.resolve({ id: "person-new", first_name: "Ana" });
          }
          return Promise.resolve({ id: "ok" });
        },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "genealogy-api.js" });
  return { api: context.window.genealogyApi, calls };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

(async () => {
  const { api, calls } = loadApi();

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
    type: "custom",
    custom_label: "Falecimento",
    year: 2001,
    month: null,
    day: null,
    place: null,
    description: null,
  });
})();
