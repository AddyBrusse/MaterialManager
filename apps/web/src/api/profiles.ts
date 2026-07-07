import type { Profile } from '@stockmanager/shared'
import { apiFetch } from './client'

export const MOCK_PROFILES: Profile[] = [
  {
    id: 'p1', name: 'Rond', volumeFormula: 'round', createdAt: '',
    dimensionSchema: [{ key: 'diameter', label: 'Diameter', unit: 'mm' }],
  },
  {
    id: 'p2', name: 'Vierkant', volumeFormula: 'square', createdAt: '',
    dimensionSchema: [{ key: 'side', label: 'Zijde', unit: 'mm' }],
  },
  {
    id: 'p3', name: 'Plat', volumeFormula: 'flat', createdAt: '',
    dimensionSchema: [
      { key: 'width', label: 'Breedte', unit: 'mm' },
      { key: 'height', label: 'Hoogte', unit: 'mm' },
    ],
  },
  {
    id: 'p4', name: 'Buis', volumeFormula: 'tube', createdAt: '',
    dimensionSchema: [
      { key: 'outerDiameter', label: 'Buitendiameter', unit: 'mm' },
      { key: 'innerDiameter', label: 'Binnendiameter', unit: 'mm' },
    ],
  },
  {
    id: 'p5', name: 'Hoekstaal', volumeFormula: 'flat', createdAt: '',
    dimensionSchema: [
      { key: 'width', label: 'Breedte', unit: 'mm' },
      { key: 'height', label: 'Hoogte', unit: 'mm' },
      { key: 'thickness', label: 'Dikte', unit: 'mm' },
    ],
  },
]

export type DimField = { key: string; label: string; unit: string }

const LS_KEY = 'sm_profiles'

function loadStore(): Profile[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Profile[]
  } catch {}
  return [...MOCK_PROFILES]
}

function saveStore(data: Profile[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

let mockProfiles: Profile[] = loadStore()

// Without this, listSync() (used wherever a real API round-trip isn't
// practical, e.g. cost calculations) is stuck forever on the localStorage/
// hardcoded seed above — list() fetches the real DB rows but never writes
// them back into mockProfiles. Called from AppLayout's startup effect,
// mirroring initMachines()/initArticles() etc.
export async function initProfiles(): Promise<void> {
  try {
    const { data } = await apiFetch<Profile[]>('/profiles')
    mockProfiles = data
    saveStore(data)
  } catch {
    mockProfiles = loadStore()
  }
}

export const profilesApi = {
  list: () =>
    apiFetch<Profile[]>('/profiles').catch(() => ({ data: mockProfiles })),
  listSync: (): Profile[] => mockProfiles,

  create: (body: { name: string; volumeFormula: Profile['volumeFormula']; dimensionSchema: DimField[] }) =>
    apiFetch<Profile>('/profiles', { method: 'POST', body: JSON.stringify(body) }).catch(() => {
      const item: Profile = { id: `p${Date.now()}`, ...body, createdAt: new Date().toISOString() }
      mockProfiles = [...mockProfiles, item]
      saveStore(mockProfiles)
      return { data: item }
    }),

  update: (id: string, body: Partial<{ name: string; volumeFormula: Profile['volumeFormula']; dimensionSchema: DimField[] }>) =>
    apiFetch<Profile>(`/profiles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).catch(() => {
      const existing = mockProfiles.find(p => p.id === id)
      if (!existing) throw new Error('Niet gevonden')
      const updated = { ...existing, ...body }
      mockProfiles = mockProfiles.map(p => p.id === id ? updated : p)
      saveStore(mockProfiles)
      return { data: updated }
    }),

  remove: (id: string) =>
    apiFetch<void>(`/profiles/${id}`, { method: 'DELETE' }).catch(() => {
      mockProfiles = mockProfiles.filter(p => p.id !== id)
      saveStore(mockProfiles)
      return { data: undefined as void }
    }),
}
