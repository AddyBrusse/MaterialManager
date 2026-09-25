import type {
  Project, CreateProject, UpdateProject,
  Offerte, OfferteRegel, OfferteStatus,
  ProductieOrder,
  Paklijst, Factuur,
  Opdrachtbevestiging, OBStatus,
} from '@stockmanager/shared'
import { berekenVoortgang, basisRegels, kopieerOfferte, volgendeVersie, projectNaIntrekken } from '@stockmanager/shared'
import { apiFetch, ApiFout } from './client'
import { meldFout } from '../utils/fout-melding-toon'
import type { LaadFout } from '../utils/fout-melding'

// Bedragen worden op twee plekken berekend (hier optimistisch, op de server
// definitief). Zelfde afronding, anders springt het bedrag zodra het antwoord
// binnenkomt.
function geldbedragen(regels: { totaal: number }[], btwPct: number) {
  const subtotaal = Math.round(regels.reduce((s, r) => s + r.totaal, 0) * 100) / 100
  const btwBedrag = Math.round(subtotaal * (btwPct / 100) * 100) / 100
  return { subtotaal, btwBedrag, totaalInclBtw: Math.round((subtotaal + btwBedrag) * 100) / 100 }
}

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
    for (const pl of p.paklijsten) track(pl.id)
    for (const f of p.facturen) track(f.id)
  }
  for (const [prefix, max] of maxByPrefix) {
    const key = `sm_seq_${prefix.toLowerCase()}`
    const current = parseInt(localStorage.getItem(key) ?? '0', 10)
    if (current < max) localStorage.setItem(key, String(max))
  }
}

export async function initProjects(): Promise<LaadFout | null> {
  try {
    const { data } = await apiFetch<Project[]>('/projects')
    cache = data
    saveLocal(data)
    seedSequenceCounters(data)
    return null
  } catch (fout) {
    cache = loadLocal()
    // Dit viel eerder stil terug op de kopie in de browser. Op 2026-09-25
    // werkte iemand daardoor op een kopie zonder het te weten: de database
    // liep achter, het laden faalde, en elke knop gaf daarna "mislukt" zonder
    // dat iets zei dát het scherm niet van de server kwam. Gemeld wordt het in
    // useInitAppData, samen met de andere lijsten.
    return { wat: 'projecten', aantalLokaal: cache.length, fout }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function now(): string { return new Date().toISOString() }

function updateCache(id: string, fn: (p: Project) => Project): Project {
  let updated!: Project
  cache = cache.map(p => {
    if (p.id !== id) return p
    // Hoe het project eruitzag vóór deze reeks wijzigingen. Nodig als de
    // opslag mislukt én de server ook niet te lezen is: dan is dit het enige
    // waar we eerlijk naar terug kunnen. Zonder dit stond een mislukte kopie
    // ook na herladen nog in beeld — hij zat al in de bewaarde browserkopie.
    if ((saveInflight[id] ?? 0) === 0) vorigeStand[id] = p
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
  /** De handeling in gewone taal, bv. "Offerte versturen". De melding zet er
   *  zelf "mislukt" achter. */
  actie: string,
): void {
  // Start of a fresh save batch for this project → clear any prior error.
  if ((saveInflight[projectId] ?? 0) === 0) saveErrored[projectId] = false
  saveInflight[projectId] = (saveInflight[projectId] ?? 0) + 1
  setSaveState(projectId, 'saving')
  promise
    .then(r => { cache = cache.map(p => p.id === projectId ? r.data : p); saveLocal(cache) })
    .catch(async (fout: unknown) => {
      saveErrored[projectId] = true
      // De wijziging stond al op het scherm (optimistisch). Nu het niet gelukt
      // is, halen we op wat er wérkelijk op de server staat — anders toont het
      // scherm iets wat niet bestaat, tot iemand herlaadt. Dat terughalen
      // bepaalt ook wat we eerlijk over het gevolg kunnen zeggen.
      const onzeker = fout instanceof ApiFout && fout.code === 'TIMEOUT'
      let gevolg: string
      try {
        const r = await apiFetch<Project>(`/projects/${projectId}`)
        cache = cache.map(p => p.id === projectId ? r.data : p)
        saveLocal(cache)
        gevolg = onzeker
          // Na een time-out kan de server het alsnog verwerkt hebben. Dan is
          // "niets opgeslagen" niet waar — we weten het niet.
          ? 'Onbekend of het is opgeslagen: de server antwoordde niet op tijd. '
            + 'Het scherm toont nu wat er op de server staat — kijk of je wijziging erbij staat.'
          : 'Niets opgeslagen. Het scherm is teruggezet naar wat er op de server staat; '
            + 'doe het opnieuw als de oorzaak is opgelost.'
      } catch {
        const vorig = vorigeStand[projectId]
        if (vorig) {
          cache = cache.map(p => p.id === projectId ? vorig : p)
          saveLocal(cache)
          gevolg = 'Niets opgeslagen, en de server was ook niet te lezen. Het scherm is teruggezet '
            + 'naar hoe het was vóór deze handeling — dat is de kopie uit deze browser, die '
            + 'verouderd kan zijn.'
        } else {
          gevolg = 'Niets opgeslagen op de server, en de server was ook niet te lezen. Het scherm '
            + 'kan je wijziging nog tonen terwijl die nergens is opgeslagen.'
        }
      }
      meldFout({ actie, fout, gevolg })
    })
    .finally(() => {
      saveInflight[projectId] = Math.max(0, (saveInflight[projectId] ?? 1) - 1)
      if (saveInflight[projectId] === 0) {
        delete vorigeStand[projectId]
        setSaveState(projectId, saveErrored[projectId] ? 'error' : 'saved')
        const wachtenden = opslagWachters[projectId] ?? []
        opslagWachters[projectId] = []
        wachtenden.forEach(w => w(!saveErrored[projectId]))
      }
    })
}

/**
 * Wacht tot alles wat voor dit project onderweg is, bij de server is aangekomen.
 * `true` als dat gelukt is, `false` als er iets mislukte (daar is dan al een
 * foutmelding voor getoond).
 *
 * Bestaat voor de groene melding: die hoort pas te verschijnen als de server
 * het bevestigd heeft, niet op het moment dat de knop ingedrukt wordt. Anders
 * stond er "v7 gemaakt" en direct daaronder "mislukt".
 */
export function wachtOpOpslag(projectId: string): Promise<boolean> {
  if ((saveInflight[projectId] ?? 0) === 0) return Promise.resolve(!saveErrored[projectId])
  return new Promise(resolve => {
    ;(opslagWachters[projectId] ??= []).push(resolve)
  })
}
const opslagWachters: Record<string, ((gelukt: boolean) => void)[]> = {}
const vorigeStand: Record<string, Project | undefined> = {}

// ── Autosave state (per project) ────────────────────────────────────────────
// Every mutation runs through syncProject, so this reflects "is anything for
// this project still being persisted to the server?" — surfaced as a saved/
// saving/error indicator on the detail page.
export type ProjectSaveState = 'idle' | 'saving' | 'saved' | 'error'
const saveStateById: Record<string, ProjectSaveState> = {}
const saveInflight: Record<string, number> = {}
const saveErrored: Record<string, boolean> = {}
const saveListeners = new Set<() => void>()

function setSaveState(id: string, s: ProjectSaveState): void {
  saveStateById[id] = s
  saveListeners.forEach(l => l())
}

export function subscribeProjectSaveState(cb: () => void): () => void {
  saveListeners.add(cb)
  return () => { saveListeners.delete(cb) }
}

export function getProjectSaveState(id: string): ProjectSaveState {
  return saveStateById[id] ?? 'idle'
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
      statusReden: null,
      statusVorige: null,
      levertijdDatum: body.levertijdDatum,
      notities: body.notities,
      offertes: [],
      opdrachtbevestiging: null,
      productieOrders: [],
      paklijsten: [],
      facturen: [],
      createdAt: now(),
      updatedAt: now(),
    }
    cache = [...cache, p]
    saveLocal(cache)
    syncProject(id, apiFetch<Project>('/projects', { method: 'POST', body: JSON.stringify({ ...body, id }) }), `Project ${id} aanmaken`)
    return p
  },

  update(id: string, patch: UpdateProject): Project {
    const updated = updateCache(id, p => ({ ...p, ...patch, updatedAt: now() }))
    syncProject(id, apiFetch<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }), `Project ${id} bijwerken`)
    return updated
  },

  remove(id: string): void {
    cache = cache.filter(p => p.id !== id)
    saveLocal(cache)
    apiFetch<void>(`/projects/${id}`, { method: 'DELETE' }).catch((fout: unknown) => {
      meldFout({
        actie: `Project ${id} verwijderen`,
        fout,
        gevolg: 'Het project is alleen uit de lijst in deze browser gehaald; op de server bestaat '
          + 'het nog. Herlaad de pagina, dan staat het er weer.',
      })
    })
  },

  // ── Offerte operations ─────────────────────────────────────────────────────

  /**
   * Nieuwe offerteversie. Met `vanOfferteId` een kopie van die versie — zie
   * `kopieerOfferte` in de gedeelde kern voor wat er meegaat — anders leeg.
   */
  addOfferte(projectId: string, vanOfferteId?: string): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const id = nextLocalDocId('OFF')
    // Een nieuwe versie vervángt de vorige, dus draagt ze hetzelfde nummer.
    // Hier stond eerder alleen `id`, waardoor v2 een ander nummer kreeg dan v1
    // terwijl `versie` wél doortelde: twee tellingen die iets anders zeiden.
    const eerste = p.offertes[0]
    const documentNr = eerste ? eerste.documentNr : id
    const versie = volgendeVersie(p.offertes)

    const bron = vanOfferteId ? p.offertes.find(o => o.id === vanOfferteId) : undefined
    if (vanOfferteId && !bron) throw new Error('Te kopiëren offerteversie niet gevonden')
    // De regel-id's maken we hier en sturen ze mee, zodat een aanpassing direct
    // na het kopiëren dezelfde regel raakt als de server straks kent.
    const regelIds = bron
      ? bron.regels.map((_, i) => `regel_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`)
      : undefined

    const off: Offerte = bron
      // Een kopie herziet déze versie en draagt dus haar nummer — zie de API.
      ? kopieerOfferte(bron, { id, documentNr: bron.documentNr, versie, regelIds, nu: now() })
      : {
          id,
          documentNr,
          projectId,
          versie,
          status: 'concept',
          regels: [],
          notities: '',
          externeRef: null,
          geldigTot: null,
          verzondenOp: null,
          geaccepteerdOp: null,
          createdAt: now(),
          updatedAt: now(),
        }
    const updated = updateCache(projectId, p => ({ ...p, offertes: [...p.offertes, off], updatedAt: now() }))
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/offertes`, {
      method: 'POST', body: JSON.stringify({ id, vanOfferteId, regelIds }),
    }), bron ? 'Offerte kopiëren' : 'Nieuwe offerte aanmaken')
    return updated
  },

  /** Een concept weg. Alleen een concept — zie `waaromNietVerwijderen`. */
  verwijderOfferte(projectId: string, offerteId: string): Project {
    const updated = updateCache(projectId, p => projectNaIntrekken({
      ...p,
      updatedAt: now(),
      offertes: p.offertes.filter(o => o.id !== offerteId),
    }))
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}`, {
      method: 'DELETE',
    }), 'Offerte verwijderen')
    return updated
  },

  /** Een verstuurde versie die niet meer geldt: vervallen, maar zichtbaar. */
  trekOfferteIn(projectId: string, offerteId: string): Project {
    const updated = updateCache(projectId, p => projectNaIntrekken({
      ...p,
      updatedAt: now(),
      offertes: p.offertes.map(o =>
        o.id === offerteId ? { ...o, status: 'vervallen' as OfferteStatus, updatedAt: now() } : o,
      ),
    }))
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}/intrek`, {
      method: 'POST',
    }), 'Offerte intrekken')
    return updated
  },

  /**
   * Een offerte als begin van een nieuw project. Niet optimistisch, anders dan
   * de rest hier: het projectnummer komt van de server, en naar een project
   * navigeren dat misschien niet ontstaat is erger dan een halve seconde
   * wachten. Gooit een `ApiFout`; de aanroeper meldt die.
   */
  async naarNieuwProject(
    projectId: string,
    offerteId: string,
    body: { naam: string; relatieId: string | null; contactId: string | null; externeRef: string | null },
  ): Promise<Project> {
    const { data } = await apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}/naar-project`, {
      method: 'POST', body: JSON.stringify(body),
    })
    cache = [...cache.filter(p => p.id !== data.id), data]
    saveLocal(cache)
    // De server koos PRJ- en OFF-nummer; zonder dit geeft "Nieuw project" in
    // deze browser straks hetzelfde nummer nog eens uit.
    seedSequenceCounters(cache)
    return data
  },

  /** Velden van een versie zelf — nu alleen de externe referentie. */
  updateOfferte(projectId: string, offerteId: string, patch: { externeRef: string | null }): Project {
    const externeRef = patch.externeRef?.trim() || null
    const updated = updateCache(projectId, p => ({
      ...p,
      updatedAt: now(),
      offertes: p.offertes.map(o =>
        o.id === offerteId ? { ...o, externeRef, updatedAt: now() } : o,
      ),
    }))
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}`, {
      method: 'PATCH', body: JSON.stringify({ externeRef }),
    }), 'Referentie opslaan')
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
    }), `Artikel "${data.naam}" toevoegen`)
    return updated
  },

  updateOfferteRegel(
    projectId: string,
    offerteId: string,
    regelId: string,
    patch: Partial<Pick<OfferteRegel, 'naam' | 'omschrijving' | 'qty' | 'eenheid' | 'verkoopprijs' | 'bewerkingen'>>,
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
    }), 'Regel bijwerken')
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
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}/regels/${regelId}`, {
      method: 'DELETE',
    }), 'Regel verwijderen')
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
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}/verzend`, { method: 'POST' }), 'Offerte versturen')
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
        aantalGereed: 0,
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
    }), 'Offerte accepteren')

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
    }), 'Stap afvinken')
    return updated
  },

  /**
   * Een stap gereedmelden en daarop wachten.
   *
   * `checkOffStap` hierboven is optimistisch: het scherm loopt vooruit en een
   * mislukte opslag komt later als melding binnen. Op de terminal kan dat niet
   * — de operator loopt weg zodra het scherm "klaar" zegt, en een stap die
   * daarna toch niet is afgemeld staat morgen nog in de wachtrij. Dus hier
   * wachten we op de server en geeft een fout een fout.
   *
   * De server rondt in dezelfde transactie een nog lopende klok af; zou dat
   * hier gebeuren, dan kon het ertussenuit vallen.
   */
  async meldStapGereed(
    projectId: string, orderId: string, stapId: string,
    userName: string, aantalStuks: number | null,
  ): Promise<Project> {
    const { data } = await apiFetch<Project>(
      `/projects/${projectId}/orders/${orderId}/stap/${stapId}/check`,
      { method: 'POST', body: JSON.stringify({ userName, aantalStuks }) },
    )
    cache = cache.map(p => (p.id === projectId ? data : p))
    saveLocal(cache)
    return data
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
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/orders/${orderId}/stap/${stapId}/uncheck`, { method: 'POST' }), 'Stap terugzetten')
    return updated
  },

  planStap(
    projectId: string,
    orderId: string,
    stapId: string,
    geplandDatum: string | null,
    geplandMachine: string | null,
    // Only the Wachtrij page passes this. `undefined` = leave the step's
    // current queuePosition alone (Kanban/Gantt drag never touches it).
    queuePosition?: number | null,
  ): Project {
    const hasQueuePosition = queuePosition !== undefined
    const clearingQueueState = geplandDatum == null && geplandMachine == null
    const updated = updateCache(projectId, p => ({
      ...p,
      updatedAt: now(),
      productieOrders: p.productieOrders.map(o =>
        o.id !== orderId ? o : {
          ...o,
          updatedAt: now(),
          stappen: o.stappen.map(s => {
            if (s.id !== stapId) return s
            const next = { ...s, geplandDatum, geplandMachine }
            if (hasQueuePosition) next.queuePosition = queuePosition
            if (clearingQueueState) { next.queuePosition = null; next.notBefore = null }
            return next
          }),
        },
      ),
    }))
    const body: Record<string, unknown> = { geplandDatum, geplandMachine }
    if (hasQueuePosition) body.queuePosition = queuePosition
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/orders/${orderId}/stap/${stapId}/plan`, {
      method: 'PATCH', body: JSON.stringify(body),
    }), 'Stap inplannen')
    return updated
  },

  setHold(projectId: string, orderId: string, stapId: string, notBefore: string | null): Project {
    const updated = updateCache(projectId, p => ({
      ...p,
      updatedAt: now(),
      productieOrders: p.productieOrders.map(o =>
        o.id !== orderId ? o : {
          ...o,
          updatedAt: now(),
          stappen: o.stappen.map(s => s.id !== stapId ? s : { ...s, notBefore }),
        },
      ),
    }))
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/orders/${orderId}/stap/${stapId}/hold`, {
      method: 'PATCH', body: JSON.stringify({ notBefore }),
    }), 'Hold instellen')
    return updated
  },

  /**
   * Gereedmelden in stuks. Zonder `aantal` geldt de hele order, zoals de server
   * ook doet — maar met deelleveringen is juist het gedeeltelijke geval de
   * regel: 34 van de 40 bepaalt wat er op de volgende pakbon kan. De wrapper
   * stuurde dat aantal niet mee, waardoor deels gereedmelden vanuit het scherm
   * onmogelijk was.
   */
  markOrderGereed(projectId: string, orderId: string, aantal?: number): Project {
    const updated = updateCache(projectId, p => ({
      ...p,
      productieOrders: p.productieOrders.map(o => {
        if (o.id !== orderId) return o
        const gereed = aantal ?? o.qty
        return {
          ...o,
          aantalGereed: gereed,
          status: (gereed >= o.qty ? 'gereed' : 'in_productie') as ProductieOrder['status'],
          updatedAt: now(),
        }
      }),
      status: p.status === 'bevestigd' ? 'productie' : p.status,
      updatedAt: now(),
    }))
    syncProject(
      projectId,
      apiFetch<Project>(`/projects/${projectId}/orders/${orderId}/gereed`, {
        method: 'POST',
        body: JSON.stringify(aantal === undefined ? {} : { aantal }),
      }),
      'Order gereed melden',
    )
    return updated
  },

  // ── Paklijst ──────────────────────────────────────────────────────────────
  // Een pakbon gaat over wat er NU klaarligt, niet over de hele order. Bij een
  // deellevering zijn dat 10 van de 40 stuks. De aantallen komen uit
  // `berekenVoortgang` — dezelfde functie als op de server, zodat het
  // optimistische scherm en het antwoord daarna niet uit elkaar lopen.

  createPaklijst(projectId: string, regels?: { offerteRegelId: string; qty: number }[]): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')

    const voortgang = berekenVoortgang(p)
    const keuze = regels ?? voortgang.regels
      .filter(r => r.klaar > 0)
      .map(r => ({ offerteRegelId: r.offerteRegelId, qty: r.klaar }))
    if (keuze.length === 0) throw new Error('Er ligt niets klaar om te leveren')

    const orderVan = (regelId: string) => p.productieOrders.find(o => o.offerteRegelId === regelId)
    const regelVan = (regelId: string) => basisRegels(p).find(r => r.id === regelId)

    const paklijst: Paklijst = {
      id: nextLocalDocId('PL'),
      projectId,
      regels: keuze.map(g => {
        const order = orderVan(g.offerteRegelId)
        const regel = regelVan(g.offerteRegelId)
        return {
          productieOrderId: order?.id ?? '',
          offerteRegelId: g.offerteRegelId,
          artikelNaam: order?.artikelNaam ?? regel?.naam ?? g.offerteRegelId,
          qty: g.qty,
          eenheid: order?.eenheid ?? regel?.eenheid ?? 'st',
        }
      }),
      notities: '',
      verzondenOp: null,
      createdAt: now(),
    }
    const updated = updateCache(projectId, p => ({
      ...p, paklijsten: [...p.paklijsten, paklijst], status: 'paklijst', updatedAt: now(),
    }))
    syncProject(
      projectId,
      apiFetch<Project>(`/projects/${projectId}/paklijst`, {
        method: 'POST', body: JSON.stringify({ regels: keuze }),
      }),
      'Paklijst aanmaken',
    )
    return updated
  },

  verzendPaklijst(projectId: string, paklijstId: string): Project {
    const updated = updateCache(projectId, p => {
      if (!p.paklijsten.some(x => x.id === paklijstId)) throw new Error('Geen paklijst')
      const paklijsten = p.paklijsten.map(x =>
        x.id === paklijstId ? { ...x, verzondenOp: now() } : x,
      )
      // 'verzonden' pas als er niets meer ligt of komt — bij een deellevering
      // zou die status liegen.
      const na = berekenVoortgang({ ...p, paklijsten })
      const status = na.klaar === 0 && na.teMaken === 0 ? 'verzonden' as const : p.status
      return { ...p, paklijsten, status, updatedAt: now() }
    })
    syncProject(
      projectId,
      apiFetch<Project>(`/projects/${projectId}/paklijst/${paklijstId}/verzend`, { method: 'POST' }),
      'Paklijst versturen',
    )
    return updated
  },

  // ── Factuur ───────────────────────────────────────────────────────────────
  // Factureren gaat over wat er GELEVERD is en nog niet gefactureerd.

  createFactuur(
    projectId: string,
    btwPct = 21,
    regels?: { offerteRegelId: string; qty: number }[],
  ): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const accepted = p.offertes.find(o => o.status === 'geaccepteerd')
    if (!accepted) throw new Error('Geen geaccepteerde offerte')

    const voortgang = berekenVoortgang(p)
    const keuze = regels ?? voortgang.regels
      .filter(r => r.teFactureren > 0)
      .map(r => ({ offerteRegelId: r.offerteRegelId, qty: r.teFactureren }))
    if (keuze.length === 0) throw new Error('Er staat niets open om te factureren')

    const bron = basisRegels(p)
    const factuurRegels = keuze.map(g => {
      const r = bron.find(x => x.id === g.offerteRegelId)
      const prijs = r?.verkoopprijs ?? 0
      return {
        offerteRegelId: g.offerteRegelId,
        naam: r?.naam ?? g.offerteRegelId,
        qty: g.qty,
        eenheid: r?.eenheid ?? 'st',
        verkoopprijs: prijs,
        totaal: Math.round(g.qty * prijs * 100) / 100,
      }
    })

    const vervalDate = new Date()
    vervalDate.setDate(vervalDate.getDate() + 30)

    const factuur: Factuur = {
      id: nextLocalDocId('FACT'),
      soort: 'factuur',
      crediteertFactuurId: null,
      projectId,
      offerteId: accepted.id,
      regels: factuurRegels,
      btwPct,
      ...geldbedragen(factuurRegels, btwPct),
      notities: '',
      vervaldatum: vervalDate.toISOString().split('T')[0],
      verzondenOp: null,
      createdAt: now(),
    }

    const updated = updateCache(projectId, p => {
      const facturen = [...p.facturen, factuur]
      const na = berekenVoortgang({ ...p, facturen })
      const status = na.teFactureren === 0 && na.teMaken === 0 && na.klaar === 0
        ? 'gefactureerd' as const : p.status
      return { ...p, facturen, status, updatedAt: now() }
    })
    syncProject(
      projectId,
      apiFetch<Project>(`/projects/${projectId}/factuur`, {
        method: 'POST', body: JSON.stringify({ btwPct, regels: keuze }),
      }),
      'Factuur aanmaken',
    )
    return updated
  },

  verzendFactuur(projectId: string, factuurId: string): Project {
    const updated = updateCache(projectId, p => {
      if (!p.facturen.some(f => f.id === factuurId)) throw new Error('Geen factuur')
      const facturen = p.facturen.map(f =>
        f.id === factuurId ? { ...f, verzondenOp: now() } : f,
      )
      return { ...p, facturen, updatedAt: now() }
    })
    syncProject(
      projectId,
      apiFetch<Project>(`/projects/${projectId}/factuur/${factuurId}/verzend`, { method: 'POST' }),
      'Factuur versturen',
    )
    return updated
  },

  // ── Creditfactuur ─────────────────────────────────────────────────────────
  // Geen negatieve factuur: de gecrediteerde factuur is verstuurd en blijft
  // staan, de credit telt er als eigen document naast.

  createCredit(
    projectId: string,
    factuurId: string,
    regels?: { offerteRegelId: string; qty: number }[],
    notities = '',
  ): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const bron = p.facturen.find(f => f.id === factuurId)
    if (!bron) throw new Error('Factuur niet gevonden')
    if (bron.soort === 'credit') throw new Error('Een creditfactuur crediteren kan niet')

    const eerder = new Map<string, number>()
    for (const c of p.facturen.filter(f => f.crediteertFactuurId === bron.id)) {
      for (const r of c.regels) {
        eerder.set(r.offerteRegelId, (eerder.get(r.offerteRegelId) ?? 0) + r.qty)
      }
    }
    const keuze = regels ?? bron.regels
      .map(r => ({
        offerteRegelId: r.offerteRegelId,
        qty: r.qty - (eerder.get(r.offerteRegelId) ?? 0),
      }))
      .filter(r => r.qty > 0)
    if (keuze.length === 0) throw new Error('Deze factuur is al volledig gecrediteerd')

    const creditRegels = keuze.map(g => {
      const r = bron.regels.find(x => x.offerteRegelId === g.offerteRegelId)
      const prijs = r?.verkoopprijs ?? 0
      return {
        offerteRegelId: g.offerteRegelId,
        naam: r?.naam ?? g.offerteRegelId,
        qty: g.qty,
        eenheid: r?.eenheid ?? 'st',
        verkoopprijs: prijs,
        totaal: Math.round(g.qty * prijs * 100) / 100,
      }
    })

    const credit: Factuur = {
      id: nextLocalDocId('CRED'),
      soort: 'credit',
      crediteertFactuurId: bron.id,
      projectId,
      offerteId: bron.offerteId,
      regels: creditRegels,
      btwPct: bron.btwPct,
      ...geldbedragen(creditRegels, bron.btwPct),
      notities,
      vervaldatum: null,
      verzondenOp: null,
      createdAt: now(),
    }

    const updated = updateCache(projectId, p => ({
      ...p, facturen: [...p.facturen, credit], updatedAt: now(),
    }))
    syncProject(
      projectId,
      apiFetch<Project>(`/projects/${projectId}/credit`, {
        method: 'POST', body: JSON.stringify({ factuurId, regels: keuze, notities }),
      }),
      'Creditfactuur aanmaken',
    )
    return updated
  },

  // ── Revert operations ─────────────────────────────────────────────────────
  // Each call optimistically updates the cache, then lets the server confirm.
  // The server enforces the guards (e.g. no stappen checked off); if it
  // rejects, syncProject surfaces the error toast and the next re-fetch
  // reconciles the cache back to the authoritative state.

  revertBevestigd(projectId: string): Project {
    const updated = updateCache(projectId, p => {
      const offertes = p.offertes.map(o => {
        if (o.status === 'geaccepteerd')
          return { ...o, status: (o.verzondenOp ? 'verzonden' : 'concept') as OfferteStatus, geaccepteerdOp: null, updatedAt: now() }
        if (o.status === 'vervallen')
          return { ...o, status: 'concept' as OfferteStatus, updatedAt: now() }
        return o
      })
      const hasVerzonden = offertes.some(o => o.status === 'verzonden')
      return {
        ...p,
        status: hasVerzonden ? 'offerte' : 'concept',
        opdrachtbevestiging: null,
        productieOrders: [],
        offertes,
        updatedAt: now(),
      }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/revert/bevestigd`, { method: 'POST' }), 'Terugkeren naar offerte')
    return updated
  },

  revertProductie(projectId: string): Project {
    const updated = updateCache(projectId, p => ({
      ...p,
      status: 'bevestigd',
      productieOrders: p.productieOrders.map(o => ({
        ...o, status: 'gepland' as const,
        stappen: o.stappen.map(s => ({ ...s, gereedOp: null, gereedDoor: null })),
        updatedAt: now(),
      })),
      updatedAt: now(),
    }))
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/revert/productie`, { method: 'POST' }), 'Terugkeren naar bevestigd')
    return updated
  },

  // Haalt de láátste pakbon weg. Een verstuurde bon blijft: die ligt bij de klant.
  revertPaklijst(projectId: string): Project {
    const updated = updateCache(projectId, p => {
      const laatste = p.paklijsten[p.paklijsten.length - 1]
      if (!laatste) throw new Error('Er is geen pakbon om terug te nemen')
      if (laatste.verzondenOp) throw new Error('Pakbon is al verzonden')
      const paklijsten = p.paklijsten.filter(x => x.id !== laatste.id)
      return {
        ...p, paklijsten,
        status: paklijsten.length > 0 ? p.status : 'productie' as const,
        updatedAt: now(),
      }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/revert/paklijst`, { method: 'POST' }), 'Terugkeren naar productie')
    return updated
  },

  revertVerzonden(projectId: string): Project {
    const updated = updateCache(projectId, p => {
      const laatste = [...p.paklijsten].reverse().find(x => x.verzondenOp)
      if (!laatste) throw new Error('Er is geen verzonden pakbon')
      return {
        ...p, status: 'paklijst' as const,
        paklijsten: p.paklijsten.map(x => x.id === laatste.id ? { ...x, verzondenOp: null } : x),
        updatedAt: now(),
      }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/revert/verzonden`, { method: 'POST' }), 'Terugkeren naar paklijst')
    return updated
  },

  // Een verstuurde factuur uitgummen laat een gat in de nummering — daar hoort
  // een creditfactuur voor, geen verwijdering.
  revertGefactureerd(projectId: string): Project {
    const updated = updateCache(projectId, p => {
      const laatste = [...p.facturen].reverse().find(f => f.soort === 'factuur')
      if (!laatste) throw new Error('Er is geen factuur')
      if (laatste.verzondenOp) throw new Error('Factuur is al verstuurd — maak een creditfactuur')
      if (p.facturen.some(f => f.crediteertFactuurId === laatste.id)) {
        throw new Error('Er hangt een creditfactuur aan deze factuur')
      }
      return {
        ...p, status: 'verzonden' as const,
        facturen: p.facturen.filter(f => f.id !== laatste.id),
        updatedAt: now(),
      }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/revert/gefactureerd`, { method: 'POST' }), 'Terugkeren naar verzonden')
    return updated
  },

  // ── On hold / annuleren ───────────────────────────────────────────────────
  // Documenten en afgevinkte stappen blijven staan; het project verdwijnt
  // alleen uit de planning (zie utils/planningSharedUtils.ts).

  stopProject(projectId: string, status: 'on_hold' | 'geannuleerd', reden: string): Project {
    const updated = updateCache(projectId, p => ({
      ...p,
      status,
      statusReden: reden,
      statusVorige: p.status === 'on_hold' || p.status === 'geannuleerd' ? p.statusVorige : p.status,
      updatedAt: now(),
    }))
    syncProject(
      projectId,
      apiFetch<Project>(`/projects/${projectId}/status/stop`, {
        method: 'POST',
        body: JSON.stringify({ status, reden }),
      }),
      status === 'on_hold' ? 'On hold zetten' : 'Annuleren',
    )
    return updated
  },

  hervatProject(projectId: string): Project {
    const updated = updateCache(projectId, p => ({
      ...p,
      status: p.statusVorige ?? 'concept',
      statusReden: null,
      statusVorige: null,
      updatedAt: now(),
    }))
    syncProject(
      projectId,
      apiFetch<Project>(`/projects/${projectId}/status/hervat`, { method: 'POST' }),
      'Hervatten',
    )
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
    }), 'Opdrachtbevestiging bijwerken')
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
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/opdrachtbevestiging/verzend`, { method: 'POST' }), 'Opdrachtbevestiging versturen')
    return updated
  },
}

// ── Computed helpers for UI ────────────────────────────────────────────────────

// De status van een project komt van de server: elke overgang (verzenden,
// accepteren, gereedmelden, paklijst, factuur, en de reverts) zet hem daar. Er
// stond hier ooit een `deriveProjectStatus` die de status opnieuw afleidde uit
// de documenten, maar die werd nergens aangeroepen én was het oneens met de
// routes: zodra er productieorders bestonden zei hij 'productie', terwijl een
// zojuist geaccepteerde offerte 'bevestigd' hoort te geven. Twee bronnen van
// waarheid waarvan er één stil verkeerd was — vandaar weg. Wie de status wil
// weten leest `project.status`.

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
