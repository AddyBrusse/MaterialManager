import type { Project, ProductieOrder, ProductieStap } from '@stockmanager/shared'
import type { Article } from '../api/articles'

// ── Capacity constants ────────────────────────────────────────────────────────

export const UREN_PER_DAG    = 7
export const EFFICIENTIE     = 0.70
export const EFFECTIEVE_MIN  = Math.round(UREN_PER_DAG * EFFICIENTIE * 60)  // 294 min = 4.9h
export const MAX_MIN         = UREN_PER_DAG * 60                              // 420 min = 7h
export const PLACEHOLDER_MIN = 3 * 60                                         // 180 min

// ── Duration calculation ──────────────────────────────────────────────────────

export function berekenOrderMin(
  order: ProductieOrder,
  articles: Article[],
): { min: number; isPlaceholder: boolean } {
  if (!order.artikelId) return { min: PLACEHOLDER_MIN, isPlaceholder: true }
  const artikel = articles.find(a => a.id === order.artikelId)
  if (!artikel?.estimate) return { min: PLACEHOLDER_MIN, isPlaceholder: true }
  const machineNodes = artikel.estimate.nodes.filter(n => n.type === 'machine')
  if (machineNodes.length === 0) return { min: PLACEHOLDER_MIN, isPlaceholder: true }
  const totalMin = machineNodes.reduce((sum, node) => {
    const cycleMin = (node.steps ?? []).reduce((s, step) => s + step.cycleMin, 0)
    return sum + cycleMin * order.qty + (node.setupMin ?? 0)
  }, 0)
  return { min: Math.max(1, Math.round(totalMin)), isPlaceholder: false }
}

export function berekenStapMin(
  _stap: ProductieStap,
  order: ProductieOrder,
  articles: Article[],
): { min: number; isPlaceholder: boolean } {
  const result = berekenOrderMin(order, articles)
  const nStappen = Math.max(1, order.stappen.length)
  return { min: Math.round(result.min / nStappen), isPlaceholder: result.isPlaceholder }
}

export function minToUren(min: number): string {
  const rounded = Math.round(min)
  const h = Math.floor(rounded / 60)
  const m = rounded % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}u`
  return `${h}u ${m}m`
}

// ── Drawing number (Region 1/4 "tekening") ──────────────────────────────────

export function tekeningFor(order: ProductieOrder, articles: Article[]): string | null {
  if (!order.artikelId) return null
  const art = articles.find(a => a.id === order.artikelId)
  if (!art?.tekening) return null
  return art.rev ? `${art.tekening}-${art.rev}` : art.tekening
}

// ── Week helpers ──────────────────────────────────────────────────────────────

export function toDateStr(d: Date): string {
  // toISOString() converts to UTC first — in any UTC+ timezone (e.g. NL) that
  // shifts a local-midnight Date back by one calendar day. Format from the
  // Date's own local fields instead so day-index round-trips stay exact.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getMaandag(referentie = new Date()): Date {
  const d = new Date(referentie)
  const dag = d.getDay()
  const diff = dag === 0 ? -6 : 1 - dag
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// ── Board data model ──────────────────────────────────────────────────────────

export interface PlanningStapItem {
  stap: ProductieStap
  order: ProductieOrder
  project: Project
  duurMin: number
  isPlaceholder: boolean
}

// ── Project accent color (deterministic per project id) ───────────────────────

const KLEUREN = [
  '#2d6df6', '#16a34a', '#d97706', '#9333ea',
  '#0891b2', '#dc2626', '#0d9488', '#7c3aed',
]

export function projectKleur(projectId: string): string {
  let hash = 0
  for (let i = 0; i < projectId.length; i++) hash = (hash * 31 + projectId.charCodeAt(i)) & 0xffffffff
  return KLEUREN[Math.abs(hash) % KLEUREN.length]
}

