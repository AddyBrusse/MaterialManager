import { describe, it, expect } from 'vitest'
import type { Machine } from '../../api/machines'
import type { PlanningStapItem } from '../planningUtils'
import type { QueueJob, DerivedSlot } from '../planningQueueUtils'
import { bepaalRang, effecten, planAutomatisch, vatSamen, wijzigingen } from '../auto-planning'

// Maandag 13-07-2026; 294 minuten = één werkdag.
const WS = new Date(2026, 6, 13)
const DAG = 294
const BASIS = { machineRatePerHour: 60, operatorRatePerHour: 50, defaultSetupMin: 10, worksWeekends: false, barloaderMinMm: 500, barloaderMaxMm: 1100, opspanlengteMm: 30, afsteekMm: 3, heeftStangenlader: false, createdAt: '' }
const M = (name: string, soort: Machine['soort']): Machine => ({ id: name, name, soort, ...BASIS })
const MACHINES = [M('Zaag', 'zagen'), M('DMG', 'draaien'), M('Doosan', 'draaien'), M('Haas', 'frezen')]

let n = 0
function job(o: {
  order: string; volgorde?: number; recept: string; op?: string; min?: number; deadline?: string | null
  prio?: number | null; datum?: string | null; pos?: number | null
}): QueueJob {
  n++
  const id = `s${n}`
  const stap = {
    id, volgorde: o.volgorde ?? 1, naam: 'stap', machine: o.recept, gereedOp: null, gereedDoor: null,
    geplandDatum: o.datum ?? null, geplandMachine: o.op ?? null, queuePosition: o.pos ?? null, prioriteit: o.prio ?? null,
  }
  return {
    id, orderId: o.order, volgorde: stap.volgorde, naam: 'stap', klant: 'K', artikel: 'A', tekening: null,
    machineNaam: o.op ?? '', duurMin: o.min ?? DAG, isPlaceholder: false, deadline: o.deadline ?? null,
    queuePosition: stap.queuePosition, wachtOpMateriaal: false, gereed: false,
    item: { stap, order: { id: o.order, stappen: [] }, project: { id: `P-${o.order}`, levertijdDatum: o.deadline ?? null }, duurMin: o.min ?? DAG, isPlaceholder: false } as unknown as PlanningStapItem,
  }
}
const plan = (jobs: QueueJob[], extra: { lopend?: string[]; opLevertijd?: boolean } = {}) =>
  planAutomatisch({ jobs, machines: MACHINES, windowStart: WS, lopend: new Set(extra.lopend ?? []), opLevertijd: extra.opLevertijd })

describe('receptvolgorde', () => {
  it('stap 2 begint nooit vóór stap 1, ook niet op dezelfde machine en met meer voorrang', () => {
    const s1 = job({ order: 'A', volgorde: 1, recept: 'DMG', prio: 2000 })
    const s2 = job({ order: 'A', volgorde: 2, recept: 'DMG', prio: 1000 })
    const u = plan([s2, s1])
    expect(u.plaatsen.get(s1.id)!.start).toBe(0)
    expect(u.plaatsen.get(s2.id)!.start).toBeCloseTo(1)
    expect(u.plaatsen.get(s2.id)!.queuePosition).toBeGreaterThan(u.plaatsen.get(s1.id)!.queuePosition!)
  })

  it('een stap die op zijn vorige stap wacht, laat de machine niet stilstaan', () => {
    const a1 = job({ order: 'A', volgorde: 1, recept: 'Zaag', prio: 1000 })
    const a2 = job({ order: 'A', volgorde: 2, recept: 'DMG', prio: 2000 })
    const b1 = job({ order: 'B', volgorde: 1, recept: 'DMG', prio: 3000 })
    const u = plan([a1, a2, b1])
    // B heeft minder voorrang, maar A2 kan pas morgen: B gaat vandaag in het gat.
    expect(u.plaatsen.get(b1.id)!.start).toBe(0)
    expect(u.plaatsen.get(a2.id)!.start).toBeCloseTo(1)
  })

  it('past het werk niet in het gat, dan gaat het erachter', () => {
    const a1 = job({ order: 'A', volgorde: 1, recept: 'Zaag', min: DAG / 2, prio: 1000 })
    const a2 = job({ order: 'A', volgorde: 2, recept: 'DMG', prio: 2000 })
    const b1 = job({ order: 'B', volgorde: 1, recept: 'DMG', prio: 3000 })
    const u = plan([a1, a2, b1])
    expect(u.plaatsen.get(a2.id)!.start).toBeCloseTo(0.5)
    expect(u.plaatsen.get(b1.id)!.start).toBeCloseTo(1.5)
  })
})

describe('prioriteit', () => {
  it('nieuw werk komt op uiterlijk starten, ook tussen al gerangschikt werk', () => {
    const vroeg = job({ order: 'V', recept: 'DMG', deadline: '2026-07-15' })
    const midden = job({ order: 'M', recept: 'DMG', deadline: '2026-07-22', prio: 1000 })
    const laat = job({ order: 'L', recept: 'DMG', deadline: '2026-07-31' })
    expect(bepaalRang([laat, midden, vroeg], WS, new Set()).map((j) => j.orderId)).toEqual(['V', 'M', 'L'])
  })

  it('wat hoger gezet is, gaat voor — ook als de leverdatum later is', () => {
    const a = job({ order: 'A', recept: 'DMG', deadline: '2026-07-15', prio: 2000 })
    const b = job({ order: 'B', recept: 'DMG', deadline: '2026-07-31', prio: 1000 })
    const u = plan([a, b])
    expect(u.plaatsen.get(b.id)!.start).toBe(0)
    expect(u.plaatsen.get(a.id)!.start).toBeCloseTo(1)
    // ...en "op leverdatum" zet het terug
    const opnieuw = plan([a, b], { opLevertijd: true })
    expect(opnieuw.plaatsen.get(a.id)!.start).toBe(0)
  })

  it('waar de klok loopt, ligt vast en gaat voor', () => {
    const a = job({ order: 'A', recept: 'DMG', prio: 1000 })
    const b = job({ order: 'B', recept: 'DMG', prio: 2000, op: 'DMG' })
    const u = plan([a, b], { lopend: [b.id] })
    expect(u.plaatsen.get(b.id)!.start).toBe(0)
    expect(u.rang[0]).toBe(b.id)
  })

  it('de rang wordt opnieuw genummerd, zodat slepen er altijd tussen past', () => {
    const u = plan([job({ order: 'A', recept: 'DMG' }), job({ order: 'B', recept: 'DMG' })])
    expect([...u.plaatsen.values()].map((p) => p.prioriteit).sort()).toEqual([1000, 2000])
  })
})

describe('machine en kalender', () => {
  it('de machine waar hij op staat gaat voor het recept', () => {
    const a = job({ order: 'A', recept: 'DMG', op: 'Doosan' })
    expect(plan([a]).plaatsen.get(a.id)!.machine).toBe('Doosan')
  })

  it('zonder bestaande receptmachine: die van de soort die hem het eerst af heeft', () => {
    const bezet = job({ order: 'X', recept: 'DMG', prio: 1000 })
    const a = job({ order: 'A', recept: 'Draaien', prio: 2000 })
    const u = plan([bezet, a])
    expect(u.plaatsen.get(a.id)!.machine).toBe('Doosan')
    expect(u.plaatsen.get(a.id)!.start).toBe(0)
  })

  it('geen machine te vinden: niet ingepland, met een zin wat er moet', () => {
    const a = job({ order: 'A', recept: 'Lassen' })
    const p = plan([a]).plaatsen.get(a.id)!
    expect(p.machine).toBeNull()
    expect(p.geplandDatum).toBeNull()
    expect(p.reden).toMatch(/Kies er een op het werkbord/)
  })

  it('het weekend telt niet: wat vrijdag eindigt, gaat maandag verder', () => {
    const lang = job({ order: 'A', recept: 'DMG', min: DAG * 5, prio: 1000 })
    const daarna = job({ order: 'B', recept: 'DMG', prio: 2000 })
    const p = plan([lang, daarna]).plaatsen.get(daarna.id)!
    expect(p.geplandDatum).toBe('2026-07-20')
  })
})

describe('wat er verandert', () => {
  it('alleen stappen waarvan echt iets anders wordt', () => {
    const a = job({ order: 'A', recept: 'DMG', op: 'DMG', datum: '2026-07-13', pos: 1000, prio: 1000 })
    const b = job({ order: 'B', recept: 'DMG' })
    const w = wijzigingen([a, b], plan([a, b]))
    expect(w.map((x) => x.stapId)).toEqual([b.id])
    expect(w[0]).toMatchObject({ geplandMachine: 'DMG', geplandDatum: '2026-07-14', projectId: 'P-B', orderId: 'B' })
  })

  it('de melding: nieuw ingepland en of de levering gehaald wordt, en wie er later uitkomt', () => {
    const oud = job({ order: 'OUD', recept: 'DMG', op: 'DMG', datum: '2026-07-13', pos: 1000, prio: 2000, deadline: '2026-07-14' })
    const nieuw = job({ order: 'NIEUW', recept: 'DMG', deadline: '2026-07-13', min: DAG * 2 })
    const voor = new Map<string, DerivedSlot>([[oud.id, { startOffsetDays: 0, durationDays: 1, finishOffsetDays: 1, ghostOffsetDays: 0 }]])
    const u = plan([oud, nieuw])
    const s = vatSamen(effecten([oud, nieuw], voor, u, WS))
    expect(s.ingepland.map((e) => e.orderId)).toEqual(['NIEUW'])
    expect(s.ingepland[0].nieuwTeLaat).toBe(1) // klaar di 14-07, levering ma 13-07
    expect(s.later).toMatchObject([{ orderId: 'OUD', oudEind: '2026-07-13', nieuwEind: '2026-07-15', oudTeLaat: 0, nieuwTeLaat: 1 }])
  })
})
