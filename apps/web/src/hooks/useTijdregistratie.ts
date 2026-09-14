import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { tijdregistratieApi, type TijdRegistratieDTO } from '../api/tijdregistratie'
import { effectieveSeconden } from '@stockmanager/shared'

export const TIJD_LOPEND_KEY = ['tijdregistratie', 'lopend'] as const
export const TIJD_DAG_KEY = ['tijdregistratie', 'dag'] as const

/**
 * Hoe vaak we de server vragen wat er loopt.
 *
 * Vijf seconden, net als de rest van de app (geen WebSocket — zie CLAUDE.md).
 * De klok op het scherm tikt daartussendoor lokaal door; zie `useKlok`. Zou het
 * scherm alleen op de server wachten, dan zou een draaiende klok met horten en
 * stoten lopen.
 */
const POLL_MS = 5_000

export function useLopendeTijd() {
  return useQuery({
    queryKey: TIJD_LOPEND_KEY,
    queryFn: tijdregistratieApi.lopend,
    refetchInterval: POLL_MS,
  })
}

export function useTijdVanDag(datum?: string) {
  return useQuery({
    queryKey: [...TIJD_DAG_KEY, datum ?? 'vandaag'],
    queryFn: () => tijdregistratieApi.dag(datum),
    refetchInterval: POLL_MS,
  })
}

export function useTijdVanStap(stapId: string | null) {
  return useQuery({
    queryKey: ['tijdregistratie', 'stap', stapId],
    queryFn: () => tijdregistratieApi.perStap(stapId!),
    enabled: !!stapId,
  })
}

export function useTijdVanOrder(orderId: string | null) {
  return useQuery({
    queryKey: ['tijdregistratie', 'order', orderId],
    queryFn: () => tijdregistratieApi.perOrder(orderId!),
    enabled: !!orderId,
  })
}

/**
 * De klok die je op het scherm ziet lopen.
 *
 * Rekent lokaal door tussen twee polls, maar leidt de waarde elke seconde af
 * uit `lopendSinds` en niet uit een eigen teller: een teller die optelt drijft
 * weg zodra het tabblad in de achtergrond staat en de browser de timer
 * vertraagt, en toont dan minder tijd dan er werkelijk verstreken is.
 */
export function useKlok(registratie: TijdRegistratieDTO | null | undefined): number {
  const [, tik] = useState(0)
  const loopt = registratie?.status === 'lopend'

  useEffect(() => {
    if (!loopt) return
    const t = setInterval(() => tik((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [loopt])

  if (!registratie) return 0
  return effectieveSeconden({
    gemetenSeconden: registratie.gemetenSeconden,
    bijgesteldeSeconden: registratie.bijgesteldeSeconden,
    lopendSinds: registratie.lopendSinds,
  })
}

function ververs(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['tijdregistratie'] })
  // De nacalculatie leest dezelfde uren; zou hij blijven staan, dan toont het
  // ene tabblad een order die het andere net afgemeld heeft.
  qc.invalidateQueries({ queryKey: ['nacalculatie'] })
}

/** De melding die de server stuurde, niet een algemene "er ging iets mis". */
function meldFout(titel: string) {
  return (e: unknown) => {
    notifications.show({
      color: 'red', title: titel,
      message: e instanceof Error ? e.message : 'Onbekende fout',
    })
  }
}

export function useTijdActies() {
  const qc = useQueryClient()
  const na = { onSuccess: () => ververs(qc) }

  const start = useMutation({
    mutationFn: tijdregistratieApi.start,
    ...na, onError: meldFout('Klok starten mislukt'),
  })
  const pauze = useMutation({
    mutationFn: tijdregistratieApi.pauze,
    ...na, onError: meldFout('Pauzeren mislukt'),
  })
  const hervat = useMutation({
    mutationFn: tijdregistratieApi.hervat,
    ...na, onError: meldFout('Hervatten mislukt'),
  })
  const wissel = useMutation({
    mutationFn: (v: { id: string; naar: Parameters<typeof tijdregistratieApi.wissel>[1] }) =>
      tijdregistratieApi.wissel(v.id, v.naar),
    ...na, onError: meldFout('Wisselen mislukt'),
  })
  const stop = useMutation({
    mutationFn: (v: { id: string; aantalStuks?: number | null; notitie?: string | null }) =>
      tijdregistratieApi.stop(v.id, { aantalStuks: v.aantalStuks, notitie: v.notitie }),
    ...na, onError: meldFout('Afronden mislukt'),
  })
  const corrigeer = useMutation({
    mutationFn: (v: { id: string; bijgesteldeSeconden: number; reden: string; aantalStuks?: number | null }) =>
      tijdregistratieApi.corrigeer(v.id, v),
    onSuccess: () => {
      ververs(qc)
      notifications.show({
        color: 'green', title: 'Tijd bijgesteld',
        message: 'De gemeten tijd blijft bewaard naast de correctie.',
      })
    },
    onError: meldFout('Bijstellen mislukt'),
  })

  return { start, pauze, hervat, wissel, stop, corrigeer }
}
