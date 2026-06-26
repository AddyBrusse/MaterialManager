import { useEffect, useMemo, useRef, useState } from 'react'
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
  getWindowStart, toDateStr, dayIndexForDate,
} from '../../utils/planningGanttUtils'
import { GanttKpiRow } from '../../components/planning-gantt/GanttKpiRow'
import { GanttToolbar, type BlockStyle, type LinkStyle } from '../../components/planning-gantt/GanttToolbar'
import { GanttBoard, type GanttScrollApi } from '../../components/planning-gantt/GanttBoard'
import { GanttDetailSidebar } from '../../components/planning-gantt/GanttDetailSidebar'

function fmtShortNL(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

export function PlanningGanttPage() {
  const navigate = useNavigate()
  const userName = useUserStore(state => state.user?.name ?? 'Onbekend')

  const [rev, setRev] = useState(0)
  const bump = () => setRev(r => r + 1)

  const [selectedStep, setSelectedStep] = useState<PlanningStapItem | null>(null)
  const [undoStack, setUndoStack] = useState<{ label: string; fn: () => void }[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const scrollApiRef = useRef<GanttScrollApi | null>(null)

  const [zoom, setZoom] = useLocalStorage<ZoomLevel>({ key: 'sm_pg_zoom', defaultValue: 'week' })
  const [blockStyle, setBlockStyle] = useLocalStorage<BlockStyle>({ key: 'sm_pg_blockstyle', defaultValue: 'rand' })
  const [linkStyle, setLinkStyle] = useLocalStorage<LinkStyle>({ key: 'sm_pg_linkstyle', defaultValue: 'gloed' })
  const [showDone, setShowDone] = useLocalStorage({ key: 'sm_pg_showdone', defaultValue: true })

  // Rolling window anchor — recomputed on day rollover so "vandaag" and the
  // window stay correct without requiring a manual page reload.
  const [windowStart, setWindowStart] = useState(getWindowStart)
  useEffect(() => {
    const id = window.setInterval(() => {
      const fresh = getWindowStart()
      if (toDateStr(fresh) !== toDateStr(windowStart)) setWindowStart(fresh)
    }, 60_000)
    return () => window.clearInterval(id)
  }, [windowStart])

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
  function clearSel() { setSelectedStep(null) }

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
  // Scheduling (plan/move/unplan) now happens exclusively in the Kanban
  // planner — this board is read-only: completion + deadline edits only.

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
    navigate(`/projecten/${projectId}`)
  }

  function selectNode(item: PlanningStapItem) {
    setSelectedStep(item)
  }

  function selectSearchResult(item: PlanningStapItem) {
    setSelectedStep(item)
    if (item.stap.geplandDatum != null) {
      const dayIdx = dayIndexForDate(item.stap.geplandDatum, windowStart)
      scrollApiRef.current?.scrollToDay(dayIdx)
    }
  }

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
          <div className="st-page-sub">Horizontale tijdlijn — overzicht van de werkbelasting (inplannen gaat via Kanban)</div>
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
        showDone={showDone} onToggleDone={() => setShowDone(d => !d)}
        allItems={allItems} relaties={relaties} onSelectSearch={selectSearchResult}
      />

      {achterItems.length > 0 && (
        <div className="achterstand-banner">
          <span className="ico"><IconAlertTriangle size={15} /></span>
          <span><b>{achterItems.length}</b> {achterItems.length === 1 ? 'stap' : 'stappen'} over tijd, nog niet gereed</span>
          <div className="chips">
            {achterItems.map(item => (
              <button key={item.stap.id} className="ab-chip" onClick={() => selectNode(item)}>
                <span className="d" style={{ background: projectKleur(item.project.id) }} />
                {item.project.id} · {item.stap.geplandDatum && fmtShortNL(item.stap.geplandDatum)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="plan-body">
        <GanttBoard
          zoom={zoom} blockStyle={blockStyle} linkStyle={linkStyle}
          showDone={showDone} windowStart={windowStart}
          machines={machines} scheduledItems={scheduledItems}
          selectedStep={selectedStep} selectedProjectId={selectedStep?.project.id ?? null}
          onSelectNode={selectNode} onClearSelection={clearSel}
          onMarkDone={handleMarkDone}
          scrollApiRef={scrollApiRef}
        />
        {selectedStep && (
          <GanttDetailSidebar
            item={selectedStep} relaties={relaties}
            onClose={clearSel} onMarkDone={handleMarkDone}
            onGoProject={handleGoProject} onSetDeadline={handleSetDeadline}
          />
        )}
      </div>

      {toast && <div className="plan-toast">{toast}</div>}
    </div>
  )
}
