import type { ReserveringVM } from '../types'
import { Card } from '../components/Card'

/** FactBox *Reserveringen* (§6.3). */
export function ReserveringenBox({ items }: { items: ReserveringVM[] }) {
  if (items.length === 0) return null

  return (
    <Card titel="Reserveringen" teller={`${items.length}`}>
      {items.map((r, i) => (
        <div key={`${r.materiaal}-${i}`} style={{ padding: '3px 0' }}>
          <div className="pdv2-kv" style={{ padding: 0 }}>
            <span style={{ color: 'var(--text)' }}>{r.materiaal}</span>
            <span className="mono">{r.hoeveelheid}</span>
          </div>
          <div className="pdv2-aandacht-s" style={r.wacht ? { color: 'var(--warn)' } : undefined}>
            {r.toestand}
          </div>
        </div>
      ))}
    </Card>
  )
}
