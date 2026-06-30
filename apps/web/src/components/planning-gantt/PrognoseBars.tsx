import type { RefObject } from 'react'
import type { Machine } from '../../api/machines'

interface PrognoseBarsProps {
  machines: Machine[]
  periods: { label: string }[]
  data: Record<string, string | number>[]
  capacityHours: number
  colWidth: number
  labelWidth: number
  chartHeight: number
  scrollRef: RefObject<HTMLDivElement>
  onScroll: () => void
}

const N_COLORS = 8
// Headroom above the tallest bar/capacity line so it never sits flush
// against the chart's top edge (which made the capacity line look like it
// was missing whenever nothing actually exceeded capacity).
const HEADROOM = 1.12

// Plain CSS bars instead of a charting library — a library manages its own
// internal margins/axis widths, which makes it effectively impossible to
// force pixel-exact column alignment with the heatmap above. Building both
// off the same colWidth/labelWidth guarantees every day lines up between
// the two when their scroll position is kept in sync (see PrognosePage).
export function PrognoseBars({
  machines, periods, data, capacityHours, colWidth, labelWidth, chartHeight, scrollRef, onScroll,
}: PrognoseBarsProps) {
  const rawMax = Math.max(
    capacityHours,
    ...data.flatMap(row => machines.map(m => Number(row[`${m.name}__total`] ?? 0))),
    1,
  )
  const maxVal = rawMax * HEADROOM
  const capPct = Math.min(100, (capacityHours / maxVal) * 100)
  const peakPct = Math.min(100, (rawMax / maxVal) * 100)
  const maxLabel = Math.round(rawMax * 10) / 10
  // The peak axis label is only meaningful when something actually rises
  // above the capacity line; in the common case the peak IS capacity, so the
  // capacity label alone (sitting right on the dashed line) labels the top of
  // the data.
  const showPeakLabel = rawMax > capacityHours + 0.05

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
          <div className="prog-bars-axis" style={{ width: labelWidth, height: chartHeight }}>
            <span style={{ bottom: 0 }}>0 u</span>
            <span style={{ bottom: `${capPct}%` }} className="prog-bars-caplabel">{capacityHours} u</span>
            {showPeakLabel && (
              <span style={{ bottom: `${peakPct}%` }}>{maxLabel} u</span>
            )}
          </div>
          <div className="prog-bars-days">
            {periods.map((p, i) => (
              <div key={i} className="prog-bars-col" style={{ width: colWidth, height: chartHeight }}>
                <div className="prog-bars-capline" style={{ bottom: `${capPct}%` }} />
                {machines.map((m, mi) => {
                  const v = Number(data[i]?.[`${m.name}__total`] ?? 0)
                  if (v <= 0) return null
                  return (
                    <div
                      key={m.id} className="prog-bars-bar" data-color={mi % N_COLORS}
                      style={{ height: `${Math.min(100, (v / maxVal) * 100)}%` }}
                      data-tip={`${m.name} · ${p.label}: ${v.toFixed(1)} u`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="prog-bars-labelrow">
          <div className="prog-bars-axis-spacer" style={{ width: labelWidth }} />
          {periods.map((p, i) => (
            <div key={i} className="prog-bars-collabel" style={{ width: colWidth }}><span>{p.label}</span></div>
          ))}
        </div>
      </div>
    </div>
  )
}
