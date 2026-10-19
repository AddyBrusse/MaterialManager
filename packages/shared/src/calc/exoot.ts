/**
 * Waar een stuk van een exoot staat (2026-10-16). Afgeleid, nooit opgeslagen.
 *
 * Een exoot begint op voorraad 0 (hij moet nog binnenkomen) en eindigt ook op 0
 * (verbruikt). Zonder onderscheid tussen die twee stond een verbruikte exoot in
 * de voorraad als "Te bestellen", en bleef elk stuk dat ooit binnenkwam voor
 * altijd in de lijst. Het verschil: heeft dit stuk ooit voorraad gehad.
 */
export type ExootStand = 'binnen' | 'niet_binnen' | 'verbruikt'

export function exootStand(currentStock: number, ooitVoorraad: boolean): ExootStand {
  if (currentStock > 0) return 'binnen'
  return ooitVoorraad ? 'verbruikt' : 'niet_binnen'
}
