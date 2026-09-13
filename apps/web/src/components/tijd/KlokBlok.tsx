import { IconPlayerPause, IconPlayerPlay, IconCheck, IconUser, IconMoon } from '@tabler/icons-react'
import { secondenNaarKlok } from '@stockmanager/shared'
import type { TijdRegistratieDTO } from '../../api/tijdregistratie'
import { useKlok } from '../../hooks/useTijdregistratie'

/**
 * Het klokblok dat op een lopende wachtrijkaart verschijnt.
 *
 * Dit is geen nieuwe pagina en geen nieuw menu-item: de bestaande wachtrij
 * (PlanningQueuePage) krijgt er dit blok bij op de kaart die nu draait. De rest
 * van de kaart blijft precies zoals hij was.
 */
export function KlokBlok({
  registratie, onPauze, onHervat, onKlaar, bezig,
}: {
  registratie: TijdRegistratieDTO
  onPauze: () => void
  onHervat: () => void
  onKlaar: () => void
  bezig?: boolean
}) {
  const seconden = useKlok(registratie)
  const gepauzeerd = registratie.status === 'gepauzeerd'
  const onbemand = !registratie.bemand

  const klasse = [
    'tr-klok',
    gepauzeerd ? 'is-pauze' : 'is-lopend',
    onbemand ? 'is-onbemand' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={klasse} onClick={(e) => e.stopPropagation()}>
      <div className="tr-klok-top">
        <span className="tr-dot" />
        <span className="tr-tijd">{secondenNaarKlok(seconden)}</span>
        <span className="tr-soort">
          {gepauzeerd ? 'pauze' : registratie.soort}
        </span>
      </div>

      <div className="tr-wie">
        {onbemand
          ? <><IconMoon size={12} stroke={1.8} /> niemand · onbemand</>
          : <><IconUser size={12} stroke={1.8} /> {registratie.userNaam ?? 'onbekend'} · bemand</>}
        {registratie.aantalStuks != null && <> · {registratie.aantalStuks} st</>}
      </div>

      <div className="tr-knoppen">
        {gepauzeerd ? (
          <button className="st-btn" disabled={bezig} onClick={onHervat}>
            <IconPlayerPlay size={13} stroke={1.8} /> hervat
          </button>
        ) : (
          <button className="st-btn" disabled={bezig} onClick={onPauze}>
            <IconPlayerPause size={13} stroke={1.8} /> pauze
          </button>
        )}
        <button className="st-btn primary" disabled={bezig} onClick={onKlaar}>
          <IconCheck size={13} stroke={2} /> klaar
        </button>
      </div>
    </div>
  )
}
