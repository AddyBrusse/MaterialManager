import type { GeschiedenisItem, Inkooporder, InkoopMelding, InkoopOverzicht } from '@stockmanager/shared'
import { apiFetch } from './client'

/** Inkoopoverzicht en bestellen in één keer (2026-10-07). Zie apps/api/src/services/inkoop-overzicht.ts. */
export const inkoopApi = {
  overzicht: (projectId?: string) =>
    apiFetch<InkoopOverzicht>(`/inkoop/overzicht${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`).then((r) => r.data),
  meldingen: () => apiFetch<{ aantal: number; meldingen: InkoopMelding[] }>('/inkoop/meldingen').then((r) => r.data),
  bestellen: (regelIds: string[]) =>
    apiFetch<Inkooporder[]>('/inkooporders/bestellen', { method: 'POST', body: JSON.stringify({ regelIds }) }).then((r) => r.data),
  verzondenAlle: (ids: string[]) =>
    apiFetch<Inkooporder[]>('/inkooporders/verzonden', { method: 'POST', body: JSON.stringify({ ids }) }).then((r) => r.data),
  leverdatum: (id: string, regelId: string, verwachtDatum: string | null) =>
    apiFetch<Inkooporder>(`/inkooporders/${id}/regels/${regelId}/leverdatum`, { method: 'PATCH', body: JSON.stringify({ verwachtDatum }) }).then((r) => r.data),
  geschiedenis: (regelId: string) => apiFetch<GeschiedenisItem[]>(`/bestel-regels/${regelId}/geschiedenis`).then((r) => r.data),
}
