import { useState } from 'react'
import type { DragEvent } from 'react'
import type { Machine } from '../../api/machines'
import type { DerivedSlot, QueueJob } from '../../utils/planningQueueUtils'
import { machineAccentColor } from '../../utils/planningQueueUtils'
import { meldFout } from '../../utils/fout-melding-toon'
import { Weigering } from '../../utils/fout-melding'
import { dagKort, startDag, urenKort, waaromNietNaar } from '../planning-tabel/tabel-logica'
import { KOLOMMEN, SLEEPBAAR, rangTussen, type Kaart, type Kolom } from './planning-logica'

interface Props {
  kolommen: Record<Kolom, Kaart[]>
  machines: Machine[]
  schema: Map<string, DerivedSlot>
  ws: Date
  bezig: boolean
  onPrioriteit: (k: Kaart, waarde: number) => void
  onMachine: (k: Kaart, machine: Machine) => void
}

/**
 * Het werkbord (2026-10-08): één kaart per stap. De kolom zegt wat de stap nu
 * kan; de plek in de kolom is zijn prioriteit — hoger is eerder. Slepen kan
 * binnen een kolom (prioriteit) en op een machine (dezelfde soort). Bezig en
 * gereed komen van de terminal en zijn niet te slepen.
 */
export function Werkbord({ kolommen, machines, schema, ws, bezig, onPrioriteit, onMachine }: Props) {
  const [filter, setFilter] = useState<string | null>(null)
  const [sleep, setSleep] = useState<Kaart | null>(null)
  const [doel, setDoel] = useState<string | null>(null)

  const weiger = (reden: string) => meldFout({ actie: 'Kaart verplaatsen', fout: new Weigering(reden), gevolg: 'Er is niets verplaatst.' })
  const start = (e: DragEvent, k: Kaart) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k.job.id); setSleep(k) }
  const eind = () => { setSleep(null); setDoel(null) }

  const losOp = (e: DragEvent, kolom: Kolom, voorId: string | null) => {
    e.preventDefault(); e.stopPropagation()
    const k = sleep
    eind()
    if (!k || k.job.id === voorId) return
    if (k.kolom !== kolom) return weiger('Een kaart blijft in zijn kolom: die zegt wat de stap nu kan. Sleep hem hoger of lager in dezelfde kolom.')
    onPrioriteit(k, rangTussen(kolommen[kolom], k.job.id, voorId))
  }
  const opMachine = (e: DragEvent, m: Machine) => {
    e.preventDefault()
    const k = sleep
    eind()
    if (!k) return
    if (k.job.machineNaam === m.name) return
    const reden = waaromNietNaar(k.job, m, machines)
    if (reden) return weiger(reden)
    onMachine(k, m)
  }
  const magNaar = (m: Machine) => !sleep || !waaromNietNaar(sleep.job, m, machines)

  return (
    <div className="wb" data-bezig={bezig || undefined}>
      <div className="wb-filter">
        <button className="wb-chip" data-on={filter == null || undefined} onClick={() => setFilter(null)}>Alle machines</button>
        {machines.map((m) => (
          <button key={m.id} className="wb-chip" data-on={filter === m.name || undefined}
            data-doel={sleep ? (magNaar(m) ? 'ja' : 'nee') : undefined}
            style={{ ['--mc' as string]: machineAccentColor(m.name, m.id) }}
            onClick={() => setFilter(filter === m.name ? null : m.name)}
            onDragOver={(e) => { if (sleep) e.preventDefault() }} onDrop={(e) => opMachine(e, m)}
            title={sleep ? (waaromNietNaar(sleep.job, m, machines) ?? `Naar ${m.name}`) : `Alleen ${m.name}`}>
            <i />{m.name}
          </button>
        ))}
        {sleep && <span className="wb-hint">Loslaten op een machine = naar die machine · in de kolom = hoger of lager</span>}
      </div>
      <div className="wb-kolommen">
        {KOLOMMEN.map(([kolom, titel]) => {
          const kaarten = kolommen[kolom].filter((k) => !filter || k.job.machineNaam === filter)
          const sleepbaar = SLEEPBAAR.includes(kolom)
          return (
            <div key={kolom} className="wb-kol" onDragOver={(e) => { if (sleep && sleepbaar) { e.preventDefault(); setDoel(`${kolom}:eind`) } }}
              onDrop={(e) => losOp(e, kolom, null)} data-doel={doel === `${kolom}:eind` || undefined}>
              <h4>{titel}<span>{kaarten.length}</span></h4>
              <div className="wb-lijst">
                {kaarten.map((k) => (
                  <KaartBlok key={k.job.id} k={k} slot={schema.get(k.job.id)} ws={ws} sleepbaar={sleepbaar && !bezig}
                    gesleept={sleep?.job.id === k.job.id} doel={doel === k.job.id}
                    onStart={start} onEind={eind}
                    onOver={(e) => { if (sleep && sleepbaar) { e.preventDefault(); e.stopPropagation(); setDoel(k.job.id) } }}
                    onDrop={(e) => losOp(e, kolom, k.job.id)} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KaartBlok({ k, slot, ws, sleepbaar, gesleept, doel, onStart, onEind, onOver, onDrop }: {
  k: Kaart; slot: DerivedSlot | undefined; ws: Date; sleepbaar: boolean; gesleept: boolean; doel: boolean
  onStart: (e: DragEvent, k: Kaart) => void; onEind: () => void; onOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void
}) {
  const j: QueueJob = k.job
  const st = j.item.stap.geplandDatum ? startDag(slot, ws) : null
  return (
    <div className="wb-kaart" draggable={sleepbaar} data-gesleept={gesleept || undefined} data-doel={doel || undefined}
      style={{ ['--mc' as string]: machineAccentColor(j.machineNaam, j.machineNaam) }}
      onDragStart={(e) => onStart(e, k)} onDragEnd={onEind} onDragOver={onOver} onDrop={onDrop}
      title={`${j.item.project.id} · ${j.item.project.naam}`}>
      <div className="r1"><b>{j.orderId}</b><span>{j.machineNaam || 'geen machine'}</span></div>
      <div className="r2">{j.artikel} · {j.item.order.qty} st</div>
      <div className="r3">
        <span>stap {k.stapNr} van {k.stappen} · {j.naam} · {urenKort(j.duurMin)}</span>
        <span>{k.kolom === 'gereed' ? '✓' : st ? dagKort(st) : 'niet ingepland'}</span>
      </div>
    </div>
  )
}
