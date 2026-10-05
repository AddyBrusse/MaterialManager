import type { AandachtVM, TodoVM } from '../../types'
import { Card } from '../../components/Card'

/**
 * Aandachtspunten en openstaande todo's in één lijst: ze beantwoorden dezelfde
 * vraag — wat moet ik met dit project. Aandacht wordt afgeleid
 * (`lib/aandacht.ts`), een todo is door iemand gemaakt; een todo "materiaal
 * kiezen" staat al als aandachtspunt en komt er niet twee keer op.
 *
 * Stond tot 2026-10-05 op een eigen tab. Leeg zegt hij dát er niets is: een
 * kaart die verdwijnt laat je twijfelen of hij wel geladen is.
 */
export function WatMoetErGebeuren({ aandacht, todos }: { aandacht: AandachtVM[]; todos: TodoVM[] }) {
  const eigen = todos.filter((t) => !t.materiaal)
  const teller = [
    aandacht.length === 0 ? null : `${aandacht.length} aandachtspunt${aandacht.length === 1 ? '' : 'en'}`,
    eigen.length === 0 ? null : `${eigen.length} todo${eigen.length === 1 ? '' : "'s"}`,
  ].filter(Boolean).join(' · ')

  return (
    <Card titel="Wat moet er gebeuren" teller={teller || undefined} plat>
      {aandacht.length === 0 && eigen.length === 0 && (
        <div className="pdv2-empty">Niets dat aandacht vraagt, en geen openstaande todo's.</div>
      )}
      {aandacht.map((a, i) => (
        <div className="pdv2-aandacht" key={`${a.titel}-${i}`}>
          <i className={`pdv2-stip ${a.ernst}`} aria-hidden />
          <div>
            <div className="pdv2-aandacht-t">{a.titel}</div>
            <div className="pdv2-aandacht-s">{a.toelichting}</div>
          </div>
        </div>
      ))}
      {eigen.map((t) => (
        <div className="pdv2-aandacht" key={t.id}>
          {/* Leeg en niet aanklikbaar: afvinken gebeurt op de todopagina, waar de herkomst erbij staat. */}
          <i className="pdv2-vinkje" aria-hidden />
          <div>
            <div className="pdv2-aandacht-t">{t.titel}</div>
            <div className="pdv2-aandacht-s">todo · {t.herkomst}</div>
          </div>
        </div>
      ))}
    </Card>
  )
}
