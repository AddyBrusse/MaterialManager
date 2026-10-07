import { dagenTussen, groepVoor, type InkoopLeverancier, type InkoopOverzichtRegel } from '@stockmanager/shared'
import { aantalTekst, bronTekst, eur } from '../bestellingen/bestel-tekst'
import { LeverancierKeuze, type PrijsActies } from './LeverancierKeuze'
import { NodigCel, VoorCel, ddmm } from './tekst'
import type { BestelBron } from '@stockmanager/shared'

export interface ConceptActies {
  bevestig: (orderIds: string[]) => void
  opnieuw: (orderId: string) => void
  weg: (orderId: string) => void
}

/**
 * Eén leverancier met zijn open regels (2026-10-07): het totaal tegen de
 * franco-grens, en de vroegste datum waarop er besteld moet zijn. Zo zie je of
 * wachten op meer regels nog kan.
 */
export function GroepKaart({ lev, naam, regels, vandaag, gekozen, zet, acties, concept, onOpen }: {
  lev: InkoopLeverancier | undefined; naam: string; regels: InkoopOverzichtRegel[]; vandaag: string
  gekozen: Set<string>; zet: (ids: string[], aan: boolean) => void
  acties: PrijsActies; concept: ConceptActies; onOpen: (r: InkoopOverzichtRegel) => void
}) {
  const open = regels.filter((r) => !r.order)
  const g = groepVoor(open.map((r) => ({ totaal: r.leverancier?.totaal ?? null, plan: r.plan })), lev?.francoBedrag ?? null)
  const concepten = [...new Set(regels.filter((r) => r.order?.status === 'concept').map((r) => r.order!.id))]
  const pct = g.francoBedrag ? Math.min(100, (g.totaal / g.francoBedrag) * 100) : 0
  const teLaat = open.some((r) => r.plan.stand === 'te_laat_besteld')
  const allesAan = open.length > 0 && open.every((r) => gekozen.has(r.id))

  return (
    <section className="ib-groep" data-vandaag={g.vandaag} aria-label={`Te bestellen bij ${naam}`}>
      <div className="ib-groep-kop">
        <span className="ib-groep-naam">{naam}</span>
        {open.length === 0 ? <span className="ib-franco">alles staat klaar op {concepten.join(', ')}</span> : <span className="ib-groep-totaal">{eur(g.totaal)}</span>}
        {open.length === 0 ? null : g.francoBedrag ? (
          <span className="ib-franco">
            <span className="ib-franco-balk" data-gehaald={g.nogTotFranco === 0}><div style={{ width: `${pct}%` }} /></span>
            {g.nogTotFranco === 0 ? `boven franco (${eur(g.francoBedrag)})` : `franco vanaf ${eur(g.francoBedrag)} — nog ${eur(g.nogTotFranco!)}`}
          </span>
        ) : <span className="ib-franco">geen franco-grens ingesteld</span>}
        {open.length > 0 && (
          g.vandaag
            ? <span className={`ib-chip ${teLaat ? 'dgr' : 'warn'}`}>{teLaat ? 'te laat — vandaag bestellen' : 'uiterlijk bestellen vandaag'}</span>
            : <span className="ib-chip">{g.uiterlijk ? `wacht · uiterlijk bestellen ${ddmm(g.uiterlijk)}` : 'wacht · nog geen datum nodig'}</span>
        )}
        <span style={{ flex: 1 }} />
        {open.length > 0 && (
          <button type="button" className="st-btn ghost sm" onClick={() => zet(open.map((r) => r.id), !allesAan)}>{allesAan ? 'Niets kiezen' : 'Alles kiezen'}</button>
        )}
      </div>
      {concepten.map((id) => (
        <div key={id} className="ib-concept">
          <span><b className="cell-mono">{id}</b> staat klaar als mail, maar is nog niet bevestigd als verstuurd. De regels hieronder staan er al op.</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="st-btn ghost sm" onClick={() => concept.weg(id)}>Weggooien</button>
          <button type="button" className="st-btn sm" onClick={() => concept.opnieuw(id)}>Mail opnieuw</button>
          <button type="button" className="st-btn primary sm" onClick={() => concept.bevestig([id])}>Ja, verstuurd</button>
        </div>
      ))}
      <table className="st-tbl ib-tbl">
        <thead>
          <tr>
            <th className="ib-kies"><span className="sr-only">Kies</span></th>
            <th>Materiaal</th><th>Voor</th><th>Aantal</th><th>Leverancier</th><th className="ta-r">Prijs</th>
            <th>Nodig voor productie</th><th>Bestel uiterlijk</th>
          </tr>
        </thead>
        <tbody>
          {regels.map((r) => (
            <tr key={r.id} data-stand={r.order ? undefined : r.plan.stand} onClick={() => onOpen(r)}>
              <td className="ib-kies" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" disabled={!!r.order} checked={gekozen.has(r.id)} aria-label={`Kies ${r.materiaal}`}
                  onChange={(e) => zet([r.id], e.currentTarget.checked)} />
              </td>
              <td>
                <div className="cell-strong">{r.materiaal}{r.exoot && <span className="ib-exoot">EXOOT</span>}</div>
                <div className="ib-sub">{bronTekst(r.bron as BestelBron)}</div>
              </td>
              <td><VoorCel r={r} /></td>
              <td className="cell-mono">{aantalTekst(r)}</td>
              <td onClick={(e) => e.stopPropagation()}>
                {r.order ? <span>{r.leverancier?.naam} <span className="ib-sub">op {r.order.id}</span></span> : <LeverancierKeuze r={r} acties={acties} />}
              </td>
              <td className="ta-r cell-mono">{r.leverancier?.totaal != null ? eur(r.leverancier.totaal) : '—'}</td>
              <td><NodigCel r={r} /></td>
              <td><UiterlijkCel r={r} vandaag={vandaag} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function UiterlijkCel({ r, vandaag }: { r: InkoopOverzichtRegel; vandaag: string }) {
  const lt = r.leverancier?.levertijdDagen
  const sub = <div className="ib-sub">{lt != null ? `levertijd ${lt} werkdagen` : 'levertijd onbekend'}</div>
  if (!r.plan.uiterlijk) return <><span className="cell-muted">wanneer het uitkomt</span>{sub}</>
  const n = dagenTussen(r.plan.uiterlijk, vandaag)
  const toe = r.plan.stand === 'te_laat_besteld' ? <span className="ib-sub dgr"> · {n} {n === 1 ? 'dag' : 'dagen'} te laat</span>
    : r.plan.stand === 'nu_bestellen' ? <span className="ib-sub warn"> · vandaag</span> : null
  return <><div><span className="cell-mono">{ddmm(r.plan.uiterlijk)}</span>{toe}</div>{sub}</>
}
