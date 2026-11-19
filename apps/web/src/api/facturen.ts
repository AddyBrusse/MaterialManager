import type {
  ArtikelVerkoopInfo, LosseCreditInvoer, LosseFactuurInvoer, LosseFactuurWijzig, VerkoopFactuur,
} from '@stockmanager/shared'
import { apiFetch } from './client'

/**
 * De pagina Facturen (2026-11-18): alle facturen en credits, en de losse (bij
 * de klant, zonder project). Niet optimistisch: het nummer, de voorraad en de
 * credit-regels rekent de server; het scherm wacht op het antwoord.
 */
const post = <T>(pad: string, body: unknown = {}) =>
  apiFetch<T>(pad, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data)

export const facturenApi = {
  list: async (): Promise<VerkoopFactuur[]> => (await apiFetch<VerkoopFactuur[]>('/facturen')).data,
  /** Per artikel van de klant: vrije voorraad, klaar voor orders en de laatste prijs. */
  verkoopInfo: async (relatieId: string): Promise<ArtikelVerkoopInfo[]> =>
    (await apiFetch<ArtikelVerkoopInfo[]>(`/facturen/prijzen?relatieId=${encodeURIComponent(relatieId)}`)).data,
  maak: (invoer: LosseFactuurInvoer) => post<VerkoopFactuur>('/facturen', invoer),
  maakCredit: (invoer: LosseCreditInvoer) => post<VerkoopFactuur>('/facturen/credit', invoer),
  wijzig: async (id: string, patch: LosseFactuurWijzig): Promise<VerkoopFactuur> =>
    (await apiFetch<VerkoopFactuur>(`/facturen/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })).data,
  verwijder: async (id: string): Promise<void> => {
    await apiFetch<null>(`/facturen/${id}`, { method: 'DELETE' })
  },
  nummer: (id: string, naarEmail: string | null) => post<VerkoopFactuur>(`/facturen/${id}/nummer`, { naarEmail }),
  nummerTerug: (id: string) => post<VerkoopFactuur>(`/facturen/${id}/nummer-terug`),
  verzend: (id: string, naarEmail: string | null) => post<VerkoopFactuur>(`/facturen/${id}/verzend`, { naarEmail }),
  betaald: (id: string, betaald: boolean) => post<VerkoopFactuur>(`/facturen/${id}/betaald`, { betaald }),
}
