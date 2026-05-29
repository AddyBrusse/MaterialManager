import { apiFetch } from './client'

export type SlotOption = {
  id: string
  level1: string
  level2: string | null
  createdAt: string
}

export type LocationWithSlots = {
  id: string
  kind: 'rack' | 'cabinet'
  label: string
  createdAt: string
  slots: SlotOption[]
}

export const MOCK_LOCATIONS: LocationWithSlots[] = [
  {
    id: 'l1', kind: 'rack', label: 'Hal A · Stelling 01', createdAt: '',
    slots: [
      { id: 's1a', level1: 'R1', level2: null, createdAt: '' },
      { id: 's1b', level1: 'R2', level2: null, createdAt: '' },
      { id: 's1c', level1: 'R3', level2: null, createdAt: '' },
    ],
  },
  {
    id: 'l2', kind: 'rack', label: 'Hal A · Stelling 02', createdAt: '',
    slots: [
      { id: 's2a', level1: 'R1', level2: null,  createdAt: '' },
      { id: 's2b', level1: 'R1', level2: 'V1',  createdAt: '' },
      { id: 's2c', level1: 'R1', level2: 'V2',  createdAt: '' },
      { id: 's2d', level1: 'R2', level2: null,  createdAt: '' },
    ],
  },
  {
    id: 'l3', kind: 'rack', label: 'Hal A · Stelling 03', createdAt: '',
    slots: [
      { id: 's3a', level1: 'R1', level2: null, createdAt: '' },
      { id: 's3b', level1: 'R2', level2: null, createdAt: '' },
      { id: 's3c', level1: 'R3', level2: null, createdAt: '' },
    ],
  },
  {
    id: 'l4', kind: 'rack', label: 'Hal B · Vak 12', createdAt: '',
    slots: [
      { id: 's4a', level1: 'R1', level2: null, createdAt: '' },
      { id: 's4b', level1: 'R2', level2: null, createdAt: '' },
    ],
  },
  {
    id: 'l5', kind: 'rack', label: 'Hal B · Vak 14', createdAt: '',
    slots: [
      { id: 's5a', level1: 'R1', level2: null, createdAt: '' },
      { id: 's5b', level1: 'R2', level2: null, createdAt: '' },
      { id: 's5c', level1: 'R3', level2: null, createdAt: '' },
    ],
  },
  {
    id: 'l6', kind: 'cabinet', label: 'Hal C · Buitenopslag', createdAt: '',
    slots: [
      { id: 's6a', level1: 'R1', level2: null, createdAt: '' },
      { id: 's6b', level1: 'R2', level2: null, createdAt: '' },
    ],
  },
]

const LS_KEY = 'sm_locations'

function loadStore(): LocationWithSlots[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as LocationWithSlots[]
  } catch {}
  return JSON.parse(JSON.stringify(MOCK_LOCATIONS)) as LocationWithSlots[]
}

function saveStore(data: LocationWithSlots[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

let mockLocations: LocationWithSlots[] = loadStore()

export const locationsApi = {
  list: () =>
    apiFetch<LocationWithSlots[]>('/locations').catch(() => ({ data: mockLocations })),

  createLocation: (body: { kind: 'rack' | 'cabinet'; label: string }) =>
    apiFetch<LocationWithSlots>('/locations', { method: 'POST', body: JSON.stringify(body) }).catch(() => {
      const item: LocationWithSlots = { id: `l${Date.now()}`, ...body, createdAt: new Date().toISOString(), slots: [] }
      mockLocations = [...mockLocations, item]
      saveStore(mockLocations)
      return { data: item }
    }),

  updateLocation: (id: string, body: { kind?: 'rack' | 'cabinet'; label?: string }) =>
    apiFetch<LocationWithSlots>(`/locations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).catch(() => {
      mockLocations = mockLocations.map(l => l.id === id ? { ...l, ...body } : l)
      saveStore(mockLocations)
      return { data: mockLocations.find(l => l.id === id)! }
    }),

  removeLocation: (id: string) =>
    apiFetch<void>(`/locations/${id}`, { method: 'DELETE' }).catch(() => {
      mockLocations = mockLocations.filter(l => l.id !== id)
      saveStore(mockLocations)
      return { data: undefined as void }
    }),

  addSlot: (locationId: string, body: { level1: string; level2?: string | null }) =>
    apiFetch<SlotOption>(`/locations/${locationId}/slots`, { method: 'POST', body: JSON.stringify(body) }).catch(() => {
      const slot: SlotOption = { id: `s${Date.now()}`, level1: body.level1, level2: body.level2 ?? null, createdAt: new Date().toISOString() }
      mockLocations = mockLocations.map(l =>
        l.id === locationId ? { ...l, slots: [...l.slots, slot] } : l
      )
      saveStore(mockLocations)
      return { data: slot }
    }),

  removeSlot: (locationId: string, slotId: string) =>
    apiFetch<void>(`/locations/${locationId}/slots/${slotId}`, { method: 'DELETE' }).catch(() => {
      mockLocations = mockLocations.map(l =>
        l.id === locationId ? { ...l, slots: l.slots.filter(s => s.id !== slotId) } : l
      )
      saveStore(mockLocations)
      return { data: undefined as void }
    }),
}
