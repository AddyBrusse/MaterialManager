import { useEffect, useRef, useState } from 'react'
import { IconColumns3, IconGripVertical, IconChevronUp, IconChevronDown, IconRotate } from '@tabler/icons-react'
import {
  COLUMN_TINTS, resolveAllColumns, resolveColumns, reorderColumns, PROJECT_COLUMNS,
  type ProjectColumn,
} from './projectColumns'
import type { ProjectTablePrefs } from '@stockmanager/shared'

// Column customisation for the projecten table: which columns show, in what
// order, and an optional background tint per column. Everything here writes
// straight to the user's saved preference (see useUserPreference).
//
// Plain positioned panel rather than a Mantine Popover: the contents are fully
// custom, and a dropdown full of toggles/drag handles fights Popover's focus
// and click handling.
export function ColumnSettings({
  prefs, onChange, onReset, disabled = false, open, onOpenChange,
}: {
  prefs: ProjectTablePrefs
  /** Updater form: several clicks in one tick must compose, not overwrite. */
  onChange: (updater: (prev: ProjectTablePrefs) => ProjectTablePrefs) => void
  onReset: () => void
  /** True while the saved layout is still loading — editing then would clobber it. */
  disabled?: boolean
  /** Controlled by the page so a column header's "Alle kolommen…" can open it. */
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const setOpen = (next: boolean | ((o: boolean) => boolean)) =>
    onOpenChange(typeof next === 'function' ? next(open) : next)
  const [dragId, setDragId] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const all = resolveAllColumns(prefs.order)
  const hiddenSet = new Set(prefs.hidden)
  const visibleCount = PROJECT_COLUMNS.length - PROJECT_COLUMNS.filter(c => hiddenSet.has(c.id)).length
  const idsInOrder = all.map(c => c.id)

  // Each of these recomputes from `prev` rather than the rendered `prefs`, so
  // rapid clicks (or two updates in one tick) can't drop each other's changes.
  function move(id: string, delta: number) {
    onChange(prev => {
      const ids = resolveAllColumns(prev.order).map(c => c.id)
      const idx = ids.indexOf(id)
      const next = idx + delta
      if (idx === -1 || next < 0 || next >= ids.length) return prev
      ;[ids[idx], ids[next]] = [ids[next], ids[idx]]
      return { ...prev, order: ids }
    })
  }

  function handleDrop(targetId: string) {
    const moved = dragId
    setDragId(null)
    if (!moved || moved === targetId) return
    onChange(prev => ({ ...prev, order: reorderColumns(prev.order, moved, targetId) }))
  }

  function toggleVisible(col: ProjectColumn) {
    onChange(prev => {
      const hidden = prev.hidden.includes(col.id)
        ? prev.hidden.filter(i => i !== col.id)
        : [...prev.hidden, col.id]
      // Never let the user hide every column — the table would be unusable.
      // Count what actually resolves as visible: `hidden` can carry ids of
      // columns that no longer exist, which would trip a raw length compare.
      if (resolveColumns(prev.order, hidden).length === 0) return prev
      return { ...prev, hidden }
    })
  }

  function setTint(id: string, tint: string) {
    onChange(prev => {
      const colors = { ...prev.colors }
      if (tint) colors[id] = tint
      else delete colors[id]
      return { ...prev, colors }
    })
  }

  return (
    <div className="colset-wrap" ref={wrapRef}>
      <button
        className="st-btn ghost sm"
        title={disabled ? 'Voorkeuren laden…' : 'Kolommen tonen, ordenen en kleuren'}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
      >
        <IconColumns3 size={14} />
        Kolommen ({visibleCount}/{PROJECT_COLUMNS.length})
      </button>

      {open && (
        <div className="colset">
          <div className="colset-hd">
            <span className="colset-title">Kolommen</span>
            <div className="sp" />
            <button className="st-btn ghost sm" onClick={() => onChange(prev => ({ ...prev, hidden: [] }))} title="Alle kolommen tonen">
              Alles tonen
            </button>
            <button className="st-btn ghost sm" onClick={onReset} title="Terug naar de standaardweergave">
              <IconRotate size={13} />Standaard
            </button>
          </div>

          <div className="colset-list">
            {all.map((col, i) => {
              const visible = !hiddenSet.has(col.id)
              return (
                <div
                  key={col.id}
                  className={`colset-row${dragId === col.id ? ' dragging' : ''}`}
                  draggable
                  onDragStart={e => {
                    setDragId(col.id)
                    // Firefox refuses to start a drag unless data is set.
                    e.dataTransfer.effectAllowed = 'move'
                    try { e.dataTransfer.setData('text/plain', col.id) } catch { /* ignore */ }
                  }}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                  onDrop={e => { e.preventDefault(); handleDrop(col.id) }}
                >
                  <span className="colset-grip" title="Sleep om te ordenen"><IconGripVertical size={13} /></span>

                  <span className="colset-name" title={col.longLabel ?? col.label} onClick={() => toggleVisible(col)}>
                    <span className="st-ck" data-on={visible} />
                    <span className={visible ? '' : 'cell-muted'}>{col.label}</span>
                  </span>

                  <div className="colset-tints">
                    {COLUMN_TINTS.map(t => (
                      <button
                        key={t.key || 'none'}
                        className={`colset-tint${(prefs.colors[col.id] ?? '') === t.key ? ' on' : ''}${t.key ? '' : ' none'}`}
                        data-tint={t.key || undefined}
                        title={t.label}
                        onClick={() => setTint(col.id, t.key)}
                      />
                    ))}
                  </div>

                  <div className="colset-move">
                    <button className="st-icon-btn" title="Omhoog" disabled={i === 0} onClick={() => move(col.id, -1)}>
                      <IconChevronUp size={13} />
                    </button>
                    <button className="st-icon-btn" title="Omlaag" disabled={i === all.length - 1} onClick={() => move(col.id, 1)}>
                      <IconChevronDown size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
