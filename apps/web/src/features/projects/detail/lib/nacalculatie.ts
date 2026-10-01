/**
 * De kleur van een afwijking en de afwijkingsbalk uit §5.5.
 *
 * Eén functie, zodat de tabel, de facetkleur, de tabbadge en de FactBox Geld
 * hetzelfde zeggen over dezelfde afwijking.
 */

import { afwijkingRichting } from '@stockmanager/shared'

export type AfwijkingKleur = 'neutraal' | 'dgr' | 'ok'

/**
 * Goedkoper gemaakt dan berekend is groen, anders rood (2026-10-01). Het
 * oordeel zelf staat in `afwijkingRichting` in de gedeelde kern.
 *
 * Eerder: 5–15 % oranje in beide richtingen, en het tabje kleurde een grote
 * meevaller rood. Dan zei −10 % hier oranje en in de uitleg groen.
 */
export function afwijkingKleur(pct: number | null | undefined): AfwijkingKleur {
  switch (afwijkingRichting(pct)) {
    case 'goedkoper':
      return 'ok'
    case 'duurder':
      return 'dgr'
    default:
      return 'neutraal'
  }
}

/** "10,0 % onder calculatie" — het teken alleen zegt niet wat goed is. */
export function afwijkingTekst(pct: number | null | undefined): string {
  const r = afwijkingRichting(pct)
  if (r === null || pct === null || pct === undefined) return ''
  if (r === 'gelijk') return 'gelijk aan calculatie'
  const getal = Math.abs(pct).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${getal} % ${r === 'goedkoper' ? 'onder' : 'boven'} calculatie`
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

/** "Gelijk" krijgt --rail: zichtbaar, maar geen signaal. */
export function devKleurVar(pct: number | null | undefined): string {
  switch (afwijkingKleur(pct)) {
    case 'dgr':
      return 'var(--dgr)'
    case 'ok':
      return 'var(--ok)'
    default:
      return 'var(--rail)'
  }
}

export function kleurClass(pct: number | null | undefined): '' | 'dgr' | 'ok' {
  const k = afwijkingKleur(pct)
  return k === 'neutraal' ? '' : k
}
