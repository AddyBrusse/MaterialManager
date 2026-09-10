import type { Article } from '../api/articles'
import type { Grade, Machine, Profile } from '@stockmanager/shared'

/**
 * De rekenkern staat in `@stockmanager/shared` (`calc/artikel-prijs.ts`) omdat
 * de API hem ook nodig heeft voor de prijssnapshot. Hier alleen doorgegeven,
 * plus `materiaalVan` — dat is een label voor het scherm, geen rekenwerk.
 */
export {
  kostprijsVoor, prijsVoor, bewerkingenVan, kostprijsOpbouw,
} from '@stockmanager/shared'
export type { ArtikelPrijs } from '@stockmanager/shared'

export interface PrijsBronnen {
  grades: Grade[]
  profiles: Pick<Profile, 'id' | 'name' | 'volumeFormula'>[]
  machines: Machine[]
}

export function materiaalVan(article: Article, bronnen: PrijsBronnen): string {
  if (!article.recipe) return '—'
  const p = bronnen.profiles.find((pr) => pr.id === article.recipe!.profileId)
  const g = bronnen.grades.find((gr) => gr.id === article.recipe!.gradeId)
  return [p?.name, g?.name].filter(Boolean).join(' · ') || '—'
}
