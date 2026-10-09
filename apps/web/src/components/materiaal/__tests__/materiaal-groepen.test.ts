import { describe, it, expect } from 'vitest'
import type { RawMaterialRow } from '../../../api/raw-materials'
import { filter, groepeer, hoofdmaat, LEEG_FILTER, sorteer } from '../materiaal-groepen'

const rij = (id: string, p: Partial<RawMaterialRow> & { d?: number; vrij?: number; kw?: string }): RawMaterialRow => ({
  id, code: id, gradeId: p.kw ?? '304', profileId: 'rond', surfaceFinishId: null,
  dimensions: { diameter: p.d ?? 30 }, lengthMm: '3000', currentStock: '3000', minStock: null, photoPath: null,
  weightKg: 0, gereserveerdMm: 0, vrijMm: p.vrij ?? 3000, exoot: false, klantId: null, artikelId: null, klant: null,
  createdAt: '', updatedAt: '',
  grade: { id: p.kw ?? '304', name: p.kw ?? '1.4301', densityKgM3: '7900', createdAt: '' },
  profile: { id: 'rond', name: 'Rond', dimensionSchema: [], volumeFormula: 'round', createdAt: '' },
  surfaceFinish: null, locationSlot: null, ...p,
} as RawMaterialRow)

describe('groepeer', () => {
  it('één rij per soort materiaal, met staven, vrij en langste', () => {
    const g = groepeer([rij('a', { vrij: 1180 }), rij('b', { vrij: 3000 }), rij('c', { vrij: 0 }), rij('d', { d: 40 })])
    expect(g).toHaveLength(2)
    const d30 = g.find((x) => x.maat === 30)!
    expect(d30).toMatchObject({ staven: 2, vrijMm: 4180, langsteMm: 3000, afmeting: 'Ø30' })
  })
  it('een exoot is een eigen rij', () => {
    expect(groepeer([rij('a', {}), rij('x', { exoot: true })])).toHaveLength(2)
  })
})

describe('filter en sorteer', () => {
  const groepen = groepeer([
    rij('a', { d: 25 }), rij('b', { d: 30 }), rij('c', { d: 40, vrij: 0 }), rij('e', { d: 30, exoot: true }),
    rij('f', { d: 30, kw: 'S355' }),
  ])
  it('maat van–tot, alleen vrij en exoten', () => {
    expect(filter(groepen, { ...LEEG_FILTER, maatVan: 28, maatTot: 40 }).map((g) => g.maat).sort()).toEqual([30, 30, 40])
    expect(filter(groepen, { ...LEEG_FILTER, alleenVrij: true }).every((g) => g.vrijMm > 0)).toBe(true)
    expect(filter(groepen, { ...LEEG_FILTER, exoten: true }).some((g) => g.exoot)).toBe(true)
  })
  it('zoeken op meerdere woorden en op kwaliteit', () => {
    expect(filter(groepen, { ...LEEG_FILTER, zoek: 'rond ø30' })).toHaveLength(2)
    expect(filter(groepen, { ...LEEG_FILTER, kwaliteiten: ['S355'] })).toHaveLength(1)
  })
  it('sorteert op maat, beide kanten op', () => {
    expect(sorteer(groepen, 'maat', true).map((g) => g.maat)[0]).toBe(25)
    expect(sorteer(groepen, 'maat', false).map((g) => g.maat)[0]).toBe(40)
  })
  it('hoofdmaat pakt diameter, zijde of breedte', () => {
    expect(hoofdmaat({ width: 40, height: 8 })).toBe(40)
    expect(hoofdmaat({ outerDiameter: 60, innerDiameter: 40 })).toBe(60)
  })
})
