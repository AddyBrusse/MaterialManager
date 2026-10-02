import { describe, it, expect } from 'vitest'
import {
  afwijkingRichting, bouwMachineNacalculatie, computeEstimateTotals, gecalculeerdPerMachine,
  type ArticleEstimate, type EstimateCtx, type Klokregel,
} from '@stockmanager/shared'

// DMG €80/u, Doosan €60/u (machine + operator).
const ctx: EstimateCtx = {
  grades: [],
  machines: [
    { id: 'dmg', machineRatePerHour: 45, operatorRatePerHour: 35 },
    { id: 'doo', machineRatePerHour: 30, operatorRatePerHour: 30 },
  ],
  profiles: [],
  recipe: null,
}
const namen: Record<string, string> = { dmg: 'DMG CTX', doo: 'Doosan' }
const naamVan = (id: string | null | undefined) => (id ? namen[id] ?? null : null)

const est: ArticleEstimate = {
  marginPct: 0,
  updatedAt: '2026-10-01T00:00:00.000Z',
  nodes: [
    { id: 'a', type: 'machine', name: 'Draaien', machineId: 'dmg', setupMin: 60, steps: [{ id: 's', name: 'x', cycleMin: 3 }] },
    { id: 'b', type: 'machine', name: 'Frezen', machineId: 'doo', setupMin: 30, steps: [{ id: 't', name: 'y', cycleMin: 2 }] },
  ],
}

function klok(over: Partial<Omit<Klokregel, 'kosten'>>): Omit<Klokregel, 'kosten'> {
  return {
    id: over.id ?? 'k', soort: 'draaien', bemand: true, status: 'afgerond', machineNaam: 'DMG CTX',
    userNaam: 'Jan', gestartOp: '2026-09-30T07:00:00.000Z', gestoptOp: '2026-09-30T08:00:00.000Z',
    seconden: 3600, gemetenSeconden: 3600, gecorrigeerd: false, correctieReden: null, aantalStuks: null,
    ...over,
  }
}

const tarieven: Record<string, { machine: number; operator: number }> = {
  'dmg ctx': { machine: 45, operator: 35 },
  doosan: { machine: 30, operator: 30 },
}
const tarief = (naam: string | null, bemand: boolean) => {
  const t = naam ? tarieven[naam.trim().toLowerCase()] : undefined
  return t ? (bemand ? t.machine + t.operator : t.machine) : null
}

describe('gecalculeerdPerMachine', () => {
  it('telt per machine op tot de posten instellen en draaien van de order', () => {
    const qty = 10
    const per = gecalculeerdPerMachine(est, ctx, qty, naamVan)
    const t = computeEstimateTotals(est, ctx, qty)
    const instel = per.reduce((s, m) => s + m.instelKosten, 0)
    const draai = per.reduce((s, m) => s + m.draaienKosten, 0)
    expect(instel).toBeCloseTo(t.setupTotal * qty, 6)
    expect(draai).toBeCloseTo(t.cycleTotal * qty, 6)
    expect(per.map((m) => m.naam)).toEqual(['DMG CTX', 'Doosan'])
    expect(per[0].draaienMin).toBe(30)
  })

  it('valt terug op de naam van de knoop als de machine niet te herleiden is', () => {
    const per = gecalculeerdPerMachine(est, ctx, 1, () => null)
    expect(per.map((m) => m.naam)).toEqual(['Draaien', 'Frezen'])
  })
})

describe('bouwMachineNacalculatie', () => {
  const gecalc = gecalculeerdPerMachine(est, ctx, 10, naamVan)

  it('houdt instellen, draaien en onbemand per machine apart', () => {
    const m = bouwMachineNacalculatie(gecalc, [
      klok({ id: '1', soort: 'instellen', seconden: 1800 }),
      klok({ id: '2', seconden: 3600, aantalStuks: 6 }),
      klok({ id: '3', bemand: false, userNaam: null, seconden: 3600, aantalStuks: 4 }),
    ], tarief)
    const dmg = m.find((x) => x.sleutel === 'dmg ctx')!
    expect(dmg.werkelijk).toMatchObject({ instelSeconden: 1800, draaienSeconden: 7200, onbemandSeconden: 3600, stuks: 10 })
    // Onbemand alleen het machinetarief.
    expect(dmg.werkelijk!.draaienKosten).toBeCloseTo(80 + 45, 6)
    expect(dmg.klokregels.map((k) => k.kosten)).toEqual([40, 80, 45])
  })

  it('geeft de vervangende machine de calculatie van de machine waar niet op geklokt is', () => {
    const m = bouwMachineNacalculatie(gecalc, [
      klok({ id: '1', machineNaam: 'DMG CTX' }),
      klok({ id: '2', machineNaam: 'Mazak' }),
    ], tarief)
    // Doosan was gecalculeerd en is niet gebruikt: die valt weg, Mazak neemt hem over.
    expect(m.map((x) => x.naam)).toEqual(['DMG CTX', 'Mazak'])
    const mazak = m.find((x) => x.sleutel === 'mazak')!
    const doosan = gecalc.find((x) => x.sleutel === 'doosan')!
    expect(mazak.gecalculeerdOp).toBe('Doosan')
    expect(mazak.gecalculeerdTotaal).toBeCloseTo(doosan.instelKosten + doosan.draaienKosten, 6)
    expect(mazak.tariefOnbekend).toBe(true)
    // Het gecalculeerde bedrag blijft in de som.
    const som = m.reduce((s, x) => s + x.gecalculeerdTotaal, 0)
    expect(som).toBeCloseTo(gecalc.reduce((s, x) => s + x.instelKosten + x.draaienKosten, 0), 6)
  })

  it('laat een gecalculeerde machine staan als er niets is om hem aan te koppelen', () => {
    const m = bouwMachineNacalculatie(gecalc, [klok({ machineNaam: 'DMG CTX' })], tarief)
    const doosan = m.find((x) => x.sleutel === 'doosan')!
    expect(doosan.werkelijk).toBeNull()
    expect(doosan.verschilPct).toBeNull()
    expect(doosan.gecalculeerdOp).toBeNull()
  })

  it('koppelt niets zolang er nergens op geklokt is', () => {
    const m = bouwMachineNacalculatie(gecalc, [], tarief)
    expect(m.map((x) => x.naam)).toEqual(['DMG CTX', 'Doosan'])
  })

  it('zet lopende klokken erbij zonder ze mee te tellen', () => {
    const m = bouwMachineNacalculatie(gecalc, [klok({ status: 'lopend' })], tarief)
    const dmg = m.find((x) => x.sleutel === 'dmg ctx')!
    expect(dmg.werkelijk).toBeNull()
    expect(dmg.klokregels[0].kosten).toBeNull()
  })

  it('vergelijkt machinenamen zonder op hoofdletters te struikelen', () => {
    const m = bouwMachineNacalculatie(gecalc, [klok({ machineNaam: ' dmg ctx ' })], tarief)
    expect(m).toHaveLength(2)
  })
})

describe('afwijkingRichting', () => {
  it('goedkoper is goedkoper, ook bij een kleine afwijking', () => {
    expect(afwijkingRichting(-10)).toBe('goedkoper')
    expect(afwijkingRichting(-1)).toBe('goedkoper')
    expect(afwijkingRichting(-40)).toBe('goedkoper')
  })
  it('duurder is duurder', () => {
    expect(afwijkingRichting(3)).toBe('duurder')
    expect(afwijkingRichting(40)).toBe('duurder')
  })
  it('afronding is geen signaal; geen waarde is geen oordeel', () => {
    expect(afwijkingRichting(0.4)).toBe('gelijk')
    expect(afwijkingRichting(-0.4)).toBe('gelijk')
    expect(afwijkingRichting(null)).toBeNull()
    expect(afwijkingRichting(NaN)).toBeNull()
  })
})
