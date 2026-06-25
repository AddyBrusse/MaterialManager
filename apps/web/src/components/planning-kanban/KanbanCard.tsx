import type { DragEvent, CSSProperties } from 'react'
import { IconClock, IconCalendar } from '@tabler/icons-react'
import type { Relatie } from '@stockmanager/shared'
import {
  type PlanningStapItem,
  projectKleur, minToUren, klantNaam, effectiveMachine,
  fmtDayShort, dayIndexForDate, workdaysLeft,
} from '../../utils/planningKanbanUtils'

interface KanbanCardProps {
  item: PlanningStapItem
  relaties: Relatie[]
  tekening: string | null
  windowStart: Date
  selected: boolean
  dimmed: boolean
  linked: boolean
  onSelect: (item: PlanningStapItem) => void
  onDragStart: (e: DragEvent, item: PlanningStapItem) => void
  onDragEnd: () => void
}

export function KanbanCard({
  item, relaties, tekening, windowStart, selected, dimmed, linked, onSelect, onDragStart, onDragEnd,
}: KanbanCardProps) {
  const { stap, order, project } = item
  const left = workdaysLeft(project.levertijdDatum, windowStart)
  const dlClass = left == null ? '' : left < 0 ? 'late' : left <= 4 ? 'urgent' : ''
  const dlLabel = left != null && left < 0 ? 'te laat' : project.levertijdDatum ? fmtDayShort(dayIndexForDate(project.levertijdDatum, windowStart), windowStart) : '—'
  const machineNaam = effectiveMachine(stap)

  const classes = ['kc', selected && 'is-selected', linked && 'linked', dimmed && 'dimmed'].filter(Boolean).join(' ')

  return (
    <div
      className={classes}
      style={{ '--c': projectKleur(project.id) } as CSSProperties}
      draggable
      data-order-id={order.id}
      data-card-id={stap.id}
      data-vol={stap.volgorde}
      onDragStart={e => { e.stopPropagation(); onDragStart(e, item) }}
      onDragEnd={onDragEnd}
      onClick={e => { e.stopPropagation(); onSelect(item) }}
      title={`${order.id} · ${order.artikelNaam}${tekening ? ' · ' + tekening : ''}`}
    >
      <div className="kc-head">
        <span className="kc-prodnr">{order.id}</span>
        <span className="kc-mach">{(machineNaam || '—').slice(0, 4).toUpperCase()}</span>
      </div>
      <div className="kc-part">{order.artikelNaam}</div>
      {tekening && <div className="kc-tek">{tekening}</div>}
      <div className="kc-klant">{klantNaam(relaties, project)}</div>
      <div className="kc-meta">
        <span className="m"><IconClock size={11} /><span className="dur">{minToUren(item.duurMin)}</span></span>
        <span className={`m dl ${dlClass}`}>
          <IconCalendar size={11} />
          {dlLabel}
        </span>
      </div>
    </div>
  )
}
