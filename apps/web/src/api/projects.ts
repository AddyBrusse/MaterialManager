import type {
  Project, CreateProject, UpdateProject,
  Offerte, OfferteRegel, OfferteStatus,
  ProductieOrder,
  Paklijst, Factuur,
} from '@stockmanager/shared'
import { apiFetch } from './client'
import { articlesApi, KNOWN_OPERATIONS } from './articles'

// ── Cache layer ────────────────────────────────────────────────────────────────

const LS_KEY = 'sm_projects'

function loadLocal(): Project[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Project[]
  } catch {}
  return []
}

function saveLocal(data: Project[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

let cache: Project[] = loadLocal()

export async function initProjects(): Promise<void> {
  try {
    const { data } = await apiFetch<Project[]>('/projects')
    cache = data
    saveLocal(data)
  } catch {
    cache = loadLocal()
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function now(): string { return new Date().toISOString() }

function updateCache(id: string, fn: (p: Project) => Project): Project {
  let updated!: Project
  cache = cache.map(p => {
    if (p.id !== id) return p
    updated = fn(p)
    return updated
  })
  if (!updated) throw new Error(`Project ${id} niet gevonden`)
  saveLocal(cache)
  return updated
}

function buildStappen(artikelId: string | null) {
  if (!artikelId) return []
  const artikel = articlesApi.get(artikelId)
  if (!artikel || artikel.operations.length === 0) return []
  return artikel.operations.map((op, i) => ({
    id: `stap_${Date.now()}_${i}`,
    volgorde: i + 1,
    naam: KNOWN_OPERATIONS.find(ko => ko.id === op.type)?.name ?? op.type,
    machine: null,
    gereedOp: null,
    gereedDoor: null,
  }))
}

// ── Sequential numbering (localStorage-backed) ────────────────────────────────
// Client-generated IDs work for a 4-user shop. The API uses these same IDs.

function nextLocalDocId(prefix: string): string {
  const year = new Date().getFullYear()
  const key = `sm_seq_${prefix.toLowerCase()}`
  const n = parseInt(localStorage.getItem(key) ?? '0') + 1
  localStorage.setItem(key, String(n))
  return `${prefix}-${year}-${String(n).padStart(3, '0')}`
}

// Background: push project state to API (fire-and-forget).
// Components never wait on this — cache is the source of truth.
function syncToApi(p: Project) {
  apiFetch<Project>(`/projects/${p.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      naam: p.naam, relatieId: p.relatieId, contactId: p.contactId,
      klantRef: p.klantRef, status: p.status, levertijdDatum: p.levertijdDatum,
      notities: p.notities,
    }),
  }).catch(() => {})
  // The above only persists top-level fields. For nested JSONB documents we
  // store the full project via a dedicated endpoint (handled per-operation below).
}

// ── Public API ─────────────────────────────────────────────────────────────────
// ALL mutations: synchronous cache update → return result → background API sync.
// This lets components call without await and immediately rerender().

export const projectsApi = {

  // ── CRUD ────────────────────────────────────────────────────────────────────

  list(): Project[] {
    return cache
  },

  get(id: string): Project {
    const p = cache.find(p => p.id === id)
    if (!p) throw new Error('Project niet gevonden')
    return p
  },

  create(body: CreateProject): Project {
    const id = nextLocalDocId('PRJ')
    const p: Project = {
      id,
      naam: body.naam,
      relatieId: body.relatieId,
      contactId: body.contactId,
      klantRef: body.klantRef,
      status: 'concept',
      levertijdDatum: body.levertijdDatum,
      notities: body.notities,
      offertes: [],
      productieOrders: [],
      paklijst: null,
      factuur: null,
      createdAt: now(),
      updatedAt: now(),
    }
    cache = [...cache, p]
    saveLocal(cache)
    apiFetch<Project>('/projects', { method: 'POST', body: JSON.stringify({ ...body, id }) })
      .then(r => { cache = cache.map(x => x.id === id ? r.data : x); saveLocal(cache) })
      .catch(() => {})
    return p
  },

  update(id: string, patch: UpdateProject): Project {
    const updated = updateCache(id, p => ({ ...p, ...patch, updatedAt: now() }))
    apiFetch<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      .catch(() => {})
    return updated
  },

  remove(id: string): void {
    cache = cache.filter(p => p.id !== id)
    saveLocal(cache)
    apiFetch<void>(`/projects/${id}`, { method: 'DELETE' }).catch(() => {})
  },

  // ── Offerte operations ─────────────────────────────────────────────────────

  addOfferte(projectId: string): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const off: Offerte = {
      id: nextLocalDocId('OFF'),
      projectId,
      versie: p.offertes.length + 1,
      status: 'concept',
      regels: [],
      notities: '',
      geldigTot: null,
      verzondenOp: null,
      geaccepteerdOp: null,
      createdAt: now(),
      updatedAt: now(),
    }
    const updated = updateCache(projectId, p => ({ ...p, offertes: [...p.offertes, off], updatedAt: now() }))
    apiFetch<Project>(`/projects/${projectId}/offertes`, { method: 'POST' })
      .then(r => { cache = cache.map(p => p.id === projectId ? r.data : p); saveLocal(cache) })
      .catch(() => {})
    return updated
  },

  addOfferteRegel(
    projectId: string,
    offerteId: string,
    data: {
      artikelId: string | null
      naam: string
      omschrijving: string
      qty: number
      eenheid: string
      verkoopprijs: number
      bewerkingen: string[]
    },
  ): Project {
    const updated = updateCache(projectId, p => {
      const off = p.offertes.find(o => o.id === offerteId)
      if (!off) return p
      const regel: OfferteRegel = {
        id: `regel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        sortOrder: off.regels.length + 1,
        artikelId: data.artikelId,
        naam: data.naam,
        omschrijving: data.omschrijving,
        qty: data.qty,
        eenheid: data.eenheid,
        verkoopprijs: data.verkoopprijs,
        totaal: Math.round(data.qty * data.verkoopprijs * 100) / 100,
        bewerkingen: data.bewerkingen,
      }
      return {
        ...p,
        updatedAt: now(),
        offertes: p.offertes.map(o =>
          o.id === offerteId ? { ...o, regels: [...o.regels, regel], updatedAt: now() } : o,
        ),
      }
    })
    apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}/regels`, {
      method: 'POST', body: JSON.stringify(data),
    }).then(r => { cache = cache.map(p => p.id === projectId ? r.data : p); saveLocal(cache) })
      .catch(() => {})
    return updated
  },

  updateOfferteRegel(
    projectId: string,
    offerteId: string,
    regelId: string,
    patch: Partial<Pick<OfferteRegel, 'naam' | 'omschrijving' | 'qty' | 'eenheid' | 'verkoopprijs'>>,
  ): Project {
    const updated = updateCache(projectId, p => ({
      ...p,
      updatedAt: now(),
      offertes: p.offertes.map(o => {
        if (o.id !== offerteId) return o
        return {
          ...o,
          updatedAt: now(),
          regels: o.regels.map(r => {
            if (r.id !== regelId) return r
            const u = { ...r, ...patch }
            u.totaal = Math.round(u.qty * u.verkoopprijs * 100) / 100
            return u
          }),
        }
      }),
    }))
    apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}/regels/${regelId}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    }).then(r => { cache = cache.map(p => p.id === projectId ? r.data : p); saveLocal(cache) })
      .catch(() => {})
    return updated
  },

  removeOfferteRegel(projectId: string, offerteId: string, regelId: string): Project {
    const updated = updateCache(projectId, p => ({
      ...p,
      updatedAt: now(),
      offertes: p.offertes.map(o =>
        o.id !== offerteId ? o
          : { ...o, regels: o.regels.filter(r => r.id !== regelId), updatedAt: now() },
      ),
    }))
    apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}/regels/${regelId}`, { method: 'DELETE' })
      .catch(() => {})
    return updated
  },

  verzendOfferte(projectId: string, offerteId: string): Project {
    const updated = updateCache(projectId, p => ({
      ...p,
      status: p.status === 'concept' ? 'offerte' : p.status,
      updatedAt: now(),
      offertes: p.offertes.map(o =>
        o.id === offerteId
          ? { ...o, status: 'verzonden' as OfferteStatus, verzondenOp: now(), updatedAt: now() }
          : o,
      ),
    }))
    apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}/verzend`, { method: 'POST' })
      .then(r => { cache = cache.map(p => p.id === projectId ? r.data : p); saveLocal(cache) })
      .catch(() => {})
    return updated
  },

  accepteerOfferte(projectId: string, offerteId: string, userName: string): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const acceptedOfferte = p.offertes.find(o => o.id === offerteId)
    if (!acceptedOfferte) throw new Error('Offerte niet gevonden')

    const newOrders: ProductieOrder[] = acceptedOfferte.regels.map(regel => {
      const stappen = regel.bewerkingen.length > 0
        ? regel.bewerkingen.map((naam, i) => ({
            id: `stap_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
            volgorde: i + 1,
            naam,
            machine: null,
            gereedOp: null,
            gereedDoor: null,
          }))
        : buildStappen(regel.artikelId)

      return {
        id: nextLocalDocId('PROD'),
        projectId,
        offerteRegelId: regel.id,
        artikelId: regel.artikelId,
        artikelNaam: regel.naam,
        qty: regel.qty,
        eenheid: regel.eenheid,
        stappen,
        status: 'gepland' as const,
        createdAt: now(),
        updatedAt: now(),
      }
    })

    const updated = updateCache(projectId, p => ({
      ...p,
      status: 'bevestigd',
      updatedAt: now(),
      offertes: p.offertes.map(o => {
        if (o.id === offerteId) return { ...o, status: 'geaccepteerd' as OfferteStatus, geaccepteerdOp: now(), updatedAt: now() }
        if (o.status !== 'geaccepteerd') return { ...o, status: 'vervallen' as OfferteStatus, updatedAt: now() }
        return o
      }),
      productieOrders: [...p.productieOrders, ...newOrders],
    }))

    apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}/accepteer`, {
      method: 'POST', body: JSON.stringify({ userName }),
    }).then(r => { cache = cache.map(p => p.id === projectId ? r.data : p); saveLocal(cache) })
      .catch(() => {})

    return updated
  },

  // ── Productie order operations ─────────────────────────────────────────────

  checkOffStap(projectId: string, orderId: string, stapId: string, userName: string): Project {
    const updated = updateCache(projectId, p => {
      const orders = p.productieOrders.map(o => {
        if (o.id !== orderId) return o
        const stappen = o.stappen.map(s =>
          s.id === stapId && !s.gereedOp ? { ...s, gereedOp: now(), gereedDoor: userName } : s,
        )
        const allDone = stappen.every(s => s.gereedOp)
        const anyDone = stappen.some(s => s.gereedOp)
        const status: ProductieOrder['status'] = allDone ? 'gereed' : anyDone ? 'in_productie' : 'gepland'
        return { ...o, stappen, status, updatedAt: now() }
      })
      const status = p.status === 'bevestigd' ? 'productie' : p.status
      return { ...p, productieOrders: orders, status, updatedAt: now() }
    })
    apiFetch<Project>(`/projects/${projectId}/orders/${orderId}/stap/${stapId}/check`, {
      method: 'POST', body: JSON.stringify({ userName }),
    }).then(r => { cache = cache.map(p => p.id === projectId ? r.data : p); saveLocal(cache) })
      .catch(() => {})
    return updated
  },

  markOrderGereed(projectId: string, orderId: string): Project {
    const updated = updateCache(projectId, p => ({
      ...p,
      productieOrders: p.productieOrders.map(o =>
        o.id === orderId ? { ...o, status: 'gereed' as const, updatedAt: now() } : o,
      ),
      status: p.status === 'bevestigd' ? 'productie' : p.status,
      updatedAt: now(),
    }))
    apiFetch<Project>(`/projects/${projectId}/orders/${orderId}/gereed`, { method: 'POST' })
      .then(r => { cache = cache.map(p => p.id === projectId ? r.data : p); saveLocal(cache) })
      .catch(() => {})
    return updated
  },

  // ── Paklijst ──────────────────────────────────────────────────────────────

  createPaklijst(projectId: string): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    if (p.paklijst) throw new Error('Paklijst bestaat al')
    const gereed = p.productieOrders.filter(o => o.status === 'gereed')
    if (gereed.length === 0) throw new Error('Geen gereed productie orders')

    const paklijst: Paklijst = {
      id: nextLocalDocId('PL'),
      projectId,
      regels: gereed.map(o => ({
        productieOrderId: o.id,
        artikelNaam: o.artikelNaam,
        qty: o.qty,
        eenheid: o.eenheid,
      })),
      notities: '',
      verzondenOp: null,
      createdAt: now(),
    }
    const updated = updateCache(projectId, p => ({ ...p, paklijst, status: 'paklijst', updatedAt: now() }))
    apiFetch<Project>(`/projects/${projectId}/paklijst`, { method: 'POST' })
      .then(r => { cache = cache.map(p => p.id === projectId ? r.data : p); saveLocal(cache) })
      .catch(() => {})
    return updated
  },

  verzendPaklijst(projectId: string): Project {
    const updated = updateCache(projectId, p => {
      if (!p.paklijst) throw new Error('Geen paklijst')
      return { ...p, paklijst: { ...p.paklijst, verzondenOp: now() }, status: 'verzonden', updatedAt: now() }
    })
    apiFetch<Project>(`/projects/${projectId}/paklijst/verzend`, { method: 'POST' })
      .then(r => { cache = cache.map(p => p.id === projectId ? r.data : p); saveLocal(cache) })
      .catch(() => {})
    return updated
  },

  // ── Factuur ───────────────────────────────────────────────────────────────

  createFactuur(projectId: string, btwPct = 21): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    if (p.factuur) throw new Error('Factuur bestaat al')
    const accepted = p.offertes.find(o => o.status === 'geaccepteerd')
    if (!accepted) throw new Error('Geen geaccepteerde offerte')

    const regels = accepted.regels.map(r => ({
      offerteRegelId: r.id,
      naam: r.naam,
      qty: r.qty,
      eenheid: r.eenheid,
      verkoopprijs: r.verkoopprijs,
      totaal: r.totaal,
    }))

    const subtotaal = Math.round(regels.reduce((s, r) => s + r.totaal, 0) * 100) / 100
    const btwBedrag = Math.round(subtotaal * (btwPct / 100) * 100) / 100
    const totaalInclBtw = Math.round((subtotaal + btwBedrag) * 100) / 100

    const vervalDate = new Date()
    vervalDate.setDate(vervalDate.getDate() + 30)

    const factuur: Factuur = {
      id: nextLocalDocId('FACT'),
      projectId,
      offerteId: accepted.id,
      regels,
      btwPct,
      subtotaal,
      btwBedrag,
      totaalInclBtw,
      notities: '',
      vervaldatum: vervalDate.toISOString().split('T')[0],
      verzondenOp: null,
      createdAt: now(),
    }

    const updated = updateCache(projectId, p => ({ ...p, factuur, status: 'gefactureerd', updatedAt: now() }))
    apiFetch<Project>(`/projects/${projectId}/factuur`, { method: 'POST', body: JSON.stringify({ btwPct }) })
      .then(r => { cache = cache.map(p => p.id === projectId ? r.data : p); saveLocal(cache) })
      .catch(() => {})
    return updated
  },

  verzendFactuur(projectId: string): Project {
    const updated = updateCache(projectId, p => {
      if (!p.factuur) throw new Error('Geen factuur')
      return { ...p, factuur: { ...p.factuur, verzondenOp: now() }, updatedAt: now() }
    })
    apiFetch<Project>(`/projects/${projectId}/factuur/verzend`, { method: 'POST' })
      .then(r => { cache = cache.map(p => p.id === projectId ? r.data : p); saveLocal(cache) })
      .catch(() => {})
    return updated
  },
}

// ── Computed helpers for UI ────────────────────────────────────────────────────

export function deriveProjectStatus(p: Project): Project['status'] {
  if (p.status === 'on_hold' || p.status === 'geannuleerd') return p.status
  if (p.factuur) return 'gefactureerd'
  if (p.paklijst?.verzondenOp) return 'verzonden'
  if (p.paklijst) return 'paklijst'
  if (p.productieOrders.length > 0) return 'productie'
  if (p.offertes.some(o => o.status === 'geaccepteerd')) return 'bevestigd'
  if (p.offertes.some(o => o.status === 'verzonden')) return 'offerte'
  return 'concept'
}

export function getAcceptedOfferte(p: Project) {
  return p.offertes.find(o => o.status === 'geaccepteerd') ?? null
}

export function getProjectSubtotaal(p: Project): number {
  const off = getAcceptedOfferte(p)
  if (!off) return 0
  return off.regels.reduce((s, r) => s + r.totaal, 0)
}

export function allOrdersGereed(p: Project): boolean {
  return p.productieOrders.length > 0 && p.productieOrders.every(o => o.status === 'gereed')
}

export function formatBedrag(n: number): string {
  return `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}
