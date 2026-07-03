import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import type { CreateTodo, TodoPriority } from '@stockmanager/shared'

interface Props {
  onAdd: (body: CreateTodo) => void
}

export function TodoAddRow({ onAdd }: Props) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<TodoPriority>('normal')

  function submit() {
    if (!title.trim()) return
    onAdd({ title: title.trim(), dueDate: dueDate || null, priority, notifyOnDue: false })
    setTitle('')
    setDueDate('')
    setPriority('normal')
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        className="st-input"
        style={{ flex: 1 }}
        placeholder="Nieuwe taak… bijv. Bestel meer Ø50 rond"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
      />
      <input
        className="st-input"
        type="date"
        style={{ width: 150 }}
        value={dueDate}
        onChange={e => setDueDate(e.target.value)}
      />
      <select
        className="st-select"
        style={{ width: 110 }}
        value={priority}
        onChange={e => setPriority(e.target.value as TodoPriority)}
      >
        <option value="low">Laag</option>
        <option value="normal">Normaal</option>
        <option value="high">Hoog</option>
      </select>
      <button className="st-btn primary sm" onClick={submit} disabled={!title.trim()}>
        <IconPlus size={13} />Toevoegen
      </button>
    </div>
  )
}
