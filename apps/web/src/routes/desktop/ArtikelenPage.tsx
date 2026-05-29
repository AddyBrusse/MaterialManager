import { useState, useMemo } from 'react'
import {
  IconDownload, IconUpload, IconPlus, IconAlertTriangle,
  IconList, IconUser, IconBolt, IconArrowUp, IconArrowDown, IconDots,
  IconMinus,
} from '@tabler/icons-react'

// ── mock articles ─────────────────────────────────────────────────────────────
interface Article {
  id: string; naam: string; klant: string; tekening: string; rev: string
  bewerkingen: string[]; grondstof: string; grade: string
  voorraad: number; min: number; max: number; locatie: string
  volgendePlanning: string | null; laatsteProductie: string; laatsteProductieDays: number
}

const ARTICLES: Article[] = [
  { id: 'ART-0001', naam: 'Beugel links M16', klant: 'Bosch Rexroth', tekening: 'BRX-2214', rev: 'B', bewerkingen: ['frezen', 'boren'], grondstof: 'Plaat 10 mm', grade: 'S355', voorraad: 24, min: 10, max: 40, locatie: 'Hal A · Kast 1', volgendePlanning: '2 jun', laatsteProductie: '18 mei', laatsteProductieDays: 8 },
  { id: 'ART-0002', naam: 'Flens DN50', klant: 'Tata Steel NL', tekening: 'TS-F50-04', rev: 'A', bewerkingen: ['draaien'], grondstof: 'Rond Ø80', grade: 'S235', voorraad: 3, min: 8, max: 20, locatie: 'Hal A · Kast 2', volgendePlanning: null, laatsteProductie: '5 apr', laatsteProductieDays: 51 },
  { id: 'ART-0003', naam: 'Dekplaat 200×50', klant: 'Damen Shipyards', tekening: 'DS-3312-C', rev: 'C', bewerkingen: ['zagen', 'frezen'], grondstof: 'Plaat 20 mm', grade: 'S355', voorraad: 0, min: 5, max: 15, locatie: 'Hal B · Vak 4', volgendePlanning: '4 jun', laatsteProductie: '12 mei', laatsteProductieDays: 14 },
  { id: 'ART-0004', naam: 'Steun frame LH', klant: 'Bosch Rexroth', tekening: 'BRX-3301', rev: 'A', bewerkingen: ['zagen', 'frezen', 'boren'], grondstof: 'Koker 60×60×4', grade: 'S355', voorraad: 18, min: 5, max: 30, locatie: 'Hal C · Buiten', volgendePlanning: null, laatsteProductie: '20 mei', laatsteProductieDays: 6 },
  { id: 'ART-0005', naam: 'Adapter ring Ø120', klant: 'Siemens Energy', tekening: 'SE-ADR-07', rev: 'D', bewerkingen: ['draaien', 'boren'], grondstof: 'Rond Ø130', grade: 'S355JR', voorraad: 7, min: 4, max: 12, locatie: 'Hal A · Kast 3', volgendePlanning: '10 jun', laatsteProductie: '22 mei', laatsteProductieDays: 4 },
  { id: 'ART-0006', naam: 'Geleiderail 800 mm', klant: 'Damen Shipyards', tekening: 'DS-GR800', rev: 'B', bewerkingen: ['frezen'], grondstof: 'Plat 40×8', grade: 'S235', voorraad: 12, min: 6, max: 24, locatie: 'Hal B · Vak 8', volgendePlanning: null, laatsteProductie: '15 mei', laatsteProductieDays: 11 },
  { id: 'ART-0007', naam: 'Spruitstuk 3×DN25', klant: 'Siemens Energy', tekening: 'SE-SPR-03', rev: 'A', bewerkingen: ['draaien', 'frezen', 'boren'], grondstof: 'Rond Ø60', grade: 'S355JR', voorraad: 2, min: 3, max: 10, locatie: 'Hal A · Kast 1', volgendePlanning: '6 jun', laatsteProductie: '8 mei', laatsteProductieDays: 18 },
]

const CUSTOMERS = [...new Set(ARTICLES.map(a => a.klant))]
const OPERATIONS = [
  { id: 'draaien', name: 'Draaien' },
  { id: 'frezen',  name: 'Frezen'  },
  { id: 'boren',   name: 'Boren'   },
  { id: 'zagen',   name: 'Zagen'   },
]

// ── helpers ───────────────────────────────────────────────────────────────────
function statusForArt(it: Article) {
  if (it.voorraad === 0)            return { tag: 'uit',    label: 'Uit',         cls: 'danger' }
  if (it.voorraad < it.min)         return { tag: 'laag',   label: 'Laag',        cls: 'warn'   }
  if (it.volgendePlanning)          return { tag: 'gepland',label: 'Gepland',     cls: 'info'   }
  if (it.voorraad >= it.max * 0.85) return { tag: 'vol',    label: 'Vol',         cls: 'info'   }
  return                                   { tag: 'ok',     label: 'Op voorraad', cls: 'ok'     }
}

function SortTh({ k, sort, onSort, align, children, style }: {
  k: string; sort: { key: string; dir: 'asc' | 'desc' }
  onSort: (k: string) => void; align?: string; children: React.ReactNode; style?: React.CSSProperties
}) {
  const active = sort.key === k
  return (
    <th style={{ textAlign: (align as any) || 'left', ...style }} onClick={() => onSort(k)}>
      <span className="sort">
        {children}
        {active && (sort.dir === 'asc' ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />)}
      </span>
    </th>
  )
}

function FilterChip({ label, value, options, onChange }: {
  label: string; value: string; options: [string, string][]; onChange: (v: string) => void
}) {
  const active = value !== ''
  const opt = options.find(([v]) => v === value)
  return (
    <label className={`st-chip${active ? ' active' : ''}`}>
      {!active && <IconPlus size={11} />}
      <span>{label}</span>
      {active && <span className="chip-val">: {opt?.[1]}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {active && <span className="chip-x" onClick={(e) => { e.preventDefault(); onChange('') }}>×</span>}
    </label>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────
export function ArtikelenPage() {
  const [q, setQ]               = useState('')
  const [klant, setKlant]       = useState('')
  const [bewerking, setBewerking] = useState('')
  const [status, setStatus]     = useState('')
  const [sort, setSort]         = useState({ key: 'id', dir: 'asc' as 'asc' | 'desc' })
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    let f = ARTICLES
    if (q) {
      const Q = q.toLowerCase()
      f = f.filter(it =>
        it.naam.toLowerCase().includes(Q) ||
        it.id.toLowerCase().includes(Q) ||
        it.klant.toLowerCase().includes(Q) ||
        it.tekening.toLowerCase().includes(Q)
      )
    }
    if (klant)     f = f.filter(it => it.klant === klant)
    if (bewerking) f = f.filter(it => it.bewerkingen.includes(bewerking))
    if (status)    f = f.filter(it => statusForArt(it).tag === status)
    return [...f].sort((a, b) => {
      const av = (a as any)[sort.key], bv = (b as any)[sort.key]
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'nl')
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [q, klant, bewerking, status, sort])

  const stats = useMemo(() => ({
    total:   ARTICLES.length,
    klanten: new Set(ARTICLES.map(a => a.klant)).size,
    gepland: ARTICLES.filter(a => a.volgendePlanning).length,
    laag:    ARTICLES.filter(a => a.voorraad < a.min).length,
  }), [])

  const toggleSort = (key: string) =>
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })

  const allSelected = filtered.length > 0 && filtered.every(it => selected.has(it.id))
  const toggleAll = () => {
    const next = new Set(selected)
    allSelected ? filtered.forEach(it => next.delete(it.id)) : filtered.forEach(it => next.add(it.id))
    setSelected(next)
  }
  const toggleOne = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  return (
    <>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Artikelen</div>
          <div className="st-page-sub">Klantspecifieke artikelen die wij op voorraad maken om levertijd te verkorten</div>
        </div>
        <div className="st-page-actions">
          <button className="st-btn"><IconDownload size={14} />Exporteer</button>
          <button className="st-btn"><IconUpload size={14} />Import</button>
          <button className="st-btn primary"><IconPlus size={14} />Nieuw artikel</button>
        </div>
      </div>

      <div className="st-stats">
        <div className="st-stat">
          <div className="st-stat-lbl"><IconList size={13} />Actieve artikelen</div>
          <div className="st-stat-val">{stats.total}</div>
          <div className="st-stat-foot"><span className="delta-up">↗ 4</span> <span>deze maand toegevoegd</span></div>
        </div>
        <div className="st-stat">
          <div className="st-stat-lbl"><IconUser size={13} />Klanten</div>
          <div className="st-stat-val">{stats.klanten}</div>
          <div className="st-stat-foot"><span>{Math.round(stats.klanten * 0.75)} met lopende order</span></div>
        </div>
        <div className="st-stat">
          <div className="st-stat-lbl"><IconBolt size={13} />In productie gepland</div>
          <div className="st-stat-val">{stats.gepland}</div>
          <div className="st-stat-foot"><span>volgende 20 werkdagen</span></div>
        </div>
        <div className="st-stat">
          <div className="st-stat-lbl" style={{ color: 'var(--warning)' }}><IconAlertTriangle size={13} />Onder minimum</div>
          <div className="st-stat-val">{stats.laag}</div>
          <div className="st-stat-foot"><span>bijbestellen of inplannen</span></div>
        </div>
      </div>

      <div className="st-toolbar">
        <div className="st-search">
          <IconPlus size={14} style={{ opacity: 0.4 }} />
          <input
            placeholder="Zoek artikelnr, naam, klant of tekening…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="kbd">⌘K</span>
        </div>
        <FilterChip
          label="Klant" value={klant}
          options={[['', 'Alle klanten'], ...CUSTOMERS.map(c => [c, c] as [string, string])]}
          onChange={setKlant}
        />
        <FilterChip
          label="Bewerking" value={bewerking}
          options={[['', 'Alle'], ...OPERATIONS.map(o => [o.id, o.name] as [string, string])]}
          onChange={setBewerking}
        />
        <FilterChip
          label="Status" value={status}
          options={[['', 'Alle'], ['ok', 'Op voorraad'], ['laag', 'Laag'], ['uit', 'Uit'], ['gepland', 'Gepland'], ['vol', 'Vol']]}
          onChange={setStatus}
        />
        <div style={{ flex: 1 }} />
        <button className="st-btn ghost sm">Meer filters</button>
      </div>

      <div className="st-table-wrap">
        <div className="st-tbl-scroll">
          <table className="st-tbl">
            <thead>
              <tr>
                <th className="col-checkbox">
                  <span className="st-ck" data-on={allSelected} onClick={toggleAll} />
                </th>
                <SortTh k="id"                   sort={sort} onSort={toggleSort}>Artikel</SortTh>
                <SortTh k="klant"                sort={sort} onSort={toggleSort}>Klant</SortTh>
                <th>Bewerking</th>
                <th>Grondstof</th>
                <SortTh k="voorraad"             sort={sort} onSort={toggleSort} align="right">Voorraad</SortTh>
                <th style={{ minWidth: 140 }}>Niveau</th>
                <SortTh k="locatie"              sort={sort} onSort={toggleSort}>Locatie</SortTh>
                <SortTh k="laatsteProductieDays" sort={sort} onSort={toggleSort}>Laatste productie</SortTh>
                <th>Planning</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const st  = statusForArt(it)
                const pct = Math.min(100, Math.max(0, (it.voorraad / it.max) * 100))
                const lvlCls = st.cls === 'ok' || st.cls === 'info' ? '' : st.cls
                return (
                  <tr key={it.id} data-selected={selected.has(it.id)}>
                    <td className="col-checkbox" onClick={(e) => e.stopPropagation()}>
                      <span className="st-ck" data-on={selected.has(it.id)} onClick={() => toggleOne(it.id)} />
                    </td>
                    <td>
                      <div className="st-art-cell">
                        <div className="st-type-pic"><IconMinus size={16} /></div>
                        <div style={{ minWidth: 0 }}>
                          <div className="st-art-name">{it.naam}</div>
                          <div className="st-art-desc">{it.id} · {it.tekening} rev {it.rev}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="cell-strong" style={{ fontSize: 12.5 }}>{it.klant}</div>
                    </td>
                    <td>
                      <div className="op-chips">
                        {it.bewerkingen.map(op => (
                          <span key={op} className="op-chip">
                            {OPERATIONS.find(o => o.id === op)?.name ?? op}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className="cell-muted" style={{ fontSize: 12 }}>{it.grondstof}</span>
                      <span className="cell-mono cell-muted" style={{ marginLeft: 6, fontSize: 11 }}>· {it.grade}</span>
                    </td>
                    <td className="cell-num cell-strong">{it.voorraad}</td>
                    <td>
                      <div className={`st-lvl${lvlCls ? ` ${lvlCls}` : ''}`}>
                        <div className="st-lvl-bar"><i style={{ width: `${pct}%` }} /></div>
                        <span className="st-lvl-num">{it.voorraad}/{it.max}</span>
                      </div>
                    </td>
                    <td><span className="cell-muted">{it.locatie}</span></td>
                    <td>
                      <span className={`st-badge ${st.cls}`}><span className="dot" />{st.label}</span>
                      <span className="cell-muted" style={{ marginLeft: 8, fontSize: 11.5 }}>{it.laatsteProductie}</span>
                    </td>
                    <td>
                      {it.volgendePlanning
                        ? <span className="st-badge info"><span className="dot" />{it.volgendePlanning}</span>
                        : <span className="cell-muted" style={{ fontSize: 12 }}>—</span>
                      }
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="st-icon-btn" title="Acties"><IconDots size={15} /></button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="st-empty">Geen artikelen gevonden voor deze filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="st-tbl-foot">
          <span>{filtered.length} van {ARTICLES.length} artikelen</span>
          {selected.size > 0 && (
            <>
              <span style={{ color: 'var(--text)' }}>· {selected.size} geselecteerd</span>
              <button className="st-btn ghost sm">Productie inplannen</button>
              <button className="st-btn ghost sm">Bijbestellen</button>
              <button className="st-btn ghost sm">Etiketten</button>
            </>
          )}
          <div className="pager">
            <button className="st-btn ghost sm">‹</button>
            <span style={{ padding: '0 8px' }}>1 / 1</span>
            <button className="st-btn ghost sm">›</button>
          </div>
        </div>
      </div>
    </>
  )
}
