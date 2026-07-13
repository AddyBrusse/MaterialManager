import type { DragEvent } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { Relatie } from '@stockmanager/shared'
import type { Machine } from '../../api/machines'
import type { Article } from '../../api/articles'
import {
  type PlanningStapItem, type KanbanLayout,
  EFFECTIEVE_MIN, cellCapStatus, getCellItems, minToUren, tekeningFor,
  dateForDayIndex, fmtDayShort, weekdayLetter, isCellOpen,
} from '../../utils/planningKanbanUtils'
import { KanbanCard } from './KanbanCard'

interface DropCell { day: number; m: string }

interface KanbanDayRowProps {
  dayIdx: number
  isToday: boolean
  layout: KanbanLayout
  machines: Machine[]
  articles: Article[]
  relaties: Relatie[]
  windowStart: Date
  dimOthers: boolean
  ringLinked: boolean
  selectedId: string | null
  selectedOrderId: string | null
  onSelect: (item: PlanningStapItem) => void
  onDragStart: (e: DragEvent, item: PlanningStapItem) => void
  onDragEnd: () => void
  dropCell: DropCell | null
  onCellDragOver: (e: DragEvent, dayIdx: number, machineNaam: string) => void
  onCellDragLeave: (e: DragEvent, dayIdx: number, machineNaam: string) => void
  onCellDrop: (e: DragEvent, dayIdx: number, machineNaam: string) => void
}

export function KanbanDayRow({
  dayIdx, isToday, layout, machines, articles, relaties, windowStart,
  dimOthers, ringLinked, selectedId, selectedOrderId, onSelect,
  onDragStart, onDragEnd, dropCell,
  onCellDragOver, onCellDragLeave, onCellDrop,
}: KanbanDayRowProps) {
  const d = dateForDayIndex(dayIdx, windowStart)
  const mon = fmtDayShort(dayIdx, windowStart).split(' ')[1]
  const dayLoad = layout.dayLoad[dayIdx]

  return (
    <div className={`kb-row${isToday ? ' today' : ''}`} style={{ height: layout.rowH[dayIdx] }}>
      <div className="kb-daylabel">
        <div className="dl-top">
          <span className="dnum">{d.getDate()}</span>
          <span className="dow">{weekdayLetter(dayIdx, windowStart)}</span>
        </div>
        <span className="mon">{mon}</span>
        {isToday && <span className="today-tag">Vandaag</span>}
        {dayLoad > 0 && <span className="dl-load">Σ {minToUren(dayLoad)}</span>}
      </div>

      {machines.map(m => {
        const cell = getCellItems(layout, dayIdx, m.name)
        const load = cell.reduce((s, i) => s + i.duurMin, 0)
        const status = cellCapStatus(load)
        const pct = Math.min(100, (load / EFFECTIEVE_MIN) * 100)
        const isDrop = !!(dropCell && dropCell.day === dayIdx && dropCell.m === m.name)
        const open = isCellOpen(dayIdx, m, windowStart)
        return (
          <div
            key={m.id}
            className={`kb-cell${status === 'over' ? ' over' : ''}${isDrop ? ' dropok' : ''}${!open ? ' closed' : ''}`}
            onDragOver={e => onCellDragOver(e, dayIdx, m.name)}
            onDragLeave={e => onCellDragLeave(e, dayIdx, m.name)}
            onDrop={e => onCellDrop(e, dayIdx, m.name)}
          >
            {cell.length > 0 && (
              <div className="kb-cap">
                <div className="bar"><i className={status} style={{ width: `${pct}%` }} /></div>
                <span className={`lab${status !== 'ok' ? ' ' + status : ''}`}>{minToUren(load)}/{minToUren(EFFECTIEVE_MIN)}</span>
                {status === 'over' && <span className="warn-ico" title="Dag overboekt — capaciteit overschreden"><IconAlertTriangle size={13} /></span>}
                {status === 'warn' && <span className="warn-ico warn" title="Bijna vol"><IconAlertTriangle size={12} /></span>}
              </div>
            )}
            <div className="kb-cell-cards">
              {cell.map(item => (
                <KanbanCard
                  key={item.stap.id} item={item} relaties={relaties} windowStart={windowStart}
                  tekening={tekeningFor(item.order, articles)}
                  selected={selectedId === item.stap.id}
                  dimmed={!!(selectedOrderId && dimOthers && item.order.id !== selectedOrderId)}
                  linked={!!(selectedOrderId && ringLinked && item.order.id === selectedOrderId && item.stap.id !== selectedId)}
                  onSelect={onSelect}
                  onDragStart={onDragStart} onDragEnd={onDragEnd}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
