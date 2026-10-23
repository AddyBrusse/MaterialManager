import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useQuery } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import type { Article, ArticleEstimate, EstimateNode, EstimateStep } from '../../api/articles'
import { gradesApi } from '../../api/grades'
import { profilesApi } from '../../api/profiles'
import { machinesApi } from '../../api/machines'
import { rawMaterialsApi, type ProfileInfo, type RawMaterialRow } from '../../api/raw-materials'
import { buildEstimateCtx, computeEstimateTotals, type EstimateCtx } from '../../api/estimate'
import type { Keuze } from '../materiaal/kiezer/LaderPaneel'
import { MaterialPickerModal } from './MaterialPickerModal'
import { ExootVenster } from './ExootVenster'
import { CalcMaterialen } from './CalcMaterialen'
import { CalcBewerkingen } from './CalcBewerkingen'
import { CalcUitbestedingen } from './CalcUitbestedingen'
import { CalcNodeModal, type NodeModalState } from './CalcNodeModal'
import type { CalcKit } from './calc-kit'
import { Prullenbak } from './calc-kit'
import { materialName, uid } from './calc-helpers'
import { Ic, Icon } from './calc-icons'
import './article-calculator.css'

/** Wat er weg is, met "Ongedaan maken" (2026-10-23): één klik op de prullenbak kon een machine met al zijn stappen kosten. */
function meldWeg(titel: string, naam: string, terug: () => void) {
  const id = `calc-weg-${Date.now()}`
  notifications.show({
    id, title: titel, autoClose: 8000,
    message: (
      <span className="acalc-weg-melding">
        <span>{naam || 'Naamloos'}</span>
        <button type="button" className="acalc-linkbtn" onClick={() => { terug(); notifications.hide(id) }}>Ongedaan maken</button>
      </span>
    ),
  })
}

/**
 * De calculator van een artikel: materialen, bewerkingen en uitbestedingen,
 * per stuk. Elke sectie staat in zijn eigen bestand (2026-10-23, het was één
 * bestand van 730 regels); hier de gegevens, de rekencontext en wat de secties
 * delen (`CalcKit`).
 */
export function ArticleCalculator({ article, est, onEstChange, readOnly = false }: {
  article: Article
  est: ArticleEstimate
  onEstChange: Dispatch<SetStateAction<ArticleEstimate>>
  readOnly?: boolean
}) {
  const { data: gradesData } = useQuery({ queryKey: ['grades'], queryFn: gradesApi.list })
  const { data: profilesData } = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list })
  const { data: machinesData } = useQuery({ queryKey: ['machines'], queryFn: machinesApi.list })
  const { data: materialsData } = useQuery({ queryKey: ['raw-materials'], queryFn: rawMaterialsApi.list })

  const grades = gradesData?.data ?? []
  const profiles = (profilesData?.data ?? []) as ProfileInfo[]
  const machines = machinesData?.data ?? []
  const stockRows = materialsData?.data ?? []

  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [modal, setModal] = useState<NodeModalState | null>(null)
  /** De materiaalkiezer: `null` dicht, `{}` nieuwe regel, `{ node }` die regel wijzigen. */
  const [kiezer, setKiezer] = useState<{ node?: EstimateNode } | null>(null)
  const [exootOpen, setExootOpen] = useState(false)
  const [editRow, setEditRow] = useState<string | null>(null) // row whose name input is unlocked
  const [dragId, setDragId] = useState<string | null>(null)    // node being dragged

  const ctx: EstimateCtx = useMemo(
    () => buildEstimateCtx(article, grades, profiles.map(p => ({ id: p.id, volumeFormula: p.volumeFormula })), machines),
    [grades, machines, profiles, article],
  )
  const totals = useMemo(() => computeEstimateTotals(est, ctx), [est, ctx])

  // ── mutators ──
  const setNodes = (fn: (n: EstimateNode[]) => EstimateNode[]) => onEstChange(e => ({ ...e, nodes: fn(e.nodes) }))
  const updateNode = (id: string, p: Partial<EstimateNode>) => setNodes(ns => ns.map(n => n.id === id ? { ...n, ...p } : n))

  function verwijder(node: EstimateNode, wat: string) {
    const plek = est.nodes.findIndex(n => n.id === node.id)
    setNodes(ns => ns.filter(n => n.id !== node.id))
    meldWeg(`${wat} verwijderd`, node.name, () =>
      setNodes(ns => ns.some(n => n.id === node.id) ? ns : [...ns.slice(0, plek), node, ...ns.slice(plek)]))
  }

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

  const sleepProps = (id: string): Record<string, unknown> => readOnly ? {} : {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { setDragId(id); e.dataTransfer.effectAllowed = 'move' },
    onDragEnd: () => setDragId(null),
  }
  const kit: CalcKit = {
    ctx, readOnly,
    isOpen: id => open[id] !== false,
    toggle: id => setOpen(o => ({ ...o, [id]: o[id] === undefined ? false : !o[id] })),
    updateNode, verwijder, sleepProps,
    rijProps: node => ({
      onDragOver: (e: React.DragEvent) => { if (dragId) e.preventDefault() },
      onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dragId) moveNode(dragId, node.id); setDragId(null) },
    }),
    handvat: id => <span className="acalc-drag" title={readOnly ? undefined : 'Sleep om te ordenen'} {...sleepProps(id)}>⠿</span>,
    naamVeld: (id, value, onName, bold) => (
      // Dubbelklik op de naam opent de regel, net als op de rest van de rij;
      // alleen na het potloodje is dubbelklikken een woord selecteren.
      <input className={`acalc-name-inp${bold ? ' bold' : ''}`} value={value} readOnly={editRow !== id}
        onClick={e => e.stopPropagation()} onDoubleClick={e => { if (editRow === id) e.stopPropagation() }}
        onChange={e => onName(e.target.value)} />
    ),
    rijActies: (id, onDelete, deleteTitle) => (
      <div className="acalc-actions">
        <button type="button" className={`acalc-iconbtn${editRow === id ? ' active' : ''}`} title="Naam bewerken"
          onClick={() => setEditRow(editRow === id ? null : id)}><Ic d={Icon.edit} size={14} /></button>
        <Prullenbak onDelete={onDelete} title={deleteTitle} />
      </div>
    ),
  }

  /**
   * Of de naam van een regel zijn materiaal beschrijft: zoals de calculator hem
   * maakt ("C45 — Ø50"), of met de kwaliteit erin ("C45 Ø50 mm" uit een import).
   * Zo'n naam klopt niet meer na een ander materiaal; "Asmateriaal" wel.
   */
  function beschrijftMateriaal(n: EstimateNode): boolean {
    if (n.name === materialName(n.gradeId ?? null, n.profileId ?? null, n.dimensions ?? null, grades, profiles)) return true
    const kwaliteit = grades.find(g => g.id === n.gradeId)?.name
    return !!kwaliteit && n.name.toLowerCase().includes(kwaliteit.toLowerCase())
  }

  /** Een nieuwe materiaalregel uit een gekozen voorraadrij, of een bestaande regel daarmee wijzigen. */
  function materiaalUitVoorraad(row: RawMaterialRow, stuks = 1, keuze?: Keuze, bestaand?: EstimateNode) {
    // Een exoot rekent met zijn eigen maat en het aantal stuks eruit (2026-10-06).
    const exoot: Partial<EstimateNode> = row.exoot
      ? { exoot: true, rawMaterialId: row.id, lengthMm: Number(row.lengthMm), stuksUitEen: stuks }
      : { exoot: false, rawMaterialId: null, stuksUitEen: null }
    const naam = materialName(row.gradeId, row.profileId, row.dimensions, grades, profiles)
    const zelfdeMateriaal = !!bestaand && bestaand.gradeId === row.gradeId && bestaand.profileId === row.profileId
      && JSON.stringify(bestaand.dimensions) === JSON.stringify(row.dimensions) && !row.exoot
    const node: EstimateNode = {
      id: bestaand?.id ?? uid('mat'), type: 'material',
      gradeId: row.gradeId, profileId: row.profileId,
      dimensions: { ...row.dimensions },
      lengthMm: keuze?.lengthMm ?? article.recipe?.lengthPerPieceMm ?? null,
      // Stangenlader per materiaalregel (2026-10-09); geen aantal: het recept is voor één stuk.
      laderMachineId: keuze?.laderMachineId ?? null,
      // Een vaste prijs hoort bij het oude materiaal; alleen een andere lengte of lader houdt hem.
      costOverride: zelfdeMateriaal ? bestaand!.costOverride ?? null : null,
      note: bestaand?.note ?? null,
      // Een zelf gegeven naam blijft; een naam die het oude materiaal beschreef gaat mee.
      name: bestaand && !beschrijftMateriaal(bestaand) ? bestaand.name : naam,
      ...exoot,
    }
    if (bestaand) updateNode(bestaand.id, node)
    else setNodes(ns => [...ns, node])
  }

  function openAddMachine() {
    const m = machines[0]
    setModal({ type: 'machine', mode: 'add', draft: {
      id: uid('mac'), type: 'machine', name: m?.name ?? 'Nieuwe machine',
      machineId: m?.id ?? null, setupMin: m?.defaultSetupMin ?? 8, steps: [],
    } })
  }
  function confirmModal() {
    if (!modal) return
    if (modal.mode === 'add') setNodes(ns => [...ns, modal.draft])
    else updateNode(modal.draft.id, modal.draft)
    setModal(null)
  }
  const stappenVan = (machineId: string) => est.nodes.find(n => n.id === machineId)?.steps ?? []
  function addStep(machineId: string) {
    // Leeg met een placeholder (2026-10-23): de standaardnaam moest eerst weggehaald worden.
    updateNode(machineId, { steps: [...stappenVan(machineId), { id: uid('step'), name: '', cycleMin: 10 }] })
  }
  function updateStep(machineId: string, stepId: string, p: Partial<EstimateStep>) {
    updateNode(machineId, { steps: stappenVan(machineId).map(s => s.id === stepId ? { ...s, ...p } : s) })
  }
  function removeStep(machine: EstimateNode, step: EstimateStep) {
    const plek = stappenVan(machine.id).findIndex(s => s.id === step.id)
    updateNode(machine.id, { steps: stappenVan(machine.id).filter(s => s.id !== step.id) })
    meldWeg('Bewerking verwijderd', step.name, () => setNodes(ns => ns.map(n => {
      if (n.id !== machine.id || (n.steps ?? []).some(s => s.id === step.id)) return n
      const st = n.steps ?? []
      return { ...n, steps: [...st.slice(0, plek), step, ...st.slice(plek)] }
    })))
  }

  const materialNodes = est.nodes.filter(n => n.type === 'material')
  const machineNodes = est.nodes.filter(n => n.type === 'machine')
  const externalNodes = est.nodes.filter(n => n.type === 'external')

  return (
    <>
      <div className="acalc-card">
        <div className="acalc-cardhead">
          <span className="acalc-ch-title">Onderdelen</span>
          <span className="acalc-ch-sub">per stuk · richtprijs</span>
          <span className="acalc-ch-count">{est.nodes.length} regels</span>
        </div>
        <CalcMaterialen kit={kit} nodes={materialNodes} total={totals.materialTotal}
          grades={grades} profiles={profiles} machines={machines} stockRows={stockRows}
          onWijzigMateriaal={node => setKiezer({ node })} onKies={() => setKiezer({})} onExoot={() => setExootOpen(true)} />
        <CalcBewerkingen kit={kit} nodes={machineNodes} total={totals.machiningTotal} machines={machines}
          onBewerk={node => setModal({ type: 'machine', mode: 'edit', draft: { ...node } })}
          onStapErbij={addStep} onStap={updateStep} onStapWeg={removeStep} onMachineErbij={openAddMachine} />
        <CalcUitbestedingen kit={kit} nodes={externalNodes} total={totals.externalTotal}
          onBewerk={node => setModal({ type: 'external', mode: 'edit', draft: { ...node } })}
          onErbij={() => setModal({ type: 'external', mode: 'add', draft: {
            id: uid('uit'), type: 'external', name: 'Nieuwe dienst', note: 'uitbesteed werk', qty: 1, externalCost: 0,
          } })} />
      </div>

      <CalcNodeModal
        state={modal}
        machines={machines}
        onChange={p => setModal(m => m ? { ...m, draft: { ...m.draft, ...p } } : m)}
        onConfirm={confirmModal}
        onCancel={() => setModal(null)}
      />

      {kiezer && (
        <MaterialPickerModal
          opened
          onClose={() => setKiezer(null)}
          stockRows={stockRows}
          grades={grades.map(g => ({ id: g.id, name: g.name, pricePerKg: g.pricePerKg }))}
          profiles={profiles.map(p => ({ id: p.id, name: p.name, volumeFormula: p.volumeFormula }))}
          machines={machines}
          ctx={ctx}
          startLengte={article.recipe?.lengthPerPieceMm ?? null}
          huidig={kiezer.node ?? null}
          onPick={(row, keuze) => { materiaalUitVoorraad(row, 1, keuze, kiezer.node); setKiezer(null) }}
          onCreated={row => { materiaalUitVoorraad(row, 1, undefined, kiezer.node); setKiezer(null) }}
        />
      )}
      {exootOpen && (
        <ExootVenster
          grades={grades}
          profiles={profiles}
          stockRows={stockRows}
          artikel={{ id: article.id, naam: article.naam, relatieId: article.relatieId }}
          onGemaakt={(row, stuks) => { materiaalUitVoorraad(row, stuks); setExootOpen(false) }}
          onSluit={() => setExootOpen(false)}
        />
      )}
    </>
  )
}
