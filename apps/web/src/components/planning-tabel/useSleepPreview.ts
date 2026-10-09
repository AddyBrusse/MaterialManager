import { useMemo, useState, type DragEvent } from 'react'
import type { Machine } from '../../api/machines'
import type { DerivedSlot, QueueJob } from '../../utils/planningQueueUtils'
import { preview, soortOnbekend, startDag, verplaats, waaromNietHier, waaromNietNaar, type Preview, type Wachtrijen } from './tabel-logica'
import type { SleepDoel } from './TabelRaster'

/**
 * Slepen met preview (2026-10-08): terwijl je sleept staat er bij de muis waar
 * de stap landt en wat er daardoor verschuift — met dezelfde rekensom als het
 * opslaan. Een machine van een andere soort is dicht en zegt waarom.
 */
export function useSleepPreview(opts: {
  wachtrijen: Wachtrijen
  machines: Machine[]
  schedule: Map<string, DerivedSlot>
  verplichtKlaar: Map<string, string>
  windowStart: Date
  onLos: (job: QueueJob, doel: string | null, voorId: string | null) => void
}) {
  const { wachtrijen, machines, schedule, verplichtKlaar, windowStart } = opts
  const [sleep, setSleep] = useState<QueueJob | null>(null)
  const [doel, setDoel] = useState<SleepDoel | null>(null)
  const [muis, setMuis] = useState<{ x: number; y: number } | null>(null)

  const huidig = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const [id, s] of schedule) m.set(id, startDag(s, windowStart))
    return m
  }, [schedule, windowStart])

  const nee = (kolom: string | null, voorId?: string | null): string | null => {
    if (!sleep || kolom == null) return null
    const m = machines.find((x) => x.name === kolom)
    const soort = m ? waaromNietNaar(sleep, m, machines) : null
    return soort ?? (voorId !== undefined ? waaromNietHier(wachtrijen, sleep, kolom, voorId) : null)
  }

  const gevolg: Preview | null = useMemo(() => {
    if (!sleep || !doel || nee(doel.kolom, doel.voorId)) return null
    if (doel.kolom === sleep.machineNaam && sleep.item.stap.geplandDatum && doel.voorId === volgendeNa(wachtrijen, sleep)) return null
    return preview(huidig, verplaats(wachtrijen, sleep, doel.kolom, doel.voorId), sleep, machines, verplichtKlaar, windowStart)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleep, doel?.kolom, doel?.voorId, wachtrijen, huidig, machines, verplichtKlaar, windowStart])

  return {
    sleep, doel, muis, gevolg,
    reden: doel ? nee(doel.kolom, doel.voorId) : null,
    onbekend: sleep ? soortOnbekend(sleep, machines) : null,
    dicht: (kolom: string | null) => nee(kolom) != null,
    start(e: DragEvent, j: QueueJob) {
      setSleep(j)
      e.dataTransfer.effectAllowed = 'move'
      try { e.dataTransfer.setData('text/plain', j.id) } catch { /* oude browser: alleen de state telt */ }
    },
    over(e: DragEvent, d: SleepDoel) {
      if (!sleep) return
      setMuis({ x: e.clientX, y: e.clientY })
      if (doel?.kolom !== d.kolom || doel?.voorId !== d.voorId) setDoel(d)
      if (nee(d.kolom, d.voorId)) { e.dataTransfer.dropEffect = 'none'; return }
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    los(e: DragEvent) {
      e.preventDefault()
      if (sleep && doel && !nee(doel.kolom, doel.voorId)) opts.onLos(sleep, doel.kolom, doel.voorId)
      setSleep(null); setDoel(null); setMuis(null)
    },
    eind() { setSleep(null); setDoel(null); setMuis(null) },
  }
}

/** De stap die nu direct na deze komt: loslaten daarvóór verandert niets. */
function volgendeNa(w: Wachtrijen, j: QueueJob): string | null {
  const rij = w.get(j.machineNaam) ?? []
  const i = rij.findIndex((x) => x.id === j.id)
  return i >= 0 ? rij[i + 1]?.id ?? null : null
}
