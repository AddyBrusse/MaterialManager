import type { Project, ProjectVoortgang } from '@stockmanager/shared'
import { Card } from '../../components/Card'
import { getal } from '../../lib/format'
import { artikelVanRegel, TekeningCel, VoorbeeldCel } from '../OfferteRegelCellen'

/**
 * "Wat ligt klaar" bovenaan de Pakbonnen-tab: per regel hoeveel er besteld,
 * gemaakt en al op een pakbon is, en dus wat er nog mee kan. Voorbeeld en
 * tekening zoals op de Opdracht-tab, zodat je een regel herkent.
 */
export function KlaarKaart({ project, v }: { project: Project; v: ProjectVoortgang }) {
  return (
    <Card
      titel="Wat ligt klaar"
      teller={`${getal(v.klaar)} klaar · ${getal(v.teMaken)} nog te maken · ${getal(v.geleverd)} op een pakbon`}
      plat
    >
      <table className="pdv2-tbl">
        <thead>
          <tr>
            <th style={{ width: 88 }}>Voorbeeld</th>
            <th>Regel</th>
            <th style={{ width: 120 }}>Tekening</th>
            <th className="num" style={{ width: 80 }}>Besteld</th>
            <th className="num" style={{ width: 80 }}>Gemaakt</th>
            <th className="num" style={{ width: 100 }}>Op een pakbon</th>
            <th className="num" style={{ width: 80 }}>Klaar</th>
            <th className="num" style={{ width: 100 }}>Nog te maken</th>
          </tr>
        </thead>
        <tbody>
          {v.regels.map((r) => {
            const artikel = artikelVanRegel(project, r.offerteRegelId)
            return (
            <tr key={r.offerteRegelId} className={r.klaar === 0 && r.teMaken === 0 ? 'vervallen' : undefined}>
              <VoorbeeldCel artikel={artikel} />
              <td>
                {r.naam}
                {r.klaar > 0 && r.teMaken === 0 && <span className="sub">Helemaal klaar — komt vanzelf op een nieuwe pakbon</span>}
                {r.klaar > 0 && r.teMaken > 0 && <span className="sub">Deels klaar — zelf toevoegen voor een deellevering</span>}
                {r.klaar === 0 && r.teMaken === 0 && <span className="sub">Alles staat op een pakbon</span>}
              </td>
              <TekeningCel artikel={artikel} />
              <td className="num">{getal(r.besteld)} {r.eenheid}</td>
              <td className="num">{getal(r.gemaakt)}</td>
              <td className="num">{getal(r.geleverd)}</td>
              <td className="num"><strong>{getal(r.klaar)}</strong></td>
              <td className="num">{getal(r.teMaken)}</td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
