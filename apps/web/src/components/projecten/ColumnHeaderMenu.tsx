import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconDotsVertical, IconArrowUp, IconArrowDown, IconEyeOff, IconColumns3 } from '@tabler/icons-react'
import { COLUMN_TINTS, type ProjectColumn } from './projectColumns'

const POP_W = 210

/**
 * The per-column "⋮" menu that lives in the table header: colour, sort
 * direction, hide, and a way into the full Kolommen panel. Sits next to the
 * header label and appears on hover (or while open).
 *
 * Every handler stops propagation: the <th> itself is click-to-sort and
 * draggable-to-reorder, so an un-stopped click here would also sort the column,
 * and a mousedown would start dragging it.
 */
export function ColumnHeaderMenu({
  col, tint, onTint, onSort, onHide, onOpenPanel,
}: {
  col: ProjectColumn
  tint: string
  onTint: (tint: string) => void
  onSort: (dir: 'asc' | 'desc') => void
  onHide: () => void
  onOpenPanel: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  // Rendered through a portal at fixed coordinates: the table scrolls in its
  // own overflow container, which would otherwise clip this dropdown at the
  // first and last columns.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({
      top: r.bottom + 4,
      left: Math.max(8, Math.min(r.right - POP_W, window.innerWidth - POP_W - 8)),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node
      // The dropdown is portaled, so it isn't inside wrapRef — check it too or
      // clicking a swatch would close the menu before the click registers.
      if (!wrapRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    // The header is sticky inside a scroller; close rather than let the menu
    // drift away from its column.
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    fn()
    setOpen(false)
  }

  return (
    <span
      className="colhdr-menu"
      ref={wrapRef}
      // Cancel the parent <th>'s drag when the gesture starts on the menu.
      onDragStart={e => { e.preventDefault(); e.stopPropagation() }}
      onClick={e => e.stopPropagation()}
    >
      <button
        ref={btnRef}
        className={`colhdr-dots${open ? ' on' : ''}`}
        title={`Opties voor ${col.longLabel ?? col.label}`}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
      >
        <IconDotsVertical size={13} />
      </button>

      {open && createPortal(
        <div
          className="colhdr-pop"
          ref={popRef}
          style={{ top: pos.top, left: pos.left, width: POP_W }}
          onClick={e => e.stopPropagation()}
        >
          <div className="colhdr-sect">Kleur</div>
          <div className="colhdr-tints">
            {COLUMN_TINTS.map(t => (
              <button
                key={t.key || 'none'}
                className={`colset-tint${tint === t.key ? ' on' : ''}${t.key ? '' : ' none'}`}
                data-tint={t.key || undefined}
                title={t.label}
                onClick={act(() => onTint(t.key))}
              />
            ))}
          </div>

          <div className="colhdr-sep" />
          <button className="colhdr-item" onClick={act(() => onSort('asc'))}>
            <IconArrowUp size={13} />Oplopend sorteren
          </button>
          <button className="colhdr-item" onClick={act(() => onSort('desc'))}>
            <IconArrowDown size={13} />Aflopend sorteren
          </button>

          <div className="colhdr-sep" />
          <button className="colhdr-item" onClick={act(onHide)}>
            <IconEyeOff size={13} />Verberg kolom
          </button>
          <button className="colhdr-item" onClick={act(onOpenPanel)}>
            <IconColumns3 size={13} />Alle kolommen…
          </button>
        </div>,
        document.body,
      )}
    </span>
  )
}
