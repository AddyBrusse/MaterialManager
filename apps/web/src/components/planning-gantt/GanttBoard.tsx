import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, MouseEvent, MutableRefObject, RefObject } from 'react'
import { useResizeObserver } from '@mantine/hooks'
import type { Machine } from '../../api/machines'
import {
  type PlanningStapItem, type ZoomLevel,
  TARGET_DAYS, MIN_PX_PER_DAY, MAX_PX_PER_DAY, TOTAL_DAYS, LABEL_W, NODE_H,
  todayIndex, dateStrForDayIndex,
  buildMachineRows, effectiveMachine, computeRowLayout, laneTop,
  dayIndexForDate, projectKleur,
} from '../../utils/planningGanttUtils'
import type { BlockStyle, LinkStyle } from './GanttToolbar'
import { GanttRow } from './GanttRow'
import { GanttRuler } from './GanttRuler'

export interface GanttScrollApi { toToday: () => void; scrollToDay: (dayIdx: number) => void }

interface GanttBoardProps {
  zoom: ZoomLevel
  blockStyle: BlockStyle
  linkStyle: LinkStyle
  showDone: boolean
  windowStart: Date
  machines: Machine[]
  scheduledItems: PlanningStapItem[]
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
  scrollApiRef: MutableRefObject<GanttScrollApi | null>
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function GanttBoard({
  zoom, blockStyle, linkStyle, showDone, windowStart, machines, scheduledItems,
  selectedStep, selectedProjectId, onSelectNode, onClearSelection,
  onMarkDone, onUnplan, onDrop, draggingItem, onDragStartStep, onDragEndStep, scrollApiRef,
}: GanttBoardProps) {
  // pxDay is derived from the actually-rendered track width, not a fixed
  // constant, so "Dag/Week/Maand" frame roughly what they promise on this
  // screen instead of however many days a static px/day happens to fit.
  const [scrollRef, scrollRect] = useResizeObserver<HTMLDivElement>()
  const availW = Math.max(scrollRect.width - LABEL_W, 0)
  const pxDay = availW > 0 ? clamp(availW / TARGET_DAYS[zoom], MIN_PX_PER_DAY, MAX_PX_PER_DAY) : MIN_PX_PER_DAY
  const trackW = TOTAL_DAYS * pxDay
  const weeks = TOTAL_DAYS / 7
  const todayIdx = todayIndex(windowStart)

  const [drop, setDrop] = useState<{ machine: string; day: number } | null>(null)

  const machineRows = useMemo(() => buildMachineRows(machines), [machines])

  const layout = useMemo(() => {
    let yCursor = 0
    const rows = machineRows.map(row => {
      const renderItems = scheduledItems.filter(i =>
        effectiveMachine(i.stap) === row.naam && (showDone || !i.stap.gereedOp),
      )
      const capacityItems = scheduledItems.filter(i =>
        effectiveMachine(i.stap) === row.naam && !i.stap.gereedOp,
      )
      const { pos, height } = computeRowLayout(renderItems, windowStart, pxDay)
      const top = yCursor
      yCursor += height
      return { row, renderItems, capacityItems, pos, height, top }
    })
    return { rows, totalH: yCursor }
  }, [machineRows, scheduledItems, showDone, windowStart, pxDay])

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

  // Snap to "today" once the track width is first measured, and again
  // whenever the user explicitly changes zoom — but NOT on every resize-
  // driven pxDay recalculation, which would otherwise yank the view back
  // while the user is looking at a different week.
  const didMount = useRef(false)
  const prevZoom = useRef(zoom)
  useEffect(() => {
    const toToday = () => {
      const el = scrollRef.current
      if (el) el.scrollTo({ left: Math.max(0, todayIdx * pxDay - 220), behavior: 'smooth' })
    }
    const scrollToDay = (dayIdx: number) => {
      const el = scrollRef.current
      if (el) el.scrollTo({ left: Math.max(0, dayIdx * pxDay - 220), behavior: 'smooth' })
    }
    scrollApiRef.current = { toToday, scrollToDay }

    if (scrollRect.width === 0) return
    const zoomChanged = prevZoom.current !== zoom
    prevZoom.current = zoom
    if (!didMount.current || zoomChanged) {
      didMount.current = true
      const el = scrollRef.current
      if (el) el.scrollLeft = Math.max(0, todayIdx * pxDay - 220)
    }
  }, [pxDay, todayIdx, zoom, scrollRect.width, scrollApiRef])

  function onScrollClick(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (target.classList.contains('lane') || target.classList.contains('gantt-rows')) onClearSelection()
  }

  return (
    <div className={`gantt${selectedProjectId ? ' has-selection' : ''}`} data-blockstyle={blockStyle} data-linkstyle={linkStyle}>
      <div className="gantt-scroll" ref={scrollRef as RefObject<HTMLDivElement>} onClick={onScrollClick}>
        <div className="gantt-inner" style={{ width: LABEL_W + trackW }}>
          <GanttRuler zoom={zoom} pxDay={pxDay} trackW={trackW} weeks={weeks} todayIdx={todayIdx} windowStart={windowStart} />

          <div className="gantt-rows" style={{ position: 'relative' }}>
            {layout.rows.map(r => (
              <GanttRow
                key={r.row.isGeen ? '__geen__' : r.row.naam}
                row={r.row} items={r.renderItems} capacityItems={r.capacityItems}
                pos={r.pos} height={r.height}
                pxDay={pxDay} windowStart={windowStart} weeks={weeks} todayIdx={todayIdx}
                selectedStep={selectedStep} selectedProjectId={selectedProjectId}
                onSelectNode={onSelectNode} onMarkDone={onMarkDone} onUnplan={onUnplan}
                draggingItem={draggingItem} onDragStartStep={onDragStartStep} onDragEndStep={onDragEndStep}
                drop={drop} onLaneDragOver={onLaneDragOver} onLaneDrop={onLaneDrop}
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
