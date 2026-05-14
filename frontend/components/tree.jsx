// Family tree page — interactive zoom/pan with rectangular generation cards
// TODO: migrate when tree auto-layout lands (follow-up). Layout atual depende
// de IDs hard-coded de FAMILY (p_*) e do campo `generation`, que não existe
// em PersonOut da API. Issue separada para repensar o layout.

const NODE_W = 220;
const NODE_H = 86;
const COL_GAP = 90;
const ROW_GAP = 70;

// Compute layout: generations as rows, descending from G1 root couples
function computeLayout(focusId) {
  const F = window.FAMILY;
  const people = F.people;

  // Build family units: a couple + their children
  // We'll lay out by generations (1..5)
  const byGen = {1:[],2:[],3:[],4:[],5:[]};
  Object.values(people).forEach(p => byGen[p.generation].push(p));

  // Arrange manual ordering: keep partners adjacent
  // For simplicity, use a hand-crafted column order per generation
  const order = {
    1: ["p_giuseppe","p_assunta", null, "p_joao","p_carmela"],
    2: [null, "p_antonio","p_isabel", null],
    3: ["p_marcos","p_lucia", null, "p_ricardo","p_clarice"],
    4: ["p_thiago", null, "p_rafael","p_mariana", null, "p_helena","p_diego", null, "p_beatriz"],
    5: [null, "p_pedro", null, "p_lorenzo","p_alice"],
  };

  // Compute x positions per gen
  const layout = { nodes: {}, links: [] };
  const totalCols = Math.max(...Object.values(order).map(a => a.length));
  Object.entries(order).forEach(([gen, arr]) => {
    const g = parseInt(gen);
    arr.forEach((id, i) => {
      if (!id) return;
      const x = i * (NODE_W + COL_GAP/2);
      const y = (g - 1) * (NODE_H + ROW_GAP);
      layout.nodes[id] = { id, x, y, gen: g };
    });
  });

  // Center each generation around the same midpoint
  const midX = (totalCols - 1) * (NODE_W + COL_GAP/2) / 2;
  Object.entries(order).forEach(([gen, arr]) => {
    const presentXs = arr.map((id, i) => id ? i * (NODE_W + COL_GAP/2) : null).filter(v => v !== null);
    if (presentXs.length === 0) return;
    const minX = Math.min(...presentXs);
    const maxX = Math.max(...presentXs);
    const center = (minX + maxX) / 2;
    const offset = midX - center;
    arr.forEach((id) => {
      if (id && layout.nodes[id]) layout.nodes[id].x += offset;
    });
  });

  // Build parent-child links grouped by couple → orthogonal bus
  const byParents = {};
  Object.values(people).forEach(p => {
    if (!p.parents || !p.parents.length) return;
    const childNode = layout.nodes[p.id];
    if (!childNode) return;
    const parentNodes = p.parents.map(pid => layout.nodes[pid]).filter(Boolean);
    if (!parentNodes.length) return;
    const key = [...p.parents].sort().join("|");
    if (!byParents[key]) byParents[key] = { parents: parentNodes, children: [] };
    byParents[key].children.push(childNode);
  });
  Object.values(byParents).forEach(group => {
    const parentMidX = group.parents.reduce((s,n) => s+n.x + NODE_W/2, 0) / group.parents.length;
    const parentBottomY = group.parents[0].y + NODE_H;
    const parentMidY = group.parents[0].y + NODE_H / 2;
    const childTopY = group.children[0].y;
    const busY = parentBottomY + (childTopY - parentBottomY) / 2;
    // Line origin: from the union ring center if couple, else from bottom of the (single) parent card
    const isCouple = group.parents.length === 2;
    const originY = isCouple ? parentMidY : parentBottomY;
    // 1. drop from union point to bus
    layout.links.push({ type: "drop", x: parentMidX, y1: originY, y2: busY, fromUnion: isCouple });
    // 2. horizontal bus across all children x's
    const childXs = group.children.map(c => c.x + NODE_W/2);
    const busMinX = Math.min(parentMidX, ...childXs);
    const busMaxX = Math.max(parentMidX, ...childXs);
    if (busMaxX - busMinX > 0.5) {
      layout.links.push({ type: "bus", x1: busMinX, x2: busMaxX, y: busY });
    }
    // 3. drop from bus to each child top
    group.children.forEach(c => {
      layout.links.push({ type: "drop", x: c.x + NODE_W/2, y1: busY, y2: c.y, toChild: true });
    });
  });

  // Marriage/union links (horizontal)
  F.unions.forEach(u => {
    const a = layout.nodes[u.partners[0]];
    const b = layout.nodes[u.partners[1]];
    if (!a || !b) return;
    layout.links.push({
      fromX: Math.min(a.x, b.x) + NODE_W,
      fromY: a.y + NODE_H/2,
      toX: Math.max(a.x, b.x),
      toY: a.y + NODE_H/2,
      type: "union",
    });
  });

  return layout;
}

function TreeNode({ p, x, y, focused, dimmed, onClick, onHover }) {
  // Sex-based accent: men petrol, women terracotta
  const accentColor = p.sex === "F" ? "#a85d3a" : p.sex === "M" ? "#2c4a59" : "#a08658";
  const isLiving = !p.death;

  return (
    <div
      className={"tnode " + (focused ? "tnode-focus " : "") + (dimmed ? "tnode-dim " : "")}
      style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
      onClick={() => onClick(p.id)}
      onMouseEnter={() => onHover(p.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="tnode-strip" style={{ background: accentColor }}/>
      <div className="tnode-inner">
        <Avatar person={p} size={48}/>
        <div className="tnode-text">
          <div className="tnode-name">{p.first}</div>
          <div className="tnode-last">{p.last}</div>
          <div className="tnode-meta">
            {fmtLifespan(p)}
            {isLiving && <span className="tnode-living"/>}
          </div>
        </div>
      </div>
    </div>
  );
}

function FamilyTree({ onPersonClick, density = "comfortable" }) {
  const F = window.FAMILY || { people: {}, unions: [] };
  const tree = window.useTree ? window.useTree() : { status: "unavailable", people: [] };
  const useMockFallback = tree.status === "unavailable";
  const mockLayout = React.useMemo(
    () => useMockFallback ? computeLayout(F.rootUserId) : { nodes: {}, links: [] },
    [useMockFallback],
  );
  const apiCanRender =
    window.treeLayout &&
    (tree.status === "ready" || tree.status === "error") &&
    Array.isArray(tree.people) &&
    tree.people.length > 0;
  const apiLayout = React.useMemo(() => {
    if (!apiCanRender) return null;
    return window.treeLayout.computeApiTreeLayout(
      tree.people,
      tree.unions || [],
      tree.relationsByChild || {},
    );
  }, [apiCanRender, tree.people, tree.unions, tree.relationsByChild]);
  const layout = apiLayout || mockLayout;
  const peopleById = apiLayout ? (tree.peopleById || {}) : F.people;
  const focusId = apiLayout ? (tree.people[0] && tree.people[0].id) : "p_helena";
  const [zoom, setZoom] = React.useState(0.85);
  const [pan, setPan] = React.useState({ x: 60, y: 40 });
  const [hover, setHover] = React.useState(null);
  const [highlightLineage, setHighlightLineage] = React.useState(null); // null|"paternal"|"maternal"
  const [addOpen, setAddOpen] = React.useState(false);
  const [mutation, setMutation] = React.useState({ saving: false, error: null });
  const containerRef = React.useRef(null);
  const dragRef = React.useRef(null);

  // initial center
  React.useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const nodes = Object.values(layout.nodes);
    if (nodes.length === 0) return;
    const bounds = nodes.reduce((acc, n) => ({
      minX: Math.min(acc.minX, n.x), maxX: Math.max(acc.maxX, n.x + NODE_W),
      minY: Math.min(acc.minY, n.y), maxY: Math.max(acc.maxY, n.y + NODE_H),
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    const tw = bounds.maxX - bounds.minX;
    const th = bounds.maxY - bounds.minY;
    const z = Math.min(cw / (tw + 80), ch / (th + 80), 1);
    setZoom(z);
    setPan({
      x: (cw - tw * z) / 2 - bounds.minX * z,
      y: (ch - th * z) / 2 - bounds.minY * z,
    });
  }, [layout]);

  // Wheel zoom
  function onWheel(e) {
    e.preventDefault();
    const c = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - c.left;
    const my = e.clientY - c.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    setZoom(z => {
      const nz = Math.max(0.3, Math.min(2, z * factor));
      setPan(p => ({
        x: mx - (mx - p.x) * (nz / z),
        y: my - (my - p.y) * (nz / z),
      }));
      return nz;
    });
  }

  function onMouseDown(e) {
    if (e.target.closest(".tnode")) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
  }
  function onMouseMove(e) {
    if (!dragRef.current) return;
    setPan({
      x: dragRef.current.px + (e.clientX - dragRef.current.sx),
      y: dragRef.current.py + (e.clientY - dragRef.current.sy),
    });
  }
  function onMouseUp() { dragRef.current = null; }

  function fitView() {
    const c = containerRef.current;
    const nodes = Object.values(layout.nodes);
    if (!c || nodes.length === 0) return;
    const bounds = nodes.reduce((acc, n) => ({
      minX: Math.min(acc.minX, n.x), maxX: Math.max(acc.maxX, n.x + NODE_W),
      minY: Math.min(acc.minY, n.y), maxY: Math.max(acc.maxY, n.y + NODE_H),
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const cw = c.clientWidth, ch = c.clientHeight;
    const tw = bounds.maxX - bounds.minX, th = bounds.maxY - bounds.minY;
    const z = Math.min(cw / (tw + 120), ch / (th + 120), 1);
    setZoom(z);
    setPan({
      x: (cw - tw * z) / 2 - bounds.minX * z,
      y: (ch - th * z) / 2 - bounds.minY * z,
    });
  }

  // Determine paternal/maternal lineage sets
  function ancestry(id) {
    const set = new Set();
    function walk(pid) {
      const p = F.people[pid];
      if (!p || set.has(pid)) return;
      set.add(pid);
      (p.parents || []).forEach(walk);
    }
    walk(id);
    return set;
  }
  const helena = F.people.p_helena;
  const paternalSet = React.useMemo(
    () => useMockFallback && helena ? ancestry(helena.parents[0]) : new Set(),
    [useMockFallback],
  );
  const maternalSet = React.useMemo(() => {
    if (!useMockFallback) return new Set();
    // Clarice parents not modeled — just include herself
    const s = new Set();
    s.add("p_clarice");
    return s;
  }, [useMockFallback]);

  function isDimmed(id) {
    if (!highlightLineage) return false;
    if (highlightLineage === "paternal") return !paternalSet.has(id) && id !== "p_helena";
    if (highlightLineage === "maternal") return !maternalSet.has(id) && id !== "p_helena";
    return false;
  }

  const apiLoading = tree.status === "loading" || tree.status === "idle";
  const apiEmpty = tree.status === "empty" || (tree.status === "ready" && Array.isArray(tree.people) && tree.people.length === 0);
  const apiError = tree.status === "error";
  const canEdit = useMockFallback ? true : !!tree.canEdit;
  const readOnlyReason = tree.role === "viewer"
    ? "Visualizadores não podem editar esta árvore."
    : "Somente leitura.";

  function friendlyError(e) {
    if (e && e.status === 403) return "Você não tem permissão para alterar esta árvore.";
    if (e && e.status === 422) return "Alguns campos não foram aceitos pela API. Revise os dados e tente novamente.";
    return (e && e.message) || "Não foi possível salvar a alteração.";
  }

  async function savePerson(form) {
    setMutation({ saving: true, error: null });
    try {
      if (useMockFallback) {
        setMutation({ saving: false, error: null });
        return;
      }
      await window.useTree.actions.createPerson(form);
      setMutation({ saving: false, error: null });
    } catch (e) {
      setMutation({ saving: false, error: friendlyError(e) });
      throw e;
    }
  }

  return (
    <div className="page page-tree">
      {/* Tree toolbar */}
      <div className="tree-toolbar">
        <div className="tree-toolbar-left">
          <button className="chip"><Icon name="filter" size={13}/>Filtros</button>
          <button className="chip"><Icon name="calendar" size={13}/>Por época</button>
        </div>
        <div className="tree-toolbar-right">
          {canEdit && <button className="btn btn-sm btn-primary" onClick={() => setAddOpen(true)}><Icon name="plus" size={14}/>Adicionar pessoa</button>}
          {window.AddPersonModal && <window.AddPersonModal
            open={addOpen}
            people={useMockFallback ? Object.values(F.people) : (tree.people || [])}
            onClose={() => setAddOpen(false)}
            onSave={savePerson}
            saving={mutation.saving}
            error={mutation.error}
            readOnly={!canEdit}
            readOnlyReason={readOnlyReason}
          />}
        </div>
      </div>

      {!useMockFallback && apiLoading && (
        <div className="api-loading">Carregando árvore…</div>
      )}
      {!useMockFallback && apiEmpty && (
        <div className="api-empty">
          Esta árvore ainda não tem pessoas cadastradas.
        </div>
      )}
      {!useMockFallback && apiError && (
        <div className="api-error" role="alert">
          Não foi possível carregar a árvore completa. {tree.error}
          <button className="link" onClick={() => window.useTree.refetch && window.useTree.refetch()}>Tentar novamente</button>
        </div>
      )}

      {/* Canvas */}
      {(useMockFallback || apiCanRender) && <div
        ref={containerRef}
        className="tree-canvas"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div
          className="tree-bg"
          style={{
            backgroundPosition: `${pan.x}px ${pan.y}px`,
            backgroundSize: `${24*zoom}px ${24*zoom}px`,
          }}
        />
        <div className="tree-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {/* connection layer */}
          <svg className="tree-links" style={{ overflow: "visible" }}>
            {layout.links.map((l, i) => {
              if (l.type === "union") {
                const cx = (l.fromX + l.toX) / 2;
                const cy = l.fromY;
                const gap = 11;
                return (
                  <g key={i}>
                    <line x1={l.fromX} y1={l.fromY} x2={cx - gap} y2={cy} stroke="#a08658" strokeWidth="1.6"/>
                    <line x1={cx + gap} y1={cy} x2={l.toX} y2={l.toY} stroke="#a08658" strokeWidth="1.6"/>
                    <circle cx={cx - 3.5} cy={cy} r="4.2" fill="none" stroke="#a08658" strokeWidth="1.4"/>
                    <circle cx={cx + 3.5} cy={cy} r="4.2" fill="none" stroke="#a08658" strokeWidth="1.4"/>
                  </g>
                );
              }
              if (l.type === "drop") {
                return (
                  <g key={i}>
                    <line x1={l.x} y1={l.y1} x2={l.x} y2={l.y2} stroke="rgba(70,65,55,0.42)" strokeWidth="1.4" strokeLinecap="round"/>
                    {l.fromUnion && <circle cx={l.x} cy={l.y1 + 10.5} r="2.4" fill="#a08658"/>}
                  </g>
                );
              }
              if (l.type === "bus") {
                return <line key={i} x1={l.x1} y1={l.y} x2={l.x2} y2={l.y} stroke="rgba(70,65,55,0.42)" strokeWidth="1.4" strokeLinecap="round"/>;
              }
              return null;
            })}
          </svg>
          {/* nodes */}
          {Object.values(layout.nodes).filter(n => peopleById[n.id]).map(n => (
            <TreeNode
              key={n.id}
              p={peopleById[n.id]}
              x={n.x}
              y={n.y}
              focused={n.id === focusId}
              dimmed={!apiLayout && isDimmed(n.id)}
              onClick={onPersonClick}
              onHover={setHover}
            />
          ))}
        </div>

        {/* Zoom controls */}
        <div className="zoom-ctrl">
          <button onClick={() => setZoom(z => Math.min(2, z*1.2))}><Icon name="plus" size={14}/></button>
          <button onClick={() => setZoom(z => Math.max(0.3, z/1.2))}><Icon name="minus" size={14}/></button>
          <button onClick={fitView}><Icon name="fit" size={14}/></button>
          <div className="zoom-pct">{Math.round(zoom*100)}%</div>
        </div>

        {/* Legend */}
        <div className="tree-legend">
          <div className="tree-legend-row"><span className="legend-line" style={{background:"rgba(70,65,55,0.55)"}}/>Filiação</div>
          <div className="tree-legend-row"><span className="legend-line" style={{background:"#a08658"}}/>União / casamento</div>
          <div className="tree-legend-row"><span className="legend-dot" style={{background:"#2c4a59"}}/>Homem</div>
          <div className="tree-legend-row"><span className="legend-dot" style={{background:"#a85d3a"}}/>Mulher</div>
        </div>

        {/* Hover preview */}
        {hover && peopleById[hover] && <HoverCard person={peopleById[hover]}/>}
      </div>}
    </div>
  );
}

function gen_label(g) {
  return ["bisavós e antes", "avós", "pais e tios", "você e primos", "filhos"][g-1];
}

function HoverCard({ person }) {
  return (
    <div className="hover-card">
      <Avatar person={person} size={48}/>
      <div className="hover-card-text">
        <div className="hover-card-name">{person.first} {person.last}</div>
        <div className="hover-card-meta">{person.occupation}</div>
        <div className="hover-card-life">{fmtLifespan(person)} · {person.birth?.place}</div>
      </div>
    </div>
  );
}

window.FamilyTree = FamilyTree;
