import type { DragEvent, CSSProperties } from 'react'
import { IconClock, IconCalendar } from '@tabler/icons-react'
import type { Relatie } from '@stockmanager/shared'
import type { SpanBlock } from '../../utils/planningKanbanUtils'
import {
  projectKleur, minToUren, klantNaam, effectiveMachine,
  fmtDayShort, dayIndexForDate, workdaysLeft,
} from '../../utils/planningKanbanUtils'

interface ColRect { left: number; width: number }

interface KanbanSpanBlockProps {
  block: SpanBlock
  relaties: Relatie[]
  tekening: string | null
  windowStart: Date
  colRect: ColRect | undefined
  selected: boolean
  dimmed: boolean
  linked: boolean
  onSelect: (item: SpanBlock['item']) => void
  onDragStart: (e: DragEvent, item: SpanBlock['item']) => void
  onDragEnd: () => void
}

// Multi-day version of KanbanCard — one block per segment (a job crossing a
// closed weekend for a non-weekend machine renders as two segments with a
// visible gap). Only the first segment (the stap's actual geplandDatum) is
// draggable, and only it carries data-order-id/data-vol for the connector
// lines — but every segment is clickable to select the step and show its
// details, since a tall multi-week block reads as one job regardless of
// which part of it you click.
export function KanbanSpanBlock({
  block, relaties, tekening, windowStart, colRect,
  selected, dimmed, linked, onSelect, onDragStart, onDragEnd,
}: KanbanSpanBlockProps) {
  if (!colRect || block.segments.length === 0) return null
  const { item } = block
  const { stap, order, project } = item
  const left = workdaysLeft(project.levertijdDatum, windowStart)
  const dlClass = left == null ? '' : left < 0 ? 'late' : left <= 4 ? 'urgent' : ''
  const dlLabel = left != null && left < 0 ? 'te laat' : project.levertijdDatum ? fmtDayShort(dayIndexForDate(project.levertijdDatum, windowStart), windowStart) : '—'
  const machineNaam = effectiveMachine(stap)
  const totalDays = block.segments.reduce((s, seg) => s + (seg.endDayIdx - seg.startDayIdx + 1), 0)

  const stateClasses = [selected && 'is-selected', linked && 'linked', dimmed && 'dimmed'].filter(Boolean).join(' ')

  return (
    <>
      {block.segments.map((seg, si) => {
        const style: CSSProperties = {
          '--c': projectKleur(project.id),
          position: 'absolute',
          top: seg.top,
          left: colRect.left,
          width: colRect.width,
          height: seg.height,
        } as CSSProperties

        if (si === 0) {
          return (
            <div
              key={si}
              className={`kc kb-span-head ${stateClasses}`}
              style={style}
              draggable
              data-order-id={order.id}
              data-card-id={stap.id}
              data-vol={stap.volgorde}
              onDragStart={e => { e.stopPropagation(); onDragStart(e, item) }}
              onDragEnd={onDragEnd}
              onClick={e => { e.stopPropagation(); onSelect(item) }}
              title={`${order.id} · ${order.artikelNaam}${tekening ? ' · ' + tekening : ''} · ${totalDays} dagen`}
            >
              <div className="kc-head">
                <span className="kc-prodnr">{order.id}</span>
                <span className="kc-mach">{(machineNaam || '—').slice(0, 4).toUpperCase()}</span>
              </div>
              <div className="kc-part">{order.artikelNaam}</div>
              {tekening && <div className="kc-tek">{tekening}</div>}
              <div className="kc-klant">{klantNaam(relaties, project)}</div>
              <div className="kc-meta">
                <span className="m"><IconClock size={11} /><span className="dur">{minToUren(block.totalMin)} · {totalDays}d</span></span>
                <span className={`m dl ${dlClass}`}>
                  <IconCalendar size={11} />
                  {dlLabel}
                </span>
              </div>
            </div>
          )
        }

        return (
          <div
            key={si}
            className={`kb-span-cont ${stateClasses}`}
            style={style}
            onClick={e => { e.stopPropagation(); onSelect(item) }}
            title={`${order.id} · ${order.artikelNaam} · vervolg`}
          >
            <span className="kb-span-cont-lab">{order.id} · {minToUren(seg.minMin)}</span>
          </div>
        )
      })}
    </>
  )
}
