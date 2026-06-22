import type { DragEvent, MouseEvent, CSSProperties } from 'react'
import { IconCheck, IconX } from '@tabler/icons-react'
import { minToUren, isAchterstand, projectKleur, type PlanningStapItem } from '../../utils/planningGanttUtils'

interface GanttNodeProps {
  item: PlanningStapItem
  left: number; width: number; top: number; height: number
  isSelected: boolean
  isLinked: boolean
  isDragging: boolean
  showWarnDot: boolean
  onSelect: (item: PlanningStapItem, e: MouseEvent) => void
  onMarkDone: (item: PlanningStapItem) => void
  onUnplan: (item: PlanningStapItem) => void
  onDragStart: (e: DragEvent, item: PlanningStapItem) => void
  onDragEnd: () => void
}

export function GanttNode({
  item, left, width, top, height, isSelected, isLinked, isDragging, showWarnDot,
  onSelect, onMarkDone, onUnplan, onDragStart, onDragEnd,
}: GanttNodeProps) {
  const { stap, order } = item
  const done = !!stap.gereedOp
  const achter = isAchterstand(stap)
  const classes = [
    'node',
    done && 'done',
    item.isPlaceholder && 'placeholder',
    isSelected && 'is-selected',
    isLinked && 'proj-linked',
    achter && 'achterstand',
    isDragging && 'dragging',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={classes}
      style={{ '--c': projectKleur(item.project.id), left, width, top, height } as CSSProperties}
      draggable={!done}
      onDragStart={e => { e.stopPropagation(); onDragStart(e, item) }}
      onDragEnd={onDragEnd}
      onClick={e => { e.stopPropagation(); onSelect(item, e) }}
    >
      <div className="nname">
        {done && <IconCheck size={11} className="check" style={{ marginRight: 3 }} />}
        {order.artikelNaam}
      </div>
      <div className="nmeta">
        {showWarnDot && <span className="warn-dot" title="Volgorde-waarschuwing" />}
        <span className="ndur">{item.isPlaceholder && <span className="tilde">~</span>}{minToUren(item.duurMin)}</span>
        <span>·</span>
        <span>{item.project.id}</span>
      </div>
      {!done && (
        <div className="node-actions">
          <button className="na" title="Gereed melden" onClick={e => { e.stopPropagation(); onMarkDone(item) }}>
            <IconCheck size={12} />
          </button>
          <button className="na" title="Terug naar backlog" onClick={e => { e.stopPropagation(); onUnplan(item) }}>
            <IconX size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
