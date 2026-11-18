import type { FactuurSoort } from '../schemas/project'

/**
 * Een factuur krijgt zijn nummer pas bij versturen (besloten met Addy,
 * 2026-11-18). Factuurnummers horen aaneengesloten te zijn; zolang een concept
 * meteen een nummer kreeg, sloeg elk weggegooid concept een gat in de reeks.
 *
 * Zo werkt het nu:
 * - een concept heet `FACT-concept-x8k2q1` (of `CRED-concept-…`);
 * - bij **Versturen** geeft de server het volgende nummer, vlak voordat de pdf
 *   gemaakt wordt — de pdf moet het nummer immers dragen;
 * - bij "Ja, verstuurd" staat hij vast;
 * - wie daarna toch niet verstuurt, houdt een factuur mét nummer. Die gaat niet
 *   meer weg; het nummer intrekken kan alleen als het het laatst uitgegeven
 *   nummer is, want dan ontstaat er geen gat.
 *
 * Facturen van vóór 2026-11-18 hebben als concept al een nummer; die gelden als
 * "genummerd, nog niet verstuurd" en volgen dezelfde regels.
 */

const NUMMER = /^(FACT|CRED)-\d{4}-\d+$/
const CONCEPT = /^(FACT|CRED)-concept-/

export const factuurPrefix = (soort: FactuurSoort): 'FACT' | 'CRED' => (soort === 'credit' ? 'CRED' : 'FACT')

/** Heeft deze factuur al een echt nummer uit de reeks? */
export function heeftFactuurnummer(id: string): boolean {
  return NUMMER.test(id)
}

export function isConceptFactuurId(id: string): boolean {
  return CONCEPT.test(id)
}

/** Een id voor een concept: herkenbaar als "nog geen nummer", en nooit gelijk aan een nummer uit de reeks. */
export function conceptFactuurId(soort: FactuurSoort, willekeurig: () => number = Math.random): string {
  const staart = Array.from({ length: 8 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(willekeurig() * 36)]).join('')
  return `${factuurPrefix(soort)}-concept-${staart}`
}

/** Hoe het scherm en een melding hem noemen: het nummer, of "de conceptfactuur". */
export function factuurNaam(f: { id: string; soort: FactuurSoort }): string {
  if (heeftFactuurnummer(f.id)) return f.id
  return f.soort === 'credit' ? 'de conceptcredit' : 'de conceptfactuur'
}

/** Het nummer zoals het op het scherm en de pdf staat: zonder nummer staat er "Concept". */
export function factuurNummerTekst(id: string): string {
  return heeftFactuurnummer(id) ? id : 'Concept'
}

/** Jaar en volgnummer van een factuurnummer, of null bij een concept. */
export function factuurReeks(id: string): { prefix: 'FACT' | 'CRED'; jaar: number; n: number } | null {
  const m = /^(FACT|CRED)-(\d{4})-(\d+)$/.exec(id)
  return m ? { prefix: m[1] as 'FACT' | 'CRED', jaar: Number(m[2]), n: Number(m[3]) } : null
}
