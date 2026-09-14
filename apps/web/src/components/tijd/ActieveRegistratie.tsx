import { IconPlayerPause, IconPlayerPlay, IconCheck, IconAlertTriangle } from '@tabler/icons-react'
import { secondenNaarKlok, secondenNaarUren, type TijdSoort } from '@stockmanager/shared'
import type { TijdRegistratieDTO } from '../../api/tijdregistratie'
import { useKlok } from '../../hooks/useTijdregistratie'

/** Zes uur op één klok is bijna altijd een vergeten klok, geen lange klus. */
export const TE_LANG_SECONDEN = 6 * 3600

/**
 * Het paneel rechts in de wachtrij: wat loopt er nu op de gekozen stap.
 *
 * De twee segmentkeuzes zijn het hart van het ontwerp. Instellen telt in de
 * calculatie één keer per batch en draaien per stuk; onbemande uren kosten geen
 * operator. Wisselen sluit daarom de lopende regel af en begint een nieuwe —
 * anders belanden twee soorten tijd in één post en valt er achteraf niets te
 * vergelijken.
 */
export function ActieveRegistratie({
  registratie, geschatSeconden, vandaagSeconden,
  onStart, onWissel, onPauze, onHervat, onKlaar, bezig,
}: {
  registratie: TijdRegistratieDTO | null
  geschatSeconden: number | null
  vandaagSeconden: number
  onStart: (soort: TijdSoort, bemand: boolean) => void
  onWissel: (naar: { soort?: TijdSoort; bemand?: boolean }) => void
  onPauze: () => void
  onHervat: () => void
  onKlaar: () => void
  bezig?: boolean
}) {
  const seconden = useKlok(registratie)
  const teLang = !!registratie && seconden > TE_LANG_SECONDEN

  if (!registratie) {
    return (
      <div className="tr-paneel">
        <div className="st-empty">Geen klok op deze stap.</div>
        <div className="tr-knoppen">
          <button className="st-btn primary" disabled={bezig} onClick={() => onStart('instellen', true)}>
            start instellen
          </button>
          <button className="st-btn" disabled={bezig} onClick={() => onStart('draaien', true)}>
            start draaien
          </button>
        </div>
      </div>
    )
  }

  const gepauzeerd = registratie.status === 'gepauzeerd'

  return (
    <div className="tr-paneel">
      <div className="tr-paneel-kop">
        <span className={`tr-dot${gepauzeerd ? '' : ''}`} />
        <span className="tr-groot">{secondenNaarKlok(seconden)}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="tr-seg">
          <button
            className={registratie.soort === 'instellen' ? 'is-actief' : ''}
            disabled={bezig}
            onClick={() => registratie.soort !== 'instellen' && onWissel({ soort: 'instellen' })}
          >instellen</button>
          <button
            className={registratie.soort === 'draaien' ? 'is-actief' : ''}
            disabled={bezig}
            onClick={() => registratie.soort !== 'draaien' && onWissel({ soort: 'draaien' })}
          >draaien</button>
        </div>

        <div className="tr-seg">
          <button
            className={registratie.bemand ? 'is-actief' : ''}
            disabled={bezig}
            onClick={() => !registratie.bemand && onWissel({ bemand: true })}
          >bemand</button>
          <button
            className={!registratie.bemand ? 'is-actief' : ''}
            disabled={bezig}
            onClick={() => registratie.bemand && onWissel({ bemand: false })}
          >onbemand</button>
        </div>
      </div>

      {teLang && (
        <div className="tr-telang">
          <IconAlertTriangle size={14} stroke={2} />
          <span>
            Deze klok loopt al {secondenNaarUren(seconden)}. Klopt dat, of is hij blijven
            staan? Rond hem af en stel de tijd bij — automatisch afsluiten zou tijd verzinnen.
          </span>
        </div>
      )}

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
          <IconCheck size={13} stroke={2} /> stap klaar
        </button>
      </div>

      <div className="st-kv">
        <span>Vandaag op deze stap</span>
        <span className="cell-mono">
          {secondenNaarUren(vandaagSeconden)}
          {geschatSeconden != null && <> van {secondenNaarUren(geschatSeconden)} geschat</>}
        </span>
      </div>
      {registratie.machineNaam && (
        <div className="st-kv">
          <span>Machine</span>
          <span>{registratie.machineNaam}</span>
        </div>
      )}
    </div>
  )
}
