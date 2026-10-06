import { describe, it, expect } from 'vitest'
import { prijsBijLeverancier, geldendePrijzen, waaromNietLeverancierPrijs } from '@stockmanager/shared'

describe('prijsBijLeverancier', () => {
  it('per kg met zaagkosten per snede', () => {
    const r = prijsBijLeverancier({ prijsSoort: 'per_kg', prijs: 7.2, zaagkostenPerSnede: 5.25, minimumBedrag: null }, { kg: 24.3, stuks: 4, sneden: 4 })
    expect(r.totaal).toBeCloseTo(7.2 * 24.3 + 21, 6)
    expect(r.uitleg).toBe('€ 7,20/kg × 24,3 kg + 4 × € 5,25 zagen')
  })
  it('per stuk telt het aantal, niet het gewicht', () => {
    expect(prijsBijLeverancier({ prijsSoort: 'per_stuk', prijs: 57, zaagkostenPerSnede: null, minimumBedrag: null }, { kg: 24.3, stuks: 4, sneden: 4 }).totaal).toBe(228)
  })
  it('nooit minder dan het minimum, en zegt dat erbij', () => {
    const r = prijsBijLeverancier({ prijsSoort: 'per_kg', prijs: 2.95, zaagkostenPerSnede: null, minimumBedrag: 75 }, { kg: 10, stuks: 1, sneden: 1 })
    expect(r.totaal).toBe(75)
    expect(r.minimumToegepast).toBe(true)
    expect(r.uitleg).toContain('minimum € 75,00')
  })
})

describe('geldendePrijzen', () => {
  const alle = [
    { id: 'a', leverancierId: 'tata', rawMaterialId: null, gradeId: 'alu' },
    { id: 'b', leverancierId: 'voest', rawMaterialId: null, gradeId: 'alu' },
    { id: 'c', leverancierId: 'voest', rawMaterialId: 'plaat', gradeId: null },
    { id: 'd', leverancierId: 'arcelor', rawMaterialId: null, gradeId: 'staal' },
  ]
  it('materiaalprijs gaat voor de kwaliteitsprijs van dezelfde leverancier', () => {
    const r = geldendePrijzen(alle, { id: 'plaat', gradeId: 'alu' })
    expect(r.map((p) => `${p.id}:${p.via}`)).toEqual(['c:materiaal', 'a:kwaliteit'])
  })
})

describe('waaromNietLeverancierPrijs', () => {
  it('één doel, en per stuk alleen bij een materiaal', () => {
    expect(waaromNietLeverancierPrijs({ rawMaterialId: 'x', gradeId: null, prijsSoort: 'per_stuk' })).toBeNull()
    expect(waaromNietLeverancierPrijs({ rawMaterialId: null, gradeId: 'g', prijsSoort: 'per_kg' })).toBeNull()
    expect(waaromNietLeverancierPrijs({ rawMaterialId: null, gradeId: 'g', prijsSoort: 'per_stuk' })).toContain('alleen bij een materiaal')
    expect(waaromNietLeverancierPrijs({ rawMaterialId: 'x', gradeId: 'g', prijsSoort: 'per_kg' })).toContain('óf')
  })
})
