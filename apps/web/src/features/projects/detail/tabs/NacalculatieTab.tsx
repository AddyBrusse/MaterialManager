import type { NacalculatieRegel } from '@stockmanager/shared'
import type { ProjectNacalculatie } from '../../../../api/nacalculatie'
import { Card } from '../components/Card'
import { eur, pct } from '../lib/format'
import { DEV_BREEDTE, devBalk, devKleurVar, kleurClass } from '../lib/nacalculatie'

const BRON =
  'Werkelijke uren komen alleen uit afgeronde tijdregistraties — lopend werk telt nog niet ' +
  'mee. Materiaal komt uit afgeboekte zaagbonnen.'

function DevBalk({ pctWaarde }: { pctWaarde: number | null }) {
  const b = devBalk(pctWaarde)
  return (
    <span className="pdv2-dev" style={{ display: 'inline-block', width: DEV_BREEDTE }}>
      {b && (
        <i style={{ left: b.left, width: b.width, background: devKleurVar(pctWaarde) }} />
      )}
    </span>
  )
}

/** Vier posten over alle orders heen opgeteld: materiaal, instellen, draaien, extern. */
function telPosten(nacalc: ProjectNacalculatie): NacalculatieRegel[] {
  const perPost = new Map<string, NacalculatieRegel>()
  for (const order of nacalc.orders) {
    for (const r of order.regels) {
      const bestaand = perPost.get(r.post)
      if (!bestaand) {
        perPost.set(r.post, { ...r })
        continue
      }
      bestaand.gecalculeerd += r.gecalculeerd
      bestaand.werkelijk += r.werkelijk
      bestaand.verschil += r.verschil
      bestaand.verschilPct =
        bestaand.gecalculeerd === 0
          ? null
          : (bestaand.verschil / bestaand.gecalculeerd) * 100
      bestaand.toelichting = `uit ${nacalc.orders.length} orders`
    }
  }
  return [...perPost.values()]
}

/**
 * §5.5. De kleurdrempels zitten in lib/nacalculatie.ts, zodat deze tabel, de
 * facetkleur, de tabbadge en de FactBox Geld niet los van elkaar gaan oordelen.
 */
export function NacalculatieTab({ nacalc }: { nacalc: ProjectNacalculatie | null }) {
  if (!nacalc || nacalc.orders.length === 0) {
    return (
      <Card titel="Nacalculatie">
        <div className="pdv2-empty">Nog niets gecalculeerd en niets geschreven.</div>
      </Card>
    )
  }

  const posten = telPosten(nacalc)
  const gemeten = posten.filter((r) => r.werkelijk > 0).length

  return (
    <Card
      titel="Nacalculatie"
      teller={`${gemeten} van ${posten.length} posten gemeten`}
      plat
      bron={BRON}
      acties={
        <span className={`pdv2-pill ${nacalc.gemeten ? 'ok' : 'warn'}`}>
          {nacalc.gemeten ? 'definitief' : 'voorlopig'}
        </span>
      }
    >
      <table className="pdv2-tbl">
        <thead>
          <tr>
            <th>Post</th>
            <th className="num" style={{ width: 110 }}>
              Gecalculeerd
            </th>
            <th className="num" style={{ width: 110 }}>
              Werkelijk
            </th>
            <th className="num" style={{ width: 100 }}>
              Verschil
            </th>
            <th className="num" style={{ width: 80 }}>
              %
            </th>
            <th style={{ width: DEV_BREEDTE + 20 }}>Afwijking</th>
          </tr>
        </thead>
        <tbody>
          {posten.map((r) => {
            const nietGemeten = r.werkelijk === 0
            const kleur = kleurClass(r.verschilPct)
            return (
              <tr key={r.post}>
                <td>
                  {r.label}
                  {r.toelichting && <span className="sub">· {r.toelichting}</span>}
                </td>
                <td className="num">{eur(r.gecalculeerd)}</td>
                <td className="num" style={nietGemeten ? { color: 'var(--text3)' } : undefined}>
                  {nietGemeten ? 'nog niet gemeten' : eur(r.werkelijk)}
                </td>
                <td className="num" style={kleur ? { color: `var(--${kleur})` } : undefined}>
                  {nietGemeten ? '—' : eur(r.verschil)}
                </td>
                <td className="num" style={kleur ? { color: `var(--${kleur})` } : undefined}>
                  {nietGemeten ? '—' : pct(r.verschilPct)}
                </td>
                <td>{nietGemeten ? null : <DevBalk pctWaarde={r.verschilPct} />}</td>
              </tr>
            )
          })}
          <tr className="totaal">
            <td>Kostprijs totaal</td>
            <td className="num">{eur(nacalc.gecalculeerdTotaal)}</td>
            <td className="num">{eur(nacalc.werkelijkTotaal)}</td>
            <td
              className="num"
              style={
                kleurClass(nacalc.verschilPct)
                  ? { color: `var(--${kleurClass(nacalc.verschilPct)})` }
                  : undefined
              }
            >
              {eur(nacalc.verschilTotaal)}
            </td>
            <td className="num">{pct(nacalc.verschilPct)}</td>
            <td>
              <DevBalk pctWaarde={nacalc.verschilPct} />
            </td>
          </tr>
        </tbody>
      </table>
    </Card>
  )
}
