import type { CSSProperties, DragEvent } from 'react'
import { IconGripVertical, IconAlertTriangle, IconLock, IconLink } from '@tabler/icons-react'
import type { Machine } from '../../api/machines'
import { minToUren, projectKleur } from '../../utils/planningUtils'
import { type QueueJob, type DerivedSlot, isAtRisk, getGroupInfo } from '../../utils/planningQueueUtils'

interface QueuePanelProps {
  machines: Machine[]
  selectedMachine: Machine | undefined
  onSelectMachine: (name: string) => void
  bezettingPct: number
  jobs: QueueJob[]
  allJobs: QueueJob[]
  schedule: Map<string, DerivedSlot>
  verplichtKlaar: Map<string, string>
  windowStart: Date
  selectedId: string | null
  onSelect: (job: QueueJob) => void
  draggingId: string | null
  onDragStart: (e: DragEvent, job: QueueJob) => void
  onDragEnd: () => void
  onDropOnCard: (e: DragEvent, beforeId: string) => void
  onDropAtEnd: (e: DragEvent) => void
}

export function QueuePanel({
  machines, selectedMachine, onSelectMachine, bezettingPct, jobs, allJobs, schedule, verplichtKlaar, windowStart,
  selectedId, onSelect, draggingId, onDragStart, onDragEnd, onDropOnCard, onDropAtEnd,
}: QueuePanelProps) {
  return (
    <div className="wq-queue">
      <div className="wq-queue-head">
        <select className="wq-machine-select" value={selectedMachine?.name ?? ''} onChange={e => onSelectMachine(e.target.value)}>
          {machines.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
        {selectedMachine && (
          <div className="wq-machine-meta">
            <span className="sw" style={{ background: bezettingPct > 100 ? 'var(--danger)' : bezettingPct > 85 ? 'var(--warning)' : 'var(--success)' }} />
            bezetting {bezettingPct}% · {selectedMachine.worksWeekends ? 'werkt in weekend' : 'niet in weekend'}
          </div>
        )}
      </div>

      <div className="wq-panel-head">
        <span className="t">Wachtrij</span>
        <span className="n">{jobs.length}</span>
      </div>

      <div className="wq-list" onDragOver={e => e.preventDefault()} onDrop={onDropAtEnd}>
        {jobs.length === 0 && <div className="wq-empty">Geen items in de wachtrij</div>}
        {jobs.map((job, i) => {
          const slot = schedule.get(job.id)
          const risk = isAtRisk(job, slot, verplichtKlaar, windowStart)
          const group = getGroupInfo(job, allJobs)
          const required = verplichtKlaar.get(job.id)
          return (
            <div
              key={job.id}
              className={`wq-qrow${draggingId === job.id ? ' dragging' : ''}`}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.stopPropagation(); onDropOnCard(e, job.id) }}
            >
              <div className="wq-qrail">
                <span className="wq-qrank">{i + 1}</span>
                <span className="wq-qgrip" draggable onDragStart={e => onDragStart(e, job)} onDragEnd={onDragEnd}>
                  <IconGripVertical size={13} />
                </span>
              </div>
              <div
                className={`kc${selectedId === job.id ? ' is-selected' : ''}${group ? ' linked' : ''}`}
                style={{ '--c': projectKleur(job.item.project.id) } as CSSProperties}
                onClick={() => onSelect(job)}
              >
                <div className="kc-head">
                  <span className="kc-prodnr">{job.orderId}</span>
                  <span className="kc-mach">{minToUren(job.duurMin)}</span>
                </div>
                <div className="kc-part">{job.klant}</div>
                <div className="kc-tek">{job.artikel}</div>
                <div className="wq-badgerow">
                  {group && <span className="wq-badge group"><IconLink size={10} /> {group.label}</span>}
                  {job.notBefore && <span className="wq-badge notbefore"><IconLock size={10} /> niet eerder dan {job.notBefore}</span>}
                  {risk && <span className="wq-badge risk"><IconAlertTriangle size={10} /> risico</span>}
                </div>
                {required && <div className="sub" style={{ fontSize: 9.5, color: 'var(--text-4)', marginTop: 2 }}>moet klaar: {required}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
