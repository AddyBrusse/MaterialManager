import type { TodoVM } from '../types'
import { Card } from '../components/Card'

/**
 * FactBox *Openstaande todo's* (§6.4). Het vinkvakje is bewust leeg en niet
 * aanklikbaar: afvinken gebeurt op de todopagina, waar de herkomst erbij staat.
 */
export function TodoBox({ items }: { items: TodoVM[] }) {
  if (items.length === 0) return null

  return (
    <Card titel="Openstaande todo's" teller={`${items.length}`}>
      {items.map((t) => (
        <div key={t.id} style={{ display: 'flex', gap: 7, padding: '3px 0' }}>
          <span
            aria-hidden
            style={{
              width: 13,
              height: 13,
              flex: 'none',
              marginTop: 1,
              border: '1px solid var(--border2)',
              borderRadius: 3,
            }}
          />
          <div>
            <div style={{ fontSize: 11.5 }}>{t.titel}</div>
            <div className="pdv2-aandacht-s">{t.herkomst}</div>
          </div>
        </div>
      ))}
    </Card>
  )
}
