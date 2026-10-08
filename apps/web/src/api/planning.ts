import type { Blokkade, Herberekening, HerberekenInvoer } from '@stockmanager/shared'
import { apiFetch } from './client'

/** Automatisch plannen (2026-10-08): vastleggen en terugzetten gebeurt op de server, in één keer. */
export const planningApi = {
  lijst: (limit = 10) => apiFetch<Herberekening[]>(`/planning/herberekeningen?limit=${limit}`).then((r) => r.data),
  herbereken: (invoer: HerberekenInvoer) =>
    apiFetch<Herberekening>('/planning/herberekeningen', { method: 'POST', body: JSON.stringify(invoer) }).then((r) => r.data),
  blokkades: (id: string) => apiFetch<Blokkade[]>(`/planning/herberekeningen/${id}/blokkades`).then((r) => r.data),
  ongedaan: (id: string, wis: boolean) =>
    apiFetch<{ herberekening: Herberekening; projectIds: string[] }>(
      `/planning/herberekeningen/${id}/ongedaan`, { method: 'POST', body: JSON.stringify({ wis }) },
    ).then((r) => r.data),
}
