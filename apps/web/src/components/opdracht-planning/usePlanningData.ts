import { useEffect, useMemo, useState } from 'react'
import { articlesApi } from '../../api/articles'
import { machinesApi } from '../../api/machines'
import { relatiesApi } from '../../api/relaties'
import { herlaadProjecten, projectsApi } from '../../api/projects'
import { useLopendeTijd } from '../../hooks/useTijdregistratie'
import { bepaalRang, nuAlsDag } from '../../utils/auto-planning'
import { aantalAchter, stapSignalen, type Klok } from './signalen'
import { buildStapItems } from '../../utils/planningSharedUtils'
import { buildQueueJobs, dateForOffset, deriveShopSchedule, type QueueJob } from '../../utils/planningQueueUtils'
import { toDateStr } from '../../utils/planningUtils'
import { opPlanningSein } from '../../utils/planning-sein'
import { startVanKlokken, vandaag, wachtrijenVan } from './herbereken'
import { bouwGantt, kanbanBanen, werkbord } from './planning-logica'

const VERVERS_MS = 10_000

/**
 * Alles wat de Gantt en het werkbord nodig hebben, en elke 10 s vers van de
 * server (CLAUDE.md: polling, geen websocket). Een herberekening in het andere
 * venster geeft een sein, dan meteen.
 */
export function usePlanningData() {
  const [rev, setRev] = useState(0)
  const ververs = () => setRev((r) => r + 1)
  const lopendQ = useLopendeTijd()

  useEffect(() => {
    let weg = false
    const haal = async () => { if (await herlaadProjecten() && !weg) ververs() }
    const t = setInterval(haal, VERVERS_MS)
    const uit = opPlanningSein(() => { void haal().then(ververs) })
    void haal()
    return () => { weg = true; clearInterval(t); uit() }
  }, [])

  const ws = useMemo(vandaag, [])
  const machines = machinesApi.listSync()
  return useMemo(() => {
    const articles = articlesApi.list()
    const projects = projectsApi.list()
    const relaties = relatiesApi.listSync()
    const alles = buildStapItems(projects, articles, { includeDone: true })
    const jobsAlles = buildQueueJobs(alles, articles)
    const open = jobsAlles.filter((j) => !j.gereed && j.item.order.status !== 'gereed')
    const vandaagStr = toDateStr(new Date())
    const gereedVandaag = jobsAlles.filter((j) => j.item.stap.gereedOp != null && toDateStr(new Date(j.item.stap.gereedOp)) === vandaagStr)
    const lopend = new Set((lopendQ.data ?? []).map((r) => r.stapId))
    const klokken = new Map<string, Klok>()
    for (const [id, op] of startVanKlokken(lopendQ.data ?? [])) {
      klokken.set(id, { gestartOp: op, seconden: (lopendQ.data ?? []).filter((r) => r.stapId === id).reduce((t, r) => t + r.seconden, 0) })
    }
    const schema = deriveShopSchedule(wachtrijenVan(open, machines), machines, ws, { honorLockedDates: true })
    // Dezelfde schaal als herberekenPlanning: de rang van nu, genummerd per 1000.
    const rang = new Map(bepaalRang(open, ws, lopend).map((j, i) => [j.id, (i + 1) * 1000]))
    const { signalen, lopen } = stapSignalen(open, schema, klokken, machines, ws, nuAlsDag(ws))
    const klantVan = (j: QueueJob) => relaties.find((r) => r.id === j.item.project.relatieId)?.naam ?? j.klant
    // Voor de tooltips: alle open stappen van een order, met start en signalen.
    const info = (orderId: string) => {
      const js = open.filter((j) => j.orderId === orderId).sort((a, b) => a.volgorde - b.volgorde)
      return {
        klant: js[0] ? klantVan(js[0]) : '',
        stappen: js.map((j) => {
          const loop = lopen.get(j.id)
          const slot = j.item.stap.geplandDatum ? schema.get(j.id) : undefined
          const dag = loop ? loop.start : slot?.startOffsetDays
          return { job: j, start: dag != null ? toDateStr(dateForOffset(ws, Math.floor(dag))) : null, signalen: signalen.get(j.id) ?? [] }
        }),
      }
    }
    return {
      ws, machines, open, schema, lopend, ververs, info, achter: aantalAchter(signalen),
      banen: kanbanBanen(open, machines, schema, lopend, rang, signalen, lopen),
      gantt: bouwGantt(alles, open, schema, ws, klantVan, signalen, lopen),
      kolommen: werkbord(open, gereedVandaag, lopend, rang, signalen),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev, lopendQ.data, machines, ws])
}
