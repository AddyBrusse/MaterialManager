import { useState, useMemo } from 'react'
import {
  IconChevronLeft, IconSearch, IconCircleCheck, IconCircle,
  IconAlertTriangle, IconPlayerPlay, IconCheck, IconX,
  IconTrash, IconMapPin, IconPrinter,
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { reservationsStore, type ZaagReservation } from '../../api/reservations'

const MIN_REST_MM = 100   // remnants shorter than this go to scrap

function fmm(n: number) { return n.toLocaleString('nl-NL') + ' mm' }

// ── Job = all reservations sharing a calculatieNr ─────────────────────────────
interface ZaagJob {
  calcNr: string
  reservations: ZaagReservation[]
  machine: string
  materiaal: string
  diameter: number
  totalPcs: number
  priority: number | null
  status: 'open' | 'in_progress' | 'done'
  createdAt: string
}

function buildJobs(reservations: ZaagReservation[]): ZaagJob[] {
  const map = new Map<string, ZaagReservation[]>()
  for (const r of reservations) {
    const k = r.calculatieNr || '—'
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(r)
  }
  return [...map.entries()].map(([calcNr, items]) => {
    const first     = items[0]
    const statusPri: Record<string, number> = { in_progress: 0, open: 1, done: 2 }
    const statuses  = items.map(r => r.status)
    const jobStatus = statuses.every(s => s === 'done')
      ? 'done'
      : statuses.some(s => s === 'in_progress')
      ? 'in_progress'
      : 'open'
    return {
      calcNr,
      reservations: items,
      machine:    first.machine,
      materiaal:  first.materiaal,
      diameter:   first.diameter,
      totalPcs:   items.reduce((s, r) => s + r.pieces, 0),
      priority:   items[0].priority,
      status:     jobStatus as ZaagJob['status'],
      createdAt:  items[0].createdAt,
    }
  }).sort((a, b) => {
    // in_progress first, then by priority, then by date
    const sp = (j: ZaagJob) => ({ in_progress: 0, open: 1, done: 2 }[j.status])
    if (sp(a) !== sp(b)) return sp(a) - sp(b)
    if (a.priority !== b.priority) {
      if (a.priority == null) return 1
      if (b.priority == null) return -1
      return a.priority - b.priority
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ZaagJob['status'] }) {
  const styles: Record<string, React.CSSProperties> = {
    open:        { background: 'var(--surface-2,#f3f4f6)', color: 'var(--text-3)' },
    in_progress: { background: '#fff7ed', color: '#c2410c',  border: '1px solid #fed7aa' },
    done:        { background: '#f0fdf4', color: '#15803d',  border: '1px solid #bbf7d0' },
  }
  const labels = { open: 'Open', in_progress: 'Bezig', done: 'Klaar' }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20, ...styles[status] }}>
      {labels[status]}
    </span>
  )
}

// ── Job list card ─────────────────────────────────────────────────────────────
function JobCard({ job, onClick }: { job: ZaagJob; onClick: () => void }) {
  return (
    <div className="zaagflow-job-card" onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {job.priority != null && (
          <div className="zaagflow-priority-badge">P{job.priority}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14 }}>
              {job.calcNr}
            </span>
            <StatusBadge status={job.status} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 16 }}>
            <span>{job.machine}</span>
            <span>{job.materiaal} Ø{job.diameter} mm</span>
            <span>{job.reservations.length} {job.reservations.length === 1 ? 'as' : 'assen'} · {job.totalPcs} stuks</span>
          </div>
        </div>
        <IconChevronLeft size={16} style={{ transform: 'rotate(180deg)', color: 'var(--text-4)', flexShrink: 0 }} />
      </div>
    </div>
  )
}

// ── Guided flow ───────────────────────────────────────────────────────────────
type BarCheck = { diameter: boolean | null; lengte: boolean | null; issue: string }

function JobFlow({ job, onBack, onUpdate }: {
  job: ZaagJob
  onBack: () => void
  onUpdate: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(
    job.status === 'in_progress' ? 2 : 1
  )
  const [checks, setChecks]   = useState<Record<string, BarCheck>>(() =>
    Object.fromEntries(job.reservations.map(r => [r.id, { diameter: null, lengte: null, issue: '' }]))
  )
  const [sawed, setSawed]     = useState<Record<string, boolean>>({})
  const [rests, setRests]     = useState<Record<string, string>>({})
  const [decisions, setDecisions] = useState<Record<string, 'store' | 'scrap'>>({})
  const [locations, setLocations] = useState<Record<string, string>>({})

  const grijplengte = job.reservations[0]
    ? job.reservations[0].sawLength - job.reservations[0].pieces * job.reservations[0].productLen
    : 0

  const step1Done = job.reservations.every(r => {
    const c = checks[r.id]
    return c?.diameter !== null && c?.lengte !== null
  })
  const hasIssues = job.reservations.some(r => {
    const c = checks[r.id]
    return c?.diameter === false || c?.lengte === false
  })
  const step2Done = job.reservations.every(r => sawed[r.id])
  const step3Done = job.reservations.every(r => rests[r.id] !== undefined && rests[r.id] !== '')
  const step4Done = job.reservations.every(r => {
    const rest = Number(rests[r.id]) || 0
    if (rest < MIN_REST_MM) return true
    return decisions[r.id] != null
  })

  function startJob() {
    job.reservations.forEach(r => reservationsStore.setStatus(r.id, 'in_progress'))
    onUpdate()
    setStep(2)
  }

  function completeJob() {
    job.reservations.forEach(r => {
      const rest = Number(rests[r.id]) || null
      reservationsStore.complete(r.id, rest)
    })
    onUpdate()
    notifications.show({ color: 'green', title: 'Job afgerond', message: `${job.calcNr} is gemarkeerd als voltooid.` })
    onBack()
  }

  const STEPS = ['Voorbereiding', 'Uitvoering', 'Meting', 'Afronding']

  return (
    <div className="zaagflow-flow">
      {/* header */}
      <div className="zaagflow-flow-hd">
        <button className="st-btn sm" onClick={onBack}>
          <IconChevronLeft size={13} />Terug
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{job.calcNr}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {job.machine} · {job.materiaal} Ø{job.diameter} mm · {job.totalPcs} stuks
          </div>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {/* step indicator */}
      <div className="zaagflow-steps-bar">
        {STEPS.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4
          const done = step > n
          const active = step === n
          return (
            <div key={n} className={`zaagflow-step-dot${active ? ' active' : done ? ' done' : ''}`}>
              {done ? <IconCircleCheck size={16} /> : <IconCircle size={16} />}
              <span>{label}</span>
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Voorbereiding ── */}
      {step === 1 && (
        <div className="zaagflow-panel">
          <div className="zaagflow-panel-hd">Stap 1 — Voorbereiding: assen controleren</div>
          {job.reservations.map(r => {
            const c = checks[r.id]
            const set = (k: keyof BarCheck, v: unknown) =>
              setChecks(prev => ({ ...prev, [r.id]: { ...prev[r.id], [k]: v } }))
            return (
              <div key={r.id} className="zaagflow-check-card">
                <div className="zaagflow-check-card-hd">
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.barCode}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <IconMapPin size={12} />{r.barLocation || '—'}
                  </span>
                </div>
                <div className="zaagflow-check-row">
                  <div className="zaagflow-check-label">
                    <span>Diameter</span>
                    <span style={{ color: 'var(--text-3)' }}>verwacht: Ø{r.diameter} mm</span>
                  </div>
                  <div className="zaagflow-check-btns">
                    <button
                      className={`st-btn xs${c.diameter === true ? ' primary' : ''}`}
                      onClick={() => set('diameter', true)}
                    ><IconCheck size={12} />Klopt</button>
                    <button
                      className={`st-btn xs${c.diameter === false ? ' danger' : ''}`}
                      onClick={() => set('diameter', false)}
                    ><IconX size={12} />Niet goed</button>
                  </div>
                </div>
                <div className="zaagflow-check-row">
                  <div className="zaagflow-check-label">
                    <span>Lengte</span>
                    <span style={{ color: 'var(--text-3)' }}>verwacht: ≥ {fmm(r.sawLength)}</span>
                  </div>
                  <div className="zaagflow-check-btns">
                    <button
                      className={`st-btn xs${c.lengte === true ? ' primary' : ''}`}
                      onClick={() => set('lengte', true)}
                    ><IconCheck size={12} />Klopt</button>
                    <button
                      className={`st-btn xs${c.lengte === false ? ' danger' : ''}`}
                      onClick={() => set('lengte', false)}
                    ><IconX size={12} />Niet goed</button>
                  </div>
                </div>
                {(c.diameter === false || c.lengte === false) && (
                  <div className="zaagflow-issue-row">
                    <IconAlertTriangle size={13} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--warning)' }}>Overleg met Bart</span>
                    <input
                      className="st-input"
                      style={{ flex: 1, fontSize: 12 }}
                      placeholder="Notitie (optioneel)…"
                      value={c.issue}
                      onChange={e => set('issue', e.target.value)}
                    />
                  </div>
                )}
              </div>
            )
          })}
          <div className="zaagflow-panel-footer">
            {hasIssues && (
              <span style={{ fontSize: 12, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <IconAlertTriangle size={13} />Let op: er zijn problemen gevonden — overleg vóór je begint.
              </span>
            )}
            <button className="st-btn primary" disabled={!step1Done} onClick={startJob}>
              <IconPlayerPlay size={14} />Start zagen
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Uitvoering ── */}
      {step === 2 && (
        <div className="zaagflow-panel">
          <div className="zaagflow-panel-hd">Stap 2 — Uitvoering: zaagstappen uitvoeren</div>
          {job.reservations.map(r => (
            <div key={r.id} className={`zaagflow-check-card${sawed[r.id] ? ' done' : ''}`}>
              <div className="zaagflow-check-card-hd">
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.barCode}</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.barLocation || '—'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 4px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
                  Zaag 1×{r.sawLength}mm
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {r.pieces} × {r.werkstukLengte}mm · kerf {r.steekbreedte}mm · grip {grijplengte}mm
                </span>
              </div>
              <div className="zaagflow-check-row" style={{ marginTop: 6 }}>
                <button
                  className={`st-btn${sawed[r.id] ? ' primary' : ''}`}
                  style={{ width: '100%' }}
                  onClick={() => setSawed(prev => ({ ...prev, [r.id]: !prev[r.id] }))}
                >
                  {sawed[r.id]
                    ? <><IconCircleCheck size={14} />Uitgevoerd</>
                    : <><IconCircle size={14} />Markeer als uitgevoerd</>
                  }
                </button>
              </div>
            </div>
          ))}
          <div className="zaagflow-panel-footer">
            <button className="st-btn primary" disabled={!step2Done} onClick={() => setStep(3)}>
              Alle stappen klaar → Meting
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Meting ── */}
      {step === 3 && (
        <div className="zaagflow-panel">
          <div className="zaagflow-panel-hd">Stap 3 — Meting: restlengte opmeten</div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 12px' }}>
            Meet de resterende lengte van elke as en voer deze in. Verwachte rest = beschikbare lengte − zaaglengte.
          </p>
          {job.reservations.map(r => {
            const expectedRest = r.sawLength - r.pieces * r.productLen  // = grijplengte (approx scrap)
            // Expected available for next job = bar - total consumed
            const val = rests[r.id] ?? ''
            const measured = Number(val)
            const diff = val ? measured - expectedRest : null
            const isOk = diff == null ? null : Math.abs(diff) < 20

            return (
              <div key={r.id} className="zaagflow-check-card">
                <div className="zaagflow-check-card-hd">
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.barCode}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    Verwacht rest ≈ {fmm(expectedRest)}
                  </span>
                </div>
                <div className="zaagflow-check-row" style={{ alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>Gemeten restlengte</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number" min={0}
                        className="st-input cell-mono"
                        style={{ width: 100 }}
                        placeholder="mm"
                        value={val}
                        onChange={e => setRests(prev => ({ ...prev, [r.id]: e.target.value }))}
                      />
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>mm</span>
                      {isOk === true && <span style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600 }}>✓ Klopt</span>}
                      {isOk === false && (
                        <span style={{ color: 'var(--warning)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <IconAlertTriangle size={13} />Afwijking {Math.abs(diff!)}mm — overleg met Bart
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          <div className="zaagflow-panel-footer">
            <button className="st-btn primary" disabled={!step3Done} onClick={() => setStep(4)}>
              Meting klaar → Afronding
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Afronding ── */}
      {step === 4 && (
        <div className="zaagflow-panel">
          <div className="zaagflow-panel-hd">Stap 4 — Afronding: restanten verwerken</div>
          {job.reservations.map(r => {
            const rest = Number(rests[r.id]) || 0
            const isScrap = rest < MIN_REST_MM
            if (isScrap && decisions[r.id] !== 'scrap') {
              // auto-decide scrap for short remnants
              if (decisions[r.id] == null)
                setTimeout(() => setDecisions(prev => ({ ...prev, [r.id]: 'scrap' })), 0)
            }
            return (
              <div key={r.id} className="zaagflow-check-card">
                <div className="zaagflow-check-card-hd">
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.barCode}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Gemeten rest: {fmm(rest)}</span>
                </div>
                {isScrap ? (
                  <div className="zaagflow-issue-row" style={{ border: '1px solid var(--danger)', borderRadius: 6, background: '#fff5f5', marginTop: 8 }}>
                    <IconTrash size={14} style={{ color: 'var(--danger)' }} />
                    <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--danger)' }}>
                      Restant &lt; {MIN_REST_MM}mm → Schrootbak
                    </span>
                  </div>
                ) : (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <IconMapPin size={13} />Kies een locatie voor het restant ({fmm(rest)})
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="st-input"
                        style={{ flex: 1, fontSize: 12 }}
                        placeholder="Bijv. Hal A · Stelling 01 · R4"
                        value={locations[r.id] ?? ''}
                        onChange={e => {
                          setLocations(prev => ({ ...prev, [r.id]: e.target.value }))
                          setDecisions(prev => ({ ...prev, [r.id]: 'store' }))
                        }}
                      />
                      <button className="st-btn sm" onClick={() => {}}>
                        <IconPrinter size={12} />Sticker
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className={`st-btn xs${decisions[r.id] === 'scrap' ? ' danger' : ''}`}
                        onClick={() => setDecisions(prev => ({ ...prev, [r.id]: 'scrap' }))}
                      >
                        <IconTrash size={12} />Schrootbak
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <div className="zaagflow-panel-footer">
            <button className="st-btn primary" disabled={!step4Done} onClick={completeJob}>
              <IconCircleCheck size={14} />Job afsluiten
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function ZaagflowPage() {
  const [reservations, setReservations] = useState(() => reservationsStore.list())
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'open' | 'in_progress' | 'done' | 'all'>('all')
  const [activeCalcNr, setActiveCalcNr] = useState<string | null>(null)

  const allJobs = useMemo(() => buildJobs(reservations), [reservations])

  const visibleJobs = useMemo(() => {
    return allJobs
      .filter(j => filter === 'all' || j.status === filter)
      .filter(j => !search || j.calcNr.toLowerCase().includes(search.toLowerCase()))
  }, [allJobs, filter, search])

  const activeJob = useMemo(
    () => allJobs.find(j => j.calcNr === activeCalcNr) ?? null,
    [allJobs, activeCalcNr]
  )

  function reload() {
    setReservations(reservationsStore.list())
  }

  const counts = useMemo(() => ({
    open:        allJobs.filter(j => j.status === 'open').length,
    in_progress: allJobs.filter(j => j.status === 'in_progress').length,
    done:        allJobs.filter(j => j.status === 'done').length,
  }), [allJobs])

  if (activeJob) {
    return (
      <JobFlow
        job={activeJob}
        onBack={() => { setActiveCalcNr(null); reload() }}
        onUpdate={reload}
      />
    )
  }

  return (
    <>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Zaagflow</div>
          <div className="st-page-sub">Zaagprocedure per job — volg de stappen</div>
        </div>
      </div>

      {/* filter + search bar */}
      <div className="zaagflow-toolbar">
        <div className="zaagflow-filter-tabs">
          {([['all', 'Alles'], ['open', 'Open'], ['in_progress', 'Bezig'], ['done', 'Klaar']] as const).map(([v, label]) => (
            <button
              key={v}
              className={`zaagflow-filter-tab${filter === v ? ' active' : ''}`}
              onClick={() => setFilter(v)}
            >
              {label}
              {v !== 'all' && counts[v] > 0 && (
                <span className="count">{counts[v]}</span>
              )}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <IconSearch size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
          <input
            className="st-input"
            style={{ paddingLeft: 28, width: '100%' }}
            placeholder="Calculatienummer zoeken…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {visibleJobs.length === 0 ? (
        <div className="st-empty" style={{ marginTop: 48 }}>
          <div>Geen zaagdrachten gevonden</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
            Reserveringen worden aangemaakt via de <strong>Zaag calculator</strong>.
          </div>
        </div>
      ) : (
        <div className="zaagflow-jobs">
          {visibleJobs.map(job => (
            <JobCard key={job.calcNr} job={job} onClick={() => setActiveCalcNr(job.calcNr)} />
          ))}
        </div>
      )}
    </>
  )
}
