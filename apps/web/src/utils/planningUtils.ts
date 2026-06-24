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

export function weekDagen(maandag: Date): Date[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(maandag)
    d.setDate(maandag.getDate() + i)
    return d
  })
}

export function getMaandag(referentie = new Date()): Date {
  const d = new Date(referentie)
  const dag = d.getDay()
  const diff = dag === 0 ? -6 : 1 - dag
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function formatDagHeader(d: Date): { kort: string; lang: string; isVandaag: boolean } {
  const vandaag = toDateStr(new Date())
  const DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
  return {
    kort: DAGEN[d.getDay()],
    lang: d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
    isVandaag: toDateStr(d) === vandaag,
  }
}

// ── Board data model ──────────────────────────────────────────────────────────

export interface PlanningStapItem {
  stap: ProductieStap
  order: ProductieOrder
  project: Project
  duurMin: number
  isPlaceholder: boolean
}

export interface CelCapaciteit {
  geboektMin: number
  effectiefMin: number  // = EFFECTIEVE_MIN
  maxMin: number        // = MAX_MIN
  overboekt: boolean
  pctGebruikt: number   // 0-1 relative to effectiefMin
}

export function berekenCelCapaciteit(items: PlanningStapItem[]): CelCapaciteit {
  const geboektMin = items.reduce((s, i) => s + i.duurMin, 0)
  return {
    geboektMin,
    effectiefMin: EFFECTIEVE_MIN,
    maxMin: MAX_MIN,
    overboekt: geboektMin > EFFECTIEVE_MIN,
    pctGebruikt: Math.min(geboektMin / EFFECTIEVE_MIN, 1.5),
  }
}

// ── Deadline check ────────────────────────────────────────────────────────────

export function deadlineDagen(project: Project, geplandDatum: string | null | undefined): number | null {
  if (!project.levertijdDatum || !geplandDatum) return null
  const deadline = new Date(project.levertijdDatum)
  const gepland  = new Date(geplandDatum)
  return Math.floor((deadline.getTime() - gepland.getTime()) / (1000 * 60 * 60 * 24))
}

export function deadlineKleur(dagen: number | null): 'ok' | 'warn' | 'danger' | 'none' {
  if (dagen === null) return 'none'
  if (dagen > 5) return 'ok'
  if (dagen >= 0) return 'warn'
  return 'danger'
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

// ── Machine week capacity ─────────────────────────────────────────────────────

export function berekenMachineWeekCap(
  items: PlanningStapItem[],
  machine: string,
  datums: string[],
): { geboektMin: number; pctGebruikt: number; overboekt: boolean } {
  const relevant = items.filter(i =>
    (i.stap.geplandMachine ?? i.stap.machine ?? '') === machine &&
    datums.includes(i.stap.geplandDatum ?? '') &&
    !i.stap.gereedOp,
  )
  const geboektMin = relevant.reduce((s, i) => s + i.duurMin, 0)
  const weekEffMin = datums.length * EFFECTIEVE_MIN
  return {
    geboektMin,
    pctGebruikt: weekEffMin > 0 ? Math.min(geboektMin / weekEffMin, 1.5) : 0,
    overboekt: geboektMin > weekEffMin,
  }
}

// ── Past-week overdue items ───────────────────────────────────────────────────

export function vindAchterstanden(items: PlanningStapItem[]): PlanningStapItem[] {
  const vandaag = toDateStr(new Date())
  return items.filter(i =>
    i.stap.geplandDatum != null &&
    i.stap.geplandDatum < vandaag &&
    !i.stap.gereedOp,
  )
}

// ── Step order (volgorde) warning ─────────────────────────────────────────────

export function heeftVolgordeWaarschuwing(item: PlanningStapItem): boolean {
  const { stap, order } = item
  const myVolgorde = stap.volgorde ?? 0
  if (myVolgorde <= 1) return false
  return order.stappen.some(s => {
    const v = s.volgorde ?? 0
    return v > 0 && v < myVolgorde && !s.gereedOp && (
      !s.geplandDatum ||
      (stap.geplandDatum != null && s.geplandDatum >= stap.geplandDatum)
    )
  })
}

// ── Projects with deadline on a specific date ─────────────────────────────────

export function projectenOpDatum(projects: Project[], datum: string): Project[] {
  return projects.filter(p => p.levertijdDatum === datum)
}

// ── Offerte belasting ─────────────────────────────────────────────────────────

export interface OfferteLastItem {
  project: Project
  totalMin: number
  aantalRegels: number
}

export function berekenOffertebelasting(
  projects: Project[],
  articles: Article[],
): OfferteLastItem[] {
  return projects
    .filter(p => p.offertes.some(o => o.status === 'verzonden'))
    .map(p => {
      const verzonden = p.offertes.filter(o => o.status === 'verzonden')
      let totalMin = 0
      let aantalRegels = 0
      for (const off of verzonden) {
        for (const regel of off.regels) {
          if (!regel.artikelId) continue
          aantalRegels++
          const fakeOrder: ProductieOrder = {
            id: '', projectId: p.id, offerteRegelId: regel.id,
            artikelId: regel.artikelId, artikelNaam: regel.naam,
            qty: regel.qty, eenheid: regel.eenheid,
            stappen: [], status: 'gepland',
            createdAt: '', updatedAt: '',
          }
          const { min } = berekenOrderMin(fakeOrder, articles)
          totalMin += min
        }
      }
      return { project: p, totalMin, aantalRegels }
    })
    .filter(item => item.aantalRegels > 0)
}
