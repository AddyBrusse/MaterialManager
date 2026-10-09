/**
 * Automatisch plannen vanuit het scherm (2026-10-08): ophalen wat er nu staat,
 * rekenen (`utils/auto-planning.ts`), in één keer vastleggen op de server en
 * de melding tonen. Wordt aangeroepen bij "in productie geven", bij slepen op
 * het werkbord en met de knop "Herbereken".
 */
import type { Machine } from '../../api/machines'
import { articlesApi } from '../../api/articles'
import { machinesApi } from '../../api/machines'
import { herlaadProjecten, projectsApi } from '../../api/projects'
import { planningApi } from '../../api/planning'
import { tijdregistratieApi } from '../../api/tijdregistratie'
import { bepaalRang, effecten, planAutomatisch, vatSamen, wijzigingen, type AutoUitkomst, type Samenvatting } from '../../utils/auto-planning'
import { buildStapItems } from '../../utils/planningSharedUtils'
import {
  buildQueueJobs, deriveShopSchedule, isBacklogJob, sortByQueuePosition, type QueueJob,
} from '../../utils/planningQueueUtils'
import { seinPlanning } from '../../utils/planning-sein'
import { meldFout } from '../../utils/fout-melding-toon'
import { toonPlanningMelding } from './PlanningMelding'
import { gevuldGat, toonGatKeuze } from './GatKeuze'

export interface HerberekenOpties {
  aanleiding: string
  /** Orders die net vrijgegeven zijn: de melding noemt die als "ingepland". */
  nadruk?: string[]
  /** Prioriteit opnieuw op uiterlijk starten. */
  opLevertijd?: boolean
  /** Van het werkbord: deze stap krijgt deze rang. */
  prioriteit?: { stapId: string; waarde: number }
  /** Van het werkbord: deze stap naar deze machine. */
  machine?: { stapId: string; naam: string }
  /** "Machine laten wachten" aan of uit voor deze stap. */
  machineWacht?: { stapId: string; waarde: boolean }
}

export function vandaag(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** De open stappen zoals elk planningscherm ze ziet. */
export function openJobs(): QueueJob[] {
  const articles = articlesApi.list()
  return buildQueueJobs(buildStapItems(projectsApi.list(), articles), articles).filter((j) => !j.gereed)
}

/** Per stap het vroegste begin van een klok die nu loopt: daar blijft de stap in de planning staan. */
export function startVanKlokken(klokken: { stapId: string; gestartOp: string }[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const k of klokken) if (!m.has(k.stapId) || k.gestartOp < m.get(k.stapId)!) m.set(k.stapId, k.gestartOp)
  return m
}

export function wachtrijenVan(jobs: QueueJob[], machines: Machine[]): Map<string, QueueJob[]> {
  return new Map(machines.map((m) => [m.name, sortByQueuePosition(jobs.filter((j) => !isBacklogJob(j) && j.machineNaam === m.name))]))
}

/** Een kopie van de stap met een andere planning; het origineel blijft staan om mee te vergelijken. */
function metStap(j: QueueJob, stap: Partial<QueueJob['item']['stap']>): QueueJob {
  return { ...j, item: { ...j.item, stap: { ...j.item.stap, ...stap } } }
}

interface Stand { ws: Date; machines: Machine[]; jobs: QueueJob[]; lopend: Set<string>; gestart: Map<string, string> }

async function laadStand(): Promise<Stand> {
  await herlaadProjecten()
  const klokken = await tijdregistratieApi.lopend()
  return {
    ws: vandaag(), machines: machinesApi.listSync(), jobs: openJobs(),
    lopend: new Set(klokken.map((r) => r.stapId)), gestart: startVanKlokken(klokken),
  }
}

function reken(st: Stand, opt: HerberekenOpties): AutoUitkomst {
  // De rang van nu vastleggen, dan pas de ene wijziging erop: anders schuift
  // werk dat nog nooit gerangschikt was ineens om de gesleepte stap heen.
  const rang = bepaalRang(st.jobs, st.ws, st.lopend, opt.opLevertijd)
  const nr = new Map(rang.map((j, i) => [j.id, (i + 1) * 1000]))
  const invoer = st.jobs.map((j) => {
    let k = opt.opLevertijd ? j : metStap(j, { prioriteit: nr.get(j.id) })
    if (opt.prioriteit?.stapId === j.id) k = metStap(k, { prioriteit: opt.prioriteit.waarde })
    if (opt.machine?.stapId === j.id) k = metStap(k, { geplandMachine: opt.machine.naam })
    if (opt.machineWacht?.stapId === j.id) k = metStap(k, { machineWacht: opt.machineWacht.waarde })
    return k
  })
  return planAutomatisch({ jobs: invoer, machines: st.machines, windowStart: st.ws, lopend: st.lopend, gestart: st.gestart, opLevertijd: opt.opLevertijd })
}

async function slaOp(st: Stand, uit: AutoUitkomst, opt: HerberekenOpties): Promise<Samenvatting> {
  const w = wijzigingen(st.jobs, uit)
  const oud = deriveShopSchedule(wachtrijenVan(st.jobs, st.machines), st.machines, st.ws, { honorLockedDates: true })
  const samenvatting = vatSamen(effecten(st.jobs, oud, uit, st.ws), new Set(opt.nadruk ?? []))
  const geenMachine = [...uit.plaatsen.values()].filter((p) => p.machine == null && p.reden).map((p) => p.reden!)
  if (w.length === 0) {
    toonPlanningMelding({ herberekening: null, aanleiding: opt.aanleiding, samenvatting, geenMachine })
    return samenvatting
  }
  const herberekening = await planningApi.herbereken({
    aanleiding: opt.aanleiding,
    wijzigingen: w.map(({ stapId, geplandDatum, geplandMachine, queuePosition, prioriteit, machineWacht }) => ({ stapId, geplandDatum, geplandMachine, queuePosition, prioriteit, machineWacht })),
    samenvatting,
  })
  await herlaadProjecten()
  seinPlanning()
  toonPlanningMelding({ herberekening, aanleiding: opt.aanleiding, samenvatting, geenMachine })
  return samenvatting
}

const meldHerberekenFout = (opt: HerberekenOpties, fout: unknown) => meldFout({
  actie: `Planning herberekenen (${opt.aanleiding})`,
  fout,
  gevolg: 'De planning is niet veranderd: de server legt een herberekening helemaal of niet vast. Wat je daarvoor deed (vrijgeven, slepen) staat wel. Kwam er geen antwoord van de server, dan is onbekend of hij het nog vastlegde: ververs de planning voor je opnieuw rekent.',
})

/**
 * Rekenen en vastleggen. Na slepen op het werkbord: gaat er ander werk in de
 * tijd waarop de gesleepte stap moet wachten, dan eerst de keuze (2026-10-09)
 * — vullen, of de machine laten wachten — en pas daarna opslaan.
 */
export async function herberekenPlanning(opt: HerberekenOpties): Promise<Samenvatting | null> {
  try {
    const st = await laadStand()
    const uit = reken(st, opt)
    const id = opt.prioriteit?.stapId ?? opt.machine?.stapId
    const gat = id && !opt.machineWacht ? gevuldGat(st.jobs, uit, id) : null
    if (gat) {
      const wacht = reken(st, { ...opt, machineWacht: { stapId: id!, waarde: true } })
      toonGatKeuze({
        gat, wacht: gevuldGat(st.jobs, wacht, id!, gat.gevuld.map((g) => g.job.id)), ws: st.ws,
        onVullen: () => slaOp(st, uit, opt).catch((f) => meldHerberekenFout(opt, f)),
        onWachten: () => slaOp(st, wacht, { ...opt, aanleiding: `${opt.aanleiding}, machine wacht` }).catch((f) => meldHerberekenFout(opt, f)),
      })
      return null
    }
    return await slaOp(st, uit, opt)
  } catch (fout) {
    meldHerberekenFout(opt, fout)
    return null
  }
}
