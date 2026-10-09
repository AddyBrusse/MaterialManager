import { describe, it, expect } from 'vitest'
import {
  brutoLengte, laderVoorRegel, materiaalBehoefte, computeEstimateTotals, buildEstimateCtx,
  type ArticleEstimate, type LaderGegevens,
} from '@stockmanager/shared'

// De Mazak uit de mockup van 2026-10-09: grijp 30, afsteek 3, lader 500–1200.
const lader: LaderGegevens = { machineNaam: 'Mazak', opspanlengteMm: 30, afsteekMm: 3, barloaderMinMm: 500, barloaderMaxMm: 1200 }

describe('brutoLengte', () => {
  it('zonder lader: netto + vlak (1,5 + 1,5) + zaagsnede', () => {
    const b = brutoLengte(82, null)
    expect(b.brutoMm).toBe(88)
    expect(b.afsteekMm).toBe(0)
    expect(b.stuksPerLaderstang).toBeNull()
  })

  it('met lader: afsteek per stuk, grijp en één zaagsnede per laderstang', () => {
    const b = brutoLengte(82, lader)
    // 82 + 3 vlak + 3 afsteek = 88 per stuk; ⌊1170 / 88⌋ = 13; stang 13 × 88 + 30 = 1174
    expect(b.stuksPerLaderstang).toBe(13)
    expect(b.laderstangMm).toBe(1174)
    expect(b.brutoMm).toBeCloseTo((1174 + 3) / 13, 6)
  })

  it('een stuk langer dan de lader: één per stang', () => {
    const b = brutoLengte(1300, lader)
    expect(b.stuksPerLaderstang).toBe(1)
    expect(b.brutoMm).toBe(1306 + 30 + 3)
  })

  it('geen lengte is geen materiaal', () => {
    expect(brutoLengte(0, lader).brutoMm).toBe(0)
  })
})

describe('materiaalBehoefte', () => {
  it('80 stuks: 7 stangen, de stuks gelijk verdeeld (geen stompje van 2)', () => {
    const b = materiaalBehoefte(82, lader, 80)
    expect(b.stuksPerStang).toBe(13)
    expect(b.stangen.map((s) => s.stuks)).toEqual([12, 12, 12, 11, 11, 11, 11])
    expect(b.stangen[0].lengteMm).toBe(12 * 88 + 30)
    expect(b.stangen[6].lengteMm).toBe(11 * 88 + 30)
    expect(b.stangen.reduce((s, x) => s + x.stuks, 0)).toBe(80)
    expect(b.totaalMm).toBe(3 * 1086 + 4 * 998 + 7 * 3)
    expect(b.aangevuldTotMin).toBe(false)
  })

  it('heel weinig stuks: de stang wordt opgerekt tot het minimum van de lader', () => {
    const b = materiaalBehoefte(82, lader, 2)
    expect(b.stangen).toEqual([{ lengteMm: 500, stuks: 2 }])
    expect(b.aangevuldTotMin).toBe(true)
  })

  it('zonder lader: elk stuk een eigen zaagsnede', () => {
    const b = materiaalBehoefte(82, null, 10)
    expect(b.stangen).toHaveLength(10)
    expect(b.totaalMm).toBe(10 * 88)
    expect(b.perStukMm).toBe(88)
  })
})

describe('laderVoorRegel', () => {
  const machines = [
    { id: 'zaag', name: 'Zaag', heeftStangenlader: false },
    { id: 'mazak', name: 'Mazak', heeftStangenlader: true, opspanlengteMm: 25, afsteekMm: 2, barloaderMinMm: 400, barloaderMaxMm: 1000 },
  ]
  it('alleen als de regel een machine met lader kiest', () => {
    expect(laderVoorRegel({ laderMachineId: 'mazak' }, machines))
      .toEqual({ machineId: 'mazak', machineNaam: 'Mazak', opspanlengteMm: 25, afsteekMm: 2, barloaderMinMm: 400, barloaderMaxMm: 1000 })
    expect(laderVoorRegel({ laderMachineId: null }, machines)).toBeNull()
    expect(laderVoorRegel({ laderMachineId: 'zaag' }, machines)).toBeNull()
    expect(laderVoorRegel({ laderMachineId: 'mazak', exoot: true }, machines)).toBeNull()
  })
})

describe('calculatie rekent met bruto lengte', () => {
  const grades = [{ id: 'c45', densityKgM3: 7850, pricePerKg: 2.5 }]
  const profiles = [{ id: 'rond', volumeFormula: 'round' }]
  const machines = [{ id: 'mazak', name: 'Mazak', machineRatePerHour: 0, operatorRatePerHour: 0, heeftStangenlader: true, opspanlengteMm: 30, afsteekMm: 3, barloaderMinMm: 500, barloaderMaxMm: 1200 }]
  const est = (laderMachineId: string | null): ArticleEstimate => ({
    marginPct: 0, updatedAt: '',
    nodes: [
      { id: 'm', type: 'material', name: 'C45', gradeId: 'c45', profileId: 'rond', dimensions: { diameter: 30 }, lengthMm: 82, laderMachineId },
      // Een draaibank met lader in de bewerkingen zet de lader niet meer vanzelf aan.
      { id: 'b', type: 'machine', name: 'Mazak', machineId: 'mazak', setupMin: 0, steps: [] },
    ],
  })
  const ctx = buildEstimateCtx({ recipe: null }, grades, profiles, machines)

  it('de lader telt alleen als de materiaalregel hem kiest', () => {
    const zonder = computeEstimateTotals(est(null), ctx).materialTotal
    const met = computeEstimateTotals(est('mazak'), ctx).materialTotal
    expect(met / zonder).toBeCloseTo(((1174 + 3) / 13) / 88, 6)
  })

  it('met een aantal: wat er voor dat aantal echt gezaagd wordt', () => {
    const per = computeEstimateTotals(est('mazak'), ctx).materialTotal
    const bij80 = computeEstimateTotals(est('mazak'), ctx, 80).materialTotal
    // 80 st = 3 × 1086 + 4 × 998 + 7 zaagsneden, gedeeld door 80
    expect(bij80 / per).toBeCloseTo(((3 * 1086 + 4 * 998 + 21) / 80) / ((1174 + 3) / 13), 6)
  })
})

describe('exoot rekent met de geleverde maat', () => {
  // Alu-plaat 250 × 300 × 30, op maat geleverd: geen zaagsnede, geen vlak, geen lader.
  const grades = [{ id: 'alu', densityKgM3: 2700, pricePerKg: 2.5 }]
  const profiles = [{ id: 'plaat', volumeFormula: 'flat' }]
  const machines = [{ id: 'dmg', name: 'DMG', machineRatePerHour: 0, operatorRatePerHour: 0, heeftStangenlader: true, opspanlengteMm: 30, afsteekMm: 3, barloaderMaxMm: 1100 }]
  const ctx = buildEstimateCtx({ recipe: null }, grades, profiles, machines)
  const plaat = (stuksUitEen: number | null): ArticleEstimate => ({
    marginPct: 0, updatedAt: '',
    nodes: [
      { id: 'x', type: 'material', name: 'Alu plaat', exoot: true, stuksUitEen, gradeId: 'alu', profileId: 'plaat', dimensions: { width: 250, height: 30 }, lengthMm: 300, laderMachineId: 'dmg' },
      { id: 'b', type: 'machine', name: 'DMG', machineId: 'dmg', setupMin: 0, steps: [] },
    ],
  })
  const kgPlaat = (250 * 30 * 300 / 1e9) * 2700 // 6,075 kg

  it('een hele exoot per werkstuk: gewicht × €/kg, ook met een lader gekozen', () => {
    expect(computeEstimateTotals(plaat(1), ctx).materialTotal).toBeCloseTo(kgPlaat * 2.5, 6)
  })
  it('twee werkstukken uit één exoot: de helft', () => {
    expect(computeEstimateTotals(plaat(2), ctx).materialTotal).toBeCloseTo(kgPlaat * 2.5 / 2, 6)
  })
  it('leeg of onzin telt als één', () => {
    expect(computeEstimateTotals(plaat(null), ctx).materialTotal).toBeCloseTo(kgPlaat * 2.5, 6)
    expect(computeEstimateTotals(plaat(0), ctx).materialTotal).toBeCloseTo(kgPlaat * 2.5, 6)
  })
})
