import { apiFetch } from './client'

/**
 * Reserveringen komen van de server, niet uit localStorage.
 *
 * Tot 2026-09-11 hield dit bestand een eigen kopie in `localStorage` bij en
 * werd de server er fire-and-forget achteraan gestuurd (`.catch(() => {})`).
 * Twee dingen gingen daar mis: een mislukte call merkte niemand, en de
 * frontend verzon zelf een id terwijl de server zijn eigen id maakte — een
 * reservering afboeken in dezelfde sessie ging dan naar een id dat de server
 * niet kende, en de reservering bleef open in de database terwijl het scherm
 * 'klaar' zei.
 */

export type ReservationStatus = 'open' | 'in_progress' | 'done' | 'geannuleerd'

/** Deze twee houden materiaal vast; done en geannuleerd niet. Moet gelijk
 *  blijven aan `OPEN_STATUSSEN` in `apps/api/src/services/voorraad.ts`. */
export const OPEN_STATUSSEN: ReservationStatus[] = ['open', 'in_progress']

export function houdtVast(r: { status: ReservationStatus }): boolean {
  return OPEN_STATUSSEN.includes(r.status)
}

export interface ZaagReservation {
  id: string
  calculatieNr: string
  // Waar dit materiaal voor vastligt. Beide optioneel: er wordt ook gezaagd voor
  // werk dat geen project is (voorraad, intern).
  projectId: string | null
  artikelId: string | null
  barId: string
  barCode: string
  barLocation: string
  barVorm: string
  pieces: number
  productLen: number
  sawLength: number
  fysiekeLengte: number
  materiaal: string
  diameter: number
  werkstukLengte: number
  steekbreedte: number
  vlakToeslag: number
  machine: string
  createdAt: string
  priority: number | null      // planner sets order (1 = highest); null = no priority
  rush: boolean                // planner "Spoed" flag — rush jobs jump the queue
  status: ReservationStatus
  restLengteMm: number | null  // gemeten rest na het zagen (gezet bij afboeken)
  completedAt: string | null
}

export type CreateReservationInput = Omit<
  ZaagReservation,
  'id' | 'createdAt' | 'priority' | 'rush' | 'status' | 'restLengteMm' | 'completedAt'
>

export interface Beschikbaarheid {
  fysiekMm: number
  gereserveerdMm: number
  vrijMm: number
}

export interface AfboekResultaat {
  reservering: ZaagReservation
  mutatieId: string
  schroot: boolean
  vorigeVoorraadMm: number
  nieuweVoorraadMm: number
}

export const reservationsApi = {
  list: () => apiFetch<ZaagReservation[]>('/reservations').then((r) => r.data),

  listVoorProject: (projectId: string) =>
    apiFetch<ZaagReservation[]>(`/reservations?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.data),

  /** De hele batch in één verzoek: de server legt hem tegen de vrije lengte en
   *  weigert de hele set als er één staaf te krap is. */
  create: (items: CreateReservationInput[]) =>
    apiFetch<ZaagReservation[]>('/reservations', {
      method: 'POST', body: JSON.stringify(items),
    }).then((r) => r.data),

  remove: (id: string) => apiFetch<void>(`/reservations/${id}`, { method: 'DELETE' }),

  setPriority: (id: string, priority: number | null) =>
    apiFetch<ZaagReservation>(`/reservations/${id}/priority`, {
      method: 'PATCH', body: JSON.stringify({ priority }),
    }).then((r) => r.data),

  applyPlan: (jobs: { ids: string[]; rush: boolean }[]) =>
    apiFetch<ZaagReservation[]>('/reservations/plan', {
      method: 'POST', body: JSON.stringify({ jobs }),
    }).then((r) => r.data),

  /** Alleen heen en weer tussen open en in_progress — afsluiten gaat via
   *  afboeken of annuleren, zodat de voorraad meebeweegt. */
  setStatus: (id: string, status: 'open' | 'in_progress') =>
    apiFetch<ZaagReservation>(`/reservations/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    }).then((r) => r.data),

  /** Eén verzoek, één transactie: staaf korter, mutatie vastgelegd, reservering
   *  gesloten. Mislukt er iets, dan gebeurt er niets van dit alles. */
  afboeken: (id: string, body: { restLengteMm: number | null; schroot?: boolean; note?: string }) =>
    apiFetch<AfboekResultaat>(`/reservations/${id}/afboeken`, {
      method: 'POST', body: JSON.stringify(body),
    }).then((r) => r.data),

  /** Materiaal vrijgeven zonder af te boeken. */
  annuleer: (id: string) =>
    apiFetch<ZaagReservation>(`/reservations/${id}/annuleer`, { method: 'POST' })
      .then((r) => r.data),

  beschikbaarheid: (barId: string) =>
    apiFetch<Beschikbaarheid>(`/reservations/beschikbaarheid/${barId}`).then((r) => r.data),
}
