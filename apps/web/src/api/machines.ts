import type { Machine, CreateMachine, UpdateMachine } from '@stockmanager/shared'
import { apiFetch } from './client'

export type { Machine }
export type MachineInput = CreateMachine

export const MOCK_MACHINES: Machine[] = [
  { id: 'mach_dmg',    name: 'DMG',    machineRatePerHour: 75, operatorRatePerHour: 55, defaultSetupMin: 20, worksWeekends: false, createdAt: '' },
  { id: 'mach_doosan', name: 'Doosan', machineRatePerHour: 65, operatorRatePerHour: 55, defaultSetupMin: 20, worksWeekends: false, createdAt: '' },
]

const LS_KEY = 'sm_machines'

function loadLocal(): Machine[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Machine[]
  } catch {}
  return [...MOCK_MACHINES]
}

function saveLocal(data: Machine[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

let cache: Machine[] = loadLocal()

export async function initMachines(): Promise<void> {
  try {
    const { data } = await apiFetch<Machine[]>('/machines')
    cache = data
    saveLocal(data)
  } catch {
    cache = loadLocal()
  }
}

export const machinesApi = {
  listSync: (): Machine[] => cache,

  list: () => apiFetch<Machine[]>('/machines')
    .then(r => { cache = r.data; saveLocal(r.data); return r })
    .catch(() => ({ data: cache })),

  create: async (body: CreateMachine): Promise<{ data: Machine }> => {
    try {
      const r = await apiFetch<Machine>('/machines', { method: 'POST', body: JSON.stringify(body) })
      cache = [...cache, r.data]
      saveLocal(cache)
      return r
    } catch {
      const item: Machine = { id: `mach_${Date.now()}`, ...body, createdAt: new Date().toISOString() }
      cache = [...cache, item]
      saveLocal(cache)
      return { data: item }
    }
  },

  update: async (id: string, body: UpdateMachine): Promise<{ data: Machine }> => {
    try {
      const r = await apiFetch<Machine>(`/machines/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      cache = cache.map(m => m.id === id ? r.data : m)
      saveLocal(cache)
      return r
    } catch {
      const existing = cache.find(m => m.id === id)
      if (!existing) throw new Error('Niet gevonden')
      const updated = { ...existing, ...body }
      cache = cache.map(m => m.id === id ? updated : m)
      saveLocal(cache)
      return { data: updated }
    }
  },

  remove: async (id: string): Promise<{ data: void }> => {
    try {
      await apiFetch<void>(`/machines/${id}`, { method: 'DELETE' })
    } catch {}
    cache = cache.filter(m => m.id !== id)
    saveLocal(cache)
    return { data: undefined }
  },
}
