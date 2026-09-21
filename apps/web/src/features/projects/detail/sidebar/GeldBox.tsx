import type { GeldVM } from '../types'
import { Card } from '../components/Card'
import { eur, pct } from '../lib/format'
import { kleurClass } from '../lib/nacalculatie'

/** FactBox *Geld* (§6.2) — waarden kleuren volgens dezelfde drempels als §5.5. */
export function GeldBox({ geld }: { geld: GeldVM }) {
  const rijen: { label: string; waarde: string; kleur?: string }[] = [
    { label: 'Offertetotaal', waarde: eur(geld.offertetotaal) },
    { label: 'Kostprijs calculatie', waarde: eur(geld.kostprijsCalculatie) },
    { label: 'Kostprijs werkelijk', waarde: eur(geld.kostprijsWerkelijk) },
    { label: 'Verschil', waarde: eur(geld.verschil), kleur: kleurClass(geld.verschilPct) },
    { label: 'Marge werkelijk', waarde: pct(geld.margeWerkelijkPct) },
    { label: 'Marge calculatie', waarde: pct(geld.margeCalculatiePct) },
  ]

  return (
    <Card titel="Geld">
      {rijen.map((r) => (
        <div className="pdv2-kv" key={r.label}>
          <span>{r.label}</span>
          <span className={`mono ${r.kleur ?? ''}`} style={kleurStijl(r.kleur)}>
            {r.waarde}
          </span>
        </div>
      ))}
      {geld.notitie && <div className="pdv2-note">{geld.notitie}</div>}
    </Card>
  )
}

function kleurStijl(kleur?: string) {
  if (!kleur) return undefined
  return { color: `var(--${kleur})` }
}
