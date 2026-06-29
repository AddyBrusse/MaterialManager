import type { RefObject } from 'react'
import type { Machine } from '../../api/machines'

interface PrognoseBarsProps {
  machines: Machine[]
  periods: { label: string }[]
  data: Record<string, string | number>[]
  capacityHours: number
  colWidth: number
  labelWidth: number
  scrollRef: RefObject<HTMLDivElement>
  onScroll: () => void
}

const CHART_H = 180
const N_COLORS = 8

// Plain CSS bars instead of a charting library — a library manages its own
// internal margins/axis widths, which makes it effectively impossible to
// force pixel-exact column alignment with the heatmap above. Building both
// off the same colWidth/labelWidth guarantees every day lines up between
// the two when their scroll position is kept in sync (see PrognosePage).
export function PrognoseBars({
  machines, periods, data, capacityHours, colWidth, labelWidth, scrollRef, onScroll,
}: PrognoseBarsProps) {
  const maxVal = Math.max(
    capacityHours,
    ...data.flatMap(row => machines.map(m => Number(row[`${m.name}__total`] ?? 0))),
    1,
  )
  const capPct = Math.min(100, (capacityHours / maxVal) * 100)

  return (
    <div>
      <div className="prog-bars-legend">
        {machines.map((m, i) => (
          <span key={m.id}><i data-color={i % N_COLORS} />{m.name}</span>
        ))}
        <span className="prog-bars-leg-cap"><i className="prog-bars-leg-capline" />Capaciteit ({capacityHours} u)</span>
      </div>

      <div className="prog-bars-wrap" ref={scrollRef} onScroll={onScroll}>
        <div className="prog-bars-inner">
          <div className="prog-bars-axis" style={{ width: labelWidth, height: CHART_H }}>
            <span style={{ bottom: 0 }}>0 u</span>
            <span style={{ bottom: `${capPct}%` }} className="prog-bars-caplabel">{capacityHours} u</span>
            <span style={{ bottom: '100%' }}>{Math.round(maxVal * 10) / 10} u</span>
          </div>
          <div className="prog-bars-days">
            {periods.map((p, i) => (
              <div key={i} className="prog-bars-col" style={{ width: colWidth, height: CHART_H }}>
                <div className="prog-bars-capline" style={{ bottom: `${capPct}%` }} />
                {machines.map((m, mi) => {
                  const v = Number(data[i]?.[`${m.name}__total`] ?? 0)
                  if (v <= 0) return null
                  return (
                    <div
                      key={m.id} className="prog-bars-bar" data-color={mi % N_COLORS}
                      style={{ height: `${Math.min(100, (v / maxVal) * 100)}%` }}
                      title={`${m.name} · ${p.label}: ${v.toFixed(1)} u`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
