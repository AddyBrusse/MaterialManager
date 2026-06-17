import { apiFetch } from './client'

// A work center used by the article calculator. Rates are €/hour.
export interface Machine {
  id: string
  name: string
  machineRatePerHour: number
  operatorRatePerHour: number
  defaultSetupMin: number
  createdAt: string
}

export const MOCK_MACHINES: Machine[] = [
  { id: 'mach_dmg',    name: 'DMG',    machineRatePerHour: 75, operatorRatePerHour: 55, defaultSetupMin: 20, createdAt: '' },
  { id: 'mach_doosan', name: 'Doosan', machineRatePerHour: 65, operatorRatePerHour: 55, defaultSetupMin: 20, createdAt: '' },
]

const LS_KEY = 'sm_machines'

function loadStore(): Machine[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Machine[]
  } catch {}
  return [...MOCK_MACHINES]
}
function saveStore(data: Machine[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

let mockMachines: Machine[] = loadStore()

export type MachineInput = {
  name: string
  machineRatePerHour: number
  operatorRatePerHour: number
  defaultSetupMin: number
}

export const machinesApi = {
  list: () =>
    apiFetch<Machine[]>('/machines').catch(() => ({ data: mockMachines })),

  create: (body: MachineInput) =>
    apiFetch<Machine>('/machines', { method: 'POST', body: JSON.stringify(body) }).catch(() => {
      const item: Machine = { id: `mach_${Date.now()}`, ...body, createdAt: new Date().toISOString() }
      mockMachines = [...mockMachines, item]
      saveStore(mockMachines)
      return { data: item }
    }),

  update: (id: string, body: Partial<MachineInput>) =>
    apiFetch<Machine>(`/machines/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).catch(() => {
      const existing = mockMachines.find(m => m.id === id)
      if (!existing) throw new Error('Niet gevonden')
      const updated = { ...existing, ...body }
      mockMachines = mockMachines.map(m => m.id === id ? updated : m)
      saveStore(mockMachines)
      return { data: updated }
    }),

  remove: (id: string) =>
    apiFetch<void>(`/machines/${id}`, { method: 'DELETE' }).catch(() => {
      mockMachines = mockMachines.filter(m => m.id !== id)
      saveStore(mockMachines)
      return { data: undefined as void }
    }),
}
