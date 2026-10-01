import type { Project, Relatie } from '@stockmanager/shared'

/**
 * De klant en contactpersoon op de Algemeen-tab (besloten 2026-10-01).
 *
 * Eerst stonden daar tekstvakjes met de naam erin, zonder koppeling met de
 * relaties — en zonder opslaan. Nu een keuzelijst van klanten, met de
 * contacten van die klant eronder.
 */

/** Alleen klanten (en relaties die beide zijn); inactieve alleen als ze nu gekozen zijn. */
export function klantOpties(relaties: Relatie[], huidig: string | null): { value: string; label: string }[] {
  return relaties
    .filter((r) => r.type !== 'leverancier' && (r.actief !== false || r.id === huidig))
    .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
    .map((r) => ({ value: r.id, label: r.naam }))
}

/** Heeft de klant precies één contactpersoon, dan is dat vanzelf de goede. */
export function enigContact(relatie: Relatie | null | undefined): string | null {
  const c = relatie?.contacten ?? []
  return c.length === 1 ? c[0].id : null
}

/** Wat de klant al van ons kreeg, in gewone woorden. */
export function verstuurdeDocumenten(p: Project): string[] {
  const uit: string[] = []
  for (const o of [...p.offertes].sort((a, b) => a.versie - b.versie)) {
    if (o.verzondenOp) uit.push(`offerte v${o.versie}`)
  }
  if (p.opdrachtbevestiging?.verzondenOp) uit.push('de opdrachtbevestiging')
  for (const pl of p.paklijsten) if (pl.verzondenOp) uit.push(`paklijst ${pl.id}`)
  for (const f of p.facturen) if (f.verzondenOp) uit.push(`${f.soort === 'credit' ? 'creditfactuur' : 'factuur'} ${f.id}`)
  return uit
}

/**
 * De vraag vóór het wisselen van klant, of `null` als er nog niets verstuurd is.
 * Niet blokkeren (principe 2026-09-28): wat verstuurd is verandert niet mee,
 * en dat moet je weten voordat je kiest.
 */
export function waarschuwingKlantWissel(p: Project, oudeKlant: string | null): string | null {
  const docs = verstuurdeDocumenten(p)
  if (docs.length === 0) return null
  const lijst = docs.length === 1 ? docs[0] : `${docs.slice(0, -1).join(', ')} en ${docs[docs.length - 1]}`
  const zin = lijst.charAt(0).toUpperCase() + lijst.slice(1)
  const een = docs.length === 1
  return `${zin} ${een ? 'is' : 'zijn'} al verstuurd${oudeKlant ? ` aan ${oudeKlant}` : ''}. ` +
    (een ? 'Dat verandert niet mee: de klant heeft het zoals het was.' : 'Die veranderen niet mee: de klant heeft ze zoals ze waren.')
}
