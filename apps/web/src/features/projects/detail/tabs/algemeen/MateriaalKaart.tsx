import type { ReserveringVM } from '../../types'
import { Card } from '../../components/Card'

/**
 * Het materiaal dat voor dit project vastligt of al afgeboekt is (stond tot
 * 2026-10-05 op de tab Reserveringen). Reserveren raakt de fysieke voorraad
 * niet, afboeken wel; de Opdracht-tab toont per orderregel of er iets vastligt.
 */
export function MateriaalKaart({ items, onNaarReserveringen }: { items: ReserveringVM[]; onNaarReserveringen: () => void }) {
  return (
    <Card
      titel="Materiaal"
      teller={items.length === 0 ? undefined : `${items.length} reservering${items.length === 1 ? '' : 'en'}`}
      acties={
        <button type="button" className="pdv2-btn s stil" onClick={onNaarReserveringen}>
          Reserveringen
        </button>
      }
    >
      {items.length === 0 && (
        <div className="pdv2-note" style={{ marginTop: 0 }}>
          Nog geen materiaal vastgelegd. Dat gebeurt bij het aanmaken van de opdracht, via de todo per orderregel.
        </div>
      )}
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
