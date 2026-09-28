import type { MateriaalVanRegel } from '../../lib/materiaal-stand'
import { materiaalSamenvatting } from '../../lib/materiaal-stand'

const STAND = {
  kiezen: { tekst: 'Nog kiezen', klasse: 'warn', uitleg: 'nog geen materiaal gekozen voor deze regel' },
  gereserveerd: { tekst: 'Gereserveerd', klasse: 'accent', uitleg: '' },
  gezaagd: { tekst: 'Gezaagd', klasse: 'ok', uitleg: '' },
  geen: { tekst: 'Geen materiaal', klasse: '', uitleg: 'regel zonder artikel' },
} as const

/**
 * Het materiaal van één orderregel, met de weg om het te regelen.
 *
 * Kiezen kan hier (het keuzescherm van de todo, als modal). Vrijgeven niet:
 * dat gaat alleen via Reserveringen (besloten 2026-09-28), omdat de
 * zaagplanning er al op kan rekenen — vandaar een link in plaats van een knop.
 */
export function MateriaalCel({
  materiaal,
  geblokkeerd,
  onKiezen,
  onNaarReserveringen,
}: {
  materiaal: MateriaalVanRegel
  geblokkeerd: boolean
  onKiezen: () => void
  onNaarReserveringen: () => void
}) {
  const s = STAND[materiaal.stand]
  const samenvatting = materiaalSamenvatting(materiaal.reserveringen)
  const codes = materiaal.reserveringen.map((r) => r.barCode).join(', ')
  return (
    <td>
      <span className={`pdv2-pill ${s.klasse}`}>{s.tekst}</span>
      {samenvatting ? (
        <span className="sub" title={codes ? `Staven: ${codes}` : undefined}>
          {samenvatting}
        </span>
      ) : (
        s.uitleg && <span className="sub">{s.uitleg}</span>
      )}
      {materiaal.stand === 'kiezen' && (
        <button
          type="button"
          className="pdv2-btn s"
          style={{ marginTop: 4 }}
          disabled={geblokkeerd}
          onClick={onKiezen}
        >
          Materiaal kiezen
        </button>
      )}
      {materiaal.stand === 'gereserveerd' && (
        <button type="button" className="pdv2-link" onClick={onNaarReserveringen}>
          naar Reserveringen
        </button>
      )}
    </td>
  )
}
