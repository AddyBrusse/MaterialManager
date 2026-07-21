import type { DragEvent } from 'react'
import {
  type QueueJob, type DerivedSlot, machineAccentColor, isAtRisk, computeLatestStart,
} from '../../utils/planningQueueUtils'
import type { Machine } from '../../api/machines'
import { QueueJobCard } from './QueueJobCard'

interface QueueBacklogProps {
  jobs: QueueJob[]
  machines: Machine[]
  schedule: Map<string, DerivedSlot>
  verplichtKlaar: Map<string, string>
  windowStart: Date
  selectedId: string | null
  onSelect: (job: QueueJob) => void
  onDragStart: (e: DragEvent, job: QueueJob) => void
  onDragEnd: () => void
  isDropTarget: boolean
  onDragOver: (e: DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent) => void
}

export function QueueBacklog({
  jobs, machines, schedule, verplichtKlaar, windowStart, selectedId, onSelect, onDragStart, onDragEnd,
  isDropTarget, onDragOver, onDragLeave, onDrop,
}: QueueBacklogProps) {
  return (
    <div className="wq-backlog">
      <div className="wq-panel-head">
        <span className="t">Backlog</span>
        <span className="n">{jobs.length}</span>
      </div>
      <div
        className={`wq-list${isDropTarget ? ' drop-active' : ''}`}
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      >
        {jobs.length === 0 && <div className="wq-empty">Niets te plannen</div>}
        {jobs.map(job => {
          // Accent threads to the job's proposed machine, not the project —
          // a backlog card previews which machine it'll land on.
          const mach = machines.find(m => m.name === job.machineNaam)
          const accent = mach ? machineAccentColor(mach.name, mach.id) : 'var(--border-strong)'
          return (
            <QueueJobCard
              key={job.id}
              job={job}
              machineLabel={job.machineNaam}
              accentColor={accent}
              selected={selectedId === job.id}
              risk={isAtRisk(job, schedule.get(job.id), verplichtKlaar, windowStart)}
              latestStart={computeLatestStart(job, verplichtKlaar, windowStart)}
              draggable
              onDragStart={e => onDragStart(e, job)}
              onDragEnd={onDragEnd}
              onClick={() => onSelect(job)}
            />
          )
        })}
        <div className="wq-drophint">Sleep naar wachtrij om in te plannen</div>
      </div>
    </div>
  )
}

