/**
 * Nacalculatie: wat een order werkelijk kostte, naast wat ervoor gecalculeerd was.
 *
 * De indeling is met opzet dezelfde vier posten als `computeEstimateTotals`:
 * materiaal, instellen, draaien (cyclus) en uitbesteed. Zou hier een eigen
 * indeling staan, dan telt geschat nooit op tot werkelijk en is elk verschil
 * onverklaarbaar.
 *
 * Zuivere rekenkunde: geen fetch, geen Prisma. De API levert de gemeten uren en
 * het verbruikte materiaal aan; wat "werkelijk" betekent per registratie staat
 * in `effectieveSeconden` in schemas/tijdregistratie.
 */

import type { EstimateTotals } from './estimate'

export type NacalculatiePost = 'materiaal' | 'instellen' | 'draaien' | 'extern'

export interface NacalculatieRegel {
  post: NacalculatiePost
  label: string
  /** Uit de calculatie, bij dit aantal — dus per stuk × aantal. */
  gecalculeerd: number
  werkelijk: number
  /** Verschil in euro's en als deel van het gecalculeerde bedrag. */
  verschil: number
  verschilPct: number | null
  /** Toelichting die het scherm onder de post zet, bv. "DMG 2:00 u → 3:15 u". */
  toelichting: string
}

export interface GemetenUren {
  /** Alleen afgeronde registraties tellen mee; lopend werk is nog geen feit. */
  instellenSeconden: number
  draaienSeconden: number
  instellenKosten: number
  draaienKosten: number
  /** Uren die onbemand liepen — die kosten geen operator. */
  onbemandSeconden: number
  /** Aantal registraties, zodat het scherm "nog niet gemeten" kan onderscheiden. */
  aantalRegistraties: number
}

export interface NacalculatieInput {
  qty: number
  /** Per stuk, zoals computeEstimateTotals hem teruggeeft. */
  geschat: EstimateTotals
  gemeten: GemetenUren
  /**
   * Werkelijk materiaalverbruik in euro's over de hele order. Null als er nog
   * niets afgeboekt is — dan valt er over materiaal niets te zeggen en tonen we
   * het gecalculeerde bedrag ongewijzigd in plaats van een nul te suggereren.
   */
  materiaalWerkelijk: number | null
  externWerkelijk: number | null
  /** Wat de klant betaalt over de hele order; vastgelegd bij de offerte. */
  verkoopTotaal: number | null
}

export interface Nacalculatie {
  qty: number
  regels: NacalculatieRegel[]
  gecalculeerdTotaal: number
  werkelijkTotaal: number
  verschilTotaal: number
  verschilPct: number | null
  verkoopTotaal: number | null
  margeGecalculeerdPct: number | null
  margeWerkelijkPct: number | null
  margeWerkelijkEuro: number | null
  /** Zonder afgeronde registraties is dit een voorspelling, geen nacalculatie. */
  gemeten: boolean
  onbemandSeconden: number
}

function pct(verschil: number, basis: number): number | null {
  if (basis === 0) return null
  return (verschil / basis) * 100
}

function urenTekst(seconden: number): string {
  const min = Math.round(seconden / 60)
  const u = Math.floor(min / 60)
  const m = min % 60
  return u > 0 ? `${u}:${String(m).padStart(2, '0')} u` : `${m} min`
}

function minutenTekst(minuten: number): string {
  return urenTekst(minuten * 60)
}

export function bouwNacalculatie(input: NacalculatieInput): Nacalculatie {
  const { qty, geschat, gemeten } = input
  const n = Math.max(1, qty)

  // computeEstimateTotals rekent per stuk; de nacalculatie gaat over de hele
  // order, dus alles maal het aantal.
  const materiaalGecalc = geschat.materialTotal * n
  const instellenGecalc = geschat.setupTotal * n
  const draaienGecalc   = geschat.cycleTotal * n
  const externGecalc    = geschat.externalTotal * n

  // Zonder meting is "werkelijk" niet nul maar onbekend. Het gecalculeerde
  // bedrag overnemen laat het verschil op nul staan, wat eerlijker is dan een
  // besparing tonen die alleen bestaat omdat er niets geregistreerd is.
  const materiaalWerk = input.materiaalWerkelijk ?? materiaalGecalc
  const externWerk    = input.externWerkelijk ?? externGecalc
  const instellenWerk = gemeten.aantalRegistraties > 0 ? gemeten.instellenKosten : instellenGecalc
  const draaienWerk   = gemeten.aantalRegistraties > 0 ? gemeten.draaienKosten   : draaienGecalc

  // Setup telt één keer per batch, cyclus per stuk — beide komen exact uit de
  // calculatiekern, niet uit een verdeling achteraf.
  const setupMinGecalc = geschat.setupMin
  const cycleMinGecalc = geschat.cycleMinPerPiece * n

  const regels: NacalculatieRegel[] = [
    regel('materiaal', 'Materiaal', materiaalGecalc, materiaalWerk,
      input.materiaalWerkelijk === null ? 'nog niet afgeboekt' : 'afgeboekt bij de zaagbon'),
    regel('instellen', 'Instellen', instellenGecalc, instellenWerk,
      gemeten.aantalRegistraties > 0
        ? `${minutenTekst(setupMinGecalc)} → ${urenTekst(gemeten.instellenSeconden)}`
        : 'nog niet gemeten'),
    regel('draaien', 'Draaien', draaienGecalc, draaienWerk,
      gemeten.aantalRegistraties > 0
        ? `${minutenTekst(cycleMinGecalc)} → ${urenTekst(gemeten.draaienSeconden)}`
        : 'nog niet gemeten'),
    regel('extern', 'Uitbesteed', externGecalc, externWerk,
      input.externWerkelijk === null ? 'geen afwijking geregistreerd' : 'werkelijke factuur'),
  ]

  const gecalculeerdTotaal = regels.reduce((s, r) => s + r.gecalculeerd, 0)
  const werkelijkTotaal    = regels.reduce((s, r) => s + r.werkelijk, 0)
  const verschilTotaal     = werkelijkTotaal - gecalculeerdTotaal

  const verkoop = input.verkoopTotaal
  return {
    qty,
    regels,
    gecalculeerdTotaal,
    werkelijkTotaal,
    verschilTotaal,
    verschilPct: pct(verschilTotaal, gecalculeerdTotaal),
    verkoopTotaal: verkoop,
    margeGecalculeerdPct: verkoop && verkoop > 0 ? ((verkoop - gecalculeerdTotaal) / verkoop) * 100 : null,
    margeWerkelijkPct:    verkoop && verkoop > 0 ? ((verkoop - werkelijkTotaal) / verkoop) * 100 : null,
    margeWerkelijkEuro:   verkoop != null ? verkoop - werkelijkTotaal : null,
    gemeten: gemeten.aantalRegistraties > 0,
    onbemandSeconden: gemeten.onbemandSeconden,
  }
}

function regel(
  post: NacalculatiePost, label: string, gecalculeerd: number, werkelijk: number, toelichting: string,
): NacalculatieRegel {
  const verschil = werkelijk - gecalculeerd
  return { post, label, gecalculeerd, werkelijk, verschil, verschilPct: pct(verschil, gecalculeerd), toelichting }
}

/**
 * Geadviseerde insteltijd uit de metingen: het gemiddelde van de afgeronde
 * instelregistraties, afgerond op vijf minuten. Onder de drie metingen geven we
 * geen advies — twee toevallige uitschieters mogen geen norm worden.
 */
export function adviesInstelMinuten(secondenPerMeting: number[]): number | null {
  if (secondenPerMeting.length < 3) return null
  const gem = secondenPerMeting.reduce((s, v) => s + v, 0) / secondenPerMeting.length
  return Math.max(5, Math.round(gem / 60 / 5) * 5)
}

/**
 * Idem voor cyclustijd per stuk: totaal gedraaide seconden gedeeld door het
 * aantal gemaakte stuks, afgerond op een halve minuut.
 */
export function adviesCycleMinuten(draaienSeconden: number, stuks: number): number | null {
  if (stuks <= 0 || draaienSeconden <= 0) return null
  const minPerStuk = draaienSeconden / 60 / stuks
  return Math.round(minPerStuk * 2) / 2
}
