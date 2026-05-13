const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts", "tree-layout.js"), "utf8");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context, { filename: "tree-layout.js" });

assert.ok(context.window.treeLayout, "treeLayout global should be exported");
assert.equal(typeof context.window.treeLayout.computeApiTreeLayout, "function");

const people = [
  { id: "parent-a", first: "Ana", last: "Ramos", birth: { year: 1940 } },
  { id: "parent-b", first: "Bruno", last: "Ramos", birth: { year: 1938 } },
  { id: "child-a", first: "Clara", last: "Ramos", birth: { year: 1970 } },
];
const unions = [
  { partner_a_id: "parent-a", partner_b_id: "parent-b" },
];
const relationsByChild = {
  "child-a": ["parent-a", "parent-b"],
};

const layout = context.window.treeLayout.computeApiTreeLayout(people, unions, relationsByChild);

assert.deepEqual(
  Object.keys(layout.nodes).sort(),
  ["child-a", "parent-a", "parent-b"],
  "all API people should become renderable tree nodes",
);
assert.ok(
  layout.links.some((link) => link.type === "union"),
  "union relationships should be represented as tree links",
);
assert.ok(
  layout.links.some((link) => link.type === "drop" && link.toChild),
  "parent-child relationships should be represented as child links",
);
