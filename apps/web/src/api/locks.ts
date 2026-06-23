import type { Lock, ItemType } from '@stockmanager/shared'
import { apiFetch } from './client'

export const locksApi = {
  get: (itemId: string, itemType: ItemType) =>
    apiFetch<Lock | null>(`/locks/${itemId}?itemType=${itemType}`),

  acquire: (itemId: string, itemType: ItemType) =>
    apiFetch<{ acquired: true }>(`/locks/${itemId}/acquire`, {
      method: 'POST', body: JSON.stringify({ itemType }),
    }),

  heartbeat: (itemId: string, itemType: ItemType) =>
    apiFetch<{ ok: true }>(`/locks/${itemId}/heartbeat`, {
      method: 'POST', body: JSON.stringify({ itemType }),
    }),

  release: (itemId: string, itemType: ItemType) =>
    apiFetch<void>(`/locks/${itemId}/release`, {
      method: 'POST', body: JSON.stringify({ itemType }),
    }),
}
