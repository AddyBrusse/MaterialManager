import { useState } from 'react'
import type { NacalculatieRegel } from '@stockmanager/shared'
import type { ProjectNacalculatie } from '../../../../api/nacalculatie'
import { Card } from '../components/Card'
import { eur, pct } from '../lib/format'
import { DEV_BREEDTE, kleurClass } from '../lib/nacalculatie'
import { DevBalk, VerschilCellen } from './nacalculatie/cellen'
import { OrderRijen } from './nacalculatie/OrderRijen'

const BRON =
  'Werkelijke uren komen alleen uit afgeronde tijdregistraties — lopend werk telt nog niet ' +
  'mee. Materiaal komt uit afgeboekte zaagbonnen. Groen: goedkoper gemaakt dan berekend; rood: duurder.'

/** Zo zegt de kern dat er voor een post (nog) niets gemeten of afgeboekt is. */
const NIET_GEMETEN = new Set(['nog niet gemeten', 'nog niet afgeboekt', 'geen afwijking geregistreerd'])

type Post = NacalculatieRegel & { gemeten: boolean }

/** Vier posten over alle orders heen opgeteld: materiaal, instellen, draaien, extern. */
function telPosten(nacalc: ProjectNacalculatie): Post[] {
  const perPost = new Map<string, Post>()
  for (const order of nacalc.orders) {
    for (const r of order.regels) {
      const gemeten = !NIET_GEMETEN.has(r.toelichting)
      const bestaand = perPost.get(r.post)
      if (!bestaand) {
        perPost.set(r.post, { ...r, gemeten })
        continue
      }
      bestaand.gecalculeerd += r.gecalculeerd
      bestaand.werkelijk += r.werkelijk
      bestaand.verschil += r.verschil
      bestaand.gemeten ||= gemeten
      bestaand.verschilPct =
        bestaand.gecalculeerd === 0 ? null : (bestaand.verschil / bestaand.gecalculeerd) * 100
      bestaand.toelichting = `uit ${nacalc.orders.length} orders`
    }
  }
  return [...perPost.values()]
}

function KopRij({ eerste }: { eerste: string }) {
  return (
    <thead>
      <tr>
        <th>{eerste}</th>
        <th className="num" style={{ width: 120 }}>Tijd</th>
        <th className="num" style={{ width: 100 }}>Gecalculeerd</th>
        <th className="num" style={{ width: 100 }}>Werkelijk</th>
        <th className="num" style={{ width: 90 }}>Verschil</th>
        <th className="num" style={{ width: 70 }}>%</th>
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
                  {r.toelichting && <span className="sub">· {r.toelichting}</span>}
                </td>
                <td />
                <td className="num">{eur(r.gecalculeerd)}</td>
                <td className="num" style={r.gemeten ? undefined : { color: 'var(--text3)' }}>
                  {r.gemeten ? eur(r.werkelijk) : 'nog niet gemeten'}
                </td>
                <VerschilCellen verschil={r.gemeten ? r.verschil : null} pctWaarde={r.verschilPct} />
              </tr>
            ))}
            <tr className="totaal">
              <td>Kostprijs totaal</td>
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
