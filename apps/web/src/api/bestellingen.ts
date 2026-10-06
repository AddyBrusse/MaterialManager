import type {
  BestelRegel, BestelRegelInvoer, BestelRegelWijzig, BestelStatus, KeuzeInvoer, VergelijkData,
  Prijsaanvraag, PrijsaanvraagInvoer, AntwoordInvoer,
} from '@stockmanager/shared'
import { apiFetch } from './client'

/** Inkoop (2026-10-06): bestelregels. Zie apps/api/src/services/bestellingen.ts. */
export const bestelRegelsApi = {
  list: (status?: BestelStatus) =>
    apiFetch<BestelRegel[]>(`/bestel-regels${status ? `?status=${status}` : ''}`).then((r) => r.data),
  voorProject: (projectId: string) =>
    apiFetch<BestelRegel[]>(`/bestel-regels?projectId=${encodeURIComponent(projectId)}`).then((r) => r.data),
  vergelijk: (ids: string[]) =>
    apiFetch<VergelijkData>(`/bestel-regels/vergelijk?ids=${ids.map(encodeURIComponent).join(',')}`).then((r) => r.data),
  create: (body: BestelRegelInvoer) =>
    apiFetch<BestelRegel>('/bestel-regels', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),
  update: (id: string, body: BestelRegelWijzig) =>
    apiFetch<BestelRegel>(`/bestel-regels/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r.data),
  remove: (id: string) => apiFetch<{ id: string }>(`/bestel-regels/${id}`, { method: 'DELETE' }),
  kies: (id: string, body: KeuzeInvoer) =>
    apiFetch<{ regel: BestelRegel; prijsBewaard: { gelukt: boolean; reden?: string } | null }>(
      `/bestel-regels/${id}/keuze`, { method: 'PUT', body: JSON.stringify(body) },
    ).then((r) => r.data),
  wisKeuze: (id: string) =>
    apiFetch<BestelRegel>(`/bestel-regels/${id}/keuze`, { method: 'DELETE' }).then((r) => r.data),
}

export const prijsaanvragenApi = {
  list: () => apiFetch<Prijsaanvraag[]>('/prijsaanvragen').then((r) => r.data),
  create: (body: PrijsaanvraagInvoer) =>
    apiFetch<Prijsaanvraag>('/prijsaanvragen', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),
  verzonden: (id: string, leverancierId: string) =>
    apiFetch<Prijsaanvraag>(`/prijsaanvragen/${id}/verzonden`, { method: 'POST', body: JSON.stringify({ leverancierId }) }).then((r) => r.data),
  antwoorden: (id: string, leverancierId: string, antwoorden: AntwoordInvoer[]) =>
    apiFetch<Prijsaanvraag>(`/prijsaanvragen/${id}/antwoorden/${leverancierId}`, { method: 'PUT', body: JSON.stringify({ antwoorden }) }).then((r) => r.data),
  remove: (id: string) => apiFetch<{ id: string }>(`/prijsaanvragen/${id}`, { method: 'DELETE' }),
}

/** Alles wat na een wijziging opnieuw gelezen moet worden. */
export const BESTEL_SLEUTELS = [['bestel-regels'], ['prijsaanvragen'], ['vergelijk'], ['leverancier-prijzen']] as const
