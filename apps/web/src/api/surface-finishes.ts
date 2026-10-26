import type { SurfaceFinish } from '@stockmanager/shared'
import { apiFetch } from './client'

const LS_KEY = 'sm_surface_finishes'

function loadStore(): SurfaceFinish[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as SurfaceFinish[]
  } catch {}
  return []
}

function saveStore(data: SurfaceFinish[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

let mockSurfaceFinishes: SurfaceFinish[] = loadStore()

export const surfaceFinishesApi = {
  list: () =>
    apiFetch<SurfaceFinish[]>('/surface-finishes').catch(() => ({ data: mockSurfaceFinishes })),
  listSync: (): SurfaceFinish[] => mockSurfaceFinishes,

  create: (body: { name: string }) =>
    apiFetch<SurfaceFinish>('/surface-finishes', { method: 'POST', body: JSON.stringify(body) }).catch(() => {
      const item: SurfaceFinish = { id: `sf${Date.now()}`, ...body, createdAt: new Date().toISOString() }
      mockSurfaceFinishes = [...mockSurfaceFinishes, item]
      saveStore(mockSurfaceFinishes)
      return { data: item }
    }),

  update: (id: string, body: { name?: string }) =>
    apiFetch<SurfaceFinish>(`/surface-finishes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).catch(() => {
      const existing = mockSurfaceFinishes.find(s => s.id === id)
      if (!existing) throw new Error('Niet gevonden')
      const updated = { ...existing, ...body }
      mockSurfaceFinishes = mockSurfaceFinishes.map(s => s.id === id ? updated : s)
      saveStore(mockSurfaceFinishes)
      return { data: updated }
    }),

  remove: (id: string) =>
    apiFetch<void>(`/surface-finishes/${id}`, { method: 'DELETE' }).catch(() => {
      mockSurfaceFinishes = mockSurfaceFinishes.filter(s => s.id !== id)
      saveStore(mockSurfaceFinishes)
      return { data: undefined as void }
    }),
}
