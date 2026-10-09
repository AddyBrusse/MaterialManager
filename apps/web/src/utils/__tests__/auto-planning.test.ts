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
const plan = (jobs: QueueJob[], extra: { lopend?: string[]; gestart?: [string, string][]; opLevertijd?: boolean; nu?: number } = {}) =>
  planAutomatisch({
    jobs, machines: MACHINES, windowStart: WS, lopend: new Set(extra.lopend ?? []), gestart: new Map(extra.gestart ?? []),
    opLevertijd: extra.opLevertijd, nu: extra.nu ?? 0,
  })

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
    const u = plan([a, b], { lopend: [b.id], gestart: [[b.id, '2026-07-13T07:00:00']] })
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

describe('bezig, uitloop en materiaal', () => {
  it('een stap die bezig is blijft staan waar de klok begon', () => {
    const a = job({ order: 'A', recept: 'DMG', op: 'DMG', min: DAG * 2 })
    // gestart vrijdag 10-07 om 7:00, nu maandag 13-07 begin van de dag: gepland eind di 14-07
    const p = plan([a], { lopend: [a.id], gestart: [[a.id, '2026-07-10T07:00:00']] }).plaatsen.get(a.id)!
    expect(p.start).toBe(-3)
    expect(p.geplandDatum).toBe('2026-07-10')
    expect(p.uitloop).toBe(false)
  })

  it('voorbij het geplande eind en niet gereed: loopt uit, klaar aan het eind van vandaag, en wat erna komt schuift', () => {
    const a = job({ order: 'A', recept: 'DMG', op: 'DMG', prio: 1000 })
    const b = job({ order: 'B', recept: 'DMG', prio: 2000 })
    const u = plan([a, b], { lopend: [a.id], gestart: [[a.id, '2026-07-09T07:00:00']], nu: 0.5 })
    const pa = u.plaatsen.get(a.id)!
    expect(pa.uitloop).toBe(true)
    expect(pa.eind).toBe(1)
    expect(pa.reden).toMatch(/loopt uit/)
    expect(u.plaatsen.get(b.id)!.start).toBeCloseTo(1) // ma 13 vol door de uitloop → di 14
  })

  it('wacht op materiaal: niet vóór het er naar verwachting is', () => {
    const a = job({ order: 'A', recept: 'DMG' })
    a.wachtOpMateriaal = true
    ;(a.item.order as { materiaalVerwacht?: string }).materiaalVerwacht = '2026-07-16'
    const p = plan([a]).plaatsen.get(a.id)!
    expect(p.geplandDatum).toBe('2026-07-16')
    expect(p.reden).toBeNull()
  })

  it('leverdatum van het materiaal onbekend: vanaf vandaag, met een zin wat er moet', () => {
    const a = job({ order: 'A', recept: 'DMG' })
    a.wachtOpMateriaal = true
    ;(a.item.order as { materiaalOnbekend?: boolean }).materiaalOnbekend = true
    const p = plan([a]).plaatsen.get(a.id)!
    expect(p.start).toBe(0)
    expect(p.reden).toMatch(/onbekend.*Bestellingen/)
  })
})

describe('tijdstip op de werkdag', () => {
  it('na 16:00 telt als het begin van de volgende dag', async () => {
    const { tijdstipAlsDag } = await import('../auto-planning')
    expect(tijdstipAlsDag(new Date(2026, 6, 13, 7, 0), WS)).toBe(0)
    expect(tijdstipAlsDag(new Date(2026, 6, 13, 11, 30), WS)).toBeCloseTo(0.5)
    expect(tijdstipAlsDag(new Date(2026, 6, 13, 18, 0), WS)).toBe(1)
    expect(tijdstipAlsDag(new Date(2026, 6, 13, 5, 0), WS)).toBe(0)
  })
})

describe('machine laten wachten (2026-10-09)', () => {
  it('zonder: werk met minder voorrang vult de wachttijd; met: de machine wacht en dat werk komt erna', () => {
    const a1 = job({ order: 'A', volgorde: 1, recept: 'Zaag', prio: 1000 })
    const a2 = job({ order: 'A', volgorde: 2, recept: 'DMG', prio: 2000 })
    const b1 = job({ order: 'B', volgorde: 1, recept: 'DMG', prio: 3000 })
    expect(plan([a1, a2, b1]).plaatsen.get(b1.id)!.start).toBe(0)
    ;(a2.item.stap as { machineWacht?: boolean }).machineWacht = true
    const u = plan([a1, a2, b1])
    expect(u.plaatsen.get(a2.id)!.start).toBeCloseTo(1)
    expect(u.plaatsen.get(a2.id)!.wachtVan).toBe(0)
    expect(u.plaatsen.get(b1.id)!.start).toBeCloseTo(2)
    expect(wijzigingen([a2], u)[0]?.machineWacht ?? true).toBe(true)
  })
  it('vervalt zodra de stap bezig is', () => {
    const a = job({ order: 'A', recept: 'DMG', op: 'DMG' })
    ;(a.item.stap as { machineWacht?: boolean }).machineWacht = true
    const u = plan([a], { lopend: [a.id], gestart: [[a.id, '2026-07-13T07:00:00']] })
    expect(u.plaatsen.get(a.id)!.machineWacht).toBeFalsy()
    expect(wijzigingen([a], u)[0].machineWacht).toBe(false)
  })
})
