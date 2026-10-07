import type { InkoopOverzichtRegel } from '@stockmanager/shared'
import { aantalTekst } from '../bestellingen/bestel-tekst'
import { NodigCel, VoorCel, ddmm, ddmmjjjj, lokaleDag } from './tekst'

/**
 * Onderweg (2026-10-07): wat besteld is, wanneer het binnen moet zijn en of
 * dat vóór de productie is. Wat te laat komt staat bovenaan.
 */
export function OnderwegBlok({ regels, onOpen, onBinnen }: {
  regels: InkoopOverzichtRegel[]; onOpen: (r: InkoopOverzichtRegel) => void; onBinnen: (r: InkoopOverzichtRegel) => void
}) {
  const rij = [...regels].sort((a, b) => Number(b.plan.stand === 'komt_te_laat') - Number(a.plan.stand === 'komt_te_laat') || (a.plan.verwacht ?? '9') .localeCompare(b.plan.verwacht ?? '9'))
  return (
    <section aria-labelledby="ib-h-onder">
      <div className="ib-blok-kop"><h2 id="ib-h-onder">Onderweg</h2><span>{regels.length} regel{regels.length === 1 ? '' : 's'}</span></div>
      {regels.length === 0 ? <div className="ib-leeg">Er staat niets in bestelling.</div> : (
        <div className="ib-groep">
          <table className="st-tbl ib-tbl">
            <thead><tr><th>Materiaal</th><th>Voor</th><th>Inkooporder</th><th>Verwacht binnen</th><th>Nodig voor productie</th><th>Binnen</th><th><span className="sr-only">Actie</span></th></tr></thead>
            <tbody>
              {rij.map((r) => {
                const o = r.order!
                const marge = r.plan.verwacht && r.nodig.datum ? Math.round((+new Date(r.nodig.datum) - +new Date(r.plan.verwacht)) / 86_400_000) : null
                return (
                  <tr key={r.id} data-stand={r.plan.stand} onClick={() => onOpen(r)}>
                    <td><div className="cell-strong">{r.materiaal}{r.exoot && <span className="ib-exoot">EXOOT</span>}</div><div className="ib-sub">{aantalTekst(r)}</div></td>
                    <td><VoorCel r={r} /></td>
                    <td><div className="cell-mono">{o.id}</div><div className="ib-sub">{o.leverancierNaam}{o.verzondenOp ? ` · besteld ${ddmm(lokaleDag(o.verzondenOp))}` : ''}</div></td>
                    <td>
                      <div className="cell-mono">{r.plan.verwacht ? ddmmjjjj(r.plan.verwacht) : '—'}</div>
                      <div className="ib-sub">{!r.plan.verwacht ? 'levertijd onbekend' : o.verwachtAangepast ? 'door leverancier doorgegeven' : 'besteld + levertijd'}</div>
                    </td>
                    <td>
                      <NodigCel r={r} />
                      {r.plan.stand === 'komt_te_laat' && <div className="ib-sub dgr">{r.plan.tekst} — bel {o.leverancierNaam}</div>}
                      {r.plan.stand === 'onderweg_op_tijd' && marge != null && <div className="ib-sub ok">op tijd · {marge} {marge === 1 ? 'dag' : 'dagen'} marge</div>}
                    </td>
                    <td className="cell-mono">{o.ontvangenStuks} / {r.stuks}</td>
                    <td className="bs-acties" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="st-btn primary sm" onClick={() => onBinnen(r)}>Binnen</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** Binnen, afgelopen 14 dagen — dicht, want daar hoeft niemand nog iets mee. */
export function BinnenBlok({ regels, onOpen }: { regels: InkoopOverzichtRegel[]; onOpen: (r: InkoopOverzichtRegel) => void }) {
  return (
    <details className="ib-binnen">
      <summary>Binnen, afgelopen 14 dagen ({regels.length})</summary>
      {regels.length === 0 ? <div className="ib-leeg">Niets binnengekomen in de afgelopen 14 dagen.</div> : (
        <div className="ib-groep">
          <table className="st-tbl ib-tbl">
            <thead><tr><th>Binnen op</th><th>Materiaal</th><th>Voor</th><th>Inkooporder</th><th>Stand</th></tr></thead>
            <tbody>
              {regels.map((r) => (
                <tr key={r.id} onClick={() => onOpen(r)}>
                  <td className="cell-mono">{r.binnenOp ? ddmmjjjj(lokaleDag(r.binnenOp)) : '—'}</td>
                  <td><div className="cell-strong">{r.materiaal}{r.exoot && <span className="ib-exoot">EXOOT</span>}</div><div className="ib-sub">{aantalTekst(r)}</div></td>
                  <td><VoorCel r={r} /></td>
                  <td className="cell-mono">{r.order?.id ?? '—'}</td>
                  <td>{r.gereserveerd ? <span className="ib-chip ok">binnen, gereserveerd</span> : <span className="ib-chip ok">binnen, in de voorraad</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}
