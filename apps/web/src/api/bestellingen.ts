import type {
  BestelRegel, BestelRegelInvoer, BestelRegelWijzig, BestelStatus, KeuzeInvoer, VergelijkData,
  Prijsaanvraag, PrijsaanvraagInvoer, AntwoordInvoer, AntwoordCel, LeveranciersZetten,
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
  // Tabbladen (2026-10-07)
  zetLeveranciers: (body: LeveranciersZetten) =>
    apiFetch<BestelRegel[]>('/bestel-regels/leveranciers', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),
  naarBuffer: (regelIds: string[]) =>
    apiFetch<BestelRegel[]>('/bestel-regels/naar-buffer', { method: 'POST', body: JSON.stringify({ regelIds }) }).then((r) => r.data),
  terug: (id: string) => apiFetch<BestelRegel>(`/bestel-regels/${id}/terug`, { method: 'POST' }).then((r) => r.data),
  goedkoopste: (regelIds: string[]) =>
    apiFetch<{ gekozen: number; zonderPrijs: string[] }>('/bestel-regels/goedkoopste', { method: 'POST', body: JSON.stringify({ regelIds }) }).then((r) => r.data),
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
  perLeverancier: (regelIds: string[], leverancierIds?: string[]) =>
    apiFetch<Prijsaanvraag[]>('/prijsaanvragen/per-leverancier', { method: 'POST', body: JSON.stringify({ regelIds, leverancierIds }) }).then((r) => r.data),
  verzondenAlle: (ids: string[]) =>
    apiFetch<Prijsaanvraag[]>('/prijsaanvragen/verzonden', { method: 'POST', body: JSON.stringify({ ids }) }).then((r) => r.data),
  cel: (id: string, leverancierId: string, regelId: string, cel: AntwoordCel) =>
    apiFetch<Prijsaanvraag>(`/prijsaanvragen/${id}/antwoorden/${leverancierId}/regels/${regelId}`, { method: 'PUT', body: JSON.stringify(cel) }).then((r) => r.data),
}

/** Alles wat na een wijziging opnieuw gelezen moet worden. */
export const BESTEL_SLEUTELS = [['bestel-regels'], ['prijsaanvragen'], ['vergelijk'], ['leverancier-prijzen'], ['inkoop'], ['bestel-geschiedenis']] as const
