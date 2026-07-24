import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Select, NumberInput, Modal, TextInput, Button, Group, Stack, Divider } from '@mantine/core'
import type { Article, ArticleEstimate, EstimateNode, EstimateNodeType, EstimateStep } from '../../api/articles'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { machinesApi } from '../../api/machines'
import { rawMaterialsApi, formatDimensions, computeWeightKg, type ProfileInfo, type RawMaterialRow } from '../../api/raw-materials'
import { MaterialPickerModal } from './MaterialPickerModal'
import './article-calculator.css'
import {
  buildEstimateCtx, computeEstimateTotals, materialCostPerPiece, machineRatePerHour, machineMinutes, minToHm,
  type EstimateCtx,
} from '../../api/estimate'
import { Ic, Icon } from './calc-icons'

const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
const eur = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const num = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })
/** Stable key for a dimensions object regardless of key insertion order. */
const dimsKey = (d: Record<string, number>) =>
  JSON.stringify(Object.fromEntries(Object.keys(d).sort().map(k => [k, d[k]])))

type ProfileShape = ProfileInfo

/** "S355 — Ø50 mm" style label from grade + profile + dims. */
function materialName(
  gradeId: string | null, profileId: string | null, dims: Record<string, number> | null,
  grades: { id: string; name: string }[], profiles: ProfileShape[],
): string {
  const g = grades.find(x => x.id === gradeId)
  if (!g) return 'Nieuw materiaal'
  const p = profileId ? profiles.find(x => x.id === profileId) : null
  const dimStr = p && dims ? formatDimensions(p, dims) : ''
  return [g.name, dimStr].filter(Boolean).join(' — ')
}

/** "Ø50 × 300 mm · 4,62 kg · € 1,85/kg" — material spec text per SPEC. */
function materialSpec(node: EstimateNode, ctx: EstimateCtx, grades: { id: string; densityKgM3: number; pricePerKg?: number }[], profiles: ProfileShape[]): string {
  const g = grades.find(x => x.id === node.gradeId)
  if (!g) return '—'
  const nodeProfile = node.profileId ? profiles.find(p => p.id === node.profileId) : undefined
  const formula = (nodeProfile?.volumeFormula ?? ctx.profileFormula) as ProfileInfo['volumeFormula'] | undefined
  const dims = node.dimensions && Object.keys(node.dimensions).length > 0 ? node.dimensions : ctx.recipe?.dimensions
  const len = node.lengthMm ?? ctx.recipe?.lengthPerPieceMm ?? 0
  const priceStr = `${eur(g.pricePerKg ?? 0)}/kg`
  if (!formula || !dims) return `0 kg · ${priceStr}`
  const kg = computeWeightKg(formula, dims, len, g.densityKgM3)
  const dimProfile = nodeProfile ?? (ctx.recipe?.profileId ? profiles.find(p => p.id === ctx.recipe!.profileId) : undefined)
  const dimStr = dimProfile ? formatDimensions(dimProfile, dims) : ''
  const lenStr = len ? ` × ${len} mm` : ''
  return `${dimStr}${lenStr} · ${num(kg)} kg · ${priceStr}`
}

// ── Configure popovers ──────────────────────────────────────────────────────
function MaterialConfig({ node, grades, profiles, stockRows, onChange, embedded = false, size = 'xs' }: {
  node: EstimateNode
  grades: { id: string; name: string; densityKgM3: number; pricePerKg?: number }[]
  profiles: ProfileShape[]
  stockRows: RawMaterialRow[]
  onChange: (p: Partial<EstimateNode>) => void
  embedded?: boolean
  size?: 'xs' | 'sm'
}) {
  const stockGradeIds = new Set(stockRows.map(r => r.gradeId))
  const gradesInStock = grades.filter(g => stockGradeIds.has(g.id))
  const gradeOptions = gradesInStock.length ? gradesInStock : grades

  const stockForGrade = stockRows.filter(r => !node.gradeId || r.gradeId === node.gradeId)
  const profileIds = new Set(stockForGrade.map(r => r.profileId))
  const profilesForGrade = profiles.filter(p => profileIds.has(p.id))
  const profileOptions = profilesForGrade.length ? profilesForGrade : profiles

  const stockForGradeProfile = stockForGrade.filter(r => !node.profileId || r.profileId === node.profileId)

  const seenDims = new Set<string>()
  const sizeOptions = stockForGradeProfile
    .filter(r => { const k = dimsKey(r.dimensions); if (seenDims.has(k)) return false; seenDims.add(k); return true })
    .map(r => ({ value: dimsKey(r.dimensions), label: formatDimensions(r.profile, r.dimensions) }))

  const activeProfile = profiles.find(p => p.id === node.profileId)
  const currentDimsKey = node.dimensions && Object.keys(node.dimensions).length > 0
    ? dimsKey(node.dimensions) : null

  const previewGrade = grades.find(g => g.id === node.gradeId)
  const previewName = materialName(node.gradeId ?? null, node.profileId ?? null, node.dimensions ?? null, grades, profiles)
  const previewSpec = (previewGrade && activeProfile && node.dimensions && Object.keys(node.dimensions).length > 0 && node.lengthMm)
    ? `${formatDimensions(activeProfile, node.dimensions)} × ${node.lengthMm} mm · ${num(computeWeightKg(activeProfile.volumeFormula, node.dimensions, node.lengthMm, previewGrade.densityKgM3))} kg · ${eur(computeWeightKg(activeProfile.volumeFormula, node.dimensions, node.lengthMm, previewGrade.densityKgM3) * (previewGrade.pricePerKg ?? 0))} / stuk`
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      {!embedded && (
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text)',
          paddingBottom: 8, borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Ic d={Icon.layers} />Materiaal configureren
        </div>
      )}
      {gradeOptions.length > 0 ? (
        <Select
          label="Kwaliteit" size={size} clearable
          data={gradeOptions.map(g => ({ value: g.id, label: g.name }))}
          value={node.gradeId ?? null}
          onChange={v => onChange({
            gradeId: v, profileId: null, dimensions: null,
            name: materialName(v, null, null, grades, profiles),
          })}
        />
      ) : (
        <div className="cell-muted" style={{ fontSize: embedded ? 12.5 : 11 }}>
          Geen kwaliteiten beschikbaar — voeg toe via Instellingen → Materiaalbeheer.
        </div>
      )}
      {profileOptions.length > 0 ? (
        <Select
          label="Profiel" size={size} clearable placeholder="—"
          data={profileOptions.map(p => ({ value: p.id, label: p.name }))}
          value={node.profileId ?? null}
          onChange={v => onChange({
            profileId: v, dimensions: null,
            name: materialName(node.gradeId ?? null, v, null, grades, profiles),
          })}
        />
      ) : (
        <div className="cell-muted" style={{ fontSize: embedded ? 12.5 : 11 }}>
          Geen profielen beschikbaar — voeg toe via Instellingen → Materiaalbeheer.
        </div>
      )}
      {activeProfile && (
        sizeOptions.length > 0 ? (
          <Select
            label="Maat (uit voorraad)" size={size} clearable placeholder="Kies maat…"
            data={sizeOptions}
            value={currentDimsKey}
            onChange={v => {
              if (!v) { onChange({ dimensions: null }); return }
              const row = stockForGradeProfile.find(r => dimsKey(r.dimensions) === v)
              if (row) onChange({
                dimensions: { ...row.dimensions },
                name: materialName(node.gradeId ?? null, node.profileId ?? null, row.dimensions, grades, profiles),
              })
            }}
          />
        ) : (
          <div className="cell-muted" style={{ fontSize: embedded ? 12.5 : 11 }}>
            Geen voorraad met deze kwaliteit/profiel — voeg toe via Voorraad.
          </div>
        )
      )}
      <NumberInput
        label="Lengte/stuk (mm)" size={size} min={0}
        value={node.lengthMm ?? ''}
        onChange={v => onChange({ lengthMm: v === '' ? null : Number(v) })}
      />
      {previewSpec && (
        <div style={{
          fontSize: embedded ? 12.5 : 11.5, color: 'var(--text-2)', background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 6, padding: embedded ? '10px 12px' : '8px 10px',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2, color: 'var(--text)' }}>{previewName}</div>
          <div className="cell-muted">{previewSpec}</div>
        </div>
      )}
    </div>
  )
}

function MachineConfig({ node, machines, onChange, embedded = false, size = 'xs' }: {
  node: EstimateNode
  machines: { id: string; name: string; machineRatePerHour: number; operatorRatePerHour: number; defaultSetupMin: number }[]
  onChange: (p: Partial<EstimateNode>) => void
  embedded?: boolean
  size?: 'xs' | 'sm'
}) {
  const activeMachine = machines.find(m => m.id === node.machineId)
  const combinedRate = activeMachine ? activeMachine.machineRatePerHour + activeMachine.operatorRatePerHour : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      {!embedded && (
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text)',
          paddingBottom: 8, borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Ic d={Icon.cpu} />Machine configureren
        </div>
      )}
      <Select
        label="Machine" size={size}
        data={machines.map(m => ({ value: m.id, label: m.name }))}
        value={node.machineId ?? null}
        onChange={v => {
          const m = machines.find(x => x.id === v)
          onChange({ machineId: v, name: m?.name ?? node.name, rateOverride: null })
        }}
      />
      {activeMachine && (
        <div style={{
          fontSize: embedded ? 12.5 : 11.5, color: 'var(--text-2)', background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 6, padding: embedded ? '10px 12px' : '8px 10px',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2, color: 'var(--text)' }}>{activeMachine.name}</div>
          <div className="cell-muted">
            {eur(activeMachine.machineRatePerHour)}/u machine + {eur(activeMachine.operatorRatePerHour)}/u operator = {eur(combinedRate)}/u · standaard insteltijd {activeMachine.defaultSetupMin} min
          </div>
        </div>
      )}
    </div>
  )
}

// ── Edit-modal field sets ────────────────────────────────────────────────────
function MaterialModalFields({ draft, grades, profiles, stockRows, onChange }: {
  draft: EstimateNode
  grades: { id: string; name: string; densityKgM3: number; pricePerKg?: number }[]
  profiles: ProfileShape[]
  stockRows: RawMaterialRow[]
  onChange: (p: Partial<EstimateNode>) => void
}) {
  return (
    <Stack gap="sm">
      <TextInput label="Naam" size="sm" value={draft.name} onChange={e => onChange({ name: e.currentTarget.value })} />
      <Divider label="Materiaal" labelPosition="left" />
      <MaterialConfig node={draft} grades={grades} profiles={profiles} stockRows={stockRows} onChange={onChange} embedded size="sm" />
      <Divider label="Aantal & prijs" labelPosition="left" />
      <Group grow>
        <NumberInput label="Aantal" size="sm" min={0} value={draft.qty ?? 1}
          onChange={v => onChange({ qty: v === '' ? 0 : Number(v) })} />
        <NumberInput label="Prijs override (€/stuk)" size="sm" min={0} step={0.01} placeholder="automatisch"
          value={draft.costOverride ?? ''}
          onChange={v => onChange({ costOverride: v === '' ? null : Number(v) })} />
      </Group>
    </Stack>
  )
}

function MachineModalFields({ draft, machines, onChange }: {
  draft: EstimateNode
  machines: { id: string; name: string; machineRatePerHour: number; operatorRatePerHour: number; defaultSetupMin: number }[]
  onChange: (p: Partial<EstimateNode>) => void
}) {
  return (
    <Stack gap="sm">
      <TextInput label="Naam" size="sm" value={draft.name} onChange={e => onChange({ name: e.currentTarget.value })} />
      <Divider label="Machine" labelPosition="left" />
      <MachineConfig node={draft} machines={machines} onChange={onChange} embedded size="sm" />
      <Divider label="Insteltijd & tarief" labelPosition="left" />
      <Group grow>
        <NumberInput label="Insteltijd (min)" size="sm" min={0} value={draft.setupMin ?? 0}
          onChange={v => onChange({ setupMin: v === '' ? 0 : Number(v) })} />
        <NumberInput label="Tarief override (€/u)" size="sm" min={0} step={0.01} placeholder="automatisch"
          value={draft.rateOverride ?? ''}
          onChange={v => onChange({ rateOverride: v === '' ? null : Number(v) })} />
      </Group>
    </Stack>
  )
}

function ExternalModalFields({ draft, onChange }: {
  draft: EstimateNode
  onChange: (p: Partial<EstimateNode>) => void
}) {
  return (
    <Stack gap="sm">
      <TextInput label="Naam" size="sm" value={draft.name} onChange={e => onChange({ name: e.currentTarget.value })} />
      <TextInput label="Omschrijving" size="sm" value={draft.note ?? ''} onChange={e => onChange({ note: e.currentTarget.value })} />
      <Divider label="Aantal & kosten" labelPosition="left" />
      <Group grow>
        <NumberInput label="Aantal" size="sm" min={0} value={draft.qty ?? 1}
          onChange={v => onChange({ qty: v === '' ? 0 : Number(v) })} />
        <NumberInput label="Kosten (€/stuk)" size="sm" min={0} step={0.01} value={draft.externalCost ?? 0}
          onChange={v => onChange({ externalCost: v === '' ? 0 : Number(v) })} />
      </Group>
    </Stack>
  )
}

type ModalState = { type: EstimateNodeType; mode: 'add' | 'edit'; draft: EstimateNode }

const MODAL_TITLES: Record<EstimateNodeType, { add: string; edit: string }> = {
  material: { add: 'Materiaal toevoegen', edit: 'Materiaal bewerken' },
  machine: { add: 'Machine toevoegen', edit: 'Machine bewerken' },
  external: { add: 'Uitbesteding toevoegen', edit: 'Uitbesteding bewerken' },
}

function NodeEditModal({ state, grades, profiles, machines, stockRows, onChange, onConfirm, onCancel }: {
  state: ModalState | null
  grades: { id: string; name: string; densityKgM3: number; pricePerKg?: number }[]
  profiles: ProfileShape[]
  machines: { id: string; name: string; machineRatePerHour: number; operatorRatePerHour: number; defaultSetupMin: number }[]
  stockRows: RawMaterialRow[]
  onChange: (p: Partial<EstimateNode>) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!state) return null
  const title = MODAL_TITLES[state.type][state.mode]
  return (
    <Modal opened title={title} onClose={onCancel} closeOnClickOutside={false} closeOnEscape={false}
      size={520} centered radius="md">
      {state.type === 'material' && <MaterialModalFields draft={state.draft} grades={grades} profiles={profiles} stockRows={stockRows} onChange={onChange} />}
      {state.type === 'machine' && <MachineModalFields draft={state.draft} machines={machines} onChange={onChange} />}
      {state.type === 'external' && <ExternalModalFields draft={state.draft} onChange={onChange} />}
      <Group justify="flex-end" mt="lg">
        <Button variant="default" size="sm" onClick={onCancel}>Annuleren</Button>
        <Button size="sm" onClick={onConfirm}>OK</Button>
      </Group>
    </Modal>
  )
}

// ── Numeric row input + unit (restyle) ──────────────────────────────────────
function AcalcNum({ value, onChange, unit, unitBefore, width, step = 1, min = 0 }: {
  value: number
  onChange: (v: number) => void
  unit?: string
  unitBefore?: boolean
  width?: 'w56' | 'w72'
  step?: number
  min?: number
}) {
  const input = (
    <input className={`acalc-num${width ? ' ' + width : ''}`} type="number" value={value} step={step} min={min}
      onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
      onChange={e => onChange(e.target.value === '' ? 0 : +e.target.value)} />
  )
  return (
    <div className={unitBefore ? 'acalc-prijsgrp' : 'acalc-numgrp'}>
      {unitBefore && unit ? <span className="acalc-unit">{unit}</span> : null}
      {input}
      {!unitBefore && unit ? <span className="acalc-unit">{unit}</span> : null}
    </div>
  )
}

// ── Calculator ───────────────────────────────────────────────────────────────
export function ArticleCalculator({ article, est, onEstChange }: {
  article: Article
  est: ArticleEstimate
  onEstChange: Dispatch<SetStateAction<ArticleEstimate>>
}) {
  const { data: gradesData } = useQuery({ queryKey: ['grades'], queryFn: gradesApi.list })
  const { data: profilesData } = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list })
  const { data: machinesData } = useQuery({ queryKey: ['machines'], queryFn: machinesApi.list })
  const { data: materialsData } = useQuery({ queryKey: ['raw-materials'], queryFn: rawMaterialsApi.list })

  const grades = gradesData?.data ?? []
  const profiles = (profilesData?.data ?? []) as ProfileShape[]
  const machines = machinesData?.data ?? []
  const stockRows = materialsData?.data ?? []

  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [modal, setModal] = useState<ModalState | null>(null)
  const [matPickerOpen, setMatPickerOpen] = useState(false)
  const [editRow, setEditRow] = useState<string | null>(null) // row whose name input is unlocked
  const [dragId, setDragId] = useState<string | null>(null)    // node being dragged
  const setEst = onEstChange

  const ctx: EstimateCtx = useMemo(
    () => buildEstimateCtx(article, grades, profiles.map(p => ({ id: p.id, volumeFormula: p.volumeFormula })), machines),
    [grades, machines, profiles, article],
  )
  const totals = useMemo(() => computeEstimateTotals(est, ctx), [est, ctx])

  const isOpen = (id: string) => open[id] !== false
  const toggle = (id: string) => setOpen(o => ({ ...o, [id]: o[id] === undefined ? false : !o[id] }))

  // ── mutators ──
  const setNodes = (fn: (n: EstimateNode[]) => EstimateNode[]) => setEst(e => ({ ...e, nodes: fn(e.nodes) }))
  const updateNode = (id: string, p: Partial<EstimateNode>) => setNodes(ns => ns.map(n => n.id === id ? { ...n, ...p } : n))
  const removeNode = (id: string) => setNodes(ns => ns.filter(n => n.id !== id))

  /** Reorder within a section: move `fromId` to sit before `toId`. Only nodes of
   *  the same type reorder (drag is scoped to one section). */
  function moveNode(fromId: string, toId: string) {
    if (fromId === toId) return
    setNodes(ns => {
      const from = ns.findIndex(n => n.id === fromId)
      const to = ns.findIndex(n => n.id === toId)
      if (from < 0 || to < 0 || ns[from].type !== ns[to].type) return ns
      const copy = [...ns]
      const [moved] = copy.splice(from, 1)
      // Drop before the target when moving up, after it when moving down, so the
      // last slot in a section is reachable (dropping onto the last row).
      let insertAt = copy.findIndex(n => n.id === toId)
      if (from < to) insertAt += 1
      copy.splice(insertAt, 0, moved)
      return copy
    })
  }
  const dropProps = (node: EstimateNode) => ({
    onDragOver: (e: React.DragEvent) => { if (dragId) e.preventDefault() },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dragId) moveNode(dragId, node.id); setDragId(null) },
  })
  const handleProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { setDragId(id); e.dataTransfer.effectAllowed = 'move' },
    onDragEnd: () => setDragId(null),
  })

  /** Build a material node from a chosen stock row. Grade/profile/dimensions
   *  come from the stock item; per-piece length defaults to the article recipe
   *  (the stock row's lengthMm is the bar length, not the per-piece cut). */
  function addMaterialFromStock(row: RawMaterialRow) {
    const node: EstimateNode = {
      id: uid('mat'), type: 'material',
      gradeId: row.gradeId, profileId: row.profileId,
      dimensions: { ...row.dimensions },
      lengthMm: article.recipe?.lengthPerPieceMm ?? null,
      qty: 1, costOverride: null,
      name: materialName(row.gradeId, row.profileId, row.dimensions, grades, profiles),
    }
    setNodes(ns => [...ns, node])
  }
  function openAddMachine() {
    const m = machines[0]
    const draft: EstimateNode = {
      id: uid('mac'), type: 'machine', name: m?.name ?? 'Nieuwe machine',
      machineId: m?.id ?? null, setupMin: m?.defaultSetupMin ?? 8, steps: [],
    }
    setModal({ type: 'machine', mode: 'add', draft })
  }
  function openAddExternal() {
    const draft: EstimateNode = { id: uid('uit'), type: 'external', name: 'Nieuwe dienst', note: 'uitbesteed werk', qty: 1, externalCost: 0 }
    setModal({ type: 'external', mode: 'add', draft })
  }
  function openEditNode(node: EstimateNode) {
    setModal({ type: node.type, mode: 'edit', draft: { ...node } })
  }
  function updateDraft(p: Partial<EstimateNode>) {
    setModal(m => m ? { ...m, draft: { ...m.draft, ...p } } : m)
  }
  function confirmModal() {
    if (!modal) return
    if (modal.mode === 'add') setNodes(ns => [...ns, modal.draft])
    else updateNode(modal.draft.id, modal.draft)
    setModal(null)
  }
  function addStep(machineId: string) {
    const node = est.nodes.find(n => n.id === machineId)
    const step: EstimateStep = { id: uid('step'), name: 'Nieuwe bewerking', cycleMin: 10 }
    updateNode(machineId, { steps: [...(node?.steps ?? []), step] })
  }
  function updateStep(machineId: string, stepId: string, p: Partial<EstimateStep>) {
    const node = est.nodes.find(n => n.id === machineId)
    updateNode(machineId, { steps: (node?.steps ?? []).map(s => s.id === stepId ? { ...s, ...p } : s) })
  }
  function removeStep(machineId: string, stepId: string) {
    const node = est.nodes.find(n => n.id === machineId)
    updateNode(machineId, { steps: (node?.steps ?? []).filter(s => s.id !== stepId) })
  }

  const materialNodes = est.nodes.filter(n => n.type === 'material')
  const machineNodes = est.nodes.filter(n => n.type === 'machine')
  const externalNodes = est.nodes.filter(n => n.type === 'external')

  const lineCount = materialNodes.length + machineNodes.length + externalNodes.length

  const sectionHead = (id: string, icon: string, title: string, count: string, total: string) => (
    <div className="acalc-section-head" onClick={() => toggle(id)}>
      <span className="acalc-chevron" data-open={isOpen(id)}><Ic d={Icon.chevronRight} size={14} /></span>
      <span className="acalc-section-title"><Ic d={icon} size={14} />{title}</span>
      <span className="acalc-section-count">{count}</span>
      <span className="acalc-section-total">{total}</span>
      <span />
    </div>
  )

  const nameInput = (id: string, value: string, onName: (v: string) => void, bold?: boolean) => (
    <input className={`acalc-name-inp${bold ? ' bold' : ''}`} value={value} readOnly={editRow !== id}
      onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
      onChange={e => onName(e.target.value)} />
  )

  const rowActions = (id: string, onDelete: () => void, deleteTitle: string) => (
    <div className="acalc-actions">
      <button type="button" className={`acalc-iconbtn${editRow === id ? ' active' : ''}`} title="Naam bewerken"
        onClick={() => setEditRow(editRow === id ? null : id)}><Ic d={Icon.edit} size={14} /></button>
      <button type="button" className="acalc-iconbtn del" title={deleteTitle} onClick={onDelete}><Ic d={Icon.trash} size={14} /></button>
    </div>
  )

  return (
    <>
      <div className="acalc-card">
        <div className="acalc-cardhead">
          <span className="acalc-ch-title">Onderdelen</span>
          <span className="acalc-ch-sub">per stuk · richtprijs</span>
          <span className="acalc-ch-count">{lineCount} regels</span>
        </div>

        {/* ===== MATERIALEN ===== */}
        {sectionHead('g-mat', Icon.layers, 'Materialen', `${materialNodes.length} regels`, eur(totals.materialTotal))}
        {isOpen('g-mat') && (
          <>
            <div className="acalc-mat-head acalc-colhead">
              <span />
              <span className="nudge-name">Materiaal</span>
              <span className="nudge-note">Omschrijving</span>
              <span className="nudge-aantal">Aantal</span>
              <span className="nudge-prijs">Prijs</span>
              <span className="ta-r">Totaalprijs</span>
              <span />
            </div>
            {materialNodes.map(node => {
              const prijs = materialCostPerPiece(node, ctx)
              const aantal = node.qty ?? 1
              return (
                <div className="acalc-mat-row" key={node.id} onDoubleClick={() => openEditNode(node)} {...dropProps(node)}>
                  <span className="acalc-drag" title="Sleep om te ordenen" {...handleProps(node.id)}>⠿</span>
                  {nameInput(node.id, node.name, v => updateNode(node.id, { name: v }))}
                  <input className="acalc-note-inp" value={node.note ?? ''}
                    placeholder={materialSpec(node, ctx, grades, profiles)}
                    onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
                    onChange={e => updateNode(node.id, { note: e.target.value })} />
                  <AcalcNum value={aantal} unit="st" width="w56" onChange={v => updateNode(node.id, { qty: v })} />
                  <AcalcNum value={prijs} unit="€" unitBefore width="w72" step={0.01} onChange={v => updateNode(node.id, { costOverride: v })} />
                  <span className="acalc-total">{eur(aantal * prijs)}</span>
                  {rowActions(node.id, () => removeNode(node.id), 'Materiaal verwijderen')}
                </div>
              )
            })}
            <div className="acalc-addrow">
              <button type="button" className="acalc-addlink" onClick={() => setMatPickerOpen(true)}><Ic d={Icon.plus} size={13} />Materiaal uit voorraad</button>
            </div>
          </>
        )}

        {/* ===== BEWERKINGEN ===== */}
        {sectionHead('g-bew', Icon.tool, 'Bewerkingen', `${machineNodes.length} machines`, eur(totals.machiningTotal))}
        {isOpen('g-bew') && (
          <>
            {machineNodes.map(node => {
              const rate = machineRatePerHour(node, ctx)
              const totalMin = machineMinutes(node)
              return (
                <div key={node.id}>
                  <div className="acalc-mach-head" onDoubleClick={() => openEditNode(node)} {...dropProps(node)}>
                    <button type="button" className="acalc-chevron-btn" data-open={isOpen(node.id)}
                      title="Klik om te openen · sleep om te ordenen" {...handleProps(node.id)}
                      onClick={e => { e.stopPropagation(); toggle(node.id) }}><Ic d={Icon.chevronRight} size={14} /></button>
                    {nameInput(node.id, node.name, v => updateNode(node.id, { name: v }), true)}
                    <span className="acalc-stepsummary">{(node.steps?.length ?? 0) + 1} stappen · {minToHm(totalMin)}</span>
                    <span className="acalc-num-muted">{totalMin} min</span>
                    <AcalcNum value={rate} unit="€/u" width="w72" onChange={v => updateNode(node.id, { rateOverride: v })} />
                    <span className="acalc-total">{eur((totalMin / 60) * rate)}</span>
                    {rowActions(node.id, () => removeNode(node.id), 'Machine verwijderen')}
                  </div>
                  {isOpen(node.id) && (
                    <>
                      <div className="acalc-step-row">
                        <span className="acalc-step-icon"><Ic d={Icon.clock} size={13} /></span>
                        <div className="acalc-step-main">
                          <span className="acalc-step-label">programmeren + opspannen</span>
                        </div>
                        <AcalcNum value={node.setupMin ?? 0} unit="min" width="w72" onChange={v => updateNode(node.id, { setupMin: v })} />
                        <span className="acalc-typetag">Insteltijd</span>
                        {/*<span className="acalc-ratelbl">{eur(rate)}/u</span>*/}
                        <span className="acalc-total">{eur(((node.setupMin ?? 0) / 60) * rate)}</span>
                      </div>
                      {(node.steps ?? []).map(step => (
                        <div className="acalc-step-row" key={step.id}>
                          <span className="acalc-step-icon"><Ic d={Icon.bolt} size={13} /></span>
                          <div className="acalc-step-main">

                            <input className="acalc-note-inp" value={step.name}
                              onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
                              onChange={e => updateStep(node.id, step.id, { name: e.target.value })} />
                            
                          </div>
                          <AcalcNum value={step.cycleMin} unit="min" width="w72" onChange={v => updateStep(node.id, step.id, { cycleMin: v })} />
                          {/*<span className="acalc-ratelbl">{eur(rate)}/u</span>*/}
                          <span className="acalc-typetag neutral">Verspaning</span>
                          <span className="acalc-total">{eur((step.cycleMin / 60) * rate)}</span>
                          <button type="button" className="acalc-iconbtn del" title="Bewerking verwijderen"
                            onClick={() => removeStep(node.id, step.id)}><Ic d={Icon.trash} size={13} /></button>
                        </div>
                      ))}
                      <div className="acalc-addrow indent">
                        <button type="button" className="acalc-addlink" onClick={() => addStep(node.id)}><Ic d={Icon.plus} size={13} />Bewerking toevoegen</button>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
            <div className="acalc-addrow">
              <button type="button" className="acalc-addlink" onClick={openAddMachine}><Ic d={Icon.plus} size={13} />Machine toevoegen</button>
            </div>
          </>
        )}

        {/* ===== UITBESTEDINGEN ===== */}
        {sectionHead('g-uit', Icon.truck, 'Uitbestedingen', `${externalNodes.length} regels`, eur(totals.externalTotal))}
        {isOpen('g-uit') && (
          <>
            <div className="acalc-mat-head acalc-colhead">
              <span />
              <span className="nudge-name">Dienst</span>
              <span className="nudge-note">Omschrijving</span>
              <span className="nudge-aantal">Aantal</span>
              <span className="nudge-prijs">Prijs/st</span>
              <span className="ta-r">Totaal</span>
              <span />
            </div>
            {externalNodes.map(node => {
              const aantal = node.qty ?? 1
              const prijs = node.externalCost ?? 0
              return (
                <div className="acalc-mat-row" key={node.id} onDoubleClick={() => openEditNode(node)} {...dropProps(node)}>
                  <span className="acalc-drag" title="Sleep om te ordenen" {...handleProps(node.id)}>⠿</span>
                  {nameInput(node.id, node.name, v => updateNode(node.id, { name: v }))}
                  <input className="acalc-note-inp" value={node.note ?? ''}
                    onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
                    onChange={e => updateNode(node.id, { note: e.target.value })} />
                  <AcalcNum value={aantal} unit="st" width="w56" onChange={v => updateNode(node.id, { qty: v })} />
                  <AcalcNum value={prijs} unit="€" unitBefore width="w72" step={0.01} onChange={v => updateNode(node.id, { externalCost: v })} />
                  <span className="acalc-total">{eur(aantal * prijs)}</span>
                  {rowActions(node.id, () => removeNode(node.id), 'Uitbesteding verwijderen')}
                </div>
              )
            })}
            <div className="acalc-addrow" style={{ borderBottom: 0 }}>
              <button type="button" className="acalc-addlink" onClick={openAddExternal}><Ic d={Icon.plus} size={13} />Uitbesteding toevoegen</button>
            </div>
          </>
        )}
      </div>

      <NodeEditModal
        state={modal}
        grades={grades}
        profiles={profiles}
        machines={machines}
        stockRows={stockRows}
        onChange={updateDraft}
        onConfirm={confirmModal}
        onCancel={() => setModal(null)}
      />

      <MaterialPickerModal
        opened={matPickerOpen}
        onClose={() => setMatPickerOpen(false)}
        stockRows={stockRows}
        grades={grades.map(g => ({ id: g.id, name: g.name }))}
        profiles={profiles.map(p => ({ id: p.id, name: p.name, volumeFormula: p.volumeFormula }))}
        onPick={row => { addMaterialFromStock(row); setMatPickerOpen(false) }}
        onCreated={row => { addMaterialFromStock(row); setMatPickerOpen(false) }}
      />
    </>
  )
}
