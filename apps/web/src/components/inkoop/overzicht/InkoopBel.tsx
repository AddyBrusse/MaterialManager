import { useQuery } from '@tanstack/react-query'
import { inkoopApi } from '../../../api/inkoop'

/** Wat er vandaag in de inkoop moet gebeuren (2026-10-07): het getal bij Bestellingen. Het belletje is sinds 2026-10-09 `MeldingenBel`. */
export function useInkoopMeldingen() {
  return useQuery({ queryKey: ['inkoop', 'meldingen'], queryFn: inkoopApi.meldingen, refetchInterval: 30000 })
}
