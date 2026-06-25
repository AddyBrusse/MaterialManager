import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocalStorage } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconTarget, IconDownload, IconPlus } from '@tabler/icons-react'
import { projectsApi, initProjects } from '../../api/projects'
import { articlesApi, initArticles } from '../../api/articles'
import { machinesApi, initMachines } from '../../api/machines'
import { relatiesApi, initRelaties } from '../../api/relaties'
import {
  type PlanningStapItem, type KanbanSort,
  buildStapItems, effectiveMachine, countOverbookedCells,
  getWindowStart, toDateStr, fmtDayShort, dayIndexForDate,
} from '../../utils/planningKanbanUtils'
import { KanbanToolbar, type SelStyle } from '../../components/planning-kanban/KanbanToolbar'
import { KanbanBacklog } from '../../components/planning-kanban/KanbanBacklog'
import { KanbanBoard, type KanbanScrollApi } from '../../components/planning-kanban/KanbanBoard'
import { KanbanDetails } from '../../components/planning-kanban/KanbanDetails'

export function PlanningKanbanPage() {
  const navigate = useNavigate()

  const [rev, setRev] = useState(0)
  const bump = () => setRev(r => r + 1)

  const [selectedStep, setSelectedStep] = useState<PlanningStapItem | null>(null)
  const [detailsCollapsed, setDetailsCollapsed] = useState(false)
  const [machineFilter, setMachineFilter] = useState('all')
  const [sortBy, setSortBy] = useState<KanbanSort>('deadline')
  const [draggingItem, setDraggingItem] = useState<PlanningStapItem | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const scrollApiRef = useRef<KanbanScrollApi | null>(null)

  const [selStyle, setSelStyle] = useLocalStorage<SelStyle>({ key: 'sm_kb_selstyle', defaultValue: 'dimmen' })

  const [windowStart, setWindowStart] = useState(getWindowStart)
  useEffect(() => {
    const id = window.setInterval(() => {
      const fresh = getWindowStart()
      if (toDateStr(fresh) !== toDateStr(windowStart)) setWindowStart(fresh)
    }, 60_000)
    return () => window.clearInterval(id)
  }, [windowStart])

  useEffect(() => {
    Promise.all([initProjects(), initArticles(), initMachines(), initRelaties()]).then(bump)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function flash(msg: string) {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2000)
  }

  function clearSel() { setSelectedStep(null) }
  function onSelect(item: PlanningStapItem) {
    setSelectedStep(item)
    if (detailsCollapsed) setDetailsCollapsed(false)
  }

  function onDragStart(e: DragEvent, item: PlanningStapItem) {
    setDraggingItem(item)
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', item.stap.id) } catch { /* unsupported in some browsers */ }
  }
  function onDragEnd() { setDraggingItem(null) }

  function dropPlan(item: PlanningStapItem, machineNaam: string, geplandDatum: string) {
    const { project, order, stap } = item
    const prevMachine = effectiveMachine(stap)
    const switched = !!prevMachine && prevMachine !== machineNaam
    projectsApi.planStap(project.id, order.id, stap.id, geplandDatum, machineNaam || null)
    setDraggingItem(null)
    bump()
    const dayLabel = fmtDayShort(dayIndexForDate(geplandDatum, windowStart), windowStart)
    flash(`${order.artikelNaam} → ${machineNaam}, ${dayLabel}${switched ? ' · machine gewijzigd' : ''}`)
  }

  function handleUnplan(item: PlanningStapItem) {
    const { project, order, stap } = item
    projectsApi.planStap(project.id, order.id, stap.id, null, null)
    if (selectedStep?.stap.id === stap.id) clearSel()
    bump()
    flash(`${order.artikelNaam} terug naar te plannen`)
  }

  function onDropBacklog() {
    if (draggingItem) handleUnplan(draggingItem)
    setDraggingItem(null)
  }

  // ── Data ─────────────────────────────────────────────────────────────────────

  const projects = projectsApi.list()
  const articles = articlesApi.list()
  const machines = machinesApi.listSync()
  const relaties = relatiesApi.listSync()

  const allItems = useMemo(() => buildStapItems(projects, articles), [projects, articles, rev])
  const scheduledItems = useMemo(() => allItems.filter(i => i.stap.geplandDatum != null), [allItems])
  const backlogItems = useMemo(() => allItems.filter(i => i.stap.geplandDatum == null), [allItems])
  const plannedMin = useMemo(() => scheduledItems.reduce((s, i) => s + i.duurMin, 0), [scheduledItems])
  const overCount = useMemo(() => countOverbookedCells(scheduledItems), [scheduledItems])
  const selectedArticle = selectedStep?.order.artikelId ? articles.find(a => a.id === selectedStep.order.artikelId) ?? null : null

  return (
    <div className="kb">
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Planning (KanBan)</div>
          <div className="st-page-sub">Sleep bewerkingen naar een machine + dag — de volgorde hier stuurt de planning</div>
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

      <KanbanToolbar
        selStyle={selStyle} onSelStyle={setSelStyle}
        backlogCount={backlogItems.length} plannedMin={plannedMin} overCount={overCount}
      />

      <div className="kb-body" onClick={clearSel}>
        <div onClick={e => e.stopPropagation()} style={{ display: 'contents' }}>
          <KanbanBacklog
            items={backlogItems} articles={articles} relaties={relaties} machines={machines} windowStart={windowStart}
            machineFilter={machineFilter} onMachineFilter={setMachineFilter}
            sortBy={sortBy} onSortBy={setSortBy}
            selectedId={selectedStep?.stap.id ?? null} selectedOrderId={selectedStep?.order.id ?? null} selStyle={selStyle}
            onSelect={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd}
            draggingId={draggingItem?.stap.id ?? null} onDropBacklog={onDropBacklog}
          />
          <KanbanBoard
            scheduledItems={scheduledItems} machines={machines} articles={articles} relaties={relaties} windowStart={windowStart}
            selStyle={selStyle} selectedId={selectedStep?.stap.id ?? null} selectedOrderId={selectedStep?.order.id ?? null}
            onSelect={onSelect}
            draggingItem={draggingItem} onDragStart={onDragStart} onDragEnd={onDragEnd}
            onDrop={dropPlan} scrollApiRef={scrollApiRef}
          />
          <KanbanDetails
            item={selectedStep} article={selectedArticle} relaties={relaties} windowStart={windowStart}
            collapsed={detailsCollapsed} onToggle={() => setDetailsCollapsed(v => !v)}
            onUnplan={handleUnplan} onFlash={flash}
          />
        </div>
      </div>

      {toast && <div className="kb-toast">{toast}</div>}
    </div>
  )
}
