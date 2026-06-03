const LS_KEY = 'sm_zaag_reservations'

export type ReservationStatus = 'open' | 'in_progress' | 'done'

export interface ZaagReservation {
  id: string           // unique — e.g. res_1748123456789_ab3f
  calculatieNr: string // ref to production file (may be empty string)
  barId: string
  barCode: string
  barLocation: string  // formatted location at time of reservation
  barVorm: string      // e.g. "Rond"
  pieces: number
  productLen: number   // mm per piece (werkstuk + kerf + vlakToeslag)
  sawLength: number    // pieces × productLen + grijplengte (total bar consumed)
  fysiekeLengte: number // physical length of the bar on the shelf at reservation time (mm)
  materiaal: string
  diameter: number
  werkstukLengte: number
  steekbreedte: number // kerf width per cut
  vlakToeslag: number  // facing allowance per piece
  // grijplengte is derived: sawLength − pieces × productLen
  machine: string
  createdAt: string
  // flow fields (set by saw worker or planner)
  priority: number | null      // planner sets order (1 = highest); null = no priority
  status: ReservationStatus    // open → in_progress → done
  restLengteMm: number | null  // measured rest after sawing (set when marking done)
  completedAt: string | null
}

function load(): ZaagReservation[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<ZaagReservation>[]
    // Migrate old records that lack the new flow fields
    return parsed.map(r => ({
      priority: null,
      status: 'open' as ReservationStatus,
      restLengteMm: null,
      completedAt: null,
      barLocation: '',
      barVorm: 'Rond',
      steekbreedte: 0,
      vlakToeslag: 0,
      fysiekeLengte: r.sawLength ?? 0, // fallback for old records lacking physical length
      ...r,
    } as ZaagReservation))
  } catch {
    return []
  }
}

function save(data: ZaagReservation[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

export const reservationsStore = {
  list: () => load(),

  create: (items: Omit<ZaagReservation, 'id' | 'createdAt' | 'priority' | 'status' | 'restLengteMm' | 'completedAt'>[]): ZaagReservation[] => {
    const existing = load()
    const created: ZaagReservation[] = items.map((item, i) => ({
      ...item,
      id: `res_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      priority: null,
      status: 'open',
      restLengteMm: null,
      completedAt: null,
    }))
    save([...existing, ...created])
    return created
  },

  remove: (id: string): void => {
    save(load().filter(r => r.id !== id))
  },

  setPriority: (id: string, priority: number | null): void => {
    save(load().map(r => r.id === id ? { ...r, priority } : r))
  },

  setStatus: (id: string, status: ReservationStatus): void => {
    save(load().map(r => r.id === id ? { ...r, status } : r))
  },

  complete: (id: string, restLengteMm: number | null): void => {
    save(load().map(r =>
      r.id === id
        ? { ...r, status: 'done', restLengteMm, completedAt: new Date().toISOString() }
        : r
    ))
  },
}
