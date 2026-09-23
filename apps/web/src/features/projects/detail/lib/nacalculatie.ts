/**
 * De kleurdrempels en de afwijkingsbalk uit §5.5.
 *
 * Hier zit het hele ontwerp van dit tabblad in: 3 % moet niet schreeuwen, 40 %
 * wel. Eén functie, zodat de tabel, de facetkleur, de tabbadge en de FactBox
 * Geld hetzelfde zeggen over dezelfde afwijking.
 */

export type AfwijkingKleur = 'neutraal' | 'warn' | 'dgr' | 'ok'

/**
 * | afwijking | < 5 %        → neutraal (geen signaal)
 * 5 % ≤ | afwijking | < 15 % → warn
 * | afwijking | ≥ 15 %       → dgr bij overschrijding, ok bij onderschrijding
 */
export function afwijkingKleur(pct: number | null | undefined): AfwijkingKleur {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return 'neutraal'
  const a = Math.abs(pct)
  if (a < 5) return 'neutraal'
  if (a < 15) return 'warn'
  return pct > 0 ? 'dgr' : 'ok'
}

export const DEV_BREEDTE = 132
export const DEV_HALF = DEV_BREEDTE / 2

/**
 * Geometrie van de afwijkingsbalk: nulas in het midden, vulling groeit naar
 * rechts bij overschrijding en naar links bij onderschrijding. 50 % afwijking
 * vult de halve balk; daarboven afgekapt, want een balk die doorloopt suggereert
 * een schaal die er niet is.
 */
export function devBalk(pct: number | null | undefined): { left: number; width: number } | null {
  if (pct === null || pct === undefined || Number.isNaN(pct) || pct === 0) return null
  const deel = Math.min(Math.abs(pct) / 50, 1)
  const width = deel * DEV_HALF
  return pct > 0 ? { left: DEV_HALF, width } : { left: DEV_HALF - width, width }
}

/** Onder de 5 % krijgt de balk --rail: zichtbaar, maar geen signaal. */
export function devKleurVar(pct: number | null | undefined): string {
  switch (afwijkingKleur(pct)) {
    case 'warn':
      return 'var(--warn)'
    case 'dgr':
      return 'var(--dgr)'
    case 'ok':
      return 'var(--ok)'
    default:
      return 'var(--rail)'
  }
}

export function kleurClass(pct: number | null | undefined): '' | 'warn' | 'dgr' | 'ok' {
  const k = afwijkingKleur(pct)
  return k === 'neutraal' ? '' : k
}
