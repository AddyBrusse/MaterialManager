import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NumberInput, Select } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPrinter, IconAlertTriangle, IconLock } from '@tabler/icons-react'
import { rawMaterialsApi, formatLocation } from '../../api/raw-materials'
import { gradesApi } from '../../api/grades'
import { reservationsStore } from '../../api/reservations'
import type { RawMaterialRow } from '../../api/raw-materials'

// ── machines ──────────────────────────────────────────────────────────────────
const MACHINES = [
  { value: 'DMG',    label: 'DMG',    maxLength: 1200 },
  { value: 'Doosan', label: 'Doosan', maxLength: 1200 },
]

// ── params ────────────────────────────────────────────────────────────────────
interface Params {
  steekbreedte: number  // kerf per cut
  vlakToeslag:  number  // facing allowance per piece + one-time end stub
  grijplengte:  number  // collet grip stub — permanently unavailable at bar end
}
const DEFAULT_PARAMS: Params = { steekbreedte: 3, vlakToeslag: 3, grijplengte: 30 }

// ── core calculation ──────────────────────────────────────────────────────────
// vlakToeslag is already included per piece in productLen (werkstuk + kerf + vlakToeslag)
// available = min(effectiveBarMm, machineMax) − grijplengte  (grip stub is one-time end waste)
// pieces    = floor(available / productLen)
// sawLength = pieces × productLen + grijplengte  →  total bar consumed, shown on zaagbon
// rest      = available − pieces × productLen    →  physical scrap after cuts
function calcBar(
  effectiveMm: number,
  machineMax: number,
  productLen: number,
  grijplengte: number,
) {
  const capped    = Math.min(Math.max(effectiveMm, 0), machineMax)
  const available = capped - grijplengte
  if (available <= 0 || productLen <= 0) return { available: 0, pieces: 0, sawLength: 0, rest: 0 }
  const pieces    = Math.floor(available / productLen)
  const sawLength = pieces * productLen + grijplengte   // total consumed: cuts + grip stub
  const rest      = available - pieces * productLen     // scrap remainder
  return { available, pieces, sawLength, rest }
}

function fmm(mm: number) {
  return mm.toLocaleString('nl-NL') + ' mm'
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>{children}</div>
}

// ── page ──────────────────────────────────────────────────────────────────────
export function ZaagCalculatorPage() {
  // job inputs
  const [machine,       setMachine]       = useState('DMG')
  const [calculatieNr,  setCalulatieNr]   = useState('')
  const [aantal,        setAantal]        = useState<number | string>(1)
  const [werkstukL,     setWerkstukL]     = useState<number | string>('')
  const [materiaal,     setMateriaal]     = useState('')
  const [diameter,      setDiameter]      = useState('')
  const [params,        setParams]        = useState<Params>(DEFAULT_PARAMS)

  // session selection (not yet committed as reservations)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reserved, setReserved] = useState<Record<string, number>>({})

  // persisted reservations
  const [allReservations, setAllReservations] = useState(() => reservationsStore.list())

  // remote data
  const { data: rawData    } = useQuery({ queryKey: ['raw-materials'], queryFn: rawMaterialsApi.list })
  const { data: gradesData } = useQuery({ queryKey: ['grades'],        queryFn: gradesApi.list })
  const allBars = rawData?.data    ?? []
  const grades  = gradesData?.data ?? []

  // derived
  const machineMax = MACHINES.find(m => m.value === machine)?.maxLength ?? 1200
  const aantalNum  = Number(aantal) || 0
  const productLen = Number(werkstukL) + params.steekbreedte + params.vlakToeslag
  const inputReady = !!materiaal && !!diameter && Number(werkstukL) > 0 && aantalNum > 0

  // committed reserved mm per bar (from persisted reservations)
  const committedByBar = useMemo(() => {
    const map: Record<string, number> = {}
    for (const res of allReservations) {
      map[res.barId] = (map[res.barId] ?? 0) + res.sawLength
    }
    return map
  }, [allReservations])

  // diameter options for selected material
  const diameterOptions = useMemo(() => {
    if (!materiaal) return []
    const diams = new Set(
      allBars
        .filter(r => r.profile.volumeFormula === 'round' && r.grade.name === materiaal && Number(r.currentStock) > 0)
        .map(r => r.dimensions.diameter)
    )
    return [...diams].sort((a, b) => a - b)
  }, [allBars, materiaal])

  // matching bars, sorted longest first
  const matchingBars = useMemo(() => {
    if (!inputReady) return []
    return allBars
      .filter(r =>
        r.profile.volumeFormula === 'round' &&
        r.grade.name === materiaal &&
        r.dimensions.diameter === Number(diameter) &&
        Number(r.currentStock) > 0
      )
      .sort((a, b) => Number(b.currentStock) - Number(a.currentStock))
  }, [allBars, materiaal, diameter, inputReady])

  // per-bar results
  // effectiveMm = fysiek − committed reservations (= what "Beschikbaar" shows)
  // calcBar only deducts grijplengte — vlakToeslag is already per-piece inside productLen
  const barResults = useMemo(() =>
    matchingBars.map(bar => {
      const fysiek      = Number(bar.currentStock)
      const committed   = committedByBar[bar.id] ?? 0
      const effectiveMm = Math.max(0, fysiek - committed)
      return {
        bar,
        fysiek,
        committed,
        effectiveMm,   // ← "Beschikbaar" column: physical remaining, no overhead deducted
        ...calcBar(effectiveMm, machineMax, productLen, params.grijplengte),
      }
    }),
  [matchingBars, machineMax, productLen, params, committedByBar])

  // session total
  const sessionReserved = useMemo(
    () => [...selected].reduce((s, id) => s + (reserved[id] ?? 0), 0),
    [selected, reserved]
  )
  const nogTePlannen = Math.max(0, aantalNum - sessionReserved)
  const isFullyPlanned = sessionReserved >= aantalNum && aantalNum > 0

  function toggleBar(bar: RawMaterialRow, maxPieces: number) {
    const id = bar.id
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setReserved(r => { const c = { ...r }; delete c[id]; return c })
      } else {
        next.add(id)
        const already     = [...prev].reduce((s, sid) => s + (reserved[sid] ?? 0), 0)
        const stillNeeded = Math.max(0, aantalNum - already)
        setReserved(r => ({ ...r, [id]: Math.min(maxPieces, stillNeeded || maxPieces) }))
      }
      return next
    })
  }

  function handleReserveer() {
    if (selected.size === 0) return
    const items = barResults
      .filter(({ bar }) => selected.has(bar.id))
      .map(({ bar }) => {
        const res    = reserved[bar.id] ?? 0
        const sawLen = res * productLen + params.grijplengte  // total consumed: cuts + grip stub
        return {
          calculatieNr:   calculatieNr.trim(),
          barId:          bar.id,
          barCode:        bar.code,
          barLocation:    formatLocation(bar.locationSlot),
          barVorm:        bar.profile.name,
          pieces:         res,
          productLen,
          sawLength:      sawLen,
          fysiekeLengte:  Number(bar.currentStock),
          materiaal,
          diameter:       Number(diameter),
          werkstukLengte: Number(werkstukL),
          steekbreedte:   params.steekbreedte,
          vlakToeslag:    params.vlakToeslag,
          machine,
        }
      })
      .filter(i => i.pieces > 0)

    if (items.length === 0) return

    const created = reservationsStore.create(items)
    setAllReservations(prev => [...prev, ...created])
    setSelected(new Set())
    setReserved({})
    notifications.show({
      color: 'green',
      title: 'Reserveringen aangemaakt',
      message: `${created.length} as${created.length === 1 ? '' : 'sen'} gereserveerd${calculatieNr ? ` voor ${calculatieNr}` : ''}`,
    })
  }

  const selectedResults = barResults.filter(r => selected.has(r.bar.id))
  const today = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* page header */}
      <div className="st-page-hd no-print">
        <div>
          <div className="st-page-title">Zaag calculator</div>
          <div className="st-page-sub">Plan zaaglengte en selecteer assen uit de voorraad</div>
        </div>
        {selectedResults.length > 0 && (
          <div className="st-page-actions">
            <button className="st-btn" onClick={() => window.print()}>
              <IconPrinter size={14} />Zaagbon afdrukken
            </button>
          </div>
        )}
      </div>

      <div className="zaag-layout">

        {/* ── left: inputs ──────────────────────────────────────────────── */}
        <div className="zaag-inputs no-print">

          {/* taakinvoer */}
          <div className="zaag-card">
            <div className="zaag-card-hd">Taakinvoer</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              <Select
                label="Machine" size="sm" allowDeselect={false}
                data={MACHINES.map(m => ({ value: m.value, label: `${m.label} — max ${m.maxLength} mm` }))}
                value={machine}
                onChange={v => setMachine(v ?? 'DMG')}
              />

              <div>
                <FieldLabel>Calculatienummer <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>(optioneel)</span></FieldLabel>
                <input
                  className="st-input" style={{ width: '100%' }}
                  placeholder="bijv. WO-2026-0418"
                  value={calculatieNr}
                  onChange={e => setCalulatieNr(e.target.value)}
                />
              </div>

              <NumberInput
                label="Aantal werkstukken" size="sm" min={1}
                value={aantal} onChange={setAantal}
              />

              <NumberInput
                label="Werkstuk lengte" size="sm" min={1}
                placeholder="bijv. 116" suffix=" mm"
                value={werkstukL} onChange={setWerkstukL}
                allowDecimal={false}
              />

              <Select
                label="Kwaliteit (materiaal)" size="sm"
                placeholder="— selecteer —"
                data={grades.map(g => ({ value: g.name, label: g.name }))}
                value={materiaal || null}
                onChange={v => { setMateriaal(v ?? ''); setDiameter('') }}
              />

              <Select
                label="Diameter" size="sm"
                placeholder="— selecteer —"
                data={diameterOptions.map(d => ({ value: String(d), label: `Ø${d} mm` }))}
                value={diameter || null}
                onChange={v => setDiameter(v ?? '')}
                disabled={!materiaal}
              />

            </div>
          </div>

          {/* zaagparameters */}
          <div className="zaag-card">
            <div className="zaag-card-hd">Zaagparameters</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <NumberInput
                label="Steekbreedte (kerf)" size="sm" min={0} suffix=" mm"
                description="Breedte van het zaagblad per snede"
                value={params.steekbreedte}
                onChange={v => setParams(p => ({ ...p, steekbreedte: Number(v) || 0 }))}
              />
              <NumberInput
                label="Vlak toeslag" size="sm" min={0} suffix=" mm"
                description="Extra lengte per stuk voor afvlakken"
                value={params.vlakToeslag}
                onChange={v => setParams(p => ({ ...p, vlakToeslag: Number(v) || 0 }))}
              />
              <NumberInput
                label="Grijplengte" size="sm" min={0} suffix=" mm"
                description="Klauw-aanslaglengte — niet bruikbaar aan het einde van de as"
                value={params.grijplengte}
                onChange={v => setParams(p => ({ ...p, grijplengte: Number(v) || 0 }))}
              />
              <button className="st-btn sm" style={{ marginTop: 2, alignSelf: 'flex-start' }}
                onClick={() => setParams(DEFAULT_PARAMS)}>
                Standaard herstellen
              </button>
            </div>
          </div>

        </div>

        {/* ── right ─────────────────────────────────────────────────────── */}
        <div className="zaag-right">

          {/* calculation summary bar */}
          {inputReady && productLen > 0 && (
            <div className="zaag-summary-bar no-print">

              {/* formula */}
              <div className="zaag-formula">
                <div className="zaag-formula-part">
                  <span className="zaag-formula-val">{Number(werkstukL)}</span>
                  <span className="zaag-formula-lbl">werkstuk</span>
                </div>
                <span className="zaag-formula-op">+</span>
                <div className="zaag-formula-part">
                  <span className="zaag-formula-val">{params.steekbreedte}</span>
                  <span className="zaag-formula-lbl">kerf</span>
                </div>
                <span className="zaag-formula-op">+</span>
                <div className="zaag-formula-part">
                  <span className="zaag-formula-val">{params.vlakToeslag}</span>
                  <span className="zaag-formula-lbl">vlak toeslag</span>
                </div>
                <span className="zaag-formula-op">=</span>
                <div className="zaag-formula-part result">
                  <span className="zaag-formula-val">{productLen} mm</span>
                  <span className="zaag-formula-lbl">product lengte</span>
                </div>
              </div>

              <div className="zaag-summary-sep" />

              <div className="zaag-formula-part" style={{ minWidth: 96 }}>
                <span className="zaag-formula-val">{params.grijplengte} mm</span>
                <span className="zaag-formula-lbl">grijplengte</span>
              </div>

              <div className="zaag-summary-sep" />

              {/* nog te plannen — prominent */}
              <div className={`zaag-nog-counter ${isFullyPlanned ? 'done' : 'pending'}`}>
                <div className="zaag-nog-label">Nog te plannen</div>
                <div className="zaag-nog-val">
                  {nogTePlannen}
                  <span className="zaag-nog-total"> / {aantalNum} stuks</span>
                </div>
                {isFullyPlanned && (
                  <div className="zaag-nog-done">✓ volledig ingepland</div>
                )}
              </div>

              {/* reserveer button */}
              {selected.size > 0 && (
                <>
                  <div className="zaag-summary-sep" />
                  <button
                    className="st-btn primary sm"
                    onClick={handleReserveer}
                    title={!calculatieNr ? 'Vul een calculatienummer in voor registratie' : undefined}
                  >
                    <IconLock size={13} />
                    Reserveer assen
                  </button>
                </>
              )}

            </div>
          )}

          {/* bars table */}
          <div className="zaag-card zaag-bars-card no-print" style={{ padding: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Beschikbare assen</div>
              {barResults.length > 0 && (
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  {barResults.length} {barResults.length === 1 ? 'as' : 'assen'} gevonden
                </span>
              )}
            </div>

            {!inputReady ? (
              <div className="st-empty" style={{ padding: '40px 0' }}>
                Vul links machine, werkstuk lengte en materiaal in om assen te zoeken.
              </div>
            ) : barResults.length === 0 ? (
              <div className="st-empty" style={{ padding: '40px 0' }}>
                <IconAlertTriangle size={18} style={{ marginBottom: 6, color: 'var(--warning)' }} />
                <div>Geen assen gevonden voor <strong>{materiaal} Ø{diameter} mm</strong>.</div>
                <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-3)' }}>
                  Controleer de voorraad of pas het filter aan.
                </div>
              </div>
            ) : (
              <table className="st-tbl">
                <thead>
                  <tr>
                    <th style={{ width: 32 }} />
                    <th>As nummer</th>
                    <th>Locatie</th>
                    <th style={{ textAlign: 'right' }}>Fysieke lengte</th>
                    <th style={{ textAlign: 'right' }}>Beschikbaar</th>
                    <th style={{ textAlign: 'right' }}>Max stuks</th>
                    <th style={{ textAlign: 'right' }}>Te reserveren</th>
                    <th>Zaaginstructie</th>
                    <th style={{ textAlign: 'right' }}>Rest na zaag</th>
                  </tr>
                </thead>
                <tbody>
                  {barResults.map(({ bar, fysiek, committed, effectiveMm, available, pieces, sawLength, rest }) => {
                    const isSel   = selected.has(bar.id)
                    const res     = reserved[bar.id] ?? 0
                    const adjSaw  = res * productLen + params.grijplengte  // cuts + grip stub
                    const adjRest = available - res * productLen           // scrap after cuts
                    const canUse  = pieces > 0

                    return (
                      <tr
                        key={bar.id}
                        data-selected={isSel}
                        style={{ cursor: canUse ? 'pointer' : 'default', opacity: canUse ? 1 : 0.4 }}
                        onClick={() => canUse && toggleBar(bar, pieces)}
                      >
                        <td onClick={e => e.stopPropagation()}>
                          <span className="st-ck" data-on={isSel}
                            onClick={() => canUse && toggleBar(bar, pieces)} />
                        </td>
                        <td>
                          <span className="cell-mono cell-strong" style={{ fontSize: 12 }}>{bar.code}</span>
                        </td>
                        <td>
                          <span className="cell-muted" style={{ fontSize: 12 }}>{formatLocation(bar.locationSlot)}</span>
                        </td>
                        {/* fysieke lengte — what's on the shelf */}
                        <td className="cell-num cell-mono" style={{ fontSize: 12 }}>
                          {fmm(fysiek)}
                          {committed > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--warning)', marginTop: 1 }}>
                              −{fmm(committed)} geres.
                            </div>
                          )}
                        </td>
                        {/* beschikbaar — fysiek minus committed reservations (no overhead deducted) */}
                        <td className="cell-num cell-mono" style={{ fontSize: 12, color: effectiveMm < productLen ? 'var(--danger)' : 'var(--text)' }}>
                          {fmm(effectiveMm)}
                        </td>
                        <td className="cell-num cell-strong">{canUse ? pieces : '—'}</td>
                        <td className="cell-num" onClick={e => e.stopPropagation()}>
                          {isSel ? (
                            <input
                              type="number" min={1} max={pieces}
                              value={res}
                              onChange={e =>
                                setReserved(r => ({
                                  ...r,
                                  [bar.id]: Math.min(pieces, Math.max(1, Number(e.target.value))),
                                }))
                              }
                              className="st-input cell-mono"
                              style={{ width: 52, textAlign: 'right', padding: '2px 6px', fontSize: 12 }}
                            />
                          ) : (
                            <span className="cell-muted">—</span>
                          )}
                        </td>
                        <td>
                          <span className="cell-mono" style={{ fontSize: 12, fontWeight: isSel ? 600 : 400, color: canUse ? 'var(--text)' : 'var(--text-3)' }}>
                            {isSel
                              ? adjSaw > 0 ? `Zaag 1×${adjSaw}mm` : '—'
                              : canUse ? `Zaag 1×${sawLength}mm` : 'Te kort'}
                          </span>
                        </td>
                        <td className="cell-num cell-mono" style={{
                          fontSize: 12,
                          color: (isSel ? adjRest : rest) < 50 ? 'var(--danger)' : 'var(--text-3)',
                        }}>
                          {isSel ? fmm(adjRest) : fmm(rest)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── zaagbon (screen + print) ─────────────────────────────────── */}
          {selectedResults.length > 0 && (
            <div id="zaagbon" className="zaag-card" style={{ padding: 0 }}>

              {/* screen header */}
              <div className="no-print" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Zaagbon</div>
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{today}</span>
                {calculatieNr && <>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>·</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{calculatieNr}</span>
                </>}
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>·</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  {materiaal} Ø{diameter} mm · werkstuk {Number(werkstukL)} mm
                </span>
                <button className="st-btn sm" style={{ marginLeft: 'auto' }} onClick={() => window.print()}>
                  <IconPrinter size={12} />Afdrukken
                </button>
              </div>

              {/* print-only header */}
              <div className="zaag-print-hd">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>ZAAGBON</div>
                    {calculatieNr && (
                      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                        Calculatie: <span style={{ fontFamily: 'monospace' }}>{calculatieNr}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12 }}>
                    <div style={{ fontWeight: 600 }}>Datum: {today}</div>
                    <div>Machine: {machine}</div>
                    <div>Operator: ___________________</div>
                  </div>
                </div>
                <div style={{ background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 4, padding: '8px 12px', fontSize: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <span><strong>Materiaal:</strong> {materiaal}</span>
                  <span><strong>Diameter:</strong> Ø{diameter} mm</span>
                  <span><strong>Werkstuk:</strong> {Number(werkstukL)} mm</span>
                  <span><strong>Product lengte:</strong> {productLen} mm</span>
                  <span><strong>Kerf:</strong> {params.steekbreedte} mm</span>
                  <span><strong>Vlak toeslag:</strong> {params.vlakToeslag} mm</span>
                  <span><strong>Grijplengte:</strong> {params.grijplengte} mm</span>
                  <span><strong>Stuks:</strong> {aantalNum}</span>
                </div>
              </div>

              {/* table — shared screen + print */}
              <table className="st-tbl">
                <thead>
                  <tr>
                    <th>As nummer</th>
                    <th>Materiaal</th>
                    <th>Vorm</th>
                    <th>Diameter</th>
                    <th style={{ textAlign: 'right' }}>Huidige lengte</th>
                    <th>Locatie</th>
                    <th>Zaagopdracht</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedResults.map(({ bar }) => {
                    const res    = reserved[bar.id] ?? 0
                    const sawLen = res * productLen + params.grijplengte  // cuts + grip stub
                    return (
                      <tr key={bar.id}>
                        <td className="cell-mono cell-strong" style={{ fontSize: 12 }}>{bar.code}</td>
                        <td>{bar.grade.name}</td>
                        <td>{bar.profile.name}</td>
                        <td className="cell-mono">Ø{bar.dimensions.diameter}</td>
                        <td className="cell-num cell-mono">{fmm(Number(bar.currentStock))}</td>
                        <td className="cell-muted">{formatLocation(bar.locationSlot)}</td>
                        <td>
                          <span className="cell-mono cell-strong" style={{ fontSize: 13 }}>
                            Zaag 1×{sawLen}mm
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* print-only footer */}
              <div className="zaag-print-footer">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginTop: 24, paddingTop: 12, borderTop: '1px solid #ddd', fontSize: 12 }}>
                  <div>Gecontroleerd: ___________________</div>
                  <div>Gezaagd door: ___________________</div>
                  <div>Datum/tijd: ___________________</div>
                </div>
              </div>

            </div>
          )}

        </div>
      </div>
    </>
  )
}
