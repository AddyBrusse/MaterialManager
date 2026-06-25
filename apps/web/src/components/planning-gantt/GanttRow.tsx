import type { MouseEvent } from 'react'
import { IconCpu, IconBoxOff } from '@tabler/icons-react'
import {
  type PlanningStapItem, type GanttMachineRow, type NodePos,
  laneTop, isWeekendIdx, machineWeekLoadFromItems, capStatusLabel,
  EFFECTIEVE_MIN, weekNrForIdx, heeftVolgordeWaarschuwing,
  TOTAL_DAYS, NODE_H,
} from '../../utils/planningGanttUtils'
import { GanttNode } from './GanttNode'

interface GanttRowProps {
  row: GanttMachineRow
  items: PlanningStapItem[]               // rendered nodes (respects the "Gereed" toggle)
  capacityItems: PlanningStapItem[]       // all non-done scheduled steps for this machine, for the cap bar
  pos: Record<string, NodePos>
  height: number
  pxDay: number
  windowStart: Date
  weeks: number
  todayIdx: number
  selectedStep: PlanningStapItem | null
  selectedProjectId: string | null
  onSelectNode: (item: PlanningStapItem, e: MouseEvent) => void
  onMarkDone: (item: PlanningStapItem) => void
}

export function GanttRow({
  row, items, capacityItems, pos, height, pxDay, windowStart, weeks, todayIdx,
  selectedStep, selectedProjectId, onSelectNode, onMarkDone,
}: GanttRowProps) {
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

  // The window now spans many months, so a per-week sparkline (one bar per
  // week) no longer fits the 196px label column — show this week's capacity
  // only; the Prognose page is the place for the over-time view.
  const thisWeekStart = Math.floor(todayIdx / 7) * 7
  const thisWeekLoad = machineWeekLoadFromItems(capacityItems, row.naam, thisWeekStart, windowStart)
  const cap = EFFECTIEVE_MIN * 5
  const capStatus = capStatusLabel(thisWeekLoad)
  const capPct = Math.min(100, Math.round((thisWeekLoad / cap) * 100))

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
            <div
              className="cap-bar"
              title={`deze week (wk ${weekNrForIdx(thisWeekStart, windowStart)}): ${(thisWeekLoad / 60).toFixed(1)}u / ${(cap / 60).toFixed(1)}u`}
            >
              <i className={capStatus} style={{ width: `${capPct}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="lane" style={{ width: TOTAL_DAYS * pxDay, height }}>
        <div className="lane-grid">{grid}{weekLines}</div>

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
              showWarnDot={heeftVolgordeWaarschuwing(item)}
              onSelect={onSelectNode}
              onMarkDone={onMarkDone}
            />
          )
        })}
      </div>
    </div>
  )
}
