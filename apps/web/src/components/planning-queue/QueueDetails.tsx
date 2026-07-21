import { useState, useMemo } from 'react'
import { toDateStr, minToUren } from '../../utils/planningUtils'
import {
  type QueueJob, type DerivedSlot, dateForOffset, machineAccentColor, fmtDateWithWeekday,
} from '../../utils/planningQueueUtils'
import { type Machine } from '../../api/machines'
import { type Article } from '../../api/articles'
import { StepFileViewer, type StepFileRef } from './StepFileViewer'

const STEP_FILE_RE = /\.(step|stp)$/i

interface QueueDetailsProps {
  job: QueueJob | null
  schedule: Map<string, DerivedSlot>
  verplichtKlaar: Map<string, string>
  allJobs: QueueJob[]
  windowStart: Date
  machines: Machine[]
  articles: Article[]
  onClose: () => void
  onUnplan: (job: QueueJob) => void
  onOpenProject: (job: QueueJob) => void
  onSetHold: (job: QueueJob, notBefore: string | null) => void
}

export function QueueDetails({
  job, schedule, verplichtKlaar, allJobs, windowStart, machines, articles, onOpenProject,
}: QueueDetailsProps) {
  const [shiftDays, setShiftDays] = useState<Map<string, number>>(new Map())

  // Real per-order step files: resolved from the order's article attachments
  // (see ArticleFilesTab / uploads.ts /attachment route) — not a hardcoded
  // demo file. An order with no artikelId, or an article with no .step/.stp
  // attachments, correctly falls back to the "geen bestand" placeholder.
  const stepFiles: StepFileRef[] = useMemo(() => {
    if (!job) return []
    const article = articles.find(a => a.id === job.item.order.artikelId)
    if (!article) return []
    return article.attachments
      .filter(a => a.path && STEP_FILE_RE.test(a.name))
      .map(a => ({ name: a.name, url: a.path as string }))
  }, [job, articles])

  if (!job) {
    return (
      <div className="wq-details">
        <div className="wq-details-empty">Selecteer een blok op de tijdlijn om details te bekijken</div>
      </div>
    )
  }

  const orderId = job.orderId
  const orderSteps = allJobs.filter(j => j.orderId === orderId).sort((a, b) => a.volgorde - b.volgorde)
  const required = verplichtKlaar.get(job.id)

  const isLate = !!(required && job.deadline && required < job.deadline)
  const statusBg = isLate ? '#fee2e2' : '#dcfce7'
  const statusText = isLate ? '#dc2626' : '#15803d'
  const statusLabel = isLate ? 'Te laat' : 'Op schema'

  return (
    <div className="wq-details">
      <div className="wq-details-panel">
        {/* Section 1: Article & Project details */}
        <div className="wq-dp-section1">
          <div className="wq-dp-header">
            <div>
              <div className="wq-dp-artname">{job.artikel}</div>
              <div className="wq-dp-tekno">{job.tekening ?? '—'}</div>
              <div className="wq-dp-rfq">{job.orderId}</div>
            </div>
            <span className="wq-dp-status-pill" style={{ background: statusBg, color: statusText }}>
              {statusLabel}
            </span>
          </div>

          <div className="wq-dp-fields">
            <div className="wq-dp-field">
              <span className="wq-dp-label">AANTAL</span>
              <span className="wq-dp-value">{job.item.order.qty} {job.item.order.eenheid}</span>
            </div>
            <div className="wq-dp-field">
              <span className="wq-dp-label">KLANT</span>
              <span className="wq-dp-value">{job.klant}</span>
            </div>
            <div className="wq-dp-field">
              <span className="wq-dp-label">LEVERDATUM</span>
              <span className="wq-dp-value">{job.deadline ? fmtDateWithWeekday(job.deadline) : '—'}</span>
            </div>
            <div className="wq-dp-field">
              <span className="wq-dp-label">VERWACHT</span>
              <span className="wq-dp-value">{required ? fmtDateWithWeekday(required) : '—'}</span>
            </div>
          </div>

          <div className="wq-dp-actions">
            <button className="wq-dp-btn primary" onClick={() => onOpenProject(job)}>Project</button>
            <button className="wq-dp-btn">Artikel</button>
            <button className="wq-dp-btn">Tekening</button>
            <button className="wq-dp-btn">Verkenner</button>
          </div>
        </div>

        {/* Section 2: Step details table */}
        <div className="wq-dp-section2">
          <table className="wq-dp-table">
            <thead>
              <tr>
                <th>MACHINE</th>
                <th>START</th>
                <th>EIND</th>
                <th>SCHEMA</th>
                <th>SHIFT</th>
              </tr>
            </thead>
            <tbody>
              {orderSteps.map(step => {
                const stepSlot = schedule.get(step.id)
                const startStr = stepSlot ? fmtDateWithWeekday(toDateStr(dateForOffset(windowStart, Math.floor(stepSlot.startOffsetDays)))) : '—'
                const endStr = stepSlot ? fmtDateWithWeekday(toDateStr(dateForOffset(windowStart, Math.ceil(stepSlot.finishOffsetDays)))) : '—'
                const machine = machines.find(m => m.name === step.machineNaam)
                const machineColor = machine ? machineAccentColor(machine.name, machine.id) : '#ccc'
                const stepRequired = verplichtKlaar.get(step.id)
                const stepLate = !!(stepRequired && step.deadline && stepRequired < step.deadline)
                const currentShift = shiftDays.get(step.id) ?? 0

                return (
                  <tr key={step.id}>
                    <td className="wq-dp-machine">
                      <span className="wq-dp-dot" style={{ background: machineColor }} />
                      {step.machineNaam || '—'}
                    </td>
                    <td className="wq-dp-date">
                      <div>{startStr}</div>
                      <div className="wq-dp-time">{minToUren(step.duurMin)}</div>
                    </td>
                    <td className="wq-dp-date">
                      <div>{endStr}</div>
                    </td>
                    <td className="wq-dp-schema">
                      <span className="wq-dp-dot" style={{ background: stepLate ? '#dc2626' : '#16a34a' }} />
                    </td>
                    <td className="wq-dp-shift">
                      <input
                        type="number"
                        min="0"
                        value={currentShift}
                        onChange={e => setShiftDays(new Map(shiftDays).set(step.id, parseInt(e.target.value) || 0))}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Section 3: Drawing / step-file preview */}
        <div className="wq-dp-section3">
          <div className="wq-dp-label">TEKENING / STEP-FILE</div>
          <StepFileViewer files={stepFiles} />
        </div>
      </div>
    </div>
  )
}
