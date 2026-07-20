import { describe, it, expect } from 'vitest'
import type { Machine } from '../api/machines'
import type { PlanningStapItem } from './planningUtils'
import {
  type QueueJob,
  sortByQueuePosition,
  computeInsertPosition,
  deriveShopSchedule,
  computeVerplichtKlaar,
  isAtRisk,
  buildConnectors,
  hasDownstreamDependent,
  getGroupInfo,
  computeCascadeImpact,
  computeQueueKpis,
  computeSuggestOptions,
  computeRelockedDates,
  isBacklogJob,
} from './planningQueueUtils'

// ── Fixtures ─────────────────────────────────────────────────────────────────
// windowStart is a fixed Monday so weekend-skipping math is deterministic:
// Mon 2026-07-13 (offset 0) .. Sat 2026-07-18 (offset 5) .. Sun (offset 6).
const WINDOW_START = new Date(2026, 6, 13)

const MACHINES: Machine[] = [
  { id: 'm-zaag', name: 'Zaag', machineRatePerHour: 55, operatorRatePerHour: 45, defaultSetupMin: 10, worksWeekends: true, createdAt: '' },
  { id: 'm-las', name: 'Las', machineRatePerHour: 60, operatorRatePerHour: 50, defaultSetupMin: 15, worksWeekends: false, createdAt: '' },
  { id: 'm-frees', name: 'Frees', machineRatePerHour: 80, operatorRatePerHour: 55, defaultSetupMin: 20, worksWeekends: false, createdAt: '' },
]

let jobSeq = 0
function makeJob(overrides: Partial<QueueJob> & { orderId: string }): QueueJob {
  jobSeq++
  const base: QueueJob = {
    id: `job-${jobSeq}`,
    orderId: overrides.orderId,
    volgorde: 1,
    naam: 'bewerking',
    klant: 'Test Klant',
    artikel: 'Test Artikel',
    tekening: null,
    machineNaam: '',
    duurMin: 60,
    isPlaceholder: false,
    deadline: null,
    queuePosition: null,
    notBefore: null,
    gereed: false,
    item: null as unknown as PlanningStapItem, // patched below
  }
  const job: QueueJob = { ...base, ...overrides }
  // item.stap.geplandDatum/gereedOp are the fields isBacklogJob/sortByQueuePosition
  // actually read — keep them consistent with the job-level fields above so the
  // fixtures behave exactly like real data built via buildQueueJobs().
  job.item = {
    stap: {
      id: job.id,
      volgorde: job.volgorde,
      naam: job.naam,
      machine: job.machineNaam || null,
      gereedOp: job.gereed ? '2026-01-01T00:00:00.000Z' : null,
      gereedDoor: null,
      geplandDatum: job.machineNaam ? '2026-07-13' : null,
      geplandMachine: job.machineNaam || null,
      queuePosition: job.queuePosition,
      notBefore: job.notBefore,
    },
    order: { id: job.orderId, projectId: 'p', offerteRegelId: 'r', artikelId: null, artikelNaam: job.artikel, qty: 1, eenheid: 'stuks', stappen: [], status: 'gepland', createdAt: '', updatedAt: '' },
    project: { id: 'p', naam: job.klant, relatieId: null, contactId: null, klantRef: job.klant, status: 'productie', levertijdDatum: job.deadline, notities: '', offertes: [], opdrachtbevestiging: null, productieOrders: [], paklijst: null, factuur: null, createdAt: '', updatedAt: '' },
    duurMin: job.duurMin,
    isPlaceholder: job.isPlaceholder,
  }
  return job
}

// ── sortByQueuePosition ──────────────────────────────────────────────────────

describe('sortByQueuePosition', () => {
  it('orders by real queuePosition ascending', () => {
    const a = makeJob({ orderId: 'A', machineNaam: 'Zaag', queuePosition: 3000 })
    const b = makeJob({ orderId: 'B', machineNaam: 'Zaag', queuePosition: 1000 })
    const c = makeJob({ orderId: 'C', machineNaam: 'Zaag', queuePosition: 2000 })
    const sorted = sortByQueuePosition([a, b, c])
    expect(sorted.map(j => j.orderId)).toEqual(['B', 'C', 'A'])
  })

  it('ranks jobs with a real queuePosition ahead of jobs without one', () => {
    const withPos = makeJob({ orderId: 'A', machineNaam: 'Zaag', queuePosition: 5000 })
    const withoutPos = makeJob({ orderId: 'B', machineNaam: 'Zaag', queuePosition: null })
    const sorted = sortByQueuePosition([withoutPos, withPos])
    expect(sorted.map(j => j.orderId)).toEqual(['A', 'B'])
  })

  it('falls back to geplandDatum then volgorde when neither job has a queuePosition', () => {
    const a = makeJob({ orderId: 'A', machineNaam: 'Zaag', queuePosition: null, volgorde: 2 })
    const b = makeJob({ orderId: 'B', machineNaam: 'Zaag', queuePosition: null, volgorde: 1 })
    // both fixtures get the same geplandDatum ('2026-07-13') from makeJob, so
    // this exercises the volgorde tiebreaker specifically
    const sorted = sortByQueuePosition([a, b])
    expect(sorted.map(j => j.orderId)).toEqual(['B', 'A'])
  })
})

// ── computeInsertPosition ────────────────────────────────────────────────────

describe('computeInsertPosition', () => {
  it('returns 1000 for an empty queue', () => {
    expect(computeInsertPosition([], null)).toBe(1000)
  })

  it('appends after the last job when beforeId is null', () => {
    const a = makeJob({ orderId: 'A', queuePosition: 1000 })
    const b = makeJob({ orderId: 'B', queuePosition: 2000 })
    expect(computeInsertPosition([a, b], null)).toBe(3000)
  })

  it('computes the midpoint when inserting before a middle job', () => {
    const a = makeJob({ orderId: 'A', queuePosition: 1000 })
    const b = makeJob({ orderId: 'B', queuePosition: 2000 })
    const c = makeJob({ orderId: 'C', queuePosition: 3000 })
    expect(computeInsertPosition([a, b, c], c.id)).toBe(2500)
  })

  it('computes a position below the first job when inserting at the head', () => {
    const a = makeJob({ orderId: 'A', queuePosition: 1000 })
    const b = makeJob({ orderId: 'B', queuePosition: 2000 })
    // prev = before - 2000 = 1000 - 2000 = -1000; midpoint with 1000 => 0
    expect(computeInsertPosition([a, b], a.id)).toBe(0)
  })

  it('never moves any other jobs — only the returned number changes', () => {
    const a = makeJob({ orderId: 'A', queuePosition: 1000 })
    const b = makeJob({ orderId: 'B', queuePosition: 2000 })
    const beforeA = { ...a }
    const beforeB = { ...b }
    computeInsertPosition([a, b], b.id)
    expect(a).toEqual(beforeA)
    expect(b).toEqual(beforeB)
  })
})

// ── deriveShopSchedule ───────────────────────────────────────────────────────

describe('deriveShopSchedule', () => {
  it('schedules a single short job starting at day 0 on its machine', () => {
    const job = makeJob({ orderId: 'A', machineNaam: 'Zaag', queuePosition: 1000, duurMin: 60 })
    const queues = new Map([['Zaag', [job]]])
    const schedule = deriveShopSchedule(queues, MACHINES, WINDOW_START)
    const slot = schedule.get(job.id)!
    expect(slot.startOffsetDays).toBe(0)
    expect(slot.finishOffsetDays).toBeCloseTo(60 / 294, 5)
    expect(slot.heldByNotBefore).toBe(false)
  })

  it('skips weekends for a machine with worksWeekends=false', () => {
    // Fill Mon(0)..Fri(4) exactly full (5 * 294 min). The machine-free cursor
    // then sits at raw offset 5 (Saturday) — deriveShopSchedule doesn't
    // pre-adjust startOffsetDays for weekends, that's walkForward's job when
    // it actually *consumes* time. So a 60-min job queued next must have its
    // capacity consumption skip Sat(5)/Sun(6) and land on Mon(7), which shows
    // up as a finish date well past a same-day 60-minute job would need.
    const fillJob = makeJob({ orderId: 'FILL', machineNaam: 'Las', queuePosition: 1000, duurMin: 4 * 294 + 294 }) // fills Mon-Fri
    const nextJob = makeJob({ orderId: 'NEXT', machineNaam: 'Las', queuePosition: 2000, duurMin: 60 })
    const queues = new Map([['Las', [fillJob, nextJob]]])
    const schedule = deriveShopSchedule(queues, MACHINES, WINDOW_START)
    const nextSlot = schedule.get(nextJob.id)!
    // Consumption skips the weekend entirely and finishes early Monday (offset 7+).
    expect(nextSlot.finishOffsetDays).toBeGreaterThan(7)
    expect(nextSlot.finishOffsetDays).toBeLessThan(7.5)
  })

  it('does not skip weekends for a machine with worksWeekends=true', () => {
    const fillJob = makeJob({ orderId: 'FILL', machineNaam: 'Zaag', queuePosition: 1000, duurMin: 4 * 294 + 294 })
    const nextJob = makeJob({ orderId: 'NEXT', machineNaam: 'Zaag', queuePosition: 2000, duurMin: 60 })
    const queues = new Map([['Zaag', [fillJob, nextJob]]])
    const schedule = deriveShopSchedule(queues, MACHINES, WINDOW_START)
    const nextSlot = schedule.get(nextJob.id)!
    // Zaag works weekends, so the very next job starts right at day 5 (Saturday) — no jump to day 7.
    expect(Math.floor(nextSlot.startOffsetDays)).toBe(5)
  })

  it('spans multiple days for a long-duration job', () => {
    const job = makeJob({ orderId: 'A', machineNaam: 'Frees', queuePosition: 1000, duurMin: 294 * 3 }) // 3 full days
    const queues = new Map([['Frees', [job]]])
    const schedule = deriveShopSchedule(queues, MACHINES, WINDOW_START)
    const slot = schedule.get(job.id)!
    expect(slot.startOffsetDays).toBe(0)
    expect(Math.round(slot.finishOffsetDays)).toBe(3)
  })

  it('enforces the cross-machine predecessor constraint (zagen -> lassen)', () => {
    const zagen = makeJob({ orderId: 'ORD1', volgorde: 1, machineNaam: 'Zaag', queuePosition: 1000, duurMin: 294 * 2 }) // 2 days
    const lassen = makeJob({ orderId: 'ORD1', volgorde: 2, machineNaam: 'Las', queuePosition: 1000, duurMin: 60 })
    const queues = new Map([['Zaag', [zagen]], ['Las', [lassen]]])
    const schedule = deriveShopSchedule(queues, MACHINES, WINDOW_START)
    const zagenSlot = schedule.get(zagen.id)!
    const lassenSlot = schedule.get(lassen.id)!
    // lassen cannot start before zagen (its predecessor, on a different machine) finishes.
    expect(lassenSlot.startOffsetDays).toBeGreaterThanOrEqual(zagenSlot.finishOffsetDays)
  })

  it('does NOT block a same-order step from running same-day if the predecessor is on the SAME machine', () => {
    const s1 = makeJob({ orderId: 'ORD2', volgorde: 1, machineNaam: 'Frees', queuePosition: 1000, duurMin: 30 })
    const s2 = makeJob({ orderId: 'ORD2', volgorde: 2, machineNaam: 'Frees', queuePosition: 2000, duurMin: 30 })
    const queues = new Map([['Frees', [s1, s2]]])
    const schedule = deriveShopSchedule(queues, MACHINES, WINDOW_START)
    const s1Slot = schedule.get(s1.id)!
    const s2Slot = schedule.get(s2.id)!
    // Same-machine queue order already enforces sequencing via the cursor —
    // s2 starts exactly where s1 finished (no double predecessor-wait logic needed).
    expect(s2Slot.startOffsetDays).toBeCloseTo(s1Slot.finishOffsetDays, 5)
  })

  it('enforces notBefore as a hard floor and reports the ghost position', () => {
    const job = makeJob({
      orderId: 'A', machineNaam: 'Frees', queuePosition: 1000, duurMin: 60,
      notBefore: '2026-07-20', // 7 days after window start (Mon 2026-07-13)
    })
    const queues = new Map([['Frees', [job]]])
    const schedule = deriveShopSchedule(queues, MACHINES, WINDOW_START)
    const slot = schedule.get(job.id)!
    expect(slot.startOffsetDays).toBe(7)
    expect(slot.ghostOffsetDays).toBe(0) // where it would have started without the hold
    expect(slot.heldByNotBefore).toBe(true)
  })

  it('does not report heldByNotBefore when the hold date is not actually later than the natural start', () => {
    const job = makeJob({
      orderId: 'A', machineNaam: 'Frees', queuePosition: 1000, duurMin: 60,
      notBefore: '2026-07-13', // same as window start — not actually a constraint
    })
    const queues = new Map([['Frees', [job]]])
    const schedule = deriveShopSchedule(queues, MACHINES, WINDOW_START)
    const slot = schedule.get(job.id)!
    expect(slot.heldByNotBefore).toBe(false)
  })

  it('terminates and schedules every job for a larger multi-machine, multi-order fixture', () => {
    const queues = new Map<string, QueueJob[]>()
    const allJobs: QueueJob[] = []
    for (let o = 0; o < 5; o++) {
      const j1 = makeJob({ orderId: `ORD${o}`, volgorde: 1, machineNaam: 'Zaag', queuePosition: (o + 1) * 1000, duurMin: 90 })
      const j2 = makeJob({ orderId: `ORD${o}`, volgorde: 2, machineNaam: 'Las', queuePosition: (o + 1) * 1000, duurMin: 45 })
      allJobs.push(j1, j2)
    }
    queues.set('Zaag', allJobs.filter(j => j.machineNaam === 'Zaag'))
    queues.set('Las', allJobs.filter(j => j.machineNaam === 'Las'))
    const schedule = deriveShopSchedule(queues, MACHINES, WINDOW_START)
    expect(schedule.size).toBe(allJobs.length)
    for (const j of allJobs) expect(schedule.get(j.id)).toBeDefined()
  })

  it('skips already-completed (gereed) jobs entirely', () => {
    const done = makeJob({ orderId: 'A', machineNaam: 'Zaag', queuePosition: 1000, duurMin: 60, gereed: true })
    const pending = makeJob({ orderId: 'B', machineNaam: 'Zaag', queuePosition: 2000, duurMin: 60 })
    const queues = new Map([['Zaag', [done, pending]]])
    const schedule = deriveShopSchedule(queues, MACHINES, WINDOW_START)
    expect(schedule.has(done.id)).toBe(false)
    // pending starts at day 0 since the completed job consumes no capacity
    expect(schedule.get(pending.id)!.startOffsetDays).toBe(0)
  })
})

// ── deriveShopSchedule with honorLockedDates ────────────────────────────────
// Regression coverage for the "nodes keep shifting, startdate is always
// today" bug: a job with a committed geplandDatum must keep that date across
// renders/days, instead of the live simulation re-anchoring it to windowStart.

describe('deriveShopSchedule honorLockedDates', () => {
  it('anchors a job to its stored geplandDatum instead of windowStart', () => {
    const job = makeJob({ orderId: 'A', machineNaam: 'Zaag', queuePosition: 1000, duurMin: 60 })
    job.item.stap.geplandDatum = '2026-07-16' // 3 days after WINDOW_START (2026-07-13)
    const queues = new Map([['Zaag', [job]]])
    const live = deriveShopSchedule(queues, MACHINES, WINDOW_START)
    const locked = deriveShopSchedule(queues, MACHINES, WINDOW_START, { honorLockedDates: true })
    expect(live.get(job.id)!.startOffsetDays).toBe(0) // unlocked: always "today"
    expect(locked.get(job.id)!.startOffsetDays).toBe(3) // locked: stays put
  })

  it('does not drift the locked date when windowStart moves forward (simulates the next day)', () => {
    const job = makeJob({ orderId: 'A', machineNaam: 'Zaag', queuePosition: 1000, duurMin: 60 })
    job.item.stap.geplandDatum = '2026-07-16'
    const queues = new Map([['Zaag', [job]]])
    const today = deriveShopSchedule(queues, MACHINES, WINDOW_START, { honorLockedDates: true })
    const tomorrow = deriveShopSchedule(queues, MACHINES, new Date(2026, 6, 14), { honorLockedDates: true })
    // Same calendar date, so the offset from the (later) windowStart is one less —
    // the ANCHOR itself hasn't moved, only the reference point measuring it did.
    expect(today.get(job.id)!.startOffsetDays).toBe(3)
    expect(tomorrow.get(job.id)!.startOffsetDays).toBe(2)
  })

  it('still enforces the cross-machine predecessor constraint on a locked job', () => {
    const zagen = makeJob({ orderId: 'ORD1', volgorde: 1, machineNaam: 'Zaag', queuePosition: 1000, duurMin: 294 * 2 })
    const lassen = makeJob({ orderId: 'ORD1', volgorde: 2, machineNaam: 'Las', queuePosition: 1000, duurMin: 60 })
    zagen.item.stap.geplandDatum = '2026-07-13'
    lassen.item.stap.geplandDatum = '2026-07-13' // stale — predecessor now finishes later than this
    const queues = new Map([['Zaag', [zagen]], ['Las', [lassen]]])
    const schedule = deriveShopSchedule(queues, MACHINES, WINDOW_START, { honorLockedDates: true })
    const zagenSlot = schedule.get(zagen.id)!
    const lassenSlot = schedule.get(lassen.id)!
    expect(lassenSlot.startOffsetDays).toBeGreaterThanOrEqual(zagenSlot.finishOffsetDays)
  })

  it('does not clamp an overdue locked job forward to windowStart', () => {
    const job = makeJob({ orderId: 'A', machineNaam: 'Zaag', queuePosition: 1000, duurMin: 60 })
    job.item.stap.geplandDatum = '2026-07-10' // 3 days BEFORE WINDOW_START — overdue
    const queues = new Map([['Zaag', [job]]])
    const schedule = deriveShopSchedule(queues, MACHINES, WINDOW_START, { honorLockedDates: true })
    expect(schedule.get(job.id)!.startOffsetDays).toBe(-3)
  })

  it('falls back to a live simulated start for a job with no geplandDatum yet', () => {
    const job = makeJob({ orderId: 'A', machineNaam: 'Zaag', queuePosition: 1000, duurMin: 60 })
    job.item.stap.geplandDatum = null // e.g. just dragged in from the backlog, not yet relocked
    const queues = new Map([['Zaag', [job]]])
    const schedule = deriveShopSchedule(queues, MACHINES, WINDOW_START, { honorLockedDates: true })
    expect(schedule.get(job.id)!.startOffsetDays).toBe(0)
  })
})

// ── computeRelockedDates ─────────────────────────────────────────────────────

describe('computeRelockedDates', () => {
  it('leaves an unchanged machine\'s already-locked job untouched', () => {
    const job = makeJob({ orderId: 'A', machineNaam: 'Zaag', queuePosition: 1000, duurMin: 60 })
    job.item.stap.geplandDatum = '2026-07-20'
    const queues = new Map([['Zaag', [job]]])
    const dates = computeRelockedDates(queues, new Set(), MACHINES, WINDOW_START)
    expect(dates.get(job.id)).toBe('2026-07-20')
  })

  it('computes a fresh date for a job on a changed machine', () => {
    const job = makeJob({ orderId: 'A', machineNaam: 'Zaag', queuePosition: 1000, duurMin: 60 })
    job.item.stap.geplandDatum = '2026-07-20' // stale — machine's queue just changed
    const queues = new Map([['Zaag', [job]]])
    const dates = computeRelockedDates(queues, new Set(['Zaag']), MACHINES, WINDOW_START)
    expect(dates.get(job.id)).toBe('2026-07-13') // fresh: windowStart, day 0
  })

  it('cascades a fresh date to a cross-machine dependent even though its own machine did not change', () => {
    const zagen = makeJob({ orderId: 'ORD1', volgorde: 1, machineNaam: 'Zaag', queuePosition: 1000, duurMin: 294 * 3 }) // 3 days
    const lassen = makeJob({ orderId: 'ORD1', volgorde: 2, machineNaam: 'Las', queuePosition: 1000, duurMin: 60 })
    zagen.item.stap.geplandDatum = '2026-07-13'
    lassen.item.stap.geplandDatum = '2026-07-14' // was fine when zagen was shorter; now stale
    const queues = new Map([['Zaag', [zagen]], ['Las', [lassen]]])
    // Only "Zaag" changed (e.g. zagen's own duration/position changed) — "Las" did not.
    const dates = computeRelockedDates(queues, new Set(['Zaag']), MACHINES, WINDOW_START)
    expect(dates.get(zagen.id)).toBe('2026-07-13')
    // lassen must cascade to start no earlier than zagen actually finishes now,
    // even though Las itself wasn't in changedMachines.
    expect(dates.get(lassen.id)! >= '2026-07-16').toBe(true)
  })
})

// ── computeVerplichtKlaar ────────────────────────────────────────────────────

describe('computeVerplichtKlaar', () => {
  it('walks backward from the deadline for a multi-step order', () => {
    const s1 = makeJob({ orderId: 'ORD1', volgorde: 1, machineNaam: 'Zaag', queuePosition: 1000, duurMin: 294, deadline: '2026-07-20' })
    const s2 = makeJob({ orderId: 'ORD1', volgorde: 2, machineNaam: 'Las', queuePosition: 1000, duurMin: 294, deadline: '2026-07-20' })
    const map = computeVerplichtKlaar([s1, s2], WINDOW_START)
    // last step (s2) must be done ON the deadline; s1 (1 day earlier, since its
    // own duration is 294min = 1 day) must be done 1 day before that.
    expect(map.get(s2.id)).toBe('2026-07-20')
    expect(map.get(s1.id)).toBe('2026-07-19')
  })

  it('ignores jobs with no deadline or that are already gereed', () => {
    const noDeadline = makeJob({ orderId: 'A', machineNaam: 'Zaag', deadline: null })
    const done = makeJob({ orderId: 'B', machineNaam: 'Zaag', deadline: '2026-07-20', gereed: true })
    const map = computeVerplichtKlaar([noDeadline, done], WINDOW_START)
    expect(map.has(noDeadline.id)).toBe(false)
    expect(map.has(done.id)).toBe(false)
  })
})

// ── isAtRisk ─────────────────────────────────────────────────────────────────

describe('isAtRisk', () => {
  it('is false when there is no slot', () => {
    const job = makeJob({ orderId: 'A' })
    expect(isAtRisk(job, undefined, new Map(), WINDOW_START)).toBe(false)
  })

  it('is false when there is no required date on record', () => {
    const job = makeJob({ orderId: 'A' })
    const slot = { startOffsetDays: 0, durationDays: 1, finishOffsetDays: 1, ghostOffsetDays: 0, heldByNotBefore: false }
    expect(isAtRisk(job, slot, new Map(), WINDOW_START)).toBe(false)
  })

  it('is true when the derived finish lands after the required-finish date', () => {
    const job = makeJob({ orderId: 'A' })
    const verplicht = new Map([[job.id, '2026-07-14']]) // day offset 1
    const slot = { startOffsetDays: 0, durationDays: 3, finishOffsetDays: 3, ghostOffsetDays: 0, heldByNotBefore: false } // finishes day 3
    expect(isAtRisk(job, slot, verplicht, WINDOW_START)).toBe(true)
  })

  it('is false when the derived finish lands on or before the required-finish date', () => {
    const job = makeJob({ orderId: 'A' })
    const verplicht = new Map([[job.id, '2026-07-20']]) // day offset 7
    const slot = { startOffsetDays: 0, durationDays: 1, finishOffsetDays: 1, ghostOffsetDays: 0, heldByNotBefore: false }
    expect(isAtRisk(job, slot, verplicht, WINDOW_START)).toBe(false)
  })
})

// ── buildConnectors ──────────────────────────────────────────────────────────

describe('buildConnectors', () => {
  it('connects consecutive steps of the same order on different machines', () => {
    const zagen = makeJob({ orderId: 'ORD1', volgorde: 1, machineNaam: 'Zaag', queuePosition: 1000 })
    const lassen = makeJob({ orderId: 'ORD1', volgorde: 2, machineNaam: 'Las', queuePosition: 1000 })
    const connectors = buildConnectors([zagen, lassen])
    expect(connectors).toHaveLength(1)
    expect(connectors[0]).toMatchObject({ orderId: 'ORD1', fromJobId: zagen.id, toJobId: lassen.id })
  })

  it('does not connect consecutive steps queued on the SAME machine', () => {
    const s1 = makeJob({ orderId: 'ORD1', volgorde: 1, machineNaam: 'Frees', queuePosition: 1000 })
    const s2 = makeJob({ orderId: 'ORD1', volgorde: 2, machineNaam: 'Frees', queuePosition: 2000 })
    expect(buildConnectors([s1, s2])).toHaveLength(0)
  })

  it('ignores backlog (unqueued) and completed steps', () => {
    const backlog = makeJob({ orderId: 'ORD1', volgorde: 1, machineNaam: '' })
    const queued = makeJob({ orderId: 'ORD1', volgorde: 2, machineNaam: 'Las', queuePosition: 1000 })
    expect(buildConnectors([backlog, queued])).toHaveLength(0)

    const done = makeJob({ orderId: 'ORD2', volgorde: 1, machineNaam: 'Zaag', queuePosition: 1000, gereed: true })
    const alsoQueued = makeJob({ orderId: 'ORD2', volgorde: 2, machineNaam: 'Las', queuePosition: 1000 })
    expect(buildConnectors([done, alsoQueued])).toHaveLength(0)
  })
})

describe('hasDownstreamDependent / getGroupInfo', () => {
  it('detects a queued successor on a different machine', () => {
    const zagen = makeJob({ orderId: 'ORD1', volgorde: 1, machineNaam: 'Zaag', queuePosition: 1000 })
    const lassen = makeJob({ orderId: 'ORD1', volgorde: 2, machineNaam: 'Las', queuePosition: 1000 })
    expect(hasDownstreamDependent(zagen, [zagen, lassen])?.id).toBe(lassen.id)

    const groupZagen = getGroupInfo(zagen, [zagen, lassen])
    expect(groupZagen?.direction).toBe('downstream')
    expect(groupZagen?.partnerJob.id).toBe(lassen.id)

    const groupLassen = getGroupInfo(lassen, [zagen, lassen])
    expect(groupLassen?.direction).toBe('upstream')
    expect(groupLassen?.partnerJob.id).toBe(zagen.id)
  })

  it('returns null/none for a standalone step with no cross-machine neighbor', () => {
    const solo = makeJob({ orderId: 'ORD1', volgorde: 1, machineNaam: 'Zaag', queuePosition: 1000 })
    expect(hasDownstreamDependent(solo, [solo])).toBeNull()
    expect(getGroupInfo(solo, [solo])).toBeNull()
  })

  it('returns null for a job still in the backlog', () => {
    const backlog = makeJob({ orderId: 'ORD1', volgorde: 1, machineNaam: '' })
    expect(isBacklogJob(backlog)).toBe(true)
    expect(getGroupInfo(backlog, [backlog])).toBeNull()
  })
})

// ── computeCascadeImpact ─────────────────────────────────────────────────────

describe('computeCascadeImpact', () => {
  it('detects a delta on a dependent job living on a DIFFERENT machine when reordering', () => {
    const zagenA = makeJob({ orderId: 'ORD-A', volgorde: 1, machineNaam: 'Zaag', queuePosition: 1000, duurMin: 294 })
    const lassenA = makeJob({ orderId: 'ORD-A', volgorde: 2, machineNaam: 'Las', queuePosition: 1000, duurMin: 60 })
    const zagenB = makeJob({ orderId: 'ORD-B', volgorde: 1, machineNaam: 'Zaag', queuePosition: 2000, duurMin: 294 })

    const queues = new Map([['Zaag', [zagenA, zagenB]], ['Las', [lassenA]]])
    // Proposed: move zagenB ahead of zagenA — pushes zagenA (and therefore its
    // dependent lassenA) later.
    const proposed = [zagenB, zagenA]
    const impact = computeCascadeImpact('Zaag', proposed, queues, MACHINES, WINDOW_START)
    expect(impact).not.toBeNull()
    expect(impact!.affectedJob.id).toBe(lassenA.id)
    expect(impact!.deltaDays).toBeGreaterThan(0)
  })

  it('returns null when reordering does not shift any cross-machine dependent', () => {
    const s1 = makeJob({ orderId: 'ORD-A', volgorde: 1, machineNaam: 'Zaag', queuePosition: 1000, duurMin: 60 })
    const s2 = makeJob({ orderId: 'ORD-B', volgorde: 1, machineNaam: 'Zaag', queuePosition: 2000, duurMin: 60 })
    const queues = new Map([['Zaag', [s1, s2]]])
    const impact = computeCascadeImpact('Zaag', [s2, s1], queues, MACHINES, WINDOW_START)
    expect(impact).toBeNull()
  })
})

// ── computeQueueKpis ─────────────────────────────────────────────────────────

describe('computeQueueKpis', () => {
  it('counts active/backlog/at-risk correctly', () => {
    const backlogJob = makeJob({ orderId: 'A', machineNaam: '' })
    const activeJob = makeJob({ orderId: 'B', machineNaam: 'Zaag', queuePosition: 1000, duurMin: 60 })
    const allJobs = [backlogJob, activeJob]
    const backlog = [backlogJob]
    const schedule = deriveShopSchedule(new Map([['Zaag', [activeJob]]]), MACHINES, WINDOW_START)
    const verplicht = new Map<string, string>()
    const kpis = computeQueueKpis(allJobs, backlog, MACHINES, schedule, verplicht, WINDOW_START)
    expect(kpis.geplandDezeWeek).toBe(1)
    expect(kpis.tePlannen).toBe(1)
    expect(kpis.achterstand).toBe(0)
    expect(kpis.gemDoorlooptijdDagen).toBeGreaterThan(0)
  })
})

// ── computeSuggestOptions ────────────────────────────────────────────────────

describe('computeSuggestOptions', () => {
  it('SPT (doorlooptijd) orders the shortest job first on each machine', () => {
    const long = makeJob({ orderId: 'A', machineNaam: 'Zaag', queuePosition: 1000, duurMin: 240 })
    const short = makeJob({ orderId: 'B', machineNaam: 'Zaag', queuePosition: 2000, duurMin: 30 })
    const allJobs = [long, short]
    const queues = new Map([['Zaag', allJobs]])
    const options = computeSuggestOptions(allJobs, [], queues, MACHINES, WINDOW_START)
    const spt = options.find(o => o.objective === 'doorlooptijd')!
    const zaagQueue = spt.queues.get('Zaag')!
    expect(zaagQueue[0].id).toBe(short.id)
  })

  it('LPT (bezetting) orders the longest job first on each machine', () => {
    const long = makeJob({ orderId: 'A', machineNaam: 'Zaag', queuePosition: 1000, duurMin: 240 })
    const short = makeJob({ orderId: 'B', machineNaam: 'Zaag', queuePosition: 2000, duurMin: 30 })
    const allJobs = [long, short]
    const queues = new Map([['Zaag', allJobs]])
    const options = computeSuggestOptions(allJobs, [], queues, MACHINES, WINDOW_START)
    const lpt = options.find(o => o.objective === 'bezetting')!
    const zaagQueue = lpt.queues.get('Zaag')!
    expect(zaagQueue[0].id).toBe(long.id)
  })

  it('EDD (achterstand) orders the earlier-required job first on each machine', () => {
    const urgent = makeJob({ orderId: 'A', machineNaam: 'Zaag', queuePosition: 1000, duurMin: 60, deadline: '2026-07-15' })
    const relaxed = makeJob({ orderId: 'B', machineNaam: 'Zaag', queuePosition: 2000, duurMin: 60, deadline: '2026-08-01' })
    const allJobs = [urgent, relaxed]
    const queues = new Map([['Zaag', allJobs]])
    const options = computeSuggestOptions(allJobs, [], queues, MACHINES, WINDOW_START)
    const edd = options.find(o => o.objective === 'achterstand')!
    const zaagQueue = edd.queues.get('Zaag')!
    expect(zaagQueue[0].id).toBe(urgent.id)
  })

  it('excludes gereed jobs from every proposed queue', () => {
    const done = makeJob({ orderId: 'A', machineNaam: 'Zaag', queuePosition: 1000, gereed: true })
    const pending = makeJob({ orderId: 'B', machineNaam: 'Zaag', queuePosition: 2000 })
    const allJobs = [done, pending]
    const queues = new Map([['Zaag', allJobs]])
      const options = computeSuggestOptions(allJobs, [], queues, MACHINES, WINDOW_START)
    for (const opt of options) {
      expect(opt.queues.get('Zaag')!.some(j => j.id === done.id)).toBe(false)
    }
  })
})
