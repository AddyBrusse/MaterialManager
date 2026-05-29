import type { User, CreateUser, UpdateUser } from '@stockmanager/shared'
import { apiFetch } from './client'

export const usersApi = {
  list: () => apiFetch<User[]>('/users'),
  create: (body: CreateUser) =>
    apiFetch<User>('/users', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: UpdateUser) =>
    apiFetch<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => apiFetch<void>(`/users/${id}`, { method: 'DELETE' }),
}
