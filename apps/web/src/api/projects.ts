import type {
  Project, CreateProject, UpdateProject,
  Offerte, OfferteRegel, OfferteStatus,
  ProductieOrder, ProductieStap,
  Paklijst, Factuur,
} from '@stockmanager/shared'
import { articlesApi, KNOWN_OPERATIONS } from './articles'

// ── Sequential number generation ──────────────────────────────────────────────

function nextDocId(prefix: string): string {
  const year = new Date().getFullYear()
  const key = `sm_seq_${prefix.toLowerCase()}`
  const n = parseInt(localStorage.getItem(key) ?? '0') + 1
  localStorage.setItem(key, String(n))
  return `${prefix}-${year}-${String(n).padStart(3, '0')}`
}

// ── localStorage persistence ──────────────────────────────────────────────────

const LS_KEY = 'sm_projects'

function load(): Project[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Project[]
  } catch {}
  return []
}

function save(data: Project[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

let store: Project[] = load()

function mutate(updater: (draft: Project[]) => Project[]): void {
  store = updater(store)
  save(store)
}

function updateProject(id: string, fn: (p: Project) => Project): Project {
  let updated!: Project
  mutate(s => s.map(p => {
    if (p.id !== id) return p
    updated = fn(p)
    return updated
  }))
  if (!updated) throw new Error(`Project ${id} niet gevonden`)
  return updated
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function now(): string { return new Date().toISOString() }

function computeOfferteSubtotaal(offertes: Offerte[]): { subtotaal: number; offerteId: string | null } {
  const accepted = offertes.find(o => o.status === 'geaccepteerd')
  if (!accepted) return { subtotaal: 0, offerteId: null }
  const subtotaal = accepted.regels.reduce((s, r) => s + r.totaal, 0)
  return { subtotaal, offerteId: accepted.id }
}

// Determine project status derived from documents (for auto-advance suggestions)
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

// Build productie stappen from article operations (frozen snapshot)
function buildStappen(artikelId: string | null): ProductieStap[] {
  if (!artikelId) return []
  try {
    const articles = articlesApi.list()
    const artikel = articles.find(a => a.id === artikelId)
    if (!artikel || artikel.operations.length === 0) return []
    return artikel.operations.map((op, i) => ({
      id: `stap_${Date.now()}_${i}`,
      volgorde: i + 1,
      naam: KNOWN_OPERATIONS.find(ko => ko.id === op.type)?.name ?? op.type,
      machine: null,
      gereedOp: null,
      gereedDoor: null,
    }))
  } catch {
    return []
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const projectsApi = {

  // ── CRUD ──────────────────────────────────────────────────────────────────

  list(): Project[] {
    return store
  },

  get(id: string): Project {
    const p = store.find(p => p.id === id)
    if (!p) throw new Error('Project niet gevonden')
    return p
  },

  create(body: CreateProject): Project {
    const p: Project = {
      id: nextDocId('PRJ'),
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
    mutate(s => [...s, p])
    return p
  },

  update(id: string, patch: UpdateProject): Project {
    return updateProject(id, p => ({ ...p, ...patch, updatedAt: now() }))
  },

  remove(id: string): void {
    mutate(s => s.filter(p => p.id !== id))
  },

  // ── Offerte operations ─────────────────────────────────────────────────────

  addOfferte(projectId: string): Project {
    return updateProject(projectId, p => {
      const versie = p.offertes.length + 1
      const off: Offerte = {
        id: nextDocId('OFF'),
        projectId,
        versie,
        status: 'concept',
        regels: [],
        notities: '',
        geldigTot: null,
        verzondenOp: null,
        geaccepteerdOp: null,
        createdAt: now(),
        updatedAt: now(),
      }
      return { ...p, offertes: [...p.offertes, off], updatedAt: now() }
    })
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
    return updateProject(projectId, p => ({
      ...p,
      updatedAt: now(),
      offertes: p.offertes.map(o => {
        if (o.id !== offerteId) return o
        const regel: OfferteRegel = {
          id: `regel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          sortOrder: o.regels.length + 1,
          artikelId: data.artikelId,
          naam: data.naam,
          omschrijving: data.omschrijving,
          qty: data.qty,
          eenheid: data.eenheid,
          verkoopprijs: data.verkoopprijs,
          totaal: Math.round(data.qty * data.verkoopprijs * 100) / 100,
          bewerkingen: data.bewerkingen,
        }
        return { ...o, regels: [...o.regels, regel], updatedAt: now() }
      }),
    }))
  },

  updateOfferteRegel(
    projectId: string,
    offerteId: string,
    regelId: string,
    patch: Partial<Pick<OfferteRegel, 'naam' | 'omschrijving' | 'qty' | 'eenheid' | 'verkoopprijs'>>,
  ): Project {
    return updateProject(projectId, p => ({
      ...p,
      updatedAt: now(),
      offertes: p.offertes.map(o => {
        if (o.id !== offerteId) return o
        return {
          ...o,
          updatedAt: now(),
          regels: o.regels.map(r => {
            if (r.id !== regelId) return r
            const updated = { ...r, ...patch }
            updated.totaal = Math.round(updated.qty * updated.verkoopprijs * 100) / 100
            return updated
          }),
        }
      }),
    }))
  },

  removeOfferteRegel(projectId: string, offerteId: string, regelId: string): Project {
    return updateProject(projectId, p => ({
      ...p,
      updatedAt: now(),
      offertes: p.offertes.map(o => {
        if (o.id !== offerteId) return o
        return { ...o, regels: o.regels.filter(r => r.id !== regelId), updatedAt: now() }
      }),
    }))
  },

  verzendOfferte(projectId: string, offerteId: string): Project {
    return updateProject(projectId, p => {
      const updated = {
        ...p,
        updatedAt: now(),
        offertes: p.offertes.map(o =>
          o.id === offerteId
            ? { ...o, status: 'verzonden' as OfferteStatus, verzondenOp: now(), updatedAt: now() }
            : o,
        ),
      }
      // Advance project status to 'offerte' if still at concept
      if (updated.status === 'concept') updated.status = 'offerte'
      return updated
    })
  },

  accepteerOfferte(projectId: string, offerteId: string, userName: string): Project {
    return updateProject(projectId, p => {
      const acceptedOfferte = p.offertes.find(o => o.id === offerteId)
      if (!acceptedOfferte) throw new Error('Offerte niet gevonden')

      // Create productie orders from accepted offerte rules (frozen snapshot)
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

        const order: ProductieOrder = {
          id: nextDocId('PROD'),
          projectId,
          offerteRegelId: regel.id,
          artikelId: regel.artikelId,
          artikelNaam: regel.naam,
          qty: regel.qty,
          eenheid: regel.eenheid,
          stappen,
          status: 'gepland',
          createdAt: now(),
          updatedAt: now(),
        }
        return order
      })

      return {
        ...p,
        status: 'bevestigd',
        updatedAt: now(),
        offertes: p.offertes.map(o => {
          if (o.id === offerteId) {
            return { ...o, status: 'geaccepteerd' as OfferteStatus, geaccepteerdOp: now(), updatedAt: now() }
          }
          // Mark all other non-geaccepteerd offertes as vervallen
          if (o.status !== 'geaccepteerd') {
            return { ...o, status: 'vervallen' as OfferteStatus, updatedAt: now() }
          }
          return o
        }),
        productieOrders: [...p.productieOrders, ...newOrders],
      }
    })
  },

  // ── Productie order operations ─────────────────────────────────────────────

  checkOffStap(projectId: string, orderId: string, stapId: string, userName: string): Project {
    return updateProject(projectId, p => {
      const updatedOrders = p.productieOrders.map(o => {
        if (o.id !== orderId) return o
        const updatedStappen = o.stappen.map(s =>
          s.id === stapId && !s.gereedOp
            ? { ...s, gereedOp: now(), gereedDoor: userName }
            : s,
        )
        const allDone = updatedStappen.every(s => s.gereedOp)
        const anyDone = updatedStappen.some(s => s.gereedOp)
        const status: ProductieOrder['status'] = allDone
          ? 'gereed'
          : anyDone
          ? 'in_productie'
          : 'gepland'
        return { ...o, stappen: updatedStappen, status, updatedAt: now() }
      })

      // Auto-advance project status to 'productie'
      const status = p.status === 'bevestigd' ? 'productie' : p.status

      return { ...p, productieOrders: updatedOrders, status, updatedAt: now() }
    })
  },

  markOrderGereed(projectId: string, orderId: string): Project {
    return updateProject(projectId, p => {
      const updatedOrders = p.productieOrders.map(o =>
        o.id === orderId ? { ...o, status: 'gereed' as const, updatedAt: now() } : o,
      )
      const status = p.status === 'bevestigd' ? 'productie' : p.status
      return { ...p, productieOrders: updatedOrders, status, updatedAt: now() }
    })
  },

  // ── Paklijst ──────────────────────────────────────────────────────────────

  createPaklijst(projectId: string): Project {
    return updateProject(projectId, p => {
      if (p.paklijst) throw new Error('Paklijst bestaat al')
      const gereed = p.productieOrders.filter(o => o.status === 'gereed')
      if (gereed.length === 0) throw new Error('Geen gereed productie orders')

      const paklijst: Paklijst = {
        id: nextDocId('PL'),
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

      return { ...p, paklijst, status: 'paklijst', updatedAt: now() }
    })
  },

  verzendPaklijst(projectId: string): Project {
    return updateProject(projectId, p => {
      if (!p.paklijst) throw new Error('Geen paklijst')
      return {
        ...p,
        paklijst: { ...p.paklijst, verzondenOp: now() },
        status: 'verzonden',
        updatedAt: now(),
      }
    })
  },

  // ── Factuur ───────────────────────────────────────────────────────────────

  createFactuur(projectId: string, btwPct = 21): Project {
    return updateProject(projectId, p => {
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

      // Vervaldatum: 30 dagen na vandaag
      const vervalDate = new Date()
      vervalDate.setDate(vervalDate.getDate() + 30)

      const factuur: Factuur = {
        id: nextDocId('FACT'),
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

      return { ...p, factuur, status: 'gefactureerd', updatedAt: now() }
    })
  },

  verzendFactuur(projectId: string): Project {
    return updateProject(projectId, p => {
      if (!p.factuur) throw new Error('Geen factuur')
      return { ...p, factuur: { ...p.factuur, verzondenOp: now() }, updatedAt: now() }
    })
  },
}

// ── Computed helpers for UI ───────────────────────────────────────────────────

export function getAcceptedOfferte(p: Project): Offerte | null {
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
  return `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}
