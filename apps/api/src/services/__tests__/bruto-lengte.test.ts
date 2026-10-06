import { describe, it, expect } from 'vitest'
import { brutoLengte, laderVan, computeEstimateTotals, buildEstimateCtx, type ArticleEstimate } from '@stockmanager/shared'

const lader = { machineNaam: 'DMG', opspanlengteMm: 30, afsteekMm: 3, barloaderMaxMm: 1100 }

describe('brutoLengte', () => {
  it('zonder lader: netto + afvlakken + zaagsnede', () => {
    const b = brutoLengte(1250, null)
    expect(b.brutoMm).toBe(1256)
    expect(b.afsteekMm).toBe(0)
    expect(b.stuksPerLaderstang).toBeNull()
  })

  it('met lader: ook afsteek en een deel van het opspanstukje', () => {
    const b = brutoLengte(40, lader)
    // 40 + 3 + 3 + 3 = 49 per stuk; ⌊1070 / 49⌋ = 21 per laderstang; 30 / 21 per stuk
    expect(b.stuksPerLaderstang).toBe(21)
    expect(b.brutoMm).toBeCloseTo(49 + 30 / 21, 6)
  })

  it('een stuk langer dan de lader: één per stang, het hele opspanstukje erbij', () => {
    const b = brutoLengte(1200, lader)
    expect(b.stuksPerLaderstang).toBe(1)
    expect(b.brutoMm).toBe(1209 + 30)
  })

  it('geen lengte is geen materiaal', () => {
    expect(brutoLengte(0, lader).brutoMm).toBe(0)
  })
})

describe('laderVan', () => {
  const machines = [
    { id: 'zaag', name: 'Zaag', heeftStangenlader: false },
    { id: 'dmg', name: 'DMG', heeftStangenlader: true, opspanlengteMm: 25, afsteekMm: 2, barloaderMaxMm: 1000 },
  ]
  it('vindt de draaibank met lader in de bewerkingen', () => {
    expect(laderVan([{ type: 'machine', machineId: 'zaag' }, { type: 'machine', machineId: 'dmg' }], machines))
      .toEqual({ machineNaam: 'DMG', opspanlengteMm: 25, afsteekMm: 2, barloaderMaxMm: 1000 })
  })
  it('geen lader als alleen machines zonder lader in de bewerkingen staan', () => {
    expect(laderVan([{ type: 'machine', machineId: 'zaag' }], machines)).toBeNull()
  })
})

describe('calculatie rekent met bruto lengte', () => {
  const grades = [{ id: 'c45', densityKgM3: 7850, pricePerKg: 2.5 }]
  const profiles = [{ id: 'rond', volumeFormula: 'round' }]
  const est = (machineId: string | null): ArticleEstimate => ({
    marginPct: 0, updatedAt: '',
    nodes: [
      { id: 'm', type: 'material', name: 'C45', gradeId: 'c45', profileId: 'rond', dimensions: { diameter: 40 }, lengthMm: 40, qty: 1 },
      ...(machineId ? [{ id: 'b', type: 'machine' as const, name: 'DMG', machineId, setupMin: 0, steps: [] }] : []),
    ],
  })
  const machines = [{ id: 'dmg', name: 'DMG', machineRatePerHour: 0, operatorRatePerHour: 0, heeftStangenlader: true, opspanlengteMm: 30, afsteekMm: 3, barloaderMaxMm: 1100 }]
  const ctx = buildEstimateCtx({ recipe: null }, grades, profiles, machines)

  it('met een draaibank met lader kost het materiaal meer dan zonder', () => {
    const zonder = computeEstimateTotals(est(null), ctx).materialTotal
    const met = computeEstimateTotals(est('dmg'), ctx).materialTotal
    expect(met).toBeGreaterThan(zonder)
    // Verhouding = bruto met lader / bruto zonder lader
    expect(met / zonder).toBeCloseTo((49 + 30 / 21) / 46, 6)
  })
})
