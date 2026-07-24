import { computeWeightKg } from './raw-materials'
import type { ArticleEstimate, ArticleRecipe, EstimateNode } from './articles'

type VolumeFormula = 'round' | 'square' | 'flat' | 'tube'

export interface EstimateCtx {
  grades: { id: string; densityKgM3: number; pricePerKg?: number }[]
  machines: { id: string; machineRatePerHour: number; operatorRatePerHour: number }[]
  profiles?: { id: string; volumeFormula: string }[]
  recipe: ArticleRecipe | null
  profileFormula?: VolumeFormula // formula for recipe.profileId (resolved by caller)
}

export interface EstimateTotals {
  materialTotal: number
  machiningTotal: number
  /** Per-unit machine setup cost only (part of machiningTotal). Split out so the
   *  price-buildup Sankey / legend can show "Setuptijd" apart from cycle time. */
  setupTotal: number
  /** Per-unit machine cycle cost only (part of machiningTotal). */
  cycleTotal: number
  externalTotal: number
  cost: number
  marginPct: number
  sell: number
  timeMin: number
}

/** Per-piece material cost for a node: override, else weight × grade €/kg.
 *  Uses node-level profileId/dimensions when set; falls back to recipe. */
export function materialCostPerPiece(
  node: {
    gradeId?: string | null
    profileId?: string | null
    dimensions?: Record<string, number> | null
    lengthMm?: number | null
    costOverride?: number | null
  },
  ctx: EstimateCtx,
): number {
  if (node.costOverride != null) return node.costOverride
  if (!node.gradeId) return 0
  const g = ctx.grades.find(x => x.id === node.gradeId)
  if (!g) return 0
  // Resolve formula: node's profile → recipe's profile
  const nodeProfile = node.profileId ? ctx.profiles?.find(p => p.id === node.profileId) : null
  const formula = (nodeProfile?.volumeFormula ?? ctx.profileFormula) as VolumeFormula | undefined
  // Resolve dimensions: node's own → recipe's
  const dims = node.dimensions && Object.keys(node.dimensions).length > 0
    ? node.dimensions
    : ctx.recipe?.dimensions
  if (!formula || !dims) return 0
  const len = node.lengthMm ?? ctx.recipe?.lengthPerPieceMm ?? 0
  const kg = computeWeightKg(formula, dims, len, g.densityKgM3)
  return kg * (g.pricePerKg ?? 0)
}

/** € per uur for a machine node: override, else machine + operator rate. */
export function machineRatePerHour(
  node: { machineId?: string | null; rateOverride?: number | null },
  ctx: EstimateCtx,
): number {
  if (node.rateOverride != null) return node.rateOverride
  const m = node.machineId ? ctx.machines.find(x => x.id === node.machineId) : undefined
  return m ? m.machineRatePerHour + m.operatorRatePerHour : 0
}

/** Build an EstimateCtx from raw query data + the article's recipe. */
export function buildEstimateCtx(
  article: { recipe: ArticleRecipe | null },
  grades: { id: string; densityKgM3: number; pricePerKg?: number }[],
  profiles: { id: string; volumeFormula: string }[],
  machines: { id: string; machineRatePerHour: number; operatorRatePerHour: number }[],
): EstimateCtx {
  return {
    grades, machines, profiles,
    recipe: article.recipe,
    profileFormula: profiles.find(p => p.id === article.recipe?.profileId)?.volumeFormula as VolumeFormula | undefined,
  }
}

/** Total minutes for a machine node: synthetic setup step + all steps. */
export function machineMinutes(node: Pick<EstimateNode, 'setupMin' | 'steps'>): number {
  return (node.setupMin || 0) + (node.steps ?? []).reduce((s, st) => s + (st.cycleMin || 0), 0)
}

/**
 * Per-unit totals for an order of `qty` pieces (default 1 — the article's
 * own "per piece" price before it's tied to any order size, e.g. on the
 * article detail/calculator pages). Setup time (once per machine, however
 * many pieces run through it in one production run) and external/
 * outsourcing cost (once per operation, e.g. one batch sent to a coating
 * vendor) are one-time costs for the whole batch: they're charged once,
 * then divided across `qty` here — NOT multiplied by qty the way material
 * cost and per-piece cycle time are. At qty=1 this is identical to charging
 * everything once, so existing single-piece quotes are unaffected.
 */
export function computeEstimateTotals(est: ArticleEstimate, ctx: EstimateCtx, qty = 1): EstimateTotals {
  const n = Math.max(1, qty)
  let materialTotal = 0, cyclePerPiece = 0, setupTotal = 0, externalBatchTotal = 0, timeMin = 0

  for (const node of est.nodes) {
    if (node.type === 'material') {
      materialTotal += (node.qty ?? 1) * materialCostPerPiece(node, ctx)
    } else if (node.type === 'machine') {
      const setupMin = node.setupMin || 0
      const cycleMin = (node.steps ?? []).reduce((s, st) => s + (st.cycleMin || 0), 0)
      const rate = machineRatePerHour(node, ctx)
      setupTotal += (setupMin / 60) * rate
      cyclePerPiece += (cycleMin / 60) * rate
      timeMin += setupMin + n * cycleMin
    } else if (node.type === 'external') {
      externalBatchTotal += (node.qty ?? 1) * (node.externalCost ?? 0)
    }
  }

  const setupPerUnit = setupTotal / n
  const machiningTotal = cyclePerPiece + setupPerUnit
  const externalTotal = externalBatchTotal / n
  const cost = materialTotal + machiningTotal + externalTotal
  const marginPct = est.marginPct || 0
  const sell = cost * (1 + marginPct / 100)
  return {
    materialTotal, machiningTotal, setupTotal: setupPerUnit, cycleTotal: cyclePerPiece,
    externalTotal, cost, marginPct, sell, timeMin,
  }
}

/** "1:30 u" / "45 min" — per SPEC §9 minToHm. */
export function minToHm(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')} u` : `${m} min`
}
