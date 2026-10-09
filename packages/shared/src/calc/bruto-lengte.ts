/**
 * Hoeveel materiaal een stuk werkelijk kost, in mm (2026-10-06, herzien 2026-10-09).
 *
 * De calculatie rekende met de kale lengte van het werkstuk, terwijl de zaag en
 * de draaibank er meer van maken. Hier dezelfde opbouw als het zaagplan
 * (`zaagplan.ts`), zodat de offerte rekent met wat er echt van de staaf gaat.
 *
 *   zonder lader   stuk  = netto + vlak + zaagsnede (elk stuk apart gezaagd)
 *   met lader      stuk  = netto + vlak + afsteek (op de draaibank, geen zaag)
 *                  k     = stuks per laderstang = ⌊(max − grijp) / stuk⌋, minstens 1
 *                  stang = k × stuk + grijp
 *                  bruto = (stang + zaagsnede) / k — één zaagsnede per laderstang
 *
 * Vlak is 3 mm per stuk: 1,5 aan de voorkant en 1,5 aan de achterkant.
 *
 * Of er met de lader gewerkt wordt, staat sinds 2026-10-09 op de
 * materiaalregel van het recept (`laderMachineId`), niet meer afgeleid uit de
 * bewerkingen: een draaibank met lader in het recept betekent niet dat dit
 * artikel van de stang komt. Grijp, afsteek en de lengtes van de lader horen
 * bij de machine — die verschillen per machine.
 */

/** Werkplaatsstandaard: hoort bij de zaag, niet bij een machine. */
export const ZAAG_STANDAARD = { steekbreedte: 3, vlakToeslag: 3 } as const

export interface LaderGegevens {
  machineId?: string
  machineNaam: string
  /** Grijplengte: het staartje dat de lader niet meer kan pakken, per laderstang. */
  opspanlengteMm: number
  afsteekMm: number
  barloaderMinMm: number
  barloaderMaxMm: number
}

export interface BrutoOpbouw {
  nettoMm: number
  /** Materiaal per stuk, alles meegeteld. */
  brutoMm: number
  vlakMm: number
  /** Zaagsnede per stuk: zonder lader een hele, met lader een deel van één per stang. */
  zaagsnedeMm: number
  /** 0 zonder lader. */
  afsteekMm: number
  /** Het deel van het grijpstuk per stuk; 0 zonder lader. */
  opspanPerStukMm: number
  /** Stuks per volle laderstang; null zonder lader. */
  stuksPerLaderstang: number | null
  /** Lengte van een volle laderstang; null zonder lader. */
  laderstangMm: number | null
  lader: LaderGegevens | null
}

/** Wat er per stuk van de stang gaat, vóór grijp en zaagsnede. */
export function stukOpStang(nettoMm: number, lader: LaderGegevens | null): number {
  const netto = Math.max(0, nettoMm || 0)
  if (!netto) return 0
  return lader ? netto + ZAAG_STANDAARD.vlakToeslag + lader.afsteekMm : netto + ZAAG_STANDAARD.vlakToeslag
}

/** Stuks op een volle laderstang (minstens 1). */
export function stuksPerStang(stukMm: number, lader: LaderGegevens): number {
  if (stukMm <= 0) return 0
  return Math.max(1, Math.floor((lader.barloaderMaxMm - lader.opspanlengteMm) / stukMm))
}

export function brutoLengte(nettoMm: number, lader: LaderGegevens | null): BrutoOpbouw {
  const netto = Math.max(0, nettoMm || 0)
  const { steekbreedte, vlakToeslag } = ZAAG_STANDAARD
  if (!netto) {
    return {
      nettoMm: 0, brutoMm: 0, vlakMm: 0, zaagsnedeMm: 0, afsteekMm: 0, opspanPerStukMm: 0,
      stuksPerLaderstang: null, laderstangMm: null, lader,
    }
  }
  if (!lader) {
    return {
      nettoMm: netto, brutoMm: netto + vlakToeslag + steekbreedte, vlakMm: vlakToeslag, zaagsnedeMm: steekbreedte,
      afsteekMm: 0, opspanPerStukMm: 0, stuksPerLaderstang: null, laderstangMm: null, lader: null,
    }
  }
  const stuk = stukOpStang(netto, lader)
  const k = stuksPerStang(stuk, lader)
  const stang = k * stuk + lader.opspanlengteMm
  return {
    nettoMm: netto, brutoMm: (stang + steekbreedte) / k, vlakMm: vlakToeslag, zaagsnedeMm: steekbreedte / k,
    afsteekMm: lader.afsteekMm, opspanPerStukMm: lader.opspanlengteMm / k,
    stuksPerLaderstang: k, laderstangMm: stang, lader,
  }
}

type LaderMachine = {
  id: string; name?: string; heeftStangenlader?: boolean
  opspanlengteMm?: number; afsteekMm?: number; barloaderMinMm?: number; barloaderMaxMm?: number
}

/**
 * De lader van een materiaalregel, of `null`: alleen als de regel er een
 * machine voor kiest én die machine een stangenlader heeft.
 */
export function laderVoorRegel(
  node: { laderMachineId?: string | null; exoot?: boolean },
  machines: LaderMachine[],
): LaderGegevens | null {
  if (!node.laderMachineId || node.exoot) return null
  const m = machines.find((x) => x.id === node.laderMachineId)
  if (!m?.heeftStangenlader) return null
  return {
    machineId: m.id,
    machineNaam: m.name ?? '',
    opspanlengteMm: m.opspanlengteMm ?? 30,
    afsteekMm: m.afsteekMm ?? 3,
    barloaderMinMm: m.barloaderMinMm ?? 500,
    barloaderMaxMm: m.barloaderMaxMm ?? 1200,
  }
}

/** Eén te zagen lengte: een laderstang, of zonder lader één stuk. */
export interface TeZagen {
  lengteMm: number
  stuks: number
}

export interface MateriaalBehoefte {
  aantal: number
  /** Lengte per stuk op de stang (zonder lader: werkstuk + vlak). */
  stukMm: number
  /** Stuks op een volle laderstang; null zonder lader. */
  stuksPerStang: number | null
  /** Wat er gezaagd moet worden, langste eerst. */
  stangen: TeZagen[]
  /** Alles bij elkaar, met een zaagsnede per lengte. */
  totaalMm: number
  /** `totaalMm / aantal`. */
  perStukMm: number
  /** Een stang is opgerekt tot de kortste lengte die de lader aankan. */
  aangevuldTotMin: boolean
}

/**
 * Wat er voor `aantal` stuks gezaagd moet worden (2026-10-09).
 *
 * Met lader: zo min mogelijk stangen, en de stuks daar **gelijk** over
 * verdeeld (afgesproken 2026-10-09) — 80 stuks bij 13 per stang wordt niet 6 × 13
 * plus een stompje van 2, maar 7 stangen van 11 of 12. Zo valt er geen stang
 * onder de kortste lengte die de lader aankan; gebeurt dat toch (heel weinig
 * stuks), dan wordt hij tot die lengte opgerekt.
 *
 * Zonder lader: elk stuk is een eigen zaagsnede.
 */
export function materiaalBehoefte(nettoMm: number, lader: LaderGegevens | null, aantal: number): MateriaalBehoefte {
  const n = Math.max(0, Math.floor(aantal || 0))
  const stuk = stukOpStang(nettoMm, lader)
  const zaag = ZAAG_STANDAARD.steekbreedte
  if (!stuk || !n) {
    const k = lader && stuk ? stuksPerStang(stuk, lader) : null
    return { aantal: n, stukMm: stuk, stuksPerStang: k, stangen: [], totaalMm: 0, perStukMm: 0, aangevuldTotMin: false }
  }
  if (!lader) {
    const stangen = Array.from({ length: n }, () => ({ lengteMm: stuk, stuks: 1 }))
    const totaalMm = n * (stuk + zaag)
    return { aantal: n, stukMm: stuk, stuksPerStang: null, stangen, totaalMm, perStukMm: totaalMm / n, aangevuldTotMin: false }
  }
  const k = stuksPerStang(stuk, lader)
  const aantalStangen = Math.ceil(n / k)
  const basis = Math.floor(n / aantalStangen)
  const extra = n % aantalStangen
  let aangevuld = false
  const stangen: TeZagen[] = []
  for (let i = 0; i < aantalStangen; i++) {
    const stuks = basis + (i < extra ? 1 : 0)
    let lengteMm = stuks * stuk + lader.opspanlengteMm
    if (lengteMm < lader.barloaderMinMm) { lengteMm = lader.barloaderMinMm; aangevuld = true }
    stangen.push({ lengteMm, stuks })
  }
  const totaalMm = stangen.reduce((s, x) => s + x.lengteMm + zaag, 0)
  return { aantal: n, stukMm: stuk, stuksPerStang: k, stangen, totaalMm, perStukMm: totaalMm / n, aangevuldTotMin: aangevuld }
}
