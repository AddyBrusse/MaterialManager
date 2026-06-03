import { useState, useMemo, useEffect } from 'react'
import {
  IconSearch, IconCircleCheck, IconCircle, IconAlertTriangle,
  IconCheck, IconX, IconTrash, IconMapPin, IconPlayerPlay,
  IconPrinter, IconArrowRight, IconChevronRight,
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

type CheckField = 'materiaal' | 'diameter' | 'lengte'

interface BarState {
  materiaalOk: boolean | null
  diameterOk:  boolean | null
  lengteOk:    boolean | null
  issueField:  CheckField | null
  issueText:   string
  showIssue:   boolean
  sawed:       boolean
  rest:        string
  decision:    'store' | 'scrap' | null
  location:    string
}

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

const STEP_LABELS = ['Keuring', 'Zagen', 'Meting', 'Afronding']

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

// ── Modal ─────────────────────────────────────────────────────────────────────

function JobModal({ job, onClose, onUpdate }: {
  job: ZaagJob; onClose: () => void; onUpdate: () => void
}) {
  const bars = job.reservations

  // Per-bar cursor
  const [barIdx, setBarIdx]       = useState(0)
  const [subStep, setSubStep]     = useState<1 | 2 | 3 | 4>(1)
  const [checkField, setCheckField] = useState<CheckField>('materiaal')
  const [jobStarted, setJobStarted] = useState(job.status === 'in_progress')

  // Per-bar state
  const [barStates, setBarStates] = useState<Record<string, BarState>>(() =>
    Object.fromEntries(bars.map(r => [r.id, {
      materiaalOk: null, diameterOk: null, lengteOk: null, issueField: null,
      issueText: '', showIssue: false,
      sawed: false, rest: '', decision: null, location: '',
    }]))
  )

  const bar  = bars[barIdx]
  const bs   = barStates[bar.id]
  const grijp = bar.sawLength - bar.pieces * bar.productLen

  // Completion gates
  const keuringDone = bs.materiaalOk !== null && bs.diameterOk !== null && bs.lengteOk !== null && !bs.showIssue
  const hasIssues   = bs.materiaalOk === false || bs.diameterOk === false || bs.lengteOk === false
  const step4Done   = (() => {
    const rest = Number(bs.rest) || 0
    return rest < MIN_REST_MM ? true : bs.decision != null
  })()

  // Auto-scrap short rests entering step 4
  useEffect(() => {
    if (subStep !== 4) return
    const rest = Number(bs.rest) || 0
    if (rest < MIN_REST_MM && bs.decision == null) {
      setBarStates(p => ({ ...p, [bar.id]: { ...p[bar.id], decision: 'scrap' } }))
    }
  }, [subStep, barIdx]) // eslint-disable-line

  // Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const CHECK_ORDER: CheckField[] = ['materiaal', 'diameter', 'lengte']
  function nextField(f: CheckField): CheckField | null {
    const i = CHECK_ORDER.indexOf(f)
    return i < CHECK_ORDER.length - 1 ? CHECK_ORDER[i + 1] : null
  }

  function handleCheck(val: boolean) {
    const stateKey = checkField === 'materiaal' ? 'materiaalOk'
      : checkField === 'diameter' ? 'diameterOk' : 'lengteOk'
    setBarStates(p => ({
      ...p,
      [bar.id]: {
        ...p[bar.id],
        [stateKey]: val,
        issueField: !val ? checkField : p[bar.id].issueField,
        showIssue: !val,
      },
    }))
    // Advance to the next check after a correct answer
    if (val) {
      const nf = nextField(checkField)
      if (nf) setTimeout(() => setCheckField(nf), 180)
    }
  }

  function dismissIssue() {
    setBarStates(p => ({ ...p, [bar.id]: { ...p[bar.id], showIssue: false } }))
    // Continue to the next check after acknowledging an issue
    const nf = nextField(checkField)
    if (nf) setTimeout(() => setCheckField(nf), 50)
  }

  function startJob() {
    bars.forEach(r => reservationsStore.setStatus(r.id, 'in_progress'))
    setJobStarted(true)
    setSubStep(2)
    onUpdate()
  }

  function advanceBar() {
    // Complete this bar and move on
    reservationsStore.complete(bar.id, Number(bs.rest) || null)
    onUpdate()
    if (barIdx < bars.length - 1) {
      setBarIdx(i => i + 1)
      setSubStep(1)
      setCheckField('materiaal')
    } else {
      notifications.show({ color: 'green', title: 'Job afgerond!', message: `${job.calcNr} is voltooid.` })
      onClose()
    }
  }

  // Overall progress across all bars
  const totalSteps = bars.length * 4
  const doneSteps  = barIdx * 4 + (subStep - 1)

  return (
    <div className="zf-overlay" onClick={onClose}>
      <div className="zf-modal" onClick={e => e.stopPropagation()}>

        {/* Thin progress strip */}
        <div className="zf-progress-track">
          <div className="zf-progress-fill" style={{ width: `${(doneSteps / totalSteps) * 100}%` }} />
        </div>

        {/* Header */}
        <div className="zf-modal-hd">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="zf-job-title">{job.calcNr}</div>
            <div className="zf-job-sub">{job.machine} · {job.materiaal} Ø{job.diameter} mm · {job.totalPcs} stuks</div>
          </div>

          {/* Bar position indicator (multi-bar only) */}
          {bars.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {bars.map((_, i) => (
                  <div key={i} style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: i < barIdx ? 'var(--success)' : i === barIdx ? 'var(--accent)' : 'var(--border-strong)',
                    transform: i === barIdx ? 'scale(1.35)' : 'none',
                    transition: 'all .2s',
                    flexShrink: 0,
                  }} />
                ))}
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                As {barIdx + 1} / {bars.length}
              </span>
            </div>
          )}

          <StepDots step={subStep} />

          <button className="st-icon-btn" onClick={onClose} title="Sluiten (Esc)" style={{ flexShrink: 0 }}>
            <IconX size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="zf-modal-body">

          {/* Bar identifier */}
          <div className="zf-bar-info">
            <span className="zf-bar-code">{bar.barCode}</span>
            <span className="zf-bar-loc"><IconMapPin size={12} />{bar.barLocation || '—'}</span>
          </div>

          {/* ── Sub-step 1: Keuring ───────────────────────────────────── */}

          {subStep === 1 && bs.showIssue && (
            <div className="zf-issue-panel">
              <IconAlertTriangle size={36} style={{ color: 'var(--warning)' }} />
              <div className="zf-issue-title">Overleg met Bart</div>
              <div className="zf-issue-sub">
                {bs.issueField === 'materiaal' ? 'Verkeerd materiaalnummer'
                  : bs.issueField === 'diameter' ? 'Diameter klopt niet'
                  : 'Lengte klopt niet'} — overleg vóór je verdergaat.
              </div>
              <textarea
                className="st-input"
                style={{ width: '100%', minHeight: 60, resize: 'none', fontSize: 12, marginTop: 4 }}
                placeholder="Notitie (optioneel)…"
                value={bs.issueText}
                onChange={e => setBarStates(p => ({ ...p, [bar.id]: { ...p[bar.id], issueText: e.target.value } }))}
              />
              <button className="st-btn primary" onClick={dismissIssue}>Begrepen → ga verder</button>
            </div>
          )}

          {/* Active check question */}
          {subStep === 1 && !bs.showIssue && !keuringDone && (
            <>
              <div className="zf-check-hero-block">
                <div className="zf-question-type">
                  {checkField === 'materiaal' ? '① Materiaalnummer'
                    : checkField === 'diameter' ? '② Diameter controle'
                    : '③ Lengte controle'}
                </div>
                <div className="zf-question-lbl">
                  {checkField === 'materiaal' ? 'Heb je het juiste materiaal gepakt?'
                    : checkField === 'diameter' ? 'Is de diameter correct?'
                    : 'Klopt de lengte van de staaf?'}
                </div>
                <div
                  className="zf-question-hero"
                  style={checkField === 'materiaal' && bar.barCode.length > 7 ? { fontSize: 36 } : undefined}
                >
                  {checkField === 'materiaal' ? bar.barCode
                    : checkField === 'diameter' ? `Ø ${bar.diameter} mm`
                    : fmm(bar.fysiekeLengte)}
                </div>
                {checkField === 'materiaal' && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                    {bar.materiaal} · {bar.barVorm} · {bar.barLocation || '—'}
                  </div>
                )}
                {checkField === 'lengte' && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                    Fysieke lengte van de staaf op de stelling
                  </div>
                )}
              </div>

              <div className="zf-check-pair">
                <button className="zf-check-btn ok" onClick={() => handleCheck(true)}>
                  <IconCheck size={32} /><span>Klopt</span>
                </button>
                <button className="zf-check-btn nok" onClick={() => handleCheck(false)}>
                  <IconX size={32} /><span>Niet goed</span>
                </button>
              </div>

              {/* Running tally of completed checks */}
              {(bs.materiaalOk !== null || bs.diameterOk !== null) && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {bs.materiaalOk !== null && checkField !== 'materiaal' && (
                    <span className={`zf-pill${bs.materiaalOk ? ' ok' : ' nok'}`}>
                      {bar.barCode} {bs.materiaalOk ? '✓' : '✗'}
                    </span>
                  )}
                  {bs.diameterOk !== null && checkField !== 'diameter' && (
                    <span className={`zf-pill${bs.diameterOk ? ' ok' : ' nok'}`}>
                      Ø {bar.diameter} mm {bs.diameterOk ? '✓' : '✗'}
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          {/* Keuring summary — both checks done */}
          {subStep === 1 && !bs.showIssue && keuringDone && (
            <div className="zf-keuring-done">
              <IconCircleCheck size={32} style={{ color: hasIssues ? 'var(--warning)' : 'var(--success)' }} />
              <div style={{ fontWeight: 700, fontSize: 16, color: hasIssues ? 'var(--warning)' : 'var(--success)' }}>
                {hasIssues ? 'Keuring klaar — problemen genoteerd' : 'Keuring geslaagd'}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <span className={`zf-pill${bs.materiaalOk ? ' ok' : ' nok'}`}>
                  {bar.barCode} {bs.materiaalOk ? '✓' : '✗'}
                </span>
                <span className={`zf-pill${bs.diameterOk ? ' ok' : ' nok'}`}>
                  Ø {bar.diameter} mm {bs.diameterOk ? '✓' : '✗'}
                </span>
                <span className={`zf-pill${bs.lengteOk ? ' ok' : ' nok'}`}>
                  {fmm(bar.fysiekeLengte)} {bs.lengteOk ? '✓' : '✗'}
                </span>
              </div>
            </div>
          )}

          {/* ── Sub-step 2: Zagen ─────────────────────────────────────── */}
          {subStep === 2 && (
            <>
              <div className="zf-hero">
                <div className="zf-hero-label">Zaagopdracht</div>
                <div className="zf-hero-value">{bar.pieces}× {bar.werkstukLengte} mm</div>
                <div className="zf-hero-sub">
                  Totaal {fmm(bar.sawLength)} · kerf {bar.steekbreedte} mm · grip {fmm(grijp)}
                </div>
              </div>

              <button
                className={`zf-done-btn${bs.sawed ? ' done' : ''}`}
                onClick={() => setBarStates(p => ({ ...p, [bar.id]: { ...p[bar.id], sawed: !p[bar.id].sawed } }))}
              >
                {bs.sawed
                  ? <><IconCircleCheck size={20} />Uitgevoerd ✓</>
                  : <><IconCircle size={20} />Markeer als uitgevoerd</>
                }
              </button>
            </>
          )}

          {/* ── Sub-step 3: Meting ────────────────────────────────────── */}
          {subStep === 3 && (
            <>
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
                Verwacht rest ≈ {fmm(bar.sawLength - bar.pieces * bar.productLen)}
              </div>
              <div className="zf-hero">
                <div className="zf-hero-label">Gemeten restlengte</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14 }}>
                  <input
                    key={barIdx}
                    type="number" min={0}
                    className="st-input cell-mono"
                    style={{ fontSize: 32, height: 62, width: 150, textAlign: 'center' }}
                    placeholder="0"
                    value={bs.rest}
                    autoFocus
                    onChange={e => setBarStates(p => ({ ...p, [bar.id]: { ...p[bar.id], rest: e.target.value } }))}
                  />
                  <span style={{ fontSize: 20, color: 'var(--text-3)', fontWeight: 500 }}>mm</span>
                </div>
                {bs.rest && (() => {
                  const expected = bar.sawLength - bar.pieces * bar.productLen
                  const diff = Math.abs(Number(bs.rest) - expected)
                  return diff < 20
                    ? <div style={{ marginTop: 10, color: 'var(--success)', fontWeight: 600, textAlign: 'center' }}>✓ Binnen tolerantie</div>
                    : <div style={{ marginTop: 10, color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        <IconAlertTriangle size={14} />Afwijking {diff} mm — overleg met Bart
                      </div>
                })()}
              </div>
            </>
          )}

          {/* ── Sub-step 4: Afronding ─────────────────────────────────── */}
          {subStep === 4 && (() => {
            const rest = Number(bs.rest) || 0
            const isScrap = rest < MIN_REST_MM
            return (
              <>
                <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-2)' }}>
                  Gemeten rest:{' '}
                  <strong style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{fmm(rest)}</strong>
                </div>

                {isScrap ? (
                  <div className="zf-decision-scrap">
                    <IconTrash size={36} />
                    <div style={{ fontWeight: 700, fontSize: 16 }}>Schrootbak</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {rest} mm &lt; {MIN_REST_MM} mm minimum — gaat naar de schrootbak
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="zf-decision-cards">
                      <button
                        className={`zf-decision-card${bs.decision === 'scrap' ? ' sel-danger' : ''}`}
                        onClick={() => setBarStates(p => ({ ...p, [bar.id]: { ...p[bar.id], decision: 'scrap' } }))}
                      >
                        <IconTrash size={28} /><span>Schrootbak</span>
                      </button>
                      <button
                        className={`zf-decision-card${bs.decision === 'store' ? ' sel-ok' : ''}`}
                        onClick={() => setBarStates(p => ({ ...p, [bar.id]: { ...p[bar.id], decision: 'store' } }))}
                      >
                        <IconMapPin size={28} /><span>Opslaan</span>
                      </button>
                    </div>

                    {bs.decision === 'store' && (
                      <div>
                        <div className="zf-hero-label" style={{ marginBottom: 6 }}>Opslaglocatie</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            className="st-input"
                            placeholder="Bijv. Hal A · Stelling 01 · R4"
                            value={bs.location}
                            onChange={e => setBarStates(p => ({ ...p, [bar.id]: { ...p[bar.id], location: e.target.value } }))}
                          />
                          <button className="st-btn sm"><IconPrinter size={12} />Sticker</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )
          })()}

        </div>

        {/* Footer CTA */}
        <div className="zf-modal-footer">
          {subStep === 1 && hasIssues && keuringDone && (
            <span className="zf-warning-note"><IconAlertTriangle size={13} />Problemen gevonden — overleg vóór start</span>
          )}
          {subStep === 1 && (
            <button
              className="zf-cta"
              disabled={!keuringDone || bs.showIssue}
              onClick={jobStarted ? () => setSubStep(2) : startJob}
            >
              <IconPlayerPlay size={16} />Start zagen
            </button>
          )}
          {subStep === 2 && (
            <button className="zf-cta" disabled={!bs.sawed} onClick={() => setSubStep(3)}>
              Meting →
            </button>
          )}
          {subStep === 3 && (
            <button className="zf-cta" disabled={!bs.rest} onClick={() => setSubStep(4)}>
              Afronding →
            </button>
          )}
          {subStep === 4 && (
            barIdx < bars.length - 1 ? (
              <button className="zf-cta" disabled={!step4Done} onClick={advanceBar}>
                <IconArrowRight size={16} />Volgende as →
              </button>
            ) : (
              <button className="zf-cta" disabled={!step4Done} onClick={advanceBar}>
                <IconCircleCheck size={16} />Job afsluiten
              </button>
            )
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
  const [filter, setFilter]             = useState<'open' | 'in_progress' | 'done' | 'all'>('open')
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
          {([['open', 'Open'], ['in_progress', 'Bezig'], ['done', 'Klaar'], ['all', 'Alles']] as const).map(([v, label]) => (
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
