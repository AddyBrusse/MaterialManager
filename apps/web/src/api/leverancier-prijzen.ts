import type { LeverancierPrijs, LeverancierPrijsInvoer } from '@stockmanager/shared'
import { apiFetch } from './client'

export interface PrijsFilter {
  rawMaterialId?: string
  gradeId?: string
  leverancierId?: string
}

/** Prijzen per leverancier (2026-10-06), per materiaal of per kwaliteit. */
export const leverancierPrijzenApi = {
  list: (f: PrijsFilter) => {
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString()
    return apiFetch<LeverancierPrijs[]>(`/leverancier-prijzen${q ? `?${q}` : ''}`).then((r) => r.data)
  },
  create: (body: LeverancierPrijsInvoer) =>
    apiFetch<LeverancierPrijs>('/leverancier-prijzen', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),
  update: (id: string, body: LeverancierPrijsInvoer) =>
    apiFetch<LeverancierPrijs>(`/leverancier-prijzen/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then((r) => r.data),
  remove: (id: string) => apiFetch<void>(`/leverancier-prijzen/${id}`, { method: 'DELETE' }),
}
