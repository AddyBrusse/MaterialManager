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
  {
    id: 'rel3',
    naam: 'Aerospace Components GmbH',
    type: 'klant',
    actief: true,
    telefoon: '+49 89 123456',
    email: 'procurement@aerocomp.de',
    emailFactuur: 'invoices@aerocomp.de',
    emailOfferte: 'quotes@aerocomp.de',
    website: 'www.aerocomp.de',
    straat: 'Industriestraße 45',
    postcode: '80939',
    stad: 'München',
    land: 'Duitsland',
    factuurAdresZelfde: false,
    factuurStraat: 'Rechnungsstraße 1',
    factuurPostcode: '80333',
    factuurStad: 'München',
    factuurLand: 'Duitsland',
    afleverAdresZelfde: true,
    afleverStraat: null, afleverPostcode: null, afleverStad: null, afleverLand: null,
    kvk: null,
    btw: 'DE123456789',
    iban: null,
    betalingstermijn: 45,
    notities: 'AS9100-gecertificeerd. Meetrapporten verplicht.',
    contacten: [
      { id: 'c4', naam: 'Klaus Weber', functie: 'Einkauf', telefoon: '+49 89 123457', mobiel: null, email: 'k.weber@aerocomp.de' },
    ],
    createdAt: '2025-03-01T11:00:00.000Z',
  },
  {
    id: 'rel4',
    naam: 'Metaal Express B.V.',
    type: 'beide',
    actief: true,
    telefoon: '+31 (0)10 456 7890',
    email: 'info@metaalexpress.nl',
    emailFactuur: null,
    emailOfferte: null,
    website: null,
    straat: 'Havenweg 8',
    postcode: '3089 JH',
    stad: 'Rotterdam',
    land: 'Nederland',
    factuurAdresZelfde: true,
    factuurStraat: null, factuurPostcode: null, factuurStad: null, factuurLand: null,
    afleverAdresZelfde: true,
    afleverStraat: null, afleverPostcode: null, afleverStad: null, afleverLand: null,
    kvk: '55667788',
    btw: 'NL556677880B01',
    iban: 'NL20INGB0001234567',
    betalingstermijn: 30,
    notities: null,
    contacten: [],
    createdAt: '2025-04-20T14:00:00.000Z',
  },
]

function loadStore(): Relatie[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Relatie[]
  } catch {}
  return [...MOCK_RELATIES]
}

function saveStore(data: Relatie[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

let mockStore: Relatie[] = loadStore()

export const relatiesApi = {
  listSync: (): Relatie[] => mockStore,
  list: () =>
    apiFetch<Relatie[]>('/relaties').catch(() => ({ data: mockStore })),

  get: (id: string) =>
    apiFetch<Relatie>(`/relaties/${id}`).catch(() => {
      const item = mockStore.find(r => r.id === id)
      if (!item) throw new Error('Niet gevonden')
      return { data: item }
    }),

  create: (body: CreateRelatie) =>
    apiFetch<Relatie>('/relaties', { method: 'POST', body: JSON.stringify(body) }).catch(() => {
      const defaults = {
        actief: true as boolean,
        land: 'Nederland',
        factuurAdresZelfde: true as boolean,
        afleverAdresZelfde: true as boolean,
        contacten: [] as Relatie['contacten'],
      }
      const item: Relatie = {
        ...defaults,
        ...body,
        id: `rel${Date.now()}`,
        createdAt: new Date().toISOString(),
      }
      mockStore = [...mockStore, item]
      saveStore(mockStore)
      return { data: item }
    }),

  update: (id: string, body: UpdateRelatie) =>
    apiFetch<Relatie>(`/relaties/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).catch(() => {
      const existing = mockStore.find(r => r.id === id)
      if (!existing) throw new Error('Niet gevonden')
      const updated: Relatie = { ...existing, ...body }
      mockStore = mockStore.map(r => r.id === id ? updated : r)
      saveStore(mockStore)
      return { data: updated }
    }),

  remove: (id: string) =>
    apiFetch<void>(`/relaties/${id}`, { method: 'DELETE' }).catch(() => {
      mockStore = mockStore.filter(r => r.id !== id)
      saveStore(mockStore)
      return { data: undefined as void }
    }),
}
