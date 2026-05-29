import { useState, useMemo, useEffect } from 'react'
import {
  IconSearch, IconCircleCheck, IconCircle, IconAlertTriangle,
  IconCheck, IconX, IconTrash, IconMapPin, IconPlayerPlay,
  IconPrinter, IconChevronRight,
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { reservationsStore, type ZaagReservation } from '../../api/reservations'

const MIN_REST_MM = 100
function fmm(n: number) { return n.toLocaleString('nl-NL') + ' mm' }

// ── Types ─────────────────────────────────────────────────────────────────────

interface ZaagJob {
  calcNr: string; reservations: ZaagReservation[]
  machine: string; materiaal: string; diameter: number; totalPcs: number
  priority: number | null; status: 'open' | 'in_progress' | 'done'; createdAt: string
}
type BarCheck = { diameter: boolean | null; lengte: boolean | null; issue: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildJobs(reservations: ZaagReservation[]): ZaagJob[] {
  const map = new Map<string, ZaagReservation[]>()
  for (const r of reservations) {
    const k = r.calculatieNr || '—'
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(r)
  }
  return [...map.entries()].map(([calcNr, items]) => {
    const first = items[0]
    const statuses = items.map(r => r.status)
    const jobStatus = statuses.every(s => s === 'done') ? 'done'
      : statuses.some(s => s === 'in_progress') ? 'in_progress' : 'open'
    return {
      calcNr, reservations: items, machine: first.machine, materiaal: first.materiaal,
      diameter: first.diameter, totalPcs: items.reduce((s, r) => s + r.pieces, 0),
      priority: items[0].priority, status: jobStatus as ZaagJob['status'], createdAt: items[0].createdAt,
    }
  }).sort((a, b) => {
    const sp = (j: ZaagJob) => ({ in_progress: 0, open: 1, done: 2 }[j.status])
    if (sp(a) !== sp(b)) return sp(a) - sp(b)
    if (a.priority !== b.priority) {
      if (a.priority == null) return 1; if (b.priority == null) return -1
      return a.priority - b.priority
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}

function StatusBadge({ status }: { status: ZaagJob['status'] }) {
  const map = {
    open:        { bg: 'var(--bg-chip)', color: 'var(--text-3)',  label: 'Open'  },
    in_progress: { bg: '#fff7ed',        color: '#c2410c',        label: 'Bezig' },
    done:        { bg: '#f0fdf4',        color: '#15803d',        label: 'Klaar' },
  }
  const { bg, color, label } = map[status]
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: bg, color }}>{label}</span>
}

function JobCard({ job, onClick }: { job: ZaagJob; onClick: () => void }) {
  return (
    <div className="zaagflow-job-card" onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {job.priority != null && <div className="zaagflow-priority-badge">P{job.priority}</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14 }}>{job.calcNr}</span>
            <StatusBadge status={job.status} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 16 }}>
            <span>{job.machine}</span>
            <span>{job.materiaal} Ø{job.diameter} mm</span>
            <span>{job.reservations.length} {job.reservations.length === 1 ? 'as' : 'assen'} · {job.totalPcs} stuks</span>
          </div>
        </div>
        <IconChevronRight size={16} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
      </div>
    </div>
  )
}

// ── Step indicator ─────────────────────────────────────────────────────────────

const STEP_LABELS = ['Voorbereiding', 'Uitvoering', 'Meting', 'Afronding']

function StepDots({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <div className="zf-step-dots">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1
        const done = step > n, active = step === n
        return (
          <div key={n} className={`zf-step-dot${active ? ' active' : done ? ' done' : ''}`}>
            {done
              ? <IconCircleCheck size={13} />
              : <span className="zf-step-num">{n}</span>
            }
            <span className="zf-step-label">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Bar progress dots ──────────────────────────────────────────────────────────

function BarDots({ bars, activeIdx, doneIds }: { bars: ZaagReservation[]; activeIdx: number; doneIds: string[] }) {
  if (bars.length <= 1) return null
  return (
    <div className="zf-bar-nav">
      {bars.map((b, i) => (
        <div key={b.id} className={`zf-bar-dot${i === activeIdx ? ' active' : doneIds.includes(b.id) ? ' done' : ''}`} />
      ))}
      <span className="zf-bar-nav-label">As {activeIdx + 1} van {bars.length}</span>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function JobModal({ job, onClose, onUpdate }: {
  job: ZaagJob; onClose: () => void; onUpdate: () => void
}) {
  const bars = job.reservations

  const [step, setStep]       = useState<1 | 2 | 3 | 4>(job.status === 'in_progress' ? 2 : 1)

  // Step 1
  const [checks, setChecks]   = useState<Record<string, BarCheck>>(() =>
    Object.fromEntries(bars.map(r => [r.id, { diameter: null, lengte: null, issue: '' }]))
  )
  const [s1cur, setS1cur]     = useState({ bi: 0, field: 'diameter' as 'diameter' | 'lengte' })
  const [showIssue, setShowIssue] = useState(false)

  // Step 2
  const [sawed, setSawed]     = useState<Record<string, boolean>>({})
  const [s2bi, setS2bi]       = useState(0)

  // Step 3
  const [rests, setRests]     = useState<Record<string, string>>({})
  const [s3bi, setS3bi]       = useState(0)

  // Step 4
  const [decisions, setDecisions] = useState<Record<string, 'store' | 'scrap'>>({})
  const [locations, setLocations] = useState<Record<string, string>>({})
  const [s4bi, setS4bi]       = useState(0)

  const grijp = bars[0] ? bars[0].sawLength - bars[0].pieces * bars[0].productLen : 0

  // Completion gates
  const step1Done = bars.every(r => checks[r.id]?.diameter !== null && checks[r.id]?.lengte !== null)
  const hasIssues = bars.some(r => checks[r.id]?.diameter === false || checks[r.id]?.lengte === false)
  const step2Done = bars.every(r => sawed[r.id])
  const step3Done = bars.every(r => rests[r.id])
  const step4Done = bars.every(r => {
    const rest = Number(rests[r.id]) || 0
    return rest < MIN_REST_MM ? true : decisions[r.id] != null
  })

  // Auto-scrap short remnants when entering step 4
  useEffect(() => {
    if (step !== 4) return
    setDecisions(prev => {
      const next = { ...prev }
      bars.forEach(r => {
        const rest = Number(rests[r.id]) || 0
        if (rest < MIN_REST_MM && !next[r.id]) next[r.id] = 'scrap'
      })
      return next
    })
  }, [step]) // eslint-disable-line

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  function advanceCursor() {
    const { bi, field } = s1cur
    if (field === 'diameter') setS1cur({ bi, field: 'lengte' })
    else if (bi < bars.length - 1) setS1cur({ bi: bi + 1, field: 'diameter' })
  }

  function handleCheck(val: boolean) {
    const bar = bars[s1cur.bi]
    setChecks(p => ({ ...p, [bar.id]: { ...p[bar.id], [s1cur.field]: val } }))
    if (!val) { setShowIssue(true); return }
    setTimeout(advanceCursor, 180)
  }

  function dismissIssue() { setShowIssue(false); setTimeout(advanceCursor, 50) }

  function startJob() {
    bars.forEach(r => reservationsStore.setStatus(r.id, 'in_progress'))
    onUpdate(); setStep(2)
  }

  function completeJob() {
    bars.forEach(r => reservationsStore.complete(r.id, Number(rests[r.id]) || null))
    onUpdate()
    notifications.show({ color: 'green', title: 'Job afgerond!', message: `${job.calcNr} is voltooid.` })
    onClose()
  }

  const s1Bar = bars[s1cur.bi]
  const s2Bar = bars[s2bi]
  const s3Bar = bars[s3bi]
  const s4Bar = bars[s4bi]

  return (
    <div className="zf-overlay" onClick={onClose}>
      <div className="zf-modal" onClick={e => e.stopPropagation()}>

        {/* Thin progress strip */}
        <div className="zf-progress-track">
          <div className="zf-progress-fill" style={{ width: `${((step - 1) / 3) * 100}%` }} />
        </div>

        {/* Header */}
        <div className="zf-modal-hd">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="zf-job-title">{job.calcNr}</div>
            <div className="zf-job-sub">{job.machine} · {job.materiaal} Ø{job.diameter} mm · {job.totalPcs} stuks</div>
          </div>
          <StepDots step={step} />
          <button className="st-icon-btn" onClick={onClose} title="Sluiten (Esc)" style={{ flexShrink: 0 }}>
            <IconX size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="zf-modal-body">

          {/* ── Step 1: Voorbereiding ─────────────────────────────────── */}
          {step === 1 && (
            <>
              <BarDots
                bars={bars} activeIdx={s1cur.bi}
                doneIds={bars.filter(r => checks[r.id].diameter !== null && checks[r.id].lengte !== null).map(r => r.id)}
              />

              <div className="zf-bar-info">
                <span className="zf-bar-code">{s1Bar.barCode}</span>
                <span className="zf-bar-loc"><IconMapPin size={12} />{s1Bar.barLocation || '—'}</span>
              </div>

              {!showIssue ? (
                <>
                  <div className="zf-question">
                    <div className="zf-question-type">
                      {s1cur.field === 'diameter' ? '① Diameter' : '② Lengte'}
                    </div>
                    <div className="zf-question-lbl">
                      {s1cur.field === 'diameter' ? 'Is de diameter correct?' : 'Is de staaf lang genoeg?'}
                    </div>
                    <div className="zf-question-expected">
                      {s1cur.field === 'diameter'
                        ? `Verwacht Ø${s1Bar.diameter} mm`
                        : `Minimaal ${fmm(s1Bar.sawLength)}`}
                    </div>
                  </div>

                  <div className="zf-check-pair">
                    <button className="zf-check-btn ok" onClick={() => handleCheck(true)}>
                      <IconCheck size={32} /><span>Klopt</span>
                    </button>
                    <button className="zf-check-btn nok" onClick={() => handleCheck(false)}>
                      <IconX size={32} /><span>Niet goed</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="zf-issue-panel">
                  <IconAlertTriangle size={36} style={{ color: 'var(--warning)' }} />
                  <div className="zf-issue-title">Overleg met Bart</div>
                  <div className="zf-issue-sub">
                    {s1cur.field === 'diameter' ? 'Diameter klopt niet' : 'As is te kort'} — overleg vóór je verdergaat.
                  </div>
                  <textarea
                    className="st-input"
                    style={{ width: '100%', minHeight: 60, resize: 'none', fontSize: 12, marginTop: 4 }}
                    placeholder="Notitie (optioneel)…"
                    value={checks[s1Bar.id]?.issue || ''}
                    onChange={e => setChecks(p => ({ ...p, [s1Bar.id]: { ...p[s1Bar.id], issue: e.target.value } }))}
                  />
                  <button className="st-btn primary" onClick={dismissIssue}>Begrepen → ga verder</button>
                </div>
              )}

              {/* Summary of checked bars */}
              {bars.some(r => checks[r.id].diameter !== null) && (
                <div className="zf-recap">
                  {bars.filter(r => checks[r.id].diameter !== null).map(r => (
                    <div key={r.id} className="zf-recap-row">
                      <span className="zf-bar-code" style={{ fontSize: 12 }}>{r.barCode}</span>
                      <span style={{ display: 'flex', gap: 5 }}>
                        <span className={`zf-pill${checks[r.id].diameter ? ' ok' : ' nok'}`}>
                          Ø {checks[r.id].diameter ? '✓' : '✗'}
                        </span>
                        {checks[r.id].lengte !== null && (
                          <span className={`zf-pill${checks[r.id].lengte ? ' ok' : ' nok'}`}>
                            L {checks[r.id].lengte ? '✓' : '✗'}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Step 2: Uitvoering ───────────────────────────────────── */}
          {step === 2 && (
            <>
              <BarDots
                bars={bars} activeIdx={s2bi}
                doneIds={Object.entries(sawed).filter(([, v]) => v).map(([id]) => id)}
              />

              <div className="zf-bar-info">
                <span className="zf-bar-code">{s2Bar.barCode}</span>
                <span className="zf-bar-loc"><IconMapPin size={12} />{s2Bar.barLocation || '—'}</span>
              </div>

              <div className="zf-hero">
                <div className="zf-hero-label">Zaagopdracht</div>
                <div className="zf-hero-value">Zaag 1×{s2Bar.sawLength}mm</div>
                <div className="zf-hero-sub">
                  {s2Bar.pieces} × {s2Bar.werkstukLengte}mm · kerf {s2Bar.steekbreedte}mm · grip {grijp}mm
                </div>
              </div>

              <button
                className={`zf-done-btn${sawed[s2Bar.id] ? ' done' : ''}`}
                onClick={() => {
                  const next = !sawed[s2Bar.id]
                  setSawed(p => ({ ...p, [s2Bar.id]: next }))
                  if (next && s2bi < bars.length - 1) setTimeout(() => setS2bi(i => i + 1), 350)
                }}
              >
                {sawed[s2Bar.id]
                  ? <><IconCircleCheck size={20} />Uitgevoerd ✓</>
                  : <><IconCircle size={20} />Markeer als uitgevoerd</>
                }
              </button>

              {bars.length > 1 && (
                <div className="zf-nav-btns">
                  <button className="st-btn sm" disabled={s2bi === 0} onClick={() => setS2bi(i => i - 1)}>← Vorige</button>
                  <button className="st-btn sm" disabled={s2bi >= bars.length - 1} onClick={() => setS2bi(i => i + 1)}>Volgende →</button>
                </div>
              )}
            </>
          )}

          {/* ── Step 3: Meting ──────────────────────────────────────── */}
          {step === 3 && (
            <>
              <BarDots
                bars={bars} activeIdx={s3bi}
                doneIds={bars.filter(r => rests[r.id]).map(r => r.id)}
              />

              <div className="zf-bar-info">
                <span className="zf-bar-code">{s3Bar.barCode}</span>
                <span className="zf-bar-loc">
                  Verwacht rest ≈ {fmm(s3Bar.sawLength - s3Bar.pieces * s3Bar.productLen)}
                </span>
              </div>

              <div className="zf-hero">
                <div className="zf-hero-label">Gemeten restlengte</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14 }}>
                  <input
                    key={s3bi}
                    type="number" min={0}
                    className="st-input cell-mono"
                    style={{ fontSize: 32, height: 62, width: 150, textAlign: 'center' }}
                    placeholder="0"
                    value={rests[s3Bar.id] ?? ''}
                    autoFocus
                    onChange={e => setRests(p => ({ ...p, [s3Bar.id]: e.target.value }))}
                  />
                  <span style={{ fontSize: 20, color: 'var(--text-3)', fontWeight: 500 }}>mm</span>
                </div>
                {rests[s3Bar.id] && (() => {
                  const expected = s3Bar.sawLength - s3Bar.pieces * s3Bar.productLen
                  const diff = Math.abs(Number(rests[s3Bar.id]) - expected)
                  return diff < 20
                    ? <div style={{ marginTop: 10, color: 'var(--success)', fontWeight: 600, textAlign: 'center' }}>✓ Binnen tolerantie</div>
                    : <div style={{ marginTop: 10, color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        <IconAlertTriangle size={14} />Afwijking {diff} mm — overleg met Bart
                      </div>
                })()}
              </div>

              {bars.length > 1 && (
                <div className="zf-nav-btns">
                  <button className="st-btn sm" disabled={s3bi === 0} onClick={() => setS3bi(i => i - 1)}>← Vorige</button>
                  <button className="st-btn sm primary" disabled={!rests[s3Bar.id] || s3bi >= bars.length - 1} onClick={() => setS3bi(i => i + 1)}>
                    Volgende →
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Step 4: Afronding ───────────────────────────────────── */}
          {step === 4 && (() => {
            const rest = Number(rests[s4Bar.id]) || 0
            const isScrap = rest < MIN_REST_MM
            return (
              <>
                <BarDots
                  bars={bars} activeIdx={s4bi}
                  doneIds={bars.filter(r => decisions[r.id] != null).map(r => r.id)}
                />

                <div className="zf-bar-info">
                  <span className="zf-bar-code">{s4Bar.barCode}</span>
                  <span className="zf-bar-loc">Gemeten rest: <strong>{fmm(rest)}</strong></span>
                </div>

                {isScrap ? (
                  <div className="zf-decision-scrap">
                    <IconTrash size={36} />
                    <div style={{ fontWeight: 700, fontSize: 16 }}>Schrootbak</div>
                    <div style={{ fontSize: 12, color: 'var(--danger)', opacity: 0.8 }}>
                      {rest} mm &lt; {MIN_REST_MM} mm minimum — gaat naar de schrootbak
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="zf-decision-cards">
                      <button
                        className={`zf-decision-card${decisions[s4Bar.id] === 'scrap' ? ' sel-danger' : ''}`}
                        onClick={() => setDecisions(p => ({ ...p, [s4Bar.id]: 'scrap' }))}
                      >
                        <IconTrash size={28} /><span>Schrootbak</span>
                      </button>
                      <button
                        className={`zf-decision-card${decisions[s4Bar.id] === 'store' ? ' sel-ok' : ''}`}
                        onClick={() => setDecisions(p => ({ ...p, [s4Bar.id]: 'store' }))}
                      >
                        <IconMapPin size={28} /><span>Opslaan</span>
                      </button>
                    </div>

                    {decisions[s4Bar.id] === 'store' && (
                      <div>
                        <div className="zf-hero-label" style={{ marginBottom: 6 }}>Opslaglocatie</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            className="st-input"
                            placeholder="Bijv. Hal A · Stelling 01 · R4"
                            value={locations[s4Bar.id] ?? ''}
                            onChange={e => setLocations(p => ({ ...p, [s4Bar.id]: e.target.value }))}
                          />
                          <button className="st-btn sm"><IconPrinter size={12} />Sticker</button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {bars.length > 1 && (
                  <div className="zf-nav-btns">
                    <button className="st-btn sm" disabled={s4bi === 0} onClick={() => setS4bi(i => i - 1)}>← Vorige</button>
                    <button className="st-btn sm primary" disabled={decisions[s4Bar.id] == null || s4bi >= bars.length - 1} onClick={() => setS4bi(i => i + 1)}>
                      Volgende →
                    </button>
                  </div>
                )}
              </>
            )
          })()}

        </div>

        {/* Footer CTA */}
        <div className="zf-modal-footer">
          {step === 1 && hasIssues && step1Done && (
            <span className="zf-warning-note"><IconAlertTriangle size={13} />Problemen gevonden — overleg vóór start</span>
          )}
          {step === 1 && (
            <button className="zf-cta" disabled={!step1Done || showIssue} onClick={startJob}>
              <IconPlayerPlay size={16} />Start zagen
            </button>
          )}
          {step === 2 && (
            <button className="zf-cta" disabled={!step2Done} onClick={() => setStep(3)}>
              Alles gezaagd → Meting
            </button>
          )}
          {step === 3 && (
            <button className="zf-cta" disabled={!step3Done} onClick={() => setStep(4)}>
              Meting klaar → Afronding
            </button>
          )}
          {step === 4 && (
            <button className="zf-cta" disabled={!step4Done} onClick={completeJob}>
              <IconCircleCheck size={16} />Job afsluiten
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ZaagflowPage() {
  const [reservations, setReservations] = useState(() => reservationsStore.list())
  const [search, setSearch]             = useState('')
  const [filter, setFilter]             = useState<'open' | 'in_progress' | 'done' | 'all'>('all')
  const [activeCalcNr, setActiveCalcNr] = useState<string | null>(null)

  const allJobs = useMemo(() => buildJobs(reservations), [reservations])
  const visibleJobs = useMemo(() =>
    allJobs
      .filter(j => filter === 'all' || j.status === filter)
      .filter(j => !search || j.calcNr.toLowerCase().includes(search.toLowerCase())),
    [allJobs, filter, search]
  )
  const activeJob = useMemo(
    () => allJobs.find(j => j.calcNr === activeCalcNr) ?? null,
    [allJobs, activeCalcNr]
  )

  function reload() { setReservations(reservationsStore.list()) }

  const counts = useMemo(() => ({
    open:        allJobs.filter(j => j.status === 'open').length,
    in_progress: allJobs.filter(j => j.status === 'in_progress').length,
    done:        allJobs.filter(j => j.status === 'done').length,
  }), [allJobs])

  return (
    <>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Zaagflow</div>
          <div className="st-page-sub">Zaagprocedure per job — volg de stappen</div>
        </div>
      </div>

      <div className="zaagflow-toolbar">
        <div className="zaagflow-filter-tabs">
          {([['all', 'Alles'], ['open', 'Open'], ['in_progress', 'Bezig'], ['done', 'Klaar']] as const).map(([v, label]) => (
            <button
              key={v}
              className={`zaagflow-filter-tab${filter === v ? ' active' : ''}`}
              onClick={() => setFilter(v)}
            >
              {label}
              {v !== 'all' && counts[v] > 0 && <span className="count">{counts[v]}</span>}
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

      {/* Modal — renders on top of the job list */}
      {activeJob && (
        <JobModal
          job={activeJob}
          onClose={() => { setActiveCalcNr(null); reload() }}
          onUpdate={reload}
        />
      )}
    </>
  )
}
