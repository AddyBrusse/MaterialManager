import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Popover, Select, NumberInput, Modal, TextInput, Button, Group, Stack, Divider } from '@mantine/core'
import type { Article, ArticleEstimate, EstimateNode, EstimateNodeType, EstimateStep } from '../../api/articles'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { machinesApi } from '../../api/machines'
import { rawMaterialsApi, formatDimensions, computeWeightKg, type ProfileInfo, type RawMaterialRow } from '../../api/raw-materials'
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

// ── Inline-editable row name ────────────────────────────────────────────────
function EditableName({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select() } }, [editing])

  function commit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onChange(trimmed)
    else setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="tw-lbl tw-lbl-edit"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
      />
    )
  }
  return (
    <span className="tw-lbl tw-lbl-editable" title="Klik om naam te wijzigen" onClick={() => setEditing(true)}>
      {value}
    </span>
  )
}

// ── Tree name cell ───────────────────────────────────────────────────────────
function TreeName({ depth, hasToggle, open, onToggle, icon, label, configure, popoverWidth = 260, onRename }: {
  depth: number
  hasToggle?: boolean
  open?: boolean
  onToggle?: () => void
  icon: string
  label: React.ReactNode
  configure?: React.ReactNode
  popoverWidth?: number
  onRename?: (value: string) => void
}) {
  return (
    <div className="calc-name">
      {Array.from({ length: depth }).map((_, i) => <span className="tw-rail" key={i} />)}
      <div className="tw-name-inner">
        {hasToggle
          ? <button type="button" className="tw-tog" data-open={open} onClick={onToggle}><Ic d={Icon.chevronRight} /></button>
          : <span className="tw-spacer" />}
        {configure ? (
          <Popover width={popoverWidth} position="bottom-start" withArrow shadow="md" zIndex={300}>
            <Popover.Target>
              <button type="button" className="tw-ico" title="Configureren" style={{ border: 0, padding: 0, cursor: 'pointer' }}>
                <Ic d={icon} />
              </button>
            </Popover.Target>
            <Popover.Dropdown>{configure}</Popover.Dropdown>
          </Popover>
        ) : (
          <span className="tw-ico"><Ic d={icon} /></span>
        )}
        {onRename ? <EditableName value={String(label)} onChange={onRename} /> : <span className="tw-lbl">{label}</span>}
      </div>
    </div>
  )
}

function NumCell({ value, onChange, unit, step = 1, min = 0 }: {
  value: number
  onChange: (v: number) => void
  unit?: string
  step?: number
  min?: number
}) {
  return (
    <div className="calc-cell num" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
      <input className="calc-inp" type="number" value={value} step={step} min={min}
        onChange={e => onChange(e.target.value === '' ? 0 : +e.target.value)} />
      {unit ? <span className="calc-unit">{unit}</span> : null}
    </div>
  )
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

// ── Calculator ───────────────────────────────────────────────────────────────
export function ArticleCalculator({ article, est, onEstChange }: {
  article: Article
  est: ArticleEstimate
  onEstChange: Dispatch<SetStateAction<ArticleEstimate>>
}) {
  const { data: gradesData }    = useQuery({ queryKey: ['grades'],        queryFn: gradesApi.list })
  const { data: profilesData }  = useQuery({ queryKey: ['profiles'],      queryFn: profilesApi.list })
  const { data: machinesData }  = useQuery({ queryKey: ['machines'],      queryFn: machinesApi.list })
  const { data: materialsData } = useQuery({ queryKey: ['raw-materials'], queryFn: rawMaterialsApi.list })

  const grades   = gradesData?.data   ?? []
  const profiles = (profilesData?.data ?? []) as ProfileShape[]
  const machines = machinesData?.data  ?? []
  const stockRows = materialsData?.data ?? []

  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [modal, setModal] = useState<ModalState | null>(null)
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

  function openAddMaterial() {
    const gradeId = article.recipe?.gradeId ?? grades[0]?.id ?? null
    const profileId = article.recipe?.profileId ?? null
    const dimensions = article.recipe?.dimensions ? { ...article.recipe.dimensions } : null
    const lengthMm = article.recipe?.lengthPerPieceMm ?? null
    const draft: EstimateNode = {
      id: uid('mat'), type: 'material', name: materialName(gradeId, profileId, dimensions, grades, profiles),
      gradeId, profileId, dimensions, lengthMm, qty: 1, costOverride: null,
    }
    setModal({ type: 'material', mode: 'add', draft })
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
  const machineNodes  = est.nodes.filter(n => n.type === 'machine')
  const externalNodes = est.nodes.filter(n => n.type === 'external')

  return (
    <>
    <div className="calc">
      <div className="calc-toolbar">
        <span className="ttl">Calculatie</span>
        <span className="sub">per stuk · richtprijs</span>
        <span className="sp" />
        <button type="button" className="btn sm"><Ic d={Icon.copy} size={13} />Dupliceren</button>
        <button type="button" className="btn sm"><Ic d={Icon.download} size={13} />Exporteer</button>
      </div>

      <div className="calc-row calc-head">
        <div>Onderdeel</div>
        <div>Specificatie</div>
        <div className="ta-r">Aantal</div>
        <div className="ta-r">Tarief / prijs</div>
        <div className="ta-r">Regeltotaal</div>
        <div></div>
      </div>

      {/* ===== MATERIALEN ===== */}
        <div className="calc-row is-group">
          <TreeName depth={0} hasToggle open={isOpen('g-mat')} onToggle={() => toggle('g-mat')} icon={Icon.layers} label="Materialen" />
          <div className="calc-cell spec">{materialNodes.length} regels</div>
          <div className="calc-cell"></div>
          <div className="calc-cell"></div>
          <div className="calc-cell num total">{eur(totals.materialTotal)}</div>
          <div></div>
        </div>
        {isOpen('g-mat') && materialNodes.map(node => {
          const prijs = materialCostPerPiece(node, ctx)
          const aantal = node.qty ?? 1
          return (
            <div className="calc-row" key={node.id} onDoubleClick={() => openEditNode(node)}>
              <TreeName depth={1} icon={Icon.layers} label={node.name} popoverWidth={420}
                onRename={v => updateNode(node.id, { name: v })}
                configure={<MaterialConfig node={node} grades={grades} profiles={profiles} stockRows={stockRows} onChange={p => updateNode(node.id, p)} />} />
              <div className="calc-cell spec">{materialSpec(node, ctx, grades, profiles)}</div>
              <NumCell value={aantal} unit="st" onChange={v => updateNode(node.id, { qty: v })} />
              <NumCell value={prijs} unit="€" step={0.01} onChange={v => updateNode(node.id, { costOverride: v })} />
              <div className="calc-cell num total">{eur(aantal * prijs)}</div>
              <div className="calc-cell row-actions">
                <button type="button" className="icon-btn" title="Materiaal bewerken" onClick={() => openEditNode(node)}><Ic d={Icon.edit} /></button>
                <button type="button" className="icon-btn" title="Materiaal verwijderen" onClick={() => removeNode(node.id)}><Ic d={Icon.trash} /></button>
              </div>
            </div>
          )
        })}
        {isOpen('g-mat') && (
          <div className="calc-row"><div className="calc-addrow"><button type="button" className="calc-add" onClick={openAddMaterial}><Ic d={Icon.plus} />Materiaal toevoegen</button></div></div>
        )}

        {/* ===== BEWERKINGEN ===== */}
        <div className="calc-row is-group">
          <TreeName depth={0} hasToggle open={isOpen('g-bew')} onToggle={() => toggle('g-bew')} icon={Icon.tool} label="Bewerkingen" />
          <div className="calc-cell spec">{machineNodes.length} machines</div>
          <div className="calc-cell"></div>
          <div className="calc-cell"></div>
          <div className="calc-cell num total">{eur(totals.machiningTotal)}</div>
          <div></div>
        </div>
        {isOpen('g-bew') && machineNodes.map(node => {
          const rate = machineRatePerHour(node, ctx)
          const totalMin = machineMinutes(node)
          return (
            <div key={node.id}>
              <div className="calc-row is-machine" onDoubleClick={() => openEditNode(node)}>
                <TreeName depth={1} hasToggle open={isOpen(node.id)} onToggle={() => toggle(node.id)} icon={Icon.cpu} label={node.name} popoverWidth={340}
                  onRename={v => updateNode(node.id, { name: v })}
                  configure={<MachineConfig node={node} machines={machines} onChange={p => updateNode(node.id, p)} />} />
                <div className="calc-cell spec">{(node.steps?.length ?? 0) + 1} bewerkingen · {minToHm(totalMin)}</div>
                <div className="calc-cell num cell-muted">{totalMin} min</div>
                <NumCell value={rate} unit="€/u" onChange={v => updateNode(node.id, { rateOverride: v })} />
                <div className="calc-cell num total">{eur((totalMin / 60) * rate)}</div>
                <div className="calc-cell row-actions">
                  <button type="button" className="icon-btn" title="Machine bewerken" onClick={() => openEditNode(node)}><Ic d={Icon.edit} /></button>
                  <button type="button" className="icon-btn" title="Machine verwijderen" onClick={() => removeNode(node.id)}><Ic d={Icon.trash} /></button>
                </div>
              </div>
              {isOpen(node.id) && (
                <div className="calc-row">
                  <TreeName depth={2} icon={Icon.clock} label={<>Insteltijd — programmeren + opspannen<span className="setup-tag">insteltijd</span></>} />
                  <div className="calc-cell spec">eenmalig per order</div>
                  <NumCell value={node.setupMin ?? 0} unit="min" onChange={v => updateNode(node.id, { setupMin: v })} />
                  <div className="calc-cell num cell-muted">{eur(rate)}/u</div>
                  <div className="calc-cell num total">{eur(((node.setupMin ?? 0) / 60) * rate)}</div>
                  <div className="calc-cell"></div>
                </div>
              )}
              {isOpen(node.id) && (node.steps ?? []).map(step => (
                <div className="calc-row" key={step.id}>
                  <TreeName depth={2} icon={Icon.bolt} label={step.name} onRename={v => updateStep(node.id, step.id, { name: v })} />
                  <div className="calc-cell spec">verspaning</div>
                  <NumCell value={step.cycleMin} unit="min" onChange={v => updateStep(node.id, step.id, { cycleMin: v })} />
                  <div className="calc-cell num cell-muted">{eur(rate)}/u</div>
                  <div className="calc-cell num total">{eur((step.cycleMin / 60) * rate)}</div>
                  <div className="calc-cell row-actions">
                    <button type="button" className="icon-btn" title="Bewerking verwijderen" onClick={() => removeStep(node.id, step.id)}><Ic d={Icon.trash} /></button>
                  </div>
                </div>
              ))}
              {isOpen(node.id) && (
                <div className="calc-row"><div className="calc-addrow indent"><button type="button" className="calc-add" onClick={() => addStep(node.id)}><Ic d={Icon.plus} />Bewerking toevoegen</button></div></div>
              )}
            </div>
          )
        })}
        {isOpen('g-bew') && (
          <div className="calc-row"><div className="calc-addrow"><button type="button" className="calc-add" onClick={openAddMachine}><Ic d={Icon.plus} />Machine toevoegen</button></div></div>
        )}

        {/* ===== UITBESTEDINGEN ===== */}
        <div className="calc-row is-group">
          <TreeName depth={0} hasToggle open={isOpen('g-uit')} onToggle={() => toggle('g-uit')} icon={Icon.truck} label="Uitbestedingen" />
          <div className="calc-cell spec">{externalNodes.length} regels</div>
          <div className="calc-cell"></div>
          <div className="calc-cell"></div>
          <div className="calc-cell num total">{eur(totals.externalTotal)}</div>
          <div></div>
        </div>
        {isOpen('g-uit') && externalNodes.map(node => {
          const aantal = node.qty ?? 1
          const prijs = node.externalCost ?? 0
          return (
            <div className="calc-row" key={node.id} onDoubleClick={() => openEditNode(node)}>
              <TreeName depth={1} icon={Icon.truck} label={node.name} onRename={v => updateNode(node.id, { name: v })} />
              <div className="calc-cell spec">{node.note ?? '—'}</div>
              <NumCell value={aantal} unit="st" onChange={v => updateNode(node.id, { qty: v })} />
              <NumCell value={prijs} unit="€" step={0.01} onChange={v => updateNode(node.id, { externalCost: v })} />
              <div className="calc-cell num total">{eur(aantal * prijs)}</div>
              <div className="calc-cell row-actions">
                <button type="button" className="icon-btn" title="Uitbesteding bewerken" onClick={() => openEditNode(node)}><Ic d={Icon.edit} /></button>
                <button type="button" className="icon-btn" title="Uitbesteding verwijderen" onClick={() => removeNode(node.id)}><Ic d={Icon.trash} /></button>
              </div>
            </div>
          )
        })}
        {isOpen('g-uit') && (
          <div className="calc-row" style={{ borderBottom: 0 }}><div className="calc-addrow"><button type="button" className="calc-add" onClick={openAddExternal}><Ic d={Icon.plus} />Uitbesteding toevoegen</button></div></div>
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
    </>
  )
}
