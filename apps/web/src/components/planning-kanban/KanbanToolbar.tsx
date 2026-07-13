import { minToUren, ZOOM_LEVELS, type ZoomLevel } from '../../utils/planningKanbanUtils'

export type SelStyle = 'dimmen' | 'markeren' | 'lijnen'

const SEL_OPTS: [SelStyle, string][] = [['dimmen', 'Dimmen'], ['markeren', 'Markeren'], ['lijnen', 'Lijnen']]

interface KanbanToolbarProps {
  selStyle: SelStyle
  onSelStyle: (v: SelStyle) => void
  zoom: ZoomLevel
  onZoomChange: (v: ZoomLevel) => void
  backlogCount: number
  plannedMin: number
  overCount: number
}

export function KanbanToolbar({ selStyle, onSelStyle, zoom, onZoomChange, backlogCount, plannedMin, overCount }: KanbanToolbarProps) {
  return (
    <div className="kb-toolbar">
      <div className="kb-legend">
        <span className="kb-leg"><span className="sw ok" />Ruimte</span>
        <span className="kb-leg"><span className="sw warn" />Bijna vol</span>
        <span className="kb-leg"><span className="sw over" />Overboekt</span>
      </div>
      <div className="tb-divider" />
      <span className="tb-label">Bij selecteren</span>
      <div className="seg">
        {SEL_OPTS.map(([v, l]) => (
          <button key={v} data-active={selStyle === v} onClick={() => onSelStyle(v)}>{l}</button>
        ))}
      </div>
      <div className="tb-divider" />
      <span className="tb-label">Zoom</span>
      <select
        className="kb-zoom-select"
        value={zoom}
        onChange={e => onZoomChange(Number(e.target.value) as ZoomLevel)}
        title="Verticale zoom — of shift+scroll op het bord"
      >
        {ZOOM_LEVELS.map(z => <option key={z} value={z}>{z}%</option>)}
      </select>
      <div className="sp" />
      <span className="kb-stat">Te plannen <b>{backlogCount}</b></span>
      <span className="kb-sep" />
      <span className="kb-stat">Ingepland <b>{minToUren(plannedMin)}</b></span>
      <span className="kb-sep" />
      <span className="kb-stat" style={overCount ? { color: 'var(--danger)' } : undefined}>
        Overboekt <b style={overCount ? { color: 'var(--danger)' } : undefined}>{overCount}</b> {overCount === 1 ? 'dag' : 'dagen'}
      </span>
    </div>
  )
}
