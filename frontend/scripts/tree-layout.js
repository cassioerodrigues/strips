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

  function sortedPeople(people) {
    return (people || []).slice().sort(function (a, b) {
      const byYear = yearOf(a) - yearOf(b);
      if (byYear !== 0) return byYear;
      const an = ((a.first || "") + " " + (a.last || "")).trim();
      const bn = ((b.first || "") + " " + (b.last || "")).trim();
      return an.localeCompare(bn);
    });
  }

  function generationHint(person) {
    const raw = person && person.generation != null
      ? person.generation
      : person && person.externalIds && person.externalIds.generation != null
        ? person.externalIds.generation
        : person && person.external_ids && person.external_ids.generation != null
          ? person.external_ids.generation
          : null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function unionPartnerIds(union) {
    if (!union) return [];
    const aId = union.partner_a_id || union.partnerAId || union.partner_a || union.partnerA;
    const bId = union.partner_b_id || union.partnerBId || union.partner_b || union.partnerB;
    return aId && bId ? [aId, bId] : [];
  }

  function buildRelationshipIndex(people, unions, relationsByChild) {
    const peopleById = {};
    const childrenByParent = {};
    const parentsByChild = {};
    const partnersById = {};

    (people || []).forEach(function (person) {
      if (!person || !person.id) return;
      peopleById[person.id] = person;
      childrenByParent[person.id] = [];
      parentsByChild[person.id] = [];
      partnersById[person.id] = [];
    });

    Object.entries(relationsByChild || {}).forEach(function (entry) {
      const childId = entry[0];
      if (!peopleById[childId]) return;
      const parentIds = (entry[1] || []).filter(function (id, index, arr) {
        return peopleById[id] && arr.indexOf(id) === index;
      });
      parentsByChild[childId] = parentIds;
      parentIds.forEach(function (parentId) {
        childrenByParent[parentId].push(childId);
      });
    });

    (unions || []).forEach(function (union) {
      const ids = unionPartnerIds(union);
      if (ids.length !== 2 || !peopleById[ids[0]] || !peopleById[ids[1]]) return;
      partnersById[ids[0]].push(ids[1]);
      partnersById[ids[1]].push(ids[0]);
    });

    return {
      peopleById: peopleById,
      childrenByParent: childrenByParent,
      parentsByChild: parentsByChild,
      partnersById: partnersById,
    };
  }

  function deriveGenerationGroups(people, unions, relationsByChild) {
    const sorted = sortedPeople(people);
    const index = buildRelationshipIndex(sorted, unions, relationsByChild);
    const generationById = {};
    const maxGeneration = Math.max(sorted.length - 1, 0);

    function hasKnownParents(id) {
      return (index.parentsByChild[id] || []).length > 0;
    }

    let roots = sorted.filter(function (person) {
      if (hasKnownParents(person.id)) return false;
      return !(index.partnersById[person.id] || []).some(hasKnownParents);
    });
    if (roots.length === 0) {
      roots = sorted.filter(function (person) {
        return !hasKnownParents(person.id);
      });
    }
    if (roots.length === 0) roots = sorted.slice();

    const queue = [];
    function setGeneration(id, generation) {
      if (!index.peopleById[id]) return;
      const next = Math.max(0, Math.min(generation, maxGeneration));
      if (generationById[id] == null || next > generationById[id]) {
        generationById[id] = next;
        queue.push(id);
      }
    }

    roots.forEach(function (person) {
      setGeneration(person.id, 0);
    });

    let guard = 0;
    const guardLimit = Math.max(sorted.length * sorted.length * 2, 1);
    while (queue.length > 0 && guard < guardLimit) {
      guard += 1;
      const id = queue.shift();
      const gen = generationById[id] || 0;
      (index.partnersById[id] || []).forEach(function (partnerId) {
        setGeneration(partnerId, gen);
      });
      (index.childrenByParent[id] || []).forEach(function (childId) {
        setGeneration(childId, gen + 1);
      });
    }

    sorted.forEach(function (person) {
      if (generationById[person.id] != null) return;
      const hint = generationHint(person);
      generationById[person.id] = hint == null ? 0 : Math.max(0, hint - 1);
    });

    const groups = [];
    const byGeneration = {};
    sorted.forEach(function (person) {
      const key = generationById[person.id] || 0;
      if (!byGeneration[key]) {
        byGeneration[key] = { key: "G" + (key + 1), generation: key, people: [] };
        groups.push(byGeneration[key]);
      }
      byGeneration[key].people.push(person);
    });
    groups.sort(function (a, b) {
      return a.generation - b.generation;
    });
    return groups;
  }


  function orderGroupsToReduceCrossings(groups, relationsByChild) {
    const parentIndexById = {};
    return groups.map(function (group) {
      const orderedPeople = group.people.slice().sort(function (a, b) {
        function score(person) {
          const parentIds = (relationsByChild && relationsByChild[person.id]) || [];
          const indices = parentIds
            .map(function (id) { return parentIndexById[id]; })
            .filter(function (value) { return value != null; });
          if (indices.length === 0) return Number.POSITIVE_INFINITY;
          return indices.reduce(function (sum, value) { return sum + value; }, 0) / indices.length;
        }

        const scoreA = score(a);
        const scoreB = score(b);
        if (scoreA !== scoreB) return scoreA - scoreB;

        const byYear = yearOf(a) - yearOf(b);
        if (byYear !== 0) return byYear;
        const an = ((a.first || "") + " " + (a.last || "")).trim();
        const bn = ((b.first || "") + " " + (b.last || "")).trim();
        return an.localeCompare(bn);
      });

      orderedPeople.forEach(function (person, index) {
        parentIndexById[person.id] = index;
      });

      return {
        key: group.key,
        generation: group.generation,
        people: orderedPeople,
      };
    });
  }

  function computeApiTreeLayout(people, unions, relationsByChild) {
    const layout = { nodes: {}, links: [], groups: [] };
    const groups = orderGroupsToReduceCrossings(
      deriveGenerationGroups(people, unions, relationsByChild),
      relationsByChild,
    );
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
      const ids = unionPartnerIds(union);
      const aId = ids[0];
      const bId = ids[1];
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

    const byParents = {};
    Object.entries(relationsByChild || {}).forEach(function (entry) {
      const childId = entry[0];
      const child = layout.nodes[childId];
      const parentIds = (entry[1] || []).filter(function (id, index, arr) {
        return arr.indexOf(id) === index;
      });
      const parents = parentIds.map(function (id) {
        return layout.nodes[id];
      }).filter(Boolean);
      if (!child || parents.length === 0) return;
      const key = parentIds.filter(function (id) {
        return layout.nodes[id];
      }).sort().join("|");
      if (!byParents[key]) byParents[key] = { parents: parents, children: [] };
      byParents[key].children.push(child);
    });

    Object.values(byParents).forEach(function (group) {
      group.children.sort(function (a, b) {
        return a.x - b.x;
      });

      const parentMidX = group.parents.reduce(function (sum, n) {
        return sum + n.x + NODE_W / 2;
      }, 0) / group.parents.length;
      const parentBottomY = Math.max.apply(null, group.parents.map(function (n) {
        return n.y + NODE_H;
      }));
      const parentMidY = Math.max.apply(null, group.parents.map(function (n) {
        return n.y + NODE_H / 2;
      }));
      const childTopY = Math.min.apply(null, group.children.map(function (n) {
        return n.y;
      }));
      if (childTopY <= parentBottomY) return;

      const busY = parentBottomY + (childTopY - parentBottomY) / 2;
      const fromUnion = group.parents.length === 2;
      layout.links.push({
        type: "drop",
        x: parentMidX,
        y1: fromUnion ? parentMidY : parentBottomY,
        y2: busY,
        fromUnion: fromUnion,
      });
      const childXs = group.children.map(function (n) {
        return n.x + NODE_W / 2;
      });
      const busMinX = Math.min.apply(null, [parentMidX].concat(childXs));
      const busMaxX = Math.max.apply(null, [parentMidX].concat(childXs));
      layout.links.push({
        type: "bus",
        x1: busMinX,
        x2: busMaxX,
        y: busY,
      });
      group.children.forEach(function (child) {
        layout.links.push({
          type: "drop",
          x: child.x + NODE_W / 2,
          y1: busY,
          y2: child.y,
          toChild: true,
        });
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
