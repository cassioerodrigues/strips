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

const crossingLayout = context.window.treeLayout.computeApiTreeLayout(
  [
    { id: "p-left", first: "Alice", birth: { year: 1940 } },
    { id: "p-right", first: "Bruno", birth: { year: 1941 } },
    { id: "c-left", first: "Carol", birth: { year: 1970 } },
    { id: "c-right", first: "Diego", birth: { year: 1971 } },
  ],
  [],
  {
    "c-left": ["p-left"],
    "c-right": ["p-right"],
  },
);

assert.ok(
  crossingLayout.nodes["c-left"].x < crossingLayout.nodes["c-right"].x,
  "children should follow the horizontal order of their parents to reduce crossing lines",
);

const spouseAdjacencyLayout = context.window.treeLayout.computeApiTreeLayout(
  [
    { id: "a1", first: "A1", birth: { year: 1940 } },
    { id: "b1", first: "B1", birth: { year: 1941 } },
    { id: "a2", first: "A2", birth: { year: 1942 } },
    { id: "b2", first: "B2", birth: { year: 1943 } },
    { id: "c1", first: "C1", birth: { year: 1970 } },
    { id: "c2", first: "C2", birth: { year: 1971 } },
  ],
  [
    { partner_a_id: "a1", partner_b_id: "b1" },
    { partner_a_id: "a2", partner_b_id: "b2" },
  ],
  {
    c1: ["a1", "b1"],
    c2: ["a2", "b2"],
  },
);

const topRow = ["a1", "b1", "a2", "b2"].sort(
  (left, right) => spouseAdjacencyLayout.nodes[left].x - spouseAdjacencyLayout.nodes[right].x,
);

assert.ok(
  Math.abs(topRow.indexOf("a1") - topRow.indexOf("b1")) === 1,
  "first couple should stay adjacent to avoid long union lines over the row",
);
assert.ok(
  Math.abs(topRow.indexOf("a2") - topRow.indexOf("b2")) === 1,
  "second couple should stay adjacent to avoid long union lines over the row",
);
