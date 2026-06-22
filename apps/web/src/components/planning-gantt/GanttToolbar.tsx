import { IconArrowBackUp, IconEye, IconEyeOff, IconGhost } from '@tabler/icons-react'
import type { ZoomLevel } from '../../utils/planningGanttUtils'

export type BlockStyle = 'rand' | 'vol' | 'zacht'
export type LinkStyle = 'lijnen' | 'gloed' | 'beide'

interface GanttToolbarProps {
  zoom: ZoomLevel; onZoom: (z: ZoomLevel) => void
  blockStyle: BlockStyle; onBlockStyle: (b: BlockStyle) => void
  linkStyle: LinkStyle; onLinkStyle: (l: LinkStyle) => void
  undoLabel: string | null; onUndo: () => void
  showGhost: boolean; onToggleGhost: () => void
  showDone: boolean; onToggleDone: () => void
}

const ZOOM_OPTS: [ZoomLevel, string][] = [['day', 'Dag'], ['week', 'Week'], ['month', 'Maand']]
const BLOCK_OPTS: [BlockStyle, string][] = [['rand', 'Rand'], ['vol', 'Vol'], ['zacht', 'Zacht']]
const LINK_OPTS: [LinkStyle, string][] = [['lijnen', 'Lijnen'], ['gloed', 'Gloed'], ['beide', 'Beide']]

export function GanttToolbar({
  zoom, onZoom, blockStyle, onBlockStyle, linkStyle, onLinkStyle,
  undoLabel, onUndo, showGhost, onToggleGhost, showDone, onToggleDone,
}: GanttToolbarProps) {
  return (
    <div className="plan-toolbar">
      <div className="seg" role="tablist">
        {ZOOM_OPTS.map(([v, l]) => (
          <button key={v} data-active={zoom === v} onClick={() => onZoom(v)}>{l}</button>
        ))}
      </div>
      <div className="tb-divider" />

      <span className="tb-label">Blok</span>
      <div className="seg">
        {BLOCK_OPTS.map(([v, l]) => (
          <button key={v} data-active={blockStyle === v} onClick={() => onBlockStyle(v)}>{l}</button>
        ))}
      </div>

      <span className="tb-label">Koppeling</span>
      <div className="seg">
        {LINK_OPTS.map(([v, l]) => (
          <button key={v} data-active={linkStyle === v} onClick={() => onLinkStyle(v)}>{l}</button>
        ))}
      </div>

      <div className="sp" />

      {undoLabel && (
        <button className="btn ghost sm undo-btn" onClick={onUndo} title="Ctrl+Z">
          <IconArrowBackUp size={13} /> {undoLabel}
        </button>
      )}
      <button className="tgl" data-on={showGhost} onClick={onToggleGhost}>
        <IconGhost size={14} /> Prognose <span className="sw" />
      </button>
      <button className="tgl" data-on={showDone} onClick={onToggleDone}>
        {showDone ? <IconEye size={14} /> : <IconEyeOff size={14} />} Gereed
      </button>
    </div>
  )
}
