/**
 * Draait deze browser op de testomgeving (2026-11-03)? De oranje balk zet het
 * zodra de server het gezegd heeft (`components/layout/TestBalk.tsx`).
 *
 * Een moduleveld en geen store: de pdf-opmaak en de `.eml` lezen het buiten
 * React, op het moment dat iemand een document maakt — dat is altijd ná het
 * laden van de app, dus de server heeft dan al geantwoord.
 */
let test = false

export function zetTestOmgeving(waarde: boolean): void {
  test = waarde
}

export function isTestOmgeving(): boolean {
  return test
}
