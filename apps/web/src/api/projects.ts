import type {
  Project, CreateProject, UpdateProject,
  Offerte, OfferteRegel, OfferteStatus,
  ProductieOrder,
  Paklijst, Factuur,
  Opdrachtbevestiging, OBStatus,
} from '@stockmanager/shared'
import { notifications } from '@mantine/notifications'
import { apiFetch } from './client'

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

// The PRJ/OFF/PROD/PL/FACT counters below are per-browser (localStorage), but
// IDs must be unique across the whole shop. A fresh browser profile, a
// cleared cache, or simply a different machine starts every counter back at
// 0 — which immediately collides with whatever the server already has (e.g.
// generating "PRJ-2026-001" again when that ID was used months ago) and the
// create request fails with a Postgres unique-constraint error. Re-seed every
// counter from the actual IDs already on the server on every load, so the
// next locally-generated ID is always ahead of anything that exists.
function seedSequenceCounters(projects: Project[]): void {
  const maxByPrefix = new Map<string, number>()
  const track = (id: string) => {
    const m = /^([A-Z]+)-\d{4}-(\d+)$/.exec(id)
    if (!m) return
    const n = parseInt(m[2], 10)
    if (n > (maxByPrefix.get(m[1]) ?? 0)) maxByPrefix.set(m[1], n)
  }
  for (const p of projects) {
    track(p.id)
    for (const o of p.offertes) track(o.id)
    if (p.opdrachtbevestiging) track(p.opdrachtbevestiging.id)
    for (const o of p.productieOrders) track(o.id)
    if (p.paklijst) track(p.paklijst.id)
    if (p.factuur) track(p.factuur.id)
  }
  for (const [prefix, max] of maxByPrefix) {
    const key = `sm_seq_${prefix.toLowerCase()}`
    const current = parseInt(localStorage.getItem(key) ?? '0', 10)
    if (current < max) localStorage.setItem(key, String(max))
  }
}

export async function initProjects(): Promise<void> {
  try {
    const { data } = await apiFetch<Project[]>('/projects')
    cache = data
    saveLocal(data)
    seedSequenceCounters(data)
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

// Every mutation writes to the in-memory cache synchronously, then fires this
// in the background to persist to the API and reconcile the cache with the
// authoritative server result. If that background call fails, the optimistic
// change silently stays in the cache and localStorage but was never actually
// saved server-side — surface that to the user instead of swallowing it, so a
// failed save doesn't masquerade as a successful one until the next reload
// quietly reverts it.
function syncProject(
  projectId: string,
  promise: Promise<{ data: Project }>,
  failMessage: string,
): void {
  promise
    .then(r => { cache = cache.map(p => p.id === projectId ? r.data : p); saveLocal(cache) })
    .catch(() => {
      notifications.show({ color: 'red', message: `${failMessage} — wijziging is niet opgeslagen op de server.` })
    })
}

// ── Sequential numbering (localStorage-backed) ────────────────────────────────
// Client-generated IDs work for a 4-user shop. They're sent to the API on
// create so client and server always agree on the ID immediately — the API
// only falls back to its own sequence if no ID is supplied (see
// apps/api/src/routes/projects.ts). Without this, the client's optimistic ID
// and the server's independently-generated one would diverge as soon as the
// background sync resolves, which (since these IDs are used as React list
// keys and passed as props into open dialogs like ArtikelPickerModal) could
// force-remount components and silently drop in-progress user input.

function nextLocalDocId(prefix: string): string {
  const year = new Date().getFullYear()
  const key = `sm_seq_${prefix.toLowerCase()}`
  const n = parseInt(localStorage.getItem(key) ?? '0') + 1
  localStorage.setItem(key, String(n))
  return `${prefix}-${year}-${String(n).padStart(3, '0')}`
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
      opdrachtbevestiging: null,
      productieOrders: [],
      paklijst: null,
      factuur: null,
      createdAt: now(),
      updatedAt: now(),
    }
    cache = [...cache, p]
    saveLocal(cache)
    syncProject(id, apiFetch<Project>('/projects', { method: 'POST', body: JSON.stringify({ ...body, id }) }), `Project ${id} aanmaken mislukt`)
    return p
  },

  update(id: string, patch: UpdateProject): Project {
    const updated = updateCache(id, p => ({ ...p, ...patch, updatedAt: now() }))
    syncProject(id, apiFetch<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }), `Project ${id} bijwerken mislukt`)
    return updated
  },

  remove(id: string): void {
    cache = cache.filter(p => p.id !== id)
    saveLocal(cache)
    apiFetch<void>(`/projects/${id}`, { method: 'DELETE' }).catch(() => {
      notifications.show({ color: 'red', message: `Project ${id} verwijderen mislukt op de server.` })
    })
  },

  // ── Offerte operations ─────────────────────────────────────────────────────

  addOfferte(projectId: string): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const id = nextLocalDocId('OFF')
    const off: Offerte = {
      id,
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
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/offertes`, {
      method: 'POST', body: JSON.stringify({ id }),
    }), 'Nieuwe offerte aanmaken mislukt')
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
    const id = `regel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const updated = updateCache(projectId, p => {
      const off = p.offertes.find(o => o.id === offerteId)
      if (!off) return p
      const regel: OfferteRegel = {
        id,
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
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}/regels`, {
      method: 'POST', body: JSON.stringify({ ...data, id }),
    }), `Artikel "${data.naam}" toevoegen mislukt`)
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
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}/regels/${regelId}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    }), 'Regel bijwerken mislukt')
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
      .catch(() => {
        notifications.show({ color: 'red', message: 'Regel verwijderen mislukt op de server.' })
      })
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
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}/verzend`, { method: 'POST' }), 'Offerte versturen mislukt')
    return updated
  },

  accepteerOfferte(projectId: string, offerteId: string, userName: string): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const acceptedOfferte = p.offertes.find(o => o.id === offerteId)
    if (!acceptedOfferte) throw new Error('Offerte niet gevonden')

    // Mirrors the server's logic exactly (see accepteer handler in
    // apps/api/src/routes/projects.ts): stappen come only from the regel's
    // frozen `bewerkingen` snapshot, never re-derived from the article's
    // current (possibly since-changed) operations. Diverging from that would
    // optimistically show different steps than what the server persists,
    // flashing/replacing them once the background sync resolves.
    const newOrders: ProductieOrder[] = acceptedOfferte.regels.map(regel => {
      const stappen = regel.bewerkingen.length > 0
        ? regel.bewerkingen.map((naam, i) => ({
            id: `stap_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
            volgorde: i + 1,
            naam,
            machine: naam,
            gereedOp: null,
            gereedDoor: null,
          }))
        : []

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

    const ob: Opdrachtbevestiging | null = acceptedOfferte ? {
      id: nextLocalDocId('OB'),
      projectId,
      offerteId,
      regels: acceptedOfferte.regels,
      levertijdDatum: p?.levertijdDatum ?? null,
      notities: '',
      status: 'concept' as OBStatus,
      verzondenOp: null,
      createdAt: now(),
      updatedAt: now(),
    } : null

    const updated = updateCache(projectId, p => ({
      ...p,
      status: 'bevestigd',
      updatedAt: now(),
      opdrachtbevestiging: ob,
      offertes: p.offertes.map(o => {
        if (o.id === offerteId) return { ...o, status: 'geaccepteerd' as OfferteStatus, geaccepteerdOp: now(), updatedAt: now() }
        if (o.status !== 'geaccepteerd') return { ...o, status: 'vervallen' as OfferteStatus, updatedAt: now() }
        return o
      }),
      productieOrders: [...p.productieOrders, ...newOrders],
    }))

    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}/accepteer`, {
      method: 'POST', body: JSON.stringify({ userName }),
    }), 'Offerte accepteren mislukt')

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
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/orders/${orderId}/stap/${stapId}/check`, {
      method: 'POST', body: JSON.stringify({ userName }),
    }), 'Stap afvinken mislukt')
    return updated
  },

  uncheckStap(projectId: string, orderId: string, stapId: string): Project {
    const updated = updateCache(projectId, p => {
      const orders = p.productieOrders.map(o => {
        if (o.id !== orderId) return o
        const stappen = o.stappen.map(s =>
          s.id === stapId ? { ...s, gereedOp: null, gereedDoor: null } : s,
        )
        const allDone = stappen.every(s => s.gereedOp)
        const anyDone = stappen.some(s => s.gereedOp)
        const status: ProductieOrder['status'] = allDone ? 'gereed' : anyDone ? 'in_productie' : 'gepland'
        return { ...o, stappen, status, updatedAt: now() }
      })
      return { ...p, productieOrders: orders, updatedAt: now() }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/orders/${orderId}/stap/${stapId}/uncheck`, { method: 'POST' }), 'Stap terugzetten mislukt')
    return updated
  },

  planStap(
    projectId: string,
    orderId: string,
    stapId: string,
    geplandDatum: string | null,
    geplandMachine: string | null,
  ): Project {
    const updated = updateCache(projectId, p => ({
      ...p,
      updatedAt: now(),
      productieOrders: p.productieOrders.map(o =>
        o.id !== orderId ? o : {
          ...o,
          updatedAt: now(),
          stappen: o.stappen.map(s =>
            s.id !== stapId ? s : { ...s, geplandDatum, geplandMachine },
          ),
        },
      ),
    }))
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/orders/${orderId}/stap/${stapId}/plan`, {
      method: 'PATCH', body: JSON.stringify({ geplandDatum, geplandMachine }),
    }), 'Stap inplannen mislukt')
    return updated
  },

  unplanOrder(projectId: string, orderId: string): Project {
    const updated = updateCache(projectId, p => ({
      ...p,
      updatedAt: now(),
      productieOrders: p.productieOrders.map(o =>
        o.id !== orderId ? o : {
          ...o,
          updatedAt: now(),
          stappen: o.stappen.map(s =>
            s.gereedOp ? s : { ...s, geplandDatum: null, geplandMachine: null },
          ),
        },
      ),
    }))
    apiFetch(`/projects/${projectId}/orders/${orderId}/unplan`, { method: 'POST' }).catch(() => {
      notifications.show({ color: 'red', message: 'Order deplannen mislukt op de server.' })
    })
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
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/orders/${orderId}/gereed`, { method: 'POST' }), 'Order gereed melden mislukt')
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
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/paklijst`, { method: 'POST' }), 'Paklijst aanmaken mislukt')
    return updated
  },

  verzendPaklijst(projectId: string): Project {
    const updated = updateCache(projectId, p => {
      if (!p.paklijst) throw new Error('Geen paklijst')
      return { ...p, paklijst: { ...p.paklijst, verzondenOp: now() }, status: 'verzonden', updatedAt: now() }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/paklijst/verzend`, { method: 'POST' }), 'Paklijst versturen mislukt')
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
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/factuur`, { method: 'POST', body: JSON.stringify({ btwPct }) }), 'Factuur aanmaken mislukt')
    return updated
  },

  verzendFactuur(projectId: string): Project {
    const updated = updateCache(projectId, p => {
      if (!p.factuur) throw new Error('Geen factuur')
      return { ...p, factuur: { ...p.factuur, verzondenOp: now() }, updatedAt: now() }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/factuur/verzend`, { method: 'POST' }), 'Factuur versturen mislukt')
    return updated
  },

  // ── Opdrachtbevestiging ───────────────────────────────────────────────────

  updateOB(projectId: string, patch: { notities?: string; levertijdDatum?: string | null }): Project {
    const updated = updateCache(projectId, p => {
      if (!p.opdrachtbevestiging) throw new Error('Geen opdrachtbevestiging')
      return { ...p, updatedAt: now(), opdrachtbevestiging: { ...p.opdrachtbevestiging, ...patch, updatedAt: now() } }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/opdrachtbevestiging`, {
      method: 'PATCH', body: JSON.stringify(patch),
    }), 'Opdrachtbevestiging bijwerken mislukt')
    return updated
  },

  verzendOB(projectId: string): Project {
    const updated = updateCache(projectId, p => {
      if (!p.opdrachtbevestiging) throw new Error('Geen opdrachtbevestiging')
      return {
        ...p,
        updatedAt: now(),
        opdrachtbevestiging: { ...p.opdrachtbevestiging, status: 'verzonden' as OBStatus, verzondenOp: now(), updatedAt: now() },
      }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/opdrachtbevestiging/verzend`, { method: 'POST' }), 'Opdrachtbevestiging versturen mislukt')
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
