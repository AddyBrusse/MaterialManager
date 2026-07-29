import type { ComponentType } from 'react'
import { matchPath } from 'react-router-dom'
import { PlanningQueuePage } from '../../routes/desktop/PlanningQueuePage'
import { PrognosePage } from '../../routes/desktop/PrognosePage'
import { TodosPage } from '../../routes/desktop/TodosPage'
import { ProjectDetailPage } from '../../routes/desktop/ProjectDetailPage'

// Registry for detached (/pop/:slug) windows — kept separate from AppLayout's
// own <Routes> so PopoutShell doesn't need to import the whole layout just to
// reuse a handful of page components.
//
// `path` is a React Router pattern (may contain params, e.g. /projecten/:id).
// PopoutShell builds a <Routes> from these so param routes resolve useParams()
// the same way they do in the main window.
export interface PopoutEntry {
  path: string
  label: string
  Component: ComponentType
  hideChrome?: boolean
  /** Per-instance label from the matched route params (e.g. the project id). */
  labelFor?: (params: Record<string, string | undefined>) => string
}

export const POPOUT_ENTRIES: PopoutEntry[] = [
  { path: '/planning-queue', label: 'Planning — Wachtrij', Component: PlanningQueuePage, hideChrome: true },
  { path: '/prognose', label: 'Planning — Prognose', Component: PrognosePage },
  { path: '/todos', label: 'Planning — ToDo', Component: TodosPage },
  { path: '/projecten/:id', label: 'Project', Component: ProjectDetailPage, labelFor: p => `Project ${p.id ?? ''}`.trim() },
]

/** Resolve a de-prefixed pop path (e.g. "/projecten/PRJ-1") to its entry + params. */
export function resolvePopout(path: string): { entry: PopoutEntry; params: Record<string, string | undefined> } | null {
  for (const entry of POPOUT_ENTRIES) {
    const m = matchPath(entry.path, path)
    if (m) return { entry, params: m.params }
  }
  return null
}
