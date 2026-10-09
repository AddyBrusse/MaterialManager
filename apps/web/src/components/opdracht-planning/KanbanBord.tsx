import { useState } from 'react'
import type { DragEvent } from 'react'
import type { Machine } from '../../api/machines'
import type { DerivedSlot } from '../../utils/planningQueueUtils'
import { machineAccentColor } from '../../utils/planningQueueUtils'
import { meldFout } from '../../utils/fout-melding-toon'
import { Weigering } from '../../utils/fout-melding'
import { MACHINE_SOORT_LABEL } from '@stockmanager/shared'
import { kanbanLos, type Baan, type Kaart } from './planning-logica'
import { KaartBlok } from './KaartBlok'
import type { StapRegel } from './InfoHover'

interface Props {
  banen: Baan[]
  machines: Machine[]
  schema: Map<string, DerivedSlot>
  ws: Date
  bezig: boolean
  info: (orderId: string) => { klant: string; stappen: StapRegel[] }
  onLos: (k: Kaart, prioriteit: number, machine?: Machine) => void
  onWachtUit: (k: Kaart) => void
}

/**
 * KanBan (2026-10-09): één baan per machine, de stappen in de volgorde waarin
 * de machine ze doet. Hoger slepen = meer voorrang; naar een andere baan = een
 * andere machine van dezelfde soort. Bezig staat vast bovenaan.
 */
export function KanbanBord({ banen, machines, schema, ws, bezig, info, onLos, onWachtUit }: Props) {
  const [sleep, setSleep] = useState<Kaart | null>(null)
  const [doel, setDoel] = useState<string | null>(null)
  const eind = () => { setSleep(null); setDoel(null) }

  const los = (e: DragEvent, baan: Baan, voorId: string | null) => {
    e.preventDefault(); e.stopPropagation()
    const k = sleep
    eind()
    if (!k) return
    const r = kanbanLos(baan, k, voorId, machines)
    if (!r) return
    if ('reden' in r) return meldFout({ actie: 'Kaart verplaatsen', fout: new Weigering(r.reden), gevolg: 'Er is niets verplaatst.' })
    onLos(k, r.prioriteit, r.machine ? baan.machine! : undefined)
  }
  const sleutel = (b: Baan) => b.machine?.name ?? '—'

  return (
    <div className="kb" data-bezig={bezig || undefined}>
      {banen.map((b) => {
        const uren = b.kaarten.reduce((t, k) => t + k.job.duurMin, 0) / 60
        return (
          <div key={sleutel(b)} className="kb-baan" data-doel={doel === `${sleutel(b)}:eind` || undefined}
            style={{ ['--mc' as string]: b.machine ? machineAccentColor(b.machine.name, b.machine.id) : '#999' }}
            onDragOver={(e) => { if (sleep) { e.preventDefault(); setDoel(`${sleutel(b)}:eind`) } }}
            onDrop={(e) => los(e, b, null)}>
            <h4>
              <span><i />{b.machine?.name ?? 'Geen machine'}</span>
              <span className="kb-sub">{b.machine?.soort ? MACHINE_SOORT_LABEL[b.machine.soort] + ' · ' : ''}{b.kaarten.length} · {uren.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} u</span>
            </h4>
            <div className="wb-lijst">
              {b.kaarten.map((k) => (
                <KaartBlok key={k.job.id} k={k} slot={schema.get(k.job.id)} ws={ws} toonMachine={!b.machine} info={info}
                  sleepbaar={!bezig && k.kolom !== 'bezig'} gesleept={sleep?.job.id === k.job.id} doel={doel === k.job.id} sleeptIets={sleep != null}
                  onStart={(e, x) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.job.id); setSleep(x) }}
                  onEind={eind}
                  onOver={(e) => { if (sleep) { e.preventDefault(); e.stopPropagation(); setDoel(k.job.id) } }}
                  onDrop={(e) => los(e, b, k.job.id)} onWachtUit={onWachtUit} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
