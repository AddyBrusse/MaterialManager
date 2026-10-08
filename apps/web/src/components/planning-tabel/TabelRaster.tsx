import type { DragEvent } from 'react'
import type { QueueJob } from '../../utils/planningQueueUtils'
import { dagKort, urenKort } from './tabel-logica'
import { CelTooltip } from './CelTooltip'

/** Eén kolom: een machine, of `naam` null voor "Niet ingepland". */
export interface Kolom {
  naam: string | null
  titel: string
  sub: string
  jobs: QueueJob[]
}

export interface CelInfo {
  klant: string
  start: string | null
  eind: string | null
  uiterlijk: string | null
  laat: boolean
  /** Werkdagen te laat (0 = op tijd). */
  achter: number
}

export interface SleepDoel { kolom: string | null; voorId: string | null }

interface Props {
  kolommen: Kolom[]
  info: (j: QueueJob) => CelInfo
  zichtbaar: (j: QueueJob) => boolean
  gekozenId: string | null
  gerelateerdOrder: string | null
  sleep: QueueJob | null
  doel: SleepDoel | null
  dicht: (kolom: string | null) => boolean
  onKies: (j: QueueJob) => void
  onSleepStart: (e: DragEvent, j: QueueJob) => void
  onSleepOver: (e: DragEvent, d: SleepDoel) => void
  onLos: (e: DragEvent) => void
  onSleepEind: () => void
}

/**
 * Het raster (2026-10-08): kolom = machine, rij = plek in de wachtrij. Een
 * lege cel onder een kolom is "achteraan"; een cel met een stap is "hiervoor".
 * Een stap die niet bij het filter of project hoort, houdt zijn plek maar
 * toont niets — anders klopt het rijnummer niet meer.
 */
export function TabelRaster(p: Props) {
  const rijen = Math.max(6, ...p.kolommen.map((k) => k.jobs.length + 1))
  return (
    <div className="pt-box pt-raster" onDragEnd={p.onSleepEind}>
      <table>
        <colgroup>
          <col style={{ width: 30 }} />
          {p.kolommen.map((k) => <col key={k.naam ?? '—'} style={{ width: 168 }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="nr" />
            {p.kolommen.map((k) => (
              <th key={k.naam ?? '—'} className={k.naam ? undefined : 'bk'} title={k.titel}>
                {k.titel}<span className="ld">{k.jobs.length}</span>
                <span className="sr">{k.sub}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rijen }, (_, rij) => (
            <tr key={rij}>
              <td className="nr">{rij + 1}</td>
              {p.kolommen.map((k) => {
                const j = k.jobs[rij]
                const doelHier = p.doel && p.doel.kolom === k.naam && (j ? p.doel.voorId === j.id : p.doel.voorId == null && rij === k.jobs.length)
                const gedeeld = {
                  'data-dicht': p.sleep ? p.dicht(k.naam) : undefined,
                  'data-gat': doelHier || undefined,
                  // Boven de eigen cel: blijven waar hij is, dus "vóór de volgende".
                  onDragOver: (e: DragEvent) => p.onSleepOver(e, { kolom: k.naam, voorId: j ? (j.id === p.sleep?.id ? k.jobs[rij + 1]?.id ?? null : j.id) : null }),
                  onDrop: p.onLos,
                }
                if (!j) return <td key={k.naam ?? '—'} className={k.naam ? undefined : 'bk'} {...gedeeld} />
                return (
                  <Cel key={j.id} j={j} backlog={!k.naam} info={p.info(j)} verborgen={!p.zichtbaar(j)} sleeptIets={p.sleep != null}
                    gekozen={p.gekozenId === j.id} gerelateerd={p.gerelateerdOrder === j.orderId}
                    gesleept={p.sleep?.id === j.id} onKies={p.onKies} onSleepStart={p.onSleepStart} extra={gedeeld} />
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Cel({ j, backlog, info, verborgen, sleeptIets, gekozen, gerelateerd, gesleept, onKies, onSleepStart, extra }: {
  j: QueueJob; backlog: boolean; info: CelInfo; verborgen: boolean; sleeptIets: boolean; gekozen: boolean; gerelateerd: boolean; gesleept: boolean
  onKies: (j: QueueJob) => void; onSleepStart: (e: DragEvent, j: QueueJob) => void
  extra: Record<string, unknown>
}) {
  const stuks = j.item.order.qty
  return (
    <CelTooltip j={j} info={info} uit={verborgen || sleeptIets}>
    <td
      className={`job${backlog ? ' bk' : ''}`}
      draggable={!verborgen}
      data-sel={(!verborgen && gekozen) || undefined}
      data-rel={!verborgen && !gekozen && gerelateerd ? true : undefined}
      data-verborgen={verborgen || undefined}
      data-sleep={gesleept || undefined}
      onClick={() => !verborgen && onKies(j)}
      onDragStart={(e) => onSleepStart(e, j)}
      {...extra}
    >
      <div className="l1">{j.orderId}{j.tekening && <span className="tk">{j.tekening}</span>}</div>
      <div className="l2">{info.klant}</div>
      <div className="l3">{j.artikel} · {stuks} st · {j.naam}</div>
      <div className="l4">
        <span className="u">{urenKort(j.duurMin)}{j.isPlaceholder ? '?' : ''}</span>
        {j.wachtOpMateriaal && <span className="wm">wacht op materiaal</span>}
        <span className={info.laat ? 'laat' : undefined}>
          {backlog ? '—' : dagKort(info.start)}{!backlog && info.achter > 0 ? ` +${info.achter} wd` : ''}
        </span>
      </div>
    </td>
    </CelTooltip>
  )
}
