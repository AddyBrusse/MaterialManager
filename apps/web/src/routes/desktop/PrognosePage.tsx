import { useEffect, useMemo, useState } from 'react'
import { useLocalStorage } from '@mantine/hooks'
import { BarChart, type BarChartSeries } from '@mantine/charts'
import { projectsApi, initProjects } from '../../api/projects'
import { articlesApi, initArticles } from '../../api/articles'
import { machinesApi, initMachines } from '../../api/machines'
import {
  buildStapItems, berekenGhostBelasting, machineLoadInRange, ghostLoadInRange,
  getWindowStart, toDateStr, dateForDayIndex, weekNrForIdx, fmtDayShort, TOTAL_DAYS,
  isWeekendIdx, EFFECTIEVE_MIN,
} from '../../utils/planningGanttUtils'
import { PrognoseHeatmap } from '../../components/planning-gantt/PrognoseHeatmap'

type Granularity = 'day' | 'week' | 'month'

// "Dag" zooms in on the near term rather than the full ~9-month window —
// the heatmap/week/month views are for the long-range overview.
const DAY_VIEW_WORKDAYS = 60

const PALETTE = ['blue', 'teal', 'grape', 'orange', 'lime', 'pink', 'cyan', 'yellow']

interface Period { label: string; startDay: number; endDay: number; weekStart: number; weekEnd: number }

// Monthly buckets are derived from the same per-week ghost map the board
// uses, so a week is wholly attributed to the month its first day falls in —
// a minor approximation at month boundaries, consistent with the ghost map
// itself already being an estimate (see berekenGhostBelasting). Day buckets
// reuse that same per-week ghost figure for every workday in the week, for
// the same reason.
function buildPeriods(granularity: Granularity, windowStart: Date): Period[] {
  if (granularity === 'day') {
    const days: Period[] = []
    for (let d = 0; d < TOTAL_DAYS && days.length < DAY_VIEW_WORKDAYS; d++) {
      if (isWeekendIdx(d, windowStart)) continue
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

function workdaysInRange(startDay: number, endDay: number, windowStart: Date): number {
  let n = 0
  for (let d = startDay; d < endDay; d++) if (!isWeekendIdx(d, windowStart)) n++
  return n
}

// Effective capacity (hours) for a period — exact for "week" (every period is
// a full Mon-Fri week, so this is always 5 workdays), an average for "month"
// (variable workday count per calendar month, so the reference line is a
// guide rather than an exact-per-period threshold).
function avgCapacityHours(periods: Period[], windowStart: Date): number {
  if (periods.length === 0) return 0
  const totalWorkdays = periods.reduce((s, p) => s + workdaysInRange(p.startDay, p.endDay, windowStart), 0)
  return (totalWorkdays / periods.length) * EFFECTIEVE_MIN / 60
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
  const capacityHours = useMemo(() => Math.round(avgCapacityHours(periods, windowStart) * 10) / 10, [periods, windowStart])
  const capacityPerPeriod = useMemo(
    () => periods.map(p => workdaysInRange(p.startDay, p.endDay, windowStart) * EFFECTIEVE_MIN / 60),
    [periods, windowStart],
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

  const series = useMemo<BarChartSeries[]>(() => machines.map((m, i) => ({
    name: `${m.name}__total`, label: m.name, color: `${PALETTE[i % PALETTE.length]}.6`,
  })), [machines])

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
            <PrognoseHeatmap machines={machines} periods={periods} data={data} capacityPerPeriod={capacityPerPeriod} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Werklast per machine (gepland + prognose)</div>
            <div style={{ overflowX: granularity === 'day' ? 'auto' : 'visible' }}>
              <div style={{ minWidth: granularity === 'day' ? periods.length * 16 : '100%' }}>
                <BarChart
                  h={320}
                  data={data}
                  dataKey="period"
                  series={series}
                  withLegend
                  withTooltip
                  unit=" u"
                  tooltipProps={{ wrapperStyle: { zIndex: 20 } }}
                  xAxisProps={{ angle: -45, textAnchor: 'end', height: 60, interval: 0 }}
                  referenceLines={[{
                    y: capacityHours, color: 'red.6', label: `Capaciteit per machine (${capacityHours} u)`,
                    strokeDasharray: '4 4', labelPosition: 'insideTopRight', ifOverflow: 'extendDomain',
                  }]}
                />
              </div>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  )
}
