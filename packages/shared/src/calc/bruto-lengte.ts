/**
 * Hoeveel materiaal een stuk werkelijk kost, in mm (2026-10-06).
 *
 * De calculatie rekende met de kale lengte van het werkstuk, terwijl het
 * zaagplan bij het aanmaken van de opdracht (`zaagplan.ts`) ook de zaagsnede,
 * het afvlakken, het afsteken en het opspanstukje per laderstang meetelt. Bij
 * een kort draaideel scheelde dat ruim 20 %. Hier dezelfde opbouw, zodat de
 * offerte rekent met wat de zaag en de draaibank er echt van maken.
 *
 *   zonder lader   bruto = netto + vlak + zaagsnede
 *   met lader      stuk  = netto + vlak + afsteek + zaagsnede
 *                  k     = stuks per laderstang = ⌊(max − opspan) / stuk⌋, minstens 1
 *                  bruto = stuk + opspan / k
 *
 * De lader telt alleen mee als er in de bewerkingen een draaibank met
 * stangenlader staat (afgesproken 2026-10-06); bij alleen zagen of frezen is er
 * geen afsteek en geen opspanstukje.
 */

/** Werkplaatsstandaard: hoort bij de zaag, niet bij een machine. */
export const ZAAG_STANDAARD = { steekbreedte: 3, vlakToeslag: 3 } as const

export interface LaderGegevens {
  machineNaam: string
  opspanlengteMm: number
  afsteekMm: number
  barloaderMaxMm: number
}

export interface BrutoOpbouw {
  nettoMm: number
  brutoMm: number
  vlakMm: number
  zaagsnedeMm: number
  /** 0 zonder lader. */
  afsteekMm: number
  /** Het deel van het opspanstukje per stuk; 0 zonder lader. */
  opspanPerStukMm: number
  /** Stuks per laderstang; null zonder lader. */
  stuksPerLaderstang: number | null
  lader: LaderGegevens | null
}

export function brutoLengte(nettoMm: number, lader: LaderGegevens | null): BrutoOpbouw {
  const netto = Math.max(0, nettoMm || 0)
  const { steekbreedte, vlakToeslag } = ZAAG_STANDAARD
  if (!netto) {
    return { nettoMm: 0, brutoMm: 0, vlakMm: 0, zaagsnedeMm: 0, afsteekMm: 0, opspanPerStukMm: 0, stuksPerLaderstang: null, lader }
  }
  if (!lader) {
    return {
      nettoMm: netto, brutoMm: netto + vlakToeslag + steekbreedte, vlakMm: vlakToeslag, zaagsnedeMm: steekbreedte,
      afsteekMm: 0, opspanPerStukMm: 0, stuksPerLaderstang: null, lader: null,
    }
  }
  const stuk = netto + vlakToeslag + lader.afsteekMm + steekbreedte
  const k = Math.max(1, Math.floor((lader.barloaderMaxMm - lader.opspanlengteMm) / stuk))
  const opspanPerStuk = lader.opspanlengteMm / k
  return {
    nettoMm: netto, brutoMm: stuk + opspanPerStuk, vlakMm: vlakToeslag, zaagsnedeMm: steekbreedte,
    afsteekMm: lader.afsteekMm, opspanPerStukMm: opspanPerStuk, stuksPerLaderstang: k, lader,
  }
}

/**
 * De draaibank met lader in de bewerkingen van deze calculatie, of `null`.
 * Staan er meer, dan telt de eerste — die pakt de stang als eerste vast.
 */
export function laderVan(
  nodes: { type: string; machineId?: string | null }[],
  machines: { id: string; name?: string; heeftStangenlader?: boolean; opspanlengteMm?: number; afsteekMm?: number; barloaderMaxMm?: number }[],
): LaderGegevens | null {
  for (const n of nodes) {
    if (n.type !== 'machine' || !n.machineId) continue
    const m = machines.find((x) => x.id === n.machineId)
    if (m?.heeftStangenlader) {
      return {
        machineNaam: m.name ?? '',
        opspanlengteMm: m.opspanlengteMm ?? 30,
        afsteekMm: m.afsteekMm ?? 3,
        barloaderMaxMm: m.barloaderMaxMm ?? 1100,
      }
    }
  }
  return null
}
