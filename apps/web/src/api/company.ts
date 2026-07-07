import type { Company, UpdateCompany } from '@stockmanager/shared'
import { apiFetch } from './client'

const LS_KEY = 'sm_company'

const DEFAULTS: Company = {
  id:            'default',
  naam:          'Boer Metaalbewerking',
  adres:         'Industrieweg 1',
  postcode:      '1234 AB',
  stad:          'Enschede',
  land:          'Nederland',
  telefoon:      null,
  email:         null,
  website:       null,
  kvk:           null,
  btw:           null,
  iban:          null,
  graphClientId: null,
  graphTenantId: null,
  updatedAt:     new Date().toISOString(),
}

function loadLocal(): Company {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULTS }
}

function saveLocal(c: Company): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(c)) } catch {}
}

let cache: Company | null = null

export const companyApi = {
  get: () =>
    apiFetch<Company>('/settings/company').catch(() => ({ data: loadLocal() })),

  getSync: (): Company => cache ?? loadLocal(),

  update: async (body: UpdateCompany): Promise<{ data: Company }> => {
    const result = await apiFetch<Company>('/settings/company', {
      method: 'PUT',
      body: JSON.stringify(body),
    }).catch(() => {
      const updated: Company = { ...loadLocal(), ...body, updatedAt: new Date().toISOString() }
      saveLocal(updated)
      cache = updated
      return { data: updated }
    })
    cache = result.data
    saveLocal(result.data)
    return result
  },
}

// Without this, getSync() is stuck on cache=null → loadLocal() forever —
// real settings (KVK/BTW/IBAN, Graph client/tenant id) never reach the PDF
// generators or the offerte/opdrachtbevestiging email-send checks that read
// getSync() directly. Called from AppLayout's startup effect, mirroring
// initMachines()/initGrades() etc.
export async function loadCompany(): Promise<Company> {
  const result = await companyApi.get()
  cache = result.data
  saveLocal(result.data)
  return result.data
}
