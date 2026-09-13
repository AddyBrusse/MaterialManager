import { apiFetch } from './client'
import type { TijdSoort, TijdStatus } from '@stockmanager/shared'

/**
 * Een tijdregistratie zoals de server hem teruggeeft.
 *
 * `seconden` is afgeleid en komt van de server mee: de effectieve duur op dit
 * moment, correctie inbegrepen. Het scherm rekent dat niet zelf uit — anders
 * tonen de wachtrij en de terminal een ander getal voor dezelfde regel.
 */
export interface TijdRegistratieDTO {
  id: string
  stapId: string
  orderId: string
  projectId: string
  artikelId: string | null
  artikelNaam: string
  soort: TijdSoort
  bemand: boolean
  status: TijdStatus
  machineNaam: string | null
  userId: string | null
  userNaam: string | null
  gestartOp: string
  lopendSinds: string | null
  gestoptOp: string | null
  gemetenSeconden: number
  bijgesteldeSeconden: number | null
  correctieReden: string | null
  correctieDoor: string | null
  correctieOp: string | null
  aantalStuks: number | null
  notitie: string | null
  createdAt: string
  updatedAt: string
  seconden: number
  gecorrigeerd: boolean
}

export const tijdregistratieApi = {
  lopend: () => apiFetch<TijdRegistratieDTO[]>('/tijdregistratie/lopend').then((r) => r.data),

  dag: (datum?: string) =>
    apiFetch<TijdRegistratieDTO[]>(`/tijdregistratie/dag${datum ? `?datum=${datum}` : ''}`).then((r) => r.data),

  perStap: (stapId: string) =>
    apiFetch<TijdRegistratieDTO[]>(`/tijdregistratie/stap/${stapId}`).then((r) => r.data),

  perOrder: (orderId: string) =>
    apiFetch<TijdRegistratieDTO[]>(`/tijdregistratie/order/${orderId}`).then((r) => r.data),

  start: (body: {
    stapId: string; soort: TijdSoort; bemand: boolean
    operatorId?: string | null; notitie?: string | null
  }) =>
    apiFetch<TijdRegistratieDTO>('/tijdregistratie/start', {
      method: 'POST', body: JSON.stringify(body),
    }).then((r) => r.data),

  pauze: (id: string) =>
    apiFetch<TijdRegistratieDTO>(`/tijdregistratie/${id}/pauze`, { method: 'POST' }).then((r) => r.data),

  hervat: (id: string) =>
    apiFetch<TijdRegistratieDTO>(`/tijdregistratie/${id}/hervat`, { method: 'POST' }).then((r) => r.data),

  /** Wisselen sluit de lopende regel af en begint een nieuwe. */
  wissel: (id: string, naar: { soort?: TijdSoort; bemand?: boolean; operatorId?: string | null }) =>
    apiFetch<TijdRegistratieDTO>(`/tijdregistratie/${id}/wissel`, {
      method: 'POST', body: JSON.stringify(naar),
    }).then((r) => r.data),

  stop: (id: string, body: { aantalStuks?: number | null; notitie?: string | null } = {}) =>
    apiFetch<TijdRegistratieDTO>(`/tijdregistratie/${id}/stop`, {
      method: 'POST', body: JSON.stringify(body),
    }).then((r) => r.data),

  corrigeer: (id: string, body: { bijgesteldeSeconden: number; reden: string; aantalStuks?: number | null }) =>
    apiFetch<TijdRegistratieDTO>(`/tijdregistratie/${id}/corrigeer`, {
      method: 'POST', body: JSON.stringify(body),
    }).then((r) => r.data),

  verwijder: (id: string, reden: string) =>
    apiFetch<void>(`/tijdregistratie/${id}`, {
      method: 'DELETE', body: JSON.stringify({ reden }),
    }).then((r) => r.data),
}
