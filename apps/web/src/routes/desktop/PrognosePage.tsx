import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useLocalStorage, useResizeObserver } from '@mantine/hooks'
import { projectsApi, initProjects } from '../../api/projects'
import { articlesApi, initArticles } from '../../api/articles'
import { machinesApi, initMachines } from '../../api/machines'
import {
  buildStapItems, berekenGhostBelasting, machineLoadInRange, ghostLoadInRange,
  getWindowStart, prognoseTotalDays, toDateStr, dateForDayIndex, weekNrForIdx, fmtDayShort,
  EFFECTIEVE_MIN,
} from '../../utils/planningGanttUtils'
import { PrognoseHeatmap } from '../../components/planning-gantt/PrognoseHeatmap'
import { PrognoseBars } from '../../components/planning-gantt/PrognoseBars'

type Granularity = 'day' | 'week' | 'month'

// "Dag" view uses fixed 50×50 square columns (one per calendar day, like a
// contribution-graph cell) — however many fit the viewport are visible, the
// rest of the ~300-day rolling horizon scrolls.
const DAY_COL_W = 50

// Shared column geometry — the heatmap and the bar chart both use this, so
// scrolling either one keeps the same day lined up in both. colWidth is a
// floor, not a fixed size: PrognosePage stretches it to fill the available
// width when there are few columns (week/month), so those views don't sit
// in a narrow strip with dead space to the right.
//
// LABEL_W is kept identical for both charts on purpose: equal first-column
// width means a heatmap column sits exactly above the matching bar column,
// so the linked scroll lets you read the two charts as one. The bar chart's
// axis only needs ~60px for "0 u"/capacity text, but it inherits this width
// to preserve that alignment; long machine names in the heatmap ellipsize
// (full name on hover) rather than forcing the column wider.
const MIN_COL_W = 44
export const LABEL_W = 128

// Vertical sizing — the heatmap always shows every machine row at full
// height (never scrolls internally); the bar chart is what shrinks to make
// the two fit the viewport without an outer scrollbar — see the
// rowHeight/chartHeight calc below.
const ROW_H = 50
// The heatmap's own sticky column-header row (.prog-hm-corner/.prog-hm-colhd
// in planning-gantt.css) — must be added on top of the machine rows when
// sizing the wrap's max-height. Omitting it made the wrap's content exactly
// HEADER_H taller than its max-height, forcing a permanent vertical
// scrollbar that ate into the wrap's width and gave the heatmap horizontal
// scroll room the bar chart below it didn't have — since the two wraps'
// scrollLeft are kept in sync (see onHeatmapScroll/onBarsScroll), that
// mismatch desynced them: scrolling the heatmap slid its columns while the
// bar chart (which had nowhere to scroll) stayed pinned.
const HEADER_H = 28
// The bar chart's absolute floor — just enough room for the axis labels and
// a sliver of bar. chartHeight below gives the heatmap's full row stack
// priority over a comfortable chart height: only once the chart is already
// at this floor and the heatmap *still* doesn't fit does the page fall back
// to its own overflow:auto (see areaRef in the JSX), at which point no
// amount of chart-shrinking would have helped anyway.
const MIN_CHART_H = 48
const MAX_CHART_H = 320
// Everything in the charts column besides the heatmap's row stack and the
// bar chart's column height: both section titles, the bar legend, the gap
// between the two sections, and each wrap's own chrome (borders/header row/
// axis-label row — see .prog-hm-wrap/.prog-bars-wrap in
// planning-gantt.css). Approximate, not pixel-exact; each wrap keeps its own
// overflow:auto as a fallback if this under-estimates.
const CHARTS_FIXED_OVERHEAD = 166

interface Period { label: string; startDay: number; endDay: number; weekStart: number; weekEnd: number }

// Monthly buckets are derived from the same per-week ghost map the board
// uses, so a week is wholly attributed to the month its first day falls in —
// a minor approximation at month boundaries, consistent with the ghost map
// itself already being an estimate (see berekenGhostBelasting). Day buckets
// reuse that same per-week ghost figure for every day in the week, for the
// same reason. Weekends are included throughout — this shop schedules
// weekend work too, so every calendar day counts the same.
function buildPeriods(granularity: Granularity, windowStart: Date, totalDays: number): Period[] {
  if (granularity === 'day') {
    const days: Period[] = []
    for (let d = 0; d < totalDays; d++) {
      const week = Math.floor(d / 7)
      days.push({ label: fmtDayShort(d, windowStart), startDay: d, endDay: d + 1, weekStart: week, weekEnd: week + 1 })
    }
    return days
  }
  if (granularity === 'week') {
    const weeks = totalDays / 7
    return Array.from({ length: weeks }, (_, w) => ({
      label: `wk ${weekNrForIdx(w * 7, windowStart)}`,
      startDay: w * 7, endDay: w * 7 + 7, weekStart: w, weekEnd: w + 1,
    }))
  }
  const periods: Period[] = []
  for (let d = 0; d < totalDays; d++) {
    const date = dateForDayIndex(d, windowStart)
    const key = `${date.getFullYear()}-${date.getMonth()}`
    const last = periods[periods.length - 1] as (Period & { key: string }) | undefined
    if (last && last.key === key) {
      last.endDay = d + 1
    } else {
      const label = date.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })
      periods.push(Object.assign({ label, startDay: d, endDay: d + 1, weekStart: 0, weekEnd: 0 }, { key }))
    }
  }
  return periods.map(p => ({ ...p, weekStart: Math.floor(p.startDay / 7), weekEnd: Math.ceil(p.endDay / 7) }))
}

// Effective capacity (hours) for a period — every calendar day counts
// equally now (weekend work included), so this is just day-count * rate.
function avgCapacityHours(periods: Period[]): number {
  if (periods.length === 0) return 0
  const totalDays = periods.reduce((s, p) => s + (p.endDay - p.startDay), 0)
  return (totalDays / periods.length) * EFFECTIEVE_MIN / 60
}

export function PrognosePage() {
  const [rev, setRev] = useState(0)
  const bump = () => setRev(r => r + 1)
  useEffect(() => {
    Promise.all([initProjects(), initArticles(), initMachines()]).then(bump)
  }, [])

  const [granularity, setGranularity] = useLocalStorage<Granularity>({ key: 'sm_prognose_gran', defaultValue: 'week' })

  const [windowStart, setWindowStart] = useState(getWindowStart)
  const [today, setToday] = useState(() => toDateStr(new Date()))
  useEffect(() => {
    const id = window.setInterval(() => {
      const fresh = getWindowStart()
      if (toDateStr(fresh) !== toDateStr(windowStart)) setWindowStart(fresh)
      const freshToday = toDateStr(new Date())
      if (freshToday !== today) setToday(freshToday)
    }, 60_000)
    return () => window.clearInterval(id)
  }, [windowStart, today])

  // The chart's far edge always reaches at least 300 days past "today" —
  // recomputed from `today` (not just `windowStart`, which only moves
  // weekly) so the horizon keeps sliding forward instead of going stale.
  const totalDays = useMemo(
    () => prognoseTotalDays(windowStart, new Date(today + 'T00:00:00')),
    [windowStart, today],
  )

  // Linked horizontal scroll — the heatmap and the bar chart share the same
  // column width, so keeping their scrollLeft in sync keeps every day
  // aligned between the two.
  const heatmapScrollRef = useRef<HTMLDivElement>(null)
  const barsScrollRef = useRef<HTMLDivElement>(null)
  const isSyncingScroll = useRef(false)
  function onHeatmapScroll() {
    if (isSyncingScroll.current) return
    isSyncingScroll.current = true
    if (barsScrollRef.current && heatmapScrollRef.current) barsScrollRef.current.scrollLeft = heatmapScrollRef.current.scrollLeft
    isSyncingScroll.current = false
  }
  function onBarsScroll() {
    if (isSyncingScroll.current) return
    isSyncingScroll.current = true
    if (heatmapScrollRef.current && barsScrollRef.current) heatmapScrollRef.current.scrollLeft = barsScrollRef.current.scrollLeft
    isSyncingScroll.current = false
  }

  // colWidth stretches to fill the available width when there are few
  // columns (week/month) and falls back to MIN_COL_W (with horizontal
  // scroll) once columns no longer fit — see chartsRef below.
  const [chartsRef, chartsRect] = useResizeObserver<HTMLDivElement>()
  // Measures the scrollable content wrapper itself (not chartsRef, whose own
  // height grows with its content) — that wrapper is sized by flex:1 within
  // a height:100% column, so its rect height is the true available space,
  // independent of whether its content currently overflows it.
  const [areaRef, areaRect] = useResizeObserver<HTMLDivElement>()

  const projects = projectsApi.list()
  const articles = articlesApi.list()
  const machines = machinesApi.listSync()

  const allItems = useMemo(
    () => buildStapItems(projects, articles, { includeDone: true }),
    [projects, articles, rev],
  )
  const ghostMap = useMemo(
    () => berekenGhostBelasting(projects, articles, machines, windowStart, totalDays),
    [projects, articles, machines, windowStart, totalDays],
  )
  const periods = useMemo(() => buildPeriods(granularity, windowStart, totalDays), [granularity, windowStart, totalDays])
  const colWidth = useMemo(() => {
    // Day view: fixed square columns (matches the heatmap's fixed square row
    // height) so each day reads as a calendar-style cell — however many fit
    // the viewport are visible, the rest scrolls (see DAY_COL_W).
    if (granularity === 'day') return DAY_COL_W
    // Week/month: stretch to fill the available width when there are few
    // columns, falling back to MIN_COL_W (with horizontal scroll) once
    // columns no longer fit — see chartsRef below.
    const availW = Math.max(chartsRect.width - LABEL_W, 0)
    if (availW === 0 || periods.length === 0) return MIN_COL_W
    return Math.max(MIN_COL_W, Math.floor(availW / periods.length))
  }, [chartsRect.width, periods.length, granularity])
  const { heatmapMaxHeight, chartHeight } = useMemo(() => {
    // Heatmap always gets every machine row at full height — it never
    // scrolls internally. The bar chart absorbs whatever's left of the
    // available space, shrinking down to MIN_CHART_H before the page falls
    // back to its own overflow:auto (only reachable with far more machines
    // than the screen has room for).
    const heatmapHeight = Math.max(machines.length, 1) * ROW_H + HEADER_H
    const available = areaRect.height - CHARTS_FIXED_OVERHEAD
    const remainingForChart = available - heatmapHeight
    const chartHeight = remainingForChart >= MAX_CHART_H ? MAX_CHART_H : Math.max(MIN_CHART_H, remainingForChart)
    return { heatmapMaxHeight: heatmapHeight, chartHeight }
  }, [areaRect.height, machines.length])
  const capacityHours = useMemo(() => Math.round(avgCapacityHours(periods) * 10) / 10, [periods])
  const capacityPerPeriod = useMemo(
    () => periods.map(p => (p.endDay - p.startDay) * EFFECTIEVE_MIN / 60),
    [periods],
  )

  const data = useMemo(() => periods.map(p => {
    const row: Record<string, string | number> = { period: p.label }
    for (const m of machines) {
      const planned = machineLoadInRange(allItems, m.name, p.startDay, p.endDay, windowStart) / 60
      const outstanding = ghostLoadInRange(ghostMap, m.name, p.weekStart, p.weekEnd) / 60
      row[`${m.name}__total`] = Math.round((planned + outstanding) * 10) / 10
    }
    return row
  }), [periods, machines, allItems, ghostMap, windowStart])

  return (
    <div className="pg-root plan">
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Prognose</div>
          <div className="st-page-sub">Werklast per machine — ingepland + nog uitstaand uit open offertes</div>
        </div>
      </div>

      <div className="plan-toolbar">
        <div className="seg" role="tablist">
          <button data-active={granularity === 'day'} onClick={() => setGranularity('day')}>Dag</button>
          <button data-active={granularity === 'week'} onClick={() => setGranularity('week')}>Week</button>
          <button data-active={granularity === 'month'} onClick={() => setGranularity('month')}>Maand</button>
        </div>
      </div>

      <div ref={areaRef as RefObject<HTMLDivElement>} style={{ padding: '0 24px 24px', flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {machines.length === 0 ? (
          <div className="st-empty">Geen machines ingericht — voeg machines toe via Instellingen → Bedrijfskosten.</div>
        ) : (
          <div ref={chartsRef as RefObject<HTMLDivElement>} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Overzicht — bezetting % per machine</div>
            <PrognoseHeatmap
              machines={machines} periods={periods} data={data} capacityPerPeriod={capacityPerPeriod}
              colWidth={colWidth} labelWidth={LABEL_W} rowHeight={ROW_H} maxHeight={heatmapMaxHeight}
              scrollRef={heatmapScrollRef} onScroll={onHeatmapScroll}
            />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Werklast per machine (gepland + prognose)</div>
            <PrognoseBars
              machines={machines} periods={periods} data={data} capacityHours={capacityHours}
              colWidth={colWidth} labelWidth={LABEL_W} chartHeight={chartHeight}
              scrollRef={barsScrollRef} onScroll={onBarsScroll}
            />
          </div>
          </div>
        )}
      </div>
    </div>
  )
}
