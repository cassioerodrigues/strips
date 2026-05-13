const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const dataJs = fs.readFileSync(
  path.resolve(__dirname, "..", "scripts", "data.js"),
  "utf8",
);
const context = { window: {} };
vm.createContext(context);
vm.runInContext(dataJs, context, { filename: "data.js" });

const family = context.window.FAMILY;
assert.ok(family, "FAMILY dataset should load");

const people = Object.values(family.people || {});
assert.equal(people.length, 25, "seed dataset should contain 25 people");

const generations = new Set(people.map((p) => p.generation).filter(Boolean));
assert.equal(generations.size, 4, "seed dataset should span exactly 4 generations");

people.forEach((person) => {
  (person.parents || []).forEach((parentId) => {
    assert.ok(
      family.people[parentId],
      `${person.id} references missing parent ${parentId}`,
    );
  });
});

(family.unions || []).forEach((union) => {
  union.partners.forEach((partnerId) => {
    assert.ok(
      family.people[partnerId],
      `union references missing partner ${partnerId}`,
    );
  });
});
