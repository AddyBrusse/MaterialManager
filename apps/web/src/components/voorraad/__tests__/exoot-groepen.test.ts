import { describe, it, expect } from 'vitest'
import { groepeerExoten, exootSleutel, groepStand, telTekst, type GroepRij } from '../exoot-groepen'

const stuk = (id: string, o: Partial<GroepRij> = {}): GroepRij => ({
  id, code: `#${id}`, exoot: true, klantId: 'k', artikelId: 'a', gradeId: 'g', profileId: 'p', surfaceFinishId: null,
  dimensions: { width: 250, thickness: 30 }, lengthMm: '300', exootStand: 'binnen', ...o,
})
const staaf = (id: string): GroepRij => stuk(id, { exoot: false, klantId: null, artikelId: null, exootStand: null })

describe('exootSleutel', () => {
  it('zelfde klant, artikel en maat = zelfde exoot, ook als de maten in een andere volgorde staan', () => {
    expect(exootSleutel(stuk('1'))).toBe(exootSleutel(stuk('2', { dimensions: { thickness: 30, width: 250 }, lengthMm: '300.00' })))
  })
  it('een ander artikel, een andere klant of een andere lengte is een andere exoot', () => {
    const s = exootSleutel(stuk('1'))
    expect(exootSleutel(stuk('2', { artikelId: 'b' }))).not.toBe(s)
    expect(exootSleutel(stuk('2', { klantId: 'x' }))).not.toBe(s)
    expect(exootSleutel(stuk('2', { lengthMm: '301' }))).not.toBe(s)
  })
})

describe('groepeerExoten', () => {
  it('twintig gelijke stukken worden één regel; gewone staven blijven een regel per stuk', () => {
    const stukken = Array.from({ length: 20 }, (_, i) => stuk(String(i + 10)))
    const rijen = [staaf('1'), ...stukken, staaf('2')]
    const uit = groepeerExoten(rijen, rijen)
    expect(uit.map((r) => r.soort)).toEqual(['stuk', 'exoot', 'stuk'])
    expect(uit[1].soort === 'exoot' && uit[1].groep.stukken).toHaveLength(20)
  })
  it('de groep telt ook de stukken die het filter niet toont', () => {
    const alle = [stuk('1'), stuk('2', { exootStand: 'verbruikt' }), stuk('3', { exootStand: 'verbruikt' })]
    const [regel] = groepeerExoten([alle[0]], alle)
    if (regel.soort !== 'exoot') throw new Error('verwacht een groep')
    expect([regel.groep.binnen, regel.groep.verbruikt, regel.groep.nietBinnen]).toEqual([1, 2, 0])
    expect(telTekst(regel.groep)).toBe('3 stuks: 1 in het rek, 2 verbruikt')
  })
  it('een exoot met één stuk blijft een gewone regel', () => {
    expect(groepeerExoten([stuk('1')], [stuk('1')])).toEqual([{ soort: 'stuk', rij: stuk('1') }])
  })
  it('de groep staat op de plek van zijn eerste zichtbare stuk, stukken in het rek eerst', () => {
    const a = stuk('5', { exootStand: 'verbruikt' }), b = stuk('6')
    const uit = groepeerExoten([staaf('1'), a, staaf('2'), b], [staaf('1'), a, staaf('2'), b])
    expect(uit.map((r) => r.soort)).toEqual(['stuk', 'exoot', 'stuk'])
    expect(uit[1].soort === 'exoot' && uit[1].groep.stukken.map((s) => s.id)).toEqual(['6', '5'])
  })
})

describe('groepStand', () => {
  const g = (binnen: number, nietBinnen: number, verbruikt: number) => ({ sleutel: '', stukken: [], binnen, nietBinnen, verbruikt })
  it('in het rek gaat voor nog niet binnen, en dat voor verbruikt', () => {
    expect(groepStand(g(1, 1, 1))).toBe('binnen')
    expect(groepStand(g(0, 1, 5))).toBe('niet_binnen')
    expect(groepStand(g(0, 0, 5))).toBe('verbruikt')
  })
})
