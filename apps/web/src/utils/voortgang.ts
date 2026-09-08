/**
 * Hoe vol staat de balk na t seconden — features/60-mail-import.md §3.1.
 *
 * Een voortgangsbalk die iets voorwendt is erger dan geen balk. Er ís geen
 * echte voortgang bekend (de server doet zijn werk in één blokkerende aanroep),
 * alleen een voorspelling uit eerdere metingen. Deze balk gedraagt zich daarnaar:
 *
 *  - hij loopt gelijkmatig naar 90 % op het voorspelde moment
 *  - duurt het langer, dan kruipt hij asymptotisch verder maar bereikt hij nooit
 *    100 % — want klaar is hij pas als het antwoord er is
 *  - zonder voorspelling (te weinig metingen) geeft hij een langzame, eerlijke
 *    kruip zonder eindpunt te suggereren
 *
 * Zo is een tegenvallende voorspelling zichtbaar als "het duurt langer dan
 * verwacht" in plaats van als een balk die op 100 % blijft hangen.
 */

/** Waar de balk staat op het voorspelde moment. De rest is voor de overtijd. */
const BIJ_VERWACHT = 0.9
/** Hoe dicht hij daarna hooguit nadert. Nooit 1: klaar is klaar, niet bijna. */
const PLAFOND = 0.99
/** Zonder voorspelling: na zoveel seconden staat hij op de helft. */
const BLINDE_HALFWAARDE = 45

export function voortgang(verstrekenSeconden: number, verwachtSeconden: number | null): number {
  const t = Math.max(0, verstrekenSeconden)

  if (!verwachtSeconden || verwachtSeconden <= 0) {
    // Niets om op te bouwen: een trage kruip die nergens naartoe belooft te gaan.
    return PLAFOND * (1 - Math.exp((-t * Math.LN2) / BLINDE_HALFWAARDE))
  }

  if (t <= verwachtSeconden) return BIJ_VERWACHT * (t / verwachtSeconden)

  const over = (t - verwachtSeconden) / verwachtSeconden
  return BIJ_VERWACHT + (PLAFOND - BIJ_VERWACHT) * (1 - Math.exp(-over))
}

/** De tekst onder de balk: eerlijk over wat we weten en waarop het rust. */
export function voortgangTekst(
  verstrekenSeconden: number,
  schatting: { verwachtSeconden: number | null; bovengrensSeconden: number | null; gebaseerdOp: number } | null
): string {
  const t = Math.round(verstrekenSeconden)
  if (!schatting?.verwachtSeconden) {
    return `${t} seconden bezig — de eerste keren weten we nog niet hoe lang dit duurt.`
  }
  if (verstrekenSeconden > (schatting.bovengrensSeconden ?? schatting.verwachtSeconden)) {
    return `${t} seconden bezig — langer dan de ${schatting.verwachtSeconden} s die deze mails meestal kosten.`
  }
  const rest = Math.max(1, Math.round(schatting.verwachtSeconden - verstrekenSeconden))
  return `${t} s · nog ongeveer ${rest} s, op basis van ${schatting.gebaseerdOp} eerdere mails.`
}
