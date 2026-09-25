import type { Offerte } from '@stockmanager/shared'
import { BevestigModal } from '../components/BevestigModal'
import { eur } from '../lib/format'

/**
 * De vraag vóór een versie weggaat. Noemt versie, regels en bedrag, zodat je
 * ziet dát het de goede rij is — in een lijst van zeven versies met hetzelfde
 * nummer is een verkeerde klik snel gemaakt.
 */
export function WegBevestiging({
  soort,
  offerte: o,
  onBevestig,
  onSluit,
}: {
  soort: 'verwijderen' | 'intrekken'
  offerte: Offerte
  onBevestig: () => void
  onSluit: () => void
}) {
  const totaal = eur(o.regels.reduce((s, r) => s + r.totaal, 0))
  const regels = `${o.regels.length} regel${o.regels.length === 1 ? '' : 's'}`

  if (soort === 'verwijderen') {
    return (
      <BevestigModal titel={`v${o.versie} verwijderen?`} knop="Verwijderen" gevaar onBevestig={onBevestig} onSluit={onSluit}>
        <p>
          Concept <strong>v{o.versie}</strong> met {regels} ({totaal}) wordt definitief verwijderd.
          Dit kan niet ongedaan worden gemaakt.
        </p>
        <p>De andere versies blijven zoals ze zijn.</p>
      </BevestigModal>
    )
  }
  return (
    <BevestigModal titel={`v${o.versie} intrekken?`} knop="Intrekken" onBevestig={onBevestig} onSluit={onSluit}>
      <p>
        <strong>v{o.versie}</strong> ({regels}, {totaal}) is naar de klant gestuurd
        {o.externeRef ? ` als antwoord op "${o.externeRef}"` : ''}. Na intrekken geldt hij niet meer
        en kan hij niet meer geaccepteerd worden.
      </p>
      <p>Hij blijft zichtbaar als <strong>vervallen</strong>, zodat terug te vinden is wat de klant kreeg.</p>
    </BevestigModal>
  )
}
