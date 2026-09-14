import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { nacalculatieApi } from '../api/nacalculatie'

export function useProjectNacalculatie(projectId: string | null) {
  return useQuery({
    queryKey: ['nacalculatie', 'project', projectId],
    queryFn: () => nacalculatieApi.project(projectId!),
    enabled: !!projectId,
  })
}

export function useOrderNacalculatie(orderId: string | null) {
  return useQuery({
    queryKey: ['nacalculatie', 'order', orderId],
    queryFn: () => nacalculatieApi.order(orderId!),
    enabled: !!orderId,
  })
}

export function useArtikelNacalculatie(artikelId: string | null) {
  return useQuery({
    queryKey: ['nacalculatie', 'artikel', artikelId],
    queryFn: () => nacalculatieApi.artikel(artikelId!),
    enabled: !!artikelId,
  })
}

/** Voor de artikelenlijst: één regel per artikel, in één verzoek. */
export function useArtikelSamenvattingen() {
  return useQuery({
    queryKey: ['nacalculatie', 'artikelen'],
    queryFn: nacalculatieApi.artikelen,
  })
}

/**
 * De norm bijstellen.
 *
 * Ververst behalve de nacalculatie ook het artikel zelf en zijn prijshistorie:
 * de bijstelling verandert de calculatie én zet een punt in het prijsverloop, en
 * die twee schermen zouden anders de oude waarde blijven tonen.
 */
export function useStelNormBij() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { artikelId: string; instelMin?: number; cycleMinPerStuk?: number }) =>
      nacalculatieApi.stelNormBij(v.artikelId, {
        instelMin: v.instelMin, cycleMinPerStuk: v.cycleMinPerStuk,
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['nacalculatie'] })
      qc.invalidateQueries({ queryKey: ['articles'] })
      qc.invalidateQueries({ queryKey: ['prijshistorie', v.artikelId] })
      notifications.show({
        color: 'green', title: 'Norm bijgesteld',
        message: 'De calculatie van dit artikel is aangepast en staat in het prijsverloop.',
      })
    },
    onError: (e: unknown) => {
      notifications.show({
        color: 'red', title: 'Bijstellen mislukt',
        message: e instanceof Error ? e.message : 'Onbekende fout',
      })
    },
  })
}
