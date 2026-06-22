import type { CSSProperties, DragEvent } from 'react'
import { IconInbox, IconCalendar } from '@tabler/icons-react'
import type { Relatie } from '@stockmanager/shared'
import {
  type PlanningStapItem, projectKleur, minToUren, klantNaam, effectiveMachine,
} from '../../utils/planningGanttUtils'

export type BacklogSort = 'default' | 'deadline'

interface GanttBacklogPanelProps {
  items: PlanningStapItem[]
  relaties: Relatie[]
  projectFilter: string
  onProjectFilter: (v: string) => void
  sortBy: BacklogSort
  onSortBy: (v: BacklogSort) => void
  selectedProjectId: string | null
  onSelectCard: (item: PlanningStapItem) => void
  draggingId: string | null
  onDragStartStep: (e: DragEvent, item: PlanningStapItem) => void
  onDragEndStep: () => void
}

export function GanttBacklogPanel({
  items, relaties, projectFilter, onProjectFilter, sortBy, onSortBy,
  selectedProjectId, onSelectCard, draggingId, onDragStartStep, onDragEndStep,
}: GanttBacklogPanelProps) {
  const today = new Date().toISOString().slice(0, 10)
  const projectIds = Array.from(new Set(items.map(i => i.project.id)))
  const projectById = new Map(items.map(i => [i.project.id, i.project]))

  let list = items.slice()
  if (projectFilter !== 'all') list = list.filter(i => i.project.id === projectFilter)
  if (sortBy === 'deadline') {
    list.sort((a, b) => (a.project.levertijdDatum ?? '9999').localeCompare(b.project.levertijdDatum ?? '9999'))
  } else {
    list.sort((a, b) =>
      a.project.id === b.project.id ? a.stap.volgorde - b.stap.volgorde : a.project.id.localeCompare(b.project.id),
    )
  }

  return (
    <div className="backlog">
      <div className="backlog-head">
        <div className="backlog-title">
          <IconInbox size={16} />
          <span className="t">Te plannen</span>
          <span className="n">{items.length}</span>
        </div>
        <div className="backlog-sub">Sleep een stap op de tijdlijn om te plannen</div>
        <div className="backlog-controls">
          <select value={projectFilter} onChange={e => onProjectFilter(e.target.value)}>
            <option value="all">Alle projecten</option>
            {projectIds.map(pid => {
              const project = projectById.get(pid)!
              return <option key={pid} value={pid}>{pid} · {klantNaam(relaties, project)}</option>
            })}
          </select>
          <select value={sortBy} onChange={e => onSortBy(e.target.value as BacklogSort)} style={{ maxWidth: 96 }}>
            <option value="default">Standaard</option>
            <option value="deadline">Deadline</option>
          </select>
        </div>
      </div>

      <div className="backlog-list">
        {list.length === 0 && <div className="bl-empty">Niets te plannen — alles is ingepland.</div>}
        {list.map(item => {
          const { stap, project } = item
          const kleur = projectKleur(project.id)
          const linked = selectedProjectId === project.id
          const dimmed = selectedProjectId != null && selectedProjectId !== project.id
          const urgent = !!project.levertijdDatum && project.levertijdDatum <= addDays(today, 4)
          return (
            <div
              key={stap.id}
              className={`bl-card${draggingId === stap.id ? ' dragging' : ''}${linked ? ' proj-linked' : ''}${dimmed ? ' dimmed' : ''}`}
              style={{ '--proj': kleur } as CSSProperties}
              draggable
              onDragStart={e => onDragStartStep(e, item)}
              onDragEnd={onDragEndStep}
              onClick={() => onSelectCard(item)}
            >
              <div className="bl-card-top">
                <span className="bl-dot" />
                <span className="bl-proj">{project.id}</span>
                <span className="bl-mach">{effectiveMachine(stap) || 'Geen machine'}</span>
              </div>
              <div className="bl-name">{item.order.artikelNaam}</div>
              <div className="bl-meta">
                <span className="dur">{item.isPlaceholder ? '~' : ''}{minToUren(item.duurMin)}</span>
                <span>·</span>
                <span>{item.order.qty} st</span>
                <span style={{ flex: 1 }} />
                {project.levertijdDatum && (
                  <span className={`dl${urgent ? ' urgent' : ''}`}>
                    <IconCalendar size={11} />
                    {formatShortDate(project.levertijdDatum)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}
