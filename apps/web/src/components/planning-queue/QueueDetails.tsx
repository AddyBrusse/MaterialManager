import { useState } from 'react'
import { IconX, IconFolder, IconArchive, IconLock, IconLink } from '@tabler/icons-react'
import { minToUren, toDateStr } from '../../utils/planningUtils'
import {
  type QueueJob, type DerivedSlot, dateForOffset, isAtRisk, getGroupInfo,
} from '../../utils/planningQueueUtils'

interface QueueDetailsProps {
  job: QueueJob | null
  slot: DerivedSlot | undefined
  verplichtKlaar: Map<string, string>
  allJobs: QueueJob[]
  windowStart: Date
  onClose: () => void
  onUnplan: (job: QueueJob) => void
  onOpenProject: (job: QueueJob) => void
  onSetHold: (job: QueueJob, notBefore: string | null) => void
}

export function QueueDetails({
  job, slot, verplichtKlaar, allJobs, windowStart, onClose, onUnplan, onOpenProject, onSetHold,
}: QueueDetailsProps) {
  const [editingHold, setEditingHold] = useState(false)

  if (!job) {
    return (
      <div className="wq-details">
        <div className="wq-details-empty">Selecteer een blok op de tijdlijn om details te bekijken</div>
      </div>
    )
  }

  const risk = isAtRisk(job, slot, verplichtKlaar, windowStart)
  const startStr = slot ? toDateStr(dateForOffset(windowStart, Math.floor(slot.startOffsetDays))) : '—'
  const finishStr = slot ? toDateStr(dateForOffset(windowStart, Math.ceil(slot.finishOffsetDays))) : '—'
  const required = verplichtKlaar.get(job.id)
  const group = getGroupInfo(job, allJobs)

  return (
    <div className="wq-details">
      <div className="wq-details-row">
        <button className="icon-btn wq-details-close" onClick={onClose}><IconX size={15} /></button>

        <div className="wq-details-col">
          <span className="lbl">Order</span>
          <span className="big">{job.orderId}</span>
          <span className={`badge sm ${risk ? 'danger' : 'ok'}`}>{risk ? 'Risico' : 'Op tijd'}</span>
          <span className="sub">{job.klant}</span>
        </div>

        <div className="wq-details-col">
          <span className="lbl">Tekening</span>
          <span className="v">{job.tekening ?? '—'}</span>
          <span className="lbl" style={{ marginTop: 6 }}>Machine</span>
          <span className="v">{job.machineNaam || '—'}</span>
        </div>

        <div className="wq-details-col">
          <span className="lbl">Bewerkingstijd</span>
          <span className="v">{minToUren(job.duurMin)}</span>
          <span className="lbl" style={{ marginTop: 6 }}>Wachtrijpositie</span>
          <span className="v">{job.queuePosition != null ? `#${Math.round(job.queuePosition)}` : '—'}</span>
        </div>

        <div className="wq-details-col">
          <span className="lbl">Start – Klaar</span>
          <span className="v">{startStr} – {finishStr}</span>
          <span className="lbl" style={{ marginTop: 6 }}>Deadline</span>
          <span className="v">{job.deadline ?? '—'}{required && required !== job.deadline ? ` (moet klaar: ${required})` : ''}</span>
        </div>

        {job.notBefore || editingHold ? (
          <div className="wq-details-col callout notbefore">
            <span className="lbl"><IconLock size={11} style={{ marginRight: 4 }} />Niet eerder dan</span>
            {editingHold ? (
              <input
                type="date"
                className="st-input"
                style={{ height: 26, fontSize: 12 }}
                defaultValue={job.notBefore ?? ''}
                autoFocus
                onBlur={e => { setEditingHold(false); onSetHold(job, e.target.value || null) }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { setEditingHold(false); onSetHold(job, (e.target as HTMLInputElement).value || null) }
                  if (e.key === 'Escape') setEditingHold(false)
                }}
              />
            ) : (
              <span className="v" style={{ cursor: 'pointer' }} onClick={() => setEditingHold(true)} title="Wijzig">{job.notBefore}</span>
            )}
            {job.notBefore && !editingHold && (
              <button className="btn xs" style={{ marginTop: 4 }} onClick={() => onSetHold(job, null)}>Verwijder hold</button>
            )}
          </div>
        ) : (
          <div className="wq-details-col">
            <span className="lbl">Hold</span>
            <button className="btn xs" onClick={() => setEditingHold(true)}>+ niet eerder dan…</button>
          </div>
        )}

        {group && (
          <div className="wq-details-col callout group">
            <span className="lbl"><IconLink size={11} style={{ marginRight: 4 }} />Groep</span>
            <span className="v">{group.label}</span>
            <span className="sub">zonder onderbreking door naar volgende machine</span>
          </div>
        )}

        <div className="wq-details-actions">
          <button className="btn" onClick={() => onOpenProject(job)}>
            <IconFolder size={14} /> Open project
          </button>
          <button className="btn" style={{ color: 'var(--warning)' }} onClick={() => onUnplan(job)}>
            <IconArchive size={14} /> Terug naar backlog
          </button>
        </div>
      </div>
    </div>
  )
}
