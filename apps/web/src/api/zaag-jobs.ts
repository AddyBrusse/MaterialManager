import type { ZaagReservation } from './reservations'

// A Zaag job = all reservations sharing a calculatienummer (blank → one '—' job).
export interface ZaagJob {
  calcNr: string
  reservations: ZaagReservation[]
  machine: string
  materiaal: string
  diameter: number
  totalPcs: number
  priority: number | null
  rush: boolean
  status: 'open' | 'in_progress' | 'done'
  createdAt: string
}

// Group reservations into jobs, sorted by: active status first, then rush,
// then priority (nulls last), then creation time.
export function buildJobs(reservations: ZaagReservation[]): ZaagJob[] {
  const map = new Map<string, ZaagReservation[]>()
  for (const r of reservations) {
    const k = r.calculatieNr || '—'
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(r)
  }
  return [...map.entries()].map(([calcNr, items]) => {
    const first = items[0]
    const statuses = items.map(r => r.status)
    const jobStatus = statuses.every(s => s === 'done') ? 'done'
      : statuses.some(s => s === 'in_progress') ? 'in_progress' : 'open'
    return {
      calcNr, reservations: items, machine: first.machine, materiaal: first.materiaal,
      diameter: first.diameter, totalPcs: items.reduce((s, r) => s + r.pieces, 0),
      priority: items[0].priority, rush: items.some(r => r.rush),
      status: jobStatus as ZaagJob['status'], createdAt: items[0].createdAt,
    }
  }).sort((a, b) => {
    const sp = (j: ZaagJob) => ({ in_progress: 0, open: 1, done: 2 }[j.status])
    if (sp(a) !== sp(b)) return sp(a) - sp(b)
    if (a.rush !== b.rush) return a.rush ? -1 : 1
    if (a.priority !== b.priority) {
      if (a.priority == null) return 1
      if (b.priority == null) return -1
      return a.priority - b.priority
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}
