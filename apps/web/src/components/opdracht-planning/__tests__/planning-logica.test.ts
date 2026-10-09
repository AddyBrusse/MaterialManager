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

describe('signalen: achter lopen', () => {
  it('bezig voorbij het geplande eind = loopt uit; niet gestart en start voorbij = had moeten beginnen', async () => {
    const { stapSignalen, aantalAchter } = await import('../signalen')
    const M = [{ id: 'DMG', name: 'DMG', worksWeekends: false }] as never
    const a = job('A-1', 'A', 1)
    const b = job('B-1', 'B', 1)
    const c = job('C-1', 'C', 1, { wachtOpMateriaal: true })
    const schema = new Map([['B-1', { startOffsetDays: -2, durationDays: 1, finishOffsetDays: -1, ghostOffsetDays: 0 }]])
    const klokken = new Map([['A-1', { gestartOp: '2026-07-09T07:00:00', seconden: 4 * 3600 }]])
    const { signalen, lopen } = stapSignalen([a, b, c], schema, klokken, M, WS, 0.5)
    expect(signalen.get('A-1')!.map((s) => s.soort)).toEqual(['uitloop'])
    expect(signalen.get('A-1')![0].tekst).toMatch(/4 u gemeten van 4,9 u geschat/)
    expect(lopen.get('A-1')!.tot).toBe(0.5)
    expect(signalen.get('B-1')!.map((s) => s.soort)).toEqual(['achter'])
    expect(signalen.get('C-1')!.map((s) => s.tekst)).toEqual(['Materiaal: leverdatum onbekend'])
    expect(aantalAchter(signalen)).toBe(2)
  })
})

describe('KanBan: banen per machine', () => {
  const M = [{ id: 'DMG', name: 'DMG', soort: 'draaien' }, { id: 'Doosan', name: 'Doosan', soort: 'draaien' }, { id: 'Haas', name: 'Haas', soort: 'frezen' }] as never
  const op = (id: string, order: string, volgorde: number, machine: string, start: number) => {
    const j = job(id, order, volgorde, { machineNaam: machine })
    ;(j.item.stap as { geplandMachine: string; machine: string }).geplandMachine = machine
    ;(j.item.stap as { machine: string }).machine = machine
    return { j, slot: [id, { startOffsetDays: start, durationDays: 1, finishOffsetDays: start + 1, ghostOffsetDays: 0 }] as const }
  }
  it('per machine in de volgorde waarin hij het doet, bezig bovenaan', async () => {
    const { kanbanBanen } = await import('../planning-logica')
    const a = op('A-1', 'A', 1, 'DMG', 2), b = op('B-1', 'B', 1, 'DMG', 0), c = op('C-1', 'C', 1, 'DMG', 1)
    const banen = kanbanBanen([a.j, b.j, c.j], M, new Map([a.slot, b.slot, c.slot]), new Set(['A-1']), new Map([['A-1', 1000], ['B-1', 2000], ['C-1', 3000]]))
    expect(banen[0].kaarten.map((k) => k.job.id)).toEqual(['A-1', 'B-1', 'C-1'])
    expect(banen.map((b) => b.machine?.name)).toEqual(['DMG', 'Doosan', 'Haas'])
  })
  it('loslaten: rang tussen de buren, andere machine alleen van dezelfde soort, stap 2 niet vóór stap 1', async () => {
    const { kanbanBanen, kanbanLos } = await import('../planning-logica')
    const s1 = op('A-1', 'A', 1, 'DMG', 0), x = op('X-1', 'X', 1, 'DMG', 1), s2 = op('A-2', 'A', 2, 'DMG', 2)
    const rang = new Map([['A-1', 1000], ['X-1', 2000], ['A-2', 3000]])
    const banen = kanbanBanen([s1.j, x.j, s2.j], M, new Map([s1.slot, x.slot, s2.slot]), new Set(), rang)
    const [dmg, doosan, haas] = banen
    const k = (id: string) => dmg.kaarten.find((q) => q.job.id === id)!
    expect(kanbanLos(dmg, k('A-2'), 'A-1', M)).toMatchObject({ reden: expect.stringMatching(/Stap 1 .* staat hier nog onder/) })
    expect(kanbanLos(dmg, k('A-2'), 'X-1', M)).toEqual({ prioriteit: 1500, machine: undefined })
    expect(kanbanLos(dmg, k('X-1'), 'A-2', M)).toBeNull()
    expect(kanbanLos(doosan, k('X-1'), null, M)).toEqual({ prioriteit: 2000, machine: 'Doosan' })
    expect(kanbanLos(haas, k('X-1'), null, M)).toMatchObject({ reden: expect.stringMatching(/frezenmachine/) })
  })
})
