/**
 * Verbeterpunten (knop "Dit klopt niet", 2026-10-24). Voorwaarden op één plek,
 * zodat het scherm en de server dezelfde zin tonen (zie offerte-voorwaarden.ts).
 */

/** Waarom exporteren niet kan, of `null` als het mag. */
export function waaromNietVerbeterpuntenExporteren(aantalOpen: number): string | null {
  if (aantalOpen > 0) return null
  return 'Er staan geen open verbeterpunten. Een export bevat alleen punten die nog niet afgevinkt zijn.'
}
