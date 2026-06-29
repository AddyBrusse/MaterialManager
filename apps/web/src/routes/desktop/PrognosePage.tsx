import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocalStorage } from '@mantine/hooks'
import { projectsApi, initProjects } from '../../api/projects'
import { articlesApi, initArticles } from '../../api/articles'
import { machinesApi, initMachines } from '../../api/machines'
import {
  buildStapItems, berekenGhostBelasting, machineLoadInRange, ghostLoadInRange,
  getWindowStart, toDateStr, dateForDayIndex, weekNrForIdx, fmtDayShort, TOTAL_DAYS,
  EFFECTIEVE_MIN,
} from '../../utils/planningGanttUtils'
import { PrognoseHeatmap } from '../../components/planning-gantt/PrognoseHeatmap'
import { PrognoseBars } from '../../components/planning-gantt/PrognoseBars'

type Granularity = 'day' | 'week' | 'month'

// "Dag" zooms in on the near term rather than the full ~9-month window —
// the heatmap/week/month views are for the long-range overview.
const DAY_VIEW_DAYS = 14

// Shared column geometry — the heatmap and the bar chart both use this, so
// scrolling either one keeps the same day lined up in both.
export const COL_W = 44
export const LABEL_W = 160

interface Period { label: string; startDay: number; endDay: number; weekStart: number; weekEnd: number }

// Monthly buckets are derived from the same per-week ghost map the board
// uses, so a week is wholly attributed to the month its first day falls in —
// a minor approximation at month boundaries, consistent with the ghost map
// itself already being an estimate (see berekenGhostBelasting). Day buckets
// reuse that same per-week ghost figure for every day in the week, for the
// same reason. Weekends are included throughout — this shop schedules
// weekend work too, so every calendar day counts the same.
function buildPeriods(granularity: Granularity, windowStart: Date): Period[] {
  if (granularity === 'day') {
    const days: Period[] = []
    for (let d = 0; d < TOTAL_DAYS && days.length < DAY_VIEW_DAYS; d++) {
      const week = Math.floor(d / 7)
      days.push({ label: fmtDayShort(d, windowStart), startDay: d, endDay: d + 1, weekStart: week, weekEnd: week + 1 })
    }
    return days
  }
  if (granularity === 'week') {
    const weeks = TOTAL_DAYS / 7
    return Array.from({ length: weeks }, (_, w) => ({
      label: `wk ${weekNrForIdx(w * 7, windowStart)}`,
      startDay: w * 7, endDay: w * 7 + 7, weekStart: w, weekEnd: w + 1,
    }))
  }
  const periods: Period[] = []
  for (let d = 0; d < TOTAL_DAYS; d++) {
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
  useEffect(() => {
    const id = window.setInterval(() => {
      const fresh = getWindowStart()
      if (toDateStr(fresh) !== toDateStr(windowStart)) setWindowStart(fresh)
    }, 60_000)
    return () => window.clearInterval(id)
  }, [windowStart])

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

  const projects = projectsApi.list()
  const articles = articlesApi.list()
  const machines = machinesApi.listSync()

  const allItems = useMemo(
    () => buildStapItems(projects, articles, { includeDone: true }),
    [projects, articles, rev],
  )
  const ghostMap = useMemo(
    () => berekenGhostBelasting(projects, articles, machines, windowStart),
    [projects, articles, machines, windowStart],
  )
  const periods = useMemo(() => buildPeriods(granularity, windowStart), [granularity, windowStart])
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

      <div style={{ padding: '0 24px 24px', flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {machines.length === 0 ? (
          <div className="st-empty">Geen machines ingericht — voeg machines toe via Instellingen → Bedrijfskosten.</div>
        ) : (
          <>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Overzicht — bezetting % per machine</div>
            <PrognoseHeatmap
              machines={machines} periods={periods} data={data} capacityPerPeriod={capacityPerPeriod}
              colWidth={COL_W} labelWidth={LABEL_W} scrollRef={heatmapScrollRef} onScroll={onHeatmapScroll}
            />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Werklast per machine (gepland + prognose)</div>
            <PrognoseBars
              machines={machines} periods={periods} data={data} capacityHours={capacityHours}
              colWidth={COL_W} labelWidth={LABEL_W} scrollRef={barsScrollRef} onScroll={onBarsScroll}
            />
          </div>
          </>
        )}
      </div>
    </div>
  )
}
