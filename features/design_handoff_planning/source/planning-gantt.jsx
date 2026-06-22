// Gantt timeline — machine rows × continuous time. Nodes sized by duration,
// colored by project. Zoom, pan, drag-drop, selection linking, ghost overlay.

const PX_PER_DAY = { day: 176, week: 68, month: 24 };
const NODE_H = 42, LANE_GAP = 5, LANE_PAD = 7, GHOST_H = 28;

function Gantt(props) {
  const {
    rev, zoom, blockStyle, linkStyle, showDone, showGhost,
    selectedStep, selectedProject, onSelectNode, onClearSelection,
    onMarkDone, onUnplan, onDrop, draggingStep, scrollApi,
    onDragStartStep, onDragEndStep,
  } = props;
  const P = window.PLAN;
  const { MACHINES, TOTAL_DAYS, TODAY_IDX, MAX_MIN, isWeekend, weekNr,
          fmtDayShort, fmtDur, ghostLoad, machineWeekLoad, capStatus } = P;

  const pxDay = PX_PER_DAY[zoom];
  const trackW = TOTAL_DAYS * pxDay;
  const labelW = 196;
  const weeks = TOTAL_DAYS / 7;

  const scrollRef = React.useRef(null);
  const [drop, setDrop] = React.useState(null); // {machine, day}

  // ---- layout pass: lanes per machine + node positions -------------------
  const layout = React.useMemo(() => {
    const rows = [];
    let yCursor = 0;
    MACHINES.forEach((m) => {
      const steps = P.STEPS.filter((s) => s.planDay != null && s.planMachine === m.id
        && (showDone || !s.gereed));
      steps.sort((a, b) => a.planDay - b.planDay || a.volgorde - b.volgorde);
      // greedy lane packing on day intervals
      const laneEnds = []; // end-day per lane
      const pos = {};
      steps.forEach((s) => {
        const durDays = s.duurMin / MAX_MIN;
        const start = s.planDay, end = s.planDay + durDays;
        let lane = laneEnds.findIndex((e) => e <= start + 0.001);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(end); }
        else laneEnds[lane] = end;
        pos[s.id] = {
          lane,
          left: s.planDay * pxDay + 3,
          width: Math.max(durDays * pxDay - 6, 20),
        };
      });
      const nLanes = Math.max(laneEnds.length, 1);
      const hasGhost = showGhost && [...Array(weeks)].some((_, w) => ghostLoad(m.id, w) > 0) && m.id !== "geen";
      const realH = LANE_PAD * 2 + nLanes * NODE_H + (nLanes - 1) * LANE_GAP;
      const height = realH + (hasGhost ? GHOST_H + 4 : 0);
      rows.push({ machine: m, steps, pos, nLanes, height, top: yCursor, realH, hasGhost });
      yCursor += height;
    });
    return { rows, totalH: yCursor };
  }, [zoom, showDone, showGhost, pxDay, rev]);

  // expose scroll-to-today + auto-center today on mount / zoom change
  React.useEffect(() => {
    const toToday = () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ left: Math.max(0, TODAY_IDX * pxDay - 220), behavior: "smooth" });
    };
    if (scrollApi) scrollApi.current = { toToday };
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, TODAY_IDX * pxDay - 220);
  }, [pxDay]);

  const rowTopById = {};
  layout.rows.forEach((r) => { rowTopById[r.machine.id] = r; });

  function laneTop(lane) { return LANE_PAD + lane * (NODE_H + LANE_GAP); }

  // ---- connectors for selected project -----------------------------------
  const connectors = React.useMemo(() => {
    if (!selectedProject || (linkStyle !== "lijnen" && linkStyle !== "beide")) return null;
    const pts = [];
    layout.rows.forEach((r) => {
      r.steps.forEach((s) => {
        if (s.projectId !== selectedProject) return;
        const p = r.pos[s.id];
        pts.push({
          x: p.left + p.width / 2,
          y: r.top + laneTop(p.lane) + NODE_H / 2,
          volgorde: s.volgorde, day: s.planDay,
        });
      });
    });
    pts.sort((a, b) => a.day - b.day || a.volgorde - b.volgorde);
    return pts;
  }, [selectedProject, linkStyle, layout]);

  // ---- drag over lane ----------------------------------------------------
  function onLaneDragOver(e, machineId) {
    if (!draggingStep) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
    let day = Math.floor(x / pxDay);
    day = Math.max(0, Math.min(TOTAL_DAYS - 1, day));
    if (!drop || drop.machine !== machineId || drop.day !== day) setDrop({ machine: machineId, day });
  }
  function onLaneDrop(e, machineId) {
    if (!draggingStep) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
    let day = Math.max(0, Math.min(TOTAL_DAYS - 1, Math.floor(x / pxDay)));
    onDrop(draggingStep, machineId, day);
    setDrop(null);
  }
  React.useEffect(() => { if (!draggingStep) setDrop(null); }, [draggingStep]);

  // ---- ruler -------------------------------------------------------------
  const dayCells = [];
  for (let i = 0; i < TOTAL_DAYS; i++) {
    const d = P.dateFromIdx(i);
    const cls = "ruler-day" + (isWeekend(i) ? " weekend" : "") + (i === TODAY_IDX ? " today" : "")
      + (zoom === "month" ? " compact" : "");
    dayCells.push(
      <div key={i} className={cls} style={{ width: pxDay }}>
        {zoom !== "month" && <span className="dn">{P.DAG[d.getDay()]}</span>}
        <span className="dd">{d.getDate()}</span>
      </div>
    );
  }
  const weekCells = [];
  for (let w = 0; w < weeks; w++) {
    const startIdx = w * 7;
    weekCells.push(
      <div key={w} className="ruler-week" style={{ width: pxDay * 7 }}>
        <span className="wk">wk {weekNr(startIdx)}</span>
        {fmtDayShort(startIdx)} – {fmtDayShort(startIdx + 6)}
      </div>
    );
  }

  return (
    <div className={"gantt" + (selectedProject ? " has-selection" : "")}
         data-blockstyle={blockStyle} data-linkstyle={linkStyle}>
      <div className="gantt-scroll" ref={scrollRef}
           onClick={(e) => { if (e.target.classList.contains("lane") || e.target.classList.contains("gantt-rows")) onClearSelection(); }}>
        <div className="gantt-inner" style={{ width: labelW + trackW }}>
          {/* ruler */}
          <div className="gantt-ruler">
            <div className="ruler-corner"><span className="t">Machine</span></div>
            <div className="ruler-track" style={{ width: trackW }}>
              <div className="ruler-weeks">{weekCells}</div>
              <div className="ruler-days">{dayCells}</div>
            </div>
          </div>

          {/* rows */}
          <div className="gantt-rows" style={{ position: "relative" }}>
            {layout.rows.map((r) => (
              <GanttRow
                key={r.machine.id} row={r} pxDay={pxDay} weeks={weeks} labelW={labelW}
                trackW={trackW} laneTop={laneTop}
                blockStyle={blockStyle} linkStyle={linkStyle}
                selectedStep={selectedStep} selectedProject={selectedProject}
                onSelectNode={onSelectNode} onMarkDone={onMarkDone} onUnplan={onUnplan}
                draggingStep={draggingStep} drop={drop} showGhost={showGhost}
                onLaneDragOver={onLaneDragOver} onLaneDrop={onLaneDrop}
                onDragStartStep={onDragStartStep} onDragEndStep={onDragEndStep} />
            ))}

            {/* connector overlay */}
            {connectors && connectors.length > 1 && (
              <svg className="gantt-connectors"
                   style={{ left: labelW, top: 0, width: trackW, height: layout.totalH }}
                   width={trackW} height={layout.totalH}>
                <path
                  d={connectors.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
                  stroke={P.PROJECT_MAP[selectedProject].kleur}
                  strokeDasharray="1 0" />
                {connectors.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="3.5"
                          fill="var(--bg-2)" stroke={P.PROJECT_MAP[selectedProject].kleur} />
                ))}
              </svg>
            )}

            {/* today line */}
            <div className="today-line" style={{ left: labelW + TODAY_IDX * pxDay, height: layout.totalH }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- single machine row ---------------------------------------------------
function GanttRow(props) {
  const { row, pxDay, weeks, trackW, laneTop, blockStyle, linkStyle,
          selectedStep, selectedProject, onSelectNode, onMarkDone, onUnplan,
          draggingStep, drop, showGhost, onLaneDragOver, onLaneDrop,
          onDragStartStep, onDragEndStep } = props;
  const P = window.PLAN;
  const { machine: m } = row;
  const isDropRow = drop && drop.machine === m.id;

  // day grid + weekend shading
  const grid = [];
  for (let i = 0; i < P.TOTAL_DAYS; i++) {
    grid.push(
      <div key={i}
        className={"lane-daycol" + (P.isWeekend(i) ? " weekend" : "")}
        style={{ left: i * pxDay, width: pxDay }}></div>
    );
  }
  const weekLines = [];
  for (let w = 1; w < weeks; w++) {
    weekLines.push(<div key={w} className="lane-weekline" style={{ left: w * 7 * pxDay }}></div>);
  }

  return (
    <div className="gantt-row" style={{ height: row.height }}>
      <div className={"row-label" + (m.id === "geen" ? " geen" : "")}>
        <div className="row-label-top">
          <span className="row-ico"><Ic d={Icon[m.icon] || Icon.cpu} size={14} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="nm">{m.naam}</div>
            <div className="sb">{m.sub}</div>
          </div>
        </div>
        {m.id !== "geen" && (
          <div className="cap-bars">
            {[...Array(weeks)].map((_, w) => {
              const load = P.machineWeekLoad(m.id, w);
              const cap = P.EFFECTIEVE_MIN * P.WERKDAGEN;
              const status = P.capStatus(load);
              const pct = Math.min(100, Math.round((load / cap) * 100));
              return (
                <div key={w} className="cap-bar" title={`wk ${P.weekNr(w * 7)}: ${(load / 60).toFixed(1)}u / ${(cap / 60).toFixed(1)}u`}>
                  <i className={status} style={{ width: pct + "%" }}></i>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={"lane" + (isDropRow ? " drop-active" : "")}
           style={{ width: trackW, height: row.height }}
           onDragOver={(e) => onLaneDragOver(e, m.id)}
           onDrop={(e) => onLaneDrop(e, m.id)}>
        <div className="lane-grid">{grid}{weekLines}</div>

        {/* ghost overlay blocks */}
        {showGhost && row.hasGhost && [...Array(weeks)].map((_, w) => {
          const g = P.ghostLoad(m.id, w);
          if (g <= 0) return null;
          const durDays = g / P.MAX_MIN;
          return (
            <div key={"g" + w} className="ghost-node"
                 style={{
                   "--c": "var(--accent)",
                   left: (w * 7 + 0.15) * pxDay, width: Math.max(durDays * pxDay, 40),
                   top: row.realH, height: GHOST_H,
                 }}>
              <span className="gn">Prognose · {(g / 60).toFixed(1)}u</span>
              <span className="gm">uit offertes</span>
            </div>
          );
        })}

        {/* nodes */}
        {row.steps.map((s) => {
          const p = row.pos[s.id];
          const isSel = selectedStep && selectedStep.id === s.id;
          const linked = selectedProject && s.projectId === selectedProject;
          const warn = P.volgordeWarn(s);
          const achter = !s.gereed && s.planDay < P.TODAY_IDX;
          return (
            <div key={s.id}
                 className={"node" + (s.gereed ? " done" : "") + (s.isPlaceholder ? " placeholder" : "")
                   + (isSel ? " is-selected" : "") + (linked ? " proj-linked" : "")
                   + (achter ? " achterstand" : "")
                   + (draggingStep && draggingStep.id === s.id ? " dragging" : "")}
                 style={{
                   "--c": s.kleur,
                   left: p.left, width: p.width,
                   top: laneTop(p.lane), height: NODE_H,
                 }}
                 draggable={!s.gereed}
                 onDragStart={(e) => { e.stopPropagation(); onDragStartStep(e, s); }}
                 onDragEnd={onDragEndStep}
                 onClick={(e) => { e.stopPropagation(); onSelectNode(s, e); }}>
              <div className="nname">
                {s.gereed && <Ic className="check" d={Icon.check} size={11} style={{ marginRight: 3 }} />}
                {(s.artikel.split("· ")[1] || s.artikel)}
              </div>
              <div className="nmeta">
                {warn && <span className="warn-dot" title="Volgorde-waarschuwing"></span>}
                <span className="ndur">{s.isPlaceholder && <span className="tilde">~</span>}{P.fmtDur(s.duurMin)}</span>
                <span>·</span>
                <span>{s.projectId}</span>
              </div>
              {!s.gereed && (
                <div className="node-actions">
                  <button className="na" title="Gereed melden"
                          onClick={(e) => { e.stopPropagation(); onMarkDone(s); }}>
                    <Ic d={Icon.check} size={12} />
                  </button>
                  <button className="na" title="Terug naar backlog"
                          onClick={(e) => { e.stopPropagation(); onUnplan(s); }}>
                    <Ic d={Icon.close} size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* drop preview ghost */}
        {isDropRow && draggingStep && (() => {
          const durDays = draggingStep.duurMin / P.MAX_MIN;
          return (
            <div className="drop-ghost"
                 style={{ left: drop.day * pxDay + 3, width: Math.max(durDays * pxDay - 6, 36),
                          top: LANE_PAD, height: NODE_H }}>
              {P.fmtDayShort(drop.day)}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

Object.assign(window, { Gantt });
