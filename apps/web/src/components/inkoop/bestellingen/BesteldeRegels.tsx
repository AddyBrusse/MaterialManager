import type { BestelRegel } from '@stockmanager/shared'
import { ExootLabel } from '../ExootLabel'
import { BestelStatusBadge, aantalTekst, eur } from './bestel-tekst'

/** Wat al besteld of binnen is, ingeklapt onder de bestellijst (2026-10-06). */
export function BesteldeRegels({ regels }: { regels: BestelRegel[] }) {
  if (regels.length === 0) return null
  return (
    <details className="bs-besteld">
      <summary>Besteld of ontvangen ({regels.length})</summary>
      <table className="st-tbl bs-tbl">
        <tbody>
          {regels.map((r) => (
            <tr key={r.id}>
              <td><span className="cell-strong">{r.materiaal}</span> {r.exoot && <ExootLabel compact />}</td>
              <td className="cell-mono">{aantalTekst(r)}</td>
              <td>{r.projectId ?? <span className="cell-muted">voorraad</span>}</td>
              <td>{r.keuze ? `${r.keuze.leverancierNaam} · ${eur(r.keuze.totaal)}` : '—'}</td>
              <td className="cell-mono">{r.inkooporder?.id ?? '—'}</td>
              <td className="cell-mono">{r.ontvangenStuks} / {r.stuks} binnen</td>
              <td><BestelStatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
