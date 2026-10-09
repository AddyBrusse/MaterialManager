import { Fragment } from 'react'
import { dateForOffset, isWeekendOffset, machineAccentColor, dayOffsetForDateStr } from '../../utils/planningQueueUtils'
import { weekNrForIdx } from '../../utils/planningSharedUtils'
import { eindDag } from '../../utils/auto-planning'
import { dagKort, urenKort } from '../planning-tabel/tabel-logica'
import type { GanttArtikel, GanttOpdracht } from './planning-logica'
import { ArtikelInhoud, InfoHover, type StapRegel } from './InfoHover'

interface Props {
  opdrachten: GanttOpdracht[]
  ws: Date
  van: number
  dagen: number
  dicht: Set<string>
  info: (orderId: string) => { klant: string; stappen: StapRegel[] }
  onKlap: (projectId: string) => void
  onOpen: (projectId: string) => void
  onArtikel: (artikelId: string) => void
}

const DAG = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
const MAAND = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

/**
 * De Gantt per opdracht (2026-10-08, herzien 2026-10-09): één tijdlijn voor
 * alle opdrachten. De projectregel is een effen band met de gegevens (geen
 * balk); per artikel de stappen in de kleur van de machine, met een lijn van
 * stap naar stap en de rode lijn op de afgesproken levering.
 */
export function OpdrachtGantt({ opdrachten, ws, van, dagen, dicht, info, onKlap, onOpen, onArtikel }: Props) {
  const pct = (x: number) => `${((x - van) / dagen) * 100}%`
  const breed = (a: number, b: number) => `${((Math.min(b, van + dagen) - Math.max(a, van)) / dagen) * 100}%`
  const zichtbaar = (a: number, b: number) => b > van && a < van + dagen
  const dagIdx = Array.from({ length: dagen }, (_, i) => van + i)
  const kop = (d: number) => {
    const dt = dateForOffset(ws, d)
    if (dagen === 1) return `${DAG[dt.getDay()]} ${dt.getDate()} · wk ${weekNrForIdx(d, ws)} · ${MAAND[dt.getMonth()]}`
    if (dagen <= 14) return `${DAG[dt.getDay()]} ${dt.getDate()}`
    return dt.getDay() === 1 ? `${dt.getDate()}-${dt.getMonth() + 1}` : ''
  }

  const artikelRij = (o: GanttOpdracht, a: GanttArtikel) => {
    const st = a.stappen
    const los = a.open.length - st.length
    const l = o.levering ? dayOffsetForDateStr(o.levering, ws) : null
    const order = a.open[0].item.order
    return (
      <InfoHover key={a.orderId} positie="bottom-start" inhoud={() => { const i = info(a.orderId); return <ArtikelInhoud order={order} klant={i.klant} stappen={i.stappen} /> }}>
        <div className="og-r og-a">
          <div className="og-l">
            {order.artikelId
              ? <a className="og-art og-link" onClick={() => onArtikel(order.artikelId!)} title="Artikel openen">{a.artikel}</a>
              : <span className="og-art">{a.artikel}</span>}
            <span className="og-sub" data-laat={los > 0 || undefined}>{a.qty} st{los > 0 ? ` · ${los} niet ingepland` : ''}</span>
          </div>
          <div className="og-t">
            {st.map((s, i) => {
              const volgende = st[i + 1]
              const eind = s.tot ?? s.eind
              const soort = (x: string) => s.signalen.some((g) => g.soort === x) || undefined
              return (
                <Fragment key={s.job.id}>
                  {zichtbaar(s.start, s.eind) && (
                    <div className="og-stap" data-achter={soort('achter')} data-materiaal={soort('materiaal')} data-bezig={soort('bezig') ?? soort('uitloop')}
                      style={{ left: pct(Math.max(s.start, van)), width: `calc(${breed(s.start, s.eind)} - 1px)`, ['--mc' as string]: machineAccentColor(s.job.machineNaam, s.job.machineNaam) }}>
                      {s.job.machineNaam} · {urenKort(s.job.duurMin)}
                    </div>
                  )}
                  {s.tot != null && s.tot > s.eind && zichtbaar(s.eind, s.tot) && (
                    <div className="og-uitloop" style={{ left: pct(Math.max(s.eind, van)), width: breed(s.eind, s.tot) }} />
                  )}
                  {volgende && volgende.start > eind && zichtbaar(eind, volgende.start) && (
                    <div className="og-pijl" style={{ left: pct(Math.max(eind, van)), width: breed(eind, volgende.start) }} />
                  )}
                </Fragment>
              )
            })}
            {l != null && l > van && l < van + dagen && <div className="og-lev" style={{ left: pct(l) }} />}
          </div>
        </div>
      </InfoHover>
    )
  }

  return (
    <div className="og">
      <div className="og-r og-kop">
        <div className="og-l">Opdracht · artikel</div>
        <div className="og-t og-as">
          {dagIdx.map((d) => <div key={d} data-we={isWeekendOffset(ws, d) || undefined} data-vandaag={d === 0 || undefined}>{kop(d)}</div>)}
        </div>
      </div>
      <div className="og-body">
        <div className="og-kolommen">
          {dagIdx.map((d) => <div key={d} data-we={isWeekendOffset(ws, d) || undefined} data-vandaag={d === 0 || undefined} />)}
        </div>
        {opdrachten.map((o) => {
          const open = !dicht.has(o.projectId)
          const verwacht = o.eind != null ? eindDag(o.eind, ws) : null
          return (
            <Fragment key={o.projectId}>
              <div className="og-o" onClick={() => onKlap(o.projectId)}>
                <span className="og-pijltje">{open ? '▾' : '▸'}</span>
                <a className="og-id" onClick={(e) => { e.stopPropagation(); onOpen(o.projectId) }} title="Project openen">{o.projectId}</a>
                <b>{o.klant}</b>
                <span className="og-naam">{o.naam}</span>
                <span className="og-veld">afgesproken <b>{o.levering ? dagKort(o.levering) : '—'}</b></span>
                <span className="og-veld" data-laat={o.teLaat > 0 || undefined}>
                  verwacht <b>{verwacht ? dagKort(verwacht) : 'niet ingepland'}</b>{o.teLaat > 0 ? ` · ${o.teLaat} wd te laat` : ''}
                </span>
                <span className="og-veld og-pct">{o.pct}% gereed</span>
              </div>
              {open && o.artikelen.map((a) => artikelRij(o, a))}
            </Fragment>
          )
        })}
        {opdrachten.length === 0 && <div className="og-leeg">Geen open productiestappen.</div>}
      </div>
    </div>
  )
}
