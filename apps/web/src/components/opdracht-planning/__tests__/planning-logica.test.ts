import { describe, it, expect } from 'vitest'
import type { QueueJob } from '../../../utils/planningQueueUtils'
import type { PlanningStapItem } from '../../../utils/planningUtils'
import { bouwGantt, rangTussen, werkbord, type Kaart } from '../planning-logica'

const WS = new Date(2026, 6, 13)
function job(id: string, order: string, volgorde: number, extra: Partial<QueueJob> = {}): QueueJob {
  const stap = { id, volgorde, naam: 'stap', machine: 'DMG', gereedOp: null, gereedDoor: null, geplandDatum: '2026-07-13', geplandMachine: 'DMG' }
  return {
    id, orderId: order, volgorde, naam: 'stap', klant: 'K', artikel: `Art ${order}`, tekening: null, machineNaam: 'DMG', duurMin: 294,
    isPlaceholder: false, deadline: '2026-07-14', queuePosition: 1000, wachtOpMateriaal: false, gereed: false,
    item: { stap, order: { id: order, qty: 5, status: 'in_productie', stappen: [{ id: `${order}-1` }, { id: `${order}-2` }] }, project: { id: 'P1', naam: 'Proj', levertijdDatum: '2026-07-14' }, duurMin: 294, isPlaceholder: false } as unknown as PlanningStapItem,
    ...extra,
  }
}

describe('werkbord', () => {
  it('de kolom zegt wat de stap nu kan', () => {
    const a1 = job('A-1', 'A', 1), a2 = job('A-2', 'A', 2), b1 = job('B-1', 'B', 1, { wachtOpMateriaal: true }), c1 = job('C-1', 'C', 1)
    const k = werkbord([a1, a2, b1, c1], [], new Set(['C-1']), new Map([['A-1', 1000], ['A-2', 2000], ['B-1', 3000], ['C-1', 4000]]))
    expect(k.klaar.map((x) => x.job.id)).toEqual(['A-1'])
    expect(k.vorige.map((x) => x.job.id)).toEqual(['A-2'])
    expect(k.materiaal.map((x) => x.job.id)).toEqual(['B-1'])
    expect(k.bezig.map((x) => x.job.id)).toEqual(['C-1'])
    expect(k.vorige[0]).toMatchObject({ stapNr: 2, stappen: 2 })
  })

  it('hoger zetten: tussen de buren, bovenaan of onderaan', () => {
    const kol = [1000, 2000, 3000].map((r, i) => ({ job: { id: `k${i}` }, rang: r }) as unknown as Kaart)
    expect(rangTussen(kol, 'k2', 'k1')).toBe(1500)
    expect(rangTussen(kol, 'k2', 'k0')).toBe(500)
    expect(rangTussen(kol, 'k0', null)).toBe(3500)
  })
})

describe('Gantt per opdracht', () => {
  it('per project de artikelen, het percentage gereed en of hij te laat is', () => {
    const a1 = job('A-1', 'A', 1), a2 = job('A-2', 'A', 2)
    const klaar = { ...a1.item, stap: { ...a1.item.stap, id: 'A-0', gereedOp: '2026-07-10T10:00:00Z' } } as PlanningStapItem
    const schema = new Map([['A-1', { startOffsetDays: 0, durationDays: 1, finishOffsetDays: 1, ghostOffsetDays: 0 }], ['A-2', { startOffsetDays: 1, durationDays: 2, finishOffsetDays: 3, ghostOffsetDays: 0 }]])
    const [g] = bouwGantt([klaar, a1.item, a2.item], [a1, a2], schema, WS)
    expect(g.artikelen).toHaveLength(1)
    expect(g.artikelen[0].stappen.map((s) => s.job.id)).toEqual(['A-1', 'A-2'])
    expect(g.pct).toBe(33)
    expect(g.teLaat).toBe(1) // klaar wo 15-07, levering di 14-07
  })
})
