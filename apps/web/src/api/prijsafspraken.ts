import type { Prijsafspraak, PrijsafspraakInvoer } from '@stockmanager/shared'
import { apiFetch } from './client'

/**
 * Prijsafspraken per artikel (2026-11-18). Regels en voorwaarden staan in
 * `packages/shared/calc/prijsafspraak.ts`; de server vraagt ze nog eens.
 */
export const prijsafsprakenApi = {
  /** Alle afspraken, of die van één artikel of van de artikelen van één klant. */
  list: async (filter: { artikelId?: string; relatieId?: string } = {}): Promise<Prijsafspraak[]> => {
    const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => !!v) as [string, string][]).toString()
    return (await apiFetch<Prijsafspraak[]>(`/prijsafspraken${q ? `?${q}` : ''}`)).data
  },
  maak: async (invoer: PrijsafspraakInvoer): Promise<Prijsafspraak> =>
    (await apiFetch<Prijsafspraak>('/prijsafspraken', { method: 'POST', body: JSON.stringify(invoer) })).data,
  wijzig: async (id: string, patch: Partial<Omit<PrijsafspraakInvoer, 'artikelId'>>): Promise<Prijsafspraak> =>
    (await apiFetch<Prijsafspraak>(`/prijsafspraken/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })).data,
  verwijder: async (id: string): Promise<void> => {
    await apiFetch<null>(`/prijsafspraken/${id}`, { method: 'DELETE' })
  },
}
