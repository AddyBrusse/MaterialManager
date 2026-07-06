import { IconTrash, IconCalendarCheck, IconCalendarPlus } from '@tabler/icons-react'
import type { Todo } from '@stockmanager/shared'
import { formatDate } from '../../api/projects'

const PRIORITY_CFG: Record<Todo['priority'], { label: string; cls: string }> = {
  low:    { label: 'Laag',    cls: 'st-badge' },
  normal: { label: 'Normaal', cls: 'st-badge info' },
  high:   { label: 'Hoog',    cls: 'st-badge danger' },
}

interface Props {
  todo: Todo
  currentUserId?: string
  onClaim: () => void
  onComplete: (done: boolean) => void
  onDelete: () => void
  onSetAgenda: () => void
  settingAgenda?: boolean
}

export function TodoRow({ todo, currentUserId, onClaim, onComplete, onDelete, onSetAgenda, settingAgenda }: Props) {
  const overdue = !!todo.dueDate && !todo.done && new Date(todo.dueDate) < new Date()
  const claimedByMe = !!currentUserId && todo.claimedByUserId === currentUserId
  const priorityCfg = PRIORITY_CFG[todo.priority]

  return (
    <div className="prj-off-card" style={{ opacity: todo.done ? 0.6 : 1 }}>
      <div className="prj-off-hd" style={{ gap: 10, cursor: 'default' }}>
        <input
          type="checkbox"
          checked={todo.done}
          onChange={e => onComplete(e.target.checked)}
          style={{ width: 15, height: 15, cursor: 'pointer' }}
        />
        <span style={{ flex: 1, fontWeight: 500, textDecoration: todo.done ? 'line-through' : 'none' }}>
          {todo.title}
        </span>
        <span className={priorityCfg.cls} style={{ fontSize: 10.5 }}>{priorityCfg.label}</span>
        {todo.dueDate && (
          <span className={`st-badge ${overdue ? 'danger' : 'info'}`} style={{ fontSize: 10.5 }}>
            <span className="dot" />{formatDate(todo.dueDate)}
          </span>
        )}
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>door {todo.createdByName ?? '—'}</span>
        {todo.claimedByName && (
          <span className="st-badge ok" style={{ fontSize: 10.5 }}>
            <span className="dot" />{todo.claimedByName}
          </span>
        )}
        {!todo.done && (
          <button className="st-btn xs ghost" onClick={onClaim}>
            {claimedByMe ? 'Laat los' : todo.claimedByUserId ? 'Overnemen' : 'Claim'}
          </button>
        )}
        {todo.calendarEventId ? (
          <span className="st-badge ok" style={{ fontSize: 10.5 }} title="Staat op de agenda">
            <IconCalendarCheck size={12} />Op agenda
          </span>
        ) : (
          <button
            className="st-btn xs ghost"
            onClick={onSetAgenda}
            disabled={!todo.dueDate || settingAgenda}
            title={todo.dueDate ? 'Zet op de Microsoft 365 agenda' : 'Voeg een datum toe om op de agenda te zetten'}
          >
            <IconCalendarPlus size={13} />{settingAgenda ? 'Bezig…' : 'Zet op agenda'}
          </button>
        )}
        <button className="st-icon-btn danger" title="Verwijderen" onClick={onDelete}>
          <IconTrash size={13} />
        </button>
      </div>
    </div>
  )
}
