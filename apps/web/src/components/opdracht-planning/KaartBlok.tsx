import type { DragEvent } from 'react'
import type { DerivedSlot, QueueJob } from '../../utils/planningQueueUtils'
import { machineAccentColor } from '../../utils/planningQueueUtils'
import { dagKort, startDag, urenKort } from '../planning-tabel/tabel-logica'
import type { Kaart } from './planning-logica'
import { ArtikelInhoud, InfoHover, type StapRegel } from './InfoHover'

export interface KaartProps {
  k: Kaart; slot: DerivedSlot | undefined; ws: Date
  /** Machine op de kaart (Status); in de KanBan staat hij al boven de baan. */
  toonMachine: boolean
  sleepbaar: boolean; gesleept: boolean; doel: boolean; sleeptIets: boolean
  info: (orderId: string) => { klant: string; stappen: StapRegel[] }
  onStart?: (e: DragEvent, k: Kaart) => void; onEind?: () => void; onOver?: (e: DragEvent) => void; onDrop?: (e: DragEvent) => void
  onWachtUit?: (k: Kaart) => void
}

/** Eén stap op het werkbord; na 1,5 s stilstaan meer informatie. */
export function KaartBlok(p: KaartProps) {
  const { k } = p
  const j: QueueJob = k.job
  const st = j.item.stap.geplandDatum ? startDag(p.slot, p.ws) : null
  return (
    <InfoHover uit={p.sleeptIets} inhoud={() => { const i = p.info(j.orderId); return <ArtikelInhoud order={j.item.order} klant={i.klant} stappen={i.stappen} nadruk={j.id} /> }}>
      <div className="wb-kaart" draggable={p.sleepbaar} data-gesleept={p.gesleept || undefined} data-doel={p.doel || undefined}
        data-rood={k.signalen.some((g) => g.soort === 'uitloop' || g.soort === 'achter') || undefined}
        data-bezig={k.kolom === 'bezig' || undefined}
        style={{ ['--mc' as string]: machineAccentColor(j.machineNaam, j.machineNaam) }}
        onDragStart={(e) => p.onStart?.(e, k)} onDragEnd={p.onEind} onDragOver={p.onOver} onDrop={p.onDrop}>
        <div className="r1"><b>{j.orderId}</b><span>{p.toonMachine ? (j.machineNaam || 'geen machine') : p.info(j.orderId).klant}</span></div>
        <div className="r2">{j.artikel} · {j.item.order.qty} st</div>
        <div className="r3">
          <span>stap {k.stapNr} van {k.stappen} · {j.naam} · {urenKort(j.duurMin)}</span>
          <span>{k.kolom === 'gereed' ? '✓' : st ? dagKort(st) : 'niet ingepland'}</span>
        </div>
        {k.signalen.filter((g) => g.soort !== 'geenMachine' || p.toonMachine).map((g) => <div key={g.soort} className="wb-sig" data-soort={g.soort}>{g.tekst}</div>)}
        {j.item.stap.machineWacht && k.kolom !== 'bezig' && (
          <button className="wb-wacht" title="Klik: de machine mag de tijd vóór deze stap weer met ander werk vullen"
            onClick={(e) => { e.stopPropagation(); p.onWachtUit?.(k) }}>machine wacht hierop ✕</button>
        )}
      </div>
    </InfoHover>
  )
}
