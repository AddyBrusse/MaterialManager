import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Todo } from '@stockmanager/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { todosApi } from '../../api/todos'
import { useUserStore } from '../../stores/user'
import { TodoAddRow } from './TodoAddRow'
import { TodoRow } from './TodoRow'
import { MateriaalSelectieVanTodo } from '../materiaal/MateriaalSelectieVanTodo'
import { TodoAlerts } from './TodoAlerts'
import { useTodoAlerts } from './useTodoAlerts'
import { createCalendarEvent } from '../../services/graph-calendar'
import { meldFout } from '../../utils/fout-melding-toon'
import type { TodoAlert } from '../../utils/todoAlerts'

/** De gedeelde takenlijst van de werkplaats (de tab "Taken" op de ToDo-pagina). */
export function TakenTab({ todos }: { todos: Todo[] }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const user = useUserStore(s => s.user)
  const [settingAgendaId, setSettingAgendaId] = useState<string | null>(null)
  // De todo waarvoor het materiaalkeuzescherm openstaat.
  const [selectieTodo, setSelectieTodo] = useState<Todo | null>(null)
  const open = todos.filter(t => !t.done)
  const done = todos.filter(t => t.done)

  const alerts = useTodoAlerts()

  const invalidate = () => qc.invalidateQueries({ queryKey: ['todos'] })

  const createMut = useMutation({
    mutationFn: todosApi.create,
    onSuccess: () => { invalidate(); notifications.show({ color: 'green', message: 'Taak toegevoegd' }) },
    onError: (fout) => meldFout({ actie: 'Taak toevoegen', fout, gevolg: 'De taak is niet toegevoegd. Typ hem opnieuw.' }),
  })
  const claimMut = useMutation({
    mutationFn: (id: string) => todosApi.claim(id),
    onSuccess: invalidate,
    onError: (fout) => meldFout({ actie: 'Taak claimen', fout, gevolg: 'Er is niets veranderd aan wie de taak heeft.' }),
  })
  const completeMut = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => todosApi.complete(id, done),
    onSuccess: invalidate,
    onError: (fout) => meldFout({ actie: 'Taak afvinken', fout, gevolg: 'De taak staat nog zoals hij stond.' }),
  })
  const removeMut = useMutation({
    mutationFn: (id: string) => todosApi.remove(id),
    onSuccess: () => { invalidate(); notifications.show({ color: 'green', message: 'Taak verwijderd' }) },
    onError: (fout) => meldFout({ actie: 'Taak verwijderen', fout, gevolg: 'De taak staat er nog.' }),
  })

  function handleConvertAlert(alert: TodoAlert) {
    createMut.mutate({
      title: alert.title,
      priority: alert.severity === 'high' ? 'high' : 'normal',
      dueDate: alert.dueDate ?? null,
      notifyOnDue: false,
    })
  }

  async function handleSetAgenda(id: string) {
    setSettingAgendaId(id)
    let afspraakGemaakt = false
    try {
      const todo = todos.find(t => t.id === id)
      if (!todo) return
      const result = await createCalendarEvent(todo)
      afspraakGemaakt = true
      await todosApi.setCalendarEvent(id, result.id)
      invalidate()
      notifications.show({ color: 'green', message: 'Op de agenda gezet' })
    } catch (fout) {
      meldFout({
        actie: 'Op de agenda zetten',
        fout,
        gevolg: afspraakGemaakt
          ? 'De afspraak staat wél in de agenda, maar de taak weet dat niet. Zet hem niet nog eens, anders staat hij er twee keer.'
          : 'Er is niets in de agenda gezet.',
      })
    } finally {
      setSettingAgendaId(null)
    }
  }

  const rij = (t: Todo, metActie: boolean) => (
    <TodoRow
      key={t.id}
      todo={t}
      currentUserId={user?.id}
      onClaim={() => claimMut.mutate(t.id)}
      onComplete={done => completeMut.mutate({ id: t.id, done })}
      onDelete={() => removeMut.mutate(t.id)}
      onSetAgenda={() => handleSetAgenda(t.id)}
      settingAgenda={settingAgendaId === t.id}
      onActie={!metActie ? undefined
        : t.soort === 'materiaal_selecteren' ? () => setSelectieTodo(t)
        // Het tekort staat ook op de bestellijst (2026-10-06); daar bestel je het.
        : t.soort === 'bestellen' ? () => navigate('/bestellingen') : undefined}
    />
  )

  return (
    <>
      <div style={{ marginTop: 16 }}>
        <TodoAddRow onAdd={body => createMut.mutate(body)} />
      </div>

      <div style={{ marginTop: 20 }}>
        <TodoAlerts alerts={alerts} onConvert={handleConvertAlert} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {open.length === 0 && (
          <div className="st-empty">Geen openstaande taken. Voeg er hierboven een toe.</div>
        )}
        {open.map(t => rij(t, true))}
      </div>

      {done.length > 0 && (
        <details style={{ marginTop: 24 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--text-3)', fontWeight: 500 }}>
            Afgerond ({done.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {done.map(t => rij(t, false))}
          </div>
        </details>
      )}

      {selectieTodo && (
        <MateriaalSelectieVanTodo todo={selectieTodo} onClose={() => setSelectieTodo(null)} />
      )}
    </>
  )
}
