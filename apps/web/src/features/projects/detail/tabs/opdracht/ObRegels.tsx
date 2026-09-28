import type { OfferteRegel, Project, ProjectVoortgang } from '@stockmanager/shared'
import type { ZaagReservation } from '../../../../../api/reservations'
import { articlesApi } from '../../../../../api/articles'
import { Card } from '../../components/Card'
import { VoortgangBalk, voortgangTekst } from '../../components/VoortgangBalk'
import { eur, getal } from '../../lib/format'
import { materiaalVanRegel } from '../../lib/materiaal-stand'
import { ArtikelCel, TekeningCel, VoorbeeldCel } from '../OfferteRegelCellen'
import { MateriaalCel } from './MateriaalCel'

interface Props {
  project: Project
  voortgang: ProjectVoortgang
  reserveringen: ZaagReservation[]
  geblokkeerd: boolean
  onKiesMateriaal: (regel: OfferteRegel) => void
  onNaarReserveringen: () => void
  onNaarOrder: (orderId: string) => void
}

/**
 * De belangrijkste tabel van dit scherm: hier wordt de offerte werk. Per regel
 * wat er besteld is en voor hoeveel, welk materiaal eraan hangt, en welke
 * productieorder eruit ontstond.
 *
 * Voorbeeld en tekening staan er voor de werkvoorbereiding — hetzelfde als op
 * de Offertes-tab, zodat je een regel herkent zonder door te klikken.
 */
export function ObRegels({
  project: p,
  voortgang,
  reserveringen,
  geblokkeerd,
  onKiesMateriaal,
  onNaarReserveringen,
  onNaarOrder,
}: Props) {
  const ob = p.opdrachtbevestiging!
  const totaal = ob.regels.reduce((s, r) => s + r.totaal, 0)

  return (
    <Card titel="Regels en wat eruit ontstaat" plat>
      <table className="pdv2-tbl">
        <thead>
          <tr>
            <th style={{ width: 88 }}>Voorbeeld</th>
            <th>Artikel</th>
            <th style={{ width: 120 }}>Tekening</th>
            <th className="num" style={{ width: 64 }}>Besteld</th>
            <th className="num" style={{ width: 84 }}>Prijs/st</th>
            <th className="num" style={{ width: 92 }}>Totaal</th>
            <th style={{ width: 160 }}>Voortgang</th>
            <th style={{ width: 190 }}>Materiaal</th>
            <th style={{ width: 150 }}>Stappen</th>
          </tr>
        </thead>
        <tbody>
          {ob.regels.map((r) => {
            const artikel = r.artikelId ? articlesApi.get(r.artikelId) : null
            const order = p.productieOrders.find((o) => o.offerteRegelId === r.id) ?? null
            // De voortgang komt uit de gedeelde rekenkern, niet uit een eigen
            // telling hier: web en API moeten hetzelfde zeggen over "geleverd".
            const v = voortgang.regels.find((x) => x.offerteRegelId === r.id) ?? null
            return (
              <tr key={r.id}>
                <VoorbeeldCel artikel={artikel} />
                <ArtikelCel regel={r} projectId={p.id} />
                <TekeningCel artikel={artikel} />
                <td className="num">
                  {getal(r.qty)} {r.eenheid}
                </td>
                <td className="num">{eur(r.verkoopprijs)}</td>
                <td className="num">{eur(r.totaal)}</td>
                <td>
                  {v ? (
                    <>
                      <VoortgangBalk regel={v} breedte={140} />
                      <span className="sub">{voortgangTekst(v)}</span>
                    </>
                  ) : (
                    <span className="sub">geen voortgang bekend</span>
                  )}
                </td>
                <MateriaalCel
                  materiaal={materiaalVanRegel(r, ob.regels, reserveringen)}
                  geblokkeerd={geblokkeerd}
                  onKiezen={() => onKiesMateriaal(r)}
                  onNaarReserveringen={onNaarReserveringen}
                />
                <td>
                  {r.bewerkingen.map((b) => (
                    <span className="pdv2-chip" key={b}>
                      {b}
                    </span>
                  ))}
                  <span className="sub">
                    {order ? (
                      <button type="button" className="pdv2-link mono" onClick={() => onNaarOrder(order.id)}>
                        {order.id}
                      </button>
                    ) : (
                      'geen productieorder'
                    )}
                  </span>
                </td>
              </tr>
            )
          })}
          <tr className="totaal">
            <td colSpan={5}>Opdrachtwaarde excl. btw</td>
            <td className="num">{eur(totaal)}</td>
            <td colSpan={3} />
          </tr>
        </tbody>
      </table>
    </Card>
  )
}
