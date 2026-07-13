import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, MutableRefObject } from 'react'
import { IconCpu } from '@tabler/icons-react'
import type { Relatie } from '@stockmanager/shared'
import type { Machine } from '../../api/machines'
import type { Article } from '../../api/articles'
import {
  type PlanningStapItem,
  computeKanbanLayout, projectKleur, minToUren, fmtDayShort, weekNrForIdx,
  todayIndex, dateStrForDayIndex, EFFECTIEVE_MIN,
  RULER_H, LABEL_W, COL_W, CARD_H, CARD_GAP, CELL_PAD, MIN_ROW, WEEKS,
} from '../../utils/planningKanbanUtils'
import type { SelStyle } from './KanbanToolbar'
import { KanbanDayRow } from './KanbanDayRow'
import { KanbanMinimap, type MinimapMetrics } from './KanbanMinimap'

export interface KanbanScrollApi { toToday: () => void }

interface ConnPoint { vol: number; x: number; y: number }
interface DropCell { day: number; m: string }

interface KanbanBoardProps {
  scheduledItems: PlanningStapItem[]
  machines: Machine[]
  articles: Article[]
  relaties: Relatie[]
  windowStart: Date
  selStyle: SelStyle
  selectedId: string | null
  selectedOrderId: string | null
  onSelect: (item: PlanningStapItem) => void
  draggingItem: PlanningStapItem | null
  onDragStart: (e: DragEvent, item: PlanningStapItem) => void
  onDragEnd: () => void
  onDrop: (item: PlanningStapItem, machineNaam: string, geplandDatum: string) => void
  scrollApiRef: MutableRefObject<KanbanScrollApi | null>
}

export function KanbanBoard({
  scheduledItems, machines, articles, relaties, windowStart, selStyle,
  selectedId, selectedOrderId, onSelect,
  draggingItem, onDragStart, onDragEnd, onDrop, scrollApiRef,
}: KanbanBoardProps) {
  const dimOthers = selStyle === 'dimmen' || selStyle === 'lijnen'
  const ringLinked = selStyle === 'markeren' || selStyle === 'lijnen'
  const todayIdx = todayIndex(windowStart)

  const layout = useMemo(() => computeKanbanLayout(scheduledItems, machines, windowStart), [scheduledItems, machines, windowStart])

  const scrollRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const miniRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState<MinimapMetrics>({ scrollTop: 0, viewH: 0, scrollH: 0, miniH: 0 })
  const [dropCell, setDropCell] = useState<DropCell | null>(null)
  const [conn, setConn] = useState<ConnPoint[] | null>(null)
  const didInit = useRef(false)

  const measure = useCallback(() => {
    const s = scrollRef.current, m = miniRef.current
    if (!s || !m) return
    setMetrics({ scrollTop: s.scrollTop, viewH: s.clientHeight, scrollH: s.scrollHeight, miniH: m.clientHeight })
  }, [])

  useEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (scrollRef.current) ro.observe(scrollRef.current)
    if (miniRef.current) ro.observe(miniRef.current)
    return () => ro.disconnect()
  }, [measure])

  useEffect(() => {
    const id = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(id)
  }, [layout, measure])

  useEffect(() => {
    if (didInit.current || !scrollRef.current || layout.totalAbs < 10) return
    didInit.current = true
    scrollRef.current.scrollTop = Math.max(0, layout.todayAbs - RULER_H - 70)
    requestAnimationFrame(measure)
  }, [layout, measure])

  useEffect(() => {
    scrollApiRef.current = {
      toToday: () => {
        scrollRef.current?.scrollTo({ top: Math.max(0, layout.todayAbs - RULER_H - 70), behavior: 'smooth' })
      },
    }
  }, [layout, scrollApiRef])

  // Bezier connector overlay (selStyle = 'lijnen'): measure the selected
  // order's board cards relative to the (also-scrolled) board-inner element,
  // so the rect difference stays scroll-position-invariant.
  useEffect(() => {
    if (!selectedOrderId || selStyle !== 'lijnen') { setConn(null); return }
    const inner = innerRef.current
    if (!inner) { setConn(null); return }
    const base = inner.getBoundingClientRect()
    const sel = CSS.escape(selectedOrderId)
    const els = Array.from(inner.querySelectorAll<HTMLElement>(`.kb-cell .kc[data-order-id="${sel}"]`))
    if (els.length < 1) { setConn(null); return }
    const pts = els
      .map(el => {
        const r = el.getBoundingClientRect()
        return { vol: Number(el.dataset.vol), x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 }
      })
      .sort((a, b) => a.vol - b.vol)
    setConn(pts)
  }, [selectedOrderId, selStyle, layout, metrics.scrollH, metrics.viewH])

  function onScroll() {
    if (scrollRef.current) setMetrics(m => ({ ...m, scrollTop: scrollRef.current!.scrollTop }))
  }
  function scrollTo(top: number) {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, Math.min(top, layout.totalAbs))
  }

  function onCellDragOver(e: DragEvent, dayIdx: number, machineNaam: string) {
    if (!draggingItem) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropCell(prev => (!prev || prev.day !== dayIdx || prev.m !== machineNaam) ? { day: dayIdx, m: machineNaam } : prev)
  }
  function onCellDragLeave(e: DragEvent, dayIdx: number, machineNaam: string) {
    if (e.currentTarget === e.target && dropCell?.day === dayIdx && dropCell.m === machineNaam) setDropCell(null)
  }
  function onCellDrop(e: DragEvent, dayIdx: number, machineNaam: string) {
    e.preventDefault()
    setDropCell(null)
    if (draggingItem) onDrop(draggingItem, machineNaam, dateStrForDayIndex(dayIdx, windowStart))
  }
  useEffect(() => { if (!draggingItem) setDropCell(null) }, [draggingItem])

  const styleVars = {
    '--label-w': `${LABEL_W}px`, '--col-w': `${COL_W}px`, '--ruler-h': `${RULER_H}px`,
    '--min-row': `${MIN_ROW}px`, '--card-h': `${CARD_H}px`, '--card-gap': `${CARD_GAP}px`, '--cell-pad': `${CELL_PAD}px`,
    '--machine-count': Math.max(machines.length, 1),
  } as CSSProperties

  return (
    <div className="kb-board-area">
      <div className="kb-board-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="kb-board kb-board-inner" style={styleVars} ref={innerRef}>
          <div className="kb-ruler">
            <div className="kb-ruler-corner">
              <span className="t">Dag / machine</span>
              <span className="s">{WEEKS} wk vooruit</span>
            </div>
            {machines.map(m => (
              <div key={m.id} className="kb-mhead">
                <div className="kb-mhead-top">
                  <span className="ico"><IconCpu size={13} /></span>
                  <span className="nm">{m.name}</span>
                </div>
                <span className="sb">€ {m.machineRatePerHour.toFixed(2)} / u</span>
                <span className="cap">{minToUren(EFFECTIEVE_MIN)}/dag</span>
              </div>
            ))}
          </div>

          {Array.from({ length: WEEKS }, (_, w) => {
            const firstDay = w * 7
            return (
              <Fragment key={w}>
                <div className="kb-weekrow">
                  <div className="kb-weekband"><span className="wk">wk {weekNrForIdx(firstDay, windowStart)}</span></div>
                  <div className="fill" style={{ paddingLeft: 14 }}>
                    <span className="rng" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {fmtDayShort(firstDay, windowStart)} – {fmtDayShort(firstDay + 6, windowStart)}
                    </span>
                  </div>
                </div>
                {[0, 1, 2, 3, 4, 5, 6].map(dd => {
                  const dayIdx = firstDay + dd
                  return (
                    <KanbanDayRow
                      key={dayIdx} dayIdx={dayIdx} isToday={dayIdx === todayIdx}
                      layout={layout} machines={machines} articles={articles} relaties={relaties} windowStart={windowStart}
                      dimOthers={dimOthers} ringLinked={ringLinked}
                      selectedId={selectedId} selectedOrderId={selectedOrderId} onSelect={onSelect}
                      onDragStart={onDragStart} onDragEnd={onDragEnd}
                      dropCell={dropCell} onCellDragOver={onCellDragOver} onCellDragLeave={onCellDragLeave} onCellDrop={onCellDrop}
                    />
                  )
                })}
              </Fragment>
            )
          })}

          {conn && conn.length > 0 && (() => {
            const color = projectKleur(selectedOrderId!)
            let d = `M ${conn[0].x.toFixed(1)},${conn[0].y.toFixed(1)}`
            for (let i = 1; i < conn.length; i++) {
              const a = conn[i - 1], b = conn[i]
              const cx = Math.max(46, Math.abs(b.x - a.x) * 0.45)
              d += ` C ${(a.x + cx).toFixed(1)},${a.y.toFixed(1)} ${(b.x - cx).toFixed(1)},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`
            }
            return (
              <svg className="kb-connectors" style={{ color } as CSSProperties}>
                <path className="base" d={d} stroke={color} />
                <path className="flow" d={d} stroke={color} />
                {conn.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={i === 0 || i === conn.length - 1 ? 4.5 : 3.5} fill={color} />
                ))}
              </svg>
            )
          })()}
        </div>
      </div>

      <KanbanMinimap layout={layout} machines={machines} metrics={metrics} miniRef={miniRef} onScrollTo={scrollTo} />
    </div>
  )
}
