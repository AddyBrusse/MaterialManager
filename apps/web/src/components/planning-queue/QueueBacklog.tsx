import type { CSSProperties, DragEvent } from 'react'
import { minToUren } from '../../utils/planningUtils'
import { type QueueJob, machineAccentColor } from '../../utils/planningQueueUtils'
import type { Machine } from '../../api/machines'

interface QueueBacklogProps {
  jobs: QueueJob[]
  machines: Machine[]
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
  jobs, machines, selectedId, onSelect, onDragStart, onDragEnd,
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
          // v2 restyle — accent bar threads to the job's proposed machine
          // (same color the Gantt board/queue use for that machine), not the
          // project, so a backlog card visually previews where it'll land.
          const mach = machines.find(m => m.name === job.machineNaam)
          const accent = mach ? machineAccentColor(mach.name, mach.id) : 'var(--border-strong)'
          return (
          <div
            key={job.id}
            className={`kc${selectedId === job.id ? ' is-selected' : ''}`}
            style={{ '--c': accent } as CSSProperties}
            draggable
            onDragStart={e => onDragStart(e, job)}
            onDragEnd={onDragEnd}
            onClick={() => onSelect(job)}
          >
            <div className="kc-head">
              <span className="kc-prodnr">{job.orderId}</span>
              <span className="kc-mach">{minToUren(job.duurMin)}</span>
            </div>
            <div className="kc-part">{job.klant}</div>
            <div className="kc-tek">{job.artikel}{job.tekening ? ` · ${job.tekening}` : ''}</div>
            <div className="kc-meta">
              {job.machineNaam && <span className="m">voorgesteld: {job.machineNaam}</span>}
              {job.deadline && <span className="m dl">lvr {job.deadline}</span>}
            </div>
          </div>
          )
        })}
        <div className="wq-drophint">Sleep naar wachtrij om in te plannen</div>
      </div>
    </div>
  )
}

