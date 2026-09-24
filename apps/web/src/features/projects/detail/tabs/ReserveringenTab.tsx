import type { ReserveringVM } from '../types'
import { ReserveringenBox } from '../sidebar/ReserveringenBox'
import { Card } from '../components/Card'

/**
 * Het materiaal dat voor dit project vastligt, als eigen tab.
 *
 * Reserveren raakt de fysieke voorraad niet — afboeken doet dat. Wat hier staat
 * is dus wat er apart gehouden is, niet wat er al weg is; de Opdracht-tab toont
 * per orderregel of er iets vastligt.
 */
export function ReserveringenTab({ items }: { items: ReserveringVM[] }) {
  if (items.length === 0) {
    return (
      <Card titel="Reserveringen">
        <div className="pdv2-empty">
          Nog geen materiaal vastgelegd voor dit project. Dat gebeurt bij het aanmaken van de
          opdracht, via de todo per orderregel.
        </div>
      </Card>
    )
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <ReserveringenBox items={items} />
    </div>
  )
}
