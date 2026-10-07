import type { InkoopOverzichtRegel, InkoopStand } from '@stockmanager/shared'

/** Teksten en kleuren van de inkoopstand (2026-10-07): één plek voor pagina, paneel en projectkaart. */

export const ddmm = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}-${d.slice(5, 7)}` : '—')
export const ddmmjjjj = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : '—')
/** Een ISO-tijdstip als lokale datum 'YYYY-MM-DD'. */
export const lokaleDag = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const STAND_KLEUR: Record<InkoopStand, 'dgr' | 'warn' | 'ok' | 'info' | ''> = {
  te_laat_besteld: 'dgr',
  nu_bestellen: 'warn',
  wacht: '',
  komt_te_laat: 'dgr',
  onderweg_op_tijd: 'info',
  binnen: 'ok',
}

export function StandChip({ r }: { r: Pick<InkoopOverzichtRegel, 'plan' | 'gereserveerd' | 'exoot'> }) {
  const tekst = r.plan.stand === 'binnen' && r.gereserveerd ? 'binnen, gereserveerd' : r.plan.tekst
  return <span className={`ib-chip ${STAND_KLEUR[r.plan.stand]}`}>{tekst}</span>
}

/** "13-10-2026" met eronder waarvoor: machine of levering. */
export function NodigCel({ r }: { r: Pick<InkoopOverzichtRegel, 'nodig'> }) {
  if (!r.nodig.datum) return <span className="cell-muted">geen datum</span>
  return (
    <>
      <div className="cell-mono">{ddmmjjjj(r.nodig.datum)}</div>
      <div className="ib-sub">{r.nodig.bron === 'productie' ? `${r.nodig.machine ?? 'productie'} gepland` : 'levering min 2 werkdagen'}</div>
    </>
  )
}

export function VoorCel({ r }: { r: Pick<InkoopOverzichtRegel, 'projectId' | 'klantNaam'> }) {
  if (!r.projectId) return <span className="cell-muted">voorraad</span>
  return (
    <>
      <div className="cell-mono">{r.projectId}</div>
      {r.klantNaam && <div className="ib-sub">{r.klantNaam}</div>}
    </>
  )
}
