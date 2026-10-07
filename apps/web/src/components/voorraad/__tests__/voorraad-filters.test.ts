import { describe, it, expect } from 'vitest'
import { kopmaat, zetVan, inBereik, bereikTekst, filterVoorraad, leesFilters, LEGE_FILTERS, GEEN_BEREIK, type FilterRij } from '../voorraad-filters'

const rij = (o: Partial<FilterRij> & { vf?: string; dims?: Record<string, number> } = {}): FilterRij => ({
  grade: { name: 'C45' }, profile: { name: 'Rond', volumeFormula: o.vf ?? 'round' }, surfaceFinish: null,
  dimensions: o.dims ?? { diameter: 50 }, currentStock: '3000', exoot: false, ...o,
})
const status = () => 'ok'

describe('kopmaat', () => {
  it('Ø, zijde, breedte, buitendiameter', () => {
    expect(kopmaat('round', { diameter: 50 })).toBe(50)
    expect(kopmaat('square', { side: 20 })).toBe(20)
    expect(kopmaat('flat', { width: 200, height: 10 })).toBe(200)
    expect(kopmaat('tube', { outerDiameter: 60, innerDiameter: 40 })).toBe(60)
    expect(kopmaat('round', {})).toBeNull()
  })
})

describe('van–tot', () => {
  it('"van" vult "tot" mee, zodat 50 alleen 50 laat zien', () => {
    expect(zetVan(GEEN_BEREIK, 50)).toEqual({ van: 50, tot: 50 })
    expect(zetVan({ van: 50, tot: 50 }, 60)).toEqual({ van: 60, tot: 60 })
  })
  it('een eigen "tot" blijft staan, tenzij hij onder de nieuwe "van" komt', () => {
    expect(zetVan({ van: 50, tot: 55 }, 52)).toEqual({ van: 52, tot: 55 })
    expect(zetVan({ van: 50, tot: 55 }, 60)).toEqual({ van: 60, tot: 60 })
    expect(zetVan({ van: 50, tot: 55 }, null)).toEqual({ van: null, tot: 55 })
    expect(zetVan({ van: 50, tot: 50 }, null)).toEqual(GEEN_BEREIK)
  })
  it('50 t/m 55, grenzen inbegrepen', () => {
    const b = { van: 50, tot: 55 }
    expect([49, 50, 55, 56].map((n) => inBereik(n, b))).toEqual([false, true, true, false])
    expect(inBereik(null, b)).toBe(false)
    expect(inBereik(null, GEEN_BEREIK)).toBe(true)
  })
  it('tekst op de chip', () => {
    expect(bereikTekst({ van: 50, tot: 50 })).toBe('50')
    expect(bereikTekst({ van: 1000, tot: 3000 }, 'mm')).toBe('1.000–3.000 mm')
    expect(bereikTekst({ van: null, tot: 55 })).toBe('tot 55')
  })
})

describe('filteren', () => {
  it('materiaal dat op is staat standaard niet in de lijst, een exoot op 0 wel', () => {
    const op = rij({ currentStock: '0' })
    const exoot = rij({ currentStock: '0', exoot: true })
    expect(filterVoorraad([rij(), op, exoot], LEGE_FILTERS, status)).toEqual([rij(), exoot])
  })
  it('status "uit" toont juist wat op is', () => {
    const op = rij({ currentStock: '0' })
    expect(filterVoorraad([rij(), op], { ...LEGE_FILTERS, status: 'uit' }, (r) => (Number(r.currentStock) === 0 ? 'uit' : 'ok'))).toEqual([op])
  })
  it('maat, lengte en exoot', () => {
    const a = rij({ dims: { diameter: 50 }, currentStock: '800' })
    const b = rij({ dims: { diameter: 55 }, currentStock: '3000', exoot: true })
    const c = rij({ dims: { diameter: 60 } })
    const plaat = rij({ vf: 'flat', dims: { width: 50, height: 10 } })
    expect(filterVoorraad([a, b, c, plaat], { ...LEGE_FILTERS, maat: { van: 50, tot: 55 } }, status)).toEqual([a, b, plaat])
    expect(filterVoorraad([a, b, c], { ...LEGE_FILTERS, lengte: { van: null, tot: 1000 } }, status)).toEqual([a])
    expect(filterVoorraad([a, b, c], { ...LEGE_FILTERS, exoot: 'alleen' }, status)).toEqual([b])
    expect(filterVoorraad([a, b, c], { ...LEGE_FILTERS, exoot: 'zonder' }, status)).toEqual([a, c])
  })
  it('een oudere bewaarde voorkeur wordt aangevuld', () => {
    expect(leesFilters({ kwaliteit: 'C45' })).toEqual({ ...LEGE_FILTERS, kwaliteit: 'C45' })
    expect(leesFilters(null)).toEqual(LEGE_FILTERS)
  })
})
