import { Fragment } from 'react'
import type { Machine } from '../../api/machines'

interface PrognoseHeatmapProps {
  machines: Machine[]
  periods: { label: string }[]
  data: Record<string, string | number>[]
  capacityPerPeriod: number[]
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

export function PrognoseHeatmap({ machines, periods, data, capacityPerPeriod }: PrognoseHeatmapProps) {
  return (
    <div className="prog-hm-wrap">
      <div className="prog-hm-grid" style={{ gridTemplateColumns: `160px repeat(${periods.length}, minmax(34px, 1fr))` }}>
        <div className="prog-hm-corner">Machine</div>
        {periods.map((p, i) => <div key={i} className="prog-hm-colhd">{p.label}</div>)}

        {machines.map(m => (
          <Fragment key={m.id}>
            <div className="prog-hm-rowhd">{m.name}</div>
            {periods.map((p, i) => {
              const row = data[i]
              const planned = Number(row?.[`${m.name}__planned`] ?? 0)
              const outstanding = Number(row?.[`${m.name}__outstanding`] ?? 0)
              const load = planned + outstanding
              const cap = capacityPerPeriod[i] || 0
              const ratio = cap > 0 ? load / cap : 0
              return (
                <div
                  key={i} className="prog-hm-cell"
                  style={{ background: ratioColor(ratio) }}
                  title={`${m.name} · ${p.label}: ${load.toFixed(1)} u / ${cap.toFixed(1)} u (${Math.round(ratio * 100)}%)`}
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
