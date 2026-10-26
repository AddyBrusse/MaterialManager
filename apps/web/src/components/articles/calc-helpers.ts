import type { ArticleEstimate, ArticleRecipe, EstimateNode } from '../../api/articles'
import { computeEstimateTotals, type EstimateCtx } from '../../api/estimate'
import { formatDimensions, type ProfileInfo } from '../../api/raw-materials'

export const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
export const eur = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const num = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })

/** Stable key for a dimensions object regardless of key insertion order. */
export const dimsKey = (d: Record<string, number>) =>
  JSON.stringify(Object.fromEntries(Object.keys(d).sort().map(k => [k, d[k]])))

/**
 * Een getal zoals iemand het intypt: "3,71", "3.71" of "1.250,5" (2026-10-23).
 * De velden van de calculator toonden "3.71" omdat een `type="number"`-veld
 * de notatie van de browser volgt en niet die van de app. `null` als er geen
 * getal in staat.
 */
export function leesGetal(tekst: string): number | null {
  const t = tekst.trim().replace(/\s/g, '')
  if (t === '') return null
  // Komma én punt: de laatste is de decimaalscheiding ("1.250,5" of "1,250.5").
  const genormaliseerd = t.includes(',') && t.includes('.')
    ? (t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''))
    : t.replace(',', '.')
  const n = Number(genormaliseerd)
  return Number.isFinite(n) ? n : null
}

/** Getal voor in een invulveld: Nederlandse komma, geen duizendtalpunt. */
export function toonGetal(n: number, decimalen = 2): string {
  return n.toLocaleString('nl-NL', { maximumFractionDigits: decimalen, useGrouping: false })
}

/** "32,5 min" onder het uur, "2:15 u" erboven — één tijd per machineregel. */
export function duurTekst(min: number): string {
  if (min < 60) return `${num(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m === 60 ? `${h + 1}:00 u` : `${h}:${String(m).padStart(2, '0')} u`
}

/** "S355 — Ø50 mm" style label from grade + profile + dims. */
export function materialName(
  gradeId: string | null, profileId: string | null, dims: Record<string, number> | null,
  grades: { id: string; name: string }[], profiles: ProfileInfo[],
): string {
  const g = grades.find(x => x.id === gradeId)
  if (!g) return 'Nieuw materiaal'
  const p = profileId ? profiles.find(x => x.id === profileId) : null
  const dimStr = p && dims ? formatDimensions(p, dims) : ''
  return [g.name, dimStr].filter(Boolean).join(' — ')
}

/** De materiaalregel die het recept is: de eerste die uit voorraad komt (geen exoot). */
function hoofdmateriaal(est: ArticleEstimate): EstimateNode | undefined {
  return est.nodes.find(n =>
    n.type === 'material' && !n.exoot && !!n.gradeId && !!n.profileId &&
    !!n.dimensions && Object.keys(n.dimensions).length > 0,
  )
}

/**
 * Het recept (kwaliteit, vorm, maat, lengte) dat bij deze calculatie hoort.
 *
 * - een hoofdmateriaal → dat is het recept
 * - het laatste hoofdmateriaal is net weggehaald → `null`: het recept leeg
 *   maken (2026-10-23). Bleef het staan, dan stelde de materiaalselectie het
 *   weggehaalde materiaal nog steeds voor.
 * - er was er al geen → `undefined`: niet aankomen. Oude artikelen hebben
 *   soms alleen het receptveld en nog geen materiaalregel; die zou elke
 *   wijziging aan de marge anders hun recept kosten.
 */
export function receptUitCalculatie(est: ArticleEstimate, vorige: ArticleEstimate | null): ArticleRecipe | null | undefined {
  const mat = hoofdmateriaal(est)
  if (mat) {
    return {
      gradeId: mat.gradeId!, profileId: mat.profileId!,
      dimensions: mat.dimensions as Record<string, number>,
      lengthPerPieceMm: mat.lengthMm ?? 0,
    }
  }
  return vorige && hoofdmateriaal(vorige) ? null : undefined
}

/** De aantallen naast "per stuk" in de prijskaart (2026-10-23). */
const STAFFEL = [10, 25, 50]

/** Verkoopprijs per stuk bij een aantal: insteltijd en uitbesteding verdeeld over de serie. */
export function staffelPrijzen(est: ArticleEstimate, ctx: EstimateCtx, aantallen = STAFFEL): { aantal: number; perStuk: number }[] {
  return aantallen.map(aantal => ({ aantal, perStuk: computeEstimateTotals(est, ctx, aantal).sell }))
}
