/**
 * Een mutatie met de hand op een staaf waar een zaagbon op ligt (2026-10-19).
 *
 * Een mutatie raakte alleen de fysieke voorraad. Ging een staaf met de hand
 * naar 0, dan bleef de reservering openstaan: de Voorraad toonde 0 mm fysiek en
 * toch nog iets gereserveerd, en de Zaagflow bood de staaf nog aan. Addy koos
 * weigeren: een mutatie die de staaf onder wat er vastligt brengt gaat niet
 * door. Eerst de zaagbon afboeken in de Zaagflow, of de reservering annuleren.
 * Nooit vanzelf vrijgeven: dan verliest de order stil zijn materiaal.
 */
export interface OpenZaagbon {
  calculatieNr: string
  /** Wat de bon op de staaf vasthoudt, in mm. */
  sawLength: number
}

const mm = (v: number) => `${Math.round(v).toLocaleString('nl-NL')} mm`

/** Waarom deze mutatie niet kan, of null. Scherm en server vragen hetzelfde.
 *  Alleen een mutatie die de staaf lager zet dan wat er vastligt; toevoegen of
 *  een kleinere mutatie gaat zoals altijd. */
export function waaromNietMutatie(vorigeMm: number, nieuweMm: number, open: OpenZaagbon[]): string | null {
  const vast = open.reduce((s, b) => s + b.sawLength, 0)
  if (nieuweMm >= vorigeMm || nieuweMm >= vast) return null
  const nrs = [...new Set(open.map((b) => b.calculatieNr || 'zonder nummer'))]
  const bonnen = nrs.length === 1 ? `zaagbon ${nrs[0]}` : `zaagbonnen ${nrs.join(', ')}`
  return `Op deze staaf ligt ${mm(vast)} vast voor ${bonnen}, en na de mutatie is er ${mm(nieuweMm)}. `
    + 'Boek de zaagbon eerst af in de Zaagflow, of annuleer de reservering bij Reserveringen.'
}
