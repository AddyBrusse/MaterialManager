import type { ComponentType } from 'react'
import { PlanningQueuePage } from '../../routes/desktop/PlanningQueuePage'
import { PlanningKanbanPage } from '../../routes/desktop/PlanningKanbanPage'
import { PlanningGanttPage } from '../../routes/desktop/PlanningGanttPage'
import { PrognosePage } from '../../routes/desktop/PrognosePage'
import { TodosPage } from '../../routes/desktop/TodosPage'

// Registry for detached (/pop/:slug) windows — kept separate from
// AppLayout's own <Routes> so PopoutShell doesn't need to import the whole
// layout just to reuse a handful of page components.
export const POPOUT_REGISTRY: Record<string, { label: string; Component: ComponentType; hideChrome?: boolean }> = {
  '/planning-queue': { label: 'Planning — Wachtrij', Component: PlanningQueuePage, hideChrome: true },
  '/planning-kanban': { label: 'Planning — KanBan', Component: PlanningKanbanPage },
  '/planning-gantt': { label: 'Planning — Gantt', Component: PlanningGanttPage },
  '/prognose': { label: 'Planning — Prognose', Component: PrognosePage },
  '/todos': { label: 'Planning — ToDo', Component: TodosPage },
}
