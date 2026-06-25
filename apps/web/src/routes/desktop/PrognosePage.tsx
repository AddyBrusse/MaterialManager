import { useEffect, useMemo, useState } from 'react'
import { useLocalStorage } from '@mantine/hooks'
import { BarChart, type BarChartSeries } from '@mantine/charts'
import { projectsApi, initProjects } from '../../api/projects'
import { articlesApi, initArticles } from '../../api/articles'
import { machinesApi, initMachines } from '../../api/machines'
import {
  buildStapItems, berekenGhostBelasting, machineLoadInRange, ghostLoadInRange,
  getWindowStart, toDateStr, dateForDayIndex, weekNrForIdx, TOTAL_DAYS,
} from '../../utils/planningGanttUtils'

type Granularity = 'week' | 'month'

interface Period { label: string; startDay: number; endDay: number; weekStart: number; weekEnd: number }

// Monthly buckets are derived from the same per-week ghost map the board
// uses, so a week is wholly attributed to the month its first day falls in —
// a minor approximation at month boundaries, consistent with the ghost map
// itself already being an estimate (see berekenGhostBelasting).
function buildPeriods(granularity: Granularity, windowStart: Date): Period[] {
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

const PALETTE = ['blue', 'teal', 'grape', 'orange', 'lime', 'pink', 'cyan', 'yellow']

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

  const data = useMemo(() => periods.map(p => {
    const row: Record<string, string | number> = { period: p.label }
    for (const m of machines) {
      const planned = machineLoadInRange(allItems, m.name, p.startDay, p.endDay, windowStart) / 60
      const outstanding = ghostLoadInRange(ghostMap, m.name, p.weekStart, p.weekEnd) / 60
      row[`${m.name}__planned`] = Math.round(planned * 10) / 10
      row[`${m.name}__outstanding`] = Math.round(outstanding * 10) / 10
    }
    return row
  }), [periods, machines, allItems, ghostMap, windowStart])

  const series = useMemo<BarChartSeries[]>(() => machines.flatMap((m, i) => {
    const c = PALETTE[i % PALETTE.length]
    return [
      { name: `${m.name}__planned`, label: `${m.name} — gepland`, color: `${c}.7`, stackId: m.name },
      { name: `${m.name}__outstanding`, label: `${m.name} — prognose (open offertes)`, color: `${c}.3`, stackId: m.name },
    ]
  }), [machines])

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
          <button data-active={granularity === 'week'} onClick={() => setGranularity('week')}>Week</button>
          <button data-active={granularity === 'month'} onClick={() => setGranularity('month')}>Maand</button>
        </div>
      </div>

      <div style={{ padding: '0 24px 24px', flex: 1, minHeight: 0 }}>
        {machines.length === 0 ? (
          <div className="st-empty">Geen machines ingericht — voeg machines toe via Instellingen → Bedrijfskosten.</div>
        ) : (
          <BarChart
            h={460}
            data={data}
            dataKey="period"
            series={series}
            withLegend
            withTooltip
            unit=" u"
            tooltipProps={{ wrapperStyle: { zIndex: 20 } }}
          />
        )}
      </div>
    </div>
  )
}
