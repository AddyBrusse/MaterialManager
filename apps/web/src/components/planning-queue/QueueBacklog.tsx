import type { CSSProperties, DragEvent } from 'react'
import { minToUren, projectKleur } from '../../utils/planningUtils'
import type { QueueJob } from '../../utils/planningQueueUtils'

interface QueueBacklogProps {
  jobs: QueueJob[]
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
  jobs, selectedId, onSelect, onDragStart, onDragEnd,
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
        {jobs.map(job => (
          <div
            key={job.id}
            className={`kc${selectedId === job.id ? ' is-selected' : ''}`}
            style={{ '--c': projectKleur(job.item.project.id) } as CSSProperties}
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
        ))}
        <div className="wq-drophint">Sleep naar wachtrij om in te plannen</div>
      </div>
    </div>
  )
}

