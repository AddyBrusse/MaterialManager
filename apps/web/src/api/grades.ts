import type { Grade } from '@stockmanager/shared'
import type { LaadFout } from '../utils/fout-melding'
import { apiFetch } from './client'

const LS_KEY = 'sm_grades'

function loadStore(): Grade[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Grade[]
  } catch {}
  return []
}

function saveStore(data: Grade[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

let mockGrades: Grade[] = loadStore()

// Without this, listSync() (used wherever a real API round-trip isn't
// practical, e.g. cost calculations) is stuck forever on the localStorage/
// hardcoded seed above — list() fetches the real DB rows but never writes
// them back into mockGrades. Called from AppLayout's startup effect,
// mirroring initMachines()/initArticles() etc.
export async function initGrades(): Promise<LaadFout | null> {
  try {
    const { data } = await apiFetch<Grade[]>('/grades')
    mockGrades = data
    saveStore(data)
    return null
  } catch (fout) {
    mockGrades = loadStore()
    // Niet stil: zie initProjects. Gemeld in useInitAppData.
    return { wat: 'materiaalsoorten', aantalLokaal: mockGrades.length, fout }
  }
}

export const gradesApi = {
  list: () =>
    apiFetch<Grade[]>('/grades').catch(() => ({ data: mockGrades })),
  listSync: (): Grade[] => mockGrades,

  create: (body: { name: string; densityKgM3: number; pricePerKg?: number }) =>
    apiFetch<Grade>('/grades', { method: 'POST', body: JSON.stringify(body) }).catch(() => {
      const item: Grade = { id: `g${Date.now()}`, ...body, createdAt: new Date().toISOString() }
      mockGrades = [...mockGrades, item]
      saveStore(mockGrades)
      return { data: item }
    }),

  update: (id: string, body: { name?: string; densityKgM3?: number; pricePerKg?: number }) =>
    apiFetch<Grade>(`/grades/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).catch(() => {
      const existing = mockGrades.find(g => g.id === id)
      if (!existing) throw new Error('Niet gevonden')
      const updated = { ...existing, ...body }
      mockGrades = mockGrades.map(g => g.id === id ? updated : g)
      saveStore(mockGrades)
      return { data: updated }
    }),

  remove: (id: string) =>
    apiFetch<void>(`/grades/${id}`, { method: 'DELETE' }).catch(() => {
      mockGrades = mockGrades.filter(g => g.id !== id)
      saveStore(mockGrades)
      return { data: undefined as void }
    }),
}
