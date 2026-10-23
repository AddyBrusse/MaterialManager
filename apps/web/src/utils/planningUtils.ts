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

/** De tijd van één machine in het recept: setup één keer, cyclus per stuk. */
export interface ReceptMachine {
  naam: string
  setupMin: number
  cycleMin: number
}

/**
 * De machines uit het recept zoals de stappen ervan gemaakt worden
 * (`bewerkingenVan`): op naam, in volgorde, één per machineknoop. Staat
 * dezelfde machine twee keer in het recept, dan zijn dat sinds 2026-10-23 twee
 * stappen, elk met de tijd van zijn eigen knoop.
 */
export function receptMachines(artikel: Article | undefined, machines: { id: string; name: string }[] = []): ReceptMachine[] {
  const uit: ReceptMachine[] = []
  for (const n of artikel?.estimate?.nodes ?? []) {
    if (n.type !== 'machine') continue
    const naam = (n.machineId ? machines.find(m => m.id === n.machineId)?.name : null) ?? n.name
    if (!naam) continue
    const cycleMin = (n.steps ?? []).reduce((s, st) => s + (st.cycleMin || 0), 0)
    uit.push({ naam, setupMin: n.setupMin ?? 0, cycleMin })
  }
  return uit
}

const zelfdeNaam = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Welke machine uit het recept hoort bij de stap op plek `index`?
 *
 * Op naam, en bij een machine die vaker in het recept staat de zoveelste: de
 * tweede stap op de draaibank hoort bij de tweede draaibankknoop. Een order van
 * vóór 2026-10-23 heeft per machine maar één stap (toen werden dubbele
 * samengenomen); die stap krijgt dan de tijd van alle knopen samen, zoals toen.
 * Benoemt de stap geen machine uit het recept, dan op plek als het aantal
 * stappen gelijk is. Anders `null`.
 */
export function receptMachineVoorStap(
  recept: ReceptMachine[], naam: string | null | undefined, index: number, stapNamen: (string | null | undefined)[],
): ReceptMachine | null {
  const zelfde = recept.filter(m => zelfdeNaam(naam, m.naam))
  if (zelfde.length > 0) {
    const stappenZelfde = stapNamen.filter(n => zelfdeNaam(n, naam)).length
    if (stappenZelfde === 1 && zelfde.length > 1) {
      return {
        naam: zelfde[0].naam,
        setupMin: zelfde.reduce((s, m) => s + m.setupMin, 0),
        cycleMin: zelfde.reduce((s, m) => s + m.cycleMin, 0),
      }
    }
    const k = stapNamen.slice(0, Math.max(0, index)).filter(n => zelfdeNaam(n, naam)).length
    return zelfde[Math.min(k, zelfde.length - 1)]
  }
  const opPlek = recept[index]
  return opPlek && recept.length === stapNamen.length ? opPlek : null
}

/**
 * Doorlooptijd van één stap (2026-10-09): de setup van zijn eigen machine één
 * keer, plus de cyclustijd van die machine × het aantal van de order. Tot nu
 * kreeg elke stap een gelijk deel van de tijd van álle machines samen, zodat
 * een zaagstap van 3 uur dagen kon duren omdat de draaibank ernaast lang was.
 * Valt de stap niet aan een machine in het recept te koppelen (met de hand
 * bijgezet, recept gewijzigd), dan nog wel dat gelijke deel.
 */
export function berekenStapMin(
  stap: ProductieStap,
  order: ProductieOrder,
  articles: Article[],
  machines: { id: string; name: string }[] = [],
): { min: number; isPlaceholder: boolean } {
  const artikel = order.artikelId ? articles.find(a => a.id === order.artikelId) : undefined
  const recept = receptMachines(artikel, machines)
  const index = order.stappen.findIndex(s => s.id === stap.id)
  const m = receptMachineVoorStap(
    recept, stap.machine ?? stap.naam, index < 0 ? stap.volgorde - 1 : index, order.stappen.map(s => s.machine ?? s.naam),
  )
  if (m) return { min: Math.max(1, Math.round(m.setupMin + m.cycleMin * order.qty)), isPlaceholder: false }
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

