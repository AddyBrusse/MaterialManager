import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { todosApi } from '../../api/todos'
import { useUserStore } from '../../stores/user'
import { TodoAddRow } from '../../components/todos/TodoAddRow'
import { TodoRow } from '../../components/todos/TodoRow'
import { TodoAlerts } from '../../components/todos/TodoAlerts'
import { useTodoAlerts } from '../../components/todos/useTodoAlerts'
import { createCalendarEvent } from '../../services/graph-calendar'
import type { TodoAlert } from '../../utils/todoAlerts'

export function TodosPage() {
  const qc = useQueryClient()
  const user = useUserStore(s => s.user)
  const [settingAgendaId, setSettingAgendaId] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: ['todos'],
    queryFn: todosApi.list,
    refetchInterval: 20000,
  })
  const todos = data?.data ?? []
  const open = todos.filter(t => !t.done)
  const done = todos.filter(t => t.done)

  const alerts = useTodoAlerts()

  const invalidate = () => qc.invalidateQueries({ queryKey: ['todos'] })

  const createMut = useMutation({
    mutationFn: todosApi.create,
    onSuccess: () => { invalidate(); notifications.show({ color: 'green', message: 'Taak toegevoegd' }) },
    onError: () => notifications.show({ color: 'red', message: 'Toevoegen mislukt' }),
  })
  const claimMut = useMutation({
    mutationFn: (id: string) => todosApi.claim(id),
    onSuccess: invalidate,
    onError: () => notifications.show({ color: 'red', message: 'Claimen mislukt' }),
  })
  const completeMut = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => todosApi.complete(id, done),
    onSuccess: invalidate,
    onError: () => notifications.show({ color: 'red', message: 'Bijwerken mislukt' }),
  })
  const removeMut = useMutation({
    mutationFn: (id: string) => todosApi.remove(id),
    onSuccess: () => { invalidate(); notifications.show({ color: 'green', message: 'Taak verwijderd' }) },
    onError: () => notifications.show({ color: 'red', message: 'Verwijderen mislukt' }),
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
    try {
      const todo = todos.find(t => t.id === id)
      if (!todo) return
      const result = await createCalendarEvent(todo)
      await todosApi.setCalendarEvent(id, result.id)
      invalidate()
      notifications.show({ color: 'green', message: 'Op de agenda gezet' })
    } catch (e: unknown) {
      notifications.show({ color: 'red', message: e instanceof Error ? e.message : 'Op agenda zetten mislukt' })
    } finally {
      setSettingAgendaId(null)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div className="st-page-hd">
        <div>
          <div className="st-page-title">Todo lijst</div>
          <div className="st-page-sub">Gedeelde takenlijst voor de werkplaats</div>
        </div>
      </div>

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
        {open.map(t => (
          <TodoRow
            key={t.id}
            todo={t}
            currentUserId={user?.id}
            onClaim={() => claimMut.mutate(t.id)}
            onComplete={done => completeMut.mutate({ id: t.id, done })}
            onDelete={() => removeMut.mutate(t.id)}
            onSetAgenda={() => handleSetAgenda(t.id)}
            settingAgenda={settingAgendaId === t.id}
          />
        ))}
      </div>

      {done.length > 0 && (
        <details style={{ marginTop: 24 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--text-3)', fontWeight: 500 }}>
            Afgerond ({done.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {done.map(t => (
              <TodoRow
                key={t.id}
                todo={t}
                currentUserId={user?.id}
                onClaim={() => claimMut.mutate(t.id)}
                onComplete={done => completeMut.mutate({ id: t.id, done })}
                onDelete={() => removeMut.mutate(t.id)}
                onSetAgenda={() => handleSetAgenda(t.id)}
                settingAgenda={settingAgendaId === t.id}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
