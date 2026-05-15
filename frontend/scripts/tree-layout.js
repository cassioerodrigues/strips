// tree-layout.js — Port of the "relatives-tree" algorithm by SanichKotikov
// (https://github.com/SanichKotikov/relatives-tree) adapted to the Stirps
// data model (people[], unions[], relationsByChild{}).
//
// The algorithm computes layout in abstract grid units then converts to pixels.
// It groups persons into "families" (parent-unit + child-units), positions them
// by expanding from a root person outward in 3 directions (middle, parents,
// children), then corrects overlaps and normalizes coordinates.
(function () {
  "use strict";

  // =========================================================================
  // CONSTANTS
  // =========================================================================
  var NODE_W = 220;
  var NODE_H = 86;

  // Abstract grid size (each node = SIZE units wide, SIZE units tall)
  var SIZE = 2;
  var HALF_SIZE = SIZE / 2;
  var NODES_IN_COUPLE = 2;

  // =========================================================================
  // UTILITY FUNCTIONS
  // =========================================================================
  function prop(name) {
    return function (item) { return item[name]; };
  }

  function withId(id) {
    return function (item) { return item.id === id; };
  }

  function withIds(ids, include) {
    if (include === undefined) include = true;
    return function (item) { return (ids.indexOf(item.id) !== -1) === include; };
  }

  function unique(item, index, arr) {
    return arr.indexOf(item) === index;
  }

  function inAscOrder(v1, v2) { return v1 - v2; }

  function pipe() {
    var fns = Array.prototype.slice.call(arguments);
    return function (init) {
      return fns.reduce(function (res, fn) { return fn(res); }, init);
    };
  }

  function arrMin(arr) {
    return arr.length === 0 ? 0 : Math.min.apply(null, arr);
  }

  function arrMax(arr) {
    return arr.length === 0 ? 0 : Math.max.apply(null, arr);
  }

  function toMap(items) {
    var m = {};
    items.forEach(function (item) {
      m[item.id] = Object.assign({}, item);
    });
    return m;
  }

  function withRelType() {
    var types = Array.prototype.slice.call(arguments);
    return function (item) { return types.indexOf(item.type) !== -1; };
  }

  function byGender(targetGender) {
    return function (a, b) { return b.gender !== targetGender ? -1 : 1; };
  }

  function hasDiffParents(node) {
    return node.parents.map(prop("type")).filter(unique).length > 1;
  }

  // =========================================================================
  // UNIT HELPERS
  // =========================================================================
  function newUnit(fid, nodes, isChild) {
    return {
      fid: fid,
      child: isChild || false,
      nodes: nodes.slice(),
      pos: 0,
    };
  }

  function nodeIds(unit) { return unit.nodes.map(prop("id")); }
  function nodeCount(unit) { return unit.nodes.length; }
  function hasChildrenFn(unit) { return unit.nodes.some(function (n) { return n.children.length > 0; }); }
  function rightSide(unit) { return unit.pos + nodeCount(unit) * SIZE; }
  function sameAs(target) {
    var key = nodeIds(target).join("");
    return function (unit) { return nodeIds(unit).join("") === key; };
  }
  function getUnitX(family, unit) { return family.X + unit.pos; }
  function unitsToNodes(units) {
    var result = [];
    units.forEach(function (u) { u.nodes.forEach(function (n) { result.push(n); }); });
    return result;
  }

  function arrangeInOrder(units) {
    units.forEach(function (unit, idx, self) {
      unit.pos = idx === 0 ? 0 : rightSide(self[idx - 1]);
    });
  }

  function correctUnitsShift(units, shift) {
    units.forEach(function (unit) { unit.pos += shift; });
  }

  // =========================================================================
  // FAMILY HELPERS
  // =========================================================================
  var FAMILY_TYPE_ROOT = "root";
  var FAMILY_TYPE_CHILD = "child";
  var FAMILY_TYPE_PARENT = "parent";

  function newFamily(id, type, main) {
    return {
      id: id,
      type: type,
      main: main || false,
      Y: 0,
      X: 0,
      pid: null, // parent family ID
      cid: null, // child family ID
      parents: [],
      children: [],
    };
  }

  function withFamilyType() {
    var types = Array.prototype.slice.call(arguments);
    return function (item) { return types.indexOf(item.type) !== -1; };
  }

  function widthOf(family) {
    var all = family.parents.concat(family.children);
    return all.length === 0 ? 0 : arrMax(all.map(rightSide));
  }

  function heightOf(family) {
    var rows = [family.parents.length, family.children.length].filter(Boolean).length;
    return rows * SIZE;
  }

  function rightOf(family) { return family.X + widthOf(family); }
  function bottomOf(family) { return family.Y + heightOf(family); }

  function unitNodesCount(units) {
    return units.reduce(function (acc, u) { return acc + nodeCount(u); }, 0);
  }

  function getParentsX(family, unit) {
    return unit ? getUnitX(family, unit) + nodeCount(unit) : 0;
  }

  // =========================================================================
  // setDefaultUnitShift
  // =========================================================================
  function setDefaultUnitShift(family) {
    arrangeInOrder(family.parents);
    arrangeInOrder(family.children);

    // Center the smaller row relative to the larger
    var diff = unitNodesCount(family.parents) - unitNodesCount(family.children);
    if (diff > 0) correctUnitsShift(family.children, diff);
    else if (diff < 0) correctUnitsShift(family.parents, Math.abs(diff));

    var allUnits = family.parents.concat(family.children);
    var start = arrMin(allUnits.map(prop("pos")));
    if (start !== 0) {
      correctUnitsShift(family.parents, -start);
      correctUnitsShift(family.children, -start);
    }
  }

  // =========================================================================
  // arrangeParentsIn
  // =========================================================================
  function calcShifts(units, ids) {
    var result = [];
    units.forEach(function (unit) {
      var index = -1;
      for (var i = 0; i < unit.nodes.length; i++) {
        if (ids.indexOf(unit.nodes[i].id) !== -1) { index = i; break; }
      }
      if (index !== -1) result.push(unit.pos + index * SIZE);
    });
    return result;
  }

  function middleValue(values) {
    if (values.length === 0) return 0;
    var result = (values[0] + values[values.length - 1]) / 2;
    return isNaN(result) ? 0 : result;
  }

  function arrangeParentsIn(family) {
    if (!family.parents.length || family.children.length <= 1) return;
    // Skip multi-parent families — their positioning is handled in createParentFamily
    if (family._multiParent) return;
    family.parents.forEach(function (unit) {
      var ids = unit.nodes[0].children.map(prop("id"));
      unit.pos = Math.floor(
        middleValue(calcShifts(family.children, ids)) - (unitNodesCount(family.parents) - 1)
      );
    });
  }

  // =========================================================================
  // STORE
  // =========================================================================
  function Store(nodes, rootId) {
    var rootNode = null;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === rootId) { rootNode = nodes[i]; break; }
    }
    if (!rootNode) throw new ReferenceError("Root node not found: " + rootId);

    this._nextId = 0;
    this.families = {}; // id -> Family
    this.nodes = toMap(nodes);
    this.root = this.nodes[rootId];
  }

  Store.prototype.getNextId = function () { return ++this._nextId; };
  Store.prototype.getNode = function (id) { return this.nodes[id]; };
  Store.prototype.getNodes = function (ids) {
    var self = this;
    return ids.map(function (id) { return self.nodes[id]; }).filter(Boolean);
  };
  Store.prototype.getFamily = function (id) { return this.families[id]; };

  Object.defineProperty(Store.prototype, "familiesArray", {
    get: function () {
      var self = this;
      return Object.keys(self.families).map(function (k) { return self.families[k]; });
    },
  });

  Object.defineProperty(Store.prototype, "rootFamilies", {
    get: function () {
      return this.familiesArray.filter(withFamilyType(FAMILY_TYPE_ROOT));
    },
  });

  Object.defineProperty(Store.prototype, "rootFamily", {
    get: function () {
      return this.rootFamilies.filter(function (f) { return f.main; })[0] || this.rootFamilies[0];
    },
  });

  // =========================================================================
  // getSpouseNodesFunc
  // =========================================================================
  function getSpouseNodesFunc(store) {
    function getCoupleNodes(target) {
      var spouse = null;
      var married = target.spouses.filter(withRelType("married"))[0];
      if (married) {
        spouse = store.getNode(married.id);
      } else if (target.spouses.length >= 1) {
        var sorted = target.spouses.map(function (r) { return store.getNode(r.id); }).filter(Boolean)
          .sort(function (a, b) { return b.children.length - a.children.length; });
        spouse = sorted[0] || null;
      }
      return [target, spouse].filter(Boolean).sort(byGender(store.root.gender));
    }

    return function (parents) {
      var mid = parents.slice();
      if (mid.length !== NODES_IN_COUPLE) {
        mid = getCoupleNodes(mid[0]);
      }

      var result = { left: [], middle: mid, right: [] };
      if (mid.length === NODES_IN_COUPLE) {
        var first = mid[0], second = mid[1];
        result.left = first.spouses
          .filter(function (r) { return r.id !== second.id; })
          .map(function (r) { return store.getNode(r.id); }).filter(Boolean);
        result.right = second.spouses
          .filter(function (r) { return r.id !== first.id; })
          .map(function (r) { return store.getNode(r.id); }).filter(Boolean);
      }
      return result;
    };
  }

  // =========================================================================
  // createChildUnitsFunc
  // =========================================================================
  function createChildUnitsFunc(store) {
    var getSpouseNodes = getSpouseNodesFunc(store);
    return function (familyId, child) {
      var result = getSpouseNodes([child]);
      var units = [];
      result.left.forEach(function (n) { units.push(newUnit(familyId, [n], true)); });
      units.push(newUnit(familyId, result.middle, true));
      result.right.forEach(function (n) { units.push(newUnit(familyId, [n], true)); });
      return units;
    };
  }

  // =========================================================================
  // MIDDLE DIRECTION
  // =========================================================================
  function createFamilyWithoutParents(store) {
    var family = newFamily(store.getNextId(), FAMILY_TYPE_ROOT, true);
    var createChildUnits = createChildUnitsFunc(store);
    family.children = createChildUnits(family.id, store.root);
    setDefaultUnitShift(family);
    return [family];
  }

  function createFamilyFunc_children(store) {
    var createChildUnits = createChildUnitsFunc(store);

    function getChildUnits(familyId, parents) {
      var first = parents[0], second = parents[1];
      var rels = first.children.filter(function (rel) {
        return !second || second.children.some(withId(rel.id));
      });
      // Sort siblings by birth year (eldest left, youngest right)
      rels.sort(function (a, b) {
        var na = store.getNode(a.id), nb = store.getNode(b.id);
        var ya = (na && na.birthYear) || 9999;
        var yb = (nb && nb.birthYear) || 9999;
        return ya - yb;
      });
      var result = [];
      rels.forEach(function (rel) {
        var node = store.getNode(rel.id);
        if (node) {
          createChildUnits(familyId, node).forEach(function (u) { result.push(u); });
        }
      });
      return result;
    }

    return function (parentIDs, type, isMain) {
      type = type || FAMILY_TYPE_ROOT;
      isMain = isMain || false;
      var family = newFamily(store.getNextId(), type, isMain);
      var parents = store.getNodes(parentIDs).sort(byGender(store.root.gender));
      family.parents = [newUnit(family.id, parents)];
      family.children = getChildUnits(family.id, parents);
      setDefaultUnitShift(family);
      return family;
    };
  }

  function createBloodFamilies(store) {
    var createFamily = createFamilyFunc_children(store);
    var mainFamily = createFamily(store.root.parents.map(prop("id")), FAMILY_TYPE_ROOT, true);
    var parents = unitsToNodes(mainFamily.parents);

    if (parents.length === NODES_IN_COUPLE) {
      var getSpouseNodes = getSpouseNodesFunc(store);
      var spouses = getSpouseNodes(parents);
      var leftFamilies = spouses.left.map(function (node) { return createFamily([node.id]); });
      var rightFamilies = spouses.right.map(function (node) { return createFamily([node.id]); });
      return leftFamilies.concat([mainFamily]).concat(rightFamilies);
    }
    return [mainFamily];
  }

  function createDiffTypeFamilies(store) {
    var createFamily = createFamilyFunc_children(store);
    var bloodParentIDs = store.root.parents.filter(withRelType("blood")).map(prop("id"));
    var adoptedParentIDs = store.root.parents.filter(withRelType("adopted")).map(prop("id"));

    var bloodFamily = createFamily(bloodParentIDs, FAMILY_TYPE_ROOT, true);
    var adoptedFamily = createFamily(adoptedParentIDs);

    // correctOverlaps between blood and adopted
    var bloodChildNodes = unitsToNodes(bloodFamily.children);
    var adoptedChildNodes = unitsToNodes(adoptedFamily.children);
    var sharedIDs = bloodChildNodes
      .filter(function (n) { return adoptedChildNodes.some(withId(n.id)); })
      .map(prop("id"));

    if (sharedIDs.length > 0) {
      var cachePos = bloodFamily.children.map(prop("pos"));
      bloodFamily.children = bloodFamily.children.slice().sort(function (a, b) {
        var foundA = a.nodes.some(withIds(sharedIDs));
        var foundB = b.nodes.some(withIds(sharedIDs));
        if (foundA && !foundB) return 1;
        if (!foundA && foundB) return -1;
        return 0;
      });
      bloodFamily.children.forEach(function (unit, idx) { unit.pos = cachePos[idx]; });
      adoptedFamily.children = adoptedFamily.children.filter(function (unit) {
        return unit.nodes.some(withIds(sharedIDs, false));
      });
      setDefaultUnitShift(adoptedFamily);
    }

    return [bloodFamily, adoptedFamily];
  }

  function inMiddleDirection(store) {
    var families;
    if (store.root.parents.length) {
      families = hasDiffParents(store.root)
        ? createDiffTypeFamilies(store)
        : createBloodFamilies(store);
    } else {
      families = createFamilyWithoutParents(store);
    }

    // arrange families left to right
    for (var i = 1; i < families.length; i++) {
      families[i].X = rightOf(families[i - 1]);
    }

    families.forEach(function (family) {
      store.families[family.id] = family;
    });

    return store;
  }

  // =========================================================================
  // CHILDREN DIRECTION
  // =========================================================================
  function inChildDirection(store) {
    var createFamily = createFamilyFunc_children(store);

    function updateFamily(family, parentUnit) {
      var parentFamily = store.getFamily(parentUnit.fid);
      family.pid = parentFamily.id;
      family.Y = parentFamily.Y + heightOf(parentFamily) - SIZE;
      family.X = getUnitX(parentFamily, parentUnit);
    }

    function arrangeNextFamily(family, nextFamily, right) {
      var unit = family.parents[0];
      var index = -1;
      for (var i = 0; i < nextFamily.children.length; i++) {
        if (sameAs(unit)(nextFamily.children[i])) { index = i; break; }
      }
      if (index < 0) return;

      if (index === 0) {
        nextFamily.X = getUnitX(family, unit) - nextFamily.children[index].pos;
      } else {
        nextFamily.children[index].pos = getUnitX(family, unit) - nextFamily.X;
      }

      var nextIdx = index + 1;
      if (nextFamily.children[nextIdx]) {
        var shift = right - getUnitX(nextFamily, nextFamily.children[nextIdx]);
        // In multi-parent families, add extra spacing between sibling subtrees
        // so their connector buses don't overlap horizontally.
        if (nextFamily._multiParent && shift >= 0 && shift < 2 * SIZE) shift = 2 * SIZE;
        correctUnitsShift(nextFamily.children.slice(nextIdx), shift);
      }
    }

    function arrangeMiddleFamilies(rootFams, fid, startFrom) {
      var startIdx = -1;
      for (var i = 0; i < rootFams.length; i++) {
        if (rootFams[i].id === fid) { startIdx = i + 1; break; }
      }
      if (startIdx < 0 || startIdx >= rootFams.length) return;
      var shift = startFrom - rootFams[startIdx].X;
      for (var j = startIdx; j < rootFams.length; j++) {
        rootFams[j].X += shift;
      }
    }

    function arrangeFamilies(family) {
      var right = 0;
      while (family.pid) {
        right = Math.max(right, rightOf(family));
        var nextFamily = store.getFamily(family.pid);
        arrangeNextFamily(family, nextFamily, right);
        arrangeParentsIn(nextFamily);

        if (!nextFamily.pid) {
          arrangeMiddleFamilies(
            store.rootFamilies,
            nextFamily.id,
            Math.max(right, rightOf(nextFamily))
          );
        }
        family = nextFamily;
      }
    }

    function getUnitsWithChildren(family) {
      return family.children.filter(hasChildrenFn).reverse();
    }

    store.familiesArray.filter(withFamilyType(FAMILY_TYPE_ROOT)).forEach(function (rootFamily) {
      var stack = getUnitsWithChildren(rootFamily);
      while (stack.length) {
        var parentUnit = stack.pop();
        var family = createFamily(nodeIds(parentUnit), FAMILY_TYPE_CHILD);
        updateFamily(family, parentUnit);
        arrangeFamilies(family);
        store.families[family.id] = family;
        stack = stack.concat(getUnitsWithChildren(family));
      }
    });

    // Expand children of ancestor siblings placed in PARENT families
    store.familiesArray.filter(withFamilyType(FAMILY_TYPE_PARENT)).forEach(function (parentFamily) {
      var siblingUnits = parentFamily.children.filter(function (unit) {
        return !unit._isAncestorLink && hasChildrenFn(unit);
      }).reverse();

      var stack = siblingUnits;
      while (stack.length) {
        var parentUnit = stack.pop();
        var family = createFamily(nodeIds(parentUnit), FAMILY_TYPE_CHILD);
        updateFamily(family, parentUnit);
        arrangeFamilies(family);
        store.families[family.id] = family;
        stack = stack.concat(getUnitsWithChildren(family));
      }
    });

    return store;
  }

  // =========================================================================
  // PARENTS DIRECTION
  // =========================================================================
  function inParentDirection(store) {
    function createParentFamily(childIDs) {
      var createChildUnits = createChildUnitsFunc(store);
      var family = newFamily(store.getNextId(), FAMILY_TYPE_PARENT);

      // Get parent units for each ancestor in childIDs
      var childNodes = store.getNodes(childIDs);
      var parentUnits = [];
      childNodes.forEach(function (child) {
        var parentNodes = store.getNodes(child.parents.map(prop("id"))).sort(byGender(store.root.gender));
        if (parentNodes.length) parentUnits.push(newUnit(family.id, parentNodes));
      });
      family.parents = parentUnits;

      // Collect ALL children of ALL parent units (ancestors + their siblings)
      var allChildIdSet = {};
      parentUnits.forEach(function (pUnit) {
        pUnit.nodes.forEach(function (parentNode) {
          parentNode.children.forEach(function (rel) {
            allChildIdSet[rel.id] = true;
          });
        });
      });

      // Create child units: ancestors first (keeps children[0] as link unit)
      var placedIds = {};
      var childUnitsResult = [];

      childIDs.forEach(function (id) {
        if (placedIds[id]) return;
        var node = store.getNode(id);
        if (!node) return;
        var units = createChildUnits(family.id, node);
        units.forEach(function (u) {
          u.nodes.forEach(function (n) { placedIds[n.id] = true; });
          u._isAncestorLink = true;
          childUnitsResult.push(u);
        });
      });

      // Then place siblings of ancestors sorted by birth year
      var siblingIds = Object.keys(allChildIdSet).filter(function (id) {
        return !placedIds[id];
      });
      siblingIds.sort(function (a, b) {
        var na = store.getNode(a), nb = store.getNode(b);
        var ya = (na && na.birthYear) || 9999;
        var yb = (nb && nb.birthYear) || 9999;
        return ya - yb;
      });
      siblingIds.forEach(function (childId) {
        if (placedIds[childId]) return;
        var node = store.getNode(childId);
        if (!node) return;
        var units = createChildUnits(family.id, node);
        units.forEach(function (u) {
          u.nodes.forEach(function (n) { placedIds[n.id] = true; });
          childUnitsResult.push(u);
        });
      });

      // ---------------------------------------------------------------
      // For multi-parent families: position siblings so that each
      // grandparent couple's bus stays on its own side (no crossing).
      //
      // Rule: the ancestor link (Olomir+Cintia) is on the MAIN branch.
      //   • Paternal ancestor (left of couple / parentUnits[0]):
      //       their siblings go to the LEFT of the ancestor link.
      //   • Maternal ancestor (right of couple / parentUnits[1]):
      //       their siblings go to the RIGHT of the ancestor link.
      //
      // Layout: [paternal siblings] [ancestor link] [maternal siblings]
      // Then each parent unit is centred above its children group.
      // ---------------------------------------------------------------
      family.children = childUnitsResult;

      if (parentUnits.length > 1) {
        // Build lookup: childId → owning parent unit index
        var childOwner = {};
        parentUnits.forEach(function (pUnit, pIdx) {
          pUnit.nodes.forEach(function (pn) {
            pn.children.forEach(function (rel) { childOwner[rel.id] = pIdx; });
          });
        });

        // Separate siblings into paternal (unit 0) and maternal (unit 1+)
        var ancestorUnit = family.children[0]; // always the ancestor link
        var paternalSiblings = [];
        var maternalSiblings = [];

        for (var ci = 1; ci < family.children.length; ci++) {
          var cUnit = family.children[ci];
          var owner = -1;
          for (var si = 0; si < cUnit.nodes.length; si++) {
            if (childOwner[cUnit.nodes[si].id] !== undefined) {
              owner = childOwner[cUnit.nodes[si].id];
              break;
            }
          }
          if (owner === 0) paternalSiblings.push(cUnit);
          else maternalSiblings.push(cUnit);
        }

        // Position children: [paternal siblings] [ancestor link] [maternal siblings]
        var pos = 0;
        paternalSiblings.forEach(function (u) { u.pos = pos; pos += nodeCount(u) * SIZE; });
        ancestorUnit.pos = pos; pos += nodeCount(ancestorUnit) * SIZE;
        maternalSiblings.forEach(function (u) { u.pos = pos; pos += nodeCount(u) * SIZE; });

        // Position each parent unit centred above its own children
        parentUnits.forEach(function (pUnit) {
          var pChildIds = {};
          pUnit.nodes.forEach(function (pn) {
            pn.children.forEach(function (rel) { pChildIds[rel.id] = true; });
          });

          var positions = [];
          family.children.forEach(function (cUnit) {
            cUnit.nodes.forEach(function (n, nIdx) {
              if (pChildIds[n.id]) positions.push(cUnit.pos + nIdx * SIZE);
            });
          });

          if (positions.length > 0) {
            positions.sort(inAscOrder);
            var mid = (positions[0] + positions[positions.length - 1]) / 2;
            var parentWidth = nodeCount(pUnit) * SIZE;
            pUnit.pos = Math.round(mid - parentWidth / 2 + HALF_SIZE);
          }
        });

        // Ensure parent units don't overlap
        family.parents.sort(function (a, b) { return a.pos - b.pos; });
        for (var pi = 1; pi < family.parents.length; pi++) {
          var minPos = family.parents[pi - 1].pos + nodeCount(family.parents[pi - 1]) * SIZE;
          if (family.parents[pi].pos < minPos) {
            family.parents[pi].pos = minPos;
          }
        }

        // Normalize: no negative positions
        var allUnits = family.parents.concat(family.children);
        var minStart = arrMin(allUnits.map(prop("pos")));
        if (minStart !== 0) {
          correctUnitsShift(family.parents, -minStart);
          correctUnitsShift(family.children, -minStart);
        }

        // Reorder children array to match spatial order (by pos).
        // This ensures arrangeNextFamily's slice(nextIdx) targets correct side.
        family.children = paternalSiblings.concat([ancestorUnit]).concat(maternalSiblings);
        family._multiParent = true;
      } else {
        setDefaultUnitShift(family);
      }

      return family;
    }

    function updateFamily(family, childUnit) {
      var childFamily = store.getFamily(childUnit.fid);
      family.cid = childFamily.id;
      family.Y = childFamily.Y - SIZE;
      family.X = getUnitX(childFamily, childUnit);
    }

    function arrangeNextFamily(family, nextFamily, right) {
      var unit = family.children[0];
      var index = -1;
      for (var i = 0; i < nextFamily.parents.length; i++) {
        if (sameAs(unit)(nextFamily.parents[i])) { index = i; break; }
      }
      if (index < 0) return;

      if (index === 0 && nextFamily.parents[index].pos === 0) {
        nextFamily.X = getUnitX(family, unit);
      } else {
        nextFamily.parents[index].pos = getUnitX(family, unit) - nextFamily.X;
      }

      var nextIdx = index + 1;
      if (nextFamily.parents[nextIdx]) {
        var shift = right - getUnitX(nextFamily, nextFamily.parents[nextIdx]);
        correctUnitsShift(nextFamily.parents.slice(nextIdx), shift);
      }
    }

    function arrangeFamilies(family) {
      var right = 0;
      while (family.cid) {
        right = Math.max(right, rightOf(family));
        var nextFamily = store.getFamily(family.cid);

        // Find the ancestor link unit (may not be at index 0 in multi-parent families)
        var unit = null;
        var unitIdx = 0;
        for (var k = 0; k < family.children.length; k++) {
          if (family.children[k]._isAncestorLink) { unit = family.children[k]; unitIdx = k; break; }
        }
        if (!unit) { unit = family.children[0]; unitIdx = 0; }

        var oldPos = unit.pos;

        if (!nextFamily.cid) {
          // Is root family - center child unit under parents
          unit.pos = (widthOf(family) - nodeCount(unit) * SIZE) / 2;
        } else {
          if (family.parents.length === 2 && unitNodesCount(family.parents) > 2) {
            unit.pos = Math.floor(family.parents[1].pos / 2);
          }
          arrangeNextFamily(family, nextFamily, right);
        }

        // Keep sibling units aligned when ancestor link unit shifts
        var delta = unit.pos - oldPos;
        if (delta !== 0 && family.children.length > 1) {
          for (var ci = 0; ci < family.children.length; ci++) {
            if (ci !== unitIdx) family.children[ci].pos += delta;
          }
        }

        family = nextFamily;
      }
    }

    function getParentUnitsWithParents(family) {
      return family.parents.filter(function (unit) {
        return unit.nodes.some(function (node) { return node.parents.length > 0; });
      });
    }

    var rootFamily = store.rootFamily;
    if (!rootFamily) return store;

    var stack = getParentUnitsWithParents(rootFamily);
    while (stack.length) {
      var childUnit = stack.pop();
      var family = createParentFamily(nodeIds(childUnit));
      updateFamily(family, childUnit);
      arrangeFamilies(family);
      store.families[family.id] = family;
      stack = stack.concat(getParentUnitsWithParents(family).reverse());
    }

    return store;
  }

  // =========================================================================
  // CORRECT POSITIONS (normalize to 0,0)
  // =========================================================================
  function correctPositions(store) {
    var families = store.familiesArray;
    var rootFamily = store.rootFamily;

    // Align generations: shift child/root families so that parent row aligns
    if (rootFamily) {
      var parentFam = null;
      for (var i = 0; i < families.length; i++) {
        if (families[i].cid === rootFamily.id) { parentFam = families[i]; break; }
      }
      if (parentFam && parentFam.children[0] && rootFamily.parents[0]) {
        // Find the ancestor link unit (connects parent family to root family)
        var anchorUnit = null;
        for (var ai = 0; ai < parentFam.children.length; ai++) {
          if (parentFam.children[ai]._isAncestorLink) { anchorUnit = parentFam.children[ai]; break; }
        }
        if (!anchorUnit) anchorUnit = parentFam.children[0];
        var shift = getUnitX(parentFam, anchorUnit) - getUnitX(rootFamily, rootFamily.parents[0]);
        families.filter(withFamilyType(FAMILY_TYPE_CHILD, FAMILY_TYPE_ROOT)).forEach(function (f) {
          f.X += shift;
        });
      }
    }

    // Normalize X
    var minX = arrMin(families.map(prop("X")));
    if (minX !== 0) families.forEach(function (f) { f.X += -minX; });

    // Normalize Y
    var minY = arrMin(families.map(prop("Y")));
    if (minY !== 0) families.forEach(function (f) { f.Y += -minY; });

    return store;
  }

  // =========================================================================
  // GET EXTENDED NODES (extract positions for each person)
  // =========================================================================
  function getExtendedNodes(families) {
    var result = [];
    families.forEach(function (family) {
      // Parent nodes (only for root and parent families)
      if (family.type === FAMILY_TYPE_ROOT || family.type === FAMILY_TYPE_PARENT) {
        family.parents.forEach(function (unit) {
          unit.nodes.forEach(function (node, idx) {
            result.push({
              id: node.id,
              top: family.Y,
              left: getUnitX(family, unit) + idx * SIZE,
            });
          });
        });
      }
      // Child nodes (for root, child, AND parent families — parent families
      // now include siblings of ancestors alongside the direct ancestor link)
      if (family.type === FAMILY_TYPE_ROOT || family.type === FAMILY_TYPE_CHILD || family.type === FAMILY_TYPE_PARENT) {
        family.children.forEach(function (unit) {
          var topOffset = unit.child && family.parents.length > 0 ? SIZE : 0;
          unit.nodes.forEach(function (node, idx) {
            result.push({
              id: node.id,
              top: family.Y + topOffset,
              left: getUnitX(family, unit) + idx * SIZE,
            });
          });
        });
      }
    });
    return result;
  }

  // =========================================================================
  // CONNECTORS
  // =========================================================================
  function calcConnectors(families) {
    var connectors = [];

    // Middle connectors (between spouses in root families)
    var rootFamilies = families.filter(withFamilyType(FAMILY_TYPE_ROOT));
    rootFamilies.forEach(function (family) {
      family.parents.forEach(function (unit) {
        var pX = getUnitX(family, unit) + HALF_SIZE;
        var pY = family.Y + HALF_SIZE;
        if (nodeCount(unit) === NODES_IN_COUPLE) {
          connectors.push([pX, pY, pX + SIZE, pY]);
        } else if (nodeCount(unit) === 1 && unit.nodes[0].spouses.length) {
          rootFamilies.forEach(function (other) {
            if (other.id === family.id) return;
            other.parents.forEach(function (parent) {
              if (parent.nodes.some(withId(unit.nodes[0].spouses[0].id))) {
                var xs = [pX, getUnitX(other, parent) + HALF_SIZE].sort(inAscOrder);
                connectors.push([xs[0], pY, xs[1], pY]);
              }
            });
          });
        }
      });
    });

    // Parent connectors
    families.filter(withFamilyType(FAMILY_TYPE_PARENT)).forEach(function (family) {
      family.parents.forEach(function (unit) {
        var pX = getParentsX(family, unit);
        var pY = family.Y + HALF_SIZE;
        var mY = family.Y + SIZE;

        if (nodeCount(unit) === NODES_IN_COUPLE) {
          connectors.push([pX - HALF_SIZE, pY, pX + HALF_SIZE, pY]);
        }
        connectors.push([pX, pY, pX, mY]);

        var child = family.children[0];
        if (!child) return;
        var childIDs = unit.nodes.reduce(function (acc, n) {
          return acc.concat(n.children.map(prop("id")));
        }, []);
        var cIdx = -1;
        for (var i = 0; i < child.nodes.length; i++) {
          if (childIDs.indexOf(child.nodes[i].id) !== -1) { cIdx = i; break; }
        }
        if (cIdx >= 0) {
          var cX = getUnitX(family, child) + cIdx * SIZE + HALF_SIZE;
          connectors.push([cX, mY, cX, mY + HALF_SIZE]);
          if (pX !== cX) connectors.push([Math.min(pX, cX), mY, Math.max(pX, cX), mY]);
        }
      });
    });

    // Children connectors
    families.filter(withFamilyType(FAMILY_TYPE_ROOT, FAMILY_TYPE_CHILD)).forEach(function (family) {
      var parent = family.parents[0];
      var pX = getParentsX(family, parent);
      var mY = family.Y + (parent ? SIZE : 0);

      if (parent && parent.nodes.every(function (n) { return n.children.length > 0; })) {
        var pY = family.Y + HALF_SIZE;
        connectors.push([pX, pY, pX, mY]);
      }

      var parentIds = family.parents.reduce(function (acc, u) {
        return acc.concat(nodeIds(u));
      }, []);
      var positions = [];

      family.children.forEach(function (unit) {
        var left = getUnitX(family, unit) + HALF_SIZE;

        unit.nodes.forEach(function (node, index) {
          if (node.parents.some(withIds(parentIds))) {
            var nX = left + index * SIZE;
            positions.push(nX);
            connectors.push([nX, mY, nX, mY + HALF_SIZE]);
          }
        });

        if (nodeCount(unit) === NODES_IN_COUPLE) {
          connectors.push([left, mY + HALF_SIZE, left + SIZE, mY + HALF_SIZE]);
        } else if (nodeCount(unit) === 1 && unit.nodes[0].spouses.length) {
          family.children.forEach(function (nUnit) {
            if (nUnit.nodes.some(withId(unit.nodes[0].spouses[0].id))) {
              var xs = [left, getUnitX(family, nUnit) + HALF_SIZE].sort(inAscOrder);
              connectors.push([xs[0], mY + HALF_SIZE, xs[1], mY + HALF_SIZE]);
            }
          });
        }
      });

      if (positions.length > 1) {
        connectors.push([arrMin(positions), mY, arrMax(positions), mY]);
      } else if (positions.length === 1 && pX !== positions[0]) {
        connectors.push([Math.min(pX, positions[0]), mY, Math.max(pX, positions[0]), mY]);
      }
    });

    return connectors;
  }

  // =========================================================================
  // CANVAS SIZE
  // =========================================================================
  function getCanvasSize(families) {
    return {
      width: arrMax(families.map(rightOf)),
      height: arrMax(families.map(bottomOf)),
    };
  }

  // =========================================================================
  // MAIN: calcTree (the full pipeline)
  // =========================================================================
  var calcFamilies = pipe(inMiddleDirection, inParentDirection, inChildDirection, correctPositions);

  function calcTree(nodes, rootId) {
    var store = new Store(nodes, rootId);
    var families = calcFamilies(store).familiesArray;
    return {
      families: families,
      canvas: getCanvasSize(families),
      nodes: getExtendedNodes(families),
      connectors: calcConnectors(families),
    };
  }

  // =========================================================================
  // DATA CONVERSION: Stirps API format → relatives-tree Node format
  // =========================================================================
  function convertToRelativesTreeNodes(people, unions, relationsByChild) {
    var nodesById = {};

    // Initialize nodes
    (people || []).forEach(function (person) {
      if (!person || !person.id) return;
      nodesById[person.id] = {
        id: person.id,
        gender: person.sex === "F" ? "female" : "male",
        birthYear: person.birth_year || person.birthYear || (person.birth && person.birth.year) || null,
        parents: [],
        children: [],
        siblings: [],
        spouses: [],
      };
    });

    // Fill parents relation
    Object.keys(relationsByChild || {}).forEach(function (childId) {
      if (!nodesById[childId]) return;
      var parentIds = (relationsByChild[childId] || []).filter(function (id) {
        return !!nodesById[id];
      });
      nodesById[childId].parents = parentIds.map(function (id) {
        return { id: id, type: "blood" };
      });
    });

    // Fill children relation (derived from parents)
    Object.keys(relationsByChild || {}).forEach(function (childId) {
      if (!nodesById[childId]) return;
      var parentIds = (relationsByChild[childId] || []).filter(function (id) {
        return !!nodesById[id];
      });
      parentIds.forEach(function (parentId) {
        if (!nodesById[parentId]) return;
        var existing = nodesById[parentId].children;
        if (!existing.some(function (r) { return r.id === childId; })) {
          existing.push({ id: childId, type: "blood" });
        }
      });
    });

    // Fill spouses from unions
    (unions || []).forEach(function (union) {
      var aId = union.partner_a_id || union.partnerAId || union.partner_a || union.partnerA;
      var bId = union.partner_b_id || union.partnerBId || union.partner_b || union.partnerB;
      if (!aId || !bId || !nodesById[aId] || !nodesById[bId]) return;
      var type = union.type === "divorced" ? "divorced" : "married";
      if (!nodesById[aId].spouses.some(function (r) { return r.id === bId; })) {
        nodesById[aId].spouses.push({ id: bId, type: type });
      }
      if (!nodesById[bId].spouses.some(function (r) { return r.id === aId; })) {
        nodesById[bId].spouses.push({ id: aId, type: type });
      }
    });

    // Fill siblings (persons sharing at least one parent)
    var childrenByParent = {};
    Object.keys(relationsByChild || {}).forEach(function (childId) {
      (relationsByChild[childId] || []).forEach(function (parentId) {
        if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
        if (childrenByParent[parentId].indexOf(childId) === -1) {
          childrenByParent[parentId].push(childId);
        }
      });
    });
    Object.keys(nodesById).forEach(function (personId) {
      var siblingSet = {};
      var parentIds = (relationsByChild[personId] || []);
      parentIds.forEach(function (parentId) {
        (childrenByParent[parentId] || []).forEach(function (sibId) {
          if (sibId !== personId && nodesById[sibId]) siblingSet[sibId] = true;
        });
      });
      nodesById[personId].siblings = Object.keys(siblingSet).map(function (id) {
        var sibParents = relationsByChild[id] || [];
        var sharedParents = parentIds.filter(function (p) { return sibParents.indexOf(p) !== -1; });
        var type = (sharedParents.length < parentIds.length || sharedParents.length < sibParents.length)
          ? "half" : "blood";
        return { id: id, type: type };
      });
    });

    return Object.keys(nodesById).map(function (id) { return nodesById[id]; });
  }

  // =========================================================================
  // Choose root: pick the person closest to the center of the graph
  // Heuristic: prefer person with both parents and children, else most connections
  // =========================================================================
  function chooseRootId(nodes) {
    if (!nodes || nodes.length === 0) return null;

    var best = null;
    var bestScore = -1;

    nodes.forEach(function (node) {
      var score = 0;
      // Prefer nodes with parents AND children (middle generation)
      if (node.parents.length > 0 && node.children.length > 0) score += 100;
      // Prefer nodes with spouses
      if (node.spouses.length > 0) score += 50;
      // More connections = better center
      score += node.parents.length + node.children.length + node.spouses.length + node.siblings.length;

      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    });

    return best ? best.id : nodes[0].id;
  }

  // =========================================================================
  // PUBLIC API: computeApiTreeLayout
  // Maintains the same interface expected by tree.jsx:
  //   { nodes: { [id]: { id, x, y } }, links: [...], groups: [] }
  // =========================================================================
  function computeApiTreeLayout(people, unions, relationsByChild, optRootId) {
    var layout = { nodes: {}, links: [], groups: [] };

    if (!people || people.length === 0) return layout;

    // Convert to relatives-tree format
    var rtNodes = convertToRelativesTreeNodes(people, unions, relationsByChild);
    if (rtNodes.length === 0) return layout;

    // Choose root: use provided rootId if valid, otherwise heuristic
    var rootId;
    if (optRootId && rtNodes.some(function (n) { return n.id === optRootId; })) {
      rootId = optRootId;
    } else {
      rootId = chooseRootId(rtNodes);
    }
    if (!rootId) return layout;

    // Run the algorithm
    var result;
    try {
      result = calcTree(rtNodes, rootId);
    } catch (e) {
      // Fallback: if the algorithm fails, use simple grid layout
      console.warn("[tree-layout] relatives-tree algorithm failed, using fallback:", e);
      return computeFallbackLayout(people, unions, relationsByChild);
    }

    // Convert abstract grid positions to pixel positions
    // Each unit in the grid corresponds to half a node dimension
    // Add gaps between nodes for connector space
    var COL_GAP = 60;
    var ROW_GAP = 70;
    var UNIT_X = (NODE_W + COL_GAP) / 2;
    var UNIT_Y = (NODE_H + ROW_GAP) / 2;

    // De-duplicate nodes (a node may appear in multiple families)
    var seenNodes = {};
    result.nodes.forEach(function (extNode) {
      if (seenNodes[extNode.id]) return;
      seenNodes[extNode.id] = true;
      layout.nodes[extNode.id] = {
        id: extNode.id,
        x: extNode.left * UNIT_X,
        y: extNode.top * UNIT_Y,
      };
    });

    // Collect ALL families from main tree and disconnected components
    var allFamilies = result.families.slice();

    // Handle disconnected components: nodes not reached from root
    // When a specific root is pinned, skip disconnected components
    // (e.g. in-law parents should not appear when viewing from the other side)
    var unplacedNodes = rtNodes.filter(function (n) { return !layout.nodes[n.id]; });
    if (unplacedNodes.length > 0 && !optRootId) {
      // Find max X of already placed nodes for offset
      var maxPlacedX = 0;
      Object.keys(layout.nodes).forEach(function (id) {
        var nx = layout.nodes[id].x + NODE_W;
        if (nx > maxPlacedX) maxPlacedX = nx;
      });
      var componentOffset = maxPlacedX + COL_GAP;

      // Process each disconnected component
      while (unplacedNodes.length > 0) {
        var componentRoot = chooseRootId(unplacedNodes);
        var componentResult;
        try {
          componentResult = calcTree(unplacedNodes, componentRoot);
        } catch (e) {
          // If it fails, just place linearly
          unplacedNodes.forEach(function (n, idx) {
            layout.nodes[n.id] = {
              id: n.id,
              x: componentOffset + idx * (NODE_W + COL_GAP),
              y: 0,
            };
          });
          break;
        }

        var componentPlaced = {};
        componentResult.nodes.forEach(function (extNode) {
          if (componentPlaced[extNode.id]) return;
          componentPlaced[extNode.id] = true;
          layout.nodes[extNode.id] = {
            id: extNode.id,
            x: extNode.left * UNIT_X + componentOffset,
            y: extNode.top * UNIT_Y,
          };
        });

        // Collect component families (will generate links once at the end)
        allFamilies = allFamilies.concat(componentResult.families);

        // Update offset for next component
        var compMaxX = 0;
        Object.keys(componentPlaced).forEach(function (id) {
          var nx = layout.nodes[id].x + NODE_W;
          if (nx > compMaxX) compMaxX = nx;
        });
        componentOffset = compMaxX + COL_GAP;

        // Remove placed nodes
        unplacedNodes = unplacedNodes.filter(function (n) { return !componentPlaced[n.id]; });
      }
    }

    // Resolve any node overlaps by pushing right
    resolveNodeOverlaps(layout.nodes, NODE_W, COL_GAP);

    // Generate links from ALL families at once (single drawnUnions map prevents duplicates)
    generateLinksFromFamilies(allFamilies, layout.nodes, unions, UNIT_X, UNIT_Y, layout.links);

    return layout;
  }

  // =========================================================================
  // RESOLVE NODE OVERLAPS
  // Post-processing step: detects nodes that overlap within the same
  // generation row and pushes everything to the right of the overlap point
  // further right.  This guarantees a minimum gap of COL_GAP between every
  // pair of adjacent nodes on the same row.
  // =========================================================================
  function resolveNodeOverlaps(nodes, nodeW, minGap) {
    var nodeArr = Object.values(nodes);
    if (nodeArr.length < 2) return;

    // Group by Y (generation row)
    var rowMap = {};
    nodeArr.forEach(function (n) {
      var key = Math.round(n.y);
      if (!rowMap[key]) rowMap[key] = [];
      rowMap[key].push(n);
    });

    var rowYs = Object.keys(rowMap).map(Number).sort(function (a, b) { return a - b; });

    // Iterate until no overlaps remain (max 20 passes as safety net)
    for (var pass = 0; pass < 20; pass++) {
      var foundOverlap = false;

      for (var ri = 0; ri < rowYs.length; ri++) {
        var row = rowMap[rowYs[ri]].sort(function (a, b) { return a.x - b.x; });

        for (var i = 1; i < row.length; i++) {
          var requiredX = row[i - 1].x + nodeW + minGap;
          if (row[i].x < requiredX) {
            var shift = requiredX - row[i].x;
            var cutoff = row[i].x;

            // Protect nodes to the left of the overlap in this row
            var leftInRow = {};
            for (var j = 0; j < i; j++) leftInRow[row[j].id] = true;

            // Shift the right group: everything at x >= cutoff except the left group
            nodeArr.forEach(function (n) {
              if (leftInRow[n.id]) return;
              if (n.x >= cutoff) n.x += shift;
            });

            foundOverlap = true;
            break;
          }
        }
        if (foundOverlap) break;
      }
      if (!foundOverlap) break;
    }
  }

  // =========================================================================
  // LINK GENERATION from family structure
  // Produces links with proper semantic properties for tree.jsx rendering
  // =========================================================================
  function generateLinksFromFamilies(families, layoutNodes, unions, UNIT_X, UNIT_Y, links) {
    // Build union lookup
    var unionPairs = {};
    (unions || []).forEach(function (union) {
      var aId = union.partner_a_id || union.partnerAId || union.partner_a || union.partnerA;
      var bId = union.partner_b_id || union.partnerBId || union.partner_b || union.partnerB;
      if (aId && bId) {
        unionPairs[aId + "|" + bId] = true;
        unionPairs[bId + "|" + aId] = true;
      }
    });

    // Track which union pairs we've already drawn
    var drawnUnions = {};

    families.forEach(function (family) {
      // Draw union/spouse links from parent units
      family.parents.forEach(function (unit) {
        if (nodeCount(unit) === NODES_IN_COUPLE) {
          var n1 = unit.nodes[0], n2 = unit.nodes[1];
          var pos1 = layoutNodes[n1.id], pos2 = layoutNodes[n2.id];
          if (pos1 && pos2) {
            var key = [n1.id, n2.id].sort().join("|");
            if (!drawnUnions[key]) {
              drawnUnions[key] = true;
              links.push({
                type: "union",
                fromX: Math.min(pos1.x, pos2.x) + NODE_W,
                fromY: pos1.y + NODE_H / 2,
                toX: Math.max(pos1.x, pos2.x),
                toY: pos2.y + NODE_H / 2,
              });
            }
          }
        }
      });

      // Draw child units spouse links
      family.children.forEach(function (unit) {
        if (nodeCount(unit) === NODES_IN_COUPLE) {
          var n1 = unit.nodes[0], n2 = unit.nodes[1];
          var pos1 = layoutNodes[n1.id], pos2 = layoutNodes[n2.id];
          if (pos1 && pos2) {
            var key = [n1.id, n2.id].sort().join("|");
            if (!drawnUnions[key]) {
              drawnUnions[key] = true;
              links.push({
                type: "union",
                fromX: Math.min(pos1.x, pos2.x) + NODE_W,
                fromY: pos1.y + NODE_H / 2,
                toX: Math.max(pos1.x, pos2.x),
                toY: pos2.y + NODE_H / 2,
              });
            }
          }
        }
      });

      // Draw parent-to-children connections for ALL family types
      if (family.parents.length > 0 && family.children.length > 0) {
        // Iterate over each parent unit (PARENT families can have multiple)
        family.parents.forEach(function (parentUnit) {
          if (!parentUnit || !parentUnit.nodes.length) return;

          // Find parent nodes positions
          var parentPositions = parentUnit.nodes.map(function (n) { return layoutNodes[n.id]; }).filter(Boolean);
          if (parentPositions.length === 0) return;

          var parentMidX = parentPositions.reduce(function (s, p) { return s + p.x + NODE_W / 2; }, 0) / parentPositions.length;
          var parentMidY = parentPositions[0].y + NODE_H / 2;
          var parentBottomY = parentPositions[0].y + NODE_H;
          var isCouple = parentPositions.length === 2;

          // Find child node positions (only those whose parents match)
          var parentIds = parentUnit.nodes.map(prop("id"));
          var childPositions = [];
        family.children.forEach(function (cUnit) {
          cUnit.nodes.forEach(function (node) {
            if (node.parents.some(withIds(parentIds))) {
              var pos = layoutNodes[node.id];
              if (pos) childPositions.push(pos);
            }
          });
        });

        if (childPositions.length === 0) return;

        var childTopY = childPositions[0].y;
        if (childTopY < parentBottomY) return;

        var busY = childTopY === parentBottomY
          ? parentBottomY + (NODE_H * 0.3)
          : parentBottomY + (childTopY - parentBottomY) / 2;

        // Drop from parent/union to bus
        links.push({
          type: "drop",
          x: parentMidX,
          y1: isCouple ? parentMidY : parentBottomY,
          y2: busY,
          fromUnion: isCouple,
        });

        // Horizontal bus
        var childXs = childPositions.map(function (p) { return p.x + NODE_W / 2; });
        var allXs = [parentMidX].concat(childXs);
        var busMinX = Math.min.apply(null, allXs);
        var busMaxX = Math.max.apply(null, allXs);
        if (busMaxX - busMinX > 0.5) {
          links.push({ type: "bus", x1: busMinX, x2: busMaxX, y: busY });
        }

        // Drops from bus to each child
        childPositions.forEach(function (cp) {
          links.push({
            type: "drop",
            x: cp.x + NODE_W / 2,
            y1: busY,
            y2: cp.y,
            toChild: true,
          });
        });
        }); // end parentUnit forEach
      }
    });

    // Catch-all: draw any union links not yet drawn
    // (handles spouses placed in separate family units, e.g. multiple marriages)
    (unions || []).forEach(function (union) {
      var aId = union.partner_a_id || union.partnerAId || union.partner_a || union.partnerA;
      var bId = union.partner_b_id || union.partnerBId || union.partner_b || union.partnerB;
      if (!aId || !bId) return;
      var key = [aId, bId].sort().join("|");
      if (drawnUnions[key]) return;
      var posA = layoutNodes[aId], posB = layoutNodes[bId];
      if (!posA || !posB) return;
      drawnUnions[key] = true;
      links.push({
        type: "union",
        fromX: Math.min(posA.x, posB.x) + NODE_W,
        fromY: posA.y + NODE_H / 2,
        toX: Math.max(posA.x, posB.x),
        toY: posB.y + NODE_H / 2,
      });
    });
  }

  // =========================================================================
  // FALLBACK: simple generation-based layout (previous algorithm)
  // Used if the main algorithm throws an error (e.g. cyclic data)
  // =========================================================================
  function computeFallbackLayout(people, unions, relationsByChild) {
    var layout = { nodes: {}, links: [], groups: [] };
    var COL_GAP = 90;
    var ROW_GAP = 70;

    var peopleById = {};
    var childrenByParent = {};
    var parentsByChild = {};

    (people || []).forEach(function (person) {
      if (!person || !person.id) return;
      peopleById[person.id] = person;
      childrenByParent[person.id] = [];
      parentsByChild[person.id] = [];
    });

    Object.keys(relationsByChild || {}).forEach(function (childId) {
      if (!peopleById[childId]) return;
      var parentIds = (relationsByChild[childId] || []).filter(function (id) {
        return !!peopleById[id];
      });
      parentsByChild[childId] = parentIds;
      parentIds.forEach(function (parentId) {
        if (childrenByParent[parentId]) childrenByParent[parentId].push(childId);
      });
    });

    // BFS from roots
    var generationById = {};
    var roots = Object.keys(peopleById).filter(function (id) {
      return (parentsByChild[id] || []).length === 0;
    });
    if (roots.length === 0) roots = Object.keys(peopleById).slice(0, 1);

    var queue = [];
    roots.forEach(function (id) { generationById[id] = 0; queue.push(id); });

    while (queue.length > 0) {
      var id = queue.shift();
      var gen = generationById[id] || 0;
      (childrenByParent[id] || []).forEach(function (childId) {
        if (generationById[childId] == null || gen + 1 > generationById[childId]) {
          generationById[childId] = gen + 1;
          queue.push(childId);
        }
      });
    }

    // Group by generation
    var groups = {};
    Object.keys(peopleById).forEach(function (id) {
      var g = generationById[id] || 0;
      if (!groups[g]) groups[g] = [];
      groups[g].push(peopleById[id]);
    });

    var genKeys = Object.keys(groups).map(Number).sort(function (a, b) { return a - b; });
    var maxCols = Math.max.apply(null, genKeys.map(function (k) { return groups[k].length; }).concat([1]));
    var midX = ((maxCols - 1) * (NODE_W + COL_GAP / 2)) / 2;

    genKeys.forEach(function (genKey, rowIndex) {
      var row = groups[genKey];
      var rowWidth = (row.length - 1) * (NODE_W + COL_GAP / 2);
      var offsetX = midX - rowWidth / 2;
      row.forEach(function (person, colIndex) {
        layout.nodes[person.id] = {
          id: person.id,
          x: offsetX + colIndex * (NODE_W + COL_GAP / 2),
          y: rowIndex * (NODE_H + ROW_GAP),
        };
      });
    });

    // Union links
    (unions || []).forEach(function (union) {
      var aId = union.partner_a_id || union.partnerAId || union.partner_a || union.partnerA;
      var bId = union.partner_b_id || union.partnerBId || union.partner_b || union.partnerB;
      var a = layout.nodes[aId];
      var b = layout.nodes[bId];
      if (!a || !b) return;
      layout.links.push({
        type: "union",
        fromX: Math.min(a.x, b.x) + NODE_W,
        fromY: a.y + NODE_H / 2,
        toX: Math.max(a.x, b.x),
        toY: b.y + NODE_H / 2,
      });
    });

    // Parent-child links
    var byParents = {};
    Object.keys(relationsByChild || {}).forEach(function (childId) {
      var child = layout.nodes[childId];
      var parentIds = (relationsByChild[childId] || []).filter(function (pid) { return !!layout.nodes[pid]; });
      if (!child || parentIds.length === 0) return;
      var key = parentIds.slice().sort().join("|");
      if (!byParents[key]) byParents[key] = { parents: parentIds.map(function (pid) { return layout.nodes[pid]; }), children: [] };
      byParents[key].children.push(child);
    });

    Object.values(byParents).forEach(function (group) {
      var parentMidX = group.parents.reduce(function (s, n) { return s + n.x + NODE_W / 2; }, 0) / group.parents.length;
      var parentBottomY = Math.max.apply(null, group.parents.map(function (n) { return n.y + NODE_H; }));
      var childTopY = Math.min.apply(null, group.children.map(function (n) { return n.y; }));
      if (childTopY <= parentBottomY) return;
      var busY = parentBottomY + (childTopY - parentBottomY) / 2;
      var isCouple = group.parents.length === 2;
      layout.links.push({ type: "drop", x: parentMidX, y1: isCouple ? group.parents[0].y + NODE_H / 2 : parentBottomY, y2: busY, fromUnion: isCouple });
      var childXs = group.children.map(function (n) { return n.x + NODE_W / 2; });
      var busMinX = Math.min.apply(null, [parentMidX].concat(childXs));
      var busMaxX = Math.max.apply(null, [parentMidX].concat(childXs));
      layout.links.push({ type: "bus", x1: busMinX, x2: busMaxX, y: busY });
      group.children.forEach(function (child) {
        layout.links.push({ type: "drop", x: child.x + NODE_W / 2, y1: busY, y2: child.y, toChild: true });
      });
    });

    return layout;
  }

  // =========================================================================
  // EXPORT
  // =========================================================================
  window.treeLayout = {
    NODE_W: NODE_W,
    NODE_H: NODE_H,
    computeApiTreeLayout: computeApiTreeLayout,
  };
})();
