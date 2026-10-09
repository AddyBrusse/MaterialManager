import { Fragment } from 'react'
import { dateForOffset, isWeekendOffset, machineAccentColor, dayOffsetForDateStr } from '../../utils/planningQueueUtils'
import { urenKort } from '../planning-tabel/tabel-logica'
import type { GanttArtikel, GanttOpdracht } from './planning-logica'

interface Props {
  opdrachten: GanttOpdracht[]
  ws: Date
  van: number
  dagen: number
  dicht: Set<string>
  onKlap: (projectId: string) => void
  onOpen: (projectId: string) => void
}

const DAG = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

/**
 * De Gantt per opdracht (2026-10-08): één tijdlijn voor alle opdrachten, zodat
 * ze naast elkaar te lezen zijn. Opdracht = balk van eerste tot laatste stap
 * met wat al gereed is; uitgeklapt per artikel de stappen in de kleur van de
 * machine, met een lijn van stap naar stap. Rode lijn = leverdatum.
 */
export function OpdrachtGantt({ opdrachten, ws, van, dagen, dicht, onKlap, onOpen }: Props) {
  const pct = (x: number) => `${((x - van) / dagen) * 100}%`
  const breed = (a: number, b: number) => `${((Math.min(b, van + dagen) - Math.max(a, van)) / dagen) * 100}%`
  const zichtbaar = (a: number, b: number) => b > van && a < van + dagen
  const dagIdx = Array.from({ length: dagen }, (_, i) => van + i)
  const toonDag = dagen <= 31
  const lev = (o: GanttOpdracht) => (o.levering ? dayOffsetForDateStr(o.levering, ws) : null)

  const levLijn = (o: GanttOpdracht) => {
    const l = lev(o)
    return l != null && l > van && l < van + dagen ? <div className="og-lev" style={{ left: pct(l) }} title={`Levering ${o.levering}`} /> : null
  }

  const artikelRij = (o: GanttOpdracht, a: GanttArtikel) => {
    const st = a.stappen
    const los = a.open.length - st.length
    const geenMachine = a.open.some((j) => !st.some((s) => s.job.id === j.id))
    const laatste = st.length ? Math.max(...st.map((s) => s.tot ?? s.eind)) : null
    return (
      <div className="og-r og-a" key={a.orderId}>
        <div className="og-l"><span className="og-art">{a.artikel}</span><span className="og-sub" data-laat={geenMachine || undefined}>{a.qty} st{los > 0 ? ` · ${los} niet ingepland` : ''}</span></div>
        <div className="og-t">
          {st.map((s, i) => {
            const volgende = st[i + 1]
            const eind = s.tot ?? s.eind
            const soort = (x: string) => s.signalen.some((g) => g.soort === x) || undefined
            return (
              <Fragment key={s.job.id}>
                {zichtbaar(s.start, s.eind) && (
                  <div className="og-stap" data-achter={soort('achter')} data-materiaal={soort('materiaal')} data-bezig={soort('bezig') ?? soort('uitloop')}
                    style={{ left: pct(Math.max(s.start, van)), width: `calc(${breed(s.start, s.eind)} - 1px)`, ['--mc' as string]: machineAccentColor(s.job.machineNaam, s.job.machineNaam) }}
                    title={[`${s.job.naam} · ${s.job.machineNaam} · ${urenKort(s.job.duurMin)}`, ...s.signalen.map((g) => g.tekst)].join('\n')}>
                    {s.job.machineNaam}
                  </div>
                )}
                {s.tot != null && s.tot > s.eind && zichtbaar(s.eind, s.tot) && (
                  <div className="og-uitloop" style={{ left: pct(Math.max(s.eind, van)), width: breed(s.eind, s.tot) }}
                    title={s.signalen.find((g) => g.soort === 'uitloop')?.tekst} />
                )}
                {volgende && volgende.start > eind && zichtbaar(eind, volgende.start) && (
                  <div className="og-pijl" style={{ left: pct(Math.max(eind, van)), width: breed(eind, volgende.start) }} />
                )}
              </Fragment>
            )
          })}
          {laatste != null && laatste < van + dagen && laatste > van && <span className="og-lab" style={{ left: `calc(${pct(laatste)} + 6px)` }}>{a.artikel}</span>}
          {levLijn(o)}
        </div>
      </div>
    )
  }

  return (
    <div className="og">
      <div className="og-r og-kop">
        <div className="og-l">Opdracht · artikel</div>
        <div className="og-t og-as">
          {dagIdx.map((d) => {
            const dt = dateForOffset(ws, d)
            const maandag = dt.getDay() === 1
            return (
              <div key={d} data-we={isWeekendOffset(ws, d) || undefined} data-vandaag={d === 0 || undefined}>
                {toonDag ? `${DAG[dt.getDay()]} ${dt.getDate()}` : maandag ? `${dt.getDate()}-${dt.getMonth() + 1}` : ''}
              </div>
            )
          })}
        </div>
      </div>
      <div className="og-body">
        <div className="og-kolommen">
          {dagIdx.map((d) => <div key={d} data-we={isWeekendOffset(ws, d) || undefined} data-vandaag={d === 0 || undefined} />)}
        </div>
        {opdrachten.map((o) => {
          const open = !dicht.has(o.projectId)
          return (
            <Fragment key={o.projectId}>
              <div className="og-r og-o" onClick={() => onKlap(o.projectId)}>
                <div className="og-l">
                  <span className="og-pijltje">{open ? '▾' : '▸'}</span>
                  <a className="og-id" onClick={(e) => { e.stopPropagation(); onOpen(o.projectId) }}>{o.projectId}</a>
                  <span className="og-naam">{o.naam}</span>
                  <span className="og-sub og-rechts" data-laat={o.teLaat > 0 || undefined}>{o.levering ? `lev. ${DAG[new Date(o.levering + 'T00:00:00').getDay()]} ${o.levering.slice(8, 10)}-${o.levering.slice(5, 7)}` : 'geen leverdatum'}</span>
                </div>
                <div className="og-t">
                  {o.begin != null && o.eind != null && zichtbaar(o.begin, o.eind) && (
                    <div className="og-som" data-laat={o.teLaat > 0 || undefined} style={{ left: pct(Math.max(o.begin, van)), width: breed(o.begin, o.eind) }}>
                      <i style={{ width: `${o.pct}%` }} />
                    </div>
                  )}
                  {o.eind != null && o.eind < van + dagen && o.eind > van && (
                    <span className="og-lab og-lab-o" style={{ left: `calc(${pct(o.eind)} + 6px)` }}>
                      <b>{o.klant}</b> {o.pct}%{o.teLaat > 0 && <span className="og-laat"> · {o.teLaat} wd te laat</span>}
                    </span>
                  )}
                  {levLijn(o)}
                </div>
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
