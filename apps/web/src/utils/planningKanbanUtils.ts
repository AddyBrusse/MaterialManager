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
  todayIndex, dayIndexForDate, projectKleur, effectiveMachine, klantNaam,
} from './planningGanttUtils'

export {
  type PlanningStapItem, buildStapItems, getWindowStart, toDateStr,
  dayIndexForDate, dateForDayIndex, dateStrForDayIndex, todayIndex,
  fmtDayShort, fmtDayFull, weekdayLetter, weekNrForIdx, projectKleur, minToUren, klantNaam,
  effectiveMachine, EFFECTIEVE_MIN, MAX_MIN, TOTAL_DAYS,
} from './planningGanttUtils'

// ── Baked layout constants (compact density, "rand" card style) ────────────
export const RULER_H = 56
export const WEEKBAND_H = 26
export const LABEL_W = 128
export const COL_W = 140
export const CARD_H = 110
export const CARD_GAP = 5
export const CELL_PAD = 8
export const MIN_ROW = 122
export const CAP_BLOCK = 18 // capacity meter row height + margin
export const WEEKS = TOTAL_DAYS / 7

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
export function countOverbookedCells(scheduledItems: PlanningStapItem[]): number {
  const load = new Map<string, number>()
  for (const item of scheduledItems) {
    if (item.stap.geplandDatum == null) continue
    const machineNaam = effectiveMachine(item.stap)
    if (!machineNaam) continue
    const key = `${item.stap.geplandDatum}:${machineNaam}`
    load.set(key, (load.get(key) ?? 0) + item.duurMin)
  }
  let n = 0
  for (const min of load.values()) if (min > MAX_MIN) n++
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
}

function cellKey(dayIdx: number, machineNaam: string): string {
  return `${dayIdx}:${machineNaam}`
}

export function getCellItems(layout: KanbanLayout, dayIdx: number, machineNaam: string): PlanningStapItem[] {
  return layout.cellMap.get(cellKey(dayIdx, machineNaam)) ?? []
}

export function computeKanbanLayout(
  scheduledItems: PlanningStapItem[],
  machines: Machine[],
  windowStart: Date,
): KanbanLayout {
  const cellMap = new Map<string, PlanningStapItem[]>()
  for (const item of scheduledItems) {
    if (item.stap.geplandDatum == null) continue
    const machineNaam = effectiveMachine(item.stap)
    if (!machineNaam) continue
    const dayIdx = dayIndexForDate(item.stap.geplandDatum, windowStart)
    const key = cellKey(dayIdx, machineNaam)
    const arr = cellMap.get(key)
    if (arr) arr.push(item)
    else cellMap.set(key, [item])
  }
  for (const arr of cellMap.values()) {
    arr.sort((a, b) => (a.order.id === b.order.id ? a.stap.volgorde - b.stap.volgorde : a.order.id.localeCompare(b.order.id)))
  }

  const rowMaxN = new Array(TOTAL_DAYS).fill(0)
  for (const [key, arr] of cellMap) {
    const day = Number(key.split(':')[0])
    if (arr.length > rowMaxN[day]) rowMaxN[day] = arr.length
  }

  const todayIdx = todayIndex(windowStart)
  const todayDow = ((todayIdx % 7) + 7) % 7
  const effectiveTodayIdx = todayDow >= 5 ? todayIdx + (7 - todayDow) : todayIdx

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
    for (let dd = 0; dd < 5; dd++) {
      const dayIdx = w * 7 + dd
      const n = rowMaxN[dayIdx]
      const contentH = n > 0 ? CELL_PAD * 2 + CAP_BLOCK + n * CARD_H + (n - 1) * CARD_GAP : 0
      const h = Math.max(MIN_ROW, contentH)
      rowH[dayIdx] = h
      rowAbsTop[dayIdx] = y

      machines.forEach((m, mi) => {
        const cell = cellMap.get(cellKey(dayIdx, m.name))
        if (!cell || !cell.length) return
        const load = cell.reduce((s, i) => s + i.duurMin, 0)
        dayLoad[dayIdx] += load
        const cellTop = y + CELL_PAD + CAP_BLOCK
        cell.forEach((item, si) => {
          miniBlocks.push({ mi, color: projectKleur(item.project.id), yAbs: cellTop + si * (CARD_H + CARD_GAP), hAbs: CARD_H })
        })
        if (load > MAX_MIN) overMarks.push({ mi, yAbs: y + 5 })
      })

      if (dayIdx === effectiveTodayIdx) todayAbs = y
      y += h + 1
    }
  }

  return { rowH, rowAbsTop, dayLoad, totalAbs: y, miniBlocks, overMarks, weekLines, todayAbs, cellMap }
}
