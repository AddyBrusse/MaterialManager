// Voorraad screen — dense stock table with filters, stats, drawer
const { useState, useMemo } = React;

function statusFor(it) {
  if (it.voorraad === 0) return { tag: "uit", label: "Uit", cls: "danger" };
  if (it.voorraad < it.min) return { tag: "laag", label: "Laag", cls: "warn" };
  if (it.voorraad >= it.max * 0.85) return { tag: "vol", label: "Vol", cls: "info" };
  return { tag: "ok", label: "Op voorraad", cls: "ok" };
}

function Voorraad({ items, accent }) {
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState({ key: "naam", dir: "asc" });
  const [selected, setSelected] = useState(new Set());
  const [drawerItem, setDrawerItem] = useState(null);

  const filtered = useMemo(() => {
    let f = items;
    if (q) {
      const Q = q.toLowerCase();
      f = f.filter(it =>
        it.naam.toLowerCase().includes(Q) ||
        it.id.toLowerCase().includes(Q) ||
        it.grade.toLowerCase().includes(Q) ||
        it.locatie.toLowerCase().includes(Q)
      );
    }
    if (grade) f = f.filter(it => it.grade === grade);
    if (type) f = f.filter(it => it.type === type);
    if (status) f = f.filter(it => statusFor(it).tag === status);

    f = [...f].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (typeof av === "number") return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc" ? String(av).localeCompare(bv) : String(bv).localeCompare(av);
    });
    return f;
  }, [items, q, grade, type, status, sort]);

  const stats = useMemo(() => {
    const totalKg = items.reduce((s, it) => s + it.voorraad * it.kg, 0);
    const skus = items.length;
    const low = items.filter(it => it.voorraad > 0 && it.voorraad < it.min).length;
    const out = items.filter(it => it.voorraad === 0).length;
    return { totalKg, skus, low, out };
  }, [items]);

  const toggleSort = (key) => {
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  };

  const allSelected = filtered.length > 0 && filtered.every(it => selected.has(it.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) filtered.forEach(it => next.delete(it.id));
    else filtered.forEach(it => next.add(it.id));
    setSelected(next);
  };
  const toggleOne = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const fmtNum = (n) => new Intl.NumberFormat("nl-NL").format(Math.round(n));

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Voorraad</div>
          <div className="page-sub">Actuele stand van alle materialen op locatie</div>
        </div>
        <div className="page-actions">
          <button className="btn">
            <Ic d={Icon.download} size={14} />
            Exporteer
          </button>
          <button className="btn">
            <Ic d={Icon.scan} size={14} />
            Scan
          </button>
          <button className="btn primary">
            <Ic d={Icon.plus} size={14} />
            Mutatie
          </button>
        </div>
      </div>

      <div className="page-sub-banner">
        <Ic d={Icon.box} size={13} />
        <span>Elke regel vertegenwoordigt een unieke partij — onderscheiden door <strong>smeltnummer</strong>, <strong>lengte</strong> en <strong>afwerking</strong>.</span>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-lbl"><Ic d={Icon.pkg} size={13} />Totaal gewicht</div>
          <div className="stat-val">{fmtNum(stats.totalKg / 1000)} <span style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 400 }}>ton</span></div>
          <div className="stat-foot"><span className="delta-up">↗ 3,2%</span> <span>t.o.v. vorige week</span></div>
        </div>
        <div className="stat">
          <div className="stat-lbl"><Ic d={Icon.layers} size={13} />Unieke artikelen</div>
          <div className="stat-val">{fmtNum(stats.skus)}</div>
          <div className="stat-foot"><span>{Math.round(stats.skus * 0.86)} actief deze maand</span></div>
        </div>
        <div className="stat">
          <div className="stat-lbl" style={{ color: "var(--warning)" }}><Ic d={Icon.warning} size={13} />Lage voorraad</div>
          <div className="stat-val">{stats.low}</div>
          <div className="stat-foot"><span className="delta-down">↗ 2</span> <span>sinds gisteren</span></div>
        </div>
        <div className="stat">
          <div className="stat-lbl" style={{ color: "var(--danger)" }}><Ic d={Icon.warning} size={13} />Niet op voorraad</div>
          <div className="stat-val">{stats.out}</div>
          <div className="stat-foot"><span>4 bestellingen lopend</span></div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Ic d={Icon.search} size={14} />
          <input
            placeholder="Zoek artikel, ID, kwaliteit of locatie…"
            value={q}
            onChange={(e) => setQ(e.target.value)} />
          <span className="kbd">⌘K</span>
        </div>

        <FilterChip label="Type" value={type} options={[["", "Alle types"], ...STEEL.STEEL_TYPES.map(t => [t.id, t.name])]} onChange={setType} />
        <FilterChip label="Kwaliteit" value={grade} options={[["", "Alle"], ...STEEL.GRADES.map(g => [g, g])]} onChange={setGrade} />
        <FilterChip label="Status" value={status} options={[["", "Alle"], ["ok","Op voorraad"], ["laag","Laag"], ["uit","Uit"], ["vol","Vol"]]} onChange={setStatus} />

        <div style={{ flex: 1 }} />
        <button className="btn ghost sm">
          <Ic d={Icon.filter} size={13} />
          Meer filters
        </button>
        <span style={{ width: 1, height: 18, background: "var(--border)" }}></span>
        <button className="btn ghost sm">
          <Ic d={Icon.grid} size={13} />
        </button>
        <button className="btn sm">
          <Ic d={Icon.list} size={13} />
        </button>
      </div>

      <div className="table-wrap">
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th className="col-checkbox">
                  <span className="ck" data-on={allSelected} onClick={toggleAll}></span>
                </th>
                <SortHeader k="naam" sort={sort} onSort={toggleSort}>Artikel</SortHeader>
                <SortHeader k="grade" sort={sort} onSort={toggleSort}>Kwaliteit</SortHeader>
                <th>Afmeting</th>
                <th>Afwerking</th>
                <SortHeader k="voorraad" sort={sort} onSort={toggleSort} align="right">Voorraad</SortHeader>
                <th style={{ textAlign: "right" }}>Gereserveerd</th>
                <th style={{ minWidth: 160 }}>Niveau</th>
                <SortHeader k="locatie" sort={sort} onSort={toggleSort}>Locatie</SortHeader>
                <SortHeader k="laatsteMutatieDays" sort={sort} onSort={toggleSort}>Laatste mutatie</SortHeader>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const st = statusFor(it);
                const pct = Math.min(100, Math.max(0, (it.voorraad / it.max) * 100));
                const lvlCls = st.cls === "ok" ? "" : (st.cls === "info" ? "" : st.cls === "warn" ? "warn" : "danger");
                return (
                  <tr key={it.id} data-selected={selected.has(it.id)} onClick={() => setDrawerItem(it)}>
                    <td className="col-checkbox" onClick={(e) => e.stopPropagation()}>
                      <span className="ck" data-on={selected.has(it.id)} onClick={() => toggleOne(it.id)}></span>
                    </td>
                    <td>
                      <div className="art-cell">
                        <div className="type-pic"><TypeGlyph kind={STEEL.STEEL_TYPES.find(t => t.id === it.type)?.icon || "box"} /></div>
                        <div style={{ minWidth: 0 }}>
                          <div className="art-name">{it.naam}</div>
                          <div className="art-desc cell-mono">{it.id} · {it.heatNr}</div>
                        </div>
                      </div>
                    </td>
                    <td className="cell-mono">{it.grade}</td>
                    <td className="cell-mono cell-muted">{it.afmeting}</td>
                    <td>
                      {it.afwerking === "Blank"
                        ? <span className="cell-muted" style={{ fontSize: 12 }}>—</span>
                        : <span className="badge" style={{ fontWeight: 400 }}>{it.afwerking}</span>}
                    </td>
                    <td className="cell-num cell-strong">{it.voorraad}</td>
                    <td className="cell-num cell-muted">{it.gereserveerd > 0 ? it.gereserveerd : "—"}</td>
                    <td>
                      <div className={`lvl ${lvlCls}`}>
                        <div className="lvl-bar"><i style={{ width: `${pct}%` }}></i></div>
                        <span className="lvl-num">{it.voorraad}/{it.max}</span>
                      </div>
                    </td>
                    <td>
                      <span className="cell-muted">{it.locatie}</span>
                    </td>
                    <td>
                      <span className={`badge ${st.cls}`}><span className="dot"></span>{st.label}</span>
                      <span className="cell-muted" style={{ marginLeft: 8, fontSize: 11.5 }}>{it.laatsteMutatie}</span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" title="Acties">
                        <Ic d={Icon.more} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan="11" className="empty">Geen artikelen gevonden voor deze filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="tbl-foot">
          <span>{filtered.length} van {items.length} artikelen</span>
          {selected.size > 0 && (
            <>
              <span style={{ color: "var(--text)" }}>· {selected.size} geselecteerd</span>
              <button className="btn ghost sm">Reserveren</button>
              <button className="btn ghost sm">Verplaatsen</button>
              <button className="btn ghost sm">Etiketten</button>
            </>
          )}
          <div className="pager">
            <button className="btn ghost sm"><Ic d={Icon.chevronRight} size={12} style={{ transform: "rotate(180deg)" }} /></button>
            <span style={{ padding: "0 8px" }}>1 / 1</span>
            <button className="btn ghost sm"><Ic d={Icon.chevronRight} size={12} /></button>
          </div>
        </div>
      </div>

      {drawerItem && <ItemDrawer item={drawerItem} onClose={() => setDrawerItem(null)} />}
    </>
  );
}

function SortHeader({ k, sort, onSort, align, children }) {
  const active = sort.key === k;
  return (
    <th style={{ textAlign: align || "left" }} onClick={() => onSort(k)}>
      <span className="sort" style={{ cursor: "pointer", justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        {children}
        {active && <Ic d={sort.dir === "asc" ? Icon.arrowUp : Icon.arrowDown} size={11} sw={2} />}
      </span>
    </th>
  );
}

function FilterChip({ label, value, options, onChange }) {
  const opt = options.find(([v]) => v === value);
  const active = value !== "";
  return (
    <label className={`chip ${active ? "active" : ""}`} style={{ position: "relative" }}>
      {!active && <Ic d={Icon.plus} size={11} />}
      <span>{label}</span>
      {active && <span className="chip-val">: {opt?.[1]}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {active && <span className="chip-x" onClick={(e) => { e.preventDefault(); onChange(""); }}>×</span>}
    </label>
  );
}

function ItemDrawer({ item, onClose }) {
  const st = statusFor(item);
  return (
    <>
      <div className="drawer-scrim" onClick={onClose}></div>
      <aside className="drawer">
        <div className="drawer-hd">
          <div className="type-pic" style={{ width: 36, height: 36 }}>
            <TypeGlyph kind={STEEL.STEEL_TYPES.find(t => t.id === item.type)?.icon || "box"} size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ttl">{item.naam}</div>
            <div className="cell-mono cell-muted" style={{ fontSize: 12 }}>{item.id} · {item.grade}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><Ic d={Icon.close} /></button>
        </div>
        <div className="drawer-bd">
          <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
            <div style={{ flex: 1, padding: 12, background: "var(--bg-sidebar)", borderRadius: 6, border: "1px solid var(--border)" }}>
              <div className="stat-lbl">Op voorraad</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500 }}>{item.voorraad}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{item.eenheid}</div>
            </div>
            <div style={{ flex: 1, padding: 12, background: "var(--bg-sidebar)", borderRadius: 6, border: "1px solid var(--border)" }}>
              <div className="stat-lbl">Gereserveerd</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500 }}>{item.gereserveerd}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{item.gereserveerd > 0 ? "in productie" : "—"}</div>
            </div>
            <div style={{ flex: 1, padding: 12, background: "var(--bg-sidebar)", borderRadius: 6, border: "1px solid var(--border)" }}>
              <div className="stat-lbl">Beschikbaar</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500 }}>{item.voorraad - item.gereserveerd}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)" }}><span className={`badge ${st.cls}`}><span className="dot"></span>{st.label}</span></div>
            </div>
          </div>

          <h4 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.04, color: "var(--text-3)", margin: "0 0 8px" }}>Details</h4>
          <dl className="kv">
            <dt>Artikelcode</dt><dd className="cell-mono">{item.id}</dd>
            <dt>Kwaliteit</dt><dd>{item.grade}</dd>
            <dt>Afmeting</dt><dd className="cell-mono">{item.afmeting}</dd>
            <dt>Afwerking</dt><dd>{item.afwerking}</dd>
            <dt>Gewicht/stuk</dt><dd className="cell-mono">{item.kg} kg</dd>
            <dt>Min · Max</dt><dd className="cell-mono">{item.min} · {item.max}</dd>
            <dt>Locatie</dt><dd>{item.locatie}</dd>
            <dt>Smeltnummer</dt><dd className="cell-mono">{item.heatNr}</dd>
            <dt>Leverancier</dt><dd>{item.leverancier}</dd>
            <dt>Inkoopprijs</dt><dd className="cell-mono">€ {item.prijs.toFixed(2).replace(".", ",")} / kg</dd>
            <dt>Laatste mutatie</dt><dd>{item.laatsteMutatie}</dd>
          </dl>

          <h4 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.04, color: "var(--text-3)", margin: "22px 0 8px" }}>Historie</h4>
          <div style={{ borderTop: "1px solid var(--border)" }}>
            {[
              { d: "26 mei", who: "Tata Steel NL", delta: +20, k: "Binnen geboekt", nr: "ONT-2026-0418" },
              { d: "24 mei", who: "Order #12044", delta: -3, k: "Uitgegeven", nr: "WO-2026-0331" },
              { d: "22 mei", who: "Order #12031", delta: -1, k: "Uitgegeven", nr: "WO-2026-0327" },
              { d: "18 mei", who: "Voorraadcorrectie", delta: +1, k: "Correctie", nr: "—" },
              { d: "14 mei", who: "Order #12005", delta: -4, k: "Uitgegeven", nr: "WO-2026-0312" },
            ].map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto auto", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <span className="cell-muted cell-mono" style={{ fontSize: 11.5 }}>{r.d}</span>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 12.5 }}>{r.k}</div>
                  <div className="cell-muted cell-mono" style={{ fontSize: 11 }}>{r.who} · {r.nr}</div>
                </div>
                <span className="cell-mono cell-strong" style={{ color: r.delta > 0 ? "var(--success)" : "var(--danger)" }}>{r.delta > 0 ? "+" : ""}{r.delta}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="drawer-ft">
          <button className="btn ghost">Geschiedenis</button>
          <button className="btn">Reserveren</button>
          <button className="btn primary">Mutatie</button>
        </div>
      </aside>
    </>
  );
}

Object.assign(window, { Voorraad });
