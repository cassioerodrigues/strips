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

const partnerAdjacencyLayout = context.window.treeLayout.computeApiTreeLayout(
  [
    { id: "left", first: "Adir", birth: { year: 1958 } },
    { id: "mid-a", first: "Olomir", birth: { year: 1964 } },
    { id: "mid-b", first: "Cintia", birth: { year: 1971 } },
    { id: "right", first: "Alzira", birth: { year: 1975 } },
  ],
  [{ partner_a_id: "mid-a", partner_b_id: "mid-b" }],
  {},
);

const sortedByX = Object.values(partnerAdjacencyLayout.nodes)
  .map((node) => ({ id: node.id, x: node.x }))
  .sort((a, b) => a.x - b.x)
  .map((node) => node.id);
const distance = Math.abs(sortedByX.indexOf("mid-a") - sortedByX.indexOf("mid-b"));
assert.equal(
  distance,
  1,
  "partners in the same generation should stay adjacent to avoid overlapping lines",
);

const limitedAncestorCollateralLayout = context.window.treeLayout.computeApiTreeLayout(
  [
    { id: "root", first: "Root", birth: { year: 1988 } },
    { id: "father", first: "Father", birth: { year: 1960 } },
    { id: "mother", first: "Mother", birth: { year: 1961 } },
    { id: "uncle", first: "Uncle", birth: { year: 1964 } },
    { id: "aunt-by-marriage", first: "Aunt", birth: { year: 1966 } },
    { id: "cousin", first: "Cousin", birth: { year: 1990 } },
    { id: "grandfather", first: "Grandfather", birth: { year: 1930 } },
    { id: "grandmother", first: "Grandmother", birth: { year: 1932 } },
    { id: "great-grandfather", first: "Great Grandfather", birth: { year: 1900 } },
    { id: "great-grandmother", first: "Great Grandmother", birth: { year: 1902 } },
    { id: "great-uncle", first: "Great Uncle", birth: { year: 1934 } },
  ],
  [
    { partner_a_id: "father", partner_b_id: "mother" },
    { partner_a_id: "uncle", partner_b_id: "aunt-by-marriage" },
    { partner_a_id: "grandfather", partner_b_id: "grandmother" },
    { partner_a_id: "great-grandfather", partner_b_id: "great-grandmother" },
  ],
  {
    root: ["father", "mother"],
    father: ["grandfather", "grandmother"],
    uncle: ["grandfather", "grandmother"],
    cousin: ["uncle", "aunt-by-marriage"],
    grandfather: ["great-grandfather", "great-grandmother"],
    "great-uncle": ["great-grandfather", "great-grandmother"],
  },
  "root",
);

assert.ok(
  limitedAncestorCollateralLayout.nodes.uncle,
  "direct uncles/aunts should still appear beside the pinned root's parent generation",
);
assert.ok(
  limitedAncestorCollateralLayout.nodes["aunt-by-marriage"],
  "spouses of direct uncles/aunts should appear",
);
assert.ok(
  limitedAncestorCollateralLayout.nodes.cousin,
  "children of direct uncles/aunts should appear as first cousins",
);
assert.ok(
  limitedAncestorCollateralLayout.nodes["great-grandfather"],
  "direct ancestors above grandparents should still appear",
);
assert.ok(
  !limitedAncestorCollateralLayout.nodes["great-uncle"],
  "great-uncles/aunts should be hidden when a root is pinned",
);
assert.ok(
  limitedAncestorCollateralLayout.nodes.cousin.y > limitedAncestorCollateralLayout.nodes.uncle.y,
  "first cousins should render below direct uncles/aunts",
);

const limitedDescendantCollateralLayout = context.window.treeLayout.computeApiTreeLayout(
  [
    { id: "parent-a", first: "Parent A", birth: { year: 1940 } },
    { id: "parent-b", first: "Parent B", birth: { year: 1942 } },
    { id: "root", first: "Root", birth: { year: 1970 } },
    { id: "root-spouse", first: "Root Spouse", birth: { year: 1972 } },
    { id: "sibling", first: "Sibling", birth: { year: 1974 } },
    { id: "sibling-spouse", first: "Sibling Spouse", birth: { year: 1975 } },
    { id: "nephew", first: "Nephew", birth: { year: 1998 } },
    { id: "nephew-spouse", first: "Nephew Spouse", birth: { year: 1999 } },
    { id: "grand-nephew", first: "Grand Nephew", birth: { year: 2022 } },
    { id: "child", first: "Child", birth: { year: 1995 } },
    { id: "grandchild", first: "Grandchild", birth: { year: 2020 } },
    { id: "great-grandchild", first: "Great Grandchild", birth: { year: 2045 } },
  ],
  [
    { partner_a_id: "root", partner_b_id: "root-spouse" },
    { partner_a_id: "sibling", partner_b_id: "sibling-spouse" },
    { partner_a_id: "nephew", partner_b_id: "nephew-spouse" },
  ],
  {
    root: ["parent-a", "parent-b"],
    sibling: ["parent-a", "parent-b"],
    child: ["root", "root-spouse"],
    grandchild: ["child"],
    "great-grandchild": ["grandchild"],
    nephew: ["sibling", "sibling-spouse"],
    "grand-nephew": ["nephew", "nephew-spouse"],
  },
  "root",
);

assert.ok(
  limitedDescendantCollateralLayout.nodes["great-grandchild"],
  "direct descendants should continue expanding through every generation",
);
assert.ok(
  limitedDescendantCollateralLayout.nodes.nephew,
  "children of root siblings should appear as first-degree nieces/nephews",
);
assert.ok(
  limitedDescendantCollateralLayout.nodes["nephew-spouse"],
  "spouses of first-degree nieces/nephews should appear",
);
assert.ok(
  !limitedDescendantCollateralLayout.nodes["grand-nephew"],
  "descendants of nieces/nephews should not expand past first degree",
);
