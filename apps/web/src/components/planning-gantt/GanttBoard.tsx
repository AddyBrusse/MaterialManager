import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, MouseEvent, MutableRefObject } from 'react'
import type { Project } from '@stockmanager/shared'
import type { Article } from '../../api/articles'
import type { Machine } from '../../api/machines'
import {
  type PlanningStapItem, type ZoomLevel,
  PX_PER_DAY, TOTAL_DAYS, LABEL_W, NODE_H,
  getWindowStart, todayIndex, dateStrForDayIndex,
  buildMachineRows, effectiveMachine, computeRowLayout, laneTop,
  berekenGhostBelasting, ghostLoadFor, dayIndexForDate, projectKleur,
} from '../../utils/planningGanttUtils'
import type { BlockStyle, LinkStyle } from './GanttToolbar'
import { GanttRow } from './GanttRow'
import { GanttRuler } from './GanttRuler'

interface GanttBoardProps {
  zoom: ZoomLevel
  blockStyle: BlockStyle
  linkStyle: LinkStyle
  showDone: boolean
  showGhost: boolean
  machines: Machine[]
  scheduledItems: PlanningStapItem[]
  projects: Project[]
  articles: Article[]
  selectedStep: PlanningStapItem | null
  selectedProjectId: string | null
  onSelectNode: (item: PlanningStapItem, e: MouseEvent) => void
  onClearSelection: () => void
  onMarkDone: (item: PlanningStapItem) => void
  onUnplan: (item: PlanningStapItem) => void
  onDrop: (item: PlanningStapItem, machineNaam: string, geplandDatum: string) => void
  draggingItem: PlanningStapItem | null
  onDragStartStep: (e: DragEvent, item: PlanningStapItem) => void
  onDragEndStep: () => void
  scrollApiRef: MutableRefObject<{ toToday: () => void } | null>
}

export function GanttBoard({
  zoom, blockStyle, linkStyle, showDone, showGhost, machines, scheduledItems,
  projects, articles, selectedStep, selectedProjectId, onSelectNode, onClearSelection,
  onMarkDone, onUnplan, onDrop, draggingItem, onDragStartStep, onDragEndStep, scrollApiRef,
}: GanttBoardProps) {
  const windowStart = useMemo(() => getWindowStart(), [])
  const pxDay = PX_PER_DAY[zoom]
  const trackW = TOTAL_DAYS * pxDay
  const weeks = TOTAL_DAYS / 7
  const todayIdx = todayIndex(windowStart)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [drop, setDrop] = useState<{ machine: string; day: number } | null>(null)

  const machineRows = useMemo(() => buildMachineRows(machines), [machines])
  const ghostMap = useMemo(
    () => berekenGhostBelasting(projects, articles, machines, windowStart),
    [projects, articles, machines, windowStart],
  )

  const layout = useMemo(() => {
    let yCursor = 0
    const rows = machineRows.map(row => {
      const renderItems = scheduledItems.filter(i =>
        effectiveMachine(i.stap) === row.naam && (showDone || !i.stap.gereedOp),
      )
      const capacityItems = scheduledItems.filter(i =>
        effectiveMachine(i.stap) === row.naam && !i.stap.gereedOp,
      )
      const ghostByWeek = Array.from({ length: weeks }, (_, w) => ghostLoadFor(ghostMap, row.naam, w))
      const hasGhost = showGhost && !row.isGeen && ghostByWeek.some(v => v > 0)
      const { pos, height, realH } = computeRowLayout(renderItems, hasGhost, windowStart, pxDay)
      const top = yCursor
      yCursor += height
      return { row, renderItems, capacityItems, pos, height, realH, ghostByWeek, top }
    })
    return { rows, totalH: yCursor }
  }, [machineRows, scheduledItems, showDone, showGhost, ghostMap, windowStart, pxDay, weeks])

  const connectors = useMemo(() => {
    if (!selectedProjectId || (linkStyle !== 'lijnen' && linkStyle !== 'beide')) return null
    const pts: { x: number; y: number; day: number; volgorde: number }[] = []
    layout.rows.forEach(r => {
      r.renderItems.forEach(item => {
        if (item.project.id !== selectedProjectId) return
        const p = r.pos[item.stap.id]
        if (!p || item.stap.geplandDatum == null) return
        pts.push({
          x: p.left + p.width / 2,
          y: r.top + laneTop(p.lane) + NODE_H / 2,
          day: dayIndexForDate(item.stap.geplandDatum, windowStart),
          volgorde: item.stap.volgorde,
        })
      })
    })
    pts.sort((a, b) => a.day - b.day || a.volgorde - b.volgorde)
    return pts
  }, [selectedProjectId, linkStyle, layout, windowStart])

  function onLaneDragOver(e: DragEvent, machineNaam: string) {
    if (!draggingItem) return
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const day = Math.max(0, Math.min(TOTAL_DAYS - 1, Math.floor(x / pxDay)))
    setDrop(prev => (!prev || prev.machine !== machineNaam || prev.day !== day) ? { machine: machineNaam, day } : prev)
  }
  function onLaneDrop(e: DragEvent, machineNaam: string) {
    if (!draggingItem) return
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const day = Math.max(0, Math.min(TOTAL_DAYS - 1, Math.floor(x / pxDay)))
    onDrop(draggingItem, machineNaam, dateStrForDayIndex(day, windowStart))
    setDrop(null)
  }
  useEffect(() => { if (!draggingItem) setDrop(null) }, [draggingItem])

  useEffect(() => {
    const toToday = () => {
      const el = scrollRef.current
      if (!el) return
      el.scrollTo({ left: Math.max(0, todayIdx * pxDay - 220), behavior: 'smooth' })
    }
    scrollApiRef.current = { toToday }
    const el = scrollRef.current
    if (el) el.scrollLeft = Math.max(0, todayIdx * pxDay - 220)
  }, [pxDay, todayIdx, scrollApiRef])

  function onScrollClick(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (target.classList.contains('lane') || target.classList.contains('gantt-rows')) onClearSelection()
  }

  return (
    <div className={`gantt${selectedProjectId ? ' has-selection' : ''}`} data-blockstyle={blockStyle} data-linkstyle={linkStyle}>
      <div className="gantt-scroll" ref={scrollRef} onClick={onScrollClick}>
        <div className="gantt-inner" style={{ width: LABEL_W + trackW }}>
          <GanttRuler zoom={zoom} pxDay={pxDay} trackW={trackW} weeks={weeks} todayIdx={todayIdx} windowStart={windowStart} />

          <div className="gantt-rows" style={{ position: 'relative' }}>
            {layout.rows.map(r => (
              <GanttRow
                key={r.row.isGeen ? '__geen__' : r.row.naam}
                row={r.row} items={r.renderItems} capacityItems={r.capacityItems}
                pos={r.pos} height={r.height} realH={r.realH}
                pxDay={pxDay} windowStart={windowStart} weeks={weeks}
                selectedStep={selectedStep} selectedProjectId={selectedProjectId}
                onSelectNode={onSelectNode} onMarkDone={onMarkDone} onUnplan={onUnplan}
                draggingItem={draggingItem} onDragStartStep={onDragStartStep} onDragEndStep={onDragEndStep}
                drop={drop} onLaneDragOver={onLaneDragOver} onLaneDrop={onLaneDrop}
                showGhost={showGhost} ghostByWeek={r.ghostByWeek}
              />
            ))}

            {connectors && connectors.length > 1 && (
              <svg
                className="gantt-connectors" width={trackW} height={layout.totalH}
                style={{ left: LABEL_W, top: 0, width: trackW, height: layout.totalH }}
              >
                <path
                  d={connectors.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                  stroke={projectKleur(selectedProjectId!)} strokeDasharray="1 0"
                />
                {connectors.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="var(--bg-2)" stroke={projectKleur(selectedProjectId!)} />
                ))}
              </svg>
            )}

            <div className="today-line" style={{ left: LABEL_W + todayIdx * pxDay, height: layout.totalH }} />
          </div>
        </div>
      </div>
    </div>
  )
}
