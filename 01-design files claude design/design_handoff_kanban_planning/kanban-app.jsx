// Kanban planner — app shell. Backlog (te plannen) | board + minimap | details.
// Drag cards to a machine column + day; capacity warnings; collapsible panel.

const KB_TWEAKS = /*EDITMODE-BEGIN*/{
  "density": "compact",
  "strictness": "normaal",
  "cardStyle": "rand",
  "selStyle": "dimmen",
  "accent": "#2d6df6",
  "showMinimap": true
} /*EDITMODE-END*/;

function clone(c) { return c.map((x) => ({ ...x })); }

function KanbanApp() {
  const K = window.KB;
  const [t, setTweak] = useTweaks(KB_TWEAKS);

  const [cards, setCards] = React.useState(() => clone(K.CARDS));
  const [rev, setRev] = React.useState(0);
  const bump = () => setRev((r) => r + 1);

  const [selectedId, setSelectedId] = React.useState(null);
  const [detailsCollapsed, setDetailsCollapsed] = React.useState(false);
  const [machineFilter, setMachineFilter] = React.useState("all");
  const [sortBy, setSortBy] = React.useState("deadline");
  const [draggingCard, setDraggingCard] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const scrollApi = React.useRef(null);

  const selected = selectedId ? cards.find((c) => c.id === selectedId) : null;
  const selectedOrder = selected ? selected.orderId : null;

  // theme / accent (light only)
  React.useEffect(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", "light");
    r.style.setProperty("--accent", t.accent);
    r.style.setProperty("--accent-soft", hexA(t.accent, 0.10));
    r.style.setProperty("--accent-hover", shd(t.accent, -10));
  }, [t.accent]);

  function flash(msg) {
    setToast(msg);
    clearTimeout(window.__kbt);
    window.__kbt = setTimeout(() => setToast(null), 2000);
  }

  function onSelect(card) {
    setSelectedId(card.id);
    if (detailsCollapsed) setDetailsCollapsed(false);
  }
  function clearSel() { setSelectedId(null); }

  function onDragStart(e, card) {
    setDraggingCard(card);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", card.id); } catch (_) {}
  }
  function onDragEnd() { setDraggingCard(null); }

  function onDrop(machineId, dayIdx) {
    if (!draggingCard) return;
    const switched = draggingCard.planMachine && draggingCard.planMachine !== machineId
      || (!draggingCard.planMachine && machineId !== draggingCard.machine);
    setCards((cs) => cs.map((c) =>
      c.id === draggingCard.id ? { ...c, planDayIdx: dayIdx, planMachine: machineId } : c));
    const m = K.MACHINE_MAP[machineId];
    const f = K.fmtDay(dayIdx);
    flash(`${draggingCard.part} → ${m.naam}, ${f.dow} ${f.dnum} ${f.mon}` + (switched ? " · machine gewijzigd" : ""));
    setDraggingCard(null);
    bump();
  }
  function onUnplan(card) {
    setCards((cs) => cs.map((c) => c.id === card.id ? { ...c, planDayIdx: null, planMachine: null } : c));
    flash(`${card.part} terug naar te plannen`);
    bump();
  }
  function onDropBacklog() {
    if (!draggingCard) return;
    onUnplan(draggingCard);
    setDraggingCard(null);
  }

  // stats
  const backlogN = cards.filter((c) => c.planDayIdx == null).length;
  const plannedMin = cards.reduce((s, c) => s + (c.planDayIdx != null ? c.duurMin : 0), 0);
  const overN = React.useMemo(() => {
    const th = window.KB_STRICT[t.strictness];
    const load = {};
    for (const c of cards) {
      if (c.planDayIdx == null || c.planMachine == null) continue;
      const key = c.planDayIdx + ":" + c.planMachine;
      load[key] = (load[key] || 0) + c.duurMin;
    }
    let n = 0;
    for (const key in load) {
      const m = K.MACHINE_MAP[key.split(":")[1]];
      if (load[key] / m.capMin > th.over) n++;
    }
    return n;
  }, [cards, t.strictness, rev]);

  return (
    <div className="app" data-sidebar="grouped"
      data-kbdens={t.density} data-cardstyle={t.cardStyle}>
      <KanbanSidebar />
      <main className="main">
        <header className="topbar">
          <div className="crumbs">
            <span>Productie</span>
            <Ic d={Icon.chevronRight} size={12} />
            <strong>Kanban planning</strong>
          </div>
          <div className="spacer"></div>
          <button className="btn ghost sm" onClick={() => scrollApi.current && scrollApi.current.toToday()}>
            <Ic d={Icon.target} size={13} /> Vandaag
          </button>
          <button className="btn ghost sm"><Ic d={Icon.download} size={13} /> Exporteer</button>
          <span style={{ width: 1, height: 18, background: "var(--border)" }}></span>
          <button className="btn primary sm"><Ic d={Icon.plus} size={13} /> Nieuwe order</button>
        </header>

        <div className="content" style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
          <div className="kb">
            {/* toolbar */}
            <div className="kb-toolbar">
              <div className="kb-legend">
                <span className="kb-leg"><span className="sw ok"></span>Ruimte</span>
                <span className="kb-leg"><span className="sw warn"></span>Bijna vol</span>
                <span className="kb-leg"><span className="sw over"></span>Overboekt</span>
              </div>
              <div className="sp"></div>
              <span className="kb-stat">Te plannen <b>{backlogN}</b></span>
              <span style={{ width: 1, height: 16, background: "var(--border)" }}></span>
              <span className="kb-stat">Ingepland <b>{(plannedMin / 60).toFixed(0)}u</b></span>
              <span style={{ width: 1, height: 16, background: "var(--border)" }}></span>
              <span className="kb-stat" style={overN ? { color: "var(--danger)" } : null}>
                Overboekt <b style={overN ? { color: "var(--danger)" } : null}>{overN}</b> {overN === 1 ? "dag" : "dagen"}
              </span>
            </div>

            {/* body */}
            <div className="kb-body" onClick={clearSel}>
              <div onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
                <KanbanBacklog
                  cards={cards} dens={t.density}
                  machineFilter={machineFilter} setMachineFilter={setMachineFilter}
                  sortBy={sortBy} setSortBy={setSortBy}
                  selectedId={selectedId} selectedOrder={selectedOrder} selStyle={t.selStyle}
                  onSelect={onSelect}
                  onDragStart={onDragStart} onDragEnd={onDragEnd}
                  draggingId={draggingCard ? draggingCard.id : null}
                  onDropBacklog={onDropBacklog}
                />
                <KanbanBoard
                  cards={cards} rev={rev} dens={t.density} strictness={t.strictness} selStyle={t.selStyle}
                  selectedId={selectedId} selectedOrder={selectedOrder}
                  onSelect={onSelect}
                  draggingCard={draggingCard} onDragStart={onDragStart} onDragEnd={onDragEnd}
                  onDrop={onDrop} scrollApi={scrollApi}
                />
                <KanbanDetails
                  card={selected} collapsed={detailsCollapsed}
                  onToggle={() => setDetailsCollapsed((v) => !v)}
                  onFlashLink={flash} onUnplan={onUnplan}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {toast && <div className="kb-toast">{toast}</div>}

      <TweaksPanel>
        <TweakSection label="Weergave" />
        <TweakRadio label="Kaartdichtheid" value={t.density} options={[{ value: "compact", label: "Compact" }, { value: "ruim", label: "Ruim" }]} onChange={(v) => setTweak("density", v)} />
        <TweakRadio label="Kaartstijl" value={t.cardStyle} options={[{ value: "rand", label: "Rand" }, { value: "zacht", label: "Zacht" }]} onChange={(v) => setTweak("cardStyle", v)} />
        <TweakColor label="Accent" value={t.accent} options={["#2d6df6", "#0f766e", "#7c3aed", "#c2410c"]} onChange={(v) => setTweak("accent", v)} />

        <TweakSection label="Selectie" />
        <TweakRadio label="Bij selecteren" value={t.selStyle} options={[{ value: "dimmen", label: "Dimmen" }, { value: "markeren", label: "Markeren" }, { value: "lijnen", label: "Lijnen" }]} onChange={(v) => setTweak("selStyle", v)} />

        <TweakSection label="Capaciteit" />
        <TweakRadio label="Strengheid" value={t.strictness} options={[{ value: "soepel", label: "Soepel" }, { value: "normaal", label: "Normaal" }, { value: "streng", label: "Streng" }]} onChange={(v) => setTweak("strictness", v)} />
      </TweaksPanel>
    </div>
  );
}

// color helpers
function hexA(hex, a) {
  const h = hex.replace("#", ""); const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return `rgba(${parseInt(n.slice(0, 2), 16)}, ${parseInt(n.slice(2, 4), 16)}, ${parseInt(n.slice(4, 6), 16)}, ${a})`;
}
function shd(hex, p) {
  const h = hex.replace("#", ""); const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const a = (c) => Math.max(0, Math.min(255, Math.round((c * (100 + p)) / 100)));
  const r = a(parseInt(n.slice(0, 2), 16)), g = a(parseInt(n.slice(2, 4), 16)), b = a(parseInt(n.slice(4, 6), 16));
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

ReactDOM.createRoot(document.getElementById("root")).render(<KanbanApp />);
