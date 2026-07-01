// Kanban board — machine columns × workday rows, capacity meters + overbook
// warnings, drag-to-plan, and a VS Code–style vertical minimap that doubles
// as the scrollbar (between the board and the details panel).

const KB_DENS = {
  compact: { cardH: 110, gap: 5, pad: 8, minRow: 122, colW: 140 },
  ruim:    { cardH: 132, gap: 7, pad: 10, minRow: 146, colW: 158 },
};
const KB_RULER_H = 56;
const KB_WEEKBAND_H = 26;
const KB_STRICT = {
  soepel:  { warn: 1.0, over: 1.18 },
  normaal: { warn: 0.85, over: 1.0 },
  streng:  { warn: 0.7, over: 0.9 },
};

function kbComputeLayout(cards, densKey, strictKey) {
  const K = window.KB;
  const d = KB_DENS[densKey];
  const th = KB_STRICT[strictKey];
  const capBlock = 18; // cap meter height + margin

  const cellMap = {};
  for (const c of cards) {
    if (c.planDayIdx == null || c.planMachine == null) continue;
    (cellMap[c.planDayIdx + ":" + c.planMachine] ||= []).push(c);
  }
  const rowMaxN = new Array(K.DAYS.length).fill(0);
  for (const key in cellMap) {
    cellMap[key].sort((a, b) =>
      a.orderId === b.orderId ? a.volgorde - b.volgorde : a.orderId.localeCompare(b.orderId));
    const day = +key.split(":")[0];
    if (cellMap[key].length > rowMaxN[day]) rowMaxN[day] = cellMap[key].length;
  }

  const rowH = new Array(K.DAYS.length);
  const rowAbsTop = new Array(K.DAYS.length);
  const dayLoad = new Array(K.DAYS.length).fill(0);
  const miniBlocks = [];
  const overMarks = [];
  const weekLines = [];
  let todayAbs = 0;
  let y = KB_RULER_H + 1;

  for (let w = 0; w < K.WEEKS; w++) {
    weekLines.push(y);
    y += KB_WEEKBAND_H + 1;
    for (let dd = 0; dd < 5; dd++) {
      const dayIdx = w * 5 + dd;
      const n = rowMaxN[dayIdx];
      const contentH = n > 0 ? d.pad * 2 + capBlock + n * d.cardH + (n - 1) * d.gap : 0;
      const h = Math.max(d.minRow, contentH);
      rowH[dayIdx] = h;
      rowAbsTop[dayIdx] = y;

      K.MACHINES.forEach((m, mi) => {
        const cell = cellMap[dayIdx + ":" + m.id];
        if (!cell || !cell.length) return;
        const load = cell.reduce((s, c) => s + c.duurMin, 0);
        dayLoad[dayIdx] += load;
        const cellTop = y + d.pad + capBlock;
        cell.forEach((c, si) => {
          miniBlocks.push({ mi, color: c.kleur, yAbs: cellTop + si * (d.cardH + d.gap), hAbs: d.cardH });
        });
        if (load / m.capMin > th.over) overMarks.push({ mi, yAbs: y + 5 });
      });

      if (dayIdx === K.TODAY_IDX) todayAbs = y;
      y += h + 1;
    }
  }

  return { cellMap, rowH, rowAbsTop, dayLoad, totalAbs: y, miniBlocks, overMarks, weekLines, todayAbs, d, th };
}

// ── Minimap ────────────────────────────────────────────────────────────────
function KanbanMinimap({ layout, metrics, miniRef, onScrollTo, onDragViewport }) {
  const { miniH, scrollH, scrollTop, viewH } = metrics;
  const S = scrollH > 0 ? miniH / scrollH : 0;
  const usableW = 70, leftPad = 3;
  const nM = window.KB.MACHINES.length;
  const cellW = usableW / nM;

  const vpTop = scrollTop * S;
  const vpH = Math.max(14, viewH * S);

  const grabRef = React.useRef(0);

  function onMapDown(e) {
    if (e.target.classList.contains("kb-mini-viewport")) return;
    const rect = miniRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    onScrollTo((y / (S || 1)) - viewH / 2);
  }
  function onVpDown(e) {
    e.stopPropagation();
    const rect = miniRef.current.getBoundingClientRect();
    grabRef.current = (e.clientY - rect.top) - vpTop;
    const move = (ev) => {
      const yy = (ev.clientY - rect.top) - grabRef.current;
      onDragViewport(yy / (S || 1));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="kb-minimap" ref={miniRef} onPointerDown={onMapDown} title="Overzicht — sleep of klik om te scrollen">
      <div className="kb-minimap-inner">
        {layout.weekLines.map((y, i) => (
          <div key={"w" + i} className="kb-mini-weekline" style={{ top: y * S }} />
        ))}
        {layout.miniBlocks.map((b, i) => (
          <div key={i} className="kb-mini-card" style={{
            left: leftPad + b.mi * cellW,
            top: b.yAbs * S,
            width: Math.max(2, cellW - 1),
            height: Math.max(1.5, b.hAbs * S),
            background: b.color,
          }} />
        ))}
        {layout.overMarks.map((o, i) => (
          <div key={"o" + i} className="kb-mini-over" style={{
            left: leftPad + (o.mi + 0.5) * cellW - 2,
            top: o.yAbs * S, width: 4, height: 4,
          }} />
        ))}
        <div className="kb-mini-today" style={{ top: layout.todayAbs * S }} />
        <div className="kb-mini-viewport" style={{ top: vpTop, height: vpH }} onPointerDown={onVpDown} />
      </div>
    </div>
  );
}

// ── Board ─────────────────────────────────────────────────────────────────
function KanbanBoard({
  cards, rev, dens, strictness, selStyle, selectedId, selectedOrder,
  onSelect, draggingCard, onDragStart, onDragEnd, onDrop, scrollApi,
}) {
  const K = window.KB;
  const layout = React.useMemo(
    () => kbComputeLayout(cards, dens, strictness),
    [cards, dens, strictness, rev]
  );
  const d = layout.d;
  const th = layout.th;

  const dimOthers = selStyle === "dimmen" || selStyle === "lijnen";
  const ringLinked = selStyle === "markeren" || selStyle === "lijnen";

  const scrollRef = React.useRef(null);
  const innerRef = React.useRef(null);
  const miniRef = React.useRef(null);
  const [metrics, setMetrics] = React.useState({ scrollTop: 0, viewH: 0, scrollH: 0, miniH: 0, viewW: 0 });
  const [conn, setConn] = React.useState(null);
  const [dropCell, setDropCell] = React.useState(null);
  const didInit = React.useRef(false);

  const measure = React.useCallback(() => {
    const s = scrollRef.current, m = miniRef.current;
    if (!s || !m) return;
    setMetrics({ scrollTop: s.scrollTop, viewH: s.clientHeight, scrollH: s.scrollHeight, miniH: m.clientHeight, viewW: s.clientWidth });
  }, []);

  React.useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (scrollRef.current) ro.observe(scrollRef.current);
    if (miniRef.current) ro.observe(miniRef.current);
    return () => ro.disconnect();
  }, [measure]);

  React.useEffect(() => {
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [layout, measure]);

  // jump to today on first paint
  React.useEffect(() => {
    if (didInit.current || !scrollRef.current || layout.totalAbs < 10) return;
    didInit.current = true;
    scrollRef.current.scrollTop = Math.max(0, layout.todayAbs - KB_RULER_H - 70);
    requestAnimationFrame(measure);
  }, [layout, measure]);

  React.useEffect(() => {
    if (scrollApi) scrollApi.current = {
      toToday: () => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollTo({ top: Math.max(0, layout.todayAbs - KB_RULER_H - 70), behavior: "smooth" });
      },
    };
  }, [layout, scrollApi]);

  // measure connector points for the selected order (bezier lines)
  React.useEffect(() => {
    if (!selectedOrder || selStyle !== "lijnen") { setConn(null); return; }
    const inner = innerRef.current;
    if (!inner) { setConn(null); return; }
    const base = inner.getBoundingClientRect();
    const sel = (window.CSS && CSS.escape) ? CSS.escape(selectedOrder) : selectedOrder;
    const els = [...inner.querySelectorAll('.kb-cell .kc[data-order-id="' + sel + '"]')];
    if (els.length < 1) { setConn(null); return; }
    const pts = els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        vol: +el.dataset.vol,
        x: r.left - base.left + r.width / 2,
        y: r.top - base.top + r.height / 2,
      };
    }).sort((a, b) => a.vol - b.vol);
    setConn(pts);
  }, [selectedOrder, selStyle, layout, metrics.scrollH, metrics.viewH, metrics.viewW]);

  function onScroll() {
    if (scrollRef.current) setMetrics((m) => ({ ...m, scrollTop: scrollRef.current.scrollTop }));
  }
  function scrollTo(top) {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, Math.min(top, layout.totalAbs));
  }

  const styleVars = {
    "--label-w": "128px",
    "--col-w": d.colW + "px",
    "--ruler-h": KB_RULER_H + "px",
    "--min-row": d.minRow + "px",
    "--card-h": d.cardH + "px",
    "--card-gap": d.gap + "px",
    "--cell-pad": d.pad + "px",
  };

  function cellDragOver(e, dayIdx, mId) {
    if (!draggingCard) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dropCell || dropCell.day !== dayIdx || dropCell.m !== mId) setDropCell({ day: dayIdx, m: mId });
  }
  function cellDrop(e, dayIdx, mId) {
    e.preventDefault();
    setDropCell(null);
    onDrop(mId, dayIdx);
  }

  // build week → days grouping
  const weeks = [];
  for (let w = 0; w < K.WEEKS; w++) weeks.push(w);

  return (
    <div className="kb-board-area">
      <div className="kb-board-scroll" ref={scrollRef} onScroll={onScroll}
        onDragEnd={() => setDropCell(null)}>
        <div className="kb-board kb-board-inner" style={styleVars} ref={innerRef}>
          {/* machine header */}
          <div className="kb-ruler">
            <div className="kb-ruler-corner">
              <span className="t">Dag / machine</span>
              <span className="s">{K.WEEKS} wk vooruit</span>
            </div>
            {K.MACHINES.map((m) => (
              <div key={m.id} className={"kb-mhead" + (draggingCard ? "" : "")}>
                <div className="kb-mhead-top">
                  <span className="ico"><Ic d={Icon[m.icon] || Icon.cpu} size={13} /></span>
                  <span className="nm">{m.naam}</span>
                </div>
                <span className="sb">{m.sub}</span>
                <span className="cap">{K.dur(m.capMin)}/dag</span>
              </div>
            ))}
          </div>

          {/* rows grouped by week */}
          {weeks.map((w) => {
            const firstDay = w * 5;
            const f = K.fmtDay(firstDay);
            const l = K.fmtDay(firstDay + 4);
            return (
              <React.Fragment key={"wk" + w}>
                <div className="kb-weekrow">
                  <div className="kb-weekband">
                    <span className="wk">wk {f.wk}</span>
                  </div>
                  <div className="fill" style={{ paddingLeft: 14 }}>
                    <span className="rng" style={{ fontSize: 11, color: "var(--text-3)" }}>
                      {f.dnum} {f.mon} – {l.dnum} {l.mon}
                    </span>
                  </div>
                </div>

                {[0, 1, 2, 3, 4].map((dd) => {
                  const dayIdx = firstDay + dd;
                  const fm = K.fmtDay(dayIdx);
                  const isToday = dayIdx === K.TODAY_IDX;
                  return (
                    <div key={dayIdx} className={"kb-row" + (isToday ? " today" : "")}>
                      <div className="kb-daylabel">
                        <div className="dl-top">
                          <span className="dnum">{fm.dnum}</span>
                          <span className="dow">{fm.dow}</span>
                        </div>
                        <span className="mon">{fm.mon}</span>
                        {isToday && <span className="today-tag">Vandaag</span>}
                        {layout.dayLoad[dayIdx] > 0 && (
                          <span className="dl-load">Σ {K.dur(layout.dayLoad[dayIdx])}</span>
                        )}
                      </div>

                      {K.MACHINES.map((m) => {
                        const cell = layout.cellMap[dayIdx + ":" + m.id] || [];
                        const load = cell.reduce((s, c) => s + c.duurMin, 0);
                        const ratio = load / m.capMin;
                        const over = ratio > th.over;
                        const warn = !over && ratio > th.warn;
                        const isDrop = dropCell && dropCell.day === dayIdx && dropCell.m === m.id;
                        return (
                          <div
                            key={m.id}
                            className={"kb-cell" + (over ? " over" : "") + (isDrop ? " dropok" : "")}
                            onDragOver={(e) => cellDragOver(e, dayIdx, m.id)}
                            onDragLeave={(e) => { if (e.currentTarget === e.target && isDrop) setDropCell(null); }}
                            onDrop={(e) => cellDrop(e, dayIdx, m.id)}
                          >
                            {cell.length > 0 && (
                              <div className="kb-cap">
                                <div className="bar"><i className={over ? "over" : warn ? "warn" : "ok"}
                                  style={{ width: Math.min(100, ratio * 100) + "%" }} /></div>
                                <span className={"lab" + (over ? " over" : warn ? " warn" : "")}>
                                  {K.dur(load)}/{K.dur(m.capMin)}
                                </span>
                                {over && <span className="warn-ico" title="Dag overboekt — capaciteit overschreden"><Ic d={Icon.warning} size={13} /></span>}
                                {warn && <span className="warn-ico warn" title="Bijna vol"><Ic d={Icon.warning} size={12} /></span>}
                              </div>
                            )}
                            <div className="kb-cell-cards">
                              {cell.map((c) => (
                                <KanbanCard
                                  key={c.id} card={c} dens={dens} compact={false}
                                  selected={selectedId === c.id}
                                  dimmed={selectedOrder && dimOthers && c.orderId !== selectedOrder}
                                  linked={selectedOrder && ringLinked && c.orderId === selectedOrder && c.id !== selectedId}
                                  onSelect={onSelect}
                                  onDragStart={onDragStart} onDragEnd={onDragEnd}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}

          {conn && conn.length > 0 && (() => {
            const color = K.ORDER_MAP[selectedOrder] ? K.ORDER_MAP[selectedOrder].kleur : "var(--accent)";
            let dPath = `M ${conn[0].x.toFixed(1)},${conn[0].y.toFixed(1)}`;
            for (let i = 1; i < conn.length; i++) {
              const a = conn[i - 1], b = conn[i];
              const cx = Math.max(46, Math.abs(b.x - a.x) * 0.45);
              dPath += ` C ${(a.x + cx).toFixed(1)},${a.y.toFixed(1)} ${(b.x - cx).toFixed(1)},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
            }
            return (
              <svg className="kb-connectors" style={{ color }}>
                <path className="base" d={dPath} stroke={color} />
                <path className="flow" d={dPath} stroke={color} />
                {conn.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={i === 0 || i === conn.length - 1 ? 4.5 : 3.5} fill={color} />
                ))}
              </svg>
            );
          })()}
        </div>
      </div>

      <KanbanMinimap
        layout={layout} metrics={metrics} miniRef={miniRef}
        onScrollTo={scrollTo} onDragViewport={scrollTo}
      />
    </div>
  );
}

Object.assign(window, { KanbanBoard, KanbanMinimap, kbComputeLayout, KB_STRICT, KB_DENS });
