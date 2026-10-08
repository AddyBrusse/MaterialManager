import { notifications } from '@mantine/notifications'
import { projectsApi } from '../../api/projects'
import type { Machine } from '../../api/machines'
import { computeRelockedDates, type QueueJob } from '../../utils/planningQueueUtils'
import { toDateStr } from '../../utils/planningUtils'
import { samenvoegen, verplaats, type Verplaatsing, type Voorstel, type Wachtrijen } from './tabel-logica'

/**
 * Opslaan vanuit de tabel (2026-10-08). Precies wat de Wachtrij-pagina doet:
 * de verplaatste stap krijgt machine, plek en datum; van de stappen op de
 * geraakte machines (en hun opvolgers) wordt alleen de datum bijgewerkt als
 * die echt verschoof. Fouten meldt `projectsApi.planStap` zelf (syncProject).
 */
export function useTabelActies(wachtrijen: Wachtrijen, machines: Machine[], windowStart: Date, opgeslagen: () => void) {
  /** Schrijft de verplaatste stappen (met machine en plek) en de datums die daardoor verschoven. */
  function schrijf(w: Wachtrijen, geraakt: Set<string>, posities: Map<string, number>) {
    const datums = computeRelockedDates(w, geraakt, machines, windowStart)
    for (const jobs of w.values()) {
      for (const j of jobs) {
        const { project, order, stap } = j.item
        const d = datums.get(j.id) ?? toDateStr(windowStart)
        const pos = posities.get(j.id)
        if (pos != null) projectsApi.planStap(project.id, order.id, stap.id, d, j.machineNaam, pos)
        else if (datums.has(j.id) && d !== stap.geplandDatum) projectsApi.planStap(project.id, order.id, stap.id, d, j.machineNaam)
      }
    }
  }

  function schrijfEen(v: Verplaatsing, job: QueueJob, doel: string | null) {
    if (doel == null) {
      const { project, order, stap } = job.item
      projectsApi.planStap(project.id, order.id, stap.id, null, null, null)
      // Wat erachter stond, schuift naar voren.
      schrijf(v.wachtrijen, v.geraakt, new Map())
    } else {
      schrijf(v.wachtrijen, v.geraakt, new Map(v.positie != null ? [[job.id, v.positie]] : []))
    }
  }

  function verplaatsNaar(job: QueueJob, doel: string | null, voorId: string | null) {
    schrijfEen(verplaats(wachtrijen, job, doel, voorId), job, doel)
    opgeslagen()
    notifications.show({ message: doel ? `${job.orderId} · ${job.naam} → ${doel}` : `${job.orderId} · ${job.naam} → niet ingepland` })
  }

  /** Een voorstel in één keer: eerst alles plaatsen, dan één keer doorrekenen en opslaan. */
  function pasVoorstelToe(voorstellen: Voorstel[]) {
    const s = samenvoegen(wachtrijen, voorstellen)
    schrijf(s.wachtrijen, s.geraakt, s.posities)
    const n = s.posities.size
    opgeslagen()
    notifications.show({ message: `${n} stap${n === 1 ? '' : 'pen'} ingepland` })
  }

  return { verplaatsNaar, pasVoorstelToe }
}
