import { isTestOmgeving } from '../../utils/omgeving'

/**
 * Wat de "Heb je hem verstuurd?"-vensters zeggen over de geadresseerde
 * (2026-11-03). In de testomgeving haalt `maakEml` het adres eraf; zonder dit
 * stond er in het venster nog "Outlook toont hem als nieuwe mail aan
 * inkoop@klant.nl", terwijl de mail aan niemand gericht is.
 */

/** " aan <adres>", of niets als Outlook geen geadresseerde toont. */
export function AanInOutlook({ naar }: { naar: string | null | undefined }) {
  if (!naar || isTestOmgeving()) return null
  return (
    <>
      {' '}
      aan <strong>{naar}</strong>
    </>
  )
}

/** Alleen in de testomgeving: waarom de mail aan niemand gericht is. */
export function TestMailMelding() {
  if (!isTestOmgeving()) return null
  return (
    <p style={{ color: '#d9480f', fontWeight: 600 }}>
      Testomgeving: deze mail heeft geen geadresseerde en [TEST] in het onderwerp, en de pdf het watermerk TEST — NIET
      GELDIG. Stuur hem hooguit naar jezelf.
    </p>
  )
}
