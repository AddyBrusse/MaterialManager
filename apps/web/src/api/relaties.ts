import type { Relatie, CreateRelatie, UpdateRelatie } from '@stockmanager/shared'
import type { LaadFout } from '../utils/fout-melding'
import { apiFetch } from './client'

export type { Relatie, RelatieContact } from '@stockmanager/shared'

const LS_KEY = 'sm_relaties'

function loadLocal(): Relatie[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Relatie[]
  } catch {}
  return []
}

function saveLocal(data: Relatie[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

let cache: Relatie[] = loadLocal()

export async function initRelaties(): Promise<LaadFout | null> {
  try {
    const { data } = await apiFetch<Relatie[]>('/relaties')
    cache = data
    saveLocal(data)
    return null
  } catch (fout) {
    cache = loadLocal()
    // Niet stil: zie initProjects. Gemeld in useInitAppData.
    return { wat: 'relaties', aantalLokaal: cache.length, fout }
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

  /**
   * Aanmaken zonder terugval: gooit een `ApiFout` als de server het niet
   * aanneemt. `create` hierboven valt dan stil terug op een kopie in deze
   * browser, en een project dat daarnaar wijst, wijst op de server naar niets.
   * Voor de klantkeuze op een project (Algemeen-tab).
   */
  aanmaken: async (body: CreateRelatie): Promise<Relatie> => {
    const { data } = await apiFetch<Relatie>('/relaties', { method: 'POST', body: JSON.stringify(body) })
    cache = [...cache, data]
    saveLocal(cache)
    return data
  },

  /** Een contactpersoon bij een bestaande relatie, ook zonder terugval. Geeft het nieuwe contact terug. */
  contactToevoegen: async (relatieId: string, naam: string): Promise<{ relatie: Relatie; contactId: string }> => {
    const bestaand = cache.find((r) => r.id === relatieId)
    if (!bestaand) throw new Error('Deze klant staat niet (meer) in de lijst. Ververs de pagina.')
    const contactId = `c${Date.now()}`
    const contacten = [...(bestaand.contacten ?? []), { id: contactId, naam }]
    const { data } = await apiFetch<Relatie>(`/relaties/${relatieId}`, {
      method: 'PATCH',
      body: JSON.stringify({ contacten }),
    })
    cache = cache.map((r) => (r.id === relatieId ? data : r))
    saveLocal(cache)
    return { relatie: data, contactId }
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
