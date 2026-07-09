import type { RefObject } from 'react'
import type { Machine } from '../../api/machines'

interface PrognoseBarsProps {
  machines: Machine[]
  periods: { label: string }[]
  data: Record<string, string | number>[]
  capacityByMachine: Record<string, number>
  colWidth: number
  labelWidth: number
  chartHeight: number
  scrollRef: RefObject<HTMLDivElement>
  onScroll: () => void
}

const N_COLORS = 8
// Headroom above the tallest bar so it never sits flush against the chart's
// top edge.
const HEADROOM = 1.12

// Plain CSS bars instead of a charting library — a library manages its own
// internal margins/axis widths, which makes it effectively impossible to
// force pixel-exact column alignment with the heatmap above. Building both
// off the same colWidth/labelWidth guarantees every day lines up between
// the two when their scroll position is kept in sync (see PrognosePage).
//
// Capacity is per-machine (Bezetting%/uren-per-dag in Instellingen →
// Bedrijfskosten), so a single shared reference line no longer means the
// same thing for every bar — and one line per distinct value got cluttered
// fast once a couple of machines differed. Instead each bar is a stack:
// solid machine color for confirmed work, a faded segment of the same color
// for quoting-stage (offerte) forecast, and a hatched overflow segment on
// top for whatever exceeds that machine's own capacity. Capacity is still
// legible (per-machine, in the legend and the tooltip) without drawing
// anything extra on the chart itself.
export function PrognoseBars({
  machines, periods, data, capacityByMachine, colWidth, labelWidth, chartHeight, scrollRef, onScroll,
}: PrognoseBarsProps) {
  const rawMax = Math.max(
    ...machines.map(m => capacityByMachine[m.name] ?? 0),
    ...data.flatMap(row => machines.map(m => Number(row[`${m.name}__total`] ?? 0))),
    1,
  )
  const maxVal = rawMax * HEADROOM
  const maxLabel = Math.round(rawMax * 10) / 10

  return (
    <div>
      <div className="prog-bars-legend">
        {machines.map((m, i) => (
          <span key={m.id}><i data-color={i % N_COLORS} />{m.name} ({(capacityByMachine[m.name] ?? 0).toFixed(1)} u)</span>
        ))}
        <span className="prog-bars-leg-offerte"><i className="prog-bars-leg-offerteswatch" />offerte (onbevestigd)</span>
        <span className="prog-bars-leg-over"><i className="prog-bars-leg-overswatch" />boven capaciteit</span>
      </div>

      <div className="prog-bars-wrap" ref={scrollRef} onScroll={onScroll}>
        <div className="prog-bars-inner">
          <div className="prog-bars-axis" style={{ width: labelWidth, height: chartHeight }}>
            {/* Unlike the top label, this one isn't centered on its gridline
                (no translateY(50%)) — at the very bottom of the axis,
                straddling the 0-line would push half the text below the
                axis box and into the date-label row that sits directly
                underneath, which paints over it. */}
            <span style={{ bottom: 0, transform: 'none' }}>0 u</span>
            <span style={{ bottom: `${Math.min(100, (rawMax / maxVal) * 100)}%` }}>{maxLabel} u</span>
          </div>
          <div className="prog-bars-days">
            {periods.map((p, i) => (
              <div key={i} className="prog-bars-col" style={{ width: colWidth, height: chartHeight }}>
                {machines.map((m, mi) => {
                  const v = Number(data[i]?.[`${m.name}__total`] ?? 0)
                  if (v <= 0) return null
                  const confirmed = Number(data[i]?.[`${m.name}__confirmed`] ?? 0)
                  const offerte = Number(data[i]?.[`${m.name}__offerte`] ?? 0)
                  const cap = capacityByMachine[m.name] ?? 0
                  // Stacked bottom-up: confirmed (solid) → offerte (faded) →
                  // over-capacity (red hatch). The hatch marks whatever part
                  // of the stack exceeds capacity, regardless of which of the
                  // two series pushed it over — capacity pressure is about
                  // the total, not the source.
                  const normalV = Math.min(v, cap)
                  const overV = v - normalV
                  const confirmedSeg = Math.min(confirmed, normalV)
                  const offerteSeg = normalV - confirmedSeg
                  // Multi-line detail tooltip — newlines survive as-is in the
                  // data-tip attribute and render via white-space: pre-line
                  // on the shared [data-tip]::after rule.
                  const tip = [
                    `${m.name} · ${p.label}`,
                    `Capaciteit: ${cap.toFixed(1)} u`,
                    `Bevestigd: ${confirmed.toFixed(1)} u`,
                    `Offerte: ${offerte.toFixed(1)} u`,
                  ].join('\n')
                  return (
                    <div
                      key={m.id} className="prog-bars-bar-wrap"
                      style={{ height: `${Math.min(100, (v / maxVal) * 100)}%` }}
                      data-tip={tip}
                    >
                      {overV > 0 && <div className="prog-bars-bar-over" style={{ flex: `${overV} 0 0` }} />}
                      {offerteSeg > 0 && <div className="prog-bars-bar prog-bars-bar-offerte" data-color={mi % N_COLORS} style={{ flex: `${offerteSeg} 0 0` }} />}
                      {confirmedSeg > 0 && <div className="prog-bars-bar" data-color={mi % N_COLORS} style={{ flex: `${confirmedSeg} 0 0` }} />}
                    </div>
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
