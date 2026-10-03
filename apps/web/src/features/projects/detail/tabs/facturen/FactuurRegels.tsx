import { IconTrash } from '@tabler/icons-react'
import { creditOpen, factuurVoortgang, type Factuur, type FactuurRegelKeuze, type Project } from '@stockmanager/shared'
import { eur, getal } from '../../lib/format'
import { CelGetal } from '../OfferteRegels'

interface Props {
  project: Project
  factuur: Factuur
  bewerkbaar: boolean
  /** De hele nieuwe lijst; `false` = geweigerd (het vak springt dan terug). */
  onWijzig: (regels: FactuurRegelKeuze[]) => boolean | void
}

/**
 * De regels van één factuur of credit. Bij een concept zijn aantal en prijs in
 * de tabel aan te passen, en kan er een regel bij of af. Erbij kan alleen wat
 * nog open is: bij een factuur wat verstuurd en niet gefactureerd is, bij een
 * credit wat er van de factuur nog niet gecrediteerd is.
 */
export function FactuurRegels({ project, factuur: f, bewerkbaar, onWijzig }: Props) {
  const credit = f.soort === 'credit'
  const huidig: FactuurRegelKeuze[] = f.regels.map((r) => ({ offerteRegelId: r.offerteRegelId, qty: r.qty, verkoopprijs: r.verkoopprijs }))
  const zet = (id: string, deel: Partial<FactuurRegelKeuze>) =>
    onWijzig(huidig.map((h) => (h.offerteRegelId === id ? { ...h, ...deel } : h)))

  // Wat er nog bij kan.
  const erbij: { id: string; naam: string; open: number; prijs: number }[] = []
  if (bewerkbaar && credit && f.crediteertFactuurId) {
    const bron = project.facturen.find((b) => b.id === f.crediteertFactuurId)
    const open = creditOpen(project, f.crediteertFactuurId, f.id)
    for (const r of bron?.regels ?? []) {
      const n = open.get(r.offerteRegelId) ?? 0
      if (n > 0 && !huidig.some((h) => h.offerteRegelId === r.offerteRegelId)) {
        erbij.push({ id: r.offerteRegelId, naam: r.naam, open: n, prijs: r.verkoopprijs })
      }
    }
  } else if (bewerkbaar) {
    for (const r of factuurVoortgang(project, f.id).regels) {
      if (r.teFactureren > 0 && !huidig.some((h) => h.offerteRegelId === r.offerteRegelId)) {
        erbij.push({ id: r.offerteRegelId, naam: r.naam, open: r.teFactureren, prijs: r.verkoopprijs })
      }
    }
  }
  const teken = credit ? -1 : 1

  return (
    <div className="pdv2-kind">
      <table className="pdv2-tbl">
        <thead>
          <tr>
            <th>Regel</th>
            <th className="num" style={{ width: 110 }}>Aantal</th>
            <th className="num" style={{ width: 110 }}>Prijs/st</th>
            <th className="num" style={{ width: 110 }}>Totaal</th>
            {bewerkbaar && <th style={{ width: 44 }} />}
          </tr>
        </thead>
        <tbody>
          {f.regels.length === 0 && (
            <tr><td colSpan={99} className="pdv2-empty">Nog geen regels. Voeg hieronder toe wat er gefactureerd wordt.</td></tr>
          )}
          {f.regels.map((r) => (
            <tr key={r.offerteRegelId}>
              <td>{r.naam}</td>
              <td className="num">
                {bewerkbaar ? <CelGetal waarde={r.qty} onKlaar={(n) => zet(r.offerteRegelId, { qty: n })} /> : getal(r.qty)} {r.eenheid}
              </td>
              <td className="num">
                {bewerkbaar
                  ? <CelGetal waarde={r.verkoopprijs} decimalen={2} onKlaar={(n) => zet(r.offerteRegelId, { verkoopprijs: n })} />
                  : eur(r.verkoopprijs)}
              </td>
              <td className="num">{eur(teken * r.totaal)}</td>
              {bewerkbaar && (
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="pdv2-btn s stil" title="Van de factuur halen"
                    aria-label={`${r.naam} van de factuur halen`}
                    onClick={() => onWijzig(huidig.filter((h) => h.offerteRegelId !== r.offerteRegelId))}>
                    <IconTrash size={12} />
                  </button>
                </td>
              )}
            </tr>
          ))}
          <tr className="totaal">
            <td colSpan={3}>Subtotaal · btw {f.btwPct}% · <strong>totaal incl. btw</strong></td>
            <td className="num">
              {eur(teken * f.subtotaal)} · {eur(teken * f.btwBedrag)} · <strong>{eur(teken * f.totaalInclBtw)}</strong>
            </td>
            {bewerkbaar && <td />}
          </tr>
        </tbody>
      </table>
      {erbij.length > 0 && (
        <div className="pdv2-kind-acties pdv2-pakbon-erbij">
          <span>Regel toevoegen:</span>
          {erbij.map((e) => (
            <button key={e.id} type="button" className="pdv2-btn s"
              onClick={() => onWijzig([...huidig, { offerteRegelId: e.id, qty: e.open, verkoopprijs: e.prijs }])}>
              + {e.naam} ({getal(e.open)} open)
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
