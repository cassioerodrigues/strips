// tree-layout.js — Porta do algoritmo "relatives-tree" por SanichKotikov
// (https://github.com/SanichKotikov/relatives-tree) adaptado ao modelo de
// dados do Stirps (people[], unions[], relationsByChild{}).
//
// O algoritmo calcula o layout em unidades abstratas de grid e depois
// converte para pixels. Agrupa pessoas em "famílias" (unidade-pais +
// unidades-filhos), posiciona expandindo a partir de uma pessoa raiz
// em 3 direções (central, ancestral, descendente), corrige sobreposições
// e normaliza coordenadas.
(function () {
  "use strict";

  // =========================================================================
  // CONSTANTES
  // =========================================================================
  var NODE_W = 220;
  var NODE_H = 86;

  // Tamanho do grid abstrato (cada nó = SIZE unidades de largura e altura)
  var SIZE = 2;
  var HALF_SIZE = SIZE / 2;
  var NODES_IN_COUPLE = 2;

  // =========================================================================
  // FUNÇÕES UTILITÁRIAS
  // =========================================================================

  // Retorna uma função que extrai a propriedade 'name' de um objeto.
  // Uso: array.map(prop("id")) → extrai o campo id de cada elemento.
  function prop(name) {
    return function (item) { return item[name]; };
  }

  // Retorna um filtro que verifica se o item tem o id especificado.
  function withId(id) {
    return function (item) { return item.id === id; };
  }

  // Retorna um filtro que verifica se o item.id está (ou não) na lista de ids.
  // Se include=true, retorna true quando o id está na lista; se false, o inverso.
  function withIds(ids, include) {
    if (include === undefined) include = true;
    return function (item) { return (ids.indexOf(item.id) !== -1) === include; };
  }

  // Callback para Array.filter() que remove duplicatas de um array.
  function unique(item, index, arr) {
    return arr.indexOf(item) === index;
  }

  // Comparador para ordenação numérica crescente.
  function inAscOrder(v1, v2) { return v1 - v2; }

  // Compõe múltiplas funções em sequência (pipeline).
  // pipe(f, g, h)(x) equivale a h(g(f(x))).
  function pipe() {
    var fns = Array.prototype.slice.call(arguments);
    return function (init) {
      return fns.reduce(function (res, fn) { return fn(res); }, init);
    };
  }

  // Retorna o menor valor de um array numérico (0 se vazio).
  function arrMin(arr) {
    return arr.length === 0 ? 0 : Math.min.apply(null, arr);
  }

  // Retorna o maior valor de um array numérico (0 se vazio).
  function arrMax(arr) {
    return arr.length === 0 ? 0 : Math.max.apply(null, arr);
  }

  // Converte um array de objetos (com .id) em um mapa { id → objeto }.
  function toMap(items) {
    var m = {};
    items.forEach(function (item) {
      m[item.id] = Object.assign({}, item);
    });
    return m;
  }

  // Retorna um filtro que verifica se item.type está entre os tipos fornecidos.
  // Uso: filter(withRelType("blood", "adopted")).
  function withRelType() {
    var types = Array.prototype.slice.call(arguments);
    return function (item) { return types.indexOf(item.type) !== -1; };
  }

  // Comparador de ordenação por gênero: pai/homem à esquerda, mãe/mulher à direita.
  // Mantém a ascendência direta como ramo paterno à esquerda e materno à direita.
  function byGender() {
    var rank = { male: 0, female: 1 };
    return function (a, b) {
      var ar = rank[a.gender] != null ? rank[a.gender] : 2;
      var br = rank[b.gender] != null ? rank[b.gender] : 2;
      return ar - br;
    };
  }

  // Verifica se um nó tem pais de tipos diferentes (ex: biológico + adotivo).
  function hasDiffParents(node) {
    return node.parents.map(prop("type")).filter(unique).length > 1;
  }

  // =========================================================================
  // HELPERS DE UNIDADE (Unit)
  // Uma "unidade" representa 1 ou 2 pessoas (solteiro ou casal) dentro de
  // uma família. Contém: fid (id da família), nodes (pessoas), pos (posição
  // horizontal em unidades de grid), child (se é unidade filha).
  // =========================================================================

  // Cria uma nova unidade com os nós fornecidos, associada à família fid.
  function newUnit(fid, nodes, isChild) {
    return {
      fid: fid,
      child: isChild || false,
      nodes: nodes.slice(),
      pos: 0,
    };
  }

  // Retorna os IDs dos nós (pessoas) de uma unidade.
  function nodeIds(unit) { return unit.nodes.map(prop("id")); }
  // Retorna quantas pessoas estão na unidade (1 = solteiro, 2 = casal).
  function nodeCount(unit) { return unit.nodes.length; }
  // Verifica se algum nó da unidade tem filhos.
  function hasChildrenFn(unit) { return unit.nodes.some(function (n) { return n.children.length > 0; }); }
  // Calcula a posição do lado direito da unidade no grid.
  function rightSide(unit) { return unit.pos + nodeCount(unit) * SIZE; }
  // Retorna um comparador que verifica se outra unidade contém os mesmos nós.
  function sameAs(target) {
    var key = nodeIds(target).join("");
    return function (unit) { return nodeIds(unit).join("") === key; };
  }
  // Calcula a posição X absoluta de uma unidade dentro da sua família.
  function getUnitX(family, unit) { return family.X + unit.pos; }
  // Extrai todos os nós (pessoas) de um array de unidades.
  function unitsToNodes(units) {
    var result = [];
    units.forEach(function (u) { u.nodes.forEach(function (n) { result.push(n); }); });
    return result;
  }

  // Posiciona as unidades sequencialmente: cada uma começa onde a anterior termina.
  function arrangeInOrder(units) {
    units.forEach(function (unit, idx, self) {
      unit.pos = idx === 0 ? 0 : rightSide(self[idx - 1]);
    });
  }

  // Desloca todas as unidades pelo valor 'shift' (ajuste horizontal em lote).
  function correctUnitsShift(units, shift) {
    units.forEach(function (unit) { unit.pos += shift; });
  }

  // =========================================================================
  // HELPERS DE FAMÍLIA
  // Uma "família" agrupa unidades de pais (parents[]) e unidades de filhos
  // (children[]). Tem tipo (root/child/parent), posição (X,Y) e referências
  // para famílias pai (pid) e filha (cid) na cadeia hierárquica.
  // =========================================================================
  var FAMILY_TYPE_ROOT = "root";     // Família raiz (geração do root)
  var FAMILY_TYPE_CHILD = "child";   // Família de descendentes
  var FAMILY_TYPE_PARENT = "parent"; // Família de ancestrais

  // Cria uma nova família com id, tipo e flag indicando se é a família principal.
  function newFamily(id, type, main) {
    return {
      id: id,
      type: type,
      main: main || false,
      Y: 0,                // Posição Y (linha/geração) no grid abstrato
      X: 0,                // Posição X (coluna) no grid abstrato
      pid: null,           // ID da família pai (acima)
      cid: null,           // ID da família filha (abaixo)
      parents: [],         // Unidades de pais
      children: [],        // Unidades de filhos
    };
  }

  // Filtro que verifica se a família é de um dos tipos especificados.
  function withFamilyType() {
    var types = Array.prototype.slice.call(arguments);
    return function (item) { return types.indexOf(item.type) !== -1; };
  }

  // Calcula a largura total da família (em unidades de grid).
  function widthOf(family) {
    var all = family.parents.concat(family.children);
    return all.length === 0 ? 0 : arrMax(all.map(rightSide));
  }

  // Calcula a altura da família: cada linha (pais/filhos) ocupa SIZE unidades.
  function heightOf(family) {
    var rows = [family.parents.length, family.children.length].filter(Boolean).length;
    return rows * SIZE;
  }

  // Retorna a posição X do lado direito da família.
  function rightOf(family) { return family.X + widthOf(family); }
  // Retorna a posição Y do fundo da família.
  function bottomOf(family) { return family.Y + heightOf(family); }

  // Conta o total de nós (pessoas) em todas as unidades do array.
  function unitNodesCount(units) {
    return units.reduce(function (acc, u) { return acc + nodeCount(u); }, 0);
  }

  // Calcula a posição X central dos pais (ponto de conexão para conectores).
  function getParentsX(family, unit) {
    return unit ? getUnitX(family, unit) + nodeCount(unit) : 0;
  }

  // =========================================================================
  // setDefaultUnitShift
  // Posiciona as unidades de pais e filhos de uma família, centralizando
  // a linha menor em relação à maior e normalizando para que nenhuma
  // posição fique negativa.
  // =========================================================================
  function setDefaultUnitShift(family) {
    arrangeInOrder(family.parents);
    arrangeInOrder(family.children);

    // Centraliza a linha menor em relação à maior
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
  // Reposiciona a unidade de pais para ficar centralizada acima dos seus
  // filhos. Calcula o ponto médio das posições dos filhos e ajusta.
  // =========================================================================

  // Calcula as posições dos filhos que correspondem aos IDs fornecidos.
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

  // Calcula o valor médio entre o primeiro e o último valor de um array.
  function middleValue(values) {
    if (values.length === 0) return 0;
    var result = (values[0] + values[values.length - 1]) / 2;
    return isNaN(result) ? 0 : result;
  }

  // Centraliza os pais acima dos seus filhos na família.
  // Ignora famílias multi-parent (tratadas em createParentFamily).
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

  function centerParentUnitsOverChildren(family) {
    family.parents.forEach(function (pUnit) {
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

    family.parents.sort(function (a, b) { return a.pos - b.pos; });
    for (var pi = 1; pi < family.parents.length; pi++) {
      var minPos = family.parents[pi - 1].pos + nodeCount(family.parents[pi - 1]) * SIZE;
      if (family.parents[pi].pos < minPos) {
        family.parents[pi].pos = minPos;
      }
    }
  }

  // =========================================================================
  // STORE (Armazena o estado da árvore)
  // Contém todos os nós (pessoas) e famílias criadas durante o cálculo.
  // O rootId define a pessoa central a partir da qual a árvore se expande.
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

  // Gera o próximo ID sequencial para famílias.
  Store.prototype.getNextId = function () { return ++this._nextId; };
  // Retorna um nó (pessoa) pelo ID.
  Store.prototype.getNode = function (id) { return this.nodes[id]; };
  // Retorna múltiplos nós pelos IDs (ignora IDs inválidos).
  Store.prototype.getNodes = function (ids) {
    var self = this;
    return ids.map(function (id) { return self.nodes[id]; }).filter(Boolean);
  };
  // Retorna uma família pelo ID.
  Store.prototype.getFamily = function (id) { return this.families[id]; };

  // Getter: retorna todas as famílias como array.
  Object.defineProperty(Store.prototype, "familiesArray", {
    get: function () {
      var self = this;
      return Object.keys(self.families).map(function (k) { return self.families[k]; });
    },
  });

  // Getter: retorna apenas as famílias do tipo ROOT.
  Object.defineProperty(Store.prototype, "rootFamilies", {
    get: function () {
      return this.familiesArray.filter(withFamilyType(FAMILY_TYPE_ROOT));
    },
  });

  // Getter: retorna a família raiz principal (a marcada como main, ou a primeira).
  Object.defineProperty(Store.prototype, "rootFamily", {
    get: function () {
      return this.rootFamilies.filter(function (f) { return f.main; })[0] || this.rootFamilies[0];
    },
  });

  // =========================================================================
  // getSpouseNodesFunc
  // Retorna uma função que, dado um array de pais, separa os cônjuges em:
  //   - middle: o casal principal
  //   - left: outros cônjuges do primeiro parceiro
  //   - right: outros cônjuges do segundo parceiro
  // Usado para posicionar casamentos múltiplos na árvore.
  // =========================================================================
  function getSpouseNodesFunc(store) {
    // Encontra o cônjuge principal de uma pessoa (casado > mais filhos em comum).
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
  // Retorna uma função que cria as unidades filhas para uma pessoa.
  // Para cada filho, cria a unidade central (com cônjuge se houver) e
  // unidades laterais para cônjuges adicionais.
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
  // DIREÇÃO CENTRAL (Middle Direction)
  // Cria as famílias da geração do root person. Se o root tem pais, cria a
  // família com pais + irmãos. Se não tem pais, cria uma família só com o
  // root como filho. Também trata casamentos múltiplos dos pais do root.
  // =========================================================================

  // Cria família quando o root não tem pais (ele é a raiz absoluta).
  function createFamilyWithoutParents(store) {
    var family = newFamily(store.getNextId(), FAMILY_TYPE_ROOT, true);
    var createChildUnits = createChildUnitsFunc(store);
    family.children = createChildUnits(family.id, store.root);
    setDefaultUnitShift(family);
    return [family];
  }

  // Fábrica de funções que cria famílias com pais e seus filhos em comum.
  // Ordena irmãos por ano de nascimento (mais velho à esquerda, mais novo à direita).
  function createFamilyFunc_children(store) {
    var createChildUnits = createChildUnitsFunc(store);

    function getChildUnits(familyId, parents) {
      var first = parents[0], second = parents[1];
      var rels = first.children.filter(function (rel) {
        return !second || second.children.some(withId(rel.id));
      });
      // Ordena irmãos por ano de nascimento (mais velho à esquerda, mais novo à direita)
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

  // Cria as famílias de sangue do root (pais biológicos + casamentos extras).
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

  // Cria famílias separadas para pais de tipos diferentes (biológico vs adotivo).
  // Trata sobreposição de filhos compartilhados entre as duas famílias.
  function createDiffTypeFamilies(store) {
    var createFamily = createFamilyFunc_children(store);
    var bloodParentIDs = store.root.parents.filter(withRelType("blood")).map(prop("id"));
    var adoptedParentIDs = store.root.parents.filter(withRelType("adopted")).map(prop("id"));

    var bloodFamily = createFamily(bloodParentIDs, FAMILY_TYPE_ROOT, true);
    var adoptedFamily = createFamily(adoptedParentIDs);

    // Corrige sobreposição entre família biológica e adotiva
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

  // Ponto de entrada da direção central: decide qual estratégia usar
  // (sem pais / pais de tipos diferentes / pais normais) e posiciona
  // as famílias da esquerda para a direita.
  function inMiddleDirection(store) {
    var families;
    if (store.root.parents.length) {
      families = hasDiffParents(store.root)
        ? createDiffTypeFamilies(store)
        : createBloodFamilies(store);
    } else {
      families = createFamilyWithoutParents(store);
    }

    // Posiciona famílias da esquerda para a direita
    for (var i = 1; i < families.length; i++) {
      families[i].X = rightOf(families[i - 1]);
    }

    families.forEach(function (family) {
      store.families[family.id] = family;
    });

    return store;
  }

  // =========================================================================
  // DIREÇÃO DESCENDENTE (Children Direction)
  // Expande a árvore para baixo: para cada unidade com filhos, cria uma
  // nova família CHILD e ajusta posições propagando mudanças para cima.
  // =========================================================================
  function inChildDirection(store) {
    var createFamily = createFamilyFunc_children(store);

    // Atualiza Y e X da nova família baseado na família pai.
    function updateFamily(family, parentUnit) {
      var parentFamily = store.getFamily(parentUnit.fid);
      family.pid = parentFamily.id;
      family.Y = parentFamily.Y + heightOf(parentFamily) - SIZE;
      family.X = getUnitX(parentFamily, parentUnit);
    }

    // Ajusta a posição de uma família filha dentro da família pai,
    // deslocando unidades à direita se necessário para evitar sobreposição.
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
        // Em famílias multi-parent, adiciona espaçamento extra entre subárvores
        // de irmãos para que os barramentos não se sobreponham horizontalmente.
        if (nextFamily._multiParent && shift >= 0 && shift < 2 * SIZE) shift = 2 * SIZE;
        correctUnitsShift(nextFamily.children.slice(nextIdx), shift);
      }
    }

    // Desloca famílias root subsequentes para a direita quando uma subárvore cresce.
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

    // Propaga ajustes de posição de uma família filha até a raiz.
    // A cada nível, reposiciona os pais e empurra famílias vizinhas.
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

    // Retorna as unidades filhas que têm filhos próprios (precisam expandir).
    function getUnitsWithChildren(family) {
      return family.children.filter(hasChildrenFn).reverse();
    }

    function unitHasRoot(unit) {
      return unit.nodes.some(withId(store.root.id));
    }

    store.familiesArray.filter(withFamilyType(FAMILY_TYPE_ROOT)).forEach(function (rootFamily) {
      var stack = getUnitsWithChildren(rootFamily).map(function (unit) {
        return { unit: unit, recursive: unitHasRoot(unit) };
      });
      while (stack.length) {
        var entry = stack.pop();
        var parentUnit = entry.unit;
        var family = createFamily(nodeIds(parentUnit), FAMILY_TYPE_CHILD);
        updateFamily(family, parentUnit);
        arrangeFamilies(family);
        store.families[family.id] = family;
        if (entry.recursive) {
          stack = stack.concat(getUnitsWithChildren(family).map(function (unit) {
            return { unit: unit, recursive: true };
          }));
        }
      }
    });

    function createChildFamilyFor(parentUnit) {
        var family = createFamily(nodeIds(parentUnit), FAMILY_TYPE_CHILD);
        updateFamily(family, parentUnit);
      return family;
    }

    // Expande filhos dos tios/tias posicionados em famílias PARENT.
    // Como a direção ancestral só inclui irmãos no primeiro nível acima do
    // root, isso mostra primos de primeiro grau sem trazer tios-avós.
    store.familiesArray.filter(withFamilyType(FAMILY_TYPE_PARENT)).forEach(function (parentFamily) {
      var siblingUnits = parentFamily.children.filter(function (unit) {
        return !unit._isAncestorLink && hasChildrenFn(unit);
      });

      if (parentFamily.cid === store.rootFamily.id) {
        var paternalEntries = [];
        var maternalEntries = [];

        siblingUnits.forEach(function (parentUnit) {
          var family = createChildFamilyFor(parentUnit);
          var entry = { unit: parentUnit, family: family, width: widthOf(family) };
          if (parentUnit._collateralSide === "paternal") paternalEntries.push(entry);
          else maternalEntries.push(entry);
        });

        var totalPaternalWidth = paternalEntries.reduce(function (sum, entry) {
          return sum + entry.width;
        }, 0);
        var leftCursor = store.rootFamily.X - totalPaternalWidth;
        paternalEntries.forEach(function (entry) {
          entry.unit.pos = leftCursor - parentFamily.X;
          entry.family.X = leftCursor;
          store.families[entry.family.id] = entry.family;
          leftCursor += entry.width;
        });

        var rightCursor = rightOf(store.rootFamily);
        maternalEntries.forEach(function (entry) {
          entry.unit.pos = rightCursor - parentFamily.X;
          entry.family.X = rightCursor;
          store.families[entry.family.id] = entry.family;
          rightCursor += entry.width;
        });
      } else {
        siblingUnits.slice().reverse().forEach(function (parentUnit) {
          var family = createChildFamilyFor(parentUnit);
          arrangeFamilies(family);
          store.families[family.id] = family;
        });
      }
    });

    return store;
  }

  // =========================================================================
  // DIREÇÃO ANCESTRAL (Parents Direction)
  // Expande a árvore para cima: para cada unidade de pais que tem avós,
  // cria uma família PARENT com os avós + seus filhos (tios do root).
  // Trata famílias multi-parent (2 avós paternos + 2 maternos).
  // =========================================================================
  function inParentDirection(store) {
    // Cria uma família de ancestrais para os IDs de filhos fornecidos.
    // Quando includeCollateralSiblings=true, inclui também os irmãos desses
    // filhos. Isso é usado só no primeiro nível acima do root, para mostrar
    // tios sem trazer tios-avós/tios-bisavós.
    function createParentFamily(childIDs, includeCollateralSiblings) {
      var createChildUnits = createChildUnitsFunc(store);
      var family = newFamily(store.getNextId(), FAMILY_TYPE_PARENT);

      // Obtém unidades de pais para cada ancestral em childIDs
      var childNodes = store.getNodes(childIDs);
      var parentUnits = [];
      childNodes.forEach(function (child) {
        var parentNodes = store.getNodes(child.parents.map(prop("id"))).sort(byGender(store.root.gender));
        if (parentNodes.length) {
          var parentUnit = newUnit(family.id, parentNodes);
          parentUnit._ancestorChildId = child.id;
          parentUnit._ancestorSide = child.gender === "male"
            ? "paternal"
            : child.gender === "female"
            ? "maternal"
            : null;
          parentUnits.push(parentUnit);
        }
      });
      family.parents = parentUnits;

      var siblingIds = [];
      if (includeCollateralSiblings) {
        // Coleta TODOS os filhos de TODAS as unidades de pais (ancestrais + seus irmãos)
        var allChildIdSet = {};
        parentUnits.forEach(function (pUnit) {
          pUnit.nodes.forEach(function (parentNode) {
            parentNode.children.forEach(function (rel) {
              allChildIdSet[rel.id] = true;
            });
          });
        });
        siblingIds = Object.keys(allChildIdSet);
      }

      // Cria unidades filhas: ancestrais primeiro (mantém children[0] como link)
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

      // Depois posiciona irmãos dos ancestrais ordenados por ano de nascimento
      siblingIds = siblingIds.filter(function (id) {
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
      // Para famílias com colaterais/múltiplos pais: posiciona irmãos de modo
      // que o barramento de cada casal de avós fique do seu próprio lado
      // (sem cruzamentos).
      //
      // Regra: o link ancestral fica no ramo PRINCIPAL.
      //   • Irmãos do ancestral paterno:
      //       seus irmãos vão para a ESQUERDA do link ancestral.
      //   • Irmãos do ancestral materno:
      //       seus irmãos vão para a DIREITA do link ancestral.
      //
      // Layout: [irmãos paternos] [link ancestral] [irmãos maternos]
      // Cada unidade de pais é centralizada acima do seu grupo de filhos.
      // ---------------------------------------------------------------
      family.children = childUnitsResult;

      if (parentUnits.length > 1 || (includeCollateralSiblings && parentUnits.length > 0)) {
        // Constrói lookup: childId → índice da unidade de pais dona
        var childOwner = {};
        parentUnits.forEach(function (pUnit, pIdx) {
          pUnit.nodes.forEach(function (pn) {
            pn.children.forEach(function (rel) { childOwner[rel.id] = pIdx; });
          });
        });

        // Separa irmãos em paternos (unit 0) e maternos (unit 1+)
        var ancestorUnit = family.children[0]; // sempre o link ancestral
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
          var ownerSide = owner >= 0 && parentUnits[owner] ? parentUnits[owner]._ancestorSide : null;
          if (ownerSide === "paternal") {
            cUnit._collateralSide = "paternal";
            paternalSiblings.push(cUnit);
          } else if (ownerSide === "maternal") {
            cUnit._collateralSide = "maternal";
            maternalSiblings.push(cUnit);
          } else if (owner === 0) {
            cUnit._collateralSide = "paternal";
            paternalSiblings.push(cUnit);
          } else {
            cUnit._collateralSide = "maternal";
            maternalSiblings.push(cUnit);
          }
        }

        // Posiciona filhos: [irmãos paternos] [link ancestral] [irmãos maternos]
        var pos = 0;
        paternalSiblings.forEach(function (u) { u.pos = pos; pos += nodeCount(u) * SIZE; });
        ancestorUnit.pos = pos; pos += nodeCount(ancestorUnit) * SIZE;
        maternalSiblings.forEach(function (u) { u.pos = pos; pos += nodeCount(u) * SIZE; });

        // Posiciona cada unidade de pais centralizada acima dos seus filhos
        centerParentUnitsOverChildren(family);

        // Normaliza: sem posições negativas
        var allUnits = family.parents.concat(family.children);
        var minStart = arrMin(allUnits.map(prop("pos")));
        if (minStart !== 0) {
          correctUnitsShift(family.parents, -minStart);
          correctUnitsShift(family.children, -minStart);
        }

        // Reordena o array de filhos para corresponder à ordem espacial (por pos).
        // Isso garante que arrangeNextFamily's slice(nextIdx) acerte o lado correto.
        family.children = paternalSiblings.concat([ancestorUnit]).concat(maternalSiblings);
        family._multiParent = parentUnits.length > 1;
      } else {
        setDefaultUnitShift(family);
      }

      return family;
    }

    // Atualiza a posição da família ancestral: Y fica uma linha acima da família filha.
    function updateFamily(family, childUnit) {
      var childFamily = store.getFamily(childUnit.fid);
      family.cid = childFamily.id;
      family.Y = childFamily.Y - SIZE;
      family.X = getUnitX(childFamily, childUnit);
    }

    // Ajusta a posição da família ancestral dentro da família filha (propagação para baixo).
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

        // Encontra o link ancestral (pode não estar no índice 0 em famílias multi-parent)
        var unit = null;
        var unitIdx = 0;
        for (var k = 0; k < family.children.length; k++) {
          if (family.children[k]._isAncestorLink) { unit = family.children[k]; unitIdx = k; break; }
        }
        if (!unit) { unit = family.children[0]; unitIdx = 0; }

        var oldPos = unit.pos;

        if (!nextFamily.cid) {
          // É família raiz - centraliza a unidade filha sob os pais
          unit.pos = (widthOf(family) - nodeCount(unit) * SIZE) / 2;
        } else {
          if (family.parents.length === 2 && unitNodesCount(family.parents) > 2) {
            unit.pos = Math.floor(family.parents[1].pos / 2);
          }
          arrangeNextFamily(family, nextFamily, right);
        }

        // Mantém unidades de irmãos alinhadas quando o link ancestral se move
        var delta = unit.pos - oldPos;
        if (delta !== 0 && family.children.length > 1) {
          for (var ci = 0; ci < family.children.length; ci++) {
            if (ci !== unitIdx) family.children[ci].pos += delta;
          }
        }

        family = nextFamily;
      }
    }

    // Retorna as unidades de pais que ainda têm avós (para continuar subindo).
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
      var includeCollateralSiblings = childUnit.fid === rootFamily.id;
      var family = createParentFamily(nodeIds(childUnit), includeCollateralSiblings);
      updateFamily(family, childUnit);
      arrangeFamilies(family);
      store.families[family.id] = family;
      stack = stack.concat(getParentUnitsWithParents(family).reverse());
    }

    return store;
  }

  // =========================================================================
  // CORREÇÃO DE POSIÇÕES
  // Normaliza todas as coordenadas para que a árvore comece em (0,0).
  // Alinha gerações entre famílias pai e root para que as linhas de
  // conexão fiquem corretas.
  // =========================================================================
  function correctPositions(store) {
    var families = store.familiesArray;
    var rootFamily = store.rootFamily;

    // Alinha gerações: desloca famílias child/root para que a linha de pais se alinhe
    if (rootFamily) {
      var parentFam = null;
      for (var i = 0; i < families.length; i++) {
        if (families[i].cid === rootFamily.id) { parentFam = families[i]; break; }
      }
      if (parentFam && parentFam.children[0] && rootFamily.parents[0]) {
        // Encontra o link ancestral (conecta família pai à família raiz)
        var anchorUnit = null;
        for (var ai = 0; ai < parentFam.children.length; ai++) {
          if (parentFam.children[ai]._isAncestorLink) { anchorUnit = parentFam.children[ai]; break; }
        }
        if (!anchorUnit) anchorUnit = parentFam.children[0];
        var shift = getUnitX(parentFam, anchorUnit) - getUnitX(rootFamily, rootFamily.parents[0]);
        families.filter(withFamilyType(FAMILY_TYPE_CHILD, FAMILY_TYPE_ROOT)).forEach(function (f) {
          f.X += shift;
        });

        // Os tios com filhos geram famílias CHILD próprias. Quando a linha
        // root/child é deslocada, move também a unidade do tio/tia dentro da
        // família ancestral para manter pais e filhos na mesma coluna.
        if (shift !== 0) {
          parentFam.children.forEach(function (unit) {
            if (!unit._isAncestorLink && hasChildrenFn(unit)) unit.pos += shift;
          });
        }

        centerParentUnitsOverChildren(parentFam);
      }
    }

    // Normaliza X
    var minX = arrMin(families.map(prop("X")));
    if (minX !== 0) families.forEach(function (f) { f.X += -minX; });

    // Normaliza Y
    var minY = arrMin(families.map(prop("Y")));
    if (minY !== 0) families.forEach(function (f) { f.Y += -minY; });

    return store;
  }

  // =========================================================================
  // EXTRAÇÃO DE NÓS POSICIONADOS
  // Percorre todas as famílias e extrai a posição (top, left) em unidades
  // de grid para cada pessoa. Um nó pode aparecer em múltiplas famílias
  // (será deduplicado depois).
  // =========================================================================
  function getExtendedNodes(families) {
    var result = [];
    families.forEach(function (family) {
      // Nós pais (apenas para famílias root e parent)
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
      // Nós filhos (para famílias root, child E parent — famílias parent
      // agora incluem irmãos dos ancestrais junto com o link ancestral direto)
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
  // CONECTORES
  // Calcula as linhas de conexão entre nós no grid abstrato.
  // Tipos: conexões entre cônjuges, de pais para filhos, e barras horizontais
  // que ligam irmãos. Retorna arrays [x1, y1, x2, y2].
  // =========================================================================
  function calcConnectors(families) {
    var connectors = [];

    // Conectores do meio (entre cônjuges nas famílias root)
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

    // Conectores de pais (famílias PARENT)
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

    // Conectores dos filhos
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
  // TAMANHO DO CANVAS
  // Calcula a largura e altura total necessária para conter todas as famílias.
  // =========================================================================
  function getCanvasSize(families) {
    return {
      width: arrMax(families.map(rightOf)),
      height: arrMax(families.map(bottomOf)),
    };
  }

  // =========================================================================
  // PIPELINE PRINCIPAL: calcTree
  // Executa o pipeline completo: direção central → ancestral → descendente
  // → correção de posições. Retorna famílias, canvas, nós e conectores.
  // =========================================================================
  var calcFamilies = pipe(inMiddleDirection, inParentDirection, inChildDirection, correctPositions);

  // Executa o cálculo completo da árvore a partir dos nós e do rootId.
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
  // CONVERSÃO DE DADOS: formato da API Stirps → formato relatives-tree
  // Transforma people[], unions[] e relationsByChild{} em um array de nós
  // com relações parents, children, siblings e spouses.
  // =========================================================================
  function convertToRelativesTreeNodes(people, unions, relationsByChild) {
    var nodesById = {};

    // Inicializa nós
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

    // Preenche relação de pais
    Object.keys(relationsByChild || {}).forEach(function (childId) {
      if (!nodesById[childId]) return;
      var parentIds = (relationsByChild[childId] || []).filter(function (id) {
        return !!nodesById[id];
      });
      nodesById[childId].parents = parentIds.map(function (id) {
        return { id: id, type: "blood" };
      });
    });

    // Preenche relação de filhos (derivada dos pais)
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

    // Preenche cônjuges a partir das uniões
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

    // Preenche irmãos (pessoas que compartilham pelo menos um pai)
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
  // ESCOLHA DO ROOT
  // Heurística para escolher a pessoa central da árvore quando nenhum rootId
  // é fornecido. Prefere pessoas com pais E filhos (geração do meio),
  // depois cônjuges, depois maior número de conexões.
  // =========================================================================
  function chooseRootId(nodes) {
    if (!nodes || nodes.length === 0) return null;

    var best = null;
    var bestScore = -1;

    nodes.forEach(function (node) {
      var score = 0;
      // Prefere nós com pais E filhos (geração do meio)
      if (node.parents.length > 0 && node.children.length > 0) score += 100;
      // Prefere nós com cônjuges
      if (node.spouses.length > 0) score += 50;
      // Mais conexões = melhor centro
      score += node.parents.length + node.children.length + node.spouses.length + node.siblings.length;

      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    });

    return best ? best.id : nodes[0].id;
  }

  // =========================================================================
  // API PÚBLICA: computeApiTreeLayout
  // Função principal chamada pelo tree.jsx. Recebe os dados da API e retorna
  // o layout completo: { nodes: { [id]: {x,y} }, links: [...], groups: [] }
  //
  // Fluxo:
  // 1. Converte dados da API para formato interno
  // 2. Escolhe o root (fornecido ou por heurística)
  // 3. Executa o algoritmo principal (calcTree)
  // 4. Converte posições de grid para pixels
  // 5. Trata componentes desconectados
  // 6. Resolve sobreposições
  // 7. Gera links/conectores
  // =========================================================================
  function computeApiTreeLayout(people, unions, relationsByChild, optRootId) {
    var layout = { nodes: {}, links: [], groups: [] };

    if (!people || people.length === 0) return layout;

    // Converte para formato relatives-tree
    var rtNodes = convertToRelativesTreeNodes(people, unions, relationsByChild);
    if (rtNodes.length === 0) return layout;

    // Escolhe root: usa rootId fornecido se válido, senão heurística
    var rootId;
    if (optRootId && rtNodes.some(function (n) { return n.id === optRootId; })) {
      rootId = optRootId;
    } else {
      rootId = chooseRootId(rtNodes);
    }
    if (!rootId) return layout;

    // Executa o algoritmo
    var result;
    try {
      result = calcTree(rtNodes, rootId);
    } catch (e) {
      // Fallback: se o algoritmo falhar, usa layout de grade simples
      console.warn("[tree-layout] relatives-tree algorithm failed, using fallback:", e);
      return computeFallbackLayout(people, unions, relationsByChild);
    }

    // Converte posições do grid abstrato para pixels
    // Cada unidade do grid corresponde a metade de uma dimensão do nó
    // Adiciona espaços entre nós para conectores
    var COL_GAP = 60;
    var ROW_GAP = 70;
    var UNIT_X = (NODE_W + COL_GAP) / 2;
    var UNIT_Y = (NODE_H + ROW_GAP) / 2;

    // Deduplica nós (um nó pode aparecer em múltiplas famílias)
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

    // Coleta TODAS as famílias da árvore principal e componentes desconectados
    var allFamilies = result.families.slice();

    // Trata componentes desconectados: nós não alcançados a partir do root
    // Quando um root específico é fixado, ignora componentes desconectados
    // (ex: pais de sogros não devem aparecer quando visto do outro lado)
    var unplacedNodes = rtNodes.filter(function (n) { return !layout.nodes[n.id]; });
    if (unplacedNodes.length > 0 && !optRootId) {
      // Encontra o X máximo dos nós já posicionados para offset
      var maxPlacedX = 0;
      Object.keys(layout.nodes).forEach(function (id) {
        var nx = layout.nodes[id].x + NODE_W;
        if (nx > maxPlacedX) maxPlacedX = nx;
      });
      var componentOffset = maxPlacedX + COL_GAP;

      // Processa cada componente desconectado
      while (unplacedNodes.length > 0) {
        var componentRoot = chooseRootId(unplacedNodes);
        var componentResult;
        try {
          componentResult = calcTree(unplacedNodes, componentRoot);
        } catch (e) {
          // Se falhar, posiciona linearmente
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

        // Coleta famílias do componente (gerará links de uma vez no final)
        allFamilies = allFamilies.concat(componentResult.families);

        // Atualiza offset para o próximo componente
        var compMaxX = 0;
        Object.keys(componentPlaced).forEach(function (id) {
          var nx = layout.nodes[id].x + NODE_W;
          if (nx > compMaxX) compMaxX = nx;
        });
        componentOffset = compMaxX + COL_GAP;

        // Remove nós já posicionados
        unplacedNodes = unplacedNodes.filter(function (n) { return !componentPlaced[n.id]; });
      }
    }

    // Resolve sobreposições de nós empurrando para a direita
    resolveNodeOverlaps(layout.nodes, NODE_W, COL_GAP);

    // Gera links de TODAS as famílias de uma vez (mapa drawnUnions previne duplicatas)
    generateLinksFromFamilies(allFamilies, layout.nodes, unions, UNIT_X, UNIT_Y, layout.links);

    return layout;
  }

  // =========================================================================
  // RESOLUÇÃO DE SOBREPOSIÇÕES
  // Pós-processamento: detecta nós sobrepostos na mesma geração (mesma
  // linha Y) e empurra tudo à direita do ponto de sobreposição.
  // Garante um espaçamento mínimo de minGap entre nós adjacentes.
  // Máximo de 20 iterações como rede de segurança.
  // =========================================================================
  function resolveNodeOverlaps(nodes, nodeW, minGap) {
    var nodeArr = Object.values(nodes);
    if (nodeArr.length < 2) return;

    // Agrupa por Y (linha de geração)
    var rowMap = {};
    nodeArr.forEach(function (n) {
      var key = Math.round(n.y);
      if (!rowMap[key]) rowMap[key] = [];
      rowMap[key].push(n);
    });

    var rowYs = Object.keys(rowMap).map(Number).sort(function (a, b) { return a - b; });

    // Itera até que não haja mais sobreposições (máximo 20 passes como segurança)
    for (var pass = 0; pass < 20; pass++) {
      var foundOverlap = false;

      for (var ri = 0; ri < rowYs.length; ri++) {
        var row = rowMap[rowYs[ri]].sort(function (a, b) { return a.x - b.x; });

        for (var i = 1; i < row.length; i++) {
          var requiredX = row[i - 1].x + nodeW + minGap;
          if (row[i].x < requiredX) {
            var shift = requiredX - row[i].x;
            var cutoff = row[i].x;

            // Protege nós à esquerda da sobreposição nesta linha
            var leftInRow = {};
            for (var j = 0; j < i; j++) leftInRow[row[j].id] = true;

            // Desloca o grupo direito: tudo em x >= cutoff exceto o grupo esquerdo
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
  // GERAÇÃO DE LINKS a partir da estrutura de famílias
  // Percorre todas as famílias e gera 3 tipos de links para renderização:
  //   - "union": linha horizontal entre cônjuges
  //   - "drop": linha vertical (de pais para barramento, ou barramento para filhos)
  //   - "bus": linha horizontal que conecta irmãos
  // Usa drawnUnions para evitar links duplicados.
  // =========================================================================
  function generateLinksFromFamilies(families, layoutNodes, unions, UNIT_X, UNIT_Y, links) {
    // Constrói lookup de uniões
    var unionPairs = {};
    (unions || []).forEach(function (union) {
      var aId = union.partner_a_id || union.partnerAId || union.partner_a || union.partnerA;
      var bId = union.partner_b_id || union.partnerBId || union.partner_b || union.partnerB;
      if (aId && bId) {
        unionPairs[aId + "|" + bId] = true;
        unionPairs[bId + "|" + aId] = true;
      }
    });

    // Rastreia quais pares de união já foram desenhados
    var drawnUnions = {};

    families.forEach(function (family) {
      // Desenha links de união/cônjuge das unidades de pais
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

      // Desenha links de cônjuge das unidades filhas
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

      // Desenha conexões pai-filhos para TODOS os tipos de família
      if (family.parents.length > 0 && family.children.length > 0) {
        // Itera sobre cada unidade de pais (famílias PARENT podem ter múltiplas)
        family.parents.forEach(function (parentUnit) {
          if (!parentUnit || !parentUnit.nodes.length) return;

          // Encontra posições dos nós pais
          var parentPositions = parentUnit.nodes.map(function (n) { return layoutNodes[n.id]; }).filter(Boolean);
          if (parentPositions.length === 0) return;

          var parentMidX = parentPositions.reduce(function (s, p) { return s + p.x + NODE_W / 2; }, 0) / parentPositions.length;
          var parentMidY = parentPositions[0].y + NODE_H / 2;
          var parentBottomY = parentPositions[0].y + NODE_H;
          var isCouple = parentPositions.length === 2;

          // Encontra posições dos nós filhos (apenas os que têm esses pais)
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

        // Linha vertical do pai/união até o barramento
        links.push({
          type: "drop",
          x: parentMidX,
          y1: isCouple ? parentMidY : parentBottomY,
          y2: busY,
          fromUnion: isCouple,
        });

        // Barramento horizontal
        var childXs = childPositions.map(function (p) { return p.x + NODE_W / 2; });
        var allXs = [parentMidX].concat(childXs);
        var busMinX = Math.min.apply(null, allXs);
        var busMaxX = Math.max.apply(null, allXs);
        if (busMaxX - busMinX > 0.5) {
          links.push({ type: "bus", x1: busMinX, x2: busMaxX, y: busY });
        }

        // Linhas verticais do barramento até cada filho
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

    // Captura geral: desenha links de união ainda não desenhados
    // (trata cônjuges em unidades de família separadas, ex: casamentos múltiplos)
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
  // LAYOUT FALLBACK (algoritmo simplificado)
  // Usado quando o algoritmo principal falha (ex: dados cíclicos).
  // Posiciona as pessoas em uma grade simples baseada em gerações (BFS).
  // Cada geração é uma linha horizontal, centralizada.
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

    // BFS a partir das raízes
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

    // Agrupa por geração
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

    // Links de união
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

    // Links pai-filho
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
  // EXPORTAÇÃO
  // Expõe a API pública no objeto global window.treeLayout.
  // =========================================================================
  window.treeLayout = {
    NODE_W: NODE_W,
    NODE_H: NODE_H,
    computeApiTreeLayout: computeApiTreeLayout,
  };
})();
