import type { Relatie, CreateRelatie, UpdateRelatie } from '@stockmanager/shared'
import { apiFetch } from './client'

export type { Relatie, RelatieContact } from '@stockmanager/shared'

const LS_KEY = 'sm_relaties'

const MOCK_RELATIES: Relatie[] = [
  {
    id: 'rel1',
    naam: 'Van Dijk Hydraulics B.V.',
    type: 'klant',
    actief: true,
    telefoon: '+31 (0)20 123 4567',
    email: 'info@vandijk-hydraulics.nl',
    emailFactuur: 'facturen@vandijk-hydraulics.nl',
    emailOfferte: null,
    website: 'www.vandijk-hydraulics.nl',
    straat: 'Industrieweg 12',
    postcode: '1234 AB',
    stad: 'Amsterdam',
    land: 'Nederland',
    factuurAdresZelfde: true,
    factuurStraat: null, factuurPostcode: null, factuurStad: null, factuurLand: null,
    afleverAdresZelfde: true,
    afleverStraat: null, afleverPostcode: null, afleverStad: null, afleverLand: null,
    kvk: '12345678',
    btw: 'NL001234567B01',
    iban: 'NL02ABNA0123456789',
    betalingstermijn: 30,
    notities: null,
    contacten: [
      { id: 'c1', naam: 'Peter de Vries', functie: 'Inkoop', telefoon: '+31 6 12345678', mobiel: null, email: 'p.devries@vandijk-hydraulics.nl' },
    ],
    createdAt: '2025-01-15T10:00:00.000Z',
  },
  {
    id: 'rel2',
    naam: 'Tata Steel Nederland',
    type: 'leverancier',
    actief: true,
    telefoon: '+31 (0)251 49 9111',
    email: 'staal@tata-steel.nl',
    emailFactuur: null,
    emailOfferte: 'offerte@tata-steel.nl',
    website: 'www.tatasteeleurope.com',
    straat: 'Wenckebachstraat 1',
    postcode: '1951 JZ',
    stad: 'Velsen-Noord',
    land: 'Nederland',
    factuurAdresZelfde: true,
    factuurStraat: null, factuurPostcode: null, factuurStad: null, factuurLand: null,
    afleverAdresZelfde: false,
    afleverStraat: 'Distributieweg 5',
    afleverPostcode: '1234 CD',
    afleverStad: 'Amsterdam',
    afleverLand: 'Nederland',
    kvk: '87654321',
    btw: 'NL987654321B01',
    iban: null,
    betalingstermijn: 14,
    notities: 'Certificaten altijd meesturen bij levering.',
    contacten: [
      { id: 'c2', naam: 'Sandra Janssen', functie: 'Accountmanager', telefoon: '+31 6 98765432', mobiel: null, email: 's.janssen@tata-steel.nl' },
      { id: 'c3', naam: 'Mark Kuipers', functie: 'Logistiek', telefoon: null, mobiel: '+31 6 11223344', email: 'm.kuipers@tata-steel.nl' },
    ],
    createdAt: '2025-02-10T09:00:00.000Z',
  },
]

function loadLocal(): Relatie[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Relatie[]
  } catch {}
  return [...MOCK_RELATIES]
}

function saveLocal(data: Relatie[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

let cache: Relatie[] = loadLocal()

export async function initRelaties(): Promise<void> {
  try {
    const { data } = await apiFetch<Relatie[]>('/relaties')
    cache = data
    saveLocal(data)
  } catch {
    cache = loadLocal()
  }
}

export const relatiesApi = {
  listSync: (): Relatie[] => cache,

  list: () => apiFetch<Relatie[]>('/relaties')
    .then(r => { cache = r.data; saveLocal(r.data); return r })
    .catch(() => ({ data: cache })),

  get: (id: string) => apiFetch<Relatie>(`/relaties/${id}`)
    .catch(() => {
      const item = cache.find(r => r.id === id)
      if (!item) throw new Error('Niet gevonden')
      return { data: item }
    }),

  create: async (body: CreateRelatie): Promise<{ data: Relatie }> => {
    try {
      const r = await apiFetch<Relatie>('/relaties', { method: 'POST', body: JSON.stringify(body) })
      cache = [...cache, r.data]
      saveLocal(cache)
      return r
    } catch {
      const item: Relatie = {
        id: `rel${Date.now()}`,
        createdAt: new Date().toISOString(),
        ...body,
        actief: body.actief ?? true,
        land: body.land ?? 'Nederland',
        factuurAdresZelfde: body.factuurAdresZelfde ?? true,
        afleverAdresZelfde: body.afleverAdresZelfde ?? true,
        contacten: body.contacten ?? [],
      }
      cache = [...cache, item]
      saveLocal(cache)
      return { data: item }
    }
  },

  update: async (id: string, body: UpdateRelatie): Promise<{ data: Relatie }> => {
    try {
      const r = await apiFetch<Relatie>(`/relaties/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      cache = cache.map(r2 => r2.id === id ? r.data : r2)
      saveLocal(cache)
      return r
    } catch {
      const existing = cache.find(r => r.id === id)
      if (!existing) throw new Error('Niet gevonden')
      const updated: Relatie = { ...existing, ...body }
      cache = cache.map(r => r.id === id ? updated : r)
      saveLocal(cache)
      return { data: updated }
    }
  },

  remove: async (id: string): Promise<{ data: void }> => {
    try {
      await apiFetch<void>(`/relaties/${id}`, { method: 'DELETE' })
    } catch {}
    cache = cache.filter(r => r.id !== id)
    saveLocal(cache)
    return { data: undefined }
  },
}
