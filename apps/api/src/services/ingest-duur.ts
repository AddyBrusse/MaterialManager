/**
 * Voorspellen hoe lang het inlezen van een mail duurt — features/60 §3.1.
 *
 * De eerste versie zei "een halve tot anderhalve minuut". Dat was mijn
 * aanname, geen waarneming. Deze voorspelling komt uit gemeten runs op deze
 * installatie, dus hij klopt vanzelf beter naarmate er meer mail langskomt en
 * hij schuift mee als het model sneller wordt of de mail zwaarder.
 *
 * Bewust géén formule over bestandsgrootte: gemeten kost het uitlezen van een
 * pdf van 1,1 MB 24 tot 243 ms. De tijd zit in het modelgesprek, en dat schaalt
 * met hoeveel tekst en hoeveel gescande pagina's eruit komen — en dát weet je
 * pas ná het uitpakken, terwijl de browser bij het slepen alleen de bestands-
 * grootte kent. Daarom: de mediaan van vergelijkbare runs, en anders van alles.
 */

export interface Meting {
  bytes: number
  duurMs: number
}

export interface Schatting {
  /** Verwachte duur in seconden. Null als er nog niets te voorspellen valt. */
  verwachtSeconden: number | null
  /** Snelle en trage kant (p10-p90), zodat de melding geen exacte belofte doet. */
  ondergrensSeconden: number | null
  bovengrensSeconden: number | null
  /** Hoeveel metingen hieraan ten grondslag liggen — bepaalt hoeveel je erop mag bouwen. */
  gebaseerdOp: number
}

/** Minder dan dit en de mediaan zegt nog te weinig; dan liever niets beloven. */
const MIN_METINGEN = 3
/**
 * Voor de gelijkende groep volstaan er twee.
 *
 * Bij drie was de terugval erger dan de kwaal: een grote mail vol scans kreeg
 * de mediaan van kleine tekstmails toegeschoven (44 s, terwijl vergelijkbare
 * runs 88-96 s deden). Twee metingen van hetzelfde soort mail zeggen meer dan
 * vijf van een heel ander soort.
 */
const MIN_GELIJKEND = 2
/** "Vergelijkbaar van grootte" = binnen een factor twee. */
const GROOTTE_FACTOR = 2

function percentiel(gesorteerd: number[], p: number): number {
  if (gesorteerd.length === 1) return gesorteerd[0]
  const positie = (gesorteerd.length - 1) * p
  const onder = Math.floor(positie)
  const boven = Math.ceil(positie)
  if (onder === boven) return gesorteerd[onder]
  return gesorteerd[onder] + (gesorteerd[boven] - gesorteerd[onder]) * (positie - onder)
}

export function schatDuur(metingen: Meting[], bytes: number): Schatting {
  const leeg: Schatting = {
    verwachtSeconden: null, ondergrensSeconden: null, bovengrensSeconden: null, gebaseerdOp: 0,
  }
  if (metingen.length < MIN_METINGEN) return leeg

  // Eerst mails van vergelijkbare grootte; zijn dat er te weinig, dan alles.
  // Grootte is een zwakke voorspeller, maar een zwakke is beter dan geen —
  // zolang je er niet op terugvalt als de groep te klein wordt.
  const gelijkend = metingen.filter(
    (m) => m.bytes > 0 && bytes > 0 &&
      m.bytes <= bytes * GROOTTE_FACTOR && m.bytes >= bytes / GROOTTE_FACTOR
  )
  const gebruikt = gelijkend.length >= MIN_GELIJKEND ? gelijkend : metingen

  const secondes = gebruikt.map((m) => m.duurMs / 1000).sort((a, b) => a - b)
  const afronden = (v: number) => Math.max(1, Math.round(v))

  return {
    verwachtSeconden: afronden(percentiel(secondes, 0.5)),
    ondergrensSeconden: afronden(percentiel(secondes, 0.1)),
    bovengrensSeconden: afronden(percentiel(secondes, 0.9)),
    gebaseerdOp: gebruikt.length,
  }
}
