import type { GeldVM } from '../../types'
import { Card } from '../../components/Card'
import { eur, pct } from '../../lib/format'
import { kleurClass } from '../../lib/nacalculatie'

/**
 * Het geld van dit project (stond tot 2026-10-05 op de tab Financieel).
 *
 * Bovenaan wat de klant betaalt: verkoopwaarde, wat er gefactureerd is en wat
 * nog openstaat. Daaronder kostprijs en marge, calculatie naast werkelijk —
 * met erbij over welke orders dat gaat als dat niet het hele project is.
 * Kleuren volgen dezelfde drempel als de Nacalculatie-tab: duurder rood.
 */
export function GeldKaart({ geld }: { geld: GeldVM }) {
  const kleur = kleurClass(geld.verschilPct)
  const stijl = kleur ? { color: `var(--${kleur})` } : undefined

  return (
    <Card titel="Geld">
      <div className="pdv2-kv">
        <span>Verkoopwaarde</span>
        <span className="mono">{eur(geld.offertetotaal)}</span>
      </div>
      <div className="pdv2-kv">
        <span>Gefactureerd incl. btw</span>
        <span className="mono">{geld.gefactureerd === null ? 'nog niets verstuurd' : eur(geld.gefactureerd)}</span>
      </div>
      {geld.gefactureerd !== null && (
        <div className="pdv2-kv">
          <span>Openstaand</span>
          <span className="mono" style={geld.openstaand === 0 ? { color: 'var(--ok)' } : undefined}>
            {geld.openstaand === 0 ? 'niets — betaald' : eur(geld.openstaand)}
          </span>
        </div>
      )}

      <div className="pdv2-geld-scheid" />
      {geld.kostprijsCalculatie === null ? (
        <div className="pdv2-geld-basis">Nog geen nacalculatie: geen kostprijs of marge.</div>
      ) : (
        <>
          {geld.basis && <div className="pdv2-geld-basis">{geld.basis}</div>}
          <table className="pdv2-geld-tbl">
            <thead>
              <tr>
                <th />
                <th className="num">Calculatie</th>
                <th className="num">Werkelijk</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Kostprijs</td>
                <td className="num mono">{eur(geld.kostprijsCalculatie)}</td>
                <td className="num mono" style={stijl}>{eur(geld.kostprijsWerkelijk)}</td>
              </tr>
              <tr>
                <td>Marge</td>
                <td className="num mono">{pct(geld.margeCalculatiePct)}</td>
                <td className="num mono" style={stijl}>{pct(geld.margeWerkelijkPct)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </Card>
  )
}
