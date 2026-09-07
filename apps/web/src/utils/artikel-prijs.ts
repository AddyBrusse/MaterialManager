import { buildEstimateCtx, computeEstimateTotals } from '../api/estimate'
import type { Article } from '../api/articles'
import type { Grade, Machine, Profile } from '@stockmanager/shared'

/**
 * Kostprijs en verkoopprijs van één artikel.
 *
 * Staat apart omdat twee schermen hem nodig hebben — de artikelkiezer en de
 * mail-import — en die twee het over de prijs eens moeten zijn: hij belandt op
 * een offerte die naar een klant gaat.
 */

export interface PrijsBronnen {
  grades: Grade[]
  profiles: Pick<Profile, 'id' | 'name' | 'volumeFormula'>[]
  machines: Machine[]
}

export interface ArtikelPrijs {
  kostprijs: number
  marge: number
  verkoopprijs: number
}

/**
 * Let op de `qty`: instel- en uitbesteedkosten gelden één keer per batch, niet
 * per stuk. De kostprijs per stuk daalt dus als het aantal stijgt, en moet
 * daarom bij het juiste aantal berekend worden — niet bij 1 en dan
 * doorgerekend.
 */
export function kostprijsVoor(article: Article, bronnen: PrijsBronnen, qty = 1): number {
  if (!article.estimate) return 0
  try {
    const ctx = buildEstimateCtx(
      article,
      bronnen.grades,
      bronnen.profiles.map((p) => ({ id: p.id, volumeFormula: p.volumeFormula })),
      bronnen.machines
    )
    return computeEstimateTotals(article.estimate, ctx, qty).cost
  } catch {
    // Een onvolledige calculatie (ontbrekend materiaal, kapotte formule) mag
    // geen scherm slopen; 0 is zichtbaar fout en dwingt een handmatige prijs af.
    return 0
  }
}

export function prijsVoor(article: Article, bronnen: PrijsBronnen, qty = 1): ArtikelPrijs {
  const kostprijs = kostprijsVoor(article, bronnen, qty)
  const marge = Math.round(article.estimate?.marginPct ?? 20)
  return {
    kostprijs,
    marge,
    verkoopprijs: Math.round(kostprijs * (1 + marge / 100) * 100) / 100,
  }
}

/** Machinenamen uit de calculatie — komen als "bewerkingen" op de offerteregel. */
export function bewerkingenVan(article: Article): string[] {
  if (!article.estimate) return []
  const seen = new Set<string>()
  return article.estimate.nodes
    .filter((n) => n.type === 'machine' && n.name)
    .map((n) => n.name as string)
    .filter((name) => (seen.has(name) ? false : (seen.add(name), true)))
}

export function materiaalVan(article: Article, bronnen: PrijsBronnen): string {
  if (!article.recipe) return '—'
  const p = bronnen.profiles.find((pr) => pr.id === article.recipe!.profileId)
  const g = bronnen.grades.find((gr) => gr.id === article.recipe!.gradeId)
  return [p?.name, g?.name].filter(Boolean).join(' · ') || '—'
}
