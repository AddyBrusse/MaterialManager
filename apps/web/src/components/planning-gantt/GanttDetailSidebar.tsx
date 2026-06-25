import { useState } from 'react'
import type { CSSProperties } from 'react'
import { IconX, IconCheck, IconArrowRight, IconArrowBackUp, IconChevronRight, IconChevronLeft } from '@tabler/icons-react'
import type { Relatie } from '@stockmanager/shared'
import {
  type PlanningStapItem, projectKleur, minToUren, klantNaam,
  heeftVolgordeWaarschuwing, isAchterstand, effectiveMachine,
} from '../../utils/planningGanttUtils'

interface GanttDetailSidebarProps {
  item: PlanningStapItem
  relaties: Relatie[]
  onClose: () => void
  onMarkDone: (item: PlanningStapItem) => void
  onUnplan: (item: PlanningStapItem) => void
  onUnplanOrder: (item: PlanningStapItem) => void
  onGoProject: (projectId: string) => void
  onSetDeadline: (projectId: string, newDate: string) => void
}

// A persistent right-side panel rather than a cursor-anchored popover — the
// board shrinks via flexbox to make room for it instead of anything covering
// the board, so the connector lines for the selected order stay visible.
export function GanttDetailSidebar({
  item, relaties, onClose, onMarkDone, onUnplan, onUnplanOrder, onGoProject, onSetDeadline,
}: GanttDetailSidebarProps) {
  const { stap, order, project } = item
  const [editingDeadline, setEditingDeadline] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const kleur = projectKleur(project.id)
  const done = !!stap.gereedOp
  const achter = isAchterstand(stap)
  const warn = heeftVolgordeWaarschuwing(item)
  const machineNaam = effectiveMachine(stap) || 'Geen machine'
  const totaalStappen = order.stappen.length

  if (collapsed) {
    return (
      <div className="ds-tab" title="Details tonen" onClick={() => setCollapsed(false)}>
        <IconChevronLeft size={14} />
      </div>
    )
  }

  return (
    <div className="detail-sidebar" style={{ '--c': kleur } as CSSProperties}>
      <div className="np-head">
        <button className="icon-btn np-close" onClick={() => setCollapsed(true)} title="Inklappen">
          <IconChevronRight size={14} />
        </button>
        <button className="icon-btn" style={{ position: 'absolute', top: 10, right: 38 }} onClick={onClose} title="Sluiten">
          <IconX size={14} />
        </button>
        <div className="np-proj">
          <span className="d" />
          <span className="id">{project.id}</span>
        </div>
        <div className="np-title">{order.artikelNaam}</div>
        <div className="np-klant">{klantNaam(relaties, project)}</div>
        <div className="np-badges">
          {done ? (
            <span className="badge ok sm"><span className="dot" />Gereed</span>
          ) : achter ? (
            <span className="badge danger sm"><span className="dot" />Achterstand</span>
          ) : stap.geplandDatum != null ? (
            <span className="badge info sm"><span className="dot" />Gepland</span>
          ) : (
            <span className="badge warn sm"><span className="dot" />Te plannen</span>
          )}
          {item.isPlaceholder && <span className="badge warn sm">~ schatting</span>}
          {warn && <span className="badge warn sm">Volgorde</span>}
        </div>
      </div>

      <div className="np-rows">
        <div className="np-row"><span className="k">Stap</span><span className="v">{stap.naam}</span></div>
        <div className="np-row"><span className="k">Volgorde</span><span className="v mono">{stap.volgorde} / {totaalStappen}</span></div>
        <div className="np-row"><span className="k">Machine</span><span className="v">{machineNaam}</span></div>
        <div className="np-row">
          <span className="k">Gepland op</span>
          <span className="v">{stap.geplandDatum ? formatDate(stap.geplandDatum) : 'niet ingepland'}</span>
        </div>
        <div className="np-row">
          <span className="k">Duur</span>
          <span className="v mono">{item.isPlaceholder ? '~' : ''}{minToUren(item.duurMin)} · {order.qty} st</span>
        </div>
        <div className="np-row">
          <span className="k">Deadline</span>
          {editingDeadline ? (
            <input
              type="date" autoFocus defaultValue={project.levertijdDatum ?? ''}
              onChange={e => { if (e.target.value) onSetDeadline(project.id, e.target.value); setEditingDeadline(false) }}
              onBlur={() => setEditingDeadline(false)}
              style={{
                height: 26, fontSize: 12, fontFamily: 'var(--font-mono)', border: '1px solid var(--accent)',
                borderRadius: 4, background: 'var(--bg-input)', color: 'var(--text)',
              }}
            />
          ) : (
            <span
              className="v mono" style={{ cursor: 'pointer', borderBottom: '1px dashed var(--text-3)' }}
              onClick={() => setEditingDeadline(true)}
            >
              {project.levertijdDatum ? formatDate(project.levertijdDatum) : '—'}
            </span>
          )}
        </div>
        {done && (
          <div className="np-row">
            <span className="k">Gereed door</span>
            <span className="v">{stap.gereedDoor} · {formatDateTime(stap.gereedOp!)}</span>
          </div>
        )}
      </div>

      <div className="np-actions">
        <button className="btn primary" onClick={() => onGoProject(project.id)}>
          <IconArrowRight size={13} /> Ga naar project
        </button>
        {!done && stap.geplandDatum != null && (
          <button className="btn" onClick={() => onMarkDone(item)} title="Gereed melden">
            <IconCheck size={13} /> Gereed
          </button>
        )}
        {stap.geplandDatum != null && (
          <button className="icon-btn" style={{ width: 32 }} onClick={() => onUnplan(item)} title="Terug naar backlog">
            <IconX size={14} />
          </button>
        )}
      </div>
      <div className="np-foot">
        <button className="ft" onClick={() => onUnplanOrder(item)}>
          <IconArrowBackUp size={12} /> Hele order terugzetten naar backlog
        </button>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}
