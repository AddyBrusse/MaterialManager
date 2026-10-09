/**
 * Automatisch plannen (2026-10-08). Eén functie rekent de hele werkplaats uit;
 * de schermen tekenen het, de server legt het vast (en kan het terugdraaien).
 *
 * Regels:
 * - **Prioriteit per stap** (`stap.prioriteit`, lager = eerder). Een stap die
 *   nog nooit ingepland is, komt ertussen op uiterlijk starten — wat het eerst
 *   moet, gaat voor. Slepen op het werkbord verandert alleen de prioriteit.
 * - **Receptvolgorde**: een stap begint nooit vóór zijn vorige stap klaar is,
 *   ook niet als die op dezelfde machine staat.
 * - **Gaten vullen**: wacht een stap met voorrang op zijn vorige stap, dan
 *   staat de machine niet stil — werk met minder voorrang dat wél kan, gaat in
 *   het gat als het past.
 * - **Machine**: die waar de stap op staat, anders die uit het recept, anders
 *   de machine van dezelfde soort die hem het eerst af heeft. De berekening
 *   wisselt nooit zelf van machine; dat doet een mens op het werkbord.
 * - Een stap waarop de klok loopt, ligt vast: die is nu bezig.
 *
 * De schattingen zijn een schatting (de calculatie); de nacalculatie zegt
 * achteraf hoe goed. Hier wordt er gewoon mee gerekend.
 */
import { MACHINE_SOORTEN, type MachineSoort } from '@stockmanager/shared'
import type { Machine } from '../api/machines'
import {
  computeLatestStart, computeVerplichtKlaar, dateForOffset, dayOffsetForDateStr, isWeekendOffset, walkForward,
  type DerivedSlot, type QueueJob,
} from './planningQueueUtils'
import { toDateStr } from './planningUtils'
import { werkdagenTeLaat } from '../components/planning-tabel/tabel-logica'

export interface AutoInvoer {
  /** Alle open stappen (niet gereed) van vrijgegeven orders. */
  jobs: QueueJob[]
  machines: Machine[]
  /** Vandaag 00:00 — dag 0 van de berekening. */
  windowStart: Date
  /** Stappen waarop nu een klok loopt. */
  lopend?: Set<string>
  /** Wanneer de klok op die stappen begon (ISO): daar blijft de stap staan. */
  gestart?: Map<string, string>
  /** "Nu" als fractionele dag (`nuAlsDag`); voor tests vast te zetten. */
  nu?: number
  /** Prioriteit opnieuw op uiterlijk starten, de opgeslagen rang vervalt. */
  opLevertijd?: boolean
}

// Een werkdag loopt voor "nu" en "gestart om" van 7:00 tot 16:00. Alleen om een
// tijdstip op de dag te zetten; hoeveel werk er in een dag past blijft EFFECTIEVE_MIN.
const DAG_BEGIN = 7
const DAG_UREN = 9

/**
 * Een tijdstip als fractionele dag vanaf windowStart: 7:00 = .0, 11:30 = .5.
 * Na 16:00 is de werkdag voorbij en telt het als het begin van de volgende dag
 * — anders krijgt werk dat 's avonds herberekend wordt "vandaag" als datum.
 */
export function tijdstipAlsDag(iso: string | Date, ws: Date): number {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const dag = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - ws.getTime()) / 86400000)
  const uur = d.getHours() + d.getMinutes() / 60
  if (uur >= DAG_BEGIN + DAG_UREN) return dag + 1
  return dag + Math.max(0, (uur - DAG_BEGIN) / DAG_UREN)
}

export function nuAlsDag(ws: Date): number {
  return tijdstipAlsDag(new Date(), ws)
}

export interface AutoPlaats {
  stapId: string
  machine: string | null
  /** Fractionele dag vanaf windowStart. */
  start: number | null
  eind: number | null
  geplandDatum: string | null
  queuePosition: number | null
  prioriteit: number
  /** Waarom er iets niet kon of opvalt, of null. */
  reden: string | null
  /** Bezig en voorbij het geplande eind: gerekend tot het eind van vandaag. */
  uitloop?: boolean
}

export interface AutoUitkomst {
  plaatsen: Map<string, AutoPlaats>
  /** Stap-id's in volgorde van prioriteit. */
  rang: string[]
}

const STAP = 1000
const EPS = 1e-6

/** De rang van alle stappen: lopend eerst, dan opgeslagen prioriteit, nieuw ertussen op uiterlijk starten. */
export function bepaalRang(jobs: QueueJob[], windowStart: Date, lopend: Set<string>, opLevertijd = false): QueueJob[] {
  const vk = computeVerplichtKlaar(jobs, windowStart)
  const uiterlijk = new Map(jobs.map((j) => [j.id, computeLatestStart(j, vk, windowStart) ?? '9999-12-31']))
  const opUiterlijk = (a: QueueJob, b: QueueJob) =>
    uiterlijk.get(a.id)!.localeCompare(uiterlijk.get(b.id)!) || a.orderId.localeCompare(b.orderId) || a.volgorde - b.volgorde

  const bezig = jobs.filter((j) => lopend.has(j.id)).sort(opUiterlijk)
  const rest = jobs.filter((j) => !lopend.has(j.id))
  const prio = (j: QueueJob) => j.item.stap.prioriteit
  const metRang = opLevertijd ? [] : rest.filter((j) => prio(j) != null).sort((a, b) => prio(a)! - prio(b)! || opUiterlijk(a, b))
  const zonder = (opLevertijd ? rest : rest.filter((j) => prio(j) == null)).sort(opUiterlijk)

  // Samenvoegen: een nieuwe stap gaat vóór de eerste gerangschikte stap die
  // later uiterlijk moet starten. De onderlinge rang blijft zoals hij was.
  const uit: QueueJob[] = [...bezig]
  let i = 0
  for (const r of metRang) {
    while (i < zonder.length && uiterlijk.get(zonder[i].id)! < uiterlijk.get(r.id)!) uit.push(zonder[i++])
    uit.push(r)
  }
  while (i < zonder.length) uit.push(zonder[i++])
  return uit
}

function soortVanNaam(naam: string | null | undefined): MachineSoort | null {
  const n = (naam ?? '').trim().toLowerCase()
  return MACHINE_SOORTEN.find((s) => s === n) ?? null
}

/** Welke machines komen in aanmerking: de huidige, anders het recept, anders elke van de soort. */
function kandidaten(job: QueueJob, machines: Machine[]): { lijst: Machine[]; reden: string | null } {
  const stap = job.item.stap
  const nu = machines.find((m) => m.name === stap.geplandMachine)
  if (nu) return { lijst: [nu], reden: null }
  const recept = machines.find((m) => m.name === stap.machine)
  if (recept) return { lijst: [recept], reden: null }
  const soort = soortVanNaam(stap.machine) ?? soortVanNaam(stap.naam)
  const vanSoort = soort ? machines.filter((m) => m.soort === soort) : []
  if (vanSoort.length) return { lijst: vanSoort, reden: null }
  return { lijst: [], reden: `Geen machine voor "${stap.machine ?? stap.naam}". Kies er een op het werkbord, of vul de soort in bij Instellingen → Machines.` }
}

/** Het eerste moment ≥ t waarop er gewerkt wordt (niet in het weekend, niet op het eind van een dag). */
function werkMoment(t: number, weekend: boolean, ws: Date): number {
  let dag = Math.floor(t + EPS)
  let rest = Math.max(0, t - dag)
  if (rest >= 1 - EPS) { dag++; rest = 0 }
  while (!weekend && isWeekendOffset(ws, dag)) { dag++; rest = 0 }
  return dag + rest
}

/** De vroegste start ≥ `vanaf` waarop `duur` past tussen de bezette blokken. */
function vroegstePlek(bezet: [number, number][], vanaf: number, duur: number, weekend: boolean, ws: Date): [number, number] {
  let s = werkMoment(vanaf, weekend, ws)
  for (const [b, e] of bezet) {
    const eind = walkForward(s, duur, weekend, ws)
    if (eind <= b + EPS) return [s, eind]
    if (e > s) s = werkMoment(e, weekend, ws)
  }
  return [s, walkForward(s, duur, weekend, ws)]
}

function invoegen(bezet: [number, number][], blok: [number, number]) {
  const i = bezet.findIndex(([b]) => b > blok[0])
  if (i < 0) bezet.push(blok)
  else bezet.splice(i, 0, blok)
}

/** De vorige open stap van dezelfde order (de hoogste volgorde eronder). */
function vorigeStappen(jobs: QueueJob[]): Map<string, string> {
  const perOrder = new Map<string, QueueJob[]>()
  for (const j of jobs) perOrder.set(j.orderId, [...(perOrder.get(j.orderId) ?? []), j])
  const vorige = new Map<string, string>()
  for (const lijst of perOrder.values()) {
    lijst.sort((a, b) => a.volgorde - b.volgorde)
    for (let i = 1; i < lijst.length; i++) vorige.set(lijst[i].id, lijst[i - 1].id)
  }
  return vorige
}

export function planAutomatisch(inv: AutoInvoer): AutoUitkomst {
  const { machines, windowStart: ws } = inv
  const lopend = inv.lopend ?? new Set<string>()
  const jobs = inv.jobs.filter((j) => !j.gereed)
  const rang = bepaalRang(jobs, ws, lopend, inv.opLevertijd)
  const prioriteit = new Map(rang.map((j, i) => [j.id, (i + 1) * STAP]))
  const vorige = vorigeStappen(jobs)
  const bezet = new Map<string, [number, number][]>(machines.map((m) => [m.name, []]))
  const plaatsen = new Map<string, AutoPlaats>()
  const nu = Math.max(0, inv.nu ?? nuAlsDag(ws))

  // In volgorde van rang, maar een stap pas als zijn vorige stap staat: stap 2
  // met voorrang wacht zo op stap 1, en rekent met diens echte eind.
  const open = [...rang]
  while (open.length) {
    const idx = open.findIndex((j) => { const v = vorige.get(j.id); return !v || plaatsen.has(v) })
    const job = open.splice(idx < 0 ? 0 : idx, 1)[0]
    const v = vorige.get(job.id)
    const vorigEind = v ? plaatsen.get(v)?.eind ?? 0 : 0
    const { lijst, reden } = kandidaten(job, machines)
    const basis = { stapId: job.id, prioriteit: prioriteit.get(job.id)! }
    if (lijst.length === 0) {
      plaatsen.set(job.id, { ...basis, machine: null, start: null, eind: vorigEind, geplandDatum: null, queuePosition: null, reden })
      continue
    }
    // Bezig: blijft staan waar de klok begon. Voorbij het geplande eind en nog
    // niet gereed = loopt uit; dan klaar aan het eind van vandaag (afgesproken
    // 2026-10-09), en elke dag zonder gereedmelding schuift het een dag op.
    const begon = lopend.has(job.id) ? inv.gestart?.get(job.id) : undefined
    if (begon) {
      const m = lijst[0]
      const s = Math.min(tijdstipAlsDag(begon, ws), nu)
      const gepland = walkForward(s, job.duurMin, m.worksWeekends ?? false, ws)
      const uitloop = gepland < nu
      const e = uitloop ? Math.max(gepland, Math.floor(nu) + 1) : gepland
      invoegen(bezet.get(m.name)!, [s, e])
      plaatsen.set(job.id, {
        ...basis, machine: m.name, start: s, eind: e, queuePosition: null, uitloop,
        geplandDatum: toDateStr(dateForOffset(ws, Math.floor(s + EPS))),
        reden: uitloop ? `${job.orderId} stap ${job.volgorde} loopt uit: gerekend tot het eind van vandaag.` : null,
      })
      continue
    }

    // Wacht op materiaal: niet vóór het er naar verwachting is.
    const order = job.item.order
    const mat = job.wachtOpMateriaal && order.materiaalVerwacht ? dayOffsetForDateStr(order.materiaalVerwacht, ws) : 0
    const vanaf = Math.max(nu, vorigEind, mat)
    let beste: { m: Machine; s: number; e: number } | null = null
    for (const m of lijst) {
      const [s, e] = vroegstePlek(bezet.get(m.name)!, vanaf, job.duurMin, m.worksWeekends ?? false, ws)
      if (!beste || e < beste.e - EPS) beste = { m, s, e }
    }
    invoegen(bezet.get(beste!.m.name)!, [beste!.s, beste!.e])
    plaatsen.set(job.id, {
      ...basis, machine: beste!.m.name, start: beste!.s, eind: beste!.e,
      geplandDatum: toDateStr(dateForOffset(ws, Math.floor(beste!.s + EPS))),
      queuePosition: null,
      reden: !job.wachtOpMateriaal ? null
        : order.materiaalVerwacht && !order.materiaalOnbekend ? null
        : order.materiaalVerwacht ? `${job.orderId}: van een deel van het materiaal is de leverdatum onbekend; gerekend met ${order.materiaalVerwacht}.`
        : `${job.orderId}: leverdatum van het materiaal onbekend, gerekend vanaf vandaag. Vul hem in bij Bestellingen.`,
    })
  }

  // De plek in de rij van elke machine: de volgorde waarin het er echt loopt.
  for (const m of machines) {
    const op = [...plaatsen.values()].filter((p) => p.machine === m.name).sort((a, b) => a.start! - b.start! || a.prioriteit - b.prioriteit)
    op.forEach((p, i) => { p.queuePosition = (i + 1) * STAP })
  }
  return { plaatsen, rang: rang.map((j) => j.id) }
}

// ── Wat er verandert: voor de server en voor de melding ──────────────────────

export interface StapWijziging {
  stapId: string
  projectId: string
  orderId: string
  geplandDatum: string | null
  geplandMachine: string | null
  queuePosition: number | null
  prioriteit: number | null
}

/** Alleen de stappen waarvan iets anders wordt dan wat er nu staat. */
export function wijzigingen(jobs: QueueJob[], uit: AutoUitkomst): StapWijziging[] {
  const lijst: StapWijziging[] = []
  for (const j of jobs) {
    const p = uit.plaatsen.get(j.id)
    if (!p) continue
    const s = j.item.stap
    const nieuw = {
      geplandDatum: p.geplandDatum,
      geplandMachine: p.machine ?? s.geplandMachine ?? null,
      queuePosition: p.machine ? p.queuePosition : null,
      prioriteit: p.prioriteit,
    }
    if (nieuw.geplandDatum === (s.geplandDatum ?? null) && nieuw.geplandMachine === (s.geplandMachine ?? null)
      && nieuw.queuePosition === (s.queuePosition ?? null) && nieuw.prioriteit === (s.prioriteit ?? null)) continue
    lijst.push({ stapId: j.id, projectId: j.item.project.id, orderId: j.orderId, ...nieuw })
  }
  return lijst
}

export interface OrderEffect {
  orderId: string
  projectId: string
  klant: string
  artikel: string
  levering: string | null
  oudEind: string | null
  nieuwEind: string | null
  oudTeLaat: number
  nieuwTeLaat: number
  /** Had vóór de berekening nog niet alles ingepland. */
  nieuw: boolean
}

/** Laatste werkdag waarop iets loopt (eind 3.0 = klaar aan het eind van dag 2). */
export function eindDag(eind: number, ws: Date): string {
  return toDateStr(dateForOffset(ws, Math.max(0, Math.ceil(eind - EPS) - 1)))
}

/**
 * Per order: wanneer was hij klaar, wanneer nu, en haalt hij de levering.
 * `oud` is het schema zoals het nu op het bord staat (deriveShopSchedule).
 */
export function effecten(jobs: QueueJob[], oud: Map<string, DerivedSlot>, uit: AutoUitkomst, ws: Date): OrderEffect[] {
  const perOrder = new Map<string, QueueJob[]>()
  for (const j of jobs) if (!j.gereed) perOrder.set(j.orderId, [...(perOrder.get(j.orderId) ?? []), j])
  const lijst: OrderEffect[] = []
  for (const [orderId, js] of perOrder) {
    const nieuw = js.some((j) => j.item.stap.geplandDatum == null)
    const oudE = nieuw ? null : Math.max(...js.map((j) => oud.get(j.id)?.finishOffsetDays ?? 0))
    const nieuwE = js.every((j) => uit.plaatsen.get(j.id)?.eind != null)
      ? Math.max(...js.map((j) => uit.plaatsen.get(j.id)!.eind!)) : null
    const levering = js[0].deadline
    const oudEind = oudE != null ? eindDag(oudE, ws) : null
    const nieuwEind = nieuwE != null ? eindDag(nieuwE, ws) : null
    lijst.push({
      orderId, projectId: js[0].item.project.id, klant: js[0].klant, artikel: js[0].artikel, levering,
      oudEind, nieuwEind,
      oudTeLaat: oudEind && levering ? werkdagenTeLaat(oudEind, levering) : 0,
      nieuwTeLaat: nieuwEind && levering ? werkdagenTeLaat(nieuwEind, levering) : 0,
      nieuw,
    })
  }
  return lijst
}

export interface Samenvatting {
  ingepland: OrderEffect[]
  later: OrderEffect[]
  eerder: OrderEffect[]
  teLaat: number
}

/** Wat de melding noemt: wat er nieuw ingepland is, en wat er voor de rest verschoof. */
export function vatSamen(effect: OrderEffect[], nadruk: Set<string> = new Set()): Samenvatting {
  const ingepland = effect.filter((e) => e.nieuw || nadruk.has(e.orderId))
  const rest = effect.filter((e) => !ingepland.includes(e) && e.oudEind && e.nieuwEind && e.oudEind !== e.nieuwEind)
  return {
    ingepland,
    later: rest.filter((e) => e.nieuwEind! > e.oudEind!).sort((a, b) => b.nieuwTeLaat - a.nieuwTeLaat),
    eerder: rest.filter((e) => e.nieuwEind! < e.oudEind!),
    teLaat: effect.filter((e) => e.nieuwTeLaat > 0).length,
  }
}
