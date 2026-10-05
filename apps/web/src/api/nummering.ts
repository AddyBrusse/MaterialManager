import type { DocPrefix, DocReeksStand, DocReeksWijziging, NummerWijzig } from '@stockmanager/shared'
import { apiFetch } from './client'

export const nummeringApi = {
  /** De stand van de nummerreeksen van dit jaar. */
  stand: () => apiFetch<DocReeksStand[]>('/sequences').then((r) => r.data),
  /** De laatste 50 handmatige wijzigingen, nieuwste eerst. */
  wijzigingen: () => apiFetch<DocReeksWijziging[]>('/sequences/wijzigingen').then((r) => r.data),
  /** Het volgende nummer van dit jaar zetten — alleen een admin. */
  zet: (prefix: DocPrefix, body: NummerWijzig) =>
    apiFetch<DocReeksStand>(`/sequences/${prefix}`, { method: 'PUT', body: JSON.stringify(body) }).then((r) => r.data),
}
