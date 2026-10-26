import type { Profile } from '@stockmanager/shared'
import type { LaadFout } from '../utils/fout-melding'
import { apiFetch } from './client'

export type DimField = { key: string; label: string; unit: string }

const LS_KEY = 'sm_profiles'

function loadStore(): Profile[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Profile[]
  } catch {}
  return []
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
export async function initProfiles(): Promise<LaadFout | null> {
  try {
    const { data } = await apiFetch<Profile[]>('/profiles')
    mockProfiles = data
    saveStore(data)
    return null
  } catch (fout) {
    mockProfiles = loadStore()
    // Niet stil: zie initProjects. Gemeld in useInitAppData.
    return { wat: 'profielen', aantalLokaal: mockProfiles.length, fout }
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
