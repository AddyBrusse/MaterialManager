import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { IconLink, IconAlertTriangle, IconLock } from '@tabler/icons-react'
import type { Machine } from '../../api/machines'
import { projectKleur } from '../../utils/planningUtils'
import {
  type QueueJob, type DerivedSlot, type Connector,
  QUEUE_DAY_WIDTH, QUEUE_VISIBLE_DAYS, QUEUE_LABEL_WIDTH, QUEUE_ROW_HEIGHT, QUEUE_HEADER_HEIGHT,
  type QueueZoom, fmtOffsetDay, isWeekendOffset, isAtRisk, getGroupInfo,
} from '../../utils/planningQueueUtils'

interface MachineRow {
  machine: Machine
  jobs: QueueJob[]
  bezettingPct: number
}

interface QueueTimelineProps {
  rows: MachineRow[]
  schedule: Map<string, DerivedSlot>
  verplichtKlaar: Map<string, string>
  allJobs: QueueJob[]
  zoom: QueueZoom
  windowStart: Date
  connectors: Connector[]
  showConnections: boolean
  onToggleConnections: () => void
  selectedId: string | null
  onSelectJob: (job: QueueJob) => void
}

interface NodeLayout { job: QueueJob; slot: DerivedSlot; left: number; width: number; ghostLeft: number; ghostWidth: number; rowIndex: number }
interface NodeCenter { x: number; y: number }

export function QueueTimeline({
  rows, schedule, verplichtKlaar, allJobs, zoom, windowStart, connectors, showConnections, onToggleConnections, selectedId, onSelectJob,
}: QueueTimelineProps) {
  const dayWidth = QUEUE_DAY_WIDTH[zoom]

  const { totalDays, layoutRows, centers } = useMemo(() => {
    let maxFinish = QUEUE_VISIBLE_DAYS
    const layoutRows = rows.map((r, rowIndex) => {
      const nodes: NodeLayout[] = []
      for (const job of r.jobs) {
        const slot = schedule.get(job.id)
        if (!slot) continue
        if (slot.finishOffsetDays > maxFinish) maxFinish = slot.finishOffsetDays
        nodes.push({
          job, slot, rowIndex,
          left: slot.startOffsetDays * dayWidth,
          width: Math.max(slot.durationDays * dayWidth, 54),
          ghostLeft: slot.ghostOffsetDays * dayWidth,
          ghostWidth: Math.max((slot.finishOffsetDays - slot.startOffsetDays) * dayWidth, 40),
        })
      }
      return { ...r, nodes }
    })
    const centers = new Map<string, NodeCenter>()
    layoutRows.forEach((r, rowIndex) => {
      r.nodes.forEach(n => {
        centers.set(n.job.id, {
          x: n.left + n.width / 2,
          y: QUEUE_HEADER_HEIGHT + rowIndex * QUEUE_ROW_HEIGHT + QUEUE_ROW_HEIGHT / 2,
        })
      })
    })
    return { totalDays: Math.ceil(maxFinish) + 3, layoutRows, centers }
  }, [rows, dayWidth, schedule])

  const trackW = totalDays * dayWidth
  const totalH = QUEUE_HEADER_HEIGHT + layoutRows.length * QUEUE_ROW_HEIGHT

  return (
    <div className="wq-timeline-col">
      <div className="wq-tl-head">
        <span className="t">Tijdlijn</span>
        <button className="tgl" data-on={showConnections} onClick={onToggleConnections}>
          <IconLink size={13} /> Toon verbindingen
        </button>
      </div>
      <div className="wq-tl-scroll">
        <div className="wq-tl-inner" style={{ width: QUEUE_LABEL_WIDTH + trackW }}>
          <div className="wq-tl-ruler">
            <div className="wq-tl-corner" />
            {Array.from({ length: totalDays }, (_, d) => (
              <div key={d} className={`wq-tl-day${isWeekendOffset(windowStart, d) ? ' weekend' : ''}`} style={{ width: dayWidth }}>
                {fmtOffsetDay(windowStart, d)}
              </div>
            ))}
          </div>

          <div style={{ position: 'relative' }}>
            {layoutRows.map(r => (
              <div key={r.machine.id} className="wq-tl-row">
                <div className="wq-tl-label">
                  <div className="wq-tl-label-top">
                    <span className="sw" style={{ background: projectKleur(r.machine.id) }} />
                    <span className="nm">{r.machine.name}</span>
                  </div>
                  <div className="bezetting-bar">
                    <i className={r.bezettingPct > 100 ? 'over' : r.bezettingPct > 85 ? 'warn' : ''} style={{ width: `${Math.min(100, r.bezettingPct)}%` }} />
                  </div>
                  <span className="pct">bezetting {r.bezettingPct}%</span>
                </div>
                <div className="wq-tl-lane" style={{ width: trackW }}>
                  {Array.from({ length: totalDays }, (_, d) => (
                    isWeekendOffset(windowStart, d) && (
                      <div key={d} className="wq-tl-daycol weekend" style={{ left: d * dayWidth, width: dayWidth }} />
                    )
                  ))}
                  {r.nodes.map(n => {
                    const risk = isAtRisk(n.job, n.slot, verplichtKlaar, windowStart)
                    const group = getGroupInfo(n.job, allJobs)
                    return (
                      <div key={n.job.id}>
                        {n.slot.heldByNotBefore && (
                          <div
                            className="node placeholder"
                            style={{ left: n.ghostLeft, width: n.ghostWidth, top: 15, height: 38, border: '1px dashed var(--text-4)', background: 'transparent', pointerEvents: 'none' }}
                          >
                            <IconLock size={12} style={{ margin: 'auto', color: 'var(--text-4)' }} />
                          </div>
                        )}
                        <div
                          className={`node${selectedId === n.job.id ? ' is-selected' : ''}${group ? ' proj-linked' : ''}`}
                          style={{
                            left: n.left, width: n.width, top: 15, height: 38,
                            '--c': projectKleur(r.machine.id),
                            background: projectKleur(r.machine.id),
                            border: group ? '2px solid var(--warning)' : undefined,
                          } as CSSProperties}
                          onClick={() => onSelectJob(n.job)}
                        >
                          <span className="nname" style={{ color: '#fff' }}>{n.job.orderId}</span>
                          {group && <span className="wq-node-badge group" title={group.label}><IconLink size={9} /></span>}
                          {risk && <span className="wq-node-badge risk" title="Risico"><IconAlertTriangle size={9} /></span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {showConnections && connectors.length > 0 && (
              <svg className="gantt-connectors" style={{ left: QUEUE_LABEL_WIDTH, top: 0, width: trackW, height: totalH }}>
                {connectors.map((c, i) => {
                  const a = centers.get(c.fromJobId)
                  const b = centers.get(c.toJobId)
                  if (!a || !b) return null
                  const midX = (a.x + b.x) / 2
                  return (
                    <path
                      key={i}
                      d={`M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`}
                      stroke={c.color} strokeDasharray="4 4"
                    />
                  )
                })}
                {connectors.map((c, i) => {
                  const a = centers.get(c.fromJobId)
                  const b = centers.get(c.toJobId)
                  if (!a || !b) return null
                  return (
                    <g key={`d${i}`}>
                      <circle cx={a.x} cy={a.y} r={3.5} fill="var(--bg-2)" stroke={c.color} />
                      <circle cx={b.x} cy={b.y} r={3.5} fill="var(--bg-2)" stroke={c.color} />
                    </g>
                  )
                })}
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
