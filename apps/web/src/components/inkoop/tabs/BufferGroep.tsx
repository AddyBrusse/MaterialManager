import { groepVoor, type InkoopLeverancier, type InkoopOverzichtRegel } from '@stockmanager/shared'
import { aantalTekst, eur } from '../bestellingen/bestel-tekst'
import { NodigCel, VoorCel, ddmm } from '../overzicht/tekst'
import type { ConceptActies } from '../overzicht/useBestellen'

/**
 * Eén leverancier in de inkoopbuffer (2026-10-07): wat gekozen is en wacht op
 * bestellen, met het orderbedrag tegen de franco-grens eronder. Zo zie je of
 * wachten op meer regels nog kan.
 */
export function BufferGroep({ lev, naam, regels, concept, onBestel, onTerug, onOpen }: {
  lev: InkoopLeverancier | undefined; naam: string; regels: InkoopOverzichtRegel[]
  concept: ConceptActies; onBestel: (rs: InkoopOverzichtRegel[]) => void
  onTerug: (r: InkoopOverzichtRegel) => void; onOpen: (r: InkoopOverzichtRegel) => void
}) {
  const open = regels.filter((r) => !r.order)
  const g = groepVoor(open.map((r) => ({ totaal: r.leverancier?.totaal ?? null, plan: r.plan })), lev?.francoBedrag ?? null)
  const concepten = [...new Set(regels.filter((r) => r.order?.status === 'concept').map((r) => r.order!.id))]
  const teLaat = open.some((r) => r.plan.stand === 'te_laat_besteld')
  const pct = g.francoBedrag ? Math.min(100, (g.totaal / g.francoBedrag) * 100) : 0

  return (
    <section className="ib-kaart" data-vandaag={g.vandaag} aria-label={`Inkoopbuffer ${naam}`}>
      <div className="ib-buffer-kop">
        <h2>{naam}</h2>
        <span className="ib-sub" style={{ marginTop: 0 }}>{lev?.email ?? <span className="bs-waarschuw">geen e-mailadres</span>}</span>
        <span style={{ flex: 1 }} />
        {open.length > 0 && (g.vandaag
          ? <span className={`ib-chip ${teLaat ? 'dgr' : 'warn'}`}>{teLaat ? 'te laat — vandaag bestellen' : 'uiterlijk bestellen: vandaag'}</span>
          : <span className="ib-chip">{g.uiterlijk ? `wacht · uiterlijk bestellen ${ddmm(g.uiterlijk)}` : 'wacht · nog geen datum nodig'}</span>)}
      </div>
      {concepten.map((id) => (
        <div key={id} className="ib-concept">
          <span><b className="cell-mono">{id}</b> staat klaar als mail, maar is nog niet bevestigd als verstuurd.</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="st-btn ghost sm" onClick={() => concept.weg(id)}>Weggooien</button>
          <button type="button" className="st-btn sm" onClick={() => concept.opnieuw(id)}>Mail opnieuw</button>
          <button type="button" className="st-btn primary sm" onClick={() => concept.bevestig([id])}>Ja, verstuurd</button>
        </div>
      ))}
      <table className="st-tbl ib-t">
        <thead>
          <tr><th>Materiaal</th><th>Voor</th><th>Aantal</th><th>Prijs</th><th>Levertijd</th><th>Nodig voor productie</th><th>Uiterlijk bestellen</th><th /></tr>
        </thead>
        <tbody>
          {regels.map((r) => (
            <tr key={r.id} className="klik" data-stand={r.order ? undefined : r.plan.stand} onClick={() => onOpen(r)}>
              <td><div className="cell-strong">{r.materiaal}{r.exoot && <span className="ib-exoot">EXOOT</span>}</div>{r.order && <div className="ib-sub">op {r.order.id}</div>}</td>
              <td><VoorCel r={r} /></td>
              <td className="cell-mono" style={{ whiteSpace: 'nowrap' }}>{aantalTekst(r)}</td>
              <td><div className="cell-mono">{r.leverancier?.totaal != null ? eur(r.leverancier.totaal) : '—'}</div><div className="ib-sub">{r.leverancier?.uitleg}</div></td>
              <td>{r.leverancier?.levertijdDagen != null ? `${r.leverancier.levertijdDagen} werkdagen` : <span className="cell-muted">onbekend</span>}</td>
              <td><NodigCel r={r} /></td>
              <td>
                {r.plan.uiterlijk ? <div className="cell-mono">{ddmm(r.plan.uiterlijk)}</div> : <span className="cell-muted">wanneer het uitkomt</span>}
                {(r.plan.stand === 'te_laat_besteld' || r.plan.stand === 'nu_bestellen') && <div className={`ib-sub ${r.plan.stand === 'te_laat_besteld' ? 'dgr' : 'warn'}`}>{r.plan.tekst}</div>}
              </td>
              <td className="bs-acties" onClick={(e) => e.stopPropagation()}>
                {!r.order && <button type="button" className="st-btn ghost sm" title="Terug naar Open prijsaanvragen" onClick={() => onTerug(r)}>↩ terug</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ib-buffer-voet">
        <span className="ib-sub" style={{ marginTop: 0 }}>{open.length} regel{open.length === 1 ? '' : 's'}</span>
        <span>Orderbedrag <b className="cell-mono">{eur(g.totaal)}</b></span>
        {g.francoBedrag ? (
          <span className="ib-franco">
            <span className="ib-franco-balk" data-gehaald={g.nogTotFranco === 0}><div style={{ width: `${pct}%` }} /></span>
            {g.nogTotFranco === 0 ? `boven franco (${eur(g.francoBedrag)})` : `franco vanaf ${eur(g.francoBedrag)} — nog ${eur(g.nogTotFranco!)}`}
          </span>
        ) : <span className="ib-franco">geen franco-grens ingesteld · in te vullen bij Relaties → {naam}</span>}
        <span style={{ flex: 1 }} />
        {open.length > 0 && (
          <button type="button" className={`st-btn sm${g.vandaag || g.nogTotFranco === 0 ? ' primary' : ''}`} onClick={() => onBestel(open)}>Bestel regels ({open.length})</button>
        )}
      </div>
    </section>
  )
}
