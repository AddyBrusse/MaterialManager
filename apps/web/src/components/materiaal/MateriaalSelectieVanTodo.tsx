import { useMemo } from 'react'
import { notifications } from '@mantine/notifications'
import type { Todo } from '@stockmanager/shared'
import { projectsApi } from '../../api/projects'
import { MateriaalSelectieModal } from './MateriaalSelectieModal'

/**
 * De brug tussen een todo en het keuzescherm.
 *
 * De todo draagt alleen waar hij over gáát (project, artikel, offerteregel);
 * hoeveel stuks en onder welke naam staat in het project. Dat hier opzoeken
 * houdt de todo licht en zorgt dat het aantal altijd het actuele aantal is en
 * niet een kopie van het moment dat de todo gemaakt werd.
 */
export function MateriaalSelectieVanTodo({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const gevonden = useMemo(() => {
    if (!todo.projectId || !todo.artikelId) return null
    let project
    try { project = projectsApi.get(todo.projectId) } catch { return null }

    // De regel staat op de opdrachtbevestiging als die er is, anders op de
    // geaccepteerde offerte.
    const regels = project.opdrachtbevestiging?.regels
      ?? project.offertes.find(o => o.status === 'geaccepteerd')?.regels
      ?? []
    const regel = regels.find(r => r.id === todo.offerteRegelId)
      ?? regels.find(r => r.artikelId === todo.artikelId)
    if (!regel) return null

    return {
      projectId: project.id,
      projectNaam: project.naam,
      artikelId: todo.artikelId,
      artikelNaam: regel.naam,
      aantal: regel.qty,
      calculatieNr: project.opdrachtbevestiging?.id ?? project.id,
    }
  }, [todo])

  if (!gevonden) {
    notifications.show({
      color: 'orange',
      title: 'Kan de orderregel niet vinden',
      message: 'Het project of de regel waar deze taak bij hoort bestaat niet meer.',
    })
    onClose()
    return null
  }

  return (
    <MateriaalSelectieModal
      projectId={gevonden.projectId}
      artikelId={gevonden.artikelId}
      artikelNaam={gevonden.artikelNaam}
      aantal={gevonden.aantal}
      calculatieNr={gevonden.calculatieNr}
      todoId={todo.id}
      onClose={onClose}
    />
  )
}
