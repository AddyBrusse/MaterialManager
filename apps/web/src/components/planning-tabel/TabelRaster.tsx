import type { DragEvent } from 'react'
import type { QueueJob } from '../../utils/planningQueueUtils'
import { dagKort, urenKort } from './tabel-logica'

/** Eén kolom: een machine, of `naam` null voor "Niet ingepland". */
export interface Kolom {
  naam: string | null
  titel: string
  sub: string
  jobs: QueueJob[]
}

export interface CelInfo { klant: string; start: string | null; laat: boolean }

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
                  <Cel key={j.id} j={j} backlog={!k.naam} info={p.info(j)} verborgen={!p.zichtbaar(j)}
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

function Cel({ j, backlog, info, verborgen, gekozen, gerelateerd, gesleept, onKies, onSleepStart, extra }: {
  j: QueueJob; backlog: boolean; info: CelInfo; verborgen: boolean; gekozen: boolean; gerelateerd: boolean; gesleept: boolean
  onKies: (j: QueueJob) => void; onSleepStart: (e: DragEvent, j: QueueJob) => void
  extra: Record<string, unknown>
}) {
  const stuks = j.item.order.qty
  return (
    <td
      className={`job${backlog ? ' bk' : ''}`}
      draggable={!verborgen}
      data-sel={(!verborgen && gekozen) || undefined}
      data-rel={!verborgen && !gekozen && gerelateerd ? true : undefined}
      data-verborgen={verborgen || undefined}
      data-sleep={gesleept || undefined}
      onClick={() => !verborgen && onKies(j)}
      onDragStart={(e) => onSleepStart(e, j)}
      title={`${j.orderId} · ${j.naam}${j.tekening ? ` · tek. ${j.tekening}` : ''}`}
      {...extra}
    >
      <div className="l1">{j.orderId}{j.tekening && <span className="tk">{j.tekening}</span>}</div>
      <div className="l2">{info.klant}</div>
      <div className="l3">{j.artikel} · {stuks} st · {j.naam}</div>
      <div className="l4">
        <span className="u">{urenKort(j.duurMin)}{j.isPlaceholder ? '?' : ''}</span>
        {j.wachtOpMateriaal && <span className="wm">wacht op materiaal</span>}
        <span className={info.laat ? 'laat' : undefined} title={info.laat ? 'Begint later dan uiterlijk nodig voor de levering' : undefined}>
          {backlog ? '—' : dagKort(info.start)}
        </span>
      </div>
    </td>
  )
}
