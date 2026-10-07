import type { InkoopOverzicht } from '@stockmanager/shared'
import { ddmm } from './tekst'

/** Vier tegels (2026-10-07): wat vandaag moet, wat rustig wacht, en of wat onderweg is op tijd komt. */
export function InkoopTegels({ ov }: { ov: InkoopOverzicht }) {
  const open = ov.regels.filter((r) => !r.order && (r.status === 'te_bestellen' || r.status === 'aangevraagd'))
  const nu = open.filter((r) => r.plan.stand === 'nu_bestellen' || r.plan.stand === 'te_laat_besteld')
  const teLaatBesteld = nu.filter((r) => r.plan.stand === 'te_laat_besteld').length
  const wacht = open.filter((r) => r.plan.stand === 'wacht')
  const eerst = wacht.map((r) => r.plan.uiterlijk).filter((d): d is string => !!d).sort()[0]
  const opTijd = ov.regels.filter((r) => r.plan.stand === 'onderweg_op_tijd').length
  const laat = ov.regels.filter((r) => r.plan.stand === 'komt_te_laat').length
  return (
    <section className="st-stats" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }} aria-label="Op schema">
      <Tegel lbl="Nu bestellen" val={nu.length} toon={teLaatBesteld ? 'dgr' : nu.length ? 'warn' : ''}
        foot={teLaatBesteld ? `${teLaatBesteld} al te laat besteld` : 'uiterlijke besteldatum is vandaag of voorbij'} />
      <Tegel lbl="Wacht op bundelen" val={wacht.length} foot={eerst ? `eerstvolgende uiterlijk ${ddmm(eerst)}` : 'niets met een datum'} />
      <Tegel lbl="Onderweg, op tijd" val={opTijd} toon={opTijd ? 'ok' : ''} foot="binnen vóór de productie begint" />
      <Tegel lbl="Komt te laat" val={laat} toon={laat ? 'dgr' : ''} foot="verwacht ná de geplande productie" />
    </section>
  )
}

function Tegel({ lbl, val, foot, toon = '' }: { lbl: string; val: number; foot: string; toon?: string }) {
  return (
    <div className={`st-stat ib-tegel ${toon}`}>
      <div className="st-stat-lbl">{lbl}</div>
      <div className="st-stat-val">{val}</div>
      <div className="st-stat-foot">{foot}</div>
    </div>
  )
}
