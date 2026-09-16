import type { Lock, LockItemType } from '@stockmanager/shared'
import { apiFetch } from './client'

export const locksApi = {
  get: (itemId: string, itemType: LockItemType) =>
    apiFetch<Lock | null>(`/locks/${itemId}?itemType=${itemType}`),

  acquire: (itemId: string, itemType: LockItemType) =>
    apiFetch<{ acquired: true }>(`/locks/${itemId}/acquire`, {
      method: 'POST', body: JSON.stringify({ itemType }),
    }),

  heartbeat: (itemId: string, itemType: LockItemType) =>
    apiFetch<{ ok: true }>(`/locks/${itemId}/heartbeat`, {
      method: 'POST', body: JSON.stringify({ itemType }),
    }),

  release: (itemId: string, itemType: LockItemType) =>
    apiFetch<void>(`/locks/${itemId}/release`, {
      method: 'POST', body: JSON.stringify({ itemType }),
    }),

  /**
   * Het slot van iemand anders weghalen. Alleen voor een beheerder — de server
   * eist dat ook.
   *
   * Dit bestond al aan de serverkant maar was nergens aan te roepen, en dan is
   * een project dat op slot staat door een sessie die niet meer bestaat
   * voorgoed alleen-lezen. Precies wat er gebeurt als een browser wordt
   * afgesloten zonder dat `release` nog langskomt.
   */
  forceRelease: (itemId: string, itemType: LockItemType) =>
    apiFetch<void>(`/locks/${itemId}/force-release`, {
      method: 'POST', body: JSON.stringify({ itemType }),
    }),

  /** Vragen of de houder het slot wil loslaten (voor wie geen beheerder is). */
  request: (itemId: string, itemType: LockItemType) =>
    apiFetch<{ ok: true }>(`/locks/${itemId}/request`, {
      method: 'POST', body: JSON.stringify({ itemType }),
    }),
}
