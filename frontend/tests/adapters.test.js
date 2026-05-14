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
});

assert.equal(person.maiden, "Costa");
assert.equal(person.maidenName, "Costa");
assert.deepEqual(plain(person.birth), {
  year: 1941,
  month: 7,
  day: 12,
  place: "Curitiba",
});
assert.deepEqual(plain(person.death), {
  year: 2020,
  month: 3,
  day: 8,
  place: "Sao Paulo",
  cause: "natural",
});
