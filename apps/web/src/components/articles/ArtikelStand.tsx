import type { PointerEvent } from 'react'
import { notifications } from '@mantine/notifications'
import type { EditLockState } from '../../hooks/useEditLock'
import type { OpslagStand } from '../../hooks/useArtikelBewerken'

const klok = (d: Date) => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })

/**
 * Rechts in de titelbalk van een artikel (2026-10-23): wie het open heeft en
 * of je wijzigingen op de server staan. Vervangt de knop "Opslaan", die alleen
 * de kop opsloeg terwijl alles al vanzelf werd opgeslagen.
 */
export function ArtikelStand({ slot, opslag, opgeslagenOm, kopie, onOpnieuw }: {
  slot: EditLockState
  opslag: OpslagStand
  opgeslagenOm: Date | null
  kopie: boolean
  onOpnieuw: () => void
}) {
  if (kopie) {
    return (
      <span className="ad-stand warn" role="status">
        <i className="ad-stand-dot" />
        Server niet bereikbaar: je ziet de kopie uit deze browser, alleen om te lezen
      </span>
    )
  }
  if (slot.isReadOnly) {
    return (
      <span className="ad-stand warn" role="status">
        <i className="ad-stand-dot" />
        {slot.holderName} heeft dit artikel open{slot.holderIdle ? ' (inactief)' : ''}: je kijkt mee
      </span>
    )
  }
  if (!slot.isHolder) {
    return <span className="ad-stand" role="status"><i className="ad-stand-dot" />Even geduld, artikel openen…</span>
  }
  if (opslag === 'mislukt') {
    return (
      <span className="ad-stand fout" role="status">
        <i className="ad-stand-dot" />
        Niet opgeslagen
        <button type="button" className="ad-btn sm" onClick={onOpnieuw}>Opnieuw opslaan</button>
      </span>
    )
  }
  return (
    <span className="ad-stand ok" role="status">
      <i className="ad-stand-dot" />
      {opslag === 'bezig' ? 'Bezig met opslaan…'
        : opgeslagenOm ? `Opgeslagen ${klok(opgeslagenOm)}`
        : 'Wijzigingen worden vanzelf opgeslagen'}
    </span>
  )
}

let laatsteUitleg = 0

/**
 * Bij meekijken staan de velden dicht. Een dicht veld krijgt geen klik, wel een
 * `pointerdown` (Chromium); daarop zegt de pagina waarom er niets gebeurt, in
 * plaats van een knop die zonder uitleg niet werkt.
 */
export function zegWaaromDicht(slot: EditLockState, kopie: boolean) {
  return (e: PointerEvent) => {
    const doel = (e.target as HTMLElement).closest('input, select, textarea, button')
    if (!doel?.matches(':disabled') || Date.now() - laatsteUitleg < 4000) return
    laatsteUitleg = Date.now()
    notifications.show({
      color: 'orange', autoClose: 6000,
      title: kopie ? 'Alleen lezen: server niet bereikbaar' : slot.isReadOnly ? 'Je kijkt mee' : 'Even geduld',
      message: kopie
        ? 'Je ziet de kopie uit deze browser. Bewerken kan weer zodra de server bereikbaar is; herlaad dan de pagina.'
        : slot.isReadOnly
          ? `${slot.holderName ?? 'Iemand anders'} heeft dit artikel open. Zodra die het sluit, kun je hier bewerken; de pagina gaat dan vanzelf open.`
          : 'Het artikel wordt nog geopend.',
    })
  }
}
