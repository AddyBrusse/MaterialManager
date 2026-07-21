import { useState } from 'react'
import type { DragEvent } from 'react'
import { IconGripVertical } from '@tabler/icons-react'
import type { Machine } from '../../api/machines'
import { type QueueJob, type DerivedSlot, isAtRisk, machineAccentColor, computeLatestStart } from '../../utils/planningQueueUtils'
import { QueueJobCard } from './QueueJobCard'

// Sentinel for "the insert line sits below the last card" (append), distinct
// from any real job id.
const DROP_END = '__end__'

interface QueuePanelProps {
  machines: Machine[]
  selectedMachine: Machine | undefined
  onSelectMachine: (name: string) => void
  bezettingByMachine: Map<string, number>
  jobs: QueueJob[]
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
  machines, selectedMachine, onSelectMachine, bezettingByMachine, jobs, schedule, verplichtKlaar, windowStart,
  selectedId, onSelect, draggingId, onDragStart, onDragEnd, onDropOnCard, onDropAtEnd,
}: QueuePanelProps) {
  // Purely-visual drop indicator: id of the card the insert-line sits above,
  // or DROP_END for the bottom of the list. Local state — it never affects the
  // committed order, only where the preview line renders.
  const [dropBefore, setDropBefore] = useState<string | null>(null)
  const clearDrop = () => setDropBefore(null)
  // Every card in this panel belongs to the same selected machine — one
  // accent color for the whole list, unlike the backlog where it varies per
  // card's own proposed machine. This is also the fix for the old
  // inconsistency: these cards used to tint by PROJECT color while the
  // backlog tinted by machine color — same visual language, different
  // meaning depending on which panel you were looking at.
  const accent = selectedMachine ? machineAccentColor(selectedMachine.name, selectedMachine.id) : 'var(--border-strong)'

  return (
    <div className="wq-queue">
      <div className="wq-machine-picker">
        <div className="wq-picker-head">Selecteer machine</div>
        <div className="wq-machine-tabs">
          {machines.map(m => (
            <button
              key={m.id}
              type="button"
              className="wq-machine-tab"
              data-active={m.name === selectedMachine?.name}
              onClick={() => onSelectMachine(m.name)}
            >
              <span className="dot" style={{ background: machineAccentColor(m.name, m.id) }} />
              <span className="nm">{m.name}</span>
              <span className="pct">{bezettingByMachine.get(m.name) ?? 0}%</span>
            </button>
          ))}
        </div>
        {selectedMachine && (
          <div className="wq-machine-meta">
            {selectedMachine.worksWeekends ? 'werkt in weekend' : 'niet in weekend'}
          </div>
        )}
      </div>

      <div className="wq-panel-head">
        <span className="t">Wachtrij</span>
        {selectedMachine && <span className="machine-name">{selectedMachine.name}</span>}
        <span className="n">{jobs.length}</span>
      </div>

      <div
        className="wq-list"
        onDragOver={e => { if (draggingId) { e.preventDefault(); setDropBefore(DROP_END) } }}
        onDrop={e => { clearDrop(); onDropAtEnd(e) }}
      >
        {jobs.length === 0 && <div className="wq-empty">Geen items in de wachtrij</div>}
        {jobs.map((job, i) => {
          const slot = schedule.get(job.id)
          const risk = isAtRisk(job, slot, verplichtKlaar, windowStart)
          const dropAbove = dropBefore === job.id
          const dropBelowEnd = dropBefore === DROP_END && i === jobs.length - 1
          return (
            <div
              key={job.id}
              className={`wq-qrow${draggingId === job.id ? ' dragging' : ''}${dropAbove ? ' drop-before' : ''}${dropBelowEnd ? ' drop-after' : ''}`}
              draggable
              onDragStart={e => onDragStart(e, job)}
              onDragEnd={() => { clearDrop(); onDragEnd() }}
              onDragOver={e => {
                if (!draggingId) return
                e.preventDefault(); e.stopPropagation()
                setDropBefore(job.id)
              }}
              onDrop={e => { e.stopPropagation(); clearDrop(); onDropOnCard(e, job.id) }}
            >
              <div className="wq-qrail">
                <span className="wq-qrank">{i + 1}</span>
                <span className="wq-qgrip"><IconGripVertical size={13} /></span>
              </div>
              <QueueJobCard
                job={job}
                machineLabel={selectedMachine?.name ?? job.machineNaam}
                accentColor={accent}
                selected={selectedId === job.id}
                risk={risk}
                latestStart={computeLatestStart(job, verplichtKlaar, windowStart)}
                onClick={() => onSelect(job)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
