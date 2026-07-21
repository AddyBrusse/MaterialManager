import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { IconLink, IconAlertTriangle, IconLock } from '@tabler/icons-react'
import type { Machine } from '../../api/machines'
import { todayIndex } from '../../utils/planningSharedUtils'
import { toDateStr } from '../../utils/planningUtils'
import {
  type QueueJob, type DerivedSlot, type Connector,
  QUEUE_DAY_WIDTH, QUEUE_VISIBLE_DAYS, QUEUE_LABEL_WIDTH, QUEUE_ROW_HEIGHT, QUEUE_HEADER_HEIGHT, QUEUE_PAST_DAYS,
  type QueueZoom, fmtOffsetDay, isWeekendOffset, isAtRisk, getGroupInfo, machineAccentColor, dateForOffset, dayOffsetForDateStr, shortOrderId, fmtDateWithWeekday,
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

// A machine can only run one job at a time — deriveShopSchedule (see
// planningQueueUtils.ts) guarantees two jobs queued on the same machine never
// derive overlapping time ranges, so a single lane per row is always enough;
// no lane-stacking needed here. Centered in the 68px row: (68-60)/2 = 4.
const NODE_H = 60
const NODE_TOP = (QUEUE_ROW_HEIGHT - NODE_H) / 2

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

// Signed day gap between a target ("moet klaar" / deadline) and an actual
// expected-finish date, both as 'YYYY-MM-DD' strings — positive means the
// finish lands BEFORE the target (margin, shown green), negative means it
// lands after (late, shown red). windowStart is just a shared reference
// point for the day-offset subtraction; any consistent date cancels out.
function dayDelta(targetStr: string, finishStr: string, windowStart: Date): number {
  return dayOffsetForDateStr(targetStr, windowStart) - dayOffsetForDateStr(finishStr, windowStart)
}

function deltaLabel(delta: number): string {
  if (delta > 0) return `+${delta}d`
  if (delta < 0) return `${delta}d`
  return '0d'
}

export function QueueTimeline({
  rows, schedule, verplichtKlaar, allJobs, zoom, windowStart, connectors, showConnections, onToggleConnections, selectedId, onSelectJob, onDeselect,
}: QueueTimelineProps) {
  const dayWidth = QUEUE_DAY_WIDTH[zoom]
  const pastPx = QUEUE_PAST_DAYS * dayWidth
  const scrollRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<TipState | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null)

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
          width: slot.durationDays * dayWidth,
          ghostLeft: pastPx + slot.ghostOffsetDays * dayWidth,
          ghostWidth: Math.max((slot.finishOffsetDays - slot.startOffsetDays) * dayWidth, 24),
        })
      }
      // A very short job's real duration can render narrower than is legible,
      // so it gets padded out to a minimum width — but a machine queue is
      // packed back-to-back with zero gap between jobs (see deriveShopSchedule),
      // so padding purely for legibility would routinely paint a short job's
      // box on top of the very next one. nodes is already left-to-right order
      // (same-machine jobs are scheduled in non-decreasing start order), so
      // the padding is capped to the gap actually available before the next
      // job — full 54px when there's room (end of queue, a weekend/notBefore
      // gap), otherwise only as much as it can take without encroaching.
      nodes.forEach((n, i) => {
        const next = nodes[i + 1]
        const room = next ? next.left - n.left : Infinity
        n.width = Math.min(Math.max(n.width, 54), room)
      })
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

  // The tip's width is intrinsic (fits its content on one line, see the CSS)
  // rather than a fixed guess, so its on-screen position can only be clamped
  // AFTER it has actually rendered and been measured. useLayoutEffect (not
  // useEffect) so this correction lands before the browser paints — the tip
  // is first rendered at its naive anchor position (see tipPos ?? fallback
  // below), and this immediately overwrites that with the clamped one in the
  // same paint, so there's no visible jump.
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) { setTipPos(null); return }
    const el = tipRef.current
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = Math.max(8, Math.min(tip.anchorLeft, window.innerWidth - w - 8))
    const below = tip.anchorBottom + h + 10 <= window.innerHeight
    const top = below ? tip.anchorBottom + 8 : tip.anchorTop - h - 8
    setTipPos({ left, top })
  }, [tip])

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
                              style={{ left: n.ghostLeft, width: n.ghostWidth, top: NODE_TOP, height: NODE_H, borderRadius: 0, border: '1.5px dashed #d4d7da', background: 'transparent', zIndex: 0, pointerEvents: 'none' }}
                            />
                            <div style={{ position: 'absolute', left: lockLeft, top: NODE_TOP + (NODE_H - 14) / 2, width: 14, height: 14, color: '#909499', zIndex: 0, pointerEvents: 'none' }}>
                              <IconLock size={14} />
                            </div>
                          </>
                        )}
                        <div
                          className={`node${selectedId === n.job.id ? ' is-selected' : ''}${group ? ' proj-linked' : ''}`}
                          style={{
                            left: n.left, width: n.width, top: NODE_TOP, height: NODE_H,
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
                          <span className="node-icons">
                            {group && <IconLink size={11} stroke={2.5} style={{ color: '#c2703d' }} />}
                            {risk && <IconAlertTriangle size={11} stroke={2.2} style={{ color: '#c25c5c' }} />}
                          </span>
                          <span className="node-num">{shortOrderId(n.job.orderId)}</span>
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
        // Naive fallback position for the very first paint (before the
        // layout effect above has measured the tip and clamped it) — same
        // anchor math as that effect's non-flipped case, just without the
        // real height, so it's never far off and never causes a visible jump.
        const left = tipPos?.left ?? tip.anchorLeft
        const top = tipPos?.top ?? tip.anchorBottom + 8
        const { qty, eenheid } = tip.job.item.order
        const stepFinish = toDateStr(dateForOffset(windowStart, Math.ceil(tip.slot.finishOffsetDays)))
        const projectFinish = projectExpectedFinish(tip.job.item.project.id, allJobs, schedule, windowStart)
        // Step and project lateness are genuinely different measurements —
        // the step's target is its own backward-planned verplichtKlaar date,
        // the project's is the project's real deadline — so each gets its
        // own delta against its own target, not a shared calculation.
        const stepDelta = tip.required != null ? dayDelta(tip.required, stepFinish, windowStart) : null
        const projectDelta = projectFinish != null && tip.job.deadline != null
          ? dayDelta(tip.job.deadline, projectFinish, windowStart)
          : null
        return (
          <div className="wq-tip" ref={tipRef} style={{ left, top }}>
            <div className="wq-tip-head">
              <span className="wq-tip-title">{tip.job.orderId}</span>
              <span className={`wq-tip-status ${tip.risk ? 'late' : 'ok'}`}>{tip.risk ? 'Te laat' : 'Op tijd'}</span>
            </div>
            <div className="wq-tip-row"><span className="k">Klant</span><span className="v">{tip.job.klant}</span></div>
            <div className="wq-tip-row"><span className="k">Omschrijving</span><span className="v">{tip.job.artikel}</span></div>
            <div className="wq-tip-row"><span className="k">Tekening</span><span className="v">{tip.job.tekening ?? '—'}</span></div>
            <div className="wq-tip-row"><span className="k">Aantal</span><span className="v">{qty} {eenheid}</span></div>
            <div className="wq-tip-row">
              <span className="k">Verwacht klaar (stap)</span>
              <span className={`v${stepDelta != null ? (stepDelta >= 0 ? ' ahead' : ' late') : ''}`}>
                {fmtDateWithWeekday(stepFinish)}
                {stepDelta != null && <span className="delta">{deltaLabel(stepDelta)}</span>}
              </span>
            </div>
            <div className="wq-tip-row">
              <span className="k">Verwacht klaar (project)</span>
              <span className={`v${projectDelta != null ? (projectDelta >= 0 ? ' ahead' : ' late') : ''}`}>
                {projectFinish ? fmtDateWithWeekday(projectFinish) : 'nog niet volledig ingepland'}
                {projectDelta != null && <span className="delta">{deltaLabel(projectDelta)}</span>}
              </span>
            </div>
            <div className="wq-tip-row"><span className="k">Deadline</span><span className="v">{tip.job.deadline ? fmtDateWithWeekday(tip.job.deadline) : '—'}</span></div>
            {tip.required && <div className="wq-tip-row"><span className="k">Moet klaar</span><span className="v">{fmtDateWithWeekday(tip.required)}</span></div>}
          </div>
        )
      })()}
    </div>
  )
}
