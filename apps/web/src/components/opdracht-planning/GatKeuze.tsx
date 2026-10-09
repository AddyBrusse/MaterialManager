import { notifications } from '@mantine/notifications'
import type { AutoUitkomst } from '../../utils/auto-planning'
import { dateForOffset, type QueueJob } from '../../utils/planningQueueUtils'
import { toDateStr } from '../../utils/planningUtils'
import { dagKort, urenKort } from '../planning-tabel/tabel-logica'

/** Een gesleepte stap die moet wachten, en wat er in die tijd op zijn machine gaat. */
export interface GatInfo {
  stap: QueueJob
  machine: string
  start: number
  eind: number
  /** Vanaf wanneer de machine wacht (alleen als hij laat wachten). */
  wachtVan: number | null
  gevuld: { job: QueueJob; start: number; eind: number }[]
}

const EPS = 1e-6

/**
 * Werk met minder voorrang dat vóór de gesleepte stap op zijn machine komt:
 * dat vult de tijd waarop hij wacht (op zijn vorige stap of op materiaal).
 * Met `ids` dezelfde stappen opnieuw opzoeken in een andere uitkomst.
 */
export function gevuldGat(jobs: QueueJob[], uit: AutoUitkomst, id: string, ids?: string[]): GatInfo | null {
  const p = uit.plaatsen.get(id)
  const stap = jobs.find((j) => j.id === id)
  if (!p?.machine || p.start == null || p.eind == null || !stap) return null
  const pStart = p.start
  const gevuld = [...uit.plaatsen.values()]
    .filter((q) => q.stapId !== id && q.machine === p.machine && q.start != null && q.eind != null
      && (ids ? ids.includes(q.stapId) : q.prioriteit > p.prioriteit && q.start! < pStart - EPS))
    .map((q) => ({ job: jobs.find((j) => j.id === q.stapId)!, start: q.start!, eind: q.eind! }))
    .filter((g) => g.job)
  if (!ids && gevuld.length === 0) return null
  return { stap, machine: p.machine, start: p.start, eind: p.eind, wachtVan: p.wachtVan ?? null, gevuld }
}

/** Een fractionele dag als "di 13-10 12:30" (werkdag 7:00–16:00, zoals de planning rekent). */
export function moment(x: number, ws: Date, eind = false): string {
  let dag = Math.floor(x + EPS)
  let f = x - dag
  if (eind && f < EPS) { dag -= 1; f = 1 }
  const min = Math.round((7 + f * 9) * 60)
  return `${dagKort(toDateStr(dateForOffset(ws, dag)))} ${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
}

export function toonGatKeuze(p: { gat: GatInfo; wacht: GatInfo | null; ws: Date; onVullen: () => void; onWachten: () => void }): void {
  const id = 'planning-gat'
  const kies = (f: () => void) => () => { notifications.hide(id); f() }
  const { gat, wacht, ws } = p
  const s = gat.stap
  notifications.show({
    id, autoClose: false, withCloseButton: true, color: 'orange',
    title: `${gat.machine}: ${s.orderId} stap ${s.volgorde} (${s.naam}) moet wachten`,
    message: (
      <div style={{ fontSize: 12, lineHeight: 1.5 }}>
        <div>
          {wacht?.wachtVan != null
            ? <>De machine staat vrij van <b>{moment(wacht.wachtVan, ws)}</b> tot <b>{moment(gat.start, ws)}</b>.</>
            : <>Deze stap kan pas om <b>{moment(gat.start, ws)}</b> beginnen.</>}
          {' '}Hij loopt tot {moment(gat.eind, ws, true)} — bij beide keuzes hetzelfde.
        </div>
        <div style={{ marginTop: 6 }}><b>Vullen</b>: dit werk gaat in die tijd:</div>
        <ul style={{ margin: '2px 0', paddingLeft: 16 }}>
          {gat.gevuld.map((g) => {
            const w = wacht?.gevuld.find((x) => x.job.id === g.job.id)
            return (
              <li key={g.job.id}>
                {g.job.orderId} · {g.job.naam} ({urenKort(g.job.duurMin)}): klaar {moment(g.eind, ws, true)}
                {w ? <span style={{ color: 'var(--text-3)' }}> — anders pas {moment(w.eind, ws, true)}</span> : null}
              </li>
            )
          })}
        </ul>
        <div><b>Machine laten wachten</b>: de machine doet niets tot deze stap begint; dit blijft zo bij latere herberekeningen, tot de stap gestart is.</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button className="st-btn sm primary" onClick={kies(p.onVullen)}>Vullen</button>
          <button className="st-btn sm" onClick={kies(p.onWachten)}>Machine laten wachten</button>
        </div>
      </div>
    ),
  })
}
