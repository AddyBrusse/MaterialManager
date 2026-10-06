import type { Ontvangst } from '@stockmanager/shared'
import { datum } from './bestel-tekst'

/** Wat er binnengekomen is (2026-10-06), nieuwste eerst, met de codes in de materiaallijst. */
export function OntvangenTab({ ontvangsten }: { ontvangsten: Ontvangst[] }) {
  if (ontvangsten.length === 0) return <div className="st-empty">Nog niets ontvangen. Bij een verstuurde inkooporder druk je per regel op Ontvangen.</div>
  return (
    <table className="st-tbl bs-tbl">
      <thead><tr><th>Datum</th><th>Regel</th><th>Materiaal</th><th>Leverancier</th><th className="cell-num">Stuks</th><th>In de voorraad als</th><th>Door</th></tr></thead>
      <tbody>
        {ontvangsten.map((o) => (
          <tr key={o.id}>
            <td className="cell-mono">{datum(o.createdAt)}</td>
            <td className="cell-mono">{o.referentie}</td>
            <td>
              <div className="cell-strong">{o.materiaal}</div>
              {o.notitie && <div className="bs-sub">{o.notitie}</div>}
            </td>
            <td>{o.leverancierNaam}</td>
            <td className="cell-num cell-mono">{o.stuks}</td>
            <td>
              <div className="cell-mono">{o.codes.join(', ')}</div>
              {o.gereserveerdVoor && <div className="bs-sub">gereserveerd voor {o.gereserveerdVoor}</div>}
            </td>
            <td>{o.door}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
