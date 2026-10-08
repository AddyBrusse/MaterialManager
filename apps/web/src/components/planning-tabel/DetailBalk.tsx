import { dayOffsetForDateStr, dateForOffset, type DerivedSlot, type QueueJob } from '../../utils/planningQueueUtils'
import { toDateStr } from '../../utils/planningUtils'
import { dagKort, isTeLaat, startDag, uiterlijkeStart, urenKort, werkdagenTeLaat } from './tabel-logica'

interface Props {
  jobs: QueueJob[]
  gekozenId: string | null
  klant: string
  schedule: Map<string, DerivedSlot>
  verplichtKlaar: Map<string, string>
  windowStart: Date
  onKies: (j: QueueJob) => void
}

/**
 * Onder de tabel (2026-10-08): alle stappen van de gekozen order, links als
 * lijst en rechts als gantt. Rood streepje = uiterlijk starten; rode
 * stippellijn = levering.
 */
export function DetailBalk({ jobs, gekozenId, klant, schedule, verplichtKlaar, windowStart, onKies }: Props) {
  if (jobs.length === 0) return <div className="pt-box pt-det"><div className="leeg">Kies een stap om de hele order te zien.</div></div>
  const o = jobs[0]
  const levering = o.deadline
  const slots = jobs.map((j) => schedule.get(j.id))
  const eind = Math.max(levering ? dayOffsetForDateStr(levering, windowStart) + 1 : 0, ...slots.map((s) => (s ? Math.ceil(s.finishOffsetDays) + 1 : 0)), 7)
  const begin = Math.min(0, ...slots.map((s) => (s ? Math.floor(s.startOffsetDays) : 0)))
  const dagen = Math.min(31, eind - begin)
  const pct = (d: number) => `${((d - begin) / dagen) * 100}%`
  const dag = (i: number) => dateForOffset(windowStart, begin + i)

  return (
    <div className="pt-box pt-det">
      <div className="lt">
        <div className="dh">
          <b>{o.orderId} · {o.artikel}{o.tekening ? ` · ${o.tekening}` : ''}</b>
          <div className="s">{klant} · {o.item.project.id} · {o.item.order.qty} st{levering ? ` · levering ${dagKort(levering)}` : ''}</div>
        </div>
        <table>
          <thead><tr><th>Stap</th><th>Machine</th><th>Tijd</th><th>Start</th><th>Achter</th></tr></thead>
          <tbody>
            {jobs.map((j, i) => {
              const start = j.item.stap.geplandDatum ? startDag(slots[i], windowStart) : null
              const u = uiterlijkeStart(j, verplichtKlaar, windowStart)
              const laat = isTeLaat(start, u)
              const achter = werkdagenTeLaat(start, u)
              return (
                <tr key={j.id} data-sel={j.id === gekozenId || undefined} onClick={() => onKies(j)}>
                  <td>{j.volgorde} · {j.naam}</td>
                  <td>{j.machineNaam && j.item.stap.geplandDatum ? j.machineNaam : <span style={{ color: 'var(--text-3)' }}>niet ingepland</span>}</td>
                  <td className="cell-mono">{urenKort(j.duurMin)}</td>
                  <td className="cell-mono" style={laat ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>{dagKort(start)}</td>
                  <td className="cell-mono" style={achter ? { color: 'var(--danger)', fontWeight: 600 } : { color: 'var(--text-3)' }}>{achter ? `+${achter} wd` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="pt-gantt">
        <div className="as">
          {Array.from({ length: dagen }, (_, i) => {
            const d = dag(i)
            return <div key={i} data-we={d.getDay() === 0 || d.getDay() === 6 || undefined}>{dagKort(toDateStr(d))}</div>
          })}
        </div>
        <div className="veld">
          <div className="kolommen">
            {Array.from({ length: dagen }, (_, i) => <div key={i} className="kol" data-we={dag(i).getDay() === 0 || dag(i).getDay() === 6 || undefined} />)}
          </div>
          {jobs.map((j, i) => {
            const s = slots[i]
            const u = uiterlijkeStart(j, verplichtKlaar, windowStart)
            return (
              <div key={j.id} className="ln">
                {s && (
                  <div className="bar" data-sel={j.id === gekozenId || undefined} data-laat={isTeLaat(startDag(s, windowStart), u) || undefined}
                    style={{ left: pct(s.startOffsetDays), width: `max(4px, calc(${((s.finishOffsetDays - s.startOffsetDays) / dagen) * 100}%))` }}
                    onClick={() => onKies(j)} title={`${balkTekst(j)} · ${urenKort(j.duurMin)}`}>
                    {balkTekst(j)}
                  </div>
                )}
                {u && <div className="tick" style={{ left: pct(dayOffsetForDateStr(u, windowStart)) }} title={`Uiterlijk starten: ${dagKort(u)}`} />}
              </div>
            )
          })}
          <div className="vandaag" style={{ left: pct(0) }} title="Vandaag" />
          {levering && <div className="lim" style={{ left: pct(dayOffsetForDateStr(levering, windowStart)) }} title={`Levering ${dagKort(levering)}`} />}
          <div className="leg"><span><i className="t" />uiterlijk starten</span><span><i className="l" />levering</span><span><i className="v" />vandaag</span></div>
        </div>
      </div>
    </div>
  )
}

/** "Draaien · DMG 450TC"; heet de stap zoals de machine, dan één keer. */
function balkTekst(j: QueueJob): string {
  return !j.machineNaam || j.naam.trim().toLowerCase() === j.machineNaam.trim().toLowerCase() ? (j.machineNaam || j.naam) : `${j.naam} · ${j.machineNaam}`
}
