import { describe, it, expect } from 'vitest'
import type { Machine } from '../../../api/machines'
import type { PlanningStapItem } from '../../../utils/planningUtils'
import { computeRelockedDates, computeVerplichtKlaar, type QueueJob } from '../../../utils/planningQueueUtils'
import { samenvoegen, soortVanStap, waaromNietNaar, verplaats, preview, maakVoorstel, isTeLaat, dagKort, urenKort, type Wachtrijen } from '../tabel-logica'

// Maandag 13-07-2026.
const START = new Date(2026, 6, 13)
const BASIS = { machineRatePerHour: 60, operatorRatePerHour: 50, defaultSetupMin: 10, worksWeekends: false, barloaderMinMm: 500, barloaderMaxMm: 1100, opspanlengteMm: 30, afsteekMm: 3, heeftStangenlader: false, createdAt: '' }
const M = (name: string, soort: Machine['soort']): Machine => ({ id: name, name, soort, ...BASIS })
const MACHINES = [M('Zaag', 'zagen'), M('DMG', 'draaien'), M('Doosan', 'draaien'), M('Haas', 'frezen'), M('Nieuw', null)]

let n = 0
function job(o: { order: string; volgorde?: number; recept: string; op?: string; pos?: number; min?: number; deadline?: string | null }): QueueJob {
  n++
  const machineNaam = o.op ?? ''
  const j = {
    id: `s${n}`, orderId: o.order, volgorde: o.volgorde ?? 1, naam: 'stap', klant: 'K', artikel: 'A', tekening: null,
    machineNaam, duurMin: o.min ?? 294, isPlaceholder: false, deadline: o.deadline ?? null, queuePosition: o.pos ?? null,
    wachtOpMateriaal: false, gereed: false, item: null as unknown as PlanningStapItem,
  } as QueueJob
  j.item = {
    stap: { id: j.id, volgorde: j.volgorde, naam: 'stap', machine: o.recept, gereedOp: null, gereedDoor: null, geplandDatum: machineNaam ? '2026-07-13' : null, geplandMachine: machineNaam || null, queuePosition: j.queuePosition },
    order: { id: o.order, stappen: [] },
    project: { id: 'P', levertijdDatum: j.deadline },
    duurMin: j.duurMin, isPlaceholder: false,
  } as unknown as PlanningStapItem
  return j
}
const rijen = (...paren: [string, QueueJob[]][]): Wachtrijen => new Map(MACHINES.map((m) => [m.name, paren.find((p) => p[0] === m.name)?.[1] ?? []]))

describe('soort en waar een stap heen mag', () => {
  it('de soort komt uit de machine in het recept', () => {
    expect(soortVanStap(job({ order: 'A', recept: 'DMG' }), MACHINES)).toBe('draaien')
    expect(soortVanStap(job({ order: 'A', recept: 'draaien (oud)', op: 'Doosan' }), MACHINES)).toBe('draaien')
    expect(soortVanStap(job({ order: 'A', recept: 'iets' }), MACHINES)).toBeNull()
    // oudere stappen: de bewerking heet zoals de soort
    expect(soortVanStap(job({ order: 'A', recept: 'Zagen' }), MACHINES)).toBe('zagen')
  })
  it('alleen naar dezelfde soort, met een zin waarom niet', () => {
    const j = job({ order: 'A', recept: 'DMG' })
    expect(waaromNietNaar(j, MACHINES[2], MACHINES)).toBeNull()
    expect(waaromNietNaar(j, MACHINES[0], MACHINES)).toMatch(/zagenmachine; deze stap is draaien/)
    expect(waaromNietNaar(j, MACHINES[4], MACHINES)).toMatch(/soort niet ingevuld/)
  })
  it('onbekende soort mag overal', () => {
    expect(waaromNietNaar(job({ order: 'A', recept: 'iets' }), MACHINES[0], MACHINES)).toBeNull()
  })
})

describe('verplaatsen en preview', () => {
  it('vóór een stap, en terug naar niet ingepland', () => {
    const a = job({ order: 'A', recept: 'DMG', op: 'DMG', pos: 1000 })
    const b = job({ order: 'B', recept: 'DMG', op: 'DMG', pos: 2000 })
    const v = verplaats(rijen(['DMG', [a, b]]), b, 'DMG', a.id)
    expect(v.wachtrijen.get('DMG')!.map((x) => x.id)).toEqual([b.id, a.id])
    expect(v.positie).toBe(0)
    const terug = verplaats(rijen(['DMG', [a, b]]), a, null, null)
    expect(terug.wachtrijen.get('DMG')!.map((x) => x.id)).toEqual([b.id])
    expect(terug.positie).toBeNull()
  })
  it('de preview noemt wat er verschuift', () => {
    const a = job({ order: 'A', recept: 'DMG', op: 'DMG', pos: 1000 })
    const b = job({ order: 'B', recept: 'DMG', op: 'DMG', pos: 2000 })
    const w = rijen(['DMG', [a, b]])
    const huidig = new Map([[a.id, '2026-07-13'], [b.id, '2026-07-14']])
    const p = preview(huidig, verplaats(w, b, 'DMG', a.id), b, MACHINES, new Map(), START)
    expect(p.wijzigingen.map((x) => [x.job.id, x.naar])).toEqual([[b.id, '2026-07-13'], [a.id, '2026-07-14']])
  })
})

describe('voorstel om in te plannen', () => {
  it('eerste keuze is de receptmachine; de volgende stap komt erna', () => {
    const z = job({ order: 'X', volgorde: 1, recept: 'Zaag' })
    const d = job({ order: 'X', volgorde: 2, recept: 'DMG' })
    const v = maakVoorstel(rijen(), [d, z], MACHINES, new Map(), START)
    expect(v.map((x) => [x.job.id, x.machine, x.start])).toEqual([[z.id, 'Zaag', '2026-07-13'], [d.id, 'DMG', '2026-07-14']])
    expect(v[1].alternatieven).toEqual([{ machine: 'Doosan', start: '2026-07-14' }])
    const anders = maakVoorstel(rijen(), [d, z], MACHINES, new Map(), START, new Map([[d.id, 'Doosan']]))
    expect(anders[1].machine).toBe('Doosan')
  })
  it('zonder receptmachine en zonder bekende soort: geen voorstel, wel de reden', () => {
    const vol = job({ order: 'V', recept: 'DMG', op: 'DMG', pos: 1000, min: 294 * 3 })
    const j = job({ order: 'Y', recept: 'draaien (oud)', op: 'Doosan' })
    j.item.stap.geplandMachine = null; j.machineNaam = ''; j.item.stap.geplandDatum = null
    expect(maakVoorstel(rijen(['DMG', [vol]]), [j], MACHINES, new Map(), START)[0].reden).toMatch(/Geen machine/)
  })
  it('bewerking "draaien" zonder receptmachine: de vroegste draaibank', () => {
    const vol = job({ order: 'V', recept: 'DMG', op: 'DMG', pos: 1000, min: 294 * 3 })
    const j = job({ order: 'Y', recept: 'draaien' })
    const v = maakVoorstel(rijen(['DMG', [vol]]), [j], MACHINES, new Map(), START)
    expect(v[0].machine).toBe('Doosan')
    expect(v[0].alternatieven.map((a) => a.machine)).toEqual(['DMG'])
  })
  it('wat eerder af moet, gaat voor in de rij', () => {
    const laatOk = job({ order: 'L', recept: 'DMG', op: 'DMG', pos: 1000, deadline: '2026-08-30' })
    const haast = job({ order: 'H', recept: 'DMG', deadline: '2026-07-20' })
    const vk = computeVerplichtKlaar([laatOk, haast], START)
    const v = maakVoorstel(rijen(['DMG', [laatOk]]), [haast], MACHINES, vk, START)
    expect(v[0].voorId).toBe(laatOk.id)
    expect(v[0].start).toBe('2026-07-13')
  })
})

describe('voorstel en opslaan zeggen hetzelfde', () => {
  it('de start in het voorstel is wat er na opslaan komt', () => {
    // Een oude, vastgezette stap op de zaag ervóór mag de nieuwe niet in het verleden zetten.
    const oud = job({ order: 'O', recept: 'Zaag', op: 'Zaag', pos: 1000 })
    oud.item.stap.geplandDatum = '2026-07-01'
    const z = job({ order: 'X', volgorde: 1, recept: 'Zaag' })
    const d = job({ order: 'X', volgorde: 2, recept: 'DMG' })
    const w = rijen(['Zaag', [oud]])
    const v = maakVoorstel(w, [z, d], MACHINES, new Map(), START)
    const s = samenvoegen(w, v)
    const echt = computeRelockedDates(s.wachtrijen, s.geraakt, MACHINES, START)
    expect(v.map((x) => x.start)).toEqual([echt.get(z.id), echt.get(d.id)])
    expect(v[0].start! >= '2026-07-13').toBe(true)
    expect([...s.posities.keys()]).toEqual([z.id, d.id])
  })
})

describe('tekst', () => {
  it('laat, dag en uren', () => {
    expect(isTeLaat('2026-07-17', '2026-07-16')).toBe(true)
    expect(isTeLaat('2026-07-16', '2026-07-16')).toBe(false)
    expect(isTeLaat(null, '2026-07-16')).toBe(false)
    expect(dagKort('2026-10-14')).toBe('wo 14-10')
    expect(urenKort(270)).toBe('4,5 u')
  })
})
