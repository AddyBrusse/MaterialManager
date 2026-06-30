// Helpers specific to the Gantt-style planning board (PlanningGanttPage).
// Reuses the day-grid/capacity primitives from planningUtils.ts — only the
// continuous-timeline geometry (pixel mapping, lane packing, ghost workload)
// is new.

import type { Project, ProductieOrder, ProductieStap, Relatie } from '@stockmanager/shared'
import type { Article } from '../api/articles'
import type { Machine } from '../api/machines'
import {
  EFFECTIEVE_MIN, MAX_MIN, toDateStr, getMaandag,
  berekenStapMin, berekenOrderMin,
  type PlanningStapItem,
} from './planningUtils'

export {
  projectKleur, minToUren, vindAchterstanden, heeftVolgordeWaarschuwing,
  EFFECTIEVE_MIN, MAX_MIN, toDateStr,
} from './planningUtils'
export type { PlanningStapItem } from './planningUtils'

// ── Continuous timeline window ──────────────────────────────────────────────
// Rolling window anchored on "this week": a couple of weeks of history (so
// achterstand context stays visible) plus a production-horizon's worth of
// future weeks. Unlike the design mock's fixed Jun–Jul window, this is
// recomputed from the real calendar every time the page loads. FUTURE_WEEKS
// covers a minimum of ~8 months so both the board and the Prognose chart have
// enough runway for real capacity planning, not just the next sprint.
const PAST_WEEKS = 2
const FUTURE_WEEKS = 35
export const TOTAL_DAYS = (PAST_WEEKS + FUTURE_WEEKS) * 7

export function getWindowStart(): Date {
  const maandag = getMaandag(new Date())
  const d = new Date(maandag)
  d.setDate(d.getDate() - PAST_WEEKS * 7)
  return d
}

// Prognose-only horizon: unlike the Gantt/Kanban boards (fixed window,
// re-anchored weekly), the Prognose chart's far edge must always stay at
// least this many days past "today" — recomputed live (see PrognosePage)
// rather than baked into a fixed week count, so a browser tab left open for
// weeks doesn't quietly run out of runway.
const PROGNOSE_FUTURE_DAYS = 300

export function prognoseTotalDays(windowStart: Date, today: Date = new Date()): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const end = new Date(start)
  end.setDate(end.getDate() + PROGNOSE_FUTURE_DAYS)
  const daysNeeded = Math.ceil((end.getTime() - windowStart.getTime()) / 86400000)
  return Math.max(TOTAL_DAYS, Math.ceil(daysNeeded / 7) * 7)
}

export function dayIndexForDate(dateStr: string, windowStart: Date): number {
  const d = new Date(dateStr + 'T00:00:00')
  return Math.round((d.getTime() - windowStart.getTime()) / 86400000)
}

export function dateForDayIndex(idx: number, windowStart: Date): Date {
  const d = new Date(windowStart)
  d.setDate(d.getDate() + idx)
  return d
}

export function dateStrForDayIndex(idx: number, windowStart: Date): string {
  return toDateStr(dateForDayIndex(idx, windowStart))
}

export function todayIndex(windowStart: Date): number {
  return dayIndexForDate(toDateStr(new Date()), windowStart)
}

const DAG = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
const MND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

export function fmtDayShort(idx: number, windowStart: Date): string {
  const d = dateForDayIndex(idx, windowStart)
  return `${d.getDate()} ${MND[d.getMonth()]}`
}
export function fmtDayFull(idx: number, windowStart: Date): string {
  const d = dateForDayIndex(idx, windowStart)
  return `${DAG[d.getDay()]} ${d.getDate()} ${MND[d.getMonth()]}`
}
export function weekdayLetter(idx: number, windowStart: Date): string {
  return DAG[dateForDayIndex(idx, windowStart).getDay()]
}
export function isWeekendIdx(idx: number, windowStart: Date): boolean {
  const dow = dateForDayIndex(idx, windowStart).getDay()
  return dow === 0 || dow === 6
}
export function weekNrForIdx(idx: number, windowStart: Date): number {
  const d = dateForDayIndex(idx, windowStart)
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const diff = target.getTime() - firstThursday.getTime()
  return 1 + Math.round((diff / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7)
}

// ── Zoom + geometry constants ───────────────────────────────────────────────
// pxDay is computed dynamically from the rendered track width (see
// GanttBoard's useResizeObserver), targeting roughly this many visible days
// per zoom level — rather than a fixed px/day, which can't adapt to the
// actual screen, so "Dag" might show 3 days on one monitor and 8 on another.
export type ZoomLevel = 'day' | 'week' | 'month'
export const TARGET_DAYS: Record<ZoomLevel, number> = { day: 3, week: 10, month: 30 }
export const MIN_PX_PER_DAY = 40
export const MAX_PX_PER_DAY = 600
export const NODE_H = 42
export const LANE_GAP = 5
export const LANE_PAD = 7
export const LABEL_W = 196

// ── Machine rows ─────────────────────────────────────────────────────────────
// Steps store the machine as a NAME string (matching the existing
// PlanningPage convention), not an id. "" / null = unassigned.
export interface GanttMachineRow { naam: string; sub: string; isGeen: boolean }

export function buildMachineRows(machines: Machine[]): GanttMachineRow[] {
  return [
    ...machines.map(m => ({
      naam: m.name,
      sub: `€ ${m.machineRatePerHour.toFixed(2)} / u`,
      isGeen: false,
    })),
    { naam: '', sub: 'Niet toegewezen', isGeen: true },
  ]
}

export function effectiveMachine(stap: ProductieStap): string {
  return stap.geplandMachine ?? stap.machine ?? ''
}

// ── Flatten projects → planning items ───────────────────────────────────────
export function buildStapItems(
  projects: Project[],
  articles: Article[],
  opts: { includeDone?: boolean } = {},
): PlanningStapItem[] {
  const result: PlanningStapItem[] = []
  for (const project of projects) {
    for (const order of project.productieOrders) {
      if (order.status === 'gereed' && !opts.includeDone) continue
      for (const stap of order.stappen) {
        if (stap.gereedOp && !opts.includeDone) continue
        const { min, isPlaceholder } = berekenStapMin(stap, order, articles)
        result.push({ stap, order, project, duurMin: min, isPlaceholder })
      }
    }
  }
  return result
}

export function isAchterstand(stap: ProductieStap): boolean {
  return stap.geplandDatum != null && !stap.gereedOp && stap.geplandDatum < toDateStr(new Date())
}

export function klantNaam(relaties: Relatie[], project: Project): string {
  return relaties.find(r => r.id === project.relatieId)?.naam ?? project.klantRef ?? project.naam
}

// ── Lane packing (single continuous timeline per machine) ──────────────────
// A machine can only run one step at a time, so steps queue sequentially
// rather than stacking into parallel lanes: each step starts at its own
// planned day, UNLESS the machine is still busy with an earlier-queued step,
// in which case it starts as soon as the machine frees up. This visually
// reveals queue buildup (a backed-up machine pushes later bars rightward)
// instead of hiding it behind vertical stacking.
export interface NodePos { lane: number; left: number; width: number }

export function packMachineLane(
  items: PlanningStapItem[],
  windowStart: Date,
  pxDay: number,
): { pos: Record<string, NodePos>; nLanes: number } {
  const sorted = [...items].sort((a, b) => {
    const da = dayIndexForDate(a.stap.geplandDatum!, windowStart)
    const db = dayIndexForDate(b.stap.geplandDatum!, windowStart)
    return da - db || a.stap.volgorde - b.stap.volgorde
  })
  const pos: Record<string, NodePos> = {}
  let machineFreeAt = -Infinity
  for (const item of sorted) {
    const day = dayIndexForDate(item.stap.geplandDatum!, windowStart)
    const durDays = item.duurMin / MAX_MIN
    const start = Math.max(day, machineFreeAt)
    machineFreeAt = start + durDays
    pos[item.stap.id] = {
      lane: 0,
      left: start * pxDay + 3,
      width: Math.max(durDays * pxDay - 6, 20),
    }
  }
  return { pos, nLanes: 1 }
}

export interface RowLayout { pos: Record<string, NodePos>; nLanes: number; height: number }

export function computeRowLayout(
  steps: PlanningStapItem[],
  windowStart: Date,
  pxDay: number,
): RowLayout {
  const { pos, nLanes } = packMachineLane(steps, windowStart, pxDay)
  const height = LANE_PAD * 2 + nLanes * NODE_H + (nLanes - 1) * LANE_GAP
  return { pos, nLanes, height }
}

export function laneTop(lane: number): number {
  return LANE_PAD + lane * (NODE_H + LANE_GAP)
}

// ── Capacity status ──────────────────────────────────────────────────────────
export function capStatusLabel(min: number): 'ok' | 'warn' | 'over' {
  if (min > MAX_MIN * 5) return 'over'
  if (min > EFFECTIEVE_MIN * 5) return 'warn'
  return 'ok'
}

/** Scheduled (real) workload minutes for a machine within an arbitrary [startDay, endDay) range. */
export function machineLoadInRange(
  items: PlanningStapItem[], machineNaam: string, startDay: number, endDay: number, windowStart: Date,
): number {
  let min = 0
  for (const item of items) {
    if (item.stap.gereedOp) continue
    if (item.stap.geplandDatum == null) continue
    if (effectiveMachine(item.stap) !== machineNaam) continue
    const day = dayIndexForDate(item.stap.geplandDatum, windowStart)
    if (day >= startDay && day < endDay) min += item.duurMin
  }
  return min
}

export function machineWeekLoadFromItems(items: PlanningStapItem[], machineNaam: string, weekStartIdx: number, windowStart: Date): number {
  return machineLoadInRange(items, machineNaam, weekStartIdx, weekStartIdx + 7, windowStart)
}

// ── Ghost / Prognose workload from open offertes ────────────────────────────
// Open (verzonden) offerte regels haven't been turned into productie orders
// yet, so their operations aren't assigned to a machine/date. We approximate:
// split the regel's estimated duration evenly across its frozen `bewerkingen`
// (operation names), match each to a machine by name, and bucket the result
// into the week containing the project's deadline (a no-deadline regel can't
// be placed on the timeline, so it's skipped).
export function berekenGhostBelasting(
  projects: Project[],
  articles: Article[],
  machines: Machine[],
  windowStart: Date,
  totalDays: number = TOTAL_DAYS,
): Map<string, Map<number, number>> {
  const result = new Map<string, Map<number, number>>()
  function add(machineNaam: string, weekIdx: number, min: number) {
    if (!result.has(machineNaam)) result.set(machineNaam, new Map())
    const m = result.get(machineNaam)!
    m.set(weekIdx, (m.get(weekIdx) ?? 0) + min)
  }
  for (const project of projects) {
    if (!project.levertijdDatum) continue
    const dayIdx = dayIndexForDate(project.levertijdDatum, windowStart)
    if (dayIdx < 0 || dayIdx >= totalDays) continue
    const weekIdx = Math.floor(dayIdx / 7)
    for (const offerte of project.offertes) {
      if (offerte.status !== 'verzonden') continue
      for (const regel of offerte.regels) {
        if (!regel.artikelId || regel.bewerkingen.length === 0) continue
        const fakeOrder: ProductieOrder = {
          id: '', projectId: project.id, offerteRegelId: regel.id,
          artikelId: regel.artikelId, artikelNaam: regel.naam,
          qty: regel.qty, eenheid: regel.eenheid,
          stappen: [], status: 'gepland', createdAt: '', updatedAt: '',
        }
        const { min } = berekenOrderMin(fakeOrder, articles)
        const perOp = min / regel.bewerkingen.length
        for (const bewerking of regel.bewerkingen) {
          const machine = machines.find(m => matchesMachineNaam(bewerking, m.name))
          add(machine ? machine.name : '', weekIdx, perOp)
        }
      }
    }
  }
  return result
}

function matchesMachineNaam(bewerkingNaam: string, machineNaam: string): boolean {
  const a = bewerkingNaam.toLowerCase().trim()
  const b = machineNaam.toLowerCase().trim()
  return a === b || a.includes(b) || b.includes(a)
}

export function ghostLoadFor(ghostMap: Map<string, Map<number, number>>, machineNaam: string, weekIdx: number): number {
  return Math.round(ghostMap.get(machineNaam)?.get(weekIdx) ?? 0)
}

/** Sum of ghost (forecast) minutes for a machine across a range of week indices — used to bucket the weekly ghost map into wider (e.g. monthly) chart periods. */
export function ghostLoadInRange(
  ghostMap: Map<string, Map<number, number>>, machineNaam: string, startWeekIdx: number, endWeekIdx: number,
): number {
  let min = 0
  for (let w = startWeekIdx; w < endWeekIdx; w++) min += ghostLoadFor(ghostMap, machineNaam, w)
  return min
}

// ── KPI row ──────────────────────────────────────────────────────────────────
export interface GanttKpis {
  geplandUren: string
  bezetting: number
  achterstand: number
  tePlannen: number
  leveringen: number
}

export function berekenGanttKpis(
  scheduledItems: PlanningStapItem[],
  machineCount: number,
  projects: Project[],
  backlogCount: number,
  achterstandCount: number,
): GanttKpis {
  const maandag = getMaandag(new Date())
  const weekStart = toDateStr(maandag)
  const zondag = new Date(maandag)
  zondag.setDate(zondag.getDate() + 6)
  const weekEnd = toDateStr(zondag)

  const weekItems = scheduledItems.filter(i =>
    i.stap.geplandDatum != null && !i.stap.gereedOp &&
    i.stap.geplandDatum >= weekStart && i.stap.geplandDatum <= weekEnd &&
    effectiveMachine(i.stap) !== '',
  )
  const plannedMin = weekItems.reduce((s, i) => s + i.duurMin, 0)
  const capacityTotal = machineCount * EFFECTIEVE_MIN * 5
  const bezetting = capacityTotal > 0 ? Math.round((plannedMin / capacityTotal) * 100) : 0
  const leveringen = projects.filter(p =>
    p.levertijdDatum != null && p.levertijdDatum >= weekStart && p.levertijdDatum <= weekEnd,
  ).length

  return {
    geplandUren: (plannedMin / 60).toFixed(1),
    bezetting,
    achterstand: achterstandCount,
    tePlannen: backlogCount,
    leveringen,
  }
}
