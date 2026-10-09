/**
 * Wat er per stap opvalt (2026-10-09), voor de Gantt en het werkbord. Afgeleid,
 * nooit opgeslagen. Rood is achter lopen: een stap die uitloopt, of die had
 * moeten beginnen en nog niet gestart is.
 */
import type { Machine } from '../../api/machines'
import { tijdstipAlsDag } from '../../utils/auto-planning'
import { walkForward, type DerivedSlot, type QueueJob } from '../../utils/planningQueueUtils'
import { toDateStr } from '../../utils/planningUtils'
import { dateForOffset } from '../../utils/planningQueueUtils'
import { dagKort } from '../planning-tabel/tabel-logica'

export type SignaalSoort = 'uitloop' | 'achter' | 'materiaal' | 'geenMachine' | 'bezig'
export interface Signaal {
  soort: SignaalSoort
  tekst: string
}
/** Waar een lopende stap op de tijdlijn staat: begin van de klok, gepland eind, en tot waar hij uitloopt. */
export interface Loop { start: number; gepland: number; tot: number | null }
export interface Klok { gestartOp: string; seconden: number }

const uren = (s: number) => (s / 3600).toLocaleString('nl-NL', { maximumFractionDigits: 1 })

export function stapSignalen(
  open: QueueJob[], schema: Map<string, DerivedSlot>, klokken: Map<string, Klok>, machines: Machine[], ws: Date, nu: number,
): { signalen: Map<string, Signaal[]>; lopen: Map<string, Loop> } {
  const signalen = new Map<string, Signaal[]>()
  const lopen = new Map<string, Loop>()
  const machine = new Map(machines.map((m) => [m.name, m]))
  for (const j of open) {
    const s: Signaal[] = []
    const klok = klokken.get(j.id)
    const m = machine.get(j.machineNaam)
    if (!m) s.push({ soort: 'geenMachine', tekst: 'Geen machine — sleep hem op een machine' })
    if (j.wachtOpMateriaal) {
      const v = j.item.order.materiaalVerwacht
      s.push({ soort: 'materiaal', tekst: v ? `Materiaal verwacht ${dagKort(v)}${j.item.order.materiaalOnbekend ? ' (deels onbekend)' : ''}` : 'Materiaal: leverdatum onbekend' })
    }
    if (klok) {
      const start = tijdstipAlsDag(klok.gestartOp, ws)
      const gepland = walkForward(start, j.duurMin, m?.worksWeekends ?? false, ws)
      const overTijd = j.duurMin > 0 && klok.seconden > j.duurMin * 60
      const uit = gepland < nu || overTijd
      lopen.set(j.id, { start, gepland, tot: uit ? Math.max(nu, gepland) : null })
      s.push(uit
        ? { soort: 'uitloop', tekst: `Loopt uit · ${uren(klok.seconden)} u gemeten van ${uren(j.duurMin * 60)} u geschat` }
        : { soort: 'bezig', tekst: `Bezig sinds ${dagKort(toDateStr(new Date(klok.gestartOp)))}` })
    } else {
      const slot = j.item.stap.geplandDatum ? schema.get(j.id) : undefined
      if (slot && slot.startOffsetDays < Math.floor(nu)) {
        s.push({ soort: 'achter', tekst: `Had ${dagKort(toDateStr(dateForOffset(ws, Math.floor(slot.startOffsetDays))))} moeten beginnen` })
      }
    }
    if (s.length) signalen.set(j.id, s)
  }
  return { signalen, lopen }
}

/** Hoeveel stappen er achter lopen (uitloop of niet op tijd begonnen). */
export function aantalAchter(signalen: Map<string, Signaal[]>): number {
  let n = 0
  for (const s of signalen.values()) if (s.some((x) => x.soort === 'uitloop' || x.soort === 'achter')) n++
  return n
}
