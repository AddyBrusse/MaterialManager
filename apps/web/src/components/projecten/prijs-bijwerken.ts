import { bewerkingenVan, prijsVoor, type PrijsBronnen } from '../../utils/artikel-prijs'
import type { Article } from '../../api/articles'
import type { OfferteRegel } from '@stockmanager/shared'

/**
 * De prijzen op een offerte opnieuw uit de calculaties halen.
 *
 * Waarom dit nodig is: de prijs op een offerteregel is een momentopname. Hij
 * wordt één keer berekend als de regel ontstaat en staat daarna vast. Dat is met
 * opzet — een verzonden offerte mag niet van prijs veranderen doordat iemand
 * later een recept aanpast, en `bewerkingen` is bevroren omdat de
 * productiestappen eruit komen.
 *
 * Maar bij een mail van een nieuwe klant is dat momentopname-gedrag juist
 * hinderlijk: de artikelen bestaan nog niet, dus alle regels ontstaan op € 0.
 * Maak je daarna de recepten, dan is er niets dat die regels bijwerkt en moet je
 * de calculatie met de hand overtypen.
 *
 * Dit rekent alleen uit *wat er zou veranderen*. Het beslist niets en schrijft
 * niets weg; het scherm laat het zien en de gebruiker vinkt aan. Dat is geen
 * omslachtigheid maar noodzaak: een regel weet niet of zijn prijs berekend is of
 * met de hand ingetypt, en er is maar één veld. Zonder dat overzicht overschrijf
 * je stilzwijgend een prijs die iemand bewust had aangepast.
 */

export type BijwerkReden = 'nieuw' | 'gewijzigd' | 'gelijk' | 'geen-calculatie' | 'geen-artikel'

export interface Bijwerking {
  regelId: string
  naam: string
  qty: number
  oudeVerkoopprijs: number
  nieuweVerkoopprijs: number
  nieuweBewerkingen: string[]
  reden: BijwerkReden
}

/** Alleen deze redenen leveren werk op; de rest is er om te tónen waarom niet. */
export function isBijTeWerken(b: Bijwerking): boolean {
  return b.reden === 'nieuw' || b.reden === 'gewijzigd'
}

function centen(n: number): number {
  return Math.round(n * 100)
}

/**
 * Per regel bepalen wat er zou gebeuren.
 *
 * De volgorde van de redenen is de volgorde waarin ze het scherm in gaan, en ze
 * sluiten elkaar uit:
 *  - `geen-artikel`     de regel is met de hand getypt; er is niets om uit te rekenen
 *  - `geen-calculatie`  het artikel bestaat maar heeft nog geen recept
 *  - `nieuw`            stond op € 0 en heeft nu een prijs — hier is niets te verliezen
 *  - `gewijzigd`        had al een prijs en die zou veranderen — hier wél
 *  - `gelijk`           de calculatie geeft hetzelfde; niets te doen
 */
export function berekenBijwerkingen(
  regels: OfferteRegel[],
  artikelen: Article[],
  bronnen: PrijsBronnen,
): Bijwerking[] {
  return regels.map((regel) => {
    const basis = {
      regelId: regel.id,
      naam: regel.naam,
      qty: regel.qty,
      oudeVerkoopprijs: regel.verkoopprijs,
      nieuweVerkoopprijs: regel.verkoopprijs,
      nieuweBewerkingen: regel.bewerkingen,
    }

    if (!regel.artikelId) return { ...basis, reden: 'geen-artikel' as const }

    const artikel = artikelen.find((a) => a.id === regel.artikelId)
    // Geen artikel meer te vinden telt als "niets uit te rekenen" en niet als een
    // fout: het artikel kan verwijderd zijn terwijl de offerte bleef staan.
    if (!artikel) return { ...basis, reden: 'geen-artikel' as const }
    if (!artikel.estimate) return { ...basis, reden: 'geen-calculatie' as const }

    // Bij het aantal van de régel rekenen: instel- en uitbesteedkosten gelden per
    // batch, dus de prijs per stuk hangt van het aantal af.
    const { verkoopprijs } = prijsVoor(artikel, bronnen, regel.qty || 1)
    const nieuw = {
      ...basis,
      nieuweVerkoopprijs: verkoopprijs,
      nieuweBewerkingen: bewerkingenVan(artikel),
    }

    // In centen vergelijken: twee bedragen die op de cent gelijk zijn horen niet
    // als wijziging in de lijst te staan door een afrondingsrestje.
    if (centen(verkoopprijs) === centen(regel.verkoopprijs)) {
      return { ...nieuw, reden: 'gelijk' as const }
    }
    return { ...nieuw, reden: centen(regel.verkoopprijs) === 0 ? ('nieuw' as const) : ('gewijzigd' as const) }
  })
}

/** Wat er in de kop van het scherm komt te staan. */
export function samenvatting(bijwerkingen: Bijwerking[]) {
  const telling = (reden: BijwerkReden) => bijwerkingen.filter((b) => b.reden === reden).length
  return {
    nieuw: telling('nieuw'),
    gewijzigd: telling('gewijzigd'),
    gelijk: telling('gelijk'),
    zonderCalculatie: telling('geen-calculatie'),
    zonderArtikel: telling('geen-artikel'),
    bijTeWerken: bijwerkingen.filter(isBijTeWerken).length,
  }
}
