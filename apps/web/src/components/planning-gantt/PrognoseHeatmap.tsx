import { Fragment } from 'react'
import type { RefObject } from 'react'
import type { Machine } from '../../api/machines'

interface PrognoseHeatmapProps {
  machines: Machine[]
  periods: { label: string }[]
  data: Record<string, string | number>[]
  capacityPerPeriod: number[]
  colWidth: number
  labelWidth: number
  rowHeight: number
  maxHeight: number
  scrollRef: RefObject<HTMLDivElement>
  onScroll: () => void
}

// Single-hue gradient (this app's --danger red) rather than the usual
// discrete ok/warn/over buckets — a heatmap is for spotting relative
// pressure across many cells at once, so a continuous intensity reads
// faster than three flat colors. Caps out at 150% of capacity.
function ratioColor(ratio: number): string {
  if (ratio <= 0) return 'var(--bg-2)'
  const intensity = Math.min(100, Math.round((ratio / 1.5) * 100))
  return `color-mix(in srgb, var(--danger) ${intensity}%, var(--bg-2))`
}

export function PrognoseHeatmap({
  machines, periods, data, capacityPerPeriod, colWidth, labelWidth, rowHeight, maxHeight, scrollRef, onScroll,
}: PrognoseHeatmapProps) {
  return (
    <div className="prog-hm-wrap" ref={scrollRef} onScroll={onScroll} style={{ maxHeight }}>
      <div className="prog-hm-grid" style={{ gridTemplateColumns: `${labelWidth}px repeat(${periods.length}, ${colWidth}px)` }}>
        <div className="prog-hm-corner" style={{ width: labelWidth }}>Machine</div>
        {periods.map((p, i) => (
          <div key={i} className="prog-hm-colhd" style={{ width: colWidth }}><span>{p.label}</span></div>
        ))}

        {machines.map(m => (
          <Fragment key={m.id}>
            <div className="prog-hm-rowhd" style={{ width: labelWidth, height: rowHeight }} title={m.name}>{m.name}</div>
            {periods.map((p, i) => {
              const row = data[i]
              const load = Number(row?.[`${m.name}__total`] ?? 0)
              const cap = capacityPerPeriod[i] || 0
              const ratio = cap > 0 ? load / cap : 0
              return (
                <div
                  key={i} className="prog-hm-cell"
                  style={{ background: ratioColor(ratio), height: rowHeight }}
                  data-tip={`${m.name} · ${p.label}: ${load.toFixed(1)} u / ${cap.toFixed(1)} u (${Math.round(ratio * 100)}%)`}
                >
                  {load > 0 ? `${Math.round(ratio * 100)}` : ''}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
