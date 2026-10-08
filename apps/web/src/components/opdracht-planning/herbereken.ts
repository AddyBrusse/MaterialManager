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
import { bepaalRang, effecten, planAutomatisch, vatSamen, wijzigingen, type Samenvatting } from '../../utils/auto-planning'
import { buildStapItems } from '../../utils/planningSharedUtils'
import {
  buildQueueJobs, deriveShopSchedule, isBacklogJob, sortByQueuePosition, type QueueJob,
} from '../../utils/planningQueueUtils'
import { seinPlanning } from '../../utils/planning-sein'
import { meldFout } from '../../utils/fout-melding-toon'
import { toonPlanningMelding } from './PlanningMelding'

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

export function wachtrijenVan(jobs: QueueJob[], machines: Machine[]): Map<string, QueueJob[]> {
  return new Map(machines.map((m) => [m.name, sortByQueuePosition(jobs.filter((j) => !isBacklogJob(j) && j.machineNaam === m.name))]))
}

/** Een kopie van de stap met een andere planning; het origineel blijft staan om mee te vergelijken. */
function metStap(j: QueueJob, stap: Partial<QueueJob['item']['stap']>): QueueJob {
  return { ...j, item: { ...j.item, stap: { ...j.item.stap, ...stap } } }
}

export async function herberekenPlanning(opt: HerberekenOpties): Promise<Samenvatting | null> {
  const ws = vandaag()
  try {
    await herlaadProjecten()
    const machines = machinesApi.listSync()
    const jobs = openJobs()
    const lopend = new Set((await tijdregistratieApi.lopend()).map((r) => r.stapId))

    // De rang van nu vastleggen, dan pas de ene wijziging erop: anders schuift
    // werk dat nog nooit gerangschikt was ineens om de gesleepte stap heen.
    const rang = bepaalRang(jobs, ws, lopend, opt.opLevertijd)
    const nr = new Map(rang.map((j, i) => [j.id, (i + 1) * 1000]))
    const invoer = jobs.map((j) => {
      let k = opt.opLevertijd ? j : metStap(j, { prioriteit: nr.get(j.id) })
      if (opt.prioriteit?.stapId === j.id) k = metStap(k, { prioriteit: opt.prioriteit.waarde })
      if (opt.machine?.stapId === j.id) k = metStap(k, { geplandMachine: opt.machine.naam })
      return k
    })

    const uit = planAutomatisch({ jobs: invoer, machines, windowStart: ws, lopend, opLevertijd: opt.opLevertijd })
    const w = wijzigingen(jobs, uit)
    const oud = deriveShopSchedule(wachtrijenVan(jobs, machines), machines, ws, { honorLockedDates: true })
    const samenvatting = vatSamen(effecten(jobs, oud, uit, ws), new Set(opt.nadruk ?? []))
    const geenMachine = [...uit.plaatsen.values()].filter((p) => p.machine == null && p.reden).map((p) => p.reden!)

    if (w.length === 0) {
      toonPlanningMelding({ herberekening: null, aanleiding: opt.aanleiding, samenvatting, geenMachine })
      return samenvatting
    }
    const herberekening = await planningApi.herbereken({
      aanleiding: opt.aanleiding,
      wijzigingen: w.map(({ stapId, geplandDatum, geplandMachine, queuePosition, prioriteit }) => ({ stapId, geplandDatum, geplandMachine, queuePosition, prioriteit })),
      samenvatting,
    })
    await herlaadProjecten()
    seinPlanning()
    toonPlanningMelding({ herberekening, aanleiding: opt.aanleiding, samenvatting, geenMachine })
    return samenvatting
  } catch (fout) {
    meldFout({
      actie: `Planning herberekenen (${opt.aanleiding})`,
      fout,
      gevolg: 'De planning is niet veranderd: de server legt een herberekening helemaal of niet vast. Wat je daarvoor deed (vrijgeven, slepen) staat wel. Kwam er geen antwoord van de server, dan is onbekend of hij het nog vastlegde: ververs de planning voor je opnieuw rekent.',
    })
    return null
  }
}
