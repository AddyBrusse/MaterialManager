import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocalStorage } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconTarget, IconDownload, IconPlus, IconAlertTriangle } from '@tabler/icons-react'
import { projectsApi, initProjects } from '../../api/projects'
import { articlesApi, initArticles } from '../../api/articles'
import { machinesApi, initMachines } from '../../api/machines'
import { relatiesApi, initRelaties } from '../../api/relaties'
import { useUserStore } from '../../stores/user'
import {
  type PlanningStapItem, type ZoomLevel,
  buildStapItems, vindAchterstanden, berekenGanttKpis, projectKleur,
} from '../../utils/planningGanttUtils'
import { GanttKpiRow } from '../../components/planning-gantt/GanttKpiRow'
import { GanttToolbar, type BlockStyle, type LinkStyle } from '../../components/planning-gantt/GanttToolbar'
import { GanttBacklogPanel, type BacklogSort } from '../../components/planning-gantt/GanttBacklogPanel'
import { GanttBoard } from '../../components/planning-gantt/GanttBoard'
import { GanttNodePopover } from '../../components/planning-gantt/GanttNodePopover'

function fmtShortNL(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

export function PlanningGanttPage() {
  const navigate = useNavigate()
  const userName = useUserStore(state => state.user?.name ?? 'Onbekend')

  const [rev, setRev] = useState(0)
  const bump = () => setRev(r => r + 1)

  const [selectedStep, setSelectedStep] = useState<PlanningStapItem | null>(null)
  const [popPos, setPopPos] = useState<{ x: number; y: number } | null>(null)
  const [projectFilter, setProjectFilter] = useState('all')
  const [backlogSort, setBacklogSort] = useState<BacklogSort>('default')
  const [draggingItem, setDraggingItem] = useState<PlanningStapItem | null>(null)
  const [undoStack, setUndoStack] = useState<{ label: string; fn: () => void }[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const scrollApiRef = useRef<{ toToday: () => void } | null>(null)

  const [zoom, setZoom] = useLocalStorage<ZoomLevel>({ key: 'sm_pg_zoom', defaultValue: 'week' })
  const [blockStyle, setBlockStyle] = useLocalStorage<BlockStyle>({ key: 'sm_pg_blockstyle', defaultValue: 'rand' })
  const [linkStyle, setLinkStyle] = useLocalStorage<LinkStyle>({ key: 'sm_pg_linkstyle', defaultValue: 'gloed' })
  const [showGhost, setShowGhost] = useLocalStorage({ key: 'sm_pg_ghost', defaultValue: false })
  const [showDone, setShowDone] = useLocalStorage({ key: 'sm_pg_showdone', defaultValue: true })

  function pushUndo(label: string, fn: () => void) {
    setUndoStack(s => [...s, { label, fn }])
  }
  function doUndo() {
    if (undoStack.length === 0) return
    const last = undoStack[undoStack.length - 1]
    last.fn()
    setUndoStack(s => s.slice(0, -1))
    bump()
  }
  function clearSel() { setSelectedStep(null); setPopPos(null) }

  useEffect(() => {
    // AppLayout already kicks these off on app mount, but that fetch can still be
    // in flight (or resolve before this page subscribes to anything) — without an
    // explicit re-render afterward, this page's first render can get stuck showing
    // whatever localStorage had cached. Re-fetch + bump so we deterministically
    // reflect the database instead of racing the global init.
    Promise.all([initProjects(), initArticles(), initMachines(), initRelaties()]).then(bump)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo() }
      if (e.key === 'Escape') clearSel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undoStack])

  function flash(msg: string) {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

  function dropPlan(item: PlanningStapItem, machineNaam: string, geplandDatum: string) {
    const { project, order, stap } = item
    const prevDatum = stap.geplandDatum ?? null
    const prevMachine = stap.geplandMachine ?? stap.machine ?? null
    projectsApi.planStap(project.id, order.id, stap.id, geplandDatum, machineNaam || null)
    pushUndo(
      prevDatum ? `Verplaatsing ${stap.id} ongedaan maken` : `${stap.id} terugzetten ongedaan maken`,
      () => projectsApi.planStap(project.id, order.id, stap.id, prevDatum, prevMachine),
    )
    setDraggingItem(null)
    bump()
    flash(`${stap.id} ingepland op ${fmtShortNL(geplandDatum)}`)
  }

  function handleUnplan(item: PlanningStapItem) {
    const { project, order, stap } = item
    const prevDatum = stap.geplandDatum ?? null
    const prevMachine = stap.geplandMachine ?? stap.machine ?? null
    projectsApi.planStap(project.id, order.id, stap.id, null, null)
    pushUndo(`${stap.id} opnieuw inplannen ongedaan maken`, () =>
      projectsApi.planStap(project.id, order.id, stap.id, prevDatum, prevMachine))
    if (selectedStep?.stap.id === stap.id) clearSel()
    bump()
    flash(`${stap.id} terug naar backlog`)
  }

  function handleUnplanOrder(item: PlanningStapItem) {
    const { project, order } = item
    const prev = order.stappen
      .filter(s => !s.gereedOp)
      .map(s => ({ id: s.id, datum: s.geplandDatum ?? null, machine: s.geplandMachine ?? s.machine ?? null }))
    projectsApi.unplanOrder(project.id, order.id)
    pushUndo(`Inplanning order ${order.id} herstellen`, () => {
      for (const { id, datum, machine } of prev) projectsApi.planStap(project.id, order.id, id, datum, machine)
    })
    clearSel()
    bump()
    flash(`${order.id}: ${prev.length} stappen teruggezet`)
  }

  function handleMarkDone(item: PlanningStapItem) {
    const { project, order, stap } = item
    projectsApi.checkOffStap(project.id, order.id, stap.id, userName)
    pushUndo(`Gereedmelding ${stap.id} ongedaan maken`, () =>
      projectsApi.uncheckStap(project.id, order.id, stap.id))
    bump()
    flash(`${stap.id} gereed gemeld`)
  }

  function handleSetDeadline(projectId: string, newDate: string) {
    const project = projectsApi.get(projectId)
    const prev = project.levertijdDatum
    projectsApi.update(projectId, { levertijdDatum: newDate })
    pushUndo(`Deadline ${projectId} herstellen`, () => projectsApi.update(projectId, { levertijdDatum: prev }))
    bump()
  }

  function handleGoProject(projectId: string) {
    setProjectFilter(projectId)
    flash(`Gefilterd op project ${projectId}`)
  }

  function selectNode(item: PlanningStapItem, e: MouseEvent) {
    setSelectedStep(item)
    const x = Math.min(e.clientX + 8, window.innerWidth - 312)
    const y = Math.min(e.clientY + 8, window.innerHeight - 380)
    setPopPos({ x: Math.max(12, x), y: Math.max(12, y) })
  }

  function onDragStartStep(e: DragEvent, item: PlanningStapItem) {
    setDraggingItem(item)
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', item.stap.id) } catch { /* unsupported in some browsers */ }
  }
  function onDragEndStep() { setDraggingItem(null) }

  // ── Data ─────────────────────────────────────────────────────────────────────

  const projects = projectsApi.list()
  const articles = articlesApi.list()
  const machines = machinesApi.listSync()
  const relaties = relatiesApi.listSync()

  const allItems = useMemo(
    () => buildStapItems(projects, articles, { includeDone: true }),
    [projects, articles, rev],
  )
  const scheduledItems = useMemo(() => allItems.filter(i => i.stap.geplandDatum != null), [allItems])
  const backlogItems = useMemo(() => allItems.filter(i => i.stap.geplandDatum == null), [allItems])
  const achterItems = useMemo(() => vindAchterstanden(allItems), [allItems])
  const kpis = useMemo(
    () => berekenGanttKpis(scheduledItems, machines.length, projects, backlogItems.length, achterItems.length),
    [scheduledItems, machines.length, projects, backlogItems.length, achterItems.length],
  )

  return (
    <div className="pg-root plan">
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Planning (Gantt)</div>
          <div className="st-page-sub">Horizontale tijdlijn — sleep stappen op de tijdlijn om in te plannen</div>
        </div>
        <div className="st-page-actions">
          <button className="st-btn ghost" onClick={() => scrollApiRef.current?.toToday()}>
            <IconTarget size={14} /> Vandaag
          </button>
          <button className="st-btn ghost" onClick={() => notifications.show({ message: 'Exporteren — binnenkort beschikbaar' })}>
            <IconDownload size={14} /> Exporteer
          </button>
          <button className="st-btn primary" onClick={() => navigate('/projecten')}>
            <IconPlus size={14} /> Nieuwe order
          </button>
        </div>
      </div>

      <GanttKpiRow kpis={kpis} />

      <GanttToolbar
        zoom={zoom} onZoom={setZoom}
        blockStyle={blockStyle} onBlockStyle={setBlockStyle}
        linkStyle={linkStyle} onLinkStyle={setLinkStyle}
        undoLabel={undoStack.length ? undoStack[undoStack.length - 1].label : null}
        onUndo={doUndo}
        showGhost={showGhost} onToggleGhost={() => setShowGhost(g => !g)}
        showDone={showDone} onToggleDone={() => setShowDone(d => !d)}
      />

      {achterItems.length > 0 && (
        <div className="achterstand-banner">
          <span className="ico"><IconAlertTriangle size={15} /></span>
          <span><b>{achterItems.length}</b> {achterItems.length === 1 ? 'stap' : 'stappen'} over tijd, nog niet gereed</span>
          <div className="chips">
            {achterItems.map(item => (
              <button key={item.stap.id} className="ab-chip" onClick={e => selectNode(item, e)}>
                <span className="d" style={{ background: projectKleur(item.project.id) }} />
                {item.project.id} · {item.stap.geplandDatum && fmtShortNL(item.stap.geplandDatum)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="plan-body">
        <GanttBacklogPanel
          items={backlogItems} relaties={relaties}
          projectFilter={projectFilter} onProjectFilter={setProjectFilter}
          sortBy={backlogSort} onSortBy={setBacklogSort}
          selectedProjectId={selectedStep?.project.id ?? null}
          onSelectCard={item => { setSelectedStep(item); setPopPos(null) }}
          draggingId={draggingItem?.stap.id ?? null}
          onDragStartStep={onDragStartStep} onDragEndStep={onDragEndStep}
        />
        <GanttBoard
          zoom={zoom} blockStyle={blockStyle} linkStyle={linkStyle}
          showDone={showDone} showGhost={showGhost}
          machines={machines} scheduledItems={scheduledItems}
          projects={projects} articles={articles}
          selectedStep={selectedStep} selectedProjectId={selectedStep?.project.id ?? null}
          onSelectNode={selectNode} onClearSelection={clearSel}
          onMarkDone={handleMarkDone} onUnplan={handleUnplan} onDrop={dropPlan}
          draggingItem={draggingItem} onDragStartStep={onDragStartStep} onDragEndStep={onDragEndStep}
          scrollApiRef={scrollApiRef}
        />
      </div>

      {selectedStep && popPos && (
        <GanttNodePopover
          item={selectedStep} pos={popPos} relaties={relaties}
          onClose={clearSel} onMarkDone={handleMarkDone} onUnplan={handleUnplan}
          onUnplanOrder={handleUnplanOrder} onGoProject={handleGoProject} onSetDeadline={handleSetDeadline}
        />
      )}

      {toast && <div className="plan-toast">{toast}</div>}
    </div>
  )
}
