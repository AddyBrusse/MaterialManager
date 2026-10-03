import { isVervallen, openstaandBedrag, type Project, type ProjectVoortgang } from '@stockmanager/shared'
import { Card } from '../../components/Card'
import { eur, getal } from '../../lib/format'

/**
 * Bovenaan de Facturen-tab: per regel wat de klant heeft (verstuurd), wat al
 * gefactureerd en gecrediteerd is, en wat er dus nog te factureren valt.
 */
export function TeFacturerenKaart({ project: p, v }: { project: Project; v: ProjectVoortgang }) {
  const open = openstaandBedrag(p)
  const vervallen = p.facturen.filter((f) => isVervallen(f)).length
  const teller = [
    `${eur(v.teFacturerenBedrag)} te factureren`,
    `${eur(open)} openstaand`,
    vervallen > 0 ? `${vervallen} vervallen` : null,
  ].filter(Boolean).join(' · ')

  return (
    <Card titel="Te factureren" teller={teller} plat>
      <table className="pdv2-tbl">
        <thead>
          <tr>
            <th>Regel</th>
            <th className="num" style={{ width: 80 }}>Besteld</th>
            <th className="num" style={{ width: 90 }}>Verstuurd</th>
            <th className="num" style={{ width: 100 }}>Gefactureerd</th>
            <th className="num" style={{ width: 100 }}>Gecrediteerd</th>
            <th className="num" style={{ width: 110 }}>Te factureren</th>
            <th className="num" style={{ width: 110 }}>Bedrag</th>
          </tr>
        </thead>
        <tbody>
          {v.regels.map((r) => (
            <tr key={r.offerteRegelId} className={r.teFactureren === 0 && r.gefactureerd >= r.besteld ? 'vervallen' : undefined}>
              <td>
                {r.naam}
                {r.teFactureren === 0 && r.verstuurd < r.besteld && (
                  <span className="sub">Nog niet alles verstuurd — {getal(r.besteld - r.verstuurd)} {r.eenheid} komt nog</span>
                )}
              </td>
              <td className="num">{getal(r.besteld)} {r.eenheid}</td>
              <td className="num">{getal(r.verstuurd)}</td>
              <td className="num">{getal(r.gefactureerd)}</td>
              <td className="num">{r.gecrediteerd > 0 ? getal(r.gecrediteerd) : '—'}</td>
              <td className="num"><strong>{getal(r.teFactureren)}</strong></td>
              <td className="num">{r.teFactureren > 0 ? eur(r.teFacturerenBedrag) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
