import { describe, it, expect } from 'vitest'
import { afmetingTekst, zaagbonAfmeting, computeWeightKg } from '@stockmanager/shared'
import { materiaalWerkelijk } from '../nacalculatie'

describe('afmetingTekst', () => {
  it('per vorm de maat die het scherm toont', () => {
    expect(afmetingTekst('round', { diameter: 50 })).toBe('Ø50')
    expect(afmetingTekst('square', { side: 40 })).toBe('40×40')
    expect(afmetingTekst('flat', { width: 250, height: 30 })).toBe('250×30')
    expect(afmetingTekst('tube', { outerDiameter: 60, innerDiameter: 40 })).toBe('Ø60/Ø40')
  })
})

describe('zaagbonAfmeting', () => {
  it('een platte exoot met zijn maat, nooit Ø0', () => {
    expect(zaagbonAfmeting({ barVorm: 'Plat', diameter: 0 }, { volumeFormula: 'flat', dimensions: { width: 250, height: 30 } }))
      .toBe('250×30 mm')
    expect(zaagbonAfmeting({ barVorm: 'Rond', diameter: 50 }, { volumeFormula: 'round', dimensions: { diameter: 50 } }))
      .toBe('Ø50 mm')
  })

  it('staaf weg: de diameter van de bon, anders alleen de vorm', () => {
    expect(zaagbonAfmeting({ barVorm: 'Rond', diameter: 50 }, null)).toBe('Ø50 mm')
    expect(zaagbonAfmeting({ barVorm: 'Plat', diameter: 0 }, null)).toBe('Plat')
  })
})

describe('materiaalWerkelijk', () => {
  const grade = { name: '6082', densityKgM3: 2700, pricePerKg: 5 }
  function nepDb(bonnen: Record<string, unknown>[], staven: Record<string, unknown>[]) {
    return {
      zaagReservering: { findMany: async () => bonnen },
      grade: { findMany: async () => [grade] },
      rawMaterial: { findMany: async () => staven },
    } as never
  }

  it('een platte exoot rekent met zijn eigen maat, niet als rond met diameter 0', async () => {
    const bon = { barId: 'p', materiaal: '6082', diameter: 0, fysiekeLengte: 300 }
    const plaat = { id: 'p', dimensions: { width: 250, height: 30 }, profile: { volumeFormula: 'flat' } }
    const euro = await materiaalWerkelijk(nepDb([bon], [plaat]), {})
    const verwacht = computeWeightKg('flat', { width: 250, height: 30 }, 300, 2700) * 5
    expect(euro).toBeCloseTo(verwacht, 6)
    expect(euro).toBeGreaterThan(0)
  })

  it('rond blijft wat het was; staaf weg = de diameter van de bon', async () => {
    const bon = { barId: 'r', materiaal: '6082', diameter: 50, fysiekeLengte: 1000 }
    const rond = { id: 'r', dimensions: { diameter: 50 }, profile: { volumeFormula: 'round' } }
    const verwacht = computeWeightKg('round', { diameter: 50 }, 1000, 2700) * 5
    expect(await materiaalWerkelijk(nepDb([bon], [rond]), {})).toBeCloseTo(verwacht, 6)
    expect(await materiaalWerkelijk(nepDb([bon], []), {})).toBeCloseTo(verwacht, 6)
  })
})
