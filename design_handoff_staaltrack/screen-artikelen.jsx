// Artikelen — finished/semi-finished products kept in stock per customer

function statusForArt(it) {
  if (it.voorraad === 0) return { tag: "uit", label: "Uit", cls: "danger" };
  if (it.voorraad < it.min) return { tag: "laag", label: "Laag", cls: "warn" };
  if (it.volgendePlanning) return { tag: "gepland", label: "Gepland", cls: "info" };
  if (it.voorraad >= it.max * 0.85) return { tag: "vol", label: "Vol", cls: "info" };
  return { tag: "ok", label: "Op voorraad", cls: "ok" };
}

function Artikelen({ items }) {
  const articles = window.STEEL.ARTICLES;
  const [q, setQ] = React.useState("");
  const [klant, setKlant] = React.useState("");
  const [bewerking, setBewerking] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [sort, setSort] = React.useState({ key: "id", dir: "asc" });
  const [selected, setSelected] = React.useState(new Set());

  const filtered = React.useMemo(() => {
    let f = articles;
    if (q) {
      const Q = q.toLowerCase();
      f = f.filter(it =>
        it.naam.toLowerCase().includes(Q) ||
        it.id.toLowerCase().includes(Q) ||
        it.klant.toLowerCase().includes(Q) ||
        it.tekening.toLowerCase().includes(Q)
      );
    }
    if (klant) f = f.filter(it => it.klant === klant);
    if (bewerking) f = f.filter(it => it.bewerkingen.includes(bewerking));
    if (status) f = f.filter(it => statusForArt(it).tag === status);

    f = [...f].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (typeof av === "number") return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc" ? String(av).localeCompare(bv) : String(bv).localeCompare(av);
    });
    return f;
  }, [articles, q, klant, bewerking, status, sort]);

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

  const stats = React.useMemo(() => {
    const total = articles.length;
    const klanten = new Set(articles.map(a => a.klant)).size;
    const gepland = articles.filter(a => a.volgendePlanning).length;
    const laag = articles.filter(a => a.voorraad < a.min).length;
    return { total, klanten, gepland, laag };
  }, [articles]);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Artikelen</div>
          <div className="page-sub">Klantspecifieke artikelen die wij op voorraad maken om levertijd te verkorten</div>
        </div>
        <div className="page-actions">
          <button className="btn">
            <Ic d={Icon.download} size={14} />
            Exporteer
          </button>
          <button className="btn">
            <Ic d={Icon.upload} size={14} />
            Import
          </button>
          <button className="btn primary">
            <Ic d={Icon.plus} size={14} />
            Nieuw artikel
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-lbl"><Ic d={Icon.list} size={13} />Actieve artikelen</div>
          <div className="stat-val">{stats.total}</div>
          <div className="stat-foot"><span className="delta-up">↗ 4</span> <span>deze maand toegevoegd</span></div>
        </div>
        <div className="stat">
          <div className="stat-lbl"><Ic d={Icon.user} size={13} />Klanten</div>
          <div className="stat-val">{stats.klanten}</div>
          <div className="stat-foot"><span>{Math.round(stats.klanten * 0.75)} met lopende order</span></div>
        </div>
        <div className="stat">
          <div className="stat-lbl"><Ic d={Icon.bolt} size={13} />In productie gepland</div>
          <div className="stat-val">{stats.gepland}</div>
          <div className="stat-foot"><span>volgende 20 werkdagen</span></div>
        </div>
        <div className="stat">
          <div className="stat-lbl" style={{ color: "var(--warning)" }}><Ic d={Icon.warning} size={13} />Onder minimum</div>
          <div className="stat-val">{stats.laag}</div>
          <div className="stat-foot"><span>bijbestellen of inplannen</span></div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Ic d={Icon.search} size={14} />
          <input
            placeholder="Zoek artikelnr, naam, klant of tekening…"
            value={q}
            onChange={(e) => setQ(e.target.value)} />
          <span className="kbd">⌘K</span>
        </div>

        <FilterChip label="Klant" value={klant}
          options={[["", "Alle klanten"], ...window.STEEL.CUSTOMERS.map(c => [c, c])]}
          onChange={setKlant} />
        <FilterChip label="Bewerking" value={bewerking}
          options={[["", "Alle"], ...window.STEEL.OPERATIONS.map(o => [o.id, o.name])]}
          onChange={setBewerking} />
        <FilterChip label="Status" value={status}
          options={[["", "Alle"], ["ok","Op voorraad"], ["laag","Laag"], ["uit","Uit"], ["gepland","Gepland"], ["vol","Vol"]]}
          onChange={setStatus} />

        <div style={{ flex: 1 }} />
        <button className="btn ghost sm">
          <Ic d={Icon.filter} size={13} />
          Meer filters
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
                <SortHeader k="id" sort={sort} onSort={toggleSort}>Artikel</SortHeader>
                <SortHeader k="klant" sort={sort} onSort={toggleSort}>Klant</SortHeader>
                <th>Bewerking</th>
                <th>Grondstof</th>
                <SortHeader k="voorraad" sort={sort} onSort={toggleSort} align="right">Voorraad</SortHeader>
                <th style={{ minWidth: 140 }}>Niveau</th>
                <SortHeader k="locatie" sort={sort} onSort={toggleSort}>Locatie</SortHeader>
                <SortHeader k="laatsteProductieDays" sort={sort} onSort={toggleSort}>Laatste productie</SortHeader>
                <th>Planning</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const st = statusForArt(it);
                const pct = Math.min(100, Math.max(0, (it.voorraad / it.max) * 100));
                const lvlCls = st.cls === "ok" ? "" : (st.cls === "info" ? "" : st.cls === "warn" ? "warn" : "danger");
                return (
                  <tr key={it.id} data-selected={selected.has(it.id)}>
                    <td className="col-checkbox" onClick={(e) => e.stopPropagation()}>
                      <span className="ck" data-on={selected.has(it.id)} onClick={() => toggleOne(it.id)}></span>
                    </td>
                    <td>
                      <div className="art-cell">
                        <div className="type-pic"><TypeGlyph kind="plate" /></div>
                        <div style={{ minWidth: 0 }}>
                          <div className="art-name">{it.naam}</div>
                          <div className="art-desc cell-mono">{it.id} · {it.tekening} rev {it.rev}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="cell-strong" style={{ fontSize: 12.5 }}>{it.klant}</div>
                    </td>
                    <td>
                      <div className="op-chips">
                        {it.bewerkingen.map(op => (
                          <span key={op} className="op-chip">{window.STEEL.OPERATIONS.find(o => o.id === op)?.name}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className="cell-muted" style={{ fontSize: 12 }}>{it.grondstof}</span>
                      <span className="cell-mono cell-muted" style={{ marginLeft: 6, fontSize: 11 }}>· {it.grade}</span>
                    </td>
                    <td className="cell-num cell-strong">{it.voorraad}</td>
                    <td>
                      <div className={`lvl ${lvlCls}`}>
                        <div className="lvl-bar"><i style={{ width: `${pct}%` }}></i></div>
                        <span className="lvl-num">{it.voorraad}/{it.max}</span>
                      </div>
                    </td>
                    <td><span className="cell-muted">{it.locatie}</span></td>
                    <td>
                      <span className={`badge ${st.cls}`}><span className="dot"></span>{st.label}</span>
                      <span className="cell-muted" style={{ marginLeft: 8, fontSize: 11.5 }}>{it.laatsteProductie}</span>
                    </td>
                    <td>
                      {it.volgendePlanning
                        ? <span className="badge info"><span className="dot"></span>{it.volgendePlanning}</span>
                        : <span className="cell-muted" style={{ fontSize: 12 }}>—</span>}
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
          <span>{filtered.length} van {articles.length} artikelen</span>
          {selected.size > 0 && (
            <>
              <span style={{ color: "var(--text)" }}>· {selected.size} geselecteerd</span>
              <button className="btn ghost sm">Productie inplannen</button>
              <button className="btn ghost sm">Bijbestellen</button>
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
    </>
  );
}

Object.assign(window, { Artikelen });
