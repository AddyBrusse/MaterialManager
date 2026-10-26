import type { Article } from '../api/articles'
import { gradesApi } from '../api/grades'
import { profilesApi } from '../api/profiles'
import { formatDimensions } from '../api/raw-materials'

/**
 * De materiaalregels van een artikel, voor op documenten en in lijsten
 * (2026-10-23).
 *
 * Elke materiaalregel uit de calculatie, exoten ook — op een werkbon of
 * offerte hoort alles wat erin gaat, niet alleen de eerste regel. Zonder
 * calculatie het oude recept-veld.
 */
interface MateriaalRegelTekst {
  kwaliteit: string
  vorm: string
  /** "Ø50" of "40×20". */
  maat: string
  lengteMm: number | null
  exoot: boolean
}

export function materiaalRegelsVan(artikel: Pick<Article, 'estimate' | 'recipe'> | null | undefined): MateriaalRegelTekst[] {
  if (!artikel) return []
  const grades = gradesApi.listSync()
  const profiles = profilesApi.listSync()
  const knopen = (artikel.estimate?.nodes ?? []).filter((n) => n.type === 'material' && n.gradeId)
  const bron = knopen.length > 0
    ? knopen.map((n, i) => ({
        gradeId: n.gradeId!,
        profileId: n.profileId ?? (i === 0 ? artikel.recipe?.profileId : null) ?? null,
        dimensions: n.dimensions && Object.keys(n.dimensions).length > 0 ? n.dimensions : (i === 0 ? artikel.recipe?.dimensions ?? {} : {}),
        lengteMm: n.lengthMm ?? (i === 0 ? artikel.recipe?.lengthPerPieceMm : null) ?? null,
        exoot: !!n.exoot,
      }))
    : artikel.recipe
      ? [{ gradeId: artikel.recipe.gradeId, profileId: artikel.recipe.profileId, dimensions: artikel.recipe.dimensions, lengteMm: artikel.recipe.lengthPerPieceMm, exoot: false }]
      : []
  return bron.map((r) => {
    const p = profiles.find((x) => x.id === r.profileId)
    return {
      kwaliteit: grades.find((g) => g.id === r.gradeId)?.name ?? '',
      vorm: p?.name ?? '',
      maat: p && Object.keys(r.dimensions).length > 0 ? formatDimensions(p, r.dimensions) : '',
      lengteMm: r.lengteMm,
      exoot: r.exoot,
    }
  })
}

/** "C45 Rond Ø50 · L=120 mm" — één materiaalregel op één regel. */
export function materiaalRegelTekst(r: MateriaalRegelTekst): string {
  return [r.kwaliteit, r.vorm, r.maat, r.lengteMm ? `L=${r.lengteMm} mm` : null, r.exoot ? '(exoot)' : null]
    .filter(Boolean).join(' ')
}
