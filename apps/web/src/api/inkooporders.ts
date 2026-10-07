import type { Inkooporder, Ontvangst, OntvangstInvoer } from '@stockmanager/shared'
import { apiFetch } from './client'

/** Inkooporders en ontvangen (2026-10-06, deel 3b). Zie apps/api/src/services/inkooporders.ts. */
export const inkoopordersApi = {
  list: () => apiFetch<Inkooporder[]>('/inkooporders').then((r) => r.data),
  maak: (regelIds: string[]) =>
    apiFetch<Inkooporder[]>('/inkooporders', { method: 'POST', body: JSON.stringify({ regelIds }) }).then((r) => r.data),
  regelEraf: (id: string, regelId: string) =>
    apiFetch<Inkooporder | null>(`/inkooporders/${id}/regels/${regelId}`, { method: 'DELETE' }).then((r) => r.data),
  verwijder: (id: string) => apiFetch<{ id: string }>(`/inkooporders/${id}`, { method: 'DELETE' }),
  verzonden: (id: string) => apiFetch<Inkooporder>(`/inkooporders/${id}/verzonden`, { method: 'POST' }).then((r) => r.data),
  trekIn: (id: string, reden: string) =>
    apiFetch<Inkooporder>(`/inkooporders/${id}/intrekken`, { method: 'POST', body: JSON.stringify({ reden }) }).then((r) => r.data),
  ontvangsten: () => apiFetch<Ontvangst[]>('/inkooporders/ontvangsten').then((r) => r.data),
  ontvang: (body: OntvangstInvoer) =>
    apiFetch<Ontvangst>('/inkooporders/ontvangsten', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),
}

/** Wat er na een inkoophandeling opnieuw gelezen moet worden. */
export const INKOOP_SLEUTELS = ['inkooporders', 'ontvangsten', 'bestel-regels', 'vergelijk', 'raw-materials', 'reservations', 'inkoop', 'prijsaanvragen', 'bestel-geschiedenis'] as const
