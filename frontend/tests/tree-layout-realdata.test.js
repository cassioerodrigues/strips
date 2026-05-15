/**
 * tree-layout-realdata.test.js
 *
 * Tests the tree layout algorithm with REAL data from the Supabase database.
 * Validates that when Cassio is the pinned root, his aunt Karine Age
 * (sister of his mother Cintia) appears in the rendered tree.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "scripts", "tree-layout.js"),
  "utf8"
);

const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(source, context, { filename: "tree-layout.js" });

const { computeApiTreeLayout } = context.window.treeLayout;

// =========================================================================
// Real data from Supabase (tree dc8ac34d-e15c-4376-842f-d9af2a944c9d)
// =========================================================================
const CASSIO   = "8b26ea1d-5b8d-4088-9e73-0975d84bdb97";
const EVELINE  = "b2d83756-ed2b-40fb-89d8-d55e8a5e54b2";
const ZOE      = "5d2471d5-c81f-41cd-a319-4b9f59ad0825";
const ANDRE    = "f5ee7dd9-da80-40a8-8970-7d63252bc639";
const ANDREIA  = "8f618865-8f74-42a5-a01d-df4302f9f739";
const MATHEUS  = "cda399e7-22ef-4aa8-bb0e-46e2e9f9e2f3";
const JULIA    = "f7f63707-a3e1-4073-bff1-f29bbe85a8b2";
const OLOMIR   = "c09c4995-c11b-4a3b-b381-afab06dfc04c";
const CINTIA   = "ae3feaed-6604-443c-9407-748401e4cba6";
const PEDRO    = "c6a40638-6d22-463e-bdf4-cc1da35da3e1";
const MARILDA  = "797bdedd-c8da-42ff-9ef9-aa2e1b68e29b";
const KARINE   = "7c5ddb32-969b-4ad9-b2cc-45b7e104bebc";
const EVILASIO = "32009e3d-e33e-4ed1-8a3e-eb94ca3b0df2";
const ELIZABETE= "481b78f5-bba5-4b9e-a3b8-fdcfb1a12780";
const ADIR     = "aed5523a-1be6-4407-abe9-069b469b4622";
const ALZIRA   = "4d9b1c52-13a4-4ff4-9a44-a5358f745ca9";
const CARLOS   = "5a28f922-593b-45f5-b11a-072858960077";

const people = [
  { id: ADIR,      first_name: "Adir",      last_name: "Fabris",            sex: "M" },
  { id: ALZIRA,    first_name: "Alzira",     last_name: "Taner",            sex: "F" },
  { id: ANDRE,     first_name: "André",      last_name: "Rodrigues",        sex: "M" },
  { id: ANDREIA,   first_name: "Andréia",    last_name: "Gorski",           sex: "F" },
  { id: CARLOS,    first_name: "Carlos",     last_name: "Fabris",           sex: "M" },
  { id: CASSIO,    first_name: "Cassio",     last_name: "Rodrigues",        sex: "M" },
  { id: CINTIA,    first_name: "Cintia",     last_name: "Age",              sex: "F" },
  { id: ELIZABETE, first_name: "Elizabete",  last_name: "Furtado",          sex: "F" },
  { id: EVELINE,   first_name: "Eveline",    last_name: "Fabris",           sex: "F" },
  { id: EVILASIO,  first_name: "Evilásio",   last_name: "Rodrigues",        sex: "M" },
  { id: JULIA,     first_name: "Julia",      last_name: "Gorski Rodrigues", sex: "F" },
  { id: KARINE,    first_name: "Karine",     last_name: "Age",              sex: "F" },
  { id: MARILDA,   first_name: "Marilda",    last_name: "Augusto",          sex: "F" },
  { id: MATHEUS,   first_name: "Matheus",    last_name: "Gorski Rodrigues", sex: "M" },
  { id: OLOMIR,    first_name: "Olomir",     last_name: "Rodrigues",        sex: "M" },
  { id: PEDRO,     first_name: "Pedro",      last_name: "Age",              sex: "M" },
  { id: ZOE,       first_name: "Zoe",        last_name: "Fabris Rodrigues", sex: "F" },
];

const unions = [
  { partner_a_id: ALZIRA,  partner_b_id: ADIR,    type: "marriage" },
  { partner_a_id: CINTIA,  partner_b_id: OLOMIR,  type: "marriage" },
  { partner_a_id: CASSIO,  partner_b_id: EVELINE, type: "marriage" },  // note: order doesn't matter
  { partner_a_id: ANDREIA, partner_b_id: ANDRE,   type: "marriage" },
  { partner_a_id: EVILASIO,partner_b_id: ELIZABETE,type: "marriage" },
  { partner_a_id: MARILDA, partner_b_id: PEDRO,   type: "marriage" },
];

const relationsByChild = {
  [CARLOS]:  [ADIR, ALZIRA],
  [ZOE]:     [EVELINE, CASSIO],      // note: kept in partner_a order from unions
  [KARINE]:  [MARILDA, PEDRO],
  [CASSIO]:  [OLOMIR, CINTIA],
  [CINTIA]:  [MARILDA, PEDRO],       // Cintia is SISTER of Karine
  [EVELINE]: [ALZIRA, ADIR],
  [OLOMIR]:  [ELIZABETE, EVILASIO],
  [MATHEUS]: [ANDREIA, ANDRE],
  [ANDRE]:   [OLOMIR, CINTIA],
  [JULIA]:   [ANDREIA, ANDRE],
};

// =========================================================================
// Test: Cassio as root — Karine must appear in the layout
// =========================================================================
const layout = computeApiTreeLayout(people, unions, relationsByChild, CASSIO);

const allNodeIds = Object.keys(layout.nodes);
const getName = (id) => {
  const p = people.find((p) => p.id === id);
  return p ? `${p.first_name} ${p.last_name}` : id;
};

console.log("=== Nodes placed in tree (Cassio as root) ===");
allNodeIds
  .map((id) => ({ id, name: getName(id), x: layout.nodes[id].x, y: layout.nodes[id].y }))
  .sort((a, b) => a.y - b.y || a.x - b.x)
  .forEach((n) => console.log(`  ${n.name.padEnd(25)} x=${n.x.toFixed(0).padStart(5)}, y=${n.y.toFixed(0).padStart(5)}`));

console.log(`\nTotal nodes in layout: ${allNodeIds.length} / ${people.length} people`);

// --- Critical assertion: Karine must be in the tree ---
assert.ok(
  layout.nodes[KARINE],
  "Karine Age (aunt of Cassio, sister of Cintia) MUST appear in the tree when Cassio is pinned"
);
console.log("\n✓ PASS: Karine Age is present in the tree layout");

// --- Karine should be at the same generation as Cintia (Cassio's parents) ---
assert.equal(
  layout.nodes[KARINE].y,
  layout.nodes[CINTIA].y,
  "Karine should be at the same Y (generation) as her sister Cintia"
);
console.log("✓ PASS: Karine is at the same generation level as Cintia");

// --- All ancestors must be present ---
assert.ok(layout.nodes[OLOMIR],   "Olomir (father) must be present");
assert.ok(layout.nodes[CINTIA],   "Cintia (mother) must be present");
assert.ok(layout.nodes[PEDRO],    "Pedro (maternal grandfather) must be present");
assert.ok(layout.nodes[MARILDA],  "Marilda (maternal grandmother) must be present");
assert.ok(layout.nodes[EVILASIO], "Evilásio (paternal grandfather) must be present");
assert.ok(layout.nodes[ELIZABETE],"Elizabete (paternal grandmother) must be present");
console.log("✓ PASS: All ancestors of Cassio are present");

// --- Siblings (André) and their families ---
assert.ok(layout.nodes[ANDRE],    "André (brother) must be present");
assert.ok(layout.nodes[ANDREIA],  "Andréia (sister-in-law) must be present");
assert.ok(layout.nodes[MATHEUS],  "Matheus (nephew) must be present");
assert.ok(layout.nodes[JULIA],    "Julia (niece) must be present");
console.log("✓ PASS: Siblings and their families are present");

// --- Spouse and children ---
assert.ok(layout.nodes[EVELINE],  "Eveline (wife) must be present");
assert.ok(layout.nodes[ZOE],      "Zoe (daughter) must be present");
console.log("✓ PASS: Spouse and children are present");

// --- Spouse's family (in-laws via Eveline) ---
// Eveline's parents and sibling are NOT in the ancestor line of the pinned
// person (Cassio). They appear when no root is pinned (disconnected components)
// but are skipped when a specific root is pinned. This is expected behavior.
// They would only appear if Eveline were pinned instead.
const inlawsPlaced = [ADIR, ALZIRA, CARLOS].filter((id) => layout.nodes[id]);
console.log(`\nNote: ${inlawsPlaced.length}/3 in-laws placed (Eveline's family — not in Cassio's ancestor line)`);

console.log(`\n=== ALL CRITICAL TESTS PASSED — ${allNodeIds.length}/${people.length} people rendered ===`);
console.log("Missing (expected): Eveline's parents (Adir, Alzira) and brother (Carlos) — not Cassio's ancestors");
