import { acquireToken } from './graph-mail'
import type { Todo } from '@stockmanager/shared'

export interface CalendarEventResult {
  id: string
}

export async function createCalendarEvent(todo: Todo): Promise<CalendarEventResult> {
  const token = await acquireToken(['Calendars.ReadWrite'])

  // dueDate is date-only; default to a 30-min slot at 09:00 local time
  const datePart = todo.dueDate ? todo.dueDate.slice(0, 10) : undefined
  const start = datePart ? `${datePart}T09:00:00` : undefined
  const end = datePart ? `${datePart}T09:30:00` : undefined

  const event = {
    subject: todo.title,
    body: {
      contentType: 'Text',
      content: `Todo vanuit ShopCommand (aangemaakt door ${todo.createdByName ?? ''})`,
    },
    start: start ? { dateTime: start, timeZone: 'Europe/Amsterdam' } : undefined,
    end: end ? { dateTime: end, timeZone: 'Europe/Amsterdam' } : undefined,
    isReminderOn: true,
    reminderMinutesBeforeStart: 60,
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Microsoft Graph fout: ${res.status}`)
  }

  const data = await res.json()
  return { id: data.id }
}
