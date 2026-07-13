import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { IconPlus, IconTrash, IconX } from '@tabler/icons-react'
import { machinesApi, type Machine } from '../../api/machines'
import {
  overheadApi, computeMachineOverhead,
  DEFAULT_MACHINE_ROW,
  type MachineOverheadRow, type MachineOverheadResult, type OverheadConfig,
} from '../../api/overhead'

const e2   = (n: number) => n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtN = (n: number, dec = 0) => n.toLocaleString('nl-NL', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const COMP   = 'var(--bg-sidebar)'
const LBL_W  = 162   // label column px — wide enough for "Totaal incl. op."
const COL_W  = 130   // machine column px — long names wrap to 2 lines instead of clipping

// ── Section divider row ───────────────────────────────────────────────────────
function Sec({ label, cols, comp }: { label: string; cols: number; comp?: boolean }) {
  return (
    <tr style={{ cursor: 'default' }}>
      <td
        colSpan={cols + 2}
        className="oh-group-hd"
        style={{
          paddingTop: 7,
          background: comp ? COMP : undefined,
          borderTop: comp ? '2px solid var(--border)' : undefined,
        }}
      >
        {label}
      </td>
    </tr>
  )
}

// ── Label cell (sticky left) ──────────────────────────────────────────────────
function L({ text, title, comp, bold, accent }: {
  text: string; title?: string; comp?: boolean; bold?: boolean; accent?: boolean
}) {
  return (
    <td
      title={title ?? text}
      style={{
        position: 'sticky', left: 0, zIndex: 1,
        background: comp ? COMP : 'var(--bg-2)',
        padding: '0 8px',
        fontSize: 11.5,
        fontWeight: bold || accent ? 700 : 400,
        color: accent ? 'var(--accent)' : comp ? 'var(--text-2)' : 'var(--text-2)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        borderRight: '1px solid var(--border)',
      }}
    >
      {text}
    </td>
  )
}

// ── Editable input cell ───────────────────────────────────────────────────────
function IC({ value, onChange, step = 1, min = 0, ph, accent }: {
  value: number | null; onChange: (v: number | null) => void
  step?: number; min?: number; ph?: string; accent?: boolean
}) {
  return (
    <td style={{ padding: '1px 3px' }}>
      <input
        className="oh-input"
        style={{
          width: '100%',
          fontWeight: accent ? 700 : undefined,
          color: accent ? 'var(--accent)' : undefined,
        }}
        type="number" min={min} step={step} placeholder={ph}
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </td>
  )
}

// ── Read-only computed cell ───────────────────────────────────────────────────
function RC({ v, accent, bold, warn, muted, title: t }: {
  v: string; accent?: boolean; bold?: boolean; warn?: boolean; muted?: boolean; title?: string
}) {
  return (
    <td
      className="cell-num cell-mono"
      title={t}
      style={{
        background: COMP, padding: '0 8px', fontSize: 11.5,
        fontWeight: accent || bold ? 700 : undefined,
        color: accent ? 'var(--accent)' : warn ? 'var(--warn)' : muted ? 'var(--text-3)' : undefined,
      }}
    >
      {v}
    </td>
  )
}

// ── Machine name cell — wraps onto a 2nd line (growing the header row) instead
// of clipping long names like "Doosan LYNX 2100 LSYB" ────────────────────────
function NameCell({ value, onChange, title }: { value: string; onChange: (v: string) => void; title?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      className="oh-input-name"
      style={{ paddingRight: 14 }}
      rows={1}
      value={value}
      placeholder="Naam"
      title={title}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur() } }}
    />
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export function OverheadTab() {
  const qc = useQueryClient()
  const { data: machinesData } = useQuery({ queryKey: ['machines'], queryFn: machinesApi.list })
  const machines = machinesData?.data ?? []

  const [cfg, setCfg] = useState<OverheadConfig>(() => overheadApi.load())
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const nameTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [localNames, setLocalNames] = useState<Record<string, string>>({})

  function persist(next: OverheadConfig) { setCfg(next); overheadApi.save(next) }

  function getRow(id: string): MachineOverheadRow {
    return cfg.machines.find(r => r.machineId === id) ?? { machineId: id, ...DEFAULT_MACHINE_ROW }
  }
  function patchRow(id: string, patch: Partial<MachineOverheadRow>) {
    const next = { ...getRow(id), ...patch }
    const exists = cfg.machines.some(r => r.machineId === id)
    persist({ ...cfg, machines: exists ? cfg.machines.map(r => r.machineId === id ? next : r) : [...cfg.machines, next] })
  }
  function saveMachine(id: string, patch: Parameters<typeof machinesApi.update>[1]) {
    machinesApi.update(id, patch).then(() => qc.invalidateQueries({ queryKey: ['machines'] }))
  }
  function debouncedName(id: string, name: string) {
    clearTimeout(nameTimers.current[id])
    nameTimers.current[id] = setTimeout(() => saveMachine(id, { name }), 350)
  }

  async function addMachine() {
    const res = await machinesApi.create({ name: 'Nieuwe machine', machineRatePerHour: 0, operatorRatePerHour: 0, defaultSetupMin: 20, worksWeekends: false })
    persist({ ...cfg, machines: [...cfg.machines, { machineId: res.data.id, ...DEFAULT_MACHINE_ROW }] })
    qc.invalidateQueries({ queryKey: ['machines'] })
  }
  async function deleteMachine(id: string) {
    await machinesApi.remove(id)
    persist({ ...cfg, machines: cfg.machines.filter(r => r.machineId !== id) })
    qc.invalidateQueries({ queryKey: ['machines'] })
    setDeleteId(null)
  }

  const nameOf = (m: Machine) => localNames[m.id] ?? m.name
  const mc = machines.length
  const tblW = LBL_W + mc * COL_W

  // Pre-compute all results
  const res: Record<string, MachineOverheadResult> = {}
  for (const m of machines) res[m.id] = computeMachineOverhead(getRow(m.id), cfg.shop, mc)

  // Shared row renderer helpers
  const inputRow = (
    label: string,
    getValue: (m: Machine, r: MachineOverheadRow) => number | null,
    setValue: (id: string, v: number | null) => void,
    opts?: { step?: number; min?: number; ph?: string; accent?: (m: Machine, r: MachineOverheadRow) => boolean; title?: string },
  ) => (
    <tr style={{ cursor: 'default' }}>
      <L text={label} title={opts?.title} />
      {machines.map(m => {
        const r = getRow(m.id)
        return (
          <IC key={m.id} value={getValue(m, r)} onChange={v => setValue(m.id, v)}
            step={opts?.step} min={opts?.min} ph={opts?.ph}
            accent={opts?.accent?.(m, r)} />
        )
      })}
      <td />
    </tr>
  )

  const checkRow = (
    label: string,
    getValue: (m: Machine) => boolean,
    setValue: (id: string, v: boolean) => void,
    opts?: { title?: string },
  ) => (
    <tr style={{ cursor: 'default' }}>
      <L text={label} title={opts?.title} />
      {machines.map(m => (
        <td key={m.id} style={{ padding: '1px 3px', textAlign: 'center' }}>
          <input type="checkbox" checked={getValue(m)} onChange={e => setValue(m.id, e.target.checked)} />
        </td>
      ))}
      <td />
    </tr>
  )

  const computedRow = (
    label: string,
    getValue: (m: Machine, r: MachineOverheadResult) => string,
    opts?: { accent?: boolean; bold?: boolean; muted?: boolean; title?: string; warnFn?: (m: Machine) => boolean; titleFn?: (m: Machine) => string },
  ) => (
    <tr style={{ cursor: 'default' }}>
      <L text={label} comp accent={opts?.accent} bold={opts?.bold} title={opts?.title} />
      {machines.map(m => (
        <RC key={m.id} v={getValue(m, res[m.id])}
          accent={opts?.accent} bold={opts?.bold} muted={opts?.muted}
          warn={opts?.warnFn?.(m)} title={opts?.titleFn?.(m)} />
      ))}
      <td style={{ background: COMP }} />
    </tr>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Machines</h3>
          <p style={{ color: 'var(--text-3)', margin: '2px 0 0', fontSize: 12 }}>
            Kosten­structuur per machine — wijzig tarieven in <strong>Bedrijfskosten</strong>.
            <strong> u/dag</strong> leeg = standaard shift ({cfg.shop.hoursPerDay}u).
          </p>
        </div>
        <button className="st-btn primary sm" style={{ flexShrink: 0, marginTop: 2 }} onClick={addMachine}>
          <IconPlus size={12} />Machine
        </button>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-2)', display: 'inline-block', minWidth: '100%' }}>
        <div style={{ overflowX: 'auto' }}>
          <table
            className="st-tbl oh-tbl"
            style={{ tableLayout: 'fixed', width: '100%', minWidth: LBL_W + mc * COL_W, borderCollapse: 'separate', borderSpacing: 0 }}
          >
            <colgroup>
              <col style={{ width: LBL_W }} />
              {machines.map(m => <col key={m.id} style={{ width: COL_W }} />)}
              <col />
            </colgroup>

            {/* ── Header: machine names ── */}
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--bg-2)', zIndex: 3, borderRight: '1px solid var(--border)', fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', padding: '0 8px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Machine naam
                </th>
                {machines.length === 0 && (
                  <th style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-3)', padding: '8px 10px', textAlign: 'left' }}>
                    Klik "+ Machine" om te beginnen
                  </th>
                )}
                {machines.map((m, i) => (
                  <th key={m.id} style={{ padding: '3px 4px', textAlign: 'center' }}>
                    {deleteId === m.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 600 }}>Verwijder?</span>
                        <button className="st-btn xs danger" style={{ padding: '0 5px', fontSize: 10, height: 18 }} onClick={() => deleteMachine(m.id)}>Ja</button>
                        <button className="st-icon-btn" style={{ padding: 2 }} onClick={() => setDeleteId(null)}><IconX size={11} /></button>
                      </div>
                    ) : (
                      <div style={{ position: 'relative' }}>
                        <NameCell
                          value={nameOf(m)} title={nameOf(m)}
                          onChange={v => { setLocalNames(p => ({ ...p, [m.id]: v })); debouncedName(m.id, v) }}
                        />
                        <button
                          className="st-icon-btn danger"
                          style={{ position: 'absolute', right: 1, top: 1, padding: 1, opacity: 0, transition: 'opacity .15s' }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                          onClick={() => setDeleteId(m.id)}
                        >
                          <IconTrash size={11} />
                        </button>
                      </div>
                    )}
                  </th>
                ))}
                <th />
              </tr>
            </thead>

            <tbody>
              {/* ── Machine configuratie ── */}
              <Sec label="Machine configuratie" cols={mc} />
              {inputRow('Machine tarief',  (m) => m.machineRatePerHour,  (id, v) => saveMachine(id, { machineRatePerHour:  v ?? 0 }), { step: 1, ph: '0' })}
              {inputRow('Operator (€/u)',  (m) => m.operatorRatePerHour, (id, v) => saveMachine(id, { operatorRatePerHour: v ?? 0 }), { step: 1, ph: '0' })}
              {checkRow('Werkt in weekend', (m) => m.worksWeekends, (id, v) => saveMachine(id, { worksWeekends: v }), { title: 'Machine draait onbemand door op zaterdag/zondag' })}
              {/* Totaal tarief row — warns when overhead < machine tarief */}
              <tr style={{ cursor: 'default' }}>
                <L text="Totaal" bold />
                {machines.map(m => {
                  const tarief   = m.machineRatePerHour + m.operatorRatePerHour
                  const overhead = res[m.id].totalOverheadPerHour + m.operatorRatePerHour
                  const warn     = tarief < overhead   // we charge less than it costs
                  return (
                    <td
                      key={m.id}
                      className="cell-num cell-mono"
                      style={{ padding: '0 8px', fontSize: 11.5, fontWeight: 700, color: warn ? 'var(--danger)' : undefined }}
                      title={warn ? `Tarief (€${e2(tarief)}) dekt de berekende overhead niet (€${e2(overhead)}) — je verliest €${e2(overhead - tarief)} per productief uur` : undefined}
                    >
                      {warn && <span style={{ marginRight: 3, fontSize: 10 }}>⚠</span>}{e2(tarief)}
                    </td>
                  )
                })}
                <td />
              </tr>

              {/* ── Overhead invoer ── */}
              <Sec label="Overhead invoer" cols={mc} />
              {inputRow('Vloer (m²)',          (_, r) => r.floorM2,         (id, v) => patchRow(id, { floorM2:         v ?? 0 }),                           { step: 1,    ph: '20'    })}
              {inputRow('Vermogen (kW)',        (_, r) => r.powerKw,         (id, v) => patchRow(id, { powerKw:         v ?? 0 }),                           { step: 0.5,  ph: '15'    })}
              {inputRow('Aanschaf (€)',         (_, r) => r.purchasePrice,   (id, v) => patchRow(id, { purchasePrice:   v ?? 0 }),                           { step: 1000, ph: '80000' })}
              {inputRow('Levensduur (jr)',      (_, r) => r.usefulLifeYears, (id, v) => patchRow(id, { usefulLifeYears: Math.max(1, v ?? 1) }),              { step: 1, min: 1, ph: '5' })}
              {inputRow('Onderhoud uren/jr',    (_, r) => r.maintenanceHoursPerYear, (id, v) => patchRow(id, { maintenanceHoursPerYear: v ?? 0 }), { step: 1,   ph: '40', title: 'Geplande onderhoudsuren per jaar (servicebeurten, stilstand)' })}
              {inputRow('Onderhoud kosten/u',  (_, r) => r.maintenanceCostPerHour,  (id, v) => patchRow(id, { maintenanceCostPerHour:  v ?? 0 }), { step: 5,   ph: '80', title: 'Kosten per onderhoudsuur (monteur + onderdelen, €/uur)' })}
              {inputRow('Verzekering (€/jr)',   (_, r) => r.annualMachineInsuranceEur, (id, v) => patchRow(id, { annualMachineInsuranceEur: v ?? 0 }),       { step: 100,  ph: '0'    })}
              {inputRow('Bezetting (%)',        (_, r) => r.utilizationPct,  (id, v) => patchRow(id, { utilizationPct:  Math.min(100, Math.max(1, v ?? 1)) }), { step: 5, min: 1, ph: '70' })}
              {inputRow(
                `u/dag  (std: ${cfg.shop.hoursPerDay})`,
                (_, r) => r.hoursPerDayOverride,
                (id, v) => patchRow(id, { hoursPerDayOverride: v }),
                {
                  step: 1, min: 1, ph: String(cfg.shop.hoursPerDay),
                  accent: (_, r) => r.hoursPerDayOverride != null && r.hoursPerDayOverride > 0,
                  title: 'Leeg = standaard shift. Verhoog voor robot-belading (dal-tarief actief voor extra uren).',
                },
              )}

              {/* ── Berekend ── */}
              <Sec label="Berekend" cols={mc} comp />
              {computedRow('Prod. uren',     (_, r) => `${fmtN(r.productiveHours)} u`,       { muted: true })}
              {computedRow('Afschrijving',   (_, r) => e2(r.depreciationPerHour))}
              {computedRow('Huisvesting',    (_, r) => e2(r.housingPerHour),                  { title: 'Huur + gebouwverzekering + onderhoud, verdeeld naar vloeropp.' })}
              {computedRow('Stroom',         (m, r) => e2(r.powerPerHour) + (getRow(m.id).hoursPerDayOverride != null && getRow(m.id).hoursPerDayOverride! > 0 ? ' D' : ''),
                { titleFn: m => getRow(m.id).hoursPerDayOverride != null && getRow(m.id).hoursPerDayOverride! > 0 ? `Dal-tarief actief voor uren > ${cfg.shop.hoursPerDay}u/dag` : '' })}
              {computedRow('Onderhoud',      (_, r) => e2(r.maintenancePerHour))}
              {computedRow('Verzekering',    (_, r) => e2(r.machineInsurancePerHour))}
              {computedRow('Personeel',      (_, r) => e2(r.staffCostsPerHour),               { title: 'Aandeel indirecte personeelskosten, gelijk verdeeld' })}
              {computedRow('Overhead',       (_, r) => e2(r.totalOverheadPerHour),            { accent: true })}
              {computedRow('Totaal incl. operator', (m, r) => e2(r.totalOverheadPerHour + m.operatorRatePerHour), {
                bold: true,
                titleFn: m => `Berekende overhead + operator. Huidig totaal tarief: €${e2(m.machineRatePerHour + m.operatorRatePerHour)}`,
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
        <strong>Overhead</strong> = afschr. + huisv. + stroom + ond. + verz. + pers. &nbsp;·&nbsp;
        <strong>Totaal</strong> = overhead + operator &nbsp;·&nbsp;
        <span style={{ color: 'var(--warn)' }}>Oranje</span> = M.tarief wijkt &gt;€2 af &nbsp;·&nbsp;
        <strong>D</strong> = dal-tarief actief
      </p>
    </div>
  )
}
