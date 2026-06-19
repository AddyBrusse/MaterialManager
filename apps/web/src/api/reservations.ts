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
  priority: number | null
  status: ReservationStatus
  restLengteMm: number | null
  completedAt: string | null
}

function migrate(r: Partial<ZaagReservation>): ZaagReservation {
  return {
    priority: null,
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

type CreateInput = Omit<ZaagReservation, 'id' | 'createdAt' | 'priority' | 'status' | 'restLengteMm' | 'completedAt'>

export const reservationsStore = {
  list: () => cache,

  create: (items: CreateInput[]): ZaagReservation[] => {
    const created: ZaagReservation[] = items.map((item, i) => ({
      ...item,
      id: `res_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      priority: null,
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
