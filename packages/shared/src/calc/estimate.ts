/**
 * De calculatiekern: kostprijs en verkoopprijs uit een artikelcalculatie.
 *
 * Staat in `shared` en niet in de web-app omdat de API hem ook nodig heeft —
 * bij het accepteren van een offerte wordt hier de kostprijs van de snapshot
 * mee bepaald. Zou de frontend die meesturen, dan hing je prijshistorie af van
 * welk scherm de order toevallig aanmaakte. Zuivere rekenkunde: geen fetch,
 * geen browser, geen Prisma.
 */

import type { VolumeFormula } from '../schemas/profile'
import { brutoLengte, laderVoorRegel, materiaalBehoefte } from './bruto-lengte'
export type { VolumeFormula }

export interface ArticleRecipe {
  profileId: string
  gradeId: string
  dimensions: Record<string, number>
  lengthPerPieceMm: number
}

export interface EstimateStep {
  id: string
  name: string
  cycleMin: number
}

export type EstimateNodeType = 'material' | 'machine' | 'external'

export interface EstimateNode {
  id: string
  type: EstimateNodeType
  name: string
  gradeId?: string | null
  profileId?: string | null
  dimensions?: Record<string, number> | null
  lengthMm?: number | null
  qty?: number
  costOverride?: number | null
  machineId?: string | null
  setupMin?: number
  rateOverride?: number | null
  steps?: EstimateStep[]
  externalCost?: number | null
  note?: string | null
  /**
   * Exoot (2026-10-06): op maat besteld bij de leverancier, voor één klant.
   * Rekent met de geleverde maat zelf — geen zaagsnede, vlak of lader — en
   * gedeeld door het aantal werkstukken dat uit één exoot komt.
   */
  exoot?: boolean
  rawMaterialId?: string | null
  /** Werkstukken uit één exoot; 1 als leeg. */
  stuksUitEen?: number | null
  /**
   * Stangenlader (2026-10-09): de draaibank waarvan de lader deze regel van de
   * stang draait. Leeg = geen lader, alleen lengtemateriaal. Zie `bruto-lengte.ts`.
   */
  laderMachineId?: string | null
}

export interface ArticleEstimate {
  marginPct: number
  nodes: EstimateNode[]
  updatedAt: string
}

export interface EstimateMachine {
  id: string
  name?: string
  machineRatePerHour: number
  operatorRatePerHour: number
  heeftStangenlader?: boolean
  opspanlengteMm?: number
  afsteekMm?: number
  barloaderMinMm?: number
  barloaderMaxMm?: number
}

export interface EstimateCtx {
  grades: { id: string; densityKgM3: number; pricePerKg?: number }[]
  /** Met de stangenladervelden rekent het materiaal met bruto lengte (`bruto-lengte.ts`). */
  machines: EstimateMachine[]
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
  /** Insteltijd in minuten, één keer per batch. */
  setupMin: number
  /** Cyclustijd in minuten per stuk. */
  cycleMinPerPiece: number
}

// setupMin en cycleMinPerPiece staan er sinds de nacalculatie (2026-09-13).
// timeMin alleen was niet genoeg: die telt setup en cyclus bij elkaar op, en ze
// achteraf uit elkaar halen via de kostenverhouding klopt alleen als elke
// machine hetzelfde uurtarief heeft. Hier zijn ze exact bekend, dus geef ze mee.

// Weight (kg) from profile formula + dimensions + length + grade density.
// Volume in mm³ → m³ (÷ 1e9) × density. Mirrors features/34-grades-profiles.md.
export function computeWeightKg(
  volumeFormula: VolumeFormula,
  dims: Record<string, number>,
  lengthMm: number,
  densityKgM3: number,
): number {
  let area = 0 // mm²
  switch (volumeFormula) {
    case 'round':  area = Math.PI * Math.pow((dims.diameter ?? 0) / 2, 2); break
    case 'square': area = Math.pow(dims.side ?? 0, 2); break
    case 'flat':   area = (dims.width ?? 0) * (dims.height ?? 0); break
    case 'tube':   area = Math.PI * (Math.pow((dims.outerDiameter ?? 0) / 2, 2) - Math.pow((dims.innerDiameter ?? 0) / 2, 2)); break
  }
  const volumeMm3 = area * (lengthMm || 0)
  return (volumeMm3 / 1e9) * densityKgM3
}

/** De netto lengte per stuk: die van de regel, anders die van het recept. */
export function nettoLengte(node: { lengthMm?: number | null }, ctx: EstimateCtx): number {
  return node.lengthMm ?? ctx.recipe?.lengthPerPieceMm ?? 0
}

/**
 * Per-piece material cost for a node: override, else weight × grade €/kg.
 * Uses node-level profileId/dimensions when set; falls back to recipe.
 *
 * Over de bruto lengte (`brutoLengte`): netto plus vlak en zaagsnede, en met
 * de lader van de regel (`laderMachineId`) ook afsteek en grijpstuk.
 * Met `aantal` rekent hij met wat er voor dat aantal echt gezaagd wordt
 * (`materiaalBehoefte`: hele laderstangen, gelijk verdeeld); zonder aantal met
 * een volle laderstang — de prijs per stuk van het artikel zelf.
 */
export function materialCostPerPiece(
  node: {
    gradeId?: string | null
    profileId?: string | null
    dimensions?: Record<string, number> | null
    lengthMm?: number | null
    costOverride?: number | null
    exoot?: boolean
    stuksUitEen?: number | null
    laderMachineId?: string | null
  },
  ctx: EstimateCtx,
  aantal?: number,
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
  if (node.exoot) {
    const kg = computeWeightKg(formula, dims, node.lengthMm ?? 0, g.densityKgM3)
    return (kg * (g.pricePerKg ?? 0)) / stuksUitEen(node)
  }
  const lader = laderVoorRegel(node, ctx.machines)
  const netto = nettoLengte(node, ctx)
  const len = aantal != null && aantal > 0
    ? materiaalBehoefte(netto, lader, aantal).perStukMm
    : brutoLengte(netto, lader).brutoMm
  const kg = computeWeightKg(formula, dims, len, g.densityKgM3)
  return kg * (g.pricePerKg ?? 0)
}

/** Werkstukken uit één exoot, minstens 1. */
export function stuksUitEen(node: { stuksUitEen?: number | null }): number {
  return Math.max(1, Math.floor(node.stuksUitEen ?? 1) || 1)
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
  machines: EstimateMachine[],
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
 *
 * Materiaal: zonder `qty` per stuk uit een volle laderstang; met `qty` wat er
 * voor dat aantal echt gezaagd wordt (`materiaalBehoefte`, 2026-10-09).
 */
export function computeEstimateTotals(est: ArticleEstimate, ctx: EstimateCtx, qty?: number): EstimateTotals {
  const n = Math.max(1, qty ?? 1)
  let materialTotal = 0, cyclePerPiece = 0, setupTotal = 0, externalBatchTotal = 0, timeMin = 0
  let setupMin = 0, cycleMinPerPiece = 0

  for (const node of est.nodes) {
    if (node.type === 'material') {
      // Geen aantal per materiaalregel meer (2026-10-09): het recept is voor
      // één stuk; hoeveel stuks bepaalt de offerte, en dat zit in `qty`. Een
      // exoot houdt zijn aantal (zoveel exoten per werkstuk, `ExootRegel`).
      const perWerkstuk = node.exoot ? (node.qty ?? 1) : 1
      materialTotal += perWerkstuk * materialCostPerPiece(node, ctx, qty)
    } else if (node.type === 'machine') {
      const nodeSetupMin = node.setupMin || 0
      const cycleMin = (node.steps ?? []).reduce((s, st) => s + (st.cycleMin || 0), 0)
      const rate = machineRatePerHour(node, ctx)
      setupTotal += (nodeSetupMin / 60) * rate
      cyclePerPiece += (cycleMin / 60) * rate
      timeMin += nodeSetupMin + n * cycleMin
      setupMin += nodeSetupMin
      cycleMinPerPiece += cycleMin
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
    externalTotal, cost, marginPct, sell, timeMin, setupMin, cycleMinPerPiece,
  }
}

/** "1:30 u" / "45 min" — per SPEC §9 minToHm. */
export function minToHm(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')} u` : `${m} min`
}
