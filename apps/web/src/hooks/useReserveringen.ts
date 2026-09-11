import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import {
  reservationsApi, houdtVast,
  type CreateReservationInput, type ZaagReservation,
} from '../api/reservations'

/**
 * Reserveringen, voor elk scherm hetzelfde.
 *
 * Elke mutatie ververst óók `raw-materials`: reserveren verandert wat er vrij
 * is, afboeken verandert wat er ligt. Zouden die twee uit elkaar lopen, dan
 * toont het ene scherm een staaf die het andere al opgebruikt heeft.
 */

export const RESERVERINGEN_KEY = ['reservations'] as const

export function useReserveringen() {
  return useQuery({ queryKey: RESERVERINGEN_KEY, queryFn: reservationsApi.list })
}

/** Alleen wat nog materiaal vasthoudt. */
export function useOpenReserveringen() {
  const q = useReserveringen()
  return { ...q, data: (q.data ?? []).filter(houdtVast) }
}

function ververs(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: RESERVERINGEN_KEY })
  qc.invalidateQueries({ queryKey: ['raw-materials'] })
  qc.invalidateQueries({ queryKey: ['movements'] })
}

/** De melding die de server stuurde, of een leesbare terugval. Zonder dit
 *  staat er "Er ging iets mis" terwijl de server precies vertelde wélke staaf
 *  te krap is en hoeveel er nog vrij was. */
function meldFout(titel: string) {
  return (e: unknown) => {
    notifications.show({
      color: 'red', title: titel,
      message: e instanceof Error && e.message ? e.message : 'Onbekende fout',
    })
  }
}

export function useReserveren() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (items: CreateReservationInput[]) => reservationsApi.create(items),
    onSuccess: (gemaakt: ZaagReservation[]) => {
      ververs(qc)
      notifications.show({
        color: 'green', title: 'Gereserveerd',
        message: `${gemaakt.length} ${gemaakt.length === 1 ? 'staaf' : 'staven'} vastgelegd`,
      })
    },
    onError: meldFout('Reserveren mislukt'),
  })
}

export function useAfboeken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; restLengteMm: number | null; schroot?: boolean; note?: string }) =>
      reservationsApi.afboeken(v.id, { restLengteMm: v.restLengteMm, schroot: v.schroot, note: v.note }),
    onSuccess: () => ververs(qc),
    onError: meldFout('Afboeken mislukt'),
  })
}

export function useAnnuleerReservering() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => reservationsApi.annuleer(id),
    onSuccess: () => {
      ververs(qc)
      notifications.show({ message: 'Reservering geannuleerd, materiaal is weer vrij' })
    },
    onError: meldFout('Annuleren mislukt'),
  })
}

export function useVerwijderReservering() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => reservationsApi.remove(id),
    onSuccess: () => ververs(qc),
    onError: meldFout('Verwijderen mislukt'),
  })
}

export function useZetReserveringStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; status: 'open' | 'in_progress' }) =>
      reservationsApi.setStatus(v.id, v.status),
    onSuccess: () => ververs(qc),
    onError: meldFout('Status bijwerken mislukt'),
  })
}

export function useZetPrioriteit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; priority: number | null }) =>
      reservationsApi.setPriority(v.id, v.priority),
    onSuccess: () => ververs(qc),
    onError: meldFout('Prioriteit bijwerken mislukt'),
  })
}

export function useZaagplanOpslaan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (jobs: { ids: string[]; rush: boolean }[]) => reservationsApi.applyPlan(jobs),
    onSuccess: () => ververs(qc),
    onError: meldFout('Planning opslaan mislukt'),
  })
}
