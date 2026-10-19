import type { MovementReason } from '@stockmanager/shared'

export type MutatieType = 'toevoegen' | 'afboeken' | 'correctie'

/** De lengte van de staaf na de mutatie, nooit onder 0. Toevoegen heeft geen
 *  bovengrens: meer ontvangen dan de oorspronkelijke lengte kan. */
export function nieuweLengte(type: MutatieType, resterendMm: number, invoerMm: number): number {
  if (type === 'toevoegen') return resterendMm + invoerMm
  if (type === 'afboeken') return Math.max(resterendMm - invoerMm, 0)
  return Math.max(invoerMm, 0)
}

export function mutatieReden(type: MutatieType): Extract<MovementReason, 'received' | 'used' | 'correction'> {
  return type === 'toevoegen' ? 'received' : type === 'afboeken' ? 'used' : 'correction'
}

/** Waarom deze invoer geen mutatie is, of null. */
export function waaromNietInvoer(invoerMm: number): string | null {
  return !(invoerMm > 0) ? 'Voer een geldige lengte in, groter dan 0 mm.' : null
}
