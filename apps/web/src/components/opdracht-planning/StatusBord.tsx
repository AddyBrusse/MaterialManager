import { useState } from 'react'
import type { Machine } from '../../api/machines'
import type { DerivedSlot } from '../../utils/planningQueueUtils'
import { machineAccentColor } from '../../utils/planningQueueUtils'
import { KOLOMMEN, type Kaart, type Kolom } from './planning-logica'
import { KaartBlok } from './KaartBlok'
import type { StapRegel } from './InfoHover'

/**
 * Status (2026-10-09): waar elke stap staat — wacht op materiaal, op zijn
 * vorige stap, klaar, bezig, gereed vandaag. Alleen kijken; plannen doe je in
 * de KanBan.
 */
export function StatusBord({ kolommen, machines, schema, ws, info, onWachtUit }: {
  kolommen: Record<Kolom, Kaart[]>; machines: Machine[]; schema: Map<string, DerivedSlot>; ws: Date
  info: (orderId: string) => { klant: string; stappen: StapRegel[] }; onWachtUit: (k: Kaart) => void
}) {
  const [filter, setFilter] = useState<string | null>(null)
  return (
    <div className="wb">
      <div className="wb-filter">
        <button className="wb-chip" data-on={filter == null || undefined} onClick={() => setFilter(null)}>Alle machines</button>
        {machines.map((m) => (
          <button key={m.id} className="wb-chip" data-on={filter === m.name || undefined}
            style={{ ['--mc' as string]: machineAccentColor(m.name, m.id) }} onClick={() => setFilter(filter === m.name ? null : m.name)}>
            <i />{m.name}
          </button>
        ))}
      </div>
      <div className="wb-kolommen">
        {KOLOMMEN.map(([kolom, titel]) => {
          const kaarten = kolommen[kolom].filter((k) => !filter || k.job.machineNaam === filter)
          return (
            <div key={kolom} className="wb-kol">
              <h4>{titel}<span>{kaarten.length}</span></h4>
              <div className="wb-lijst">
                {kaarten.map((k) => (
                  <KaartBlok key={k.job.id} k={k} slot={schema.get(k.job.id)} ws={ws} toonMachine info={info}
                    sleepbaar={false} gesleept={false} doel={false} sleeptIets={false} onWachtUit={onWachtUit} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
