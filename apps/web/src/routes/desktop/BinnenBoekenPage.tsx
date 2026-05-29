import { useState } from 'react'
import { IconCheck, IconAlertTriangle, IconScan, IconPlus, IconX } from '@tabler/icons-react'

// ── mock data ─────────────────────────────────────────────────────────────────
const SUPPLIERS = ['Tata Steel NL', 'Voestalpine', 'ArcelorMittal', 'ThyssenKrupp', 'Ruukki']
const LOCATIONS = [
  'Hal A · Stelling 01', 'Hal A · Stelling 02', 'Hal A · Stelling 03',
  'Hal B · Vak 12', 'Hal B · Vak 14', 'Hal C · Buitenopslag', 'Hal D · Knipvoorraad',
]
const RECENT = [
  { nr: 'ONT-2026-0418', datum: '26 mei', regels: 3, leverancier: 'Tata Steel NL',  kg: 2840, status: 'verwerkt' },
  { nr: 'ONT-2026-0417', datum: '23 mei', regels: 5, leverancier: 'Voestalpine',    kg: 5120, status: 'verwerkt' },
  { nr: 'ONT-2026-0416', datum: '20 mei', regels: 2, leverancier: 'ArcelorMittal',  kg: 1660, status: 'verwerkt' },
  { nr: 'ONT-2026-0415', datum: '18 mei', regels: 4, leverancier: 'Tata Steel NL',  kg: 3980, status: 'open'     },
]

interface Line { id: number; artikel: string; grade: string; heat: string; aantal: number; locatie: string }

const INIT_LINES: Line[] = [
  { id: 1, artikel: 'Plaat 10 mm · S355',  grade: 'S355', heat: 'H348221', aantal: 12, locatie: 'Hal A · Stelling 02' },
  { id: 2, artikel: 'HEA 200 · S235',       grade: 'S235', heat: 'H348224', aantal: 6,  locatie: 'Hal C · Buitenopslag' },
  { id: 3, artikel: 'Koker 80×80×4 · S355', grade: 'S355', heat: 'H348228', aantal: 24, locatie: 'Hal B · Vak 14' },
]

export function BinnenBoekenPage() {
  const [supplier, setSupplier] = useState('Tata Steel NL')
  const [orderNr, setOrderNr]   = useState('ONT-2026-0419')
  const [pakbon, setPakbon]     = useState('')
  const [datum, setDatum]       = useState('26 mei 2026')
  const [lines, setLines]       = useState<Line[]>(INIT_LINES)
  const [opmerking, setOpmerking] = useState('')

  const updateLine = (id: number, key: keyof Line, val: string | number) =>
    setLines(prev => prev.map(l => l.id === id ? { ...l, [key]: val } : l))
  const removeLine = (id: number) => setLines(prev => prev.filter(l => l.id !== id))
  const addLine = () => {
    const nextId = Math.max(0, ...lines.map(l => l.id)) + 1
    setLines([...lines, { id: nextId, artikel: 'Nieuw artikel', grade: 'S355', heat: '', aantal: 1, locatie: LOCATIONS[0] }])
  }

  const totalKg   = lines.reduce((s, l) => s + l.aantal * 100, 0) // approx per stuk 100 kg
  const totalStuks = lines.reduce((s, l) => s + l.aantal, 0)

  return (
    <>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Binnen boeken</div>
          <div className="st-page-sub">Ontvangst registreren en aan voorraad toevoegen</div>
        </div>
        <div className="st-page-actions">
          <button className="st-btn">Concept opslaan</button>
          <button className="st-btn primary"><IconCheck size={14} />Verwerken</button>
        </div>
      </div>

      <div className="st-alert">
        <IconAlertTriangle size={16} />
        <span>Er staan <strong>2 openstaande ontvangsten</strong> klaar voor verwerking. <a href="#" style={{ color: 'var(--accent)', marginLeft: 4 }}>Bekijken →</a></span>
      </div>

      <div className="st-recv-grid">
        {/* left: form */}
        <div className="st-card" style={{ margin: 0 }}>
          <div className="st-card-hd">
            <div className="ttl">Ontvangst</div>
            <div className="sub">Vul de gegevens van de pakbon in</div>
            <div style={{ marginLeft: 'auto' }}>
              <span className="st-badge info"><span className="dot" />Concept</span>
            </div>
          </div>
          <div className="st-card-bd">
            <div className="st-grid-2">
              <div className="st-field">
                <label>Ontvangstnummer</label>
                <input className="st-input cell-mono" value={orderNr} onChange={(e) => setOrderNr(e.target.value)} />
              </div>
              <div className="st-field">
                <label>Pakbonnummer</label>
                <input className="st-input cell-mono" placeholder="PB-…" value={pakbon} onChange={(e) => setPakbon(e.target.value)} />
              </div>
              <div className="st-field">
                <label>Leverancier</label>
                <select className="st-select" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                  {SUPPLIERS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="st-field">
                <label>Datum ontvangst</label>
                <input className="st-input" value={datum} onChange={(e) => setDatum(e.target.value)} />
              </div>
            </div>

            {/* lines header */}
            <div style={{ display: 'flex', alignItems: 'center', margin: '22px 0 10px' }}>
              <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)', margin: 0 }}>Regels</h4>
              <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--text-3)' }}>
                {lines.length} · {totalStuks} stuks · {totalKg.toLocaleString('nl-NL')} kg
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button className="st-btn ghost sm"><IconScan size={12} />Scan</button>
                <button className="st-btn sm" onClick={addLine}><IconPlus size={12} />Regel</button>
              </div>
            </div>

            {/* line items table */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              <table className="st-tbl" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Artikel</th>
                    <th>Smeltnr</th>
                    <th style={{ textAlign: 'right' }}>Aantal</th>
                    <th>Locatie</th>
                    <th style={{ width: 28 }} />
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.id}>
                      <td>
                        <div className="st-art-cell">
                          <div className="st-type-pic" style={{ width: 22, height: 22 }}>
                            <IconMinus size={13} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="st-art-name" style={{ fontSize: 12.5 }}>{l.artikel}</div>
                            <div className="st-art-desc">{l.grade}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <input
                          className="st-recv-input"
                          style={{ width: 88, textAlign: 'left' }}
                          value={l.heat}
                          onChange={(e) => updateLine(l.id, 'heat', e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <input
                          className="st-recv-input"
                          type="number"
                          value={l.aantal}
                          onChange={(e) => updateLine(l.id, 'aantal', +e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          className="st-recv-input"
                          style={{ width: 180, textAlign: 'left', fontFamily: 'var(--font-sans)' }}
                          value={l.locatie}
                          onChange={(e) => updateLine(l.id, 'locatie', e.target.value)}
                        >
                          {LOCATIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                        </select>
                      </td>
                      <td>
                        <button className="st-icon-btn" onClick={() => removeLine(l.id)} title="Verwijderen">
                          <IconX size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="st-field" style={{ marginTop: 18 }}>
              <label>Opmerking</label>
              <textarea
                className="st-input"
                placeholder="Certificaat-vereisten, afwijkingen, foto's van de pakbon…"
                value={opmerking}
                onChange={(e) => setOpmerking(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* right: summary + recent */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="st-card" style={{ margin: 0 }}>
            <div className="st-card-hd">
              <div className="ttl">Samenvatting</div>
            </div>
            <div className="st-card-bd">
              <dl className="st-kv">
                <dt>Regels</dt><dd className="cell-mono">{lines.length}</dd>
                <dt>Totaal stuks</dt><dd className="cell-mono">{totalStuks}</dd>
                <dt>Totaal gewicht</dt><dd className="cell-mono">~{totalKg.toLocaleString('nl-NL')} kg</dd>
                <dt>Leverancier</dt><dd>{supplier}</dd>
                <dt>Pakbon</dt><dd className="cell-mono">{pakbon || '—'}</dd>
              </dl>
              <div style={{ marginTop: 14, padding: 12, background: 'var(--bg-sidebar)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)' }}>
                Bij verwerken worden alle regels toegevoegd aan de voorraad op de aangegeven locatie. Smeltnummers worden gekoppeld aan certificaten.
              </div>
            </div>
          </div>

          <div className="st-card" style={{ margin: 0 }}>
            <div className="st-card-hd">
              <div className="ttl">Recent geboekt</div>
              <button className="st-btn ghost sm" style={{ marginLeft: 'auto' }}>Alles tonen</button>
            </div>
            <table className="st-tbl" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Nummer</th>
                  <th>Leverancier</th>
                  <th style={{ textAlign: 'right' }}>Kg</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {RECENT.map(r => (
                  <tr key={r.nr}>
                    <td>
                      <div className="cell-mono cell-strong">{r.nr}</div>
                      <div className="cell-muted" style={{ fontSize: 11 }}>{r.datum} · {r.regels} regels</div>
                    </td>
                    <td className="cell-muted">{r.leverancier}</td>
                    <td className="cell-num">{r.kg.toLocaleString('nl-NL')}</td>
                    <td>
                      <span className={`st-badge ${r.status === 'verwerkt' ? 'ok' : 'warn'}`}>
                        <span className="dot" />{r.status}
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
  )
}

// needed for type-only import in this file
function IconMinus({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
