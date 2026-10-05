import type {
  Project, CreateProject, UpdateProject,
  Offerte, OfferteRegel, OfferteStatus,
  ProductieOrder,
  Paklijst, Factuur,
  Opdrachtbevestiging, OBStatus,
  OpdrachtWijziging, PakbonRegelKeuze, FactuurRegelKeuze,
} from '@stockmanager/shared'
import {
  berekenVoortgang, basisRegels, kopieerOfferte, volgendeVersie, projectNaIntrekken, obInhoud,
  isVrijgegeven, orderStatusNaStappen, vrijgeven, terugNaarVoorbereiding, waaromNietTerugNaarVoorbereiding,
  statusNaLevering, waaromNietPakbon, voorstelPakbon, pakbonRegels, waaromNietPakbonWijzigen,
  BTW_PCT, factuurBedragen, factuurRegels, factuurMailadres, voorstelFactuur, voorstelCredit, waaromNietFactuur,
  waaromNietCredit, waaromNietFactuurWijzigen, waaromNietFactuurVersturen, waaromNietBetaald, vervaldatumVanaf,
  waaromNietPakbonVersturen,
} from '@stockmanager/shared'
import { apiFetch, ApiFout } from './client'
import { relatiesApi } from './relaties'
import { meldFout } from '../utils/fout-melding-toon'
import type { LaadFout } from '../utils/fout-melding'
import { Weigering } from '../utils/fout-melding'

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

export async function initProjects(): Promise<LaadFout | null> {
  try {
    const { data } = await apiFetch<Project[]>('/projects')
    cache = data
    saveLocal(data)
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

// ── Verversen (polling) ───────────────────────────────────────────────────────
// Besloten 2026-10-01. Projecten werden één keer geladen, bij het openen van de
// app; daarna las elk scherm uit deze kopie. Een gereedmelding op de terminal
// stond dus pas op het kantoorscherm na F5. CLAUDE.md zegt "polling every
// 5–10 s" — dat was voor projecten nooit gebouwd.
//
// Stil bij een fout: dit start niet door een handeling van de gebruiker, en
// elke tien seconden een melding over een haperend netwerk helpt niemand. De
// volgende ronde probeert het opnieuw; wie zelf iets doet krijgt wél een melding.

/** Mag de serverstand de kopie van dit project vervangen? Niet als er sinds `teller` iets veranderd is. */
function magVervangen(id: string, teller: number): boolean {
  return (saveInflight[id] ?? 0) === 0 && (wijzigTeller[id] ?? 0) === teller
}

/** Haalt één project opnieuw van de server. `true` als er iets veranderd is. */
export async function herlaadProject(id: string): Promise<boolean> {
  if ((saveInflight[id] ?? 0) > 0) return false
  const teller = wijzigTeller[id] ?? 0
  let data: Project
  try {
    ;({ data } = await apiFetch<Project>(`/projects/${id}`))
  } catch {
    return false
  }
  if (!magVervangen(id, teller)) return false
  const oud = cache.find(p => p.id === id)
  if (oud && JSON.stringify(oud) === JSON.stringify(data)) return false
  cache = oud ? cache.map(p => (p.id === id ? data : p)) : [...cache, data]
  saveLocal(cache)
  return true
}

/** Haalt de hele lijst opnieuw, zonder projecten te raken die net gewijzigd worden. */
export async function herlaadProjecten(): Promise<boolean> {
  const tellers = Object.fromEntries(cache.map(p => [p.id, wijzigTeller[p.id] ?? 0]))
  let data: Project[]
  try {
    ;({ data } = await apiFetch<Project[]>('/projects'))
  } catch {
    return false
  }
  const vanServer = new Map(data.map(p => [p.id, p]))
  const nieuw: Project[] = []
  let veranderd = false
  for (const p of cache) {
    const server = vanServer.get(p.id)
    vanServer.delete(p.id)
    // Lokaal net aangemaakt of gewijzigd: de eigen stand blijft tot de opslag terug is.
    if (!magVervangen(p.id, tellers[p.id] ?? 0)) {
      nieuw.push(p)
      continue
    }
    if (!server) {
      veranderd = true // op de server verwijderd
      continue
    }
    if (JSON.stringify(p) !== JSON.stringify(server)) veranderd = true
    nieuw.push(server)
  }
  for (const p of vanServer.values()) {
    nieuw.push(p) // door iemand anders aangemaakt
    veranderd = true
  }
  if (!veranderd) return false
  cache = nieuw
  saveLocal(cache)
  return true
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function now(): string { return new Date().toISOString() }

function updateCache(id: string, fn: (p: Project) => Project): Project {
  wijzigTeller[id] = (wijzigTeller[id] ?? 0) + 1
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
  wijzigTeller[projectId] = (wijzigTeller[projectId] ?? 0) + 1
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
/**
 * Telt elke wijziging per project. Een ververs-antwoord dat vertrok vóór een
 * wijziging en daarna binnenkomt, is ouder dan wat er op het scherm staat en
 * zou die wijziging overschrijven — met deze teller herkennen we dat.
 */
const wijzigTeller: Record<string, number> = {}
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

/**
 * Een id voor het moment tussen klikken en het antwoord van de server. Het
 * echte nummer geeft alleen de server (per jaar, 2026-10-05); het antwoord
 * vervangt dit id. Bewust herkenbaar als tijdelijk: tot 2026-10-05 kwam hier
 * een nummer uit een teller per browser, dat eruitzag als een echt nummer en
 * soms een ander bleek te worden.
 */
function tijdelijkId(prefix: string): string {
  return `${prefix}-nieuw-${Math.random().toString(36).slice(2, 7)}`
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

  /**
   * Nieuw project. Wacht op de server, want die geeft het nummer (2026-10-05):
   * vroeger koos de browser het met een eigen teller per pc, en die liep uit de
   * pas met andere pc's en begon nooit opnieuw per jaar.
   */
  async create(body: CreateProject): Promise<Project> {
    const r = await apiFetch<Project>('/projects', { method: 'POST', body: JSON.stringify(body) })
    cache = [...cache.filter(p => p.id !== r.data.id), r.data]
    saveLocal(cache)
    return r.data
  },

  update(id: string, patch: UpdateProject): Project {
    const updated = updateCache(id, p => ({ ...p, ...patch, updatedAt: now() }))
    syncProject(id, apiFetch<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }), `Project ${id} bijwerken`)
    return updated
  },

  /**
   * Verwijderen wacht op de server (2026-10-05). Eerder ging het project meteen
   * uit de lijst en kwam een weigering pas daarna — dan was het "weg" terwijl
   * het nog bestond. De server weigert met 409 als er iets verstuurd is
   * (`waaromNietProjectVerwijderen`); de fout gaat naar de aanroeper.
   */
  async remove(id: string): Promise<void> {
    await apiFetch<void>(`/projects/${id}`, { method: 'DELETE' })
    cache = cache.filter(p => p.id !== id)
    saveLocal(cache)
  },

  // ── Offerte operations ─────────────────────────────────────────────────────

  /**
   * Nieuwe offerteversie. Met `vanOfferteId` een kopie van die versie — zie
   * `kopieerOfferte` in de gedeelde kern voor wat er meegaat — anders leeg.
   */
  async addOfferte(projectId: string, vanOfferteId?: string, opts: { direct?: boolean } = {}): Promise<Project> {
    // Wacht op de server: die geeft het offertenummer (per jaar, 2026-10-05).
    // Een tijdelijk nummer op het scherm zou een regel die je meteen toevoegt
    // naar een offerte sturen die de server niet kent.
    const r = await apiFetch<Project>(`/projects/${projectId}/offertes`, {
      method: 'POST', body: JSON.stringify({ vanOfferteId, direct: opts.direct }),
    })
    cache = cache.map(p => p.id === projectId ? r.data : p)
    saveLocal(cache)
    return r.data
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
        o.id === offerteId
          ? { ...o, status: 'vervallen' as OfferteStatus, vervallenDoor: 'intrekken' as const, updatedAt: now() }
          : o,
      ),
    }))
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}/intrek`, {
      method: 'POST',
    }), 'Offerte intrekken')
    return updated
  },

  /**
   * De opdracht aanpassen na acceptatie. Niet optimistisch: een wijziging kan
   * productieorders maken, stoppen of weghalen, en dat rekent de server uit.
   * Gooit een `ApiFout`; de aanroeper meldt die.
   */
  async wijzigOpdracht(projectId: string, w: OpdrachtWijziging): Promise<Project> {
    const { data } = await apiFetch<Project>(`/projects/${projectId}/opdracht/wijzig`, {
      method: 'POST', body: JSON.stringify(w),
    })
    cache = cache.map(p => (p.id === data.id ? data : p))
    saveLocal(cache)
    return data
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

  accepteerOfferte(projectId: string, offerteId: string, userName: string, opdrachtRef: string | null = null): Project {
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
        id: tijdelijkId('PROD'),
        projectId,
        offerteRegelId: regel.id,
        artikelId: regel.artikelId,
        artikelNaam: regel.naam,
        qty: regel.qty,
        eenheid: regel.eenheid,
        aantalGereed: 0,
        stappen,
        // Eerst voorbereiding, net als de server (calc/vrijgeven.ts).
        status: 'voorbereiding' as const,
        createdAt: now(),
        updatedAt: now(),
      }
    })

    const ob: Opdrachtbevestiging | null = acceptedOfferte ? {
      id: tijdelijkId('OB'),
      projectId,
      offerteId,
      regels: acceptedOfferte.regels,
      levertijdDatum: p?.levertijdDatum ?? null,
      notities: '',
      // Zoals de server: wat in het venster staat, anders die van het project.
      opdrachtRef: opdrachtRef?.trim() || p?.klantRef?.trim() || null,
      status: 'concept' as OBStatus,
      verzondenOp: null,
      verzendingen: [],
      wijzigingen: [],
      createdAt: now(),
      updatedAt: now(),
    } : null

    const updated = updateCache(projectId, p => ({
      ...p,
      status: 'bevestigd',
      updatedAt: now(),
      opdrachtbevestiging: ob,
      offertes: p.offertes.map(o => {
        if (o.id === offerteId) {
          return {
            ...o,
            status: 'geaccepteerd' as OfferteStatus,
            geaccepteerdOp: now(),
            externeRef: o.externeRef ?? (o.direct ? opdrachtRef?.trim() || null : null),
            updatedAt: now(),
          }
        }
        if (o.status !== 'geaccepteerd' && o.status !== 'vervallen') {
          return { ...o, status: 'vervallen' as OfferteStatus, vervallenDoor: 'acceptatie' as const, updatedAt: now() }
        }
        return o
      }),
      productieOrders: [...p.productieOrders, ...newOrders],
    }))

    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/offertes/${offerteId}/accepteer`, {
      method: 'POST', body: JSON.stringify({ userName, opdrachtRef }),
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
        // Gestopt blijft gestopt; afvinken op een order in voorbereiding geeft hem vrij.
        return { ...o, stappen, status: orderStatusNaStappen(o, stappen), updatedAt: now() }
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
  /**
   * Deels gereed melden vanaf de terminal: het totaal dat nu klaar is
   * (2026-10-02). Net als `meldStapGereed` gewacht en niet optimistisch: de
   * operator loopt weg zodra het scherm het bevestigt.
   */
  async meldDeelsGereed(projectId: string, orderId: string, aantal: number): Promise<Project> {
    const { data } = await apiFetch<Project>(
      `/projects/${projectId}/orders/${orderId}/deels-gereed`,
      { method: 'POST', body: JSON.stringify({ aantal }) },
    )
    cache = cache.map(p => (p.id === projectId ? data : p))
    saveLocal(cache)
    return data
  },

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
        // Gestopt blijft gestopt; afvinken op een order in voorbereiding geeft hem vrij.
        return { ...o, stappen, status: orderStatusNaStappen(o, stappen), updatedAt: now() }
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
          status: (o.status === 'gestopt' ? 'gestopt' : gereed >= o.qty ? 'gereed' : 'in_productie') as ProductieOrder['status'],
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

  /**
   * Een nieuwe concept-pakbon met de regels die helemaal klaar zijn
   * (`voorstelPakbon`); mag leeg zijn. Aanpassen gebeurt daarna op de
   * Pakbonnen-tab met `wijzigPaklijst` (2026-10-02).
   */
  createPaklijst(projectId: string): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const keuze = voorstelPakbon(p)
    const paklijst: Paklijst = {
      id: tijdelijkId('PL'),
      projectId,
      regels: pakbonRegels(p, keuze),
      notities: '',
      verzondenOp: null,
      createdAt: now(),
    }
    const updated = updateCache(projectId, p => {
      const next = { ...p, paklijsten: [...p.paklijsten, paklijst], updatedAt: now() }
      return { ...next, status: statusNaLevering(next) }
    })
    syncProject(
      projectId,
      apiFetch<Project>(`/projects/${projectId}/paklijst`, { method: 'POST', body: '{}' }),
      'Pakbon aanmaken',
    )
    return updated
  },

  /** Een concept-pakbon aanpassen: de hele lijst regels in één keer. */
  wijzigPaklijst(projectId: string, paklijstId: string, regels: PakbonRegelKeuze[]): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const nee = waaromNietPakbonWijzigen(p, paklijstId) ?? waaromNietPakbon(p, regels, { pakbonId: paklijstId, leegMag: true })
    if (nee) throw new Weigering(nee)
    const updated = updateCache(projectId, p => {
      const next = {
        ...p,
        paklijsten: p.paklijsten.map(x => (x.id === paklijstId ? { ...x, regels: pakbonRegels(p, regels) } : x)),
        updatedAt: now(),
      }
      return { ...next, status: statusNaLevering(next) }
    })
    syncProject(
      projectId,
      apiFetch<Project>(`/projects/${projectId}/paklijst/${paklijstId}`, { method: 'PATCH', body: JSON.stringify({ regels }) }),
      'Pakbon aanpassen',
    )
    return updated
  },

  /** Een concept-pakbon weggooien. */
  verwijderPaklijst(projectId: string, paklijstId: string): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const nee = waaromNietPakbonWijzigen(p, paklijstId)
    if (nee) throw new Weigering(nee)
    const updated = updateCache(projectId, p => {
      const next = { ...p, paklijsten: p.paklijsten.filter(x => x.id !== paklijstId), updatedAt: now() }
      return { ...next, status: statusNaLevering(next) }
    })
    syncProject(
      projectId,
      apiFetch<Project>(`/projects/${projectId}/paklijst/${paklijstId}`, { method: 'DELETE' }),
      'Pakbon verwijderen',
    )
    return updated
  },


  verzendPaklijst(projectId: string, paklijstId: string): Project {
    const p0 = cache.find(p => p.id === projectId)
    const nee = p0 ? waaromNietPakbonVersturen(p0, paklijstId) : null
    if (nee) throw new Weigering(nee)
    const updated = updateCache(projectId, p => {
      if (!p.paklijsten.some(x => x.id === paklijstId)) throw new Error('Geen paklijst')
      const paklijsten = p.paklijsten.map(x =>
        x.id === paklijstId ? { ...x, verzondenOp: now() } : x,
      )
      // "Geleverd" pas als alles op een verstuurde pakbon staat (statusNaLevering).
      const next = { ...p, paklijsten, updatedAt: now() }
      return { ...next, status: statusNaLevering(next) }
    })
    syncProject(
      projectId,
      apiFetch<Project>(`/projects/${projectId}/paklijst/${paklijstId}/verzend`, { method: 'POST' }),
      'Paklijst versturen',
    )
    return updated
  },

  // ── Facturen (Facturen-tab, 2026-10-03) ───────────────────────────────────
  // Voorwaarden en bedragen komen uit packages/shared/calc/factuur.ts, net als
  // op de server; het scherm loopt vooruit, syncProject zet recht.

  /** Concept met alles wat verstuurd en nog niet gefactureerd is. */
  createFactuur(projectId: string): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const keuze = voorstelFactuur(p)
    const nee = waaromNietFactuur(p, keuze)
    if (nee) throw new Weigering(nee)
    const relatie = p.relatieId ? relatiesApi.listSync().find(r => r.id === p.relatieId) ?? null : null
    const regels = factuurRegels(p, keuze)
    const f: Factuur = {
      id: tijdelijkId('FACT'), soort: 'factuur', crediteertFactuurId: null, projectId,
      offerteId: p.opdrachtbevestiging?.offerteId ?? '', regels, btwPct: BTW_PCT, ...factuurBedragen(regels),
      notities: '', vervaldatum: null, verzondenOp: null, betaaldOp: null, createdAt: now(),
      naarEmail: factuurMailadres(relatie, relatie?.contacten.find(c => c.id === p.contactId)),
    }
    const updated = updateCache(projectId, p => {
      const next = { ...p, facturen: [...p.facturen, f], updatedAt: now() }
      return { ...next, status: statusNaLevering(next) }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/factuur`, { method: 'POST', body: '{}' }), 'Factuur aanmaken')
    return updated
  },

  /** Concept-credit op een verstuurde factuur, met alles wat er nog te crediteren valt. */
  createCredit(projectId: string, factuurId: string): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const keuze = voorstelCredit(p, factuurId)
    const nee = waaromNietCredit(p, factuurId, keuze)
    if (nee) throw new Weigering(nee)
    const bron = p.facturen.find(f => f.id === factuurId)!
    const regels = keuze.map(g => {
      const r = bron.regels.find(x => x.offerteRegelId === g.offerteRegelId)!
      return { ...r, qty: g.qty, totaal: Math.round(g.qty * g.verkoopprijs * 100) / 100 }
    })
    const c: Factuur = {
      id: tijdelijkId('CRED'), soort: 'credit', crediteertFactuurId: factuurId, projectId,
      offerteId: bron.offerteId, regels, btwPct: bron.btwPct, ...factuurBedragen(regels, bron.btwPct),
      notities: '', vervaldatum: null, verzondenOp: null, betaaldOp: null, naarEmail: bron.naarEmail, createdAt: now(),
    }
    const updated = updateCache(projectId, p => ({ ...p, facturen: [...p.facturen, c], updatedAt: now() }))
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/credit`, {
      method: 'POST', body: JSON.stringify({ factuurId }),
    }), 'Creditfactuur aanmaken')
    return updated
  },

  /** Een concept (factuur of credit) aanpassen: regels, mailadres. */
  wijzigFactuur(
    projectId: string, factuurId: string,
    patch: { regels?: FactuurRegelKeuze[]; naarEmail?: string | null },
  ): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const f = p.facturen.find(x => x.id === factuurId)
    const nee = waaromNietFactuurWijzigen(p, factuurId) ?? (patch.regels && f
      ? f.soort === 'credit'
        ? waaromNietCredit(p, f.crediteertFactuurId ?? '', patch.regels, { creditId: factuurId, leegMag: true })
        : waaromNietFactuur(p, patch.regels, { factuurId, leegMag: true })
      : null)
    if (nee) throw new Weigering(nee)
    const updated = updateCache(projectId, p => {
      const facturen = p.facturen.map(x => {
        if (x.id !== factuurId) return x
        const bron = p.facturen.find(b => b.id === x.crediteertFactuurId)
        const regels = !patch.regels ? x.regels : x.soort === 'credit'
          ? patch.regels.map(g => {
              const r = x.regels.find(y => y.offerteRegelId === g.offerteRegelId) ?? bron!.regels.find(y => y.offerteRegelId === g.offerteRegelId)!
              return { ...r, qty: g.qty, verkoopprijs: g.verkoopprijs, totaal: Math.round(g.qty * g.verkoopprijs * 100) / 100 }
            })
          : factuurRegels(p, patch.regels)
        return {
          ...x, regels, ...factuurBedragen(regels, x.btwPct),
          naarEmail: patch.naarEmail !== undefined ? (patch.naarEmail?.trim() || null) : x.naarEmail,
        }
      })
      const next = { ...p, facturen, updatedAt: now() }
      return { ...next, status: statusNaLevering(next) }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/factuur/${factuurId}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    }), 'Factuur aanpassen')
    return updated
  },

  verwijderFactuur(projectId: string, factuurId: string): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const nee = waaromNietFactuurWijzigen(p, factuurId)
    if (nee) throw new Weigering(nee)
    const updated = updateCache(projectId, p => {
      const next = { ...p, facturen: p.facturen.filter(f => f.id !== factuurId), updatedAt: now() }
      return { ...next, status: statusNaLevering(next) }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/factuur/${factuurId}`, { method: 'DELETE' }), 'Factuur verwijderen')
    return updated
  },

  /** Vastleggen dat hij verstuurd is, naar dit adres. De mail zelf ging via Outlook. */
  verzendFactuur(projectId: string, factuurId: string, naarEmail: string | null): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const nee = waaromNietFactuurVersturen(p, factuurId, naarEmail)
    if (nee) throw new Weigering(nee)
    const relatie = p.relatieId ? relatiesApi.listSync().find(r => r.id === p.relatieId) ?? null : null
    const nu = new Date()
    const updated = updateCache(projectId, p => {
      const facturen = p.facturen.map(x => x.id === factuurId
        ? { ...x, verzondenOp: nu.toISOString(), naarEmail, vervaldatum: x.soort === 'factuur' ? vervaldatumVanaf(nu, relatie?.betalingstermijn) : null }
        : x)
      const next = { ...p, facturen, updatedAt: now() }
      return { ...next, status: statusNaLevering(next) }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/factuur/${factuurId}/verzend`, {
      method: 'POST', body: JSON.stringify({ naarEmail }),
    }), 'Factuur versturen')
    return updated
  },

  markeerBetaald(projectId: string, factuurId: string, betaald: boolean): Project {
    const p = cache.find(p => p.id === projectId)
    if (!p) throw new Error('Project niet gevonden')
    const nee = waaromNietBetaald(p, factuurId)
    if (nee) throw new Weigering(nee)
    const updated = updateCache(projectId, p => ({
      ...p,
      facturen: p.facturen.map(x => x.id === factuurId ? { ...x, betaaldOp: betaald ? now() : null } : x),
      updatedAt: now(),
    }))
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/factuur/${factuurId}/betaald`, {
      method: 'POST', body: JSON.stringify({ betaald }),
    }), betaald ? 'Factuur betaald' : 'Betaling terugzetten')
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
        // Zoals de server: alleen wat door het accepteren verviel, komt terug.
        if (o.status === 'vervallen' && o.vervallenDoor === 'acceptatie')
          return { ...o, status: (o.verzondenOp ? 'verzonden' : 'concept') as OfferteStatus, vervallenDoor: null, updatedAt: now() }
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

  /** Orders in de hal zetten (calc/vrijgeven.ts). Waarschuwen doet het scherm vooraf. */
  vrijgeven(projectId: string, orderIds: string[]): Project {
    const updated = updateCache(projectId, p => vrijgeven(p, orderIds, now()))
    syncProject(
      projectId,
      apiFetch<Project>(`/projects/${projectId}/orders/vrijgeven`, { method: 'POST', body: JSON.stringify({ orderIds }) }),
      'In productie geven',
    )
    return updated
  },

  /** Vrijgegeven orders terug naar voorbereiding, zolang er niet aan gewerkt is. */
  terugNaarVoorbereiding(projectId: string, orderIds: string[]): Project {
    const updated = updateCache(projectId, p => terugNaarVoorbereiding(p, orderIds, now()))
    syncProject(
      projectId,
      apiFetch<Project>(`/projects/${projectId}/orders/terug-naar-voorbereiding`, { method: 'POST', body: JSON.stringify({ orderIds }) }),
      'Terug naar voorbereiding',
    )
    return updated
  },

  revertProductie(projectId: string): Project {
    const huidig = cache.find(p => p.id === projectId)
    const ids = huidig?.productieOrders.filter(isVrijgegeven).map(o => o.id) ?? []
    // Zelfde voorwaarde als de server: werk dat al gedaan is verdwijnt niet stil.
    const reden = huidig ? waaromNietTerugNaarVoorbereiding(huidig, ids) : null
    if (reden) throw new Weigering(reden)
    const updated = updateCache(projectId, p => ({ ...terugNaarVoorbereiding(p, ids, now()), status: 'bevestigd' }))
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/revert/productie`, { method: 'POST' }), 'Terugkeren naar bevestigd')
    return updated
  },

  // Haalt de láátste pakbon weg. Een verstuurde bon blijft: die ligt bij de klant.
  revertPaklijst(projectId: string): Project {
    const updated = updateCache(projectId, p => {
      const laatste = p.paklijsten[p.paklijsten.length - 1]
      if (!laatste) throw new Error('Er is geen pakbon om terug te nemen')
      if (laatste.verzondenOp) throw new Error('Pakbon is al verzonden')
      const next = { ...p, paklijsten: p.paklijsten.filter(x => x.id !== laatste.id), updatedAt: now() }
      return { ...next, status: statusNaLevering(next) }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/revert/paklijst`, { method: 'POST' }), 'Terugkeren naar productie')
    return updated
  },

  revertVerzonden(projectId: string): Project {
    const updated = updateCache(projectId, p => {
      const laatste = [...p.paklijsten].reverse().find(x => x.verzondenOp)
      if (!laatste) throw new Error('Er is geen verzonden pakbon')
      const next = {
        ...p, status: 'paklijst' as const,
        paklijsten: p.paklijsten.map(x => x.id === laatste.id ? { ...x, verzondenOp: null } : x),
        updatedAt: now(),
      }
      return { ...next, status: statusNaLevering(next) }
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

  /**
   * Velden van de opdrachtbevestiging. De levertijd is die van het project —
   * wie hem hier zet, zet hem voor de hele pagina (één datum, 2026-09-28).
   */
  updateOB(
    projectId: string,
    patch: { notities?: string; opdrachtRef?: string | null; levertijdDatum?: string | null },
  ): Project {
    const updated = updateCache(projectId, p => {
      if (!p.opdrachtbevestiging) throw new Error('Er is nog geen opdrachtbevestiging op dit project.')
      const ob = p.opdrachtbevestiging
      const levertijdDatum = patch.levertijdDatum === undefined ? p.levertijdDatum : patch.levertijdDatum
      return {
        ...p,
        levertijdDatum,
        updatedAt: now(),
        opdrachtbevestiging: {
          ...ob,
          levertijdDatum,
          notities: patch.notities ?? ob.notities,
          opdrachtRef: patch.opdrachtRef === undefined ? ob.opdrachtRef : patch.opdrachtRef?.trim() || null,
          updatedAt: now(),
        },
      }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/opdrachtbevestiging`, {
      method: 'PATCH', body: JSON.stringify(patch),
    }), 'Opdrachtbevestiging bijwerken')
    return updated
  },

  /**
   * Vastleggen dát hij verstuurd is — pas nadat de gebruiker in Outlook op
   * Verzenden drukte en dat hier bevestigde. Legt een regel in het logboek met
   * wat de klant kreeg.
   */
  verzendOB(projectId: string, naar: string | null, door: string): Project {
    const updated = updateCache(projectId, p => {
      if (!p.opdrachtbevestiging) throw new Error('Er is nog geen opdrachtbevestiging op dit project.')
      const ob = p.opdrachtbevestiging
      const nu = now()
      return {
        ...p,
        updatedAt: nu,
        opdrachtbevestiging: {
          ...ob,
          status: 'verzonden' as OBStatus,
          verzondenOp: ob.verzondenOp ?? nu,
          verzendingen: [...(ob.verzendingen ?? []), { op: nu, door, naar, inhoud: obInhoud(p)! }],
          updatedAt: nu,
        },
      }
    })
    syncProject(projectId, apiFetch<Project>(`/projects/${projectId}/opdrachtbevestiging/verzend`, {
      method: 'POST', body: JSON.stringify({ naar }),
    }), 'Opdrachtbevestiging versturen')
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
  return p.productieOrders.length > 0 && p.productieOrders.every(o => o.status === 'gereed' || o.status === 'gestopt')
}

export function formatBedrag(n: number): string {
  return `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}
