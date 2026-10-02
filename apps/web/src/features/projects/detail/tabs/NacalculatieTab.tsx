import { useState } from 'react'
import type { ProjectNacalculatie } from '../../../../api/nacalculatie'
import { Card } from '../components/Card'
import { eur, pct } from '../lib/format'
import { DEV_BREEDTE, kleurClass } from '../lib/nacalculatie'
import { DevBalk, KostenCellen, TijdCellen, VerschilCellen } from './nacalculatie/cellen'
import { OrderRijen } from './nacalculatie/OrderRijen'
import { NOG_NIET, telPosten, tijdPerPost } from './nacalculatie/posten'

const BRON =
  'Werkelijke uren komen uit afgeronde klokregels — een klok die nog loopt telt pas mee als hij ' +
  'stopt. Materiaal komt uit afgeboekte zaagbonnen. Groen: goedkoper gemaakt dan berekend; rood: duurder.'

function KopRij({ eerste }: { eerste: string }) {
  return (
    <thead>
      <tr>
        <th rowSpan={2}>{eerste}</th>
        <th colSpan={2} className="pdv2-groep">Tijd</th>
        <th colSpan={2} className="pdv2-groep">Kosten</th>
        <th colSpan={3} className="pdv2-groep">Verschil</th>
      </tr>
      <tr>
        <th className="num" style={{ width: 80 }}>Gecalculeerd</th>
        <th className="num" style={{ width: 80 }}>Werkelijk</th>
        <th className="num" style={{ width: 90 }}>Gecalculeerd</th>
        <th className="num" style={{ width: 90 }}>Werkelijk</th>
        <th className="num" style={{ width: 84 }}>€</th>
        <th className="num" style={{ width: 62 }}>%</th>
        <th style={{ width: DEV_BREEDTE + 20 }}>Afwijking</th>
      </tr>
    </thead>
  )
}

/**
 * §5.5. Bovenaan de vier posten over het hele project; daaronder dezelfde
 * cijfers als boom: order → machine → klokregel (2026-10-01). Wat op twee
 * machines draaide, staat dan niet meer als één bedrag "draaien".
 */
export function NacalculatieTab({ nacalc }: { nacalc: ProjectNacalculatie | null }) {
  // Weinig orders: meteen open. Bij veel orders eerst het overzicht.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set((nacalc?.orders.length ?? 0) <= 3 ? nacalc?.orders.map((o) => `o:${o.orderId}`) : []),
  )
  if (!nacalc || nacalc.orders.length === 0) {
    return (
      <Card titel="Nacalculatie">
        <div className="pdv2-empty">Nog niets gecalculeerd en niets geschreven.</div>
      </Card>
    )
  }

  const wissel = (sleutel: string) =>
    setOpen((oud) => {
      const nieuw = new Set(oud)
      if (!nieuw.delete(sleutel)) nieuw.add(sleutel)
      return nieuw
    })
  const posten = telPosten(nacalc)
  const gemeten = posten.filter((r) => r.gemeten).length
  const totaalKleur = kleurClass(nacalc.verschilPct)

  return (
    <>
      <Card
        titel="Nacalculatie"
        teller={`${gemeten} van ${posten.length} posten gemeten`}
        plat
        acties={
          <span className={`pdv2-pill ${nacalc.gemeten ? 'ok' : 'warn'}`}>
            {nacalc.gemeten ? 'definitief' : 'voorlopig'}
          </span>
        }
      >
        <table className="pdv2-tbl">
          <KopRij eerste="Post" />
          <tbody>
            {posten.map((r) => (
              <tr key={r.post}>
                <td>
                  {r.label}
                  {!r.gemeten && <span className="sub">{NOG_NIET[r.post]}</span>}
                </td>
                <TijdCellen {...tijdPerPost(nacalc, r.post)} />
                <KostenCellen gecalc={r.gecalculeerd} werk={r.gemeten ? r.werkelijk : null} />
                <VerschilCellen verschil={r.gemeten ? r.verschil : null} pctWaarde={r.verschilPct} />
              </tr>
            ))}
            <tr className="totaal">
              <td>Kostprijs totaal</td>
              <td />
              <td />
              <td className="num">{eur(nacalc.gecalculeerdTotaal)}</td>
              <td className="num">{eur(nacalc.werkelijkTotaal)}</td>
              <td className="num" style={totaalKleur ? { color: `var(--${totaalKleur})` } : undefined}>
                {eur(nacalc.verschilTotaal)}
              </td>
              <td className="num" style={totaalKleur ? { color: `var(--${totaalKleur})` } : undefined}>
                {pct(nacalc.verschilPct)}
              </td>
              <td><DevBalk pctWaarde={nacalc.verschilPct} /></td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card titel="Per order en machine" teller="klik een klokregel om hem te openen in Tijdregistratie" plat bron={BRON}>
        <table className="pdv2-tbl pdv2-boom">
          <KopRij eerste="Order · machine · klokregel" />
          <tbody>
            {nacalc.orders.map((o) => (
              <OrderRijen key={o.orderId} o={o} isOpen={(s) => open.has(s)} onToggle={wissel} />
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}
