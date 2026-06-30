import { apiFetch } from './client'

const LS_KEY = 'sm_zaag_reservations'

export type ReservationStatus = 'open' | 'in_progress' | 'done'

export interface ZaagReservation {
  id: string
  calculatieNr: string
  barId: string
  barCode: string
  barLocation: string
  barVorm: string
  pieces: number
  productLen: number
  sawLength: number
  fysiekeLengte: number
  materiaal: string
  diameter: number
  werkstukLengte: number
  steekbreedte: number
  vlakToeslag: number
  machine: string
  createdAt: string
  priority: number | null      // planner sets order (1 = highest); null = no priority
  rush: boolean                // planner "Spoed" flag — rush jobs jump the queue
  status: ReservationStatus    // open → in_progress → done
  restLengteMm: number | null  // measured rest after sawing (set when marking done)
  completedAt: string | null
}

function migrate(r: Partial<ZaagReservation>): ZaagReservation {
  return {
    priority: null,
    rush: false,
    status: 'open',
    restLengteMm: null,
    completedAt: null,
    barLocation: '',
    barVorm: 'Rond',
    steekbreedte: 0,
    vlakToeslag: 0,
    fysiekeLengte: (r as { sawLength?: number }).sawLength ?? 0,
    ...r,
  } as ZaagReservation
}

function loadLocal(): ZaagReservation[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return (JSON.parse(raw) as Partial<ZaagReservation>[]).map(migrate)
  } catch { return [] }
}

function saveLocal(data: ZaagReservation[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
  // Notify same-tab listeners (e.g. sidebar count badges) — the native
  // 'storage' event only fires in *other* tabs, so we emit our own.
  try { window.dispatchEvent(new Event('sm-reservations-changed')) } catch {}
}

let cache: ZaagReservation[] = loadLocal()

export async function initReservations(): Promise<void> {
  try {
    const { data } = await apiFetch<ZaagReservation[]>('/reservations')
    cache = data
    saveLocal(data)
  } catch {
    cache = loadLocal()
  }
}

type CreateInput = Omit<ZaagReservation, 'id' | 'createdAt' | 'priority' | 'rush' | 'status' | 'restLengteMm' | 'completedAt'>

export const reservationsStore = {
  list: () => cache,

  create: (items: CreateInput[]): ZaagReservation[] => {
    const created: ZaagReservation[] = items.map((item, i) => ({
      ...item,
      id: `res_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      priority: null,
      rush: false,
      status: 'open' as ReservationStatus,
      restLengteMm: null,
      completedAt: null,
    }))
    cache = [...cache, ...created]
    saveLocal(cache)
    apiFetch<ZaagReservation[]>('/reservations', { method: 'POST', body: JSON.stringify(items) })
      .catch(() => {})
    return created
  },

  remove: async (id: string): Promise<void> => {
    cache = cache.filter(r => r.id !== id)
    saveLocal(cache)
    apiFetch<void>(`/reservations/${id}`, { method: 'DELETE' }).catch(() => {})
  },

  setPriority: async (id: string, priority: number | null): Promise<void> => {
    cache = cache.map(r => r.id === id ? { ...r, priority } : r)
    saveLocal(cache)
    apiFetch<ZaagReservation>(`/reservations/${id}/priority`, {
      method: 'PATCH', body: JSON.stringify({ priority }),
    }).catch(() => {})
  },

  // Apply a full planner ordering in one write: job at index i → priority i+1,
  // plus its rush flag, on every reservation it contains. Reservations not in
  // any listed job are left untouched.
  applyPlan: async (jobs: { ids: string[]; rush: boolean }[]): Promise<void> => {
    const plan = new Map<string, { priority: number; rush: boolean }>()
    jobs.forEach((job, i) => {
      for (const id of job.ids) plan.set(id, { priority: i + 1, rush: job.rush })
    })
    cache = cache.map(r => {
      const p = plan.get(r.id)
      return p ? { ...r, priority: p.priority, rush: p.rush } : r
    })
    saveLocal(cache)
    try {
      const { data } = await apiFetch<ZaagReservation[]>('/reservations/plan', {
        method: 'POST', body: JSON.stringify({ jobs }),
      })
      cache = data
      saveLocal(cache)
    } catch {}
  },

  setStatus: async (id: string, status: ReservationStatus): Promise<void> => {
    cache = cache.map(r => r.id === id ? { ...r, status } : r)
    saveLocal(cache)
    apiFetch<ZaagReservation>(`/reservations/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    }).catch(() => {})
  },

  complete: async (id: string, restLengteMm: number | null): Promise<void> => {
    const completedAt = new Date().toISOString()
    cache = cache.map(r =>
      r.id === id ? { ...r, status: 'done', restLengteMm, completedAt } : r,
    )
    saveLocal(cache)
    apiFetch<ZaagReservation>(`/reservations/${id}/complete`, {
      method: 'POST', body: JSON.stringify({ restLengteMm }),
    }).catch(() => {})
  },
}
