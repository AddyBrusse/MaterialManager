import type { GeldVM } from '../types'
import { GeldBox } from '../sidebar/GeldBox'

/**
 * Het geld van dit project, als eigen tab.
 *
 * Stond eerder als kaart in de zijkolom. Die kolom is weg, maar de inhoud is
 * niet veranderd: dezelfde zes regels, dezelfde drempels en kleuren als §5.5,
 * zodat het verschil hier hetzelfde betekent als op de Nacalculatie-tab.
 *
 * De kaart houdt zijn breedte. Een rij "Offertetotaal … € 212,50" over veertien
 * honderd pixels uitgerekt is niet beter leesbaar, alleen verder uit elkaar.
 */
export function FinancieelTab({ geld }: { geld: GeldVM }) {
  return (
    <div style={{ maxWidth: 560 }}>
      <GeldBox geld={geld} />
    </div>
  )
}
