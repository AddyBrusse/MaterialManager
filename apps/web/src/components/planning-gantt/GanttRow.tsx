import type { DragEvent, MouseEvent } from 'react'
import { IconCpu, IconBoxOff } from '@tabler/icons-react'
import {
  type PlanningStapItem, type GanttMachineRow, type NodePos,
  laneTop, isWeekendIdx, machineWeekLoadFromItems, capStatusLabel,
  EFFECTIEVE_MIN, MAX_MIN, weekNrForIdx, fmtDayShort, heeftVolgordeWaarschuwing,
  TOTAL_DAYS, NODE_H, GHOST_H, LANE_PAD,
} from '../../utils/planningGanttUtils'
import { GanttNode } from './GanttNode'

interface GanttRowProps {
  row: GanttMachineRow
  items: PlanningStapItem[]               // rendered nodes (respects the "Gereed" toggle)
  capacityItems: PlanningStapItem[]       // all non-done scheduled steps for this machine, for cap bars
  pos: Record<string, NodePos>
  height: number
  realH: number
  pxDay: number
  windowStart: Date
  weeks: number
  selectedStep: PlanningStapItem | null
  selectedProjectId: string | null
  onSelectNode: (item: PlanningStapItem, e: MouseEvent) => void
  onMarkDone: (item: PlanningStapItem) => void
  onUnplan: (item: PlanningStapItem) => void
  draggingItem: PlanningStapItem | null
  onDragStartStep: (e: DragEvent, item: PlanningStapItem) => void
  onDragEndStep: () => void
  drop: { machine: string; day: number } | null
  onLaneDragOver: (e: DragEvent, machineNaam: string) => void
  onLaneDrop: (e: DragEvent, machineNaam: string) => void
  showGhost: boolean
  ghostByWeek: number[]
}

export function GanttRow({
  row, items, capacityItems, pos, height, realH, pxDay, windowStart, weeks,
  selectedStep, selectedProjectId, onSelectNode, onMarkDone, onUnplan,
  draggingItem, onDragStartStep, onDragEndStep,
  drop, onLaneDragOver, onLaneDrop, showGhost, ghostByWeek,
}: GanttRowProps) {
  const isDropRow = drop != null && drop.machine === row.naam

  const grid = []
  for (let i = 0; i < TOTAL_DAYS; i++) {
    grid.push(
      <div
        key={i} className={`lane-daycol${isWeekendIdx(i, windowStart) ? ' weekend' : ''}`}
        style={{ left: i * pxDay, width: pxDay }}
      />,
    )
  }
  const weekLines = []
  for (let w = 1; w < weeks; w++) {
    weekLines.push(<div key={w} className="lane-weekline" style={{ left: w * 7 * pxDay }} />)
  }

  return (
    <div className="gantt-row" style={{ height }}>
      <div className={`row-label${row.isGeen ? ' geen' : ''}`}>
        <div className="row-label-top">
          <span className="row-ico">{row.isGeen ? <IconBoxOff size={14} /> : <IconCpu size={14} />}</span>
          <div style={{ minWidth: 0 }}>
            <div className="nm">{row.naam || 'Geen machine'}</div>
            <div className="sb">{row.sub}</div>
          </div>
        </div>
        {!row.isGeen && (
          <div className="cap-bars">
            {Array.from({ length: weeks }, (_, w) => {
              const load = machineWeekLoadFromItems(capacityItems, row.naam, w * 7, windowStart)
              const cap = EFFECTIEVE_MIN * 5
              const status = capStatusLabel(load)
              const pct = Math.min(100, Math.round((load / cap) * 100))
              return (
                <div
                  key={w} className="cap-bar"
                  title={`wk ${weekNrForIdx(w * 7, windowStart)}: ${(load / 60).toFixed(1)}u / ${(cap / 60).toFixed(1)}u`}
                >
                  <i className={status} style={{ width: `${pct}%` }} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div
        className={`lane${isDropRow ? ' drop-active' : ''}`}
        style={{ width: TOTAL_DAYS * pxDay, height }}
        onDragOver={e => onLaneDragOver(e, row.naam)}
        onDrop={e => onLaneDrop(e, row.naam)}
      >
        <div className="lane-grid">{grid}{weekLines}</div>

        {showGhost && !row.isGeen && ghostByWeek.map((g, w) => {
          if (g <= 0) return null
          const durDays = g / MAX_MIN
          return (
            <div
              key={`g${w}`} className="ghost-node"
              style={{ left: (w * 7 + 0.15) * pxDay, width: Math.max(durDays * pxDay, 40), top: realH, height: GHOST_H }}
            >
              <span className="gn">Prognose · {(g / 60).toFixed(1)}u</span>
              <span className="gm">uit offertes</span>
            </div>
          )
        })}

        {items.map(item => {
          const p = pos[item.stap.id]
          if (!p) return null
          return (
            <GanttNode
              key={item.stap.id}
              item={item}
              left={p.left} width={p.width} top={laneTop(p.lane)} height={NODE_H}
              isSelected={selectedStep?.stap.id === item.stap.id}
              isLinked={selectedProjectId === item.project.id}
              isDragging={draggingItem?.stap.id === item.stap.id}
              showWarnDot={heeftVolgordeWaarschuwing(item)}
              onSelect={onSelectNode}
              onMarkDone={onMarkDone}
              onUnplan={onUnplan}
              onDragStart={onDragStartStep}
              onDragEnd={onDragEndStep}
            />
          )
        })}

        {isDropRow && draggingItem && (() => {
          const durDays = draggingItem.duurMin / MAX_MIN
          return (
            <div
              className="drop-ghost"
              style={{ left: drop.day * pxDay + 3, width: Math.max(durDays * pxDay - 6, 36), top: LANE_PAD, height: NODE_H }}
            >
              {fmtDayShort(drop.day, windowStart)}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
