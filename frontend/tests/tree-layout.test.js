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
  { id: "child-b", first: "Daniel", last: "Ramos", birth: { year: 1981 } },
];
const unions = [
  { partner_a_id: "parent-a", partner_b_id: "parent-b" },
];
const relationsByChild = {
  "child-a": ["parent-a", "parent-b"],
  "child-b": ["parent-a", "parent-b"],
};

const layout = context.window.treeLayout.computeApiTreeLayout(people, unions, relationsByChild);

assert.deepEqual(
  Object.keys(layout.nodes).sort(),
  ["child-a", "child-b", "parent-a", "parent-b"],
  "all API people should become renderable tree nodes",
);
assert.equal(
  layout.nodes["child-a"].y,
  layout.nodes["child-b"].y,
  "siblings with different birth decades should stay in the same generation row",
);
assert.ok(
  layout.nodes["child-a"].y > layout.nodes["parent-a"].y,
  "children should be rendered below their parents",
);
assert.ok(
  layout.links.some((link) => link.type === "union"),
  "union relationships should be represented as tree links",
);
assert.ok(
  layout.links.some((link) => link.type === "drop" && link.toChild),
  "parent-child relationships should be represented as child links",
);
assert.equal(
  layout.links.filter((link) => link.type === "bus").length,
  1,
  "children from the same parent pair should share a sibling bus",
);

const childSpouseLayout = context.window.treeLayout.computeApiTreeLayout(
  [
    { id: "root", first: "Root", last: "Pessoa", birth: { year: 1940 } },
    { id: "child", first: "Child", last: "Pessoa", birth: { year: 1968 } },
    { id: "spouse", first: "Spouse", last: "Pessoa", birth: { year: 1975 } },
  ],
  [{ partner_a_id: "child", partner_b_id: "spouse" }],
  { child: ["root"] },
);

assert.equal(
  childSpouseLayout.nodes.child.y,
  childSpouseLayout.nodes.spouse.y,
  "a spouse with unknown parents should follow their partner's derived generation",
);
