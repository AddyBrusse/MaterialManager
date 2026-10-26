import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { todosApi } from '../../api/todos'
import { meldFout } from '../../utils/fout-melding-toon'

/** Afvinken en verwijderen, gedeeld door de rij en het grote venster. */
export function useVerbeterpuntActies() {
  const qc = useQueryClient()
  const ververs = () => qc.invalidateQueries({ queryKey: ['todos'] })
  const afvinken = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => todosApi.complete(id, done),
    onSuccess: ververs,
    onError: (fout, { done }) => meldFout({
      actie: done ? 'Verbeterpunt afvinken' : 'Verbeterpunt weer openzetten',
      fout,
      gevolg: 'Het verbeterpunt staat nog zoals het stond.',
    }),
  })
  const verwijderen = useMutation({
    mutationFn: (id: string) => todosApi.remove(id),
    onSuccess: () => { void ververs(); notifications.show({ color: 'green', message: 'Verbeterpunt en schermafbeelding verwijderd' }) },
    onError: (fout) => meldFout({ actie: 'Verbeterpunt verwijderen', fout, gevolg: 'Het verbeterpunt en zijn schermafbeelding staan er nog.' }),
  })
  return {
    afvinken: (id: string, done: boolean) => afvinken.mutate({ id, done }),
    verwijderen: (id: string, klaar?: () => void) => verwijderen.mutate(id, { onSuccess: klaar }),
  }
}
