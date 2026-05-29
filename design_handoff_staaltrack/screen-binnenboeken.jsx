// Binnen boeken — receiving form + recent receipts

function BinnenBoeken({ items }) {
  const [supplier, setSupplier] = React.useState("Tata Steel NL");
  const [orderNr, setOrderNr] = React.useState("ONT-2026-0419");
  const [pakbon, setPakbon] = React.useState("");
  const [datum, setDatum] = React.useState("26 mei 2026");
  const [lines, setLines] = React.useState([
    { id: 1, item: items.find(i => i.naam.startsWith("Plaat 10")), aantal: 12, heat: "H348221", locatie: "Hal A · Stelling 02" },
    { id: 2, item: items.find(i => i.naam.startsWith("HEA 200")), aantal: 6, heat: "H348224", locatie: "Hal C · Buitenopslag" },
    { id: 3, item: items.find(i => i.naam.startsWith("Koker 80x80x4")), aantal: 24, heat: "H348228", locatie: "Hal B · Vak 14" },
  ].filter(l => l.item));

  const updateLine = (id, key, val) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [key]: val } : l));
  };
  const removeLine = (id) => setLines(prev => prev.filter(l => l.id !== id));
  const addLine = () => {
    const next = Math.max(0, ...lines.map(l => l.id)) + 1;
    setLines([...lines, { id: next, item: items[0], aantal: 1, heat: "", locatie: STEEL.LOCATIONS[0] }]);
  };

  const totalKg = lines.reduce((s, l) => s + (l.item?.kg || 0) * (l.aantal || 0), 0);
  const totalStuks = lines.reduce((s, l) => s + (l.aantal || 0), 0);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Binnen boeken</div>
          <div className="page-sub">Ontvangst registreren en aan voorraad toevoegen</div>
        </div>
        <div className="page-actions">
          <button className="btn">Concept opslaan</button>
          <button className="btn primary">
            <Ic d={Icon.check} size={14} />
            Verwerken
          </button>
        </div>
      </div>

      <div className="alert">
        <Ic d={Icon.warning} size={16} />
        <span>Er staan <strong>2 openstaande ontvangsten</strong> klaar voor verwerking. <a href="#" style={{ color: "var(--accent)", marginLeft: 4 }}>Bekijken →</a></span>
      </div>

      <div className="recv-grid">
        <div className="card" style={{ margin: 0 }}>
          <div className="card-hd">
            <div className="ttl">Ontvangst</div>
            <div className="sub">Vul de gegevens van de pakbon in</div>
            <div style={{ marginLeft: "auto" }}>
              <span className="badge info"><span className="dot"></span>Concept</span>
            </div>
          </div>
          <div className="card-bd">
            <div className="grid-2">
              <div className="field">
                <label>Ontvangstnummer</label>
                <input className="input cell-mono" value={orderNr} onChange={(e) => setOrderNr(e.target.value)} />
              </div>
              <div className="field">
                <label>Pakbonnummer</label>
                <input className="input cell-mono" placeholder="PB-…" value={pakbon} onChange={(e) => setPakbon(e.target.value)} />
              </div>
              <div className="field">
                <label>Leverancier</label>
                <select className="select" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                  {STEEL.SUPPLIERS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Datum ontvangst</label>
                <input className="input" value={datum} onChange={(e) => setDatum(e.target.value)} />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", margin: "22px 0 10px" }}>
              <h4 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.04, color: "var(--text-3)", margin: 0 }}>Regels</h4>
              <span style={{ marginLeft: 8, fontSize: 11.5, color: "var(--text-3)" }}>{lines.length} · {totalStuks} stuks · {Math.round(totalKg).toLocaleString("nl-NL")} kg</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button className="btn ghost sm"><Ic d={Icon.scan} size={12} />Scan</button>
                <button className="btn sm" onClick={addLine}><Ic d={Icon.plus} size={12} />Regel</button>
              </div>
            </div>

            <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
              <table className="tbl recv-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Artikel</th>
                    <th>Smeltnr</th>
                    <th style={{ textAlign: "right" }}>Aantal</th>
                    <th>Locatie</th>
                    <th style={{ width: 28 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.id}>
                      <td>
                        <div className="art-cell">
                          <div className="type-pic" style={{ width: 22, height: 22 }}>
                            <TypeGlyph kind={STEEL.STEEL_TYPES.find(t => t.id === l.item?.type)?.icon || "box"} size={13} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="art-name" style={{ fontSize: 12.5 }}>{l.item?.naam}</div>
                            <div className="art-desc cell-mono">{l.item?.id} · {l.item?.grade}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <input className="recv-line-input" style={{ width: 88, textAlign: "left" }}
                          value={l.heat} onChange={(e) => updateLine(l.id, "heat", e.target.value)} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <input className="recv-line-input" type="number"
                          value={l.aantal} onChange={(e) => updateLine(l.id, "aantal", +e.target.value)} />
                      </td>
                      <td>
                        <select className="recv-line-input" style={{ width: 160, textAlign: "left", fontFamily: "var(--font-sans)" }}
                          value={l.locatie} onChange={(e) => updateLine(l.id, "locatie", e.target.value)}>
                          {STEEL.LOCATIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                        </select>
                      </td>
                      <td>
                        <button className="icon-btn" onClick={() => removeLine(l.id)} title="Regel verwijderen">
                          <Ic d={Icon.close} size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="field" style={{ marginTop: 18 }}>
              <label>Opmerking</label>
              <textarea className="input" placeholder="Bijvoorbeeld certificaat-vereisten, afwijkingen, foto's van de pakbon…"></textarea>
            </div>
          </div>
        </div>

        <div>
          <div className="card" style={{ margin: 0, marginBottom: 16 }}>
            <div className="card-hd">
              <div className="ttl">Samenvatting</div>
            </div>
            <div className="card-bd">
              <dl className="kv">
                <dt>Regels</dt><dd className="cell-mono">{lines.length}</dd>
                <dt>Totaal stuks</dt><dd className="cell-mono">{totalStuks}</dd>
                <dt>Totaal gewicht</dt><dd className="cell-mono">{Math.round(totalKg).toLocaleString("nl-NL")} kg</dd>
                <dt>Leverancier</dt><dd>{supplier}</dd>
                <dt>Pakbon</dt><dd className="cell-mono">{pakbon || "—"}</dd>
              </dl>
              <div style={{ marginTop: 14, padding: 12, background: "var(--bg-sidebar)", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, color: "var(--text-2)" }}>
                Bij verwerken worden alle regels toegevoegd aan de voorraad op de aangegeven locatie. Smeltnummers worden gekoppeld aan certificaten.
              </div>
            </div>
          </div>

          <div className="card" style={{ margin: 0 }}>
            <div className="card-hd">
              <div className="ttl">Recent geboekt</div>
              <button className="btn ghost sm" style={{ marginLeft: "auto" }}>Alles tonen</button>
            </div>
            <table className="tbl" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Nummer</th>
                  <th>Leverancier</th>
                  <th style={{ textAlign: "right" }}>Kg</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {STEEL.RECENT_RECEIPTS.map(r => (
                  <tr key={r.nr}>
                    <td>
                      <div className="cell-mono cell-strong">{r.nr}</div>
                      <div className="cell-muted" style={{ fontSize: 11 }}>{r.datum} · {r.regels} regels</div>
                    </td>
                    <td className="cell-muted">{r.leverancier}</td>
                    <td className="cell-num">{r.kg.toLocaleString("nl-NL")}</td>
                    <td>
                      <span className={`badge ${r.status === "verwerkt" ? "ok" : r.status === "open" ? "warn" : ""}`}>
                        <span className="dot"></span>{r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { BinnenBoeken });
