import { IconArrowBackUp, IconArrowForwardUp, IconSparkles, IconEye, IconEyeOff } from '@tabler/icons-react'
import type { QueueZoom } from '../../utils/planningQueueUtils'

interface QueueToolbarProps {
  zoom: QueueZoom
  onZoom: (z: QueueZoom) => void
  showKpi: boolean
  onToggleKpi: () => void
  onSuggest: () => void
}

const ZOOM_OPTS: [QueueZoom, string][] = [['dag', 'Dag'], ['week', 'Week'], ['maand', 'Maand']]

export function QueueToolbar({ zoom, onZoom, showKpi, onToggleKpi, onSuggest }: QueueToolbarProps) {
  return (
    <div className="plan-toolbar">
      <span className="tb-label" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>Planning</span>
      <div className="tb-divider" />

      <div className="seg" role="tablist">
        {ZOOM_OPTS.map(([v, l]) => (
          <button key={v} data-active={zoom === v} onClick={() => onZoom(v)}>{l}</button>
        ))}
      </div>
      <div className="tb-divider" />

      <button className="tgl" data-on={showKpi} onClick={onToggleKpi}>
        {showKpi ? <IconEye size={14} /> : <IconEyeOff size={14} />} Toon KPI's
      </button>

      <div className="sp" />

      <button className="icon-btn" disabled title="Ongedaan maken (nog niet beschikbaar)">
        <IconArrowBackUp size={14} />
      </button>
      <button className="icon-btn" disabled title="Opnieuw (nog niet beschikbaar)">
        <IconArrowForwardUp size={14} />
      </button>
      <button className="btn primary" onClick={onSuggest}>
        <IconSparkles size={14} /> Stel schema voor
      </button>
    </div>
  )
}
