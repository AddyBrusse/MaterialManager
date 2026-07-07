import type { Grade } from '@stockmanager/shared'
import { apiFetch } from './client'

export const MOCK_GRADES: Grade[] = [
  { id: 'g1', name: 'S235',    densityKgM3: 7850, pricePerKg: 1.10, createdAt: '' },
  { id: 'g2', name: 'S275',    densityKgM3: 7850, pricePerKg: 1.15, createdAt: '' },
  { id: 'g3', name: 'S355',    densityKgM3: 7850, pricePerKg: 1.25, createdAt: '' },
  { id: 'g4', name: 'S420',    densityKgM3: 7850, pricePerKg: 1.45, createdAt: '' },
  { id: 'g5', name: '304 RVS', densityKgM3: 7930, pricePerKg: 4.50, createdAt: '' },
  { id: 'g6', name: '316L RVS',densityKgM3: 7980, pricePerKg: 6.20, createdAt: '' },
]

const LS_KEY = 'sm_grades'

function loadStore(): Grade[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Grade[]
  } catch {}
  return [...MOCK_GRADES]
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
export async function initGrades(): Promise<void> {
  try {
    const { data } = await apiFetch<Grade[]>('/grades')
    mockGrades = data
    saveStore(data)
  } catch {
    mockGrades = loadStore()
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
