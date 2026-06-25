import { useState } from 'react'
import type { DragEvent } from 'react'
import { IconInbox } from '@tabler/icons-react'
import type { Relatie } from '@stockmanager/shared'
import type { Machine } from '../../api/machines'
import type { Article } from '../../api/articles'
import {
  type PlanningStapItem, type KanbanSort,
  minToUren, sortBacklog, tekeningFor, effectiveMachine,
} from '../../utils/planningKanbanUtils'
import type { SelStyle } from './KanbanToolbar'
import { KanbanCard } from './KanbanCard'

interface KanbanBacklogProps {
  items: PlanningStapItem[]
  articles: Article[]
  relaties: Relatie[]
  machines: Machine[]
  windowStart: Date
  machineFilter: string
  onMachineFilter: (v: string) => void
  sortBy: KanbanSort
  onSortBy: (v: KanbanSort) => void
  selectedId: string | null
  selectedOrderId: string | null
  selStyle: SelStyle
  onSelect: (item: PlanningStapItem) => void
  onDragStart: (e: DragEvent, item: PlanningStapItem) => void
  onDragEnd: () => void
  draggingId: string | null
  onDropBacklog: () => void
}

export function KanbanBacklog({
  items, articles, relaties, machines, windowStart,
  machineFilter, onMachineFilter, sortBy, onSortBy,
  selectedId, selectedOrderId, selStyle, onSelect, onDragStart, onDragEnd,
  draggingId, onDropBacklog,
}: KanbanBacklogProps) {
  const [over, setOver] = useState(false)
  const dimOthers = selStyle === 'dimmen' || selStyle === 'lijnen'
  const ringLinked = selStyle === 'markeren' || selStyle === 'lijnen'

  let list = machineFilter === 'all' ? items : items.filter(i => effectiveMachine(i.stap) === machineFilter)
  list = sortBacklog(list, sortBy, relaties)
  const totalMin = list.reduce((s, i) => s + i.duurMin, 0)

  return (
    <aside className="kb-backlog">
      <div className="kb-bl-head">
        <div className="kb-bl-title">
          <IconInbox size={16} />
          <span className="t">Te plannen</span>
          <span className="n">{list.length}</span>
        </div>
        <div className="kb-bl-sub">{minToUren(totalMin)} aan bewerkingstijd · sleep naar een machine + dag</div>
        <div className="kb-bl-controls">
          <select value={machineFilter} onChange={e => onMachineFilter(e.target.value)}>
            <option value="all">Alle machines</option>
            {machines.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
          <select value={sortBy} onChange={e => onSortBy(e.target.value as KanbanSort)}>
            <option value="default">Order</option>
            <option value="deadline">Leverdatum</option>
            <option value="duur">Tijd</option>
            <option value="klant">Klant</option>
          </select>
        </div>
      </div>

      <div
        className={`kb-bl-list${over ? ' drop-active' : ''}`}
        onDragOver={e => { if (draggingId) { e.preventDefault(); setOver(true) } }}
        onDragLeave={e => { if (e.currentTarget === e.target) setOver(false) }}
        onDrop={e => { e.preventDefault(); setOver(false); onDropBacklog() }}
      >
        {list.length === 0 && (
          <div className="kb-bl-empty">
            {machineFilter === 'all' ? 'Alles is ingepland 🎉' : 'Geen open bewerkingen voor deze machine.'}
          </div>
        )}
        {list.map(item => (
          <KanbanCard
            key={item.stap.id}
            item={item} relaties={relaties} windowStart={windowStart}
            tekening={tekeningFor(item.order, articles)}
            selected={selectedId === item.stap.id}
            dimmed={!!(selectedOrderId && dimOthers && item.order.id !== selectedOrderId)}
            linked={!!(selectedOrderId && ringLinked && item.order.id === selectedOrderId && item.stap.id !== selectedId)}
            onSelect={onSelect}
            onDragStart={onDragStart} onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </aside>
  )
}
