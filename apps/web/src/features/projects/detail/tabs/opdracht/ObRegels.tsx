import type { OfferteRegel, OpdrachtWijziging, Project, ProjectVoortgang } from '@stockmanager/shared'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { ZaagReservation } from '../../../../../api/reservations'
import { articlesApi } from '../../../../../api/articles'
import { Card } from '../../components/Card'
import { VoortgangBalk, voortgangTekst } from '../../components/VoortgangBalk'
import { eur, getal } from '../../lib/format'
import { materiaalVanRegel } from '../../lib/materiaal-stand'
import { ArtikelCel, TekeningCel, VoorbeeldCel } from '../OfferteRegelCellen'
import { CelGetal } from '../OfferteRegels'
import { MateriaalCel } from './MateriaalCel'

interface Props {
  project: Project
  voortgang: ProjectVoortgang
  reserveringen: ZaagReservation[]
  geblokkeerd: boolean
  onKiesMateriaal: (regel: OfferteRegel) => void
  onNaarReserveringen: () => void
  onNaarOrder: (orderId: string) => void
  /** Aanpassen na acceptatie — de tab vraagt eerst om bevestiging als dat nodig is. */
  onWijzig: (w: OpdrachtWijziging) => void
  onToevoegen: () => void
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
  onWijzig,
  onToevoegen,
}: Props) {
  const ob = p.opdrachtbevestiging!
  const totaal = ob.regels.reduce((s, r) => s + r.totaal, 0)

  return (
    <Card
      titel="Regels en wat eruit ontstaat"
      plat
      acties={
        <button type="button" className="pdv2-btn s" disabled={geblokkeerd} onClick={onToevoegen}>
          <IconPlus size={12} />
          Regel toevoegen
        </button>
      }
    >
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
            <th style={{ width: 34 }} />
          </tr>
        </thead>
        <tbody>
          {ob.regels.map((r) => {
            const artikel = r.artikelId ? articlesApi.get(r.artikelId) : null
            // Meer dan één kan: bij een hoger aantal na gereedmelden komt er een
            // tweede order bij, en een gestopte blijft staan.
            const orders = p.productieOrders.filter((o) => o.offerteRegelId === r.id)
            // De voortgang komt uit de gedeelde rekenkern, niet uit een eigen
            // telling hier: web en API moeten hetzelfde zeggen over "geleverd".
            const v = voortgang.regels.find((x) => x.offerteRegelId === r.id) ?? null
            return (
              <tr key={r.id}>
                <VoorbeeldCel artikel={artikel} />
                <ArtikelCel regel={r} projectId={p.id} />
                <TekeningCel artikel={artikel} />
                {/* Altijd aan te passen, ook als de productie loopt (2026-09-28).
                    De offerte blijft zoals hij was; alleen de opdracht verandert. */}
                <td className="num">
                  {geblokkeerd ? (
                    <>
                      {getal(r.qty)} {r.eenheid}
                    </>
                  ) : (
                    <CelGetal waarde={r.qty} onKlaar={(qty) => qty > 0 && onWijzig({ soort: 'aantal', regelId: r.id, qty })} />
                  )}
                </td>
                <td className="num">
                  {geblokkeerd ? (
                    eur(r.verkoopprijs)
                  ) : (
                    <CelGetal
                      waarde={r.verkoopprijs}
                      decimalen={2}
                      onKlaar={(verkoopprijs) => onWijzig({ soort: 'prijs', regelId: r.id, verkoopprijs })}
                    />
                  )}
                </td>
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
                    {orders.length === 0
                      ? 'geen productieorder'
                      : orders.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            className="pdv2-link mono"
                            style={{ display: 'block' }}
                            onClick={() => onNaarOrder(o.id)}
                          >
                            {o.id}
                            {o.status === 'gestopt' ? ' · gestopt' : o.status === 'voorbereiding' ? ' · voorbereiding' : ''}
                          </button>
                        ))}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="pdv2-btn s stil"
                    disabled={geblokkeerd}
                    title={`"${r.naam}" van de opdracht halen`}
                    aria-label={`"${r.naam}" van de opdracht halen`}
                    onClick={() => onWijzig({ soort: 'weg', regelId: r.id })}
                  >
                    <IconTrash size={12} />
                  </button>
                </td>
              </tr>
            )
          })}
          <tr className="totaal">
            <td colSpan={5}>Opdrachtwaarde excl. btw</td>
            <td className="num">{eur(totaal)}</td>
            <td colSpan={4} />
          </tr>
        </tbody>
      </table>
    </Card>
  )
}
