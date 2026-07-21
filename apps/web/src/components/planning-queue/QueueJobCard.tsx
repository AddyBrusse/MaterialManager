import type { CSSProperties, DragEvent } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { minToUren } from '../../utils/planningUtils'
import { type QueueJob, shortOrderId, fmtDateWithWeekday } from '../../utils/planningQueueUtils'

// Shared by the Backlog and per-machine Wachtrij panels — same card,
// different accent color (the job's proposed machine vs. the panel's
// selected machine), so the two can never visually drift apart again like
// the old machine-tinted-backlog vs. project-tinted-queue split did.
//
// Content priority (explicit, per request): 1) machine (bold, large) + hours
// planned, 2) description, 3) customer, 4) drawing number, 5) qty, 6) risk,
// 7) latest start date. Cross-machine routing and notBefore holds are
// deliberately NOT here — clicking a card already opens QueueDetails, whose
// step table shows the order's full routing; repeating it here was the
// "too busy, colors don't match" clutter this redesign is fixing.
interface QueueJobCardProps {
  job: QueueJob
  machineLabel: string
  accentColor: string
  selected: boolean
  risk: boolean
  latestStart: string | null
  className?: string
  draggable?: boolean
  onClick: () => void
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd?: () => void
}

export function QueueJobCard({
  job, machineLabel, accentColor, selected, risk, latestStart, className, draggable, onClick, onDragStart, onDragEnd,
}: QueueJobCardProps) {
  const { qty, eenheid } = job.item.order
  return (
    <div
      className={`qjob${selected ? ' is-selected' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--mc': accentColor } as CSSProperties}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <span className="qjob-prodnr">{shortOrderId(job.orderId)}</span>
      <div className="qjob-top">
        <span className="qjob-machine">{machineLabel || 'Nog niet toegewezen'}</span>
        <span className="qjob-hours">{minToUren(job.duurMin)}</span>
      </div>
      <div className="qjob-desc">{job.artikel}</div>
      <div className="qjob-klant">{job.klant}</div>
      {job.tekening && <div className="qjob-tek">{job.tekening}</div>}
      <div className="qjob-bottom">
        <span className="qjob-qty">{qty} {eenheid}</span>
        {risk && <span className="qjob-risk"><IconAlertTriangle size={11} stroke={2.2} /> risico</span>}
      </div>
      {latestStart && <div className="qjob-start">start uiterlijk {fmtDateWithWeekday(latestStart)}</div>}
    </div>
  )
}
