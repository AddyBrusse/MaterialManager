import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { IconLink, IconAlertTriangle, IconLock } from '@tabler/icons-react'
import type { Machine } from '../../api/machines'
import { todayIndex } from '../../utils/planningGanttUtils'
import { toDateStr } from '../../utils/planningUtils'
import {
  type QueueJob, type DerivedSlot, type Connector,
  QUEUE_DAY_WIDTH, QUEUE_VISIBLE_DAYS, QUEUE_LABEL_WIDTH, QUEUE_ROW_HEIGHT, QUEUE_HEADER_HEIGHT, QUEUE_PAST_DAYS,
  type QueueZoom, fmtOffsetDay, isWeekendOffset, isAtRisk, getGroupInfo, machineAccentColor, dateForOffset,
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
  onDeselect: () => void
}

interface NodeLayout { job: QueueJob; slot: DerivedSlot; left: number; width: number; ghostLeft: number; ghostWidth: number; rowIndex: number }
interface NodeCenter { x: number; xLeft: number; xRight: number; y: number }
interface TipState { job: QueueJob; slot: DerivedSlot; risk: boolean; required?: string; anchorLeft: number; anchorTop: number; anchorBottom: number }

// v2 restyle — strip the ORD-/PROD- prefix; append the customer's first
// name (3 letters) only when the block is wide enough to show it.
function blockLabel(orderId: string, klant: string, width: number): string {
  const shortId = orderId.replace(/^ORD-/, '').replace(/^PROD-/, '')
  if (width < 90) return shortId
  const initials = (klant || '').split(' ')[0].slice(0, 3)
  return initials ? `${shortId} · ${initials}` : shortId
}

// The project is only "done" once every one of its still-open steps —
// across every order/part it contains, not just the hovered one — is
// finished. So the project's expected delivery is the LATEST derived finish
// among all its not-yet-ready steps; if any of those isn't queued on a
// machine yet (still in the backlog), there isn't a real answer yet.
function projectExpectedFinish(
  projectId: string, allJobs: QueueJob[], schedule: Map<string, DerivedSlot>, windowStart: Date,
): string | null {
  const openSteps = allJobs.filter(j => j.item.project.id === projectId && !j.gereed)
  if (openSteps.length === 0) return null
  let maxFinish = -Infinity
  for (const j of openSteps) {
    const slot = schedule.get(j.id)
    if (!slot) return null // not fully ingepland yet — no honest date to give
    if (slot.finishOffsetDays > maxFinish) maxFinish = slot.finishOffsetDays
  }
  return toDateStr(dateForOffset(windowStart, Math.ceil(maxFinish)))
}

export function QueueTimeline({
  rows, schedule, verplichtKlaar, allJobs, zoom, windowStart, connectors, showConnections, onToggleConnections, selectedId, onSelectJob, onDeselect,
}: QueueTimelineProps) {
  const dayWidth = QUEUE_DAY_WIDTH[zoom]
  const pastPx = QUEUE_PAST_DAYS * dayWidth
  const scrollRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<TipState | null>(null)

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
          left: pastPx + slot.startOffsetDays * dayWidth,
          width: Math.max(slot.durationDays * dayWidth, 54),
          ghostLeft: pastPx + slot.ghostOffsetDays * dayWidth,
          ghostWidth: Math.max((slot.finishOffsetDays - slot.startOffsetDays) * dayWidth, 24),
        })
      }
      return { ...r, nodes }
    })
    const centers = new Map<string, NodeCenter>()
    layoutRows.forEach((r, rowIndex) => {
      r.nodes.forEach(n => {
        centers.set(n.job.id, {
          x: n.left + n.width / 2,
          xLeft: n.left,
          xRight: n.left + n.width,
          // rowIndex is relative to this same "position:relative" wrapper
          // (rows start right where it starts, the ruler is a preceding
          // sibling) — adding QUEUE_HEADER_HEIGHT here double-counted the
          // ruler and shifted every connector 30px below its actual block.
          y: rowIndex * QUEUE_ROW_HEIGHT + QUEUE_ROW_HEIGHT / 2,
        })
      })
    })
    return { totalDays: Math.ceil(maxFinish) + 3, layoutRows, centers }
  }, [rows, dayWidth, schedule, pastPx])

  const trackW = (totalDays + QUEUE_PAST_DAYS) * dayWidth
  const totalH = QUEUE_HEADER_HEIGHT + layoutRows.length * QUEUE_ROW_HEIGHT
  const todayPx = pastPx + todayIndex(windowStart) * dayWidth

  // Only the selected block's own order's chain — otherwise every order's
  // cross-machine links draw at once and it reads as clutter, not a trace.
  const visibleConnectors = useMemo(() => {
    if (!selectedId) return []
    const selectedOrderId = allJobs.find(j => j.id === selectedId)?.orderId
    if (!selectedOrderId) return []
    return connectors.filter(c => c.orderId === selectedOrderId)
  }, [connectors, selectedId, allJobs])

  // Opens scrolled to "today" (with a little run-up for context) rather than
  // the far past — the extra days behind it are there to scroll back into.
  // useLayoutEffect + a direct scrollLeft assignment (not scrollTo, which can
  // animate/queue) so this is applied before the browser paints — otherwise
  // the very first frame briefly shows scrollLeft 0, i.e. two months in the
  // past, which reads as "today" being in the wrong place entirely.
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, todayPx - 220)
  }, [dayWidth])

  return (
    <div className="wq-timeline-col">
      <div className="wq-tl-head">
        <span className="t">Tijdlijn</span>
        <button className="tgl" data-on={showConnections} onClick={onToggleConnections}>
          <IconLink size={13} /> Toon verbindingen
        </button>
      </div>
      <div className="wq-tl-scroll" ref={scrollRef}>
        <div className="wq-tl-inner" style={{ width: QUEUE_LABEL_WIDTH + trackW }}>
          <div className="wq-tl-ruler">
            <div className="wq-tl-corner" />
            {Array.from({ length: totalDays + QUEUE_PAST_DAYS }, (_, i) => i - QUEUE_PAST_DAYS).map(d => (
              <div key={d} className={`wq-tl-day${isWeekendOffset(windowStart, d) ? ' weekend' : ''}`} style={{ width: dayWidth }}>
                {fmtOffsetDay(windowStart, d)}
              </div>
            ))}
          </div>

          <div
            style={{ position: 'relative' }}
            onClick={e => { if (!(e.target as HTMLElement).closest('.node')) onDeselect() }}
          >
            {layoutRows.map(r => (
              <div key={r.machine.id} className="wq-tl-row">
                <div className="wq-tl-label">
                  <div className="wq-tl-label-top">
                    <span className="sw" style={{ background: machineAccentColor(r.machine.name, r.machine.id) }} />
                    <span className="nm">{r.machine.name}</span>
                  </div>
                  <div className="bezetting-bar">
                    <i style={{ width: `${Math.min(100, r.bezettingPct)}%`, background: machineAccentColor(r.machine.name, r.machine.id) }} />
                  </div>
                  <span className="pct">bezetting {r.bezettingPct}%</span>
                </div>
                <div className="wq-tl-lane" style={{ width: trackW }}>
                  {Array.from({ length: totalDays + QUEUE_PAST_DAYS }, (_, i) => i - QUEUE_PAST_DAYS).map(d => (
                    isWeekendOffset(windowStart, d) && (
                      <div key={d} className="wq-tl-daycol weekend" style={{ left: pastPx + d * dayWidth, width: dayWidth }} />
                    )
                  ))}
                  {r.nodes.map(n => {
                    const risk = isAtRisk(n.job, n.slot, verplichtKlaar, windowStart)
                    const group = getGroupInfo(n.job, allJobs)
                    const accent = machineAccentColor(r.machine.name, r.machine.id)
                    // Doc-spec formula: lock glyph centered in the gap between
                    // the ghost's right edge and the real block's left edge.
                    const lockLeft = n.ghostLeft + n.ghostWidth + (n.left - (n.ghostLeft + n.ghostWidth)) / 2 - 6
                    return (
                      <div key={n.job.id}>
                        {n.slot.heldByNotBefore && (
                          <>
                            <div
                              className="node placeholder"
                              style={{ left: n.ghostLeft, width: n.ghostWidth, top: 19, height: 30, borderRadius: 0, border: '1.5px dashed #d4d7da', background: 'transparent', zIndex: 0, pointerEvents: 'none' }}
                            />
                            <div style={{ position: 'absolute', left: lockLeft, top: 32, width: 14, height: 14, color: '#909499', zIndex: 0, pointerEvents: 'none' }}>
                              <IconLock size={14} />
                            </div>
                          </>
                        )}
                        <div
                          className={`node${selectedId === n.job.id ? ' is-selected' : ''}${group ? ' proj-linked' : ''}`}
                          style={{
                            left: n.left, width: n.width, top: 19, height: 30,
                            '--c': accent,
                            background: '#ffffff',
                            color: '#3a3d40',
                            fontSize: 10.5,
                            fontWeight: 500,
                            borderRadius: 0,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            border: '1px solid #e2e4e6',
                            borderLeft: `3px solid ${accent}`,
                            zIndex: 1,
                          } as CSSProperties}
                          onClick={() => onSelectJob(n.job)}
                          onMouseEnter={e => {
                            const r = e.currentTarget.getBoundingClientRect()
                            setTip({ job: n.job, slot: n.slot, risk, required: verplichtKlaar.get(n.job.id), anchorLeft: r.left, anchorTop: r.top, anchorBottom: r.bottom })
                          }}
                          onMouseLeave={() => setTip(null)}
                        >
                          {group && <IconLink size={10} stroke={2.5} style={{ color: '#c2703d' }} />}
                          {risk && <IconAlertTriangle size={10} stroke={2.2} style={{ color: '#c25c5c' }} />}
                          <span className="nname" style={{ color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit' }}>{blockLabel(n.job.orderId, n.job.klant, n.width)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            <div className="wq-today-line" style={{ left: QUEUE_LABEL_WIDTH + todayPx, top: 0, height: totalH - QUEUE_HEADER_HEIGHT }}>
              <span className="tag">nu</span>
            </div>

            {showConnections && visibleConnectors.length > 0 && (
              <svg className="gantt-connectors" style={{ left: QUEUE_LABEL_WIDTH, top: 0, width: trackW, height: totalH }}>
                {visibleConnectors.map((c, i) => {
                  const a = centers.get(c.fromJobId)
                  const b = centers.get(c.toJobId)
                  if (!a || !b) return null
                  const midX = (a.xRight + b.xLeft) / 2
                  return (
                    <path
                      key={i}
                      d={`M ${a.xRight} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.xLeft} ${b.y}`}
                      stroke={c.color} strokeDasharray="4 4"
                    />
                  )
                })}
                {visibleConnectors.map((c, i) => {
                  const a = centers.get(c.fromJobId)
                  const b = centers.get(c.toJobId)
                  if (!a || !b) return null
                  return (
                    <g key={`d${i}`}>
                      <circle cx={a.xRight} cy={a.y} r={3.5} fill="var(--bg-2)" stroke={c.color} />
                      <circle cx={b.xLeft} cy={b.y} r={3.5} fill="var(--bg-2)" stroke={c.color} />
                    </g>
                  )
                })}
              </svg>
            )}
          </div>
        </div>
      </div>

      {tip && (() => {
        const TIP_W = 300
        const EST_H = 220
        const left = Math.max(8, Math.min(tip.anchorLeft, window.innerWidth - TIP_W - 8))
        // flip above the block if it would overflow the bottom of the viewport
        const below = tip.anchorBottom + EST_H + 10 <= window.innerHeight
        const top = below ? tip.anchorBottom + 8 : tip.anchorTop - EST_H - 8
        const { qty, eenheid } = tip.job.item.order
        const stepFinish = toDateStr(dateForOffset(windowStart, Math.ceil(tip.slot.finishOffsetDays)))
        const projectFinish = projectExpectedFinish(tip.job.item.project.id, allJobs, schedule, windowStart)
        return (
          <div className="wq-tip" style={{ left, top, width: TIP_W }}>
            <div className="wq-tip-head">
              <span className="wq-tip-title">{tip.job.orderId}</span>
              <span className={`wq-tip-status ${tip.risk ? 'late' : 'ok'}`}>{tip.risk ? 'Te laat' : 'Op tijd'}</span>
            </div>
            <div className="wq-tip-row"><span className="k">Klant</span><span className="v">{tip.job.klant}</span></div>
            <div className="wq-tip-row"><span className="k">Omschrijving</span><span className="v">{tip.job.artikel}</span></div>
            <div className="wq-tip-row"><span className="k">Tekening</span><span className="v">{tip.job.tekening ?? '—'}</span></div>
            <div className="wq-tip-row"><span className="k">Aantal</span><span className="v">{qty} {eenheid}</span></div>
            <div className="wq-tip-row"><span className="k">Verwacht klaar (stap)</span><span className="v">{stepFinish}</span></div>
            <div className="wq-tip-row"><span className="k">Verwacht klaar (project)</span><span className="v">{projectFinish ?? 'nog niet volledig ingepland'}</span></div>
            <div className="wq-tip-row"><span className="k">Deadline</span><span className="v">{tip.job.deadline ?? '—'}</span></div>
            {tip.required && <div className="wq-tip-row"><span className="k">Moet klaar</span><span className="v">{tip.required}</span></div>}
          </div>
        )
      })()}
    </div>
  )
}
