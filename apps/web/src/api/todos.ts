import type { Todo, CreateTodo, UpdateTodo } from '@stockmanager/shared'
import { apiFetch } from './client'

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
}
