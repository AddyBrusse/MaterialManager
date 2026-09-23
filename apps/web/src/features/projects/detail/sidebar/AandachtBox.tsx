import type { AandachtVM } from '../types'
import { Card } from '../components/Card'

/**
 * FactBox *Aandacht* (§6.1) — alleen zichtbaar als er iets is, gesorteerd op
 * ernst (rood, amber, blauw) en afgekapt op vijf. Een lijst die alles toont is
 * een lijst die niemand leest.
 */
export function AandachtBox({ items }: { items: AandachtVM[] }) {
  if (items.length === 0) return null
  const zichtbaar = items.slice(0, 5)

  return (
    <Card titel="Aandacht" teller={`${items.length}`} plat>
      {zichtbaar.map((a, i) => (
        <div className="pdv2-aandacht" key={`${a.titel}-${i}`}>
          <i className={`pdv2-staaf ${a.ernst === 'rood' ? 'rood' : a.ernst === 'amber' ? 'amber' : ''}`} />
          <div>
            <div className="pdv2-aandacht-t">{a.titel}</div>
            <div className="pdv2-aandacht-s">{a.toelichting}</div>
          </div>
        </div>
      ))}
      {items.length > zichtbaar.length && (
        <div className="pdv2-empty">nog {items.length - zichtbaar.length} meer</div>
      )}
    </Card>
  )
}
