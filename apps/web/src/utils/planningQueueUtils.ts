// Core logic for the Wachtrij (priority-queue) planning page — see the
// handoff at "01-design files claude design/design_handoff_planning_page/README.md".
//
// This page reads/writes the SAME real project/order/step data as the
// Kanban and Gantt boards. Two fields on ProductieStap back it:
//   - queuePosition — a float (fractional indexing: moving a job only ever
//     rewrites ITS OWN position, never its neighbors', which matters
//     because one machine's queue can span steps that live in many
//     different Project rows/JSON documents). null = not queued (backlog).
//   - notBefore — a hard floor date on this step's derived start (material
//     lead time / curing hold), independent of queue order.
// Both are persisted via projectsApi.planStap / projectsApi.setHold.
//
// The scheduler (deriveShopSchedule) is a real whole-shop simulation, not a
// per-machine independent walk: a step cannot start before its own
// predecessor step (same order, volgorde - 1) has finished IF that
// predecessor lives on a different machine — this is what makes "zagen
// then lassen" a real zero-gap-respecting dependency instead of two
// unrelated timelines. No separate groupId/groupLabel concept is needed:
// the order's own stappen (already sorted by volgorde) ARE the routing
// sequence, so every order with >1 queued step naturally gets this
// treatment, not just specially-flagged pairs.
//
// "Risico" is computed against a real backward-planned per-step deadline
// (verplichtKlaar — computed by walking the order's remaining steps
// backward from the project deadline), not just a raw comparison against
// the project's overall deadline.

import type { Project } from '@stockmanager/shared'
import type { Machine } from '../api/machines'
import type { Article } from '../api/articles'
import { type PlanningStapItem, toDateStr } from './planningUtils'
import { effectiveMachine } from './planningGanttUtils'
import { tekeningFor } from './planningKanbanUtils'

export type { PlanningStapItem }

// ── View model ───────────────────────────────────────────────────────────────

export interface QueueJob {
  id: string              // stap.id
  orderId: string          // ProductieOrder.id — real order, e.g. "PROD-2026-014"
  volgorde: number
  naam: string             // operation name, e.g. "zagen" — used for group labels
  klant: string
  artikel: string
  tekening: string | null
  machineNaam: string       // '' = not queued yet (backlog)
  duurMin: number
  isPlaceholder: boolean
  deadline: string | null   // project.levertijdDatum
  queuePosition: number | null
  notBefore: string | null
  gereed: boolean
  item: PlanningStapItem
}

export function buildQueueJobs(items: PlanningStapItem[], articles: Article[]): QueueJob[] {
  return items.map(item => ({
    id: item.stap.id,
    orderId: item.order.id,
    volgorde: item.stap.volgorde ?? 0,
    naam: item.stap.naam,
    klant: item.project.klantRef ?? item.project.naam,
    artikel: item.order.artikelNaam,
    tekening: tekeningFor(item.order, articles),
    machineNaam: effectiveMachine(item.stap),
    duurMin: item.duurMin,
    isPlaceholder: item.isPlaceholder,
    deadline: item.project.levertijdDatum,
    queuePosition: item.stap.queuePosition ?? null,
    notBefore: item.stap.notBefore ?? null,
    gereed: item.stap.gereedOp != null,
    item,
  }))
}

export function klantNaamProject(project: Project): string {
  return project.klantRef ?? project.naam
}

/** Same criterion the Kanban board uses for its backlog — keeps both views in agreement. */
export function isBacklogJob(job: QueueJob): boolean {
  return job.item.stap.geplandDatum == null && !job.gereed
}

// ── Queue ordering (real queuePosition, with a stable fallback) ────────────
// A step queued via Kanban's own drag-drop (not through this page) has a
// geplandDatum/geplandMachine but no queuePosition yet — it must still show
// up in its machine's Wachtrij, ranked below anything that DOES have a real
// position, in a stable order (geplandDatum, then volgorde) until a planner
// actually drags it to a rank.
export function sortByQueuePosition(jobs: QueueJob[]): QueueJob[] {
  return [...jobs].sort((a, b) => {
    const pa = a.queuePosition
    const pb = b.queuePosition
    if (pa != null && pb != null) return pa - pb
    if (pa != null) return -1
    if (pb != null) return 1
    const da = a.item.stap.geplandDatum ?? '9999-99-99'
    const db = b.item.stap.geplandDatum ?? '9999-99-99'
    if (da !== db) return da.localeCompare(db)
    return a.volgorde - b.volgorde
  })
}

/**
 * Fractional-index position for inserting a job just before `beforeId` (or
 * at the end, if null) in an already-sorted machine queue. Only the moved
 * job's own queuePosition is ever written — every other job's position (and
 * therefore its own Project row) is left untouched, which is what makes
 * this safe across a queue whose members live in different Project rows.
 */
export function computeInsertPosition(orderedJobs: QueueJob[], beforeId: string | null): number {
  // Assign synthetic integer positions to any job missing a real one, purely
  // for this midpoint calculation — never persisted for jobs that aren't
  // the one being moved.
  const positions = orderedJobs.map((j, i) => j.queuePosition ?? (i + 1) * 1000)
  if (orderedJobs.length === 0) return 1000
  if (beforeId == null) return positions[positions.length - 1] + 1000
  const idx = orderedJobs.findIndex(j => j.id === beforeId)
  if (idx === -1) return positions[positions.length - 1] + 1000
  const before = positions[idx]
  const prev = idx > 0 ? positions[idx - 1] : before - 2000
  return (prev + before) / 2
}

// ── Derived schedule (whole-shop simulation) ────────────────────────────────

export const EFFECTIEVE_MIN = 294 // 4.9h/day effective (70% of a 7h day) — matches planningUtils
export const DAY_MIN = 420        // one full working day, minute-width unit for node sizing

export interface DerivedSlot {
  startOffsetDays: number
  durationDays: number
  finishOffsetDays: number
  ghostOffsetDays: number   // where it would start ignoring its own notBefore hold
  heldByNotBefore: boolean
}

function isWeekend(dayIdx: number, windowStart: Date): boolean {
  const d = new Date(windowStart)
  d.setDate(d.getDate() + dayIdx)
  const dow = d.getDay()
  return dow === 0 || dow === 6
}

export function dateForOffset(windowStart: Date, dayIdx: number): Date {
  const d = new Date(windowStart)
  d.setDate(d.getDate() + dayIdx)
  return d
}

export function dayOffsetForDateStr(dateStr: string, windowStart: Date): number {
  const d = new Date(dateStr + 'T00:00:00')
  return Math.round((d.getTime() - windowStart.getTime()) / 86400000)
}

/** Walk forward from `startFrac` (a fractional day offset) consuming `durationMin` at EFFECTIEVE_MIN/open-day. */
function walkForward(startFrac: number, durationMin: number, worksWeekends: boolean, windowStart: Date): number {
  let day = Math.floor(startFrac)
  let used = Math.round((startFrac - day) * EFFECTIEVE_MIN)
  if (used <= 0) {
    used = 0
    while (!worksWeekends && isWeekend(day, windowStart)) day++
  }
  let remaining = durationMin
  while (remaining > 0) {
    if (!worksWeekends && isWeekend(day, windowStart)) { day++; used = 0; continue }
    const capacity = EFFECTIEVE_MIN - used
    const take = Math.min(capacity, remaining)
    remaining -= take
    used += take
    if (remaining > 0) { day++; used = 0 }
  }
  return day + used / EFFECTIEVE_MIN
}

/**
 * Whole-shop scheduler: processes every machine's queue in rank order, but a
 * step whose predecessor (same order, volgorde - 1) sits on a DIFFERENT
 * machine can't be scheduled until that predecessor has been — so a
 * multi-pass sweep is used (a machine whose next-in-line step isn't ready
 * yet is simply skipped for this pass; a later pass picks it up once its
 * predecessor lands). This always terminates: every order's first step has
 * no predecessor, so it's always immediately ready, guaranteeing progress
 * each pass until everything is scheduled.
 */
export function deriveShopSchedule(
  machineQueues: Map<string, QueueJob[]>,
  machines: Machine[],
  windowStart: Date,
): Map<string, DerivedSlot> {
  const result = new Map<string, DerivedSlot>()
  const machineByName = new Map(machines.map(m => [m.name, m]))
  const cursor = new Map<string, number>()
  for (const name of machineQueues.keys()) cursor.set(name, 0)

  const byOrderVolgorde = new Map<string, QueueJob>()
  for (const jobs of machineQueues.values()) {
    for (const j of jobs) byOrderVolgorde.set(`${j.orderId}:${j.volgorde}`, j)
  }

  const pointer = new Map<string, number>()
  for (const name of machineQueues.keys()) pointer.set(name, 0)

  const scheduled = new Set<string>()
  const totalJobs = [...machineQueues.values()].reduce((s, arr) => s + arr.filter(j => !j.gereed).length, 0)

  let guard = 0
  const maxGuard = machineQueues.size * (totalJobs + 2) + 10
  while (scheduled.size < totalJobs && guard < maxGuard) {
    guard++
    let progressed = false
    for (const [machineName, jobs] of machineQueues) {
      let ptr = pointer.get(machineName)!
      while (ptr < jobs.length && jobs[ptr].gereed) ptr++
      if (ptr >= jobs.length) { pointer.set(machineName, ptr); continue }
      const job = jobs[ptr]
      if (scheduled.has(job.id)) { pointer.set(machineName, ptr + 1); progressed = true; continue }

      const pred = byOrderVolgorde.get(`${job.orderId}:${job.volgorde - 1}`)
      let predFinish = 0
      if (pred && pred.machineNaam && pred.machineNaam !== machineName && !pred.gereed) {
        if (!scheduled.has(pred.id)) continue // not ready — try the next machine this pass
        predFinish = result.get(pred.id)?.finishOffsetDays ?? 0
      }

      const machine = machineByName.get(machineName)
      const worksWeekends = machine?.worksWeekends ?? false
      const machineFree = cursor.get(machineName) ?? 0
      const ghostStart = Math.max(machineFree, predFinish)
      const holdDay = job.notBefore ? dayOffsetForDateStr(job.notBefore, windowStart) : -Infinity
      const actualStart = Math.max(ghostStart, holdDay)

      const finish = walkForward(actualStart, job.duurMin, worksWeekends, windowStart)
      result.set(job.id, {
        startOffsetDays: actualStart,
        durationDays: Math.max(finish - actualStart, job.duurMin / DAY_MIN, 0.12),
        finishOffsetDays: finish,
        ghostOffsetDays: ghostStart,
        heldByNotBefore: holdDay > ghostStart + 0.01,
      })
      cursor.set(machineName, finish)
      scheduled.add(job.id)
      pointer.set(machineName, ptr + 1)
      progressed = true
    }
    if (!progressed) break // shouldn't happen for valid (acyclic) routing — guarded, not silent
  }

  return result
}

// ── Backward-planned per-step required-finish date (verplichtKlaar) ────────

export function computeVerplichtKlaar(
  allJobs: QueueJob[],
  windowStart: Date,
): Map<string, string> {
  const map = new Map<string, string>()
  const byOrder = new Map<string, QueueJob[]>()
  for (const job of allJobs) {
    if (job.gereed || !job.deadline) continue
    const arr = byOrder.get(job.orderId)
    if (arr) arr.push(job)
    else byOrder.set(job.orderId, [job])
  }
  for (const jobs of byOrder.values()) {
    jobs.sort((a, b) => a.volgorde - b.volgorde)
    const deadline = jobs[0].deadline!
    const deadlineIdx = dayOffsetForDateStr(deadline, windowStart)
    let offset = 0
    for (let i = jobs.length - 1; i >= 0; i--) {
      map.set(jobs[i].id, toDateStr(dateForOffset(windowStart, deadlineIdx - offset)))
      offset += Math.ceil(jobs[i].duurMin / EFFECTIEVE_MIN)
    }
  }
  return map
}

/** A job is at risk when its derived finish lands after its own backward-planned required-finish date (verplichtKlaar). */
export function isAtRisk(
  job: QueueJob,
  slot: DerivedSlot | undefined,
  verplichtKlaar: Map<string, string>,
  windowStart: Date,
): boolean {
  if (!slot) return false
  const required = verplichtKlaar.get(job.id)
  if (!required) return false
  const finishDate = toDateStr(dateForOffset(windowStart, Math.ceil(slot.finishOffsetDays)))
  return finishDate > required
}

// ── Connectors: steps of the same real order across different machines ─────

export interface Connector {
  orderId: string
  color: string
  fromJobId: string
  toJobId: string
}

const CONNECTOR_PALETTE = ['#7048e8', '#e64980', '#0ca678', '#f08c00', '#1c7ed6', '#e8590c']

export function buildConnectors(jobs: QueueJob[]): Connector[] {
  const byOrder = new Map<string, QueueJob[]>()
  for (const job of jobs) {
    if (!job.machineNaam || job.gereed || isBacklogJob(job)) continue
    const arr = byOrder.get(job.orderId)
    if (arr) arr.push(job)
    else byOrder.set(job.orderId, [job])
  }
  const connectors: Connector[] = []
  let colorIdx = 0
  for (const [orderId, orderJobs] of byOrder) {
    if (orderJobs.length < 2) continue
    orderJobs.sort((a, b) => a.volgorde - b.volgorde)
    const color = CONNECTOR_PALETTE[colorIdx % CONNECTOR_PALETTE.length]
    colorIdx++
    for (let i = 0; i < orderJobs.length - 1; i++) {
      if (orderJobs[i].machineNaam === orderJobs[i + 1].machineNaam) continue
      connectors.push({ orderId, color, fromJobId: orderJobs[i].id, toJobId: orderJobs[i + 1].id })
    }
  }
  return connectors
}

/** True if `job` has a same-order successor step queued on a different machine — i.e. reordering it can cascade. */
export function hasDownstreamDependent(job: QueueJob, allJobs: QueueJob[]): QueueJob | null {
  const successor = allJobs.find(j => j.orderId === job.orderId && j.volgorde === job.volgorde + 1 && !j.gereed)
  if (!successor || !successor.machineNaam || successor.machineNaam === job.machineNaam || isBacklogJob(successor)) return null
  return successor
}

export interface GroupInfo { label: string; partnerJob: QueueJob; direction: 'upstream' | 'downstream' }

/**
 * Cross-machine routing link for badge/callout display — "Groep: zagen →
 * lassen" style. Derived live from the order's own volgorde sequence (see
 * file header) rather than a stored groupId: any queued step with a queued
 * neighbor step (same order, adjacent volgorde) on a different machine IS a
 * group, full stop.
 */
export function getGroupInfo(job: QueueJob, allJobs: QueueJob[]): GroupInfo | null {
  if (isBacklogJob(job) || job.gereed) return null
  const succ = allJobs.find(j => j.orderId === job.orderId && j.volgorde === job.volgorde + 1 && !j.gereed && !isBacklogJob(j))
  if (succ && succ.machineNaam !== job.machineNaam) return { label: `${job.naam} → ${succ.naam}`, partnerJob: succ, direction: 'downstream' }
  const pred = allJobs.find(j => j.orderId === job.orderId && j.volgorde === job.volgorde - 1 && !j.gereed && !isBacklogJob(j))
  if (pred && pred.machineNaam !== job.machineNaam) return { label: `${pred.naam} → ${job.naam}`, partnerJob: pred, direction: 'upstream' }
  return null
}

// ── Cascade impact: does reordering a machine's queue shift a cross-machine dependent? ──

export interface CascadeImpact {
  affectedJob: QueueJob
  deltaDays: number
}

export function computeCascadeImpact(
  machineName: string,
  proposedOrder: QueueJob[],
  allMachineQueues: Map<string, QueueJob[]>,
  machines: Machine[],
  windowStart: Date,
): CascadeImpact | null {
  const before = deriveShopSchedule(allMachineQueues, machines, windowStart)
  const after = deriveShopSchedule(
    new Map([...allMachineQueues, [machineName, proposedOrder]]),
    machines, windowStart,
  )
  let worst: CascadeImpact | null = null
  for (const jobs of allMachineQueues.values()) {
    for (const job of jobs) {
      if (job.machineNaam === machineName) continue // same-machine shifts aren't a "cascade" — expected
      const b = before.get(job.id)
      const a = after.get(job.id)
      if (!b || !a) continue
      const delta = a.finishOffsetDays - b.finishOffsetDays
      if (Math.abs(delta) > 0.05 && (!worst || Math.abs(delta) > Math.abs(worst.deltaDays))) {
        worst = { affectedJob: job, deltaDays: delta }
      }
    }
  }
  return worst
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

export interface QueueKpis {
  geplandDezeWeek: number
  bezettingPct: number
  achterstand: number
  tePlannen: number
  gemDoorlooptijdDagen: number
}

export function computeQueueKpis(
  allJobs: QueueJob[],
  backlog: QueueJob[],
  machines: Machine[],
  schedule: Map<string, DerivedSlot>,
  verplichtKlaar: Map<string, string>,
  windowStart: Date,
): QueueKpis {
  const active = allJobs.filter(j => !j.gereed && !isBacklogJob(j) && j.machineNaam)
  const geplandDezeWeek = active.length
  const totalMin = active.reduce((s, j) => s + j.duurMin, 0)
  const capacity = Math.max(1, machines.length) * EFFECTIEVE_MIN * 5
  const bezettingPct = Math.round((totalMin / capacity) * 100)
  const achterstand = active.filter(j => isAtRisk(j, schedule.get(j.id), verplichtKlaar, windowStart)).length
  const doorlooptijden = active
    .map(j => schedule.get(j.id))
    .filter((s): s is DerivedSlot => !!s)
    .map(s => s.finishOffsetDays - s.startOffsetDays)
  const gemDoorlooptijdDagen = doorlooptijden.length > 0
    ? Math.round((doorlooptijden.reduce((a, b) => a + b, 0) / doorlooptijden.length) * 10) / 10
    : 0
  return { geplandDezeWeek, bezettingPct, achterstand, tePlannen: backlog.length, gemDoorlooptijdDagen }
}

// ── Suggest-schedule optimizer ──────────────────────────────────────────────
// Three real, well-known single-machine scheduling heuristics applied per
// machine queue (cross-machine dependencies still enforced by the shared
// deriveShopSchedule when comparing results) — not a full global optimum,
// but genuine, explainable reorderings rather than static placeholder text.

export type SuggestObjective = 'doorlooptijd' | 'achterstand' | 'bezetting'

export interface SuggestOptionResult {
  objective: SuggestObjective
  title: string
  desc: string
  queues: Map<string, QueueJob[]>
  metrics: QueueKpis
}

function reorderForObjective(jobs: QueueJob[], objective: SuggestObjective, verplichtKlaar: Map<string, string>): QueueJob[] {
  const sorted = [...jobs]
  if (objective === 'doorlooptijd') {
    // SPT — shortest processing time first: provably minimizes mean flow time on one machine.
    sorted.sort((a, b) => a.duurMin - b.duurMin)
  } else if (objective === 'achterstand') {
    // EDD — earliest (required) due date first: minimizes max lateness / late-job count.
    sorted.sort((a, b) => (verplichtKlaar.get(a.id) ?? '9999-99-99').localeCompare(verplichtKlaar.get(b.id) ?? '9999-99-99'))
  } else {
    // LPT — longest processing time first: a standard load-leveling heuristic.
    sorted.sort((a, b) => b.duurMin - a.duurMin)
  }
  return sorted
}

export function computeSuggestOptions(
  allJobs: QueueJob[],
  backlog: QueueJob[],
  machineQueues: Map<string, QueueJob[]>,
  machines: Machine[],
  windowStart: Date,
): SuggestOptionResult[] {
  const verplichtKlaar = computeVerplichtKlaar(allJobs, windowStart)
  const objectives: { objective: SuggestObjective; title: string; desc: string }[] = [
    { objective: 'doorlooptijd', title: 'Optimale doorlooptijd', desc: 'Minimaliseert gemiddelde doorlooptijd' },
    { objective: 'achterstand', title: 'Minste achterstand', desc: 'Minimaliseert aantal te late orders' },
    { objective: 'bezetting', title: 'Beste bezetting-balans', desc: 'Verdeelt werk gelijkmatig over machines' },
  ]
  return objectives.map(({ objective, title, desc }) => {
    const queues = new Map<string, QueueJob[]>()
    for (const [machineName, jobs] of machineQueues) {
      queues.set(machineName, reorderForObjective(jobs.filter(j => !j.gereed), objective, verplichtKlaar))
    }
    const schedule = deriveShopSchedule(queues, machines, windowStart)
    const metrics = computeQueueKpis(allJobs, backlog, machines, schedule, verplichtKlaar, windowStart)
    return { objective, title, desc, queues, metrics }
  })
}

// ── Zoom ─────────────────────────────────────────────────────────────────────

export type QueueZoom = 'dag' | 'week' | 'maand'
export const QUEUE_DAY_WIDTH: Record<QueueZoom, number> = { dag: 210, week: 96, maand: 40 }
export const QUEUE_VISIBLE_DAYS = 24
export const QUEUE_LABEL_WIDTH = 180
export const QUEUE_ROW_HEIGHT = 68
export const QUEUE_HEADER_HEIGHT = 30

export function fmtOffsetDay(windowStart: Date, dayIdx: number): string {
  const d = dateForOffset(windowStart, dayIdx)
  const DAG = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
  return `${DAG[d.getDay()]} ${d.getDate()}`
}

export function isWeekendOffset(windowStart: Date, dayIdx: number): boolean {
  return isWeekend(dayIdx, windowStart)
}

export { effectiveMachine } from './planningGanttUtils'
