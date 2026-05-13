// tree-layout.js — helpers puros para posicionar pessoas na tela de árvore.
(function () {
  "use strict";

  const NODE_W = 220;
  const NODE_H = 86;
  const COL_GAP = 90;
  const ROW_GAP = 70;

  function yearOf(person) {
    return person && person.birth && person.birth.year ? person.birth.year : 9999;
  }

  function decadeOf(person) {
    const y = yearOf(person);
    if (y === 9999) return "Sem data";
    return String(Math.floor(y / 10) * 10);
  }

  function sortedPeople(people) {
    return (people || []).slice().sort(function (a, b) {
      const byYear = yearOf(a) - yearOf(b);
      if (byYear !== 0) return byYear;
      const an = ((a.first || "") + " " + (a.last || "")).trim();
      const bn = ((b.first || "") + " " + (b.last || "")).trim();
      return an.localeCompare(bn);
    });
  }

  function groupByDecade(people) {
    const groups = [];
    const byKey = {};
    sortedPeople(people).forEach(function (person) {
      const key = decadeOf(person);
      if (!byKey[key]) {
        byKey[key] = { key: key, people: [] };
        groups.push(byKey[key]);
      }
      byKey[key].people.push(person);
    });
    return groups;
  }

  function computeApiTreeLayout(people, unions, relationsByChild) {
    const layout = { nodes: {}, links: [], groups: [] };
    const groups = groupByDecade(people);
    const maxCols = Math.max.apply(
      null,
      groups.map(function (g) { return Math.max(g.people.length, 1); }).concat([1]),
    );
    const midX = ((maxCols - 1) * (NODE_W + COL_GAP / 2)) / 2;

    groups.forEach(function (group, rowIndex) {
      const rowWidth = (group.people.length - 1) * (NODE_W + COL_GAP / 2);
      const offsetX = midX - rowWidth / 2;
      layout.groups.push({
        key: group.key,
        x: offsetX,
        y: rowIndex * (NODE_H + ROW_GAP),
      });
      group.people.forEach(function (person, colIndex) {
        layout.nodes[person.id] = {
          id: person.id,
          x: offsetX + colIndex * (NODE_W + COL_GAP / 2),
          y: rowIndex * (NODE_H + ROW_GAP),
        };
      });
    });

    (unions || []).forEach(function (union) {
      const aId = union.partner_a_id || union.partnerAId || union.partner_a || union.partnerA;
      const bId = union.partner_b_id || union.partnerBId || union.partner_b || union.partnerB;
      const a = layout.nodes[aId];
      const b = layout.nodes[bId];
      if (!a || !b) return;
      layout.links.push({
        fromX: Math.min(a.x, b.x) + NODE_W,
        fromY: a.y + NODE_H / 2,
        toX: Math.max(a.x, b.x),
        toY: b.y + NODE_H / 2,
        type: "union",
      });
    });

    Object.entries(relationsByChild || {}).forEach(function (entry) {
      const child = layout.nodes[entry[0]];
      const parents = (entry[1] || []).map(function (id) {
        return layout.nodes[id];
      }).filter(Boolean);
      if (!child || parents.length === 0) return;

      const parentMidX = parents.reduce(function (sum, n) {
        return sum + n.x + NODE_W / 2;
      }, 0) / parents.length;
      const parentBottomY = Math.max.apply(null, parents.map(function (n) {
        return n.y + NODE_H;
      }));
      const childTopY = child.y;
      if (childTopY <= parentBottomY) return;

      const busY = parentBottomY + (childTopY - parentBottomY) / 2;
      layout.links.push({ type: "drop", x: parentMidX, y1: parentBottomY, y2: busY });
      layout.links.push({
        type: "bus",
        x1: Math.min(parentMidX, child.x + NODE_W / 2),
        x2: Math.max(parentMidX, child.x + NODE_W / 2),
        y: busY,
      });
      layout.links.push({
        type: "drop",
        x: child.x + NODE_W / 2,
        y1: busY,
        y2: childTopY,
        toChild: true,
      });
    });

    return layout;
  }

  window.treeLayout = {
    NODE_W: NODE_W,
    NODE_H: NODE_H,
    computeApiTreeLayout: computeApiTreeLayout,
  };
})();
