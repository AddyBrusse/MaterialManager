// Planning board — app shell, toolbar, KPI row, selection popover, drag/drop,
// undo. Block-style + linking-treatment switchable (compare live).

const PLAN_TWEAKS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "compact",
  "accent": "#2d6df6",
  "blockStyle": "rand",
  "linkStyle": "gloed",
  "zoom": "week",
  "showGhost": false,
  "showDone": true
} /*EDITMODE-END*/;

function PlanApp() {
  const P = window.PLAN;
  const [t, setTweak] = useTweaks(PLAN_TWEAKS);

  const [rev, setRev] = React.useState(0);
  const bump = () => setRev((r) => r + 1);

  const [selectedStep, setSelectedStep] = React.useState(null);
  const [popPos, setPopPos] = React.useState(null);
  const [projectFilter, setProjectFilter] = React.useState("all");
  const [sortBy, setSortBy] = React.useState("default");
  const [draggingStep, setDraggingStep] = React.useState(null);
  const [undoStack, setUndoStack] = React.useState([]);
  const [toast, setToast] = React.useState(null);

  const selectedProject = selectedStep ? selectedStep.projectId : null;
  const scrollApi = React.useRef(null);

  // theme / density / accent
  React.useEffect(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", t.theme);
    r.setAttribute("data-density", t.density);
    r.style.setProperty("--accent", t.accent);
    r.style.setProperty("--accent-soft", hexA(t.accent, t.theme === "dark" ? 0.18 : 0.10));
    r.style.setProperty("--accent-hover", shd(t.accent, -10));
  }, [t.theme, t.density, t.accent]);

  function pushUndo(label, fn) {
    setUndoStack((s) => [...s, { label, fn }]);
  }
  function doUndo() {
    setUndoStack((s) => {
      if (!s.length) return s;
      const last = s[s.length - 1];
      last.fn();bump();
      return s.slice(0, -1);
    });
  }
  React.useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {e.preventDefault();doUndo();}
      if (e.key === "Escape") clearSel();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  function flash(msg) {setToast(msg);clearTimeout(window.__pt);window.__pt = setTimeout(() => setToast(null), 2200);}

  // mutations
  function markDone(s) {
    const prev = { gereed: s.gereed, gereedOp: s.gereedOp, gereedDoor: s.gereedDoor };
    s.gereed = true;s.gereedOp = P.fmtDayShort(P.TODAY_IDX);s.gereedDoor = "J. van Velsen";
    pushUndo(`Gereedmelding ${s.id} ongedaan maken`, () => Object.assign(s, prev));
    bump();flash(`${s.id} gereed gemeld`);
  }
  function unplan(s) {
    const prev = { planDay: s.planDay, planMachine: s.planMachine };
    s.planDay = null;s.planMachine = null;
    pushUndo(`${s.id} terugzetten ongedaan maken`, () => Object.assign(s, prev));
    if (selectedStep && selectedStep.id === s.id) clearSel();
    bump();flash(`${s.id} terug naar backlog`);
  }
  function unplanProject(pid) {
    const changed = P.STEPS.filter((s) => s.projectId === pid && s.planDay != null && !s.gereed).
    map((s) => ({ s, planDay: s.planDay, planMachine: s.planMachine }));
    changed.forEach(({ s }) => {s.planDay = null;s.planMachine = null;});
    pushUndo(`Project ${pid} herplannen ongedaan maken`, () => changed.forEach(({ s, planDay, planMachine }) => {s.planDay = planDay;s.planMachine = planMachine;}));
    clearSel();bump();flash(`${pid}: ${changed.length} stappen teruggezet`);
  }
  function dropPlan(step, machine, day) {
    const prev = { planDay: step.planDay, planMachine: step.planMachine };
    step.planDay = day;step.planMachine = machine;
    pushUndo(`Inplanning ${step.id} ongedaan maken`, () => Object.assign(step, prev));
    setDraggingStep(null);bump();flash(`${step.id} ingepland op ${P.fmtDayShort(day)}`);
  }
  function setDeadline(pid, newIdx) {
    const proj = P.PROJECT_MAP[pid];
    const prev = proj.deadline;
    const prevSteps = P.STEPS.filter((s) => s.projectId === pid).map((s) => ({ s, d: s.deadline }));
    proj.deadline = newIdx;
    prevSteps.forEach(({ s }) => {s.deadline = newIdx;});
    pushUndo(`Deadline ${pid} herstellen`, () => {proj.deadline = prev;prevSteps.forEach(({ s, d }) => {s.deadline = d;});});
    bump();
  }

  function selectNode(s, e) {
    setSelectedStep(s);
    const x = Math.min(e.clientX + 8, window.innerWidth - 312);
    const y = Math.min(e.clientY + 8, window.innerHeight - 380);
    setPopPos({ x: Math.max(12, x), y: Math.max(12, y) });
  }
  function clearSel() {setSelectedStep(null);setPopPos(null);}

  function onDragStartStep(e, s) {
    setDraggingStep(s);
    e.dataTransfer.effectAllowed = "move";
    try {e.dataTransfer.setData("text/plain", s.id);} catch (_) {}
  }
  function onDragEndStep() {setDraggingStep(null);}

  const backlogSteps = P.STEPS.filter((s) => s.planDay == null);
  const k = P.kpis();
  const achter = P.achterstanden();

  return (
    <div className="app" data-sidebar="grouped">
      <PlanSidebar />
      <main className="main">
        <header className="topbar">
          <div className="crumbs">
            <span>Productie</span>
            <Ic d={Icon.chevronRight} size={12} />
            <strong>Planning</strong>
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
          <div className="plan">
            {/* KPI row */}
            <div className="kpi-row">
              <Kpi icon={Icon.clock} label="Gepland deze week" val={k.geplandeUren} unit="u"
              sub="alle machines" />
              <Kpi icon={Icon.layers} label="Bezetting" val={k.bezetting} unit="%"
              bar={{ pct: k.bezetting, status: k.bezetting > 100 ? "over" : k.bezetting > 85 ? "warn" : "ok" }}
              sub="t.o.v. effectieve capaciteit" />
              <Kpi icon={Icon.warning} label="Achterstand" val={k.achterstand} variant={k.achterstand ? "danger" : ""}
              sub="stappen over tijd" />
              <Kpi icon={Icon.inbox} label="Te plannen" val={k.teplannen}
              sub="stappen in backlog" />
              <Kpi icon={Icon.calendar} label="Leveringen" val={k.leveringen}
              sub="deadlines deze week" />
            </div>

            {/* toolbar */}
            <div className="plan-toolbar">
              <div className="seg" role="tablist">
                {["day", "week", "month"].map((z) =>
                <button key={z} data-active={t.zoom === z} onClick={() => setTweak("zoom", z)}>
                    {z === "day" ? "Dag" : z === "week" ? "Week" : "Maand"}
                  </button>
                )}
              </div>
              <div className="tb-divider"></div>

              <span className="tb-label">Blok</span>
              <div className="seg">
                {[["rand", "Rand"], ["vol", "Vol"], ["zacht", "Zacht"]].map(([v, l]) =>
                <button key={v} data-active={t.blockStyle === v} onClick={() => setTweak("blockStyle", v)}>{l}</button>
                )}
              </div>

              <span className="tb-label">Koppeling</span>
              <div className="seg">
                {[["lijnen", "Lijnen"], ["gloed", "Gloed"], ["beide", "Beide"]].map(([v, l]) =>
                <button key={v} data-active={t.linkStyle === v} onClick={() => setTweak("linkStyle", v)}>{l}</button>
                )}
              </div>

              <div className="sp"></div>

              {undoStack.length > 0 &&
              <button className="btn ghost sm undo-btn" onClick={doUndo} title="Ctrl+Z">
                  <Ic d={Icon.undo} size={13} /> {undoStack[undoStack.length - 1].label}
                </button>
              }
              <button className="tgl" data-on={t.showGhost} onClick={() => setTweak("showGhost", !t.showGhost)}>
                <Ic d={Icon.ghost} size={14} /> Prognose <span className="sw"></span>
              </button>
              <button className="tgl" data-on={t.showDone} onClick={() => setTweak("showDone", !t.showDone)}>
                <Ic d={t.showDone ? Icon.eye : Icon.eyeOff} size={14} /> Gereed
              </button>
            </div>

            {/* achterstand banner */}
            {achter.length > 0 &&
            <div className="achterstand-banner">
                <span className="ico"><Ic d={Icon.warning} size={15} /></span>
                <span><b>{achter.length} {achter.length === 1 ? "stap" : "stappen"}</b> over tijd, nog niet gereed</span>
                <div className="chips">
                  {achter.map((s) =>
                <button key={s.id} className="ab-chip" onClick={(e) => selectNode(s, e)}>
                      <span className="d" style={{ background: s.kleur }}></span>
                      {s.id} · {P.fmtDayShort(s.planDay)}
                    </button>
                )}
                </div>
              </div>
            }

            {/* body */}
            <div className="plan-body">
              <Backlog
                steps={backlogSteps} projectFilter={projectFilter} setProjectFilter={setProjectFilter}
                sortBy={sortBy} setSortBy={setSortBy}
                selectedProject={selectedProject}
                onSelectStep={(s) => {setSelectedStep(s);setPopPos(null);}}
                onDragStartStep={onDragStartStep} onDragEndStep={onDragEndStep}
                draggingId={draggingStep ? draggingStep.id : null} />

              <Gantt
                rev={rev} zoom={t.zoom} blockStyle={t.blockStyle} linkStyle={t.linkStyle}
                showDone={t.showDone} showGhost={t.showGhost}
                selectedStep={selectedStep} selectedProject={selectedProject}
                onSelectNode={selectNode} onClearSelection={clearSel}
                onMarkDone={markDone} onUnplan={unplan} onDrop={dropPlan}
                draggingStep={draggingStep} scrollApi={scrollApi}
                onDragStartStep={onDragStartStep} onDragEndStep={onDragEndStep} />
            </div>
          </div>
        </div>
      </main>

      {/* node detail popover */}
      {selectedStep && popPos &&
      <NodePop step={selectedStep} pos={popPos} onClose={clearSel}
      onMarkDone={markDone} onUnplan={unplan} onUnplanProject={unplanProject}
      onGoProject={(pid) => {setProjectFilter(pid);flash(`Gefilterd op project ${pid}`);}}
      onSetDeadline={setDeadline} />
      }

      {toast && <div className="plan-toast">{toast}</div>}

      <TweaksPanel>
        <TweakSection label="Weergave" />
        <TweakRadio label="Thema" value={t.theme} options={["light", "dark"]} onChange={(v) => setTweak("theme", v)} />
        <TweakRadio label="Dichtheid" value={t.density} options={["compact", "comfortable"]} onChange={(v) => setTweak("density", v)} />
        <TweakRadio label="Zoom" value={t.zoom} options={["day", "week", "month"]} onChange={(v) => setTweak("zoom", v)} />

        <TweakSection label="Gantt-stijl (varianten)" />
        <TweakRadio label="Blokstijl" value={t.blockStyle} options={["rand", "vol", "zacht"]} onChange={(v) => setTweak("blockStyle", v)} />
        <TweakRadio label="Projectkoppeling" value={t.linkStyle} options={["lijnen", "gloed", "beide"]} onChange={(v) => setTweak("linkStyle", v)} />
        <TweakColor label="Accent" value={t.accent} options={["#2d6df6", "#0f1116", "#117a45", "#c2410c"]} onChange={(v) => setTweak("accent", v)} />

        <TweakSection label="Overlays" />
        <TweakToggle label="Prognose (offertes)" value={t.showGhost} onChange={(v) => setTweak("showGhost", v)} />
        <TweakToggle label="Gereed tonen" value={t.showDone} onChange={(v) => setTweak("showDone", v)} />
      </TweaksPanel>
    </div>);

}

// ---- KPI card -------------------------------------------------------------
function Kpi({ icon, label, val, unit, sub, bar, variant }) {
  return (
    <div className={"kpi" + (variant ? " " + variant : "")}>
      <div className="kpi-top">
        <span className="kpi-ico"><Ic d={icon} size={14} /></span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-val">{val}{unit && <span className="u">{unit}</span>}</div>
      {bar && <div className="bar"><i className={bar.status} style={{ width: Math.min(100, bar.pct) + "%" }}></i></div>}
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>);

}

// ---- node detail popover --------------------------------------------------
function NodePop({ step: s, pos, onClose, onMarkDone, onUnplan, onUnplanProject, onGoProject, onSetDeadline }) {
  const P = window.PLAN;
  const proj = P.PROJECT_MAP[s.projectId];
  const [editDl, setEditDl] = React.useState(false);
  const achter = !s.gereed && s.planDay != null && s.planDay < P.TODAY_IDX;
  const warn = P.volgordeWarn(s);

  function dlISO(idx) {
    const d = P.dateFromIdx(idx);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function onDlChange(e) {
    const d = new Date(e.target.value + "T00:00:00");
    const idx = Math.round((d - P.WINDOW_START) / 86400000);
    onSetDeadline(s.projectId, idx);setEditDl(false);
  }

  return (
    <div className="node-pop" style={{ left: pos.x, top: pos.y, "--c": s.kleur }}>
      <div className="np-head">
        <button className="icon-btn np-close" onClick={onClose}><Ic d={Icon.close} size={14} /></button>
        <div className="np-proj">
          <span className="d"></span>
          <span className="id">{s.projectId}</span>
        </div>
        <div className="np-title">{s.artikel}</div>
        <div className="np-klant">{s.klant}</div>
        <div className="np-badges">
          {s.gereed ?
          <span className="badge ok sm"><span className="dot"></span>Gereed</span> :
          achter ?
          <span className="badge danger sm"><span className="dot"></span>Achterstand</span> :
          s.planDay != null ?
          <span className="badge info sm"><span className="dot"></span>Gepland</span> :
          <span className="badge warn sm"><span className="dot"></span>Te plannen</span>}
          {s.isPlaceholder && <span className="badge warn sm">~ schatting</span>}
          {warn && <span className="badge warn sm">Volgorde</span>}
        </div>
      </div>

      <div className="np-rows">
        <div className="np-row"><span className="k">Stap</span><span className="v">{s.naam}</span></div>
        <div className="np-row"><span className="k">Volgorde</span><span className="v mono">{s.volgorde} / {proj.stapTotaal}</span></div>
        <div className="np-row"><span className="k">Machine</span><span className="v">{s.planMachine ? P.MACHINE_NAAM[s.planMachine] : "—"}</span></div>
        <div className="np-row"><span className="k">Gepland op</span><span className="v">{s.planDay != null ? P.fmtDay(s.planDay) : "niet ingepland"}</span></div>
        <div className="np-row"><span className="k">Duur</span><span className="v mono">{s.isPlaceholder ? "~" : ""}{P.fmtDur(s.duurMin)} · {s.qty} st</span></div>
        <div className="np-row">
          <span className="k">Deadline</span>
          {editDl ?
          <input type="date" defaultValue={dlISO(proj.deadline)} onChange={onDlChange} autoFocus
          style={{ height: 26, fontSize: 12, fontFamily: "var(--font-mono)", border: "1px solid var(--accent)", borderRadius: 4, background: "var(--bg-input)", color: "var(--text)" }} /> :
          <span className="v mono" style={{ cursor: "pointer", borderBottom: "1px dashed var(--text-3)" }}
          onClick={() => setEditDl(true)}>{P.fmtDay(proj.deadline)}</span>}
        </div>
        {s.gereed && <div className="np-row"><span className="k">Gereed door</span><span className="v">{s.gereedDoor} · {s.gereedOp}</span></div>}
      </div>

      <div className="np-actions">
        <button className="btn primary" onClick={() => onGoProject(s.projectId)}>
          <Ic d={Icon.arrowRight} size={13} /> Ga naar project
        </button>
        {!s.gereed && s.planDay != null &&
        <button className="btn" onClick={() => onMarkDone(s)} title="Gereed melden">
            <Ic d={Icon.check} size={13} /> Gereed
          </button>
        }
        {s.planDay != null &&
        <button className="icon-btn" style={{ width: 32 }} onClick={() => onUnplan(s)} title="Terug naar backlog">
            <Ic d={Icon.close} size={14} />
          </button>
        }
      </div>
      <div className="np-foot">
        <button className="bl-link" onClick={() => onUnplanProject(s.projectId)}
        style={{ background: "none", border: 0, color: "var(--text-3)", fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 6, padding: 0 }}>
          <Ic d={Icon.undo} size={12} /> Hele order terugzetten naar backlog
        </button>
      </div>
    </div>);

}

// color helpers
function hexA(hex, a) {
  const h = hex.replace("#", "");const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return `rgba(${parseInt(n.slice(0, 2), 16)}, ${parseInt(n.slice(2, 4), 16)}, ${parseInt(n.slice(4, 6), 16)}, ${a})`;
}
function shd(hex, p) {
  const h = hex.replace("#", "");const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const a = (c) => Math.max(0, Math.min(255, Math.round(c * (100 + p) / 100)));
  const r = a(parseInt(n.slice(0, 2), 16)),g = a(parseInt(n.slice(2, 4), 16)),b = a(parseInt(n.slice(4, 6), 16));
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

ReactDOM.createRoot(document.getElementById("root")).render(<PlanApp />);