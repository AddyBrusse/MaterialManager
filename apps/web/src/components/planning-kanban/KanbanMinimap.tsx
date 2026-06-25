import { useRef } from 'react'
import type { PointerEvent, RefObject } from 'react'
import type { Machine } from '../../api/machines'
import { type KanbanLayout, MINI_USABLE_W, MINI_LEFT_PAD } from '../../utils/planningKanbanUtils'

export interface MinimapMetrics { scrollTop: number; viewH: number; scrollH: number; miniH: number }

interface KanbanMinimapProps {
  layout: KanbanLayout
  machines: Machine[]
  metrics: MinimapMetrics
  miniRef: RefObject<HTMLDivElement>
  onScrollTo: (top: number) => void
}

// A wide, semi-transparent vertical minimap that doubles as the board's
// scrollbar (VS Code minimap style) — sits between the board and the
// details panel. Reads live scroll metrics and the deterministic layout
// model to draw scaled blocks/over-marks/week+today lines.
export function KanbanMinimap({ layout, machines, metrics, miniRef, onScrollTo }: KanbanMinimapProps) {
  const { miniH, scrollH, scrollTop, viewH } = metrics
  const S = scrollH > 0 ? miniH / scrollH : 0
  const cellW = MINI_USABLE_W / Math.max(machines.length, 1)
  const vpTop = scrollTop * S
  const vpH = Math.max(14, viewH * S)
  const grabRef = useRef(0)

  function onMapDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).classList.contains('kb-mini-viewport')) return
    const rect = miniRef.current!.getBoundingClientRect()
    const y = e.clientY - rect.top
    onScrollTo(y / (S || 1) - viewH / 2)
  }
  function onVpDown(e: PointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    const rect = miniRef.current!.getBoundingClientRect()
    grabRef.current = e.clientY - rect.top - vpTop
    const move = (ev: globalThis.PointerEvent) => {
      const yy = ev.clientY - rect.top - grabRef.current
      onScrollTo(yy / (S || 1))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="kb-minimap" ref={miniRef} onPointerDown={onMapDown} title="Overzicht — sleep of klik om te scrollen">
      <div className="kb-minimap-inner">
        {layout.weekLines.map((y, i) => (
          <div key={`w${i}`} className="kb-mini-weekline" style={{ top: y * S }} />
        ))}
        {layout.miniBlocks.map((b, i) => (
          <div
            key={i} className="kb-mini-card"
            style={{ left: MINI_LEFT_PAD + b.mi * cellW, top: b.yAbs * S, width: Math.max(2, cellW - 1), height: Math.max(1.5, b.hAbs * S), background: b.color }}
          />
        ))}
        {layout.overMarks.map((o, i) => (
          <div key={`o${i}`} className="kb-mini-over" style={{ left: MINI_LEFT_PAD + (o.mi + 0.5) * cellW - 2, top: o.yAbs * S, width: 4, height: 4 }} />
        ))}
        <div className="kb-mini-today" style={{ top: layout.todayAbs * S }} />
        <div className="kb-mini-viewport" style={{ top: vpTop, height: vpH }} onPointerDown={onVpDown} />
      </div>
    </div>
  )
}
