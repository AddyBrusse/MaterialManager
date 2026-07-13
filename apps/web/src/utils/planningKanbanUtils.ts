// Helpers specific to the Kanban-style planning board (PlanningKanbanPage).
// Reuses the same day-index/calendar scheme and capacity constants as the
// Gantt board so both views agree on "today", "overboekt" and durations —
// only the workdays-only grid layout (week bands, day rows, capacity meters,
// minimap geometry) is new.

import type { Relatie, ProductieOrder } from '@stockmanager/shared'
import type { Machine } from '../api/machines'
import type { Article } from '../api/articles'
import {
  type PlanningStapItem,
  EFFECTIEVE_MIN, MAX_MIN, TOTAL_DAYS,
  todayIndex, dayIndexForDate, projectKleur, effectiveMachine, klantNaam, isWeekendIdx,
} from './planningGanttUtils'

export {
  type PlanningStapItem, buildStapItems, getWindowStart, toDateStr,
  dayIndexForDate, dateForDayIndex, dateStrForDayIndex, todayIndex,
  fmtDayShort, fmtDayFull, weekdayLetter, weekNrForIdx, projectKleur, minToUren, klantNaam,
  effectiveMachine, EFFECTIEVE_MIN, MAX_MIN, TOTAL_DAYS, isWeekendIdx,
} from './planningGanttUtils'

// ── Weekend cell openness ───────────────────────────────────────────────────
// A (day, machine) cell is only "open" on a weekend if that machine is
// flagged as working weekends — everything else is a normal workday.
export function isCellOpen(dayIdx: number, machine: Machine, windowStart: Date): boolean {
  return !isWeekendIdx(dayIdx, windowStart) || machine.worksWeekends
}

// ── Multi-day span computation ──────────────────────────────────────────────
// A stap whose duration exceeds one day's realistic capacity (EFFECTIEVE_MIN)
// spans multiple days on its machine. Walk forward from its scheduled start
// day, consuming up to EFFECTIEVE_MIN minutes per open day. The start day
// always counts as open (a planner's explicit weekend drop is honored), but
// days after that skip a non-weekend machine's closed Sat/Sun entirely —
// which splits the walk into separate segments ("pause over the weekend,
// continue Monday") instead of painting straight through.
export interface SpanDayChunk { dayIdx: number; min: number }
export interface SpanSegment { chunks: SpanDayChunk[] }
export interface StapSpan { segments: SpanSegment[] }

export function computeStapSpan(
  startDayIdx: number,
  duurMin: number,
  machine: Machine | undefined,
  windowStart: Date,
): StapSpan {
  const worksWeekends = machine?.worksWeekends ?? false
  const segments: SpanSegment[] = []
  let chunks: SpanDayChunk[] = []
  let remaining = duurMin
  let dayIdx = startDayIdx
  while (remaining > 0 && dayIdx < TOTAL_DAYS) {
    const open = dayIdx === startDayIdx || worksWeekends || !isWeekendIdx(dayIdx, windowStart)
    if (open) {
      const min = Math.min(remaining, EFFECTIEVE_MIN)
      chunks.push({ dayIdx, min })
      remaining -= min
    } else if (chunks.length > 0) {
      segments.push({ chunks })
      chunks = []
    }
    dayIdx++
  }
  if (chunks.length > 0) segments.push({ chunks })
  return { segments }
}

// ── Unified per-(day, machine) load map ─────────────────────────────────────
// Single source of truth for "how loaded is this cell" — single-day items
// contribute their full duurMin to their one day; multi-day items contribute
// their per-day chunks (via computeStapSpan) across every day they touch.
// Used by both the board layout (capacity bars, over-marks) and the KPI
// strip's countOverbookedCells, so the two can never silently disagree.
export function buildLoadMap(
  scheduledItems: PlanningStapItem[],
  machines: Machine[],
  windowStart: Date,
): Map<string, number> {
  const loadMap = new Map<string, number>()
  function add(dayIdx: number, machineNaam: string, min: number) {
    const key = cellKey(dayIdx, machineNaam)
    loadMap.set(key, (loadMap.get(key) ?? 0) + min)
  }
  for (const item of scheduledItems) {
    if (item.stap.geplandDatum == null) continue
    const machineNaam = effectiveMachine(item.stap)
    if (!machineNaam) continue
    const dayIdx = dayIndexForDate(item.stap.geplandDatum, windowStart)
    if (item.duurMin <= EFFECTIEVE_MIN) {
      add(dayIdx, machineNaam, item.duurMin)
    } else {
      const machine = machines.find(m => m.name === machineNaam)
      const span = computeStapSpan(dayIdx, item.duurMin, machine, windowStart)
      for (const seg of span.segments) for (const c of seg.chunks) add(c.dayIdx, machineNaam, c.min)
    }
  }
  return loadMap
}

// ── Baked layout constants (compact density, "rand" card style) ────────────
// These are the 100%-zoom baseline. RULER_H/WEEKBAND_H/LABEL_W/COL_W are
// board "chrome" and never scale with zoom — only the per-day row metrics
// (below, via zoomedMetrics) do, since zoom is vertical-only.
export const RULER_H = 56
export const WEEKBAND_H = 26
export const LABEL_W = 128
export const COL_W = 140
export const CARD_H = 110
export const CARD_GAP = 5
export const CELL_PAD = 8
export const MIN_ROW = 122
export const CAP_H = 12 // capacity meter bar height
export const CAP_MB = 6 // capacity meter bottom margin
export const CAP_BLOCK = CAP_H + CAP_MB // total vertical space the meter reserves
export const WEEKS = TOTAL_DAYS / 7

// ── Vertical zoom ────────────────────────────────────────────────────────────
export const ZOOM_LEVELS = [100, 75, 50, 25] as const
export type ZoomLevel = typeof ZOOM_LEVELS[number]

export interface ZoomedMetrics {
  minRow: number
  cardH: number
  cardGap: number
  cellPad: number
  capH: number
  capMb: number
  capBlock: number
}

export function zoomedMetrics(zoom: ZoomLevel): ZoomedMetrics {
  const f = zoom / 100
  const capH = Math.max(6, Math.round(CAP_H * f))
  const capMb = Math.max(3, Math.round(CAP_MB * f))
  return {
    minRow: Math.round(MIN_ROW * f),
    cardH: Math.round(CARD_H * f),
    cardGap: Math.max(2, Math.round(CARD_GAP * f)),
    cellPad: Math.max(3, Math.round(CELL_PAD * f)),
    capH, capMb, capBlock: capH + capMb,
  }
}

// ── Minimap geometry ─────────────────────────────────────────────────────────
export const MINI_USABLE_W = 70
export const MINI_LEFT_PAD = 3

// ── Capacity status per (machine, day) cell ─────────────────────────────────
// Same thresholds Gantt already uses (EFFECTIEVE_MIN = "ok" ceiling,
// MAX_MIN = hard "over" ceiling) so the two views never disagree about
// whether a day is overbooked.
export function cellCapStatus(loadMin: number): 'ok' | 'warn' | 'over' {
  if (loadMin > MAX_MIN) return 'over'
  if (loadMin > EFFECTIEVE_MIN) return 'warn'
  return 'ok'
}

// ── Drawing number (Region 1/4 "tekening") ──────────────────────────────────
export function tekeningFor(order: ProductieOrder, articles: Article[]): string | null {
  if (!order.artikelId) return null
  const art = articles.find(a => a.id === order.artikelId)
  if (!art?.tekening) return null
  return art.rev ? `${art.tekening}-${art.rev}` : art.tekening
}

// ── KPI: overbooked (machine, day) cell count ───────────────────────────────
// Lighter-weight than the full board layout (no pixel geometry) — mirrors
// how the Gantt page computes its own KPI summary separately from the
// board's internal layout.
export function countOverbookedCells(scheduledItems: PlanningStapItem[], machines: Machine[], windowStart: Date): number {
  const loadMap = buildLoadMap(scheduledItems, machines, windowStart)
  let n = 0
  for (const min of loadMap.values()) if (min > MAX_MIN) n++
  return n
}

// ── Backlog sort ─────────────────────────────────────────────────────────────
export type KanbanSort = 'default' | 'deadline' | 'duur' | 'klant'

export function sortBacklog(items: PlanningStapItem[], sortBy: KanbanSort, relaties: Relatie[]): PlanningStapItem[] {
  const sorted = items.slice()
  if (sortBy === 'deadline') {
    sorted.sort((a, b) => (a.project.levertijdDatum ?? '9999').localeCompare(b.project.levertijdDatum ?? '9999'))
  } else if (sortBy === 'duur') {
    sorted.sort((a, b) => b.duurMin - a.duurMin)
  } else if (sortBy === 'klant') {
    sorted.sort((a, b) => klantNaam(relaties, a.project).localeCompare(klantNaam(relaties, b.project)))
  } else {
    sorted.sort((a, b) => (a.order.id === b.order.id ? a.stap.volgorde - b.stap.volgorde : a.order.id.localeCompare(b.order.id)))
  }
  return sorted
}

// ── Deadline urgency (workdays left, signed; negative = overdue) ───────────
export function workdaysLeft(deadline: string | null | undefined, windowStart: Date): number | null {
  if (!deadline) return null
  const todayIdx = todayIndex(windowStart)
  const deadlineIdx = dayIndexForDate(deadline, windowStart)
  if (deadlineIdx === todayIdx) return 0
  const step = deadlineIdx > todayIdx ? 1 : -1
  let count = 0
  for (let i = todayIdx; i !== deadlineIdx; i += step) {
    const dow = (((i + step) % 7) + 7) % 7
    if (dow <= 4) count += step
  }
  return count
}

// ── Board layout model ───────────────────────────────────────────────────────
// Walks weeks -> workdays top-to-bottom, producing absolute board-pixel
// coordinates for rows, capacity bars, card stacks and the minimap — mirrors
// the design handoff's kbComputeLayout, driven by real scheduled steps
// instead of seed data.

export interface MiniBlock { mi: number; color: string; yAbs: number; hAbs: number }
export interface OverMark { mi: number; yAbs: number }

// One rendered segment of a multi-day span block — a contiguous run of open
// days, in absolute board pixels (a job crossing a closed weekend for a
// non-weekend machine produces two segments with a gap between them).
export interface SpanBlockSegment { top: number; height: number; startDayIdx: number; endDayIdx: number; minMin: number }
export interface SpanBlock { item: PlanningStapItem; mi: number; machineNaam: string; segments: SpanBlockSegment[]; totalMin: number }

export interface KanbanLayout {
  rowH: number[]
  rowAbsTop: number[]
  dayLoad: number[]
  totalAbs: number
  miniBlocks: MiniBlock[]
  overMarks: OverMark[]
  weekLines: number[]
  todayAbs: number
  cellMap: Map<string, PlanningStapItem[]>
  loadMap: Map<string, number>
  spanBlocks: SpanBlock[]
}

function cellKey(dayIdx: number, machineNaam: string): string {
  return `${dayIdx}:${machineNaam}`
}

export function getCellItems(layout: KanbanLayout, dayIdx: number, machineNaam: string): PlanningStapItem[] {
  return layout.cellMap.get(cellKey(dayIdx, machineNaam)) ?? []
}

export function getCellLoad(layout: KanbanLayout, dayIdx: number, machineNaam: string): number {
  return layout.loadMap.get(cellKey(dayIdx, machineNaam)) ?? 0
}

export function computeKanbanLayout(
  scheduledItems: PlanningStapItem[],
  machines: Machine[],
  windowStart: Date,
  zoom: ZoomLevel = 100,
): KanbanLayout {
  const { minRow, cardH, cardGap, cellPad, capBlock } = zoomedMetrics(zoom)
  // Staps that fit in one day render as a normal card in cellMap, exactly as
  // before. Staps needing more than one day are excluded from cellMap/rowMaxN
  // entirely (so row heights stay driven only by real single-day cards) and
  // instead become an absolutely-positioned spanBlock, computed in a second
  // pass once row geometry is known.
  const singleDayItems: PlanningStapItem[] = []
  const spanningItems: PlanningStapItem[] = []
  for (const item of scheduledItems) {
    if (item.stap.geplandDatum == null) continue
    if (!effectiveMachine(item.stap)) continue
    if (item.duurMin <= EFFECTIEVE_MIN) singleDayItems.push(item)
    else spanningItems.push(item)
  }

  const cellMap = new Map<string, PlanningStapItem[]>()
  for (const item of singleDayItems) {
    const machineNaam = effectiveMachine(item.stap)
    const dayIdx = dayIndexForDate(item.stap.geplandDatum!, windowStart)
    const key = cellKey(dayIdx, machineNaam)
    const arr = cellMap.get(key)
    if (arr) arr.push(item)
    else cellMap.set(key, [item])
  }
  for (const arr of cellMap.values()) {
    arr.sort((a, b) => (a.order.id === b.order.id ? a.stap.volgorde - b.stap.volgorde : a.order.id.localeCompare(b.order.id)))
  }

  const loadMap = buildLoadMap(scheduledItems, machines, windowStart)

  const rowMaxN = new Array(TOTAL_DAYS).fill(0)
  for (const [key, arr] of cellMap) {
    const day = Number(key.split(':')[0])
    if (arr.length > rowMaxN[day]) rowMaxN[day] = arr.length
  }

  const todayIdx = todayIndex(windowStart)

  const rowH: number[] = new Array(TOTAL_DAYS).fill(0)
  const rowAbsTop: number[] = new Array(TOTAL_DAYS).fill(0)
  const dayLoad: number[] = new Array(TOTAL_DAYS).fill(0)
  const miniBlocks: MiniBlock[] = []
  const overMarks: OverMark[] = []
  const weekLines: number[] = []
  let todayAbs = 0
  let y = RULER_H + 1

  for (let w = 0; w < WEEKS; w++) {
    weekLines.push(y)
    y += WEEKBAND_H + 1
    for (let dd = 0; dd < 7; dd++) {
      const dayIdx = w * 7 + dd
      const n = rowMaxN[dayIdx]
      const contentH = n > 0 ? cellPad * 2 + capBlock + n * cardH + (n - 1) * cardGap : 0
      const h = Math.max(minRow, contentH)
      rowH[dayIdx] = h
      rowAbsTop[dayIdx] = y

      machines.forEach((m, mi) => {
        // Load/over-marks come from the unified loadMap (single-day cards +
        // spanning chunks) — a cell can be overbooked purely from a spanning
        // item's chunk even with zero cellMap cards that day.
        const load = loadMap.get(cellKey(dayIdx, m.name)) ?? 0
        if (load > 0) {
          dayLoad[dayIdx] += load
          if (load > MAX_MIN) overMarks.push({ mi, yAbs: y + 5 })
        }
        const cell = cellMap.get(cellKey(dayIdx, m.name))
        if (!cell || !cell.length) return
        const cellTop = y + cellPad + capBlock
        cell.forEach((item, si) => {
          miniBlocks.push({ mi, color: projectKleur(item.project.id), yAbs: cellTop + si * (cardH + cardGap), hAbs: cardH })
        })
      })

      if (dayIdx === todayIdx) todayAbs = y
      y += h + 1
    }
  }

  // Second pass: now that rowAbsTop/rowH are known for every day, translate
  // each spanning item's segments (from computeStapSpan) into absolute pixel
  // ranges. minimap blocks reuse the exact same top/height so the two can
  // never drift apart.
  const spanBlocks: SpanBlock[] = []
  for (const item of spanningItems) {
    const machineNaam = effectiveMachine(item.stap)
    const mi = machines.findIndex(m => m.name === machineNaam)
    if (mi === -1) continue
    const startDayIdx = dayIndexForDate(item.stap.geplandDatum!, windowStart)
    const span = computeStapSpan(startDayIdx, item.duurMin, machines[mi], windowStart)
    if (span.segments.length === 0) continue

    const segments: SpanBlockSegment[] = span.segments.map(seg => {
      const first = seg.chunks[0].dayIdx
      const last = seg.chunks[seg.chunks.length - 1].dayIdx
      const minMin = seg.chunks.reduce((s, c) => s + c.min, 0)
      return {
        top: rowAbsTop[first],
        height: rowAbsTop[last] + rowH[last] - rowAbsTop[first],
        startDayIdx: first,
        endDayIdx: last,
        minMin,
      }
    })
    spanBlocks.push({ item, mi, machineNaam, segments, totalMin: item.duurMin })

    for (const seg of segments) {
      miniBlocks.push({ mi, color: projectKleur(item.project.id), yAbs: seg.top, hAbs: seg.height })
    }
  }

  return { rowH, rowAbsTop, dayLoad, totalAbs: y, miniBlocks, overMarks, weekLines, todayAbs, cellMap, loadMap, spanBlocks }
}
