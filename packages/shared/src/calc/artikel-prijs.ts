import {
  buildEstimateCtx, computeEstimateTotals,
  type ArticleEstimate, type ArticleRecipe, type EstimateTotals,
} from './estimate'

/**
 * Kostprijs en verkoopprijs van één artikel.
 *
 * Staat in `shared` omdat drie plekken hem nodig hebben — de artikelkiezer, de
 * mail-import en (server-side) de prijssnapshot bij het accepteren van een
 * offerte — en die het over de prijs eens moeten zijn: hij belandt op een
 * offerte die naar een klant gaat.
 */

export interface PrijsBronnen {
  grades: { id: string; densityKgM3: number; pricePerKg?: number }[]
  profiles: { id: string; volumeFormula: string }[]
  machines: { id: string; machineRatePerHour: number; operatorRatePerHour: number }[]
}

/** Het minimum dat je van een artikel nodig hebt om te rekenen. */
export interface CalcArtikel {
  recipe: ArticleRecipe | null
  estimate: ArticleEstimate | null
}

export interface ArtikelPrijs {
  kostprijs: number
  marge: number
  verkoopprijs: number
}

/** De volledige opbouw, of null als er niets te rekenen valt. Gebruikt door de
 *  prijssnapshot: zonder opbouw zie je later wel *dat* de kostprijs steeg,
 *  maar niet of het het materiaal was of je uurtarief. */
export function kostprijsOpbouw(
  artikel: CalcArtikel, bronnen: PrijsBronnen, qty = 1,
): EstimateTotals | null {
  if (!artikel.estimate) return null
  try {
    const ctx = buildEstimateCtx(artikel, bronnen.grades, bronnen.profiles, bronnen.machines)
    return computeEstimateTotals(artikel.estimate, ctx, qty)
  } catch {
    return null
  }
}

/**
 * Let op de `qty`: instel- en uitbesteedkosten gelden één keer per batch, niet
 * per stuk. De kostprijs per stuk daalt dus als het aantal stijgt, en moet
 * daarom bij het juiste aantal berekend worden — niet bij 1 en dan
 * doorgerekend.
 */
export function kostprijsVoor(artikel: CalcArtikel, bronnen: PrijsBronnen, qty = 1): number {
  // Een onvolledige calculatie (ontbrekend materiaal, kapotte formule) mag geen
  // scherm slopen; 0 is zichtbaar fout en dwingt een handmatige prijs af.
  return kostprijsOpbouw(artikel, bronnen, qty)?.cost ?? 0
}

export function prijsVoor(artikel: CalcArtikel, bronnen: PrijsBronnen, qty = 1): ArtikelPrijs {
  const kostprijs = kostprijsVoor(artikel, bronnen, qty)
  const marge = Math.round(artikel.estimate?.marginPct ?? 20)
  return {
    kostprijs,
    marge,
    verkoopprijs: Math.round(kostprijs * (1 + marge / 100) * 100) / 100,
  }
}

/** Machinenamen uit de calculatie — komen als "bewerkingen" op de offerteregel. */
export function bewerkingenVan(artikel: CalcArtikel): string[] {
  if (!artikel.estimate) return []
  const seen = new Set<string>()
  return artikel.estimate.nodes
    .filter((n) => n.type === 'machine' && n.name)
    .map((n) => n.name)
    .filter((name) => (seen.has(name) ? false : (seen.add(name), true)))
}
