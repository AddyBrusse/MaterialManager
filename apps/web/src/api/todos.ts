import type { Todo, CreateTodo, UpdateTodo, CreateVerbeterpunt } from '@stockmanager/shared'
import { apiFetch, apiBestand } from './client'

export const todosApi = {
  list: () => apiFetch<Todo[]>('/todos'),
  create: (body: CreateTodo) => apiFetch<Todo>('/todos', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: UpdateTodo) =>
    apiFetch<Todo>(`/todos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  claim: (id: string) => apiFetch<Todo>(`/todos/${id}/claim`, { method: 'PATCH' }),
  complete: (id: string, done: boolean) =>
    apiFetch<Todo>(`/todos/${id}/complete`, { method: 'PATCH', body: JSON.stringify({ done }) }),
  setCalendarEvent: (id: string, calendarEventId: string) =>
    apiFetch<Todo>(`/todos/${id}/calendar-event`, { method: 'PATCH', body: JSON.stringify({ calendarEventId }) }),
  remove: (id: string) => apiFetch<void>(`/todos/${id}`, { method: 'DELETE' }),

  /** Knop "Dit klopt niet": de gegevens plus (optioneel) de schermafbeelding in één verzoek. */
  verbeterpunt: (gegevens: CreateVerbeterpunt, schermafbeelding: Blob | null) => {
    const form = new FormData()
    form.append('gegevens', JSON.stringify(gegevens))
    if (schermafbeelding) form.append('schermafbeelding', schermafbeelding, `schermafbeelding.${schermafbeelding.type.split('/')[1] ?? 'png'}`)
    // Een paar MB over het netwerk: ruimer dan de 3 s van een gewone aanroep.
    return apiFetch<Todo>('/todos/verbeterpunt', { method: 'POST', body: form, timeoutMs: 30_000 })
  },
  exporteerVerbeterpunten: () => apiBestand('/todos/verbeterpunten/export'),
}

/** Een verbeterpunt is werk aan het programma, geen werk in de werkplaats. */
export const isVerbeterpunt = (t: Pick<Todo, 'soort'>) => t.soort === 'verbeterpunt'
